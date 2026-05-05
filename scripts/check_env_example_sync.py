#!/usr/bin/env python3
"""Report drift between env keys used in code and keys documented in each .env.example.

Scans:
  - frontend: process.env.<NAME> and process.env['NAME'] under frontend/ (excl. node_modules, .next)
  - backend: os.getenv / os.environ[...] under backend/app and backend/tests/conftest.py
  - aiService: os.getenv / os.environ[...] under aiService/app

Exit code: 0 if every code-referenced key (minus allowlists) appears in the service .env.example;
          1 otherwise. Informational sections list example-only keys and allowlisted runtime keys.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

PROCESS_ENV_DOT = re.compile(r"process\.env\.([A-Z][A-Z0-9_]*)")
PROCESS_ENV_BRACKET = re.compile(
    r"process\.env\[\s*['\"]([A-Z][A-Z0-9_]*)['\"]\s*\]"
)
OS_GETENV = re.compile(
    r"os\.getenv\s*\(\s*\n?\s*['\"]([A-Z][A-Z0-9_]*)['\"]", re.MULTILINE
)
OS_ENVIRON_SUBSCRIPT = re.compile(
    r"os\.environ\[\s*['\"]([A-Z][A-Z0-9_]*)['\"]\s*\]"
)

# Set by the runtime / platform; not expected in .env.example.
ALLOW_CODE_NOT_IN_EXAMPLE: dict[str, frozenset[str]] = {
    "frontend": frozenset(
        {
            "NODE_ENV",
            "NEXT_RUNTIME",
            "VITEST",
        }
    ),
    "backend": frozenset(),
    "aiService": frozenset(),
}

# Documented for Docker / Pydantic field binding but not matched by naive os.getenv scan.
ALLOW_EXAMPLE_ONLY: dict[str, frozenset[str]] = {
    "backend": frozenset(
        {
            "POSTGRES_USER",
            "POSTGRES_PASSWORD",
            "POSTGRES_DB",
            # Populated via pydantic-settings from env (no os.getenv in app/config.py).
            "SMTP_USER",
            "SMTP_PASSWORD",
            "SMTP_HOST",
            "SMTP_PORT",
            "OTP_EMAIL_TTL_SECONDS",
            "VERIFY_2FA_MAX_FAILS",
            "VERIFY_2FA_LOCKOUT_SECONDS",
        }
    ),
    "frontend": frozenset(),
    # Settings fields bind from env without os.getenv() in config.py.
    "aiService": frozenset({"AI_SERVICE_API_KEY", "REDIS_URL"}),
}

# process.env[key] ile okunur (fileLimits.ts, next.config.ts).
FRONTEND_DYNAMIC_ENV_KEYS = frozenset(
    {
        "NEXT_PUBLIC_MAX_FILE_SIZE_GUEST_MB",
        "MAX_FILE_SIZE_GUEST_MB",
        "NEXT_PUBLIC_MAX_FILE_SIZE_USER_MB",
        "MAX_FILE_SIZE_USER_MB",
        "FRONTEND_MAX_UPLOAD_MB",
    }
)


def parse_env_example(path: Path) -> set[str]:
    keys: set[str] = set()
    if not path.is_file():
        return keys
    raw = path.read_text(encoding="utf-8")
    for line in raw.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        m = re.match(r"^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=", s)
        if m:
            keys.add(m.group(1))
    return keys


def _skip_path(path: Path, skip_dir_names: frozenset[str]) -> bool:
    return any(part in skip_dir_names for part in path.parts)


def collect_ts_env_keys(root: Path) -> set[str]:
    keys: set[str] = set()
    skip = frozenset({"node_modules", ".next", "dist", "coverage"})
    for path in root.rglob("*"):
        if not path.is_file() or _skip_path(path, skip):
            continue
        if path.suffix not in {".ts", ".tsx", ".mjs"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        keys.update(PROCESS_ENV_DOT.findall(text))
        keys.update(PROCESS_ENV_BRACKET.findall(text))
    return keys


def collect_py_env_keys(paths: list[Path]) -> set[str]:
    keys: set[str] = set()
    for base in paths:
        if base.is_file():
            candidates = [base]
        else:
            candidates = [p for p in base.rglob("*.py") if "__pycache__" not in p.parts]
        for path in candidates:
            text = path.read_text(encoding="utf-8", errors="replace")
            keys.update(OS_GETENV.findall(text))
            keys.update(OS_ENVIRON_SUBSCRIPT.findall(text))
    return keys


def report_service(name: str, code_keys: set[str], example_keys: set[str]) -> list[str]:
    lines: list[str] = []
    allow_miss = ALLOW_CODE_NOT_IN_EXAMPLE.get(name, frozenset())
    allow_extra = ALLOW_EXAMPLE_ONLY.get(name, frozenset())

    missing = sorted((code_keys - example_keys) - allow_miss)
    extra = sorted((example_keys - code_keys) - allow_extra)
    ignored = sorted((code_keys - example_keys) & allow_miss)

    lines.append(f"=== {name} ===")
    lines.append(f"  Keys in code (scan): {len(code_keys)}")
    lines.append(f"  Keys in .env.example: {len(example_keys)}")
    if missing:
        lines.append("  MISSING from .env.example (used in code):")
        for k in missing:
            lines.append(f"    - {k}")
    else:
        lines.append("  MISSING from .env.example: (none)")
    if ignored:
        lines.append("  Allowlisted runtime / tooling (not required in .env.example):")
        for k in ignored:
            lines.append(f"    - {k}")
    if extra:
        lines.append(
            "  In .env.example but not in scan (docs, Docker, pydantic, or dynamic):"
        )
        for k in extra:
            lines.append(f"    - {k}")
    else:
        lines.append(
            "  In .env.example but not in scan: (none beyond allowlist)"
        )

    if name == "frontend":
        lines.append(
            "  Note: e2e/support/helpers.ts may read E2E_OTP_CODE_<normalized_email> (dynamic)."
        )

    lines.append("")
    return lines


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat 'example-only' keys as failures (default: informational only).",
    )
    args = parser.parse_args()

    services = [
        (
            "frontend",
            REPO_ROOT / "frontend",
            collect_ts_env_keys(REPO_ROOT / "frontend") | FRONTEND_DYNAMIC_ENV_KEYS,
            parse_env_example(REPO_ROOT / "frontend" / ".env.example"),
        ),
        (
            "backend",
            REPO_ROOT / "backend",
            collect_py_env_keys(
                [REPO_ROOT / "backend" / "app", REPO_ROOT / "backend" / "tests" / "conftest.py"]
            ),
            parse_env_example(REPO_ROOT / "backend" / ".env.example"),
        ),
        (
            "aiService",
            REPO_ROOT / "aiService",
            collect_py_env_keys([REPO_ROOT / "aiService" / "app"]),
            parse_env_example(REPO_ROOT / "aiService" / ".env.example"),
        ),
    ]

    all_ok = True
    out: list[str] = ["NeuroPDF — .env.example sync report\n"]

    for name, _root, code_keys, example_keys in services:
        out.extend(report_service(name, code_keys, example_keys))
        allow_miss = ALLOW_CODE_NOT_IN_EXAMPLE.get(name, frozenset())
        missing = (code_keys - example_keys) - allow_miss
        if missing:
            all_ok = False
        if args.strict:
            allow_extra = ALLOW_EXAMPLE_ONLY.get(name, frozenset())
            extra = (example_keys - code_keys) - allow_extra
            if extra:
                all_ok = False

    print("\n".join(out).rstrip())

    if all_ok:
        print("\nRESULT: OK (all scanned code keys are documented in .env.example).")
        return 0
    print("\nRESULT: REVIEW NEEDED (see MISSING lines above).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
