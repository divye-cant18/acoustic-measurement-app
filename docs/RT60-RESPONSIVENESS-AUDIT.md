# RT60 responsiveness audit: why repeated sweep takes read almost the same

12 October 2026. Question: when repeated sweep measurements return nearly the same RT60 (about ±0.01 s), even with
considerable background noise, is that the room and the method, or a defect (a hardcoded, cached or stale value, an
artificial limit) in the measurement path?

No production code was changed for this audit. One test page was added: `tests/rt60-responsiveness.html`.

---

## 1. Executive summary

**The measured RT60 follows the room, and only the room.** No hardcoded, cached, demo or fallback RT60 exists anywhere in
the production path. Every take is a new recording, deconvolved with its own reference, analysed on its own data, and
stored under its own id. These checks run the production code on known rooms and through the whole app:

- **Different rooms give different values.** Six rooms of known RT60 (0.30–1.40 s) are each read within ±3 % of the
  room's own decay. Through the whole app, a room made more reverberant moved the result from 0.476 s to 0.906 s.
- **The same room repeats closely, which is expected.** A deconvolved sweep at a fixed position is nearly deterministic:
  - six simulated takes with a new background noise each time, at a level close to the limit, spread by 0.009 s
    (standard deviation 0.004 s);
  - two takes through the whole app read 0.906 s and 0.910 s;
  - a room only 0.05 s more reverberant was told apart in every take.
  - **±0.01 s between takes is the expected behaviour of this method, not a symptom.**
- **Background noise removes the value; it does not drag it.** From −85 to −57.5 dBFS of background:
  - the value moved by at most 0.6 % within one method;
  - below 35 dB of usable decay at 1 kHz, the take gives no value instead of a biased one.
- **Two display gaps can make readings look stuck.** Both were confirmed in the whole app; neither changes a computed
  number.
  - **F1, confirmed bug:** when a new take has been recorded but not yet processed, Results, the top bar and the report
    keep the previous value. Results does not say a newer take exists.
  - **F2, confirmed gap (the behaviour is by design, but under-signalled):**
    - a take that is not valid (for example 1 dB short of the T20 limit at 1 kHz) never replaces the current
      measurement;
    - the top bar and the large Results figure keep showing the earlier value;
    - only a row further down Results, and the Measure and Processing steps, say the newest take was rejected;
    - in a noisy room where most takes fail at 1 kHz, the visible "Measured" value therefore does not change at all.

**The most likely explanation of what you observed** combines two things:
1. valid takes really do repeat within about 0.01 s;
2. takes rejected in the noise leave the previous value on screen (F2), or new takes are viewed before they are
   processed (F1).

Without your own takes this is likely, not proven. Section 11 describes how to tell which applies.

---

## 2. SonicSpace technical analysis

Repository `deekshitha875/SonicSpace` at commit `e83773c` (26 August 2026): plain JavaScript in the browser, no tests.
Every source file was read verbatim. The key lines were re-checked in this audit (`js/dsp/dspMain.js` 29–93 and
290–345; `js/pages/measurePage.js` 171).

**Pipeline, microphone to history**

1. **Noise floor.** A separate 10 s recording, before any clap. The 10th percentile of the 10 ms frame RMS
   (`noiseFloor.js`) is stored per browser tab. With no calibration it falls back to **−40 dBFS**
   (`measurePage.js:171`), which is then shown as if it had been measured.
2. **Capture.** getUserMedia with echo cancellation, noise suppression and automatic gain requested off. The track
   settings are never read back, and the fallback `getUserMedia({audio:true})` path is not flagged.
3. **Excitation.** A hand clap, detected in a 5 s ring buffer (`impulseDetector.js`): the peak must rise to
   noise + 16 dB, or at least −32 dBFS, then drop by more than 12 dB. After a fixed 3 s wait, the newest 3.5 s of the
   buffer is analysed.
