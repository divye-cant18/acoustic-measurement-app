"""Supabase client for the report form: inserts into the report_submissions table through Supabase's REST API
(PostgREST). Python standard library only.

The server uses the project's SECRET key (sb_secret_..., or the legacy service_role key), read from server/.env. That
key bypasses row level security, so it must never reach the browser. The table has RLS on and no policies
(server/supabase/schema.sql), so the publishable / anon key can neither read nor write it.

submission_id is the table's primary key, so the database itself refuses a second row for the same submission.

Errors are classified for the caller:
  DbDefinite   Supabase refused the request or could not be reached at all: nothing was written.
  DbUncertain  the request may have been applied (timeout or lost response, a server error): look before retrying.
"""

import http.client
import json
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request


class DbError(Exception):
    def __init__(self, code, message, status=None):
        super().__init__(message)
        self.code = code        # short reason for the browser: db_auth, db_table_missing, ...
        self.status = status    # HTTP status from Supabase, if any


class DbDefinite(DbError):
    pass


class DbUncertain(DbError):
    pass


class SupabaseClient:
    def __init__(self, url, key, table='report_submissions', timeout=15):
        u = urllib.parse.urlsplit(url.strip())
        local = u.hostname in ('127.0.0.1', 'localhost')
        if u.scheme != 'https' and not (u.scheme == 'http' and local):
            raise ValueError('SUPABASE_URL must start with https:// (e.g. https://<project-ref>.supabase.co)')
        self.url = f'{u.scheme}://{u.netloc}'
        self.rest = self.url + '/rest/v1'
        self.key = key.strip()
        self.table = table
        self.timeout = timeout
        self.ctx = ssl.create_default_context()

    def _headers(self, extra=None):
        h = {'apikey': self.key, 'Accept': 'application/json'}
        if not self.key.startswith('sb_'):  # legacy service_role key (a JWT) also goes in Authorization
            h['Authorization'] = f'Bearer {self.key}'
        h.update(extra or {})
        return h

    def _request(self, method, path, query=None, body=None, prefer=None, writes=False):
        url = f'{self.rest}/{path}' + ('?' + urllib.parse.urlencode(query, safe=',.()*') if query else '')
        extra = {'Content-Type': 'application/json'} if body is not None else {}
        if prefer:
            extra['Prefer'] = prefer
        data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
        req = urllib.request.Request(url, data=data, headers=self._headers(extra), method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout, context=self.ctx if url.startswith('https:') else None) as r:
                raw = r.read()
                status = r.status
            try:
                return status, (json.loads(raw.decode('utf-8')) if raw else None)
            except (ValueError, UnicodeDecodeError) as e:  # a 2xx answer that is not JSON: not what PostgREST sends
                if writes:
                    raise DbUncertain('db_unexpected', f'Supabase answered {status} with a body that is not JSON: {e}', status)
                raise DbDefinite('db_unexpected', f'Supabase answered {status} with a body that is not JSON: {e}', status)
        except urllib.error.HTTPError as e:
            try:
                detail = json.loads(e.read().decode('utf-8') or '{}')
            except Exception:
                detail = {}
            finally:
                e.close()
            pg = str(detail.get('code') or '')
            msg = detail.get('message') or detail.get('msg') or detail.get('error') or e.reason
            text = f'Supabase answered {e.code}{f" ({pg})" if pg else ""}: {msg}'
            if e.code == 401 or (e.code == 403 and pg != '42501'):
                raise DbDefinite('db_auth', text, e.code)
            if e.code == 403 or pg == '42501':
                raise DbDefinite('db_permission', text, e.code)
            if e.code == 404 or pg in ('PGRST205', '42P01'):
                raise DbDefinite('db_table_missing', text, e.code)
            if e.code == 409 and pg == '23505':
                raise DbDefinite('db_duplicate', text, e.code)
            if e.code in (400, 406, 409, 422):
                raise DbDefinite('db_request', text, e.code)
            if e.code == 429:
                raise DbDefinite('db_rate_limited', text, e.code)
            if writes:
                raise DbUncertain('db_unavailable', text, e.code)
            raise DbDefinite('db_unavailable', text, e.code)
        except urllib.error.URLError as e:
            # urlopen raises URLError while connecting or sending, before the request has fully reached Supabase:
            # nothing was written. (Waiting for the answer fails with the errors below instead.)
            raise DbDefinite('db_unreachable', f'Could not reach Supabase: {e.reason}')
        except (socket.timeout, TimeoutError, ConnectionError, OSError) as e:
            if writes:
                raise DbUncertain('db_timeout', f'No answer from Supabase: {e}')
            raise DbDefinite('db_timeout', f'No answer from Supabase: {e}')
        except http.client.HTTPException as e:  # e.g. IncompleteRead: the answer broke off after the request was sent
            if writes:
                raise DbUncertain('db_unavailable', f'The answer from Supabase broke off: {type(e).__name__}')
            raise DbDefinite('db_unavailable', f'The answer from Supabase broke off: {type(e).__name__}')

    # ---------- operations ----------

    def check_columns(self, columns):
        """Reads nothing (limit 0) but names every column: Supabase refuses it if the table or a column is missing."""
        status, _ = self._request('GET', self.table, {'select': ','.join(columns), 'limit': '0'})
        return status

    def find(self, sid):
        """The stored row for this submission ID ({submission_id, project_id, submitted_at}), or None."""
        _, rows = self._request('GET', self.table, {'select': 'submission_id,project_id,submitted_at', 'submission_id': f'eq.{sid}', 'limit': '1'})
        return rows[0] if rows else None

    def insert(self, record):
        """Insert one row. 'inserted', or 'exists' when that submission ID is already stored (nothing new is written)."""
        sid = record['submission_id']
        _, rows = self._request('POST', self.table, {'on_conflict': 'submission_id'}, [record],
                                prefer='return=representation,resolution=ignore-duplicates', writes=True)
        if isinstance(rows, list) and not rows:
            return 'exists'
        if isinstance(rows, list) and len(rows) == 1 and str(rows[0].get('submission_id')) == sid and rows[0].get('project_id') == record['project_id']:
            return 'inserted'
        raise DbUncertain('db_unexpected', f'Unexpected insert result: {str(rows)[:300]}')
