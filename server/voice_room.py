"""Voice Room Setup: what a sales representative says about a room, turned into proposed Room Setup values.

    POST /api/voice-room   {"audio": base64 WAV} or {"text": "..."}, with {"catalog": "...", "room": "..."}
                           -> {"status": "ok", "text": what was said, "proposal": {...}}
                              {"status": "empty", "text": ""} when nothing was heard

Two models on Cloudflare Workers AI (the free daily allocation on the account's Free plan):
  speech to text   @cf/openai/whisper-large-v3-turbo (English, Hinglish in Latin letters; silence filtered)
  understanding    @cf/openai/gpt-oss-120b, answering in the JSON shape SCHEMA describes, choosing only from the lists
                   the browser sends (catalog: the app's own industries, room types, activities and surface types)

The answer is a proposal only. Nothing here writes to a project: the browser shows it on a confirm card, checks every
value against the app's own lists and limits again (js/services/voice-room.js), and fills Room Setup with the same
actions its buttons use. Nothing said is kept on the server, and the server log names no words, only sizes and times.

Configuration: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN (server/.env locally, Environment Variables on Vercel).
Python standard library only.
"""

import base64
import json
import os
import re
import socket
import time
import urllib.error
import urllib.request

API = 'https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}'
STT_MODEL = '@cf/openai/whisper-large-v3-turbo'
LLM_MODEL = '@cf/openai/gpt-oss-120b'

MAX_SECONDS = 65                          # a recording is stopped at 60 s in the browser
MAX_AUDIO = 16000 * 2 * MAX_SECONDS + 4096  # 16 kHz, 16-bit, mono WAV
MAX_TEXT = 4000
MAX_CATALOG = 40000
MAX_ROOM = 8000
MAX_BODY = 4 * MAX_AUDIO // 3 + MAX_CATALOG + MAX_ROOM + MAX_TEXT + 16384  # base64 audio and the rest, as JSON

# Spelling hints for speech to text: the words reps use for materials (short: the model reads only so much).
VOCABULARY = ('A sales representative describes a room in English or Hinglish. Words: POP false ceiling, gypsum, '
              'Gyproc, Armstrong grid ceiling, vitrified tiles, Kota stone, granite, marble, IPS, epoxy, ACP cladding, '
              'HPL, laminate, veneer, fluted panels, putty, sheesha, kaanch, lakdi, deewar, khidki, darwaza, chhat.')
# What speech to text writes for silence or noise alone: not words the rep said.
NOT_SPEECH = {'', 'you', 'thank you', 'thanks', 'thank you very much', 'thanks for watching', 'thank you for watching', 'bye', 'okay', 'ok'}

INSTRUCTIONS = """You fill in the Room Setup form of an acoustics app from what a sales representative said about one room.
The representative speaks English or Hinglish (Hindi words in Latin letters), e.g. sheesha or kaanch = glass, lakdi = wood,
patthar = stone, deewar = wall, chhat = ceiling, farsh or zameen = floor, khidki = window, darwaza = door, lambi = long,
chhoti = short, baaki = the rest, saari = all, upar = above, neeche = below, ek/do/teen/chaar = 1/2/3/4.

Rules:
- Fill only what the representative actually said. Leave everything else null (or out of the lists). Never guess.
- name: what the representative calls this room, written as a short title ("this is the main board room" gives
  "Main board room"; "Training room A" stays "Training room A"). A room type said alone ("it is a classroom") is not a name.
- Choose names and ids only from the lists given, written exactly as listed.
- industry: one of the industries. roomType: one of that industry's room types; if the room type is not listed, use
  "Other" and put the representative's words in roomTypeOther. activity: one of that room type's activities, only if said.
- Sizes: give the number and the unit as said (m, cm, mm, ft, in); feet and inches together as feet (10 ft 6 in = 10.5 ft).
  length is the longer side of the floor, width the shorter side, height floor to ceiling.
- Walls: wall1 and wall3 are the two long walls (opposite each other), wall2 and wall4 the two end walls (short walls,
  opposite each other). The first long wall mentioned is wall1, the other long wall wall3; the first end wall
  mentioned is wall2, the other wall4. "All walls" means every wall; "the rest" or "baaki" means the walls not yet
  described. A wall the representative names ("the window wall") keeps that name in name.
- Surface types: choose the type id from that surface's list (walls, floor, ceiling). Use the other names listed with
  each type. If nothing in the list is that material, use type "other" and write the material in notListed, in the
  representative's words (short). Use a surface key that exists in the room (the room lists its walls).
- Doors and windows: count them per wall. Only when the wall is clear from what was said; otherwise ask which wall.
- questions: short questions in plain English, at most 4, for what is still missing to finish the form (room name,
  industry, room type, length, width, height) or for something unclear. None when nothing is missing.
- What the room already has stays as it is unless the representative changes it: give only new or changed values."""

