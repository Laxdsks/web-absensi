#!/usr/bin/env python3
"""Check the deployed build and teacher access without creating attendance fixtures."""
import argparse
import base64
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("WA_VERIFY_URL", "https://datasiswasekolah.42web.io/").rstrip("/") + "/"
HOST = urllib.parse.urlparse(BASE).hostname
if HOST not in {"datasiswasekolah.42web.io", "127.0.0.1", "localhost"}:
    raise SystemExit("Verification is restricted to the configured hosting or local development server.")
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(path, data=None, headers=None):
    for _ in range(3):
        req = urllib.request.Request(BASE + path, data=data, headers=headers or {})
        try:
            response = client.open(req, timeout=35)
        except urllib.error.HTTPError as error:
            response = error
        body = response.read()
        # InfinityFree's normal browser challenge uses three public hex values.
        # Keep the resulting cookie in memory and retain normal TLS verification.
        text = body.decode("utf-8", errors="replace")
        values = re.findall(r'toNumbers\("([a-fA-F0-9]+)"\)', text)
        if len(values) == 3 and "slowAES.decrypt" in text:
            key, iv, encrypted = values
            if len(key) != 32 or len(iv) != 32 or len(encrypted) > 256:
                raise RuntimeError("Unexpected hosting browser challenge.")
            cookie = subprocess.run(
                ["openssl", "enc", "-aes-128-cbc", "-d", "-nopad", "-K", key, "-iv", iv],
                input=bytes.fromhex(encrypted), capture_output=True, check=True,
            ).stdout.hex()
            jar.set_cookie(http.cookiejar.Cookie(
                0, "__test", cookie, None, False, HOST, False, False, "/", True,
                BASE.startswith("https:"), None, True, None, None, {}, False,
            ))
            continue
        if response.status != 200:
            raise RuntimeError("Hosting returned HTTP " + str(response.status) + " for " + path.split("?")[0])
        return body, response.headers
    raise RuntimeError("Hosting browser challenge did not complete.")


def api(action, **values):
    body, _ = request("app_api.php", json.dumps({"action": action, **values}).encode(),
                      {"Content-Type": "application/json", "X-App-Request": "1"})
    result = json.loads(body)
    if result.get("status") != "success":
        raise RuntimeError("Deployed API did not complete " + action + ".")
    return result


def login_teacher(allow_previous=False):
    source = (ROOT / "index.php").read_text()
    user = re.search(r"\$user === '([^']+)'", source).group(1)
    password = re.search(r"\$pass === '([^']+)'", source).group(1)
    form = urllib.parse.urlencode({"action": "login_privat", "username": user, "password": password}).encode()
    body, _ = request("index.php", form, {"Content-Type": "application/x-www-form-urlencoded"})
    if json.loads(body).get("status") != "success" and allow_previous:
        # Before a credential rotation, the server still runs the parent revision.
        # Use it only to record the baseline; post-deployment checks must use the new login.
        previous = subprocess.run(["git", "show", "HEAD^:index.php"], cwd=ROOT,
                                  capture_output=True, text=True, check=False)
        if previous.returncode == 0:
            old_user = re.search(r"\$user === '([^']+)'", previous.stdout)
            old_password = re.search(r"\$pass === '([^']+)'", previous.stdout)
            if old_user and old_password:
                form = urllib.parse.urlencode({"action": "login_privat", "username": old_user.group(1),
                                               "password": old_password.group(1)}).encode()
                body, _ = request("index.php", form, {"Content-Type": "application/x-www-form-urlencoded"})
    if json.loads(body).get("status") != "success":
        raise RuntimeError("Teacher login did not complete on the deployed hosting.")
    private = subprocess.run(["openssl", "genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256"], capture_output=True, check=True).stdout
    public = subprocess.run(["openssl", "pkey", "-pubout", "-outform", "DER"], input=private, capture_output=True, check=True).stdout
    api("bootstrap", pubkey=base64.urlsafe_b64encode(public).decode().rstrip("="))


