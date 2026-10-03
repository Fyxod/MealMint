#!/usr/bin/env python3
"""Read-only structural validator for a conventional project-memory directory."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
SECRET_NAME = re.compile(r"(?i)(token|password|passwd|api[_-]?key|secret|credential)")
CORE_CONVENTIONAL = (
    "README.md",
    "USER_DIRECTIVES.md",
    "CURRENT_STATE.md",
    "DECISION_LOG.md",
)
NEXT_CHECKPOINT_NAMES = ("NEXT_CHECKPOINT.md", "NEXT_RESEARCH_CHECKPOINT.md")


def validate(root: Path, strict: bool = False) -> dict[str, object]:
    root = root.resolve()
    errors: list[str] = []
    warnings: list[str] = []
    if not root.is_dir():
        return {"root": str(root), "ok": False, "errors": ["memory directory does not exist"], "warnings": []}

    markdown = sorted(path for path in root.rglob("*.md") if ".git" not in path.relative_to(root).parts)
    if not markdown:
        errors.append("no top-level Markdown memory files found")
    index = root / "README.md"
    if not index.is_file():
        (errors if strict else warnings).append("README.md index is missing")
    else:
        for document in markdown:
            text = document.read_text(encoding="utf-8")
            for target in LINK.findall(text):
                target = target.split("#", 1)[0].strip()
                if not target or "://" in target or target.startswith("/"):
                    continue
                candidate = (document.parent / target).resolve()
                try:
                    candidate.relative_to(root)
                except ValueError:
                    errors.append(f"link escapes memory root in {document.relative_to(root)}: {target}")
                    continue
                if not candidate.exists():
                    errors.append(f"broken link in {document.relative_to(root)}: {target}")

    for name in CORE_CONVENTIONAL[1:]:
        if not (root / name).is_file():
            (errors if strict else warnings).append(f"conventional file missing: {name}")
    if not any((root / name).is_file() for name in NEXT_CHECKPOINT_NAMES):
        names = " or ".join(NEXT_CHECKPOINT_NAMES)
        (errors if strict else warnings).append(f"conventional file missing: {names}")
    for path in root.rglob("*"):
        if path.is_file():
            relative = path.relative_to(root).as_posix()
            if ".git" in path.relative_to(root).parts:
                continue
            if SECRET_NAME.search(path.name):
                warnings.append(f"sensitive-looking filename; inspect manually: {relative}")
            if path.stat().st_size > 25 * 1024 * 1024:
                warnings.append(f"large memory file ({path.stat().st_size} bytes): {relative}")

    return {
        "root": str(root),
        "ok": not errors,
        "markdown_files": len(markdown),
        "errors": sorted(set(errors)),
        "warnings": sorted(set(warnings)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("memory_dir", type=Path)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    result = validate(args.memory_dir, strict=args.strict)
    print(json.dumps(result, indent=2, sort_keys=True))
    raise SystemExit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
