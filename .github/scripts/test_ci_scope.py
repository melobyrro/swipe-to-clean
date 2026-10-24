"""Prove CI selection against mixed changes and real Git renames/deletions."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from ci_scope import changed_paths, main, needs_full


class ScopeTests(unittest.TestCase):
    def test_iva_prose_is_lightweight(self):
        self.assertFalse(needs_full(["iva/AGENTS.md", "iva/docs/HANDOFF.md"], "iva"))

    def test_root_repository_prose_is_lightweight(self):
        self.assertFalse(needs_full(["README.md", "docs/design.rst"]))

    def test_json_requirements_decisions_and_catalog_keep_full_checks(self):
        for path in ["docs/product-requirements.json", "docs/changes/decision.json",
                     "tests/regression-catalog.json", "prisma/migrations/1/migration.sql"]:
            with self.subTest(path=path):
                self.assertTrue(needs_full(["iva/" + path], "iva"))

    def test_code_mixed_with_docs_keeps_full_checks(self):
        self.assertTrue(needs_full(["iva/docs/HANDOFF.md", "iva/src/server.ts"], "iva"))

    def test_markdown_runtime_inputs_and_executable_docs_keep_full_checks(self):
        for path in ["src/prompt.md", "tests/fixtures/input.md", "docs/probe.py", "unknown"]:
            with self.subTest(path=path):
                self.assertTrue(needs_full(["iva/" + path], "iva"))

    def test_other_apps_do_not_force_iva_checks(self):
        self.assertFalse(needs_full(["budget/src/index.ts", "iva/docs/HANDOFF.md"], "iva"))

    def test_ci_controls_keep_full_checks(self):
        self.assertTrue(needs_full([".github/workflows/iva-requirements.yml"], "iva"))
        self.assertTrue(needs_full([".github/scripts/ci_scope.py"], "iva"))

    def test_invalid_base_is_rejected(self):
        for base in ["", "HEAD", "--help", "a" * 39]:
            with self.subTest(base=base), self.assertRaises(ValueError):
                changed_paths(base)

    def test_git_failures_do_not_become_documentation_success(self):
        with patch("ci_scope.subprocess.run", side_effect=subprocess.CalledProcessError(1, "git")):
            with self.assertRaises(subprocess.CalledProcessError):
                changed_paths("a" * 40)

    def test_code_renamed_to_docs_still_selects_full_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            old_cwd = os.getcwd()
            try:
                os.chdir(directory)
                def git(*args):
                    return subprocess.check_output(["git", *args], text=True).strip()
                git("init", "-q")
                git("config", "user.email", "fixture@example.invalid")
                git("config", "user.name", "CI fixture")
                Path("src").mkdir()
                Path("src/code.ts").write_text("export const value = 1;\n")
                Path("src/removed.ts").write_text("export const removed = 2;\n")
                git("add", ".")
                git("commit", "-qm", "base")
                base = git("rev-parse", "HEAD")
                Path("docs").mkdir()
                Path("src/code.ts").rename("docs/code.md")
                Path("src/removed.ts").unlink()
                Path("docs/odd\nname.md").write_text("Prose\n")
                git("add", ".")
                git("commit", "-qm", "rename and delete")
                paths = changed_paths(base)
                self.assertIn("src/code.ts", paths)
                self.assertIn("src/removed.ts", paths)
                self.assertIn("docs/odd\nname.md", paths)
                self.assertTrue(needs_full(paths))
            finally:
                os.chdir(old_cwd)

    def test_manual_request_always_selects_full_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            output, summary = Path(directory) / "output", Path(directory) / "summary"
            with patch.dict(os.environ, {"GITHUB_EVENT_NAME": "workflow_dispatch",
                            "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(summary)}):
                main([])
            self.assertEqual(output.read_text(), "full=true\n")

    def test_documentation_summary_does_not_claim_full_test_success(self):
        with tempfile.TemporaryDirectory() as directory:
            output, summary = Path(directory) / "output", Path(directory) / "summary"
            with patch.dict(os.environ, {"GITHUB_EVENT_NAME": "pull_request", "CI_BASE_SHA": "a" * 40,
                            "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(summary)}), \
                    patch("ci_scope.changed_paths", return_value=["README.md"]):
                main([])
            self.assertEqual(output.read_text(), "full=false\n")
            self.assertIn("were not selected", summary.read_text())


if __name__ == "__main__":
    unittest.main()