def record_keys(snapshot):
    # Only hashed identities are kept in the temporary runner file, never names,
    # NIMs, marks, credentials or document contents. Existing records may be
    # updated by active users; deployment must not remove their identities.
    fields = {"sessions": ("id",), "marks": ("scope", "slot", "nim"),
              "documents": ("scope", "kind"), "registrations": ("id",)}
    records = {kind: sorted({hashlib.sha256(json.dumps([row[key] for key in keys],
                            ensure_ascii=False).encode()).hexdigest()
                          for row in snapshot[kind]}) for kind, keys in fields.items()}
    # A roster identity is owner + academic context + NIM, not a duplicate row ID.
    # This allows canonical duplicate cleanup while still detecting lost students.
    records['roster'] = sorted({hashlib.sha256(json.dumps([
        row.get('owner', 'admin_01'), row['prodi'].strip().lower(),
        str(row['semester']).replace('Semester ', '').strip(),
        str(row['kelas']).replace('Kelas ', '').strip().upper(),
        row.get('year', '2026/2027'), row.get('period', 'Ganjil' if int(str(row['semester']).replace('Semester ', '')) % 2 else 'Genap').strip().lower(),
        row['nim'].strip().upper()], ensure_ascii=False).encode()).hexdigest() for row in snapshot['roster']})
    records['evidence'] = sorted({hashlib.sha256(json.dumps([ref['id'], ref['hash']]).encode()).hexdigest()
                                  for row in snapshot['marks'] if row.get('evidence_ready')
                                  for ref in row.get('attachments', [])})
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--record-baseline", type=Path)
    mode.add_argument("--preserve-baseline", type=Path)
    args = parser.parse_args()
    if args.record_baseline:
        try:
            login_teacher(allow_previous=True)
            snapshot = api("snapshot")["snapshot"]
            with args.record_baseline.open("x") as output:
                os.chmod(args.record_baseline, 0o600)
                json.dump({"host": HOST, "records": record_keys(snapshot)}, output)
            print("Pre-deployment record identities saved privately; attendance data was not exported.", flush=True)
        finally:
            if any(cookie.name == "wa_device" for cookie in jar):
                api("logout")
        return
    expected = re.search(r"const WA_BUILD = '([^']+)'", (ROOT / "app_core.php").read_text()).group(1)
    health = json.loads(request("app_api.php?action=health")[0])
    if health.get("status") != "success" or health.get("build") != expected:
        raise RuntimeError("The hosting build does not match this GitHub revision.")
    print("Deployed API build verified: " + expected, flush=True)
    page, _ = request("app/")
    if b"app.js" not in page or (b"core.js" not in page and b"core-" not in page):
        raise RuntimeError("The application entry page is missing.")
    _, mime = request("app/vendor/pdf.min.mjs")
    if not mime.get_content_type() in {"application/javascript", "text/javascript"}:
        raise RuntimeError("PDF modules have the wrong hosting content type.")
    print("Application entry page and PDF module content type verified.", flush=True)
    original, _ = request("index.php")
    if b'id="displayAppTitle"' not in original or b'id="prodi"' not in original or b'id="teacherTools"' not in original:
        raise RuntimeError("The original teacher homepage or its integrated tools are missing.")
    if b'Aplikasi offline & Absen QR' in original:
        raise RuntimeError("The obsolete second-dashboard link is still published.")
    if not all(marker in original for marker in (b'id="formRegisterTeacher"', b'name="avatar_file"', b'name="role"')):
        raise RuntimeError("Teacher registration with photo and requested role is missing.")
    print("Original teacher homepage retained; obsolete second-dashboard link removed.", flush=True)
    for path in (*[str(path.relative_to(ROOT)) for path in (ROOT / "app").glob("*-[0-9]*.js")], "app/icon-settings.js", "app/portal.js", "app/appearance.js", "app/workspace.js", "app/portal.css", "app/portal-background.svg", "app/student-tools.js", "app/locations.js", "app/account-tools.js", "app/inbox.js", "app/monitoring.js", "app/evidence.js", "app/experience.js", "app/experience.css", "app/student.css", "app/face-check.js", "app/vendor/leaflet/leaflet.js", "app/vendor/leaflet/leaflet.css",
                 *["app/vendor/face/" + name for name in ("face-api.js", "tiny_face_detector_model.bin", "tiny_face_detector_model-weights_manifest.json", "face_landmark_68_tiny_model.bin", "face_landmark_68_tiny_model-weights_manifest.json", "face_recognition_model.bin", "face_recognition_model-weights_manifest.json")], "app/grade-assistant.js", "app/app.js", "app/core.js", "app/qr-files.js", "app/guide.js", "app/guide.css", "app/guide-images/sheet.png", "app/guide-images/appearance.png", "assets/sheet-signatures.js", "assets/sheet-signatures.css", "assets/sheet-fit.js", "assets/sheet-fit.css", "app/app.css", "app-sw.js", "assets/offline-bridge.js", "assets/teacher-tools.js", "assets/teacher-tools.css"):
        deployed, _ = request(path + "?verify=" + expected)
        if hashlib.sha256(deployed).digest() != hashlib.sha256((ROOT / path).read_bytes()).digest():
            raise RuntimeError("Deployed client file does not match the tested revision: " + path)
    print("Deployed client scripts and offline cache version match the tested revision.", flush=True)

    # Use the existing teacher account, never write credentials to files/logs.
    try:
        login_teacher()
        ctx = urllib.parse.urlencode({"jenjang": "S1", "prodi": "Pendidikan Teknologi Informasi", "semester": "1", "kelas": "A"})
        attendance = request("absen.php?" + ctx)[0]
        if not all(marker in attendance for marker in (b'id="paperSheet"', b'id="tabelAbsen"', b'id="openAttendanceQR"')):
            raise RuntimeError("Original attendance sheet or its integrated QR controls are missing.")
        print("QR controls published inside the original attendance sheet.", flush=True)
        exam = request("ujian.php?" + ctx)[0].decode()
        for key in ("room-label", "time-label", "course-label"):
            if not re.search(r'<span[^>]*data-edit-key="' + key + r'"[^>]*>\s*</span>', exam):
                raise RuntimeError("An exam field is no longer blank: " + key)
        if not all(marker in exam for marker in ("examSupervisorBox", "examLecturerBox", "sheet-spacing.js")):
            raise RuntimeError("The deployed exam signatures or spacing helper are missing.")
        print("Deployed exam blank fields and both signature blocks verified.", flush=True)
        snapshot = api("snapshot")["snapshot"]
        if not isinstance(snapshot.get("roster"), list) or not snapshot.get("tag"):
            raise RuntimeError("Deployed teacher data is not available.")
        print("Database schema, persistent teacher access and snapshot verified; no attendance fixtures created.", flush=True)
        if args.preserve_baseline:
            baseline = json.loads(args.preserve_baseline.read_text())
            if baseline["host"] != HOST:
                raise RuntimeError("Preservation baseline belongs to another host.")
            current = record_keys(snapshot)
            for kind, records in baseline["records"].items():
                if not set(records).issubset(current[kind]):
                    raise RuntimeError("Previously recorded identities are missing after deployment: " + kind)
            print("Existing students, attendance, sessions, documents and registrations retained after deployment.", flush=True)
    finally:
        if any(cookie.name == "wa_device" for cookie in jar):
            api("logout")
    print("Temporary verification login closed.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not echo response bodies, student records or account credentials.
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print("Verification failed: " + message, flush=True)
        if os.environ.get("GITHUB_ACTIONS") == "true":
            print("::error title=Hosting verification failed::" + message.replace("%", "%25").replace("\n", "%0A").replace("\r", "%0D"))
        raise SystemExit(1)
