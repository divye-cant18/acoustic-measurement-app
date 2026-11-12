"""Voice Room Setup server tests: the real server/app_server.py and server/voice_room.py with a fake Cloudflare Workers AI
(development only).

    python tests/voice_room_test.py

Covers the request checks (a recording or text, sizes, a real WAV), speech to text (silence is not words), the
understanding call (instructions, the lists, a strict JSON shape, only the model's final answer read), every error
the voice service can give and what the browser is told, the rate limit, the origin check, the health check, the key
checks, and that the server log never holds what was said or the token. It never contacts Cloudflare.
"""

import base64
import http.client
import io
import json
import os
import struct
import sys
import threading
import unittest
import urllib.error
from contextlib import redirect_stdout

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'server'))

ACCOUNT = '0123456789abcdef0123456789abcdef'
TOKEN = 'cfut_TestTokenNotRealAbCdEfGhIjKlMnOpQrStUvWxYz012345'
SAID = 'Board room, 26 by 16 feet, POP false ceiling, one long wall full sheesha'
CATALOG = 'Industries and their room types:\n- Corporate offices and meeting rooms: Conference room | Boardroom'
ROOM = 'Name: (none); industry: (none)'


def wav(seconds=1.0, rate=16000, amp=0):
    n = int(seconds * rate)
    data = struct.pack(f'<{n}h', *([amp] * n))
    return (b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, rate, rate * 2, 2, 16)
            + b'data' + struct.pack('<I', len(data)) + data)


def b64(b):
    return base64.b64encode(b).decode()


ANSWER = {'room': {'name': 'Board room', 'industry': None, 'roomType': 'Boardroom', 'roomTypeOther': None, 'activity': None,
                   'length': {'value': 26, 'unit': 'ft'}, 'width': {'value': 16, 'unit': 'ft'}, 'height': None, 'occupancy': None},
          'surfaces': [{'surface': 'wall1', 'type': 'glass', 'notListed': None, 'name': None},
                       {'surface': 'ceiling', 'type': 'gypsum-ceiling', 'notListed': None, 'name': None}],
          'openings': [], 'questions': ['How high is the ceiling?']}


def llm_result(answer=ANSWER, text=None):
    """The Responses format the model answers in: its reasoning first, then the message with the final text."""
    return {'success': True, 'errors': [], 'result': {
        'output': [{'type': 'reasoning', 'content': [{'type': 'reasoning_text', 'text': 'The rep said {"room": "not this"}.'}]},
                   {'type': 'message', 'content': [{'type': 'output_text', 'text': text if text is not None else json.dumps(answer)}]}],
        'usage': {'input_tokens': 1200, 'output_tokens': 300, 'neurons': 95.5}}}


class Reply:
    def __init__(self, status, body):
        self.status, self.body = status, body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeCloudflare:
    """Stands in for urllib.request.urlopen: answers per model from a queue, and records each request."""

    def __init__(self):
        self.calls, self.queue = [], {}

    def answer(self, model, status, body):
        self.queue.setdefault(model, []).append((status, body))

    def __call__(self, req, timeout=None):
        model = req.full_url.split('/ai/run/', 1)[1]
        self.calls.append({'model': model, 'url': req.full_url, 'auth': req.get_header('Authorization'), 'payload': json.loads(req.data)})
        status, body = self.queue.get(model, [(500, {})]).pop(0) if self.queue.get(model) else (500, {})
        if isinstance(body, Exception):
            raise body
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        if status >= 400:
            raise urllib.error.HTTPError(req.full_url, status, 'error', {}, io.BytesIO(raw))
        return Reply(status, raw)

    def models(self):
        return [c['model'] for c in self.calls]


