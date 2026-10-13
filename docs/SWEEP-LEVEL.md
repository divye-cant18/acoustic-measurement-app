# Adjustable sweep level

12 October 2026. A − / + control on Acoustic Measurement sets how loud the app plays its test sweep, relative to the
existing default. Each take records the level it was made at, and Results compares the project's takes side by side.

Unchanged by this feature:
- the measurement algorithm, sweep length and frequency range;
- deconvolution, band filters, noise-floor handling, decay integration;
- the T20/T30 selection and the quality checks;
- the target and prediction calculations;
- the report form.

## 1. Files changed and why

**Measurement and data**

| File | Change | Why |
|---|---|---|
| `js/measurement/analysis.js` | `CRITERIA.take.level` and `distortionNoteDb`. New `levelRange`, `sweepLevel`, `levelGain`, `playbackSignal`, `distortion`. In `analyseTake`: overload / too-quiet advice that names the level, and `out.distortion` | The level's definition, limits and gain in one place; a distortion indicator to choose a level by |
| `js/services/measurement.js` | `measureRT60({ levelDb })` plays `playbackSignal(sweep.signal, level)`. The take stores `plan.levelDb`, `plan.playedPeakDbfs` and `analysis.distortion` | The gain reaches the real played sweep, once |
| `js/measurement/live.js` | Passes `setup.sweepLevelDb` to the take. Failed takes keep their level | — |
| `js/data/demo.js`, `js/core/store.js` | `setup.sweepLevelDb` (default 0). Older projects get 0. A follow-up "after treatment" project copies the level | Saved with the project; the treated room is measured as the original was |
| `js/services/processing.js` | `meta.distortion`. The Processing steps name the level and the distortion | Display only; no decision uses either |
| `js/core/derive.js` | `takeSummary`, `takeComparison` | The comparison of takes |

**Screens and report**

| File | Change | Why |
|---|---|---|
| `js/stages/processing.js` | A replaced measurement keeps its level, usable decay, T20, T30, r², bands with a value and distortion | Earlier takes can be compared, not overwritten |
| `js/stages/measure.js` | The control (− / + / reset, Default / Above / Below default, what it means, the limits). The level on the latest take, the current measurement and during a take. Distortion on the take card | The feature's screen |
| `js/stages/results.js` | Level and distortion in the measurement record; the card "Takes in this project" | The comparison |
| `js/stages/setup.js`, `js/report/report.js`, `js/services/explain.js` | The level in the test-signal details, the PDF and the step explanation | Shown with each result |
| `js/ui/components.js` | `ui.stepper({ disabled })` | No level change during a take |
| `js/ui/live-ui.js` | `ui.levelDb`, `ui.distortionText`, `ui.distortionNote` | One wording everywhere |
| `css/app.css` | `.sweep-level` | Layout of the control |

**Tests and documentation**

| File | Change |
|---|---|
| `tests/dsp.test.js` | 12 new checks (62 in total) |
| `tests/sweep-level.html`, `tests/sweep-level.test.js` | New end-to-end test |
| `README.md`, this file | Documentation |

## 2. How the control works

**On screen.** Acoustic Measurement, above the start button: "Sweep level", − / value / +, a Default, Above default or
Below default tag, and "Reset to default" when not at 0 dB. Underneath:
- what the level is: relative to the app's default sweep, with the default and current digital peak;
- what it is not: the room's noise or sound pressure — the device volume still decides how loud it is;
- a reminder to use a comfortable listening level and to lower it if the sound distorts or rattles;
- at either limit, why it stops there.

The buttons are disabled at the limits and while a take runs. The level is saved with the project
(`setup.sweepLevelDb`) and used for the next take.

**The gain.** linearGain = 10^(gainDb / 20). Measured: +3 dB = ×1.41254, +6 dB = ×1.99526, −3 dB = ×0.70795,
−6 dB = ×0.50119.

**Where it is applied, exactly once.**
- The sweep is generated at the default amplitude (0.7), and its inverse filter is made from that reference.
- When a take starts, `playbackSignal` multiplies a **copy** of the sweep by the gain. Only that copy is played.
- The recording is never scaled. The reference and inverse filter stay at the default, so the deconvolved response is
  simply as loud as the room heard it.
- Playback uses one AudioBuffer straight to the output; there is no other gain node in the chain.
- RT60 comes from the decay's slope, so the level cannot move it. With the same recording, any level setting gives
  identical fits.

**What is saved with each take:**
- the level and the digital peak actually played (`plan.levelDb`, `plan.playedPeakDbfs`);
- the measured distortion products.

**Where it appears:** the latest take, the current measurement, Results, the Processing steps, the PDF and the
comparison. Takes made before this feature were made at the default and show "0 dB (default)".

**Repeated takes.** Nothing new here overwrites a result: a valid take becomes current and the previous current
measurement is kept as replaced, as before. Results → "Takes in this project" lists, newest first:
- the current measurement;
- those it replaced;
- the latest take that was not valid;
- the latest take that could not be used.

For each it shows the level, status, RT60, method, usable decay, T20 / T30 and r² at 1 kHz, the bands with a value, and
the distortion or reason.

The card says that valid takes at different levels should give similar RT60 with linear playback and recording, and that
the loudest level is not automatically the best. If RT60 at 1 kHz differs by more than 10 % between levels, it says so
and points to distortion or noise.

## 3. Limits, and why they are safe

