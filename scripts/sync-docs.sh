#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${ACTA_DOCS_SOURCE:-$ROOT/../docs/external}"
DESTINATION="$ROOT/docs-site"

if [[ ! -d "$SOURCE" ]]; then
  echo "Docs source not found: $SOURCE" >&2
  echo "Set ACTA_DOCS_SOURCE to the docs/external directory." >&2
  exit 1
fi

if [[ "${1:-}" == "--check" ]]; then
  if diff -rq --exclude=SUMMARY.md "$SOURCE" "$DESTINATION" >/dev/null; then
    echo "docs-site is in sync with $SOURCE"
  else
    echo "DRIFT: docs-site differs from $SOURCE" >&2
    diff -rq --exclude=SUMMARY.md "$SOURCE" "$DESTINATION" >&2 || true
    exit 1
  fi
else
  rsync -a --delete --exclude=SUMMARY.md "$SOURCE/" "$DESTINATION/"
  echo "Synced $SOURCE -> $DESTINATION"
fi
