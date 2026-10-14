# Univicoustic · Acoustic Measurement

A guided acoustic measurement application: room, RT60 target, a real microphone measurement (background noise and
an RT60 take), analysis, assessment, treatment and prediction.

Start the app server and open the address it prints:

```
python server/app_server.py
```

That serves the app at http://localhost:8780 and receives the report form (see **Report form and Supabase**). Python
3 only; there is no build step and nothing to install. Opening `index.html` directly still runs the whole workflow, but
then the report form cannot be sent, so the PDF report stays locked.

One device does the measurement: the laptop, computer or phone running the app plays the test signal through its own
speaker and records the room with its own microphone. Nothing else is connected. The browser has to allow microphone
access on the page (Chrome, Edge, Firefox or Safari; https, or a file or server on this computer).

## Structure

```
index.html                    script order; the page itself is only mount points
css/app.css                   design tokens (light + dark) and all styles
js/core/util.js               AM namespace, formatting, icons
js/core/workflow.js           the 11 stages, phases, order, status rules, dependencies between stages
js/core/store.js              project state, navigation, completion, review/reset, persistence, legacy migration
js/core/derive.js             shared derived values (measured, assessment, prediction, noise change)
js/data/demo.js               reference lists: octave bands, industries, room options, measuring positions, device kinds
                              and placement advice, test signal; the blank project; a sample room for Developer tools.
                              No measurement data.
js/data/brand.js              application name, tagline, descriptor and logo files (assets/brand)
js/data/report-form.js        the report form's fields and the database columns (the server reads the same file)
assets/brand/                 the supplied Univicoustic icon and wordmark
js/data/targets.js            RT60 target criteria: sources, DIN 18041 groups, room type → uses → criterion
js/data/guides.js             instructional videos: chapters, captions (set video.src to use a filmed video)
js/data/products.generated.js product database, GENERATED from the NRC Master File (do not edit)
js/data/materials.js          room surface materials (walls, floors, ceilings, doors, windows): α per octave band, each
                              with its source, data class and conditions; to describe the room and know what a
                              treatment covers
js/measurement/               LIVE measurement (real microphone audio only)
  dsp.js                      FFT, convolution, octave-band filters (pure functions)
  analysis.js                 noise analysis; sweep; deconvolution; Lundeby; Schroeder; decay fits; CRITERIA
  audio-io.js                 getUserMedia, AudioContext, capture tap (AudioWorklet / ScriptProcessor), playback
  live.js                     what the microphone is doing now; runs measurements; writes results to the project
js/services/                  engines the stages talk to, each with its contract at the top of the file
  acoustics.js                geometry + plain Sabine relations
  target.js                   recommended RT60 target from the room (reads js/data/targets.js)
  measurement.js              LIVE: access, monitoring, background-noise measurement, RT60 take; calibration hook
  processing.js               LIVE: decision cascade (T30 → T20 → not reliable) and validity rules
  rt60-average.js             AVERAGE RT60 across the measured bands: the one calculation every summary and the report
                              read (through AM.derive.averageRT60)
  prediction.js               RT60 AFTER TREATMENT from the measured RT60 and the treatment plan (simplified Sabine),
                              with the model's assumption checks; the only RT60 the app predicts
  surfaces.js                 the six surfaces: areas, materials, what a treatment covers. No RT60 estimate. Never
                              read by the measurement
  catalog.js                  SOURCE DATA: products and tested configurations from the NRC Master File
  explain.js                  step guides, filled with the project's own numbers
data/source/                  NRC Master File 02.07.2026.xlsx, the product source (unchanged)
data/products.json            structured product database (same content as products.generated.js)
data/import-report.md         data issues found during import, by source row
tools/import-products.ps1     Excel → product database (re-run when the Excel changes)
js/ui/components.js           cards, fields, tags, steppers, RT60 scale
js/ui/live-ui.js              microphone status, live level meter, background-noise result
js/ui/charts.js               band columns and the measured decay curve (SVG, drawn at real width)
js/ui/guide.js                video player for the guides (animated scenes, or a video file)
js/report/                    the project report (PDF), generated in the browser
  pdf.js                      minimal PDF writer: A4, standard fonts with real metrics, tables, bars, one JPEG
  report.js                   report content from the saved project, layout, filename, download (locked until the form)
js/services/report-gate.js    the report form on Final Result: validation, sending, states, receipt, unlocking the PDF
server/                       the app server (Python standard library): serves the app, receives the report form
  app_server.py               static files (app folders only), /api endpoints, --check
  submissions.py              validation against js/data/report-form.js, the table row, ledger, receipts, rate limits
  supabase_client.py          Supabase REST API (PostgREST): insert, look up, check the table, with the secret key
  supabase/schema.sql         the report_submissions table, row level security, privileges (run once in Supabase)
  vercel_adapter.py           the same API as Vercel Functions (see Deploying on Vercel)
api/                          Vercel Functions: health.py, report-submissions.py, report-submissions/verify.py
vercel.json                   Vercel: publishes index.html, css/, js/, assets/ only; function settings; headers
  .env.example                configuration template (copy to server/.env); server/data/ is created at run time
js/stages/*.js                one file per stage: view, actions, canContinue, demoFill
js/app.js                     shell: workflow rail, context bar, action bar, sheets, events
tests/                        development only, never loaded by the app (see Testing)
```

## Acoustic workflow: target, measured, after treatment

The app works with three RT60 values, never one in place of another:

1. **Target RT60**: the range the room should have, from its type, use, volume and occupancy (Target step;
   `services/target.js`, DIN 18041:2016, ANSI/ASA S12.60 for classrooms).
2. **Measured RT60**: from the microphone measurement only (background check, sweep, deconvolution, octave bands,
   decay analysis, T30 or T20 per band). Summarised as the average across the measured bands; compared with the target
   at 1000 Hz in Acoustic Assessment.
3. **Predicted RT60 after treatment**: from the measured RT60 and the chosen products (Treatment, Predicted Result).

The room's own (untreated) RT60 is not estimated from its dimensions or surfaces: it is measured. Room configuration,
target, measurement, comparison with the target, treatment, the prediction after treatment and the report follow in
that order.

## Average RT60, 500–2000 Hz (the headline)

