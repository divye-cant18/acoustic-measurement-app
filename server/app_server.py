"""Acoustic Measurement app server: serves the app and receives the report form, which it stores in Supabase.

    python server/app_server.py           serve the app on http://127.0.0.1:8780 (open that address)
    python server/app_server.py --check   check the Supabase configuration, the key and the table; changes nothing

Configuration: environment variables, or server/.env (see server/.env.example). Real environment variables win.
The table is created once with server/supabase/schema.sql (Supabase dashboard > SQL Editor).
Python standard library only; nothing to install.

Endpoints
  GET  /api/health                      {"ok": true, "store": "configured" | "not_configured"}
  POST /api/report-submissions          {"submissionId", "form", "project"} -> one table row per submission ID
  POST /api/report-submissions/verify   {"submissionId", "projectId", "submittedAt", "receipt"} -> {"verified": bool}

Only the app's own files are served (index.html, css/, js/, assets/, tests/). This folder (server/), its data and its
configuration are never served.
"""

import argparse
import base64
import json
import os
import posixpath
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.dont_write_bytecode = True  # no __pycache__ folders in the project
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import submissions as subs  # noqa: E402
from supabase_client import DbDefinite, DbError, DbUncertain, SupabaseClient  # noqa: E402

ROOT = subs.ROOT
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
SERVED = {'index.html', 'css', 'js', 'assets', 'tests'}
TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
}
MAX_BODY = 16 * 1024

# What the browser is told. Details stay in this server's console.
MESSAGES = {
    'not_configured': 'The report form is not connected to its database yet.',
    'db_auth': 'The report server could not sign in to its database.',
    'db_permission': 'The database refused the submission.',
    'db_table_missing': 'The database table for the report form is missing.',
    'db_request': 'The database rejected the submission.',
    'db_duplicate': 'The database already holds this submission.',
    'db_rate_limited': 'The database is busy. Try again in a minute.',
    'db_unreachable': 'The database could not be reached from the report server.',
    'db_unavailable': 'The database did not confirm the submission.',
    'db_timeout': 'The database did not answer in time.',
    'db_unexpected': 'The database gave an unexpected answer.',
    'db_mismatch': 'The stored submission belongs to another project.',
}


def load_env(path):
    """KEY=VALUE lines; # comments; optional quotes. Real environment variables are not overwritten."""
    if not path or not os.path.exists(path):
        return False
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            k, v = k.strip(), v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
                v = v[1:-1]
            os.environ.setdefault(k, v)
    return True


