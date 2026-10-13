"""Report form server tests: the real server/app_server.py against tests/fake_supabase.py (development only).

    python tests/report_submission_test.py

Covers validation, the approved columns only, typed values, one row per submission ID (repeats, concurrent repeats,
lost answers, timeouts, the database's own primary key), refusals, keys, receipts, the files the server will and will
not serve, origin and rate limits. It never contacts Supabase.
"""

import base64
import http.client
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import uuid
from contextlib import redirect_stdout

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'server'))

import fake_supabase as fs  # noqa: E402

TMP = tempfile.mkdtemp(prefix='report-form-test-')
APPROVED = ['submission_id', 'submitted_at', 'full_name', 'email', 'profession_role', 'organization', 'country', 'purpose',
            'feedback', 'consent_given', 'consent_recorded_at', 'marketing_consent', 'project_id', 'project_name', 'room_type',
            'room_volume_m3', 'target_rt60_s', 'measured_rt60_s', 'measurement_method', 'predicted_rt60_s', 'treatment_status',
            'app_version']


def form(**kw):
    f = {'fullName': 'Asha Rao', 'email': 'asha@example.com', 'role': 'Architect', 'organization': 'Studio North', 'country': 'India',
         'purpose': 'Room design', 'feedback': 'Clear report.', 'consent': True, 'marketing': False}
    f.update(kw)
    return f


def project(**kw):
    p = {'projectId': 'pmv0m3mq5680y', 'projectName': 'Polish Test Room', 'roomType': 'Classroom', 'roomVolumeM3': 189.0, 'targetRt60': 0.56,
         'measuredRt60': 0.7, 'measurementMethod': 'T30', 'predictedRt60': 0.57, 'treatmentStatus': 'Predicted'}
    p.update(kw)
    return p


def jwt(role):
    part = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b'=').decode()
    return f'{part({"alg": "HS256", "typ": "JWT"})}.{part({"iss": "supabase", "role": role})}.c2lnbmF0dXJl'


class ServerCase(unittest.TestCase):
    table = True

    def setUp(self):
        self.fake = fs.FakeSupabase(table=self.table)
        port = self.fake.start()
        self.data = tempfile.mkdtemp(dir=TMP)
        env = {
            'SUPABASE_URL': f'http://127.0.0.1:{port}', 'SUPABASE_SECRET_KEY': fs.SECRET_KEY, 'SUPABASE_TABLE': fs.TABLE,
            'SUPABASE_PUBLISHABLE_KEY': None, 'REPORT_DATA_DIR': self.data, 'SUPABASE_HTTP_TIMEOUT': '1.5', 'FAKE_TIMEOUT_SLEEP': '2.5',
            'REPORT_SUBMIT_LIMITS': '1000/60',  # the rate limit has its own test
        }
        env.update(self.env_overrides())
        self.saved = {k: os.environ.get(k) for k in env}
        for k, v in env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        import app_server
        self.app_server = app_server
        self.app = app_server.App()
        app_server.Handler.app = self.app
        self.httpd = app_server.ThreadingHTTPServer(('127.0.0.1', 0), app_server.Handler)
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def env_overrides(self):
        return {}

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.fake.stop()
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def call(self, method, path, body=None, headers=None, raw=None):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=30)
        h = {'Content-Type': 'application/json'}
        h.update(headers or {})
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        c.request(method, path, body=data, headers=h)
        r = c.getresponse()
        out = r.read()
        c.close()
        try:
            return r.status, json.loads(out)
        except ValueError:
            return r.status, out

    def submit(self, sid=None, f=None, p=None):
        sid = sid or str(uuid.uuid4())
        return sid, self.call('POST', '/api/report-submissions', {'submissionId': sid, 'form': f or form(), 'project': p or project()})

    def rows(self):
        return self.fake.rows or []


