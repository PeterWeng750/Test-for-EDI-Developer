"""Targeted browser regression: copied Data API URL becomes the project origin.

This verifies input normalization and RPC URL assembly using test responses;
it does not validate a hosted Supabase account or database.
"""
import functools
import json
import os
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, 'scripts/build_pages.py'], cwd=ROOT, check=True)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


handler = functools.partial(QuietHandler, directory=ROOT/'dist')
server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    with sync_playwright() as p:
        options = {'headless': True, 'args': ['--no-sandbox']}
        if os.environ.get('CHROMIUM_PATH'):
            options['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = p.chromium.launch(**options)
        page = browser.new_page()
        requested = []
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def mock_rpc(route):
            requested.append(route.request.url)
            if route.request.url.endswith('/harbor_create_workspace'):
                response = {'ok': True, 'schema_version': 1}
            elif route.request.url.endswith('/harbor_snapshot'):
                response = {'records': [], 'batches': [], 'revision': 0, 'schema_version': 1}
            else:
                raise AssertionError('Unexpected RPC URL')
            route.fulfill(status=200, content_type='application/json', body=json.dumps(response))

        page.route('https://url-test.supabase.co/**', mock_rpc)
        page.goto(f'http://127.0.0.1:{server.server_port}/', wait_until='networkidle')
        page.locator('#supabase-url').fill('https://url-test.supabase.co/rest/v1/')
        page.locator('#supabase-key').fill('sb_publishable_test_key_for_browser_only')
        page.locator('#connect-submit').click()
        expect(page.locator('#connection-badge')).to_have_text('ข้อมูลร่วมกัน · Supabase Free')
        expect(page.locator('#supabase-url')).to_have_value('https://url-test.supabase.co')
        assert requested and all('/rest/v1/rpc/' in url and '/rest/v1/rest/v1/' not in url for url in requested)
        assert not errors, errors
        browser.close()
        print('PASS: copied /rest/v1/ URL normalizes to project origin; RPC paths are correct; no JavaScript errors. Test responses only.')
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
