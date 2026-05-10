#!/usr/bin/env bash
set -euo pipefail
# Extract Playwright HTML report from CI artifact (pw-e2e-html-report.tar).
#
# The .tar is not created in your repo by default — download the workflow artifact
# "playwright-report" from GitHub Actions (it is a .zip containing pw-e2e-html-report.tar).
#
# Usage:
#   ./scripts/extract-pw-e2e-html-report.sh ~/Downloads/playwright-report.zip
#   ./scripts/extract-pw-e2e-html-report.sh /path/to/pw-e2e-html-report.tar
#
# Output: repo-root pw-report/index.html (pw-report/ is gitignored)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/pw-report"
ARCHIVE="${1:-}"

if [[ -z "$ARCHIVE" ]]; then
  echo "Usage: $0 <playwright-report.zip|pw-e2e-html-report.tar>" >&2
  echo "  1) Open the GitHub Actions run → Artifacts → download 'playwright-report'." >&2
  echo "  2) Pass the path to the downloaded .zip (or the .tar if you unpacked it)." >&2
  exit 1
fi

if [[ ! -f "$ARCHIVE" ]]; then
  echo "File not found: $ARCHIVE" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"

if [[ "$ARCHIVE" == *.zip ]]; then
  TMP="$(mktemp -d)"
  cleanup() { rm -rf "$TMP"; }
  trap cleanup EXIT
  unzip -q -o "$ARCHIVE" -d "$TMP"
  TAR="$(find "$TMP" -name 'pw-e2e-html-report.tar' -type f -print -quit || true)"
  if [[ -z "$TAR" ]]; then
    echo "No pw-e2e-html-report.tar inside zip. Files found:" >&2
    find "$TMP" -type f >&2
    exit 1
  fi
  tar -xf "$TAR" -C "$OUT"
else
  tar -xf "$ARCHIVE" -C "$OUT"
fi

trap - EXIT
echo "OK: $OUT/index.html"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$OUT/index.html" || true
elif command -v open >/dev/null 2>&1; then
  open "$OUT/index.html" || true
fi
