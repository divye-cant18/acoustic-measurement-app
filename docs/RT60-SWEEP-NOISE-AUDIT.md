# RT60 measurement: sweep length, background noise and calculation audit

12 October 2026. This follows docs/RT60-AUDIT.md and docs/RT60-DEEP-AUDIT.md.

**Scope.** The whole path from the generated sweep to the displayed RT60, with three questions:
1. Can the measurement be shorter without losing accuracy?
2. Are the background-noise warnings proportionate to the real risk?
3. Is the calculation correct end to end?

**Method.**
- Synthetic rooms of known RT60 run through the app's own analysis and decision code: `tests/sweep-study.html`,
  `tests/noise-study.html`, `tests/validation.html` and `tests/dsp.html`.
- The full app run in the virtual-room harness.
- Nothing here was measured in a real room. Section 9 lists what needs a real reference.

## Summary

**Sweep length: the 5 s sweep stays.**
- 2, 3 and 5 s sweeps were compared on identical rooms against criteria fixed before the run.
- When a shorter sweep gives a value, it is as accurate and repeatable as 5 s.
- But each shortening costs the predicted ~2 dB of usable decay (3 s) or ~4 dB (2 s). That loss lands exactly in noisy
  rooms like the field case and in long decays:

  | Condition | 2 s | 3 s | 5 s |
  |---|---|---|---|
  | Noisy room, values at 1 kHz | 0 % | 0 % | 33 % |
  | Longest RT measured (typical background) | none | 1.0 s | 1.5 s |

- A failed take costs a whole new take, so a shorter sweep does not save time where it matters.
- The 4 s recorded after the sweep is needed for decays up to about 3 s.

**Background noise: corrected.** Three confirmed defects (N1–N3):
- the noise check judged steadiness on all frequencies, where room rumble dominates;
- it blocked takes for backgrounds that cause no RT60 error;
- it missed speech, which is the one background that did cause wrong values.

Speech during a take produced wrong values accepted as valid (1 kHz +12.6 %, 4 kHz +17.1 %).

**After the corrections:**
- **Field case:** the reported background (−49.5 dBFS, L10 − L90 7.5 dB, −4.6 dB change) is now **"Suitable for
  measuring"**. Backgrounds like it caused no RT60 error in the study.
- **Speech:** a caution in the noise check, and in the take it is counted as noise. The band then gives no value, with
  the reason, instead of a wrong one.

**Calculation: no new error found.**
- Deconvolution, band filters, decay curve, T20/T30 and the displayed value were re-verified.
- One known effect remains: a desk reflection can move 250 Hz T20 by up to +12 % in some rooms. It affects all sweep
  lengths alike and needs real-room evidence before any change.

**The gap to other apps is unchanged.** These changes do not alter values in steady conditions. The explanation in
RT60-DEEP-AUDIT.md (a different number reported, a different decay reading) still stands. Confirming it still needs
same-data comparison.

## 1. Inspection: where each step lives

| Step | File and function | What it does |
|---|---|---|
| Sweep generation | `analysis.js` `sweepPlan`, `makeSweep` | 50 Hz–10 kHz exponential sweep, 5 s, −3 dBFS, 0.3 s fade-in. 1 s recorded before, 4 s after |
| Playback, recording | `services/measurement.js` `measureRT60`; `audio-io.js` `Session.play`, `Session.record`, AudioWorklet tap | The played `sweep.signal` is the same object whose inverse deconvolves the recording, so the reference matches exactly. Exactly `total` samples are recorded at the context's sample rate |
| Timing | `analysis.js` `analyseTake` | Playback-to-recording delay read from the impulse-response peak (accepted up to 1 s, at least 20 dB clear). Onset is the first point within 20 dB of the peak |
| Deconvolution | `analyseTake`, `dsp.js` `convolve` | Recording ∗ inverse sweep (FFT). The response is used only where the recording continued past the sweep |
| Direct sound | `analysis.js` `reverberantStart`, `CRITERIA.decay.directWindow` | The device's direct sound, capped at what the decay curve loses in the first 5 ms |
| Band filters | `dsp.js` `octaveBand`, `filterReversed` | IEC 61260 octaves 125–4000 Hz, 6th-order Butterworth high-pass + low-pass, run time-reversed |
| Decay curve | `analysis.js` `lundeby`, `analyseBand` | Lundeby noise floor and truncation; Schroeder integration of (squared response − noise) plus the extrapolated tail |
| Noise | `analyseNoise` (check before the take), `lundeby` and `backgroundSounds` (the take itself) | Background verdict before the take; noise floor and recurring sounds in the take |
| T20/T30 | `analysis.js` `fitDecay`, `services/processing.js` `decideBand` | Least-squares fits over −5…−25 and −5…−35 dB from the room's decay start; T = −60/slope. T30 from 45 dB usable decay, T20 from 35 dB |
| Reliability | `decideBand`, `evaluate` | ξ ≤ 50 ‰, B·T ≥ 4, cut-off decay, curvature, recurring sounds, browser processing |
| Final value | `evaluate`, `core/derive.js`, `util.fmt.s`, `acoustics.classify` | Headline = the 1000 Hz band's value; no averaging across bands. Stored to 1 ms, shown to 0.01 s. Compared with the target at the shown precision |

