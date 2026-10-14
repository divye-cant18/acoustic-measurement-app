"""A local stand-in for Supabase's REST API (PostgREST) for one table (development only; the app never uses it).

It behaves like the parts of Supabase the report server calls: it checks the apikey, refuses the publishable key as the
table's privileges do, knows the table's columns (from js/data/report-form.js), enforces the primary key on
submission_id and the NOT NULL / consent checks of server/supabase/schema.sql, honours on_conflict with
resolution=ignore-duplicates, and returns timestamps as Postgres does (+00:00). Faults can be queued to test lost
answers, timeouts and refusals.

    python tests/fake_supabase.py --port 8791
prints the environment for server/app_server.py. Used by tests/report_submission_test.py. Run this way it also takes
POST /_fault {"op": "insert" | "any", "mode": "drop_after_write" | "http_500_no_write" | ...} and GET /_rows.
"""

import argparse
import json
import os
import re
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import submissions  # noqa: E402

SECRET_KEY = 'sb_secret_fake_0123456789abcdefghijklmnop'
PUBLISHABLE_KEY = 'sb_publishable_fake_0123456789abcdefghij'
TABLE = 'report_submissions'
NOT_NULL = {'submission_id', 'submitted_at', 'full_name', 'email', 'profession_role', 'country', 'purpose', 'consent_given',
            'consent_recorded_at', 'marketing_consent', 'project_id', 'treatment_status'}


def pg_time(value):
    return value.replace('Z', '+00:00') if isinstance(value, str) and value.endswith('Z') else value