class App:
    def __init__(self):
        self.spec = subs.load_spec()
        self.columns = subs.columns(self.spec)
        data_dir = os.environ.get('REPORT_DATA_DIR') or os.path.join(SERVER_DIR, 'data')
        self.ledger = subs.Ledger(os.path.join(data_dir, 'submissions-ledger.json'))
        self.receipts = subs.Receipts(os.path.join(data_dir, 'receipt-secret.key'), os.environ.get('REPORT_RECEIPT_SECRET') or None)
        # submissions per client: "count/seconds" pairs, e.g. 5 a minute and 30 an hour
        limits = os.environ.get('REPORT_SUBMIT_LIMITS') or '5/60,30/3600'
        self.submit_limit = subs.RateLimiter([tuple(int(x) for x in pair.split('/')) for pair in limits.split(',')])
        self.verify_limit = subs.RateLimiter([(60, 60)])
        self.extra_origins = {o.strip().rstrip('/') for o in os.environ.get('REPORT_ALLOWED_ORIGINS', '').split(',') if o.strip()}
        self.db, self.config_problem = self._db()

    def _db(self):
        url = os.environ.get('SUPABASE_URL', '').strip()
        key = os.environ.get('SUPABASE_SECRET_KEY', '').strip()
        table = os.environ.get('SUPABASE_TABLE', '').strip() or 'report_submissions'
        missing = [n for n, v in (('SUPABASE_URL', url), ('SUPABASE_SECRET_KEY', key)) if not v]
        if missing:
            return None, f'missing {", ".join(missing)}'
        if key.startswith('sb_publishable_'):
            return None, 'SUPABASE_SECRET_KEY holds the publishable key; the server needs the secret key (sb_secret_...)'
        if key.startswith('eyJ') and key.count('.') == 2:  # a legacy key: its role is inside
            try:
                role = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==')).get('role')
            except (ValueError, TypeError):
                role = None
            if role and role != 'service_role':
                return None, f'SUPABASE_SECRET_KEY is the legacy {role} key; the server needs the secret (service_role) key'
        try:
            client = SupabaseClient(url, key, table, timeout=float(os.environ.get('SUPABASE_HTTP_TIMEOUT') or 15))
        except ValueError as e:
            return None, str(e)
        return client, None

    # ---------- submission ----------

    def success(self, rec, sid):
        return 200, {'status': 'success', 'submissionId': sid, 'projectId': rec['projectId'], 'submittedAt': rec['submittedAt'],
                     'receipt': self.receipts.sign(sid, rec['projectId'], rec['submittedAt'])}

    def submit(self, body):
        try:
            sid, form, project = subs.validate(self.spec, body)
        except subs.Invalid as e:
            return 400, {'status': 'invalid', 'errors': e.errors}
        digest = subs.content_hash(sid, form, project)
        with self.ledger.id_lock(sid):
            rec = self.ledger.get(sid)
            if rec and rec.get('hash') != digest:
                return 409, {'status': 'failed', 'reason': 'conflict', 'message': 'This submission ID was already used for different details.'}
            if rec and rec.get('status') == 'success':
                return self.success(rec, sid)  # a repeat of a submission that was already stored: no new row
            if not self.db:
                return 503, {'status': 'failed', 'reason': 'not_configured', 'message': MESSAGES['not_configured']}
            pid = project['projectId']
            try:
                if rec and rec.get('status') in ('pending', 'uncertain'):
                    # An earlier attempt may have been stored although its answer was lost: look before inserting again.
                    row = self.db.find(sid)
                    if row:
                        return self.stored(sid, row, pid, digest, 'found on retry')
                timestamp = subs.utc_now()
                record = subs.build_record(self.spec, sid, form, project, timestamp)
                self.ledger.put(sid, status='pending', hash=digest, projectId=pid, submittedAt=timestamp)
                outcome = self.db.insert(record)
                if outcome == 'exists':  # the database already holds this submission ID: nothing new was written
                    row = self.db.find(sid)
                    if not row:
                        raise DbUncertain('db_unexpected', 'Insert reported an existing row that cannot be found')
                    return self.stored(sid, row, pid, digest, 'already in the table')
            except DbUncertain as e:
                self.ledger.put(sid, status='uncertain', hash=digest, projectId=pid, reason=e.code)
                log(f'Submission {sid}: outcome uncertain: {e}')
                return 504, {'status': 'uncertain', 'reason': e.code, 'message': MESSAGES.get(e.code, 'The submission was not confirmed.')}
            except DbDefinite as e:
                if rec or self.ledger.get(sid):
                    self.ledger.put(sid, status='failed', hash=digest, projectId=pid, reason=e.code)
                log(f'Submission {sid}: failed: {e}')
                return 502, {'status': 'failed', 'reason': e.code, 'message': MESSAGES.get(e.code, 'The submission failed.')}
            rec = self.ledger.put(sid, status='success')
            log(f'Submission {sid}: stored in {self.db.table}')
            return self.success(rec, sid)

    def stored(self, sid, row, pid, digest, how):
        """A row for this submission ID is already in the table: success if it is this project's, without a new row."""
        if row.get('project_id') != pid:
            self.ledger.put(sid, status='failed', hash=digest, projectId=pid, reason='db_mismatch')
            log(f'Submission {sid}: the stored row belongs to project {row.get("project_id")!r}, not {pid!r}')
            return 409, {'status': 'failed', 'reason': 'conflict', 'message': MESSAGES['db_mismatch']}
        at = subs.normalise_time(row.get('submitted_at')) or subs.utc_now()
        rec = self.ledger.put(sid, status='success', hash=digest, projectId=pid, submittedAt=at, resolved=how)
        log(f'Submission {sid}: {how}; not inserted again')
        return self.success(rec, sid)

    def verify(self, body):
        if not isinstance(body, dict):
            return 400, {'verified': False, 'reason': 'invalid'}
        sid, pid, at, receipt = (body.get(k) for k in ('submissionId', 'projectId', 'submittedAt', 'receipt'))
        if not self.receipts.valid(sid, pid, at, receipt):
            return 200, {'verified': False, 'reason': 'invalid_receipt'}
        rec = self.ledger.get(sid)
        if rec and rec.get('status') == 'success' and rec.get('projectId') == pid and rec.get('submittedAt') == at:
            return 200, {'verified': True, 'submittedAt': at}
        if rec and rec.get('status') == 'success':
            return 200, {'verified': False, 'reason': 'mismatch'}
        # A signed receipt this server's ledger no longer lists (data folder cleared): the database decides.
        if not self.db:
            return 503, {'verified': False, 'reason': 'not_configured'}
        try:
            row = self.db.find(sid)
        except DbError as e:
            log(f'Verify {sid}: {e}')
            return 503, {'verified': False, 'reason': 'unavailable'}
        if not row or row.get('project_id') != pid or subs.normalise_time(row.get('submitted_at')) != at:
            return 200, {'verified': False, 'reason': 'not_found'}
        self.ledger.put(sid, status='success', projectId=pid, submittedAt=at, resolved='restored from the database')
        return 200, {'verified': True, 'submittedAt': at}