class VoiceCase(unittest.TestCase):
    env = {'CLOUDFLARE_ACCOUNT_ID': ACCOUNT, 'CLOUDFLARE_AI_TOKEN': TOKEN, 'VOICE_LIMITS': '1000/60'}

    def setUp(self):
        keys = set(self.env) | {'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_AI_TOKEN', 'VOICE_LIMITS', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY'}
        self.saved = {k: os.environ.get(k) for k in keys}
        for k in keys:
            os.environ.pop(k, None)
        os.environ.update({k: v for k, v in self.env.items() if v is not None})
        import app_server
        import voice_room
        self.vr = voice_room
        self.log = io.StringIO()
        with redirect_stdout(self.log):
            self.app = app_server.App()
        self.fake = FakeCloudflare()
        if self.app.voice:
            self.app.voice.opener = self.fake
        app_server.Handler.app = self.app
        app_server.Handler.allowed_hosts = None
        self.httpd = app_server.ThreadingHTTPServer(('127.0.0.1', 0), app_server.Handler)
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def call(self, body=None, path='/api/voice-room', method='POST', headers=None, raw=None):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=30)
        h = {'Content-Type': 'application/json'}
        h.update(headers or {})
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        with redirect_stdout(self.log):
            c.request(method, path, body=data, headers=h)
            r = c.getresponse()
            out = r.read()
        c.close()
        try:
            return r.status, json.loads(out)
        except ValueError:
            return r.status, out

    def ask(self, **kw):
        body = {'catalog': CATALOG, 'room': ROOM}
        body.update(kw)
        return self.call(body)


