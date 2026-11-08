"""Offline regression checks for the GitHub setup continuation."""
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "github_setup", Path(__file__).resolve().parents[1] / "scripts/github-setup.py"
)
setup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(setup)


class MobileImportTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.web = root / "web"
        self.web.mkdir()
        (root / "mawid-mobile-import" / ".git").mkdir(parents=True)
        self.bundle = root / "reviewed.bundle"
        self.bundle.touch()
        self.main = "3467593ab798caed5b3a8c3e94e362fd5a341149"
        self.branch = "refs/heads/codex/github-readiness-2026-11-07"
        self.head = "b" * 40
        self.heads = f"{self.main} refs/heads/main\n{self.head} {self.branch}\n"
        self.remote_refs = f"{self.main} HEAD\n" + self.heads
        self.commands = []
        self.created_prs = []
        self.api_calls = []
        for target, replacement in [
            ("ROOT", self.web),
            ("identify", lambda: {"login": setup.OWNER}),
            ("run", self.run_git),
            ("api", self.api),
            ("pages", lambda endpoint: list(self.created_prs)),
        ]:
            patcher = patch.object(setup, target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)

    def run_git(self, args, **kwargs):
        self.commands.append(args)
        output = ""
        if args[:3] == ["git", "bundle", "list-heads"]:
            output = self.heads
        elif "ls-remote" in args:
            output = self.remote_refs
        elif args == ["git", "remote"]:
            output = "github\n"
        elif args[:4] == ["git", "remote", "get-url", "--push"]:
            output = f"https://github.com/{setup.MOBILE}.git\n"
        elif args[:3] != ["git", "bundle", "verify"] and not any(
            operation in args for operation in ("fetch", "push")
        ):
            self.fail(f"Unexpected command: {args}")
        return subprocess.CompletedProcess(args, 0, output, "")

    def api(self, endpoint, method="GET", data=None, **kwargs):
        self.api_calls.append((endpoint, method, data))
        if endpoint == f"repos/{setup.MOBILE}":
            return {"private": True}
        if endpoint == f"repos/{setup.MOBILE}/pulls" and method == "POST":
            pr = {
                "head": {"ref": self.branch.removeprefix("refs/heads/")},
                "html_url": "https://example.invalid/pull/1",
            }
            self.created_prs.append(pr)
            return pr
        self.fail(f"Unexpected API request: {method} {endpoint}")

    def import_bundle(self):
        with redirect_stdout(io.StringIO()):
            setup.mobile_import(self.bundle)

    def test_retry_after_pr_creation_reuses_pr_and_pushes_without_force(self):
        self.import_bundle()
        self.remote_refs += (
            f"{self.head} refs/pull/1/head\n"
            f"{'c' * 40} refs/pull/1/merge\n"
        )
        self.import_bundle()
        self.assertEqual(len(self.created_prs), 1)
        pushes = [command for command in self.commands if "push" in command]
        self.assertEqual(len(pushes), 2)
        for command in pushes:
            self.assertNotIn("--force", command)
            self.assertNotIn("-f", command)
            self.assertFalse(any(argument.startswith("+") for argument in command))

    def test_unrelated_branch_and_tag_still_stop_before_push(self):
        for ref in ("refs/heads/unrelated", "refs/tags/existing-release"):
            with self.subTest(ref=ref):
                self.remote_refs = self.heads + f"{'c' * 40} {ref}\n"
                with self.assertRaisesRegex(RuntimeError, "unrelated refs"):
                    self.import_bundle()
                self.assertFalse(any("push" in command for command in self.commands))
                self.assertTrue(all(method == "GET" for _, method, _ in self.api_calls))

    def test_changed_main_still_stops_before_push(self):
        self.remote_refs = self.heads.replace(self.main, "c" * 40)
        with self.assertRaisesRegex(RuntimeError, "baseline differs"):
            self.import_bundle()
        self.assertFalse(any("push" in command for command in self.commands))


class Utf8Tests(unittest.TestCase):
    def test_subprocess_decodes_utf8_output_under_legacy_default_encoding(self):
        original_run = subprocess.run

        def legacy_run(*args, **kwargs):
            kwargs.setdefault("encoding", "cp1252")
            return original_run(*args, **kwargs)

        text = "MAWID | \u0645\u0648\u0639\u062f \u2014 \u2192"
        child = (
            f"import sys; value=bytes.fromhex('{text.encode('utf-8').hex()}'); "
            "sys.stdout.buffer.write(value); sys.stderr.buffer.write(value)"
        )
        with patch.object(setup.subprocess, "run", side_effect=legacy_run):
            result = setup.run([sys.executable, "-c", child])
        self.assertEqual(result.stdout, text)
        self.assertEqual(result.stderr, text)

    def test_metadata_posts_utf8_issue_text_under_legacy_default_encoding(self):
        class IssueCaptured(Exception):
            pass

        original_read_text = Path.read_text
        captured = []
        title = "\u0645\u0648\u0639\u062f \u2014 customer app"
        body = "English \u2192 \u0627\u0644\u0639\u0631\u0628\u064a\u0629"

        def legacy_read_text(path, *args, **kwargs):
            kwargs.setdefault("encoding", "cp1252")
            return original_read_text(path, *args, **kwargs)

        def api(endpoint, method="GET", data=None, **kwargs):
            if endpoint == f"repos/{setup.MOBILE}":
                return None
            if endpoint == f"repos/{setup.WEB}/issues" and method == "POST":
                captured.append(data)
                raise IssueCaptured
            if endpoint.endswith("/labels") and method == "POST":
                return {}
            self.fail(f"Unexpected API request: {method} {endpoint}")

        def pages(endpoint):
            if "/milestones?" in endpoint:
                return [{"title": f"P{i}", "number": i + 1} for i in range(6)]
            return []

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = root / "docs/engineering/issues.json"
            manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps([{
                "key": "TEST", "repository": setup.WEB, "title": title,
                "body": body, "phase": "P1", "type": "task", "priority": "normal",
            }], ensure_ascii=False), encoding="utf-8")
            with (
                patch.object(setup, "ROOT", root),
                patch.object(setup, "identify"),
                patch.object(setup, "api", side_effect=api),
                patch.object(setup, "pages", side_effect=pages),
                patch.object(setup, "run", return_value=subprocess.CompletedProcess([], 1)),
                patch.object(Path, "read_text", legacy_read_text),
                redirect_stdout(io.StringIO()),
                self.assertRaises(IssueCaptured),
            ):
                setup.metadata()
        self.assertEqual(captured[0]["title"], title)
        self.assertEqual(captured[0]["body"], body)


if __name__ == "__main__":
    unittest.main()
