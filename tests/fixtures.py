"""Synthetic fixtures only; never distribute customer workbooks."""
import io
from datetime import datetime, timedelta
from openpyxl import Workbook
from app.importer import FIELDS


def sample_rows(count=12):
    rows = []
    base = datetime(2026, 10, 1)
    for i in range(count):
        day = base + timedelta(days=i % 9)
        rows.append({
            'job': f'DEMO-{i//2+1:04d}', 'eta': day, 'ata': day,
            'invoice': f'INV-{i//2+1:04d}', 'origin': ['Singapore', 'Shanghai', 'Laem Chabang'][i//2 % 3],
            'port': 'Terminal A', 'carrier': ['Ocean Line', 'Pacific Cargo', 'Blue Shipping'][i//2 % 3],
            'container': f'DEMO{i+1:07d}', 'container_count': 1, 'seal': f'SEAL{i+1:04d}',
            'size': '40H', 'cartons': 1200 + (i//2)*100, 'cbm': 64.5+(i//2)*5,
            'file_date': 20261015, 'do_release': day,
            'received': '2026-09-25 09:00:00 2026-09-27 14:30:00',
            'issue': 'Document revised' if i%3==0 else '', 'complete': day,
            'declaration_status': 409, 'customs': day + timedelta(days=2),
            'plan': day+timedelta(days=3), 'release': day+timedelta(days=2),
            'delivered': day+timedelta(days=3+(i%2)) if i%3 else None, 'place':'Demo Warehouse',
        })
    return rows


def workbook(rows=None, extra_headers=None):
    wb=Workbook()
    ws=wb.active
    ws.title='Import data'
    fields=FIELDS + (extra_headers or [])
    ws.append([label for _,label in fields])
    for row in sample_rows() if rows is None else rows:
        ws.append([row.get(k) for k,_ in fields])
    stream=io.BytesIO()
    wb.save(stream)
    return stream.getvalue()
