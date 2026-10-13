"""Report form submissions: validation, the database record, the submission ledger and receipts.

Everything a submission may contain is defined in js/data/report-form.js (the same file the browser loads). A request
with any field that is not listed there is rejected, so nothing unlisted can reach the database.

The ledger (server/data/submissions-ledger.json) makes submissions idempotent: one submission ID is one row, however
often it is sent (the table's primary key enforces the same in the database). It holds no personal data: only the ID,
a hash of the submitted content, the project ID, the status and times. Receipts are HMAC-signed, so a browser cannot
make one up to unlock a report.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
import unicodedata
from collections import deque
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC_FILE = os.path.join(ROOT, 'js', 'data', 'report-form.js')

ID_PATTERN = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')  # a UUID
EMAIL_PATTERN = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')
CONTROL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


def load_spec(path=SPEC_FILE):
    """The JSON between the FORM-SPEC markers of js/data/report-form.js."""
    with open(path, encoding='utf-8') as f:
        text = f.read()
    m = re.search(r'/\*\s*FORM-SPEC-BEGIN\s*\*/(.*?)/\*\s*FORM-SPEC-END\s*\*/', text, re.S)
    if not m:
        raise ValueError(f'No FORM-SPEC markers in {path}')
    spec = json.loads(m.group(1))
    for c in spec['columns']:
        kind, _, key = c['source'].partition('.')
        if kind == 'form' and key not in {f['key'] for f in spec['fields']}:
            raise ValueError(f'Column {c["header"]!r} reads unknown form field {key!r}')
        if kind == 'project' and key not in {f['key'] for f in spec['project']}:
            raise ValueError(f'Column {c["header"]!r} reads unknown project field {key!r}')
    return spec


def columns(spec):
    return [c['column'] for c in spec['columns']]


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def normalise_time(value):
    """A timestamp as the database returns it ('2026-10-09T07:45:05+00:00') -> '2026-10-09T07:45:05Z', or None."""
    if not isinstance(value, str) or not value:
        return None
    try:
        d = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


class Invalid(Exception):
    def __init__(self, errors):
        super().__init__('invalid submission')
        self.errors = errors


def clean_text(value, multiline=False):
    s = unicodedata.normalize('NFC', value)
    s = s.replace('\r\n', '\n').replace('\r', '\n')
    s = CONTROL.sub('', s)
    if not multiline:
        s = re.sub(r'\s+', ' ', s)
    return s.strip()


def validate(spec, body):
    """-> (submission_id, form, project), or raises Invalid({field: message})."""
    errors = {}
    if not isinstance(body, dict):
        raise Invalid({'_': 'The request must be a JSON object.'})
    extra = set(body) - {'submissionId', 'form', 'project'}
    if extra:
        raise Invalid({'_': f'Unexpected field(s): {", ".join(sorted(extra))}'})
    sid = body.get('submissionId')
    if not isinstance(sid, str) or not ID_PATTERN.match(sid):
        errors['submissionId'] = 'Missing or malformed submission ID.'
    else:
        sid = sid.lower()

    form_in, project_in = body.get('form'), body.get('project')
    if not isinstance(form_in, dict) or not isinstance(project_in, dict):
        raise Invalid(dict(errors, _='The request needs a form and a project summary.'))
    fields = {f['key']: f for f in spec['fields']}
    extra = set(form_in) - set(fields)
    if extra:
        raise Invalid({'_': f'Unexpected form field(s): {", ".join(sorted(extra))}'})
    pfields = {f['key']: f for f in spec['project']}
    extra = set(project_in) - set(pfields)
    if extra:
        raise Invalid({'_': f'Unexpected project field(s): {", ".join(sorted(extra))}'})

    form = {}
    for key, f in fields.items():
        v = form_in.get(key)
        t = f['type']
        if t in ('consent', 'checkbox'):
            if v is None:
                v = False
            if not isinstance(v, bool):
                errors[key] = 'Must be true or false.'
                continue
            if f.get('required') and not v:
                errors[key] = 'Required to submit the form.'
            form[key] = v
            continue
        if v is None:
            v = ''
        if not isinstance(v, str):
            errors[key] = 'Must be text.'
            continue
        v = clean_text(v, multiline=(t == 'textarea'))
        if not v:
            if f.get('required'):
                errors[key] = 'Required.'
            form[key] = ''
            continue
        if len(v) > f.get('maxLength', 200):
            errors[key] = f'At most {f.get("maxLength", 200)} characters.'
        elif len(v) < f.get('minLength', 0):
            errors[key] = f'At least {f["minLength"]} characters.'
        elif t == 'email' and not EMAIL_PATTERN.match(v):
            errors[key] = 'Not a valid email address.'
        elif t == 'select' and v not in f['options']:
            errors[key] = 'Not one of the listed options.'
        elif t == 'country' and v not in spec['countries']:
            errors[key] = 'Not one of the listed countries.'
        form[key] = v

    project = {}
    for key, f in pfields.items():
        v = project_in.get(key)
        if f['type'] == 'number':
            if v is None and f.get('nullable'):
                project[key] = None
                continue
            if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or v in (float('inf'), float('-inf')):
                errors[f'project.{key}'] = 'Must be a number.'
                continue
            if not (f['min'] <= v <= f['max']):
                errors[f'project.{key}'] = 'Out of range.'
                continue
            project[key] = round(float(v), f.get('decimals', 2))
            continue
        if v is None:
            v = ''
        if not isinstance(v, str):
            errors[f'project.{key}'] = 'Must be text.'
            continue
        v = clean_text(v)
        if not v and not f.get('allowEmpty') and 'enum' not in f:
            errors[f'project.{key}'] = 'Required.'
        elif len(v) > f.get('maxLength', 120):
            errors[f'project.{key}'] = 'Too long.'
        elif 'pattern' in f and v and not re.match(f['pattern'], v):
            errors[f'project.{key}'] = 'Not allowed.'
        elif 'enum' in f and v not in f['enum']:
            errors[f'project.{key}'] = 'Not one of the allowed values.'
        project[key] = v

    if errors:
        raise Invalid(errors)
    return sid, form, project


def content_hash(sid, form, project):
    """What one submission ID stands for: the same ID with different content is refused."""
    blob = json.dumps({'id': sid, 'form': form, 'project': project}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode('utf-8')).hexdigest()


def build_record(spec, sid, form, project, timestamp):
    """One database row {column: value}, from the allowlisted values only. A value the project does not have, or an
    optional answer left empty, is null. Text is stored as typed: the REST API sends it as a JSON value, never as SQL,
    and a database never evaluates it as a formula."""
    record = {}
    for c in spec['columns']:
        kind, _, key = c['source'].partition('.')
        if kind == 'form':
            v = form.get(key, '')
        elif kind == 'project':
            v = project.get(key)
        elif c['source'] == 'server.submissionId':
            v = sid
        elif c['source'] == 'server.timestamp':
            v = timestamp
        elif c['source'] == 'server.consent':
            v = form.get('consent') is True
        elif c['source'] == 'server.marketing':
            v = form.get('marketing') is True
        elif c['source'] == 'server.appVersion':
            v = spec.get('appVersion', '')
        else:
            raise ValueError(f'Unknown column source {c["source"]!r}')
        record[c['column']] = None if v == '' else v
    return record


class Ledger:
    """Submission ID -> {status, hash, projectId, submittedAt, range, ...}. Written atomically after every change."""

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.locks = {}
        self.items = {}
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                self.items = json.load(f)

    def id_lock(self, sid):
        with self.lock:
            return self.locks.setdefault(sid, threading.Lock())

    def get(self, sid):
        with self.lock:
            rec = self.items.get(sid)
            return dict(rec) if rec else None

    def put(self, sid, **fields):
        with self.lock:
            rec = dict(self.items.get(sid) or {}, **fields, updatedAt=utc_now())
            rec.setdefault('createdAt', rec['updatedAt'])
            self.items[sid] = rec
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            tmp = self.path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(self.items, f, indent=1, sort_keys=True)
            os.replace(tmp, self.path)
            return dict(rec)


class Receipts:
    """HMAC-signed receipts. The key comes from REPORT_RECEIPT_SECRET, or is made once and kept in server/data."""

    def __init__(self, secret_file, secret=None):
        self.secret_file = secret_file
        self._key = secret.encode('utf-8') if secret else None
        self._lock = threading.Lock()

    @property
    def key(self):  # made on first use, so --check changes nothing
        with self._lock:
            if self._key is None:
                if not os.path.exists(self.secret_file):
                    os.makedirs(os.path.dirname(self.secret_file), exist_ok=True)
                    with open(self.secret_file, 'w', encoding='utf-8') as f:
                        f.write(secrets.token_hex(32))
                with open(self.secret_file, encoding='utf-8') as f:
                    self._key = f.read().strip().encode('utf-8')
            return self._key

    def sign(self, sid, project_id, submitted_at):
        msg = f'{sid}|{project_id}|{submitted_at}'.encode('utf-8')
        return hmac.new(self.key, msg, hashlib.sha256).hexdigest()

    def valid(self, sid, project_id, submitted_at, receipt):
        if not all(isinstance(x, str) for x in (sid, project_id, submitted_at, receipt)):
            return False
        return hmac.compare_digest(self.sign(sid, project_id, submitted_at), receipt)


class RateLimiter:
    """Requests per client in a sliding window, in memory only (the address is never stored or sent anywhere)."""

    def __init__(self, limits):
        self.limits = limits  # [(count, seconds), ...]
        self.hits = {}
        self.lock = threading.Lock()

    def allow(self, client):
        now = time.monotonic()
        longest = max(s for _, s in self.limits)
        with self.lock:
            q = self.hits.setdefault(client, deque())
            while q and now - q[0] > longest:
                q.popleft()
            for count, seconds in self.limits:
                if sum(1 for t in q if now - t <= seconds) >= count:
                    return False
            q.append(now)
            return True