class Configured(VoiceCase):
    def test_health_says_voice_is_configured(self):
        s, d = self.call(path='/api/health', method='GET')
        self.assertEqual((s, d.get('voice')), (200, 'configured'))

    def test_text_is_understood_with_the_lists_and_a_strict_shape(self):
        self.fake.answer(self.vr.LLM_MODEL, 200, llm_result())
        s, d = self.ask(text=SAID)
        self.assertEqual(s, 200, d)
        self.assertEqual((d['status'], d['text']), ('ok', SAID))
        self.assertEqual(d['proposal']['room']['roomType'], 'Boardroom')
        self.assertEqual(d['proposal']['surfaces'][0], {'surface': 'wall1', 'type': 'glass', 'notListed': None, 'name': None})
        self.assertEqual(d['proposal']['questions'], ['How high is the ceiling?'])
        self.assertEqual(self.fake.models(), [self.vr.LLM_MODEL])  # no speech to text for typed text
        p = self.fake.calls[0]['payload']
        self.assertEqual(self.fake.calls[0]['auth'], f'Bearer {TOKEN}')
        self.assertIn(f'/accounts/{ACCOUNT}/ai/run/', self.fake.calls[0]['url'])
        self.assertIn('Never guess', p['instructions'])
        self.assertIn(CATALOG, p['input'])
        self.assertIn(ROOM, p['input'])
        self.assertIn(SAID, p['input'])
        self.assertEqual(p['text']['format']['type'], 'json_schema')
        self.assertTrue(p['text']['format']['strict'])
        self.assertEqual(set(p['text']['format']['schema']['required']), {'room', 'surfaces', 'openings', 'questions'})

    def test_a_recording_is_heard_then_understood(self):
        self.fake.answer(self.vr.STT_MODEL, 200, {'success': True, 'result': {'text': f' {SAID} ', 'word_count': 14}})
        self.fake.answer(self.vr.LLM_MODEL, 200, llm_result())
        s, d = self.ask(audio=b64(wav(2.0, amp=500)))
        self.assertEqual((s, d['status'], d['text']), (200, 'ok', SAID), d)
        self.assertEqual(self.fake.models(), [self.vr.STT_MODEL, self.vr.LLM_MODEL])
        stt = self.fake.calls[0]['payload']
        self.assertEqual((stt['language'], stt['vad_filter'], stt['task']), ('en', True, 'transcribe'))
        self.assertEqual(base64.b64decode(stt['audio']), wav(2.0, amp=500))
        self.assertIn('POP false ceiling', stt['initial_prompt'])
        self.assertIn(SAID, self.fake.calls[1]['payload']['input'])

    def test_silence_is_not_words(self):
        # Speech to text writes "Thank you." for silence: nothing is understood from it.
        for heard in ('Thank you.', '', ' you ', 'Thanks for watching!'):
            self.fake.calls.clear()
            self.fake.answer(self.vr.STT_MODEL, 200, {'success': True, 'result': {'text': heard}})
            s, d = self.ask(audio=b64(wav(1.0)))
            self.assertEqual((s, d), (200, {'status': 'empty', 'text': ''}), heard)
            self.assertEqual(self.fake.models(), [self.vr.STT_MODEL])

    def test_only_the_final_answer_is_read(self):
        # The reasoning holds JSON-looking text; a fenced answer with text around it is still read.
        self.fake.answer(self.vr.LLM_MODEL, 200, llm_result(text='Here it is:\n```json\n' + json.dumps(ANSWER) + '\n```'))
        s, d = self.ask(text=SAID)
        self.assertEqual((s, d['proposal']['room']['name']), (200, 'Board room'), d)

    def test_lists_are_cut_and_odd_items_dropped(self):
        a = dict(ANSWER, surfaces=[{'surface': f'wall{i}', 'type': 'glass'} for i in range(60)] + ['not an object'],
                 questions=['q1', ' ', 'q2', 'q3', 'q4', 'q5', 7])
        self.fake.answer(self.vr.LLM_MODEL, 200, llm_result(a))
        s, d = self.ask(text=SAID)
        self.assertEqual((len(d['proposal']['surfaces']), d['proposal']['questions']), (40, ['q1', 'q2', 'q3', 'q4']))

    def test_requests_that_are_refused(self):
        cases = [
            ({'catalog': CATALOG}, '_'),                                                # neither
            ({'catalog': CATALOG, 'text': 'x', 'audio': b64(wav())}, '_'),               # both
            ({'catalog': CATALOG, 'text': '   '}, 'text'),
            ({'catalog': CATALOG, 'text': 'x' * 4001}, 'text'),
            ({'catalog': CATALOG, 'audio': 'not base64!!'}, 'audio'),
            ({'catalog': CATALOG, 'audio': b64(b'ID3' + b'\0' * 100)}, 'audio'),        # an MP3, not a WAV
            ({'catalog': CATALOG, 'audio': b64(wav(66))}, 'audio'),                     # longer than 65 s
            ({'text': SAID}, 'catalog'),
            ({'text': SAID, 'catalog': CATALOG, 'room': 'x' * 8001}, 'room'),
        ]
        for body, field in cases:
            s, d = self.call(body)
            self.assertEqual((s, d.get('status')), (400, 'invalid'), body.keys())
            self.assertIn(field, d['errors'])
        self.assertEqual(self.fake.calls, [])
        s, d = self.call(raw=b'{not json')
        self.assertEqual(s, 400)
        s, d = self.call({'text': SAID, 'catalog': CATALOG}, headers={'Content-Type': 'text/plain'})
        self.assertEqual(s, 415)

    def test_a_minute_of_speech_fits_and_more_is_refused(self):
        self.fake.answer(self.vr.STT_MODEL, 200, {'success': True, 'result': {'text': SAID}})
        self.fake.answer(self.vr.LLM_MODEL, 200, llm_result())
        s, d = self.ask(audio=b64(wav(60.0, amp=300)))  # about 2.6 MB as JSON: far over the form's 16 KB
        self.assertEqual((s, d['status']), (200, 'ok'))
        # Refused from the size the request announces, before its body is read.
        self.assertEqual(self.announce('/api/voice-room', self.vr.MAX_BODY + 1), 413)
        self.assertEqual(self.announce('/api/report-submissions', 20000), 413)  # the form keeps its own 16 KB limit

    def announce(self, path, size):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=30)
        c.putrequest('POST', path)
        c.putheader('Content-Type', 'application/json')
        c.putheader('Content-Length', str(size))
        c.endheaders()
        r = c.getresponse()
        r.read()
        c.close()
        return r.status

    def test_what_the_browser_is_told_when_the_service_fails(self):
        cases = [
            (401, {'success': False, 'errors': [{'code': 10000, 'message': 'Authentication error'}]}, 502, 'ai_auth'),
            (403, {'success': False, 'errors': [{'message': 'Forbidden'}]}, 502, 'ai_auth'),
            (429, {'success': False, 'errors': [{'code': 3036, 'message': 'Account limited: you have used up your daily free allocation of 10,000 neurons'}]}, 429, 'ai_quota'),
            (400, {'success': False, 'errors': [{'message': 'You have used up your daily free allocation of 10,000 neurons, please upgrade'}]}, 429, 'ai_quota'),
            (429, {'success': False, 'errors': [{'message': 'Too many requests'}]}, 503, 'ai_busy'),
            (500, {}, 503, 'ai_unavailable'),
            (200, {'success': True, 'result': {'output': []}}, 502, 'ai_unreadable'),
            (200, b'<html>', 502, 'ai_unreadable'),
            (0, TimeoutError(), 504, 'ai_timeout'),
            (0, urllib.error.URLError('no route'), 503, 'ai_unavailable'),
        ]
        for status, body, want, reason in cases:
            self.fake.answer(self.vr.LLM_MODEL, status, body)
            s, d = self.ask(text=SAID)
            self.assertEqual((s, d.get('reason')), (want, reason), (status, body))
            self.assertEqual(d['message'], self.vr.MESSAGES[reason])
            self.assertNotIn(TOKEN, json.dumps(d))
        self.assertIn('5:30 AM India time', self.vr.MESSAGES['ai_quota'])

    def test_other_sites_are_refused(self):
        s, d = self.call({'text': SAID, 'catalog': CATALOG}, headers={'Origin': 'https://evil.example'})
        self.assertEqual((s, d['reason']), (403, 'origin'))
        self.assertEqual(self.fake.calls, [])

    def test_the_log_holds_no_words_and_no_token(self):
        self.fake.answer(self.vr.STT_MODEL, 200, {'success': True, 'result': {'text': SAID}})
        self.fake.answer(self.vr.LLM_MODEL, 200, llm_result())
        self.ask(audio=b64(wav(1.5, amp=300)))
        self.fake.answer(self.vr.LLM_MODEL, 401, {'success': False, 'errors': [{'message': 'Authentication error'}]})
        self.ask(text=SAID)
        log = self.log.getvalue()
        self.assertIn('Voice:', log)
        for secret in (SAID, 'sheesha', TOKEN, ACCOUNT):
            self.assertNotIn(secret, log)