4. **Start of the decay.** The loudest sample of that buffer is time zero (`dspMain.js:311–314`).
5. **Decay curve.** Schroeder backward integration over the whole remaining window (about 3.1–3.3 s), normalised to the
   total energy (`computeEDC`, lines 78–93). There is **no noise subtraction, no truncation point and no compensation**,
   and the measured noise floor is never used in the decay.
6. **Broadband value.**
   - Fits: T20 (−5 to −25 dB) and T30 (−5 to −35 dB) by least squares, RT = −60/slope, which is correct.
   - Choice (line 187): T20 when R² ≥ 0.80, otherwise T30, then 0.05–5 s bounds.
   - EDT is a two-point reading.
7. **Bands (125 Hz–4 kHz).**
   - Filter: one second-order band-pass with **Q = 1/√2** ("constant skirt"), run forwards and backwards. That is about
     1.3 octaves wide; neighbouring bands are only about 6.5 dB down, which is not IEC 61260 octave filtering.
   - Fits use **non-standard levels**: −3 to −20 dB and −3 to −30 dB.
   - No R² check; "usable range" is the curve's minimum, which is always deep because the integral plunges at the window
     edge.
8. **Overall RT60 (lines 342–344).** The unfiltered broadband value; only when that fails, the mean of 500 Hz and 1 kHz,
   then the mean of all bands.
9. **UI and history.** The result goes to sessionStorage, then to IndexedDB history. A visible "Run Demo" button feeds a
   synthetic decay (`Math.random`, preset RT60 0.32, 0.65 or 1.4 s) through the same analysis, and that **result enters
   history with no demo marker**. The position-scan page re-saves the last result as new positions without measuring.

**Assessment.** The Schroeder integration and the −60/slope extrapolation are correct. But a clap gives only about
20–40 dB of decay above the noise, and with no truncation or noise compensation the late noise flattens the curve, so
T20/T30 read long. The agent's own re-implementation of the formulas, which is not app output, gave:
- 45 % too long, accepted at R² 0.96, for a 1.2 s room with 40 dB of range;
- values off by 10× or more and discarded, for a 0.6 s room.

The band filters leak, the band ranges are not the ISO ranges, and the quality gate is weak.

**Side by side**

| Aspect | SonicSpace (`e83773c`) | Univicoustic |
|---|---|---|
| Excitation | Hand clap (`impulseDetector.js`); demo: synthetic decay (`syntheticImpulse.js`) | Exponential sine sweep 50 Hz–10 kHz, 5 s (`analysis.js` `makeSweep`) |
| Recording | ScriptProcessor ring buffer, newest 3.5 s after a fixed 3 s wait (`recorder.js`, `measurePage.js:140–149`) | AudioWorklet tap, exactly 10 s from 1 s before the sweep (`audio-io.js` `record`); processing settings read back |
| Impulse response | None: the clap itself; time zero is the loudest sample (`dspMain.js:311–314`) | Deconvolution `rec ∗ inverse`; arrival from the response peak with a clarity check (`analysis.js:455–497`) |
| Bands | One 2nd-order band-pass, Q = 1/√2, zero-phase: about 1.3 octaves, leaky (`dspMain.js:38–75`) | 6th-order Butterworth octave bands, time-reversed (`dsp.js`, `analysis.js:355`) |
| Decay curve | Schroeder over the whole window (`computeEDC`, 78–93) | Schroeder of (energy − noise) up to the crossing point, plus the extrapolated tail (`analysis.js:369–373`) |
| Noise floor | Separate pre-recording (or −40 dBFS default); not used in the decay | Lundeby iteration on each band of the same take; recurring sounds counted as noise |
| T20/T30 | Broadband −5…−25 / −5…−35 dB, T20 preferred when R² ≥ 0.8; bands −3…−20 / −3…−30 dB, no R² check | ISO ranges below the direct sound; T30 if ≥ 45 dB usable, T20 if ≥ 35 dB, else none (`processing.js` `decideBand`) |
| Regression and quality | Least squares; R² ≥ 0.8 (broadband only); heuristic confidence | Least squares; ξ > 50 ‰ rejected; curvature, B·T ≥ 4 and cut-off checks; quality from those |
| Invalid bands | Rarely rejected (the range test is ineffective) | No value, with the reason; never estimated |
| Summary | Broadband value, else mean of 500 Hz and 1 kHz, else mean of all | The 1 kHz band only; no value if it fails |
| Hardcoded or fallback | Demo results stored unflagged; −40 dBFS default noise floor; scan page re-saves the last result | None found (section 4) |
| Tests | None in the repository | dsp 62, validation 71, sweep-level 13, responsiveness 26, room-surfaces 52, calculations 22, server 26 |

