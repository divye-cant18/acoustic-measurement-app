# RT60 calculation audit

> The target rows below describe the targets before 19 October 2026 (ANSI classroom limit, occupancy conversion,
> group B). Targets now come only from verified criteria: docs/TARGET-CRITERIA.md.

> Superseded in part by docs/RT60-DEEP-AUDIT.md (12 October 2026). The 60 dB (T60) path described below was removed:
> RT60 now comes from T30 or T20 only. The direct-sound separation is capped at the first 5 ms. Takes with gaps, and
> bands whose decay is cut off, are rejected.

October 2026. Scope: every calculation that produces or uses an RT60 in the application, from the room's dimensions to
the predicted RT60 after treatment. Method: the code was read end to end, then run (the application's own modules,
unchanged) against synthetic rooms whose reverberation time is known by construction: band noise whose amplitude falls
60 dB in RT seconds (`tests/fixtures.js`). Measured values are compared with the room's own decay, taken straight from the
noise-free impulse response over the same evaluation range. The whole application was also run through the virtual-room
harness (`tests/virtual-room.html`).

## 1. Pipeline traced

| Stage | Code | What it does |
|---|---|---|
| Room | `services/acoustics.js` `geometry` | V = L·W·H, floor, ceiling, walls |
| Target | `services/target.js`, `data/targets.js` | DIN 18041 group A/B formulas, tolerance, occupancy, ANSI S12.60 limit |
| Capture | `measurement/audio-io.js`, `services/measurement.js` | microphone with echo cancellation, noise suppression, AGC requested off; settings read back |
| Test signal | `analysis.sweepPlan`, `makeSweep` | exponential sweep 50 Hz–10 kHz, 5 s; inverse filter with +6 dB/octave envelope |
| Impulse response | `analysis.analyseTake` | deconvolution, arrival from the recording, onset (ISO 3382-1) |
| Bands | `measurement/dsp.js` | IEC 61260 octave bands, 6th-order Butterworth HP + LP, time-reversed filtering |
| Decay | `analysis.lundeby`, `analyseBand` | Lundeby noise floor and truncation, Schroeder integration with tail correction |
| Direct sound | `analysis.reverberantStart` | separates the device's direct sound and early reflections from the room's decay |
| Fits | `analysis.fitDecay` | T20 −5…−25 dB, T30 −5…−35 dB, T60 −5…−65 dB; T = −60 / slope |
| Decision | `services/processing.js` | T60 ≥ 75 dB, T30 ≥ 45 dB, T20 ≥ 35 dB usable; ξ ≤ 50 ‰; B·T ≥ 4; valid when 1 kHz has a value |
| Prediction | `services/prediction.js`, `core/derive.js`, `services/catalog.js` | A0 = 0.161·V/RT; ΔA = Σ area·α; RT = 0.161·V/(A0 + ΔA) |

## 2. Confirmed errors (corrected)