The headline measured value (Current measurement on the Measure step, the Results headline, the top bar, Home, Measurement
History, Final Result, the report's key figure) is the **mean RT60 of the fixed bands 500, 1000 and 2000 Hz**
(`services/rt60-average.js`, read through `AM.derive.averageRT60`):

    average = (RT60(500 Hz) + RT60(1000 Hz) + RT60(2000 Hz)) ÷ 3

- All three are required. If one has no reliable value there is no headline, and it says which band failed and why; it is
  never an average of whichever bands passed (that made the value depend on a device's band coverage, not the room).
- A band counts when the processing engine gave it a value (finite, above 0, T30 or T20, not Insufficient). Its own RT60
  is used; its T20 or T30 is never taken in its place.
- 125, 250 and 4000 Hz are shown on their own and never change the headline.
- The stored band values (to 1 ms) are averaged; the value is rounded only where it is shown. Only the current valid
  measurement has one.
- Why these bands: the mid-frequency bands ANSI/ASA S12.60 states classroom limits in, and the bands one device, phones
  included, measures most reliably.

It is a summary of the mid frequencies, not a standardised single-number rating. The target is set at 1000 Hz, so the
assessment, the amount of treatment and the prediction keep working with the band values, and every comparison says
"at 1000 Hz". The report form's database row holds both: `measured_rt60_avg_s` (this average) and `measured_rt60_s` (1000 Hz). See
docs/AVERAGE-RT60.md.

## Measuring device, profiles and browser processing

**One source of truth.** The project's setup holds the selection: the device profile (`setup.deviceKind`: null =
detected, or Laptop/Phone chosen), the microphone (`setup.deviceId`) and, where the browser can route audio, the sound
output (`setup.outputId`). Every session, background check and take is opened with that selection
(`AM.live.contextOf`, `outputOf`), and each one stores the configuration it actually had (`config`,
`services/measurement.js` `configOf`): profile, microphone, output (requested, applied, confirmed or not), the
processing requested, reported and possible, sample rate, channels, and browser family. Results and the PDF report show
the take's own configuration, never the current selection.

**Profiles.** The audio request is the same for every profile (echo cancellation, noise suppression and automatic gain
all requested off), because a decay must reach the analysis unprocessed either way. A profile changes the instructions
and checks (`demo.DEVICE_KINDS[kind].checks`): a laptop is told to switch off system audio enhancements and choose the
built-in speakers; a phone is told that the browser cannot choose or confirm the loudspeaker (some phones use the
earpiece while the microphone is on), that 125 and 250 Hz may be unreliable, and that locking or switching apps stops a
take. Changing the profile asks for the placement items of the checklist again and reads the input configuration again;
a profile different from the detected device says the measurement still uses this device. Takes keep the profile they
were made with.

**Sound output.** Where the browser can route an AudioContext (`AudioContext.setSinkId`: Chrome and Edge on computers)
and lists more than the default, Measurement Setup offers the outputs; the session applies the choice and reads back
which one is in use. "Confirmed" means a specific output was selected and applied; the system default never counts as
confirmed, since it does not say which device plays. Elsewhere (Safari, Firefox, phone browsers) the screen says the
output cannot be chosen or confirmed. A selected output the browser could not apply blocks Measurement Setup and the take.

**Browser processing.** Each feature is shown as requested off, reported off, reported ON, or not reported (unknown,
never shown as off), with what the browser says it can switch (`getCapabilities`). Reported ON: the take is not valid.
Not reported: the take carries a warning, so no band is High confidence.

**Interruptions.** A recording is aborted, never analysed, when the page is hidden (screen locked, another app or tab),
left, the system mutes the microphone, the AudioContext stops running, or the set of audio devices changes.

## Room surfaces

Room Setup describes six surfaces on their own, going round the room: **Wall 1** and **Wall 3** are the long walls
(length × height), **Wall 2** and **Wall 4** the end walls (width × height), the **Floor** and the **Ceiling** (length ×
width). Each has a material from `js/data/materials.js`, chosen by category and, where a material comes in several
constructions, by construction; optionally a partial covering (another material over a share of it); and on walls, doors,
windows and open doorways with their sizes and number. Every material shows its data class, conditions, α per band and
source link.

The library holds 231 materials from 30 sources (48 manufacturer test reports, 20 from published tables with a citation,
162 from engineering compilations, 1 by definition), each with its source link, conditions and notes; a band a source
does not give is empty, never 0. Doors and windows are not chosen for the user. docs/ROOM-SURFACES.md lists the sources,
the rows left out and why, and what could not be found.

Areas: gross = the surface's two dimensions; openings come off the gross (all of them together never more than the wall);
the covering takes its share of what is left; the finish keeps the rest. Every m² is counted once and nothing goes
negative; anything out of range is limited and said.

The surfaces are used for two things: describing the room (screen and report), and the treatment prediction, which needs
to know what each product covers (`services/surfaces.js`, `coveredBy`). No RT60 is estimated from them.

## Prediction after treatment

`services/prediction.js`, shown on Predicted Result and in the report. Per octave band, from the MEASURED RT60:

    A0 = 0.161 · V / RT60_measured          the room's equivalent absorption area (furniture, people and air included)
    ΔA = Σ S_product · (α_product − α_covered finish)
    RT60_after = 0.161 · V / (A0 + ΔA)

A0 is the relation ISO 354 uses to define an equivalent absorption area from a measured reverberation time, and product
α comes from the same kind of measurement, so the two add consistently. The finish a product covers is already part of
A0, so its absorption is replaced, not added (`coveredBy`); where the covered surfaces are not described, ΔA = S·α and
the prediction says the covered finish is not known (the effect is then overstated a little). A band without a measured
value or a tested α gets no prediction.

Assumptions, checked and shown with the result (`checks`): a diffuse sound field, where Sabine holds for a modest average
absorption (above an average coefficient of about 0.3 it reads long, so the real result is likely a little shorter); the
measured RT60 representing the room; A0 not exceeding the room's surface (if it does, the dimensions or the measurement
are wrong); laboratory α on the installed product (edge effects and placement are not modelled); air absorption part of
A0 and unchanged by treatment. Only a measurement after installation confirms the result.

Isolation: the surfaces and materials never reach the measurement, and nothing in the measurement code refers to them.
A surface change marks only Treatment, Predicted Result and Final Result for review (`W.affects` in `workflow.js`); the
target, the measurement steps and the assessment are untouched.

Projects saved before the surfaces: the earlier single floor / walls / ceiling choice fills those surfaces only where it
names one material (`LEGACY` in `materials.js`), marked "filled from the earlier single choice" to check; any other choice
(for example "Plasterboard + glass" or "Carpet") is kept beside the surfaces as the earlier entry, to choose from. The
earlier fields stay as they were. See docs/ROOM-SURFACES.md.

## Live measurement

```
Measurement Setup   the measuring device → allow the microphone → place the device → measure the background noise (5 s)
Acoustic Measurement  microphone monitored live → take: 1 s background, 5 s sweep, 4 s decay → analysis
Processing          direct sound separated, decision cascade per band → CURRENT measurement, or the latest attempt is
                    kept as not valid ("Unable to obtain a reliable RT60 measurement")
Results …           every later step reads only the CURRENT measurement
```

**Results and newer takes.** Results, the top bar and the report always show the CURRENT measurement. When a newer take
is not it (recorded and not processed yet, processed and not valid, or not analysable), Results says so beside the value
("A newer take … has not been processed yet", with a Process it button; "Your latest take … gave no value", with the
reason), the top bar marks the measured value as an earlier take's, and the report names it (`AM.derive.laterTakes`).
The Takes table lists each take's 500–2000 Hz average beside its 1000 Hz value. **Copy diagnostics** (Measurement
record) copies the take's technical record as JSON (`AM.derive.diagnostics`): browser and device configuration, every
check and every band; no audio, no project or room name, no position, no microphone or output label.

