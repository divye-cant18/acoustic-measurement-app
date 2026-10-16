/* Acoustic analysis of real recordings. Pure functions: captured samples in, numbers and the evidence behind them out.
   Nothing here generates, assumes or substitutes a measured value. When the data cannot support a value, the value is
   null and a reason says why.

   Levels are relative input levels in dBFS (decibels below digital full scale). They are not sound pressure levels:
   no microphone calibration exists (see calibration in services/measurement.js).

   analyseNoise(samples, fs)          background noise: is the room suitable, and what may cost a take
     125 ms frame levels ("fast"), Leq, L10/L50/L90, spread, change between the first and last third, clipping, octave-band
     Leq. The verdict uses the bands RT60 is measured in (88 Hz–5.7 kHz): sounds (the loudest moment above the median, in
     any octave band) and a changing level give a caution; only a silent or overloaded input has to be measured again.
   sweepPlan(fs) / makeSweep(plan)    exponential sine sweep and its inverse filter (Farina 2000, ISO 18233)
   analyseTake(recording, plan, sweep)
     1. raw recording checks: complete, not silent, not clipped, sweep clearly above the pre-roll noise
     2. deconvolution: recording ∗ inverse sweep → impulse response; the arrival time (the device's playback-to-recording
        delay) is found from the response peak, never assumed, and must stand clearly above the response before it
     3. onset: first point within 10 ms before the peak whose energy is within 20 dB of the peak (ISO 3382-1)
     4. per octave band: time-reversed band filtering; squared response; noise floor and truncation point by Lundeby's
        iterative method (Lundeby et al. 1995); Schroeder backward integration of the squared response minus that
        noise floor, up to the truncation point, with the energy of the extrapolated (noise-free) tail added
        (ISO 3382-2 allows combining truncation, tail correction and noise subtraction); then the four parts of the
        response are told apart (below); least-squares fits of the room's decay over −5…−25 dB (T20), −5…−35 dB (T30)
        and −5…−65 dB (T60, for information only), each with r².
   Whether T30 or T20 is used, and whether a band is reliable, is decided in services/processing.js.
   A take is rejected before any band is analysed when the recording is corrupted (samples that are not numbers),
   incomplete, silent, clipped, too quiet in the RT60 bands, has no clear arrival, has a gap (a run of identical
   samples, which is how a browser fills audio it failed to deliver) during the test signal, has a click (the jump a lost
   or repeated block of samples leaves, read above the sweep: aboveSweep), or is not continuous (samples dropped or
   inserted shift the sweep's own timing: sweepTiming): each spreads through the whole impulse response. aboveSweep also
   reads the input level while the sweep played against before it (processing.js decides on it).
   After the bands, the take's own background (before the sweep, and after every decay has ended) is read band by band
   for recurring sounds (CRITERIA.take.disturbance); processing.js counts them as noise.

   One device is both the source and the receiver: its speaker plays the sweep and its microphone, a few centimetres
   away, records the room. The direct sound therefore reaches the microphone far louder than the room's reverberation
   (typically 10–30 dB), and a standard evaluation that starts 5 dB below the total energy would start inside the direct
   sound. Each band's response is therefore read as four parts, all from the recording:
     direct sound and early reflections   the energy that arrives above the room's reverberant decay (headDb), never
                                           more than the energy of the first CRITERIA.decay.directWindow (5 ms) after
                                           the arrival: the device's direct sound and its nearest reflections arrive
                                           within that time, so a larger excess is the room's own fast early decay
                                           (a curved, double-slope decay) and stays in the evaluation, as in ISO 3382-2
     reverberant decay                     the straight part of the decay curve, found by fitting below the early part
                                           and extrapolating back to the arrival; when the direct sound adds more than
                                           CRITERIA.decay.directAllowanceDb to the curve's start, the evaluation ranges
                                           move down by the excess, so they measure the room and not the device
     background noise                      the level the decay sinks into (Lundeby), with the 10 dB margin above it
   Nothing about the device (speaker-to-microphone distance, delay) is assumed. Without a dominant direct sound headDb
   is close to 0 and the evaluation is the usual ISO 3382-2 one. */
