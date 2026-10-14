# Mobile measurement reliability audit — findings (phase 1: investigation)

Status: phase 1 (sections 1–10) was the investigation. **Phase 2 (section 11) implemented the fixes** for the false
"background is high" warning, the device profiles and configuration, recording integrity and the fixed-band headline,
with automated tests. Physical phones and laptops are still untested (section 11.6).

Evidence comes from three sources, kept apart:

| Source | What it can show | What it cannot show |
|---|---|---|
| Code inspection (this repository, commit `1a8f575`) | the exact path from microphone to result, every check and assumption | what a browser or phone actually does |
| `tests/mobile-study.html` — synthetic recordings through the production analysis | how the software responds to each modelled condition, one at a time, five takes each | whether a real phone produces that condition |
| Layout checks at 375 × 812 px (desktop Chrome, device emulation) | layout, overflow, touch-target size | real mobile browsers, audio, permissions, lifecycle |

No physical phone was available to this audit. Every statement about real devices below is labelled **hypothesis**.

## 1 Architecture and measurement flow

Everything that produces a measured value runs **in the browser**, identically on laptop and phone, locally and on
Vercel. The server (`server/app_server.py`, or `api/*.py` on Vercel) only stores the report form; it never sees audio or
results. The only environment difference for measurement is that phones need **HTTPS** for the microphone, so phones
could only be tested after the Vercel deployment.

```
getUserMedia({audio: echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:{ideal:1}})
  │  audio-io.js Session.open: track.getSettings() read once → take.settings (only keys the browser reports)
  ▼
AudioContext (device rate, latencyHint interactive) ── MediaStreamSource ── tap (AudioWorklet, else ScriptProcessor)
  │  levels every 2048 samples; raw samples while recording; watchdog: no samples for 2.5 s → abort
  ▼
measurement.js measureRT60: plan = sweepPlan(ctx.sampleRate); exponential sweep 50 Hz–10 kHz, 5 s, played through the
  same AudioContext (same clock); recording 1 s pre-roll + 5 s sweep + 4 s tail
  ▼
analysis.js analyseTake
  1 rejects: incomplete · silent · clipped (≥ 0.999) · sweep < 10 dB above pre-roll · arrival unclear (< 20 dB) ·
    zero-filled gap ≥ 1 ms during the sweep
  2 deconvolution → impulse response; latency read from the arrival
  3 per octave band 125–4000 Hz: time-reversed 6th-order filter; Lundeby noise floor; noise-compensated Schroeder
    curve with tail; direct sound separated (headDb); T20/T30/T60 fits; cut-off detector; background sounds
  ▼
processing.js evaluate / decideBand: T30 if ≥ 45 dB usable, else T20 if ≥ 35 dB, else no value; reject if ξ > 50 ‰ or
  B·T < 4; quality Good/High only for T30, straight, |C| ≤ 10 %, no warnings. Take invalid if 1000 Hz has no value, or
  if the browser REPORTS echo cancellation / noise suppression / AGC as on.
  ▼
rt60-average.js: headline = mean of the bands that have a value (any subset of the six)
  ▼
Results · Assessment (1000 Hz vs target) · Prediction (per band) · PDF
```

Platform-specific code paths: none in the analysis. The only device-dependent branches are the tap (AudioWorklet vs
ScriptProcessor fallback), the placement advice text (`deviceKind`) and whatever the browser does below the API.

## 2 Root causes, ranked

### Confirmed software defects

**D1 · High · A changing set of bands changes the headline average, between devices and between takes.**
- Code: `js/services/rt60-average.js` `of()` (eligible = any band with a value); headline everywhere since the average change.
- Evidence (study, identical room):
  - A small speaker loses 125 Hz: the average reads **−6.7 %** while every common band is unchanged (1 kHz +0.0 %,
    500–4000 Hz mean −1.1 %).
  - A phone-like condition uses 3 or 4 bands from take to take: the average reads **−11.3 %**, with a take-to-take spread
    of 0.432–0.450 s (sd 0.009 s, against 0.002 s on the laptop-like reference) because 500 Hz flips between T20 and none.
- Cause: the definition averages whatever bands pass. Low bands, which phones measure least, are the longest, so losing
  them shortens the "average" without any change in the room.
- This is the most likely software contribution to "phone readings differ from the laptop" and "readings jump". It is
  algorithm-amplified, not acoustic. **Needs a product decision** (section 6, R4); not a threshold to tune.

**D2 · Critical (if it occurs) · Lost samples without zero fill are not detected and give large wrong values.**
- Code: `analysis.js` analyseTake gap check finds only runs of identical samples (zero-filled dropouts).
- Evidence: 128 samples (2.7 ms) removed mid-sweep → **accepted 5/5**; 500 Hz reads **0.93 s instead of 0.51 s
  (+82 %)**, labelled Fair with a note blaming "uneven absorption or coupled spaces"; average +14.3 %. The same dropout
  zero-filled is rejected 5/5, as designed.