**One device.** The device running the app is the whole measuring system: its own speaker (the system's sound output)
plays the test signal and its own microphone records the room. There is no second device, no separate recorder and no
required external speaker or microphone. Measurement Setup detects whether it is a laptop/computer or a phone/tablet
(`audioIO.deviceKind`, from what the browser reports; it can be corrected there) and words the placement advice for it
(`demo.DEVICE_KINDS`, `demo.PLACEMENT`): at the measuring position, on a firm support and not held, openings uncovered,
at least 1 m from walls where practical, at about seated ear height where possible, the same place and orientation for
every take there, headphones disconnected. The measuring positions P1–P3 are positions of that one device; measuring
another position means moving it there and taking a new recording. Each take records the device kind, the position and
the sound output's name (when the browser gives it). The distance between the device's speaker and microphone is never
assumed, and neither is the delay between playing and recording.

**Input.** `getUserMedia` with echo cancellation, noise suppression and automatic gain control requested off. What the
browser actually applied is read from `track.getSettings()` and shown. If the browser reports that any of them stayed on
during a take, that take gives no RT60 in any band ("Unable to obtain a reliable RT60 measurement", with the reason):
each of them works on the recorded decay itself. The stream feeds one AudioContext (the device's sample rate, usually 48 kHz). An AudioWorklet (ScriptProcessor
where worklets are unavailable) reports block levels and passes raw samples while recording. The microphone is opened only
while needed (Setup's checks, the Acoustic Measurement step) and released straight after. The UI says "Live" only while a
stream is open and samples are arriving; a silent stream is reported as silent. When the page is shown inside another
page that does not allow the microphone (the browser's permissions policy says so), access is reported as "Not available
in this view" rather than as blocked, since no browser setting on this page can change it: open `index.html` on its own.

**Levels are relative.** Every level is in dBFS, relative to the input's digital full scale. No microphone is calibrated,
so no level is presented as sound pressure. `measurement.calibration(deviceId)` returns null today; a calibration
(offset in dB, method, date) added there turns displayed levels into dB SPL without changing the pipeline. RT60 is a time
and does not need calibration.

**Background noise** (`analysis.analyseNoise`). 5 s after 0.3 s of settling; 125 ms frames; broadband Leq, L10/L50/L90,
spread and change (shown as information); octave-band Leq; clipping. The verdict is judged in the bands RT60 is measured in
(88 Hz–5.7 kHz, `CRITERIA.noise.band`), because room noise is mostly rumble below them whose broadband 125 ms levels
scatter by 3–6 dB at random even when perfectly steady: judged broadband, harmless backgrounds were flagged or refused
and speech was missed (tests/noise-study.html). The level shown is the one in those bands. All levels are dBFS =
10·log10(mean square) relative to a digital full scale of ±1 (a full-scale sine reads −3.0 dBFS), never sound pressure.
The unfiltered figures have the input's DC offset removed first and report it separately (`dcDbfs`): a constant offset
is not sound, and counted, it made a very quiet room read up to 44 dB "louder" (the cause of "background is high"
cautions in quiet rooms; tests/audio-config.html). The check cannot tell the room's noise from the microphone's own noise
or from what the device's processing did to it, and says so. Four outcomes, each with what to do:
- **Suitable for measuring** — nothing that may cost a take.
- **Measure with care** (a caution; the take can start) — sounds such as voices, knocks or a door: the loudest 125 ms more
  than 10 dB above the median of the frames around it (±1 s), in any octave band; the level changing by more than 6 dB
  between the first and last third (the room, or the device adjusting its input level by itself); a usual (median) level
  above −30 dBFS in the bands (room noise, or a quiet room raised by a high input level or automatic gain).
- **Unable to assess** (the take can start) — digital silence (below −110 dBFS in the bands): a muted or covered
  microphone and a device whose noise suppression silences a quiet room look the same; the take checks its own recording.
- **Measure the background again** — the input is overloaded, the buffer is too short, or it holds invalid samples.
A level fluctuating ±3 dB (L10 − L90 up to 11 dB) or falling 6 dB caused no RT60 error in the noise study, so it is no
longer a warning; whether a take is reliable is decided on the take, which checks its own background (see Take). The figures
behind the verdict are under Details on the screen. A noise measurement that cannot be used never replaces the last usable
one; it is kept as the latest attempt. A new measurement that differs by more than 6 dB from the one behind the current
RT60 puts the measurement steps up for review.

**Take** (`analysis.analyseTake`). Exponential sine sweep, 50 Hz to 10 kHz (at most 45 % of the sample rate), 5 s,
played at −3 dBFS with a 0.3 s fade-in, recorded with 1 s before and 4 s after. The length was compared with 2 s and
3 s sweeps on identical rooms against criteria fixed before the run (tests/sweep-study.html): each shortening costs about
2 dB of usable decay, and the shorter sweeps gave no value in noisy rooms and long decays where 5 s still did, so 5 s stays.
4 s after the sweep is what a 3 s decay needs with room for a playback delay.
**Sweep level** (Acoustic Measurement, `CRITERIA.take.level`, `analysis.levelRange` / `sweepLevel` / `playbackSignal`): the
user's playback level relative to the default, in 3 dB steps from −12 to +3 dB, default 0 dB, with − / + and reset; gain
10^(dB/20). The top is the highest step whose peak stays at or below 0.99 of full scale (0.7 × 1.413 = 0.989, −0.1 dBFS;
+6 dB would clip), so it follows the sweep's real headroom; the app never changes the system volume. Only the played copy
of the sweep is scaled: the reference sweep and its inverse filter stay at the default, so the gain is applied once and
never to the recording. Each take stores its level and played peak (`take.plan.levelDb`, `playedPeakDbfs`), shown with the
take, the current measurement, Results, the Processing steps and the PDF report; Results lists the project's takes side by
side with their levels (`derive.takeComparison`): the current one, those it replaced, the latest one not valid or not used.
The level is not sound pressure and changes nothing in the analysis. **Distortion** (`analysis.distortion`): the 2nd and
3rd harmonic responses, which an exponential sweep places 0.65 s and 1.04 s before the main one, against the main
response (it read known harmonics within 1.5 dB); information, with a caution from −20 dB, never a rejection.
The gentle start matters for one device:
an abrupt start leaves a slowly fading artefact in the impulse response, and a direct sound 20–30 dB above the
reverberation lifts it into the 125 Hz decay (it read 0.47–0.78 s for a 0.35 s room before). Checks on the recording:
no invalid (non-number) sample, complete, not silent, no clipped sample, sweep at least 10 dB above the background
before it, both read in the RT60 bands (a DC offset or rumble below them no longer fails a quiet room). Deconvolution with the
inverse sweep (time-reversed sweep with a +6 dB/octave envelope) gives the impulse response. Its arrival — the delay
between playing and recording through the browser, the system and the device's buffers — is read from the response,
never assumed: it must be under 1 s and stand at least 20 dB above what the recording held before the sound arrived,
otherwise the take fails ("the arrival … could not be identified clearly … its timing is not reliable"). A gap in the
recording while the sweep was arriving — a run of identical samples of 1 ms or more, which is how the browser fills audio
it failed to deliver (one 128-sample render block is 1.3–2.9 ms) — also fails the take, with its position and length
(`analysis.gap`): it spreads through the whole impulse response and gave wrong band values that passed every other
check. Samples dropped or repeated without a visible gap are found from the sweep's own timing (`analysis.sweepTiming`,
`CRITERIA.take.timing`): each half-octave of the sweep from 200 Hz is matched against the recording, and a step of more
than 3.5 ms between neighbours fails the take as not continuous. Intact synthetic takes stay at or below 2.2 ms; losing
256 or 480 samples gives 4.2–15 ms. It needs the device's own direct sound to time by (largest headDb at least 6 dB).
Smaller losses are found by the click they leave (`analysis.aboveSweep`, `CRITERIA.take.clicks`): where samples are
dropped or repeated the waveform jumps, and the jump's energy reaches every frequency, while the sweep, its reverberation
and its harmonics stay at and below a few multiples of the frequency playing at that moment. Above it, between its
harmonics (folded back where a digital limiter put them above half the sample rate), the recording holds only the
background: 5 ms frames there are compared with the frames before and after them, and a frame 8 dB above both, back down
within a few frames, broadband (the median bin raised too, not one tone) and not one of a run (a buzzing speaker) is a
click and fails the take. One 128-sample block lost or repeated anywhere from 0.9 to 4.5 s into the sweep is caught in
the synthetic tests (15–63 dB); uncaught, one such loss read the 500–2000 Hz average 76 % long. Intact takes (seven kinds,
distortion folding back, a loud sound stopping abruptly) show none. A loss before about 0.5 s reaches no band's decay;
one in the reverberant tail leaves almost no click and changes no result. Where the browser keeps counts
(`MediaStreamTrack.stats`, `AudioContext.playbackStats`: Chrome and Edge), the frames the microphone captured but did not
deliver and the times the output ran dry during the take are read (`take.integrity`); any loss makes the take not valid.
The same frames above the sweep, above its 7.5th harmonic, give the input level while the sweep played against before it
(`CRITERIA.take.sweepGain`): nothing in a room makes the background quieter while the test signal plays, a device turning
its input down does, so from 6 dB quieter the take is not valid and from 3 dB it costs confidence. This catches automatic
gain or a suppressor that acts only during the sweep, which the background after the decay cannot show.
A background that is louder (or quieter) after the test signal than before it by the same amount in every band means the
input gain or the background changed during the take (`CRITERIA.take.levelChange`): from 6 dB the take is not valid,
from 3 dB it costs confidence. Sounds during the take are read from the take's own background, band by band: the second before the sweep and the
recording after every decay has reached the noise (`CRITERIA.take.disturbance`: 50 ms frames or longer in low bands; a
sound starts 10 dB above that segment's median and lasts at most 2 s; a longer rise is a change of level, recorded as
information). When sounds recur (at least twice), they act as a noise floor that comes and goes in the decay, so the usable
decay is counted from their level and the band may get no value, with that reason. Before this, speech-like sounds 15 dB
above the background gave 1000 Hz +12.6 % and 4000 Hz +17.1 % as valid values. Onset: within
10 ms before the peak, the first point within 20 dB of the peak (ISO 3382-1). A take that fails a check never replaces
the latest good take or the current measurement.

**Bands.** IEC 61260 base-2 octave bands 125, 250, 500, 1000, 2000 and 4000 Hz, edges fc/√2 and fc·√2. Each band filter is
a 6th-order Butterworth high-pass at the lower edge cascaded with a 6th-order Butterworth low-pass at the upper edge
(RBJ biquads, bilinear transform pre-warped at the edges; −3 dB at both edges, 36 dB/octave), run in double precision
and **time-reversed** so the filter's own ringing does not lengthen the decay. A band outside the sweep's range is not
measured.

**Decay** per band: Lundeby's iterative method finds the noise floor and the point where the decay meets it (later passes
fit only the late decay, 25 to 5 dB above the noise, as in Lundeby's step 5, so a strong direct sound does not tilt
them); Schroeder backward integration of the squared response minus that noise floor runs up to that point, with the
energy of the extrapolated (noise-free) tail added. Without the subtraction, the noise left in the integrated part lifts
the end of the curve and the decay reads long (+3 % with about 45 dB usable, +5 to +6 % near the T20 limit, in the tests).

**Direct sound, early reflections, reverberant decay, noise.** With the speaker and the microphone centimetres apart on
one device, the direct sound reaches the microphone 10–30 dB above the room's reverberation, so the decay curve first
drops steeply and only then follows the room. Each band is read in four parts, all from the recording: a line is fitted
to the lowest 20 dB of the usable decay curve (furthest from the direct sound), refined on the T20 range counted from the
room's decay, and extrapolated back to the arrival; how far it lies below the curve's start (`headDb`) is the energy of the
direct sound and early reflections. It is never more than the curve loses in the first 5 ms after the arrival
(`CRITERIA.decay.directWindow`): the device's direct sound and its nearest reflections arrive within that time, so a
larger excess is the room's own fast early decay (a curved, double-slope decay), which stays in the evaluation as in
ISO 3382-2. Without that cap, a room with a fast early decay was read from its late decay only (+4 to +90 % in the
tests). Up to 1 dB — what the direct sound adds at the smallest source-to-microphone distance
ISO 3382-2 allows, 2·√(V/cT) — the evaluation is the standard one (`CRITERIA.decay.directAllowanceDb`); beyond it, the
evaluation ranges move down by the excess, so they start in the room's decay and not in the device's direct sound. Then
least-squares fits over −5…−25 dB (T20), −5…−35 dB (T30) and, for information only, −5…−65 dB (T60) from that start,
each with r². Usable decay =
the room's own decay: from that start to where the decay meets the noise. Processing shows the separation per band
("Direct sound") and Results shows it on the decay chart.

**Cut-off decay.** A band whose decay drops into the background far faster than the room's own decay allows (30 ms at
least 15 dB above the background against the next 50 ms within 6 dB of it, 15 dB more than the band's T20 slope falls
in that time, `CRITERIA.decay.cutoff`) has been cut off — by a noise gate or noise suppression in the device or the
system, or by a gap in the recording after the sweep. It gets no value, with that reason. Before this rule a decay cut
off 26–30 dB down read 11–16 % short and passed as valid.

