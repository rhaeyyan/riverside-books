#!/usr/bin/env python3
"""Regression tests for check-scaffolding-state.py.

Run with `python3 -m unittest .github/scripts/test_check_scaffolding_state.py`
from the repo root, or `python3 .github/scripts/test_check_scaffolding_state.py`
directly. Stdlib only, matching the script under test — no pytest, no
third-party fixtures, since the `docs` job that would run this has no
setup-python step and no pip install.

Loaded by file path rather than imported, because the module under test has a
hyphen in its filename and is never meant to be imported as a package. Each
test points the module's REPO_ROOT/WORKFLOW/AGENTS at a throwaway directory
tree rather than the real repo, so these tests describe the script's behavior
independently of whatever this repo's tree happens to look like today.

Covers the regression PR #75's review actually asked for: Product D scaffolds
at `product-d/`, with no `-app` suffix, which the script's first version
(hardcoded to `product-*-app/`) could not see at all — the bypass a positive
and a negative case both cover here.
"""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import ModuleType

_MODULE_PATH = Path(__file__).resolve().parent / "check-scaffolding-state.py"


def _load_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "check_scaffolding_state", _MODULE_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ScaffoldingStateTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        repo_root = Path(self._tmp.name)
        (repo_root / ".github" / "workflows").mkdir(parents=True)

        self.module = _load_module()
        self.module.REPO_ROOT = repo_root
        self.module.WORKFLOW = repo_root / ".github" / "workflows" / "ci.yml"
        self.module.AGENTS = repo_root / "AGENTS.md"
        self.repo_root = repo_root

    def _scaffold(self, directory: str) -> None:
        app_dir = self.repo_root / directory
        app_dir.mkdir(parents=True, exist_ok=True)
        (app_dir / "package.json").write_text("{}\n")

    def _write_agents(self, table_body: str) -> None:
        self.module.AGENTS.write_text(
            "# AGENTS\n\n"
            f"{self.module.START}\n"
            "| Product | App directory | CI job | Scaffolded |\n"
            "| --- | --- | --- | --- |\n"
            f"{table_body}\n"
            f"{self.module.END}\n"
        )

    def test_direct_directory_scaffold_with_no_job_is_caught(self) -> None:
        """product-d/package.json with no matching CI job — the bug PR #75 fixed.

        Before the fix, `scaffolded_apps` only globbed `product-*-app/`, so a
        product scaffolded directly at `product-d/` (Product D's actual
        convention, not `product-d-app/`) was invisible to this check
        entirely — the exact scaffold it exists to protect could bypass it.
        """
        self._scaffold("product-d")
        self.module.WORKFLOW.write_text("jobs:\n  ci:\n    steps:\n      - run: echo noop\n")
        self._write_agents("| D | — | — | no |")

        self.assertEqual(self.module.main(), 1)

    def test_direct_directory_scaffold_with_matching_job_is_recognized(self) -> None:
        """product-d/package.json WITH a ci-product-d job naming product-d.

        The positive case for the same code path: a job that references the
        bare `product-d` directory (no `-app` suffix) must be mapped
        correctly, not just flagged as unmapped.
        """
        self._scaffold("product-d")
        self.module.WORKFLOW.write_text(
            "jobs:\n"
            "  ci-product-d:\n"
            "    steps:\n"
            "      - working-directory: product-d\n"
            "        run: npm ci\n"
        )
        self._write_agents(
            "| A | — | — | no |\n"
            "| B | — | — | no |\n"
            "| C | — | — | no |\n"
            "| D | `product-d/` | `ci-product-d` | yes |"
        )

        self.assertEqual(self.module.main(), 0)

    def test_app_suffix_directory_still_preferred_over_bare_directory(self) -> None:
        """product-a-app/ resolves ahead of a bare product-a/, unchanged by the fix.

        Guards the fallback order in `expected_table`: A/B/C's existing
        `-app`-suffixed convention must keep winning over the new bare
        fallback, not just Product D's case.
        """
        self._scaffold("product-a-app")
        self.module.WORKFLOW.write_text(
            "jobs:\n"
            "  ci-product-a:\n"
            "    steps:\n"
            "      - uses: actions/setup-node@v7\n"
            "        with:\n"
            "          cache-dependency-path: product-a-app/package-lock.json\n"
        )
        self._write_agents(
            "| A | `product-a-app/` | `ci-product-a` | yes |\n"
            "| B | — | — | no |\n"
            "| C | — | — | no |\n"
            "| D | — | — | no |"
        )

        self.assertEqual(self.module.main(), 0)


if __name__ == "__main__":
    unittest.main()
