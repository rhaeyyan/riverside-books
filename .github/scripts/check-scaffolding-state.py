#!/usr/bin/env python3
"""Fail if AGENTS.md's scaffolding-state table disagrees with the actual tree.

The sibling of check-doc-commands.py, for the opposite direction of drift. That
script catches a doc naming a script that does not exist. This one catches a doc
that has gone stale about what *does* exist: on 2026-08-20 Products A and B both
scaffolded apps and both added CI jobs, and AGENTS.md went on saying "only
product-c-app/ has a real Next.js app" for three days afterwards.

That is worse than an ordinary stale line. AGENTS.md is the file `tech-lead` is
instructed to ingest before writing any [SPEC], and its own process says "don't
re-derive a decision that's already recorded in one of them." A tech-lead
session scoped to Product A that reads a line saying Product A has no app will
route Phase 1 work through builder's bootstrap exception instead of a [SPEC].

Two checks, both fully mechanical:

1. Every scaffolded app (a product-*-app/ with a package.json) has at least one
   job in ci.yml, and every app a ci.yml job references actually exists. This is
   the one the Commands section's "add your own CI job" instruction relies on a
   human remembering.
2. The table between the scaffolding-state markers in AGENTS.md matches what 1
   found. On a mismatch the expected table is printed, so the fix is a paste.

Deliberately narrow, in the same spirit as check-doc-commands.py: it checks the
marked table, not the surrounding prose. A paragraph elsewhere in AGENTS.md can
still go stale about a product's *phase* or its docs, and no name-matching
check would find that. What it does guarantee is that the one machine-checkable
fact — which apps exist and which job builds them — cannot drift again.

Stdlib only, and ci.yml is line-scanned rather than parsed with PyYAML: the
`docs` job runs on the runner's system python3 with no setup-python step and no
pip install, so a third-party import would be a new dependency for a check whose
whole point is not needing one.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = REPO_ROOT / ".github/workflows/ci.yml"
AGENTS = REPO_ROOT / "AGENTS.md"

START = "<!-- scaffolding-state:start -->"
END = "<!-- scaffolding-state:end -->"

# A job key sits at exactly two spaces of indent under `jobs:`.
JOB_KEY = re.compile(r"^  ([A-Za-z][\w-]*):\s*$")
# Both are how a job names the app it operates on.
APP_REF = re.compile(r"(?:working-directory|cache-dependency-path):\s*(product-[a-z]-app)")

PRODUCTS = ("a", "b", "c", "d")


def scaffolded_apps() -> set[str]:
    """Every product-*-app/ that holds a package.json."""
    return {
        pkg.parent.name
        for pkg in REPO_ROOT.glob("product-*-app/package.json")
        if "node_modules" not in pkg.parts
    }


def jobs_by_app() -> dict[str, set[str]]:
    """Map each app directory to the ci.yml job names that reference it."""
    mapping: dict[str, set[str]] = {}
    current: str | None = None
    in_jobs = False
    for line in WORKFLOW.read_text().splitlines():
        if line.startswith("jobs:"):
            in_jobs = True
            continue
        if not in_jobs:
            continue
        key = JOB_KEY.match(line)
        if key:
            current = key.group(1)
            continue
        ref = APP_REF.search(line)
        if ref and current:
            mapping.setdefault(ref.group(1), set()).add(current)
    return mapping


def expected_table(apps: set[str], mapping: dict[str, set[str]]) -> str:
    """Render the table the markers in AGENTS.md must contain."""
    rows = [
        "| Product | App directory | CI job | Scaffolded |",
        "| --- | --- | --- | --- |",
    ]
    for letter in PRODUCTS:
        app = f"product-{letter}-app"
        if app in apps:
            jobs = ", ".join(f"`{j}`" for j in sorted(mapping.get(app, ()))) or "**none**"
            rows.append(f"| {letter.upper()} | `{app}/` | {jobs} | yes |")
        else:
            rows.append(f"| {letter.upper()} | — | — | no |")
    return "\n".join(rows)


def table_in_agents() -> str | None:
    """The current contents between the markers, or None if absent."""
    text = AGENTS.read_text()
    if START not in text or END not in text:
        return None
    return text.split(START, 1)[1].split(END, 1)[0].strip()


def main() -> int:
    apps, mapping = scaffolded_apps(), jobs_by_app()
    problems: list[str] = []

    # 1. Every scaffolded app has a job; every job's app exists.
    for app in sorted(apps):
        if app not in mapping:
            problems.append(
                f"  {app}/ has a package.json but no job in "
                f".github/workflows/ci.yml references it. Add one following an "
                f"existing product job as the template."
            )
    for app in sorted(mapping):
        if app not in apps:
            problems.append(
                f"  .github/workflows/ci.yml has a job for {app}/ "
                f"({', '.join(sorted(mapping[app]))}) but that directory has no "
                f"package.json. Remove the job or restore the app."
            )

    # 2. The marked table matches.
    expected = expected_table(apps, mapping)
    actual = table_in_agents()
    if actual is None:
        problems.append(
            f"  AGENTS.md is missing the {START} / {END} markers around its "
            f"scaffolding-state table."
        )
    elif actual != expected:
        problems.append("  AGENTS.md's scaffolding-state table is out of date.")

    if problems:
        print("Scaffolding state has drifted:\n")
        print("\n\n".join(problems))
        if actual is None or actual != expected:
            print(f"\nExpected between the markers in AGENTS.md:\n\n{expected}")
        return 1

    print(f"OK — {len(apps)} scaffolded app(s), each with a CI job, and AGENTS.md agrees.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
