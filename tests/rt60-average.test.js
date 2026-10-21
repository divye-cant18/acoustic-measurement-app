/* Tests of the room's average RT60, 125–4000 Hz (AM.services.rt60Average), of every place that shows it, and of every
   room-wide calculation that uses it, in the whole application (tests/rt60-average.html). Development only. Results on
   the page and in window.RT60_AVERAGE_TEST (window.RT60_AVERAGE_DONE resolves).

   Expected values are worked out by hand in the comments from fixed band values, chosen so that the six-band average
   differs from the earlier 500–2000 Hz one. For real takes (synthetic recordings of known rooms, tests/fixtures.js,
   through the production analysis and processing) the expected average is summed here from the result's own band
   values, without the service.

    The room's RT60 is the mean of the bands from 125 to 4000 Hz that have a reliable value (AM.services.rt60Average): a
    band the device could not measure is left out and named; at least half of the bands are needed (3 of 6), else there
    is no average. The 500–2000 Hz average (at least 2 of its 3 bands) is shown beside it.
    1 all six bands enter it; 125, 250 and 4000 Hz count like the others
    2 a band without a reliable value is left out and named; too few bands mean no average
    3 missing, zero, negative, NaN, infinite and text values; a band without a path; a band with T20 but no RT60; a
      band's own T20 result used as it is
    4 no band with a value, an invalid result, no result: "Unavailable", never 0 or NaN
    5 one measurement only: superseded measurements and later invalid takes are never mixed in
    6 unrounded values averaged, rounding only for display
    7 the same values on every screen, in the PDF and in the report form's record: the all-band average, and the
      average over the bands the room is judged in (AM.derive.summaryRT60; 250 Hz–2 kHz for this meeting room, DIN 18041
      group A), each where it belongs
    8 the band tables keep every band's own result; the plain groups are judged by their own bands' limits
    9 the verdict is decided band by band over the judged bands: an average inside the range does not pass the room when
      a judged band is outside it; the treatment amount and the prediction use the same bands; the per-band values stay
   10 a new measurement replaces the summary through the Processing step; an invalid later take does not
   11 a changed band changes the averages and everything that depends on them, and only those it belongs to
   12 a band left out: the averages of the others drive everything; a judged band left out leaves the verdict
      incomplete, never passed; too few bands: nothing room-wide, nothing in its place (no 1000 Hz), no NaN or Infinity
   Since app 2026.10.16 the room's values are the average over its measuring positions (tests/multi-position.html);
   here every take is made at one position, so the room's values are that take's. */