**What is useful to compare with Univicoustic.**
- Comparable: the broadband Schroeder plus T20/T30 regression, and zero-phase band filtering.
- Not comparable or not suitable: the clap excitation and detection, the fixed window without noise handling, the band
  filters and levels, and the broadband summary.
- **Nothing in it should replace the sweep pipeline.**
- When comparing readings, note that its headline is a broadband value, not a 1 kHz band.

---

## 3. Univicoustic measurement pipeline (production code)

| # | Stage | Where | Data passed on |
|---|---|---|---|
| 1 | Sweep generation | `analysis.js` `sweepPlan` (249), `makeSweep` (257): exponential sweep 50 Hz–10 kHz, 5 s, 0.7 peak, with its inverse filter | `{ signal, inverse }`, made fresh for every take (`measurement.js:126`) |
| 2 | Playback and level | `analysis.js` `playbackSignal` (241): the gain is applied to a copy; the reference and inverse stay at the default. `measurement.js:126, 132`; `audio-io.js` `play` (241) on the same AudioContext as the capture | played copy only |
| 3 | Recording | `audio-io.js` `record` (211): a fresh chunk list per call, exactly `total` samples, a watchdog for stalled audio; mono, channel 0; processing requested off (161) and read back (166) | `Float32Array` of 10 s (`measurement.js:133`) |
| 4 | Recording checks | `analyseTake` (435): complete (447), not silent (448), not clipped (451), sweep at least 10 dB above the pre-roll (452), no gap (461–481) | failure with a reason, or continue |
| 5 | Background | before the take: `analyseNoise` (174, in-band verdicts). In the take: pre-roll and post-decay per band (`backgroundSounds`, 509) | `levels`, band `disturbance` |
| 6 | Alignment and deconvolution | `DSP.convolve(rec, sweep.inverse)` (455). The arrival is the response peak (456–459, latency −50 ms to 1 s, never assumed); onset per ISO 3382-1 (484–489); clarity ≥ 20 dB (492–497) | `full`; latency and onset |
| 7 | Impulse response | from the onset to the end of the recording after the sweep has arrived (503–506), about 3.9 s with the 4 s tail | `seg` |
| 8 | Band filtering | `analyseBand` (349): 6th-order Butterworth octave bands, time-reversed (`filterReversed`, 355) | squared band response `e` |
| 9 | Decay curve | Schroeder integration of `e − noise` up to the crossing point, plus the extrapolated tail energy (369–373) | `edcDb` |
| 10 | Noise floor | Lundeby iteration on the take's own band response (`lundeby`, 272–313) | `noise`, `cross` |
| 11 | Usable range | `reverberantStart` (332) separates the device's direct sound (`headDb`, at most the first 5 ms); usable = curve depth − shift (378–381) | `decayRangeDb`, `headDb` |
| 12 | T20/T30 selection | `processing.js` `decideBand` (54): T30 if ≥ 45 dB, else T20 if ≥ 35 dB, else no value; disturbances counted as noise (64) | `path` |
| 13 | Regression and extrapolation | `fitDecay` (315): least squares over −5…−25 / −5…−35 dB (shifted below the direct sound), T = −60/slope, r² | `fits` |
| 14 | Band RT60 | `decideBand`: rejected if the decay is cut off (69), bandwidth × RT < 4 (86) or ξ > 50 ‰ (87); otherwise `rt60 = fit.T` (88) | band rows |
| 15 | Quality | Good/High for T30 with ξ ≤ 10 ‰ and curvature ≤ 10 %; otherwise Fair/Medium (89–98); browser processing on gives no value (117–126) | quality, confidence, notes |
| 16 | Displayed value | `evaluate` (102): `headline = 1 kHz band` (140); valid only if 1 kHz has a value (134) | `processing.result` |
| 17 | Current, history, report | Processing `apply` (`stages/processing.js:111`): a valid result becomes current and the previous one is SUPERSEDED (history); an invalid one becomes `attempt`. Shown by `derive.measured` (`derive.js:14`): Results, the top bar (`app.js:69–75`), Assessment, the report (`report.js:85`) | — |