**Decision** (`processing.evaluate`): T30 if ≥ 45 dB usable, else T20 if ≥ 35 dB, else no value ("Not reliable", with
the reason): the two evaluation ranges of ISO 3382-2. The 60 dB fit is not used for RT60, because in a curved decay it
would make the result depend on how quiet the room was during the take. A value is rejected when the decay is not
straight (ξ = 1000·(1 − r²) above 50 ‰) or too short for the band filter (bandwidth × RT60 < 4). Quality and confidence
come only from these measured properties: Good / High for T30 with ξ ≤ 10 ‰ and |T30/T20 − 1| ≤ 10 %; Fair / Medium otherwise or when the background
changed since the noise check. Browser processing reported on: no value at all (see Input). The measurement is valid when the 1000 Hz band has a value; otherwise the result is "Unable to obtain a reliable
RT60 measurement" and nothing is estimated. A valid take becomes the CURRENT measurement and the previous one is kept as
SUPERSEDED (`processing.history`); the later steps then run again. An invalid take is kept as `processing.attempt` and the
current measurement stays in force.

**What this measurement is.** A browser-based measurement with a device's built-in speaker and microphone. The RT60 comes
from the room's measured decay, but the microphone and the speaker are not calibrated and no correction is applied for
either, so it is not equivalent to a calibrated or laboratory-grade measurement system. Laptop and phone speakers produce
little low-frequency sound, so the 125 Hz (and sometimes 250 Hz) band may be "Not reliable". Some devices apply their own
microphone processing (echo cancellation, noise suppression, "voice focus") below the browser; the browser reports only
its own settings, so processing in the operating system or the microphone driver cannot be detected and should be switched
off in the system's sound settings before measuring. Results have been checked against synthetic rooms of known RT60
(tests/), not yet against a calibrated measurement system in a real room.

