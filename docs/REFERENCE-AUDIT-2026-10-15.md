# Reference audit: our RT60 measurement against open-source projects and ISO 3382-2

> The verdict policy described in section 3 changed on 19 October 2026: DIN 18041's 125 Hz and 4 kHz limits are now
> judged (0.65–1.45 × and 0.65–1.2 × T_soll), and targets come only from verified criteria (docs/TARGET-CRITERIA.md).

15 October 2026. This audit follows docs/RT60-DEEP-AUDIT.md (12 October), which covered the sweep-to-display chain, and
docs/AVERAGE-RT60.md (the average policy). It compares the app with four public projects and with the parts of
ISO 3382-2:2008 that could be read, and it explains the two-room comparison with the "RT" app made on 15 October.

**Nothing here was measured in a real room.** The app's values were checked on synthetic rooms of known RT (validation page).
Every statement about another project comes from its source code, read from raw files, unless it is marked otherwise.

## Answer in brief

- **No defect was found in how the app calculates RT60 or its averages.** Each error found in a reference project has a
  matching safeguard in this app, and an existing test covers it: band mix-ups, wrong extrapolation, noise left in the
  decay, the wrong bands averaged, and browser processing silently left on.
- **The "RT" app comparison is explained by its own code.**
  - Its "Average" is the mean of its 2000 Hz and 4000 Hz entries (MeasureViewModel.kt). Those entries read the
    2–4 kHz and 8 kHz decays because of a band mix-up in ReverbTimeCalculator.kt.
  - On your screenshots: (0.49 + 0.30) ÷ 2 = 0.395, shown as 0.39; (0.28 + 0.39) ÷ 2 = 0.335, shown as 0.34.
  - Our average covers 125–4000 Hz, so the two numbers measure different things.
  - Its method also reads long when the clap is weak relative to the background noise, and it can show values of several
    seconds, like the red 3.38 s.
  - This is proven for its code. For your two rooms it is plausible but not proven; that needs the same-room reference
    measurement in section 6.
- **What separates the app from an ISO 3382-2 measurement is the procedure, not the calculation.**
  - ISO 3382-2 Table 1 requires the survey method to average at least two source-microphone combinations.
  - The app measures one position per result, and the report says so.
  - Adding position averaging is the main recommended next step (section 5). It changes the measuring workflow, so it was
    not built without a decision.
- **Changes in this audit:**
  - The validation page now uses the app's own averaging rules.
  - The page reproduces the "RT" app's band mapping and its "Average", and mutes the start for 0.1 s as that app's code
    actually does.
  - One new check was added.
  - The README line about the average was corrected.
  - Nothing in the measurement, the calculations or the screens changed.

## 1. Sources