The three values stay separate:
- **Target:** `services/target.js`.
- **Measured:** `processing.result` only.
- **Predicted after treatment:** `services/prediction.js`, from the measured value.

No code path fills the measured value from the target or the prediction. The only writes are the take
(`live.js:180`) and its own evaluation (`stages/processing.js:117`).

---

## 4. Hardcoded, cached or stale data: confirmed problems

Searched across the whole of `js/`: every assignment to an RT60 or headline value, every write of
`processing.result` and `measurement.recording`, and `Math.random`, simulat\*, mock, fake, fixture, cache, previous,
last-result.

| Check | Finding | Status |
|---|---|---|
| Hardcoded RT60, per-band values, quality scores or validity flags | None. The headline comes only from `ref.rt60` (`processing.js:140`), and band values only from `fit.T` (88) | **Ruled out** |
| Demo, mock or fixture data in production | `index.html` loads no test file. `services/measurement.js` has no simulated path. `store.js:105–131` *removes* simulated values saved by old versions | **Ruled out** |
| Fallback to a previous result when a calculation fails | Not in the calculation: a failed take returns a reason and no value. The *display* keeps the previous valid measurement; see F2 | **Ruled out (calculation); see F2** |
| Cached impulse response, decay curve or sweep reused between takes | None. Each take: a new `makeSweep`, a new recording, `convolve(rec, …)`. Test A6: two rooms in a row give different curves, ids and values; the same recording twice gives a byte-identical result | **Ruled out** |
| Stale closures or async races | The Processing job is keyed to `rec.id`; `outcome()` matches by `recordingId`; `apply` checks the project. Test B1–B4: each screen follows the processed take | **Ruled out** |
| Fixed ranges forcing slopes, or RT60 clipped to limits | The ranges are the ISO 3382-2 ranges and do not constrain the slope. There is no min/max clip on RT60 (only the bandwidth × RT < 4 rejection, about 6 ms at 1 kHz) | **Ruled out** |
| Early rounding | Fits are rounded to 0.001 s (`analysis.js:322`); the display to 0.01 s | **Ruled out** (display resolution 0.01 s) |
| Wrong or mismatched reference | Not possible in the app (the played copy is made from the same sweep object). Test A7: a mismatched, shorter or zero reference gives no value | **Ruled out** |
| **F1. Results with a newer take not yet processed** | `stages/results.js` shows `derive.measured(p)` with its time but no notice that a newer recording exists. The take list (`derive.takeComparison`) does not include an unprocessed take. Measure says "Take recorded, not processed yet" (`measure.js:137, 176`). Test B4: Results text has no mention of it | **Fixed (2026-10-14):** Results says "A newer take, recorded …, has not been processed yet" with a Process it button; the top bar's measured value is marked as an earlier take's (`AM.derive.laterTakes`); B4 passes |
| **F2. Results and top bar after a rejected take** | By design (`stages/processing.js:111–123`, `live.js:174–177`), a take that is not valid never replaces the current measurement. The top bar (`app.js:75`) and the large Results figure keep the earlier value; only the take list lower on Results marks the newest take "Not valid" or "Not used". Tests B5 and B6 | **Fixed (2026-10-14):** next to the value, Results says "Your latest take (…) gave no value", with its reason, and which measurement is shown; the top bar marks the value; B5 and B6 check it |

