"""Generate an optional synthetic demo workbook. No customer data."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tests.fixtures import workbook, sample_rows

path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/tmp/harbor-demo.xlsx')
if path.exists():
    raise SystemExit(f'Refusing to overwrite {path}')
path.write_bytes(workbook(sample_rows(100)))
print(path)