| Setting | Value | Reason |
|---|---|---|
| Default | 0 dB | The existing sweep: peak 0.7, −3.1 dBFS |
| Step | 3 dB | As requested; configurable (`CRITERIA.take.level.stepDb`) |
| Maximum | **+3 dB** | The headroom above 0.7 is 3.1 dB. At +3 dB the peak is 0.989 (−0.1 dBFS); at +6 dB it would be 1.397 and clip. The maximum is computed from the headroom (`levelRange`), so a configured maximum above it, or a change to the default amplitude, cannot make a level clip. The sweep is a single tone at each instant, so its true peak equals its sample peak |
| Minimum | −12 dB | Each 3 dB down costs 3 dB of usable decay. At −12 dB a typical room (about 41 dB usable at 1 kHz in tests/sweep-study.html) is left with about 29 dB, below what T20 needs. Lower than that, the device volume is the control |
| Protection | | Stored or typed values are snapped to a step and clamped (non-numbers fall back to 0). `playbackSignal` refuses to play anything that would exceed 0.99 of full scale. The app never changes the system volume |

**+6 dB is not offered.** It would need digital headroom the sweep does not have. More sound has to come from the device
volume, which the user controls.

## 4. Tests and results

**`tests/dsp.html`: 62/62 pass**, 12 of them new:
- dB to amplitude for 0, ±3, ±6 and −12 dB;
- the range (−12 … +3, step 3, default 0, +6 would clip);
- a configured maximum held to the headroom;
- invalid and out-of-range values (4 → 3, 9 → 3, −20 → −12, NaN, Infinity, "3", undefined, null → 0);
- − / + stepping and stopping at the limits;
- the gain applied once to the played copy, with the reference sweep and inverse filter bit-identical;
- a signal that would clip refused;
- a room measured at 0, +3 and −6 dB with one playback chain:
  - the recorded sweep +3.00 / −6.00 dB, the recording itself not scaled;
  - usable decay at 1 kHz 37 → 39.6 dB;
  - RT60 the room's and agreeing within 3 % (at −6 dB this room had too little decay left, and no band gave a wrong
    value);
- identical fits for the same recording under any level setting;
- the overload and too-quiet advice naming the level;
- distortion read from known harmonics: 2nd at −30 dB read −30.0 dB, 3rd at −30 dB read −29.2 dB, none read without
  distortion (floor −65 dB).

**`tests/sweep-level.html`: 13/13 pass, twice.** It runs the whole app with a virtual device:
- a new project at 0 dB;
- the control shown at the default;
- a take at 0 dB: level and played peak (−3.1 dBFS) saved;
- + to +3 dB, with a second + staying at +3 dB, + disabled and the limit explained;
- a take at +3 dB: played peak −0.1 dBFS, recorded sweep +3.00 dB;
- RT60 at 1 kHz 0.319 → 0.320 s, both T30, usable decay 49.3 → 52.6 dB;
- the 0 dB measurement kept with its level, usable decay and RT60;
- the comparison listing both, newest first;
- Results and Measure showing the levels;
- the report model carrying +3 dB, and the PDF building;
- reset to 0 dB, and − stopping at −12 dB, disabled, with the limit explained.

**Existing suites:**

| Suite | Result |
|---|---|
| `tests/validation.html` | 71/71 |
| `tests/calculations.html` | 22/22 (geometry, Sabine, treatment prediction, octave α, targets) |
| `python -B tests/report_submission_test.py` | 26/26 |

No console errors in the app runs. The control was also checked at desktop width and at phone width (375 px, no
horizontal scroll).

These are automated and virtual-room results only. They show the gain, the storage and the comparison work, and that RT60
does not depend on the level setting. **They do not validate the feature in a real room.**

## 5. Limits of what can be detected

**Sound pressure.** The level is a digital amplitude relative to the default. How loud the room hears it depends on the
device, its speaker, the system volume and any processing on the way out. None of these can be read from a browser, so
the app never claims a level in dB SPL.

**Speaker distortion.** The app measures the 2nd and 3rd harmonic responses that an exponential sweep separates from the
main response (Farina's method). With known distortion it read the harmonic level within 1.5 dB. But:
- It is the distortion of the whole playback and recording chain, not of the speaker alone.
- Harmonics above 10 kHz, and non-harmonic rattle or buzz, are not captured; rattle shows only as a higher noise floor
  and less usable decay.
- It is shown as information, with a caution when a harmonic comes within 20 dB of the main response. In the earlier
  validation, distortion at that level cost usable decay without biasing RT60, so it does not reject a take.

**Clipping.** A played level that would clip is prevented. A recording that clips is rejected, as before, with advice
to lower the level or the volume.

**What cannot be seen.** System-level limiting or "loudness" processing on the output, which could compress the sweep
near full scale. If the top level shows rising distortion, less usable decay, or RT60 differing from the default level,
use the lower level.

## 6. Real-room validation still needed

Same room, device position, volume setting and conditions; the background checked before each series.

**Takes.**
- At 0 dB, +3 dB and, as a reduction check, −3 dB: at least three takes each, in random order.
- Record per take: RT60 per band, method, usable decay, bands with a value, r² and the distortion figures.

**Acceptance criteria (fixed before testing).**
- Usable decay at 1 kHz rises by about the level change (+3 dB ± 1.5 dB).
- RT60 at 500 Hz–2 kHz from valid takes agrees across levels within 5 %. The standard deviation of repeats at one level
  is ≤ 5 %.
- No clipping is reported. Distortion products stay below −20 dB at the level chosen.
- At least as many bands have a value at the chosen level as at 0 dB.

**Reference.** At the chosen level, compare with a reference system (REW with a calibrated microphone, or a Class 1
meter, per ISO 3382-2). The procedure and its criteria are in docs/RT60-DEEP-AUDIT.md, section 8.

**Choosing a level.** Pick the lowest level that gives enough usable decay for T30 (45 dB) or at least T20 (35 dB),
without distortion, with repeatable RT60. Do not simply pick the loudest.

**If +3 dB is not enough,** the gain has to come from the device volume, a better-placed device, or a quieter room. The
sweep has no more digital headroom.
