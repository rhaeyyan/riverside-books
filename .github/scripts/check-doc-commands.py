#!/usr/bin/env python3
"""Fail if the docs reference an npm script name that no package.json defines.

This checks names, not behavior. It catches `npm run format:check` when no such
script exists anywhere in the repo — the PR #31 defect this was built for. It does
NOT catch a script that exists but is described incorrectly (e.g. `npm test`
documented as running "with coverage" when the script is really a bare
`vitest run`): there's no missing script name for a name-check to find. That class
of defect still needs a human reading the prose against the actual command.

A doc may still mention a script that doesn't exist yet — that's honest when it's
flagged as future state (CONTRIBUTING.md's `lint:md`/`format:md`, say). Those go in
ALLOWLIST_PATH, each with a reason comment directly above the entry (no blank line
between them) — a bare name with no comment above it fails, same as an entry left
behind after the real script gets added for real. Silently-stale entries are how a
later regression (the script gets removed again) would go uncaught.
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


def allowlist_entries() -> list[tuple[str, int, bool]]:
    """Parse ALLOWLIST_PATH into (name, line number, has a reason above it).

    A blank line starts a fresh group. An entry "has a reason" if a comment
    line appears somewhere in its group before it, with no blank line between
    — so one comment block can cover several entries, matching how the file
    is actually written today.
    """
    if not ALLOWLIST_PATH.exists():
        return []
    entries: list[tuple[str, int, bool]] = []
    group_has_reason = False
    for lineno, raw in enumerate(ALLOWLIST_PATH.read_text().splitlines(), 1):
        stripped = raw.strip()
        if not stripped:
            group_has_reason = False
            continue
        if stripped.startswith("#"):
            group_has_reason = True
            continue
        name = stripped.split("#", 1)[0].strip()
        if name:
            entries.append((name, lineno, group_has_reason))
    return entries


def allowlisted() -> set[str]:
    return {name for name, _, _ in allowlist_entries()}


def main() -> int:
    defined, allowed = defined_scripts(), allowlisted()
    rel_allowlist = ALLOWLIST_PATH.relative_to(REPO_ROOT)

    failures: list[str] = []
    for glob in DOC_GLOBS:
        for doc in sorted(REPO_ROOT.glob(glob)):
            for lineno, line in enumerate(doc.read_text().splitlines(), 1):
                for script in NPM_RUN.findall(line):
                    if script in defined or script in allowed:
                        continue
                    rel = doc.relative_to(REPO_ROOT)
                    failures.append(f"  {rel}:{lineno} — `npm run {script}`")

    allowlist_problems: list[str] = []
    for name, lineno, has_reason in allowlist_entries():
        if not has_reason:
            allowlist_problems.append(
                f"  {rel_allowlist}:{lineno} — `{name}` has no reason comment above it"
            )
        if name in defined:
            allowlist_problems.append(
                f"  {rel_allowlist}:{lineno} — `{name}` is now a real script in "
                f"package.json; remove this stale entry so a future regression "
                f"(the script getting removed again) isn't masked"
            )

    if failures or allowlist_problems:
        if failures:
            print("Docs reference npm scripts that no package.json defines:\n")
            print("\n".join(failures))
            print(
                f"\nEither add the script, correct the doc, or — if the doc is "
                f"deliberately describing future state — add the name to "
                f"{rel_allowlist} with a reason."
            )
        if allowlist_problems:
            if failures:
                print()
            print(f"Problems in {rel_allowlist}:\n")
            print("\n".join(allowlist_problems))
        return 1

    print(f"OK — every `npm run` in {', '.join(DOC_GLOBS)} resolves.")
    print(f"  {len(defined)} scripts defined, {len(allowed)} allowlisted as future state.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
