/* Mobile measurement study (tests/mobile-study.html). Development only.

   One synthetic room, measured by the production code under laptop-like and phone-like conditions, one factor at a
   time, five takes each (a new background noise and arrival delay per take; the room itself is identical). For each
   condition: whether the take is accepted, each band's RT60 and calculation path, the average RT60 across bands
   (AM.services.rt60Average) and how many bands it uses, against the laptop-like reference.

   Conditions are models of what a phone may do, with stated parameters; none is a measurement of a real phone:
     speaker      a high-pass at the speaker (a small phone speaker gives little below several hundred Hz)
     direct       the speaker-to-microphone direct sound, dB above the whole reverberation (closer on a phone)
     level        the peak level of the room's response at the microphone (a quiet speaker or output route)
     agc          automatic gain control the browser does not report: gain falls fast when the input is loud and rises
                  at `rate` dB/s when it is quiet, up to +25 dB, towards a −20 dBFS target
     gate         noise suppression modelled as a gate: 10 ms frames within 6 dB of the pre-roll background are lowered
                  by 20 dB
     splice       a dropout with the missing samples removed (no zero fill), mid-sweep
     zeros        a dropout filled with zeros, mid-sweep
     limiter      a soft limiter before the converter, peaks compressed without reaching full scale
   Results: on the page, and window.MOBILE_STUDY (resolved by window.MOBILE_STUDY_DONE). */
