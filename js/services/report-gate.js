/* Report gate — the form a user submits before a project's report (PDF) unlocks.

     view(project)         -> what the "Project report" card on Final Result shows (the interface draws it): the form
                              until it has been received, then the Download PDF Report button.
     submit(project)       -> validates, sends the form to the app server (server/app_server.py), which stores one row
                              in the Supabase table report_submissions and answers with a signed receipt.
     check(project)        -> async { ok, message }: asks the server to confirm this project's receipt. AM.report.download
                              calls it before every download, so no route to the PDF skips it.
     isUnlocked(project)   -> the receipt was confirmed by the server in this session.

   What is sent is fixed by js/data/report-form.js (the same list the server enforces): the form fields and a short
   project summary from AM.derive. Nothing else: no recordings, measurement data, project files or the report.

   States: Not submitted → Form incomplete / Ready to submit → Submitting → Submitted, Submission failed, or Not
   confirmed (the answer was lost: "Check again" sends the SAME submission ID, which the server never writes twice).

   Kept in this browser (localStorage, one entry per project): the submission ID and, once received, the server's
   receipt. Until it is received the answers are kept too, so a retry after a reload is still the same submission.
   A stored receipt alone never unlocks anything: the server confirms it first. This is a browser application, so
   someone who edits its code on their own computer can still build a report; the database is the record. */
