/* Tests of the standards-based RT60 targets in the whole application (tests/target-criteria.html). Development only.
   Results on the page and in window.TARGET_CRITERIA_TEST (window.TARGET_CRITERIA_DONE resolves).

   The rule under test (js/data/targets.js, js/services/target.js, docs/TARGET-CRITERIA.md): a target RT60 is generated
   only for a room category whose criterion is verified and applies to the room use, with the inputs the criterion needs,
   by the documented method and within its stated conditions; otherwise none, with the reason. Expected values are worked
   out by hand in the comments, from the formulas and values of the references, not from the code under test.

    1 the register: every reference, criterion and category complete and traceable; ids stable and unique
    2 supported categories: the target of each kind of criterion, by hand; the six checks; the record kept with it
    3 incomplete and unsupported categories: no target, the reason, never another category's value
    4 required inputs and documented conditions: a missing input is asked for; at and beyond each volume limit
    5 what Room Setup offers: only categories with a verified criterion (and "Other"); saved ones kept
    6 the Target step: follows the criterion, stays empty without one, the project's own target needs its source
    7 saved projects: room data unchanged, an unverified saved target kept apart and not used, review flagged
    8 the screens: Target with and without a criterion, Room Setup's lists and status */
(function () {
  'use strict';
  const results = window.TARGET_CRITERIA_TEST = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); show(); };
  const status = t => { const el = document.getElementById('tc-status'); if (el) el.textContent = t; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function show() {
    const el = document.getElementById('tc-out');
    if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${esc(t.name)}<br><small>${esc(t.detail)}</small></li>`).join('');
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const json = o => JSON.stringify(o);

  const CORP = 'Corporate offices and meeting rooms', EDU = 'Education and training facilities', STUDIO = 'Recording and music studios',
    HOSP = 'Hospitality and restaurants', HEALTH = 'Healthcare facilities', AUD = 'Auditoriums and performance spaces', IND = 'Industrial and commercial facilities', RES = 'Residential spaces';

  /* ---------- before the app loads: a clean store, and projects saved by an earlier version ---------- */
  const IKEY = 'acoustic-measurement-prototype', PKEY = id => `${IKEY}:p:${id}`;
  const saved = (id, room, target) => {
    const now = new Date().toISOString();
    return { id, kind: 'new', createdAt: now, updatedAt: now, lastStage: 'target',
      room: Object.assign({ name: id, occupancy: null, furnishing: 'Furnished', floor: '', walls: '', ceiling: '', existing: 'None' }, room), target,
      setup: { deviceKind: null, deviceId: 'default', deviceLabel: '', permission: 'not-requested', input: null, position: 'P1', signal: 'sweep', sweepLevelDb: 0, noise: null, noiseAttempt: null, prep: {} },
      measurement: { recording: null, failed: null, retry: null }, processing: { result: null, attempt: null, history: [] },
      treatment: { items: [], active: null }, completed: ['home', 'room', 'target'], review: [] };
  };
  const SEEDS = [
    // Earlier: DIN 18041 group B3 turned into an RT60 by Sabine, with an invented design value.
    saved('old-restaurant', { industry: HOSP, type: 'Restaurant', use: 'Dining and socialising', L: 15, W: 10, H: 3 }, { preferred: 0.65, min: 0.52, max: 0.82, source: 'recommended', basis: 'DIN 18041:2016, Group B3, longer stays' }),
    // Earlier: A3 narrowed by the ANSI/ASA S12.60-2010 limit to 0.60 s.
    saved('old-classroom', { industry: EDU, type: 'Classroom', use: 'Teaching', L: 9, W: 7, H: 3 }, { preferred: 0.56, min: 0.45, max: 0.6, source: 'recommended', basis: 'DIN 18041:2016, Group A3, teaching and communication + ANSI/ASA S12.60-2010' }),
    // Earlier: a retail store offered every activity; this one was saved with "Meetings and presentations".
    saved('old-retail', { industry: IND, type: 'Retail store', use: 'Meetings and presentations', L: 12, W: 8, H: 3.5 }, { preferred: 0.58, min: 0.46, max: 0.69, source: 'recommended', basis: 'DIN 18041:2016, Group A3, teaching and communication' }),
    // A target the user set: kept as theirs.
    saved('old-office-custom', { industry: CORP, type: 'Private office', use: 'Focused desk work', L: 5, W: 4, H: 3 }, { preferred: 0.6, min: 0.48, max: 0.72, source: 'custom', basis: 'Adjusted from DIN 18041:2016, Group B4, workrooms' }),
    saved('old-home-custom', { industry: RES, type: 'Living room', use: 'Living and relaxing', L: 5, W: 4, H: 2.7 }, { preferred: 0.5, min: 0.4, max: 0.6, source: 'custom', basis: 'Adjusted from ISO 16283-1, Furnished dwelling reference' }),
  ];
  (function seed() {
    const P = 'target-criteria-test:';
    [localStorage, sessionStorage].forEach(st => {
      const keys = [];
      for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(P)) keys.push(k.slice(P.length)); }
      keys.forEach(k => st.removeItem(k));
    });
    SEEDS.forEach(p => localStorage.setItem(PKEY(p.id), JSON.stringify(p)));
    localStorage.setItem(IKEY, JSON.stringify({ v: 2, activeId: null, ids: SEEDS.map(p => p.id) }));
  })();

  async function run() {
    await window.APP_READY;
    await sleep(200);
    const A = window.AM, S = A.store, W = A.workflow, D = A.demo, TS = A.services.target, TD = A.targetData, EV = A.services.evaluation;
    const room = (industry, type, use, L, W2, H, extra) => Object.assign({ industry, type, use, L, W: W2, H }, extra || {});
    const tri = t => (t ? [t.preferred, t.min, t.max] : null);

    /* ===== 1. the register ===== */
    status('Register…');
    {
      const refs = Object.values(TD.REFERENCES), crits = Object.values(TD.CRITERIA);
      const refBad = refs.filter(r => !(r.id && r.number && r.edition && r.title && r.issuer && r.short && ['primary', 'secondary'].includes(r.evidence) && r.checkedIn && r.checkedIn.length));
      check('Every reference has its number, edition, title, issuer and how its values were checked', !refBad.length, refBad.length ? refBad.map(r => r.id).join(', ') : refs.map(r => `${r.short} (${r.evidence})`).join(' · '));
      const critBad = crits.filter(c => !(c.id && TD.REFERENCES[c.reference] && c.status === 'verified' && c.clause && c.condition && c.units && Array.isArray(c.inputs) && c.checked && c.bands && EV.POLICIES[c.bands] && ['range', 'max'].includes(c.form)));
      check('Every criterion names its reference, clause, condition, units, inputs, band rule, form and what it was checked in', !critBad.length, critBad.length ? critBad.map(c => c.id).join(', ') : `${crits.length} criteria`);
      const types = [...new Set(D.INDUSTRIES.flatMap(i => i.types))].filter(t => t !== D.OTHER_TYPE);
      const cats = types.flatMap(t => TS.knownUses(t).map(u => TS.category(t, u)));
      const catBad = cats.filter(c => !c || !c.id || !c.industryIds.length || !c.typeId || !c.useId || !['verified', 'incomplete', 'unsupported'].includes(c.status)
        || (c.status === 'verified' ? !(c.criterion && c.reference && c.why && ['example', 'definition'].includes(c.basis)) : !(c.reason && !c.criterion)));
      const ids = cats.map(c => c.id);
      check('Every room category has a stable id, its industries, room type and subtype (main activity), and a status: a verified criterion with why it applies, or the reason it has none',
        !catBad.length && new Set(ids).size === ids.length && cats.every(c => /^rt\.[a-z0-9-]+\/[a-z0-9-]+$/.test(c.id)),
        catBad.length ? catBad.map(c => (c ? c.id : 'missing')).join(', ') : `${cats.length} categories: ${cats.filter(c => c.status === 'verified').length} verified, ${cats.filter(c => c.status === 'incomplete').length} incomplete, ${cats.filter(c => c.status === 'unsupported').length} unsupported`);
      const meet = TS.category('Meeting room', 'Meetings and presentations');
      check('A category\'s id and parents are fixed: Meeting room · Meetings and presentations is rt.meeting-room/meetings, in the corporate industry, on DIN 18041 A3',
        meet.id === 'rt.meeting-room/meetings' && json(meet.industryIds) === json(['ind.corporate']) && meet.criterion.id === 'din18041-A3', `${meet.id} · ${meet.industryIds} · ${meet.criterion.id}`);
      check('References checked and not used for targets are listed with the reason (IS 2526, BB93, ANSI/ASA S12.60, ISO 23591, ISO 22955, HTM 08-01, FGI, WHO 1999, ISO 16283-1)',
        ['is2526', 'bb93', 'ansiS1260', 'iso23591', 'iso22955', 'htm0801', 'fgi2010', 'who1999', 'iso16283'].every(k => TD.NOT_USED[k] && TD.NOT_USED[k].reason), Object.keys(TD.NOT_USED).join(', '));
    }

    /* ===== 2. supported categories ===== */
    status('Supported…');
    {
      // DIN 18041 A3, 10 × 6 × 3 = 180 m³: 0.32 × lg 180 − 0.17 = 0.32 × 2.25527 − 0.17 = 0.55169 s → 0.55; × 0.8 = 0.44135 → 0.44; × 1.2 = 0.66202 → 0.66
      const a3 = TS.recommend(room(CORP, 'Meeting room', 'Meetings and presentations', 10, 6, 3));
      check('Meeting room, 180 m³: DIN 18041 A3, T_soll = 0.32·lg V − 0.17 = 0.55 s, range 0.44–0.66 s', json(tri(a3)) === json([0.55, 0.44, 0.66]) && a3.form === 'range' && a3.criterionId === 'din18041-A3', json(tri(a3)));
      // A4, 180 m³: 0.26 × 2.25527 − 0.14 = 0.44637 → 0.45; 0.35710 → 0.36; 0.53565 → 0.54
      const a4 = TS.recommend(room(CORP, 'Conference room', 'Video calls and hybrid meetings', 10, 6, 3));
      check('Conference room for video calls, 180 m³: DIN 18041 A4 (its example: the video-conference room), 0.45 s (0.36–0.54 s)', json(tri(a4)) === json([0.45, 0.36, 0.54]) && a4.category.basis === 'example', json(tri(a4)));
      // "Speech/presentation, inclusive", 12 × 10 × 5 = 600 m³, by the A3 formula: 0.32 × 2.77815 − 0.17 = 0.71901 → 0.72; 0.57521 → 0.58; 0.86281 → 0.86
      const a2i = TS.recommend(room(EDU, 'Lecture hall', 'Lectures and presentations, inclusive', 12, 10, 5));
      check('Lecture hall, inclusive lectures, 600 m³: DIN 18041 "speech/presentation, inclusive" by the A3 formula, 0.72 s (0.58–0.86 s)', json(tri(a2i)) === json([0.72, 0.58, 0.86]) && a2i.criterionId === 'din18041-A2i', json(tri(a2i)));
      // A5, 25 × 20 × 10 = 5000 m³: 0.75 × 3.69897 − 1.00 = 1.77423 → 1.77; 1.41938 → 1.42; 2.12907 → 2.13
      const a5 = TS.recommend(room(EDU, 'Sports hall', 'Sport and exercise', 25, 20, 10));
      check('Sports hall, 5000 m³: DIN 18041 A5, 1.77 s (1.42–2.13 s), judged 250 Hz–2 kHz only', json(tri(a5)) === json([1.77, 1.42, 2.13]) && EV.policyFor(room(EDU, 'Sports hall', 'Sport and exercise', 25, 20, 10), a5).judgedShort === '250 Hz–2 kHz', json(tri(a5)));
      // NBC 2016 clause 8.3.2.1: small private offices 0.75 s; general (incl. open-plan) offices 1.0 s; canteens 1.0 s; all at 500 Hz.
      const off = TS.recommend(room(CORP, 'Private office', 'Focused desk work', 4, 3, 2.7)), open = TS.recommend(room(CORP, 'Open-plan office', 'Focused desk work', 20, 15, 3)), cant = TS.recommend(room(CORP, 'Staff canteen', 'Dining and socialising', 12, 10, 3));
      check('Offices and canteens (NBC 2016, clause 8.3.2.1, at 500 Hz): small private office at most 0.75 s; open-plan office and staff canteen at most 1.00 s; no preferred value or lower limit',
        [off, open, cant].every(r => r.form === 'max' && r.preferred === null && r.min === null) && off.max === 0.75 && open.max === 1 && cant.max === 1 && /8\.3\.2\.1/.test(off.clause) && /500 Hz/.test(off.clause),
        [off, open, cant].map(r => TS.fullText(r)).join(' · '));
      // EBU Tech 3276, 7 × 5 × 3 = 105 m³: guide Tm = 0.25 × 1.05^(1/3) = 0.25 × 1.01640 = 0.25410 → 0.25; §2.3: the room's
      // measured Tm has to lie between 0.2 and 0.4 s, and each band within ±0.05 s of it (judged in AM.services.evaluation).
      const ebu = TS.recommend(room(STUDIO, 'Control room', 'Mixing and critical listening', 7, 5, 3));
      check('Control room, 105 m³: EBU Tech 3276, guide Tm = 0.25·(V/100 m³)^⅓ = 0.25 s; the measured Tm between 0.20 and 0.40 s', json(tri(ebu)) === json([0.25, 0.2, 0.4]) && ebu.reference.id === 'ebu3276', json(tri(ebu)));
      const av = TS.availability(room(CORP, 'Meeting room', 'Meetings and presentations', 10, 6, 3));
      check('The six checks are made in order and all pass: category, verified criteria, applies to the use, inputs, documented method, record',
        json(av.checks.map(c => c.id)) === json(['category', 'criteria', 'applies', 'inputs', 'method', 'record']) && av.checks.every(c => c.ok === true && c.detail), av.checks.map(c => `${c.id}: ${c.ok}`).join(', '));
      const rec = a3.record;
      check('The target carries its record: the category, criterion, reference with issuer, clause, condition (room in use, 80 % occupied), units, the volume used and the method written out',
        rec.category === 'rt.meeting-room/meetings' && rec.criterion === 'din18041-A3' && /DIN 18041:2016-03/.test(rec.reference) && /DIN/.test(rec.reference) && /Unterricht\/Kommunikation/.test(rec.clause) && /80 %/.test(rec.condition)
          && rec.inputs.volumeM3 === 180 && /T_soll = 0\.32 × lg 180 − 0\.17 = 0\.55 s/.test(rec.method) && rec.evidence === 'secondary', json(rec).slice(0, 400));
      check('A target checked only in published sources says so (DIN 18041: the standard itself was not available), with the publications named',
        a3.reference.evidence === 'secondary' && a3.notes.some(n => /was not available/.test(n)) && a3.workings.some(([k, v]) => k === 'Verification' && /BNB 3\.1\.4/.test(v)), a3.workings.find(([k]) => k === 'Verification')[1]);
      // The room's surfaces, furnishing and occupancy never change the target.
      const plain = TS.recommend(room(CORP, 'Meeting room', 'Meetings and presentations', 10, 6, 3)), busy = TS.recommend(room(CORP, 'Meeting room', 'Meetings and presentations', 10, 6, 3, { occupancy: 40, furnishing: 'Empty', furnishings: ['upholstered', 'curtains'] }));
      check('Occupancy, furnishing and what is in the room never change the target (no conversion by people or furniture)', json(tri(plain)) === json(tri(busy)), `${json(tri(plain))} = ${json(tri(busy))}`);
      // Every verified category gives its own criterion's target at 10 × 8 × 3 = 240 m³ (inside every range used).
      const types = [...new Set(D.INDUSTRIES.flatMap(i => i.types))].filter(t => t !== D.OTHER_TYPE);
      const wrong = types.flatMap(t => TS.usesFor(t).map(u => { const c = TS.category(t, u), r = TS.recommend(room(D.industryFor(t), t, u, 10, 8, 3)); return !r || r.criterionId !== c.criterion.id || r.category.id !== c.id ? `${t} · ${u}` : null; })).filter(Boolean);
      check('Every verified category gives a target from its own criterion (240 m³)', !wrong.length, wrong.join(', ') || `${types.reduce((n, t) => n + TS.usesFor(t).length, 0)} categories`);
    }

    /* ===== 3. incomplete and unsupported ===== */
    status('No criteria…');
    {
      const types = [...new Set(D.INDUSTRIES.flatMap(i => i.types))].filter(t => t !== D.OTHER_TYPE);
      const none = types.flatMap(t => TS.knownUses(t).filter(u => TS.category(t, u).status !== 'verified').map(u => [t, u]));
      const leaked = none.filter(([t, u]) => { const r = room(D.industryFor(t), t, u, 10, 8, 3), a = TS.availability(r); return TS.recommend(r) || a.target || !['incomplete', 'unsupported'].includes(a.status) || !/No verified target criteria/.test(a.message); });
      check('No category without a verified criterion gets a target: each says "No verified target criteria" and why (none substituted)', !leaked.length && none.length > 0, leaked.length ? leaked.map(x => x.join(' · ')).join(', ') : `${none.length} categories`);
      const rest = TS.availability(room(HOSP, 'Restaurant', 'Dining and socialising', 12, 10, 3)), cant = TS.recommend(room(CORP, 'Staff canteen', 'Dining and socialising', 12, 10, 3));
      check('A restaurant is incomplete (DIN 18041 B3 gives only A/V ≥ 0.20 m²/m³); it never takes the canteen\'s NBC limit, though both are for dining',
        rest.status === 'incomplete' && /group B3/.test(rest.message) && /A\/V ≥ 0\.20/.test(rest.message) && !rest.target && cant && cant.max === 1, rest.message);
      const checks = rest.checks.map(c => c.ok);
      check('The checks stop where the category fails: recognised (passed), verified criteria (failed), the rest not reached', json(checks) === json([true, false, null, null, null, null]), json(checks));
      const homeA = TS.availability(room(RES, 'Living room', 'Living and relaxing', 5, 4, 2.7)), wor = TS.availability(room(AUD, 'Place of worship', 'Spoken services', 20, 12, 8)), recd = TS.availability(room(STUDIO, 'Recording studio', 'Recording', 6, 5, 3));
      check('Unsupported, with the reason: a living room (no reference sets a target for homes; ISO 16283-1\'s 0.5 s is not one), a place of worship (DIN 18041 excludes them), a recording room',
        homeA.status === 'unsupported' && /ISO 16283-1/.test(homeA.message) && wor.status === 'unsupported' && /excludes churches/.test(wor.message) && recd.status === 'unsupported', [homeA, wor, recd].map(a => a.status).join(', '));
      const other = TS.availability(room(CORP, 'Other', '', 5, 4, 3, { typeOther: 'Podcast booth' })), otherUse = TS.availability(room(CORP, 'Other', 'Teaching', 9, 7, 3, { typeOther: 'Seminar room' }));
      check('A room type the user names ("Other") is unsupported even with a main activity that has a criterion elsewhere (never another room type\'s target)',
        other.status === 'unsupported' && /Podcast booth/.test(other.message) && otherUse.status === 'unsupported' && !TS.recommend(room(CORP, 'Other', 'Teaching', 9, 7, 3, { typeOther: 'Seminar room' })), `${other.status}; ${otherUse.status}`);
      const custInd = TS.availability(room(D.OTHER_INDUSTRY, 'Other', '', 5, 4, 3, { industryOther: 'Transport', typeOther: 'Ticket hall' })), mismatch = TS.availability(room(HOSP, 'Retail store', 'Meetings and presentations', 12, 8, 3.5));
      check('A custom industry is unsupported; a saved activity that is not one of the room type\'s categories is unsupported, not matched to another', custInd.status === 'unsupported' && mismatch.status === 'unsupported', `${custInd.status}; ${mismatch.status}: ${mismatch.message}`);
    }

    /* ===== 4. required inputs and documented conditions ===== */
    status('Inputs and conditions…');
    {
      const need = TS.availability(room(EDU, 'Classroom', 'Teaching', null, 7, 3));
      check('A criterion that needs the volume asks for the room size before any target: needs-input, the input named, no target', need.status === 'needs-input' && json(need.missing) === json(['volume']) && /length, width and height/.test(need.message) && !need.target && need.checks.find(c => c.id === 'inputs').ok === false, need.message);
      const nbc = TS.availability(room(CORP, 'Private office', 'Focused desk work', null, null, null));
      check('A criterion with no inputs (NBC 2016\'s fixed maximum) does not ask for the size', nbc.status === 'ok' && nbc.target.max === 0.75, nbc.status);
      const st = (type, use, ind, L, W2, H) => { const a = TS.availability(room(ind, type, use, L, W2, H)); return a.status === 'ok' ? a.target.preferred : a.status; };
      // A3: 5 × 3 × 2 = 30 m³ (the lower limit, included): 0.32 × lg 30 − 0.17 = 0.32 × 1.47712 − 0.17 = 0.30268 → 0.30;
      //     3 × 3.332 × 3 = 29.988 m³: outside; 9.99 × 10 × 10 = 999 m³: 0.32 × 2.99957 − 0.17 = 0.78986 → 0.79; 1000 m³: outside
      const a3 = [st('Classroom', 'Teaching', EDU, 5, 3, 2), st('Classroom', 'Teaching', EDU, 3, 3.332, 3), st('Classroom', 'Teaching', EDU, 9.99, 10, 10), st('Classroom', 'Teaching', EDU, 10, 10, 10)];
      check('A3 range 30 m³ ≤ V < 1000 m³: 30 m³ → 0.30 s; 29.99 m³ → none; 999 m³ → 0.79 s; 1000 m³ → none (no value extrapolated or clamped)', json(a3) === json([0.3, 'outside', 0.79, 'outside']), json(a3));
      // A4: 9.98 × 10 × 5 = 499 m³: 0.26 × 2.69810 − 0.14 = 0.56151 → 0.56; 500 m³: outside (not for rooms over 500 m³)
      const a4 = [st('Classroom', 'Inclusive teaching', EDU, 9.98, 10, 5), st('Classroom', 'Inclusive teaching', EDU, 10, 10, 5)];
      check('A4 range up to 500 m³: 499 m³ → 0.56 s; 500 m³ → none', json(a4) === json([0.56, 'outside']), json(a4));
      // A5: 199 m³ outside; 25 × 20 × 20 = 10 000 m³ by the formula: 0.75 × 4 − 1 = 2.00; 50 × 30 × 20 = 30 000 m³: 2.0 s; 30 000.6 m³: outside
      const a5 = [st('Sports hall', 'Sport and exercise', EDU, 9.95, 10, 2), st('Sports hall', 'Sport and exercise', EDU, 25, 20, 20), st('Sports hall', 'Sport and exercise', EDU, 50, 30, 20), st('Sports hall', 'Sport and exercise', EDU, 50.001, 30, 20)];
      check('A5: 199 m³ → none; 10 000 m³ → 2.00 s (the formula); 30 000 m³ → 2.0 s; beyond 30 000 m³ → none', json(a5) === json(['outside', 2, 2, 'outside']), json(a5));
      // EBU: 8.5 × 6 × 1 = 51 m³: Tm = 0.25 × 0.51^(1/3) = 0.25 × 0.79896 = 0.19974 s, not above 0.2 → none; 8 × 6.5 × 1 = 52 m³:
      // 0.25 × 0.80415 = 0.20104 → 0.20; 409 m³: 0.25 × 1.59948 = 0.39987 → 0.40; 410 m³: 0.25 × 1.60078 = 0.40020 → none
      const e = [st('Control room', 'Mixing and critical listening', STUDIO, 8.5, 6, 1), st('Control room', 'Mixing and critical listening', STUDIO, 8, 6.5, 1), st('Control room', 'Mixing and critical listening', STUDIO, 409, 1, 1), st('Control room', 'Mixing and critical listening', STUDIO, 410, 1, 1)];
      check('EBU Tech 3276 requires 0.2 s < Tm < 0.4 s: 51 m³ (0.1997 s) → none; 52 m³ → 0.20 s; 409 m³ → 0.40 s; 410 m³ (0.4002 s) → none', json(e) === json(['outside', 0.2, 0.4, 'outside']), json(e));
      const out = TS.availability(room(EDU, 'Classroom', 'Teaching', 10, 10, 10));
      check('Outside the conditions the user is told why and offered another category or the project\'s own target; the checks stop at the method',
        /from 30 m³ up to 1000 m³/.test(out.message) && /Choose another main activity/.test(out.message) && json(out.checks.map(c => c.ok)) === json([true, true, true, true, false, null]), out.message);
    }

    /* ===== 5. what Room Setup offers ===== */
    // Changed 2026-10-20: every room type is offered so any room can be described and measured; those with a verified
    // criterion come first, the others are grouped and marked as having no verified RT60 target (none is generated).
    status('Offered…');
    {
      const inds = TS.offeredIndustries();
      check('Industries with a verified category: all but industrial and commercial facilities (none of its rooms has one); every industry is still listed in Room Setup',
        !inds.includes(IND) && inds.includes(D.OTHER_INDUSTRY) && inds.includes(CORP) && inds.length === D.INDUSTRIES.length - 1, inds.join(' · '));
      const g = i => TS.typeGroups(i);
      check('Room types in two groups: hospitality has the banquet hall with a target and restaurants, cafés, bars and hotel lobbies without; homes the home studio, then living room, bedroom and home theatre; industrial none with a target; "Other" always last, without',
        json(g(HOSP).target) === json(['Banquet hall']) && json(g(HOSP).none) === json(['Restaurant', 'Café', 'Bar', 'Hotel lobby', 'Other']) && json(g(RES).target) === json(['Home studio']) && json(g(RES).none) === json(['Living room', 'Bedroom', 'Home theatre', 'Other'])
          && !g(IND).target.length && g(IND).none.includes('Workshop'),
        [HOSP, RES, IND].map(i => `${g(i).target.join(', ')} | ${g(i).none.join(', ')}`).join(' ‖ '));
      check('Main activities offered are only the verified ones: a banquet hall offers events, not dining; a recording studio offers mixing, not recording',
        json(TS.usesFor('Banquet hall')) === json(['Events and assemblies']) && json(TS.usesFor('Recording studio')) === json(['Mixing and critical listening']) && json(TS.knownUses('Banquet hall')) === json(['Events and assemblies', 'Dining and socialising']),
        `${TS.usesFor('Banquet hall')} · ${TS.usesFor('Recording studio')}`);
    }

    /* ===== 6. the Target step ===== */
    status('Target step…');
    const stg = W.get('target'), act = stg.actions, ctx = () => ({ project: S.state.project, state: S.state, render() {} });
    {
      S.startProject('new');
      S.autofillTo('target');
      const p = () => S.state.project;
      S.set('room', Object.assign({}, p().room, { industry: CORP, type: 'Meeting room', use: 'Meetings and presentations', L: 10, W: 6, H: 3 }));
      check('The project target follows the verified criterion, with its record', json(tri(p().target)) === json([0.55, 0.44, 0.66]) && p().target.source === 'recommended' && p().target.record && p().target.record.criterion === 'din18041-A3', json(p().target).slice(0, 200));
      S.set('room', Object.assign({}, p().room, { industry: HOSP, type: 'Restaurant', use: 'Dining and socialising' }));
      const cc = stg.canContinue(p());
      check('Changed to a restaurant: the target is emptied (no value kept from the meeting room) and the step cannot be confirmed, with the reason',
        json(tri(p().target)) === json([null, null, null]) && !cc.ok && /No verified target criteria/.test(cc.reason), cc.reason);
      const before = json(p().target);
      act.nudge(ctx(), 'preferred|1');
      check('− / + on an empty target does not make up a starting value', json(p().target) === before, json(p().target));
      act.ownTarget(ctx());
      check('"Set the project\'s own target": marked as the project\'s own, with no value filled in', p().target.source === 'custom' && json(tri(p().target)) === json([null, null, null]) && p().target.note === '' && /no verified criterion/i.test(p().target.basis), json(p().target));
      S.set('target', Object.assign({}, p().target, { preferred: 0.7, min: 0.6, max: 0.8 }));
      const noSrc = stg.canContinue(p());
      S.set('target.note', 'Client specification 4.2');
      const withSrc = stg.canContinue(p());
      check('The project\'s own target needs where it comes from: refused without it, accepted with it', !noSrc.ok && /where this target comes from/i.test(noSrc.reason) && withSrc.ok, `${noSrc.reason} → ${json(withSrc)}`);
      act.dropOwnTarget(ctx());
      check('Removing it returns to following the criteria: empty again for the restaurant', p().target.source === 'recommended' && json(tri(p().target)) === json([null, null, null]), json(p().target));
      S.set('room', Object.assign({}, p().room, { industry: CORP, type: 'Private office', use: 'Focused desk work', L: 5, W: 4, H: 3 }));
      const t = p().target;
      check('A private office: the target is NBC 2016\'s upper limit (form "max", no preferred value or lower limit) and can be confirmed',
        t.form === 'max' && t.max === 0.75 && t.preferred === null && t.min === null && stg.canContinue(p()).ok && TS.complete(t) && A.derive.target(p()) === t, json(t).slice(0, 160));
    }

    /* ===== 7. saved projects ===== */
    status('Saved projects…');
    {
      const get = id => S.state.projects.find(x => x.id === id);
      const r = get('old-restaurant'), seedR = SEEDS[0];
      check('A restaurant saved with a target from DIN 18041 B3: the room is unchanged, the target emptied, its earlier values kept apart (never used), a note says why, and the finished target step is marked for review',
        r && json(r.room.type) === json(seedR.room.type) && r.room.use === seedR.room.use && r.room.industry === seedR.room.industry && json(tri(r.target)) === json([null, null, null])
          && json(tri(r.target.earlier)) === json([0.65, 0.52, 0.82]) && /not verified/.test(r.targetNote) && r.review.includes('target') && !A.derive.target(r) && W.get('room').canContinue(r).ok,
        r ? `${json(r.target).slice(0, 220)} · ${r.targetNote}` : 'not loaded');
      const c = get('old-classroom');
      check('A classroom saved with the ANSI-narrowed target (0.56, 0.45–0.60): updated to DIN 18041 A3\'s own 0.56 s (0.45–0.67 s), with a note, and marked for review',
        c && json(tri(c.target)) === json([0.56, 0.45, 0.67]) && /updated/.test(c.targetNote) && c.review.includes('target'), c ? `${json(tri(c.target))} · ${c.targetNote}` : 'not loaded');
      const rt = get('old-retail');
      check('A retail store saved with "Meetings and presentations": the industry, room type and activity are kept as saved; no target; the room step still checks out',
        rt && rt.room.industry === IND && rt.room.type === 'Retail store' && rt.room.use === 'Meetings and presentations' && !A.derive.target(rt) && W.get('room').canContinue(rt).ok, rt ? `${rt.room.use}; ${json(W.get('room').canContinue(rt))}` : 'not loaded');
      const oc = get('old-office-custom'), hc = get('old-home-custom');
      check('Targets the user set are kept as theirs; where no criterion applies any more, the earlier basis is kept as the source',
        oc && json(tri(oc.target)) === json([0.6, 0.48, 0.72]) && oc.target.source === 'custom' && !oc.targetNote && hc && json(tri(hc.target)) === json([0.5, 0.4, 0.6]) && /earlier version/.test(hc.target.note) && !W.get('target').model.problem(hc.target, true),
        `${oc && json(oc.target)} · ${hc && hc.target.note}`);
    }

    /* ===== 8. the screens ===== */
    status('Screens…');
    {
      const app = document.getElementById('app');
      S.openProject('old-classroom');
      S.go('target');
      await sleep(150);
      const tx = app.textContent;
      check('Target step, classroom: the recommendation names the reference and use type, what it applies to, its source and the checks; no other standard is added',
        /DIN 18041:2016-03/.test(tx) && /Use type A3/.test(tx) && /Condition:/.test(tx) && /Source and how it was worked out/.test(tx) && /checks made before this target was generated/.test(tx) && !/ANSI/.test(tx), 'recommendation card and source');
      S.openProject('old-restaurant');
      S.go('target');
      await sleep(150);
      const tr = app.textContent;
      check('Target step, restaurant: "No verified target criteria" with the reason, a way back to Room Setup, the project\'s own target offered, and no recommended value shown',
        /No verified target criteria/.test(tr) && /group B3/.test(tr) && !!app.querySelector('[data-action="go"][data-value="room"]') && !!app.querySelector('[data-action="ownTarget"]') && !/Recommended RT60/.test(tr) && /not verified for this room/.test(tr),
        'message, buttons, note');
      S.go('room');
      await sleep(150);
      const types = [...app.querySelector('#room-type').options].filter(o => o.value).map(o => o.textContent);
      const groups = [...app.querySelector('#room-type').querySelectorAll('optgroup')].map(o => o.label);
      check('Room Setup, the saved restaurant: every hospitality room type is listed, the banquet hall under "RT60 target from a standard" and the restaurant (selected) under "No verified RT60 target", with the reason shown',
        json(types) === json(['Banquet hall', 'Restaurant', 'Café', 'Bar', 'Hotel lobby', 'Other']) && app.querySelector('#room-type').value === 'Restaurant' && json(groups) === json(['RT60 target from a standard', 'No verified RT60 target (can still be measured)'])
          && /No verified target criteria/.test(app.textContent), `${types.join(' · ')} | ${groups.join(' / ')}`);
      S.openProject('old-classroom');
      S.go('room');
      await sleep(150);
      check('Room Setup, the classroom: the verified criterion is named beside the room\'s description, and the summary shows the recommended RT60 with its reference',
        /Verified criterion: DIN 18041:2016-03, Use type A3/.test(app.textContent) && /0\.56 s/.test(app.querySelector('.card-summary').textContent) && /DIN 18041:2016-03/.test(app.querySelector('.card-summary').textContent), 'status and summary');
    }

    status('Done');
    document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
    return results;
  }

  window.TARGET_CRITERIA_DONE = run().catch(e => { check('The test ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Error'); document.title = 'error'; return results; });
})();
