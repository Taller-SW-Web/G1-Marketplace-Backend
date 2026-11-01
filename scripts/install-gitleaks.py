"""Install one verified Gitleaks binary; never execute an unverified download."""
import hashlib
import io
import os
from pathlib import Path
import platform
import tarfile
import urllib.request
import zipfile

VERSION = "8.30.1"
ASSETS = {
    "Linux": ("linux_x64.tar.gz", "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"),
    "Windows": ("windows_x64.zip", "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e"),
}
if platform.machine().lower() not in ("amd64", "x86_64"):
    raise SystemExit("Only x64 is supported by this installer.")
asset, expected = ASSETS[platform.system()]
url = f"https://github.com/gitleaks/gitleaks/releases/download/v{VERSION}/gitleaks_{VERSION}_{asset}"
with urllib.request.urlopen(url, timeout=90) as response:
    archive = response.read()
if hashlib.sha256(archive).hexdigest() != expected:
    raise SystemExit("Gitleaks checksum mismatch; installation aborted.")
name = "gitleaks.exe" if platform.system() == "Windows" else "gitleaks"
destination = Path(".local-security/tools")
destination.mkdir(parents=True, exist_ok=True)
if asset.endswith(".zip"):
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        data = bundle.read(name)
else:
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as bundle:
        data = bundle.extractfile(name).read()
binary = destination / name
binary.write_bytes(data)
binary.chmod(0o755)
if os.environ.get("GITHUB_PATH"):
    with open(os.environ["GITHUB_PATH"], "a", encoding="utf-8") as stream:
        stream.write(str(destination.resolve()) + "\n")
print(f"Verified Gitleaks {VERSION} installed.")