(function (AM) {
  'use strict';
  const { isNum } = AM.util;
  const S = AM.store, ui = AM.ui, SPEC = AM.reportForm;
  const KEY = 'acoustic-measurement-prototype:report-submissions';
  const api = path => new URL(`api/${path}`, document.baseURI).href;
  const SUBMIT_TIMEOUT_MS = 40000, VERIFY_TIMEOUT_MS = 12000;
  const brand = () => (AM.brand && AM.brand.name) || 'Univicoustic';
  const FIELDS = SPEC.fields;
  const F = Object.fromEntries(FIELDS.map(f => [f.key, f]));

  /* ---------- state ---------- */
  const drafts = new Map();     // project id -> { values, attempted, touched: Set, errors }
  const confirmed = new Map();  // project id -> submission id the server confirmed in this session
  const verifying = new Map();  // project id -> promise
  const problems = new Map();   // project id -> { kind: 'failed' | 'uncertain' | 'unconfirmed', message, retry }
  let busy = null;              // project id being submitted
  let lastContact = null;       // the contact details typed this session, offered for the next project
  let health = null;            // null (not asked) | 'checking' | 'ok' | 'not_configured' | 'unreachable' | 'file'

  let memory = null; // when storage is unavailable: this session only
  function readAll() {
    if (memory) return memory;
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeAll(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); memory = null; } catch (e) { memory = all; } }
  const records = readAll;
  function record(p) {
    const rec = records()[p.id];
    if (rec && rec.createdAt !== p.createdAt) { forget(p); return null; } // the project was reset: its submission was for other data
    return rec || null;
  }
  function saveRecord(p, rec) {
    const all = records();
    all[p.id] = Object.assign({ createdAt: p.createdAt }, rec);
    writeAll(all);
    return all[p.id];
  }
  function forget(p) { const all = records(); delete all[p.id]; writeAll(all); confirmed.delete(p.id); }
  // Entries of projects that no longer exist on this device.
  function prune() {
    const all = readAll(), ids = new Set(S.state.projects.map(p => p.id));
    let changed = false;
    Object.keys(all).forEach(id => { if (!ids.has(id)) { delete all[id]; changed = true; } });
    if (changed) writeAll(all);
  }

  function draft(p) {
    if (!drafts.has(p.id)) {
      const rec = record(p), values = {};
      FIELDS.forEach(f => { values[f.key] = f.type === 'consent' || f.type === 'checkbox' ? false : ''; });
      if (rec && rec.form) Object.assign(values, rec.form);          // a submission not received yet: exactly what was sent
      else if (lastContact) Object.assign(values, lastContact);      // the details typed for another project this session
      drafts.set(p.id, { values, attempted: false, touched: new Set(), errors: {} });
    }
    return drafts.get(p.id);
  }

  /* ---------- what is sent ---------- */
  function projectSummary(p) {
    // The room's values over its measuring positions (AM.derive.room): 1000 Hz and the all-band average as the columns
    // have always held them, now averaged over the positions; no column changes meaning or is added.
    const D = AM.derive, g = D.geometry(p), t = D.target(p), m = D.room(p), pred = D.prediction(p), avg = D.averageRT60(p);
    // A number as the app shows it, or null when the project has none, or one outside the range the database accepts
    // (every one of them may be null): a value the server would refuse must not keep the whole form from being sent.
    const PF = Object.fromEntries(SPEC.project.map(f => [f.key, f]));
    const r = (key, x) => { const f = PF[key]; if (!isNum(x)) return null; const v = Number(x.toFixed(f.decimals)); return v >= f.min && v <= f.max ? v : null; };
    // Text cut to whole characters: cutting inside an emoji would send half of it, which no database can store.
    const cut = (x, n) => Array.from(String(x || '')).slice(0, n).join('');
    const treatmentStatus = p.followUpOf ? 'Measured after treatment' : pred ? 'Predicted' : D.noTreatment(p) ? 'No treatment'
      : D.treatmentItems(p).length ? 'Planned' : 'Not selected';
    return {
      projectId: p.id,
      projectName: cut(p.room.name, PF.projectName.maxLength),
      roomType: cut(p.room.type === AM.demo.OTHER_TYPE && (p.room.typeOther || '').trim() ? `Other: ${p.room.typeOther.trim()}` : p.room.type, PF.roomType.maxLength),
      roomVolumeM3: g ? r('roomVolumeM3', g.V) : null,
      targetRt60: t ? r('targetRt60', t.preferred) : null,
      measuredRt60: m ? r('measuredRt60', m.headline.rt60) : null,               // at 1000 Hz, the reference band, over the positions
      measuredRt60Avg: avg && avg.available ? r('measuredRt60Avg', avg.value) : null, // average of the bands measured: the room's RT60
      measurementMethod: m && m.headline.method ? cut(m.headline.method, PF.measurementMethod.maxLength) : '',
      predictedRt60: pred ? r('predictedRt60', pred.headline.predicted) : null,  // at 1000 Hz
      predictedRt60Avg: pred && pred.allBands ? r('predictedRt60Avg', pred.allBands.value) : null, // predicted average over the bands of the measured all-band average
      treatmentStatus,
      customMaterials: customMaterials(p.room, PF.customMaterials),
    };
  }
  /* Materials the user typed in on Room Setup ("Other / not listed"), each once (a duplicated wall repeats them): what it
     is, on which kind of surface, its name and notes. Sent so they can be reviewed for the library (in Supabase:
     public.custom_material_queue); nothing else about the room is sent. */
  function customMaterials(room, f) {
    const seen = new Set(), cut = (x, n) => Array.from(String(x || '')).slice(0, n).join('');
    return AM.services.surfaces.customMaterials(room).map(x => ({ kind: x.kind, surface: x.surface, name: cut(x.name, f.nameMax), notes: cut(x.notes, f.notesMax) }))
      .filter(x => Array.from(x.name).length >= f.nameMin && f.kinds.includes(x.kind) && f.surfaces.includes(x.surface))
      .filter(x => { const k = JSON.stringify([x.kind, x.surface, x.name.toLowerCase(), x.notes]); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, f.maxItems);
  }
  function cleanForm(values) {
    const out = {};
    FIELDS.forEach(f => {
      const v = values[f.key];
      if (f.type === 'consent' || f.type === 'checkbox') out[f.key] = v === true;
      else if (f.type === 'textarea') out[f.key] = String(v || '').replace(/\r\n?/g, '\n').trim();
      else out[f.key] = String(v || '').replace(/\s+/g, ' ').trim();
    });
    return out;
  }

  /* ---------- validation (the server checks the same rules again) ---------- */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function fieldError(f, raw) {
    if (f.type === 'consent') return raw === true ? '' : 'Tick this box to send the form. The report needs it.';
    if (f.type === 'checkbox') return '';
    const v = f.type === 'textarea' ? String(raw || '').trim() : String(raw || '').replace(/\s+/g, ' ').trim();
    if (!v) {
      if (!f.required) return '';
      return f.placeholder ? `${f.placeholder}.` : `Enter your ${f.label.toLowerCase()}.`;
    }
    if (f.maxLength && v.length > f.maxLength) return `Use at most ${f.maxLength} characters.`;
    if (f.minLength && v.length < f.minLength) return `Enter at least ${f.minLength} characters.`;
    if (f.type === 'email' && (!EMAIL.test(v) || v.length > 254)) return 'Enter a valid email address, like name@example.com.';
    if (f.type === 'select' && !f.options.includes(v)) return `${f.placeholder}.`;
    if (f.type === 'country' && !SPEC.countries.includes(v)) return `${f.placeholder}.`;
    return '';
  }
  function validateAll(values) {
    const errors = {};
    FIELDS.forEach(f => { const e = fieldError(f, values[f.key]); if (e) errors[f.key] = e; });
    return errors;
  }

  /* ---------- talking to the server ---------- */
  async function post(path, body, timeout) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(api(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal, cache: 'no-store', credentials: 'same-origin' });
      let data = null;
      try { data = await r.json(); } catch (e) { /* not JSON: not this server */ }
      return { http: r.status, data };
    } catch (e) {
      return { transport: e && e.name === 'AbortError' ? 'timeout' : 'network' };
    } finally { clearTimeout(timer); }
  }
  function checkHealth() {
    if (location.protocol === 'file:') { health = 'file'; return Promise.resolve(health); }
    health = 'checking';
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 6000);
    return fetch(api('health'), { cache: 'no-store', signal: ctrl.signal })
      .then(r => r.json()).then(d => { health = d && d.ok ? (d.store === 'configured' ? 'ok' : 'not_configured') : 'unreachable'; })
      .catch(() => { health = 'unreachable'; })
      .then(() => { clearTimeout(timer); AM.app.render(); return health; });
  }
  const newId = () => (crypto.randomUUID ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-'));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const FAIL_TEXT = {
    not_configured: 'The report form is not connected to its database yet, so it cannot be sent. Nothing was recorded.',
    rate_limited: 'Too many attempts from this device. Wait a minute, then try again.',
    no_server: 'The report server is not running, so the form cannot be sent. Open the app from the address shown by server/app_server.py.',
    conflict: 'This submission could not be matched. Send the form again.',
  };

  async function send(p, rec) {
    busy = p.id;
    problems.delete(p.id);
    AM.app.render();
    const res = await post('report-submissions', { submissionId: rec.submissionId, form: rec.form, project: rec.project }, SUBMIT_TIMEOUT_MS);
    busy = null;
    const d = res.data || {}, now = record(p);
    if (!now || now.submissionId !== rec.submissionId) { AM.app.render(); return; } // the project was reset meanwhile
    if (res.http === 200 && d.status === 'success' && d.submissionId === rec.submissionId && d.projectId === p.id && typeof d.receipt === 'string' && d.receipt) {
      saveRecord(p, { submissionId: d.submissionId, status: 'success', submittedAt: d.submittedAt, receipt: d.receipt });
      confirmed.set(p.id, d.submissionId);
      drafts.delete(p.id);
      S.toast('Form received. The PDF report is unlocked.');
      AM.app.render();
      const b = document.getElementById('rf-download');
      if (b) { b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (res.transport || res.http === 504 || (res.http >= 500 && res.http !== 501 && res.http !== 502 && res.http !== 503)) {
      // No answer, or the server could not confirm the write: it may have been recorded. Retry with the same ID only.
      saveRecord(p, Object.assign({}, rec, { status: 'uncertain' }));
      problems.set(p.id, { kind: 'uncertain', message: res.transport === 'timeout' ? 'The report server did not answer in time.' : res.transport ? 'The connection to the report server was lost.' : (d.message || 'The submission was not confirmed.') });
    } else if (res.http === 400 && d.status === 'invalid') {
      forget(p);
      const dr = draft(p);
      dr.attempted = true;
      dr.errors = {};
      Object.entries(d.errors || {}).forEach(([k, v]) => { if (F[k]) dr.errors[k] = v; });
      // Errors outside the form (the project summary, the request itself) are named, so the reason is not hidden.
      const other = Object.entries(d.errors || {}).filter(([k]) => !F[k]).map(([k, v]) => `${k.replace(/^project\./, '')}: ${v}`);
      problems.set(p.id, { kind: 'failed', message: Object.keys(dr.errors).length ? 'Some details need correcting. Nothing was recorded.' : `The form could not be sent as it is${other.length ? ` (${other.join('; ')})` : ''}. Nothing was recorded.` });
    } else {
      const reason = d.reason || ([404, 405, 501].includes(res.http) ? 'no_server' : 'failed');
      if (reason === 'conflict') forget(p); else saveRecord(p, Object.assign({}, rec, { status: 'failed' }));
      problems.set(p.id, { kind: 'failed', message: FAIL_TEXT[reason] || `${d.message || 'The form could not be sent.'} Nothing was recorded.` });
    }
    AM.app.render();
  }

  function submit(p) {
    if (busy) return;
    const dr = draft(p);
    dr.attempted = true;
    dr.errors = validateAll(dr.values);
    if (Object.keys(dr.errors).length) {
      problems.delete(p.id);
      AM.app.render();
      const first = FIELDS.find(f => dr.errors[f.key]);
      const el = first && document.getElementById(`rf-${first.key}`);
      if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
      return;
    }
    const form = cleanForm(dr.values), project = projectSummary(p);
    lastContact = { fullName: form.fullName, email: form.email, role: form.role, organization: form.organization, country: form.country };
    const rec = record(p);
    // The same answers keep the same ID (a retry); changed answers are a new submission.
    const sid = rec && rec.status !== 'success' && same(rec.form, form) && same(rec.project, project) ? rec.submissionId : newId();
    send(p, saveRecord(p, { submissionId: sid, status: 'sending', form, project }));
  }

  // "Check again" after an unconfirmed outcome: the very same submission, never a new one.
  function retry(p) {
    const rec = record(p);
    if (rec && rec.form && rec.status !== 'success') send(p, rec);
    else if (rec && rec.status === 'success') { confirmed.delete(p.id); problems.delete(p.id); verify(p); }
  }

  /* ---------- confirming a receipt ---------- */
  function verify(p) {
    if (verifying.has(p.id)) return verifying.get(p.id);
    const rec = record(p);
    if (!rec || rec.status !== 'success') return Promise.resolve({ ok: false });
    const job = post('report-submissions/verify', { submissionId: rec.submissionId, projectId: p.id, submittedAt: rec.submittedAt, receipt: rec.receipt }, VERIFY_TIMEOUT_MS).then(res => {
      verifying.delete(p.id);
      const d = res.data || {};
      if (res.http === 200 && d.verified === true) { confirmed.set(p.id, rec.submissionId); problems.delete(p.id); return { ok: true }; }
      confirmed.delete(p.id);
      if (res.http === 200 && d.verified === false) {
        // The server does not recognise this receipt: it unlocks nothing. The form can be sent again.
        forget(p);
        problems.set(p.id, { kind: 'unconfirmed', message: 'The report server could not confirm this project’s earlier submission, so the report is locked. Send the form again to unlock it.' });
        return { ok: false, message: 'The earlier submission could not be confirmed. Send the report form again.' };
      }
      problems.set(p.id, { kind: 'unreachable', message: 'The report server could not be reached to confirm this project’s submission, so the report stays locked for now.' });
      return { ok: false, message: 'The report server could not confirm the submission. Try again when it is running.' };
    });
    verifying.set(p.id, job);
    job.then(() => AM.app.render());
    return job;
  }

  // Before every download (AM.report.download): always asks the server, whatever this page remembers.
  async function check(p) {
    const rec = p && record(p);
    if (!rec || rec.status !== 'success') return { ok: false, message: 'Send the report form on Final Result to unlock the PDF report.' };
    return verify(p);
  }
  const isUnlocked = p => { const rec = p && record(p); return !!(rec && rec.status === 'success' && confirmed.get(p.id) === rec.submissionId); };

  // Called when Final Result is drawn: ask the server what it needs to know, once.
  function mount(p) {
    if (health === null) checkHealth();
    const rec = record(p);
    if (rec && rec.status === 'success' && !confirmed.has(p.id) && !verifying.has(p.id) && !problems.has(p.id)) verify(p);
    if (rec && rec.status === 'sending' && busy !== p.id && !problems.has(p.id)) {
      // Sent before a reload, answer never seen: treat as not confirmed (the same ID is safe to send again).
      saveRecord(p, Object.assign({}, rec, { status: 'uncertain' }));
      problems.set(p.id, { kind: 'uncertain', message: 'The page was reloaded before the report server answered.' });
      AM.app.render();
    }
    document.body.classList.toggle('report-locked', !isUnlocked(p));
  }
  function leave() { document.body.classList.remove('report-locked'); }

  /* ---------- the state, as the user sees it ---------- */
  function stateOf(p) {
    const rec = record(p), pr = problems.get(p.id);
    if (busy === p.id) return 'submitting';
    if (rec && rec.status === 'success') return confirmed.get(p.id) === rec.submissionId ? 'success' : pr ? 'unconfirmed' : 'checking';
    if (rec && (rec.status === 'uncertain' || rec.status === 'sending')) return 'uncertain';
    if (pr && pr.kind === 'failed') return 'failed';
    const dr = draft(p);
    const any = FIELDS.some(f => (f.type === 'consent' || f.type === 'checkbox' ? dr.values[f.key] === true : String(dr.values[f.key] || '').trim()));
    if (!any && !dr.attempted) return 'empty';
    return Object.keys(validateAll(dr.values)).length ? 'incomplete' : 'ready';
  }
  const PILL = {
    empty: ['neutral', 'Not submitted', null], incomplete: ['neutral', 'Form incomplete', null], ready: ['acoustic', 'Ready to submit', 'check'],
    submitting: ['acoustic', 'Submitting…', null], success: ['good', 'Submitted · report unlocked', 'seal'], failed: ['critical', 'Submission failed', 'alert'],
    uncertain: ['warn', 'Not confirmed yet', 'alert'], checking: ['neutral', 'Checking submission…', null], unconfirmed: ['warn', 'Submission not confirmed', 'alert'],
  };
  /* ---------- what the "Project report" card shows (drawn by the interface, src/screens/ReportCard.tsx) ---------- */
  // Everything the card needs, read from this service's state. It changes nothing.
  function view(p) {
    if (!SPEC) return { missing: true };
    const st = stateOf(p), rec = record(p), dr = draft(p);
    const project = SPEC.columns.filter(c => c.source.startsWith('project.')).map(c => c.header.replace(/ \(.*\)$/, '').replace(/^[A-Z](?=[a-z])/, x => x.toLowerCase()));
    return { missing: false, st, pill: PILL[st], rec, dr, problem: problems.get(p.id) || null, health, busy: !!busy, fields: FIELDS, countries: SPEC.countries, brand: brand(), sent: project };
  }

  /* ---------- typing in the form: kept as it is typed, checked when a field is left or the form is sent ---------- */
  const currentProject = () => S.state.project;
  function refreshLive(p) {
    const el = document.getElementById('rf-state');
    if (el) { const [tone, text, ic] = PILL[stateOf(p)]; el.innerHTML = ui.pill(tone, text, ic); }
  }
  function showError(key, msg) {
    const input = document.getElementById(`rf-${key}`), err = document.getElementById(`rf-${key}-err`);
    if (!input || !err) return;
    err.hidden = !msg;
    err.querySelector('span').textContent = msg || '';
    input.classList.toggle('is-invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function onEdit(e, leaving) {
    const el = e.target, key = el && el.dataset && el.dataset.rf, p = currentProject();
    if (!key || !p || !el.closest('#report-form')) return;
    const dr = draft(p), f = F[key];
    if (!leaving) dr.values[key] = el.type === 'checkbox' ? el.checked : el.value;
    if (f.type === 'textarea') { const c = document.getElementById(`rf-${key}-count`); if (c) c.textContent = `${el.value.length} / ${f.maxLength}`; }
    const filled = el.type === 'checkbox' || String(dr.values[key] || '').trim();
    if (leaving && filled) dr.touched.add(key);
    if (el.type === 'checkbox' || el.tagName === 'SELECT') dr.touched.add(key);
    if (dr.attempted || dr.touched.has(key)) {
      const msg = fieldError(f, dr.values[key]);
      if (msg) dr.errors[key] = msg; else delete dr.errors[key];
      if (leaving || !msg || dr.attempted || el.type === 'checkbox' || el.tagName === 'SELECT') showError(key, dr.errors[key]);
    }
    refreshLive(p);
  }
  document.addEventListener('input', e => onEdit(e, false));
  document.addEventListener('change', e => onEdit(e, false));
  document.addEventListener('focusout', e => onEdit(e, true));
  // Enter in a field sends the form through the same action as the button (never a page submit).
  document.addEventListener('submit', e => {
    if (!e.target || e.target.id !== 'report-form') return;
    e.preventDefault();
    const b = document.getElementById('rf-submit');
    if (b && !b.disabled) b.click();
  });

  // The browser's own Print on Final Result prints a notice until the report is unlocked.
  const notice = document.createElement('div');
  notice.className = 'print-lock';
  notice.textContent = 'The project report is available after the report form on Final Result has been submitted. Submit the form, then download the PDF report.';
  document.body.appendChild(notice);

  let pruned = false;
  AM.reportGate = {
    view, submit, retry, check, isUnlocked, verify, projectSummary, validateAll, stateOf,
    mount(p) { if (!pruned) { prune(); pruned = true; } mount(p); },
    leave, recheckHealth: () => { health = null; checkHealth(); },
  };
})(window.AM);
