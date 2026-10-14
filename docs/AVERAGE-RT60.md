# Average RT60, 500–2000 Hz (the headline)

The measured headline is the mean RT60 of a **fixed** set of octave bands: 500, 1000 and 2000 Hz. Every band keeps its
own value; the target comparison, the treatment and the prediction keep working band by band.

## Calculation (`js/services/rt60-average.js`)

    average = (RT60(500 Hz) + RT60(1000 Hz) + RT60(2000 Hz)) ÷ 3

`AM.services.rt60Average.of(result)` is the only implementation. Screens and the report read it through
`AM.derive.averageRT60(project)`, which passes the CURRENT valid measurement and nothing else.

| Rule | How |
|---|---|
| Required bands | 500, 1000 and 2000 Hz (`REQUIRED`), the same for every take and every device |
| A required band without a value | No headline: "No average: 500 Hz has no reliable value, and the average needs all of 500, 1000 and 2000 Hz", with that band's own reason. Never an average of the bands that passed |
| A band counts | `rt60` a finite number above 0, with its calculation path (T30 or T20), quality not Insufficient or Not measured. Its own RT60 is used; its T20 or T30 is never taken in its place |
| Other bands (125, 250, 4000 Hz) | Shown on their own, listed as "not part of the average"; they never change the headline |
| Precision | The band values as stored (to 1 ms); the average is kept unrounded and rounded only for display |
| One measurement | Only the result it is given; superseded measurements, later invalid takes and other projects never enter it |
| Traceable | Under each band table: the calculation, e.g. (0.358 + 0.274 + 0.276) ÷ 3 = 0.303 s, or the required band that failed and why |

**Why a fixed set.** The first version averaged whichever bands passed. That made the headline depend on the device's
band coverage instead of the room: in `tests/mobile-study.html` a small phone speaker that loses 125 Hz read 6.7 % lower
than a laptop in the same room, and a band dropping in and out made the value jump between takes. With the fixed set the
same synthetic room reads within 1.7 % across the modelled laptop and phone conditions, or says it has no headline.

**Why these bands.** They are the mid-frequency octave bands ANSI/ASA S12.60 states classroom reverberation limits in
(the app already applies that standard to classrooms), and the bands one device, phones included, measures most
reliably; a phone's small speaker loses 125 and 250 Hz first.

It is labelled "Average RT60, 500–2000 Hz": a summary of the mid frequencies, not a standardised single-number rating.

## Where it appears

Measure step (Current measurement), Processing and Results (summary under the band table), Results headline, top bar
("Measured avg"), Home and Measurement History, Assessment (one line: the target is compared at 1000 Hz), Final Result,
the PDF key figure ("AVERAGE RT60 · 500–2000 Hz") and the first row of its Measurement section, the Takes table on
Results (one per take), and the report form's database row: `measured_rt60_avg_s` (null when one of the three bands has
no value), next to `measured_rt60_s`, which stays the 1000 Hz value the target is compared at. A table made before that
column existed gets it by running `server/supabase/schema.sql` again; until then rows are stored without it. The
assessment, the amount of treatment and the prediction stay at 1000 Hz and per band.

## Tests

`tests/rt60-average.html` (31 checks) and `tests/audio-config.html` A4. See README, Testing.
