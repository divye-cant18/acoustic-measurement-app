/* ProcessingEngine — LIVE. Turns the analysis of a real take (AM.analysis.analyseTake, run when the take ends) into a
   result: per octave band, the calculation the usable decay supports, and whether the value can be trusted.

   Contract:
     STEPS, REQUIRED, SPAN, FACTOR
     evaluate(take, { noise })     -> Result   (pure, synchronous)
     run(take, { onStep, noise })  -> { done: Promise<Result>, cancel() }   steps the evaluation through STEPS for the screen
     details(take, result)         -> one line of evidence per step

   Decision cascade, per band (ISO 3382-2). "Usable decay" is the room's own reverberant decay: from its start, below
   the direct sound and early reflections of the measuring device (analysis.js), down to 10 dB above the noise floor.
   The evaluation ranges are counted from that start.
     usable decay ≥ 45 dB and the decay curve reaches −35 dB  → RT60 from T30 (fit −5…−35 dB, extrapolated × 2)
     else ≥ 35 dB and reaches −25 dB                          → RT60 from T20 (fit −5…−25 dB, extrapolated × 3)
     else                                                      → no RT60 for this band, with the reason
   These are the two evaluation ranges of ISO 3382-2. A 60 dB fit (t60) is still reported for information when the
   decay allows it, but never becomes the RT60: it would make the result depend on the background noise, because a
   quieter take would switch a curved decay to a different part of the curve.
   A band has no value when its decay is cut off (it drops into the background far faster than the room's own decay
   allows: analysis.js, cutoff). A band's value is then rejected when the decay is not straight (ξ = 1000·(1 − r²) above
   50 ‰) or too short for the band filter (bandwidth × RT60 < 4). Quality and confidence come only from these measured properties:
     Good / High    T30, ξ ≤ 10 ‰ and T30 within 10 % of T20 (curvature C = 100·(T30/T20 − 1); the note says whether
                    the decay slows down, C > 10 %, or speeds up, C < −10 %, which points to processing)
     Fair / Medium  T20, or a straightness or curvature warning, or a background that changed since the noise check
   The measurement is valid when the reference band (1000 Hz) has a value. Every other band is reported for what it is.
   When the browser reports that echo cancellation, noise suppression or automatic gain control stayed on during the take,
   no band gets a value: each of them works on the recorded decay itself, so the decay is no longer the room's. */
