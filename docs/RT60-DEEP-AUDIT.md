# RT60 deep audit: measurement accuracy

12 October 2026. This follows the first audit (docs/RT60-AUDIT.md) and supersedes it where they differ (the T60 path).
docs/RT60-SWEEP-NOISE-AUDIT.md follows it: sweep length, the background-noise check, and sounds during a take.

**Question.** This app reads about 0.29–0.35 s in a room where other apps read 0.42–0.58 s. Is that an error in this
app, and what is each method doing?

**Method.**
- Competitor documentation and source code were read where public.
- Every step from the sweep to the displayed number was read in this app's code.
- The app's own analysis code was run unchanged, on synthetic rooms of known reverberation time
  (`tests/fixtures.js`).
- Every measured value is compared with the room's own decay. That decay is taken from the room's noise-free impulse
  response over the same ISO 3382-2 range: no sweep, no noise, no device.
- The full application was run end to end through the virtual-room harness.

Nothing here was measured in a real room. Section 8 says what is needed for that.

## Answer in brief

**Is the gap explained?** Not by an error in this app.

- **Known rooms.** In 59 synthetic cases, 0.30–0.70 s, wherever the app gives a value at 1000 Hz it is within −2.9 % to
  +1.6 % of the room's own value. The one exception is the known limitation below. That holds with one device on a
  desk, every background level that leaves enough decay, sweep lengths of 2.5–10 s, sample rates of 44.1–96 kHz and a
  double-slope decay.
- **No fault produces the gap.** No condition tested makes the app read 25–45 % short while still showing a value. The
  only short reading found is a decay cut off just above the background (−9 %). The app marks that value questionable,
  with medium confidence.
- **The fixes do not raise values.** Four errors were corrected. Each one either removed an over-reading or rejected
  bad data, so none of them closes the gap.

**What does reproduce the gap?** Two method differences, run on identical data. The room has 1000 Hz at 0.33 s and
longer bass, as furnished rooms do.

| Reading of the same room | Value |
|---|---|
| This app: 1000 Hz octave band, the number it shows | 0.331 s |
| Mean of 500 and 1000 Hz (ISO 3382 "mid-frequency" value) | 0.369 s (+11 %) |
| Mean of 125–4000 Hz | 0.413 s (+25 %) |
| A clap read with the method in the source code of the open-source "RT" app: 500–1000 Hz mean, then 125–4000 Hz mean | 0.40–0.48 s |
| The same, with a quieter clap: 1000 Hz | 0.57 s |

This is the same pattern as 0.29–0.35 s against 0.42–0.58 s. It is **plausible, not proven** for the user's room. What
BuzziSpace RT60 calculates is not documented publicly, so it cannot be checked. Confirming the cause needs the
same-data comparison in section 8.

---

## 1. Competitor and reference research

Sources were fetched on 12 October 2026. Page contents came through a summarising web fetch. Only the GitHub source
files were read as code. "Not documented" means the public pages do not say; it does not mean the feature is absent.

### Verified

**RT, by Gabi Moreno** (Android, open source, Apache-2.0)
- **Excitation and capture:** a hand clap, after a countdown. The microphone source is used at 44.1 kHz, 16-bit mono.
  It records until stopped.
- **How the decay is derived (read in the code):**
  - one forward band-pass Butterworth filter per octave (iirj), so the filtering is causal;
  - the first 50 ms of the recording are muted;
  - the squared signal is summed forward over the **whole recording**, and the curve is 10·lg(1 − sum/total). That is a
    Schroeder curve with **no truncation and no noise compensation**.
- **Evaluation:** the first samples nearest −5 dB and −15 dB, and RT = 6 × the time between them. This is a two-point
  reading; the code's only method entry is labelled EDT. There is no regression and no reliability check.
- **Bands:** six octaves, 125–4000 Hz. The README mentions an average, but the code that computes it was not found.
- **Code quirk:** the 2 kHz result takes its −15 dB point from the 4 kHz curve, and the 4 kHz result is read from an
  8 kHz curve.