(function () {
  'use strict';
  const AN = AM.analysis, PROC = AM.services.processing, RA = AM.services.rt60Average, DSP = AM.dsp, FIX = window.FIX, B = AM.demo.BANDS;
  const RT = [0.62, 0.55, 0.50, 0.45, 0.42, 0.38]; // a furnished meeting room, 125 … 4000 Hz
  const REPEATS = 5;
  const out = document.getElementById('out'), statusEl = document.getElementById('status');
  const status = t => { statusEl.textContent = t; };
  const tick = () => new Promise(r => setTimeout(r, 0));

  const BASE = { fs: 48000, speakerHz: 250, direct: 18, level: -12, noise: -70 };
  const CONDITIONS = [
    { id: 'L', name: 'Laptop-like reference', set: {} },
    { id: 'spk', name: 'Small speaker: high-pass at 700 Hz', set: { speakerHz: 700 } },
    { id: 'dir', name: 'Speaker and microphone closer: direct sound 30 dB', set: { direct: 30 } },
    { id: 'quiet', name: 'Quiet playback: response peak −30 dBFS', set: { level: -30 } },
    { id: 'P', name: 'Phone-like: 700 Hz speaker + direct 30 dB + peak −24 dBFS', set: { speakerHz: 700, direct: 30, level: -24 } },
    { id: 'agc6', name: 'Unreported automatic gain, 6 dB/s', set: { post: 'agc', rate: 6 } },
    { id: 'agc30', name: 'Unreported automatic gain, 30 dB/s', set: { post: 'agc', rate: 30 } },
    { id: 'gate', name: 'Unreported noise suppression (gate at background + 6 dB)', set: { post: 'gate', gateDb: 6, cutDb: 20 } },
    { id: 'gate20', name: 'Unreported noise suppression (gate at background + 20 dB, −30 dB)', set: { post: 'gate', gateDb: 20, cutDb: 30 } },
    { id: 'splice', name: 'Dropout: 128 samples removed mid-sweep', set: { post: 'splice' } },
    { id: 'zeros', name: 'Dropout: 128 samples zero-filled mid-sweep', set: { post: 'zeros' } },
    { id: 'lim', name: 'Soft limiter at the input (peak −1 dBFS, no sample at full scale)', set: { post: 'limiter', level: -1 } },
    { id: 'f44', name: '44.1 kHz sample rate', set: { fs: 44100 } },
  ];
  const LADDERS = [
    { id: 'Plevel', name: 'Phone-like, playback level', base: { speakerHz: 700, direct: 30 }, key: 'level', values: [-12, -24, -30, -36] },
    { id: 'Pnoise', name: 'Phone-like at −24 dBFS, background noise', base: { speakerHz: 700, direct: 30, level: -24 }, key: 'noise', values: [-70, -60, -55] },
  ];

  /* ---------- recordings ---------- */
  const sweeps = {}, irs = {};
  const sweepFor = fs => sweeps[fs] || (sweeps[fs] = (() => { const plan = AN.sweepPlan(fs); return { plan, sweep: AN.makeSweep(plan) }; })());
  function irFor(c) {
    const key = `${c.fs}|${c.speakerHz}|${c.direct}`;
    if (irs[key]) return irs[key];
    let ir = FIX.roomIR({ fs: c.fs, seconds: 2.5, rt: RT, seed: 21, directDb: c.direct });
    const q = DSP.butterworthQ(4);
    ir = DSP.filter(ir, q.map(Q => DSP.rbj('highpass', c.speakerHz, c.fs, Q))); // the speaker's response (LTI: it may filter the IR)
    return (irs[key] = ir);
  }
  const frameDb = (x, a, b) => DSP.dbOf(DSP.meanSquare(x, a, b));

  const POST = {
    agc(x, fs, c) {
      const fr = Math.round(0.01 * fs), y = new Float32Array(x.length);
      // The gain moves smoothly within each 10 ms frame, as a real AGC's does (a jump at each frame boundary would put a
      // click in the recording, which the click check rejects before anything else).
      let g = 0;
      for (let a = 0; a < x.length; a += fr) {
        const b = Math.min(x.length, a + fr), lvl = frameDb(x, a, b), want = Math.min(25, -20 - lvl), g0 = g;
        g = want < g ? Math.max(want, g - 200 * 0.01) : Math.min(want, g + c.rate * 0.01);
        for (let i = a; i < b; i++) y[i] = x[i] * Math.pow(10, (g0 + (g - g0) * (i - a + 1) / (b - a)) / 20);
      }
      return y;
    },
    gate(x, fs, c, plan) {
      const fr = Math.round(0.01 * fs), y = new Float32Array(x.length);
      const pre = [];
      for (let a = Math.round(0.1 * fs); a + fr <= Math.round(0.9 * plan.preRoll * fs); a += fr) pre.push(frameDb(x, a, a + fr));
      const noise = pre.sort((p, q) => p - q)[pre.length >> 1];
      const cut = Math.pow(10, -c.cutDb / 20);
      for (let a = 0; a < x.length; a += fr) {
        const b = Math.min(x.length, a + fr), k = frameDb(x, a, b) > noise + c.gateDb ? 1 : cut;
        for (let i = a; i < b; i++) y[i] = x[i] * k;
      }
      return y;
    },
    splice(x, fs, c, plan) {
      const at = Math.round((plan.preRoll + 2.5) * fs), n = 128, y = new Float32Array(x.length);
      y.set(x.subarray(0, at), 0); y.set(x.subarray(at + n), at);
      y.set(x.subarray(x.length - 2 * n, x.length - n), x.length - n); // keep the length: background at the end
      return y;
    },
    zeros(x, fs, c, plan) { const y = Float32Array.from(x), at = Math.round((plan.preRoll + 2.5) * fs); y.fill(0, at, at + 128); return y; },
    limiter(x) { let pk = 0; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i])); const d = 1.6, s = 0.98 / Math.tanh(d * pk); return x.map(v => s * Math.tanh(d * v)); },
  };

  function measure(set, seed) {
    const c = Object.assign({}, BASE, set), { plan, sweep } = sweepFor(c.fs);
    let rec = FIX.recordSweep({ plan, sweep, ir: irFor(c), latency: 0.05 + 0.01 * (seed % 5), peakDbfs: c.level, noiseDbfs: c.noise, noiseKind: 'pink', seed: 100 + seed });
    if (c.post) rec = POST[c.post](rec, c.fs, c, plan);
    const an = AN.analyseTake(rec, plan, sweep);
    if (an.status !== 'captured') return { failed: an.reason };
    const take = { id: `s${seed}`, takenAt: new Date(0).toISOString(), status: 'captured', settings: {}, plan: Object.assign({}, plan, { levelDb: 0 }), levels: an.levels, analysis: an, warnings: [] };
    const res = PROC.evaluate(take, {});
    return { res, avg: RA.of(res), levels: an.levels, an };
  }

  /* ---------- statistics ---------- */
  const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
  const sd = v => (v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean(v)) ** 2, 0) / (v.length - 1)) : 0);
  function summarise(takes) {
    const ok = takes.filter(t => t.res && t.res.valid);
    const band = B.map(f => {
      const got = ok.map(t => t.res.bands.find(b => b.f === f)).filter(b => b && b.rt60 != null);
      const paths = {}, quality = {}; got.forEach(b => { paths[b.path] = (paths[b.path] || 0) + 1; quality[b.quality] = (quality[b.quality] || 0) + 1; });
      const m = k => { const v = got.map(b => b[k]).filter(x => x != null); return v.length ? mean(v) : null; };
      return { f, n: got.length, mean: got.length ? mean(got.map(b => b.rt60)) : null, sd: got.length ? sd(got.map(b => b.rt60)) : null, paths, quality,
        bgChange: (v => (v.length ? mean(v) : null))(ok.map(t => (t.an.bands.find(b => b.f === f) || {}).backgroundChangeDb).filter(x => x != null)),
        t20: m('t20'), t30: m('t30'), xi: m('xi'), curvature: m('curvature'), cutoff: ok.filter(t => (t.res.bands.find(b => b.f === f) || {}).reason && /cut off/.test(t.res.bands.find(b => b.f === f).reason)).length,
        notes: [...new Set(ok.flatMap(t => (t.res.bands.find(b => b.f === f) || {}).notes || []).map(n => n.split(' (')[0].split(':')[0]))] };
    });
    // The headline (the average of all six bands, RA.SHORT) where the take has one; how many takes had one is reported separately.
    const avgs = ok.filter(t => t.avg.available).map(t => t.avg.value), nb = ok.map(t => (t.avg.available ? t.avg.n : 0));
    // The same bands every take (500–4000 Hz), to separate the room's values from which bands entered the average.
    const fixed = ok.map(t => { const v = t.res.bands.filter(b => b.f >= 500).map(b => b.rt60); return v.every(x => x != null) ? mean(v) : null; }).filter(v => v != null);
    const reasons = [...new Set(takes.filter(t => !(t.res && t.res.valid)).map(t => (t.failed || t.res.reason || '').split('.')[0]))];
    return { takes: takes.length, valid: ok.length, headline: avgs.length, band, avg: avgs.length ? { mean: mean(avgs), sd: sd(avgs), min: Math.min(...avgs), max: Math.max(...avgs) } : null,
      bandsUsed: nb, fixed: fixed.length === ok.length && fixed.length ? { mean: mean(fixed), sd: sd(fixed) } : null, reasons,
      snr: takes.filter(t => t.levels).map(t => t.levels.snrDb) };
  }

  /* ---------- page ---------- */
  const f2 = x => (x == null ? '—' : x.toFixed(2)), f3 = x => (x == null ? '—' : x.toFixed(3)), pct = (x, r) => (x == null || r == null ? '—' : `${x >= r ? '+' : '−'}${Math.abs(100 * (x / r - 1)).toFixed(1)} %`);
  function table(rows, ref) {
    const head = `<tr><th>Condition</th><th>Valid</th>${B.map(f => `<th>${f} Hz</th>`).join('')}<th>Headline ${RA.SHORT} (sd)</th><th>Range</th><th>Headline given</th><th>Avg vs ref</th><th>1 kHz vs ref</th><th>500–4k mean (sd)</th><th>Not valid: reason</th></tr>`;
    const body = rows.map(([name, s]) => {
      const cells = s.band.map(b => (b.n ? `${f2(b.mean)}${b.sd > 0.004 ? ` ±${f3(b.sd)}` : ''}<br><span class="muted">${Object.entries(b.paths).map(([p, k]) => `${p}×${k}`).join(' ')}${b.n < s.valid ? ` · ${s.valid - b.n} none` : ''}</span>` : `<span class="muted">none</span>`));
      const r1k = ref && ref.band[3].mean, s1k = s.band[3].mean;
      return `<tr><td>${name}</td><td class="${s.valid === s.takes ? 'ok' : 'bad'}">${s.valid}/${s.takes}</td>${cells.map(c => `<td>${c}</td>`).join('')}
        <td>${s.avg ? `${f3(s.avg.mean)} (${f3(s.avg.sd)})` : '—'}</td><td>${s.avg ? `${f3(s.avg.min)}–${f3(s.avg.max)}` : '—'}</td><td>${s.headline}/${s.valid}</td>
        <td>${ref && s.avg && ref.avg ? pct(s.avg.mean, ref.avg.mean) : '—'}</td><td>${pct(s1k, r1k)}</td><td>${s.fixed ? `${f3(s.fixed.mean)} (${f3(s.fixed.sd)})` : '—'}</td>
        <td class="muted" style="white-space:normal;max-width:260px;text-align:left">${s.reasons.join('; ')}</td></tr>`;
    }).join('');
    return `<table>${head}${body}</table>`;
  }

  // What the screen would say about each band: quality, T20 and T30 (both, whichever was used), straightness ξ,
  // curvature C, bands cut off, and the notes the processing adds.
  function detail(rows) {
    const head = `<tr><th>Condition</th>${B.map(f => `<th>${f} Hz: quality · T20 / T30 · ξ ‰ · C %</th>`).join('')}</tr>`;
    const body = rows.map(([name, s]) => `<tr><td>${name}</td>${s.band.map(b => `<td style="text-align:left">${b.n ? `${Object.entries(b.quality).map(([q, k]) => `${q}×${k}`).join(' ')}<br>${f2(b.t20)} / ${f2(b.t30)} · ${b.xi == null ? '—' : b.xi.toFixed(1)} · ${b.curvature == null ? '—' : b.curvature.toFixed(1)}` : 'none'}${b.cutoff ? `<br>cut off ×${b.cutoff}` : ''}${b.notes.length ? `<br><span class="muted">${b.notes.join('; ')}</span>` : ''}</td>`).join('')}</tr>`).join('');
    return `<table>${head}${body}</table>`;
  }

  async function runSet(set) {
    const takes = [];
    for (let s = 0; s < REPEATS; s++) { takes.push(measure(set, s)); await tick(); }
    return summarise(takes);
  }

  async function run() {
    const R = window.MOBILE_STUDY = { room: RT, base: BASE, repeats: REPEATS, conditions: {}, ladders: {} };
    for (const c of CONDITIONS) { status(`${c.name}…`); R.conditions[c.id] = Object.assign({ name: c.name, set: c.set }, await runSet(c.set)); }
    const ref = R.conditions.L;
    out.innerHTML = `<h2>One factor at a time (${REPEATS} takes each; room RT60 ${RT.join(' / ')} s at 125 … 4000 Hz)</h2>${table(CONDITIONS.map(c => [c.name, R.conditions[c.id]]), ref)}
      <h2>Band detail (means over the valid takes)</h2>${detail(CONDITIONS.map(c => [c.name, R.conditions[c.id]]))}`;
    for (const L of LADDERS) {
      status(`${L.name}…`);
      R.ladders[L.id] = [];
      for (const v of L.values) R.ladders[L.id].push(Object.assign({ value: v }, await runSet(Object.assign({}, L.base, { [L.key]: v }))));
      out.innerHTML += `<h2>${L.name}</h2>${table(R.ladders[L.id].map(s => [`${L.key} ${s.value}`, s]), ref)}`;
    }
    status('Done');
    document.title = 'Mobile study done';
    return R;
  }
  window.MOBILE_STUDY_DONE = run().catch(e => { status(`Error: ${e.message}`); document.title = 'error'; throw e; });
})();
