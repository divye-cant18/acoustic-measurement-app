# Average RT60 across measured frequency bands

The measured headline is the average RT60 across the measured octave bands instead of the RT60 at 1000 Hz. Every band
keeps its own value; the target comparison, the treatment and the prediction keep working band by band.

## Calculation (`js/services/rt60-average.js`)

    average = Σ RT60(band) ÷ number of eligible bands

`AM.services.rt60Average.of(result)` is the only implementation. Screens and the report read it through
`AM.derive.averageRT60(project)`, which passes the CURRENT valid measurement and nothing else.

| Rule | How |
|---|---|
| Eligible band | `rt60` is a finite number above 0, the band has a calculation path (T30 or T20), quality is not Insufficient or Not measured: the processing engine (`decideBand`) gave it a value |
| Left out | "Not reliable" and not-measured bands; missing, 0, negative, NaN, infinite or non-numeric values; a value without a path. Never counted as 0 |
| Path | The band's own RT60. Its T20 or T30 is never used in its place, so no band changes path to be counted |
| Precision | The band values as stored by the engine (to 1 ms). The average is kept unrounded and rounded only for display |
| One measurement | Only the result it is given. Superseded measurements (history keeps a summary, no bands), later invalid takes and other projects never enter it |
| Nothing to average | Invalid take, no measurement, or no eligible band: `available: false`, `value: null`, with the reason. Shown as "Unavailable" |
| Traceable | `included` (band, value, path, quality), `excluded` (band, reason), `n`, `total`. Under each band table in the app: the calculation, e.g. (0.504 + 0.358 + 0.274 + 0.276 + 0.293) ÷ 5 = 0.341 s, and the bands left out with why. In the report: "mean of n of 6 bands" beside the band table, whose "Not reliable" rows are the bands left out |

It is labelled "Average RT60 across measured frequency bands": a summary, not a standardised single-number rating (such as
T_mid, which averages 500 and 1000 Hz only).

## Audit: where the 1000 Hz value was used, and what it is now

| Place | Before | Now | Why |
|---|---|---|---|
| Measure step, Current measurement card | RT60 at 1000 Hz | Average (n of 6 bands); 1000 Hz value, method and confidence beside it | Measurement summary |
| Processing, Band by band table | Bands only | Average summary under the table; "Unavailable" for a take that is not valid | Requested summary |
| Processing, take not valid | "current measurement (RT60 x at 1000 Hz) stays in force" | Average and the 1000 Hz value | Measurement summary |
| Results headline | RT60 at 1000 Hz, T30-derived, quality and confidence of 1000 Hz | Average; bands averaged and left out, band range, "At 1000 Hz: value · method · quality" | Measurement summary; badges no longer imply the average belongs to 1000 Hz |
| Results, RT60 by octave band | Chart and table | Unchanged, plus the average summary under the table | Requested summary |
| Results, Takes in this project | RT60 at 1000 Hz per take | Unchanged | Compares sweep levels at the reference band; superseded takes keep no bands to average |
| Top bar | Measured = 1000 Hz | "Measured avg" = average; Target and Predicted tooltips say "at 1000 Hz" | Always-visible measurement summary |
| Home project card | Measured RT60 (1000 Hz) and status | "Avg RT60" = average; status "… at 1kHz" | Summary; the status is the 1000 Hz assessment |
| Measurement History | RT60 at 1000 Hz | RT60 average of n bands | Summary |
| Assessment | Measured at 1000 Hz vs target | Unchanged, plus one line giving the average and why 1000 Hz is compared | The target is defined at 1000 Hz |
| Treatment, amount for the target | 1000 Hz | Unchanged | Engineering decision at the target's band |
| Predicted Result | Per band from each band's RT60; headline at 1000 Hz | Unchanged | Frequency-dependent prediction |
| Final Result | "Measured" (1000 Hz) | "Average RT60" and "Measured at 1000 Hz" rows; the journey titled "at 1000 Hz" | Summary plus the comparison's own value |
| Step explanations (Results, Assessment) | 1000 Hz | Average first, then 1000 Hz as the target's band | User-facing explanation of the method |
| PDF key figures | MEASURED RT60 · 1000 Hz | AVERAGE RT60 · MEASURED BANDS (mean of n of 6 octave bands); target, "MEASURED VS TARGET · 1000 Hz" and predicted say "at 1000 Hz" | Summary; comparisons labelled |
| PDF measurement section | "Result at 1000 Hz" and "Quality · validity" rows | "Average RT60" heads the right column; the 1000 Hz result and its quality share one row. Band table unchanged | Same height: a report with no treatment stays on one page, as Final Result says (checked with 0–3 notes) |
| PDF summary | At 1000 Hz … | Unchanged with a target (it narrates the assessment); without a target the average is added to the sentence | A separate average sentence pushed borderline one-page reports onto two pages |
| Report form row (Supabase `measured_rt60_s`) | 1000 Hz | Unchanged | Stored next to `measurement_method` and `predicted_rt60_s`, both at 1000 Hz; changing its meaning, or adding a column, is a schema change for review |

## Tests

`tests/rt60-average.html` (31 checks); `tests/rt60-responsiveness.html` Part B now expects the average on Results and the
top bar. See README, Testing.