class FakeSupabase:
    def __init__(self, table=True, without=()):
        # without: columns the table does not have (a table made with an older schema.sql)
        self.columns = [c for c in submissions.columns(submissions.load_spec()) if c not in without]
        self.rows = [] if table else None
        self.lock = threading.Lock()
        self.faults = []
        self.requests = []
        self.httpd = None

    def fault(self, op, mode):
        with self.lock:
            self.faults.append((op, mode))

    def take_fault(self, op):
        with self.lock:
            for i, (o, m) in enumerate(self.faults):
                if o == op:
                    del self.faults[i]
                    return m
        return None

    def start(self, port=0):
        fake = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def reply(self, status, obj):
                data = json.dumps(obj).encode('utf-8')
                self.send_response(status)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def pg_error(self, status, code, message):
                self.reply(status, {'code': code, 'details': None, 'hint': None, 'message': message})

            def route(self, method):
                u = urllib.parse.urlsplit(self.path)
                q = dict(urllib.parse.parse_qsl(u.query))
                n = int(self.headers.get('Content-Length') or 0)
                raw = self.rfile.read(n) if n else b''
                fake.requests.append((method, u.path, q, {k.lower(): v for k, v in self.headers.items()}))
                if u.path == '/_fault' and method == 'POST':
                    f = json.loads(raw)
                    fake.fault(f['op'], f['mode'])
                    return self.reply(200, {'queued': [f['op'], f['mode']]})
                if u.path == '/_rows' and method == 'GET':
                    return self.reply(200, fake.rows or [])
                key = self.headers.get('apikey')
                if key == PUBLISHABLE_KEY:  # the anon role: privileges revoked by schema.sql
                    return self.pg_error(401, '42501', f'permission denied for table {TABLE}')
                if key != SECRET_KEY or fake.take_fault('any') == 'http_401':
                    return self.reply(401, {'message': 'Invalid API key', 'hint': 'Double check your Supabase `anon` or `service_role` API key.'})
                if self.headers.get('Authorization'):  # the new secret keys go in apikey only
                    return self.reply(401, {'message': 'Invalid JWT'})
                m = re.match(r'^/rest/v1/([A-Za-z0-9_]+)$', u.path)
                if not m:
                    return self.pg_error(404, 'PGRST125', 'Invalid path specified in request URL')
                if m.group(1) != TABLE or fake.rows is None:
                    return self.pg_error(404, 'PGRST205', f"Could not find the table 'public.{m.group(1)}' in the schema cache")
                if method == 'GET':
                    cols = q.get('select', '*').split(',')
                    bad = [c for c in cols if c != '*' and c not in fake.columns]
                    if bad:
                        return self.pg_error(400, '42703', f'column {TABLE}.{bad[0]} does not exist')
                    rows = list(fake.rows)
                    if 'submission_id' in q:
                        want = q['submission_id'].removeprefix('eq.')
                        rows = [r for r in rows if r['submission_id'] == want]
                    limit = int(q.get('limit', len(rows)))
                    out = [{c: r.get(c) for c in (fake.columns if cols == ['*'] else cols)} for r in rows[:limit]]
                    return self.reply(200, out)
                if method == 'POST':
                    body = json.loads(raw)
                    rec = body[0] if isinstance(body, list) else body
                    extra = [c for c in rec if c not in fake.columns]
                    if extra:
                        return self.pg_error(400, 'PGRST204', f"Could not find the '{extra[0]}' column of '{TABLE}' in the schema cache")
                    missing = [c for c in NOT_NULL if rec.get(c) is None]
                    if missing:
                        return self.pg_error(400, '23502', f'null value in column "{missing[0]}" violates not-null constraint')
                    if rec.get('consent_given') is not True:
                        return self.pg_error(400, '23514', 'new row violates check constraint "report_submissions_consent_given_check"')
                    prefer = self.headers.get('Prefer', '')
                    mode = fake.take_fault('insert')
                    if mode == 'http_500_no_write':
                        return self.pg_error(500, 'XX000', 'internal error')
                    if mode == 'timeout_before_write':
                        time.sleep(float(os.environ.get('FAKE_TIMEOUT_SLEEP', '4')))
                        return self.pg_error(503, 'PGRST000', 'Could not connect to the database')
                    row = {c: pg_time(rec.get(c)) if c in ('submitted_at', 'consent_recorded_at') else rec.get(c) for c in fake.columns}
                    with fake.lock:
                        exists = any(r['submission_id'] == row['submission_id'] for r in fake.rows)
                        if exists and not ('resolution=ignore-duplicates' in prefer and q.get('on_conflict') == 'submission_id'):
                            return self.pg_error(409, '23505', 'duplicate key value violates unique constraint "report_submissions_pkey"')
                        if not exists:
                            fake.rows.append(row)
                    if mode == 'drop_after_write':
                        self.close_connection = True
                        self.connection.close()
                        return
                    if mode == 'timeout_after_write':
                        time.sleep(float(os.environ.get('FAKE_TIMEOUT_SLEEP', '4')))
                    if mode == 'http_500_after_write':
                        return self.pg_error(500, 'XX000', 'internal error')
                    if mode == 'wrong_answer':
                        return self.reply(201, [dict(row, submission_id='00000000-0000-0000-0000-000000000000')])
                    if mode == 'not_json_after_write':  # a 2xx answer that is not JSON (a proxy's page)
                        data = b'<html>OK</html>'
                        self.send_response(201)
                        self.send_header('Content-Type', 'text/html')
                        self.send_header('Content-Length', str(len(data)))
                        self.end_headers()
                        self.wfile.write(data)
                        return
                    if mode == 'incomplete_after_write':  # the answer breaks off: fewer bytes than announced
                        self.send_response(201)
                        self.send_header('Content-Type', 'application/json')
                        self.send_header('Content-Length', '500')
                        self.end_headers()
                        self.wfile.write(b'[{"submission_id"')
                        self.close_connection = True
                        self.connection.close()
                        return
                    if 'return=representation' not in prefer:
                        self.send_response(201)
                        self.send_header('Content-Length', '0')
                        self.end_headers()
                        return
                    return self.reply(201, [] if exists else [row])
                return self.pg_error(405, 'PGRST117', 'Unsupported HTTP method')

            def do_GET(self):
                self.route('GET')

            def do_POST(self):
                self.route('POST')

        self.httpd = ThreadingHTTPServer(('127.0.0.1', port), H)
        self.httpd.daemon_threads = True
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        return self.httpd.server_address[1]

    def stop(self):
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8791)
    args = ap.parse_args()
    fake = FakeSupabase()
    fake.start(args.port)
    print('Fake Supabase running. Environment for server/app_server.py:', flush=True)
    print(f'SUPABASE_URL=http://127.0.0.1:{args.port}', flush=True)
    print(f'SUPABASE_SECRET_KEY={SECRET_KEY}', flush=True)
    print(f'SUPABASE_PUBLISHABLE_KEY={PUBLISHABLE_KEY}', flush=True)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        fake.stop()


if __name__ == '__main__':
    main()