All thresholds are in `AM.analysis.CRITERIA` (one place). They are criteria, not measured values.

**Nothing is stored that was not measured.** Raw audio is analysed straight away and not kept (browser storage is small);
the project keeps the analysis: levels, the downsampled band energy and decay curves, the fits. Projects saved by earlier
versions with simulated values have those values removed when they are opened (`legacyNote` explains it); room, target and
treatment are kept.

## Project report (PDF)

**Download PDF Report** is the last card on Final Result, after everything it summarises; it appears nowhere else, and it
is locked until the project's report form has been received (see the next section). The file is generated in the browser
from the open project's saved state (`AM.report`, `js/report/`), with no library. In a published artifact the viewer's own
download prompt saves it; elsewhere it is a normal browser download. Filename:
`Room-Acoustic-Report_<room>_<YYYY-MM-DD>.pdf`, letters, digits and hyphens only.

- **Page 1:** header (brand icon and name, generation time, project and measurement references, project status),
  key figures (measured, target, measured vs target, predicted or treatment), 1 Room, 2 Measurement (record, RT60 per
  octave band as a table and a chart, notes and warnings), 3 Target and assessment. Without a treatment plan the report
  ends on page 1 with the summary, next steps and limitations.
- **Page 2 (only with a treatment plan):** 4 Treatment plan (each product on its own row: name, range and variant, tested
  configuration and certificate, amount, area and placement, and the configuration's octave-band α), 5 Predicted outcome
  (labelled a model estimate: per band, chart, and the calculation at 1000 Hz), 6 Assumptions and limitations,
  7 Summary and next steps.

**Accuracy.** Every value comes from `AM.derive` for the project being reported: the CURRENT valid measurement (a later
take that failed, was not valid or is not processed yet is named, never used), the target, the assessment, and the
prediction of the complete plan. Nothing is recalculated with another formula; missing values read "Not measured" or
"Not available" with the reason. Without a valid measurement the report states that and gives no RT60, assessment or
prediction. In the calculation, the inputs are shown as stored (volume, measured RT60 to 0.001 s, panel area, entered area,
octave-band α to 0.01), each result is rounded half-up to 0.01 m², and the total is the sum of the parts as shown, so every printed
line adds up. Measured values are dark, the target grey and dashed, predicted values violet, as in the app.

**Length.** One page, or two with a treatment plan. If the content does not fit, the same report is set in a smaller size
(compact, then dense) rather than shortened; nothing is dropped to make it fit. Plans of up to six products fit two pages;
a longer plan continues on a third. Text is real, selectable text (Helvetica and Symbol, the PDF standard fonts).

## Report form and Supabase

Before the PDF report of a project can be downloaded or printed, the user submits a short form on Final Result. It is
sent to the app server, which stores one row in a Supabase table; the report unlocks only when the server confirms that
row.

```
Final Result → review the results → fill in the form → validate → submit → server stores the row → signed receipt
             → Download PDF Report unlocks (the server confirms the receipt again before every download)

browser (js/services/report-gate.js)              server/app_server.py                         Supabase
  POST /api/report-submissions  ───────────────▶  validate (allowlist) ─ ledger ─ REST insert ───▶  report_submissions,
                                ◀── receipt ────  (HMAC-signed, per submission ID and project)        one row per ID
  POST /api/report-submissions/verify ─────────▶  receipt + ledger (or the table itself)
```

**The form** (`js/data/report-form.js`, edit there): full name, email, profession / role, organisation (optional), country,
purpose, feedback (optional, 1000 characters), consent to send (required) and marketing emails (optional, unticked, never
needed for the report). Fields are checked as they are left and again on submit; the server checks the same rules, and
the table's own constraints check them once more.

**What reaches the database: these 23 columns and nothing else** (`server/supabase/schema.sql`): submission_id,
submitted_at (server, UTC), full_name, email, profession_role, organization, country, purpose, feedback, consent_given and
consent_recorded_at, marketing_consent (yes/no, separate), project_id, project_name, room_type, room_volume_m3,
target_rt60_s, measured_rt60_s (the RT60 at 1000 Hz, where the target is compared), measured_rt60_avg_s (the average of
500, 1000 and 2000 Hz shown as the headline; null when one of them has no value), measurement_method, predicted_rt60_s,
treatment_status (No treatment, Not selected, Planned, Predicted, Measured after treatment), app_version. A number outside
the range a column accepts is sent as null, so it never keeps the form from being sent.

**A table made before measured_rt60_avg_s existed** keeps working: the database refuses a row with a column it does not
have, so the server then stores the row without that column (everything else as before) and leaves it out until it
restarts; `--check` lists it as missing. To add it, run `server/supabase/schema.sql` again in the SQL Editor: every
statement in it can be repeated, and its `alter table … add column if not exists` adds the column to the existing table. Values are rounded as the app shows them; a value the project
does not have, or an optional answer left empty, is null. The server refuses any request with a field that is not on
that list, so recordings, measurement data, histories, project files, room surfaces, product records, the PDF, browser
storage, cookies or device details cannot be sent. The server does not record IP addresses (it counts requests per
address in memory for the rate limit only). Text is stored exactly as typed: it travels as a JSON value through Supabase's
REST API, never as SQL, and a database does not evaluate formulas (if you export the table to a spreadsheet, open it as
text).

**States**: Not submitted, Form incomplete, Ready to submit, Submitting, Submitted (report unlocked), Submission failed
(nothing was recorded: correct and send again, the answers stay), Not confirmed yet (no answer, so it may have been
recorded: "Check again" sends the same submission). After a reload the report starts locked and unlocks when the server
has confirmed the stored receipt; a project that was reset, or a receipt the server does not recognise, is locked again.

**One row per submission.** The browser makes a submission ID (a UUID) before sending and keeps it (with the answers) until
the server confirms; a retry sends the same ID. The ID is the table's primary key and the insert uses
`on_conflict=submission_id` with `resolution=ignore-duplicates`, so the database itself never holds two rows for one
submission. The server also keeps a ledger (`server/data/submissions-ledger.json`: IDs, a hash of the content, project ID,
status and times; no personal data): a repeated ID returns the first answer, the same ID with different content is
refused, and after an unconfirmed attempt the server looks the ID up before inserting again. Requests for one ID are
handled one at a time. Other limits: JSON only, 16 KB, same-origin requests only, 5 submissions a minute and 30 an hour
per address.

### Setting up Supabase (needs your Supabase account; done once)

1. In your Supabase project: **SQL Editor** → New query → paste `server/supabase/schema.sql` → Run. It creates the table
   `report_submissions` with row level security on, no policies and no privileges for the anon / authenticated roles,
   so the browser-side (publishable) key can neither read nor write it.
2. **Project Settings → API Keys**: copy the project's **secret key** (`sb_secret_...`; the legacy `service_role` key also
   works). **Project Settings → Data API** (or API): copy the **Project URL** (`https://<ref>.supabase.co`).
