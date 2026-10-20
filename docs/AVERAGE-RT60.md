# Average RT60, 125–4000 Hz (the room's RT60), and the 500–2000 Hz average beside it

> **Changed 2026-10-19 (docs/TARGET-CRITERIA.md).** Targets come only from verified criteria. Under DIN 18041 A1–A4 the
> 125 Hz and 4 kHz bands are judged against the standard's own limits (0.65–1.45 × and 0.65–1.2 × T_soll), not shown as
> warnings; an NBC 2016 office target is judged at 500 Hz only. Occupancy no longer changes the target.
>
> **Changed in app version 2026.10.16 (docs/MULTI-POSITION.md).**
> - **Positions.** The averages are taken over the room as measured at two or more positions (per band, the mean of the
>   positions).
> - **The verdict.** It is no longer this average. It is the room's criterion's own band rule: for a meeting room under
>   DIN 18041 group A, every band from 250 Hz to 2 kHz within the target range, with the average over those bands as its
>   summary. Band warnings for 125 Hz and 4 kHz are shown apart from it.
> - **The all-band average described here** is still shown as the room's overall figure and stored in the report form.
> - **The 500–2000 Hz average** is no longer shown on screen; it remains in the diagnostics.
> - **What changed below.** Where the sections below say the target, the treatment amount or the prediction use this
>   average, read "the average over the bands the room is judged in" (`AM.derive.summaryRT60`).

The room's RT60 is the mean RT60 of the octave bands from 125 to 4000 Hz **that were measured reliably**. It is the one
value used wherever the app means the room as a whole. The 500–2000 Hz average is kept with the record and the takes
(it is no longer shown beside it on screen). Every band also keeps its own value.

## Calculation (`js/services/rt60-average.js`)

    average = (sum of RT60 over the bands with a value) ÷ (how many there are)

`of(result)` takes the six bands, `mid(result)` the middle three (500, 1000, 2000 Hz), by the same rule; `ofPrediction(bands,
over)` takes the predicted values over exactly the bands the measured average used (one shared `combine`). Screens,
calculations and the report read them through `AM.derive.averageRT60` / `midAverageRT60(project)` (the CURRENT valid
measurement only) and `AM.derive.prediction(project)` (`measured`, `predicted`).

| Rule | How |
|---|---|
| Bands | 125–4000 Hz for the room's RT60; 500–2000 Hz for the check beside it |
| A band without a value | Left out and named: "5 of 6 bands · 125 Hz not measured" (`describe`); nothing put in its place |
| Too few bands | At least half are needed (3 of 6; 2 of 3 for 500–2000 Hz). Below that: "No average: … the average needs at least 3 of the 6 bands (only 2 have one)", with the first band's own reason; the room is not assessed, and no single band (1000 Hz included) is used instead |
| A band counts | `rt60` a finite number above 0, with its calculation path (T30 or T20), quality not Insufficient or Not measured. Its own RT60 is used; its T20 or T30 is never taken in its place |
| Predicted | Over the same bands as the measured average, each of which must have a prediction (none where a product has no tested α there, or the covered finishes do not fit the room) |
| Precision | The band values as stored (measured to 1 ms, predicted unrounded); averages kept unrounded and rounded only for display |
| One measurement | Only the result it is given; superseded measurements, later invalid takes and other projects never enter it |
| Traceable | Under the band table (Show technical details): the calculation, e.g. (0.580 + 0.600 + 0.450 + 0.560 + 0.400) ÷ 5 = 0.518 s, and the bands left out |

**History.** Until app version 2026.10.15 the headline was the 500–2000 Hz mean. On 2026-10-15 it became all six bands
with every band required, and then, the same day, after testing a real room where a phone-like device lost 125 Hz, the
bands that have a value, with the 500–2000 Hz average shown beside it.

**Trade-off.** An average over the bands that were measured can change with a device's band coverage: in
`tests/mobile-study.html` a small phone speaker that loses 125 Hz (the band that usually rings longest) read lower than
a laptop in the same room. The app therefore always says how many bands an average uses and which were left out, and
shows the 500–2000 Hz average, which every device measures most reliably, next to it. Standards state room targets
mainly for the mid frequencies (DIN 18041 from 250 Hz to 2 kHz, with its own limits at 125 Hz and 4 kHz; NBC 2016 at
500 Hz); the 125 and 4000 Hz bands, when measured, move the value the target is compared with.

## What uses it

| Where | What |
|---|---|
| Measure (Current measurement), Results headline, Processing and Results summaries, top bar ("Measured avg"), Home, Measurement History | The measured average |
| Acoustic Assessment (`AM.derive.assessment`) | The average against the target range: `rt`, `diff`, `status`; without it `available: false` and the reason |
| Treatment needed (`treatmentRequired`, `noTreatment`) | The average's status |
| Absorption needed (`absorptionGap`) | Sabine's equivalent absorption for the average: 0.161·V ÷ target − 0.161·V ÷ average; the plan's share is the same for its predicted average |
| Amount for the target (`treatmentForTarget` → `prediction.areaForAverage`) | The area at which the predicted average reaches the preferred target: the prediction's own model, solved by bisection |
| Prediction (`AM.derive.prediction`) | `predicted` = the mean of the six predicted bands; `measured` = the measured average; each item's `alonePredicted` |
| Predicted Result, Treatment plan, top bar ("Predicted"), Final Result | Measured, predicted and target as averages |
| PDF report | Key figures (average, target compared with it, assessment of the average, predicted average), the Measurement and Assessment sections, the predicted outcome, the summary |
| Results, Assessment | The 500–2000 Hz average beside the room's RT60, with its own status on Assessment (a check; it decides nothing) |
| Report form database row | `measured_rt60_avg_s` (the average over the bands measured; before 2026.10.15 the 500–2000 Hz mean, told apart by `app_version`), `predicted_rt60_avg_s` (the predicted average, added in 2026.10.15) |

## What stays at 1000 Hz, and why

| Where | Why it is band-specific |
|---|---|
| Validity of a take (`services/processing.js`): valid when 1000 Hz has a value; the Processing "Calculation path at 1000 Hz", the retry guidance | The acceptance rule of the measurement, unchanged |
| The headline row of a result and of a prediction (`headline`), `measured_rt60_s`, `predicted_rt60_s`, `measurement_method` | That band's own data, under its own name; never relabelled as the average |
| Quality and confidence "at 1000 Hz" | Given per band; 1000 Hz is the band they are reported at |
| α and added absorption at 1000 Hz in the Treatment plan, the product chart's label, the covered finish's α | Product data at one band, labelled; every band is in the frequency table |
| The Sabine calculation written out at 1000 Hz (Predicted Result, PDF) | An example of the per-band calculation, followed by the average of the six |
| Takes table: RT60, usable decay, T20 / T30 and r² at 1000 Hz, and the spread between sweep levels | A repeatability check of the measurement at its reference band |

## Tests

`tests/rt60-average.html` (57 checks), `tests/calculations.html` (the amount for the average worked out by hand),
`tests/validation.html`, `tests/audio-config.html` A4 and A5, `tests/rt60-responsiveness.html`, and
`tests/report_submission_test.py` for the database columns. See README, Testing.