(function () {
  'use strict';
  const results = window.RT60_AVERAGE_TEST = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); show(); };
  const status = t => { const el = document.getElementById('av-status'); if (el) el.textContent = t; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function show() {
    const el = document.getElementById('av-out');
    if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${esc(t.name)}<br><small>${esc(t.detail)}</small></li>`).join('');
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, what, ms = 30000) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); }
    throw new Error(`Timed out waiting for ${what}`);
  }
  const close = (a, b, tol = 1e-12) => typeof a === 'number' && Math.abs(a - b) <= tol;
  const json = o => JSON.stringify(o);
  const copy = o => JSON.parse(JSON.stringify(o));
  const textOf = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); };
  const dom = h => { const d = document.createElement('div'); d.innerHTML = h; return d; };
  // Label → value pairs of the key-value lists (ui.kv) and the project card's figures, as the screen shows them.
  const pairs = (h, row, k, v) => Object.fromEntries([...dom(h).querySelectorAll(row)].map(r => [r.querySelector(k).textContent.trim(), r.querySelector(v).textContent.replace(/\s+/g, ' ').trim()]));
  const NR = 'Only 21 dB of the room\'s own decay above the recording background noise. T20 needs 35 dB.';
  const bad = s => /NaN|Infinity|undefined/.test(s);

  // Clear what an earlier run left under this page's prefix (tests/rt60-average.html).
  (function clean() {
    const P = 'rt60-average-test:';
    [localStorage, sessionStorage].forEach(st => {
      const keys = [];
      for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(P)) keys.push(k.slice(P.length)); }
      keys.forEach(k => st.removeItem(k));
    });
  })();

  async function run() {
    await window.APP_READY;
    await until(() => AM.store && AM.store.state && AM.app && AM.services.rt60Average, 'the app');
    const RA = AM.services.rt60Average, S = AM.store, W = AM.workflow, D = AM.derive, A = AM.acoustics, ui = AM.ui, fmt = AM.util.fmt;
    const B = AM.demo.BANDS;
    // A band as the processing engine leaves it: a value with its path and quality, or none with the reason.
    const band = (f, rt60, extra) => Object.assign({ f, rt60, t20: null, t30: rt60, path: rt60 == null ? null : 'T30', quality: rt60 == null ? 'Insufficient' : 'Good', reason: rt60 == null ? NR : null }, extra);
    const result = (bands, extra) => Object.assign({ valid: true, status: 'valid', referenceBand: 1000, recordingId: 'fixture', takenAt: '2026-10-13T08:00:00.000Z', bands }, extra);
    const six = (vals, over = {}) => result(B.map((f, i) => (over[f] !== undefined ? over[f] : band(f, vals[i]))));

    /* ===== 1. all six bands ===== */
    status('Service…');
    {
      // (0.62 + 0.55 + 0.50 + 0.48 + 0.45 + 0.40) = 3.00; ÷ 6 = 0.5000 s. The earlier 500–2000 Hz mean would be
      // (0.50 + 0.48 + 0.45) ÷ 3 = 0.4767 s, so the two cannot be confused.
      const a = RA.of(six([0.62, 0.55, 0.50, 0.48, 0.45, 0.40]));
      check('1 All six bands with a value: the average is their mean, (0.62 + 0.55 + 0.50 + 0.48 + 0.45 + 0.40) ÷ 6 = 0.5000 s (not the 500–2000 Hz mean 0.4767 s); every band is part of it',
        a.available && a.n === 6 && a.total === 6 && close(a.value, 3.00 / 6) && !close(a.value, 1.43 / 3, 1e-6) && json(a.included.map(b => b.f)) === json(B) && !a.excluded.length && json(RA.REQUIRED) === json([125, 250, 500, 1000, 2000, 4000]),
        `${a.value} s over ${a.included.map(b => b.f).join(', ')} Hz`);
      // 125, 250 and 4000 Hz count: raising each by 0.30 s raises the average by 0.30 ÷ 6 = 0.05 s.
      const up = [125, 250, 4000].map(f => RA.of(six([0.62, 0.55, 0.50, 0.48, 0.45, 0.40].map((v, i) => (B[i] === f ? v + 0.30 : v)))).value - a.value);
      check('1 125, 250 and 4000 Hz each enter the average: +0.30 s in one of them moves it by +0.30 ÷ 6 = +0.05 s',
        up.every(d => close(d, 0.05, 1e-12)), up.map(d => d.toFixed(4)).join(' / '));
    }

    /* ===== 2. bands without a reliable value ===== */
    {
      // 125 Hz not reliable (as a phone-like speaker often leaves it): the average of the five that are left,
      // (0.504 + 0.358 + 0.274 + 0.276 + 0.293) = 1.705; ÷ 5 = 0.341 s, with 125 Hz named as left out.
      const r = result([band(125, null), band(250, 0.504, { path: 'T20', t20: 0.504, t30: null, quality: 'Fair' }), band(500, 0.358), band(1000, 0.274), band(2000, 0.276, { quality: 'Fair' }), band(4000, 0.293, { quality: 'Fair' })]);
      const a = RA.of(r), m = RA.mid(r);
      check('2 125 Hz "Not reliable": the average of the five other bands, 1.705 ÷ 5 = 0.341 s, with 125 Hz named as left out ("5 of 6 bands"); the 500–2000 Hz average (0.358 + 0.274 + 0.276) ÷ 3 = 0.3027 s beside it',
        a.available && a.partial && a.n === 5 && close(a.value, 1.705 / 5, 1e-12) && json(a.missing.map(x => x.f)) === json([125]) && a.missing[0].reason.includes(NR)
          && RA.describe(a) === '5 of 6 bands (125 Hz not measured)' && m.available && !m.partial && close(m.value, 0.908 / 3, 1e-12),
        `${a.value} s (${RA.describe(a)}); 500–2000 Hz ${m.value} s`);
      // 500 Hz not reliable and 2000 Hz not measured: the average of the other four, (0.6 + 0.55 + 0.48 + 0.4) = 2.03 ÷ 4 =
      // 0.5075 s; the 500–2000 Hz average has only 1000 Hz of its three bands, fewer than the 2 it needs: none.
      const r2 = result([band(125, 0.6), band(250, 0.55), band(500, null), band(1000, 0.48), band(2000, null, { quality: 'Not measured', reason: null }), band(4000, 0.4)]);
      const a2 = RA.of(r2), m2 = RA.mid(r2);
      check('2 500 Hz not reliable and 2000 Hz not measured: the average of the other four, 2.03 ÷ 4 = 0.5075 s, both named; the 500–2000 Hz average needs 2 of its 3 bands, so there is none, with the reason',
        a2.available && close(a2.value, 2.03 / 4, 1e-12) && json(a2.missing.map(x => [x.f, x.reason.split(':')[0]])) === json([[500, 'Not reliable'], [2000, 'Not measured']])
          && !m2.available && m2.value === null && /at least 2 of the 3 bands/.test(m2.reason),
        `${a2.value} s · 500–2000 Hz: ${m2.reason}`);
      // Only two of the six bands with a value: fewer than half, so no average, never the mean of those two.
      const r3 = result([band(125, null), band(250, null), band(500, null), band(1000, 0.48), band(2000, 0.45), band(4000, null)]);
      const a3 = RA.of(r3);
      check('2 Only two of the six bands with a value: no average (at least 3 are needed), never the mean of the two', !a3.available && a3.value === null && /at least 3 of the 6 bands \(only 2 have one\)/.test(a3.reason), a3.reason);
    }

    /* ===== 3. values that are not a band RT60 ===== */
    {
      // Missing, 0, negative, NaN, infinite or text is no value, in a middle band (2000 Hz) and in an outer one (125 Hz):
      // that band is left out and named; never counted as 0, never NaN. Without 2000 Hz: (3.00 − 0.45) ÷ 5 = 0.51 s;
      // without 125 Hz: (3.00 − 0.62) ÷ 5 = 0.476 s.
      const base = [0.62, 0.55, 0.50, 0.48, 0.45, 0.40];
      const wrong = [null, 0, -0.3, NaN, Infinity, '0.5'];
      const want = { 2000: 2.55 / 5, 125: 2.38 / 5 };
      const got = [2000, 125].flatMap(f => wrong.map(v => [f, RA.of(six(base, { [f]: band(f, v) }))]));
      check('3 Missing, 0, negative, NaN, infinite or text at 2000 Hz or at 125 Hz: that band is left out and named, the average is of the other five (0.510 s / 0.476 s); never 0 or NaN',
        got.every(([f, a]) => a.available && a.n === 5 && close(a.value, want[f], 1e-12) && json(a.missing.map(x => x.f)) === json([f])), got.map(([f, a]) => `${f}:${a.value && a.value.toFixed(3)}`).join(' '));
      // A value without a calculation path, and a band with a T20 but no RT60: not counted (no band changes path to be
      // counted); a band that keeps its own T20 path is used as it is.
      const noPath = RA.of(six(base, { 500: band(500, 0.5, { path: null }) }));
      const t20only = RA.of(six(base, { 500: band(500, null, { t20: 0.41 }) }));
      const ownPath = RA.of(six(base, { 500: band(500, 0.5, { path: 'T20', t20: 0.5, t30: null, quality: 'Fair' }) }));
      check('3 A value without a calculation path, and a T20 where the band has no RT60, are left out (5 of 6 bands); a band\'s own T20 result is used as it is (no path switching)',
        noPath.n === 5 && json(noPath.missing.map(x => x.f)) === json([500]) && t20only.n === 5 && json(t20only.missing.map(x => x.f)) === json([500])
          && ownPath.n === 6 && ownPath.included.find(x => x.f === 500).path === 'T20' && close(ownPath.value, 3.00 / 6), `${RA.describe(noPath)} | ${RA.describe(t20only)} | ${ownPath.value}`);
    }

    /* ===== 4. nothing to average ===== */
    {
      const none = RA.of(result(B.map(f => band(f, null))));
      const invalid = RA.of(result(B.map(f => band(f, 0.5)), { valid: false, status: 'invalid' }));
      const missing = RA.of(null);
      const html = [none, invalid, missing].map(ui.averageSummary).join(''), txt = textOf(html);
      check('4 No band with a value, a take that is not valid, and no measurement: no average (value null), with the reason; nothing averaged from an invalid take',
        [none, invalid, missing].every(a => !a.available && a.value === null && a.n === 0 && a.reason) && invalid.missing.every(b => b.reason === 'Take not valid') && !invalid.included.length,
        [none, invalid, missing].map(a => a.reason).join(' · '));
      check('4 The summary then says "Unavailable" with the reason, never 0, 0.00 or NaN',
        (txt.match(/Unavailable/g) || []).length === 3 && !/NaN|0\.00|Infinity|undefined/.test(txt), txt.slice(0, 200));
    }

    /* ===== 6. unrounded values ===== */
    {
      // (0.304 × 5 + 0.314) = 1.834; ÷ 6 = 0.30567 → shown 0.31 s. Averaging the values as shown (0.30 × 5 + 0.31 =
      // 1.81; ÷ 6 = 0.3017) would show 0.30 s.
      const r = six([0.304, 0.304, 0.304, 0.304, 0.314, 0.304]);
      const a = RA.of(r), shownMean = a.included.reduce((s, b) => s + Number(b.rt60.toFixed(2)), 0) / a.n;
      const html = ui.averageSummary(a);
      check('6 The stored band values are averaged, not the values as shown: 1.834 ÷ 6 = 0.3057 s (kept unrounded) → 0.31 s on screen, where the shown values would give 0.3017 → 0.30 s',
        close(a.value, 1.834 / 6) && a.value !== Number(a.value.toFixed(2)) && fmt.s(a.value) === '0.31 s' && shownMean.toFixed(2) === '0.30' && /class="avg-v">0\.31<small>/.test(html) && html.includes('÷ 6 = 0.306 s'),
        `average ${a.value}; shown ${fmt.s(a.value)}; from the shown values ${shownMean.toFixed(3)}`);
      const r0 = copy(r);
      RA.of(r);
      check('6 The calculation does not change the result it reads (every band as before)', json(r0) === json(r), 'unchanged');
    }

    /* ===== predicted values, by the same rule ===== */
    {
      // Predicted 0.50, 0.46, 0.42, 0.40, 0.38, 0.36: 2.52 ÷ 6 = 0.42 s. A band without a prediction (no tested α there)
      // means no predicted average.
      const rows = B.map((f, i) => ({ f, measured: 0.6, predicted: [0.50, 0.46, 0.42, 0.40, 0.38, 0.36][i], missingAlpha: false }));
      const pa = RA.ofPrediction(rows), gap = RA.ofPrediction(rows.map(r => (r.f === 4000 ? Object.assign({}, r, { predicted: null, missingAlpha: true }) : r)));
      check('The predicted average: (0.50 + 0.46 + 0.42 + 0.40 + 0.38 + 0.36) ÷ 6 = 0.42 s; over the bands the measured average used, each must have a prediction (no tested α at 4000 Hz: none, with the reason)',
        pa.available && close(pa.value, 2.52 / 6) && pa.n === 6 && !gap.available && gap.value === null && /4000 Hz has no predicted value/.test(gap.reason) && /No tested α/.test(gap.reason),
        `${pa.value} · ${gap.reason}`);
      // When the measured average left out 125 Hz, the predicted one is taken over the same five bands:
      // (0.46 + 0.42 + 0.40 + 0.38 + 0.36) = 2.02 ÷ 5 = 0.404 s, whatever 125 Hz holds.
      const five = RA.ofPrediction(rows.map(r => (r.f === 125 ? Object.assign({}, r, { measured: null, predicted: null }) : r)), [250, 500, 1000, 2000, 4000]);
      check('The predicted average over the same five bands as a measured average that left out 125 Hz: 2.02 ÷ 5 = 0.404 s',
        five.available && five.n === 5 && close(five.value, 2.02 / 5, 1e-12), `${five.value}`);
    }

    /* ===== the app: synthetic takes of known rooms through the production analysis and processing ===== */
    status('Takes…');
    const AN = AM.analysis, PROC = AM.services.processing, FIX = window.FIX;
    const plan = AN.sweepPlan(48000), sweep = AN.makeSweep(plan);
    function take(id, takenAt, rt, seed, extra = {}) {
      const ir = FIX.roomIR({ fs: 48000, seconds: 3, rt, seed, directDb: 28 });
      const rec = FIX.recordSweep({ plan, sweep, ir, peakDbfs: -12, noiseDbfs: -70, noiseKind: 'pink', latency: 0.07, seed });
      const an = AN.analyseTake(rec, plan, sweep);
      return Object.assign({ id, takenAt, status: 'captured', reason: an.reason || null, deviceLabel: 'Test fixture recording', outputLabel: '', deviceKind: 'computer', position: 'P1',
        sampleRate: plan.fs, settings: {}, plan: Object.assign({}, plan, { levelDb: 0 }), levels: an.levels, waveform: [], analysis: an, warnings: [] }, extra);
    }
    // The average summed here, without the service: the mean of all six bands' own RT60.
    const manual = r => { const v = B.map(f => r.bands.find(b => b.f === f).rt60); return v.reduce((s, x) => s + x, 0) / v.length; };
    const mid = r => [500, 1000, 2000].map(f => r.bands.find(b => b.f === f).rt60).reduce((s, x) => s + x, 0) / 3;
    // Room A: 125 and 250 Hz long and 1000 Hz short, so its six-band average differs clearly from its 1000 Hz value and
    // from its 500–2000 Hz mean.
    // Room A's 4 kHz band is 0.36 s: with 0.40 s its six-band T20 average came out exactly equal to its 500–2000 Hz mean
    // (0.5600 s), and this test is about telling those apart.
    const roomA = [0.62, 0.58, 0.60, 0.45, 0.56, 0.36], roomB = [1.1, 1.0, 0.95, 0.9, 0.85, 0.8];
    const takeA = take('avg-take-a', '2026-10-13T09:00:00.000Z', roomA, 21);
    const resA = PROC.evaluate(takeA, {});

    S.startProject('new');
    S.autofillTo('target');
    const p = S.state.project;
    S.set('room', Object.assign(copy(p.room), { name: 'Average RT60 test room', L: 9, W: 7, H: 3 }));
    const r1k = resA.headline.rt60, avgA = RA.of(resA).value, V = A.geometry(p.room).V;
    // The room is a meeting room: DIN 18041 group A3, judged in 250, 500, 1000 and 2000 Hz.
    const PRIM = [250, 500, 1000, 2000], bv = (r, f) => r.bands.find(b => b.f === f).rt60;
    const smOf = r => PRIM.reduce((x, f) => x + bv(r, f), 0) / PRIM.length, smA = smOf(resA), topA = Math.max(...PRIM.map(f => bv(resA, f)));
    const r2 = x => Math.round(x * 100) / 100;
    // A target whose range holds the average over the judged bands but not the longest of them (in room A): the
    // verdict must fail the room even though the average passes. 1000 Hz alone would pass too.
    const tgt = { preferred: r2(smA - 0.02), min: r2(smA - 0.15), max: r2((smA + topA) / 2) };
    // A target every judged band meets: no treatment needed (Final Result without a treatment plan).
    const meets = { preferred: r2(smA), min: r2(Math.min(...PRIM.map(f => bv(resA, f))) - 0.05), max: r2(topA + 0.05) };
    p.measurement.recording = copy(takeA);
    p.processing.result = resA;
    p.setup.noise = { status: 'valid', takenAt: '2026-10-13T08:59:00.000Z', leqDbfs: -70, verdict: 'Suitable' };
    p.target = Object.assign({ source: 'custom', basis: 'Test' }, tgt);
    p.completed = W.STAGES.map(s => s.id);
    p.review = [];
    S.state.current = 'results';
    S.emit();
    const ctx = () => ({ project: S.state.project, state: S.state });
    check('Take A (room 0.62 … 0.36 s) is valid through the production analysis, with all six bands, and a six-band average that differs from its 1000 Hz value, from its 500–2000 Hz mean and from its 250 Hz–2 kHz mean; the room is judged in 250 Hz–2 kHz (DIN 18041 group A)',
      resA.valid && resA.bands.every(b => RA.eligible(b)) && Math.abs(avgA - r1k) > 0.005 && Math.abs(avgA - mid(resA)) > 0.003 && Math.abs(avgA - smA) > 0.003
        && D.policy(p).id === 'din-a' && json(D.policy(p).primary) === json(PRIM),
      `bands ${resA.bands.map(b => `${b.f}: ${b.rt60}`).join(', ')}; 1000 Hz ${r1k} s; average ${avgA.toFixed(4)} s; 500–2000 Hz ${mid(resA).toFixed(4)} s; 250 Hz–2 kHz ${smA.toFixed(4)} s; policy ${D.policy(p).label}`);

    /* ===== 8. the band tables keep every band ===== */
    status('Band tables…');
    {
      const before = json(resA);
      const tableIn = (html, rtCol) => {
        const d = document.createElement('div'); d.innerHTML = html;
        const t = [...d.querySelectorAll('table.tbl')].find(x => { const h = [...x.querySelectorAll('thead th')].map(th => th.textContent.trim()); return h[0] === 'Band' && h[rtCol] === 'RT60'; });
        return t ? [...t.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())) : [];
      };
      const want = resA.bands.map(b => [fmt.hz(b.f), b.rt60 != null ? fmt.s(b.rt60) : 'Not reliable']);
      const res = tableIn(W.get('results').view(ctx()).body, 3).map(r => [r[0], r[3]]);
      const proc = tableIn(W.get('processing').view(ctx()).body, 6).map(r => [r[0], r[6]]);
      check('8 Results: the band table still lists all six bands, each with its own RT60 (1000 Hz included), next to the average',
        json(res) === json(want), res.map(r => r.join(' ')).join(' · '));
      check('8 Processing: the "Band by band" table still lists all six bands with their own RT60', json(proc) === json(want), proc.map(r => r.join(' ')).join(' · '));
      check('8 Showing the average changes nothing in the stored result', json(p.processing.result) === before, 'unchanged');

      // The plain-language view: low sounds (125, 250 Hz), voices (500, 1000, 2000 Hz), high sounds (4000 Hz), each the
      // mean of its bands, summed here from the result's own values; the technical chart and table stay, folded away.
      const v = f => resA.bands.find(b => b.f === f).rt60, mean = fs => fs.reduce((s, f) => s + v(f), 0) / fs.length;
      const g = D.soundGroups(p), want3 = [mean([125, 250]), mean([500, 1000, 2000]), v(4000)];
      // Each group's status, worked out here from its bands' own limits (DIN 18041 group A): 250–2000 Hz the target
      // range; 125 Hz 0.75 × min to 1.4/1.2 × max; 4000 Hz 0.75 × min to max. Any band above → too echoey.
      const t0 = p.target, lim = f => (f === 125 ? [r2(t0.min * 0.75), r2(t0.max * 1.4 / 1.2)] : f === 4000 ? [r2(t0.min * 0.75), t0.max] : [t0.min, t0.max]);
      const stOf = f => A.classify(v(f), { min: lim(f)[0], max: lim(f)[1] }), gst = fs => { const x = fs.map(stOf); return x.includes('above') ? 'above' : x.includes('below') ? 'below' : 'within'; };
      const want3s = [gst([125, 250]), gst([500, 1000, 2000]), gst([4000])];
      check('8 Low sounds, voices and high sounds are the means of their own bands (125–250, 500–2000, 4000 Hz); each status follows its bands\' own limits (any band above its limit: too echoey), never the group mean alone',
        g && json(g.map(x => x.id)) === json(['low', 'voices', 'high']) && g.every((x, i) => close(x.value, want3[i], 1e-12) && !x.missing.length && x.status === want3s[i]),
        g ? g.map(x => `${x.label} ${x.value.toFixed(3)} s ${x.status} (worked out here: ${want3s[g.indexOf(x)]})`).join(' · ') : 'none');
      const rh = W.get('results').view(ctx()).body, rt = textOf(rh), rd = dom(rh);
      const techTable = [...rd.querySelectorAll('details.tech table.tbl thead')].some(h => /RT60/.test(h.textContent));
      check('8 Results shows the three in plain words ("How long sound rings", "Can you trust this measurement?"); the decay curve, the band chart and the table are still there, under "Show technical details"',
        /How long sound rings in this room/.test(rt) && /Low sounds/.test(rt) && /Voices/.test(rt) && /High sounds/.test(rt) && /Can you trust this measurement\?/.test(rt) && /Measured clearly/.test(rt)
          && techTable && !!rd.querySelector('details.tech [data-chart="decay"]') && !!rd.querySelector('details.tech [data-chart="bands"]') && !bad(rt),
        `technical table ${techTable}; decay chart ${!!rd.querySelector('details.tech [data-chart="decay"]')}`);
      const ah = W.get('assessment').view(ctx()).body, at = textOf(ah), ad = dom(ah);
      const fixRows = [...ad.querySelectorAll('.fix-row')];
      check('8 Assessment leads with the verdict and one sentence of advice, then "What to fix": one row per group with its value and status; the band chart and table are under "Show technical details"',
        /What to fix/.test(at) && fixRows.length === 3 && fixRows.every(r => /\d\.\d\ds(Tooechoey|Toodull|Justright)|Notmeasured/.test(r.textContent.replace(/\s+/g, '')))
          && !!ad.querySelector('.av-hero .av-verdict') && (ad.querySelector('.av-say') || {}).textContent.trim().length > 20 && !!ad.querySelector('details.tech [data-chart="bands"]') && !bad(at),
        (ad.querySelector('.av-say') || {}).textContent);
    }

    /* ===== 7. the same average everywhere ===== */
    status('Every screen…');
    const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    async function everywhere(label, res) {
      const pp = S.state.project, avg = D.averageRT60(pp), sm = D.summaryRT60(pp), pol = D.policy(pp), out = {};
      const v2 = avg.value.toFixed(2), vs = fmt.s(avg.value), s2 = sm.value.toFixed(2), ss = fmt.s(sm.value);
      const resultsHtml = W.get('results').view(ctx()).body, aText = textOf(W.get('assessment').view(ctx()).body);
      // The all-band average, 125–4000 Hz.
      out.resultsAll = (resultsHtml.match(/data-watch="avg-headline">([\d.]+)<small>/) || [])[1];
      out.resultsSummaryBox = (resultsHtml.match(/class="avg-v">([\d.]+)<small>/) || [])[1];
      out.processing = (W.get('processing').view(ctx()).body.match(/class="avg-v">([\d.]+)<small>/) || [])[1];
      out.assessmentAll = (aText.match(/Average, all bands([\d.]+)s/) || [])[1];
      // The average over the judged bands, 250 Hz–2 kHz: the figure beside the verdict.
      out.resultsHero = (resultsHtml.match(/data-watch="summary-headline">([\d.]+)<small>/) || [])[1];
      out.measure = (W.get('measure').view(ctx()).body.match(new RegExp(`class="stat-v">([\\d.]+)<small>s</small></span><span class="muted">${reEsc(pol.label)}`)) || [])[1];
      out.assessmentSummary = (aText.match(new RegExp(`Average, ${reEsc(pol.short)}(?:Measured)?([\\d.]+)s`)) || [])[1];
      S.state.current = 'results'; AM.app.render();
      const fv = document.querySelector('#app [data-watch="fact-measured"] .fact-v');
      out.topBar = fv ? fv.textContent.trim() : null;
      out.home = pairs(ui.projectCard(D.summary(pp)), '.pc-stat', '.pc-k', '.pc-v')['Measured'] || null;
      out.history = (textOf(ui.historyList([D.summary(pp)], pp.id)).match(/RT60 ([\d.]+ s) speech range/) || [])[1];
      out.explain = (AM.services.explain.forStage('results', pp).paragraphs.join(' ').match(/the room takes ([\d.]+ s) on average/) || [])[1];
      const M = AM.report.model(pp);
      const allShown = [out.resultsAll, out.resultsSummaryBox, out.processing, out.assessmentAll].every(x => x === v2);
      const smShown = [out.resultsHero, out.measure, out.assessmentSummary].every(x => x === s2) && [out.topBar, out.home, out.history, out.explain].every(x => x === ss);
      check(`7 ${label}: the all-band average ${vs} on Results (beside the headline and under the band table), Processing and Assessment; the average over ${pol.short}, ${ss}, as the Results headline, on the Measure step, Assessment, the top bar, Home, Measurement History and in the explanation`,
        allShown && smShown, Object.entries(out).map(([k, x]) => `${k} ${x}`).join(' · '));
      const exact = [RA.of(res).value, D.averageRT60(pp).value, M.measurement.average.value, D.summary(pp).average, D.assessment(pp).average.value];
      const exactS = [RA.ofBands(res, PRIM).value, D.summaryRT60(pp).value, M.measurement.summary.value, D.summary(pp).summary, D.assessment(pp).rt];
      check(`7 ${label}: before rounding, the service, AM.derive, the report model, the project summary and the assessment hold exactly the same two values, from the same measurement, as summed here`,
        exact.every(x => x === exact[0]) && close(exact[0], manual(res)) && exactS.every(x => x === exactS[0]) && close(exactS[0], smOf(res)) && M.measurement.average.recordingId === D.averageRT60(pp).recordingId && D.room(pp).positions[0].recordingId === res.recordingId,
        `${exact.join(' / ')} (summed here: ${manual(res)}) · ${exactS.join(' / ')} (summed here: ${smOf(res)})`);
      let pdf = null, err = '';
      try { pdf = await AM.report.build(pp); } catch (e) { err = e.message; }
      const raw = pdf && pdf.bytes ? Array.from(pdf.bytes, c => String.fromCharCode(c)).join('') : '';
      const txt = [...raw.matchAll(/<([0-9A-F]+)> Tj/g)].map(m => m[1].replace(/../g, h => String.fromCharCode(parseInt(h, 16)))).join(' ').replace(/\x96/g, '–').replace(/\s+/g, ' ');
      const said = AM.report.summary(M).join(' ');
      check(`7 ${label}: the PDF shows the same values: the key figure "MEASURED RT60 · ${pol.short}" ${ss}, the row "Average RT60, all bands" ${vs} (125–4000 Hz), every band value, the verdict box, and the summary with the average over ${pol.short}`,
        raw.length > 1000 && txt.includes(`MEASURED RT60 · ${pol.short}`) && txt.includes(ss) && txt.includes('Average RT60, all bands') && txt.includes(`${vs} (125`)
          && res.bands.filter(b => b.rt60 != null).every(b => txt.includes(fmt.s(b.rt60))) && txt.includes('VERDICT · BAND BY BAND')
          && said.includes(`The average over ${pol.short} is ${ss}`) && !bad(txt) && ![...(pdf.doc.unsupported || [])].length,
        pdf ? `${pdf.bytes.length} bytes, ${pdf.doc.pages.length} page(s); unsupported characters: ${[...(pdf.doc.unsupported || [])].join(' ') || 'none'}` : err);
      // The report form's record (Supabase row): the all-band average, and the 1000 Hz value under its own name.
      const rec = AM.reportGate.projectSummary(pp);
      check(`7 ${label}: the report form's record holds the all-band average (measuredRt60Avg ${Number(avg.value.toFixed(2))}) and the 1000 Hz value as measuredRt60 (${Number(res.headline.rt60.toFixed(2))})`,
        rec.measuredRt60Avg === Number(avg.value.toFixed(2)) && rec.measuredRt60 === Number(res.headline.rt60.toFixed(2)),
        `measuredRt60Avg ${rec.measuredRt60Avg}; measuredRt60 ${rec.measuredRt60}`);
      return out;
    }
    await everywhere('Take A', resA);
    {
      // Final Result and the one-page report need a project that is finished without treatment: a target the average meets.
      p.target = Object.assign({ source: 'custom', basis: 'Test' }, meets);
      S.emit();
      const fin = pairs(W.get('final').view(ctx()).body, '.kv-r', 'dt', 'dd');
      const vs = fmt.s(smA);
      check('7 Final Result (no treatment needed: every judged band meets the target): the project record shows the average over 250 Hz–2 kHz and, separately, the reference band\'s value at 1000 Hz',
        D.assessment(p).status === 'within' && fin['Average RT60'] === `${vs}250 Hz–2 kHz, compared with the target` && (fin['RT60 at 1000 Hz'] || '').startsWith(`${fmt.s(r1k)} · ${resA.headline.method}`),
        `Average RT60: ${fin['Average RT60']} · RT60 at 1000 Hz: ${fin['RT60 at 1000 Hz']}`);
      // Final Result promises a one-page report when no treatment is needed: with up to three short notes it stays on one page.
      const M0 = AM.report.model(p), note = { kind: 'warn', text: `125 Hz not reliable: ${NR}` };
      const pages = [0, 1, 2, 3].map(n => AM.report.make(Object.assign({}, M0, { measurement: Object.assign({}, M0.measurement, { notes: Array(n).fill(note) }) }), null).pages.length);
      check('7 The report with no treatment stays on one page, as Final Result says, with 0 to 3 notes', M0.none && pages.every(n => n === 1), `pages with 0, 1, 2, 3 notes: ${pages.join(', ')}`);
      p.target = Object.assign({ source: 'custom', basis: 'Test' }, tgt);
      S.emit();
    }

    /* ===== 9. the verdict, the treatment amount and the prediction ===== */
    status('Assessment and prediction…');
    const CAT = AM.services.catalog, P = AM.services.prediction;
    const product = CAT.getProducts().find(q => q.size.options.some(o => o.areaM2 > 0) && CAT.getAcousticConfigurations(q.id).some(c => !CAT.getOctaveAbsorption(c.id, B).missing.length));
    const cfg = CAT.getAcousticConfigurations(product.id).find(c => !CAT.getOctaveAbsorption(c.id, B).missing.length);
    const sizeIndex = product.size.options.findIndex(o => o.areaM2 > 0);
    {
      const a = D.assessment(p);
      const above = PRIM.filter(f => A.classify(bv(resA, f), p.target) === 'above');
      check('9 The verdict is decided band by band: the average over 250 Hz–2 kHz is inside the range, but a judged band (worked out here) is above it, so the room does not meet the target ("masked"); the 1000 Hz value alone would pass too',
        a.available && a.rt === smA && a.summaryStatus === 'within' && a.status === 'above' && a.verdict.masked && above.length > 0 && json(a.verdict.above.map(r => r.f)) === json(above)
          && A.classify(r1k, p.target) === 'within' && a.ref.f === 1000 && a.ref.rt === r1k && /Does not meet the target/.test(a.explanation.headline) && /every judged band has to be/.test(a.explanation.lines.join(' ')),
        `average ${a.rt.toFixed(4)} s → ${a.summaryStatus}; above its range: ${a.verdict.above.map(r => `${r.f} Hz ${r.rt}`).join(', ')} → verdict ${a.status}; 1000 Hz ${r1k} s alone ${A.classify(r1k, p.target)}`);
      // Changed 2026-10-19: DIN 18041 judges 125 Hz and 4 kHz too, against their own limits (0.65–1.45 × and 0.65–1.2 × T_soll,
      // BNB 3.1.4), applied to the target range's edges: 125 Hz min × 0.65/0.8 to max × 1.45/1.2; 4 kHz min × 0.65/0.8 to max.
      check('9 The assessment\'s band table compares each band\'s own RT60, with its own limits and role (250–2000 Hz the target range; 125 Hz and 4 kHz the standard\'s own limits, also judged)',
        json(a.bands.map(b => b.rt)) === json(resA.bands.map(b => b.rt60)) && json(a.bands.map(b => b.role)) === json(['edge', 'primary', 'primary', 'primary', 'primary', 'edge'])
          && a.bands.filter(b => b.role === 'primary').every(b => b.min === p.target.min && b.max === p.target.max) && a.bands.find(b => b.f === 125).max === r2(p.target.max * 1.45 / 1.2)
          && a.bands.find(b => b.f === 125).min === r2(p.target.min * 0.65 / 0.8) && a.bands.find(b => b.f === 4000).max === r2(p.target.max),
        a.bands.map(b => `${b.f}: ${b.rt} ${b.role} ${b.min}–${b.max} ${b.status}`).join(', '));
      check('9 Treatment is needed when the verdict is "above", and the absorption needed is worked out from the 250 Hz–2 kHz average: 0.161 V ÷ target − 0.161 V ÷ average',
        D.treatmentRequired(p) === true && close(D.absorptionGap(p), Math.max(0, A.absorptionFromRT(V, tgt.preferred) - A.absorptionFromRT(V, smA)), 1e-9),
        `required ${D.treatmentRequired(p)}; needed ${D.absorptionGap(p).toFixed(3)} m²`);
      const ah = textOf(W.get('assessment').view(ctx()).body);
      check('9 Assessment shows the verdict apart from the average: "Does not meet the target" with the bands above, the average with its own status, and how the verdict is decided (DIN 18041, every band 125 Hz–4 kHz)',
        /VerdictDoes not meet the target/.test(ah) && /Result against the target/.test(ah) && /Too much echo at/.test(ah) && /DIN 18041:2016, use types A1–A4/.test(ah) && /average alone does not pass the room/.test(ah) && !bad(ah),
        ah.slice(ah.indexOf('Result against the target'), ah.indexOf('Result against the target') + 220));

      S.set('treatment', { items: [{ id: 't1', productId: product.id, configurationId: cfg.id, size: String(sizeIndex), quantity: 6, placement: 'Walls' }], active: 't1' });
      const pred = D.prediction(p);
      const predMean = pred ? PRIM.reduce((x, f) => x + pred.bands.find(b => b.f === f).predicted, 0) / PRIM.length : null;
      check('9 The prediction starts from each band\'s measured RT60 (never the average): every band\'s "measured" is that band\'s value; at 1000 Hz A₀ = 0.161 V ÷ the 1000 Hz RT60',
        pred && json(pred.bands.map(b => b.measured)) === json(resA.bands.map(b => b.rt60)) && pred.headline.f === 1000 && pred.headline.measured === r1k && close(pred.headline.existingA, A.absorptionFromRT(V, r1k), 1e-9),
        pred ? `measured ${pred.bands.map(b => b.measured).join(', ')}; A₀ at 1000 Hz ${pred.headline.existingA.toFixed(3)} m²` : 'no prediction');
      check('9 The predicted value is the average of the four judged predicted bands (summed here), next to the measured 250 Hz–2 kHz average; the predicted verdict judges each band by the same rule',
        pred && pred.measured === smA && close(pred.predicted, predMean, 1e-12) && pred.predicted !== pred.headline.predicted && pred.average.n === 4
          && pred.verdict && pred.verdict.status === (pred.verdictRows.filter(r => r.role === 'primary').some(r => r.status === 'above') ? 'above' : pred.verdictRows.filter(r => r.role === 'primary').some(r => r.status === 'below') ? 'below' : 'within'),
        pred ? `predicted average ${pred.predicted.toFixed(4)} s (summed here ${predMean.toFixed(4)}); verdict ${pred.verdict && pred.verdict.status}; at 1000 Hz ${pred.headline.predicted.toFixed(4)} s` : 'no prediction');

      // The amount for the target: the area at which the predicted 250 Hz–2 kHz average reaches the preferred target.
      // Checked with the model itself: at that area the predicted average is the target; 0.01 m² less leaves it above.
      const tf = D.treatmentForTarget(p), item = D.treatmentSelection(p), cov = D.coveredBy(p, item) ? D.coveredBy(p, item).alpha : null;
      const avgWith = area => RA.ofPrediction(P.predict({ V, S: A.geometry(p.room).total, bands: resA.bands, treatment: { items: [{ areaM2: area, alpha: item.alpha, coveredAlpha: cov }] }, referenceBand: 1000 }).bands, PRIM).value;
      const atRef = P.areaFor({ V, bands: resA.bands, alpha: item.alpha, referenceBand: 1000, targetRT: p.target.preferred, addedA: 0, coveredAlpha: cov });
      check('9 The amount of treatment for the target brings the predicted 250 Hz–2 kHz average to the target (the same model and bands as the prediction), not the 1000 Hz value',
        tf && tf.areaM2 > 0.5 && close(avgWith(tf.areaM2), p.target.preferred, 1e-3) && avgWith(Math.max(0, tf.areaM2 - 0.01)) > p.target.preferred && atRef < tf.areaM2,
        tf ? `${tf.areaM2.toFixed(3)} m² → predicted average ${avgWith(tf.areaM2).toFixed(4)} s (target ${p.target.preferred.toFixed(4)} s); at 1000 Hz alone ${atRef.toFixed(3)} m²` : 'none');
      // The plan's figures on Treatment, Predicted Result and the top bar are the same predicted average.
      S.state.current = 'prediction'; AM.app.render();
      const tb = document.querySelector('#app [data-watch="fact-predicted"] .fact-v'), predHtml = W.get('prediction').view(ctx()).body, treatHtml = W.get('treatment').view(ctx()).body;
      const shownPred = (predHtml.match(/data-watch="pred-headline"[\s\S]*?class="stat-v[^"]*">([\d.]+)/) || [])[1];
      const planPred = (treatHtml.match(/data-watch="plan-pred">([\d.]+ s)</) || [])[1];
      check('9 Predicted Result, the treatment plan and the top bar show the same predicted average',
        pred && shownPred === pred.predicted.toFixed(2) && planPred === fmt.s(pred.predicted) && tb && tb.textContent.trim() === fmt.s(pred.predicted) && !bad(textOf(predHtml)) && !bad(textOf(treatHtml)),
        `Predicted Result ${shownPred}; plan ${planPred}; top bar ${tb && tb.textContent.trim()}; expected ${pred && pred.predicted.toFixed(4)}`);
      const rec = AM.reportGate.projectSummary(p), allPred = RA.ofPrediction(pred.bands, B).value;
      check('9 The report form\'s record: predictedRt60Avg is the predicted average over the bands of the all-band average (as the column has always held), predictedRt60 the 1000 Hz prediction',
        pred && rec.predictedRt60Avg === Number(allPred.toFixed(2)) && rec.predictedRt60 === Number(pred.headline.predicted.toFixed(2)),
        `predictedRt60Avg ${rec.predictedRt60Avg} (all bands, worked out here ${allPred.toFixed(4)}); predictedRt60 ${rec.predictedRt60}`);
      let pdf = null, err = '';
      try { pdf = await AM.report.build(p); } catch (e) { err = e.message; }
      const raw = pdf ? Array.from(pdf.bytes, c => String.fromCharCode(c)).join('') : '';
      const txt = [...raw.matchAll(/<([0-9A-F]+)> Tj/g)].map(m => m[1].replace(/../g, h => String.fromCharCode(parseInt(h, 16)))).join(' ').replace(/\x96/g, '–').replace(/\s+/g, ' ');
      check('9 The PDF with a treatment plan shows the predicted average in its key figure and section, the predicted verdict, and stays at two pages',
        pdf && pred && txt.includes(`PREDICTED RT60 · MODEL ESTIMATE`) && txt.includes(fmt.s(pred.predicted)) && txt.includes(`predicted ${fmt.s(pred.predicted)}`) && txt.includes('Predicted verdict') && pdf.doc.pages.length === 2 && !bad(txt),
        pdf ? `${pdf.doc.pages.length} page(s)` : err);
      S.set('treatment', { items: [], active: null });
    }

    /* ===== 11. a changed band changes the averages and what depends on them ===== */
    status('A changed band…');
    {
      // 125 Hz + 0.24 s: the all-band average + 0.24 ÷ 6 = + 0.04 s and the record follow; 125 Hz is not a judged band, so
      // the 250 Hz–2 kHz average, the verdict and the absorption needed stay; 1000 Hz unchanged.
      const changed = copy(resA);
      changed.bands.find(b => b.f === 125).rt60 += 0.24;
      p.processing.result = changed;
      S.emit();
      let a = D.assessment(p);
      const want = avgA + 0.24 / 6;
      check('11 125 Hz + 0.24 s: the all-band average moves by + 0.24 ÷ 6 = + 0.04 s, and the summary and the report form follow it; the 250 Hz–2 kHz average, the absorption needed and the 1000 Hz value do not change (125 Hz is not judged)',
        close(D.averageRT60(p).value, want, 1e-12) && close(D.summary(p).average, want, 1e-12) && AM.reportGate.projectSummary(p).measuredRt60Avg === Number(want.toFixed(2))
          && a.rt === smA && close(D.absorptionGap(p), Math.max(0, A.absorptionFromRT(V, tgt.preferred) - A.absorptionFromRT(V, smA)), 1e-9) && a.ref.rt === r1k,
        `${avgA.toFixed(4)} → ${D.averageRT60(p).value.toFixed(4)} s (expected ${want.toFixed(4)}); 250 Hz–2 kHz ${a.rt.toFixed(4)} s`);
      // 500 Hz + 0.12 s: both averages move (+ 0.12 ÷ 4 = + 0.03 s and + 0.12 ÷ 6 = + 0.02 s), and the assessment and the
      // absorption needed follow the judged one.
      const changed2 = copy(resA);
      changed2.bands.find(b => b.f === 500).rt60 += 0.12;
      p.processing.result = changed2;
      S.emit();
      a = D.assessment(p);
      const wantS = smA + 0.12 / 4;
      check('11 500 Hz + 0.12 s: the 250 Hz–2 kHz average moves by + 0.03 s and the all-band average by + 0.02 s; the assessment and the absorption needed follow the judged average',
        close(a.rt, wantS, 1e-12) && close(D.averageRT60(p).value, avgA + 0.02, 1e-12) && close(D.absorptionGap(p), Math.max(0, A.absorptionFromRT(V, tgt.preferred) - A.absorptionFromRT(V, wantS)), 1e-9),
        `${smA.toFixed(4)} → ${a.rt.toFixed(4)} s (expected ${wantS.toFixed(4)})`);
      p.processing.result = resA;
      S.emit();
    }

    /* ===== 12a. one band left out: the averages of the others drive everything ===== */
    status('A band left out…');
    {
      // 125 Hz without a value: the take stays valid (1000 Hz decides that); the all-band average is of the other five
      // bands, summed here; the 250 Hz–2 kHz average, the prediction and the amount are unchanged. 125 Hz is a judged band
      // (DIN 18041 sets its limits), so the verdict says it could not be confirmed there.
      const gap = copy(resA);
      Object.assign(gap.bands.find(b => b.f === 125), { rt60: null, t30: null, t20: null, path: null, quality: 'Insufficient', reason: NR });
      p.processing.result = gap;
      S.set('treatment', { items: [{ id: 't1', productId: product.id, configurationId: cfg.id, size: String(sizeIndex), quantity: 6, placement: 'Walls' }], active: 't1' });
      const five = [250, 500, 1000, 2000, 4000], avg5 = five.reduce((s2, f) => s2 + gap.bands.find(b => b.f === f).rt60, 0) / 5;
      const a = D.assessment(p), avg = D.averageRT60(p);
      check('12 125 Hz without a value: the take is still valid, the all-band average is that of the other five bands (summed here), 125 Hz named as left out; the 250 Hz–2 kHz average and the verdict are unchanged, and the verdict names 125 Hz as not measured',
        D.measured(p) && avg.available && avg.partial && close(avg.value, avg5, 1e-12) && json(avg.missing.map(x => x.f)) === json([125]) && a.available && a.rt === smA && !a.verdict.complete && json(a.verdict.missing) === json([125]) && a.status === 'above',
        `${avg.value && avg.value.toFixed(4)} s over ${RA.describe(avg)}; 250 Hz–2 kHz ${a.rt && a.rt.toFixed(4)} s, verdict ${a.status}`);
      const gg = D.soundGroups(p), low = gg && gg.find(x => x.id === 'low'), rtx = textOf(W.get('results').view(ctx()).body);
      check('12 The plain view says it simply: low sounds from 250 Hz alone with "Lowest sounds not measured", and "The lowest sounds could not be measured" with what to do',
        low && close(low.value, resA.bands.find(b => b.f === 250).rt60, 1e-12) && json(low.missing) === json([125]) && /Lowest sounds not measured/.test(rtx) && /The lowest sounds could not be measured/.test(rtx) && /measure again/.test(rtx),
        low ? `low ${low.value} s, missing ${low.missing.join(', ')}` : 'none');
      const pred = D.prediction(p), predHand = pred ? PRIM.reduce((s2, f) => s2 + pred.bands.find(b => b.f === f).predicted, 0) / 4 : null;
      const tf = D.treatmentForTarget(p), item = D.treatmentSelection(p), cov = D.coveredBy(p, item) ? D.coveredBy(p, item).alpha : null;
      const avgWith = area => RA.ofPrediction(AM.services.prediction.predict({ V, S: A.geometry(p.room).total, bands: gap.bands, treatment: { items: [{ areaM2: area, alpha: item.alpha, coveredAlpha: cov }] }, referenceBand: 1000 }).bands, PRIM).value;
      check('12 The prediction and the treatment amount use the judged bands: the predicted average is the mean of the four predicted bands 250 Hz–2 kHz, and the amount brings that average to the target',
        pred && pred.average.n === 4 && close(pred.predicted, predHand, 1e-12) && pred.measured === a.rt && tf && close(avgWith(tf.areaM2), p.target.preferred, 1e-3),
        pred ? `predicted ${pred.predicted.toFixed(4)} s (by hand ${predHand.toFixed(4)}); amount ${tf && tf.areaM2.toFixed(2)} m²` : 'no prediction');
      const rh = W.get('results').view(ctx()).body, ah = W.get('assessment').view(ctx()).body;
      check('12 Results shows both values: the 250 Hz–2 kHz average ("all 4 bands") as the headline and the all-band average of the five bands beside it ("5 of 6 bands · 125 Hz not measured"); Assessment the same two',
        (rh.match(/data-watch="summary-headline">([\d.]+)<small>/) || [])[1] === smA.toFixed(2) && (rh.match(/data-watch="avg-headline">([\d.]+)<small>/) || [])[1] === avg5.toFixed(2) && /5 of 6 bands · 125 Hz not measured/.test(textOf(rh))
          && textOf(ah).includes(`Average, all bands${avg5.toFixed(2)}s`) && textOf(ah).includes(`Average, 250 Hz–2 kHzMeasured${smA.toFixed(2)}s`) && !bad(textOf(rh)) && !bad(textOf(ah)),
        `hero ${(rh.match(/data-watch="summary-headline">([\d.]+)<small>/) || [])[1]} / ${(rh.match(/data-watch="avg-headline">([\d.]+)<small>/) || [])[1]}`);
      const rec = AM.reportGate.projectSummary(p);
      check('12 The report form records the all-band average of the five bands, the 1000 Hz value under its own name', rec.measuredRt60Avg === Number(avg5.toFixed(2)) && rec.measuredRt60 === Number(r1k.toFixed(2)),
        `measuredRt60Avg ${rec.measuredRt60Avg}`);

      // 250 Hz without a value: a JUDGED band missing. The verdict is incomplete: it never says the room meets the target
      // without saying where it could not be measured; the average is of the other three judged bands.
      const gap250 = copy(resA);
      Object.assign(gap250.bands.find(b => b.f === 250), { rt60: null, t30: null, t20: null, path: null, quality: 'Insufficient', reason: NR });
      p.processing.result = gap250;
      p.target = Object.assign({ source: 'custom', basis: 'Test' }, meets);
      S.set('treatment', { items: [], active: null });
      const a2 = D.assessment(p), three = [500, 1000, 2000].reduce((s2, f) => s2 + bv(gap250, f), 0) / 3, at2 = textOf(W.get('assessment').view(ctx()).body);
      check('12 250 Hz (judged) without a value: the verdict is "Meets the target where measured", incomplete, naming 250 Hz; the average is that of the other three judged bands (summed here)',
        a2.available && close(a2.rt, three, 1e-12) && a2.status === 'within' && !a2.verdict.complete && json(a2.verdict.missing) === json([250]) && a2.explanation.headline === 'Meets the target where measured'
          && /250 Hz could not be measured/.test(a2.explanation.lines.join(' ')) && /where measured/.test(at2) && !bad(at2),
        `${a2.rt && a2.rt.toFixed(4)} s; ${a2.explanation.headline}: ${a2.explanation.lines.join(' ')}`);
      p.target = Object.assign({ source: 'custom', basis: 'Test' }, tgt);
      p.processing.result = resA;
      S.emit();
    }

    /* ===== 12b. too few bands: nothing room-wide, no 1000 Hz in its place ===== */
    status('Too few bands…');
    {
      // Only 1000 Hz with a value: the take stays valid (1000 Hz decides that), but 1 of the 4 judged bands and 1 of 6 bands
      // are fewer than the half an average needs.
      const few = copy(resA);
      few.bands.filter(b => b.f !== 1000).forEach(b => Object.assign(b, { rt60: null, t30: null, t20: null, path: null, quality: 'Insufficient', reason: NR }));
      p.processing.result = few;
      S.set('treatment', { items: [{ id: 't1', productId: product.id, configurationId: cfg.id, size: String(sizeIndex), quantity: 6, placement: 'Walls' }], active: 't1' });
      const a = D.assessment(p), avg = D.averageRT60(p);
      check('12 Only one of the six bands with a value: the take is still valid but there is no average and no 250 Hz–2 kHz average, and the reasons say too few bands were measured',
        D.measured(p) && !avg.available && avg.value === null && /at least 3 of the 6 bands/.test(avg.reason) && !D.summaryRT60(p).available && /at least 2 of the 4 bands/.test(D.summaryRT60(p).reason), `${avg.reason} | ${D.summaryRT60(p).reason}`);
      check('12 No assessment status, no absorption needed, no prediction and no treatment amount; treatment is not called unnecessary; nothing takes the 1000 Hz value instead',
        a && !a.available && a.rt === null && a.status === null && a.diff === null && D.absorptionGap(p) === null && D.prediction(p) === null && D.treatmentForTarget(p) === null
          && D.treatmentRequired(p) === true && D.noTreatment(p) === false && D.summary(p).status === null && D.summary(p).average === null && a.ref.rt === r1k,
        `assessment ${a && a.status}; gap ${D.absorptionGap(p)}; prediction ${D.prediction(p)}; amount ${D.treatmentForTarget(p)}`);
      const gates = ['assessment', 'treatment', 'prediction'].map(id => [id, W.get(id).canContinue(p)]);
      check('12 Assessment, Treatment and Predicted Result do not continue, and say why (only 1 of the 4 judged bands)', gates.every(([, g]) => !g.ok && /only 1 of 4 of its bands/.test(g.reason)), gates.map(([id, g]) => `${id}: ${g.reason}`).join(' | '));
      const views = ['results', 'assessment', 'treatment', 'prediction', 'final', 'measure', 'processing'].map(id => [id, textOf(W.get(id).view(ctx()).body)]);
      S.state.current = 'assessment'; AM.app.render();
      const top = ['measured', 'predicted'].map(k => (document.querySelector(`#app [data-watch="fact-${k}"] .fact-v`) || {}).textContent);
      check('12 No screen shows NaN, Infinity or undefined; the top bar shows "—" for the measured and predicted averages; Assessment says the room cannot be assessed',
        views.every(([, t]) => !bad(t)) && top.every(t => t === '—') && /cannot be assessed/.test(views.find(v => v[0] === 'assessment')[1]),
        `${views.filter(([, t]) => bad(t)).map(([id]) => id).join(', ') || 'none bad'}; top bar ${top.join(' / ')}`);
      const M = AM.report.model(p), said = AM.report.summary(M).join(' '), rec = AM.reportGate.projectSummary(p);
      let pdf = null, err = '';
      try { pdf = await AM.report.build(p); } catch (e) { err = e.message; }
      const raw = pdf ? Array.from(pdf.bytes, c => String.fromCharCode(c)).join('') : '';
      const txt = [...raw.matchAll(/<([0-9A-F]+)> Tj/g)].map(m => m[1].replace(/../g, h => String.fromCharCode(parseInt(h, 16)))).join(' ').replace(/\x96/g, '–').replace(/\s+/g, ' ');
      check('12 The PDF and the report form: no average and no assessment (said plainly), no predicted value, the 1000 Hz value kept under its own name; no NaN or Infinity',
        pdf && /There is no average RT60/.test(said) && !said.includes(`${fmt.s(r1k)}, above`) && txt.includes('Not available') && !bad(txt)
          && rec.measuredRt60Avg === null && rec.predictedRt60Avg === null && rec.predictedRt60 === null && rec.measuredRt60 === Number(r1k.toFixed(2)),
        `${said.slice(0, 160)} · record avg ${rec.measuredRt60Avg}, 1000 Hz ${rec.measuredRt60}${err ? ` · ${err}` : ''}`);
      S.set('treatment', { items: [], active: null });
      p.processing.result = resA;
      S.emit();
    }

    /* ===== 10. a new measurement replaces the summary ===== */
    status('A new measurement (Processing, about 3 s)…');
    const takeB = take('avg-take-b', '2026-10-13T10:00:00.000Z', roomB, 22);
    {
      p.measurement.recording = copy(takeB);
      S.emit();
      S.go('processing');
      await until(() => p.processing.result && p.processing.result.recordingId === takeB.id, 'take B to become current');
      await sleep(150);
      const resB = p.processing.result, avgB = D.averageRT60(p), hist = p.processing.history || [];
      const mixed = (manual(resA) + manual(resB)) / 2; // what averaging over both takes would give
      check('10 Take B (a more reverberant room) processed by the Processing step becomes current; take A is kept as superseded, with the bands its average was taken over',
        resB.valid && hist.length === 1 && hist[0].recordingId === takeA.id && hist[0].status === 'superseded' && hist[0].averageBands === RA.SHORT && close(hist[0].average, avgA),
        `current ${resB.recordingId}; superseded ${hist.map(h => `${h.recordingId} (${h.average} over ${h.averageBands})`).join(', ')}`);
      check('10 The average is take B\'s alone: from take B\'s bands, longer than take A\'s, and not a mix of both takes',
        avgB.recordingId === takeB.id && close(avgB.value, manual(resB)) && avgB.value > avgA + 0.2 && Math.abs(avgB.value - mixed) > 0.05,
        `A ${avgA.toFixed(3)} s → B ${avgB.value.toFixed(3)} s; both takes together would give ${mixed.toFixed(3)} s`);
      const out = await everywhere('After take B', resB);
      check('10 Every screen moved to take B\'s average (none still shows take A\'s)', Object.values(out).every(x => x !== avgA.toFixed(2) && x !== fmt.s(avgA)), Object.values(out).join(' · '));

      /* ===== 5. superseded measurements and invalid takes are not mixed in ===== */
      status('An invalid later take…');
      // Take C: the browser kept noise suppression on, so the processing gives no band a value (the take is not valid).
      const takeC = take('avg-take-c', '2026-10-13T11:00:00.000Z', roomA, 23, { settings: { noiseSuppression: true } });
      p.measurement.recording = copy(takeC);
      S.emit();
      S.go('processing');
      await until(() => p.processing.attempt && p.processing.attempt.recordingId === takeC.id, 'take C to be processed');
      await sleep(150);
      const after = D.averageRT60(p);
      check('5 A later take that is not valid does not change the average: take B stays current and its average stands; take C is only the latest attempt',
        p.processing.result.recordingId === takeB.id && after.recordingId === takeB.id && after.value === avgB.value && p.processing.attempt.result.valid === false, `still ${after.value.toFixed(3)} s from ${after.recordingId}`);
      const procAvg = (W.get('processing').view(ctx()).body.match(/class="avg-v[^"]*">([^<]+)</) || [])[1];
      check('5 The Processing step shows take C with no average ("Unavailable"), not take B\'s', procAvg === 'Unavailable', `Processing shows: ${procAvg}`);
      check('5 Superseded measurements keep only their own summary (no bands), so they cannot enter the average; the average equals the current measurement\'s own',
        (p.processing.history || []).every(h => !h.bands) && D.averageRT60(p).value === RA.of(p.processing.result).value && D.summary(p).average === avgB.value,
        `history: ${(p.processing.history || []).map(h => `${h.recordingId} ${h.status} ${h.rt60} s at 1000 Hz`).join(', ')}`);
      // A take stored before the six-band average (no averageBands) is not shown as one in the takes table.
      p.processing.history = p.processing.history.concat([{ status: 'superseded', recordingId: 'old-take', takenAt: '2026-10-12T09:00:00.000Z', levelDb: 0, rt60: 0.5, method: 'T30', average: 0.123 }]);
      const takes = textOf(W.get('results').view(ctx()).body);
      check('5 A take stored with the earlier 500–2000 Hz average is not shown as a six-band average in the takes table ("—")', !takes.includes('0.12 s') && takes.includes('Average 125–4000 Hz'), takes.slice(takes.indexOf('Takes in this project'), takes.indexOf('Takes in this project') + 160));
    }

    status('Done');
    document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
    return results;
  }

  window.RT60_AVERAGE_DONE = run().catch(e => { check('The test ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Error'); document.title = 'error'; return results; });
})();
