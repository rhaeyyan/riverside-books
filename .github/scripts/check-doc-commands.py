#!/usr/bin/env python3
"""Fail if the docs claim an npm script that no package.json actually defines.

Both review rounds on PR #31 found the same defect: a doc confidently describing
tooling this repo doesn't have — `npm run test` "with coverage" when the script is
a bare `vitest run`, and `npm run format` / `format:check` when neither script
exists. Neither was a drift bug; both were wrong in the original. Deduplicating the
mirrored docs would not have caught either one. Checking the claim against
package.json does.

A doc may still mention a script that doesn't exist yet — that's honest when it's
flagged as future state (CONTRIBUTING.md's `lint:md`/`format:md`, say). Those go in
ALLOWLIST_PATH, so writing one down is a deliberate act a reviewer can see rather
than something that slips through.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ALLOWLIST_PATH = REPO_ROOT / ".github/doc-commands-allowlist.txt"

# Docs that describe how to work in this repo. Product-owned docs are excluded:
# they describe plans for apps that mostly aren't scaffolded yet, so "this script
# doesn't exist" is their normal state, not an error.
DOC_GLOBS = ("CLAUDE.md", "AGENTS.md", "CONTRIBUTING.md", ".github/*.md")

NPM_RUN = re.compile(r"npm run ([a-zA-Z][\w:-]*)")


def defined_scripts() -> set[str]:
    """Every script name defined by any package.json in the repo."""
    names: set[str] = set()
    for pkg in REPO_ROOT.rglob("package.json"):
        if "node_modules" in pkg.parts:
            continue
        try:
            names.update(json.loads(pkg.read_text()).get("scripts", {}))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"warning: could not read {pkg.relative_to(REPO_ROOT)}: {exc}")
    return names


def allowlisted() -> set[str]:
    if not ALLOWLIST_PATH.exists():
        return set()
    return {
        line.split("#")[0].strip()
        for line in ALLOWLIST_PATH.read_text().splitlines()
        if line.split("#")[0].strip()
    }


def main() -> int:
    defined, allowed = defined_scripts(), allowlisted()

    failures: list[str] = []
    for glob in DOC_GLOBS:
        for doc in sorted(REPO_ROOT.glob(glob)):
            for lineno, line in enumerate(doc.read_text().splitlines(), 1):
                for script in NPM_RUN.findall(line):
                    if script in defined or script in allowed:
                        continue
                    rel = doc.relative_to(REPO_ROOT)
                    failures.append(f"  {rel}:{lineno} — `npm run {script}`")

    if failures:
        print("Docs reference npm scripts that no package.json defines:\n")
        print("\n".join(failures))
        print(
            f"\nEither add the script, correct the doc, or — if the doc is "
            f"deliberately describing future state — add the name to "
            f"{ALLOWLIST_PATH.relative_to(REPO_ROOT)} with a reason."
        )
        return 1

    print(f"OK — every `npm run` in {', '.join(DOC_GLOBS)} resolves.")
    print(f"  {len(defined)} scripts defined, {len(allowed)} allowlisted as future state.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