DIM = {'type': ['object', 'null'], 'additionalProperties': False,
       'properties': {'value': {'type': 'number'}, 'unit': {'type': 'string', 'enum': ['m', 'cm', 'mm', 'ft', 'in']}},
       'required': ['value', 'unit']}
TEXT = {'type': ['string', 'null']}
SCHEMA = {
    'type': 'object', 'additionalProperties': False,
    'properties': {
        'room': {'type': 'object', 'additionalProperties': False,
                 'properties': {'name': TEXT, 'industry': TEXT, 'roomType': TEXT, 'roomTypeOther': TEXT, 'activity': TEXT,
                                'length': DIM, 'width': DIM, 'height': DIM, 'occupancy': {'type': ['integer', 'null']}},
                 'required': ['name', 'industry', 'roomType', 'roomTypeOther', 'activity', 'length', 'width', 'height', 'occupancy']},
        'surfaces': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False,
                                                'properties': {'surface': {'type': 'string'}, 'type': {'type': 'string'}, 'notListed': TEXT, 'name': TEXT},
                                                'required': ['surface', 'type', 'notListed', 'name']}},
        'openings': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False,
                                                'properties': {'surface': {'type': 'string'}, 'kind': {'type': 'string', 'enum': ['door', 'window']}, 'count': {'type': 'integer'}},
                                                'required': ['surface', 'kind', 'count']}},
        'questions': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['room', 'surfaces', 'openings', 'questions'],
}

# What the browser is told (details stay in the server's console).
MESSAGES = {
    'not_configured': 'Voice is not set up on this server yet (the Cloudflare account ID and token are missing).',
    'invalid': 'The recording could not be read. Try again.',
    'ai_auth': 'The voice service did not accept this server\'s key. Check the Cloudflare token.',
    'ai_quota': 'Today\'s free voice allowance is used up. Fill Room Setup by hand; voice works again after 5:30 AM India time.',
    'ai_busy': 'The voice service is busy. Try again in a minute.',
    'ai_unavailable': 'The voice service could not be reached. Try again, or fill Room Setup by hand.',
    'ai_timeout': 'The voice service did not answer in time. Try again with a shorter description.',
    'ai_unreadable': 'The voice service gave an answer the app could not read. Try again.',
}
STATUS = {'not_configured': 503, 'invalid': 400, 'ai_auth': 502, 'ai_quota': 429, 'ai_busy': 503, 'ai_unavailable': 503,
          'ai_timeout': 504, 'ai_unreadable': 502}


class VoiceError(Exception):
    def __init__(self, code, detail=''):
        super().__init__(f'{code}: {detail}' if detail else code)
        self.code = code


class Invalid(Exception):
    def __init__(self, errors):
        super().__init__('; '.join(f'{k}: {v}' for k, v in errors.items()))
        self.errors = errors


def log(msg):
    print(msg, flush=True)


# ---------- the request ----------

def wav_seconds(data):
    """The length of a PCM WAV in seconds; Invalid if it is not one (or too long)."""
    if len(data) < 44 or data[:4] != b'RIFF' or data[8:12] != b'WAVE':
        raise Invalid({'audio': 'not a WAV recording'})
    pos, rate, block, size = 12, None, None, None
    while pos + 8 <= len(data):
        cid, n = data[pos:pos + 4], int.from_bytes(data[pos + 4:pos + 8], 'little')
        if cid == b'fmt ' and n >= 16:
            fmt, channels, rate = int.from_bytes(data[pos + 8:pos + 10], 'little'), int.from_bytes(data[pos + 10:pos + 12], 'little'), int.from_bytes(data[pos + 12:pos + 16], 'little')
            block = int.from_bytes(data[pos + 20:pos + 22], 'little')
            if fmt != 1 or channels < 1 or not rate or not block:
                raise Invalid({'audio': 'not a PCM recording'})
        elif cid == b'data':
            size = min(n, len(data) - pos - 8)
            break
        pos += 8 + n + (n & 1)
    if rate is None or size is None:
        raise Invalid({'audio': 'not a WAV recording'})
    seconds = size / (rate * block)
    if seconds > MAX_SECONDS:
        raise Invalid({'audio': f'longer than {MAX_SECONDS} s'})
    return seconds


