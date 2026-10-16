/* RT60 responsiveness audit (tests/rt60-responsiveness.html). Development only.

   Question: when repeated takes give almost the same RT60, is that the room (a sweep measurement is very repeatable),
   or does something in the measurement path stop the value from following the room (a hardcoded or cached value, a
   stale take, an artificial limit)? Every check below runs the PRODUCTION code: AM.analysis.analyseTake (sweep →
   impulse response → bands → decay → fits) and AM.services.processing.evaluate (T30/T20 decision, validity, headline),
   and in part B the whole application with a virtual device.

   Ground truth: synthetic rooms of known reverberation (tests/fixtures.js). The reference for a band is the room's OWN
   decay over the same ISO range, read from its noise-free impulse response (as tests/validation.html does), so a
   band that mixes several reverberation times is compared with what it really decays at. These are simulations: they
   show what the code does with known inputs, not how accurate a real device is in a real room.

   Tolerances: ±5 % against the room's own decay for a single value (the validation report finds the one-device
   analysis within about ±3 %); repeatability (independent background noise, same room) within 0.02 s, the
   display's resolution being 0.01 s; sweep level changes within 2 %. */
(function () {
  'use strict';
  const results = window.RESP_TEST = [];
  const tables = window.RESP_TABLES = {};
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); show(); };
  const status = t => { const el = document.getElementById('rs-status'); if (el) el.textContent = t; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function show() {
    const el = document.getElementById('rs-out');
    if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${esc(t.name)}<br><small>${esc(t.detail)}</small></li>`).join('');
    document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, what, ms = 40000) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(150); }
    throw new Error(`Timed out waiting for ${what}`);
  }
  const json = o => JSON.stringify(o);
  const pct = (a, b) => (a == null || b == null ? null : 100 * (a / b - 1));
  const f3 = x => (x == null ? '—' : x.toFixed(3));
  const DESK = [[0.0006, -3, 1], [0.0011, -7, -1], [0.0016, -10, 1], [0.0065, -31, 1], [0.0098, -35, -1], [0.0135, -37, 1], [0.019, -40, -1], [0.026, -43, 1]];

  /* ================================= Part A: production analysis on known rooms ================================= */
  async function partA() {
    await window.HARNESS_READY;
    await until(() => window.AM && AM.analysis && AM.services && AM.services.processing && window.FIX, 'the app');
    const AN = AM.analysis, PROC = AM.services.processing, DSP = AM.dsp, FIX = window.FIX, B = AM.demo.BANDS, D = AN.CRITERIA.decay;
    const fs = 48000, plan = AN.sweepPlan(fs), sweep = AN.makeSweep(plan);
    let k = 0;
    const tick = () => sleep(0);
    // One take through the production path: analyseTake, then the processing step's evaluation.
    function evalRec(rec, opt = {}) {
      const p = Object.assign({}, plan, { levelDb: opt.levelDb || 0 });
      const an = AN.analyseTake(rec, p, opt.sweep || sweep);
      const take = { id: `audit-${++k}`, takenAt: new Date(Date.UTC(2026, 9, 12, 12, 0, k)).toISOString(), status: an.status, reason: an.reason, levels: an.levels, plan: p, sampleRate: fs, analysis: an, warnings: [], settings: {} };
      return { an, take, res: PROC.evaluate(take, {}) };
    }
    const head = r => (r.valid ? r.headline.rt60 : null);
    const band = (r, f) => r.bands.find(b => b.f === f);
    const roomIR = (rt, seed, extra) => FIX.roomIR(Object.assign({ fs, seconds: Math.max(...[].concat(rt)) * 3 + 0.5, rt, seed }, extra || {}));
    const oneDevice = (rt, seed, extra) => ({ room: roomIR(rt, seed, extra), ir: roomIR(rt, seed, Object.assign({ directDb: 28, reflections: DESK }, extra || {})) });
    const record = (ir, o) => FIX.recordSweep(Object.assign({ plan, sweep, ir, peakDbfs: -12, noiseDbfs: -65, noiseKind: 'pink', latency: 0.07 }, o || {}));
    // The room's own decay in one band over an ISO range, from its noise-free impulse response.
    function ownDecay(ir, f, path = 'T30') {
      const [top, bottom] = D.ranges[path], b = DSP.octaveBand(f, fs), y = DSP.filterReversed(ir, b.sections), n = y.length;
      const edc = new Float64Array(n); let acc = 0;
      for (let i = n - 1; i >= 0; i--) { acc += y[i] * y[i]; edc[i] = acc; }
      const db = i => 10 * Math.log10(edc[i] / edc[0]);
      let i1 = -1, i2 = -1;
      for (let i = 0; i < n; i++) { if (i1 < 0 && db(i) <= -top) i1 = i; if (db(i) <= -bottom) { i2 = i; break; } }
      if (i1 < 0 || i2 <= i1) return null;
      return -60 / AN.regress(i => i / fs, db, i1, i2, 10).slope;
    }
    const within = (got, truth, tol) => got != null && truth != null && Math.abs(got / truth - 1) <= tol;

    // A1. Different rooms → different values, each close to the room's own decay.
    status('A1 rooms of known RT60…');
    {
      const rows = [];
      for (const rt of [0.3, 0.45, 0.6, 0.8, 1.0, 1.4]) {
        const { room, ir } = oneDevice(rt, 100 + Math.round(rt * 100));
        const { res } = evalRec(record(ir)), method = res.headline && res.headline.method;
        const truth = ownDecay(room, 1000, method || 'T30'); // the room's own decay over the range that was measured
        rows.push({ nominal: rt, truth: +truth.toFixed(3), measured: head(res), method, errPct: head(res) == null ? null : +pct(head(res), truth).toFixed(1) });
        await tick();
      }
      tables.knownRooms = rows;
      const rising = rows.every((r, i) => i === 0 || (r.measured != null && rows[i - 1].measured != null && r.measured > rows[i - 1].measured));
      check('A1 Six rooms of known RT60 (0.30–1.40 s, one device, background −65 dBFS): the 1 kHz result follows each room\'s own decay within ±5 % and rises with it',
        rows.every(r => r.errPct != null && Math.abs(r.errPct) <= 5) && rising,
        rows.map(r => `${r.nominal} s room: own ${f3(r.truth)} → measured ${f3(r.measured)} (${r.method}, ${r.errPct} %)`).join(' · '));
    }

    // A2. Repeatability with considerable background, and a small real change. −60 dBFS leaves about 38 dB of usable
    // decay at 1 kHz here (T20), close to the limit below which no value is given (35 dB).
    status('A2 repeatability…');
    {
      const seeds = [21, 22, 23, 24, 25, 26];
      const a = oneDevice(0.6, 160), b = oneDevice(0.65, 160);
      const ta = ownDecay(a.room, 1000, 'T20'), tb = ownDecay(b.room, 1000, 'T20');
      const ra = [], rb = [], snr = [], usable = [];
      for (const s of seeds) {
        const x = evalRec(record(a.ir, { noiseDbfs: -60, seed: s })); ra.push(head(x.res)); snr.push(x.an.levels.snrDb); usable.push(band(x.res, 1000).decayRangeDb);
        if (s === seeds[0]) tables.bandsConsiderableNoise = x.res.bands.map(bb => ({
          f: bb.f, usableDb: bb.decayRangeDb, noiseFloorDb: bb.noiseFloorDb, directDb: bb.headDb, method: bb.path,
          fitFromDb: bb.fit ? bb.fit.from : null, fitToDb: bb.fit ? bb.fit.to : null, fitT1: bb.fit ? bb.fit.t1 : null, fitT2: bb.fit ? bb.fit.t2 : null,
          slopeDbPerS: bb.fit ? bb.fit.slope : null, r2: bb.r2, t20: bb.t20, t30: bb.t30, rt60: bb.rt60, quality: bb.quality, reason: bb.reason,
        }));
        rb.push(head(evalRec(record(b.ir, { noiseDbfs: -60, seed: s })).res));
        await tick();
      }
      const spread = v => Math.max(...v) - Math.min(...v), mean = v => v.reduce((s, x) => s + x, 0) / v.length;
      const sd = v => { const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1)); };
      tables.repeatability = { roomA: { ownT20: +ta.toFixed(3), takes: ra }, roomB: { ownT20: +tb.toFixed(3), takes: rb }, snrDb: snr, usable1kDb: usable };
      check(`A2 Six takes of one room (own T20 decay ${f3(ta)} s) with considerable background (−60 dBFS, sweep ${Math.round(Math.min(...snr))}–${Math.round(Math.max(...snr))} dB above it, near the T20 limit), a new noise each take: the results spread by only ${f3(spread(ra))} s (sd ${f3(sd(ra))} s)`,
        ra.every(v => v != null) && spread(ra) <= 0.02 && ra.every(v => within(v, ta, 0.05)), `takes ${ra.map(f3).join(', ')} s; usable decay at 1 kHz ${usable.map(Math.round).join(', ')} dB`);
      check(`A2 A room only 0.05 s more reverberant (own decay ${f3(tb)} s) is told apart in every take: its lowest result is above the first room's highest`,
        rb.every(v => v != null) && Math.min(...rb) > Math.max(...ra), `${rb.map(f3).join(', ')} s against ${ra.map(f3).join(', ')} s`);
    }

    // A3. Background noise ladder: same room, same noise shape, louder and louder.
    status('A3 background noise…');
    {
      const { room, ir } = oneDevice(0.6, 160), own = { T20: ownDecay(room, 1000, 'T20'), T30: ownDecay(room, 1000, 'T30') }, rows = [];
      for (const lv of [-85, -80, -75, -70, -67.5, -65, -62.5, -60, -57.5, -55, -50, -40, -30]) {
        const { an, res } = evalRec(record(ir, { noiseDbfs: lv, seed: 31 })), b1 = res.bands.length ? band(res, 1000) : null, m = b1 ? b1.path : null;
        rows.push({ noiseDbfs: lv, sweepAboveBackgroundDb: an.levels.snrDb, usable1kDb: b1 ? b1.decayRangeDb : null, method: m, rt60: head(res), errPct: head(res) == null ? null : +pct(head(res), own[m]).toFixed(1), valid: res.valid, reason: res.valid ? null : res.reason });
        await tick();
      }
      tables.noiseLadder = { ownT20: +own.T20.toFixed(3), ownT30: +own.T30.toFixed(3), rows };
      const vals = rows.filter(r => r.rt60 != null), us = rows.map(r => r.usable1kDb).filter(v => v != null);
      const byPath = m => vals.filter(r => r.method === m).map(r => r.rt60), drift = v => (v.length > 1 ? 100 * (Math.max(...v) / Math.min(...v) - 1) : 0);
      check('A3 Background from −85 to −30 dBFS: every value given stays within ±5 % of the room\'s own decay over the same range, the usable decay falls as the noise rises, and the method steps T30 → T20 → no value instead of producing a biased number',
        vals.length >= 6 && vals.every(r => Math.abs(r.errPct) <= 5) && us.every((v, i) => i === 0 || v <= us[i - 1] + 1) && byPath('T20').length && byPath('T30').length && rows.some(r => !r.valid),
        `own T30 ${f3(own.T30)}, own T20 ${f3(own.T20)} · ` + rows.map(r => `${r.noiseDbfs}: ${r.usable1kDb == null ? '—' : Math.round(r.usable1kDb)} dB, ${r.method || 'no value'} ${f3(r.rt60)}${r.errPct != null ? ` (${r.errPct} %)` : ''}`).join(' · '));
      check('A3 Within one method the value hardly moves with the noise (T30 and T20 each within 3 % from the quietest to the noisiest level that still allows them): background noise does not drag the result',
        drift(byPath('T30')) <= 3 && drift(byPath('T20')) <= 3, `T30 ${byPath('T30').map(f3).join(', ')} (${drift(byPath('T30')).toFixed(1)} %) · T20 ${byPath('T20').map(f3).join(', ')} (${drift(byPath('T20')).toFixed(1)} %)`);
    }

    // A4. A different decay in every band.
    status('A4 bands…');
    {
      const rt = [1.2, 1.0, 0.8, 0.6, 0.5, 0.4], { room, ir } = oneDevice(rt, 404), { res } = evalRec(record(ir, { noiseDbfs: -70 }));
      const rows = B.map(f => { const b = band(res, f), own = ownDecay(room, f, b.path || 'T30'); return { f, own: own && +own.toFixed(3), rt60: b.rt60, method: b.path, errPct: b.rt60 != null && own ? +pct(b.rt60, own).toFixed(1) : null, reason: b.reason }; });
      tables.bandSlopes = rows;
      check('A4 A room with a different decay in every band (1.2 s at 125 Hz down to 0.4 s at 4 kHz): every band with a value is within ±6 % of its own decay, and the order of the bands is kept',
        rows.filter(r => r.rt60 != null).length >= 5 && rows.every(r => r.rt60 == null || Math.abs(r.errPct) <= 6),
        rows.map(r => `${r.f}: own ${f3(r.own)} → ${f3(r.rt60)}${r.errPct != null ? ` (${r.errPct} %)` : ` (${r.reason})`}`).join(' · '));
    }

    // A5. Not enough usable decay.
    status('A5 insufficient decay…');
    {
      const { ir } = oneDevice(0.6, 160), { res } = evalRec(record(ir, { noiseDbfs: -26, seed: 51 }));
      check('A5 Background so loud the decay cannot be measured (−26 dBFS): no RT60 at all, with the reason; nothing estimated in its place',
        !res.valid && res.headline === null && !!res.reason, res.reason);
    }

    // A6. Each take its own data; identical input, identical output.
    status('A6 takes and reuse…');
    {
      const ra = oneDevice(0.5, 501), rb = oneDevice(0.9, 901);
      const recA = record(ra.ir, { seed: 41 }), recB = record(rb.ir, { seed: 42 });
      const a = evalRec(recA), b = evalRec(recB), a2 = evalRec(recA);
      const curve = x => json(band(x.res, 1000).curve);
      check('A6 Two takes of different rooms processed one after the other: each result carries its own take id, its own decay curve and its own value (nothing carried over)',
        a.res.recordingId === a.take.id && b.res.recordingId === b.take.id && a.take.id !== b.take.id && curve(a) !== curve(b) && Math.abs(head(a.res) - head(b.res)) > 0.3,
        `${a.take.id}: ${f3(head(a.res))} s · ${b.take.id}: ${f3(head(b.res))} s`);
      const strip = r => json(Object.assign({}, r, { recordingId: null, takenAt: null, processedAt: null }));
      check('A6 The same recording processed twice gives exactly the same analysis and result (deterministic; only ids and times differ)',
        json(a.an) === json(a2.an) && strip(a.res) === strip(a2.res), `${f3(head(a.res))} s both times`);
    }

    // A7. A wrong or missing reference, and a recording without the test signal.
    status('A7 references…');
    {
      const { ir } = oneDevice(0.6, 160), rec = record(ir, { seed: 61 });
      const wrong = AN.makeSweep(Object.assign({}, plan, { f1: 100, f2: 8000 }));
      const shorter = AN.makeSweep(Object.assign({}, plan, { seconds: 3 }));
      const zero = { signal: new Float32Array(sweep.signal.length), inverse: new Float64Array(sweep.inverse.length) };
      const cases = [['sweep 100 Hz–8 kHz', wrong], ['3 s sweep', shorter], ['all zeros', zero]].map(([name, s]) => {
        let x, err = null; try { x = evalRec(rec, { sweep: s }); } catch (e) { err = e.message; }
        return { name, valid: x ? x.res.valid : false, rt60: x ? head(x.res) : null, status: x ? x.an.status : 'exception', reason: x ? (x.an.reason || x.res.reason) : err };
      });
      const bg = Float32Array.from(FIX.background(Math.round(plan.total * fs), -55, 71, 'pink')), xb = evalRec(bg);
      tables.wrongReference = cases;
      check('A7 With a reference that does not match the played sweep (other range, other length, zeros), or a recording with no test signal, no RT60 comes out',
        cases.every(c => !c.valid && c.rt60 == null) && !xb.res.valid, cases.map(c => `${c.name}: ${c.status}, ${String(c.reason).slice(0, 80)}`).join(' · ') + ` · background only: ${String(xb.an.reason).slice(0, 80)}`);
      // In the app the reference cannot differ: the played copy is made from the same sweep object (measurement.js).
    }

    // A8. Clipping and distortion.
    status('A8 clipping and distortion…');
    {
      const { room, ir } = oneDevice(0.6, 160), truth = ownDecay(room, 1000, 'T20');
      const clipped = evalRec(record(ir, { seed: 81, clip: true }));
      const k0 = 2.2, dsig = Float32Array.from(sweep.signal, v => (Math.tanh(k0 * v) / Math.tanh(k0 * plan.amplitude)) * plan.amplitude);
      const dist = evalRec(record(ir, { seed: 82, sweep: { signal: dsig } })), clean = evalRec(record(ir, { seed: 82 }));
      check('A8 A clipped recording is rejected with the reason (no value)', !clipped.res.valid && /overloaded/.test(clipped.an.reason || ''), clipped.an.reason);
      const dd = dist.an.distortion || {}, dc = clean.an.distortion || {}, own = ownDecay(room, 1000, dist.res.valid ? dist.res.headline.method : 'T20');
      check('A8 A distorting speaker (soft saturation of the sweep): the harmonics are reported and the RT60 stays within ±5 % of the room\'s own decay over the same range',
        dist.res.valid && within(head(dist.res), own, 0.05) && dd.h3Db != null && (dc.h3Db == null || dd.h3Db > dc.h3Db),
        `RT60 ${f3(head(dist.res))} s (${dist.res.headline && dist.res.headline.method}, own ${f3(own)}; clean take ${f3(head(clean.res))} s); 3rd harmonic ${dd.h3Db} dB (clean: ${dc.h3Db == null ? 'not found' : dc.h3Db})`);
    }

    // A9. Speech-like sounds during the take: bursts of 300–3400 Hz noise shaped like syllables.
    status('A9 speech…');
    {
      const { room, ir } = oneDevice(0.6, 160), own = { T20: ownDecay(room, 1000, 'T20'), T30: ownDecay(room, 1000, 'T30') };
      const q = DSP.butterworthQ(4);
      // spans: [[from s, to s], …] where someone talks (syllables on/off inside). Each syllable rises and falls over
      // `ramp` s, as speech does (10 ms); ramp 0 switches the noise on and off between two samples, which is a click in
      // the recording at every syllable edge, not speech.
      function speech(n, levelDbfs, seed, spans, ramp = 0.01) {
        const r = FIX.rng(seed), y = DSP.filter(FIX.noise(n, seed + 1), [...q.map(Q => DSP.rbj('highpass', 300, fs, Q)), ...q.map(Q => DSP.rbj('lowpass', 3400, fs, Q))]);
        const env = new Float64Array(n), R = Math.max(1, Math.round(ramp * fs));
        for (const [a, b] of spans) for (let i = Math.round(a * fs), on = true; i < Math.min(n, Math.round(b * fs));) { const len = Math.round((on ? 0.12 + 0.18 * r() : 0.08 + 0.2 * r()) * fs); for (let j = i; j < Math.min(n, i + len, Math.round(b * fs)); j++) env[j] = on ? (ramp ? Math.min(1, (j - i + 1) / R, (i + len - j) / R) : 1) : 0; i += len; on = !on; }
        let ms = 0, c = 0; for (let i = 0; i < n; i++) if (env[i]) { ms += y[i] * y[i]; c++; }
        const g = Math.pow(10, levelDbfs / 20) / Math.sqrt(ms / c);
        return Float64Array.from(y, (v, i) => v * env[i] * g);
      }
      const base = record(ir, { seed: 91 }), n = base.length;
      // (a) A few words: before the sweep and after the decay (where the take can see them), 20 dB above the background.
      const words = speech(n, -45, 92, [[0.2, 0.7], [8.2, 8.9], [9.2, 9.7]]), recA = Float32Array.from(base, (v, i) => v + words[i]);
      // (b) Someone talking throughout, 25 dB above the background.
      const talk = speech(n, -40, 95, [[0, plan.total]]), recB = Float32Array.from(base, (v, i) => v + talk[i]);
      const ra = evalRec(recA).res, rbb = evalRec(recB).res, a1 = band(ra, 1000) || {}, b1 = band(rbb, 1000);
      // Each band against the room's own decay in that band, over the range it was measured on.
      const okVal = b => b.rt60 == null || within(b.rt60, ownDecay(room, b.f, b.path), 0.05);
      tables.speech = { words: ra.bands.map(b => ({ f: b.f, disturbanceDb: b.disturbanceDb, usableDb: b.decayRangeDb, method: b.path, rt60: b.rt60, reason: b.reason })), talking: rbb.bands.map(b => ({ f: b.f, disturbanceDb: b.disturbanceDb, usableDb: b.decayRangeDb, method: b.path, rt60: b.rt60, reason: b.reason })) };
      check('A9 A few words spoken before the sweep and after the decay (20 dB above the background): the take finds them in the speech bands, and every value given stays within ±5 % of the room\'s own decay',
        ra.bands.some(b => b.disturbanceDb != null) && ra.bands.every(okVal), `bands with sounds: ${ra.bands.filter(b => b.disturbanceDb != null).map(b => `${b.f} Hz +${Math.round(b.disturbanceDb)} dB`).join(', ') || 'none'}; 1 kHz ${a1.rt60 == null ? `no value (${a1.reason})` : `${f3(a1.rt60)} s ${a1.path}`}`);
      check('A9 Someone talking throughout the take (25 dB above the background): the bands it covers give no value (their noise floor rises) rather than a biased one; no value given is off by more than 5 %',
        rbb.bands.length && rbb.bands.every(okVal) && b1 && b1.rt60 == null, b1 ? `1 kHz: ${b1.rt60 == null ? `no value (${b1.reason})` : f3(b1.rt60)}; other bands: ${rbb.bands.filter(b => b.f !== 1000).map(b => `${b.f} ${b.rt60 == null ? '—' : f3(b.rt60)}`).join(', ')}` : rbb.reason);
      // The same talking switched on and off between two samples (no ramp): every syllable edge is a click in the
      // recording, and the take is not used at all; never a biased value either way.
      const hard = speech(n, -40, 95, [[0, plan.total]], 0), rh = evalRec(Float32Array.from(base, (v, i) => v + hard[i]));
      check('A9 The same talking with syllables switched on and off between two samples: clicks in the recording, so the take is not used (no value in any band)',
        rh.an.status === 'failed' && /click/.test(rh.an.reason) && !rh.res.valid && rh.res.bands.every(b => b.rt60 == null), (rh.an.reason || 'captured').slice(0, 140));
    }

    // A10. A band that fails, and the headline.
    status('A10 bands and headline…');
    {
      const normal = oneDevice(0.6, 160);
      // A small speaker: the played sweep loses everything below about 300 Hz (8th-order high-pass), so 125 Hz gets almost
      // nothing but background.
      const hp = DSP.butterworthQ(8).map(Q => DSP.rbj('highpass', 300, fs, Q)), small = Float32Array.from(DSP.filter(sweep.signal, hp));
      const rn = evalRec(record(normal.ir, { seed: 101 })).res, rw = evalRec(record(normal.ir, { seed: 101, sweep: { signal: small } })).res;
      check('A10 A speaker with no output below about 300 Hz: the 125 Hz band has no value, and the headline (1 kHz) is the same as with full output (within 1 %)',
        band(rw, 125).rt60 == null && rn.valid && rw.valid && Math.abs(head(rw) / head(rn) - 1) <= 0.01, `125 Hz: ${band(rw, 125).reason} · headline ${f3(head(rn))} → ${f3(head(rw))} s`);
      // Loud noise only in the 1 kHz octave (−40 dBFS there, the rest of the background −65 dBFS).
      const rec = record(normal.ir, { seed: 102 }), b = DSP.octaveBand(1000, fs), nb = DSP.filter(FIX.noise(rec.length, 103), b.sections);
      let ms = 0; for (let i = 0; i < nb.length; i++) ms += nb[i] * nb[i];
      const g = Math.pow(10, -40 / 20) / Math.sqrt(ms / nb.length), x = Float32Array.from(rec, (v, i) => v + nb[i] * g);
      const r1k = evalRec(x).res, others = r1k.bands.filter(bb => bb.f !== 1000 && bb.rt60 != null).length, b1k = r1k.bands.length ? band(r1k, 1000) : null;
      check('A10 Noise only in the 1 kHz octave: the 1 kHz band has no value, so there is no headline, even though other bands have values; nothing is averaged in its place',
        !r1k.valid && r1k.headline === null && b1k && b1k.rt60 == null && others >= 3, `${others} other bands with a value; 1 kHz usable ${b1k && b1k.decayRangeDb} dB; ${r1k.reason}`);
      check('A10 The headline is the 1 kHz band itself (no average, no other band)', rn.headline.rt60 === band(rn, 1000).rt60 && rn.headline.f === 1000, `headline ${rn.headline.rt60} = 1 kHz ${band(rn, 1000).rt60}`);
    }

    // A11. Sweep level: the signal level changes, the room does not.
    status('A11 sweep level…');
    {
      const { room, ir } = oneDevice(0.6, 160), truth = ownDecay(room, 1000), rows = [];
      for (const lv of [-6, -3, 0, 3]) {
        const played = AN.playbackSignal(sweep.signal, lv);
        const { an, res } = evalRec(record(ir, { seed: 111, noiseDbfs: -72, peakDbfs: -15 + lv, sweep: { signal: played.signal } }), { levelDb: lv });
        rows.push({ levelDb: lv, sweepDbfs: an.levels.sweepDbfs, usable1kDb: band(res, 1000).decayRangeDb, method: res.headline && res.headline.method, rt60: head(res) });
        await tick();
      }
      tables.sweepLevel = { own: +truth.toFixed(3), rows };
      const rts = rows.map(r => r.rt60), steps = rows.slice(1).map((r, i) => r.sweepDbfs - rows[i].sweepDbfs);
      const methods = rows.map(r => r.method);
      // The level can change the method (T20 at a low level, T30 at a high one), which is a different range of the same
      // decay; within one method the value must not move.
      const same = m => rows.filter(r => r.method === m).map(r => r.rt60), spread = v => (v.length > 1 ? Math.max(...v) / Math.min(...v) - 1 : 0);
      check('A11 Sweep level −6, −3, 0, +3 dB: the recorded sweep rises 3 dB per step and the usable decay with it, while RT60 within one method stays within 2 % (the level does not force the value)',
        rts.every(v => v != null) && spread(same('T30')) <= 0.02 && spread(same('T20')) <= 0.02 && steps.every(s => Math.abs(s - 3) <= 0.3) && rows[3].usable1kDb > rows[0].usable1kDb,
        rows.map(r => `${r.levelDb} dB: sweep ${r.sweepDbfs} dBFS, usable ${Math.round(r.usable1kDb)} dB, ${r.method} ${f3(r.rt60)} s`).join(' · '));
    }
    status('Part A done.');
  }

  /* ================================= Part B: the whole app, virtual device ================================= */
  async function partB() {
    await until(() => AM.store && AM.store.state && AM.live, 'the app');
    const S = AM.store, W = AM.workflow, VR = window.VR, fmt = AM.util.fmt;
    // Background −66 dBFS: enough usable decay at 1 kHz for both rooms (at −55 dBFS the long room's 1 kHz band has 34 dB,
    // one short of T20, and the take is not valid; tables.e2eNote).
    const shortRoom = [0.62, 0.55, 0.5, 0.5, 0.45, 0.4], longRoom = [1.1, 1.0, 0.95, 0.9, 0.85, 0.8];
    Object.assign(VR, { rt: shortRoom, directDb: 28, noiseDbfs: -66, speakerDbfs: -24 });
    if (VR.room) VR.rebuild();
    const textOf = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); };
    // What the Results step shows for the project as it is now (its own view), and the app's top bar.
    const resultsHtml = p => W.get('results').view({ project: p, state: S.state }).body;
    // The Results headline: the average over the bands the room is judged in (summary-headline); beside it the all-band
    // average (avg-headline). Every take here is made at one position, so the room's values are that take's.
    const heroOf = (p, w) => { const m = resultsHtml(p).match(new RegExp(`data-watch="${w}">([\\d.]+)<`)); return m ? parseFloat(m[1]) : null; };
    const hero = p => heroOf(p, 'summary-headline');
    const fact = () => { AM.app.render(); const f = document.querySelector('#app [data-watch="fact-measured"] .fact-v'); return f ? f.textContent.trim() : null; };
    // One take through the Measure step; returns the new recording, or the failure when the take could not be used.
    async function recordTake(p, label) {
      const before = p.measurement.recording && p.measurement.recording.id, failedBefore = p.measurement.failed && p.measurement.failed.takenAt;
      S.go('measure'); await sleep(250);
      AM.live.measureRT60(p);
      status(`${label}: recording (10 s)…`);
      await until(() => !AM.live.state.take && ((p.measurement.recording && p.measurement.recording.id !== before) || (p.measurement.failed && p.measurement.failed.takenAt !== failedBefore)), `the ${label} take`);
      const rec = p.measurement.recording && p.measurement.recording.id !== before ? p.measurement.recording : null;
      return { rec, failed: rec ? null : p.measurement.failed };
    }
    // The Measure step's "Process recording" (Measure → Processing, which processes the latest take). Returns this take's
    // own outcome: its valid result, or its invalid attempt.
    async function processTake(p, rec, label) {
      status(`${label}: processing…`);
      S.go('measure'); await sleep(100);
      S.advance();
      await until(() => (p.processing.result && p.processing.result.recordingId === rec.id) || (p.processing.attempt && p.processing.attempt.recordingId === rec.id), `processing of the ${label} take`);
      await sleep(200);
      const res = p.processing.result && p.processing.result.recordingId === rec.id ? p.processing.result : null;
      return { res, attempt: res ? null : p.processing.attempt };
    }
    // Results, the top bar and the report show the take's values (AM.services.rt60Average): the average over the judged
    // bands as the headline and in the top bar, the all-band average beside it; without one, "—", never another band's value.
    const shows = (p, res) => {
      const RA = AM.services.rt60Average, a = RA.of(res), sm = RA.ofBands(res, AM.derive.policy(p).primary), M = AM.report.model(p);
      const same = M.measurement.id === res.recordingId && M.measurement.average.value === a.value && M.measurement.summary.value === sm.value;
      const all = heroOf(p, 'avg-headline'), head = hero(p);
      return (a.available ? Math.abs(all - a.value) < 0.006 : all === null) && (sm.available ? Math.abs(head - sm.value) < 0.006 && fact() === fmt.s(sm.value) : head === null && fact() === '—') && same;
    };

    S.startProject('new');
    S.autofillTo('setup');
    const p = S.state.project;
    W.get('setup').demoFill(p);
    status('Microphone…');
    await AM.live.requestAccess(p);
    await until(() => p.setup.permission === 'granted', 'microphone access');
    status('Background (5 s)…');
    AM.live.measureNoise(p);
    await until(() => p.setup.noise && !AM.live.state.noise, 'the background measurement');
    S.autofillTo('measure');
    tables.e2e = [];
    const log = (n, room, rec, o) => tables.e2e.push({ take: n, room, id: rec && rec.id, valid: !!(o && o.res), rt60: o && o.res ? o.res.headline.rt60 : null, method: o && o.res ? o.res.headline.method : null, reason: o && o.attempt ? o.attempt.reason : null });

    // B1. First take, short room.
    const t1 = await recordTake(p, 'take 1'), o1 = await processTake(p, t1.rec, 'take 1'); log(1, 'short', t1.rec, o1);
    check('B1 Take 1 (short room): a fresh recording with its own id, processed into the current result; Results, the top bar and the report show that take\'s value',
      o1.res && shows(p, o1.res), `${t1.rec.id}: ${o1.res ? o1.res.headline.rt60 : `not valid (${o1.attempt && o1.attempt.reason})`} s; Results ${hero(p)} s; top bar ${fact()}`);

    // B2. The room changes: the value follows.
    VR.rt = longRoom; VR.rebuild();
    const t2 = await recordTake(p, 'take 2'), o2 = await processTake(p, t2.rec, 'take 2'); log(2, 'long', t2.rec, o2);
    const hist = p.processing.history || [];
    check('B2 Take 2 after the room became more reverberant: a new recording and a new valid result that follows the room (much longer); take 1 kept as replaced; every screen shows take 2',
      o2.res && t2.rec.id !== t1.rec.id && o2.res.headline.rt60 - o1.res.headline.rt60 > 0.25 && hist.length === 1 && hist[0].recordingId === t1.rec.id && shows(p, o2.res),
      `take 1 ${o1.res && o1.res.headline.rt60} s → take 2 ${o2.res ? o2.res.headline.rt60 : `not valid (${o2.attempt && o2.attempt.reason})`} s; replaced: ${hist.map(h => `${h.recordingId} ${h.rt60} s`).join(', ')}`);

    // B3. The same room again: repeatability through the whole app (a new stretch of background noise each take).
    const t3 = await recordTake(p, 'take 3'), o3 = await processTake(p, t3.rec, 'take 3'); log(3, 'long', t3.rec, o3);
    check('B3 Take 3 in the same room as take 2: a new recording and result within 0.02 s of take 2 (a sweep measurement repeats closely while the room does not change)',
      o3.res && o2.res && t3.rec.id !== t2.rec.id && Math.abs(o3.res.headline.rt60 - o2.res.headline.rt60) <= 0.02, `take 2 ${o2.res && o2.res.headline.rt60} s, take 3 ${o3.res && o3.res.headline.rt60} s`);

    // B4. A take recorded but not processed yet: what do the screens show?
    VR.rt = shortRoom; VR.rebuild();
    const t4 = await recordTake(p, 'take 4 (left unprocessed)');
    const r4text = textOf(resultsHtml(p)), m4text = textOf(W.get('measure').view({ project: p, state: S.state }).body);
    const showsPrev = o3.res && shows(p, o3.res);
    check('B4 A newer take recorded but not yet processed: Results, the top bar and the report keep the current result (by design), and the Measure step says the new take is not processed yet',
      showsPrev && /not processed yet|Waiting to be processed/i.test(m4text), `still showing ${hero(p)} s from ${p.processing.result.recordingId}; latest recording ${t4.rec.id}`);
    // Finding F1 (docs/RT60-RESPONSIVENESS-AUDIT.md), fixed: Results says so (AM.derive.laterTakes).
    check('B4 …and Results itself says that a newer take is waiting to be processed (otherwise a user who opens Results from the step list sees the previous value with nothing to say a newer take exists) [finding F1, fixed]',
      /not (been )?processed|waiting to be processed|newer take/i.test(r4text), `Results text mentions the waiting take: ${/not (been )?processed|waiting to be processed|newer take/i.test(r4text) ? 'yes' : 'no'}`);
    const o4 = await processTake(p, t4.rec, 'take 4'); log(4, 'short', t4.rec, o4);
    check('B4 Once processed, take 4 (short room again) becomes current and every screen follows it', o4.res && o3.res && o4.res.headline.rt60 < o3.res.headline.rt60 - 0.25 && shows(p, o4.res),
      `take 4 ${o4.res && o4.res.headline.rt60} s`);

    // B5. A take captured but not valid (background just loud enough to leave too little decay at 1 kHz).
    VR.setNoise(-48);
    const t5 = await recordTake(p, 'take 5 (loud background)');
    const o5 = t5.rec ? await processTake(p, t5.rec, 'take 5') : null; log(5, 'short, loud', t5.rec, o5);
    VR.setNoise(-66);
    const r5text = textOf(resultsHtml(p));
    // Finding F2, fixed: next to the value it did not replace, Results says the latest take gave no value and why.
    check('B5 A take with too little usable decay at 1 kHz gives no value; the previous valid result stays current on Results, the top bar and the report; the take list on Results marks the newest take "Not valid", and Results says beside the value that the latest take gave none, with its reason [finding F2, fixed]',
      o5 && !o5.res && o5.attempt && o4.res && p.processing.result.recordingId === t4.rec.id && shows(p, o4.res) && /Not valid/.test(r5text) && /Your latest take \(.*\) gave no value\./.test(r5text) && r5text.includes(o5.attempt.reason.slice(0, 40)),
      `take 5: ${o5 && o5.attempt ? o5.attempt.reason : 'no attempt'}; Results headline still ${hero(p)} s (take 4)`);

    // B6. A take that cannot be used at all (background so loud the sweep barely rises above it).
    VR.setNoise(-20);
    const t6 = await recordTake(p, 'take 6 (very loud background)'); log(6, 'short, very loud', null, null);
    VR.setNoise(-66);
    const r6text = textOf(resultsHtml(p));
    check('B6 A take that cannot be analysed is not used: the recording and the current result are unchanged, the reason is kept, the take list on Results marks it "Not used", and Results says the latest take could not be analysed [finding F2, fixed]',
      !t6.rec && t6.failed && p.processing.result.recordingId === t4.rec.id && /Not used/.test(r6text) && /gave no value: it could not be analysed/.test(r6text), `failed: ${t6.failed && t6.failed.reason}`);
    status('Part B done.');
  }

  window.RESP_A_DONE = partA().catch(e => { check('Part A ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Part A error'); });
  window.RESP_B_DONE = new Promise(resolve => {
    const btn = document.getElementById('rs-run');
    btn.addEventListener('click', () => { window.RESP_A_DONE.then(() => partB()).then(resolve, e => { check('Part B ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Part B error'); resolve(); }); }, { once: true });
  });
})();
