import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs


spec = importlib.util.spec_from_file_location("verify_hosting", Path(__file__).resolve().parents[1] / "scripts/verify_hosting.py")
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class CredentialRotationTests(unittest.TestCase):
    def exercise(self, accepted, allow_previous, history=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.php").write_text("<?php $user === 'fixture-admin'; $pass === 'new-fixture-password';")
            attempts, history_calls = [], []
            real_run = subprocess.run

            def request(path, data, headers):
                password = parse_qs(data.decode())["password"][0]
                attempts.append(password)
                return json.dumps({"status": "success" if password == accepted else "error"}).encode(), {}

            def run(command, **kwargs):
                if command[0] == "git":
                    history_calls.append(command)
                    return SimpleNamespace(returncode=0 if history else 1,
                                           stdout="<?php $user === 'fixture-admin'; $pass === 'old-fixture-password';")
                return real_run(command, **kwargs)

            with patch.object(verify, "ROOT", root), patch.object(verify, "request", request), patch.object(verify.subprocess, "run", run), patch.object(verify, "api") as api:
                if accepted == "old-fixture-password" and (not allow_previous or not history):
                    with self.assertRaisesRegex(RuntimeError, "Teacher login did not complete"):
                        verify.login_teacher(allow_previous=allow_previous)
                    api.assert_not_called()
                else:
                    verify.login_teacher(allow_previous=allow_previous)
                    self.assertEqual(api.call_args.args, ("bootstrap",))
                    self.assertTrue(api.call_args.kwargs["pubkey"])
            return attempts, history_calls

    def test_baseline_can_authenticate_the_still_deployed_previous_revision(self):
        attempts, history = self.exercise("old-fixture-password", True)
        self.assertEqual(attempts, ["new-fixture-password", "old-fixture-password"])
        self.assertEqual(history, [["git", "show", "HEAD^:index.php"]])

    def test_post_deployment_verification_never_falls_back_to_old_credentials(self):
        attempts, history = self.exercise("old-fixture-password", False)
        self.assertEqual(attempts, ["new-fixture-password"])
        self.assertFalse(history)

    def test_current_credentials_do_not_require_repository_history(self):
        attempts, history = self.exercise("new-fixture-password", True)
        self.assertEqual(attempts, ["new-fixture-password"])
        self.assertFalse(history)

    def test_missing_history_does_not_bypass_authentication(self):
        attempts, history = self.exercise("old-fixture-password", True, history=False)
        self.assertEqual(attempts, ["new-fixture-password"])
        self.assertEqual(len(history), 1)


if __name__ == "__main__":
    unittest.main()


class RosterIdentityPreservationTests(unittest.TestCase):
    def test_duplicate_row_ids_share_one_logical_identity(self):
        row = {"id": 1, "nim": "C123456", "prodi": "Pendidikan Sejarah", "semester": "1", "kelas": "A"}
        before = {"roster": [row, {**row, "id": 22}], "sessions": [], "marks": [], "documents": [], "registrations": []}
        after = {**before, "roster": [row]}
        self.assertEqual(verify.record_keys(before), verify.record_keys(after))
        changed = {**before, "roster": [{**row, "nim": "C987654"}]}
        self.assertNotEqual(verify.record_keys(before)["roster"], verify.record_keys(changed)["roster"])

    def test_owners_classes_and_years_are_separate(self):
        row = {"id": 1, "nim": "C123456", "prodi": "Pendidikan Sejarah", "semester": "1", "kelas": "A"}
        snapshot = {"roster": [row, {**row, "owner": "dosen_01"}, {**row, "kelas": "B"}, {**row, "year": "2027/2028"}], "sessions": [], "marks": [], "documents": [], "registrations": []}
        self.assertEqual(len(verify.record_keys(snapshot)["roster"]), 4)


class ExamBundleVerificationTests(unittest.TestCase):
    def test_current_bundle_is_verified_instead_of_requiring_separate_script_tags(self):
        path = "app/runtime-teacher-1.2.10.js?v=fixture"
        html = '<div id="examSupervisorBox"></div><div id="examLecturerBox"></div><script data-teacher-bundle src="'+path+'"></script><script>SheetSignatures.install({});</script>'
        bundle = (verify.ROOT / path.split("?")[0]).read_bytes()
        with patch.object(verify, "request", return_value=(bundle, {})) as request:
            verify.verify_exam_layout(html)
            request.assert_called_once_with(path)

    def test_incomplete_or_different_bundle_is_rejected(self):
        html = '<div id="examSupervisorBox"></div><div id="examLecturerBox"></div><script data-teacher-bundle src="app/runtime-teacher-1.2.10.js"></script><script>SheetSignatures.install({});</script>'
        with patch.object(verify, "request", return_value=(b"/* incomplete */", {})):
            with self.assertRaisesRegex(RuntimeError, "does not match"):
                verify.verify_exam_layout(html)

    def test_missing_helpers_are_not_accepted(self):
        for html in ('examSupervisorBox examLecturerBox SheetSignatures.install', 'sheet-spacing.js examSupervisorBox'):
            with self.assertRaises(RuntimeError):
                verify.verify_exam_layout(html)

    def test_bundle_path_is_limited_to_the_teacher_entry(self):
        html = 'examSupervisorBox examLecturerBox SheetSignatures.install <script data-teacher-bundle src="https://other.invalid/runtime.js"></script>'
        with patch.object(verify, "request") as request:
            with self.assertRaisesRegex(RuntimeError, "Unexpected"):
                verify.verify_exam_layout(html)
            request.assert_not_called()
