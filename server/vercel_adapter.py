"""The report server on Vercel: its API as Vercel Functions (api/*.py); Vercel serves the app's own files.

Each file in api/ defines `handler`, a subclass of Handler below with its route and its own App:
  api/health.py                        GET  /api/health
  api/report-submissions.py            POST /api/report-submissions
  api/report-submissions/verify.py     POST /api/report-submissions/verify

What differs from running server/app_server.py:
  - Only the API is answered here. The app's files (index.html, css/, js/, assets/) are published by vercel.json's build
    step; nothing else in the project (server/, docs/, tests/) is.
  - The disk is temporary: the submissions ledger lives in /tmp and can be lost between requests. The database decides
    then, as it already does when the ledger is gone (the table's primary key; the lookup in verify).
  - The receipt key cannot be kept on disk, so REPORT_RECEIPT_SECRET must be set. Without it the report form reports
    itself not connected, rather than signing receipts that a later request could not check.
  - The client for the rate limit is Vercel's x-real-ip (set by Vercel, not by the browser), and same-site requests
    may arrive with Vercel's x-forwarded-host. Both are trusted only when Vercel says it runs the code (VERCEL=1). Rate
    limits are kept per running instance.
Configuration: the Vercel project's Environment Variables (see server/.env.example). No .env file is read.
"""

import os
import sys

if os.environ.get('VERCEL'):
    os.environ.setdefault('REPORT_DATA_DIR', '/tmp/acoustic-report')  # the only writable place on Vercel

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app_server  # noqa: E402


def on_vercel():  # read per request, so the tests can switch it
    return bool(os.environ.get('VERCEL'))


def make_app():
    app = app_server.App()
    if not os.environ.get('REPORT_RECEIPT_SECRET', '').strip():
        app.db, app.config_problem = None, 'missing REPORT_RECEIPT_SECRET (the hosting keeps no files, so the receipt key must be set)'
    if app.db:
        app_server.log(f'Report form -> Supabase table {app.db.table}')
    else:
        app_server.log(f'Report form: NOT CONFIGURED ({app.config_problem}). Submissions fail and reports stay locked.')
    return app


class Handler(app_server.Handler):
    route = None  # the path this function answers; None: the path asked for

    def request_path(self):
        return self.route or super().request_path()

    def client_key(self):
        if on_vercel():
            ip = (self.headers.get('x-real-ip') or (self.headers.get('x-forwarded-for') or '').split(',')[0]).strip()
            if ip:
                return ip
        return super().client_key()

    def same_origins(self):
        own = super().same_origins()
        fwd = (self.headers.get('x-forwarded-host') or '').strip() if on_vercel() else ''
        return own | ({f'https://{fwd}'} if fwd else set())

    def do_GET(self):
        # The app's files are Vercel's to serve; a function only answers its API route.
        if self.request_path() == '/api/health':
            return super().do_GET()
        return self._send(404, {'error': 'not_found'})