- **Evidence:** github.com/soygabimoreno/RT at commit 3904b7d. Files: `ReverbTimeCalculator.kt`,
  `SchroederIntegral.kt` and its test, `NormalizeAndLinearToLogarithmic.kt`, `FindPositionByAmplitude.kt`,
  `ReverbTimeMethod.kt`, `FilterIIRJ.kt`, `Recorder.kt`.

**REW** (Room EQ Wizard; help page *graph_rt60*)
- **Excitation:** a sweep (REW's own measurement) or an imported impulse response.
- **How the decay is derived:** Schroeder backward integration of the squared IR, then a best-fit regression. An IR
  truncation setting exists.
- **Evaluation:**
  - EDT from 0 to −10 dB, T20 from −5 to −25 dB, T30 from −5 to −35 dB;
  - Topt: a start point at the intersection of the EDT and T30 lines, with the best end point.
- **Bands:** octave or one-third octave.
- **Reliability:** correlation |r| < 0.99 is flagged as possibly unreliable.
- **Note:** REW warns that in small rooms the −5 dB point can fall within the early decay, so T20 and T30 underestimate.

**SignalScope X Room Analyzer** (Faber Acoustical; help page *tools/room*)
- **Excitation and capture:** the IR comes from the app's tools or from a WAV/AIF/CAF file.
- **How the decay is derived:** reverse integration of the squared IR, with optional limits.
- **Evaluation:** EDT, T20, T30 and T60, given "assuming sufficient decay".
- **Bands:** full band, octave or one-third octave. Low, mid and high groups follow ISO 3382, with mid = 500 Hz + 1 kHz.

**BuzziSpace RT60** (buzzi.space/RT60-app; App Store id1613535156)
- Measures reverberation in small to medium rooms. Version 3.2 notes say results are per frequency; the bands are not
  listed.
- **Not documented:** the excitation, the microphone, the metric (T20, T30 or EDT), any averaging, noise handling and
  accuracy. A balloon is mentioned only in a search summary of the Archello page, which returned HTTP 403 — unconfirmed.

### Search summaries only (not fetched)

**NTi Audio XL2** (nti-audio.com news page)
- **Excitation:** an impulse (pistol, clapper, balloon) with auto-trigger, or gated pink noise from an omnidirectional
  source.
- **How the decay is derived:** Schroeder integration.
- **Evaluation:** T20 and T30, extrapolated to 60 dB.
- **Bands:** octave bands 63 Hz–8 kHz; one-third octave with an option.
- **Averaging:** repeated measurements are averaged.

**SoundOut Room Acoustics Analyzer** (Macquarie University study)
- On iPad against a sound level meter: maximum deviation 0.03 s, mean 0.01 s. One app on one device type.
- No independent study comparing several apps against a reference was found.

### Assumptions made in this audit

None about competitor algorithms beyond the above. The "RT app method" in the validation page reproduces only what its
code shows, without the 2/4 kHz quirk. ISO 3382-2 itself was not fetched. Its definitions as used here (T20/T30
ranges, ξ, curvature C, truncation and tail correction, noise subtraction) are standard, and REW's page agrees with
them.

## 2. Source-code audit, sweep to displayed RT60

| | Item | What the code does | Verdict |
|---|---|---|---|
| A | Sweep | Exponential sine sweep, 50 Hz to 10 kHz (at most 45 % of fs), 5 s, −3 dBFS. 0.3 s raised-cosine fade-in and 10 ms fade-out. 1 s recorded before and 4 s after. Inverse filter: the time-reversed sweep × e^(−t·ln(f2/f1)/T), Farina (`analysis.makeSweep`) | Correct. Covers the 125 Hz band (edges 88–177 Hz) to the 4 kHz band (to 5.66 kHz) at every rate. Harmonic distortion lands before the IR and is separated: values within 1.1 % at about 12 % third-harmonic distortion |
| B | Recording, IR | getUserMedia with echo cancellation, noise suppression and AGC requested off, and read back. AudioWorklet tap; exactly `total` samples. FFT deconvolution. Arrival read from the IR peak, accepted up to 1 s and only if 20 dB clear. IR used only where the recording continued past the sweep (`analyseTake`) | Correct (delays 0–0.9 s within 1.5 %). **Missing: gap detection → added (E3)** |
| C | Bands | IEC 61260 base-2 octaves 125–4000 Hz, edges fc/√2 and fc·√2. 6th-order Butterworth high-pass + low-pass, run time-reversed. B·T ≥ 4 required (`dsp.js`) | Correct: −3.01 dB at the edges and about −36 dB one octave out, at 44.1/48/96 kHz |
| D | Decay, T20/T30 | Lundeby noise floor and truncation. Schroeder integration of (squared IR − noise) plus the extrapolated tail. Least-squares fits: T20 over −5…−25 dB, T30 over −5…−35 dB, counted from the start of the room's decay below the device's direct sound. T = −60/slope, which is the 20 dB decay time × 3 or the 30 dB decay time × 2 | T20/T30 ranges and extrapolation as specified (test "T20 … and T30 … from their own ranges": T × slope = −60). **Errors: E1 (direct-sound separation), E2 (60 dB path)** |
| E | Noise, processing | Usable decay ≥ 35 dB for T20, ≥ 45 dB for T30. ξ ≤ 50 ‰. Browser-reported processing → no value. Background check before the take | Correct. **Missing: decays cut off by a gate or by processing → added (E4); diagnostics added (D1)**. Processing in the operating system or driver cannot be seen by a browser (documented) |
| F | Displayed value | Headline = the 1000 Hz octave band's RT60 and its method. Shown to 0.01 s. The same object feeds Results, Assessment, Prediction and the report | Consistent (9 display checks and the end-to-end run). **Label gap:** the top bar ("Measured") and Home ("Measured RT60") do not say "at 1000 Hz", while Results, Processing and the report do. That invites comparison with apps that show an average. Recommended; not changed, because the brief excludes UI changes |

## 3. Confirmed errors

**E1. Direct-sound separation misread a fast early decay** (`analysis.js` `analyseBand`)
- **Root cause.** The device's direct sound is estimated by extrapolating the late decay back to the arrival. In a
  double-slope room (a fast early decay, then a slower late one), the whole early decay counted as "direct sound". The
  evaluation then started in the late decay.
- **Effect.** Over-reading of +18 % at 1000 Hz in the test room, and +4 % to +90 % across earlier experiments.
- **Correction.** The direct part is capped at what the decay curve loses in the first 5 ms after the arrival
  (`CRITERIA.decay.directWindow`). One device's direct sound and the desk reflection arrive within that time. The rest
  is room decay and stays in the evaluation, as in ISO 3382-2.

**E2. The 60 dB fit took over in very quiet takes** (`processing.js` `decideBand`)
- **Root cause.** The cascade preferred a −5…−65 dB fit whenever 75 dB of decay were usable. ISO 3382-2 evaluates T20
  and T30. In a curved decay the 60 dB fit reads a different part of the curve.
- **Effect.** The same room gave different values depending on how quiet it was: 125 Hz read 0.719 s at a −55 dBFS
  background and 0.791 s at −95 dBFS.
- **Correction.** Only T30, then T20. The 60 dB fit is still computed for information. The UI wording that named T60
  was updated to match. Those are text-only changes in the Processing step and its explanation.

**E3. Gaps in the recording passed as valid** (`analysis.js` `analyseTake`)
- **Root cause.** When a browser fails to deliver audio, it fills the gap with zeros. A gap during the sweep spreads
  through the whole impulse response, and no check looked for it.
- **Effect.** Wrong band values shown as valid, compared with the same take without the gap:
  - one 128-sample block gave 1000 Hz 0.673 s for a 0.607 s room, and in another take 250 Hz 1.036 s instead of
    0.527 s;
  - 20 ms gave 1000 Hz 1.002 s instead of 0.525 s.
- **Correction.** The take is rejected when a run of identical samples of 1 ms or more lies at least 20 dB below the
  signal around it during the sweep. The message gives the gap's position and length (`analysis.gap`).
- **False alarms.** None in a noise-free 16-bit take down to −70 dBFS.

**E4. Decays cut off part-way passed as valid** (`analysis.js` `analyseBand`, `processing.js`)
- **Root cause.** A noise gate, noise suppression or a gap after the sweep can end the decay abruptly. Nothing
  recognised a decay that falls faster than any room can.
- **Effect.** A 0.70 s decay cut off at −26 dB read 0.57–0.59 s (−16 %) and was shown as valid.
- **Correction.** The band gets no value, with the reason, when 30 ms at least 15 dB above the background are followed
  by 50 ms within 6 dB of it, a fall 15 dB larger than the band's own T20 slope allows (`CRITERIA.decay.cutoff`).
- **False alarms.** None in 420 normal bands: RT 0.15–1.2 s, background −80 to −48 dBFS, with no direct sound, one
  device, and a laptop speaker with no bass.

**D1. A diagnostic, not an error** (`processing.js`)
- A room's decay is a sum of decaying modes, so it can only flatten with time: T30 ≥ T20, apart from random scatter (up
  to about 6 % in the tests).
