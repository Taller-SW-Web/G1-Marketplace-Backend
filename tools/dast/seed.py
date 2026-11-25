"""Seed ordinary BFF requests so passive analysis sees routes absent from HTML."""
import json
from pathlib import Path

import requests

TARGET = "http://marketplace:10000"
ORIGIN = "http://127.0.0.1:10000"
EMAIL = "qa-marker@example.invalid"
PASSWORD = "SyntheticQaMarker23!"
RESET = "synthetic-reset-marker"
REGISTRATION = {
    "correo": EMAIL, "contrasena": PASSWORD, "nombres": "Fixture",
    "apellidos": "QA", "celular": "+51000000000", "aceptaTerminos": True,
}


def zap_started(_zap, target):
    if target == "http://frontend:3000":
        return seed_frontend(target)
    if target != TARGET:
        raise RuntimeError("El destino debe ser el backend aislado")
    cases = [
        ("GET", "/api/v1/auth/capabilities", None, 200, ORIGIN),
        ("GET", "/api/v1/password/politica", None, 200, ORIGIN),
        ("POST", "/api/v1/auth/registro", REGISTRATION, 201, ORIGIN),
        ("POST", "/api/v1/auth/login", {}, 400, ORIGIN),
        ("POST", "/api/v1/auth/otp/solicitar", {}, 410, ORIGIN),
        ("POST", "/api/v1/auth/otp/verificar", {"codigo": "000000"}, 410, ORIGIN),
        ("GET", "/api/v1/auth/session", None, 200, ORIGIN),
        ("POST", "/api/v1/auth/refresh", {}, 401, ORIGIN),
        ("POST", "/api/v1/auth/logout", {}, 200, ORIGIN),
        ("POST", "/api/v1/auth/logout", {}, 403, "http://127.0.0.1:11111"),
        ("POST", "/api/v1/password/recuperar", {"correo": EMAIL}, 202, ORIGIN),
        ("POST", "/api/v1/password/recuperar", {"correo": "second-marker@example.invalid"}, 202, ORIGIN),
        ("POST", "/api/v1/password/restablecer", {"token": RESET, "nuevaContrasena": PASSWORD}, 204, ORIGIN),
        ("GET", "/api/v1/checkout/delivery-addresses", None, 401, ORIGIN),
        ("POST", "/api/v1/checkout/delivery-addresses", {}, 401, ORIGIN),
    ]
    coverage = []
    with requests.Session() as session:
        session.trust_env = False
        session.proxies["http"] = "http://127.0.0.1:18090"
        for method, path, body, expected, origin in cases:
            response = session.request(method, TARGET + path, json=body, headers={"Origin": origin},
                                       allow_redirects=False, timeout=25)
            if response.status_code != expected:
                raise RuntimeError(f"{method} {path}: esperado {expected}, obtenido {response.status_code}")
            if expected in (202, 204) and (response.content or "Set-Cookie" in response.headers):
                raise RuntimeError(f"{method} {path}: se esperaba respuesta vacía y sin sesión")
            if any(marker in response.text for marker in (EMAIL, PASSWORD, RESET)):
                raise RuntimeError(f"{method} {path}: la respuesta incluye un marcador de prueba")
            coverage.append({"method": method, "path": path, "status": response.status_code})
    Path("/zap/wrk/coverage.json").write_text(json.dumps(coverage), encoding="utf-8")

def seed_frontend(target):
    paths = ("/registro", "/login", "/recuperar-contrasena", "/restablecer-contrasena", "/checkout")
    coverage = []
    with requests.Session() as session:
        session.trust_env = False
        session.proxies["http"] = "http://127.0.0.1:18090"
        for path in paths:
            response = session.get(target + path, allow_redirects=False, timeout=25)
            if response.status_code not in (200, 302, 303, 307, 308):
                raise RuntimeError(f"GET {path}: obtenido {response.status_code}")
            coverage.append({"method": "GET", "path": path, "status": response.status_code})
    Path("/zap/wrk/frontend-coverage.json").write_text(json.dumps(coverage), encoding="utf-8")


def zap_pre_shutdown(zap):
    # Keep only metadata needed to review informational findings, never values.
    summaries = []
    for alert in zap.alert.alerts(baseurl="http://frontend:3000", count=1000):
        rule = str(alert.get("pluginId", ""))
        if rule not in ("10019", "10024"):
            continue
        entry = {"id": int(rule)}
        if rule == "10024":
            entry["kind"] = ("parameter-name" if alert.get("param")
                             and alert.get("param") == alert.get("evidence") else "parameter-value")
        else:
            header = zap.core.message(alert["messageId"]).get("responseHeader", "")
            status = header.split(" ", 2)
            if len(status) > 1 and status[1].isdigit():
                entry["status"] = int(status[1])
        if entry not in summaries:
            summaries.append(entry)
    if summaries:
        Path("/zap/wrk/frontend-alert-metadata.json").write_text(json.dumps(summaries), encoding="utf-8")