- Occurrence on phones: **hypothesis** (capture/render buffer overruns, clock correction, background throttling can drop
  samples). The detection gap is confirmed; whether phones trigger it is not.

**D3 · High · Unreported browser processing is treated as switched off; results keep full confidence.**
- Code: `measurement.js` `pickSettings` keeps only reported keys; `processing.js` rejects only `=== true`;
  `results.js` `onSettings` says **"Switched off"** when any one of the three is reported off.
- Evidence: an automatic gain the browser does not report (modelled, 6 dB/s) is accepted 5/5 with **250 Hz +15.8 %**
  (T30) and **500 Hz +5.5 % labelled Good, High confidence**; at 30 dB/s every band falls back to T20 and 125–250 Hz
  are lost. Nothing in the take says why.
- Platform note (**hypothesis**, to verify on device): WebKit (Safari, and every browser on iOS) is not known to report
  `autoGainControl` or `noiseSuppression` in `getSettings()`; Android devices may apply effects below the browser.

**D4 · Medium · The Results summary of browser processing can overstate.** `results.js` line 16: "Switched off" when only
one of the three settings is reported off. Measurement Setup words the same data correctly ("not reported").

**D5 · Low · A reason can read "Only 35 dB … T20 needs 35 dB".** `processing.js` decideBand rounds the usable decay
(34.6 → 35) in the text while comparing the unrounded value. Seen in the study at −30 dBFS playback.

### Confirmed robust (no change needed)

| Condition | Result |
|---|---|
| Direct sound 30 dB (speaker and microphone ~1 cm) | 125 Hz +2.2 %, every other band within 0.3 % of the reference |
| 44.1 kHz instead of 48 kHz | 125 Hz −3.7 %, other bands within 1.6 % (1 kHz +1.4 %); no hard-coded sample rate in the measurement path |
| Soft limiter before the converter (no sample at full scale) | 125 Hz −4.9 %, 4 kHz +3.7 %, others within 1 %; average −0.3 % |
| Zero-filled dropout | rejected 5/5 with the reason |
| Quieter playback / louder background | values stay within tolerance; bands move T30 → T20 → no value, and the take is rejected when 1 kHz has < 35 dB usable (correct, physically justified) |
| A broadband gate acting after the sweep | within 0.9 % at every band: in the deconvolved response it falls far beyond each band's decay. This does not model a phone's spectral noise suppression (H4) |

### Unresolved hypotheses (need physical devices)

| # | Hypothesis | Why plausible | Evidence that would settle it |
|---|---|---|---|
| H1 | iOS routes playback to the earpiece while the microphone is open, so the sweep is much quieter | WebKit uses a play-and-record audio session | `levels.sweepDbfs` and `snrDb` per take: iPhone vs laptop at the same volume |
| H2 | Phone hardware or OS applies AGC / noise suppression the browser does not report | vendor audio effects sit below the browser | background after the decay vs before (see R2): a uniform rise of several dB |
| H3 | Phones drop samples during takes | load, power saving, buffer overruns | the sweep-timing check proposed in R1 |
| H4 | Spectral noise suppression shortens decays | it acts per frequency during the sweep, unlike the gate modelled | device takes with the suppression known on / off |
| H5 | Small phone speakers have no usable output below ~500–700 Hz | physics of micro-speakers | per-band "Not reliable" pattern on the phone |
| H6 | Lifecycle events (lock, call, app switch, route change) corrupt rather than abort a take | no `visibilitychange`, `pagehide` or track `mute` handling exists; a muted track delivers silence, not an error | interruption tests on device |

What "too sensitive" means is not yet known precisely. Candidates, each with a different cause: the average jumping
between takes (D1), values differing from the laptop (D1, H1, H5, T30 → T20 switching), the live meter or the noise
check reading high (phone microphone gain, H2). **Needed from you:** phone model, OS and browser; the values seen on
the phone and on the laptop (headline and per band, with T20/T30); whether consecutive phone takes at one spot differed.

## 3 Cross-device compatibility matrix

| Configuration | Audio capture | Measurement | Layout 375 px | Status |
|---|---|---|---|---|
| Desktop Chrome / Edge (Windows) | previously verified (earlier audits) | verified on synthetic and virtual-room tests | — | tested |
| Synthetic 48 kHz and 44.1 kHz | n/a | within tolerance | n/a | tested |
| Desktop Chrome, 375 × 812 emulation | n/a | n/a | no page overflow on Home, Processing, Results; band table scrolls in its box; one control under 32 px (Developer tools, 31 px) | tested |
| iPhone, Safari (iOS 17+) | not tested | not tested | not tested | **untested** |
| iPhone, Chrome (WebKit) | not tested | not tested | not tested | **untested** |
| Android, Chrome | not tested | not tested | not tested | **untested** |
| Android, Samsung Internet / Firefox | not tested | not tested | not tested | **untested** |