3. Copy `server/.env.example` to `server/.env` and set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Optionally set
   `SUPABASE_PUBLISHABLE_KEY` so `--check` can confirm the public key is shut out.
4. `python server/app_server.py --check`: confirms the key, the table, its 22 required columns and the optional
   measured_rt60_avg_s (and, if given, that the public key cannot read the table). It reads only.
5. `python server/app_server.py`, then open http://localhost:8780.

Neither the Supabase account password nor the database password is used anywhere. The secret key and `server/.env` stay
on the server: the server never serves `server/` (a path with a backslash, a colon or a NUL byte is refused, and the file
must lie inside the served folder it was asked under), it answers only to this computer's own names (localhost,
127.0.0.1, ::1, the address it listens on, and `REPORT_ALLOWED_HOSTS`), so a web page re-pointed at this computer cannot
reach it, and the browser code holds no key. `vercel.json` and `.vercelignore` keep `.env` files, `server/data/` and
`.git` out of a Vercel deployment. The server refuses to start the
form with a publishable or anon key in `SUPABASE_SECRET_KEY`. Receipts are signed with `REPORT_RECEIPT_SECRET`, or with a
key made on the first submission in `server/data/receipt-secret.key`; replacing it means earlier receipts stop unlocking
(the user submits again). Submissions appear in the dashboard under **Table Editor → report_submissions**.

**Limits.** The PDF is built in the browser, so someone who edits the app's code on their own computer can still produce
a report without the form; the server's checks stop every route in the app as shipped, and the table is the record of
who submitted. A submission unlocks the report of that project; later edits to the project do not lock it again (the row
keeps the values at submission time). Opened from a file, from another server or in a published artifact, the form cannot
be sent and the report stays locked. The browser's own Print on Final Result prints a notice until the report is
unlocked; afterwards it prints the summary without the form.

### Deploying on Vercel

Import the GitHub repository at vercel.com (New Project; framework preset "Other"; leave the build settings to
`vercel.json`). Every push to `main` then deploys again, at the same `https://<project>.vercel.app` address. HTTPS is what
lets the browser open the microphone.

- **What is published:** the build step copies `index.html`, `css/`, `js/` and `assets/` to `public/`, and only that is
  served. `server/`, `docs/`, `tests/` and the README are never published.
- **The API:** `api/health.py`, `api/report-submissions.py` and `api/report-submissions/verify.py` are Vercel Functions
  (Python, standard library only). Each is `server/app_server.py`'s handler through `server/vercel_adapter.py`, so the
  validation, the allowlist, the receipts and the database code are the same as on your own server.
- **Environment Variables** (Vercel → Project → Settings → Environment Variables), as in `server/.env.example`:
  `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_TABLE` (optional, default `report_submissions`) and
  `REPORT_RECEIPT_SECRET`, which is **required** on Vercel: a long random value that stays the same (for example the
  output of `python -c "import secrets; print(secrets.token_hex(32))"`). Without it the form says it is not connected.
  Changing any of them needs a redeploy.
- **What differs from your own server:** the disk is temporary, so the ledger lives in `/tmp` and can be lost between
  requests; the table's primary key and the lookup by submission ID then decide, so a submission is still stored once
  and a receipt still verifies. The same ID sent again with different content after such a loss is answered from the
  stored row instead of being refused. Rate limits are counted per running instance, using the address Vercel reports
  (`x-real-ip`).
- **Check after deploying:** `https://<project>.vercel.app/api/health` answers `{"ok": true, "store": "configured"}`.

Projects are kept in each browser's own storage for that address, so projects made at `localhost` do not appear on the
Vercel address.

## Testing

`tests/` is for development only. The application never loads it, and nothing in it can reach a real measurement.

- `tests/dsp.html`: the analysis code against signals with known answers (`tests/fixtures.js`: seeded synthetic room
  responses of known RT60, optionally with a single device's direct sound (`directDb`), background noise, clipping,
  silence, late arrival, an unclear arrival, fluctuating noise, pink background noise, early reflections, a double-slope
  decay, gaps in the recording, a decay cut off part-way, sounds during the take, ventilation rumble, the sweep level and
  distortion products). 62 checks.
- `tests/sweep-level.html`: the sweep level end to end, in the whole app with a virtual device: background, a take at 0 dB,
  + through the Measure step's action, a take at +3 dB, both processed, then the stored levels and played peaks, the
  recorded level 3 dB higher, RT60 agreeing, the earlier take kept and listed, the report model and PDF, reset and the
  limits. Click "Run the test"; about a minute. 13 checks.
  Bands are compared with the room's own decay, taken straight from its noise-free impulse response over the same
  evaluation range: a band that mixes several reverberation times decays with a value between them, not with the one at
  its centre. Among them: a laptop on a desk (desk reflection, a speaker with no output below 300 Hz, pink background, 48 and
  44.1 kHz), the noise floor near the T20 limit (no systematic over-read), the T20/T30 ranges and their extrapolation,
  and a take with browser processing reported on (no value). Also: a double-slope room read as ISO 3382-2 reads it, the
  same room giving the same value in a noisy and a very quiet moment, gaps of one render block and of 20 ms rejected with
  their position, no false gap in a quiet 16-bit take, and a decay cut off 26 dB down given no value.
