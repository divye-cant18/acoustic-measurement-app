/* RT60 validation: synthetic rooms of known reverberation time through the application's own analysis (AM.analysis)
   and decision (AM.services.processing), with the absolute and percentage error of every case.
   Open tests/validation.html; results are on the page and in window.VALIDATION (window.VALIDATION_DONE resolves).

   Expected: the room's own decay in the band, from its noise-free impulse response (no sweep, no noise, no device), over
   the same ISO 3382-2 range as the measured value (T30 −5…−35 dB, T20 −5…−25 dB). Tolerance 5 % (T30), 8 % (T20).
   Before: the same recording through the analysis as it was before the deep audit — no cap on the direct sound
   (CRITERIA.decay.directWindow very large), no gap, cut-off or background-sound check, and the 60 dB fit first from
   75 dB usable decay.
   The page also compares other ways of reading RT60 on the same data, checks that every displayed value is the
   calculated one, and analyses a WAV impulse response or clap recording loaded by the user. */
(function () {
  'use strict';
  const DSP = AM.dsp, AN = AM.analysis, PROC = AM.services.processing, FIX = window.FIX, BANDS = AM.demo.BANDS, REF = AM.demo.REFERENCE_BAND;
  const D = AN.CRITERIA.decay, T = AN.CRITERIA.take, fmt = AM.util.fmt;
  // A laptop on a desk: the desk and the device's body reflect within ~2 ms, room surfaces 30–45 dB below the direct sound.
  const DESK = [[0.0006, -3, 1], [0.0011, -7, -1], [0.0016, -10, 1], [0.0065, -31, 1], [0.0098, -35, -1], [0.0135, -37, 1], [0.019, -40, -1], [0.026, -43, 1]];
  const RTS = [0.25, 0.30, 0.40, 0.50, 0.60, 0.70];
  // Seeds tied to the RT (0.30 s → base, 0.40 s → base + 1, …; 0.25 s → base − 1), so adding a case keeps the others.
  const seedOf = (rt, base) => (rt === 0.25 ? base - 1 : base + Math.round(rt * 10) - 3);
  const V = window.VALIDATION = { sections: [], display: [], compare: null };
  // Yield to the page between cases (a MessageChannel, which a background tab does not throttle as it does timers).
  const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  const esc = AM.util.esc;

  /* ---------- measurement set-ups and rooms ---------- */
  const setups = new Map();
  function setup(fs, seconds = T.sweepSeconds, tail = T.tail) {
    const key = `${fs}/${seconds}/${tail}`;
    if (!setups.has(key)) {
      const plan = Object.assign(AN.sweepPlan(fs), { seconds, tail });
      plan.total = plan.preRoll + seconds + tail;
      setups.set(key, { plan, sweep: AN.makeSweep(plan) });
    }
    return setups.get(key);
  }
  const roomIR = (fs, rt, seed, extra) => FIX.roomIR(Object.assign({ fs, seconds: Math.max(...[].concat(rt)) * 3 + 0.5, rt, seed }, extra || {}));
  // One device on a desk: its direct sound 28 dB above the room's reverberation, with the desk reflections.
  const oneDevice = (fs, rt, seed) => ({ room: roomIR(fs, rt, seed), ir: roomIR(fs, rt, seed, { directDb: 28, reflections: DESK }) });
  const deviceTake = (s, ir, extra) => FIX.recordSweep(Object.assign({ plan: s.plan, sweep: s.sweep, ir, peakDbfs: -12, noiseDbfs: -65, noiseKind: 'pink', latency: 0.07 }, extra || {}));
  // Adds a direct sound directDb above the energy of `room` (2 ms before it), as FIX.roomIR does.
  function withDirect(room, fs, directDb) {
    let e = 0; for (const v of room) e += v * v;
    const gap = Math.round(0.002 * fs), ir = new Float64Array(room.length + gap);
    ir[0] = Math.sqrt(e * Math.pow(10, directDb / 10));
    for (let i = 0; i < room.length; i++) ir[gap + i] += room[i];
    const pk = Math.max(1, ir[0]); for (let i = 0; i < ir.length; i++) ir[i] /= pk;
    return ir;
  }

  /* The room's own decay in one band over an ISO range, from its noise-free impulse response. */
  function ownDecay(ir, fs, f, path) {
    const [top, bottom] = D.ranges[path], b = DSP.octaveBand(f, fs), y = DSP.filterReversed(ir, b.sections), n = y.length;
    const edc = new Float64Array(n); let acc = 0;
    for (let i = n - 1; i >= 0; i--) { acc += y[i] * y[i]; edc[i] = acc; }
    const db = i => 10 * Math.log10(edc[i] / edc[0]);
    let i1 = -1, i2 = -1;
    for (let i = 0; i < n; i++) { if (i1 < 0 && db(i) <= -top) i1 = i; if (db(i) <= -bottom) { i2 = i; break; } }
    if (i1 < 0 || i2 <= i1) return null;
    return -60 / AN.regress(i => i / fs, db, i1, i2, 10).slope;
  }

  function measure(rec, s, settings) {
    const a = AN.analyseTake(rec, s.plan, s.sweep);
    const r = PROC.evaluate({ id: 'v', takenAt: '', status: a.status, reason: a.reason, levels: a.levels, plan: s.plan, sampleRate: s.plan.fs, analysis: a, warnings: [], settings }, {});
    return { a, r };
  }
  // The decision before the audit: the 60 dB fit first whenever 75 dB of decay were usable.
  function oldBand(ab, nb) {
    const f = ab && ab.fits && ab.fits.T60;
    if (!(ab && ab.decayRangeDb != null && ab.decayRangeDb >= D.required.T60 && f)) return { rt60: nb.rt60, path: nb.path };
    if (f.T * ab.bandwidth < D.minBT || 1000 * (1 - f.r2) > D.xi.fail) return { rt60: null, path: null };
    return { rt60: f.T, path: 'T60' };
  }
  function measureBefore(rec, s, settings) {
    const keep = [D.directWindow, T.gapSeconds, D.cutoff.excessDb, T.disturbance.events];
    D.directWindow = 1e9; T.gapSeconds = 1e9; D.cutoff.excessDb = 1e9; T.disturbance.events = 1e9;
    try {
      const m = measure(rec, s, settings);
      m.r.bands = m.r.bands.map((b, k) => {
        if (m.a.bands[k] && m.a.bands[k].cutoff) return b;
        return Object.assign({}, b, oldBand(m.a.bands[k], b));
      });
      return m;
    } finally { [D.directWindow, T.gapSeconds, D.cutoff.excessDb, T.disturbance.events] = keep; }
  }

  /* ---------- one case ----------
     expect: 'value'    a value within tolerance of Expected
             'none'     no value in the band, with a reason
             'rejected' the take is rejected, with a reason
             'either'   a value within tolerance, or no value with a reason (never a wrong value) */
  function runCase(label, { rec, s, room, f = REF, nominal = null, expect = 'value', before = false, settings, all = true }) {
    const { a, r } = measure(rec, s, settings);
    const b = r.bands.find(x => x.f === f) || null, fs = s.plan.fs;
    const path = b && b.path, meas = b && b.rt60 != null ? b.rt60 : null;
    const ref = room ? ownDecay(room, fs, f, path || 'T30') : null;
    const tol = path === 'T20' ? 0.08 : 0.05;
    const within = meas != null && ref != null && Math.abs(meas - ref) <= tol * ref;
    const why = a.status !== 'captured' ? a.reason : meas == null ? ((b && b.reason) || r.reason) : null;
    const notes = b && b.notes ? b.notes : [];
    const ok = expect === 'value' ? within
      : expect === 'none' ? meas == null && !!why
        : expect === 'rejected' ? a.status === 'failed' && !!a.reason
          : expect === 'flagged' ? within || (meas == null && !!why) || (notes.length > 0 && b.confidence !== 'High')
            : within || (meas == null && !!why);
    let others = null;
    if (all && room && a.status === 'captured') {
      const errs = r.bands.filter(x => x.rt60 != null && x.f !== f).map(x => { const o = ownDecay(room, fs, x.f, x.path); return o ? 100 * (x.rt60 / o - 1) : null; }).filter(x => x != null);
      others = { n: errs.length, of: r.bands.length - 1, max: errs.length ? Math.max(...errs.map(Math.abs)) : null };
    }
    let old = null;
    if (before) {
      const m = measureBefore(rec, s, settings), ob = m.r.bands.find(x => x.f === f);
      old = { status: m.a.status, rt60: ob ? ob.rt60 : null, path: ob ? ob.path : null };
    }
    const status = a.status !== 'captured' ? 'Take rejected' : meas == null ? 'No value' : `${b.quality}, ${b.confidence.toLowerCase()} confidence`;
    return { label, f, nominal, ref, meas, path, usable: b ? b.decayRangeDb : null, t20: b ? b.t20 : null, t30: b ? b.t30 : null, curvature: b ? b.curvature : null, quality: b ? b.quality : null, status, notes, why, ok, expect, tol, others, old, result: r };
  }

  /* ---------- the cases ---------- */
  async function section(title, intro, build) {
    const sec = { title, intro, rows: [] };
    V.sections.push(sec);
    for (const make of build()) { sec.rows.push(make()); await tick(); }
    render();
    return sec;
  }

  async function runAll() {
    const s48 = setup(48000);

    await section('Known RT60, reference conditions', 'Omnidirectional source and microphone apart (no dominant direct sound), 48 kHz, 5 s sweep, white background −70 dBFS. Reference band 1000 Hz; "other bands" are 125–4000 Hz against their own expected values.',
      () => RTS.map(rt => () => { const room = roomIR(48000, rt, seedOf(rt, 101)); return runCase(`RT ${rt.toFixed(2)} s`, { rec: FIX.recordSweep({ plan: s48.plan, sweep: s48.sweep, ir: room }), s: s48, room, nominal: rt }); }));

    await section('Known RT60, one device on a desk', 'Speaker and microphone of one device, centimetres apart: direct sound 28 dB above the reverberation, desk reflections within 2 ms, pink background −65 dBFS, 70 ms playback-to-recording delay — the app\'s own situation.',
      () => RTS.map(rt => () => { const d = oneDevice(48000, rt, seedOf(rt, 201)); return runCase(`RT ${rt.toFixed(2)} s`, { rec: deviceTake(s48, d.ir, { seed: seedOf(rt, 300) }), s: s48, room: d.room, nominal: rt, before: true }); }));

    {
      const d = oneDevice(48000, 0.5, 211);
      await section('Background noise level', 'One device, RT 0.50 s. The louder the background, the less decay is usable: T20 from 35 dB (with the T30 check from 45 dB), below that no value. Never a wrong value.',
        () => [-85, -75, -65, -58, -52, -46].map(nz => () => runCase(`Background ${nz} dBFS (pink)`, { rec: deviceTake(s48, d.ir, { noiseDbfs: nz, seed: 400 - nz }), s: s48, room: d.room, nominal: 0.5, expect: 'either', before: true })));
    }

    await section('Sweep length', 'One device, pink background −65 dBFS. A longer sweep raises the impulse response above the noise (about 3 dB per doubling).',
      () => [2.5, 5, 10].flatMap(sec => [0.3, 0.7].map(rt => () => { const s = setup(48000, sec), d = oneDevice(48000, rt, 221 + Math.round(rt * 10)); return runCase(`${sec} s sweep, RT ${rt.toFixed(2)} s`, { rec: deviceTake(s, d.ir), s, room: d.room, nominal: rt }); })));

    await section('Sample rate', 'One device, pink background −65 dBFS, the same room at each rate.',
      () => [44100, 48000, 96000].flatMap(fs => [0.4, 0.6].map(rt => () => { const s = setup(fs), d = oneDevice(fs, rt, 231 + Math.round(rt * 10)); return runCase(`${fs / 1000} kHz, RT ${rt.toFixed(2)} s`, { rec: deviceTake(s, d.ir), s, room: d.room, nominal: rt }); })));

    {
      const rts = [0.70, 0.62, 0.52, 0.45, 0.40, 0.36], d = oneDevice(48000, rts, 241), rec = deviceTake(s48, d.ir, { seed: 241 });
      await section('Frequency-dependent RT60', `One device; nominal RT per octave band ${rts.map((x, k) => `${BANDS[k]} Hz ${x.toFixed(2)}`).join(', ')} (interpolated smoothly between bands, so a band decays with a value between its neighbours').`,
        () => BANDS.map((f, k) => () => runCase(`${f} Hz`, { rec, s: s48, room: d.room, f, nominal: rts[k], all: false })));
    }

    {
      const early = FIX.roomIR({ fs: 48000, seconds: 2.5, rt: 0.25, seed: 5 }), late = FIX.roomIR({ fs: 48000, seconds: 2.5, rt: 0.8, seed: 505 });
      const room = early.map((v, i) => v + late[i] * Math.pow(10, -14 / 20));
      await section('Curved (double-slope) decay', 'A fast early decay (0.25 s) and a slower late one (0.80 s, 14 dB lower), as in a room with an absorbent ceiling or coupled spaces. The app reports T20 on the whole curve from −5 dB (the range ISO 3382-2 prefers) and flags the curvature C = T30/T20 − 1. Before: the early decay was taken for the device\'s direct sound and the late decay read alone.',
        () => [['no direct sound', room], ['one device, direct sound 20 dB', withDirect(room, 48000, 20)]].map(([what, ir]) => () => runCase(`Double slope, ${what}`, { rec: FIX.recordSweep({ plan: s48.plan, sweep: s48.sweep, ir, peakDbfs: -10, noiseDbfs: -75 }), s: s48, room, before: true })));
    }

    {
      const room = FIX.roomIR({ fs: 48000, seconds: 3, rt: 0.8, seed: 11 });
      await section('Same room, noisier and quieter moment', 'A slightly curved decay (125 Hz: T20 0.77 s, T30 0.72 s). The same room must give the same value whatever the background. Before: from 75 dB usable decay (a very quiet moment) the 60 dB fit took over and the value changed.',
        () => [[-55, 125], [-95, 125], [-55, 1000], [-95, 1000]].map(([nz, f]) => () => runCase(`${f} Hz, background ${nz} dBFS`, { rec: FIX.recordSweep({ plan: s48.plan, sweep: s48.sweep, ir: room, noiseDbfs: nz }), s: s48, room, f, nominal: 0.8, before: true, all: false })));
    }

    {
      const d = oneDevice(48000, 0.5, 251);
      await section('Playback-to-recording delay', 'The delay is read from the recording, never assumed. Up to 1 s is accepted.',
        () => [0, 0.25, 0.5, 0.9, 1.2].map(lat => () => runCase(`Delay ${lat.toFixed(2)} s`, { rec: deviceTake(s48, d.ir, { latency: lat }), s: s48, room: d.room, nominal: 0.5, expect: lat > T.maxLatency ? 'rejected' : 'value' })));
    }

    {
      const d = oneDevice(48000, 0.6, 261), rt7 = oneDevice(48000, 0.7, 262);
      const clean = deviceTake(s48, d.ir);
      const gapped = (at, len) => { const rec = Float32Array.from(clean), i = Math.round((s48.plan.preRoll + 0.07 + at) * 48000); rec.fill(0, i, i + len); return rec; };
      const distorted = drive => ({ plan: s48.plan, sweep: { signal: Float32Array.from(s48.sweep.signal, v => 0.7 * Math.tanh(drive * v / 0.7) / Math.tanh(drive)), inverse: s48.sweep.inverse } });
      const cut = sec => FIX.roomIR({ fs: 48000, seconds: sec, rt: 0.7, seed: 9 });
      // Speech-like sounds through the whole take: 300–3000 Hz, 15 dB above the background in that range, 0.15–0.5 s long,
      // every 0.8–2.5 s (as in tests/noise-study.html).
      const voices = rec => {
        const n = rec.length, q = [DSP.rbj('highpass', 300, 48000, 0.54), DSP.rbj('highpass', 300, 48000, 1.31), DSP.rbj('lowpass', 3000, 48000, 0.54), DSP.rbj('lowpass', 3000, 48000, 1.31)];
        const v = DSP.filter(FIX.noise(n, 262), q), bg = DSP.filter(FIX.background(n, -65, 263, 'pink'), q), r = FIX.rng(264), out = Float32Array.from(rec);
        let ev = 0, eb = 0; for (let i = 0; i < n; i++) { ev += v[i] * v[i]; eb += bg[i] * bg[i]; }
        const g = Math.sqrt(eb / ev * Math.pow(10, 1.5));
        for (let t = 0.3 + r(); t < n / 48000; t += 0.8 + 1.7 * r()) { const len = Math.round((0.15 + 0.35 * r()) * 48000), a = Math.round(t * 48000); for (let i = 0; i < len && a + i < n; i++) out[a + i] += g * v[a + i] * Math.sin(Math.PI * i / len); }
        return out;
      };
      await section('Faulty and distorted recordings', 'Each must give either the right value or no value with a reason that identifies the fault — never a wrong value shown as valid.',
        () => [
          () => runCase('Clipped input', { rec: deviceTake(s48, d.ir, { peakDbfs: -3, clip: true }), s: s48, room: d.room, expect: 'rejected' }),
          () => runCase('Recording stops early (90 % of its length)', { rec: clean.subarray(0, Math.round(clean.length * 0.9)), s: s48, room: d.room, expect: 'rejected' }),
          () => { const s = setup(48000, 5, 0.3); return runCase('Recording ends 0.3 s after the sweep', { rec: deviceTake(s, rt7.ir), s, room: rt7.room, expect: 'rejected' }); },
          () => { const s = setup(48000, 5, 0.8); return runCase('Recording ends 0.8 s after the sweep (RT 0.70 s)', { rec: deviceTake(s, rt7.ir), s, room: rt7.room, nominal: 0.7, expect: 'either' }); },
          () => runCase('Weak decay: background −50 dBFS', { rec: deviceTake(s48, d.ir, { noiseDbfs: -50 }), s: s48, room: d.room, expect: 'none' }),
          () => runCase('Decay cut off at −26 dB (RT 0.70 s cut at 0.30 s)', { rec: FIX.recordSweep({ plan: s48.plan, sweep: s48.sweep, ir: cut(0.3) }), s: s48, room: roomIR(48000, 0.7, 9), nominal: 0.7, expect: 'none', before: true }),
          () => runCase('Decay cut off at −13 dB (cut at 0.15 s)', { rec: FIX.recordSweep({ plan: s48.plan, sweep: s48.sweep, ir: cut(0.15) }), s: s48, room: roomIR(48000, 0.7, 9), nominal: 0.7, expect: 'none', before: true }),
          () => runCase('Known limitation — decay cut off close to the background (one device, RT 0.30 s cut at 0.15 s, about 13 dB above it)', { rec: deviceTake(s48, FIX.roomIR({ fs: 48000, seconds: 0.15, rt: 0.3, seed: 9, directDb: 28, reflections: DESK })), s: s48, room: roomIR(48000, 0.3, 9), nominal: 0.3, expect: 'flagged', before: true }),
          () => runCase('Speaker distortion, 3rd harmonic −18 dB (about 12 %)', { rec: deviceTake(distorted(1.5), d.ir), s: s48, room: d.room, nominal: 0.6, expect: 'value' }),
          () => runCase('Speaker distortion, 3rd harmonic −14 dB (about 20 %)', { rec: deviceTake(distorted(2.5), d.ir), s: s48, room: d.room, nominal: 0.6, expect: 'either' }),
          () => runCase('Gap: one 128-sample block missing during the sweep', { rec: gapped(3.0, 128), s: s48, room: d.room, nominal: 0.6, expect: 'rejected', before: true }),
          () => runCase('Gap: 20 ms missing during the sweep', { rec: gapped(2.2, 960), s: s48, room: d.room, nominal: 0.6, expect: 'rejected', before: true }),
          () => runCase('Voices during the take (speech-like sounds 15 dB above the background)', { rec: voices(clean), s: s48, room: d.room, nominal: 0.6, expect: 'either', before: true }),
          () => runCase('Browser kept noise suppression on', { rec: clean, s: s48, room: d.room, expect: 'none', settings: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } }),
          () => runCase('No test signal (background only)', { rec: Float32Array.from(FIX.background(Math.round(s48.plan.total * 48000), -50, 61)), s: s48, expect: 'rejected' }),
        ]);
    }

    displayChecks();
    render();
    methodComparison();
    render();
    const all = V.sections.flatMap(s => s.rows).map(r => r.ok).concat(V.display.map(d => d.ok));
    V.passed = all.filter(Boolean).length; V.total = all.length;
    document.title = `RT60 validation: ${V.passed}/${V.total} passed`;
    render();
    return V;
  }

  /* ---------- displayed values = calculated values ---------- */
  function displayChecks() {
    const out = V.display, add = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
    const rows = V.sections.flatMap(s => s.rows).filter(r => r.result);
    const valid = rows.filter(r => r.result.valid), invalid = rows.filter(r => !r.result.valid);
    add('Headline = the 1000 Hz band\'s value and method, in every valid result', valid.every(r => { const ref = r.result.bands.find(b => b.f === REF); return r.result.headline.f === REF && r.result.headline.rt60 === ref.rt60 && r.result.headline.method === ref.path; }), `${valid.length} valid results`);
    add('No headline and status invalid whenever the 1000 Hz band has no value', invalid.every(r => r.result.headline == null && r.result.status === 'invalid' && !!r.result.reason), `${invalid.length} invalid results`);
    add('Every band value comes from T20, with enough usable decay, a straight decay and B·T ≥ 4; T30 only as the check, from 45 dB', rows.every(r => r.result.bands.every(b => b.rt60 == null || (b.path === 'T20' && b.decayRangeDb >= D.required.T20 && b.rt60 === b.t20 && (b.t30 == null || b.decayRangeDb >= D.required.T30) && b.xi <= D.xi.fail && b.rt60 * b.bandwidth >= D.minBT))), `${rows.reduce((s, r) => s + r.result.bands.filter(b => b.rt60 != null).length, 0)} band values`);
    add('Every band without a value says why', rows.every(r => r.result.bands.every(b => b.rt60 != null || !!b.reason)), '');
    // The same result as the app's screens and report read it (AM.derive), with a target and no treatment.
    const sample = valid.slice(0, 12);
    const det = sample.map(r => {
      const p = { id: 'v', room: { L: 6, W: 5, H: 3 }, completed: [], review: [], processing: { result: r.result }, target: { preferred: 0.5, min: 0.4, max: 0.6 }, treatment: { items: [] } };
      const m = AM.derive.measured(p), as = AM.derive.assessment(p), V3 = AM.derive.geometry(p).V;
      const pr = AM.services.prediction.predict({ V: V3, bands: r.result.bands, treatment: { items: [] }, referenceBand: REF });
      return {
        measured: m && m.headline.rt60 === r.result.headline.rt60 && AM.derive.headlineMeasured(p) === r.result.headline.rt60,
        // The room (here one position) is assessed in the bands its criterion sets: this room has no type, so 500, 1000 and
        // 2000 Hz (AM.services.evaluation, default), averaged when at least 2 of the 3 have a value; the all-band mean
        // (at least 3 of 6) stays the overall figure. Both summed here from the result's own bands. The 1000 Hz value and
        // method stay with it as the reference band's data.
        assessment: (() => {
          const ok = r.result.bands.filter(b => typeof b.rt60 === 'number' && b.rt60 > 0 && !!b.path && !['Insufficient', 'Not measured'].includes(b.quality));
          const has = ok.length >= 3, mean = has ? ok.reduce((s, b) => s + b.rt60, 0) / ok.length : null;
          const mid = ok.filter(b => [500, 1000, 2000].includes(b.f)), hasMid = mid.length >= 2, midMean = hasMid ? mid.reduce((s, b) => s + b.rt60, 0) / mid.length : null;
          return !!as && as.policy.id === 'default' && as.average.available === has && (has ? Math.abs(as.average.value - mean) < 1e-12 : as.average.value === null)
            && as.available === hasMid && (hasMid ? Math.abs(as.rt - midMean) < 1e-12 : as.rt === null && as.status === null)
            && as.ref.rt === r.result.headline.rt60 && as.ref.method === r.result.headline.method && as.bands.every((b, k) => b.rt === r.result.bands[k].rt60);
        })(),
        prediction: pr.bands.every((b, k) => b.measured === r.result.bands[k].rt60),
        text: fmt.s(r.result.headline.rt60) === `${r.result.headline.rt60.toFixed(2)} s`,
      };
    });
    add('Results, Assessment and the report read the same RT60 as Processing calculated (AM.derive.measured / headlineMeasured)', det.every(d => d.measured), `${sample.length} results`);
    add('Assessment judges the bands the room\'s criterion sets (500–2000 Hz for a room without a type; none below 2 of 3), keeps the all-band average (none below 3 of 6), the 1000 Hz value and method as band data, and every band as calculated', det.every(d => d.assessment), `${det.filter(d => d.assessment).length} of ${det.length}`);
    add('Prediction starts from the calculated band values', det.every(d => d.prediction), '');
    add('Displayed value = calculated value rounded to 0.01 s (fmt.s)', det.every(d => d.text), sample.slice(0, 3).map(r => `${r.result.headline.rt60} → ${fmt.s(r.result.headline.rt60)}`).join(', '));
    // The averages this page gives for a clap or a WAV file (from the decided bands alone) are the ones the app shows for
    // the same bands (AM.derive on a project holding the result), in every case: all bands, partial and none.
    const same = (a, b) => a.available === b.available && a.value === b.value && a.n === b.n;
    const avgs = rows.map(r => {
      const p = { id: 'v', room: { L: 6, W: 5, H: 3 }, completed: [], review: [], processing: { result: r.result }, target: { preferred: 0.5, min: 0.4, max: 0.6 }, treatment: { items: [] } };
      const page = appAverages(r.result.bands), all = AM.derive.averageRT60(p), mid = AM.derive.midAverageRT60(p);
      return { ok: same(page.all, all) && same(page.mid, mid), partial: all.partial, label: r.label };
    });
    add('The clap and WAV tools on this page give the app\'s own two averages (125–4000 Hz and 500–2000 Hz) for the same bands',
      avgs.every(a => a.ok), `${avgs.length} results (${avgs.filter(a => a.partial).length} with a band left out)${avgs.some(a => !a.ok) ? `; differs: ${avgs.filter(a => !a.ok).map(a => a.label).join(', ')}` : ''}`);
    const inv = invalid[0];
    if (inv) {
      const p = { id: 'v', room: { L: 6, W: 5, H: 3 }, completed: [], review: [], processing: { result: inv.result }, target: { preferred: 0.5, min: 0.4, max: 0.6 }, treatment: { items: [] } };
      add('An invalid result is not shown as a measurement (no measured value, no assessment)', AM.derive.measured(p) == null && AM.derive.assessment(p) == null && AM.derive.headlineMeasured(p) == null, inv.label);
    }
  }

  /* ---------- the same data read in other ways ---------- */
  // The method of the open-source Android app "RT" (github.com/soygabimoreno/RT, Apache-2.0; ReverbTimeCalculator.kt and
  // the files it calls under domain/calculator/processing, read again on 2026-10-15, last push 2026-08-06): one causal
  // (forward) band-pass per octave; the start muted (MuteStart.kt zeroes seconds × rate × 2 samples: 0.1 s for its 0.05 s);
  // the squared signal summed forward over the WHOLE recording and read as 10·lg(1 − sum/total) (a Schroeder curve with no
  // truncation and no noise compensation); then the first samples closest to −5 and −15 dB (ReverbTimeMethod.EDT):
  // RT = 6 × their time apart. Its band filter is iirj's Butterworth band-pass of order 2 (125 Hz), 4 (250–1000 Hz) or
  // 8 (2000, 4000 Hz); here the app's own octave filter, run forward, stands in for it.
  // As it displays: the "2000 Hz" entry takes its −5 dB point from the 2 kHz curve and its −15 dB point from the 4 kHz
  // curve; the "4000 Hz" entry takes both from the 8 kHz curve; its "Average" is the mean of those two entries
  // (MeasureViewModel.kt: (measures[4].time + measures[5].time) / 2). own: each band from its own curve.
  function rtAppPoints(x, fs, f) {
    const b = DSP.octaveBand(f, fs);
    if (b.hi >= 0.49 * fs) return null;
    const y = DSP.filter(x, b.sections), n = y.length, mute = Math.round(0.05 * fs * 2), cum = new Float64Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) { if (i >= mute) total += y[i] * y[i]; cum[i] = total; }
    let p5 = 0, p15 = 0, d5 = Infinity, d15 = Infinity;
    for (let i = 0; i < n; i++) {
      const db = 10 * Math.log10(Math.max(1 - cum[i] / total, 1e-30)), a = Math.abs(db + 5), c = Math.abs(db + 15);
      if (a < d5) { d5 = a; p5 = i; }
      if (c < d15) { d15 = c; p15 = i; }
    }
    return { p5, p15 };
  }
  function rtApp(x, fs) {
    const pts = {}, rt = (a, b) => (pts[a] && pts[b] ? 6 * (pts[b].p15 - pts[a].p5) / fs : null);
    [...BANDS, 8000].forEach(f => { pts[f] = rtAppPoints(x, fs, f); });
    const own = {}, shown = {};
    BANDS.forEach(f => { own[f] = rt(f, f); shown[f] = own[f]; });
    shown[2000] = rt(2000, 4000);
    shown[4000] = rt(8000, 8000);
    return { own, shown, average: shown[2000] != null && shown[4000] != null ? (shown[2000] + shown[4000]) / 2 : null };
  }
  // This app's two averages for a list of decided bands, by the app's own rules (AM.services.rt60Average): the bands from
  // 125 to 4000 Hz that have a value (at least 3 of 6), and 500–2000 Hz (at least 2 of 3). A take counts as valid when
  // its 1000 Hz band has a value, as in services/processing.js.
  const RA = AM.services.rt60Average;
  function appAverages(bands) {
    const r = { valid: bands.some(b => b.f === REF && typeof b.rt60 === 'number'), bands };
    return { all: RA.of(r), mid: RA.mid(r) };
  }
  // Schroeder integration from the arrival to the end of the file, time-reversed band filter, no truncation: here only
  // for EDT (0…−10 dB × 6), which the noise barely touches.
  function plainBand(seg, o, f, fs, top, bottom) {
    const b = DSP.octaveBand(f, fs), y = DSP.filterReversed(seg, b.sections), m = y.length - o, edc = new Float64Array(m);
    let acc = 0; for (let i = m - 1; i >= 0; i--) { acc += y[o + i] * y[o + i]; edc[i] = acc; }
    const db = i => 10 * Math.log10(edc[i] / edc[0]);
    let i1 = -1, i2 = -1;
    for (let i = 0; i < m; i++) { if (i1 < 0 && db(i) <= -top) i1 = i; if (db(i) <= -bottom) { i2 = i; break; } }
    if (i1 < 0 || i2 <= i1) return null;
    const f2 = AN.regress(i => i / fs, db, i1, i2, Math.max(1, Math.floor((i2 - i1) / 3000)));
    return f2 && f2.slope < 0 ? -60 / f2.slope : null;
  }
  // An impulse response or a recording of one clap: onset as in the app (within 10 ms before the peak, the first point
  // within 20 dB of it), then each band through the app's own band analysis and decision.
  function analyseImpulse(x, fs) {
    let pk = 0, pi = 0;
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) { pk = a; pi = i; } }
    const sm = Math.max(1, Math.round(0.0005 * fs)), floor = pk * pk * Math.pow(10, -T.onsetDb / 10);
    let onset = pi;
    for (let i = Math.max(sm, pi - Math.round(T.onsetWindow * fs)); i <= pi; i++) {
      let s = 0; for (let k = i - sm; k < i; k++) s += x[k] * x[k];
      if (s / sm >= floor) { onset = i - sm; break; }
    }
    const start = Math.max(0, onset - Math.round(T.preOnset * fs)), seg = Float64Array.from(x.subarray(start)), o = onset - start;
    const plan = { fs, f1: 1, f2: fs / 2 };
    const bands = BANDS.map(f => (DSP.octaveBand(f, fs).hi < 0.49 * fs ? PROC.decideBand(AN.analyseBand(seg, o, f, plan)) : { f, rt60: null, reason: 'Above this sample rate.' }));
    const app = rtApp(x, fs);
    const plain = BANDS.map(f => (DSP.octaveBand(f, fs).hi < 0.49 * fs ? { f, rtApp: app.own[f], rtAppShown: app.shown[f], edt: plainBand(seg, o, f, fs, 0, 10) } : { f }));
    return { onsetSec: onset / fs, seconds: (x.length - onset) / fs, bands, plain, rtAppAverage: app.average, averages: appAverages(bands) };
  }
  const mean = xs => (xs.length && xs.every(x => x != null) ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const pick = (list, fs, key) => fs.map(f => { const b = list.find(x => x.f === f); return b ? b[key] : null; });

  function methodComparison() {
    // A furnished small room: short at mid and high frequencies, longer in the bass (1000 Hz 0.32 s).
    const rts = [0.62, 0.50, 0.40, 0.32, 0.30, 0.28], fs = 48000, s = setup(fs);
    const room = roomIR(fs, rts, 271), dev = roomIR(fs, rts, 271, { directDb: 28, reflections: DESK });
    const own = BANDS.map(f => ownDecay(room, fs, f, 'T30')), ownEdt = plainBand(room, 0, 1000, fs, 0, 10);
    const sweep = measure(deviceTake(s, dev, { seed: 272 }), s).r;
    const rows = [];
    // Columns: 1000 Hz; ISO 3382-1 T_mid (500 and 1000 Hz, both needed); this app's 500–2000 Hz and 125–4000 Hz averages by
    // its own rules (for the room's own decay and the RT app: the plain mean of those bands); the RT app's "Average".
    const TMID = [500, 1000], MID3 = [500, 1000, 2000], ALL = BANDS;
    const app = (what, bands, extra) => { const a = appAverages(bands); return Object.assign({ what, f1k: pick(bands, [REF], 'rt60')[0], tmid: mean(pick(bands, TMID, 'rt60')), mid3: a.mid.value, all: a.all.value, allN: a.all.available ? a.all.n : null, rtAvg: null, edt: null }, extra || {}); };
    rows.push({ what: 'Room\'s own decay (T30, noise-free)', f1k: own[3], tmid: mean([own[2], own[3]]), mid3: mean([own[2], own[3], own[4]]), all: mean(own), allN: 6, rtAvg: null, edt: ownEdt });
    rows.push(app('This app: sweep, one device (ISO 3382-2 evaluation)', sweep.bands));
    // A clap 1.5 m from the phone: direct sound about as strong as the reverberation. Its loudest 10 ms carry 40–60 dB
    // more energy than 10 ms of the (pink) background. The recording starts 1 s before the clap and runs 3 s after it.
    const clapRoom = roomIR(fs, rts, 271, { directDb: 0, directGap: 0.004 }), w = Math.round(0.01 * fs);
    let top = 0; for (let a = 0; a + w <= clapRoom.length; a += w) top = Math.max(top, DSP.meanSquare(clapRoom, a, a + w));
    for (const pnr of [60, 50, 40]) {
      const n = Math.round(4 * fs), x = FIX.background(n, -70, 280 + pnr, 'pink'), at = Math.round(1 * fs);
      const g = Math.sqrt(Math.pow(10, (pnr - 70) / 10) / top);
      for (let i = 0; i < clapRoom.length && at + i < n; i++) x[at + i] += clapRoom[i] * g;
      const res = analyseImpulse(Float32Array.from(x), fs);
      rows.push(app(`Clap, ${pnr} dB above the background (10 ms energy): this app's analysis`, res.bands, { edt: pick(res.plain, [1000], 'edt')[0] }));
      const rtRow = (what, key, avg) => ({ what, f1k: pick(res.plain, [1000], key)[0], tmid: mean(pick(res.plain, TMID, key)), mid3: mean(pick(res.plain, MID3, key)), all: mean(pick(res.plain, ALL, key)), allN: 6, rtAvg: avg, edt: null });
      rows.push(rtRow(`Clap, ${pnr} dB: method of the open-source "RT" app as it displays (its 2 and 4 kHz entries read the 4 and 8 kHz curves)`, 'rtAppShown', res.rtAppAverage));
      rows.push(rtRow(`Clap, ${pnr} dB: the same method, each band from its own curve (causal filter, whole recording, −5…−15 dB × 6)`, 'rtApp', null));
    }
    V.compare = { rts, rows };
  }

  /* ---------- rendering ---------- */
  const f3 = x => (x == null ? '—' : x.toFixed(3));
  const sg = (x, d = 1) => (x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`);
  const EXPECT = { value: 'value within tolerance', none: 'no value, with a reason', rejected: 'take rejected, with a reason', either: 'right value or no value', flagged: 'right value, no value, or a value marked questionable' };
  function rowHtml(r) {
    const abs = r.meas != null && r.ref != null ? r.meas - r.ref : null, pct = abs != null ? 100 * abs / r.ref : null;
    const pn = r.meas != null && r.nominal != null ? 100 * (r.meas / r.nominal - 1) : null;
    const before = r.old ? (r.old.status !== 'captured' ? 'rejected' : r.old.rt60 == null ? 'no value' : `${f3(r.old.rt60)} ${r.old.path}${r.ref ? ` (${sg(100 * (r.old.rt60 / r.ref - 1))} %)` : ''}`) : '';
    const others = r.others ? (r.others.n ? `${r.others.n}/${r.others.of}, max ${r.others.max.toFixed(1)} %` : `0/${r.others.of}`) : '';
    return `<tr><td>${esc(r.label)}${r.why ? `<br><small>${esc(r.why)}</small>` : ''}${r.notes.length ? `<br><small>Note: ${esc(r.notes.join(' '))}</small>` : ''}</td><td class="r">${r.f}</td><td class="r">${f3(r.nominal)}</td><td class="r">${f3(r.ref)}</td>
      <td class="r"><b>${f3(r.meas)}</b></td><td>${r.path || '—'}${r.usable != null ? ` · ${Math.round(r.usable)} dB` : ''}${r.curvature != null && Math.abs(r.curvature) > D.curvature ? ` · C ${r.curvature} %` : ''}</td>
      <td class="r">${abs == null ? '—' : sg(abs, 3)}</td><td class="r">${pct == null ? '—' : `${sg(pct)} %`}</td><td class="r">${pn == null ? '—' : `${sg(pn)} %`}</td>
      <td>${esc(r.status)}</td><td class="r">${others}</td><td>${before}</td><td><span class="${r.ok ? 'ok' : 'bad'}">${r.ok ? 'PASS' : 'FAIL'}</span><br><small>${EXPECT[r.expect]}</small></td></tr>`;
  }
  function render() {
    const el = document.getElementById('out');
    const secs = V.sections.map(s => `<h2>${esc(s.title)}</h2><p class="muted">${esc(s.intro)}</p><div class="wrap"><table>
      <thead><tr><th>Case</th><th class="r">Band (Hz)</th><th class="r">Nominal (s)</th><th class="r">Expected (s)</th><th class="r">Measured (s)</th><th>Path · usable decay</th><th class="r">Abs. error (s)</th><th class="r">Error</th><th class="r">vs nominal</th><th>Reliability</th><th class="r">Other bands</th><th>Before</th><th>Result</th></tr></thead>
      <tbody>${s.rows.map(rowHtml).join('')}</tbody></table></div>`).join('');
    const disp = V.display.length ? `<h2>Displayed values = calculated values</h2><ul>${V.display.map(d => `<li><span class="${d.ok ? 'ok' : 'bad'}">${d.ok ? 'PASS' : 'FAIL'}</span> ${esc(d.name)}${d.detail ? ` <small>${esc(d.detail)}</small>` : ''}</li>`).join('')}</ul>` : '';
    const cmp = V.compare ? `<h2>The same room read in other ways</h2><p class="muted">A furnished small room (an assumed profile, not measured data): nominal RT ${V.compare.rts.map((x, k) => `${BANDS[k]} Hz ${x.toFixed(2)}`).join(', ')}. Different reference bands, averages and evaluation methods give different single numbers for the same room. Information only; no pass or fail. "—" = no reliable value (this app) or not applicable. This app's averages follow its own rules (the 125–4000 Hz average over the bands that have a value, at least 3 of 6, with how many in brackets; 500–2000 Hz at least 2 of 3). The "RT" app's "Average" is what that app shows: the mean of its 2000 and 4000 Hz entries, which read the 2–4 kHz and 8 kHz curves (above 4 kHz this synthetic room keeps its 4000 Hz value, ${V.compare.rts[5].toFixed(2)} s).</p>
      <div class="wrap"><table><thead><tr><th>Method</th><th class="r">1000 Hz</th><th class="r">T<sub>mid</sub> 500–1000 Hz (ISO 3382-1)</th><th class="r">Average 500–2000 Hz</th><th class="r">Average 125–4000 Hz</th><th class="r">"RT" app "Average"</th><th class="r">EDT 1000 Hz</th></tr></thead><tbody>
      ${V.compare.rows.map(r => `<tr><td>${esc(r.what)}</td><td class="r">${f3(r.f1k)}</td><td class="r">${f3(r.tmid)}</td><td class="r">${f3(r.mid3)}</td><td class="r">${f3(r.all)}${r.all != null && r.allN != null && r.allN < 6 ? ` (${r.allN}/6)` : ''}</td><td class="r">${f3(r.rtAvg)}</td><td class="r">${f3(r.edt)}</td></tr>`).join('')}</tbody></table></div>` : '';
    el.innerHTML = secs + disp + cmp;
    const rows = V.sections.flatMap(s => s.rows), all = rows.map(r => r.ok).concat(V.display.map(d => d.ok));
    document.getElementById('summary').innerHTML = V.total != null
      ? `<b class="${V.passed === V.total ? 'ok' : 'bad'}">${V.passed}/${V.total} passed</b> · ${rows.length} measured cases, ${V.display.length} display checks`
      : `Running… ${all.filter(Boolean).length}/${all.length} passed so far`;
  }

  /* ---------- WAV impulse response or clap recording ---------- */
  function parseWav(buf) {
    const dv = new DataView(buf), tag = o => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file.');
    let o = 12, fmtc = null, data = null;
    while (o + 8 <= dv.byteLength) {
      const id = tag(o), size = dv.getUint32(o + 4, true);
      if (id === 'fmt ') fmtc = { format: dv.getUint16(o + 8, true), channels: dv.getUint16(o + 10, true), fs: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true), sub: size >= 26 ? dv.getUint16(o + 32, true) : null };
      if (id === 'data') data = { at: o + 8, size: Math.min(size, dv.byteLength - o - 8) };
      o += 8 + size + (size % 2);
    }
    if (!fmtc || !data) throw new Error('The WAV file has no audio data.');
    const format = fmtc.format === 0xFFFE ? fmtc.sub : fmtc.format, bytes = fmtc.bits / 8, frame = bytes * fmtc.channels, n = Math.floor(data.size / frame), x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = data.at + i * frame;
      if (format === 3 && fmtc.bits === 32) x[i] = dv.getFloat32(p, true);
      else if (format === 1 && fmtc.bits === 16) x[i] = dv.getInt16(p, true) / 32768;
      else if (format === 1 && fmtc.bits === 24) { const v = dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getInt8(p + 2) << 16); x[i] = v / 8388608; }
      else if (format === 1 && fmtc.bits === 32) x[i] = dv.getInt32(p, true) / 2147483648;
      else throw new Error(`Unsupported WAV format (format ${format}, ${fmtc.bits} bit).`);
    }
    return { x, fs: fmtc.fs, channels: fmtc.channels };
  }
  document.getElementById('wav').addEventListener('change', async ev => {
    const file = ev.target.files[0], el = document.getElementById('wav-out');
    if (!file) return;
    try {
      const { x, fs, channels } = parseWav(await file.arrayBuffer());
      const res = analyseImpulse(x, fs);
      const rows = BANDS.map((f, k) => { const b = res.bands[k], p = res.plain[k]; return `<tr><td>${f}</td><td class="r">${f3(b.t20)}</td><td class="r">${f3(b.t30)}</td><td class="r"><b>${f3(b.rt60)}</b></td><td>${b.path || '—'}${b.decayRangeDb != null ? ` · ${Math.round(b.decayRangeDb)} dB` : ''}</td><td class="r">${f3(p.rtApp)}</td><td class="r">${f3(p.rtAppShown)}</td><td class="r">${f3(p.edt)}</td><td><small>${esc(b.rt60 == null ? (b.reason || '') : (b.notes || []).join(' '))}</small></td></tr>`; }).join('');
      const iso = res.bands.map(b => b.rt60), av = res.averages, said = a => (a.available ? `<b>${f3(a.value)}</b> s (${esc(RA.describe(a))})` : `none (${esc(a.reason || '')})`);
      el.innerHTML = `<p>${esc(file.name)}: ${fs} Hz, ${channels} channel${channels > 1 ? 's' : ''} (first used), arrival at ${res.onsetSec.toFixed(3)} s, ${res.seconds.toFixed(2)} s after it.</p>
        <p>This app's averages, by its own rules: 125–4000 Hz ${said(av.all)} · 500–2000 Hz ${said(av.mid)} · ISO 3382-1 T<sub>mid</sub> (500 and 1000 Hz): <b>${f3(mean([iso[2], iso[3]]))}</b> s.
        The "RT" app's method as it displays, "Average" (its 2000 and 4000 Hz entries): <b>${f3(res.rtAppAverage)}</b> s.</p>
        <div class="wrap"><table><thead><tr><th>Band (Hz)</th><th class="r">T20</th><th class="r">T30</th><th class="r">RT60 (this app)</th><th>Path · usable decay</th><th class="r">−5…−15 dB × 6, whole file, own band</th><th class="r">"RT" app as it displays</th><th class="r">EDT</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="muted">"This app": the application's own band analysis and decision (Lundeby truncation, noise subtraction, direct sound separated, T30 or T20). "−5…−15 dB × 6, whole file": the method in the source code of the open-source Android app "RT" (causal band filter, Schroeder curve over the whole file with no truncation or noise compensation, two points), each band from its own curve. "As it displays": its 2000 Hz entry reads the −15 dB point from the 4 kHz curve, its 4000 Hz entry the 8 kHz curve (ReverbTimeCalculator.kt); its band filters are not reproduced exactly (see the code). EDT: 0…−10 dB × 6. For an impulse response exported from REW, compare "This app" T20/T30 with REW's T20/T30 for the same band.</p>`;
    } catch (e) { el.innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
  });

  window.VALIDATION_DONE = runAll().catch(e => { document.getElementById('summary').innerHTML = `<b class="bad">Error: ${esc(e.message)}</b>`; document.title = 'error'; throw e; });
})();