- The curvature note now says which way the decay bends. Slowing down is a curved, double-slope decay. Speeding up
  (C < −10 %) points to processing cutting the end of the decay, a candidate cause of short readings on some devices.

**Checked and left unchanged** (no evidence of error):
- the ξ limit of 50 ‰ (valid 125–250 Hz bands reach 45 ‰);
- the T20 and T30 decay requirements (35 and 45 dB);
- the 1000 Hz reference band;
- the noise subtraction and tail correction from the first audit;
- the target formulas, product data and recommendations (outside this audit).

## 4. Before and after (same recordings)

"Before" means the same recording run through the analysis as it was before this audit. The validation page computes
this column live.

| Case | Expected (room's own) | Before | After |
|---|---|---|---|
| Double-slope decay, no direct sound, 1000 Hz | 0.663 s | 0.788 s (+18.9 %) | 0.663 s (0.0 %), flagged as curved |
| Double-slope decay, one device (direct sound 20 dB) | 0.663 s | 0.784 s (+18.3 %) | 0.644 s (−2.9 %), flagged as curved |
| Same room, 125 Hz, background −55 / −95 dBFS | 0.720 s | 0.719 / 0.791 s (T60) | 0.719 / 0.720 s |
| Same room, 1000 Hz, −55 / −95 dBFS | 0.796 s | 0.798 / 0.803 s (T60) | 0.798 / 0.796 s |
| One 128-sample block missing during the sweep | 0.607 s | 0.673 s (+10.9 %), valid | rejected: gap of 2.7 ms at 4.07 s |
| 20 ms missing during the sweep (dsp test room) | 0.525 s (same take, no gap) | 1.002 s (+91 %), valid | rejected: gap of 20 ms, with its position |
| Decay cut off at −26 dB (0.70 s room) | 0.698 s | 0.586 s (−16.0 %), valid | no value: "cut off 300 ms after the arrival" |
| Decay cut off ≈13 dB above the background (known limitation) | 0.293 s | 0.265 s | 0.267 s (−9 %), Medium confidence, "not perfectly straight" |
| One device on a desk, single-slope, RT 0.30–0.70 s | — | −1.0 % … +1.4 % | −2.0 % … +1.4 % |

**Why the last row moved.** The test adds room reflections at 6.5–26 ms (−31 to −43 dB) to the device's response but
not to the reference. The cap now keeps them in the room's decay, which is where ISO 3382-2 puts them. The change is
at most 2 %, within tolerance.

## 5. Automated tests against known RT60

Run with `tests/validation.html` (68 checks), `tests/dsp.html` (47), `tests/calculations.html` (22) and
`python -B tests/report_submission_test.py` (26). **All pass.**

Error = Measured − Expected, where Expected is the room's own decay over the same range. Tolerance is 5 % for T30 and
8 % for T20.

**Known RT, 1000 Hz**

| Nominal RT | Reference conditions | One device on a desk |
|---|---|---|
| 0.30 s | 0.301 vs 0.301 s, ±0.000 s (−0.1 %), T30 | 0.286 vs 0.282 s, +0.004 s (+1.4 %), T30 |
| 0.40 s | 0.384 vs 0.383 s, +0.001 s (+0.2 %), T30 | 0.413 vs 0.412 s, +0.001 s (+0.1 %), T20 |
| 0.50 s | 0.500 vs 0.501 s, −0.001 s (−0.1 %), T30 | 0.473 vs 0.483 s, −0.010 s (−2.0 %), T20 |
| 0.60 s | 0.591 vs 0.592 s, −0.001 s (−0.2 %), T30 | 0.587 vs 0.599 s, −0.012 s (−2.0 %), T20 |
| 0.70 s | 0.721 vs 0.722 s, −0.001 s (−0.1 %), T30 | 0.726 vs 0.719 s, +0.007 s (+1.0 %), T20 |

- **Other bands:** in reference conditions the other five bands are within 0.5 %. With one device, 125–4000 Hz are
  within 7.6 %.
- **Expected vs nominal:** Expected differs from nominal by up to ±6 %, because a synthetic octave band's decay
  scatters around its nominal value. The page shows both.

**Larger case set** (worst absolute error at 1000 Hz)

| Group | Cases | Worst error | Outcome |
|---|---|---|---|
| Background −85, −75, −65, −58 dBFS | 4 | −2.0 % | T30 from 45 dB usable, T20 from 35 dB |
| Background −52, −46 dBFS | 2 | — | No value: "Only 30 / 24 dB of the room's own decay …" |
| Sweep 2.5 / 5 / 10 s × RT 0.3 / 0.7 s | 6 | −2.4 % | — |
| Sample rate 44.1 / 48 / 96 kHz × RT 0.4 / 0.6 s | 6 | −2.1 % | — |
| RT varying by band, 125–4000 Hz | 6 | +4.1 % (125 Hz, T20) | 1000 Hz +1.6 %. Against band-centre nominal up to −19 %, because a band mixes its neighbours' RT; hence comparison with the room's own decay |
| Double-slope decay | 2 | −2.9 % | Flagged as curved (C = +34 / +36 %) |
| Playback delay 0–0.9 s | 4 | +1.5 % | — |
| Playback delay 1.2 s | 1 | — | Rejected: signal not found |
| Recording ends 0.8 s after the sweep, RT 0.70 s | 1 | −0.8 % | T20 |
| Speaker distortion, third harmonic −18 dB | 1 | +1.1 % | — |

**Faults, each identified by its reason:**
- rejected: clipping, recording stopped early, recording ended 0.3 s after the sweep, 128-sample and 20 ms gaps, no
  test signal;
- no value: weak decay (−50 dBFS background), decays cut off at −26 and −13 dB, browser noise suppression on;
- no value, reported as too little usable decay: third-harmonic distortion at −14 dB (about 20 %).

**T20, T30 and unreliable cases.**
- T30 is used from 45 dB of usable decay, T20 from 35 dB, and below that there is no value with the reason. Examples:
  −85 dBFS gives T30, −65 dBFS gives T20, −52 dBFS gives none.
- A band where T30 is reliable but T20 is not cannot occur. The T30 range contains the T20 range, so the check that
  matters is the curvature between them, and it is flagged in both directions.

**Display (9 checks, all pass).**
- The headline is the 1000 Hz band's value and method in all 45 valid results.
- No headline appears in the 14 invalid results.
- Every one of the 268 band values comes from T30 or T20 with enough decay, ξ ≤ 50 ‰ and B·T ≥ 4. Every band without a
  value says why.
- Results, Assessment, Prediction and the report read the calculated values unchanged; the display rounds to 0.01 s.

**End to end (virtual room, the whole app).**
- Room: 1000 Hz nominal 0.32 s, direct sound 28 dB, background −65 dBFS.
- Background measured: −65.0 dBFS, steady.
- Take: 0.318 s, T30, 49 dB usable, all 6 bands reliable.
- Shown as 0.32 s in the top bar, Processing and Results ("0.159 s × 2 = 0.32 s"). The same value reached Assessment
  and the report model. No console errors.

## 6. The 0.29–0.35 s vs 0.42–0.58 s gap

**Ruled out as causes of a 25–45 % short reading, on synthetic data:**
- sweep generation, deconvolution, delay handling and band filters at 44.1/48/96 kHz;
- the T20/T30 ranges and the extrapolation;
- the device's direct sound and desk reflections;
- background noise;
- sweep length;
- distortion.

**Reproduced on identical data: method differences.** Same-room table in `tests/validation.html`.

1. **What number is shown.**
   - This app shows the 1000 Hz octave band.
   - ISO 3382's "mid-frequency" value is the mean of 500 and 1000 Hz.
   - Many apps show an average over bands.
   - In rooms whose bass decays longer, as furnished rooms' does, those numbers are larger: +11 % for 500–1000 Hz and
     +25 % for 125–4000 Hz in the test room.
2. **How the decay is read.** The method in the RT app's code integrates over the whole recording with no truncation,
   reads only −5 and −15 dB, and uses causal filters.
   - With a clean clap it reads close at 1000 Hz (+3 % to +7 %), but its means are 0.40–0.48 s for a 0.33 s room.
   - With a quieter clap (40 dB) it reads 0.57 s at 1000 Hz (+75 %), and the low bands become meaningless.
3. **Early vs late decay.** REW notes that T20/T30 underestimate in small rooms where the −5 dB point lies in the early
   decay. Its Topt and late-decay readings give longer values in curved decays. In the double-slope test room, T20 =
   0.50 s, T30 = 0.66 s, and the late decay is 0.80 s.
4. **Not yet tested: processing on the user's device.** Operating-system or driver processing (noise suppression,
   "voice focus") can shorten the end of a decay, and a browser cannot see it.
   - A cut well above the background is now rejected (E4).
   - A cut close to the background is not, and reads short (−9 % in the test).
   - The new curvature note (D1) and the Processing table show it when it happens.