---

## 5. Suspected issues requiring further evidence

| Item | Evidence | Status |
|---|---|---|
| One-device T20 offset | With a device's direct sound (28 dB) and desk reflections, T20 reads **+2.5 to +3.4 %** above the room's own T20, and T30 reads +1.5 to +1.9 %. This is consistent across noise levels and seeds (A3). It is within the validation tolerance and is not a source of stability. It probably comes from separating the direct sound and desk reflections | **Not verified** in a real room: compare with a calibrated reference before changing anything |
| A method switch looks like a change in the room | When the usable decay crosses 45 dB, the method switches between T30 and T20. On a decay that is not perfectly straight the two differ (this room: own T20 0.632 s, own T30 0.609 s). In A11, a 3 dB sweep-level change switched T20 0.648 s → T30 0.620 s (−4.4 %) | **Expected behaviour** (ISO T20 and T30 measure different parts of the decay). The method is shown with every value |
| Processing in the operating system or driver (voice isolation, noise suppression) | The browser reports only its own settings (`audio-io.js:166`). The cut-off detection (`analysis.js:384–396`) and the curvature note (`processing.js:95`) catch a decay that is cut off or speeds up | **Not verified** on real devices: not detectable directly |
| Continuous speech during a take | Section 6 (A9): the bands it covers give no value. When speech is continuous it is not labelled as "sounds", but the raised noise floor still rejects the band | Expected behaviour |

---

## 6. Noise floor and T20/T30 findings

Verified in the code:
- **The noise floor comes from the current take, per band.** Lundeby runs on that band's own response; the background
  is the last 10 % of the response, or from 10 dB below the crossing point (`analysis.js:282–308`).
- **Late noise is kept out of the decay curve.** The noise energy is subtracted before integration, the integration
  stops at the crossing point, and the extrapolated tail is added (369–373). So the noise is handled through the
  integration, not subtracted afterwards.
- **The usable range is counted from the start of the room's own decay** (below the device's direct sound) down to
  10 dB above the noise floor. T20/T30 are selected on it (45 / 35 dB).
- **The extrapolation multiplier is correct:** −60/slope over the fit range, the same as ×2 for T30 and ×3 for T20.
- **One invalid band cannot change the summary.** The headline is the 1 kHz band alone (A10).
- **r² is not treated as accuracy.** It is used only to reject non-straight decays (ξ), never as proof of correctness.

**Per band, one take with considerable background**

Room of RT60 0.6 s, one device on a desk, background −60 dBFS (the sweep about 39 dB above it). From
`RESP_TABLES.bandsConsiderableNoise`; "noise floor" is relative to the band's peak.