| # | Where | Error | Root cause | Correction |
|---|---|---|---|---|
| 1 | `analysis.js` `analyseBand` | Measured RT60 read slightly **long**, more so the noisier the recording: mean +0.5 % (T30, background −75 dBFS) to +4.4 % (T20, −60 dBFS) | The Schroeder integral summed the squared response *including* the background noise up to the truncation point, while the tail added beyond it is the noise-free extrapolated decay. The noise lifts the end of the curve | The noise floor (Lundeby's estimate) is subtracted from each sample before the backward integration, as ISO 3382-2 allows together with truncation and tail correction |
| 2 | `processing.js` `evaluate` | A take recorded while the browser reported echo cancellation, noise suppression or automatic gain **on** was still presented as an RT60 (only marked Fair / Medium) | Treated as a warning, although the app's own message said the processing can remove or shorten the decay | No band gets a value; the result is "Unable to obtain a reliable RT60 measurement" with the reason and what to do. The previous valid measurement stays in force |
| 3 | `catalog.js`, `derive.js` | Predicted RT60 after treatment used the **one-third-octave** α at the octave's centre frequency as the α of the whole **octave** band | The product data is in one-third-octave bands (100–5000 Hz); the measured RT60 it is combined with is an octave-band value | Octave α = mean of the three one-third-octave values in the octave (e.g. 800, 1000, 1250 Hz for 1 kHz), rounded to 0.01 |
| 4 | same | Laboratory α above 1.00 (183 of the 912 octave-centre values used, up to 1.13) entered the prediction unchanged | α_s > 1 is an edge effect of the test specimen in a reverberation room; no surface absorbs more sound than reaches it | Octave α limited to 1.00, as ISO 11654 forms the practical absorption coefficient (there also rounded to 0.05; here to 0.01). Tested values are still displayed as reported |

## 3. Verified correct (unchanged)

- Geometry and units: V in m³, areas in m²; 9 × 7 × 3 m → 189 m³, surfaces 63 + 63 + 96 = 222 m².
- Sabine: RT60 = 0.161·V/A with V in m³ and A in m² Sabine; A0 = 0.161·V/RT60 from the measurement; the prediction adds
  each product's area × α band by band. Absorption needed and area for the target follow from the same relations.
- Exponential sweep and inverse filter (amplitude e^(−t·ln(f2/f1)/T), +6 dB/octave), deconvolution, arrival and onset.
- Octave filters: centre 0 dB, edges −3 dB, < −30 dB one octave outside, every band (tests).
- Schroeder curve in 10·log10 of energy; T = −60/slope, so T20 and T30 are extrapolated ×3 and ×2 by construction.
- Evaluation ranges and requirements: T20 −5…−25 dB needing 35 dB usable, T30 −5…−35 dB needing 45 dB (10 dB margin
  above the noise, ISO 3382-2). A band without enough decay gets no value and says why.
- Direct-sound separation for one device: with the device's direct sound 20–30 dB above the room and early reflections
  from the desk, every band 250 Hz–4 kHz is within ±3 % of the room's own decay (laptop model below).
- DIN 18041:2016 group A (A1 0.45·lg V + 0.07, A2 0.37·lg V − 0.14, A3 0.32·lg V − 0.17, A4 0.26·lg V − 0.14,
  A5 0.75·lg V − 1.00, 2.0 s above 10 000 m³), tolerance 0.8–1.2 between 250 Hz and 2 kHz, group B A/V limits, the
  occupancy conversion (80 % present) and the ANSI S12.60 classroom limit.

## 4. Representative calculations (tests/calculations.html, values worked out by hand)

| Calculation | Inputs | Expected | App |
|---|---|---|---|
| Existing absorption | 0.161 × 189 m³ ÷ 0.70 s | 43.47 m² | 43.47 m² |
| One product | A0 43.47 + 14.88 m² × 0.37 = 48.9756 m² | 0.161 × 189 ÷ 48.9756 = 0.6213 s | 0.6213 s |
| Two products | 10 m² × 0.5 + 5 m² × 0.8 = 9 m² | 30.429 ÷ 52.47 = 0.5799 s | 0.5799 s |
| Absorption to reach 0.56 s | 30.429 ÷ 0.56 − 43.47 | 10.8675 m²; with α 0.75: 14.49 m² | same |
| Octave α, 1 kHz | (0.28 + 0.39 + 0.50) / 3 | 0.39 | 0.39 |
| Octave α above 1 | (1.12 + 1.10 + 1.09) / 3 = 1.10 | 1.00 | 1.00 |
| DIN 18041 A3, 189 m³ | 0.32 × lg 189 − 0.17 | 0.56 s, range 0.45–0.60 s (ANSI) | same |
| DIN 18041 A4, 180 m³, 12 people | in use 0.446 s; empty: A 65.73 − 4.8 m² | 0.48 s | 0.48 s |

## 5. Before and after

Measured RT60, single device (direct sound 28 dB above the room, desk reflections, pink background), room 0.50 s,
3 rooms × 500/1000/2000 Hz, error against the room's own decay:

| Background | Path | Before: mean (worst) | After: mean (worst) |
|---|---|---|---|
| −75 dBFS | T30 | +0.5 % (+2.0 %) | −0.2 % (−1.2 %) |
| −70 dBFS | T30 | +1.6 % (+3.6 %) | −0.3 % (+1.4 %) |
| −64 dBFS | T20 | +2.6 % (+6.2 %) | +1.1 % (+6.2 %) |
| −60 dBFS | T20 | +4.4 % (+7.1 %) | +1.1 % (+6.2 %) |

Wider matrix (RT60 0.3, 0.6 and 1.2 s; no direct sound, 20 dB, 32 dB; white −75 dBFS and pink −62 dBFS; all six bands):
mean error +0.8 % → 0.0 %, mean absolute error 1.4 % → 1.0 %. The remaining scatter of single bands near the T20 limit
(up to about ±6 %) is the variation of one decay in one band, not a bias.

Predicted RT60 (189 m³ room measuring 0.70 s at 1 kHz, 5 panels of 1220 × 2440 mm), all 152 configurations: on average
0.0045 s higher than before, at most +3.3 % (configurations whose lab α at 1 kHz was above 1.00); 18 unchanged; a few
slightly lower where the octave mean is above the centre value. Example from the app: 10 panels on a 50 mm air gap,
α(1 kHz) 1.10 → 1.00, predicted 0.40 s → 0.42 s. The earlier values were optimistic.

Laptop model (speaker with nothing below 300 Hz, desk reflections, pink background −66 dBFS, room 0.62…0.40 s):
250 Hz–4 kHz within ±2 % of the room's own decay at 48 and 44.1 kHz; 125 Hz correctly "not reliable".

## 6. The 0.29–0.35 s versus 0.42–0.58 s comparison

No software error was found that reads a room of 0.42–0.58 s as 0.29–0.35 s. In every simulated condition the analysis
returns the room's own decay to within a few per cent, and the errors corrected here moved measured values by a few per
cent, mostly downwards from a slight over-read. A 30–40 % difference has another cause. The likely ones, which only a
side-by-side measurement can separate:

1. **What is reported.** This app reports the 1 kHz octave band (T30 or T20). Other apps often report a broadband value
   or an average over 500 Hz–1 kHz or 250 Hz–4 kHz. In most rooms RT60 is longer at low and mid frequencies, so those
   figures are higher than the 1 kHz value. Compare like with like: the same octave band, and T20 with T20.
2. **Source and position.** This app measures with the device's own speaker and microphone on a desk; a balloon or clap
   with a phone some metres away excites and samples the room differently, and EDT (early decay) differs from T20 in
   rooms that are not diffuse. An app that does not separate the device's direct sound would read *shorter*, not
   longer, so that is not the cause here.
3. **Microphone processing below the browser.** Many laptops and phones apply noise suppression, echo suppression or
   "voice focus" in the driver or the operating system. The browser cannot switch it off or report it. In simulation such
   processing made decays curved and unreliable rather than cleanly shorter, so its effect on a real device has to be
   measured: switch off every microphone effect in the system's sound settings (Windows 11: Settings > System > Sound >
   the microphone > Audio enhancements off, plus any manufacturer audio app; macOS and iOS: Mic Mode "Standard" in Control
   Center while the browser uses the microphone) and repeat.