class RateLimited(VoiceCase):
    env = dict(VoiceCase.env, VOICE_LIMITS='2/60')

    def test_a_device_is_limited(self):
        for _ in range(2):
            self.fake.answer(self.vr.LLM_MODEL, 200, llm_result())
            s, d = self.ask(text=SAID)
            self.assertEqual(s, 200)
        s, d = self.ask(text=SAID)
        self.assertEqual((s, d['reason']), (429, 'rate_limited'))
        self.assertEqual(len(self.fake.calls), 2)


class NotConfigured(VoiceCase):
    env = {'CLOUDFLARE_ACCOUNT_ID': None, 'CLOUDFLARE_AI_TOKEN': None, 'VOICE_LIMITS': '1000/60'}

    def test_voice_says_it_is_not_set_up(self):
        s, d = self.call(path='/api/health', method='GET')
        self.assertEqual(d.get('voice'), 'not_configured')
        s, d = self.ask(text=SAID)
        self.assertEqual((s, d['reason']), (503, 'not_configured'))
        self.assertIn('not set up', d['message'])


class Keys(unittest.TestCase):
    def check(self, account, token):
        old = {k: os.environ.get(k) for k in ('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_AI_TOKEN')}
        os.environ['CLOUDFLARE_ACCOUNT_ID'], os.environ['CLOUDFLARE_AI_TOKEN'] = account, token
        try:
            import voice_room
            return voice_room.from_env()
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_keys_are_checked_before_use(self):
        self.assertIsNotNone(self.check(ACCOUNT, TOKEN)[0])
        # The whole example command pasted instead of the token alone, as can happen from Cloudflare's page.
        v, why = self.check(ACCOUNT, f'curl "https://api.cloudflare.com/client/v4/user/tokens/verify" -H "Authorization: Bearer {TOKEN}"')
        self.assertIsNone(v)
        self.assertIn('only the token', why)
        self.assertNotIn(TOKEN, why)
        v, why = self.check('not-an-account', TOKEN)
        self.assertIsNone(v)
        self.assertIn('32-character', why)
        v, why = self.check('', '')
        self.assertIn('missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_TOKEN', why)


if __name__ == '__main__':
    unittest.main(verbosity=2)