def log(msg):
    print(msg, flush=True)


class Handler(BaseHTTPRequestHandler):
    server_version = 'AcousticApp/1'
    app = None  # set in main

    def log_message(self, fmt, *args):  # no client addresses in the log
        sys.stderr.write('%s %s\n' % (self.log_date_time_string(), fmt % args))

    def _send(self, status, body, ctype='application/json; charset=utf-8', extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('Cache-Control', 'no-store' if ctype.startswith('application/json') else 'no-cache')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    # ---------- static files ----------

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == '/api/health':
            a = self.app
            return self._send(200, {'ok': True, 'store': 'configured' if a.db else 'not_configured'})
        if path.startswith('/api/'):
            return self._send(404, {'error': 'not_found'})
        rel = posixpath.normpath(urllib.parse.unquote(path)).lstrip('/')
        if rel in ('', '.'):
            rel = 'index.html'
        parts = rel.split('/')
        if parts[0] not in SERVED or any(p in ('..', '') or p.startswith('.') for p in parts):
            return self._send(404, b'Not found', 'text/plain; charset=utf-8')
        full = os.path.realpath(os.path.join(ROOT, *parts))
        if not full.startswith(os.path.realpath(ROOT) + os.sep) or not os.path.isfile(full):
            return self._send(404, b'Not found', 'text/plain; charset=utf-8')
        with open(full, 'rb') as f:
            data = f.read()
        self._send(200, data, TYPES.get(os.path.splitext(full)[1].lower(), 'application/octet-stream'))

    # ---------- API ----------

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = -1
        if length <= 0 or length > MAX_BODY:
            self.close_connection = True
            return self._send(413, {'status': 'failed', 'reason': 'size', 'message': 'The request is empty or too large.'})
        raw = self.rfile.read(length)  # read before any answer: an unread body can reset the connection on Windows
        if path not in ('/api/report-submissions', '/api/report-submissions/verify'):
            return self._send(404, {'error': 'not_found'})
        origin = self.headers.get('Origin')
        if origin and origin.rstrip('/') not in {f'http://{self.headers.get("Host", "")}', f'https://{self.headers.get("Host", "")}'} | self.app.extra_origins:
            return self._send(403, {'status': 'failed', 'reason': 'origin', 'message': 'Requests from other sites are not accepted.'})
        if not (self.headers.get('Content-Type') or '').lower().startswith('application/json'):
            return self._send(415, {'status': 'failed', 'reason': 'content_type', 'message': 'Send JSON.'})
        try:
            body = json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return self._send(400, {'status': 'invalid', 'errors': {'_': 'The request is not valid JSON.'}})
        client = self.client_address[0]
        if path.endswith('/verify'):
            if not self.app.verify_limit.allow(client):
                return self._send(429, {'verified': False, 'reason': 'rate_limited'}, extra={'Retry-After': '60'})
            status, out = self.app.verify(body)
        else:
            if not self.app.submit_limit.allow(client):
                return self._send(429, {'status': 'failed', 'reason': 'rate_limited', 'message': 'Too many submissions from this device. Wait a minute and try again.'}, extra={'Retry-After': '60'})
            status, out = self.app.submit(body)
        self._send(status, out)


def check(app):
    """Reads only: the key works, the table and every column exist, and (if given) the public key is shut out."""
    print(f'Spec: {len(app.spec["fields"])} form fields, {len(app.columns)} columns, app version {app.spec.get("appVersion")}')
    if not app.db:
        print(f'Supabase: NOT CONFIGURED ({app.config_problem}). See server/.env.example.')
        return 2
    db = app.db
    print(f'Supabase project: {db.url}   table: {db.table}   key: {"secret (sb_secret_)" if db.key.startswith("sb_secret_") else "legacy service_role"}')
    try:
        db.check_columns(app.columns)
        print(f'Secret key and table: OK (all {len(app.columns)} columns found)')
    except DbError as e:
        print(f'FAILED: {e}')
        if e.code == 'db_auth':
            print('The key was refused. Use the project\'s secret key: Project Settings > API Keys > Secret keys.')
        elif e.code == 'db_table_missing':
            print(f'Create the table: run server/supabase/schema.sql in the dashboard\'s SQL Editor.')
        elif e.code == 'db_request':
            print('A column is missing or different: compare the table with server/supabase/schema.sql.')
        return 1
    public = os.environ.get('SUPABASE_PUBLISHABLE_KEY', '').strip()
    if public:
        try:
            SupabaseClient(db.url, public, db.table, timeout=db.timeout).check_columns(['submission_id'])
            print('PUBLIC KEY CAN READ THE TABLE: run server/supabase/schema.sql again (row level security and privileges).')
            return 1
        except DbDefinite as e:
            print(f'Public key shut out: OK ({e.status})' if e.code in ('db_auth', 'db_permission') else f'Public key check: {e}')
    else:
        print('Public key check skipped (set SUPABASE_PUBLISHABLE_KEY to confirm the browser key cannot read the table).')
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--env-file', default=os.path.join(SERVER_DIR, '.env'))
    ap.add_argument('--host', default=None)
    ap.add_argument('--port', type=int, default=None)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    loaded = load_env(args.env_file)
    app = App()
    if args.check:
        sys.exit(check(app))
    host = args.host or os.environ.get('REPORT_SERVER_HOST') or '127.0.0.1'
    port = args.port or int(os.environ.get('REPORT_SERVER_PORT') or 8780)
    Handler.app = app
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    log(f'Acoustic Measurement app: http://{"localhost" if host in ("127.0.0.1", "0.0.0.0") else host}:{port}/')
    log(f'Configuration: {args.env_file if loaded else "environment variables only (no .env file)"}')
    if app.db:
        log(f'Report form -> Supabase {app.db.url}, table {app.db.table}')
    else:
        log(f'Report form: Supabase NOT CONFIGURED ({app.config_problem}). Submissions fail and reports stay locked.')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