**Verified correct (unchanged):**
- the sweep and its inverse;
- deconvolution and arrival timing;
- the band edges (−3.01 dB at fc/√2 and fc·√2, at 44.1, 48 and 96 kHz);
- time-reversed filtering (the filter's ringing falls before the onset, so it never lengthens a decay);
- the decay curve and its start;
- the T20/T30 ranges and the extrapolation (T × slope = −60, i.e. 20 dB × 3, 30 dB × 2);
- the exclusion of unreliable bands;
- consistency between Processing, Results, Assessment, the prediction, saved projects and the report (section 7).

**Target comparison precision.** The brief asks for full-precision comparisons. `acoustics.classify` compares at the
displayed precision (0.01 s) on purpose, so a displayed 0.48 s is never "below" a 0.48 s limit. The difference from full
precision is at most 0.005 s, far inside the measurement's uncertainty. Left as it is; switching to full precision would
make the shown status contradict the shown numbers.

## 2. Confirmed errors and their root causes

**N1 — Noise steadiness was judged on all frequencies, dominated by rumble that no RT60 band hears** (`analyseNoise`)
- **Root cause.** The 125 ms frame statistics (L10 − L90, loudest moment, change) were computed on the unweighted
  signal. Room noise is usually ventilation rumble below 88 Hz, whose 125 ms levels scatter by chance even when steady:
  - steady ventilation-like noise: 3.4–5.7 dB L10 − L90 and 4.2–6.9 dB loudest moment broadband;
  - the same noise in the measured bands: 0.4–2.8 dB.
- **Effects.**
  - Harmless backgrounds got warnings or were refused.
  - Speech, which sits in 300–3000 Hz, barely moved the broadband frames. Bursts 15 dB above the background read as
    "steady" (spread 3.2–3.8 dB).
- **Correction.** The verdict uses the bands RT60 is measured in (88 Hz–5.7 kHz) for level and change. Sounds are
  judged per octave band: the loudest 125 ms against the median of the frames around it (±1 s), so a level change is
  not mistaken for a sound.

**N2 — The noise check refused measurements for backgrounds that cause no RT60 error** (`analyseNoise`, Setup)
- **Root cause.** Fixed thresholds made a noise check "Not accepted", which blocks the take: spread above 10 dB, a sound
  20 dB above L90, or a change above 6 dB. None of them was tied to what happens to a take.
- **Effect, measured** (tests/noise-study.html, 9 takes per background):
  - a level fluctuating ±3 dB was refused in 1 of 3 checks, yet its takes were as accurate as with steady noise
    (100 % values, mean |error| 2.8 %);
  - a door impact and ventilation switching on were always refused, yet their takes gave no wrong value (fewer values,
    each with its reason).
- **Correction.** Only a silent or overloaded input now has to be measured again. Sounds, a changing level and a loud
  background give a caution that says what to do. The take decides reliability from its own data (N3). Nothing that
  protects a value was removed.

**N3 — Speech during a take gave wrong values that passed as valid** (`analyseTake`, `decideBand`)
- **Root cause.** The ISO 3382 margin (the evaluation range ends 10 dB above the noise floor) assumes steady noise.
  Intermittent sounds raise the floor while they last. A burst landing in the lower part of the decay lifts it, and the
  decay still looks straight (ξ 3–5 ‰), so no check caught it.
- **Effect.** With speech-like sounds 15 dB above the background, two of nine takes gave wrong values accepted as valid:
  1000 Hz +12.6 % and 4000 Hz +17.1 % (T20, 35–36 dB usable decay).
- **Correction.** The take reads its own background band by band: the second before the sweep, and the recording after
  every decay has reached the noise. When sounds recur there (at least twice, each starting 10 dB above that segment's
  median and lasting at most 2 s), they are counted as the noise floor: the usable decay is measured from their level.
  A longer rise is a change of level and is shown as information only, because it caused no error.
- **Result.** All nine speech takes now give no value at 1000 Hz, and none of their 250–4000 Hz bands gives a wrong value.
  Each refused band says why: "Sounds during the take … rose 14 dB …; measure again while the room is quiet", or too
  little decay where the room's own decay was already short. There were no false detections in steady, fluctuating,
  falling, rising or impact backgrounds (45 takes).

**D2 — proportionality, not an error** (`evaluate`)
- **Before.** A background during the take more than 10 dB away from the noise check lowered every band to medium
  confidence.
- **Why that was wrong.** Each band is judged on the take's own noise floor and background, so the difference says
  nothing about the decay.
- **Now.** It is recorded as information (`meta.backgroundChangeDb`, shown in the Processing step).

Errors corrected earlier (E1–E4 in RT60-DEEP-AUDIT.md) are unchanged.

## 3. Files and functions modified

| File | Function or part | Change |
|---|---|---|
| `js/measurement/analysis.js` | `CRITERIA.noise` | `band`, `soundDb`, `changeDb`, `highDbfs` replace the old spread/jump/drift warn and fail thresholds |
| | `frameStats` (new), `analyseNoise` | In-band and per-band statistics (`inBand`, `bands[].soundDb`). Verdict: suitable, caution, or measure again |
| | `CRITERIA.take.disturbance`, `backgroundSounds` (new), `analyseTake`, `analyseBand` | Sounds and level change in the take's own background, per band (`disturbance`, `backgroundChangeDb`) |
| `js/services/processing.js` | `decideBand` | Usable decay counted from recurring sounds; reason and note |
| | `evaluate` | Background difference from the check is information, not a confidence penalty |
| | `details` | The noise step says whether sounds were found |
| `js/ui/live-ui.js` | `noiseBody`, `noisePill`, `noiseWord` | The card leads with the verdict and what to do; figures under Details |
| `js/stages/setup.js`, `js/stages/measure.js` | summary row, noise row, header text | Wording of the three outcomes |
| `js/services/explain.js`, `js/report/report.js`, `js/measurement/live.js` | text only | The same wording |
| `README.md` | Background noise, Take, Testing | Updated |
| `tests/dsp.test.js` | | Two checks follow the new policy; three new ones: rumble, speech during the take, the same take without it. 50 checks |
| `tests/sweep-study.*`, `tests/noise-study.*` | new | The two studies |
| `tests/validation.test.js` | | RT 0.25 s, reliability column, voices during the take. 71 checks |

**Not changed:**
- the sweep (5 s, 50 Hz–10 kHz), the recording lengths, the band filters, deconvolution, the T20/T30 rule;
- target ranges, products, predictions, reports, pages and navigation.

Saved projects keep their stored noise verdict, since raw audio is not kept to recompute it. A new noise check uses the
new rules.

## 3a. Sweep length: 2, 3 and 5 s (tests/sweep-study.html)

**Model.**
- The app's own situation: one device on a desk, direct sound 28 dB above the reverberation, desk and room reflections,
  70 ms delay, pink background.
- Every duration is played at the same level into the same rooms with the same noise.
- RT 0.25, 0.30, 0.40, 0.50, 0.60 and 0.70 s × three backgrounds × 5 repeats = 270 takes, plus long decays,
  distortion, delays, clock offset and recording length.

**Criteria, fixed before any 2 s or 3 s sweep was run.** Thresholds were not changed afterwards.

| | Criterion |
|---|---|
| P1 | Every value given at 250–4000 Hz within 5 % (T30) or 8 % (T20) of the room's own decay; mean \|error\| at 1 kHz ≤ 2 % |
| P2 | Values at 1 kHz: 100 % in quiet rooms; in typical and noisy rooms no more than 10 points below 5 s |
| P3 | Standard deviation over 5 repeats ≤ 2 % |
| P4 | RT 1.0, 1.5 and 2.0 s within P1 |
| P5 | Speaker distortion: within P1 or no value |
| P6 | Delays 0–0.9 s within P1 |

Decision rule: the shortest duration passing P1 and P3–P6, plus the quiet part of P2.

**One correction after the first run.** The backgrounds were defined as giving about 50, 40 and 32 dB of signal above the
background. The first run's levels gave 45, 35 and 27 dB, because the direct sound sets the peak, not the RMS. The
levels were corrected to the definition; the thresholds were not touched. The first run is reproducible with
`?first-run`. It showed the same ranking, more starkly: typical-room values 2 s 7 %, 3 s 33 %, 5 s 67 %.

**Results (corrected run, final code):**

| | 2 s | 3 s | 5 s |
|---|---|---|---|
| One take (1 s + sweep + 4 s) | 7 s | 8 s | 10 s |
| Mean usable decay at 1 kHz, quiet / typical / noisy | 47.0 / 37.1 / 29.3 dB | 48.7 / 38.7 / 31.0 dB | 51.1 / 41.0 / 33.2 dB |
| Values at 1 kHz, quiet / typical / noisy | 100 / 83 / 0 % | 100 / 100 / 0 % | 100 / 100 / 33 % |
| Mean \|error\| at 1 kHz where a value exists (largest) | 1.32 % (5.2 %) | 1.20 % (5.2 %) | 1.27 % (6.0 %) |
| Repeatability, largest SD (quiet, typical) | 1.4 % | 1.3 % | 1.4 % |
| P4, long decays at 1 kHz | no value at 1.0–2.0 s | 1.0 s: +0.4 / +1.4 %; none at 1.5 and 2.0 s | 1.0 s: −0.5 / −0.2 %; 1.5 s: +1.5 / +0.8 %; none at 2.0 s |
| P5, distortion | within (−0.8 … +0.3 %) | within (−0.7 … +0.1 %) | within (−0.9 … +1.1 %) |
| P6, delays | no value (that room) | +2.0 / +4.1 / +1.2 % | +2.0 / +2.2 / +1.4 % |
| Clock ±100 ppm (information) | +2.0 / +3.5 % | +3.5 / +1.6 % | +3.4 / +1.6 % |

**Pass/fail against the criteria:**

| | 2 s | 3 s | 5 s |
|---|---|---|---|
| P1 | fail | fail | fail |
| P2 | **fail** | **fail** (noisy) | pass |
| P3 | **fail** | pass | pass |
| P4 | fail | fail | fail |
| P5 | pass | pass | pass |
| P6 | **fail** | pass | pass |

- **P1 and P4 fail for all three durations alike, so they do not decide.**
  - P1: 250 Hz deviations from −8.5 to +12.5 % (mostly T20) in two rooms, at every duration (section 8). The 5 s run also
    had one 500 Hz −10 % T20 in a noisy case.
  - P4: at the typical background, a 2 s decay leaves too little usable decay at any duration.
- **Usable decay is lost as theory predicts.** Shortening loses 10·lg(5/3) = 2.2 dB and 10·lg(5/2) = 4.0 dB of usable
  decay; measured 2.2–2.4 and 3.9–4.1 dB.
- **Where a value exists, duration does not change its accuracy or repeatability.** Shorter sweeps give values less
  often: in the noisy (field-like) background and for long decays.

**Decision.** No duration passes every criterion, so the rule selects none and the 5 s sweep stays. Against 5 s, the 3 s
sweep additionally fails P2 and the 2 s sweep fails P2, P3 and P6. A 3 s default with a 5 s fallback would add a whole
failed take (8 s) before the 10 s one in exactly the rooms where 3 s fails. So it does not shorten the measurement where
it matters.

**Recording after the sweep (4 s, unchanged).** It must hold the slowest decay down to the noise, plus the playback delay
(Bluetooth can add 0.2–0.3 s). Quiet room, 5 s sweep, 1 kHz:

| Tail | RT 1.0 s | RT 1.5 s | RT 2.0 s | RT 3.0 s |
|---|---|---|---|---|
| 1.5 s | −0.9 % | −0.4 % | −1.2 % (T20 only) | no value |
| 2 s | −0.9 % | 0.0 % | −1.3 % | −3.9 % (T20) |
| 3 s | −0.9 % | −0.1 % | −1.0 % | −0.7 % |
| 4 s | −0.9 % | −0.1 % | −0.9 % | −0.4 % |

Untreated rooms can reach 2–3 s, so 4 s is kept.

## 4. Before and after, known test signals

| Case | Expected | Before | After |
|---|---|---|---|
| Speech-like sounds during the take, 1000 Hz (noise study, RT 0.5 s) | ≈ 0.485 s | 0.546 s (+12.6 %), valid | no value: "Sounds during the take … rose 15 dB" |
| Same, 4000 Hz | ≈ 0.50 s | 0.586 s (+17.1 %), valid | no value, same reason |
| Field-like background (−49.5 dBFS, falling 5.5 dB), noise check | — | "Accepted with warnings" | "Suitable for measuring" |
| Level fluctuating ±3 dB, noise check | — | "Not accepted" (1 of 3), "with warnings" (2 of 3) | "Suitable" |
| Ventilation switching on, door impact, noise check | — | "Not accepted": the take is blocked | "Measure with care": the take can start |
| Takes in steady, fluctuating, falling, rising, impact backgrounds | — | 45 takes, no wrong value | the same 45 values, no false detection |
| Known RT 0.25–0.70 s, one device (validation; "before" is before the deep audit) | | −1.0 … +2.8 % | −2.0 … +1.4 % (unchanged by this round) |

## 5. The noise warnings against the actual risk

Risk = a wrong value accepted at 250–4000 Hz, or 10 points fewer values at 1 kHz than in steady noise of the same level.
Nine takes per background (RT 0.3, 0.5 and 0.7 s × 3), three noise checks each:

| Background (≈ −49.5 dBFS broadband) | Risk to the RT60 | Noise check before | Noise check now |
|---|---|---|---|
| Steady (pink + ventilation rumble) | none (100 %, mean \|error\| 2.8 %) | Steady | Suitable |
| Fluctuating ±3 dB (L10 − L90 7.6–11.2 dB) | **none** (100 %, 2.8 %) | Not accepted / with warnings | **Suitable** |
| Falling 5.5 dB (like the field's −4.6 dB) | **none** (100 %, 2.4 %) | With warnings | **Suitable** |
| Ventilation switching on, +10 dB | fewer values (56 %), no wrong value | Not accepted (blocked) | Measure with care |
| Speech-like bursts, +15 dB | **wrong values before; none now** (values refused, with the reason) | **Steady** (missed) | **Measure with care** |
| One door impact, +35 dB | fewer values (67 %), no wrong value | Not accepted (blocked) | Measure with care |

Every caution now matches a measured risk, and every background without risk gets none. The only stop left is a silent
or overloaded input.

**On screen,** the noise card leads with one of three outcomes and what to do:
- **Suitable for measuring.**
- **Measure with care**, naming the sound or change.
- **Measure the background again.**

Level, steadiness, loudest moment, change and the per-band table are under Details.

## 6. Tests: deconvolution, decay, T20/T30 and final values

| Suite | Result | What it checks |
|---|---|---|
| `tests/dsp.html` | **50/50** | FFT and convolution, band filters, deconvolution and arrival, decay against the room's own, T20/T30 ranges and extrapolation, direct sound, double slope, noise floor, gaps, cut-off decays, sounds during the take, the noise check |
| `tests/validation.html` | **71/71** | Known RT 0.25–0.70 s (reference conditions and one device), backgrounds, 2.5/5/10 s, 44.1/48/96 kHz, RT by band, double slope, delays, faults, distortion, gaps, voices, browser processing, displayed = calculated (9 checks) |
| `tests/calculations.html` | 22/22 | Geometry, Sabine, prediction, octave α, targets |
| `tests/report_submission_test.py` | 26/26 | Report form server |
| `tests/sweep-study.html`, `tests/noise-study.html` | studies | Sections 3a and 5 |

**Known RT, 1000 Hz, one device on a desk** (validation; Expected is the room's own decay over the same range):

| Nominal | Expected (s) | Calculated (s) | Abs. error (s) | Error | Usable decay | Method | Reliability |
|---|---|---|---|---|---|---|---|
| 0.25 | 0.254 | 0.255 | +0.001 | +0.5 % | 47 dB | T30 | Good, high |
| 0.30 | 0.282 | 0.286 | +0.004 | +1.4 % | 46 dB | T30 | Good, high |
| 0.40 | 0.412 | 0.413 | +0.001 | +0.1 % | 44 dB | T20 | Fair, medium |
| 0.50 | 0.483 | 0.473 | −0.010 | −2.0 % | 44 dB | T20 | Fair, medium |
| 0.60 | 0.599 | 0.587 | −0.012 | −2.0 % | 43 dB | T20 | Fair, medium |
| 0.70 | 0.719 | 0.726 | +0.007 | +1.0 % | 43 dB | T20 | Fair, medium |

In reference conditions every case is within ±0.2 %, using T30.

**End to end** (virtual room; 1000 Hz nominal 0.32 s, direct sound 28 dB, −65 dBFS):
- noise card: "Suitable for measuring", figures under Details;
- take: 0.318 s, T30, 49 dB usable, 6 of 6 bands; Processing says "no sounds above the background during the take";
- 0.32 s in the top bar, Processing and Results; the same value in Assessment and the report model;
- a noise measurement saved by the previous version still displays.

## 7. Why our readings differ from other apps

Nothing in this round changes the conclusion of RT60-DEEP-AUDIT.md, sections 1 and 6. Documented facts and their
sources are listed there:
- the open-source RT app: causal filter, whole-recording Schroeder, −5/−15 dB × 6;
- REW: T20/T30, Topt, and its note on small rooms;
- SignalScope: mid = 500 + 1000 Hz;
- BuzziSpace: method not published.

**Ruled out as the cause:**
- deconvolution, timing, sample rate, band filters, the T20/T30 ranges;
- the noise floor and its subtraction;
- direct-sound separation (E1);
- sweep length: a shorter sweep reads the same where it gives a value;
- the noise check: it never changed a value.

**Reproduced on identical data:**
1. **A different number.** This app shows the 1000 Hz octave band. The 500–1000 Hz mean reads +11 % and the
   125–4000 Hz mean +25 % in a furnished room whose bass rings longer.
2. **A different decay reading.** The RT app's method reads 0.40–0.48 s (means) for a room this app reads 0.33 s, and
   more with a quieter clap.

**Possible, not tested on the user's device:**
- **Operating-system processing.** It can shorten the end of a decay, and a browser cannot see it. A cut well above the
  noise is rejected (E4); a cut close to the noise reads short and is flagged only as "not perfectly straight".
- **Positions and source.** A clap a metre away versus a phone's speaker beside its microphone.

**New this round.** Where speech or other sounds disturb a take, this app now gives no value with the reason. An app
without such a check would show a value, which in the study read long (+12.6 % and +17.1 %).

## 8. Uncertainties that need a real reference

1. **Real devices.** Speaker directivity, microphone response, and operating-system processing. The synthetic model has
   none of these.
2. **250 Hz with a device on a desk.** A desk reflection 0.6–1.6 ms after the direct sound adds about 1.4 dB to the
   start of the 250 Hz decay. The estimated direct sound there is only 0.4 dB, inside the 1 dB direct-sound allowance, so
   the −5 dB start moves. In rooms whose low-frequency early decay is uneven, this shifts T20 by up to about 12 %
   (noise-free: 0.474 → 0.513 s; in the study −8.5 to +12.5 % at 250 Hz). An ISO
   measurement starts at −5 dB including its own direct sound, which is why ISO averages several positions. Changing the
   allowance would trade one bias for another without real-room evidence.
3. **Decays cut off close to the background** (the deep audit's known limitation): −9 %, flagged only as not perfectly
   straight.
4. **Sounds only during the sweep.** If a sound never repeats in the take's own background, nothing sees it. The
   straightness and cut-off checks remain the only guard.
5. **Background levels in real rooms.** How often a real room gives 40 dB rather than 32 dB of signal above the
   background with a laptop at full volume decides how often takes succeed. That needs field data.
6. **Long reverberation with one device.** At typical backgrounds, values ended at RT 1.5 s (5 s sweep). In the model the
   reverberation's level falls as RT rises, since the direct sound is fixed relative to its total energy. Real rooms
   differ, and large reverberant rooms need checking.

The real-world procedure and acceptance criteria are in RT60-DEEP-AUDIT.md section 8: a REW or Class 1 reference, same
positions, three takes, at least two devices, and a same-data check with an exported IR. Add for this round: one session
with deliberate speech and one with ventilation switching, to confirm the noise check and the take-level detection on
real recordings.

## 9. Features and regression tests

- **Pages, navigation and workflow:** unchanged. Room inputs, targets, product data, recommendations, predictions,
  history, reports, the report form and its server are untouched.
- **Results:** every suite passes, as listed in section 6: dsp 50/50, validation 71/71, calculations 22/22, report
  submission 26/26.
- **End-to-end run:** completed as described in section 6, from Setup to Results.
- **Measurement time:** one take stays 10 s; the background check stays 5.3 s.
