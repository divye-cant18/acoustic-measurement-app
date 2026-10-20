/* Tests of the measuring positions and the verdict policy (tests/multi-position.html). Development only.

   Part A (on load)
     A1 the room per band is the arithmetic mean of the positions with a reliable value there, worked out by hand for every
        band; n of N, spread, path and quality per band
     A2 a band missing at one position is averaged over the others and says so; missing everywhere: no value, with each
        position's reason; nothing is put in its place
     A3 one position: the room's values are exactly the take's (the signal processing is not touched), and averaging
        changes nothing it reads
     A4 through the Processing step: valid takes at P1 and P2 are both kept; a new take at P1 replaces only P1 (kept as
        superseded); an invalid take at P2 is kept as the latest attempt with its reason, never as a value, and the earlier
        valid P2 stays; the session needs two valid positions before Results continues; the next position is offered
     A5 the verdict policy by room category (js/data/targets.js): meeting room (DIN 18041 A1–A4: 250 Hz–2 kHz against the
        target range, 125 Hz and 4 kHz against the standard's own limits, all judged), office (NBC 2016: an upper limit at
        500 Hz only), listening room (EBU Tech 3276: 250 Hz–4 kHz and its mask at 125 Hz), a dwelling and a room without a
        criterion (no recommendation: the app's default bands, for the project's own target only), a classroom (DIN 18041
        A3 alone), a custom target
     A6 an average inside the range does not pass the room when a judged band is outside it; the edge bands decide the
        verdict against their own limits; a judged band not measured leaves the verdict incomplete; an upper-limit target
        is never "below"; too few bands: not assessed
     A7 the PDF and the report form's record agree with the room: positions, each position's band values, the room's band
        values, the verdict and its summary; the record's 1000 Hz value is the room's, not the latest take's
     A8 the report stays locked unless the server confirms this project's receipt, on every download; a receipt stored in
        the browser alone unlocks nothing
     A9 a project measured before positions were kept is migrated: its take becomes P1, nothing measured is lost, the
        steps that show the result are marked for review and the reason is given
   Part B (one click; virtual device, tests/virtual-room.js)
     B1 the guided workflow: P1 measured; Processing and Results lead to P2; Results does not continue with one position
     B2 the background has to be measured again at P2 before its take
     B3 an invalid take at P2 is rejected with its reason and can be retried; P1 is untouched
     B4 the retry at P2 completes the session; the room is the mean of P1 and P2 band by band (worked out here)
     B5 an optional third position is added and averaged in; leaving and reopening the project keeps every position */