def parse(body):
    """{audio: bytes | None, seconds, text: str | None, catalog, room}. Exactly one of audio and text."""
    if not isinstance(body, dict):
        raise Invalid({'_': 'Send a JSON object.'})
    errors = {}
    audio, text, seconds = body.get('audio'), body.get('text'), 0.0
    if (audio is None) == (text is None):
        errors['_'] = 'Send either a recording (audio) or what was said (text).'
    if audio is not None:
        if not isinstance(audio, str) or len(audio) > 4 * MAX_AUDIO // 3 + 8:
            errors['audio'] = 'missing or too long'
        else:
            try:
                audio = base64.b64decode(audio, validate=True)
                seconds = wav_seconds(audio)
            except (ValueError, TypeError):
                errors['audio'] = 'not base64'
            except Invalid as e:
                errors.update(e.errors)
    if text is not None:
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
            errors['text'] = f'empty or longer than {MAX_TEXT} characters'
        else:
            text = text.strip()
    catalog, room = body.get('catalog'), body.get('room', '')
    if not isinstance(catalog, str) or not catalog.strip() or len(catalog) > MAX_CATALOG:
        errors['catalog'] = 'missing or too long'
    if not isinstance(room, str) or len(room) > MAX_ROOM:
        errors['room'] = 'too long'
    if errors:
        raise Invalid(errors)
    return {'audio': audio, 'seconds': seconds, 'text': text, 'catalog': catalog, 'room': room}


def heard(text):
    """What was said, or '' when speech to text only wrote what it writes for silence or noise."""
    words = re.sub(r'[^\w\s]', '', (text or '').lower()).split()
    return '' if ' '.join(words) in NOT_SPEECH else (text or '').strip()


def final_text(result):
    """The model's final answer (Responses format): the text of its message items, never its reasoning."""
    out = []
    for item in (result or {}).get('output') or []:
        if isinstance(item, dict) and item.get('type') == 'message':
            for c in item.get('content') or []:
                if isinstance(c, dict) and c.get('type') in ('output_text', 'text') and isinstance(c.get('text'), str):
                    out.append(c['text'])
    return ''.join(out)


def proposal_of(text):
    """The JSON object in the model's answer, in the expected shape (the browser checks every value again)."""
    s = (text or '').strip()
    if s.startswith('```'):
        s = re.sub(r'^```(?:json)?\s*|\s*```$', '', s)
    try:
        p = json.loads(s)
    except ValueError:
        m = re.search(r'\{.*\}', s, re.S)
        if not m:
            raise VoiceError('ai_unreadable', 'no JSON in the answer')
        try:
            p = json.loads(m.group(0))
        except ValueError as e:
            raise VoiceError('ai_unreadable', f'JSON: {e}')
    if not isinstance(p, dict):
        raise VoiceError('ai_unreadable', 'not an object')
    room = p.get('room') if isinstance(p.get('room'), dict) else {}
    lists = {k: [x for x in (p.get(k) or []) if isinstance(x, dict)] if isinstance(p.get(k), list) else [] for k in ('surfaces', 'openings')}
    questions = [q.strip() for q in (p.get('questions') or []) if isinstance(q, str) and q.strip()][:4] if isinstance(p.get('questions'), list) else []
    return {'room': room, 'surfaces': lists['surfaces'][:40], 'openings': lists['openings'][:40], 'questions': questions}


# ---------- Cloudflare Workers AI ----------

