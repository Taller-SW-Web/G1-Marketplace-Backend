"""H3 security gates. Publish metadata only, never raw scanner output or matches."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import string
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--base", required=True, help="Existing baseline commit; scan base..HEAD history.")
parser.add_argument("--artifact", required=True, help="Required build directory to scan for secrets.")
args = parser.parse_args()
root = Path.cwd()
out = root / ".local-security"
out.mkdir(exist_ok=True)
summary = {"schema": 1, "timestampUtc": datetime.now(timezone.utc).isoformat(), "checks": {}}
failed = []
semgrep = os.environ.get("H3_SEMGREP", "semgrep")
gitleaks = os.environ.get("H3_GITLEAKS", "gitleaks")
npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
env = {**os.environ, "SEMGREP_SEND_METRICS": "off", "SEMGREP_ENABLE_VERSION_CHECK": "0"}


def run(command):
    return subprocess.run(command, cwd=root, env=env, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=240)


def record(name, passed, **metadata):
    summary["checks"][name] = {"passed": passed, **metadata}
    if not passed:
        failed.append(name)
    print(f"{name}: {'PASS' if passed else 'FAIL'}")


def secret_scan(target, report, history=False):
    command = [gitleaks, "git" if history else "dir", str(target), "--no-banner",
               "--no-color", "--redact=100", "--ignore-gitleaks-allow", "--report-format=json",
               f"--report-path={report}", "--timeout=180"]
    if history:
        command.append(f"--log-opts={args.base}..HEAD")
    result = run(command)
    findings = json.loads(report.read_text(encoding="utf-8-sig")) if report.exists() else None
    # Match, Secret, email and snippets are intentionally never exported.
    safe = [{"rule": f["RuleID"], "file": f["File"], "line": f["StartLine"],
             "commit": f.get("Commit", "")} for f in findings or []]
    return result.returncode, findings, safe


try:
    version = run([gitleaks, "version"])
    record("gitleaks-version", version.returncode == 0 and version.stdout.strip() == "8.30.1",
           expected="8.30.1")
    version = run([semgrep, "--version"])
    record("semgrep-version", version.returncode == 0 and version.stdout.strip() == "1.181.0",
           expected="1.181.0")
    base = run(["git", "rev-parse", "--verify", args.base + "^{commit}"])
    if base.returncode:
        raise RuntimeError("Baseline commit is unavailable.")
    summary["base"] = base.stdout.strip()
    summary["head"] = run(["git", "rev-parse", "HEAD"]).stdout.strip()
    with tempfile.TemporaryDirectory(prefix="h3-security-") as temporary:
        temp = Path(temporary)
        canary = temp / "canary"
        canary.mkdir()
        # Construct synthetic detector controls in temp only. They are not credentials.
        # Interleave letters/digits: fixed high entropy, with no random dictionary stopwords.
        control_value = "".join(letter + str(index % 10)
                                for index, letter in enumerate(string.ascii_letters))
        (canary / "control.txt").write_text('api_key = "' + control_value + '"\n')
        code, findings, _ = secret_scan(canary, temp / "control-secrets.json")
        record("secrets-positive-control", code == 1 and bool(findings))
        (canary / "control.ts").write_text("eval(userInput);\n")
        scan_flags = ["scan", "--config", ".security/semgrep.yml", "--metrics=off",
                      "--disable-version-check", "--disable-nosem", "--strict", "--error", "--json"]
        result = run([semgrep, *scan_flags, "--no-git-ignore", str(canary)])
        control = json.loads(result.stdout) if result.stdout.strip().startswith("{") else {}
        record("sast-positive-control", result.returncode == 1 and bool(control.get("results"))
               and not control.get("errors"))
        snapshot = temp / "source"
        snapshot.mkdir()
        files = run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"])
        files.check_returncode()
        for relative in set(files.stdout.split("\0")) - {""}:
            source = root / relative
            if source.is_file() and not source.is_symlink():
                destination = snapshot / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
        for name, target, history in [("secrets-source", snapshot, False),
                                      ("secrets-history", root, True),
                                      ("secrets-artifact", root / args.artifact, False)]:
            if not target.is_dir() or (name == "secrets-artifact" and not any(target.rglob("*"))):
                record(name, False, reason="Required target missing or empty")
                continue
            code, findings, safe = secret_scan(target, temp / (name + ".json"), history)
            record(name, code == 0 and findings == [], findings=safe)
        result = run([semgrep, *scan_flags, "src", "scripts"])
        data = json.loads(result.stdout) if result.stdout.strip().startswith("{") else {}
        matches = [{"rule": f["check_id"], "file": f["path"], "line": f["start"]["line"]}
                   for f in data.get("results", [])]
        record("sast", result.returncode == 0 and "results" in data and not data.get("errors"),
               findings=matches, errorCount=len(data.get("errors", [])),
               scannedFiles=len(data.get("paths", {}).get("scanned", [])),
               scope="src and scripts; four local rules, no interfile/taint certification")
    for name, flags in [("sca-all", []), ("sca-runtime", ["--omit=dev"])]:
        result = run([npm, "audit", "--json", *flags])
        audit = json.loads(result.stdout)
        counts = audit.get("metadata", {}).get("vulnerabilities")
        safe = [{"package": key, "severity": value["severity"],
                 "direct": value["isDirect"], "fixAvailable": bool(value["fixAvailable"])}
                for key, value in audit.get("vulnerabilities", {}).items()]
        record(name, result.returncode in (0, 1) and bool(counts) and not audit.get("error")
               and counts.get("high", 0) == 0 and counts.get("critical", 0) == 0,
               counts=counts, findings=safe, gate="No high/critical; moderate/low require human acceptance")
    lock = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))
    licenses = []
    for path, package in lock["packages"].items():
        if not path:
            continue
        manifest = root / path / "package.json"
        installed = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else {}
        legacy_licenses = " OR ".join(item.get("type", "UNKNOWN") for item in installed.get("licenses", [])
                                      if isinstance(item, dict))
        licenses.append({"package": path.split("node_modules/")[-1], "version": package.get("version"),
                         "license": installed.get("license", package.get("license", legacy_licenses or "UNKNOWN")),
                         "dev": bool(package.get("dev"))})
    (out / "licenses.json").write_text(json.dumps(licenses, indent=2) + "\n", encoding="utf-8")
    record("license-inventory", bool(licenses), packages=len(licenses),
           review="Inventory only; no legal approval or automatic license acceptance")
except Exception as error:
    record("execution", False, reason=type(error).__name__)
finally:
    summary["passed"] = not failed
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print("Sanitized metadata: .local-security/summary.json and licenses.json")
raise SystemExit(1 if failed else 0)