| Band | Usable decay | Noise floor | Direct sound above the decay | Method | Fit interval (dB) | Fit time (s) | Slope (dB/s) | r² | RT60 | Valid |
|---|---|---|---|---|---|---|---|---|---|---|
| 125 Hz | 35.8 dB | −40.5 dB | 1.0 dB | T20 | −5.0 … −25.0 | 0.042–0.235 | −103.6 | 0.957 | 0.579 s | yes (Fair) |
| 250 Hz | 38.5 dB | −37.7 dB | 0.2 dB | T20 | −5.0 … −25.0 | 0.044–0.227 | −109.0 | 0.998 | 0.551 s | yes (Fair) |
| 500 Hz | 36.8 dB | −57.6 dB | 14.6 dB | T20 | −18.6 … −38.6 | 0.033–0.251 | −91.9 | 0.996 | 0.653 s | yes (Fair) |
| 1 kHz | 37.6 dB | −67.3 dB | 23.8 dB | T20 | −27.8 … −47.8 | 0.026–0.242 | −92.5 | 0.998 | 0.648 s | yes (Fair) |
| 2 kHz | 38.6 dB | −66.0 dB | 21.7 dB | T20 | −25.7 … −45.7 | 0.030–0.231 | −99.2 | 0.998 | 0.605 s | yes (Fair) |
| 4 kHz | 38.5 dB | −69.2 dB | 25.1 dB | T20 | −29.1 … −49.1 | 0.035–0.234 | −100.5 | 0.999 | 0.597 s | yes (Fair) |

In the bands with a strong direct sound (500 Hz–4 kHz), the fit interval moves down by the direct-sound excess. That is
why the 1 kHz fit runs from −27.8 to −47.8 dB, not −5 to −25 dB.

**Noise ladder** (same room, same noise shape; A3; own T30 0.609 s, own T20 0.632 s):

| Background | Sweep above it | Usable at 1 kHz | Method | RT60 | Against own decay |
|---|---|---|---|---|---|
| −85 dBFS | 64.3 dB | 62.7 dB | T30 | 0.618 s | +1.5 % |
| −75 | 54.3 | 52.7 | T30 | 0.618 | +1.5 % |
| −70 | 49.3 | 48.0 | T30 | 0.619 | +1.7 % |
| −67.5 | 46.8 | 45.5 | T30 | 0.620 | +1.9 % |
| −65 | 44.3 | 42.9 | T20 | 0.650 | +2.8 % |
| −62.5 | 41.8 | 40.0 | T20 | 0.651 | +3.0 % |
| −60 | 39.3 | 37.7 | T20 | 0.653 | +3.3 % |
| −57.5 | 36.8 | 35.2 | T20 | 0.654 | +3.4 % |
| −55 | 34.3 | 32.6 | — | no value | "Only 33 dB … T20 needs 35 dB" |
| −50 / −40 | 29.3 / 19.3 | 27.5 / 17.5 | — | no value | the same |
| −30 | 9.8 | — | — | no value | "The test signal was only 9.8 dB above the background" |

Within one method the value moves by at most 0.3 % (T30) or 0.6 % (T20) across the whole range. Noise does not bias the
result: the app stops before it would.

---

## 7. Sweep and deconvolution findings

- The emitted and the reference sweep are the same object. The inverse filter is the time-reversed sweep with a
  −6 dB/octave envelope correction (Farina; `makeSweep` 266).
- **The playback gain is applied once,** to the played copy (`playbackSignal`). A11: the recorded sweep rose
  3.0 dB per 3 dB step; the reference was untouched.
- **Sample rate and count:** the plan uses the session's AudioContext rate; the recording is exactly
  `plan.total × fs` samples, and shorter than 98 % fails (447).
- **Timing:**
  - playback and capture share one AudioContext clock;
  - the arrival is read from the deconvolved peak, with a clarity check ≥ 20 dB;
  - latency is limited to −50 ms … 1 s;
  - B1–B4 measured 51 ms on the virtual device.
- **The decay comes from the recovered response:** bands are filtered from `seg ⊂ full = rec ∗ inverse`, never from the
  sweep itself.
- **Tail:** 4 s after the sweep gives about 3.9 s of response, enough for the 60 dB of decay of a 1.4 s room (A1:
  1.338 s own → 1.324 s).
- **Detected:**
  - clipping (A8);
  - weak excitation (SNR < 10 dB; A5, B6);
  - gaps;
  - distortion (2nd and 3rd harmonic; A8: −18.1 dB reported, RT60 unaffected);
  - browser processing, as the browser reports it.
