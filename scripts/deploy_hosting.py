#!/usr/bin/env python3
"""Publish application files to the existing PHP hosting directory."""

import argparse
import ftplib
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import ssl
import sys
import time
import uuid
import struct


ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "app/.htaccess", "app_core.php", "app_attendance.php", "app_push.php",
    "assets/teacher-tools.js", "assets/teacher-tools.css", "assets/app-audio.js", "assets/sheet-signatures.css", "assets/sheet-signatures.js", "assets/sheet-spacing.js", "assets/sheet-fit.js", "assets/sheet-fit.css", "assets/offline-bridge.js", "assets/native-export.js",
    "auth_guard.php", "app_api.php", "music_player.php", "data_siswa.php", "absen.php", "ujian.php", "index.php", "app-sw.js",
)
APP_FILES = tuple(str(p.relative_to(ROOT)) for p in sorted((ROOT / "app").rglob("*")) if p.is_file() and (p.parent.name == "licenses" or p.suffix in {".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".png", ".svg", ".wasm", ".traineddata", ".bcmap", ".pfb", ".ttf", ".woff", ".woff2", ".LICENSE", ".md", ".txt"}))



def local_files():
    result = []
    for name in FILES + APP_FILES:
        path = ROOT / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"Application file is missing or is a symlink: {name}")
        if path.stat().st_size > 10 * 1024 * 1024:
            raise ValueError("Hosting file exceeds 10 MiB: " + name)
        result.append((name, path, hashlib.sha256(path.read_bytes()).hexdigest()))
    return result


def configuration():
    required = ("FTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD", "FTP_DIRECTORY")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        # InfinityFree uses the hosting account credentials for MySQL and FTP.
        # Use that existing binding only when explicitly enabled and no separate
        # FTP configuration was supplied. Never combine partial credentials.
        if len(missing) == len(required) and os.environ.get("FTP_USE_INFINITYFREE_ACCOUNT") == "true":
            settings = infinityfree_settings(ROOT.joinpath("koneksi.php").read_text())
            username, password = settings["db_user"], settings["db_pass"]
            if os.environ.get("GITHUB_ACTIONS") == "true":
                for value in (username, password):
                    escaped = value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
                    print("::add-mask::" + escaped, flush=True)
            print("Using the existing InfinityFree account with verified FTPS.", flush=True)
            return "ftpupload.net", 21, "ftps", "/htdocs/", username, password, settings
        raise ValueError("Add these GitHub Actions secrets to connect hosting: " + ", ".join(missing))
    protocol = os.environ.get("FTP_PROTOCOL", "ftps").strip().lower()
    if protocol not in ("ftp", "ftps"):
        raise ValueError("FTP_PROTOCOL must be ftp or ftps; automatic security downgrade is disabled.")
    server = os.environ["FTP_SERVER"].strip()
    if any(character in server for character in ("/", "@", ":")):
        raise ValueError("FTP_SERVER must contain only the FTP hostname, without a URL or port.")
    directory = os.environ["FTP_DIRECTORY"].strip()
    if not directory or ".." in PurePosixPath(directory).parts or directory.strip("/") == "":
        raise ValueError("FTP_DIRECTORY must point to the existing application directory, such as /htdocs/.")
    return server, int(os.environ.get("FTP_PORT", "21")), protocol, directory, os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"], None


def infinityfree_settings(source):
    """Read literal account bindings without executing or displaying PHP."""
    settings = {}
    for name in ("db_host", "db_user", "db_pass", "db_name"):
        matches = re.findall(r"^\s*\$" + name + r"\s*=\s*'((?:[^'\\]|\\.)*)'\s*;", source, re.MULTILINE)
        if len(matches) != 1:
            raise ValueError("The existing database configuration cannot safely supply an InfinityFree account. Configure FTP secrets instead.")
        settings[name] = re.sub(r"\\(['\\])", r"\1", matches[0])
    if (not re.fullmatch(r"sql\d+\.(?:infinityfree\.com|epizy\.com|byetcluster\.com)", settings["db_host"], re.IGNORECASE)
            or not re.fullmatch(r"(?:if0|epiz)_\d+", settings["db_user"])
            or not settings["db_name"].startswith(settings["db_user"] + "_")
            or not settings["db_pass"]):
        raise ValueError("The database connection does not identify a supported InfinityFree hosting account. Configure FTP secrets instead.")
    return settings


def verify_existing_account(client, settings, existing):
    if not {"absen.php", "ujian.php", "data_siswa.php"}.issubset(existing):
        raise ValueError("The inferred hosting directory does not contain this attendance application. No application files were changed.")
    source = bytearray()

    def collect(block):
        source.extend(block)
        if len(source) > 1024 * 1024:
            raise ValueError("The hosting database configuration could not be verified. No application files were changed.")

    client.retrbinary("RETR koneksi.php", collect)
    try:
        remote = infinityfree_settings(source.decode("utf-8"))
    except (UnicodeError, ValueError):
        raise ValueError("The hosting database configuration could not be verified. No application files were changed.") from None
    if any(remote[key] != settings[key] for key in ("db_host", "db_user", "db_name")):
        raise ValueError("The hosting directory belongs to a different database account. No application files were changed.")
    print("Existing application directory and database account verified.", flush=True)


def remote_file_info(client, name):
    digest = hashlib.sha256()
    length = 0

    def collect(block):
        nonlocal length
        length += len(block)
        digest.update(block)

    client.retrbinary("RETR " + name, collect)
    return digest.hexdigest(), length


def remote_digest(client, name):
    return remote_file_info(client, name)[0]


def verify_upload(client, temporary, name, path, digest, installed=False):
    # Verify the downloaded bytes; some hosting servers report stale SIZE
    # metadata immediately after STOR. Allow a short persistence delay.
    for delay in (0, 1, 2, 4):
        if delay:
            time.sleep(delay)
        uploaded_digest, uploaded_length = remote_file_info(client, temporary)
        if uploaded_length == path.stat().st_size and uploaded_digest == digest:
            return
    action = "Installed file" if installed else "Upload"
    preservation = "" if installed else " Existing application files were retained."
    image_info = ""
    if name in ("app/icon-192.png", "app/icon-512.png"):
        # These are public application icons, not account configuration/data.
        data = bytearray()
        client.retrbinary("RETR " + temporary, data.extend)
        if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
            image_info = " PNG dimensions: " + "x".join(str(n) for n in struct.unpack(">II", data[16:24])) + "."
        else:
            image_info = " Returned file is not a PNG image."
    raise ValueError(f"{action} verification failed: {name}; expected {path.stat().st_size} bytes, received {uploaded_length} bytes; checksum match: {uploaded_digest == digest}.{image_info}{preservation}")


def publish(files):
    server, port, protocol, directory, username, password, account = configuration()
    client = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=30) if protocol == "ftps" else ftplib.FTP(timeout=30)
    staged = []
    installed = []
    try:
        client.connect(server, port)
        client.login(username, password)
        if protocol == "ftps":
            client.prot_p()
        client.set_pasv(True)
        client.cwd(directory)
        existing = {PurePosixPath(name.rstrip("/")).name for name in client.nlst()}
        if not {"index.php", "koneksi.php"}.issubset(existing):
            raise ValueError("FTP_DIRECTORY does not contain the existing index.php and koneksi.php. No application files were changed.")
        client.voidcmd("TYPE I")
        if account is not None:
            verify_existing_account(client, account, existing)
        if "assets" not in existing:
            client.mkd("assets")
        directories = {"assets"}
        tag = uuid.uuid4().hex[:12]
        for name, path, digest in files:
            remote = PurePosixPath(name)
            for parent in reversed(remote.parents):
                directory_name = str(parent)
                if directory_name == "." or directory_name in directories:
                    continue
                try:
                    client.mkd(directory_name)
                except ftplib.error_perm:
                    # Verify an existing directory; never accept a failed mkdir silently.
                    client.cwd(directory_name)
                    client.cwd("/" + directory.strip("/"))
                directories.add(directory_name)
            try:
                current_digest, current_length = remote_file_info(client, name)
            except ftplib.error_perm as error:
                if not str(error).startswith("550"):
                    raise
            else:
                if current_digest == digest and current_length == path.stat().st_size:
                    print(f"Current file already verified: {name}", flush=True)
                    continue
            # Stage binary assets under a neutral extension. Hosting file-type
            # handlers must not rewrite an image/model before byte verification.
            temporary = str(remote.with_name(f".{remote.name}.deploy-{tag}.txt"))
            staged.append((temporary, name, digest))
            with path.open("rb") as source:
                client.storbinary("STOR " + temporary, source)
            verify_upload(client, temporary, name, path, digest)
            print(f"Staged and verified: {name}", flush=True)
        # All uploads are complete before any current application file is replaced.
        # Install shared assets and helpers before the pages that use them.
        for temporary, name, digest in staged:
            client.rename(temporary, name)
            installed.append(name)
            verify_upload(client, name, name, ROOT / name, digest, installed=True)
            print(f"Installed and verified: {name}", flush=True)
        print("Hosting now contains the application files from this GitHub revision.", flush=True)
    except Exception:
        if installed:
            print("Deployment stopped after installing: " + ", ".join(installed), file=sys.stderr)
        raise
    finally:
        # Cleanup removes only temporary files created by this invocation.
        for temporary, _, _ in staged:
            try:
                client.delete(temporary)
            except (ftplib.Error, OSError, EOFError):
                pass
        client.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Check the exact deployment manifest without connecting to hosting")
    options = parser.parse_args()
    try:
        files = local_files()
        if options.dry_run:
            for name, path, digest in files:
                print(f"{name}: {path.stat().st_size} bytes, sha256 {digest}")
            print("Manifest checked. Hosting database configuration and stored user data are excluded.")
        else:
            publish(files)
        return 0
    except (ValueError, OSError, ftplib.Error, EOFError) as error:
        print(f"Deployment failed: {error}", file=sys.stderr)
        if os.environ.get("GITHUB_ACTIONS") == "true":
            message = str(error).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
            print(f"::error title=Hosting was not fully updated::{message}", flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