class Submissions(ServerCase):
    def test_valid_submission_stores_exactly_one_row_with_approved_columns(self):
        sid, (status, out) = self.submit()
        self.assertEqual(status, 200, out)
        self.assertEqual(out['status'], 'success')
        self.assertEqual(len(self.rows()), 1)
        row = self.rows()[0]
        self.assertEqual(sorted(row), sorted(APPROVED), 'exactly the approved columns')
        inserts = [r for r in self.fake.requests if r[0] == 'POST' and r[1].startswith('/rest/v1/')]
        self.assertEqual(len(inserts), 1)
        self.assertEqual(inserts[0][2].get('on_conflict'), 'submission_id')
        self.assertIn('resolution=ignore-duplicates', inserts[0][3].get('prefer'))
        self.assertEqual(inserts[0][3].get('apikey'), fs.SECRET_KEY)
        self.assertNotIn('authorization', inserts[0][3], 'a new secret key goes in the apikey header only')
        self.assertEqual(row['submission_id'], sid)
        self.assertRegex(row['submitted_at'], r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$')
        self.assertEqual(out['submittedAt'], row['submitted_at'].replace('+00:00', 'Z'))
        self.assertEqual((row['full_name'], row['email'], row['profession_role'], row['country'], row['purpose']),
                         ('Asha Rao', 'asha@example.com', 'Architect', 'India', 'Room design'))
        self.assertIs(row['consent_given'], True)
        self.assertEqual(row['consent_recorded_at'], row['submitted_at'])
        self.assertIs(row['marketing_consent'], False)
        self.assertEqual((row['room_volume_m3'], row['target_rt60_s'], row['measured_rt60_s'], row['predicted_rt60_s']), (189.0, 0.56, 0.7, 0.57))
        self.assertEqual((row['measurement_method'], row['treatment_status'], row['project_id']), ('T30', 'Predicted', 'pmv0m3mq5680y'))
        self.assertEqual(row['app_version'], self.app.spec['appVersion'])

    def test_missing_optional_values_are_null_and_marketing_is_never_forced(self):
        _, (status, out) = self.submit(f=form(organization='', feedback='', marketing=False),
                                       p=project(predictedRt60=None, measuredRt60=None, measurementMethod='', treatmentStatus='No treatment'))
        self.assertEqual(status, 200, out)
        row = self.rows()[0]
        self.assertEqual((row['organization'], row['feedback'], row['predicted_rt60_s'], row['measured_rt60_s'], row['measurement_method']),
                         (None, None, None, None, None))
        self.assertIs(row['marketing_consent'], False)
        f = form()
        del f['marketing']
        self.assertEqual(self.submit(f=f)[1][0], 200, 'marketing may be left out entirely')
        self.submit(f=form(marketing=True))
        self.assertIs(self.rows()[-1]['marketing_consent'], True)

    def test_formula_like_text_is_stored_exactly_as_typed(self):
        evil = '=HYPERLINK("http://evil.example","x")'
        _, (status, _) = self.submit(f=form(fullName=evil, organization='+cmd', feedback="@SUM(A1)\n-2+3'); drop table x;--"), p=project(projectName='=1+1'))
        self.assertEqual(status, 200)
        row = self.rows()[0]
        self.assertEqual((row['full_name'], row['organization'], row['feedback'], row['project_name']),
                         (evil, '+cmd', "@SUM(A1)\n-2+3'); drop table x;--", '=1+1'))

    def test_validation(self):
        cases = [
            (form(fullName=''), 'fullName'), (form(email='not-an-email'), 'email'), (form(email=''), 'email'),
            (form(role='Astronaut'), 'role'), (form(country='Atlantis'), 'country'), (form(purpose=''), 'purpose'),
            (form(consent=False), 'consent'), (form(feedback='x' * 1001), 'feedback'), (form(fullName='A'), 'fullName'),
        ]
        for f, field in cases:
            _, (status, out) = self.submit(f=f)
            self.assertEqual(status, 400, field)
            self.assertIn(field, out['errors'])
        self.assertEqual(self.rows(), [], 'nothing stored for an invalid form')

    def test_unlisted_fields_are_refused(self):
        sid = str(uuid.uuid4())
        for body in (
            {'submissionId': sid, 'form': form(phone='123'), 'project': project()},
            {'submissionId': sid, 'form': form(), 'project': project(rawAudio='AAAA')},
            {'submissionId': sid, 'form': form(), 'project': project(), 'history': []},
        ):
            status, out = self.call('POST', '/api/report-submissions', body)
            self.assertEqual(status, 400)
            self.assertIn('Unexpected', out['errors']['_'])
        status, _ = self.call('POST', '/api/report-submissions', {'submissionId': 'not-a-uuid-at-all', 'form': form(), 'project': project()})
        self.assertEqual(status, 400)
        self.assertEqual(self.rows(), [])

    def test_repeat_of_the_same_submission_does_not_add_a_row(self):
        sid, (s1, o1) = self.submit()
        _, (s2, o2) = self.submit(sid=sid)
        self.assertEqual((s1, s2), (200, 200))
        self.assertEqual(o1['receipt'], o2['receipt'])
        self.assertEqual(len(self.rows()), 1)

    def test_same_id_with_different_details_is_refused(self):
        sid, _ = self.submit()
        _, (status, _) = self.submit(sid=sid, f=form(fullName='Someone Else'))
        self.assertEqual(status, 409)
        self.assertEqual(len(self.rows()), 1)

    def test_concurrent_repeats_write_one_row(self):
        sid = str(uuid.uuid4())
        results = []
        threads = [threading.Thread(target=lambda: results.append(self.submit(sid=sid)[1][0])) for _ in range(4)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(sorted(results), [200] * 4)
        self.assertEqual(len(self.rows()), 1)

    def test_the_database_primary_key_stops_a_duplicate_even_without_the_ledger(self):
        sid, (_, first) = self.submit()
        self.app.ledger.items.clear()  # the server forgot it (data folder lost)
        _, (status, out) = self.submit(sid=sid)
        self.assertEqual(status, 200, out)
        self.assertEqual(out['submittedAt'], first['submittedAt'])
        self.assertEqual(len(self.rows()), 1)
        self.assertEqual(self.app.ledger.get(sid)['resolved'], 'already in the table')


class Faults(ServerCase):
    def test_lost_answer_after_write_is_uncertain_and_retry_finds_the_row(self):
        self.submit()
        self.fake.fault('insert', 'drop_after_write')
        sid, (status, out) = self.submit()
        self.assertEqual((status, out['status']), (504, 'uncertain'), out)
        self.assertEqual(len(self.rows()), 2, 'the row was stored although the answer was lost')
        _, (status, out) = self.submit(sid=sid)
        self.assertEqual(status, 200, out)
        self.assertEqual(len(self.rows()), 2, 'the retry found it and did not insert again')
        self.assertEqual(self.app.ledger.get(sid)['resolved'], 'found on retry')

    def test_timeout_after_write_is_uncertain_and_retry_does_not_duplicate(self):
        self.fake.fault('insert', 'timeout_after_write')
        sid, (status, out) = self.submit()
        self.assertEqual(out['status'], 'uncertain')
        _, (status, out) = self.submit(sid=sid)
        self.assertEqual(status, 200, out)
        self.assertEqual([r['submission_id'] for r in self.rows()], [sid])

    def test_server_error_without_write_is_uncertain_and_retry_inserts_once(self):
        self.fake.fault('insert', 'http_500_no_write')
        sid, (status, out) = self.submit()
        self.assertEqual((status, out['status']), (504, 'uncertain'))
        self.assertEqual(self.rows(), [])
        _, (status, _) = self.submit(sid=sid)
        self.assertEqual(status, 200)
        self.assertEqual([r['submission_id'] for r in self.rows()], [sid])

    def test_unexpected_insert_answer_is_not_success(self):
        self.fake.fault('insert', 'wrong_answer')
        sid, (status, out) = self.submit()
        self.assertEqual(out['status'], 'uncertain')
        _, (status, out) = self.submit(sid=sid)
        self.assertEqual(status, 200)
        self.assertEqual(len(self.rows()), 1)

    def test_refused_key_fails_and_stores_nothing(self):
        self.fake.fault('any', 'http_401')
        sid, (status, out) = self.submit()
        self.assertEqual((status, out['status'], out['reason']), (502, 'failed', 'db_auth'))
        self.assertEqual(self.rows(), [])
        _, (status, _) = self.submit(sid=sid)
        self.assertEqual(status, 200)
        self.assertEqual(len(self.rows()), 1)


class MissingTable(ServerCase):
    table = False

    def test_missing_table(self):
        _, (status, out) = self.submit()
        self.assertEqual((status, out['reason']), (502, 'db_table_missing'))
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = self.app_server.check(self.app)
        self.assertEqual(code, 1)
        self.assertIn('schema.sql', buf.getvalue())


class Unreachable(ServerCase):
    def env_overrides(self):
        import socket
        s = socket.socket()
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
        s.close()  # nothing listens here
        return {'SUPABASE_URL': f'http://127.0.0.1:{port}'}

    def test_database_unreachable_fails(self):
        _, (status, out) = self.submit()
        self.assertEqual((status, out['status']), (502, 'failed'))
        self.assertIn(out['reason'], ('db_unreachable', 'db_timeout'))


class NotConfigured(ServerCase):
    def env_overrides(self):
        return {'SUPABASE_SECRET_KEY': None}

    def test_not_configured(self):
        status, out = self.call('GET', '/api/health')
        self.assertEqual(out['store'], 'not_configured')
        _, (status, out) = self.submit()
        self.assertEqual((status, out['reason']), (503, 'not_configured'))


class WrongKeys(unittest.TestCase):
    def test_public_keys_are_refused_as_the_server_key(self):
        import app_server
        for key, word in ((fs.PUBLISHABLE_KEY, 'publishable'), (jwt('anon'), 'anon')):
            os.environ.update({'SUPABASE_URL': 'https://example.supabase.co', 'SUPABASE_SECRET_KEY': key, 'REPORT_DATA_DIR': TMP})
            app = app_server.App()
            self.assertIsNone(app.db)
            self.assertIn(word, app.config_problem)
        os.environ['SUPABASE_SECRET_KEY'] = jwt('service_role')
        self.assertIsNotNone(app_server.App().db, 'the legacy service_role key is accepted')
        os.environ['SUPABASE_URL'] = 'http://example.supabase.co'
        self.assertIn('https', app_server.App().config_problem, 'only https outside this computer')
        for k in ('SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'REPORT_DATA_DIR'):
            os.environ.pop(k, None)


class Check(ServerCase):
    def env_overrides(self):
        return {'SUPABASE_PUBLISHABLE_KEY': fs.PUBLISHABLE_KEY}

    def test_check_reads_only_and_confirms_the_public_key_is_shut_out(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = self.app_server.check(self.app)
        text = buf.getvalue()
        self.assertEqual(code, 0, text)
        self.assertIn('all 22 columns found', text)
        self.assertIn('Public key shut out: OK', text)
        self.assertEqual(self.rows(), [])
        self.assertFalse(os.path.exists(os.path.join(self.data, 'receipt-secret.key')), '--check writes nothing')


class Receipts(ServerCase):
    def test_receipts(self):
        sid, (_, out) = self.submit()
        good = {k: out[k] for k in ('submissionId', 'projectId', 'submittedAt', 'receipt')}
        self.assertEqual(self.call('POST', '/api/report-submissions/verify', good)[1]['verified'], True)
        for change in ({'receipt': '0' * 64}, {'projectId': 'another-project'}, {'submittedAt': '2020-01-01T00:00:00Z'}):
            self.assertEqual(self.call('POST', '/api/report-submissions/verify', dict(good, **change))[1]['verified'], False, change)
        fake = dict(good, submissionId=str(uuid.uuid4()))
        self.assertEqual(self.call('POST', '/api/report-submissions/verify', fake)[1]['verified'], False)
        # the server's ledger is lost: a signed receipt is checked against the database itself
        self.app.ledger.items.clear()
        status, res = self.call('POST', '/api/report-submissions/verify', good)
        self.assertEqual(res['verified'], True)
        self.assertEqual(self.app.ledger.get(sid)['resolved'], 'restored from the database')


class Serving(ServerCase):
    def test_only_the_app_is_served(self):
        for path in ('/', '/index.html', '/js/data/report-form.js', '/css/app.css', '/assets/brand/univicoustic-icon.png'):
            self.assertEqual(self.call('GET', path)[0], 200, path)
        self.submit()  # creates the ledger and the receipt key
        for path in ('/server/app_server.py', '/server/.env.example', '/server/supabase/schema.sql', '/server/data/submissions-ledger.json',
                     '/server/data/receipt-secret.key', '/README.md', '/js/../server/app_server.py', '/%2e%2e/server/app_server.py',
                     '/js/%2e%2e/server/.env.example', '/.env'):
            self.assertEqual(self.call('GET', path)[0], 404, path)

    def test_no_secret_reaches_the_browser(self):
        for path in ('/', '/js/services/report-gate.js', '/js/data/report-form.js'):
            _, body = self.call('GET', path)
            self.assertNotIn(fs.SECRET_KEY.encode(), body if isinstance(body, bytes) else json.dumps(body).encode())
        _, health = self.call('GET', '/api/health')
        self.assertEqual(set(health), {'ok', 'store'})

    def test_other_origins_and_non_json_are_refused(self):
        status, _ = self.call('POST', '/api/report-submissions', {'submissionId': str(uuid.uuid4()), 'form': form(), 'project': project()},
                              headers={'Origin': 'https://evil.example'})
        self.assertEqual(status, 403)
        status, _ = self.call('POST', '/api/report-submissions', raw=b'a=b', headers={'Content-Type': 'application/x-www-form-urlencoded'})
        self.assertEqual(status, 415)
        status, _ = self.call('POST', '/api/report-submissions', {'submissionId': str(uuid.uuid4()), 'form': form(), 'project': project()},
                              headers={'Origin': f'http://127.0.0.1:{self.port}'})
        self.assertEqual(status, 200)
        self.assertEqual(len(self.rows()), 1)

    def test_ledger_holds_no_personal_data(self):
        self.submit()
        with open(os.path.join(self.data, 'submissions-ledger.json'), encoding='utf-8') as f:
            text = f.read()
        for personal in ('Asha', 'asha@example.com', 'Studio North', 'India', 'Clear report'):
            self.assertNotIn(personal, text)


class RateLimit(ServerCase):
    def env_overrides(self):
        return {'REPORT_SUBMIT_LIMITS': None}  # the default: 5 a minute, 30 an hour

    def test_rate_limit(self):
        codes = [self.submit()[1][0] for _ in range(6)]
        self.assertEqual(codes[:5], [200] * 5)
        self.assertEqual(codes[5], 429)
        self.assertEqual(len(self.rows()), 5)


class Spec(unittest.TestCase):
    def test_columns_match_the_schema(self):
        import re
        import submissions
        self.assertEqual(submissions.columns(submissions.load_spec()), APPROVED)
        with open(os.path.join(ROOT, 'server', 'supabase', 'schema.sql'), encoding='utf-8') as f:
            sql = f.read()
        start = sql.index('create table')
        body = sql[start:sql.index('\n);', start)]
        declared = re.findall(r'^\s{2}([a-z_0-9]+)\s+(?:uuid|timestamptz|text|boolean|numeric)', body, re.M)
        self.assertEqual(declared, APPROVED, 'schema.sql declares exactly the approved columns, in order')


if __name__ == '__main__':
    unittest.main(verbosity=2)