- **Not detected:** processing below the browser (operating system, driver); this is a documented limitation.

---

## 8. Why the readings are nearly identical

1. **The method repeats very closely.**
   - A room is a linear, time-invariant system, and a deconvolved sweep at a fixed position recovers nearly the same
     impulse response every time.
   - Background noise falls below the evaluation range, which always ends at least 10 dB above the noise floor.
   - Simulation: 6 takes spread by 0.009 s (sd 0.004 s); the whole app: 0.906 and 0.910 s.
   - A real room adds some time variation (air movement, temperature, people moving), so expect a little more than
     this, but still around 1–2 % at 1 kHz at one position.
   - Moving the device to another position changes the value more than repeating at one position does.
2. **Noise switches the method or removes the value; it does not move it.** Up to the 35 dB limit the value stays put.
   Beyond it the take is not valid.
3. **A rejected take leaves the previous value on screen (F2).**
   - In a first run of part B, with the virtual room's background at −55 dBFS, the long room's 1 kHz band had 34 dB,
     one short of the limit.
   - That take did respond to the room (125–500 Hz read 1.17, 0.99 and 1.05 s), yet the top bar and Results still
     showed the earlier 0.465 s.
   - In a noisy room this makes the reading look "stuck".
4. **Results shows the current measurement even when a newer take has not been processed (F1).**
5. **The headline is one band (1 kHz)**, and the display rounds to 0.01 s. Other bands can vary more; the per-band table
   on Results shows them.

---

## 9. Test results (commands and actual output)

The test pages ran in the app's browser preview, served by `python -B server/app_server.py --port 8796`.

| Suite | How to run | Result |
|---|---|---|
| **New:** `tests/rt60-responsiveness.html` part A (production analysis on known rooms) | open the page; it runs on load | **18 / 18 passed** |
| **New:** part B (the whole app, virtual device) | click "Run part B" (about 2 minutes) | **7 / 8 passed** at the time of this audit (the B4 check for F1 failed until it was fixed); **8 / 8** since the fix (2026-10-14) |
| `tests/dsp.html` | open | 62 / 62 passed |
| `tests/validation.html` | open | RT60 validation: 71 / 71 passed |
| `tests/calculations.html` | open | 22 / 22 passed |
| `tests/room-surfaces.html` | open | 52 / 52 passed |
| `tests/sweep-level.html` | click "Run the test" | 13 / 13 passed |
| `python -B tests/report_submission_test.py` | terminal | `Ran 26 tests in 23.6s — OK` |

**What part A covers** (the production `analyseTake` and `processing.evaluate` on synthetic rooms):
- **A1:** six known rooms, each within ±3 % of its own decay, with values rising with the room.
- **A2:** repeatability 0.009 s; a room 0.05 s longer is told apart in every take.
- **A3:** the noise ladder (above).
- **A4:** a different decay in every band, each band within 2.1 %.
- **A5:** insufficient decay gives no value.
- **A6:** no reuse between takes, and a deterministic result.
- **A7:** a wrong or missing reference, or a recording without the signal, gives no value.
- **A8:** clipping is rejected; distortion is reported and the RT60 is unchanged.
- **A9:** a few spoken words are found in the speech bands; constant talking rejects those bands.
- **A10:** a speaker with no output below 300 Hz loses 125 Hz but keeps the same headline; noise only at 1 kHz gives no
  headline even though other bands have values; the headline is the 1 kHz band itself.
- **A11:** each 3 dB sweep-level step lifts the recorded sweep 3.0 dB and the usable decay with it; RT60 within one
  method changes by less than 2 %.

**Tolerances and why:**
- ±5 % against the room's own decay over the same range: the validation report's one-device accuracy is about ±3 %.
- 0.02 s repeatability: twice the display resolution.
- 2 % for a sweep-level change within one method.

**What these are:** simulation and unit tests. They show what the code does with known inputs. They are not a real-room
validation (section 11).

