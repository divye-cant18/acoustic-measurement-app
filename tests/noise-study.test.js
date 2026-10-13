/* Background-noise study: does what the noise check reports match the risk to the RT60 take that follows?
   Development only. Results on tests/noise-study.html and in window.NOISE_STUDY (window.NOISE_STUDY_DONE resolves).

   Every background is built on the same stationary room noise: pink noise plus a low rumble (15–60 Hz, 12 dB more energy,
   as from ventilation), about −49.5 dBFS broadband like the level reported from the field. On top of it: a level that
   fluctuates, a level that falls, a level that rises (ventilation switching on), speech-like bursts, a door impact.
   For each background:
     the noise check   AM.analysis.analyseNoise on 5.3 s of it, and the check as it was before this study (oldNoise)
     the takes         one device on a desk (as in tests/sweep-study.html), RT 0.3, 0.5 and 0.7 s, 3 repeats each with
                       independent noise and event times, through AM.analysis and AM.services.processing
   Risk to the take = a value outside the tolerance (5 % T30, 8 % T20 against the room's own decay) accepted as valid at
   250–4000 Hz, or fewer values at 1000 Hz than with the steady background. A warning is proportionate when it appears
   for backgrounds that carry that risk and not for those that do not. */
(function () {
  'use strict';
  const DSP = AM.dsp, AN = AM.analysis, PROC = AM.services.processing, FIX = window.FIX, BANDS = AM.demo.BANDS;
  const D = AN.CRITERIA.decay, esc = AM.util.esc;
  const FS = 48000, SWEEP = Number((location.search.match(/sweep=(\d+(\.\d+)?)/) || [])[1]) || AN.CRITERIA.take.sweepSeconds;
  const DESK = [[0.0006, -3, 1], [0.0011, -7, -1], [0.0016, -10, 1], [0.0065, -31, 1], [0.0098, -35, -1], [0.0135, -37, 1], [0.019, -40, -1], [0.026, -43, 1]];
  const N = window.NOISE_STUDY = { sweep: SWEEP, checks: [], takes: [], summary: [] };
  const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });

  /* ---------- the noise check as it was before this study (broadband 125 ms frames) ---------- */
  function oldNoise(x, fs) {
    const c = { settle: 0.3, frame: 0.125, spread: { warn: 6, fail: 10 }, jump: { warn: 12, fail: 20 }, drift: { warn: 3, fail: 6 }, highDbfs: -30 };
    const a0 = Math.round(c.settle * fs), fr = Math.round(c.frame * fs), nF = Math.floor((x.length - a0) / fr), frames = [];
    for (let k = 0; k < nF; k++) frames.push(DSP.dbOf(DSP.meanSquare(x, a0 + k * fr, a0 + (k + 1) * fr)));
    const s = frames.slice().sort((a, b) => a - b), pct = p => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
    const em = f => DSP.dbOf(f.reduce((t, d) => t + Math.pow(10, d / 10), 0) / f.length), third = Math.floor(nF / 3);
    const spread = pct(0.9) - pct(0.1), jump = s[s.length - 1] - pct(0.1), drift = em(frames.slice(-third)) - em(frames.slice(0, third)), leq = DSP.dbOf(DSP.meanSquare(x, a0, a0 + nF * fr));
    const fail = spread > c.spread.fail || jump > c.jump.fail || Math.abs(drift) > c.drift.fail;
    const warn = spread > c.spread.warn || jump > c.jump.warn || Math.abs(drift) > c.drift.warn || leq > c.highDbfs;
    return { leq, spread, jump, drift, status: fail ? 'invalid' : warn ? 'warning' : 'valid' };
  }

  /* ---------- backgrounds ---------- */
  const bp = (x, lo, hi) => DSP.filter(x, [DSP.rbj('highpass', lo, FS, 0.54), DSP.rbj('highpass', lo, FS, 1.31), DSP.rbj('lowpass', hi, FS, 0.54), DSP.rbj('lowpass', hi, FS, 1.31)]);
  const energy = x => { let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i]; return e; };
  // Stationary room noise, `n` samples, broadband Leq `leq` dBFS.
  function roomNoise(n, seed, leq = -49.5) {
    const p = FIX.pink(n, seed), r = bp(FIX.noise(n, seed + 7), 15, 60), gr = Math.sqrt(energy(p) / energy(r) * Math.pow(10, 12 / 10));
    const x = p.map((v, i) => v + gr * r[i]), g = Math.pow(10, leq / 20) / Math.sqrt(energy(x) / n);
    return x.map(v => v * g);
  }
  const rng = seed => FIX.rng(seed);
  // Each background: a function of (n samples, seed, events in seconds) returning the samples. `when` places its events.
  const KINDS = [
    { id: 'steady', name: 'Steady (pink + ventilation rumble)', make: (n, seed) => roomNoise(n, seed) },
    { id: 'fluctuating', name: 'Level fluctuating ±3 dB (about 0.3–1.7 Hz)', make: (n, seed) => {
      const x = roomNoise(n, seed), r = rng(seed + 11), comps = [0, 1, 2, 3].map(() => ({ f: 0.3 + 1.4 * r(), ph: 2 * Math.PI * r() }));
      return x.map((v, i) => { const t = i / FS, m = comps.reduce((s, c) => s + Math.sin(2 * Math.PI * c.f * t + c.ph), 0) * 2.85 / Math.sqrt(2); return v * Math.pow(10, m / 20); });
    } },
    { id: 'falling', name: 'Level falling by 6 dB over about 2 s', make: (n, seed, at) => roomNoise(n, seed).map((v, i) => v * Math.pow(10, -3 * Math.tanh((i / FS - at) / 0.8) / 20)) },
    { id: 'rising', name: 'Ventilation switching on: +10 dB within 0.2 s', make: (n, seed, at) => roomNoise(n, seed).map((v, i) => v * Math.pow(10, 5 * (1 + Math.tanh((i / FS - at) / 0.1)) / 20)) },
    { id: 'bursts', name: 'Speech-like bursts, 300–3000 Hz, +15 dB', make: (n, seed) => {
      const x = roomNoise(n, seed), s = bp(FIX.noise(n, seed + 23), 300, 3000), r = rng(seed + 31);
      const g = Math.sqrt(energy(bp(x, 300, 3000)) / energy(s) * Math.pow(10, 15 / 10));
      for (let t = 0.3 + r(); t < n / FS; t += 0.8 + 1.7 * r()) {
        const len = Math.round((0.15 + 0.35 * r()) * FS), a = Math.round(t * FS);
        for (let i = 0; i < len && a + i < n; i++) x[a + i] += g * s[a + i] * Math.sin(Math.PI * i / len);
      }
      return x;
    } },
    { id: 'impact', name: 'One door impact, 30 ms, +35 dB', make: (n, seed, at) => {
      const x = roomNoise(n, seed), s = FIX.noise(n, seed + 41), a = Math.round(at * FS), len = Math.round(0.03 * FS);
      const g = Math.sqrt(energy(x) / n * Math.pow(10, 35 / 10));
      for (let i = 0; i < len && a + i < n; i++) x[a + i] += g * s[i] * Math.exp(-i / (0.006 * FS));
      return x;
    } },
  ];

  /* ---------- takes ---------- */
  const plan = Object.assign(AN.sweepPlan(FS), { seconds: SWEEP }); plan.total = plan.preRoll + plan.seconds + plan.tail;
  const sweep = AN.makeSweep(plan);
  const rooms = new Map();
  function room(rt) {
    if (!rooms.has(rt)) {
      const sec = rt * 3 + 0.5, seed = 900 + Math.round(rt * 100);
      const own = FIX.roomIR({ fs: FS, seconds: sec, rt, seed }), dev = FIX.roomIR({ fs: FS, seconds: sec, rt, seed, directDb: 28, reflections: DESK });
      // The response peaks at −12 dBFS with a 5 s sweep; every sweep length is played at that same level.
      const p5 = Object.assign(AN.sweepPlan(FS), { seconds: 5 }), r5 = DSP.convolve(AN.makeSweep(p5).signal, dev);
      let pk = 0; for (const v of r5) pk = Math.max(pk, Math.abs(v));
      rooms.set(rt, { own, resp: DSP.convolve(sweep.signal, dev), gain: Math.pow(10, -12 / 20) / pk, refs: new Map() });
    }
    return rooms.get(rt);
  }
  function expected(rm, f, path) {
    const k = `${f}/${path}`;
    if (!rm.refs.has(k)) {
      const [top, bottom] = D.ranges[path], b = DSP.octaveBand(f, FS), y = DSP.filterReversed(rm.own, b.sections), n = y.length, edc = new Float64Array(n);
      let acc = 0; for (let i = n - 1; i >= 0; i--) { acc += y[i] * y[i]; edc[i] = acc; }
      const db = i => 10 * Math.log10(edc[i] / edc[0]);
      let i1 = -1, i2 = -1; for (let i = 0; i < n; i++) { if (i1 < 0 && db(i) <= -top) i1 = i; if (db(i) <= -bottom) { i2 = i; break; } }
      rm.refs.set(k, i1 < 0 || i2 <= i1 ? null : -60 / AN.regress(i => i / FS, db, i1, i2, 10).slope);
    }
    return rm.refs.get(k);
  }
  function take(kind, rt, rep) {
    const rm = room(rt), total = Math.round(plan.total * FS), r = rng(7000 + rep * 101 + rt * 1000);
    // Events land anywhere in the take: before, during or after the sweep.
    const at = 0.5 + r() * (plan.total - 1);
    const x = kind.make(total, 8000 + rep * 37 + Math.round(rt * 100), at), start = Math.round((plan.preRoll + 0.07) * FS);
    for (let i = 0; i < rm.resp.length && start + i < total; i++) x[start + i] += rm.resp[i] * rm.gain;
    const a = AN.analyseTake(Float32Array.from(x), plan, sweep);
    const res = PROC.evaluate({ id: 'n', takenAt: '', status: a.status, reason: a.reason, levels: a.levels, plan, sampleRate: FS, analysis: a, warnings: [] }, {});
    const bands = res.bands.map(b => {
      const ref = b.rt60 != null ? expected(rm, b.f, b.path) : null, err = ref ? b.rt60 / ref - 1 : null;
      return { f: b.f, rt60: b.rt60, path: b.path, err, wrong: err != null && b.f >= 250 && Math.abs(err) > (b.path === 'T20' ? 0.08 : 0.05), reason: b.rt60 == null ? b.reason : null, quality: b.quality };
    });
    return { kind: kind.id, rt, rep, at, status: a.status, reason: a.reason, snr: a.levels && a.levels.snrDb, valid: res.valid, bands, b1k: bands.find(b => b.f === 1000), _a: a, _r: res };
  }

  async function run() {
    const st = document.getElementById('status'), step = t => { if (st) st.textContent = t; };
    // Noise checks: three independent 5.3 s windows of each background, events in the middle of the window.
    for (const kind of KINDS) for (let rep = 0; rep < 3; rep++) {
      const n = Math.round(5.3 * FS), x = Float32Array.from(kind.make(n, 100 + rep * 13, 2.65));
      const now = AN.analyseNoise(x, FS), old = oldNoise(x, FS);
      N.checks.push({ kind: kind.id, rep, old, now });
    }
    render(); await tick();
    let i = 0;
    for (const kind of KINDS) for (const rt of [0.3, 0.5, 0.7]) for (let rep = 0; rep < 3; rep++) {
      N.takes.push(take(kind, rt, rep));
      if (++i % 3 === 0) { step(`Takes: ${i} of ${KINDS.length * 9}`); await tick(); }
    }
    summarise(); render(); step('Done');
    return N;
  }

  function summarise() {
    const steady = N.takes.filter(t => t.kind === 'steady'), avail = ts => ts.filter(t => t.b1k.rt60 != null).length / ts.length;
    for (const kind of KINDS) {
      const ts = N.takes.filter(t => t.kind === kind.id), cs = N.checks.filter(c => c.kind === kind.id);
      const wrong = ts.flatMap(t => t.bands.filter(b => b.wrong).map(b => `RT ${t.rt} #${t.rep + 1} ${b.f} Hz ${(b.err * 100).toFixed(1)} % ${b.path}`));
      const errs = ts.map(t => t.b1k.err).filter(e => e != null);
      const risk = wrong.length > 0 || avail(ts) < avail(steady) - 0.1;
      N.summary.push({
        kind: kind.id, name: kind.name, risk, wrong, avail: avail(ts), meanAbs: errs.length ? errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length : null,
        rejected: [...new Set(ts.filter(t => t.status !== 'captured').map(t => t.reason))], noValue: [...new Set(ts.filter(t => t.status === 'captured' && t.b1k.rt60 == null).map(t => t.b1k.reason))],
        old: cs.map(c => c.old.status), now: cs.map(c => c.now.status),
      });
    }
  }

  /* ---------- rendering ---------- */
  const f1 = x => (x == null || !isFinite(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`);
  const pc = x => (x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(1)} %`);
  const WORD = { valid: 'Suitable', warning: 'Caution', invalid: 'Measure again' };
  const OLD = { valid: 'Steady', warning: 'Accepted with warnings', invalid: 'Not accepted' };
  function render() {
    const name = id => KINDS.find(k => k.id === id).name;
    const checks = `<h2>Noise check</h2><div class="wrap"><table><thead><tr><th>Background</th><th class="r">Leq</th><th class="r">L10 − L90<br>broadband / 88 Hz–5.7 kHz</th><th class="r">Loudest moment<br>broadband, above L90 / in band, above the median</th><th class="r">Change<br>broadband / in band</th><th>Before</th><th>Now</th></tr></thead><tbody>
      ${N.checks.map(c => `<tr><td>${esc(name(c.kind))} #${c.rep + 1}</td><td class="r">${c.now.leqDbfs.toFixed(1)} dBFS</td><td class="r">${c.old.spread.toFixed(1)} / ${c.now.inBand ? c.now.inBand.spreadDb.toFixed(1) : '—'} dB</td><td class="r">${c.old.jump.toFixed(1)} / ${c.now.inBand ? c.now.inBand.soundDb.toFixed(1) : '—'} dB</td><td class="r">${f1(c.old.drift)} / ${c.now.inBand ? f1(c.now.inBand.driftDb) : '—'} dB</td><td>${OLD[c.old.status]}</td><td><b>${WORD[c.now.status]}</b>${c.now.reasons.length || c.now.warnings.length ? `<br><small>${esc(c.now.reasons.concat(c.now.warnings).join(' '))}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    const sum = N.summary.length ? `<h2>Risk to the take against the noise check (${N.sweep} s sweep)</h2><div class="wrap"><table><thead><tr><th>Background</th><th>Risk to the RT60</th><th class="r">1000 Hz values</th><th class="r">Mean |error| at 1000 Hz</th><th>Wrong values accepted (250–4000 Hz)</th><th>Takes rejected / bands without a value</th><th>Noise check before</th><th>Noise check now</th></tr></thead><tbody>
      ${N.summary.map(s => `<tr><td>${esc(s.name)}</td><td><b class="${s.risk ? 'bad' : 'ok'}">${s.risk ? 'Yes' : 'No'}</b></td><td class="r">${Math.round(s.avail * 100)} %</td><td class="r">${s.meanAbs == null ? '—' : (s.meanAbs * 100).toFixed(1) + ' %'}</td><td>${s.wrong.length ? esc(s.wrong.join('; ')) : 'none'}</td><td><small>${esc(s.rejected.concat(s.noValue).join(' | ') || '—')}</small></td><td>${s.old.map(x => OLD[x]).join(', ')}</td><td>${s.now.map(x => WORD[x]).join(', ')}</td></tr>`).join('')}</tbody></table></div>` : '';
    const takes = N.takes.length ? `<h2>Every take</h2><div class="wrap"><table><thead><tr><th>Background</th><th class="r">RT</th><th class="r">Event at</th><th class="r">Signal above background</th><th class="r">1000 Hz</th><th>Error per band 125–4000 Hz</th><th>Outcome</th></tr></thead><tbody>
      ${N.takes.map(t => `<tr><td>${esc(t.kind)} #${t.rep + 1}</td><td class="r">${t.rt}</td><td class="r">${['falling', 'rising', 'impact'].includes(t.kind) ? t.at.toFixed(2) + ' s' : '—'}</td><td class="r">${t.snr == null ? '—' : t.snr.toFixed(1) + ' dB'}</td><td class="r">${t.b1k.rt60 == null ? '—' : t.b1k.rt60.toFixed(3) + ' ' + t.b1k.path}</td><td>${t.bands.map(b => `${b.f}: ${b.rt60 == null ? '—' : pc(b.err)}${b.wrong ? ' ✗' : ''}`).join(' · ')}</td><td><small>${esc(t.status !== 'captured' ? `rejected: ${t.reason}` : t.b1k.rt60 == null ? `no value at 1000 Hz: ${t.b1k.reason}` : t.valid ? 'valid' : 'not valid')}</small></td></tr>`).join('')}</tbody></table></div>` : '';
    document.getElementById('out').innerHTML = sum + checks + takes;
  }

  Object.assign(N, { _take: take, _kinds: KINDS, _room: room, _plan: plan, _sweep: sweep }); // for inspection from the console
  window.NOISE_STUDY_DONE = run().catch(e => { const s = document.getElementById('status'); if (s) s.textContent = 'Error: ' + e.message; throw e; });
})();