4. **The room itself:** occupancy, doors, furniture and position differ between the two measurements.

Recommended check: in the same room and position, measure with this app and with a reference (a calibrated measurement
microphone with REW or a Class 1 meter with a reverberation-time module, ISO 3382-2, T20/T30 per octave band). Compare
500 Hz, 1 kHz and 2 kHz band by band. The analysis is a pure function of the recording, so a recording from the
reference system can also be fed to `AM.analysis.analyseTake` to separate the device from the analysis.

## 7. Observations not changed (need a decision or the standard text)

- **Band tolerance at 125 Hz and 4 kHz.** The band-by-band assessment applies the 250 Hz–2 kHz tolerance (0.8–1.2 × T)
  to every band. DIN 18041 widens the tolerance outside that range; the exact limits should be taken from the standard's
  figure before the assessment is changed.
- **Sabine constant.** The prediction uses 0.161 s/m (as specified); the DIN 18041 target relations use 0.163 s/m, as
  that standard does. Both are standard values; the difference is below 1 %.
- **Model.** The simplified Sabine prediction does not subtract the absorption of the surface the panels cover, nor
  model placement or air absorption; with average α around 0.2–0.3, Eyring would predict about 4 % lower for the example
  room. This is stated as a limitation on screen and in the report.
- **T60 path.** With 75 dB of usable decay the fit runs from −5 to −65 dB. ISO 3382-2 evaluates T20/T30; a device
  measurement rarely reaches 75 dB, and in a curved decay this value leans on the late decay.

## 8. What is verified and what is not

Verified: the formulas, units and decision rules above; the analysis against synthetic rooms of known RT60 in the
conditions listed, including a single device with strong direct sound, desk reflections, a band-limited speaker,
pink background noise and two sample rates; the application end to end in the virtual room (1.0 / 0.9 / 0.8 / 0.7 /
0.6 / 0.5 s read as 1.017 / 0.943 / 0.843 / 0.699 / 0.610 / 0.509 s); the report.

Not verified: accuracy in a real room on a real device. Synthetic rooms are diffuse and exponential, without the
microphone and speaker of a real laptop or phone and their processing. Until the app has been compared with a calibrated
reference in real rooms, its RT60 should be treated as an estimate, not a certified measurement.
