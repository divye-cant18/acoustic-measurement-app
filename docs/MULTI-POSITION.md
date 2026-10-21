# Multi-position measurement and the verdict policy

App version 2026.10.16 (16 October 2026). This document covers four things:
- how the room is measured at several positions and averaged;
- how the verdict is decided for each room category;
- what ISO 3382-2 requires, and which of those requirements the app meets, does not meet, or has not been validated
  against;
- the remaining limits: uncertainty, microphone validation, and how to validate against a reference instrument.

Code:
- `js/services/spatial.js`: the spatial average;
- `js/services/evaluation.js`: the verdict policy;
- `js/core/derive.js`: `room`, `positions`, `assessment`, `prediction`;
- `js/stages/measure.js`, `processing.js` and `results.js`: the guided workflow;
- `js/report/report.js`: the PDF.

Tests: `tests/multi-position.html`, with 44 checks (part A 38, part B 6).

**What did not change.** The RT60 calculation is untouched: the sweep, filters, Lundeby, Schroeder, the T20/T30 choice
and the quality checks. Each position's take goes through exactly the same analysis as before.
- This change does not edit `js/measurement/analysis.js`, `dsp.js`, `audio-io.js` or `js/services/processing.js`.
- `js/measurement/live.js` only records the position with the background check and with a take that could not be used.
- `tests/multi-position.html` A3 checks that a room measured at one position has exactly that take's values. It also
  checks that averaging does not modify the results it reads.

## 1. ISO 3382-2: what the app meets, does not meet, or has not validated

Sources:
- the free preview of ISO 3382-2:2008, clauses 1–5.2.1 (scope, equipment, measurement positions with Table 1, and the
  start of the procedure);
- the Larson Davis 831-RT manual, which quotes ISO 3382-2 on spatial averaging and uncertainty.

Clauses 6–9 and the annexes were not available. Where this table relies on them it says so.

| Requirement (clause) | What the app does | Status |
|---|---|---|
| Survey method: at least 2 source–microphone combinations, at least 1 source position and 2 microphone positions (4.3, Table 1) | The device is the source and the receiver, and is moved: each position is a new source position and a new microphone position. A completed session needs 2 valid positions; a 3rd can be added | **Met for the number of positions.** Not met for the engineering method (6 combinations from at least 2 source positions) or the precision method (12) |
| The result of the survey method is the average over the combinations (4.3.2) | Per octave band: the arithmetic mean of the valid positions' RT60 (section 2) | **Met.** Arithmetic averaging of reverberation times is one of the two methods ISO 3382-2 describes (Larson Davis quotes it as "RT60 for room = arithmetic average of individual decay times"). Clause 8 itself not read |
| Positions at least half a wavelength apart (about 2 m) and at least about 1 m from surfaces (4.3.1) | The Measure step checks the plan positions against the room's length and width and warns when two are less than 2 m apart. The setup text asks for 1 m from walls | **Guidance only.** Where the user places the device cannot be checked |
| Minimum source-to-microphone distance d_min = 2·√(V/cT), to limit the direct sound (4.3.1) | One device cannot meet it: speaker and microphone are centimetres apart. The analysis separates the device's direct sound and starts the evaluation where it would at d_min (`analysis.js`, `directAllowanceDb`) | **Not met as written. Compensated in the analysis, validated on synthetic rooms only** (docs/RT60-DEEP-AUDIT.md E1) |
| Sound source: as omnidirectional as possible; no directivity requirement for the survey and engineering methods (4.2.1) | The device's own speaker | **Met for survey and engineering** (no requirement). Its directivity is not known |
| Omnidirectional microphones shall be used (4.2.2) | The device's own microphone; directivity unknown, varies by device | **Not validated** |
| Octave bands; survey frequency range at least 250 Hz–2 kHz, engineering 125 Hz–4 kHz (5.1) | Octaves 125–4000 Hz; a band a device cannot measure is left out and named | **Met when the device covers the range.** Phones often lose 125 Hz |
| Decay range: 35 dB above background for T20, 45 dB for T30 (5.2.1, written for interrupted noise; ISO 3382-1 4.2.1 asks the same of the impulse response method) | Usable decay ≥ 35 dB (T20) or ≥ 45 dB (T30), counted from the start of the room's decay below the direct sound | **Met** |
| Evaluation: T20 / T30 by least squares; non-linearity ξ and curvature C (Annex B) | Least squares over −5…−25 and −5…−35 dB. ξ ≤ 10 ‰ is good; a band above 50 ‰ gets no value; C above ±10 % gives a note | **Met.** Annex B's values come from secondary sources |
| Integrated impulse response: noise handling (truncation, compensation) | Lundeby truncation, tail compensation and noise subtraction | **Met** (as the standard allows; clause text not read) |
| Measurement uncertainty (Annex A) | Not stated (section 4) | **Not met.** Deliberately left out: the inputs are not established |
| Statement of results and test report (clause 9) | The PDF states the positions, each position's values, the per-band room values, method, device, quality warnings and limits | **Not verified against clause 9** (not available). The report claims no conformity |
| Equipment calibration / verification | None: consumer device, uncalibrated | **Not met.** Never claimed |