- `tests/validation.html`: the validation report. Known RT60 0.30–0.70 s in reference conditions and with one device on a
  desk; background noise from −85 to −46 dBFS; sweeps of 2.5, 5 and 10 s; 44.1, 48 and 96 kHz; RT60 varying by band; a
  double-slope decay; the same room in a noisy and a quiet moment; playback delays up to 1.2 s; clipping, a recording that
  stops early or ends too soon, a weak decay, decays cut off part-way, speaker distortion, gaps, browser processing, no
  test signal. Each case lists Expected (the room's own decay over the same ISO range), Measured, the absolute and
  percentage error, the error against the nominal RT, the other bands, and "Before" (the same recording through the
  analysis as it was before the deep audit). Then checks that every displayed value is the calculated one, the same room
  read in other ways (1 kHz vs mid vs 125–4000 Hz mean; a clap read by this app and by the method in the open-source "RT"
  app's code), and a tool that analyses a WAV impulse response (for example exported from REW) or a clap recording.
  See docs/RT60-DEEP-AUDIT.md.
- `tests/sweep-study.html`: 2, 3 and 5 s sweeps on identical rooms (RT 0.25–0.70 s × three backgrounds × five repeats,
  long decays, distortion, delays, clock offset, recording length), judged against criteria fixed before the run. Takes a
  few minutes. `?first-run` repeats the first run's background levels.
- `tests/noise-study.html`: six backgrounds built on one stationary room noise (steady, fluctuating, falling, rising,
  speech-like sounds, a door), the noise check before and now, and RT60 takes made in each, scored against the room's own
  decay. `?sweep=3` runs the takes with a 3 s sweep. See docs/RT60-SWEEP-NOISE-AUDIT.md.
- `tests/room-surfaces.html`: the room surfaces and the prediction after treatment, in the whole app (its own storage
  prefix). No untreated-room prediction: no such function, field, screen, report row or text in any of the app's
  scripts, and no RT60 at all without a measurement, however completely the surfaces are described. The material library
  (sourced, classified, six bands, no 0 for a missing value); the six areas for several rooms, openings and partial
  coverings (nothing negative, every m² once); what a treatment covers (finish α by area, free area, missing data named);
  each surface independent of the others (through the Room step's actions); saved and reopened; the screen updating on a
  select change, a typed length and an added window; the prediction after treatment by hand from the measured room (no
  surface counted twice; a product on the ceiling unaffected by the walls; the high-absorption and impossible-absorption
  checks); the target unchanged; the measurement isolated (same recording → same result, stored measurement untouched,
  review flags only on Treatment/Predicted/Final, no reference to the surfaces in the 12 measurement files); projects
  saved before the surfaces migrated by the app's own load; the report and PDF. Runs on open. 52 checks. See
  docs/ROOM-SURFACES.md.
- `tests/rt60-responsiveness.html`: does the measured RT60 follow the room, and only the room? Part A (on load, 18
  checks) runs the production analysis and processing on known rooms: six RT60s, repeatability with a new background
  each take, a noise ladder, band slopes, insufficient decay, no reuse between takes, determinism, a wrong reference,
  clipping, distortion, speech, band rejection and the headline, sweep levels. Part B (button, about 2 minutes, 8
  checks) runs the whole app with a virtual device: takes of a room that changes, a repeat, a take left unprocessed, a
  take that is not valid and one that is not used, and what Results, the top bar and the report show after each (the
  take's average RT60 across its bands). See
  docs/RT60-RESPONSIVENESS-AUDIT.md (its findings F1 and F2 are fixed; B4–B6 check the notices on Results).
- `tests/rt60-average.html`: the average RT60 across the measured bands, in the whole app (its own storage prefix). The
  calculation against hand-worked values: all six bands; bands not reliable or not measured left out; missing, 0,
  negative, NaN, infinite and text values, a value without a path, a band with a T20 but no RT60 (no band changes path);
  nothing to average ("Unavailable", never 0 or NaN); the stored values averaged and rounded only for display. Then real
  takes of known rooms through the production analysis and processing: the band tables unchanged; the same average on
  Results, Processing, the Current measurement card, the top bar, Home, Measurement History, Assessment, Final Result,
  the explanation, the report model and the PDF (key figure and Measurement row); the assessment, the prediction and the treatment amount still on the
  band values (a target 1000 Hz meets and the average does not); the report with no treatment still one page; a new take
  processed by the Processing step replacing the average without mixing takes; a later take that is not valid changing
  nothing. Runs on open, about 15 s. 31 checks.
- `tests/mobile-study.html`: one synthetic room measured by the production analysis under laptop-like and phone-like
  conditions, one factor at a time, five takes each (small speaker, closer direct sound, quiet playback, unreported
  automatic gain, noise gate, dropouts removed or zero-filled, soft limiter, 44.1 kHz; level and background ladders).
  A study, not pass/fail: it shows what the software does with each condition, not what a real phone does. See
  docs/MOBILE-MEASUREMENT-AUDIT.md.
- `tests/audio-config.html`: Part A on open (40 checks): the noise floor (units, the level in the RT60 bands, DC offset,
  quiet and noisy inputs, silence, clipping, NaN/Infinity, a short buffer, level changes, thresholds unchanged); takes
  (a DC offset no longer fails a quiet room; 256/480 samples dropped or repeated rejected; one 128-sample block lost or
  repeated at 0.9–4.5 s rejected as a click, in a typical, a quiet and a phone-like take; seven kinds of intact take never
  rejected and never showing a click; distortion folding back and a sound stopping abruptly not taken for clicks; no
  direct sound: timing check not made; gaps, invalid samples, incomplete and clipped recordings rejected); the processing
  decisions (a gain or background change, the input turned down only while the sweep plays, the browser's counts of lost
  frames and output underruns, reported/unreported/ON processing, wording, rounding); the fixed-band headline; profile
  switching and output readiness through the Setup step; the report using the take's configuration; Results naming a
  newer take it does not show; the diagnostics record holding no names or labels. Part B, button (9 checks; keep the tab
  in front, since a hidden page interrupts every take by design): the whole app with a virtual device: permission
  denied, no microphone, the configuration read back, a complete take with its configuration and the browser's counts,
  a take during which the browser counts lost frames (not valid), and takes interrupted by a hidden page, a muted track
  and a disconnected microphone. Synthetic: it checks the software, not real hardware.
- `tests/calculations.html`: geometry and units, Sabine absorption and RT60, the treatment prediction (one and several
  products, missing data), absorption needed and area for the target, octave-band α from one-third-octave data (mean,
  1.00 limit, missing bands), the prediction through `AM.derive`, the DIN 18041 targets (A1–A5, B4, occupancy, the ANSI
  classroom limit) and the target classification (at the digits shown), and a prediction refused where the covered
  finishes' library absorption exceeds what the room measured, each against values worked out by hand in the test.
  25 checks.
- `tests/virtual-room.html`: the whole application with a virtual device in a virtual room in place of the microphone and
  speaker (`tests/virtual-room.js`): getUserMedia returns the room's output; what the app plays is convolved with a
  synthetic impulse response of known RT60, with the direct sound of a speaker centimetres from the microphone, and mixed
  with background noise. The app's code runs unchanged. Controls on `window.VR`: mode (ok, denied, none, busy), rt,
  directDb, gainsDb, noiseDbfs, speakerDbfs, disturb('speech' | 'door' | 'hvac'), stopMic(). Its projects are stored under
  a separate prefix and never appear in the application.

- `tests/report_submission_test.py` (`python tests/report_submission_test.py`): the report server against
  `tests/fake_supabase.py`, a local stand-in for Supabase's REST API that checks the apikey, shuts out the publishable
  key, knows the table's columns and constraints, enforces the primary key and can drop answers, time out or refuse.
  39 checks, 8 of them for Vercel (the api/*.py files loaded by path, as Vercel does: health, submit and verify; a cold
  start that loses the ledger; no receipt secret = not connected; no files served by a function; the rate limit per
  address from Vercel's header; the site's own origin; vercel.json publishing only the app). The others: validation, the 22 approved columns only, unlisted fields refused, text stored as typed, null optional
  values, one row per submission ID (repeats, concurrent repeats, lost answers, timeouts, server errors, the primary key
  without the ledger), refused keys, a missing table, public keys refused as the server key, `--check`, receipts, served
  and unserved files (Windows path tricks included), other host names refused, no key in browser files, origin and rate
  limits, a ledger without personal data, schema.sql against the spec, a table without the new average column (rows
  stored without it), a request from before the column existed (accepted, same content hash), half a character in a
  name (removed, not a crash), and database answers that break off or are not JSON (uncertain, retried once). It never contacts Supabase. To try the whole app against the stand-in: run
  `python tests/fake_supabase.py --port 8791`, put the environment it prints in a .env file, and start
  `python server/app_server.py --env-file <that file>`.

The project report: in `tests/virtual-room.html`, `await AM.report.build(AM.store.state.project)` returns `{ model, doc,
bytes, name }` for the open project without downloading it (`doc.pages.length` is the page count, `doc.unsupported` lists
any character the PDF fonts could not draw — it should be empty). Open the bytes in any PDF reader to check them.

Validation against reference measurements: run the same room with a calibrated measurement system and this app, and
compare per-band T20/T30. `analysis.js` and `processing.js` are pure functions of the recording, so a recording from
another system can be fed to `analyseTake` directly.

## Workflow model

Statuses: **completed** (can be reopened), **current**, **upcoming** (prerequisites done), **locked**.
A stage opens only when every stage before it is completed.

- **Review**: editing data in a finished stage flags the later finished stages that use it for review (`deps` in
  `workflow.js`). Changing the room height flags Target, Assessment, Treatment, Predicted Result and Final Result.
- **Follow**: a target that has not been adjusted follows the recommendation as soon as the room changes.
- **New evidence**: a new take waiting to be processed flags Processing; when it becomes the current measurement, Results
  and every later step run again.

A reload of the same tab returns to the step on screen (sessionStorage). A new tab or browser session opens on Home.

## Rules the code keeps

- Measured values come only from the current valid measurement; predicted values only from the prediction engine.
  They are always styled apart: measured = solid ink, predicted = dashed violet, target = neutral wash.
- No value is shown that was not measured: before a measurement, values read "Not measured"; a band the recording could
  not support reads "Not reliable".
- A treatment plan is used only when every product has a tested configuration and an amount above zero.
- Measured, predicted and target values are never substituted for one another. A take the browser reports as processed
  (echo cancellation, noise suppression, automatic gain) gives no RT60.
- The step guide explains results. It never calculates them.
- Three RT60 values stay separate: the target (from the room's type, use and size), the measured RT60 (from the
  microphone only) and the RT60 predicted after treatment (from the measured RT60 and the products). The room's own RT60
  is never estimated from its dimensions or surfaces.

## Visual system

Colour carries meaning (tokens at the top of `css/app.css`):

| Token | Use |
|---|---|
| graphite neutrals | surfaces, text, lines |
| ink | primary actions (one primary button style) |
| brand red | the brand and "now": the current step (the red `//` from the wordmark) and a live recording |
| acoustic teal | measurement and analysis information: live signal, evaluation ranges, measuring positions, keyboard focus |
| green / amber / crimson | target met / needs attention / failed or invalid |

The interface is set in IBM Plex Sans; measured, target and predicted values use a readout face (IBM Plex Mono).
Both come from Google Fonts and fall back to the system faces offline. Light and dark mode share every token.
Measured values are solid ink, predicted values violet (in dashed outlines), targets a neutral wash, everywhere they appear.

Motion is short (150–250 ms, tokens `--t-fast`, `--t-med`, `--ease`) and only marks something real. The shell
(`render()` in `js/app.js`) rebuilds the page on every change, so it compares before and after and adds classes:

| Class | When |
|---|---|
| `is-entering` on the step content | you arrive at a step (its sections ease in) |
| `is-updated` on a `data-watch` element | that value's text changed while the step stayed open (e.g. the predicted RT60 after changing an amount) |
| `just-done` on a rail step and its meter segment | the step has just been completed, or reviewed again |

Buttons lift 1px on hover and settle when pressed; clickable rows and cards tint or raise; information panels do not
move. With `prefers-reduced-motion` all of it is off, and nothing waits for an animation.

## Product data

```
NRC Master File (.xlsx) → tools/import-products.ps1 → data/products.json + js/data/products.generated.js
                        → AM.services.catalog → Treatment → AM.derive.treatmentSelection → prediction engine
```

To regenerate after the Excel changes (Windows PowerShell, nothing to install):

```
powershell -ExecutionPolicy Bypass -File tools\import-products.ps1
powershell -ExecutionPolicy Bypass -File tools\import-products.ps1 -Source "path\to\new file.xlsx"
```

The importer maps columns by their header text and cross-checks the workbook's other sheets against the master.
It never changes a source value: cells that are not clean numbers keep their source text, their α is treated as
missing, and they are flagged in `data/import-report.md`, as are suspected decimal slips and missing testing conditions.

- **Product**: one sellable variant (category, name, finish, sizes, GSM, thickness). Grouped from rows that share all of these.
- **Configuration**: one source row, meaning one tested mounting, with its certificate, test method, testing condition,
  ratings and α at all 18 one-third-octave bands from 100 to 5000 Hz. Configurations are never merged or averaged.
- **Prediction input**: the octave-band α of the selected configuration (`catalog.getOctaveAbsorption`): the mean of the
  three one-third-octave values in each octave (800, 1000 and 1250 Hz for 1 kHz), rounded to 0.01 and limited to 1.00,
  as ISO 11654 forms the practical absorption coefficient. The measured RT60 it is combined with is an octave-band value,
  and a laboratory α above 1.00 (an edge effect of the test specimen) would add absorption no surface has. The tested
  one-third-octave values are still shown as reported. A band with no usable α (any of its three values missing), or no
  reliable measurement, gets no prediction rather than an assumed value.

## Other controls

- **Developer tools** (bottom of the sidebar): jump to a step. Room Setup and Target are filled with a sample room (its
  six surfaces, a window and a door from the material library);
  measurement steps are never filled in, so the shortcut stops at the first step that needs a real measurement.
  Reset or close the project.
- Projects are saved in the browser's localStorage (no account). Home lists them: pinned projects first, then the six most
  recently updated. Measurement History lists every project. Projects can be deleted (after a confirmation).
- Final Result: **Measure the treated room** (a follow-up project with the same room, target and measuring setup, opened
  at Measurement Setup) and, at the bottom, **Download PDF Report** (see Project report).
- Official UniVicoustic websites, opened in a new tab (`ui.extLink`; the addresses are kept once, in `AM.brand.links`,
  `js/data/brand.js`):
  - **Explore UniVicoustic Product Catalogue** (https://catalog.univicoustic.com/) at the top of Treatment's product
    browser ("Choose a product", "Add a product to the plan", "Change the product"), where products are being discovered.
  - **Open Panel & Wall Configurator** (https://configurator.univicoustic.com/login) on Final Result, below the treatment
    summary and above the project report, only when the project has a treatment plan. The configurator has its own sign-in.

  They are links only: nothing from the project is sent to either site, nothing from them enters the project, the plan
  and the prediction use only the tested data in the app, and the app works the same when the sites are unreachable.
- UX audit: `docs/UX-AUDIT.md` (generated from `docs/ux-audit/issues.json`).