(function (AM) {
  'use strict';
  const C = AM.analysis.CRITERIA, D = C.decay;

  const REQUIRED = D.required;
  const SPAN = D.ranges;
  const FACTOR = { T60: 1, T30: 2, T20: 3 };
  // Browser processing that works on the recorded signal over time (track settings key, name in the reason).
  const PROCESSING = [['echoCancellation', 'echo cancellation'], ['noiseSuppression', 'noise suppression'], ['autoGainControl', 'automatic gain control']];

  const STEPS = [
    { id: 'received', label: 'Recording received' },
    { id: 'waveform', label: 'Recording checked' },
    { id: 'arrival', label: 'Signal arrival found' },
    { id: 'bands', label: 'Frequency bands analysed' },
    { id: 'decay', label: 'Decay analysed' },
    { id: 'direct', label: 'Direct sound separated' },
    { id: 'noise', label: 'Noise floor checked' },
    { id: 'path', label: 'Calculation path selected' },
    { id: 'rt60', label: 'RT60 calculated' },
    { id: 'validate', label: 'Result validated' },
  ];

  const r3 = x => (x == null ? null : Math.round(x * 1000) / 1000);
  const r1 = x => (x == null ? null : Math.round(x * 10) / 10);

  function decideBand(b) {
    const out = {
      f: b.f, decayRangeDb: b.decayRangeDb, noiseFloorDb: b.noiseFloorDb, peakToNoiseDb: b.peakToNoiseDb, headDb: b.headDb,
      path: null, t20: null, t30: null, t60: null, rt60: null,
      quality: 'Insufficient', confidence: 'None', r2: null, xi: null, curvature: null, fit: null, reason: b.reason || null, notes: [],
      curve: b.curve || null, crossSec: b.crossSec, bandwidth: b.bandwidth, disturbanceDb: b.disturbance ? b.disturbance.db : null,
    };
    if (!b.supported || b.decayRangeDb == null) return Object.assign(out, { quality: b.supported ? 'Insufficient' : 'Not measured' });
    // Recurring sounds in the take's own background (analysis.js, disturbance) act as a noise floor that comes and goes:
    // the evaluation range has to end 10 dB above them as well, so the usable decay is counted from their level.
    const dist = b.disturbance, R = b.decayRangeDb - (dist ? dist.db : 0), fits = b.fits || {};
    const usable = name => R >= REQUIRED[name] && fits[name];
    out.t20 = usable('T20') ? r3(fits.T20.T) : null;
    out.t30 = usable('T30') ? r3(fits.T30.T) : null;
    out.t60 = usable('T60') ? r3(fits.T60.T) : null;
    if (b.cutoff) {
      out.reason = `The decay is cut off ${Math.round(b.cutoff.atSec * 1000)} ms after the arrival: it drops ${Math.round(b.cutoff.dropDb)} dB into the background within 40 ms, far faster than the room's own decay. A noise gate or noise suppression in the device or the system, or a gap in the recording, cut the sound off, so this is not the room's decay.`;
      return out;
    }
    out.path = usable('T30') ? 'T30' : usable('T20') ? 'T20' : null;
    if (!out.path) {
      out.reason = dist && b.decayRangeDb >= REQUIRED.T20
        ? `Sounds during the take, such as voices, knocks or movement, rose ${Math.round(dist.db)} dB above the background in this band (${dist.events} times). Counted as the noise floor, they leave ${Math.max(0, Math.round(R))} dB of the room's own decay; T20 needs ${REQUIRED.T20} dB. Measure again while the room is quiet.`
        : b.decayRangeDb < REQUIRED.T20
          ? `Only ${Math.round(b.decayRangeDb)} dB of the room's own decay above the noise floor${b.headDb >= 3 ? ` (after the direct sound, which lies ${Math.round(b.headDb)} dB above it)` : ''}. T20 needs ${REQUIRED.T20} dB.`
          : 'The room\'s decay did not reach −25 dB before the noise floor.';
      return out;
    }
    const fit = out.fit = fits[out.path];
    out.r2 = fit.r2;
    out.xi = r1(1000 * (1 - fit.r2));
    const rt = fit.T, bt = rt * b.bandwidth;
    if (bt < D.minBT) { out.path = null; out.reason = `The decay is too short to measure in this band (bandwidth × RT60 = ${bt.toFixed(1)}, at least ${D.minBT} needed).`; return out; }
    if (out.xi > D.xi.fail) { out.path = null; out.reason = `The decay is not a straight line (non-linearity ${out.xi} ‰). The room or the recording does not give a single reverberation time here.`; return out; }
    out.rt60 = r3(rt);
    if (out.t20 != null && out.t30 != null) out.curvature = r1(100 * (out.t30 / out.t20 - 1));
    if (out.xi > D.xi.warn) out.notes.push(`Decay not perfectly straight (non-linearity ${out.xi} ‰).`);
    if (dist) out.notes.push(`Sounds during the take rose ${Math.round(dist.db)} dB above the background in this band; the evaluation still ends 10 dB above them.`);
    // A room's decay is a sum of decaying modes, so it can only flatten with time (T30 ≥ T20, apart from small random
    // scatter). One that steepens towards its end points to something cutting it off.
    if (out.curvature != null && out.curvature > D.curvature) out.notes.push(`T30 is ${out.curvature} % longer than T20: the decay slows down towards its end (a curved decay, as in rooms with uneven absorption or coupled spaces).`);
    if (out.curvature != null && out.curvature < -D.curvature) out.notes.push(`T30 is ${-out.curvature} % shorter than T20: the decay speeds up towards its end, which a room's own decay does not do. Noise suppression or a noise gate in the device or the system may be cutting the end of the decay.`);
    const good = out.path !== 'T20' && !out.notes.length;
    out.quality = good ? 'Good' : 'Fair';
    out.confidence = good ? 'High' : 'Medium';
    return out;
  }

  function evaluate(take, ctx = {}) {
    const base = {
      valid: false, status: 'invalid', reason: null, referenceBand: AM.demo.REFERENCE_BAND, bands: [], headline: null,
      issues: [], warnings: [], recordingId: take.id, takenAt: take.takenAt, processedAt: new Date().toISOString(), engine: 'live',
      meta: {
        deviceLabel: take.deviceLabel, sampleRate: take.sampleRate, settings: take.settings, tap: take.tap, plan: take.plan, levels: take.levels,
        deviceKind: take.deviceKind || null, outputLabel: take.outputLabel || null, position: take.position || null,
        latencySec: take.analysis && take.analysis.latencySec, arrivalClarityDb: take.analysis && take.analysis.arrivalClarityDb,
        irSeconds: take.analysis && take.analysis.irSeconds, distortion: (take.analysis && take.analysis.distortion) || null,
        noiseCheck: ctx.noise ? { leqDbfs: ctx.noise.leqDbfs, takenAt: ctx.noise.takenAt, status: ctx.noise.status } : null,
      },
    };
    if (take.status !== 'captured' || !take.analysis) return Object.assign(base, { reason: take.reason || 'The take could not be used.' });

    const bands = take.analysis.bands.map(decideBand);
    // Browser processing that stayed on (as the browser itself reports it) alters the decay: no band value is given.
    const altered = PROCESSING.filter(([k]) => take.settings && take.settings[k] === true).map(([, name]) => name);
    if (altered.length) {
      const why = `The browser kept ${altered.join(' and ')} on during the take. ${altered.length > 1 ? 'They change' : 'It changes'} the recorded decay, so it is not the room's own.`;
      bands.forEach(b => { if (b.rt60 != null) Object.assign(b, { rt60: null, path: null, quality: 'Insufficient', confidence: 'None', notes: [], reason: why }); });
      return Object.assign(base, {
        bands, status: 'invalid', warnings: (take.warnings || []).slice(),
        reason: `${why} Measure with a browser that lets the page switch it off (Chrome, Edge or Firefox on a computer), with no system microphone effects such as noise suppression or voice focus.`,
        issues: bands.map(b => `${b.f} Hz: ${b.reason}`),
      });
    }
    const ref = bands.find(b => b.f === base.referenceBand);
    const warnings = (take.warnings || []).slice();
    if (warnings.length) bands.forEach(b => { if (b.confidence === 'High') { b.confidence = 'Medium'; b.quality = 'Fair'; } });
    // How the background during the take compares with the noise check: information only. Each band is judged on the
    // take's own noise floor and background, so a background that changed since the check costs no confidence.
    if (ctx.noise && take.levels && ctx.noise.leqDbfs != null) base.meta.backgroundChangeDb = r1(take.levels.preRollDbfs - ctx.noise.leqDbfs);
    const valid = !!ref && ref.rt60 != null;
    Object.assign(base, {
      valid, bands, warnings,
      status: valid ? (warnings.length || ref.notes.length ? 'warning' : 'valid') : 'invalid',
      reason: valid ? null : `At ${base.referenceBand} Hz: ${ref ? ref.reason : 'not measured'}`,
      issues: bands.filter(b => b.rt60 == null).map(b => `${b.f} Hz: ${b.reason}`),
      headline: valid ? { f: ref.f, rt60: ref.rt60, method: ref.path, quality: ref.quality, confidence: ref.confidence } : null,
    });
    return base;
  }

  const fmtDb = x => (x == null ? '—' : `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)} dB`);
  const levelText = db => (!db ? '0 dB (default)' : `${db > 0 ? '+' : '−'}${Math.abs(db)} dB`);
  function details(take, res) {
    const ref = res.bands.find(b => b.f === res.referenceBand) || {}, lv = take.levels || {}, n = res.bands.filter(b => b.rt60 != null).length;
    const pathNote = { T60: 'full 60 dB fit', T30: '30 dB fit × 2', T20: '20 dB fit × 3' };
    const plan = take.plan || {}, an = take.analysis || {};
    const head = ref.headDb;
    return [
      `${(plan.total || 0).toFixed(1)} s at ${(take.sampleRate || 0) / 1000} kHz from ${take.deviceLabel || 'the microphone'} · sweep level ${levelText(plan.levelDb)}`,
      `Peak ${fmtDb(lv.peakDbfs)}FS, no clipping · signal ${fmtDb(lv.snrDb)} above the background before it`
        + (an.distortion ? ` · distortion: 2nd harmonic ${an.distortion.h2Db == null ? 'not found' : fmtDb(an.distortion.h2Db)}, 3rd ${an.distortion.h3Db == null ? 'not found' : fmtDb(an.distortion.h3Db)} against the main response` : ''),
      an.latencySec != null ? `Arrived ${(an.latencySec * 1000).toFixed(0)} ms after playback started (playback-to-recording delay of this device, read from the recording), ${Math.round(an.arrivalClarityDb)} dB clear of the response before it` : 'Arrival not found',
      `${res.bands.filter(b => b.decayRangeDb != null).length} of ${res.bands.length} octave bands analysed (125 Hz to 4000 Hz), 6th-order Butterworth band filters, time-reversed`,
      `Impulse response by sweep deconvolution (${an.irSeconds || 0} s); Schroeder backward integration per band`,
      head == null ? `${ref.f || res.referenceBand} Hz: too little decay to separate the room from the direct sound`
        : head >= 3 ? `${ref.f} Hz: direct sound and early reflections ${head.toFixed(1)} dB above the room's reverberant decay; evaluated from the decay's start, below them`
        : `${ref.f} Hz: no dominant direct sound (${head.toFixed(1)} dB); evaluated from the start of the decay`,
      (ref.decayRangeDb != null ? `Noise floor ${Math.abs(ref.noiseFloorDb).toFixed(1)} dB below the peak at ${ref.f} Hz (Lundeby): ${Math.round(ref.decayRangeDb)} dB of the room's own decay usable` : `No usable decay at ${res.referenceBand} Hz`)
        + (ref.disturbanceDb ? `; sounds during the take ${Math.round(ref.disturbanceDb)} dB above the background, counted as the noise floor` : '; no sounds above the background during the take')
        + (res.meta && res.meta.backgroundChangeDb != null && Math.abs(res.meta.backgroundChangeDb) >= 3 ? `; background ${Math.abs(res.meta.backgroundChangeDb).toFixed(0)} dB ${res.meta.backgroundChangeDb > 0 ? 'louder' : 'quieter'} than in the noise check (information)` : ''),
      ref.path ? `${ref.f} Hz uses ${ref.path} (${pathNote[ref.path]})` : `${res.referenceBand} Hz: no valid path`,
      res.valid ? `RT60 ${ref.rt60.toFixed(2)} s at ${ref.f} Hz (r² ${ref.r2.toFixed(4)})` : 'Unable to obtain a reliable RT60 measurement: not calculated',
      res.valid ? `${n} of ${res.bands.length} bands reliable, ${res.headline.confidence.toLowerCase()} confidence at ${ref.f} Hz` : 'Measurement insufficient',
    ];
  }

  // The evaluation is immediate; the steps are shown one after another so the user can follow what was checked.
  function run(take, { onStep, noise, stepMs = 220 } = {}) {
    const result = evaluate(take, { noise });
    let i = 0, timer = 0, cancelled = false, resolveDone, rejectDone;
    const done = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });
    const tick = () => {
      if (cancelled) return;
      if (i >= STEPS.length) { resolveDone(result); return; }
      if (onStep) onStep(i, STEPS[i]);
      i++;
      timer = setTimeout(tick, stepMs);
    };
    timer = setTimeout(tick, 100);
    return { done, cancel() { if (cancelled) return; cancelled = true; clearTimeout(timer); rejectDone(new Error('cancelled')); } };
  }

  AM.services.processing = { kind: 'live', STEPS, REQUIRED, SPAN, FACTOR, evaluate, run, details, decideBand };
})(window.AM);