| Project | What it is | Licence (verified) | Activity | What was read |
|---|---|---|---|---|
| [RT (AppAcoustiC), soygabimoreno/RT](https://github.com/soygabimoreno/RT) | Android app, Kotlin; hand clap | Apache-2.0 (GitHub API `spdx_id`) | Last push 2026-08-06; calculator unchanged since commit 0ae0abe (2020-11-01) | `ReverbTimeCalculator.kt`, `MeasureViewModel.kt`, `processing/ReverbTimeMethod.kt`, `SchroederIntegral.kt`, `NormalizeAndLinearToLogarithmic.kt`, `FilterIIRJ.kt`, `MuteStart.kt`, `FindPositionByAmplitude.kt`, `Recorder.kt`, tests |
| [soygabimoreno (other repos)](https://github.com/soygabimoreno) | RASTI: empty skeleton, no licence. dBCalculator, SPLDistance: not about RT | — | — | Repo list and README files |
| [SonicSpace, deekshitha875](https://github.com/deekshitha875/SonicSpace) | Browser PWA, JavaScript; hand clap | **No licence file** (API `license: null`; the README's "MIT" is only a claim) | 5 commits, all 2026-08-26 | `js/dsp/dspMain.js` (live path), `rt60.js`/`regression.js` (unused), `microphone.js`, `noiseFloor.js` |
| [rt60, Eleutherio (GitLab)](https://gitlab.com/Eleutherio/rt60) | Python script; claps or interrupted pink noise | GPL-3.0-or-later (`LICENSE.txt`) | 10 commits, 2024-10-22 to 2024-11-04 | `RT60.py` |
| [pyroomacoustics, LCAV](https://github.com/LCAV/pyroomacoustics) | Python room-simulation library | MIT (API `spdx_id`) | Last push 2026-07-17 | `experimental/rt60.py` (`measure_rt60`), `acoustics.py` (`rt60_sabine`, `rt60_eyring`), materials, tests |
| [ISO 3382-2:2008, free preview](https://cdn.standards.iteh.ai/samples/36201/4a4d0dc848ac4d40bfe46e36c531afb5/ISO-3382-2-2008.pdf) | The standard, pages 1–5 | — | — | 4.2 Equipment, 4.3 Measurement positions (Table 1, d_min), 5.1, 5.2.1. Annex A (uncertainty) is not in the preview |
| [Larson Davis 831-RT metrics](https://www.larsondavis.com/ContentStore/mktg/LD_Manuals/831-RT_metrics.pdf) | Sound-level-meter manual | — | — | Uncertainty formula quoted from ISO 3382-2 |

No code from these projects was copied into the app. The GPL and unlicensed code was read only.

**Who did what.**
- Three research agents read the reference code.
- I re-read the lines this report depends on, from the raw files:
  - RT: the band mapping, the "Average", the method, the muting and the filter;
  - pyroomacoustics: `measure_rt60` and `rt60_sabine`;
  - ISO 3382-2: Table 1.
- Line numbers in the references are approximate (±2).

## 2. Findings

Each finding opens with one of these classes:
- **Confirmed defect**: shown by code and a test;
- **Potential defect**: plausible, not shown;
- **Design difference**: deliberate, documented;
- **Verified strength**;
- **Unverified limitation**: cannot be settled without a real-room or standards check.

| Area | Our implementation | Reference implementation | Evidence | Finding | Recommended action |
|---|---|---|---|---|---|
| Test signal | Exponential sine sweep, 50 Hz–10 kHz, 5 s, with Farina's amplitude-compensated inverse filter (`analysis.js` `makeSweep`, 332). Harmonic distortion lands before the impulse response | RT, SonicSpace: one hand clap. Eleutherio: claps or interrupted pink noise. pyroomacoustics: is given an impulse response | ISO 18233 (sweep method). RT60-DEEP-AUDIT A: values within 1.1 % at about 12 % third-harmonic distortion | **Verified strength.** A sweep gives more decay range than a clap and is repeatable | None |
| Octave filters | 6th-order Butterworth high-pass at fc/√2 cascaded with 6th-order low-pass at fc·√2. Run time-reversed; B·T ≥ 4 required (`dsp.js` 82, 104; `processing.js` `decideBand`, 77) | RT: iirj band-pass of order 2 (125 Hz), 4 (250–1000 Hz) or 8, run forward. Its edges are set arithmetically, fc ± width/2 (`FilterIIRJ.kt`). SonicSpace: one RBJ biquad with Q = 0.707, about 1.9 octaves wide, zero-phase. Eleutherio: one broadband 50–7000 Hz filter. pyroomacoustics `measure_rt60`: broadband only | dsp tests: −3.01 dB at the band edges and about −36 dB one octave out, at 44.1, 48 and 96 kHz | **Verified strength.** Only this app has true octave bands with filter ringing kept out of the decay. A forward low-order filter, as in RT, lengthens short decays at 125 Hz | None |
| Decay curve and background noise | Lundeby's iterative noise floor and truncation point. The noise is subtracted from every sample before Schroeder integration, and the extrapolated tail is added (`analysis.js` `lundeby` 347, integration 444) | RT: forward cumulative sum to the end of the file, read as 10·lg(1 − sum/total). No truncation, no noise compensation. SonicSpace: backward Schroeder over 3.5 s, no compensation. Eleutherio: Hilbert envelope after an Audacity-style spectral gate. pyroomacoustics: reversed cumulative sum. Its `energy_thres` default of 0.95 read RT60 about 7× short (issue #358) and was reverted to 1.0 | dsp tests: leaving the noise in reads +3 % with 45 dB usable decay and +6 % near the T20 limit. Validation page: the RT method, band by band, reads 3–15 % long at 50–60 dB clap-to-noise ratio (1000 Hz and T_mid), and several-fold at 40 dB | **Verified strength.** This handles noise as ISO 3382-2 allows: truncation, tail correction and subtraction | None |
| Decay fit | Least squares over −5…−25 dB (T20) and −5…−35 dB (T30). RT = −60 ÷ slope, with time in seconds (`fitDecay`, 390) | RT: two points at −5 and −15 dB, × 6 (`ReverbTimeMethod.EDT`). The name says EDT, but EDT is 0…−10 dB. SonicSpace (live): regression, but per band over −3…−20 and −3…−30 dB. Its unused `rt60.js` multiplies by 3 and 2 a second time (3× and 2× too long). Eleutherio: polyfit whose end is chosen adaptively; no fixed range. pyroomacoustics: lstsq from −5 dB over `decay_db`, default 60, silently shortened when the curve is short | dsp test: T × slope = −60 for T20 and T30 | **Verified strength.** Standard ranges, regression rather than two points, and r² reported | None |
| Which range, and when there is no value | T30 if the room's usable decay is ≥ 45 dB, T20 if ≥ 35 dB. Otherwise no value, with the reason (`processing.js` 88, 96) | RT: always shows a number; values ≥ 2 s turn red. SonicSpace: `t20 ?? t30`, kept only within 0.05–5 s. pyroomacoustics: returns 0.0 if the curve never drops 5 dB | ISO 3382-2 5.2.1 (read; written for interrupted noise) and ISO 3382-1 4.2.1 (the same for the impulse response method): 35 dB above background for T20, 45 dB for T30 | **Verified strength** | None |
| Decay straightness | ξ = 1000·(1 − r²): a note above 10 ‰, no value above 50 ‰. Curvature C = 100·(T30/T20 − 1): a note above ±10 % (`analysis.js` 170–171) | None of the references check this | ISO 3382-2 introduction (read): Annex B's two measures "may be used to give warnings when the decay curve is not linear", and the result is then marked less reliable. The 10 ‰ and 10 % values are the Annex B values as commonly quoted; the annex itself is not in the preview | **Verified strength.** **Design difference:** rejecting above 50 ‰ is our choice; ISO only says above 10 ‰ the decay is not straight | None |
| One device as source and receiver | The direct sound of the device is told apart from the room's decay. The evaluation range moves down by (headDb − 1 dB); headDb is capped by what the curve loses in the first 5 ms (`reverberantStart` 407; `analyseBand` 455) | RT README: clap beyond the critical distance. The others do nothing | ISO 3382-2 4.3.1 (read): the minimum distance is 2·√(V/cT). At that distance the direct sound adds about 1.06 dB (critical distance ≈ d_min ÷ 1.9), which is the 1 dB allowance | **Design difference** (justified). One device cannot meet d_min; the shift starts the evaluation where it would start at d_min. Checked on synthetic rooms only (RT60-DEEP-AUDIT E1) | Confirm in real rooms against REW (section 6) |
| Each band is its own band | Each band's value comes from its own filter (`analyseBand(seg, o, f, plan)`) | RT: the "2000 Hz" entry takes its −5 dB point from the 2 kHz curve and its −15 dB point from the 4 kHz curve. The "4000 Hz" entry reads the 8 kHz curve (`ReverbTimeCalculator.kt` 92–114, introduced in commit 0ae0abe) | dsp test "Sweep, RT60 per band" (each band within 5 % of its own decay) | **Verified strength.** RT has a **confirmed defect** of exactly this kind | None |
| Room average | Mean of the reliable bands from 125 to 4000 Hz, at least 3 of 6, with any band left out named. The 500–2000 Hz average is shown beside it, needing 2 of 3 (`rt60-average.js` `over` 69). The six-band average sets the assessment | RT: (measures[4] + measures[5]) ÷ 2, its 2000 and 4000 Hz entries (`MeasureViewModel.kt` 177–178). SonicSpace: the broadband value, else the mean of 500 Hz and 1 kHz, else every valid band. Eleutherio: one broadband value. pyroomacoustics theory: a bandwidth-weighted harmonic mean | ISO 3382-1 T_mid = 500 and 1000 Hz. ANSI S12.60: 500, 1000 and 2000 Hz. DIN 18041: tolerance per band, 0.8–1.2·T between 250 Hz and 2 kHz, wider at 125 and 4000 Hz (`target.js`) | **Design difference** (the user's decision of 15 October). A six-band mean includes 125 and 4000 Hz, where DIN 18041 allows more. It also moves with a device's band coverage: a phone that loses 125 Hz reads lower (docs/AVERAGE-RT60.md, trade-off) | **Decided in 2026.10.16** (section 8): the verdict is the criterion's own band rule (meeting rooms, DIN 18041 A: every band 250 Hz–2 kHz), not either average |
| Comparison with "RT", your two rooms | Room 1: 125 and 250 Hz not measured; average 0.33 s over 4 bands. Room 2: 125 Hz not measured; average 0.39 s over 5 bands | Room 1: 0.16 / 0.32 / 0.71 / 0.60 / 0.49 / 0.30, "Average" 0.39. Room 2: 3.38 (red) / 0.81 / 0.70 / 0.55 / 0.28 / 0.39, "Average" 0.34 | Its "Average" is the mean of its last two entries: 0.395 → 0.39 and 0.335 → 0.34. Mid bands are 1.35–1.9× ours | **Confirmed:** the two "averages" are different quantities. **Unverified limitation:** for your rooms, the mid-band gap fits its method (no noise compensation, two points, forward filter, single clap), but is not proven | Same-room REW comparison (section 6). Do not compare our average with RT's "Average" |
| Recording checks | Clipping, silence, weak sweep, unclear arrival, gaps, clicks, continuity of the sweep's timing, gain lowered during the sweep, background change across the take, lost frames, page hidden (`analysis.js` CRITERIA.take; `audio-io.js`) | RT: none. SonicSpace: clipping by the peak only (≥ 0.99), with a confidence penalty. Eleutherio: none; the README says set the gain by hand | Validation page: 62 cases, including gaps, clipping, a cut-off decay and browser processing | **Verified strength** | None |
| Browser processing | Echo cancellation, noise suppression and AGC are requested off and read back. "Not reported" counts as unknown, not off. Any of them on means no value (`audio-io.js` 77; `measurement.js` `processingState` 70) | SonicSpace: on OverconstrainedError it silently retries with `{audio: true}`, which can switch processing back on | Ours maps OverconstrainedError to an error (`audio-io.js` 55) and never asks again with looser settings | **Verified strength** | None |
| Measuring positions | One position per result. Positions P1–P3 are offered, and a new take replaces the current one. The report says "at one position … not a laboratory-grade measurement" (`report.js` 488) | Eleutherio averages several claps at one position. RT uses one clap. None of them averages positions | ISO 3382-2 Table 1 (read): **survey** at least 2 source–microphone combinations, averaged. **Engineering**: 6, from at least 2 source positions | **Unverified limitation, gap to the standard.** A result is from one position, so it is not an ISO 3382-2 survey measurement | **Done in 2026.10.16** (section 8): at least two positions, averaged band by band |
| Sound source and microphone | The device's own speaker and microphone, uncalibrated and not omnidirectional | All references use consumer devices | ISO 3382-2 4.2.1 (read): no directivity requirement for the survey and engineering methods. 4.2.2: "Omnidirectional microphones shall be used" | **Unverified limitation:** the microphone's directivity is unknown and varies by device. The speaker is acceptable for survey and engineering | Real-device validation (section 6). Never claim conformity |
| Frequency range | Octaves 125–4000 Hz. A band the device cannot measure is left out and named | RT: the same six labels, but 2000 and 4000 are not those bands. SonicSpace: six bands, about 1.9 octaves wide | ISO 3382-2 5.1 (read): survey at least 250–2000 Hz; engineering 125–4000 Hz | **Verified strength:** the engineering range is covered when the device allows it | None |
| Uncertainty | Not stated. The takes table shows the spread between sweep levels at 1000 Hz | Eleutherio: a 95 % interval from the fit's covariance. It is too narrow, because neighbouring samples are correlated | ISO 3382-2 Annex A (informative). Larson Davis quotes σ(T20) = 0.88·T20·√((1 + 1.90/n) ÷ (N·B·T20)) and σ(T30) = 0.55·T30·√((1 + 1.52/n) ÷ (N·B·T30)), where B is the bandwidth, n the decays per position and N the positions | **Unverified limitation.** The n that ISO assigns to the integrated impulse response method could not be read here, so no figure was added | Get Annex A, then show σ per band in Show technical details and the PDF |
| Prediction model | Sabine: A0 = 0.161·V ÷ measured RT. Each band adds area × (α − α of the covered finish). A note appears when the average α is above 0.3 (`prediction.js` 24–45, 86–90) | pyroomacoustics: `rt60_sabine` = (24·ln 10 ÷ c)·V ÷ (aS + 4mV), and an Eyring variant (`acoustics.py` 1158–1181) | 24·ln 10 ÷ 343 = 0.1611. Air absorption (4mV) is already in the measured A0 | **Verified strength:** same constant, and the room's real absorption is used. **Design difference:** Sabine only, with its overestimate at high α flagged | None now. Eyring only if treatments routinely take α above 0.3 |
| Two Sabine constants | The DIN 18041 target uses 0.163 (`targets.js` 113); the prediction uses 0.161 | — | DIN 18041 states 0.163; ISO 354 uses 0.161 at 343 m/s | **Design difference:** each formula keeps its source's constant. Only the people allowance in the target changes, by about 1 % | None |
| Material α per octave | Mean of the three one-third-octave values, capped at 1.00 after averaging (`catalog.js` 105–114) | pyroomacoustics: about 90 materials (Vorländer 2008), given per octave | ISO 11654 practical α: mean of three, capped at 1.00, rounded to 0.05 (we do not round) | **Verified strength;** minor **design difference** (no 0.05 rounding) | None |
| Tests | 412 checks across 9 suites, plus the study pages: synthetic rooms of known RT, hand-worked averages, the whole app end to end, report columns | RT: no test checks an RT value against a known one (only "below 0.5 s"). SonicSpace and Eleutherio: none. pyroomacoustics: one-sided checks and the library against itself | Suites listed in the README; all pass (section 4) | **Verified strength.** **Unverified limitation:** no real-device validation in this repository | Section 6 |
| Validation page (development tool) | Until today, its clap and WAV averages used the old rule ("only when every band has a value", and 500–1000 Hz). Its copy of the RT method muted 0.05 s instead of the 0.1 s RT mutes, and did not reproduce RT's band mapping or "Average" | — | `tests/validation.test.js` against `rt60-average.js` and `MuteStart.kt` | **Confirmed defect** (development tool only). **Fixed** | Done; new check (section 3) |
| README | "Summarised as the average of all six bands" (out of date since the partial-average policy) | — | README.md, Results summary | **Confirmed defect** (documentation). **Fixed** | Done |

## 3. Changes made

- **`tests/validation.test.js`**
  - **App averages.** "This app" rows and the WAV/clap tool now use the app's own two averages, through
    `AM.services.rt60Average` (`appAverages`). A row shows "(5/6)" when a band is left out, and the WAV tool names the
    bands left out.
  - **RT copy.** It now matches that app's code: the start is muted for seconds × rate × 2 (0.1 s), the 2000 Hz entry
    reads the 2 kHz and 4 kHz curves, the 4000 Hz entry reads the 8 kHz curve, and "Average" is the mean of those two
    entries. It is shown both as RT displays it and band by band. The filter is still the app's own octave filter run
    forward, not iirj's; the code comment says so.
  - **New table columns:** 1000 Hz, ISO 3382-1 T_mid, the 500–2000 Hz average, the 125–4000 Hz average, RT's
    "Average", and EDT.
  - **New check:** "The clap and WAV tools on this page give the app's own two averages (125–4000 Hz and 500–2000 Hz) for
    the same bands". It runs over all 62 results, 5 of them with a band left out.
- **`README.md`:** the Results summary line now describes the current average policy, and the validation page
  description is updated.
- **This report.**

Nothing in `js/` changed in this audit.

## 4. Test results

| Suite | Result |
|---|---|
| validation (headless) | 72/72 (71 earlier + 1 new) |
| rt60-average | 57/57 |
| calculations | 32/32 |
| dsp | 64/64 (run on its own; when six pages ran at once it stopped with "error" before its first check, and on its own it passes) |
| room-surfaces | 52/52 |
| mobile-study | done |
| audio-config (parts A and B) | 52/52 |
| sweep-level | 14/14 |
| rt60-responsiveness (parts A and B) | 27/27 |
| server (`python -B tests/report_submission_test.py`) | 42 tests OK |

The same room read in other ways (validation page; synthetic room, 1000 Hz 0.32 s):

| Method | 1000 Hz | T_mid | 500–2000 Hz | 125–4000 Hz | RT "Average" |
|---|---|---|---|---|---|
| Room's own decay (noise-free) | 0.327 | 0.366 | 0.345 | 0.414 | — |
| This app, sweep, one device | 0.331 | 0.369 | 0.347 | 0.413 | — |
| Clap, 60 dB: this app | 0.327 | 0.367 | 0.345 | 0.412 | — |
| Clap, 60 dB: RT as it displays | 0.337 | 0.399 | 0.359 | 0.419 | 0.268 |
| Clap, 50 dB: RT as it displays | 0.349 | 0.420 | 0.373 | 0.472 | 0.268 |
| Clap, 40 dB: this app | no value (not enough decay) | — | — | — | — |
| Clap, 40 dB: RT as it displays | 0.572 | 3.434 | 2.390 | 5.293 | 0.289 |

- **Synthetic room above 4 kHz.** The synthetic room keeps its 4000 Hz value (0.28 s) above 4 kHz, which RT's
  "4000 Hz" entry reads.
- **Weak clap (40 dB).** This app gives no value where the decay is not long enough. RT's method shows several seconds,
  like the red 3.38 s in your Room 2.

## 5. Not changed, and why

1. **Averaging several positions (ISO 3382-2 survey method).** This is the one change that would let a result be an
   ISO 3382-2 survey measurement. It needs product decisions that are not code questions:
   - which takes count: the latest valid one per position;
   - what happens when positions were measured with different devices or after the room changed;
   - how Results, the report and the database show "2 positions".

   Proposed design:
   - keep the latest valid result per position;
   - per band, take the arithmetic mean over the positions that have a value. This is the arithmetic averaging that
     Larson Davis cites from ISO 3382-2; ISO 3382-2 clause 8, "Spatial averaging", was not in the preview. Ensemble
     averaging of decay curves is the alternative;
   - build the room average and the prediction from those band means;
   - show "Measured at N positions", with each position's values under Show technical details;
   - state "ISO 3382-2 survey method (2 positions)" only when there are two or more, and never claim certification.
2. **Uncertainty (ISO 3382-2 Annex A).** The formula's constants are confirmed (Larson Davis). The n that applies to the
   impulse-response method is not. A wrong n would put an invented number in a client report.
3. **Eyring.** Sabine with A0 from the measured RT is the usual approach for treatment planning. Its overestimate above
   α ≈ 0.3 is already flagged. Eyring is worth adding only if real projects often go above that.
4. **Assessment from the six-band mean.** You chose this on 15 October. Section 2 records the trade-off; the 500–2000 Hz
   value is beside it.

## 6. Confirming in a real room (not done here)

1. One room, and one position marked on the floor.
2. Reference measurement:
   - REW with a calibrated measurement microphone (an omnidirectional measurement mic with its calibration file);
   - a separate speaker at least d_min = 2·√(V/cT) from the mic, about 1–2 m in a small room;
   - sweep, then T20 and T30 per octave;
   - export the impulse response as WAV.
3. This app on the phone, at the same spot, 3 takes.
4. RT on the same phone at the same spot, 3 claps. Note every band and its "Average".
5. Load the REW WAV into `tests/validation.html` → "Analyse an impulse response or a clap recording". That separates the
   method from the device: same data, this app's analysis against REW's T20/T30.
6. Compare per band:
   - this app on the phone against REW;
   - this app's analysis of the REW WAV against REW;
   - RT against REW.

   Within about 10 % per band at 500–2000 Hz would match the survey method's nominal accuracy (ISO 3382-2 4.3.2). It
   would not make the app conform to the standard.

## 7. Limits of this audit

- ISO 3382-2 was read from the free preview only: clauses 1–5.2.1. Annex A and Annex B values are as quoted elsewhere.
- The RT copy uses this app's octave filter, not iirj's, so its numbers are close to that app's but not identical.
- The Google Play listing of RT, and any LinkedIn material, could not be read.
- No physical-device validation was done; everything above is code reading and synthetic rooms.

## 8. Follow-up implemented on 16 October 2026 (app 2026.10.16)

Full description: docs/MULTI-POSITION.md.

### What changed

1. **Measuring positions.** A measurement session needs at least two valid positions (ISO 3382-2 survey method:
   2 source–microphone combinations); a third can be added.
   - **Guided workflow.** The Measure step has a positions card showing positions done, the one selected for the next
     take, retries and how many are still needed. Processing and Results lead to the next position, and Results does
     not continue with fewer than two.
   - **Background check per position.** A take is blocked until the background has been measured at the selected
     position.
   - **Invalid takes.** An invalid or unusable take is kept with its reason and its position, never as a value. It can
     be retried at that position, and an earlier valid take there is kept.
   - **Replacement.** A new valid take at a position replaces that position only.
2. **The room per band.** It is the arithmetic mean of the valid positions' RT60 (`js/services/spatial.js`), with
   each position's value, n of N, the spread and the quality kept.
   - A band missing at some positions is averaged over the others and named.
   - The RT60 calculation of each take is unchanged; no analysis file was edited in this phase.
3. **The verdict policy** (`js/services/evaluation.js`). The verdict is the room's own criterion's band rule.
   - **Meeting rooms** (DIN 18041 A3/A4): every band from 250 Hz to 2 kHz within the target range.
     - 500–2000 Hz is not used for meeting rooms: DIN 18041 sets the tolerance from 250 Hz.
     - 125 Hz and 4 kHz have their own wider limits and give band warnings, shown apart from the verdict.
   - **An average inside the range does not pass a room** with a judged band outside it ("masked").
   - **Other criteria:** offices (DIN 18041 B), listening rooms (EBU, 250 Hz–4 kHz), dwellings (500 Hz–2 kHz, an
     interpretation).
   - **Treatment and prediction.** The treatment amount and the prediction aim at the same bands, and the predicted
     result is judged by the same rule.
   - **Documented behaviour change.** Older projects keep their take as P1, and their Results and Assessment are marked
     for review with the reason.
4. **Screens and PDF.**
   - Results shows the two positions, each position's values, the room's bands and the verdict figure.
   - Assessment shows the verdict apart from the band warnings, in plain words.
   - The PDF adds the positions, each position's band values, the room's per-band values, the verdict with the bands
     outside the range, band warnings, and labels for measured, target, model estimate and recommendation.
   - Its limitations state that no ISO 3382-2 conformity and no uncertainty are claimed.
   - The one-page report without treatment still fits one page (checked with up to four notes).
5. **Database.**
   - No column added or changed, and nothing run against a database.
   - `predicted_rt60_avg_s` holds the predicted RT60 after treatment. It is optional, and the server stores rows without
     it if the table lacks the column.
   - Re-running `schema.sql` is not required; the statement is additive if wanted (docs/MULTI-POSITION.md, section 6).
6. **Report access.**
   - The existing workflow is kept: report form, signed receipt, server confirmation before every download.
   - It is now also tested in the browser: a receipt stored in the browser alone unlocks nothing.
   - Truly server-side enforcement would need sign-in or server-side PDF generation: a product decision, documented, not
     made.

### Test results (16 October 2026, each suite run on its own)

| Suite | Result |
|---|---|
| multi-position (new): part A 38, part B 6 (virtual device) | 44/44 |
| rt60-average (sections 7, 9, 11, 12 rewritten for the new rule) | 60/60 |
| calculations (room-wide prediction check updated) | 32/32 |
| validation (assessment check updated) | 72/72 |
| dsp | 64/64 |
| room-surfaces | 52/52 |
| mobile-study | done |
| audio-config (two text checks updated; diagnostics keys renamed so its privacy check still bans "position") | 52/52 |
| sweep-level | 14/14 |
| rt60-responsiveness (its display check reads both headline figures) | 27/27 |
| server (`python -B tests/report_submission_test.py`) | 42 OK |

- **The rt60-responsiveness rerun.** Its part B once failed one take while the server tests ran at the same time (CPU
  load). On its own it passed 27/27, as it did before this change.
- **No check was removed or loosened.** Where the behaviour changed on purpose (the verdict basis, the headline figure,
  the report wording), the check now tests the new rule at the same strictness.

### Still open

- **Real-room validation** with REW and a calibrated microphone has not been done (plan: docs/MULTI-POSITION.md,
  section 5). Until then the device, its microphone and the direct-sound compensation are unvalidated.
- **Uncertainty:** none is shown. ISO 3382-2 Annex A's n for the impulse method is needed first.
- **ISO 3382-2 engineering and precision methods** (6 or 12 combinations, separate source and microphone positions):
  not supported. The device is both source and receiver.
- **DIN 18041 Bild 2:** the 125 Hz and 4 kHz limits are a documented reading of a secondary source, to be checked
  against the standard. They only raise band warnings.
- **Report access:** see item 6.