(function (AM) {
  'use strict';
  const DSP = AM.dsp, BANDS = AM.demo.BANDS;

  /* Measurement criteria. Thresholds and method settings, not measured values. */
  const CRITERIA = {
    noise: {
      seconds: 5,          // measurement window
      settle: 0.3,         // discarded at the start while the input settles
      frame: 0.125,        // short-term level frames ("fast" time weighting)
      silenceDbfs: -110,   // below this nothing is reaching the input (muted, switched off, blocked)
      // Steadiness is judged on the frequencies RT60 is measured in: the octave bands 125–4000 Hz, edge to edge. Below
      // them, room noise is mostly ventilation rumble, whose 125 ms levels scatter by 3–6 dB at random even when it is
      // perfectly steady, and which no RT60 band hears; judged broadband, it hid speech and flagged harmless changes.
      band: [88.4, 5657],
      highDbfs: -30,       // a usual level (median, in the bands) this loud leaves little room below full scale for the test signal
      // Caution, never a stop: the take checks its own background (CRITERIA.take.disturbance), so these only say what
      // may cost a take. The noise study (tests/noise-study.html) found a level fluctuating ±3 dB (L10 − L90 up to
      // 11 dB) or falling by 6 dB harmless, and speech-like sounds 15 dB above the background the real risk.
      soundDb: 10,         // loudest 125 ms above the median around it (±1 s), in any octave band: speech, knocks, doors
      changeDb: 6,         // last third against first third: ventilation switching, traffic building up
    },
    take: {
      preRoll: 1.0,        // s recorded before the sweep starts: the background during the take
      sweepSeconds: 5,     // sweep length
      tail: 4.0,           // s recorded after the sweep ends: room for the decay and for the noise floor after it
      f1: 50,              // sweep start frequency, Hz
      f2: 10000,           // sweep end frequency, Hz, limited to 45 % of the sample rate
      nyquistShare: 0.45,
      amplitude: 0.7,      // digital peak of the sweep at the default level (−3.1 dBFS); loudness is set with the device volume
      // Sweep level: the user's playback level relative to that default, in dB of digital amplitude (gain 10^(dB/20)),
      // applied once, to the played copy of the sweep (playbackSignal). Not sound pressure: the device and its volume
      // decide that. The highest level is the highest step whose peak stays at or below maxPeak (0.7 → +3 dB, peak 0.989,
      // −0.1 dBFS; +6 dB would clip). The lowest: each 3 dB down costs 3 dB of usable decay, and below −12 dB a take
      // rarely keeps enough of it (tests/sweep-study.html: about 41 dB usable at 1 kHz in a typical room); the device
      // volume is the control for more than that.
      level: { stepDb: 3, minDb: -12, maxDb: 3, maxPeak: 0.99 },
      // Distortion products (see distortion()) this close to the main response are mentioned: the sweep keeps them out
      // of the decay, but they cost usable decay (a 3rd harmonic read at −14 dB cost about 4 dB in tests/validation.html).
      distortionNoteDb: -20,
      // A long, gentle start: an abrupt start at f1 leaves a slowly fading artefact in the impulse response that a
      // strong direct sound (speaker and microphone on one device) lifts into the decay range of the 125 Hz band.
      fadeIn: 0.3, fadeOut: 0.01,
      clipLevel: 0.999,    // a recorded sample at or above this is treated as clipped
      minSweepSnrDb: 10,   // recording level during the sweep above the pre-roll background
      maxLatency: 1.0,     // s; a sweep arriving later than this is not accepted as the played signal
      minArrivalDb: 20,    // the response peak must stand this far above the response before it, or the arrival is unclear
      onsetDb: 20, onsetWindow: 0.01, preOnset: 0.1, guard: 0.05,
      // Gaps: a run of identical samples this long (s) during the test signal. A browser that fails to deliver audio
      // fills the missing render blocks (128 samples: 1.3–2.9 ms) with zeros; a real microphone signal never holds one
      // value for 1 ms. Checked from the end of the fade-in (plus margin) to just before the sweep ends.
      gapSeconds: 0.001, gapSkip: [0.35, 0.02],
      // Continuity of the recording while the sweep played (sweepTiming). Samples a browser or device drops without
      // filling them in (or inserts) shift everything recorded after them, which no level check sees; the sweep's own
      // timing does: each half-octave of it, matched against the recording, must arrive at the same moment. Steps
      // between neighbouring half-octaves of intact synthetic takes stay ≤ 2.2 ms (speaker high-pass group delay and a
      // desk reflection included); losing 256 or 480 samples gives 4.2–15 ms (tests/audio-config.html). Below `fromHz`
      // the sweep's own timing is too coarse to check, and segments whose match stands less than `minClarityDb` above
      // its surroundings are skipped.
      // The check needs the device's direct sound to time each segment by: the largest headDb of any band at least
      // minHeadDb (one device: 13–25 dB; a microphone far from the source: below 1 dB; a weak direct sound: about 3 dB).
      timing: { fromHz: 200, ratio: Math.SQRT2, searchMs: 15, minClarityDb: 8, maxStepMs: 3.5, minHeadDb: 6 },
      // Clicks (aboveSweep). Where samples are dropped or repeated, the waveform jumps: a click, whose energy reaches
      // every frequency. The sweep, its reverberation and its harmonics stay at and below a few multiples of the
      // frequency playing at that moment, so above it, between its harmonics, the recording holds only the background:
      // a click stands out there, whatever its timing does. It is also what does the damage: deconvolved, a click
      // spreads into the decay of every band swept before it (one 128-sample loss read the 500–2000 Hz average up to
      // 76 % long in tests/audio-config.html), while a loss at a point where the waveform happens to join smoothly is
      // harmless and shows no click. Frames of `frame` s (Blackman–Harris), a quarter frame apart; per frame, the level
      // in the bins from the sweep's frequency + `margin` bins up to min(maxHz, nyquistShare·fs), leaving out ±margin bins
      // around its 2nd to `harmonics`-th harmonic, against the same bins before the sweep. A click: a frame `db` above
      // both the median of the frames before it and that of the frames after it (`context` s each side, the closest
      // `guard` frames left out; the edge of a sound that stops abruptly stands above one side only), that falls back by
      // `sharpDb` within the next frames and rose by as much from the ones before (a sound in the room rings on), with
      // fewer than `events` other such peaks within ±context (a buzzing speaker clicks every period), standing
      // `scatterK` times the frames' own scatter above them where they scatter (a heavily distorted sweep), and
      // broadband: the
      // median bin `broadDb` above its surroundings too (a harmonic folded back from above half the sample rate by a
      // digital limiter is a tone: it raises a few bins only). A playback chain that clips fills the band with the
      // sweep's harmonics (its median bin `coarseDb` or more above the background while the sweep plays; −1.6 dB when
      // clean, 3–15 dB in the synthetic clipping and buzz models): smaller losses then pass unseen, and processing.js
      // says so. Read from `from` s into the
      // sweep (clicks before it reach no band's decay) to `tail` s after it. Intact synthetic takes stay below 4 dB;
      // the losses that changed a result gave 9–58 dB.
      clicks: { frame: 0.005, from: 0.45, tail: 1.0, minHz: 1000, maxHz: 20000, margin: 4.5, harmonics: 6, minBins: 8, context: 0.04, guard: 4, db: 8, scatterK: 5, sharpDb: 6, broadDb: 3, events: 3, coarseDb: 3 },
      // The input level while the sweep played (aboveSweep, the bins above its 7.5th harmonic, from `from` s): the
      // background there against the same bins before the sweep. Nothing in the room makes the background quieter
      // while the test signal plays; automatic gain or a suppressor turning the input down does. From failDb lower the
      // take is not valid, from warnDb it costs confidence (processing.js), as levelChange.
      sweepGain: { above: 7.5, from: 0.3, warnDb: 3, failDb: 6, minFrames: 100 },
      // Sounds during the take (voices, knocks, movement), read band by band from the take's own background: the second
      // before the sweep and the recording after every decay has reached the noise. Frames of max(frame, 8 / bandwidth)
      // seconds; a sound is a run of frames at least `db` above the median. Recurring (at least `events` of them), they
      // were most likely also there while the sweep played, where they cannot be seen, and in the decay they act as a
      // noise floor that comes and goes: processing.js then requires the usable decay above them.
      disturbance: { frame: 0.05, db: 10, events: 2, maxSeconds: 2 },
      // The background after the decay against before the sweep, the same in every band (processing.js): a change of
      // input gain during the take (automatic gain the browser does not report: +9…+12 dB in tests/mobile-study.html,
      // ±0.3 dB without it) or a background that changed. From failDb the take is not valid (the noise check's own
      // change criterion, 6 dB); from warnDb it costs confidence. Needs at least minBands bands to tell.
      levelChange: { warnDb: 3, failDb: 6, minBands: 4 },
    },
    decay: {
      // Usable decay of the room's reverberation (from its start, below the direct sound, to the noise floor):
      // evaluation range + 5 dB start + 10 dB above noise.
      required: { T60: 75, T30: 45, T20: 35 },
      ranges: { T20: [5, 25], T30: [5, 35], T60: [5, 65] },
      // At the smallest source-to-microphone distance ISO 3382-2 allows (2·√(V/cT), about twice the critical distance)
      // the direct sound adds about 1 dB to the start of the decay curve. Up to that the evaluation is the standard one;
      // a stronger direct sound (one device) moves the ranges down by the excess, so they start where they would at
      // that distance.
      directAllowanceDb: 1,
      // The direct sound of one device (speaker and microphone a few centimetres apart) and the reflection from the
      // surface it lies on arrive within this time (s) of the arrival. What the decay curve loses in it caps headDb.
      directWindow: 0.005,
      envWindow: 0.01,     // 10 ms energy averaging for the peak-to-noise ratio
      // Cut-off decay: the energy of `before` 10 ms frames, at least aboveNoiseDb above the background, against the next
      // `after` frames, within nearNoiseDb of it, falls excessDb more than the room's own decay does over that time.
      // The first frame (the direct sound) is never part of `before`.
      cutoff: { before: 3, after: 5, aboveNoiseDb: 15, nearNoiseDb: 6, excessDb: 15 },
      xi: { warn: 10, fail: 50 },                  // non-linearity ξ = 1000·(1 − r²), per mille (ISO 3382-2 annex B)
      curvature: 10,       // C = 100·(T30/T20 − 1), percent (ISO 3382-2)
      minBT: 4,            // bandwidth × RT60 below this the band filter limits the result (time-reversed filtering)
    },
  };

  const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
  const peakDb = a => 20 * Math.log10(Math.max(a, 1e-10));
  // Units: every level here is dBFS = 10·log10(mean square), relative to a digital full scale of ±1 (a full-scale sine
  // reads −3.0 dBFS). Never sound pressure: no microphone is calibrated.

  // The first sample that is not a finite number, or −1. A browser that delivers corrupted audio can produce NaN or
  // Infinity; no level, threshold or fit computed from such a buffer means anything.
  function firstNonFinite(x) { for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return i; return -1; }
  // The bands RT60 is measured in (125–4000 Hz, edge to edge), as one filter: no DC offset, no rumble below them and
  // no hiss above them, so a level read through it is what those bands hear.
  const inBandSections = fs => { const b = CRITERIA.noise.band, q = DSP.butterworthQ(6); return [...q.map(Q => DSP.rbj('highpass', b[0], fs, Q)), ...q.map(Q => DSP.rbj('lowpass', b[1], fs, Q))]; };
  // DC offset (mean) of x[a…b), dBFS of its magnitude: diagnostic only.
  function dcDbfs(x, a, b) { let s = 0; for (let i = a; i < b; i++) s += x[i]; return r1(peakDb(Math.abs(s / Math.max(1, b - a)))); }
  const pct = (sorted, p) => { const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
  const energyMeanDb = dbs => DSP.dbOf(dbs.reduce((s, d) => s + Math.pow(10, d / 10), 0) / dbs.length);

  // Least-squares line y = intercept + slope·t over indices i0…i1 (inclusive), every `step`-th point.
  function regress(tOf, yOf, i0, i1, step = 1) {
    let n = 0, st = 0, sy = 0, stt = 0, sty = 0, syy = 0;
    for (let i = i0; i <= i1; i += step) { const t = tOf(i), y = yOf(i); n++; st += t; sy += y; stt += t * t; sty += t * y; syy += y * y; }
    if (n < 3) return null;
    const vt = stt - st * st / n, vy = syy - sy * sy / n, cov = sty - st * sy / n;
    if (vt <= 0) return null;
    const slope = cov / vt;
    return { slope, intercept: (sy - slope * st) / n, r2: vy > 0 ? (cov * cov) / (vt * vy) : 1, n };
  }

  // Peak magnitude per bin, for drawing the recording.
  function waveform(x, bins = 240) {
    const out = [], step = x.length / bins;
    for (let j = 0; j < bins; j++) {
      let m = 0;
      for (let i = Math.floor(j * step), e = Math.floor((j + 1) * step); i < e; i++) { const a = Math.abs(x[i]); if (a > m) m = a; }
      out.push(Math.round(m * 10000) / 10000);
    }
    return out;
  }

  /* ---------- background noise ---------- */
  // 125 ms frame levels of x[a0…a0 + n·fr), and the steadiness figures drawn from them. `sound` is the loudest frame
  // above the median of the frames around it (±8, about ±1 s): a short sound stands out, a level that changes and stays
  // does not (that is `drift`).
  function frameStats(x, a0, fr, n) {
    const frames = [];
    for (let k = 0; k < n; k++) frames.push(DSP.dbOf(DSP.meanSquare(x, a0 + k * fr, a0 + (k + 1) * fr)));
    const sorted = frames.slice().sort((a, b) => a - b), third = Math.max(1, Math.floor(n / 3));
    let sound = -Infinity;
    for (let k = 0; k < n; k++) sound = Math.max(sound, frames[k] - pct(frames.slice(Math.max(0, k - 8), k + 9).sort((a, b) => a - b), 0.5));
    return {
      frames, leq: DSP.dbOf(DSP.meanSquare(x, a0, a0 + n * fr)), l90: pct(sorted, 0.1), l50: pct(sorted, 0.5), l10: pct(sorted, 0.9),
      spread: pct(sorted, 0.9) - pct(sorted, 0.1), jump: sorted[sorted.length - 1] - pct(sorted, 0.1), sound,
      drift: energyMeanDb(frames.slice(-third)) - energyMeanDb(frames.slice(0, third)),
    };
  }

  /* Status: valid (suitable) · warning (suitable, with a caution and what to do) · unassessed (the input is digitally
     silent, so the room cannot be assessed: a muted microphone and a device that silences a quiet room look the same;
     the take checks its own recording) · invalid (measure again: too short, corrupted or overloaded).
     The verdict is read in the RT60 bands (inBand). The unfiltered figures have the DC offset removed first: a
     microphone's constant offset is not sound, but left in, it made a quiet room read up to 44 dB "louder"
     (tests/audio-config.html). dcDbfs reports that offset. */
  function analyseNoise(x, fs) {
    const c = CRITERIA.noise, a0 = Math.round(c.settle * fs), fr = Math.round(c.frame * fs);
    const res = {
      status: 'invalid', reasons: [], warnings: [], sampleRate: fs, seconds: 0, unit: 'dBFS',
      leqDbfs: null, l10: null, l50: null, l90: null, spreadDb: null, jumpDb: null, driftDb: null, inBand: null,
      peakDbfs: null, dcDbfs: null, clippedSamples: 0, frames: [], bands: [],
    };
    const nFrames = Math.floor((x.length - a0) / fr);
    if (nFrames < 8) { res.reasons.push('The recording was too short to measure the background noise. Measure it again.'); return res; }
    const end = a0 + nFrames * fr;
    res.seconds = r1((end - a0) / fs);
    const bad = firstNonFinite(x.subarray(0, end));
    if (bad >= 0) { res.reasons.push(`The recording is corrupted: the browser delivered invalid samples (not numbers) ${r1(bad / fs)} s into it, so no level can be read from it. Measure the background again; if it happens again, reload the page.`); return res; }

    let peak = 0, clipped = 0, sum = 0;
    for (let i = a0; i < end; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; if (a >= CRITERIA.take.clipLevel) clipped++; sum += x[i]; }
    const mean = sum / (end - a0), xb = new Float32Array(end);
    for (let i = a0; i < end; i++) xb[i] = x[i] - mean;
    res.dcDbfs = r1(peakDb(Math.abs(mean)));
    // Unfiltered (DC removed): the level as the input receives it. In the bands: what the RT60 bands hear, which the
    // verdict uses.
    const bb = frameStats(xb, a0, fr, nFrames);
    const inBand = DSP.filter(x.subarray(0, end), inBandSections(fs));
    const ib = frameStats(inBand, a0, fr, nFrames);
    const leq = bb.leq;

    // Octave-band background, from the same samples (filters settle within the discarded start). Sounds are judged per
    // band: a voice stands 14–17 dB above the background in its own bands, while a level that only fluctuates moves
    // every band alike by 5–7 dB (tests/noise-study.html).
    res.bands = BANDS.map(f => {
      const b = DSP.octaveBand(f, fs);
      if (b.hi >= CRITERIA.take.nyquistShare * fs) return { f, leqDbfs: null, soundDb: null };
      const st = frameStats(DSP.filter(x.subarray(0, end), b.sections), a0, fr, nFrames);
      return { f, leqDbfs: r1(st.leq), soundDb: r1(st.sound) };
    });
    const loudest = res.bands.filter(b => b.soundDb != null).sort((p, q) => q.soundDb - p.soundDb)[0];
    Object.assign(res, {
      leqDbfs: r1(bb.leq), l90: r1(bb.l90), l50: r1(bb.l50), l10: r1(bb.l10), spreadDb: r1(bb.spread), jumpDb: r1(bb.jump), driftDb: r1(bb.drift),
      peakDbfs: r1(peakDb(peak)), clippedSamples: clipped, frames: bb.frames.map(r1),
      inBand: { leqDbfs: r1(ib.leq), l50: r1(ib.l50), spreadDb: r1(ib.spread), driftDb: r1(ib.drift), soundDb: loudest ? loudest.soundDb : null, soundBand: loudest ? loudest.f : null, frames: ib.frames.map(r1) },
    });

    // Verdict. A digital level is all this check has: it cannot tell the room's noise from the microphone's own noise,
    // or from what the device's processing (gain, noise suppression) did to either. Each caution says so and gives the
    // next step; none blames the room for what the input chain may have done.
    const R = res.reasons, Wn = res.warnings, I = res.inBand;
    if (clipped) R.push(`The input was overloaded (${clipped} samples at full scale). Move away from the noise source or lower the input level in the system's sound settings, then measure the background again.`);
    const silent = peak < 1e-6 || I.leqDbfs < c.silenceDbfs;
    if (!R.length && silent) {
      res.status = 'unassessed';
      Wn.push(`Unable to assess the background: no signal reached the input in the RT60 bands (${I.leqDbfs <= -199 ? 'complete silence' : `${AM.util.fmt.dbfs(I.leqDbfs)}, quieter than ${AM.util.fmt.dbfs(c.silenceDbfs, 0)}`}). A working microphone always picks up some noise, so either the microphone is muted, switched off or covered, or the device's noise suppression silences a quiet room. Speak near the device: if the level meter does not move, check the microphone and its settings. If it does, you can measure; the take checks its own recording.`);
      return res;
    }
    if (!R.length) {
      if (I.soundDb > c.soundDb) Wn.push(`Sounds such as voices, knocks or a door rose ${Math.round(I.soundDb)} dB above the background (${I.soundBand} Hz band). Keep the room quiet during the take; if they happen again, the take will show it and say so.`);
      if (Math.abs(I.driftDb) > c.changeDb) Wn.push(`The level in the RT60 bands ${I.driftDb > 0 ? 'rose' : 'fell'} by ${Math.abs(I.driftDb).toFixed(1)} dB during the check. This can be the room (for example ventilation switching ${I.driftDb > 0 ? 'on' : 'off'}) or the device adjusting its input level by itself (automatic gain). Measure again while it stays steady. If it keeps changing in a quiet room, switch off microphone enhancements or automatic gain in the system's sound settings.`);
      // The usual level (median), so passing sounds already named above do not also make the background "high".
      if (I.l50 > c.highDbfs) Wn.push(`Recording background noise is high: usually ${AM.util.fmt.dbfs(I.l50)} in the RT60 bands (below the loudest level the microphone can record; not the room's real loudness). This can be room noise, or a quiet room raised by a high input level or automatic gain; this check cannot tell which. It leaves less room for the test signal above it. If the room is noisy, reduce the noise; if it is quiet, lower the input level or switch off microphone enhancements in the system's sound settings, then measure the background again. The take checks its own signal and decay either way.`);
    }
    res.status = R.length ? 'invalid' : Wn.length ? 'warning' : 'valid';
    return res;
  }

  /* ---------- test signal ---------- */
  // The sweep levels a user can choose: { min, max, step, default }. The top is the highest step that keeps the played
  // peak within maxPeak, so a change to the default amplitude can never make a level clip.
  function levelRange() {
    const c = CRITERIA.take.level, head = 20 * Math.log10(c.maxPeak / CRITERIA.take.amplitude);
    return { min: c.minDb, max: Math.min(c.maxDb, Math.floor(head / c.stepDb + 1e-9) * c.stepDb), step: c.stepDb, default: 0 };
  }
  // A valid sweep level from anything stored or typed: a number, on the step, within the range; otherwise the default.
  function sweepLevel(db) {
    const r = levelRange();
    if (typeof db !== 'number' || !isFinite(db)) return r.default;
    return Math.min(r.max, Math.max(r.min, Math.round(db / r.step) * r.step));
  }
  const levelGain = db => Math.pow(10, db / 20);
  // The copy of the sweep that is played: the reference sweep times the level's gain. The reference itself, and the
  // inverse filter made from it, stay at the default, so the gain is applied exactly once and never to the recording.
  function playbackSignal(signal, db) {
    const level = sweepLevel(db), g = levelGain(level), out = new Float32Array(signal.length);
    let peak = 0;
    for (let i = 0; i < signal.length; i++) { out[i] = signal[i] * g; peak = Math.max(peak, Math.abs(out[i])); }
    if (peak > CRITERIA.take.level.maxPeak) throw new Error(`The sweep at ${level} dB would clip (peak ${peak.toFixed(3)}).`);
    return { signal: out, levelDb: level, gain: g, peak };
  }

  function sweepPlan(fs) {
    const c = CRITERIA.take, f2 = Math.min(c.f2, Math.floor(c.nyquistShare * fs));
    return { fs, f1: c.f1, f2, seconds: c.sweepSeconds, amplitude: c.amplitude, preRoll: c.preRoll, tail: c.tail, total: c.preRoll + c.sweepSeconds + c.tail };
  }

  // Exponential sine sweep x(t) = A·sin(K·(e^(t·R/T) − 1)), R = ln(f2/f1), K = 2π·f1·T/R, with short raised-cosine fades.
  // Inverse filter: the time-reversed sweep with an envelope e^(−t·R/T), which rises 6 dB per octave toward high
  // frequencies and so flattens the sweep's pink spectrum.
  function makeSweep(plan) {
    const { fs, f1, f2, seconds: T, amplitude } = plan, c = CRITERIA.take;
    const n = Math.round(T * fs), R = Math.log(f2 / f1), K = 2 * Math.PI * f1 * T / R;
    const fi = Math.round(c.fadeIn * fs), fo = Math.round(c.fadeOut * fs);
    const signal = new Float32Array(n), inverse = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const w = i < fi ? 0.5 - 0.5 * Math.cos(Math.PI * i / fi) : i > n - 1 - fo ? 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - i) / fo) : 1;
      signal[i] = amplitude * w * Math.sin(K * (Math.exp((i / fs) * R / T) - 1));
    }
    for (let i = 0; i < n; i++) inverse[i] = signal[n - 1 - i] * Math.exp(-(i / fs) * R / T);
    return { signal, inverse };
  }

  /* ---------- decay in one band ---------- */
  // Lundeby's iterative method: background noise level and the point where the decay meets it.
  function lundeby(e, fs) {
    const n = e.length;
    const meanE = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += e[i]; return s / Math.max(1, b - a); };
    const smooth = win => {
      const k = Math.floor(n / win), t = new Float64Array(k), v = new Float64Array(k);
      for (let j = 0; j < k; j++) { let s = 0; for (let i = j * win; i < (j + 1) * win; i++) s += e[i]; v[j] = DSP.dbOf(s / win); t[j] = (j + 0.5) * win / fs; }
      return { t, v };
    };
    const argmax = v => { let m = -Infinity, j = 0; for (let i = 0; i < v.length; i++) if (v[i] > m) { m = v[i]; j = i; } return j; };

    let win = Math.max(1, Math.round(0.01 * fs)), env = smooth(win);
    if (env.v.length < 10) return { ok: false, reason: 'The recorded response is too short to analyse.' };
    let noise = meanE(Math.floor(0.9 * n), n), p = argmax(env.v);
    if (env.v[p] - DSP.dbOf(noise) < 10) return { ok: false, reason: 'The response does not rise clearly above the noise in this band.' };

    let fit = null, cross = n;
    for (let it = 0; it < 8; it++) {
      // First pass: from the peak to 10 dB above the noise. Later passes (Lundeby's step 5): the late decay only, from
      // 25 dB to 5 dB above the noise, so a strong direct sound at the start does not tilt the line.
      const nDb = DSP.dbOf(noise), lim = nDb + (fit ? 5 : 10);
      let j = p; while (j < env.v.length && env.v[j] > lim) j++;
      let a = p;
      if (fit) { while (a < j && env.v[a] > nDb + 25) a++; if (j - a < 4) a = p; }
      const f = regress(i => env.t[i], i => env.v[i], a, j - 1);
      if (!f || !(f.slope < 0)) break;
      fit = f;
      const tc = (DSP.dbOf(noise) - f.intercept) / f.slope, next = Math.max(1, Math.min(n, Math.round(tc * fs)));
      // About five averaging intervals per 10 dB of decay (Lundeby: 3 to 10), between 2 and 50 ms.
      win = Math.min(Math.round(0.05 * fs), Math.max(Math.round(0.002 * fs), Math.round(fs * (10 / -f.slope) / 5)));
      env = smooth(win); p = argmax(env.v);
      // Background from the point 10 dB below the crossing to the end, and never less than the last 10 %.
      const start = Math.min(Math.floor(0.9 * n), Math.round((tc + 10 / -f.slope) * fs));
      noise = meanE(Math.max(1, start), n);
      const done = Math.abs(next - cross) < 0.001 * fs;
      cross = next;
      if (done) break;
    }
    if (!fit) return { ok: false, reason: 'No decay could be fitted above the noise in this band.' };
    // Energy that the straight-line decay would still contain after the crossing (added to the Schroeder integral).
    const k = -fit.slope * Math.LN10 / 10, eCross = Math.pow(10, (fit.intercept + fit.slope * cross / fs) / 10);
    return { ok: true, cross, noise, slope: fit.slope, tail: eCross * fs / k };
  }

  function fitDecay(edcDb, fs, top, bottom, cross) {
    let i1 = -1, i2 = -1;
    for (let i = 0; i < cross; i++) { if (i1 < 0 && edcDb[i] <= -top) i1 = i; if (edcDb[i] <= -bottom) { i2 = i; break; } }
    if (i1 < 0 || i2 <= i1) return null;
    const f = regress(i => i / fs, i => edcDb[i], i1, i2, Math.max(1, Math.floor((i2 - i1) / 3000)));
    if (!f || !(f.slope < 0)) return null;
    return {
      T: r3(-60 / f.slope), slope: r3(f.slope), intercept: r3(f.intercept), r2: Math.round(f.r2 * 1e6) / 1e6,
      from: Math.round(-top * 100) / 100, to: Math.round(-bottom * 100) / 100, t1: r3((-top - f.intercept) / f.slope), t2: r3((-bottom - f.intercept) / f.slope),
    };
  }

  /* The room's reverberant decay inside a decay curve that may start with a strong direct sound. A line is fitted to
     the lowest 20 dB of the usable curve (furthest from the direct sound) and extrapolated back to the arrival; how far
     it lies below the curve's start is the energy of the direct sound and early reflections. The estimate is then
     refined on the T20 range counted from the reverberant start. Returns that energy in dB (≥ 0), or null when the
     curve is too short to tell the parts apart. */
  function reverberantStart(edcDb, fs, cross, lowestDb) {
    const bottom = -lowestDb;
    if (bottom - 20 < 5) return null;
    let f = fitDecay(edcDb, fs, bottom - 20, bottom, cross);
    if (!f) return null;
    let head = Math.max(0, -f.intercept);
    const [top, end] = CRITERIA.decay.ranges.T20;
    for (let it = 0; it < 6 && head + end <= bottom; it++) {
      f = fitDecay(edcDb, fs, head + top, head + end, cross);
      if (!f) break;
      const next = Math.max(0, -f.intercept), done = Math.abs(next - head) < 0.05;
      head = next;
      if (done) break;
    }
    return head;
  }

  function analyseBand(seg, o, f, plan) {
    const fs = plan.fs, band = DSP.octaveBand(f, fs), D = CRITERIA.decay;
    const out = { f, lo: r1(band.lo), hi: r1(band.hi), bandwidth: r1(band.bandwidth), supported: true, reason: null, decayRangeDb: null, noiseFloorDb: null, peakToNoiseDb: null, headDb: null, crossSec: null, cutoff: null, disturbance: null, backgroundChangeDb: null, fits: {}, curve: null };
    if (band.hi >= plan.f2 || band.lo <= plan.f1) {
      return Object.assign(out, { supported: false, reason: `Outside the test signal's range (${plan.f1}–${plan.f2} Hz at a ${plan.fs / 1000} kHz sample rate).` });
    }
    const y = DSP.filterReversed(seg, band.sections), m = y.length - o, e = new Float64Array(m);
    for (let i = 0; i < m; i++) e[i] = y[o + i] * y[o + i];

    const L = lundeby(e, fs);
    if (!L.ok) return Object.assign(out, { reason: L.reason });
    const win = Math.max(1, Math.round(D.envWindow * fs));
    let maxEnv = 0;
    for (let a = 0; a + win <= m; a += win) { let s = 0; for (let i = a; i < a + win; i++) s += e[i]; if (s / win > maxEnv) maxEnv = s / win; }
    const range = DSP.dbOf(maxEnv) - DSP.dbOf(L.noise);

    // Schroeder backward integration up to the crossing point, with the extrapolated tail energy added. The background
    // noise energy (Lundeby's estimate) is subtracted from every sample first: the tail beyond the crossing is the
    // noise-free decay, so the integrated part has to be too. Left in, the noise lifts the end of the curve and the
    // decay reads long (about +3 % with 45 dB usable, +6 % near the T20 limit, in tests/dsp.html).
    const cross = Math.min(m, L.cross), edc = new Float64Array(cross);
    let acc = L.tail;
    for (let i = cross - 1; i >= 0; i--) { acc += e[i] - L.noise; edc[i] = Math.max(acc, 1e-30); }
    const edcDb = new Float64Array(cross);
    for (let i = 0; i < cross; i++) edcDb[i] = 10 * Math.log10(edc[i] / edc[0]);

    // Direct sound + early reflections, reverberant decay, background noise (see the top of this file).
    // The curve is used down to 10 dB above the point where the decay meets the noise. The direct part can hold no more
    // than the curve loses in its first directWindow; any excess found by extrapolation is the room's early decay.
    const lowest = edcDb[cross - 1] + 10, early = -edcDb[Math.min(cross - 1, Math.round(D.directWindow * fs))];
    const head0 = reverberantStart(edcDb, fs, cross, lowest), head = head0 == null ? null : Math.min(head0, Math.max(0, early));
    const shift = head == null ? 0 : Math.max(0, head - D.directAllowanceDb);
    const reverb = -edcDb[cross - 1] - shift; // usable decay of the room itself, dB
    if (head != null) for (const [name, [top, bottom]] of Object.entries(D.ranges)) out.fits[name] = fitDecay(edcDb, fs, shift + top, shift + bottom, cross);

    // A decay that drops into the background far faster than the room's own decay (its T20 slope) allows has been cut
    // off: by a noise gate or noise suppression in the device or the system, or by a gap in the recording after the test
    // signal. No room decays like that, and the fits would read the cut as a shorter reverberation time.
    if (out.fits.T20) {
      const c = D.cutoff, w = Math.max(1, Math.round(D.envWindow * fs)), k = Math.floor(m / w), lv = new Float64Array(k), nDb = DSP.dbOf(L.noise);
      for (let j = 0; j < k; j++) { let s = 0; for (let i = j * w; i < (j + 1) * w; i++) s += e[i]; lv[j] = s / w; }
      const mean = (a, b) => { let s = 0; for (let j = a; j < b; j++) s += lv[j]; return DSP.dbOf(s / (b - a)); };
      const room = -out.fits.T20.slope * (c.before + c.after) * D.envWindow / 2; // what the room's decay falls between the two windows' centres
      for (let j = c.before + 1; j + c.after <= k; j++) {
        const before = mean(j - c.before, j), after = mean(j, j + c.after);
        if (before - nDb >= c.aboveNoiseDb && after - nDb <= c.nearNoiseDb && before - after - room >= c.excessDb) { out.cutoff = { atSec: r3(j * w / fs), dropDb: r1(before - after) }; break; }
      }
    }

    // Downsampled curves for display: band energy relative to its 10 ms peak, and the decay curve.
    const span = Math.min(m, Math.round(cross * 1.25 + 0.1 * fs)), bins = 240, step = Math.max(1, Math.ceil(span / bins));
    const env = [], dc = [];
    for (let a = 0; a < span; a += step) {
      const b = Math.min(span, a + step);
      let s = 0; for (let i = a; i < b; i++) s += e[i];
      env.push(r1(DSP.dbOf(s / (b - a)) - DSP.dbOf(maxEnv)));
      const mid = Math.floor((a + b) / 2);
      dc.push(mid < cross ? r1(edcDb[mid]) : null);
    }
    return Object.assign(out, {
      decayRangeDb: r1(reverb), headDb: head == null ? null : r1(head), peakToNoiseDb: r1(range), noiseFloorDb: r1(-range),
      crossSec: r3(cross / fs), curve: { dt: step / fs, env, edc: dc },
      reason: head == null ? 'The decay is too short to separate the room\'s reverberation from the direct sound.' : null,
    });
  }

  /* Distortion of the whole playback and recording chain, read from the sweep itself (Farina 2000): an exponential sweep
     places the response of the k-th harmonic T·ln k / ln(f2/f1) before the main response (0.65 s for the 2nd, 1.04 s
     for the 3rd with a 5 s sweep), where it cannot disturb the decay. Energy in the first 50 ms of the 2nd and 3rd
     harmonic responses against the first 50 ms of the main one, after removing the noise measured where only the 7th to
     11th harmonics fall. A relative figure for comparing sweep levels, not a THD: the inverse filter weights a harmonic
     by about 1/k, and harmonics above f2 are not captured. null when a harmonic does not rise 3 dB above that noise. */
  function distortion(full, onset, fs, plan) {
    const w = Math.round(0.05 * fs), lead = Math.round(0.002 * fs), R = Math.log(plan.f2 / plan.f1);
    const at = k => onset - Math.round(plan.seconds * fs * Math.log(k) / R);
    const energy = a => { let s = 0; for (let i = a - lead; i < a - lead + w; i++) s += full[i] * full[i]; return s; };
    const n0 = at(7), n1 = at(11);
    if (n1 - lead < 0 || n0 <= n1) return null;
    let ns = 0; for (let i = n1; i < n0; i++) ns += full[i] * full[i];
    const noise = ns / (n0 - n1) * w, main = energy(onset) - noise;
    if (!(main > 0)) return null;
    const rel = k => { const e = energy(at(k)) - noise; return e > noise ? r1(10 * Math.log10(e / main)) : null; };
    return { h2Db: rel(2), h3Db: rel(3), floorDb: r1(10 * Math.log10(Math.max(noise, 1e-30) / main)) };
  }

  // Magnitude of the analytic signal (Hilbert envelope) of x.
  function envelope(x) {
    const n = DSP.nextPow2(x.length), re = new Float64Array(n), im = new Float64Array(n);
    re.set(x); DSP.fft(re, im);
    for (let k = 1; k < n / 2; k++) { re[k] *= 2; im[k] *= 2; }
    for (let k = n / 2 + 1; k < n; k++) { re[k] = 0; im[k] = 0; }
    DSP.fft(re, im, true);
    const e = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) e[i] = Math.hypot(re[i], im[i]);
    return e;
  }

  /* When each half-octave of the sweep arrived, relative to the take's arrival (CRITERIA.take.timing). Each segment of
     the played sweep, tapered, is matched against the recording around where it should be; the peak of the match's
     envelope gives its arrival (ms; parabolic interpolation). A continuous recording gives the same arrival for every
     segment, apart from the speaker's own delay at low frequencies and early reflections; samples dropped or inserted
     shift every segment after them, so the largest step between neighbouring segments shows them. Returns
     { segments, maxStepMs, stepMs, atHz, driftMs } (drift: last segment against the first, clock difference between
     playback and recording), or null when fewer than three segments can be read. */
  function sweepTiming(rec, plan, sweep, arrival) {
    const c = CRITERIA.take.timing, fs = plan.fs, T = plan.seconds, R = Math.log(plan.f2 / plan.f1);
    const tOf = f => T * Math.log(f / plan.f1) / R, S = Math.round(c.searchMs / 1000 * fs);
    const edges = [];
    for (let f = c.fromHz; f < plan.f2 * 0.999; f *= c.ratio) edges.push(f);
    edges.push(plan.f2);
    const seg = [];
    for (let k = 0; k + 1 < edges.length; k++) {
      const i0 = Math.round(tOf(edges[k]) * fs), i1 = Math.min(sweep.signal.length, Math.round(tOf(edges[k + 1]) * fs)), m = i1 - i0;
      const a = arrival + i0 - S, b = arrival + i1 + S;
      if (m < 0.05 * fs || a < 0 || b > rec.length) continue;
      const ref = new Float64Array(m), tp = Math.round(0.1 * m); // time-reversed, so convolution is correlation
      for (let i = 0; i < m; i++) {
        const w = i < tp ? 0.5 - 0.5 * Math.cos(Math.PI * i / tp) : i >= m - tp ? 0.5 - 0.5 * Math.cos(Math.PI * (m - 1 - i) / tp) : 1;
        ref[m - 1 - i] = sweep.signal[i0 + i] * w;
      }
      const cc = DSP.convolve(rec.subarray(a, b), ref), xc = new Float64Array(2 * S + 1);
      for (let lag = -S; lag <= S; lag++) xc[lag + S] = cc[S + lag + m - 1];
      const env = envelope(xc);
      let j = 0;
      for (let i = 1; i < env.length; i++) if (env[i] > env[j]) j = i;
      const y0 = env[Math.max(0, j - 1)], y1 = env[j], y2 = env[Math.min(env.length - 1, j + 1)], den = y0 - 2 * y1 + y2;
      const sorted = Array.from(env).sort((p, q) => p - q), floor = sorted[sorted.length >> 1];
      const clarity = 20 * Math.log10(y1 / Math.max(floor, 1e-30));
      if (clarity >= c.minClarityDb) seg.push({ f: Math.round(edges[k]), ms: (j - S + (den ? (y0 - y2) / (2 * den) : 0)) / fs * 1000 });
    }
    if (seg.length < 3) return null;
    let k = 1;
    for (let i = 2; i < seg.length; i++) if (Math.abs(seg[i].ms - seg[i - 1].ms) > Math.abs(seg[k].ms - seg[k - 1].ms)) k = i;
    const step = seg[k].ms - seg[k - 1].ms;
    return { segments: seg.length, maxStepMs: r3(Math.abs(step)), stepMs: r3(step), atHz: seg[k].f, driftMs: r3(seg[seg.length - 1].ms - seg[0].ms) };
  }

  /* The recording above the sweep (CRITERIA.take.clicks, sweepGain): clicks, and the input level while the sweep played.
     Returns { clicks: { checked, fromSec, toSec, share, worstDb, atSec, found: [{ atSec, db }] }, gain: { checked,
     changeDb, frames } }. Times are seconds into the sweep. A frame is only read where the background before the sweep
     shows in its bins (a recording that holds nothing up there, such as a band-limited Bluetooth microphone, cannot
     be checked this way: checked false). */
  function aboveSweep(rec, plan, arrival) {
    const c = CRITERIA.take.clicks, g = CRITERIA.take.sweepGain, fs = plan.fs, T = plan.seconds, R = Math.log(plan.f2 / plan.f1);
    const N = DSP.nextPow2(Math.round(c.frame * fs)), hop = N / 4, half = N / 2, binHz = fs / N;
    const kTop = Math.floor(Math.min(c.maxHz, CRITERIA.take.nyquistShare * fs) / binHz), margin = c.margin * binHz;
    const w = new Float64Array(N);
    let U = 0;
    for (let i = 0; i < N; i++) { const x = 2 * Math.PI * i / N; w[i] = 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x); U += w[i] * w[i]; }
    const re = new Float64Array(N), im = new Float64Array(N);
    const spectrum = s => {
      for (let i = 0; i < N; i++) { const k = s + i; re[i] = (k >= 0 && k < rec.length ? rec[k] : 0) * w[i]; im[i] = 0; }
      DSP.fft(re, im);
      const p = new Float64Array(kTop + 1);
      for (let q = 0; q <= kTop; q++) p[q] = (re[q] * re[q] + im[q] * im[q]) / U;
      return p;
    };
    // The background before the sweep, per bin: the median over its frames (a sound in it does not count), ÷ ln 2,
    // the median of a noise bin's power being ln 2 times its mean.
    const p0 = Math.round(0.1 * fs), p1 = Math.round((plan.preRoll - 0.05) * fs), pre = [];
    for (let s = p0; s + N <= p1; s += hop) pre.push(spectrum(s));
    const bg = new Float64Array(kTop + 1);
    if (pre.length >= 8) for (let q = 0; q <= kTop; q++) { const v = pre.map(p => p[q]).sort((a, b) => a - b); bg[q] = v[v.length >> 1] / Math.LN2; }
    const floor = 1e-15; // a bin's background below this (−150 dB) shows nothing to compare with

    const frames = [];
    for (let s = arrival + Math.round(c.from * fs) - half; s + N <= rec.length && s + half <= arrival + (T + c.tail) * fs; s += hop) {
      const tau = (s + half - arrival) / fs, f = plan.f1 * Math.exp(Math.min(T, Math.max(0, tau)) * R / T), p = spectrum(s);
      // Harmonics where they land: one above half the sample rate folds back below it when the distortion happened
      // before the converter (a digital limiter in the playback chain).
      const fold = v => { const m = v % fs; return m > fs / 2 ? fs - m : m; }, harm = [];
      for (let h = 2; h <= c.harmonics; h++) harm.push(fold(h * f));
      let e = 0, x = 0, n = 0, eg = 0, xg = 0, ng = 0;
      const ratio = [];
      for (let q = Math.ceil(Math.max(f + margin, c.minHz) / binHz); q <= kTop; q++) {
        const fq = q * binHz;
        let near = false;
        for (const hf of harm) if (Math.abs(fq - hf) < margin) { near = true; break; }
        if (fq >= g.above * f && !near) { eg += p[q]; xg += bg[q]; ng++; }
        if (!near) { e += p[q]; x += bg[q]; n++; if (bg[q] > floor) ratio.push(p[q] / bg[q]); }
      }
      // r: the band's level against its background; m: the median bin's. A click raises every bin, so both; a tone
      // passing through the band (a harmonic of the sweep folded back from above half the sample rate, by a limiter
      // that clips digitally) raises a few bins only, so r and not m.
      frames.push({ tau, r: n >= c.minBins && x / n > floor ? DSP.dbOf(e / x) : null, m: ratio.length >= c.minBins ? DSP.dbOf(pct(ratio.sort((a, b) => a - b), 0.5)) : null,
        g: tau >= g.from && ng >= c.minBins && xg / ng > floor ? DSP.dbOf(eg / xg) : null });
    }

    // Clicks: each frame against the frames before it and the frames after it, each side's median, whichever is
    // higher. A click stands above both; the edge of a sound that stops (or starts) abruptly stands above one side only.
    const M = Math.round(c.context * fs / hop), G = c.guard, ex = frames.map(() => null), exM = frames.map(() => null);
    const sideMedian = (i, dir, key) => {
      const v = [];
      for (let k = G + 1; k <= M; k++) { const j = i + dir * k; if (j >= 0 && j < frames.length && frames[j][key] != null) v.push(frames[j][key]); }
      return v.length >= (M - G) / 2 ? pct(v.sort((a, b) => a - b), 0.5) : null;
    };
    const above = (i, key) => {
      const lo = sideMedian(i, -1, key), hi = sideMedian(i, 1, key);
      return lo == null && hi == null ? null : frames[i][key] - Math.max(lo == null ? -Infinity : lo, hi == null ? -Infinity : hi);
    };
    // How much the frames around one scatter (MAD × 1.4826, a standard deviation that ignores outliers). Above a sweep
    // that the playback chain distorts heavily (a digital clipper), the band holds a restless mix of harmonics whose
    // frames vary by several dB; a click there has to stand out of that scatter, not just 8 dB above its median.
    const scatter = frames.map(() => 0);
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].r == null) continue;
      ex[i] = above(i, 'r');
      if (frames[i].m != null) exM[i] = above(i, 'm');
      const v = [];
      for (let j = Math.max(0, i - M); j <= Math.min(frames.length - 1, i + M); j++) if (Math.abs(j - i) > G && frames[j].r != null) v.push(frames[j].r);
      if (v.length >= M) { const med = pct(v.sort((a, b) => a - b), 0.5); scatter[i] = 1.4826 * pct(v.map(x => Math.abs(x - med)).sort((a, b) => a - b), 0.5); }
    }
    const peaks = [];
    for (let i = 0; i < ex.length; i++) {
      if (ex[i] == null || ex[i] < Math.max(c.db, c.scatterK * scatter[i])) continue;
      let top = true;
      for (let j = Math.max(0, i - G); j <= Math.min(ex.length - 1, i + G); j++) if (j !== i && ex[j] != null && (ex[j] > ex[i] || (ex[j] === ex[i] && j < i))) { top = false; break; }
      if (top) peaks.push(i);
    }
    // Sharp: just outside the click's own frames, the level is back down (and was down before it).
    const side = (i, dir) => { const v = []; for (let k = G + 1; k <= G + 6; k++) { const j = i + dir * k; if (j >= 0 && j < ex.length && ex[j] != null) v.push(ex[j]); } return v.length ? pct(v.sort((a, b) => a - b), 0.5) : null; };
    const found = peaks.filter(i => {
      const before = side(i, -1), after = side(i, 1);
      const sharp = (before == null || ex[i] - before >= c.sharpDb) && (after == null || ex[i] - after >= c.sharpDb);
      // Broadband: the median bin rose too (within the click's own frames), not just a few bins.
      let broad = -Infinity;
      for (let j = Math.max(0, i - 2); j <= Math.min(ex.length - 1, i + 2); j++) if (exM[j] != null) broad = Math.max(broad, exM[j]);
      return sharp && broad >= c.broadDb && peaks.filter(j => j !== i && Math.abs(j - i) <= M).length < c.events;
    }).map(i => ({ atSec: r3(frames[i].tau), db: r1(ex[i]) }));
    const read = frames.filter(fr => fr.r != null), worst = ex.reduce((m, v) => (v != null && v > m ? v : m), -Infinity);
    const gains = frames.map(fr => fr.g).filter(v => v != null).sort((a, b) => a - b);
    return {
      clicks: {
        checked: read.length > 0, fromSec: read.length ? r3(read[0].tau) : null, toSec: read.length ? r3(read[read.length - 1].tau) : null,
        share: frames.length ? r3(read.length / frames.length) : 0, worstDb: isFinite(worst) ? r1(worst) : null,
        // The level a click had to reach over most of the sweep: `db` where the band holds only background, more where
        // a distorted sweep makes it scatter.
        thresholdDb: read.length ? r1(pct(frames.map((fr, i) => (fr.r == null ? null : Math.max(c.db, c.scatterK * scatter[i]))).filter(v => v != null).sort((a, b) => a - b), 0.5)) : null,
        // How full of the sweep's own harmonics the band is while it plays: the median bin against the background, over
        // the sweep. About −1.6 dB (a noise bin's median) when it holds only background; well above when a distorted
        // playback chain fills it with harmonics, which hide smaller clicks (processing.js warns from coarseDb).
        fillDb: (v => (v.length ? r1(pct(v.sort((a, b) => a - b), 0.5)) : null))(frames.filter(fr => fr.m != null && fr.tau <= T).map(fr => fr.m)),
        atSec: found.length ? found.reduce((a, b) => (b.db > a.db ? b : a)).atSec : null, found,
      },
      gain: gains.length >= g.minFrames ? { checked: true, changeDb: r1(pct(gains, 0.5)), frames: gains.length } : { checked: false, changeDb: null, frames: gains.length },
    };
  }

  /* ---------- one take ---------- */
  function analyseTake(rec, plan, sweep) {
    const fs = plan.fs, C = CRITERIA.take, n = rec.length;
    const out = { status: 'failed', reason: null, levels: {}, waveform: waveform(rec), latencySec: null, arrivalClarityDb: null, onsetSec: null, irSeconds: null, gap: null, clicks: null, sweepGain: null, timing: null, distortion: null, bands: [] };
    const fail = reason => Object.assign(out, { status: 'failed', reason });

    const bad = firstNonFinite(rec);
    if (bad >= 0) return fail(`The recording is corrupted: the browser delivered invalid samples (not numbers) ${r1(bad / fs)} s into the take, so nothing can be calculated from it. Measure again; if it happens again, reload the page.`);
    let peak = 0, clipped = 0;
    for (let i = 0; i < n; i++) { const a = Math.abs(rec[i]); if (a > peak) peak = a; if (a >= C.clipLevel) clipped++; }
    const sw0 = Math.round(plan.preRoll * fs), sw1 = Math.min(n, Math.round((plan.preRoll + plan.seconds) * fs));
    // Background before the sweep and the sweep's level, both in the RT60 bands (inBand: true): a DC offset or rumble
    // below them is not background those bands hear, and counted, it made a quiet room look too loud for the sweep.
    const ib = DSP.filter(rec, inBandSections(fs)), p0 = Math.round(0.1 * fs), p1 = Math.round((plan.preRoll - 0.05) * fs);
    const pre = DSP.dbOf(DSP.meanSquare(ib, p0, p1)), during = DSP.dbOf(DSP.meanSquare(ib, sw0, sw1));
    out.levels = { peakDbfs: r1(peakDb(peak)), preRollDbfs: r1(pre), sweepDbfs: r1(during), snrDb: r1(during - pre), clippedSamples: clipped, dcDbfs: dcDbfs(rec, p0, p1), inBand: true };

    if (n < Math.round(plan.total * fs * 0.98)) return fail('The recording is incomplete: the microphone stopped delivering audio during the take.');
    if (peak < 1e-6) return fail('No sound reached the microphone during the take. It may be muted, switched off or covered.');
    // What to change: the sweep level where it can still move (plan.levelDb, set by the user), else the device volume.
    const lr = levelRange(), lv = plan.levelDb == null ? 0 : plan.levelDb, signed = d => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} dB`;
    if (clipped) return fail(`The microphone input was overloaded (${clipped} samples at full scale). ${lv > lr.min ? `Lower the sweep level (now ${signed(lv)}) or turn` : 'Turn'} the device's volume down a little and measure again.`);
    if (during - pre < C.minSweepSnrDb) return fail(`The test signal was only ${r1(during - pre)} dB above the background at the microphone. ${lv < lr.max ? `Raise the sweep level (now ${signed(lv)}) or turn` : 'Turn'} the device's volume up, check that the sound comes from its own speaker (disconnect headphones and Bluetooth audio) and measure again.`);

    // Deconvolution: the impulse response appears at lag (arrival + sweep length − 1).
    const full = DSP.convolve(rec, sweep.inverse), L = sweep.inverse.length;
    let pk = 0, pi = 0;
    for (let i = 0; i < full.length; i++) { const a = Math.abs(full[i]); if (a > pk) { pk = a; pi = i; } }
    const arrival = pi - (L - 1), latency = arrival - sw0;
    if (latency < -0.05 * fs || latency > C.maxLatency * fs) return fail('The test signal could not be found in the recording. Check that the sound comes from this device\'s own speaker and measure again.');

    // Gaps in the recording while the test signal was arriving: the longest run of identical samples that sits at least
    // 20 dB below the signal on either side of it (5 ms each), where that signal is at least 10 dB above the background.
    // A filled gap is a flat stretch inside a loud signal; the flat top of a very quiet, coarsely quantised sine is not.
    {
      const a = Math.max(1, arrival + Math.round(C.gapSkip[0] * fs)), b = Math.min(n, arrival + L - Math.round(C.gapSkip[1] * fs));
      const minRun = Math.round(C.gapSeconds * fs), w = Math.round(0.005 * fs), bg = Math.pow(10, pre / 10);
      const isGap = (s, len) => {
        const around = (DSP.meanSquare(rec, Math.max(0, s - w), s) + DSP.meanSquare(rec, s + len, Math.min(n, s + len + w))) / 2;
        return around > 0 && around >= 100 * rec[s] * rec[s] && around >= 10 * bg;
      };
      let run = 1, longest = 0, at = 0;
      for (let i = a; i <= b; i++) {
        if (i < b && rec[i] === rec[i - 1]) { run++; continue; }
        if (run >= minRun && run > longest && isGap(i - run, run)) { longest = run; at = i - run; }
        run = 1;
      }
      if (longest) {
        out.gap = { atSec: r3(at / fs), ms: r1(1000 * longest / fs) };
        return fail(`The recording has a gap: about ${out.gap.ms} ms of audio is missing at ${out.gap.atSec.toFixed(2)} s, while the test signal was playing. The device or browser stopped delivering audio for a moment (for example under heavy load), which distorts the whole measurement. Close other apps and tabs and measure again.`);
      }
    }

    // Clicks, and the input level while the sweep played, read above the sweep (aboveSweep). processing.js decides
    // on the level; a click ends the take here.
    {
      const above = aboveSweep(rec, plan, arrival);
      out.clicks = above.clicks; out.sweepGain = above.gain;
      if (above.clicks.found.length) {
        const k = above.clicks.found.reduce((a, b) => (b.db > a.db ? b : a)), more = above.clicks.found.length - 1;
        return fail(`The recording has a click ${k.atSec.toFixed(2)} s into the test signal (${Math.round(k.db)} dB above the background around it${more ? `, and ${more} more` : ''}). Most likely the device or browser dropped or repeated a moment of audio; a tap on the device or a sharp sound nearby does the same. A click spreads into the decay of every band, so this take is not used. Close other apps and tabs, keep the device still, the screen on and the app in front, and measure again.`);
      }
    }

    // Onset: within 10 ms before the peak, the first point whose energy is within 20 dB of the peak (0.5 ms smoothing).
    const sm = Math.max(1, Math.round(0.0005 * fs)), floor = pk * pk * Math.pow(10, -C.onsetDb / 10);
    let onset = pi;
    for (let i = Math.max(sm, pi - Math.round(C.onsetWindow * fs)); i <= pi; i++) {
      let s = 0; for (let k = i - sm; k < i; k++) s += full[k] * full[k];
      if (s / sm >= floor) { onset = i - sm; break; }
    }
    // The delay between playing and recording (browser, system and device buffers) is read from this arrival. It is
    // only trusted when the response stands clearly above what the recording held before the sound arrived.
    {
      const a = Math.max(0, onset - Math.round(C.preOnset * fs)), b = Math.max(a + 1, onset - Math.round(0.002 * fs));
      const clarity = DSP.dbOf(pk * pk) - DSP.dbOf(DSP.meanSquare(full, a, b));
      out.arrivalClarityDb = r1(clarity);
      if (!(clarity >= C.minArrivalDb)) return fail(`The arrival of the test signal could not be identified clearly in the recording (only ${r1(clarity)} dB above the recording before it, ${C.minArrivalDb} dB needed), so its timing is not reliable. Keep the room quiet and measure again.`);
    }
    out.latencySec = r3(latency / fs);
    out.onsetSec = r3((onset - (L - 1)) / fs);
    out.distortion = distortion(full, onset, fs, plan);

    // The response is valid as long as the recording continued after the sweep had fully arrived.
    const valid = n - (arrival + L) - Math.round(C.guard * fs);
    if (valid < 0.5 * fs) return fail('The recording ended too soon after the test signal to capture the decay.');
    const start = Math.max(0, onset - Math.round(C.preOnset * fs)), seg = full.slice(start, onset + valid);
    out.irSeconds = r3(valid / fs);

    out.bands = BANDS.map(f => analyseBand(seg, onset - start, f, plan));

    // Samples dropped or inserted while the sweep played (CRITERIA.take.timing). Each segment's arrival is the device's
    // direct sound, so the check needs one: with the speaker and microphone on one device it stands well above the
    // room's decay (headDb); without it (a microphone far from the source) the matches peak on random reflections and
    // the check is not made.
    // The largest headDb of any band: samples dropped mid-sweep smear the direct sound in the bands swept around them
    // (their headDb falls towards 0), so a median would let a dropout switch off its own check; the bands swept away
    // from it keep their direct sound.
    const heads = out.bands.map(b => b.headDb).filter(v => v != null), head = heads.length ? Math.max(...heads) : null;
    if (head != null && head >= C.timing.minHeadDb) {
      const t = out.timing = Object.assign({ checked: true }, sweepTiming(rec, plan, sweep, arrival) || { checked: false, reason: 'too few parts of the sweep stood clear of the background' });
      if (t.checked && t.maxStepMs > C.timing.maxStepMs) {
        return fail(`The recording is not continuous: from about ${t.atHz} Hz on, the test signal arrived ${Math.abs(t.stepMs).toFixed(1)} ms ${t.stepMs < 0 ? 'earlier' : 'later'} than before it. The device or browser ${t.stepMs < 0 ? 'dropped' : 'repeated'} audio samples during the take, which distorts the result even though no gap shows in the recording. Close other apps and tabs, keep the screen on and the app in front, and measure again.`);
      }
    } else out.timing = { checked: false, reason: 'no dominant direct sound to time the sweep by' };

    backgroundSounds(rec, out.bands, fs, [
      [Math.round(0.1 * fs), Math.round((plan.preRoll - 0.05) * fs)],
      [arrival + L + Math.round((Math.max(0, ...out.bands.map(b => b.crossSec || 0)) + 0.1) * fs), n - Math.round(0.02 * fs)],
    ]);
    out.status = 'captured';
    return out;
  }

  // Sounds in the take's own background, per band (CRITERIA.take.disturbance). Each segment is judged against its own
  // median, so a background that changed between them (ventilation switching on) is a change of level, not a sound; a
  // sound is a run of frames that starts `db` above the median, continues while it stays within 3 dB of that, and lasts
  // at most maxSeconds (a longer run is a change of level too). Sets band.disturbance = { db, events } when sounds recur,
  // and band.backgroundChangeDb (after the sweep against before it).
  function backgroundSounds(rec, bands, fs, segments) {
    const c = CRITERIA.take.disturbance, segs = segments.filter(([a, e]) => e - a > 0.2 * fs);
    bands.forEach(b => {
      if (!b.supported || !segs.length) return;
      const band = DSP.octaveBand(b.f, fs), y = DSP.filter(rec, band.sections), w = Math.round(Math.max(c.frame, 8 / band.bandwidth) * fs);
      let events = 0, top = 0;
      const medians = segs.map(([a, e]) => {
        const lv = [];
        for (let k = 0; a + (k + 1) * w <= e; k++) lv.push(DSP.dbOf(DSP.meanSquare(y, a + k * w, a + (k + 1) * w)));
        if (lv.length < 4) return null;
        const med = pct(lv.slice().sort((p, q) => p - q), 0.5);
        for (let k = 0; k < lv.length; k++) {
          if (lv[k] - med < c.db) continue;
          let j = k, peak = lv[k] - med;
          while (j + 1 < lv.length && lv[j + 1] - med >= c.db - 3) { j++; peak = Math.max(peak, lv[j] - med); }
          if ((j - k + 1) * w / fs <= c.maxSeconds) { events++; top = Math.max(top, peak); }
          k = j;
        }
        return med;
      });
      if (events >= c.events) b.disturbance = { db: r1(top), events };
      if (medians.length === 2 && medians[0] != null && medians[1] != null) b.backgroundChangeDb = r1(medians[1] - medians[0]);
    });
  }

  AM.analysis = { CRITERIA, analyseNoise, sweepPlan, makeSweep, levelRange, sweepLevel, levelGain, playbackSignal, analyseTake, analyseBand, sweepTiming, aboveSweep, lundeby, regress, waveform };
})(window.AM);