## 4 Measurement validation (synthetic study)

Room RT60 0.62 / 0.55 / 0.50 / 0.45 / 0.42 / 0.38 s (125–4000 Hz); laptop-like reference: speaker high-pass 250 Hz,
direct sound 18 dB, response peak −12 dBFS, pink background −70 dBFS. Five takes per row (new noise and delay each).
Tolerances as in the existing validation: T30 5 %, T20 8 % against the room's own decay over the same range.

| Condition | Valid | Bands in average | Average vs reference | 1 kHz vs reference | Outside tolerance |
|---|---|---|---|---|---|
| Reference (laptop-like) | 5/5 | 6 | 0.495 s, sd 0.002 | — | — |
| Small speaker (HP 700 Hz) | 5/5 | 5 | −6.7 % | +0.0 % | none; 125 Hz no value |
| Direct sound 30 dB | 5/5 | 6 | +0.5 % | −0.2 % | none |
| Response peak −30 dBFS | 5/5 | 5 | −4.9 % | +1.8 % (T20 in 3) | none |
| Phone-like (HP 700 + direct 30 + −24 dBFS) | 5/5 | 3–4 | −11.3 %, sd 0.009 | +4.5 % (T20; the room's own T20 differs by +1.0 %) | none |
| Unreported AGC 6 dB/s | 5/5 | 5 | −0.3 % | +0.9 % | **250 Hz +15.8 %, 500 Hz +5.5 % (Good)** |
| Unreported AGC 30 dB/s | 5/5 | 4 | −7.1 % | −0.4 % (vs T20) | none (all T20) |
| Gate after the sweep (+6 / +20 dB) | 5/5 | 6 | +0.4 % | +0.6 % | none |
| Dropout, samples removed | 5/5 | 4–5 | +14.3 % | +0.2 % | **500 Hz +82 %** |
| Dropout, zero-filled | 0/5 | — | — | — | rejected (correct) |
| Soft limiter | 5/5 | 6 | −0.3 % | +0.6 % | none |
| 44.1 kHz | 5/5 | 6 | −1.1 % | +1.4 % | none |

Level ladder (phone-like): −12 dBFS 4 bands T30, average −9.6 %; −24 dBFS 3–4 bands T20; −30 and −36 dBFS rejected
(1 kHz 29–35 dB usable). Background ladder at −24 dBFS: −60 and −55 dBFS rejected. Phone-like conditions sit about
10 dB closer to the validity limits than the laptop-like reference.

Signature of an unreported gain change: the take's background after the decay minus before the sweep, per band, is
within ±0.3 dB in every condition without AGC, and **+9.1 to +12.0 dB, uniformly across all six bands**, with AGC.

## 5 What does not need changing

The sweep method, deconvolution, Lundeby noise floor, noise-compensated Schroeder integration, direct-sound separation,
the T30/T20/no-value cascade, the clipping and zero-gap checks and the sample-rate handling all behaved within
tolerance under every phone-like condition that reaches them. No threshold is shown to be wrong. Do not tune them.

## 6 Prioritised remediation plan (proposed; none implemented)

**Critical: measurement correctness**
- **R1 · Recording integrity: sweep timing.** Cross-correlate the recording with the reference sweep in short windows
  across the sweep. A step in lag means samples were dropped or inserted (D2, H3); a steady slope means clock drift.
  Reject the take with the reason. Pass mark to agree: removing or inserting one render block (128 samples) is always
  rejected; an intact take never is.
- **R2 · Unreported processing (D3, H2).** (a) A setting the browser does not report counts as unknown, not off: the
  take carries a warning, so no band is "High confidence" (the existing mechanism). (b) A uniform rise of the background
  after the decay across all bands of at least an agreed amount (provisionally 6 dB, the noise check's own change
  criterion) marks the take not valid ("the input gain or the background changed during the take"); the threshold is to
  be confirmed with device data, since a real background can also change.
- **R3 · Results wording (D4).** List each setting as on / off / not reported, as Measurement Setup does.

**High: comparability and stability**
- **R4 · Headline average (D1). Decision needed.** Options:
  1. a fixed band set, valid only when every band in it has a value (e.g. 500–2000 Hz, or 500–4000 Hz), so laptop and
     phone report the same quantity; or
  2. keep "all measured bands", but always show which bands, and refuse to compare averages over different band sets
     (Takes table, follow-up measurements); or
  3. headline the 1000 Hz value again and show the average as secondary.
  The study supports option 1 for cross-device comparability. You asked for the current definition, so this is yours
  to decide.
- **R5 · Takes table:** add the average and its band count per take, so a band dropping out is visible.

**Reliability**
- **R6 · Lifecycle.** Abort a running take with a clear reason on `visibilitychange` (hidden), `pagehide`, track `mute`
  or `ended`, and an AudioContext that leaves "running"; never analyse a partial take.
- **R7 · Device diagnostics** (to settle H1–H6). Record with each take, and show in the Measurement record: the
  constraints the browser supports and their capabilities, the settings it reports, AudioContext rate, base and output
  latency, tap kind, browser and OS family. Offer "Copy diagnostics" as JSON with no audio, no personal data and no
  project names.

**Usability**
- **R8** Reason rounding (D5). **R9** Phone placement and volume advice ("sound from the loudspeaker, not the earpiece")
  once H1 is checked. **R10** Narrow-screen band tables: keep the scroll, add a visible hint.

## 7 Acceptance criteria (proposed, to agree before any fix)

| # | Criterion | How it is checked |
|---|---|---|
| A1 | Every synthetic condition in `tests/mobile-study.html` gives a value within tolerance (T30 5 %, T20 8 % of the room's own decay), or no value, or a rejected take — never an out-of-tolerance value without a warning | study turned into pass/fail checks |
| A2 | Removing or inserting 128 samples anywhere in the sweep is rejected; intact takes at 44.1/48 kHz never are | R1 tests |
| A3 | A take with an unreported setting is never "High confidence"; a uniform background rise ≥ the agreed limit is not valid | R2 tests |
| A4 | The headline average is defined so the same room gives the same quantity on devices with different band coverage (per the R4 decision) | study: small speaker vs reference |
| A5 | Repeatability on a real device: sd of 3 takes at one position ≤ 5 % (or 0.02 s) at 500–2000 Hz | device protocol below |
| A6 | Between devices, same position: means within 10 % at 1000 Hz, or a stated reason (method, coverage, rejection) | device protocol below |
| A7 | A take interrupted by lock, call, app switch or route change is aborted with a reason, never analysed | device lifecycle tests |
| A8 | The full workflow (permission → report download) works at 360–430 px on iOS Safari and Android Chrome without horizontal page scroll | mobile checklist |
| A9 | All existing suites still pass (dsp 62, validation 71, rt60-average 31, room-surfaces 52, calculations 22, responsiveness, sweep-level 13, server 34) | regression run |

These reuse the tolerances already in `docs/RT60-DEEP-AUDIT.md` and `tests/validation.test.js`. They do not claim
laboratory accuracy and do not require phones and laptops to agree beyond what the room and microphones allow.

## 8 Physical-device test protocol (for you to run, or with R7 diagnostics)

Same room, quiet, device on a table 1 m from walls, same spot for every take, volume at about 80 %:
1. Laptop: 3 takes. Note headline, each band's value and T20/T30, and "Signal above background" in the Measurement record.
2. Phone (each model and browser): 3 takes at the same spot, screen kept on.
3. Phone: one take with the screen locked mid-take; one with a notification sound; one switching apps and back.
4. Phone: one take after plugging in headphones (then unplug).
Send the Results screenshots, or the diagnostics JSON once R7 exists.

## 9 Mobile acceptance checklist (full workflow)

- [ ] Open the link on the phone; Home readable without zoom; New Measurement reachable
- [ ] Room Setup: number fields open the right keypad; surface selectors usable by touch
- [ ] Target: values readable; adjust with − / +
- [ ] Measurement Setup: microphone permission prompt appears after a tap; denied → clear recovery text; device kind detected as phone
- [ ] Background check: 5 s, verdict shown; screen stays on
- [ ] Take: sweep audible from the loudspeaker; progress visible; cancel works; lock / app switch aborts with a reason
- [ ] Processing: steps and band table readable (table scrolls sideways)
- [ ] Results: headline, coverage, per-band values, "Not reliable" reasons; no horizontal page scroll
- [ ] Assessment, Treatment, Predicted Result usable by touch
- [ ] Final Result: report form usable; submit; PDF downloads and opens on the phone
- [ ] A new take after a failed one works without reloading

## 10 Verification so far

| Item | Result |
|---|---|
| Production code changed | none |
| `tests/mobile-study.html` | runs; numbers above are from it (deterministic seeds) |
| Layout at 375 × 812 (emulated) | no page overflow; one 31 px control (Developer tools) |
| Physical phones | **not tested** |
| Remaining risks | D2 and D3 can give wrong values that look valid; D1 makes averages incomparable across devices; H1–H6 open |

## 11 Phase 2: implemented fixes

### 11.1 Root cause of the false "background is high" warning

Tested with synthetic inputs through `analyseNoise` and `analyseTake` (tests/audio-config.html A1–A2):

| Hypothesis | Result |
|---|---|
| Wrong unit or conversion | No: levels are dBFS = 10·log10(mean square); white noise of RMS 0.01 reads −40.0 dBFS, a 0.1 sine −23.0 dBFS |
| Sweep or decay included in the noise estimate | No: the noise check records before any sweep; the take's background is read from the second before the sweep |
| **DC offset counted as noise** | **Confirmed.** The background shown on screen, the take's "background before the signal", its sweep-above-background check (10 dB) and the noise-change comparison used the unfiltered mean square, DC included. A quiet room (−87 dBFS in the RT60 bands) with a DC offset of 0.01 read **−40 dBFS**; with an offset of 0.05 a quiet phone-level take failed as "the test signal was only N dB above the background". The app switches the browser's processing off, which on some devices also switches off the high-pass filter that would remove DC |
| **Automatic gain amplifying a quiet room** | **Confirmed as a mechanism** (device-dependent): a rising gain gave "the background rose 20 dB … for example ventilation", blaming the room |
| **Noise suppression silencing a quiet room** | **Confirmed as a mechanism**: digital silence was reported as "No sound reached the input … muted" and blocked the step |
| Invalid samples | **Confirmed defect**: one NaN sample gave "suitable" with a NaN level |
| Microphone self-noise | Not a cause on its own: steady self-noise is a low, steady background |
| Unsuitable thresholds | No evidence: −30 dBFS, 10 dB, 6 dB and −110 dBFS kept unchanged |

Which of these produced the warning on your device is not known without its data; the noise card and the Results record
now show the DC offset and the browser's processing state for each measurement, which will tell.

### 11.2 Changes, by file

| File | Change |
|---|---|
| `js/measurement/analysis.js` | Noise check: invalid samples rejected; DC removed from the unfiltered figures and reported (`dcDbfs`); digital silence → "unassessed" with both causes; cautions name room, microphone and processing as possible causes, with next steps. Take: invalid samples rejected; background and sweep levels read in the RT60 bands (`levels.inBand`); DC reported; continuity check `sweepTiming` (CRITERIA.take.timing); `levelChange` criteria |
| `js/services/processing.js` | Gain or background change common to every band: not valid from 6 dB, warning from 3 dB; threshold text never rounded up to the requirement; noise comparison in the RT60 bands; the take's configuration and continuity kept in `meta` |
| `js/services/rt60-average.js` | Headline = mean of the fixed bands 500, 1000, 2000 Hz; unavailable, naming the band, when one is missing |
| `js/measurement/audio-io.js` | `REQUESTED` constraints; capabilities and supported constraints read; output routing with `AudioContext.setSinkId` where supported; sessions reopened for another microphone or output; a recording interrupted on page hide or leave, track mute, AudioContext not running, or a changed set of audio devices |
| `js/services/measurement.js` | `processingState` / `processingText` / `processingShort` (requested · reported · possible; unknown never "off"); unreported processing → warning; `configOf` snapshot stored with every access check, noise check and take |
| `js/measurement/live.js` | One source of truth for the selection (`contextOf`, `outputOf`); `configProblem` readiness check |
| `js/stages/setup.js`, `js/stages/measure.js` | Profile select with its own checks and a mismatch note; output select where the browser can route; processing table; a profile change re-reads the configuration and asks for the placement items again; a take cannot start while the selected configuration is not in force |
| `js/stages/results.js`, `js/report/report.js`, `js/ui/live-ui.js`, `js/ui/components.js`, other stages | Processing per feature from the take's configuration (the "Switched off" overstatement removed); output confirmed or not; continuity; background in the RT60 bands and DC offset; the 500–2000 Hz headline everywhere |
| `js/data/demo.js`, `js/core/store.js`, `js/core/derive.js` | Profile checks; `setup.outputId`; noise change compared in the RT60 bands |
| Tests | `tests/audio-config.*` (new, 42 checks), `tests/rt60-average.test.js` (fixed bands), `tests/dsp.test.js` (silence → unassessed), `tests/mobile-study.*` |

### 11.3 Laptop and phone profiles

Both profiles request the same processing-free audio (a decay must reach the analysis unprocessed on any device). A
profile sets the instructions and checks; it never claims a speaker: on a phone the output cannot be chosen or
confirmed, and the screen says so (some phones use the earpiece while the microphone is on). On Chrome and Edge on a
computer a specific output can be selected and the browser confirms it; the system default is never shown as
confirmed. Changing the profile asks for the placement items again and re-reads the input configuration; each take,
noise check and report records the configuration actually used.

### 11.4 Noise floor: units, method, thresholds

dBFS = 10·log10(mean square) re ±1 full scale (a full-scale sine reads −3.0 dBFS); not sound pressure. 5 s after 0.3 s
settling, 125 ms frames, 6th-order band-pass 88–5657 Hz (the edges of the 125–4000 Hz octave bands); DC removed from the
unfiltered figures. Cautions (unchanged): usual level (L50) above −30 dBFS in the bands (headroom for the sweep), a sound
10 dB above its ±1 s median, a change over 6 dB. Unable to assess: below −110 dBFS in the bands (a working microphone
always shows some noise). Measure again: clipping, invalid samples, under 1.3 s of audio.

### 11.5 Automated tests (this session)

| Suite | Result |
|---|---|
| tests/audio-config.html (new) | 42/42 (35 part A, 7 part B with the virtual device) |
| tests/rt60-average.html | 31/31 |
| tests/dsp.html | 62/62 (one check changed: silence is now "unassessed", by design) |
| tests/validation.html | 71/71 |
| tests/room-surfaces.html | 52/52 |
| tests/calculations.html | 22/22 |
| tests/rt60-responsiveness.html | A 18/18; B 7/8 (B4, open finding F1, fails by design, as before) |
| tests/sweep-level.html | 13/13 |
| tests/report_submission_test.py | 34/34 |
| tests/mobile-study.html (study) | AGC takes now rejected (0/5 valid); headline across laptop/phone conditions within ±1.7 % or unavailable with the band named; a 128-sample dropout still accepted (limitation) |

### 11.6 Limitations and unresolved items

As they stood at the end of phase 2. Section 12 says what was done about each one and what remains.

- **Not tested on physical hardware.** Everything above is synthetic or the virtual device; see 11.7.
- Dropout detection: losses of 256 samples or more after the sweep passes ~200 Hz are rejected; **a single 128-sample
  loss is caught only sometimes**, and losses in the first ~1.3 s of the sweep (below ~200 Hz) never. In the study an
  undetected 128-sample loss at 2.5 s raised the headline by about 30 %.
- A gain change is detected only when the background after the sweep differs from before it; an AGC acting only during
  the sweep, or spectral noise suppression, is not modelled and not detected unless the browser reports it.
- A real background that steps up by 6 dB or more during a take is also rejected (named as a possible cause).
- The output can be chosen and confirmed only on Chrome and Edge on computers; a phone's loudspeaker can never be confirmed.
- Unreported processing (expected on iOS) makes every take there "Medium" confidence at most.
- `measured_rt60_s` in the report-form database is still the 1000 Hz value.
- Still open from phase 1: R5 (average per take in the Takes table), R7 diagnostics export (the configuration is
  recorded and shown, but there is no copy or export button), R10 (scroll hint on narrow band tables), and F1/F2 from
  the responsiveness audit.

### 11.7 Manual validation checklist (real laptop and phone)

1. Laptop (Chrome or Edge), Measurement Setup: the profile shows "Laptop or computer (detected)". Allow the microphone;
   the processing table lists each feature (expected: all reported off). Choose the built-in speakers under Sound output
   and check "In use, as confirmed by the browser". Measure the background in a quiet room: expect "Suitable" and a level
   in the RT60 bands; under Details, note the DC offset.
2. Switch the profile to "Phone or tablet": the phone checks and the "changes the instructions only" note appear and the
   placement items are unticked; switch back: they disappear.
3. Three takes at one spot: the headline (500–2000 Hz) within ±5 % or 0.02 s; Results shows "Recording continuity:
   Continuous" and the processing as reported.
4. During a fourth take, lock the screen or switch apps: the take stops as interrupted and the previous result stays.
5. Phone (Safari on iPhone, Chrome on Android), same spot: allow the microphone; read the processing table (expect "not
   reported" for some features on iPhone); is the sweep loud from the loudspeaker or faint (earpiece)? Measure the
   background (note level, DC offset, verdict) and three takes; compare the headline with the laptop's (within 10 % if
   500, 1000 and 2000 Hz are all valid; otherwise "not available" with the band named).
6. On each device, download the PDF: "Measuring device", "Browser processing" and the headline must match Results.
7. Send the Results "Measurement record" of both devices.

## 12 Phase 3: the remaining limitations, and a whole-project review (2026-10-14)

The five limitations of 11.6 were worked on, and the whole project was reviewed for defects (server and report form,
screens and state, calculations and the PDF). Everything below was checked with synthetic audio, the virtual device or
the fake database; **no physical laptop or phone was used**.

### 12.1 The five limitations

| Limitation (11.6) | What was done | Evidence | What remains |
|---|---|---|---|
| A single 128-sample loss caught only sometimes; none in the first ~1.3 s | **Click check** (`analysis.aboveSweep`, `CRITERIA.take.clicks`): a loss makes the waveform jump; the jump's energy reaches every frequency, while the sweep, its reverberation and its harmonics stay at and below a few multiples of its instantaneous frequency. Above it, between its harmonics (folded back where a digital limiter put them above Nyquist), 5 ms Blackman–Harris frames are compared with the frames before and after; a click must be 8 dB above both sides, out of their scatter, back down within a few frames, broadband (median bin raised), and not one of a run. **Browser counts** where kept (Chrome/Edge: `MediaStreamTrack.stats` lost input frames, `AudioContext.playbackStats` output underruns): any loss during the take makes it not valid | tests/audio-config.html A2: one 128-sample block lost or repeated at 0.9, 2.3, 2.7, 3.9, 4.5 s (typical room), 4.5 s (quiet room), 2.5 s (phone-like): all rejected (15–63 dB); uncaught, the 2.7 s case read the average +76 %. Intact takes of seven kinds, digital distortion folding back, and a loud noise stopping abruptly: no click. Study (a development page, deleted afterwards: 1-block losses at 21 times in 8 conditions): in clean recordings (typical, quiet and noisy rooms, 44.1 kHz, phone-like, mild distortion) the losses it missed changed the average by at most 1.4 %, while those it caught reached +76 %. Part B: Chromium's real audio path with the virtual device: counts 0/0, no click, steady level | A loss before ~0.5 s into the sweep is not looked for (it reaches no band's decay: 0.0 % in the study). One in the tail after the sweep leaves almost no click (0.0 %). In a noisy room (−55 dBFS) a few small ones pass (≤ 1.4 %). **Heavily distorted playback** (a digital hard clipper, a buzzing speaker): the band fills with harmonics, smaller clicks hide, and in the study some losses passed (up to 24 % at 3 dB of clipping); such a take now carries a warning ("heavily distorted … a small gap could have passed unseen"), so no band is High. Safari and Firefox keep no counts |
| AGC acting only during the sweep, or spectral noise suppression, not detected unless reported | **Input level during the sweep** (`CRITERIA.take.sweepGain`): the same frames, above the sweep's 7.5th harmonic, against the same bins before it. Nothing in a room makes the background quieter while the test signal plays; a device turning its input down does: from 6 dB not valid, from 3 dB a warning. Shown on Results ("Input level during the sweep") | A3: a fast compressor −10 dB only while the sweep plays (background before and after equal, so the old check saw nothing): −10.2 dB read, not valid; −4 dB: warning; intact: within ±0.2 dB | **Noise suppression that only removes a steady background** changes no level the recording can compare, and is still not detected unless the browser reports it; strong cases show as a cut-off decay or a decay that speeds up (existing notes). An active test (a steady sound after each take, checking that its level holds) would detect it, but needs real devices to set its limits and adds sound to every take; not built |
| A real background step ≥ 6 dB during a take is rejected | Kept (a level that changes during the take distorts the decay). The reason now says which is likely: when the input level stayed steady during the sweep, "most likely the room's background changed (a machine, ventilation or traffic)" | A3: +8 dB of background after the sweep: not valid, the room named | A real change and a device's gain can still only be told apart when the sweep shows the device steady |
| iPhones: "Medium" confidence at most | Kept on purpose: a feature the browser does not report is unknown, not off, and a steady background suppressed by the device cannot be seen in the recording. Each take now records evidence that helps a review (input level during the sweep, clicks, the browser's counts where kept) and Results has **Copy diagnostics** (no audio, names or labels) | A5 diagnostics check | The cap stays until the browser reports the settings or an active test is validated on iPhones |
| The database stored only the 1000 Hz value | New optional column `measured_rt60_avg_s` (the 500–2000 Hz average, null when a band fails); `measured_rt60_s` stays the 1000 Hz value. A table made before it keeps working: the server stores the row without the column and `--check` lists it as missing; running `server/supabase/schema.sql` again adds it (`add column if not exists`). A request from before the column existed is accepted and hashes as before, so a retry is not refused | tests/report_submission_test.py: an older table, an old request, the new value stored | **Run `server/supabase/schema.sql` once more in the Supabase SQL Editor** to start storing the average (not done here: no database access was used) |

### 12.2 Defects found in the review and fixed

| Area | Defect | Fix |
|---|---|---|
| Local server (security, high) | A backslash in the path (`/js/x%5c..%5c..%5cserver%5c.env`) passed the checks on Windows and served files from `server/`, the secret key file included; no Host check, so a web page re-pointed at the computer (DNS rebinding) could reach it | Paths with `\`, `:` or NUL refused; the file must lie inside the served folder; Host names limited to localhost, 127.0.0.1, ::1, the address listened on and `REPORT_ALLOWED_HOSTS` (421 otherwise). Tests for both |
| Report form | A predicted RT60 out of the accepted range (e.g. a huge area) was refused by the server, the report stayed locked, and the reason was hidden; an emoji cut in two crashed the server (half a character cannot be encoded) and left the form stuck | Out-of-range numbers sent as null; text cut at whole characters; the server removes half characters and answers every unexpected error (500, "uncertain", retried with the same ID); non-form errors named to the user |
| Supabase client | A broken-off answer or a non-JSON 2xx escaped the error handling (dropped connection) | Mapped to uncertain (writes) or unavailable (reads) |
| Vercel | `.env` files and `server/data/` were not excluded from the function bundle for a CLI deployment | `excludeFiles` and `.vercelignore` |
| `.env.example` | Said the platform supplies PORT; the server does not read it | Documents the variables the local server reads |
| Prediction (high) | A covered finish whose library α took away more absorption than the room measured gave RT60s of minutes or below zero (5.8 s, 161 s, −10.7 s in the review's example) | No prediction in that band, with a check saying why; at 1000 Hz the plan is blocked with the reason |
| Target verdict | `classify` rounded x·100 while the screen shows toFixed(2): 202 values 0.100–5.000 s could get a verdict contradicting the number beside it | Compared at the digits shown |
| PDF | Paragraphs could run into the footer (no page break); non-Latin locale dates printed as "?"; "Wallss"; long plans ran off the page; axis labels overlapped above 6 s; long room names cut without a sign; one calculation line did not add up as printed | Page breaks for paragraphs; dates always en-GB; label fixed and coverage over 100 % flagged; plan table continues on the next page; chart steps up to 1, 2, 5, 10 s; ellipsis; covered α printed as stored; the download says when characters could not be shown |
| Results (F1, F2) | A newer unprocessed take, or a rejected newest take, left the old value with no notice | Notes beside the value ("has not been processed yet" with Process it; "gave no value", with the reason); the top bar marks the value as an earlier take's |
| Takes table (R5) | No per-take average | "Average 500–2000 Hz" column (stored with replaced takes from now on) |
| Diagnostics (R7) | No export | Copy diagnostics on Results |
| Narrow screens (R10) | Wide tables scrolled with no sign; top-bar values cut off on phones | Fading edge and a "Scroll the table sideways" line on overflowing tables; top-bar values wrap |
| Workflow | Double-click on Continue confirmed the next step unseen; renaming the room or changing furnishing put five steps up for review; one damaged saved project hid every project after it; a second microphone change during an access check was lost; a cancelled processing job could end the next one | Action-bar clicks ignored for 450 ms after a step change; name and furnishing affect no step; each project loaded on its own; the access check runs again; each job clears only itself |
| Step guide | Opening it on Target with a preferred value but no range threw | Uses the complete target only |

### 12.3 Tests (final run, 2026-10-14, every suite after the last change)

| Suite | Result |
|---|---|
| tests/audio-config.html | 51/51: A 42/42, B 9/9 (B with the tab in front: a hidden page interrupts takes, by design) |
| tests/rt60-responsiveness.html | 27/27: A 19/19, B 8/8 (F1 and F2 now pass; before: 7/8) |
| tests/dsp.html | 62/62 |
| tests/validation.html | 71/71 |
| tests/rt60-average.html | 31/31 (the one-page report checked without running into the footer) |
| tests/room-surfaces.html | 52/52 |
| tests/calculations.html | 25/25 (3 new) |
| tests/sweep-level.html | 13/13 |
| tests/report_submission_test.py | 39/39 (5 new) |
| tests/mobile-study.html (study) | 128 samples spliced out at 2.5 s: 0/5 valid, each rejected for its click (phase 2: accepted, average +30 %); automatic gain 6 and 30 dB/s: 0/5 valid; noise gate at background + 20 dB: 3/5 valid, 2 rejected for the clicks its gain switching makes; the average across the other laptop- and phone-like conditions −1.3 … +1.8 % of the reference |

Test models changed, with the reason: the automatic-gain models in tests/audio-config.html and tests/mobile-study.html now
move their gain smoothly within each 10 ms frame (a gain that jumps between two samples puts a click in the recording,
which no real AGC does and which the click check now rejects first); the talking model in tests/rt60-responsiveness.html
rises and falls over 10 ms per syllable (switched between two samples it is a click at every syllable edge), and a new
check keeps the switched version, which must be rejected. The dropout checks accept either rejection reason (the click
or the timing step), whichever check sees the loss first.

### 12.4 Still open

- **No physical-device validation** (section 11.7 still applies; Results diagnostics can now be copied and sent).
- Noise suppression of a steady background (12.1); the iPhone confidence cap.
- Small losses in heavily distorted playback (warned, not caught).
- The Supabase column needs `schema.sql` run again (12.1).
- On Vercel after a cold start (empty ledger), a submission ID repeated with different content is answered as the
  first one instead of being refused; the app never does this (only a hand-crafted request could), and it stores nothing
  new.
- In the PDF, "vs target" for each band compares with the range set for 1000 Hz (the app's reference band); some
  standards allow a wider range below 250 Hz and above 2000 Hz. Not spelled out in the PDF, to keep the one-page report
  on one page.
- UX-052 (developer tools visible) and UX-055 (product names in capitals) remain product decisions.
- Proposals 3 and 5 of docs/RT60-RESPONSIVENESS-AUDIT.md (list responding bands in a rejection; check the one-device
  T20 offset against a calibrated reference).