**Conclusion.** No error in this app explains the gap. Differences 1–3 can produce it, alone or together, and 4 could
add to it. Which one applies cannot be decided without the user's data: sections 7 and 8. No correction factor was
applied, and none should be.

**Evidence that would settle it** (for the user's room):
1. A screenshot of each competitor's result, showing whether the value is per band or an average, and which band.
2. This app's per-band table from the same position and session: Processing → Band by band, or the PDF report. That
   gives T20, T30, usable decay, curvature and notes for each band.
3. A clap recorded as WAV, analysed by the RT app and by `tests/validation.html` (WAV tool) on the same file.
4. A reference measurement (section 8). Ideally its IR exported as WAV and loaded into the WAV tool, so this app's
   algorithm and the reference read the same data.

## 7. Remaining uncertainties

- **Synthetic rooms only.** These tests check the algorithm. Speaker directivity, the microphone's response, the room's
  diffuseness and positions are not modelled beyond a desk and reflections.
- **Processing below the browser.** OS or driver processing cannot be detected. Cuts close to the background are not
  caught; the −9 % case is flagged only as "not perfectly straight".
- **Low frequencies.** With a laptop or phone speaker, 125 Hz (sometimes 250 Hz) is often not reliable. That is
  reported, not estimated.
- **Competitors.** BuzziSpace's method is unknown. The RT app's average and default filter order are not verified.
  NTi was read from search summaries only.
- **No real-room comparison yet.**

## 8. Real-world validation procedure

Criteria are fixed here, before any testing.

**Reference.**
- ISO 3382-2 (engineering method) with a calibrated measurement microphone (IEC 61672 class 1, or REW with a calibrated
  USB microphone).
- An omnidirectional or full-range loudspeaker, at least 1 m from the microphone.
- Sweep excitation. T30 per octave band, 125–4000 Hz.
- Source and microphone positions as ISO 3382-2 requires for the engineering method.
- Each reference position repeated three times.

**Rooms.** At least three, spanning about 0.3–1.0 s at 1000 Hz. Include one small furnished room like the user's.

**This app.**
- At each reference microphone position, the device lies where the microphone was, as the app instructs.
- Three takes per position, in the same session as the reference.
- At least two devices (a laptop and a phone), with operating-system microphone effects switched off.
- Record the per-band table of every take.

**Same data (isolates the algorithm from the device).**
- Export the reference IR from REW as WAV and load it into `tests/validation.html` (WAV tool).
- Record one clap as WAV with a phone, and analyse it with the competitor app (if it accepts files) and with the WAV
  tool.

**Competitors.** Same positions and session. Write down exactly what each displays: band or average, and which method,
if stated.

**Acceptance criteria.**

| What | Criterion |
|---|---|
| Algorithm, same IR WAV | This app's T20 and T30 within 3 % of REW's for the same band, 250–4000 Hz |
| App vs reference, 500, 1000 and 2000 Hz | Per room, the mean of the app's takes within max(0.05 s, 10 %) of the reference mean |
| App vs reference, 250 and 4000 Hz | Within max(0.05 s, 15 %), or "Not reliable" with a reason |
| 125 Hz | Reported only; no criterion with built-in speakers |
| Repeatability | Standard deviation of three takes at one position ≤ 5 % (or ≤ 0.02 s) at 500–2000 Hz |
| Between devices | Device means within 10 % of each other at 1000 Hz |
| Quality flags | No take accepted as "Good / High" whose 1000 Hz value fails the reference criterion |

**Reading the outcome.**
- If the same-data check passes but the device takes fail, the cause is the device, its processing or the positions,
  not the algorithm.
- If the same-data check fails, the algorithm is wrong.
- If the app passes against the reference while a competitor differs, the difference is that competitor's method or
  number, as section 6 describes.

**Uncertainty to report.** Reference repeatability (the standard deviation of its repeats), this app's repeatability,
the spread across positions, and the difference of the means with its 95 % interval.

## 9. Code changes

| File | Change |
|---|---|
| `js/measurement/analysis.js` | `CRITERIA.decay.directWindow` (5 ms) caps the direct-sound part (E1). Gap check in `analyseTake`: `CRITERIA.take.gapSeconds`, `gapSkip` and the `gap` field (E3). Cut-off check in `analyseBand`: `CRITERIA.decay.cutoff` and the `cutoff` field (E4). Header comments updated |
| `js/services/processing.js` | T30 → T20 cascade, the 60 dB fit for information only (E2). Cut-off bands get no value, with the reason (E4). The curvature note gives its direction (D1). Header comment updated |
| `js/stages/processing.js`, `js/services/explain.js` | Text only: the T60 row and its mentions removed, so the Processing step describes the calculation it shows |
| `README.md` | Take checks (gaps), direct sound (cap), cut-off decays, decision, tests |
| `tests/dsp.test.js` | Two checks now compare with the room's own decay instead of the nominal value. They had passed only because the 60 dB fit happened to land near nominal in a curved 125 Hz decay. Seven new checks: double slope ×2, background independence, gaps, no false gap, cut-off, nominal 500 Hz–4 kHz. 47 checks in total |
| `tests/validation.html`, `tests/validation.test.js` | New: the validation report, before/after, display checks, same-data comparison, WAV tool |
| `docs/RT60-DEEP-AUDIT.md` | This report |

**Not changed:**
- room-target formulas, product data and recommendations;
- UI layout and navigation;
- any other step;
- the report form and server.

**Regression results:**
- dsp 47/47; calculations 22/22; validation 68/68; report submission 26/26;
- the virtual-room end-to-end run (above), with no console errors.
