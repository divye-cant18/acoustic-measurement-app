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
            'room_volume_m3', 'target_rt60_s', 'measured_rt60_s', 'measured_rt60_avg_s', 'measurement_method', 'predicted_rt60_s',
            'predicted_rt60_avg_s', 'treatment_status', 'app_version', 'custom_materials']


def form(**kw):
    f = {'fullName': 'Asha Rao', 'email': 'asha@example.com', 'role': 'Architect', 'organization': 'Studio North', 'country': 'India',
         'purpose': 'Room design', 'feedback': 'Clear report.', 'consent': True, 'marketing': False}
    f.update(kw)
    return f


def project(**kw):
    p = {'projectId': 'pmv0m3mq5680y', 'projectName': 'Polish Test Room', 'roomType': 'Classroom', 'roomVolumeM3': 189.0, 'targetRt60': 0.56,
         'measuredRt60': 0.7, 'measuredRt60Avg': 0.66, 'measurementMethod': 'T30', 'predictedRt60': 0.57, 'treatmentStatus': 'Predicted'}
    p.update(kw)
    return p


def jwt(role):
    part = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b'=').decode()
    return f'{part({"alg": "HS256", "typ": "JWT"})}.{part({"iss": "supabase", "role": role})}.c2lnbmF0dXJl'


