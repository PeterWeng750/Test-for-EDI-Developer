"""Consistent SQLite backup including committed WAL data. Run on the server."""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

data = Path(os.environ.get('DATA_DIR', './data'))
source = data / 'dashboard.sqlite3'
if not source.exists():
    raise SystemExit('No database found; start the app first.')
destination = data / 'backups' / ('harbor-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.sqlite3')
destination.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(source) as src, sqlite3.connect(destination) as dst:
    src.backup(dst)
print(destination)