(function () {
  'use strict';
  const results = window.MULTI_POSITION_TEST = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); show(); };
  const status = t => { const el = document.getElementById('mp-status'); if (el) el.textContent = t; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function show() {
    const el = document.getElementById('mp-out');
    if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${esc(t.name)}<br><small>${esc(t.detail)}</small></li>`).join('');
    document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, what, ms = 60000) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); }
    throw new Error(`Timed out waiting for ${what}`);
  }
  const close = (a, b, tol = 1e-12) => typeof a === 'number' && Math.abs(a - b) <= tol;
  const json = o => JSON.stringify(o);
  const copy = o => JSON.parse(JSON.stringify(o));
  const textOf = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); };
  const bad = s => /NaN|Infinity|undefined/.test(s);
  const pdfText = bytes => [...Array.from(bytes, c => String.fromCharCode(c)).join('').matchAll(/<([0-9A-F]+)> Tj/g)].map(m => m[1].replace(/../g, h => String.fromCharCode(parseInt(h, 16)))).join(' ').replace(/\x96/g, '–').replace(/\s+/g, ' ');
  const NR = 'Only 21 dB of the room\'s own decay above the recording background noise. T20 needs 35 dB.';

  let A = null; // shared with part B: the app's modules

  async function partA() {
    await window.HARNESS_READY;
    await until(() => AM.store && AM.store.state && AM.app && AM.services.spatial && AM.services.evaluation, 'the app');
    const S = AM.store, W = AM.workflow, D = AM.derive, SP = AM.services.spatial, EV = AM.services.evaluation, RA = AM.services.rt60Average, AC = AM.acoustics, fmt = AM.util.fmt;
    const B = AM.demo.BANDS;
    A = { S, W, D, SP, EV, RA, AC, fmt, B };
    const band = (f, rt60, extra) => Object.assign({ f, rt60, t20: null, t30: rt60, path: rt60 == null ? null : 'T30', quality: rt60 == null ? 'Insufficient' : 'Good', confidence: rt60 == null ? 'None' : 'High', reason: rt60 == null ? NR : null }, extra);
    const result = (id, pos, vals, extra) => Object.assign({ valid: true, status: 'valid', referenceBand: 1000, recordingId: id, takenAt: `2026-10-16T09:0${id.slice(-1)}:00.000Z`, headline: { f: 1000, rt60: vals[3], method: 'T30', quality: 'Good', confidence: 'High' }, meta: { position: pos }, warnings: [],
      bands: B.map((f, i) => (vals[i] && typeof vals[i] === 'object' ? vals[i] : band(f, vals[i]))) }, extra);

    /* ===== A1 aggregation, every band, by hand ===== */
    status('Aggregation…');
    {
      // P1 0.62 0.58 0.60 0.45 0.56 0.40; P2 0.70 0.62 0.54 0.49 0.50 0.44; P3 0.66 0.55 0.57 0.47 0.53 0.42.
      // 125 Hz: (0.62 + 0.70 + 0.66) ÷ 3 = 1.98 ÷ 3 = 0.66; 250: 1.75 ÷ 3; 500: 1.71 ÷ 3 = 0.57; 1000: 1.41 ÷ 3 = 0.47;
      // 2000: 1.59 ÷ 3 = 0.53; 4000: 1.26 ÷ 3 = 0.42. Spread 125 Hz: 0.70 − 0.62 = 0.08.
      const p1 = result('r1', 'P1', [0.62, 0.58, 0.60, 0.45, 0.56, 0.40]), p2 = result('r2', 'P2', [0.70, 0.62, 0.54, 0.49, 0.50, 0.44]), p3 = result('r3', 'P3', [0.66, 0.55, 0.57, 0.47, 0.53, 0.42]);
      const want = [1.98, 1.75, 1.71, 1.41, 1.59, 1.26].map(x => x / 3), spread = [0.08, 0.07, 0.06, 0.04, 0.06, 0.04];
      const r = SP.aggregate([{ id: 'P1', result: p1 }, { id: 'P2', result: p2 }, { id: 'P3', result: p3 }]);
      check('A1 Every band is the arithmetic mean of the three positions (worked out here: 0.660, 0.583, 0.570, 0.470, 0.530, 0.420 s), with 3 of 3 positions and the spread (longest − shortest)',
        r && r.count === 3 && r.complete && r.bands.every((b, i) => close(b.rt60, want[i], 1e-12) && b.n === 3 && b.of === 3 && close(b.spread, spread[i], 1e-9) && b.path === 'T30' && b.quality === 'Good'),
        r ? r.bands.map(b => `${b.f}: ${b.rt60.toFixed(4)} (n ${b.n}/${b.of}, spread ${b.spread.toFixed(2)})`).join(' · ') : 'none');
      check('A1 The room keeps each position\'s own value per band, the 1000 Hz band as its headline (0.47 s), and the positions it rests on',
        json(r.bands.find(b => b.f === 125).values.map(v => v.rt60)) === json([0.62, 0.70, 0.66]) && close(r.headline.rt60, 1.41 / 3) && json(r.positions.map(x => x.id)) === json(['P1', 'P2', 'P3']) && r.positions[1].rt60[4000] === 0.44,
        `headline ${r.headline.rt60}; positions ${r.positions.map(x => x.id).join(', ')}`);
      // Mixed paths and qualities: a band with T20 at one position is "T30/T20" and Fair; Good only when every position is.
      const p2b = result('r2', 'P2', [0.70, band(250, 0.62, { path: 'T20', quality: 'Fair', confidence: 'Medium' }), 0.54, 0.49, 0.50, 0.44]);
      const r2 = SP.aggregate([{ id: 'P1', result: p1 }, { id: 'P2', result: p2b }]), b250 = r2.bands.find(b => b.f === 250);
      check('A1 A band measured with T30 at one position and T20 at the other reads "T30/T20", quality Fair (Good only when every position is Good)',
        b250.path === 'T30/T20' && b250.quality === 'Fair' && b250.confidence === 'Medium' && close(b250.rt60, (0.58 + 0.62) / 2) && r2.bands.find(b => b.f === 500).quality === 'Good', `${b250.path} ${b250.quality}`);
      // Two positions: the minimum. One: not complete.
      check('A1 The session is complete with two valid positions (the minimum, ISO 3382-2 survey method), not with one', SP.MIN_POSITIONS === 2 && r2.complete && !SP.aggregate([{ id: 'P1', result: p1 }]).complete, `minimum ${SP.MIN_POSITIONS}`);
    }

    /* ===== A2 missing bands ===== */
    {
      // 125 Hz not reliable at P2: (0.62 + 0.66) ÷ 2 = 0.64, "2 of 3"; 4000 Hz at no position: no value, each reason named.
      const p1 = result('r1', 'P1', [0.62, 0.58, 0.60, 0.45, 0.56, null]), p2 = result('r2', 'P2', [null, 0.62, 0.54, 0.49, 0.50, null]), p3 = result('r3', 'P3', [0.66, 0.55, 0.57, 0.47, 0.53, null]);
      const r = SP.aggregate([{ id: 'P1', result: p1 }, { id: 'P2', result: p2 }, { id: 'P3', result: p3 }]);
      const b125 = r.bands.find(b => b.f === 125), b4k = r.bands.find(b => b.f === 4000);
      check('A2 125 Hz not reliable at P2: the mean of P1 and P3, 1.28 ÷ 2 = 0.64 s, "measured at 2 of 3 positions", P2 named; quality Fair',
        close(b125.rt60, 0.64, 1e-12) && b125.n === 2 && b125.of === 3 && /Measured at 2 of 3 positions; P2 has no reliable value/.test(b125.notes[0]) && b125.quality === 'Fair', b125.notes[0]);
      check('A2 4000 Hz at no position: no value (null, never 0), each position\'s reason given, and the all-band average leaves it out',
        b4k.rt60 === null && b4k.n === 0 && b4k.quality === 'Insufficient' && /P1: Only 21 dB/.test(b4k.reason) && /P3: Only 21 dB/.test(b4k.reason) && RA.of(r).n === 5 && json(RA.of(r).missing.map(x => x.f)) === json([4000]), b4k.reason.slice(0, 120));
      const invalid = Object.assign(result('r4', 'P2', [0.9, 0.9, 0.9, 0.9, 0.9, 0.9]), { valid: false, status: 'invalid' });
      const r2 = SP.aggregate([{ id: 'P1', result: p1 }, { id: 'P2', result: invalid }]);
      check('A2 A result that is not valid is never part of the room (here only P1 counts, so the room is not complete)', r2.count === 1 && !r2.complete && r2.bands.every(b => b.values.length === 1), `count ${r2.count}`);
    }

    /* ===== A3 one position: exactly the take ===== */
    status('One position…');
    const AN = AM.analysis, PROC = AM.services.processing, FIX = window.FIX;
    const plan = AN.sweepPlan(48000), sweep = AN.makeSweep(plan);
    function take(id, takenAt, rt, seed, pos, extra = {}) {
      const ir = FIX.roomIR({ fs: 48000, seconds: 3, rt, seed, directDb: 28 });
      const rec = FIX.recordSweep({ plan, sweep, ir, peakDbfs: -12, noiseDbfs: -70, noiseKind: 'pink', latency: 0.07, seed });
      const an = AN.analyseTake(rec, plan, sweep);
      return Object.assign({ id, takenAt, status: 'captured', reason: an.reason || null, deviceLabel: 'Test fixture recording', outputLabel: '', deviceKind: 'computer', position: pos,
        sampleRate: plan.fs, settings: {}, plan: Object.assign({}, plan, { levelDb: 0 }), levels: an.levels, waveform: [], analysis: an, warnings: [] }, extra);
    }
    // Two spots of one meeting room: P1 and P2 differ by a few per cent, as positions do.
    const roomP1 = [0.62, 0.58, 0.60, 0.45, 0.56, 0.40], roomP2 = [0.66, 0.61, 0.57, 0.48, 0.52, 0.42], roomP1b = [0.64, 0.59, 0.61, 0.46, 0.55, 0.41];
    const t1 = take('mp-p1', '2026-10-16T09:00:00.000Z', roomP1, 31, 'P1'), r1 = PROC.evaluate(t1, {});
    {
      const before = json(r1), one = SP.aggregate([{ id: 'P1', result: r1 }]);
      check('A3 One position: every band of the room is the take\'s own RT60, path and quality, and the 1000 Hz headline is the take\'s (the signal processing is not touched)',
        r1.valid && one.bands.every((b, i) => b.rt60 === (RA.eligible(r1.bands[i]) ? r1.bands[i].rt60 : null) && b.path === (RA.eligible(r1.bands[i]) ? r1.bands[i].path : null) && b.quality === r1.bands[i].quality) && one.headline.rt60 === r1.headline.rt60 && json(r1) === before,
        r1.bands.map(b => `${b.f}: ${b.rt60} ${b.path}`).join(', '));
    }

    /* ===== A4 through the Processing step ===== */
    status('Processing positions (about 10 s)…');
    S.startProject('new');
    S.autofillTo('target');
    const p = S.state.project;
    S.set('room', Object.assign(copy(p.room), { name: 'Multi-position test room', type: 'Meeting room', use: 'Meetings and presentations', L: 9, W: 7, H: 3 }));
    p.setup.noise = { status: 'valid', takenAt: '2026-10-16T08:59:00.000Z', leqDbfs: -70, position: 'P1' };
    p.completed = W.STAGES.slice(0, W.idx('measure') + 1).map(s => s.id);
    p.review = [];
    S.emit();
    const ctx = () => ({ project: S.state.project, state: S.state });
    async function process(t) {
      p.measurement.recording = copy(t);
      S.emit();
      S.go('processing');
      await until(() => (p.processing.result && p.processing.result.recordingId === t.id) || (p.processing.attempt && p.processing.attempt.recordingId === t.id), `processing of ${t.id}`);
      await sleep(150);
    }
    await process(t1);
    {
      const s = D.positions(p), pv = W.get('processing').view(ctx()), rc = W.get('results').canContinue(p);
      check('A4 P1 valid: the room is measured at 1 of 2 positions; Processing leads to the next position ("Measure position P2") and Results does not continue, saying why',
        s.count === 1 && !s.complete && s.next === 'P2' && pv.primary && pv.primary.action === 'nextPosition' && /Measure position P2/.test(pv.primary.label) && /1 of 2 positions/.test(textOf(pv.body))
          && !rc.ok && /Measure at least 2 positions: 1 is measured\. Next: P2/.test(rc.reason),
        `${pv.primary && pv.primary.label} · ${rc.reason}`);
      const rv = textOf(W.get('results').view(ctx()).body);
      check('A4 Results says the room is not complete yet (1 of 2 positions) and offers the next position', /Measured at 1 of 2 positions/.test(rv) && /Measure position P2/.test(rv) && !bad(rv), rv.slice(rv.indexOf('Measured at 1 of 2'), rv.indexOf('Measured at 1 of 2') + 120));
      W.get('processing').actions.nextPosition(ctx());
      check('A4 "Measure position P2" selects P2 for the next take and opens Acoustic Measurement; nothing finished is put up for review', p.setup.position === 'P2' && S.state.current === 'measure' && !p.review.length, `position ${p.setup.position}; step ${S.state.current}; review ${p.review.join(', ') || 'none'}`);
    }
    const t2 = take('mp-p2', '2026-10-16T09:10:00.000Z', roomP2, 32, 'P2'), r2check = PROC.evaluate(t2, {});
    p.setup.noise = { status: 'valid', takenAt: '2026-10-16T09:09:00.000Z', leqDbfs: -70, position: 'P2' };
    await process(t2);
    const hand = (rs, f) => rs.map(r => r.bands.find(b => b.f === f)).filter(b => RA.eligible(b)).map(b => b.rt60);
    {
      const s = D.positions(p), room = D.room(p), rA = p.processing.positions.P1, rB = p.processing.positions.P2;
      const want = B.map(f => { const v = hand([rA, rB], f); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; });
      check('A4 P2 valid: both takes are kept, one per position; the room is complete and every band is the mean of P1 and P2 (worked out here); Results continues',
        s.count === 2 && s.complete && rA.recordingId === 'mp-p1' && rB.recordingId === 'mp-p2' && !(p.processing.history || []).length && room.bands.every((b, i) => (want[i] == null ? b.rt60 === null : close(b.rt60, want[i], 1e-12))) && W.get('results').canContinue(p).ok,
        room.bands.map(b => `${b.f}: ${b.rt60 && b.rt60.toFixed(3)}`).join(', '));
      check('A4 Processing then says the session is complete (P3 optional) and continues to Results', /measured at 2 positions/.test(textOf(W.get('processing').view(ctx()).body)) && !W.get('processing').view(ctx()).primary, 'complete');
    }
    // A new take at P1 replaces P1 only.
    const t1b = take('mp-p1b', '2026-10-16T09:20:00.000Z', roomP1b, 33, 'P1');
    p.setup.position = 'P1'; p.setup.noise = { status: 'valid', takenAt: '2026-10-16T09:19:00.000Z', leqDbfs: -70, position: 'P1' };
    await process(t1b);
    {
      const h = p.processing.history || [];
      check('A4 A new valid take at P1 replaces P1 only: the earlier P1 take is kept as superseded (with its position), P2 stays, the room is the mean of the new P1 and P2',
        p.processing.positions.P1.recordingId === 'mp-p1b' && p.processing.positions.P2.recordingId === 'mp-p2' && h.length === 1 && h[0].recordingId === 'mp-p1' && h[0].position === 'P1'
          && close(D.room(p).headline.rt60, (p.processing.positions.P1.headline.rt60 + p.processing.positions.P2.headline.rt60) / 2, 1e-12),
        `history ${h.map(x => `${x.recordingId} at ${x.position}`).join(', ')}`);
    }
    // An invalid take at P2 (the browser kept noise suppression on): kept as the latest attempt, never as a value.
    const t2bad = take('mp-p2-bad', '2026-10-16T09:30:00.000Z', roomP2, 34, 'P2', { settings: { noiseSuppression: true } });
    p.setup.position = 'P2';
    const roomBefore = json(D.room(p).bands.map(b => b.rt60));
    await process(t2bad);
    {
      const s = D.positions(p), row = s.rows.find(r => r.id === 'P2');
      check('A4 An invalid take at P2 is not used: the latest attempt keeps its reason and position, the earlier valid P2 take stays, the room\'s values do not change, and P2 is shown as measured with the failed retry noted',
        p.processing.attempt && p.processing.attempt.recordingId === 'mp-p2-bad' && p.processing.attempt.position === 'P2' && p.processing.positions.P2.recordingId === 'mp-p2' && json(D.room(p).bands.map(b => b.rt60)) === roomBefore
          && row.status === 'valid' && row.issue && row.issue.kind === 'invalid' && /noise suppression/.test(row.issue.reason) && s.count === 2,
        `P2 ${row.status}, latest retry ${row.issue && row.issue.kind}: ${row.issue && row.issue.reason.slice(0, 80)}`);
      const pv = textOf(W.get('processing').view(ctx()).body);
      check('A4 Processing says the take at P2 is not used, that the earlier valid take there is kept, and offers measuring again', /Position P2: this take is not used/.test(pv) && /earlier valid take at P2 is kept/.test(pv) && /Measure again/.test(pv), pv.slice(0, 160));
    }
    // A failed (unusable) take at P3 with no valid one there: P3 is "failed" with its reason, not part of the room.
    p.measurement.failed = { reason: 'The recording stopped early.', takenAt: '2026-10-16T09:40:00.000Z', position: 'P3' };
    S.emit();
    {
      const s = D.positions(p), row = s.rows.find(r => r.id === 'P3'), mv = textOf(W.get('measure').view(ctx()).body);
      check('A4 A take at P3 that could not be used: P3 is "Not used" with its reason and is no part of the room (2 positions)', row.status === 'failed' && row.issue.reason === 'The recording stopped early.' && D.room(p).count === 2 && /Take not used: The recording stopped early\./.test(mv) && /Retry here/.test(mv),
        `${row.status}: ${row.issue && row.issue.reason}`);
      p.measurement.failed = null;
      S.emit();
    }

    /* ===== A5 the verdict policy by room category ===== */
    // Changed 2026-10-19 (standards-based targets): DIN 18041 judges every octave band from 125 Hz to 4 kHz, 125 Hz and
    // 4 kHz against 0.65–1.45 × and 0.65–1.2 × T_soll (BNB 3.1.4), not as warnings at 0.6–1.4 ×; group B rooms and
    // dwellings get no RT60 target; the ANSI/ASA S12.60-2010 classroom limit is no longer applied.
    status('Policies…');
    {
      const IND = { 'Meeting room': 'Corporate offices and meeting rooms', 'Conference room': 'Corporate offices and meeting rooms', 'Private office': 'Corporate offices and meeting rooms',
        'Control room': 'Recording and music studios', 'Living room': 'Residential spaces', Classroom: 'Education and training facilities' };
      const room = (type, use, extra) => Object.assign({ industry: IND[type], type, use, L: 8, W: 6, H: 3 }, extra || {});
      const pol = (r, t) => EV.policyFor(r, t || null);
      const meet = pol(room('Meeting room', 'Meetings and presentations')), hyb = pol(room('Conference room', 'Video calls and hybrid meetings'));
      const office = pol(room('Private office', 'Focused desk work')), listen = pol(room('Control room', 'Mixing and critical listening'));
      const home = pol(room('Living room', 'Living and relaxing')), none = pol({}), cls = pol(room('Classroom', 'Teaching'));
      check('A5 Meeting and conference rooms (DIN 18041 A3, and A4 for video calls) are judged in every band from 125 Hz to 4 kHz: 250 Hz–2 kHz against the target range, 125 Hz and 4 kHz against the standard\'s own limits',
        meet.id === 'din-a' && json(meet.primary) === json([250, 500, 1000, 2000]) && json(meet.judged) === json(B) && json(Object.keys(meet.edge).map(Number)) === json([125, 4000]) && hyb.id === 'din-a'
          && meet.label === 'Speech range, 250 Hz–2 kHz' && meet.judgedShort === '125 Hz–4 kHz' && /DIN 18041 names meeting/.test(AM.services.target.category('Meeting room', 'Meetings and presentations').why),
        `${meet.label}; judged ${meet.judgedShort}; hybrid ${hyb.criterion}`);
      check('A5 Offices (NBC 2016) are judged at 500 Hz only; listening rooms (EBU Tech 3276) 250 Hz–4 kHz and 125 Hz; a dwelling and a room without a criterion have no recommendation (the app\'s default bands, said to be its convention); a classroom DIN 18041 A',
        office.id === 'nbc-500' && json(office.primary) === json([500]) && json(office.judged) === json([500]) && listen.id === 'ebu' && json(listen.primary) === json([250, 500, 1000, 2000, 4000]) && json(listen.judged) === json(B)
          && home.id === 'default' && !home.criterion && home.interpretation && json(home.primary) === json([500, 1000, 2000]) && none.id === 'default' && cls.id === 'din-a',
        [office, listen, home, none, cls].map(x => `${x.id}: ${x.judgedShort}`).join(' · '));
      // Limits for T_soll = 0.60 s (target 0.48–0.72 s): 125 Hz 0.65 × 0.6 = 0.39 to 1.45 × 0.6 = 0.87; 4 kHz 0.39 to 1.2 × 0.6 = 0.72.
      // EBU, around the room's MEASURED Tm (here 0.25 s): 125 Hz from Tm − 0.05 = 0.20 to Tm + 0.30 − 0.25 × lg(125/63)/lg(200/63)
      // = 0.25 + 0.152 = 0.40; without a measured Tm a band has no limits.
      // NBC: 500 Hz at most 0.75 s, no lower limit; 1 kHz not judged.
      const t = { preferred: 0.6, min: 0.48, max: 0.72 }, L = f => EV.limits(f, t, meet);
      const te = { preferred: 0.25, min: 0.2, max: 0.4 }, tn = { form: 'max', preferred: null, min: null, max: 0.75 };
      check('A5 Band limits: DIN 18041 for T_soll 0.60 s, 250 Hz–2 kHz 0.48–0.72 s, 125 Hz 0.39–0.87 s, 4 kHz 0.39–0.72 s (all judged); EBU 125 Hz 0.20–0.40 s around Tm 0.25 s; NBC 500 Hz at most 0.75 s',
        json([125, 250, 1000, 4000].map(f => [L(f).role, L(f).min, L(f).max])) === json([['edge', 0.39, 0.87], ['primary', 0.48, 0.72], ['primary', 0.48, 0.72], ['edge', 0.39, 0.72]])
          && json(EV.limits(125, te, listen, 0.25)) === json({ role: 'edge', min: 0.2, max: 0.4 }) && EV.limits(125, te, listen).min === null && json(EV.limits(500, tn, office)) === json({ role: 'primary', min: null, max: 0.75 }) && EV.limits(1000, tn, office).role === 'info',
        json([125, 250, 1000, 4000].map(f => [f, L(f).min, L(f).max])) + ` · EBU 125 ${json(EV.limits(125, te, listen, 0.25))}`);
      // 9 × 7 × 3.2 = 201.6 m³: 0.32 × lg 201.6 − 0.17 = 0.32 × 2.30449 − 0.17 = 0.56744 s → 0.57 (0.45–0.68); nothing narrows it.
      const rec = AM.services.target.recommend(room('Classroom', 'Teaching', { L: 9, W: 7, H: 3.2 }));
      check('A5 A classroom\'s target is DIN 18041 A3\'s own, 0.57 s (0.45–0.68 s) for 201.6 m³: no other standard\'s limit is added (ANSI/ASA S12.60-2010 is superseded)',
        rec.preferred === 0.57 && rec.min === 0.45 && rec.max === 0.68 && rec.sources.length === 1 && rec.reference.id === 'din18041', `${rec.preferred} (${rec.min}–${rec.max}); ${rec.basisLabel}`);
      const custom = pol(room('Meeting room', 'Meetings and presentations'), { preferred: 0.7, min: 0.6, max: 0.8, source: 'custom' });
      check('A5 A custom target keeps the bands of the room\'s criterion and says it was set by hand', custom.id === 'din-a' && custom.custom, custom.label);
    }

    /* ===== A6 the verdict: masked averages, edge bands, missing bands, upper limits ===== */
    status('Verdict…');
    {
      const t = { preferred: 0.6, min: 0.48, max: 0.72 }, pol = EV.policyFor({ industry: 'Corporate offices and meeting rooms', type: 'Meeting room', use: 'Meetings and presentations', L: 8, W: 6, H: 3 }, t);
      const judgeWith = (tt, pp) => vals => { const rows = EV.bandRows(Object.fromEntries(B.map((f, i) => [f, vals[i]])), tt, pp); const res = { valid: true, bands: B.map((f, i) => band(f, vals[i])) }; const v = EV.verdict(rows, RA.ofBands(res, pp.primary), tt, pp); return { rows, v, ex: EV.explain(v, rows, tt, pp), sm: RA.ofBands(res, pp.primary) }; };
      const judge = judgeWith(t, pol);
      // 250 Hz 0.80 above 0.72; the other range bands 0.58, 0.56, 0.62: average (0.80 + 0.58 + 0.56 + 0.62) ÷ 4 = 0.64,
      // inside the range. The room does NOT meet the target.
      const m = judge([0.65, 0.80, 0.58, 0.56, 0.62, 0.55]);
      check('A6 An average inside the range (2.56 ÷ 4 = 0.64 s) does not pass the room when a judged band is outside it (250 Hz 0.80 s > 0.72 s): verdict "above", masked, and the explanation says every judged band has to be',
        close(m.sm.value, 2.56 / 4, 1e-12) && m.v.summaryStatus === 'within' && m.v.status === 'above' && m.v.masked && json(m.v.above.map(r => r.f)) === json([250]) && m.ex.headline === 'Does not meet the target' && /every judged band has to be/.test(m.ex.lines.join(' ')) && /250 Hz \(0\.80 s\)/.test(m.ex.lines.join(' ')),
        `${m.ex.headline}: ${m.ex.lines.join(' ')}`);
      // 125 Hz 0.90 above its own limit (0.87) with 250 Hz–2 kHz inside: the room does not meet the target (DIN 18041 judges 125 Hz).
      const e = judge([0.90, 0.62, 0.58, 0.56, 0.62, 0.55]), e2 = judge([0.85, 0.62, 0.58, 0.56, 0.62, 0.55]);
      check('A6 125 Hz 0.90 s above its own limit (0.87 s) decides the verdict: "Does not meet the target", naming 125 Hz and its limit; 0.85 s is within it although above the 0.72 s range',
        e.v.status === 'above' && json(e.v.above.map(r => r.f)) === json([125]) && /125 Hz \(0\.90 s, limit 0\.39–0\.87 s\)/.test(e.ex.lines.join(' ')) && !e.v.warnings.length && e2.v.status === 'within' && e2.rows.find(r => r.f === 125).status === 'within',
        `${e.ex.lines.join(' ')} · 0.85 s: ${e2.v.status}`);
      // 4 kHz 0.36 below its own lower limit (0.39): "below"; 0.42 is within its own limit although below the 0.48 s range.
      const w2 = judge([0.65, 0.62, 0.58, 0.56, 0.62, 0.36]), w3 = judge([0.65, 0.62, 0.58, 0.56, 0.62, 0.42]);
      check('A6 4 kHz below its own lower limit (0.36 < 0.39 s) makes the room "Drier than the target"; 0.42 s is inside its own limit although below the 0.48 s range',
        w2.v.status === 'below' && json(w2.v.below.map(r => r.f)) === json([4000]) && w3.v.status === 'within' && w3.rows.find(r => r.f === 4000).status === 'within', `${w2.ex.headline}; 0.42 s: ${w3.v.status}`);
      // A judged band not measured: incomplete, never a full pass (a range band and an edge band).
      const g = judge([0.65, null, 0.58, 0.56, 0.62, 0.55]), g2 = judge([null, 0.62, 0.58, 0.56, 0.62, 0.55]);
      check('A6 250 Hz (judged) not measured: "Meets the target where measured", naming 250 Hz, with the average of the other three range bands; 125 Hz not measured: also incomplete (it is judged)',
        g.v.status === 'within' && !g.v.complete && json(g.v.missing) === json([250]) && g.ex.headline === 'Meets the target where measured' && close(g.sm.value, 1.76 / 3, 1e-12)
          && !g2.v.complete && json(g2.v.missing) === json([125]) && g2.ex.headline === 'Meets the target where measured',
        `${g.ex.headline}: ${g.ex.lines.join(' ')} · ${g2.ex.lines.join(' ')}`);
      // Too few range bands (1 of 4): not assessed, no status.
      const f = judge([0.6, null, null, 0.56, null, 0.55]);
      check('A6 Only 1 of the 4 range bands measured: not assessed (no status), with the reason', !f.v.available && f.v.status === null && f.ex.headline === 'Not assessed' && /at least 2 of the 4 bands/.test(f.v.reason), f.v.reason);
      // Drier than the target in a range band, none above: "below", treatment not recommended.
      const d = judge([0.55, 0.50, 0.46, 0.50, 0.53, 0.50]);
      check('A6 A range band below the range and none above: "Drier than the target"', d.v.status === 'below' && d.ex.headline === 'Drier than the target' && json(d.v.below.map(r => r.f)) === json([500]), d.ex.lines.join(' '));
      // NBC 2016 upper limit (0.75 s at 500 Hz): judged at 500 Hz only, and never "below".
      const tn = { form: 'max', preferred: null, min: null, max: 0.75 }, pn = EV.policyFor({ industry: 'Corporate offices and meeting rooms', type: 'Private office', use: 'Focused desk work', L: 5, W: 4, H: 3 }, tn);
      const nb = judgeWith(tn, pn), n1 = nb([1.2, 0.9, 0.70, 0.95, 0.9, 0.8]), n2 = nb([0.5, 0.5, 0.80, 0.5, 0.5, 0.5]), n3 = nb([0.3, 0.2, 0.15, 0.2, 0.2, 0.2]);
      check('A6 An upper-limit target (NBC 2016, 0.75 s at 500 Hz): 0.70 s at 500 Hz meets it whatever the other bands; 0.80 s does not; 0.15 s is within it, never "below"',
        n1.v.status === 'within' && n1.v.complete && n2.v.status === 'above' && n3.v.status === 'within' && n1.rows.filter(r => r.role !== 'info').map(r => r.f).join() === '500' && /500 Hz band rings for at most 0\.75 s/.test(n1.ex.lines.join(' ')),
        `${n1.ex.lines.join(' ')} · ${n2.ex.headline} · ${n3.ex.headline}`);
    }
    // The same rule in the app, on the project: Assessment shows the verdict over every judged band.
    {
      p.target = { source: 'custom', basis: 'Test', preferred: 0.55, min: 0.45, max: 0.62 };
      p.completed = W.STAGES.map(s => s.id);
      S.emit();
      const a = D.assessment(p), at = textOf(W.get('assessment').view(ctx()).body);
      const judged = a.bands.filter(b => b.role === 'primary' || b.role === 'edge'), above = judged.filter(b => b.status === 'above').map(b => b.f), below = judged.filter(b => b.status === 'below').map(b => b.f);
      check('A6 On the project (two positions): the verdict follows every judged band of the room averaged over the positions, the summary is the average of its range bands, and Assessment shows the verdict',
        a.available && a.positions.valid === 2 && !a.provisional && a.status === (above.length ? 'above' : below.length ? 'below' : 'within') && close(a.rt, a.policy.primary.reduce((x, f2) => x + D.room(p).bands.find(b => b.f === f2).rt60, 0) / a.policy.primary.length, 1e-12)
          && /Result against the target/.test(at) && !bad(at),
        `${a.policy.id}: verdict ${a.status} (above: ${above.join(', ') || 'none'}; below: ${below.join(', ') || 'none'}); summary ${a.rt.toFixed(3)} s`);
      const groups = D.soundGroups(p), low = groups.find(g2 => g2.id === 'low');
      const lowRows = a.bands.filter(b => [125, 250].includes(b.f) && b.status && b.status !== 'insufficient').map(b => b.status);
      check('A6 The plain "low sounds" status follows its bands\' own limits (any band above its limit: too echoey)', low.status === (lowRows.includes('above') ? 'above' : lowRows.includes('below') ? 'below' : lowRows.length ? 'within' : 'none'), `${low.status} from ${lowRows.join(', ')}`);
    }

    /* ===== A7 the PDF and the record agree with the room ===== */
    status('Report…');
    {
      const room = D.room(p), M = AM.report.model(p), built = await AM.report.build(p), txt = pdfText(built.bytes), rec = AM.reportGate.projectSummary(p), a = D.assessment(p);
      const P1 = p.processing.positions.P1, P2 = p.processing.positions.P2;
      check('A7 The report model is the room: the same band values as AM.derive.room, both positions, the latest take for the device details',
        json(M.measurement.bands.map(b => b.rt60)) === json(room.bands.map(b => b.rt60)) && json(M.measurement.room.positions.map(x => x.id)) === json(['P1', 'P2']) && M.measurement.id === p.processing.result.recordingId && M.measurement.summary.value === a.rt,
        `positions ${M.measurement.room.positions.map(x => x.id).join(', ')}; latest take ${M.measurement.id}`);
      const posVals = [P1, P2].flatMap(r => r.bands.filter(b => RA.eligible(b)).map(b => fmt.s(b.rt60)));
      check('A7 The PDF lists the positions (P1, P2) with each position\'s band values and the room\'s band values, the verdict box with the judged range, and the key figure with the room\'s summary',
        built.doc.pages.length <= 2 && txt.includes('Positions') && txt.includes('P1, P2') && posVals.every(v => txt.includes(v)) && room.bands.filter(b => b.rt60 != null).every(b => txt.includes(fmt.s(b.rt60)))
          && txt.includes('VERDICT · BAND BY BAND') && txt.includes(`MEASURED RT60 · ${a.policy.short}`) && txt.includes(fmt.s(a.rt)) && txt.includes('Average of 2 positions') && !bad(txt),
        `${built.doc.pages.length} page(s)`);
      check('A7 The PDF separates measured, target, estimated and recommended content and states its limits: no conformity with ISO 3382-2 and no uncertainty claimed',
        txt.includes('MEASURED') && txt.includes('TARGET') && txt.includes('RECOMMENDATION') && /no conformity with ISO 3382-2 and no measurement uncertainty are claimed/.test(txt), 'labels and limitations present');
      check('A7 The report form\'s record holds the room\'s 1000 Hz value (the mean of P1 and P2, not the latest take\'s) and the room\'s all-band average; no column changes or is added',
        rec.measuredRt60 === Number(room.headline.rt60.toFixed(2)) && rec.measuredRt60Avg === Number(RA.of(room).value.toFixed(2)) && json(Object.keys(rec)) === json(AM.reportForm.project.map(f => f.key)),
        `measuredRt60 ${rec.measuredRt60} (room ${room.headline.rt60.toFixed(3)}, latest take ${p.processing.result.headline.rt60}); measuredRt60Avg ${rec.measuredRt60Avg}`);
    }

    /* ===== A8 the report lock ===== */
    status('Report lock…');
    {
      const realFetch = window.fetch, calls = [];
      let answer = { verified: false, reason: 'invalid_receipt' };
      window.fetch = async (url, opt) => { calls.push(String(url)); return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
      try {
        const none = await AM.report.download(p);
        check('A8 Without a received report form the PDF is locked, and nothing is asked of the server', !none.ok && /Send the report form/.test(none.message) && !calls.some(u => /verify/.test(u)), none.message);
        // A receipt written into this browser's storage by hand: the server does not confirm it, so the report stays locked,
        // and the browser forgets it (a second download asks for the form again).
        const KEY = 'acoustic-measurement-prototype:report-submissions', put = () => { const all = JSON.parse(localStorage.getItem(KEY) || '{}'); all[p.id] = { createdAt: p.createdAt, status: 'success', submissionId: 'forged', projectId: p.id, submittedAt: '2026-10-16T10:00:00.000Z', receipt: 'f'.repeat(64) }; localStorage.setItem(KEY, JSON.stringify(all)); };
        put();
        const forged = await AM.report.download(p), asked = calls.filter(u => /verify/.test(u)).length, kept = JSON.parse(localStorage.getItem(KEY) || '{}')[p.id];
        const again = await AM.report.download(p);
        check('A8 A receipt stored in the browser alone unlocks nothing: the server is asked, does not confirm it, the PDF stays locked and the browser forgets the receipt (the next download asks for the form)',
          !forged.ok && asked === 1 && !kept && !AM.reportGate.isUnlocked(p) && !again.ok && /Send the report form/.test(again.message), `${forged.message} · then: ${again.message}`);
        // A receipt the server does confirm: it is asked again before EVERY download (AM.reportGate.check, which
        // AM.report.download calls first), and the moment it stops confirming, the report locks.
        put();
        answer = { verified: true, submittedAt: '2026-10-16T10:00:00.000Z' };
        const c1 = await AM.reportGate.check(p), c2 = await AM.reportGate.check(p), n2 = calls.filter(u => /verify/.test(u)).length;
        answer = { verified: false, reason: 'not_found' };
        const c3 = await AM.reportGate.check(p);
        check('A8 With a receipt the server confirms, the server is asked before every download (twice for two), and once it stops confirming the report is locked again',
          c1.ok && c2.ok && n2 === asked + 2 && !c3.ok && !AM.reportGate.isUnlocked(p), `asked ${n2 - asked} times for two checks; then ${c3.message}`);
        const all = JSON.parse(localStorage.getItem(KEY) || '{}'); delete all[p.id]; localStorage.setItem(KEY, JSON.stringify(all));
      } finally { window.fetch = realFetch; }
    }

    /* ===== A9 a project measured before positions were kept ===== */
    status('Migration…');
    {
      const old = copy(p);
      Object.assign(old, { id: window.LEGACY_ID, createdAt: '2026-10-10T09:00:00.000Z', updatedAt: '2026-10-10T09:00:00.000Z' });
      old.room.name = 'Measured before positions';
      old.processing = { result: copy(p.processing.positions.P1), attempt: null, history: [] }; // no positions map
      old.completed = W.STAGES.map(s => s.id);
      old.review = [];
      delete old.legacyNote;
      const KEY = 'acoustic-measurement-prototype', idx = JSON.parse(localStorage.getItem(KEY) || '{"v":2,"ids":[]}');
      localStorage.setItem(`${KEY}:p:${old.id}`, JSON.stringify(old));
      idx.ids = (idx.ids || []).concat([old.id]);
      localStorage.setItem(KEY, JSON.stringify(idx));
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
      const m = S.state.projects.find(x => x.id === old.id);
      check('A9 A project measured before positions were kept: its take becomes P1 (nothing measured is lost), Results and Assessment are marked for review, and the reason is given; its room is provisional (1 of 2)',
        m && m.processing.positions && m.processing.positions.P1 && m.processing.positions.P1.recordingId === old.processing.result.recordingId && m.review.includes('results') && m.review.includes('assessment')
          && /measured at one position/.test(m.legacyNote || '') && D.positions(m).count === 1 && D.assessment(m).provisional,
        m ? `positions ${Object.keys(m.processing.positions).join(', ')}; review ${m.review.join(', ')}` : 'not loaded');
    }
    // A project processed before RT60 was reported from T20 (20 October 2026): its bands used T30 where 45 dB was usable.
    // Each band is brought over to the T20 its take kept, never re-estimated, so positions are never averaged across methods.
    {
      const old = copy(p), t20s = [0.60, 0.55, 0.57, 0.48, 0.45, 0.41];
      Object.assign(old, { id: `${window.LEGACY_ID}-t30`, createdAt: '2026-10-11T09:00:00.000Z', updatedAt: '2026-10-11T09:00:00.000Z' });
      old.room.name = 'Measured with T30 first';
      Object.keys(old.processing.positions).forEach(pos => { const r = old.processing.positions[pos]; delete r.rtMethod; r.bands.forEach((b, i) => { if (b.rt60 != null) Object.assign(b, { path: 'T30', t30: b.rt60, t20: t20s[i] }); }); r.headline.method = 'T30'; });
      old.processing.result = copy(old.processing.positions.P2);
      old.completed = W.STAGES.map(s => s.id);
      old.review = [];
      const KEY = 'acoustic-measurement-prototype', idx = JSON.parse(localStorage.getItem(KEY) || '{"v":2,"ids":[]}');
      localStorage.setItem(`${KEY}:p:${old.id}`, JSON.stringify(old));
      idx.ids = (idx.ids || []).concat([old.id]);
      localStorage.setItem(KEY, JSON.stringify(idx));
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
      const m = S.state.projects.find(x => x.id === old.id), r1 = m && m.processing.positions.P1, room = m && D.room(m);
      check('A10 A project processed with T30 first: every band is brought over to the T20 its take kept (at every position), the headline follows, the room average is over T20 only, and Results and the steps after it are marked for review',
        m && r1.bands.every((b, i) => b.rt60 == null || (b.path === 'T20' && b.rt60 === t20s[i] && b.converted)) && r1.headline.method === 'T20' && r1.rtMethod === 'T20'
          && room.bands.every((b, i) => b.rt60 == null || Math.abs(b.rt60 - t20s[i]) < 1e-12) && ['results', 'assessment', 'final'].every(id => m.review.includes(id)),
        m ? `${r1.bands.map(b => `${b.f}: ${b.rt60} ${b.path}`).join(' · ')}; review ${m.review.join(', ')}` : 'not loaded');
    }
    status('Part A done.');
  }

  /* ================================= Part B: the guided workflow, virtual device ================================= */
  async function partB() {
    const { S, W, D, RA, B } = A, VR = window.VR;
    const ctx = () => ({ project: S.state.project, state: S.state });
    // Room at P1 and P2: a few per cent apart, as two spots in one room are.
    const atP1 = [0.62, 0.58, 0.60, 0.50, 0.48, 0.44], atP2 = [0.68, 0.61, 0.56, 0.53, 0.46, 0.42], atP3 = [0.65, 0.57, 0.58, 0.52, 0.47, 0.43];
    Object.assign(VR, { rt: atP1, directDb: 28, noiseDbfs: -66, speakerDbfs: -24 });
    if (VR.room) VR.rebuild();
    S.startProject('new');
    S.autofillTo('setup');
    const p = S.state.project;
    S.set('room', Object.assign(JSON.parse(JSON.stringify(p.room)), { name: 'Guided positions', type: 'Meeting room', use: 'Meetings and presentations', L: 9, W: 7, H: 3 }));
    W.get('setup').demoFill(p);
    status('Microphone…');
    await AM.live.requestAccess(p);
    await until(() => p.setup.permission === 'granted', 'microphone access');
    async function noise(label) {
      status(`${label}: background (5 s)…`);
      const before = p.setup.noise && p.setup.noise.takenAt;
      AM.live.measureNoise(p);
      await until(() => p.setup.noise && p.setup.noise.takenAt !== before && !AM.live.state.noise, `the background at ${label}`);
    }
    async function takeAt(label) {
      const before = p.measurement.recording && p.measurement.recording.id, failedBefore = p.measurement.failed && p.measurement.failed.takenAt;
      S.go('measure'); await sleep(250);
      AM.live.measureRT60(p);
      status(`${label}: recording (10 s)…`);
      await until(() => !AM.live.state.take && ((p.measurement.recording && p.measurement.recording.id !== before) || (p.measurement.failed && p.measurement.failed.takenAt !== failedBefore)), `the take at ${label}`);
      const rec = p.measurement.recording && p.measurement.recording.id !== before ? p.measurement.recording : null;
      if (!rec) return { rec: null };
      status(`${label}: processing…`);
      S.go('measure'); await sleep(100);
      S.advance();
      await until(() => (p.processing.positions && Object.values(p.processing.positions).some(r => r.recordingId === rec.id)) || (p.processing.attempt && p.processing.attempt.recordingId === rec.id), `processing at ${label}`);
      await sleep(200);
      return { rec, valid: Object.values(p.processing.positions || {}).some(r => r.recordingId === rec.id) };
    }
    await noise('P1');
    S.autofillTo('measure');
    // B1
    const o1 = await takeAt('P1');
    const pv1 = W.get('processing').view(ctx());
    check('B1 P1 measured through the whole app: the take is valid, kept at P1; Processing leads to "Measure position P2"; Results does not continue with one position',
      o1.valid && p.processing.positions.P1 && pv1.primary && pv1.primary.label === 'Measure position P2' && !W.get('results').canContinue(p).ok, `${o1.rec && o1.rec.id}; ${pv1.primary && pv1.primary.label}`);
    W.get('processing').actions.nextPosition(ctx());
    await sleep(300);
    // B2
    const mv = textOf(W.get('measure').view(ctx()).body);
    check('B2 At P2 the take cannot start until the background is measured there: the Measure step says so (the check at P1 does not count)',
      p.setup.position === 'P2' && /Measure the background noise at P2 first/.test(mv) && /Not measured here/.test(mv), mv.slice(mv.indexOf('Measure the background noise at P2'), mv.indexOf('Measure the background noise at P2') + 90));
    // B3: a take at P2 with a loud background (too little decay at 1 kHz): not valid.
    VR.rt = atP2; VR.rebuild();
    VR.setNoise(-48);
    await noise('P2');
    const p1Before = JSON.stringify(p.processing.positions.P1);
    const o2 = await takeAt('P2 (loud background)');
    VR.setNoise(-66);
    // Back on the Measure step (the microphone runs only there), which offers the retry.
    S.go('measure');
    await until(() => AM.live.state.mic.status === 'live' && AM.live.receiving(), 'the microphone on the Measure step');
    const row2 = D.positions(p).rows.find(r => r.id === 'P2');
    check('B3 The take at P2 with a loud background is rejected with its reason and is not part of the room; P1 is untouched; Results still does not continue; P2 can be retried',
      o2.rec && !o2.valid && row2.status === 'invalid' && !!row2.issue.reason && JSON.stringify(p.processing.positions.P1) === p1Before && D.room(p).count === 1 && !W.get('results').canContinue(p).ok
        && /Retry P2/.test((W.get('measure').view(ctx()).primary || {}).label || ''),
      `P2 ${row2.status}: ${row2.issue && row2.issue.reason}`);
    // B4: retry at P2 in a quiet moment.
    await noise('P2 again');
    const o3 = await takeAt('P2 (retry)');
    const rA = p.processing.positions.P1, rB = p.processing.positions.P2, room = D.room(p);
    const want = B.map(f => { const v = [rA, rB].map(r => r.bands.find(b => b.f === f)).filter(b => RA.eligible(b)).map(b => b.rt60); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; });
    check('B4 The retry at P2 is valid: the session is complete (2 positions), every band of the room is the mean of P1 and P2 (worked out here), and Results continues',
      o3.valid && D.positions(p).complete && room.bands.every((b, i) => (want[i] == null ? b.rt60 === null : Math.abs(b.rt60 - want[i]) < 1e-12)) && W.get('results').canContinue(p).ok,
      room.bands.map(b => `${b.f}: ${b.rt60 && b.rt60.toFixed(3)} (${b.n}/${b.of})`).join(', '));
    // B5: an optional third position, then leaving and reopening the project.
    VR.rt = atP3; VR.rebuild();
    A.S.update(pp => { pp.setup.position = 'P3'; });
    await noise('P3');
    const o4 = await takeAt('P3');
    check('B5 An optional third position is averaged in: 3 positions, each band the mean of the three', o4.valid && D.room(p).count === 3 && D.room(p).bands.every(b => b.rt60 == null || b.n <= 3), `count ${D.room(p).count}`);
    const id = p.id, before = JSON.stringify(D.room(p).bands.map(b => b.rt60));
    S.go('setup'); await sleep(100); S.go('results'); await sleep(100);
    S.closeProject(); await sleep(100); S.openProject(id); await sleep(200);
    const q = S.state.project;
    check('B5 Moving between steps and closing and reopening the project keeps every position and the room\'s values', q && q.id === id && Object.keys(q.processing.positions).sort().join(',') === 'P1,P2,P3' && JSON.stringify(D.room(q).bands.map(b => b.rt60)) === before, Object.keys(q.processing.positions).join(','));
    status('Part B done.');
  }

  window.MULTI_POSITION_A_DONE = partA().catch(e => { check('Part A ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Part A error'); });
  window.MULTI_POSITION_B_DONE = new Promise(resolve => {
    const btn = document.getElementById('mp-run');
    btn.addEventListener('click', () => { window.MULTI_POSITION_A_DONE.then(() => partB()).then(resolve, e => { check('Part B ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Part B error'); resolve(); }); }, { once: true });
  });
})();
