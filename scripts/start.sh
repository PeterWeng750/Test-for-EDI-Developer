#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/build_pages.py
exec python3 -m http.server "${PORT:-8000}" --bind 0.0.0.0 --directory dist