class Voice:
    def __init__(self, account, token, timeout=55.0, opener=None):
        self.account, self.token, self.timeout = account, token, timeout
        self.opener = opener or urllib.request.urlopen  # the tests pass a fake
        self.effort = os.environ.get('VOICE_REASONING', 'low')

    def run(self, model, payload):
        """One model call: its result, or VoiceError with what went wrong (never the token)."""
        req = urllib.request.Request(API.format(account=self.account, model=model), data=json.dumps(payload).encode('utf-8'), method='POST',
                                     headers={'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/json'})
        try:
            with self.opener(req, timeout=self.timeout) as r:
                status, raw = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, raw = e.code, e.read() or b''
        except (socket.timeout, TimeoutError):
            raise VoiceError('ai_timeout', model)
        except (urllib.error.URLError, OSError) as e:
            raise VoiceError('ai_unavailable', f'{model}: {type(e).__name__}')
        try:
            d = json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            d = {}
        if 200 <= status < 300 and d.get('success') is not False and isinstance(d.get('result'), dict):
            return d['result']
        msgs = ' '.join(str(e.get('message', '')) for e in d.get('errors') or [] if isinstance(e, dict))
        codes = {e.get('code') for e in d.get('errors') or [] if isinstance(e, dict)}
        if re.search(r'daily free allocation|neurons|upgrade to a paid', msgs, re.I) or 3036 in codes:
            raise VoiceError('ai_quota', f'{model}: {status}')
        if status in (401, 403):
            raise VoiceError('ai_auth', f'{model}: {status}')
        if status == 429:
            raise VoiceError('ai_busy', f'{model}: 429')
        if status >= 500:
            raise VoiceError('ai_unavailable', f'{model}: {status}')
        raise VoiceError('ai_unreadable', f'{model}: {status} {msgs[:200]}')

    def transcribe(self, wav):
        result = self.run(STT_MODEL, {'audio': base64.b64encode(wav).decode('ascii'), 'language': 'en', 'task': 'transcribe',
                                      'vad_filter': True, 'initial_prompt': VOCABULARY})
        return heard(result.get('text') if isinstance(result.get('text'), str) else '')

    def understand(self, text, catalog, room):
        prompt = (f'Lists:\n{catalog}\n\nThe room as filled in now:\n{room or "(nothing yet)"}\n\n'
                  f'What the sales representative said:\n"""\n{text}\n"""')
        result = self.run(LLM_MODEL, {'instructions': INSTRUCTIONS, 'input': prompt, 'reasoning': {'effort': self.effort},
                                      'text': {'format': {'type': 'json_schema', 'name': 'room_setup', 'schema': SCHEMA, 'strict': True}}})
        usage = result.get('usage') if isinstance(result.get('usage'), dict) else {}
        return proposal_of(final_text(result)), usage


def from_env():
    """(Voice, None) when configured, otherwise (None, what is missing)."""
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '').strip()
    token = os.environ.get('CLOUDFLARE_AI_TOKEN', '').strip()
    missing = [n for n, v in (('CLOUDFLARE_ACCOUNT_ID', account), ('CLOUDFLARE_AI_TOKEN', token)) if not v]
    if missing:
        return None, f'missing {", ".join(missing)}'
    if not re.fullmatch(r'[0-9a-f]{32}', account):
        return None, 'CLOUDFLARE_ACCOUNT_ID is not a 32-character account ID'
    if re.search(r'\s', token) or len(token) < 20:
        return None, 'CLOUDFLARE_AI_TOKEN is not a single API token (only the token, without "Bearer" or a command)'
    return Voice(account, token), None


def failure(code):
    return STATUS[code], {'status': 'failed', 'reason': code, 'message': MESSAGES[code]}


def handle(voice, body):
    """The request -> (HTTP status, answer)."""
    if not voice:
        return failure('not_configured')
    try:
        req = parse(body)
    except Invalid as e:
        return 400, {'status': 'invalid', 'reason': 'invalid', 'message': MESSAGES['invalid'], 'errors': e.errors}
    t0 = time.monotonic()
    try:
        text = req['text']
        if req['audio'] is not None:
            text = voice.transcribe(req['audio'])
            log(f'Voice: {req["seconds"]:.1f} s heard as {len(text.split())} words in {time.monotonic() - t0:.1f} s')
            if not text:
                return 200, {'status': 'empty', 'text': ''}
        t1 = time.monotonic()
        proposal, usage = voice.understand(text, req['catalog'], req['room'])
        log(f'Voice: understood in {time.monotonic() - t1:.1f} s ({usage.get("neurons", "?")} neurons)')
        return 200, {'status': 'ok', 'text': text, 'proposal': proposal}
    except VoiceError as e:
        log(f'Voice: {e}')
        return failure(e.code)
