#!/usr/bin/env python3
"""Publish application files to the existing PHP hosting directory."""

import argparse
import ftplib
import hashlib
import os
from pathlib import Path, PurePosixPath
import ssl
import sys
import uuid


ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "assets/app-audio.js",
    "assets/logo-stkip-yapis-dompu.png",
    "assets/sheet-signatures.css",
    "assets/sheet-signatures.js",
    "auth_guard.php",
    "music_player.php",
    "data_siswa.php",
    "absen.php",
    "ujian.php",
    "index.php",
)


def local_files():
    result = []
    for name in FILES:
        path = ROOT / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"Application file is missing or is a symlink: {name}")
        result.append((name, path, hashlib.sha256(path.read_bytes()).hexdigest()))
    return result


def configuration():
    required = ("FTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD", "FTP_DIRECTORY")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
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
    return server, int(os.environ.get("FTP_PORT", "21")), protocol, directory


def remote_digest(client, name):
    digest = hashlib.sha256()
    client.retrbinary("RETR " + name, digest.update)
    return digest.hexdigest()


def publish(files):
    server, port, protocol, directory = configuration()
    client = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=30) if protocol == "ftps" else ftplib.FTP(timeout=30)
    staged = []
    installed = []
    try:
        client.connect(server, port)
        client.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
        if protocol == "ftps":
            client.prot_p()
        client.set_pasv(True)
        client.cwd(directory)
        existing = {PurePosixPath(name.rstrip("/")).name for name in client.nlst()}
        if not {"index.php", "koneksi.php"}.issubset(existing):
            raise ValueError("FTP_DIRECTORY does not contain the existing index.php and koneksi.php. No application files were changed.")
        client.voidcmd("TYPE I")
        if "assets" not in existing:
            client.mkd("assets")
        tag = uuid.uuid4().hex[:12]
        for name, path, digest in files:
            remote = PurePosixPath(name)
            temporary = str(remote.with_name(f".{remote.stem}.deploy-{tag}{remote.suffix}"))
            staged.append((temporary, name, digest))
            with path.open("rb") as source:
                client.storbinary("STOR " + temporary, source)
            if client.size(temporary) != path.stat().st_size or remote_digest(client, temporary) != digest:
                raise ValueError(f"Upload verification failed: {name}. Existing application files were retained.")
            print(f"Staged and verified: {name}", flush=True)
        # All uploads are complete before any current application file is replaced.
        # Install shared assets and helpers before the pages that use them.
        for temporary, name, digest in staged:
            client.rename(temporary, name)
            installed.append(name)
            if remote_digest(client, name) != digest:
                raise ValueError(f"Installed file verification failed: {name}")
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
        return 1


if __name__ == "__main__":
    sys.exit(main())