class ServerCase(unittest.TestCase):
    table = True
    without = ()

    def setUp(self):
        self.fake = fs.FakeSupabase(table=self.table, without=self.without)
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
        self.assertEqual((row['room_volume_m3'], row['target_rt60_s'], row['measured_rt60_s'], row['measured_rt60_avg_s'], row['predicted_rt60_s']), (189.0, 0.56, 0.7, 0.66, 0.57))
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

    def test_a_request_from_before_the_average_existed_is_accepted_and_hashes_as_before(self):
        import hashlib
        import submissions
        p = project()
        del p['measuredRt60Avg']
        sid, (status, out) = self.submit(p=p)
        self.assertEqual(status, 200, out)
        self.assertIsNone(self.rows()[0]['measured_rt60_avg_s'])
        # The hash of a request without the new value is the hash the previous server version computed for it, so a
        # retry of a submission first sent before this release is recognised, not refused as different content.
        _, f, pv = submissions.validate(self.app.spec, {'submissionId': sid, 'form': form(), 'project': p})
        old = {k: v for k, v in pv.items() if k not in ('measuredRt60Avg', 'predictedRt60Avg')}
        legacy = hashlib.sha256(json.dumps({'id': sid, 'form': f, 'project': old}, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
        self.assertEqual(submissions.content_hash(sid, f, pv, self.app.spec), legacy)
        self.assertEqual(self.submit(sid=sid, p=p)[1][0], 200, 'a repeat is the same submission')

    def test_a_request_from_before_the_predicted_average_existed_is_accepted_and_hashes_as_before(self):
        import hashlib
        import submissions
        p = project()  # as app version 2026.10.14 sent it: the measured average, no predicted average
        sid, (status, out) = self.submit(p=p)
        self.assertEqual(status, 200, out)
        row = self.rows()[0]
        self.assertIsNone(row['predicted_rt60_avg_s'])
        self.assertEqual((row['measured_rt60_avg_s'], row['predicted_rt60_s']), (0.66, 0.57), 'the other values are stored as sent')
        _, f, pv = submissions.validate(self.app.spec, {'submissionId': sid, 'form': form(), 'project': p})
        old = {k: v for k, v in pv.items() if k != 'predictedRt60Avg'}
        legacy = hashlib.sha256(json.dumps({'id': sid, 'form': f, 'project': old}, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
        self.assertEqual(submissions.content_hash(sid, f, pv, self.app.spec), legacy)
        self.assertEqual(self.submit(sid=sid, p=p)[1][0], 200, 'a repeat is the same submission')

    def test_the_predicted_average_is_stored_in_its_own_column(self):
        sid, (status, out) = self.submit(p=project(predictedRt60Avg=0.49))
        self.assertEqual(status, 200, out)
        row = self.rows()[0]
        self.assertEqual((row['predicted_rt60_s'], row['predicted_rt60_avg_s'], row['measured_rt60_s'], row['measured_rt60_avg_s']), (0.57, 0.49, 0.7, 0.66))

    def test_custom_materials_are_stored_as_a_list_and_none_as_null(self):
        mats = [{'kind': 'construction', 'surface': 'wall', 'name': '  Hempcrete   blocks ', 'notes': '300 mm, lime-rendered'},
                {'kind': 'finish', 'surface': 'ceiling', 'name': 'Clay plaster', 'notes': ''}]
        _, (status, out) = self.submit(p=project(customMaterials=mats))
        self.assertEqual(status, 200, out)
        self.assertEqual(self.rows()[0]['custom_materials'], [
            {'kind': 'construction', 'surface': 'wall', 'name': 'Hempcrete blocks', 'notes': '300 mm, lime-rendered'},
            {'kind': 'finish', 'surface': 'ceiling', 'name': 'Clay plaster', 'notes': ''}], 'stored as sent, text cleaned like any other')
        self.assertEqual(self.submit(p=project(customMaterials=[]))[1][0], 200)
        self.assertIsNone(self.rows()[-1]['custom_materials'], 'none typed in: null')
        p = project()
        p.pop('customMaterials', None)
        self.assertEqual(self.submit(p=p)[1][0], 200, 'an app from before the field may leave it out')
        self.assertIsNone(self.rows()[-1]['custom_materials'])

    def test_custom_materials_are_checked_strictly(self):
        ok = {'kind': 'finish', 'surface': 'wall', 'name': 'Clay plaster', 'notes': ''}
        bad = [
            ('not a list', {'name': 'x'}),
            ('too many', [dict(ok, name=f'Material {i}') for i in range(31)]),
            ('an extra key', [dict(ok, alpha=[0.1, 0.2])]),
            ('an unknown kind', [dict(ok, kind='product')]),
            ('an unknown surface', [dict(ok, surface='door')]),
            ('a name too short', [dict(ok, name='x')]),
            ('a name too long', [dict(ok, name='y' * 81)]),
            ('notes too long', [dict(ok, notes='z' * 301)]),
            ('a name that is not text', [dict(ok, name=42)]),
            ('an entry that is not an object', ['Clay plaster']),
        ]
        for what, value in bad:
            _, (status, out) = self.submit(p=project(customMaterials=value))
            self.assertEqual(status, 400, what)
            self.assertIn('project.customMaterials', out.get('errors', {}), what)
        self.assertEqual(len(self.rows()), 0, 'nothing stored from a refused request')

    def test_a_request_without_custom_materials_hashes_as_before(self):
        import hashlib
        import submissions
        p = project()
        sid, (status, out) = self.submit(p=p)
        self.assertEqual(status, 200, out)
        _, f, pv = submissions.validate(self.app.spec, {'submissionId': sid, 'form': form(), 'project': p})
        old = {k: v for k, v in pv.items() if k not in ('predictedRt60Avg', 'customMaterials')}
        legacy = hashlib.sha256(json.dumps({'id': sid, 'form': f, 'project': old}, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
        self.assertEqual(submissions.content_hash(sid, f, pv, self.app.spec), legacy)
        self.assertEqual(self.submit(sid=sid, p=dict(p, customMaterials=[]))[1][0], 200, 'an empty list is the same submission')
        self.assertEqual(self.submit(sid=sid, p=dict(p, customMaterials=[{'kind': 'finish', 'surface': 'wall', 'name': 'Clay plaster', 'notes': ''}]))[1][0], 409,
                         'the same ID with a material added is different content')

    def test_half_a_character_in_text_is_removed_not_a_crash(self):
        # An emoji cut in two (an unpaired surrogate) in the room name: stored without the broken half.
        body = json.dumps({'submissionId': str(uuid.uuid4()), 'form': form(), 'project': project(projectName='Room A ')})
        body = body.replace('Room A ', 'Room A \\ud83d').encode()
        status, out = self.call('POST', '/api/report-submissions', raw=body)
        self.assertEqual(status, 200, out)
        self.assertEqual(self.rows()[0]['project_name'], 'Room A')

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

    def test_an_answer_that_breaks_off_or_is_not_json_is_uncertain_and_retry_finds_the_row(self):
        for mode in ('not_json_after_write', 'incomplete_after_write'):
            n = len(self.rows())
            self.fake.fault('insert', mode)
            sid, (status, out) = self.submit()
            self.assertEqual((status, out['status']), (504, 'uncertain'), (mode, out))
            _, (status, out) = self.submit(sid=sid)
            self.assertEqual(status, 200, (mode, out))
            self.assertEqual(len(self.rows()), n + 1, f'{mode}: one row, not two')

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
        self.assertIn('all 22 required columns found', text)
        self.assertIn('Optional column measured_rt60_avg_s: OK', text)
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
                     '/js/%2e%2e/server/.env.example', '/.env',
                     # Windows separators and drive or stream syntax, encoded and raw
                     '/js/x%5c..%5c..%5cserver%5capp_server.py', '/js/x%5c..%5c..%5cserver%5c.env.example', '/js/x\\..\\..\\server\\supabase\\schema.sql',
                     '/js/x%5c..%5c..%5c.git%5cconfig', '/js/app.js%3a%3a$DATA', '/js/app.js%00.png', '/css/..%5c..%5cREADME.md'):
            self.assertEqual(self.call('GET', path)[0], 404, path)

    def test_other_host_names_are_refused(self):
        # A web page re-pointed at this computer (DNS rebinding) sends its own name in Host: refused, for files and API.
        self.app_server.Handler.allowed_hosts = self.app_server.allowed_hosts('127.0.0.1')
        try:
            self.assertEqual(self.call('GET', '/', headers={'Host': 'evil.example'})[0], 421)
            body = {'submissionId': str(uuid.uuid4()), 'form': form(), 'project': project()}
            status, _ = self.call('POST', '/api/report-submissions', body, headers={'Host': 'evil.example:8780', 'Origin': 'http://evil.example:8780'})
            self.assertEqual(status, 421)
            self.assertEqual(self.rows(), [])
            for host in (f'127.0.0.1:{self.port}', f'localhost:{self.port}', f'[::1]:{self.port}'):
                self.assertEqual(self.call('GET', '/', headers={'Host': host})[0], 200, host)
            os.environ['REPORT_ALLOWED_HOSTS'] = '192.168.1.20'
            self.app_server.Handler.allowed_hosts = self.app_server.allowed_hosts('0.0.0.0')
            self.assertEqual(self.call('GET', '/', headers={'Host': '192.168.1.20:8780'})[0], 200)
        finally:
            self.app_server.Handler.allowed_hosts = None
            os.environ.pop('REPORT_ALLOWED_HOSTS', None)

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


class OlderTable(ServerCase):
    without = ('measured_rt60_avg_s',)  # a table made before the average column existed

    def test_rows_are_stored_without_the_new_column_until_schema_sql_is_run_again(self):
        out = io.StringIO()
        with redirect_stdout(out):
            _, (status, res) = self.submit()
            self.assertEqual(status, 200, res)
            _, (status, res) = self.submit()
            self.assertEqual(status, 200, res)
        self.assertEqual(len(self.rows()), 2)
        self.assertEqual(self.rows()[0]['measured_rt60_s'], 0.7, 'everything else is stored')
        self.assertIn('Run server/supabase/schema.sql again', out.getvalue())
        inserts = [r for r in self.fake.requests if r[0] == 'POST' and r[1].startswith('/rest/v1/')]
        self.assertEqual(len(inserts), 3, 'one refused attempt with the column, then without it; the second row goes straight through')
        out = io.StringIO()
        with redirect_stdout(out):
            code = self.app_server.check(self.app)
        self.assertEqual(code, 0)
        self.assertIn('measured_rt60_avg_s: MISSING', out.getvalue())


class TableBeforeThePredictedAverage(ServerCase):
    without = ('predicted_rt60_avg_s',)  # a table made with the schema.sql of app version 2026.10.14

    def test_rows_are_stored_without_the_predicted_average_until_schema_sql_is_run_again(self):
        out = io.StringIO()
        with redirect_stdout(out):
            _, (status, res) = self.submit(p=project(predictedRt60Avg=0.49))
            self.assertEqual(status, 200, res)
        row = self.rows()[0]
        self.assertNotIn('predicted_rt60_avg_s', row)
        self.assertEqual((row['measured_rt60_avg_s'], row['predicted_rt60_s'], row['measured_rt60_s']), (0.66, 0.57, 0.7), 'everything else is stored')
        self.assertIn('Run server/supabase/schema.sql again', out.getvalue())
        out = io.StringIO()
        with redirect_stdout(out):
            code = self.app_server.check(self.app)
        self.assertEqual(code, 0)
        self.assertIn('predicted_rt60_avg_s: MISSING', out.getvalue())
        self.assertIn('measured_rt60_avg_s: OK', out.getvalue())


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
        declared = re.findall(r'^\s{2}([a-z_0-9]+)\s+(?:uuid|timestamptz|text|boolean|numeric|jsonb)', body, re.M)
        self.assertEqual(declared, APPROVED, 'schema.sql declares exactly the approved columns, in order')


class Vercel(unittest.TestCase):
    """The API as Vercel runs it: the real api/*.py files, loaded by path as Vercel loads them (server/vercel_adapter.py),
    each served on its own, against the fake database; and what vercel.json publishes."""
    ROUTES = {'/api/health': 'api/health.py', '/api/report-submissions': 'api/report-submissions.py',
              '/api/report-submissions/verify': 'api/report-submissions/verify.py'}

    def setUp(self):
        self.fake = fs.FakeSupabase(table=True)
        port = self.fake.start()
        self.env({'SUPABASE_URL': f'http://127.0.0.1:{port}', 'SUPABASE_SECRET_KEY': fs.SECRET_KEY, 'SUPABASE_TABLE': fs.TABLE,
                  'SUPABASE_PUBLISHABLE_KEY': None, 'REPORT_DATA_DIR': tempfile.mkdtemp(dir=TMP), 'SUPABASE_HTTP_TIMEOUT': '1.5',
                  'REPORT_SUBMIT_LIMITS': None, 'REPORT_RECEIPT_SECRET': 'a-stable-test-secret-' + 'x' * 40, 'VERCEL': '1'})
        self.servers = []
        self.start()

    def env(self, values):
        self.saved = getattr(self, 'saved', {})
        for k, v in values.items():
            self.saved.setdefault(k, os.environ.get(k))
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def start(self):
        """A new instance of every function (a cold start): each api file loaded again, as Vercel would."""
        import importlib.util
        self.stop()
        self.ports, self.handlers = {}, {}
        for route, rel in self.ROUTES.items():
            spec = importlib.util.spec_from_file_location(f'vc_{uuid.uuid4().hex}', os.path.join(ROOT, *rel.split('/')))
            mod = importlib.util.module_from_spec(spec)
            with redirect_stdout(io.StringIO()):
                spec.loader.exec_module(mod)
            httpd = self.make_server(mod.handler)
            self.handlers[route], self.ports[route] = mod.handler, httpd.server_address[1]

    def make_server(self, handler):
        from http.server import ThreadingHTTPServer
        httpd = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        httpd.daemon_threads = True
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        self.servers.append(httpd)
        return httpd

    def stop(self):
        for httpd in getattr(self, 'servers', []):
            httpd.shutdown()
            httpd.server_close()
        self.servers = []

    def tearDown(self):
        self.stop()
        self.fake.stop()
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def call(self, method, path, body=None, headers=None, function=None):
        c = http.client.HTTPConnection('127.0.0.1', self.ports[function or path], timeout=30)
        h = {'Content-Type': 'application/json'}
        h.update(headers or {})
        c.request(method, path, body=json.dumps(body).encode() if body is not None else None, headers=h)
        r = c.getresponse()
        out = r.read()
        c.close()
        try:
            return r.status, json.loads(out)
        except ValueError:
            return r.status, out

    def submit(self, sid=None, headers=None):
        sid = sid or str(uuid.uuid4())
        return sid, self.call('POST', '/api/report-submissions', {'submissionId': sid, 'form': form(), 'project': project()}, headers)

    def test_each_api_file_defines_its_handler_for_its_route(self):
        from http.server import BaseHTTPRequestHandler
        for route, h in self.handlers.items():
            self.assertTrue(issubclass(h, BaseHTTPRequestHandler), route)
            self.assertEqual(h.route, route)
            self.assertIsNotNone(h.app.db, route)
        # the routes the browser calls (js/services/report-gate.js) are exactly these functions
        with open(os.path.join(ROOT, 'js', 'services', 'report-gate.js'), encoding='utf-8') as f:
            gate = f.read()
        for name in ('health', 'report-submissions', 'report-submissions/verify'):
            self.assertRegex(gate, rf"(api|post)\('{name}'", name)

    def test_submit_verify_and_health(self):
        self.assertEqual(self.call('GET', '/api/health'), (200, {'ok': True, 'store': 'configured'}))
        sid, (status, out) = self.submit()
        self.assertEqual(status, 200, out)
        self.assertEqual(len(self.fake.rows), 1)
        good = {k: out[k] for k in ('submissionId', 'projectId', 'submittedAt', 'receipt')}
        self.assertEqual(self.call('POST', '/api/report-submissions/verify', good)[1]['verified'], True)
        self.assertEqual(self.call('POST', '/api/report-submissions/verify', dict(good, receipt='0' * 64))[1]['verified'], False)

    def test_a_cold_start_loses_the_ledger_and_the_database_decides(self):
        sid, (_, out) = self.submit()
        good = {k: out[k] for k in ('submissionId', 'projectId', 'submittedAt', 'receipt')}
        self.env({'REPORT_DATA_DIR': tempfile.mkdtemp(dir=TMP)})  # /tmp is empty on a new instance
        self.start()
        status, res = self.call('POST', '/api/report-submissions/verify', good)
        self.assertEqual((status, res['verified']), (200, True), 'the receipt key is the same secret; the row is found')
        sid2, (status, again) = self.submit(sid)
        self.assertEqual(status, 200, again)
        self.assertEqual(again['submittedAt'], out['submittedAt'])
        self.assertEqual(len(self.fake.rows), 1, 'a repeat after a cold start adds no row')

    def test_without_the_receipt_secret_the_form_says_it_is_not_connected(self):
        self.env({'REPORT_RECEIPT_SECRET': None})
        self.start()
        self.assertEqual(self.call('GET', '/api/health')[1]['store'], 'not_configured')
        _, (status, out) = self.submit()
        self.assertEqual((status, out['reason']), (503, 'not_configured'))
        self.assertEqual(self.fake.rows or [], [])

    def test_functions_serve_no_files_and_answer_only_their_route(self):
        for path in ('/', '/index.html', '/server/app_server.py', '/server/.env.example', '/README.md'):
            status, _ = self.call('GET', path, function='/api/report-submissions')
            self.assertEqual(status, 404, path)
        self.assertEqual(self.call('GET', '/api/report-submissions')[0], 404)
        self.assertEqual(self.call('POST', '/api/health', {'x': 1})[0], 404)
        # the route is the function's own, whatever path the platform passes on
        status, out = self.call('POST', '/api/anything', {'submissionId': str(uuid.uuid4()), 'form': form(), 'project': project()},
                                function='/api/report-submissions')
        self.assertEqual((status, out['status']), (200, 'success'))

    def test_rate_limit_per_client_from_vercels_address_header(self):
        a, b = {'x-real-ip': '203.0.113.7'}, {'x-real-ip': '198.51.100.9'}
        codes = [self.submit(headers=a)[1][0] for _ in range(6)]
        self.assertEqual(codes, [200] * 5 + [429])
        self.assertEqual(self.submit(headers=b)[1][0], 200, 'another client has its own allowance')
        self.env({'VERCEL': None})  # off Vercel the header is not trusted: everyone is the connection's address
        self.assertEqual(self.submit(headers={'x-real-ip': '192.0.2.1'})[1][0], 200)
        self.assertEqual(self.submit(headers={'x-real-ip': '192.0.2.2'})[1][0], 200)

    def test_origin_is_the_sites_own_domain(self):
        site = {'Host': 'internal.invalid', 'x-forwarded-host': 'acoustic-measurement-app.vercel.app'}
        _, (status, _) = self.submit(headers=dict(site, Origin='https://acoustic-measurement-app.vercel.app'))
        self.assertEqual(status, 200)
        _, (status, _) = self.submit(headers=dict(site, Origin='https://evil.example'))
        self.assertEqual(status, 403)

    def test_vercel_json_publishes_only_the_app(self):
        with open(os.path.join(ROOT, 'vercel.json'), encoding='utf-8') as f:
            cfg = json.load(f)
        self.assertEqual(cfg['outputDirectory'], 'public')
        copied = cfg['buildCommand'].split('cp -r', 1)[1].split()
        self.assertEqual(copied, ['index.html', 'css', 'js', 'assets', 'public/'], 'only the app is published; never server/, docs/, tests/')
        self.assertNotIn('js/', cfg['functions']['api/**/*.py']['excludeFiles'], 'the functions read js/data/report-form.js')


if __name__ == '__main__':
    unittest.main(verbosity=2)