---

## 10. Ranked fixes

Fixes 1 and 2 were applied on 2026-10-14 (see the table above); 3 to 5 remain proposals (4 is superseded by the
500–2000 Hz average, docs/AVERAGE-RT60.md).

| # | Fix | Impact | Confidence | Size | Regression test |
|---|---|---|---|---|---|
| 1 | **F1.** On Results (and as a marker on the top bar's "Measured"): "A newer take, recorded at …, has not been processed yet", with a "Process it" button that goes to Processing | High: removes a "stuck value" path | High | Small: one condition on `measurement.recording.id` vs `processing.result.recordingId` / `attempt` | Part B check B4 (currently failing) passes |
| 2 | **F2.** When the newest take was not valid or not used, say so next to the large Results figure and the top bar: "Your latest take (time) gave no value: reason. Shown: the measurement from (time)." | High in noisy rooms | High | Small | Extend B5/B6: the text near the figure names the rejected take |
| 3 | When 1 kHz fails but other bands have values, list them in the rejection message ("this take did respond: 500 Hz 1.05 s …"), so the user sees that the take was real | Medium | High | Small | Extend B5 |
| 4 | Show the mid-frequency T_mid (mean of 500 Hz and 1 kHz, ISO 3382) beside the 1 kHz headline for comparing with other apps and standards; keep the per-band table | Medium | Medium | Small | New unit check |
| 5 | Investigate the one-device T20 offset (+3 %) against a calibrated reference before any change | Low to medium | Low (not verified) | — | — |

**Not recommended:** changing the T30/T20 thresholds, loosening the quality checks, averaging bands into the headline,
or adopting SonicSpace's processing. None of them is supported by the evidence.

---

## 11. Real-room validation plan

**A. Repeatability**
- Fixed room, device, position, volume and sweep level; quiet room.
- At least five consecutive takes; process each through Processing.
- Record each take's time, method, usable decay, r² and RT60 per band from Results → "Takes in this project".
- **Expected:** a standard deviation at 1 kHz of about 0.01 s or less, with every take having its own time.

**B. Sensitivity**
- Change the room in a controlled way without moving the device: open a door or curtains, or add a large absorber (a
  duvet over a sofa, foam panels; several m²).
- Five takes before and five after.
- **Expected:** a shift several times larger than the standard deviation found in A.

**C. Noise**
- Repeat A with a steady background at a safe level (a fan or HVAC; no loud sources).
- **Expected:** either the same value (within A's spread), or the take shows "Not valid" with a usable-decay reason.
  Check the "Takes in this project" list, not only the large figure (F2).

**D. Positions**
- Three positions, five takes each.
- **Expected:** a spread between positions larger than within one position.

**E. Reference**
- At the same positions, a calibrated system: measurement microphone, omnidirectional or good loudspeaker, and REW or
  equivalent, giving T20/T30 per octave band.
- Compare per band at the same method.
- **Expected:** agreement within about ±5–10 % at 500 Hz–2 kHz. Low bands may be "Not reliable" on the device (its
  speaker).

**F. If your own readings look stuck**
- Open Results → "Takes in this project":
  - every take should have its own time;
  - "Not valid" or "Not used" rows mean those takes did not replace the value shown (F2);
  - a take recorded but missing from the list was not processed yet (F1).

---

## 12. Remaining uncertainties and limitations

- No recording of your room was available to this audit. The explanation in section 8 is supported by code and tests,
  not by your own data; section 11 F shows how to check it.
- Simulated rooms have a perfectly diffuse decay, so real rooms (non-diffuse fields, modes at low frequency) can differ.
- Processing in the operating system or driver cannot be detected by a browser.
- The one-device T20 offset (about +3 % in simulation) is not verified in real rooms.
- SonicSpace was analysed from its source, not run; its numerical behaviour is inferred from its code and an
  independent re-implementation of its formulas.
