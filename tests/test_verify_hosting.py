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