The app does not claim conformity with ISO 3382-2. Adding positions brings the procedure closer to the survey method,
but it does not validate the device, the microphone or the result. The PDF says this in its limitations.

## 2. Spatial averaging

`AM.services.spatial.aggregate(entries)` takes one **valid** result per position.

- **Per octave band f:** RT60(f) = (sum of the positions' RT60 at f) ÷ (how many positions have a reliable value at f).
  A position counts at f when the processing engine gave that band a value (the same rule as before:
  `rt60Average.eligible`).
- **Kept with each band:**
  - each position's value;
  - n of N, the number of positions it rests on;
  - the spread (longest − shortest);
  - the paths (e.g. `T30/T20`);
  - the quality: Good only when every position measured the band with quality Good, else Fair.
- **A band missing at some positions** is averaged over the others and says so ("measured at 1 of 2 positions").
- **A band missing at every position** has no value, with each position's reason. Nothing is extrapolated, weighted or
  substituted.
- **Why arithmetic averaging rather than ensemble-averaging the decay curves:**
  - each position's RT60 has already passed its own checks, which a combined curve would blur;
  - each position's own value stays visible;
  - the per-band result is easy to verify by hand.

  It is one of the two methods ISO 3382-2 describes.
- **Positions with no valid take** are not part of the room. Their latest take is listed with its reason (Measure
  step, Results, PDF notes), and they can be retried.
- **A new valid take at a position** replaces that position only. The earlier take is kept as superseded, with its
  position.
- **Session:** at least `MIN_POSITIONS` = 2 valid positions. Results does not continue with fewer.
  - Assessment, the report and the summaries computed from fewer say "provisional".
  - A project measured before this version keeps its take as P1, and its Results and Assessment are marked for review.
- **Each position has its own background check.** A take is blocked until the background has been measured at the
  position selected for the next take.
- **Recording checks per take are unchanged:** clipping, gaps, clicks, timing, gain, background change, browser
  processing and integrity.

## 3. The verdict policy

### Behaviour change

Until 2026.10.15, one figure decided the verdict: the all-band average (125–4000 Hz) was compared with the target range.
On 2026.10.16 that changed:
- **The verdict is the room's own criterion's band rule.** Every primary band the criterion sets has to lie within the
  target range.
- **The average over those bands** is the summary figure shown beside the verdict. It never decides alone: if a primary
  band is outside the range, the room does not meet the target even when the average is inside ("masked").
- **Bands with their own wider limits** in the criterion give band warnings. These are shown separately and do not
  change the verdict. *(Changed 2026-10-19: DIN 18041's 125 Hz and 4 kHz limits are now judged, as the standard
  requires; see the table below and docs/TARGET-CRITERIA.md. No verified criterion uses warning-only bands now.)*
- **A primary band that could not be measured** makes the verdict "Meets the target where measured" (incomplete). It is
  never a full pass.
- **The treatment amount and the prediction** aim at the same bands. The predicted result is judged by the same rule.
- **The all-band average (125–4000 Hz)** is still shown as the room's overall figure and stored in the report form
  (`measured_rt60_avg_s`).
- **The 500–2000 Hz average** is no longer shown on screen. It is kept in the diagnostics and in `derive.midAverageRT60`.

### Is 500–2000 Hz the right summary for meeting rooms?

**No.** The app's criterion for meeting and conference rooms is DIN 18041:2016:
- group A3, "Unterricht/Kommunikation";
- group A4 for video calls and hybrid meetings (the standard names the video-conference room as an A4 example).

DIN 18041 sets the target at the mid frequencies, and requires the reverberation time to stay within ±20 % of it in
every octave band from **250 Hz to 2 kHz**, with wider limits at 125 Hz and 4 kHz. A 500–2000 Hz average would leave out
a band the standard judges (250 Hz, where meeting rooms often ring too long). So meeting rooms are judged in 250 Hz–2 kHz.

Sources:
- C. Ruhe, "Akustik in Bildungsbauten", 5.2 Raumgruppe A: "im Frequenzbereich von 250 Hz bis 2000 Hz unter
  Berücksichtigung einer Toleranz von ± 20 % einzuhalten";
- InfoBauphysik 2016, "Die neue DIN 18041";
- the target itself: `js/data/targets.js`, unchanged.

### The policies

Since 2026-10-19 (standards-based targets, docs/TARGET-CRITERIA.md):

| Criterion (room uses) | Judged against the target range (the summary bands) | Judged against their own limits | Basis |
|---|---|---|---|
| DIN 18041 A1–A4: meeting, conference and board rooms, classrooms, lecture rooms, music rooms, training rooms | 250, 500, 1000, 2000 Hz | 125 Hz: 0.65–1.45 × T_soll; 4 kHz: 0.65–1.2 × T_soll (applied to the range edges: × 0.65/0.8 and × 1.45/1.2 or 1.2/1.2) | DIN 18041:2016 tolerance band, every octave band 125 Hz–4 kHz (BNB 3.1.4; Nocke 2016) |
| DIN 18041 A5: sports halls | 250–2000 Hz | none (125 Hz and 4 kHz shown without a limit) | DIN 18041:2016, A5 tolerance 250 Hz–2 kHz only |
| NBC 2016: offices and canteens (an upper limit) | 500 Hz, at most the limit | none (the other bands shown without a limit) | NBC 2016 Part 8 Sec. 4, cl. 8.3.2.1: all times at 500 Hz |
| EBU Tech 3276: listening and control rooms | 250–4000 Hz, the room's measured Tm ± 0.05 s; the measured Tm itself strictly between 0.2 and 0.4 s | 125 Hz: measured Tm − 0.05 to + 0.15 s | §2.3 and the tolerance mask (Fig. 1, drawn as T − Tm), at each octave's centre frequency |
| No verified criterion (the project's own target, entered by the user) | 500–2000 Hz | none | The app's convention, said wherever it is shown |
| A custom target | the bands of the room's criterion | as for that criterion, on the custom range | The custom range replaces the recommended one |

- **Group B rooms, homes, cinemas and places of worship** have no recommended target (docs/TARGET-CRITERIA.md); the ANSI
  classroom limit and the occupancy conversion were removed (unverified or superseded).
- **Thresholds** are compared at 0.01 s, the precision shown (`AM.acoustics.classify`).

### In plain words (for sales representatives)

Assessment and the PDF say, for example:
- "Meets the target: every band from 250 Hz to 2 kHz rings for between 0.48 and 0.72 s."
- "Does not meet the target: too much echo at 250 Hz (0.82 s). The average across 250 Hz–2 kHz is inside the range, but
  every band has to be."
- Band warnings are listed apart, saying what they mean, e.g. "low sounds will boom; panels that also absorb bass help".
  They state that they do not change the verdict.

## 4. Uncertainty: what can be established

No ± figure is shown, because its inputs are not established:

- **Statistical uncertainty (ISO 3382-2 Annex A).** Larson Davis quotes, from ISO 3382-2:
  - σ(T20) = 0.88·T20·√((1 + 1.90/n) ÷ (N·B·T20));
  - σ(T30) = 0.55·T30·√((1 + 1.52/n) ÷ (N·B·T30));
  - where B is the filter bandwidth, n the decays per position and N the positions.

  For the integrated impulse-response method, the decay is the ensemble average of many decays. The value of n that
  Annex A assigns to it could not be read from a source here. Without it the figure would be a guess, so it is not
  shown.
- **The spread between positions** is shown per band (Results, PDF). It is an observed difference, not an uncertainty:
  two positions are too few to estimate a standard deviation.
- **Systematic errors of the device** cannot be estimated from the recordings themselves:
  - microphone directivity and frequency response;
  - speaker directivity;
  - the compensation for the device's direct sound;
  - phone signal processing that the browser does not report.

  Only a comparison with a reference instrument can bound them (section 5).
- **Synthetic validation** (`tests/validation.html`, `tests/dsp.html`) shows the analysis reproduces known decays within
  −2.9 % to +1.6 % at 1 kHz. That covers the calculation only, not the device or the room.

Next step: obtain ISO 3382-2 Annex A. Then, if its n for the impulse method is confirmed, show the statistical σ per
band under "Show technical details", labelled as the statistical part only.

## 5. Reference validation plan (REW and a calibrated microphone)

The three kinds of evidence are kept apart:

| Kind | What it shows | Where |
|---|---|---|
| Automated tests | The code does what it is specified to do: aggregation by hand, verdict rules, report content, workflow, locking | `tests/*.html`, `tests/report_submission_test.py` |
| Synthetic-signal validation | The analysis reproduces the decay of synthetic rooms of known RT60, with a device-like direct sound, noise, distortion and faults | `tests/validation.html`, `tests/dsp.html`, `tests/rt60-responsiveness.html` |
| Real-room measurements | The device, its microphone and the method agree with a reference in real rooms | Not done; this plan |

### Equipment

- REW (Room EQ Wizard) on a laptop.
- A measurement microphone with an individual calibration file: an omnidirectional class 1 or class 2 measurement
  microphone with a USB interface, or a calibrated USB measurement mic.
- A separate loudspeaker, as omnidirectional as available.
- The phones and laptops the sales team uses (at least two models).

### Rooms

At least 5 rooms covering the use:
- small meeting room;
- large conference room;
- open office;
- classroom or training room;
- one reverberant room.

Each room should have an RT60 range of at least 0.3–1.2 s across them.

### Per room

1. Mark P1, P2 and P3 on the floor, at least 2 m apart and 1 m from walls. Note L × W × H, furnishing and occupancy (empty).
2. **Reference:**
   - REW sweep at each position, with the speaker at least d_min = 2·√(V/cT) from the microphone (in practice 1.5–3 m)
     and microphone at 1.2 m height;
   - two source positions × three microphone positions where practical (the engineering method's 6 combinations);
   - T20 and T30 per octave band;
   - export each impulse response as WAV.
3. **App:** a full session on each device at P1, P2 and P3 (3 takes per position, to see repeatability).
4. **Same-data check:** load the REW WAVs into `tests/validation.html` → "Analyse an impulse response". This compares the
   app's analysis with REW on identical data, which separates the method from the device.

### Compare per band (125–4000 Hz)

- app (device) against REW, per position and averaged over positions;
- app analysis of the REW WAV against REW (method only);
- repeatability of three takes per position;
- the spread between positions;
- the verdict (same / different) for the room's target.

### Acceptance

To be agreed before the study. As a starting point:
- 500 Hz–2 kHz within ±10 % of the reference average, the survey method's nominal accuracy (ISO 3382-2 4.3.2);
- 250 Hz and 4 kHz within ±15 %;
- the verdict the same as the reference's in every room.

Bands outside that, or devices that systematically differ, are documented. Their results get a warning, or the device is
not supported. No correction factor is introduced without this study, and none is introduced to match another app.

### Record

- a table per room / device / band;
- the WAVs;
- REW's exported results;
- the app's diagnostics (Results → Copy diagnostics).

## 6. Database (report form) and deployment

- **No column is added or changed.** The report form keeps the same columns:
  - `measured_rt60_s` holds the room's 1000 Hz value, now averaged over the positions;
  - `measured_rt60_avg_s` holds the room's all-band average;
  - `predicted_rt60_avg_s` holds the predicted average over the same bands as the all-band average.

  `app_version` 2026.10.16 tells the new rows apart. The verdict and the judged-range summary are not stored. Adding them
  would need new optional columns and a reviewed migration.
- **`predicted_rt60_avg_s`** (added in 2026.10.15, optional):
  - It holds the predicted RT60 **after treatment**, not an estimate of the existing room. The app never predicts the
    existing room's RT60; it measures it.
  - The app writes it when a prediction exists, and nothing in the app reads it back.
  - The server stores rows without it if the production table lacks the column: `app_server.py`, `insert()`, which
    retries without missing optional columns and logs it.
  - So running `server/supabase/schema.sql` again is **not required** for the app to work. Without it, that one value is
    simply not stored.
  - If it is wanted, the statement is additive and does not touch existing data:
    `alter table … add column if not exists predicted_rt60_avg_s …`.
  - Nothing was run against a database for this change.
  - If the product should stop collecting predicted values, remove the field from `js/data/report-form.js` (a code
    change). The column can stay; dropping it would delete stored data.

## 7. Report access

The approved access workflow is unchanged (`js/services/report-gate.js`, `server/app_server.py`):
1. The PDF unlocks only after the report form is received.
2. The server stores the submission and signs a receipt (HMAC).
3. Before **every** download the app asks the server to confirm the receipt.
4. A receipt the server does not confirm is forgotten, and the report is locked.

The server side rejects forged, altered and foreign receipts. That is tested in `tests/report_submission_test.py`
(`test_receipts`) and on the client in `tests/multi-position.html` A8.

**Limit, unchanged and documented.** The PDF is built in the browser from data the browser already holds. Someone who
edits the app's code on their own computer can still build a report. The database is the record.

Truly server-side enforcement would mean generating or signing the PDF on the server, or putting the measurement data
behind authenticated access. That would require sign-in for sales representatives, which the product currently excludes
(no login or accounts). It is a product decision, not made here.

## Measuring the positions in one place (21 October 2026)

The positions are measured on the Measure step without going back and forth:

- **Room preparation:** "Yes, the room is ready" on Measurement Setup ticks the six checklist items at once (each can
  still be ticked on its own). A follow-up project for the treated room starts with them ticked: the same room, prepared
  the same way.
- **One press per position:** Start measurement (or Measure P2, Retry P2) checks the background noise at that position first
  when it has not been checked there, then plays the sweep straight away. The take still never starts without a
  background check at its own position, and a check that is not usable, or stopped, starts no take.
- **The result on the same screen:** the take is processed right after it, with Processing's own calculation
  (stages/processing.js, `process`), while the Measure step stays on screen ("Working out the result"). A valid take
  moves the next take to the next position that still needs one ("P1 done. Next: P2"); a take that is not valid says
  why and offers Retry. With enough positions, See results marks Measurement and Processing done and opens Results.
  Processing stays as the place to look at each take's details.
