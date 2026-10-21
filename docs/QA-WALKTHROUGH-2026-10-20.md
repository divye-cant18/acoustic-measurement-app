# Whole-application walkthrough, 20 October 2026

The whole application was walked through, from Home to the PDF report, on the virtual test room
(`tests/virtual-room.html`): one walkthrough by hand and three reviews in headless Chrome (Home and navigation,
steps 1–6, steps 7–10 with the PDF). The measurement calculation chain and the product absorption data were
audited separately.

Only existing features were checked. Every problem found is listed here first; the Status column says what was done
about it.

What works and was checked: the whole workflow end to end; target values (DIN 18041, NBC, EBU) checked by hand;
per-band verdicts; the amount for the target; the prediction (Sabine, with Eyring as a check); review flags after an
earlier change; reload; phone width (375 px); dark mode; the tour, the videos and the step guides; the report form on
the client side (nothing was submitted); the PDF. There were no console errors apart from a missing favicon.

## The list

| # | Step | Problem | Kind | Status |
|---|---|---|---|---|
| 1 | Room Setup | Before an industry is chosen, the room type list shows "Other" | cosmetic || Fixed: no list until an industry is chosen (`target.typeGroups`) |
| 2 | Room Setup | Changing an optional detail (reference, purpose, occupancy, notes, chips, questions) or adding/removing a wall or ceiling section marks Target for review, though none of them changes the target | wrong behaviour || Fixed: these details flag nothing; a wall or ceiling section added or removed flags Treatment, Predicted and Final only (`workflow.js` NARROW, `room.js`) |
| 3 | Room Setup | A room size outside the limits gives contradictory text: an empty warning, "None — no verified criterion", the summary's volume "—" while the top bar shows a volume | wrong text || Fixed: no target and no volume anywhere until the size is within the limits (`derive.geometry`, Room screen) |
| 4 | Room Setup | A door count of 0 or −2 is counted as 1 with no error; occupancy "abc" shows an error but Continue still works | wrong behaviour || Fixed: a count below 1 is an error that blocks Continue; text in a number field blocks Continue with the reason (`store.check`) |
| 5 | Room Setup | Number fields accept trailing text: "12abc" stores 12, "2 x 3" stores 2, "1,250" stores 1.25 | wrong behaviour || Fixed: the whole entry has to be a number; "1,250" is asked again (`util.num`) |
| 6 | Room Setup | An over-large ceiling section is limited silently; its warning sits on another card | wrong text || Fixed: the section itself says it is larger than the floor and how it is counted |
| 7 | Room Setup | Closing the walkthrough video from the Help menu jumps to the Length field | wrong behaviour || Fixed: only the room-size video leads to the Length field |
| 8 | Target | With an own range and an upper-limit criterion the subtitle reads "Every band 500 Hz is judged: …" | wrong text || Fixed |
| 9 | Measurement Setup | Ticking the room-preparation checklist marks Measurement and Processing for review | wrong behaviour || Fixed (`setup.prep` flags nothing) |
| 10 | Measurement Setup | "Ready to measure" when the background was checked at another position | wrong text || Fixed: a check made at another position is not counted; the row says where to measure |
| 11 | Measurement Setup | The microphone list can show "Previously selected microphone" or the same microphone twice | cosmetic || Fixed: "Default microphone" by name, never listed twice |
| 12 | Setup / Measure | Leaving the page during a background check or a take records microphone access as failed | wrong behaviour || Fixed: an interrupted recording leaves the permission as it was |
| 13 | Measurement | The same background check shows 71.3 dB below max on Setup and 65.0 dB on Measurement (in-band vs unfiltered) | wrong text || Fixed: both show the level in the RT60 bands |
| 14 | Measurement | At a new position, or after a failed take, the panel describes the previous take ("Take processed", "Measure again") | wrong text || Fixed: the panel speaks of the selected position ("Not measured at P3 yet", "Start measurement") |
| 15 | Measurement | After a device-profile change the checklist can be skipped by opening Measurement from the rail | wrong behaviour || Fixed: a take cannot start until the checklist is done |
| 16 | Measurement | A recorded but unprocessed take is replaced without a word when another take is started | wrong behaviour (data loss) || Fixed: a take cannot start while a take from another position waits to be processed |
| 17 | Measurement | The main button reads "Process recording" when there is nothing to process | wrong text || Fixed: "Continue to Processing" |
| 18 | Measurement | A take that failed with an error is listed at sweep level 0 dB whatever level was used | wrong text || Fixed: the level the take started at is stored |
| 19 | Measurement / Results | Position counts read "3 of 2" | cosmetic || Fixed: "3 positions" |
| 20 | Measurement | At −12 dB the sweep-level hint says every 3 dB lower costs 3 dB, though it cannot go lower | cosmetic || Fixed |
| 21 | Measurement | Help › "How the app works" opens "How to measure" | wrong behaviour || Fixed |
| 22 | Processing | A take spoiled by talking reads "Needs 45 dB, has 50 dB · No": the 50 dB is before the talking is counted | wrong text || Fixed: "has 22 dB (50 dB less 28 dB of sounds during the take)" |
| 23 | Processing | "Review: an earlier step changed" stays after the new take has been processed | wrong text || Fixed: processing the new take clears it |
| 24 | Processing | The average's description claims the 500–2000 Hz average is shown beside it; it is not | wrong text || Fixed (text and `docs/AVERAGE-RT60.md`) |
| 25 | Processing | The note "the decay speeds up … noise suppression may be cutting it" can appear at 125 and 250 Hz in rooms where nothing is wrong (random scatter there is 8–11 %) | wrong text || Fixed: below 500 Hz the note blames the device only beyond 25 %; within that it says the low band scatters |
| 26 | Results | "medium confidence at 1k Hz" | cosmetic || Fixed: "at 1000 Hz" |
| 27 | Results | A take that was not valid disappears from the takes list, though the card says earlier takes are kept | wrong text || Fixed: the text says which takes are kept |
| 28 | Results | Warnings joined as "P1 and P2 and P3" | cosmetic || Fixed: "P1, P2 and P3" |
| 29 | Results | The step guide prints the date as "10/20/2026, 1:52:51 AM" | cosmetic || Fixed |
| 30 | Assessment | The verdict tile reads "Does not meet the target / every band … within its limits" | wrong text || Fixed: within reads the rule; otherwise it names the bands outside their limits |
| 31 | Assessment / PDF | Upper-limit targets (NBC) read "against a preferred —" and "from the preferred —" | wrong text || Fixed: "against an upper limit of 0.75 s" / "against the 0.75 s limit" |
| 32 | Assessment / Treatment / Final / PDF | "all 1 bands"; "outside the at most 0.75 s target" | cosmetic || Fixed: "one band", "outside the 0.75 s limit" |
| 33 | Treatment | The top card is chosen by the average against the preferred value, not by the verdict: "Absorption needed" for a room that meets the target, "already meets the target" for one that does not | wrong text || Fixed: the card follows the verdict (above / within / below), with a note when the average is at the target but a band is not |
| 34 | Treatment | "Choose a product and configuration …" shown when one is chosen but the plan has another problem | wrong text || Fixed: the plan's own problem is named |
| 35 | Treatment | A huge amount (5000 m²) is blamed on Room Setup's finishes | wrong text || Fixed: the amount and the free surface are named |
| 36 | Treatment / Prediction | The amount-for-target button does not wrap at 375 px and the page scrolls sideways | cosmetic || Fixed: the button wraps |
| 37 | Treatment | Ceiling-only products (clouds) start with placement "Walls" | wrong behaviour || Fixed: ceiling-only products start on the ceiling, wall-only ones on the walls |
| 38 | Treatment / Prediction / Final / PDF | Band lists without "and": "125 Hz, 250 Hz would still ring" | cosmetic || Fixed everywhere (`fmt.list`, `fmt.hzList`) |
| 39 | Predicted Result / PDF | A configuration with no α at 1 kHz under an NBC target (judged at 500 Hz) crashes the step and the PDF | blocker (not reachable with today's product file) || Fixed: the calculation is written out at the first band that has a prediction |
| 40 | Predicted Result / Final / PDF | In a room that meets or is below the target: "0 panels" to meet the target, and "Less treatment would do" / "reduce the treatment" when the room was below before any treatment | wrong text || Fixed: no "0 panels"; a room already below the range is told so, not "less treatment would do" |
| 41 | Predicted Result | The written-out calculation does not add up as printed (rounded inputs, unrounded arithmetic) | cosmetic || Fixed: the inputs are printed as stored, as in the PDF |
| 42 | Predicted Result / Final | With every product removed: "needs a valid measurement" / "needs every earlier step", though the measurement is valid | wrong text || Fixed: "Choose a product in Treatment …" (`derive.predictionMissing`) |
| 43 | Final | The headline names only the bands that ring too long, says "their limits" for one band, and can say "still −0.21 s above the target range" | wrong text || Fixed: both directions named; the difference to the limit only when the average itself is above it |
| 44 | Final | The page count it promises for the PDF is wrong (no treatment: 2 pages, not 1; 5–6 products: 3 pages) | wrong text || Fixed: no page count is promised (README corrected); page 1 layout unchanged |
| 45 | PDF | The next step says "increase the treatment" when some bands would already be too dry | wrong text || Fixed: mixed results get "change the mix"; a room already below gets "no treatment recommended" |
| 46 | PDF | Says DIN group A judges 250 Hz–2 kHz (it judges 125 Hz–4 kHz) and mentions an "own limit" that no row shows | wrong text || Fixed: "every band 125 Hz–4 kHz, each against its own limits" |
| 47 | PDF | A predicted band with no tested α is labelled "n/r" (reads as "not reliable") | cosmetic || Fixed: "n/a" for a predicted band |
| 48 | Final | Enter in a report-form field does nothing | wrong behaviour || Fixed: Enter in a one-line field sends the form, as the button does |
| 49 | Final | "Measure the treated room" starts at the original's last position instead of P1 | cosmetic || Fixed: starts at P1 |
| 50 | Home | A project measured at 1 of 2 positions shows a final verdict on its card | wrong text || Fixed: "Provisional · 1 of 2 positions" instead of a verdict |
| 51 | Home | The card's Target and Predicted can differ from the top bar's | wrong text || Fixed: the cards follow the top bar's rules |
| 52 | Rail | The Home item reads "Completed" | cosmetic || Fixed: "Home · Projects and history", home icon |
| 53 | Shell | After a panel closes, focus goes to a different control or nowhere (History, walkthrough, tour offer, delete, pin) | accessibility || Fixed: focus returns to the control itself (or the menu button on a phone); after "Not now", delete, cancel and pin it stays on the same project's control |
| 54 | Shell | At phone width the menu drawer does not hold keyboard focus | accessibility || Fixed: the page behind the open menu is inert |
| 55 | Shell | `index.html` has no doctype, no language and no favicon (quirks mode, a 404 on every load) | cosmetic || Fixed: `<!doctype html>`, `lang="en"`, the brand icon |
| 56 | Shell | Between 901 and about 975 px wide the top bar breaks onto two rows | cosmetic || Fixed: the readouts wrap onto their own row from 980 px down |
| 57 | Home / History | "steps to review · Target" vs "next: Target": two wordings for one thing | cosmetic || Fixed: "… to review · next: …" in both |
| 58 | Shell | Two tabs: reloading one restores the other tab's project; the same project in two tabs loses the first tab's edits; a project deleted in one tab while open in another drops out of the list | wrong behaviour (data loss) || Fixed: a reload restores this tab's own project; the open project takes up another tab's saves in place; a deleted project saved again elsewhere is listed again; a project another version cannot read is skipped |
| 59 | Measurement chain | Octave filters centred on the base-2 series (125, 250 … Hz exactly); IEC 61260-1:2014 specifies base-10 centres (125.9, 251.2 … Hz) | standards || Fixed: base-10 midband frequencies (125.89 … 3981.1 Hz), labels unchanged; new check in `tests/dsp.test.js` |
| 60 | Measurement chain | Comments and docs: "about −36 dB one octave out" (it is −18 dB at the neighbouring centre), "IEC 61260 base-2", "ISO 3382-2 allows … noise subtraction" (not verifiable), 35/45 dB cited only from the interrupted-noise clause | documentation || Fixed (dsp.js, analysis.js, demo.js, README, MULTI-POSITION, REFERENCE-AUDIT, RT60-DEEP-AUDIT) |
| 61 | Measurement chain | T30 is used whenever 45 dB of decay is usable, else T20. In a curved decay a 1 dB change in background can move the result by about 15 %; ISO 3382-2 prefers T20 | method decision || Done (your choice, 20 October 2026): RT60 is T20; T30 is worked out from 45 dB as the straightness check (confidence high only when it agrees within 10 %). Saved projects are brought over to the T20 each take kept, never re-estimated, and their result steps are marked for review |

Not acted on, as agreed: the manufacturer's class labels (A/B/C/D) shown beside αw in the product data.

## Item 61: T30 or T20 as the reported RT60

Today the app reports T30 whenever at least 45 dB of the room's decay is usable, and T20 when 35–45 dB is. Both are
ISO 3382 evaluation ranges. In a room whose decay is not a single straight line (uneven absorption, coupled spaces), T30
and T20 differ, so a 1 dB change in the background can move the reported value across the 45 dB boundary: in the audit's
double-slope room, 0.801 s (T30) became 0.677 s (T20), 15 % lower. ISO 3382-2 states a preference for the 20 dB range.

Options:
- **T20 as the reported value** (ISO 3382-2's preference), T30 and the curvature C kept beside it when 45 dB is usable.
  Reported values in rooms with curved decays become somewhat lower; the jump at 45 dB goes away.
- **Keep T30 first** (as now), and state on Processing and in the report which range each band used.

Decided: T20 as the reported value (done; README, Live measurement, Decision).

## Tests after the fixes

Run headless in Chrome against the local server: calculations 48/48 (6 new checks for this walkthrough), target-criteria
47/47, room-form 78/78, room-surfaces 52/52, rt60-average 60/60, audio-config 52/52, dsp 65/65 (1 new check),
validation 72/72, multi-position 45/45, sweep-level 14/14, rt60-responsiveness 27/27. The studies (noise, sweep, mobile)
ran to the end. The sweep study's verdicts are the same as its documented baseline (docs/RT60-SWEEP-NOISE-AUDIT.md §3a:
5 s fails only P1 and P4, as all durations do): mean error at 1 kHz 1.33 / 1.20 / 1.27 % for 2 / 3 / 5 s (documented
1.32 / 1.20 / 1.27 %).

## After the walkthrough: treatment made automatic (your request)

The Treatment step asked the user for a "treatment area" in m², a mounting chosen from a list of test certificates, and
showed free surface, coverage and absorption at 1000 Hz. Now:

- Choosing a product is enough. The app picks the tested mounting that does best in this room ("Recommended for this
  room") and works out how much of every product it chose, together, so a mix can fix both low and high sounds.
- The amount is a slider in panels ("4 panels, covering about 14 % of the walls") or a share of the surface ("57 % of the
  ceiling"); there is no m² on the screen. The app's amount is marked on the slider, and the result follows as it moves.
- The result is said first and in everyday words: echo time now → predicted; "Meets the target", "Still too echoey",
  "Too dull" or "Not there yet"; which sounds would still be wrong (low sounds, voices, high sounds) and what would help.
- An amount the user sets stays as set; the app's other products are worked out again around it. "Go back to the app's
  amount" hands it back.
- The mounting list, the test data and the calculation (m², α, coverage, absorption) are folded away for experts.
- Predicted Result uses the same slider.
- Final Result and the PDF say it the same way (your follow-up): how much as panels or a share of the surface, the result
  and what would still be wrong in everyday words. In the PDF the m² areas, the tested α table and the written-out
  calculation moved to a last section, "Details for your acoustic consultant", so nothing is lost.

## Product selection redesigned (your request)

A guided flow inside Treatment, built only from the existing product data (NRC Master File: 90 entries):
categories → products → one product → your selection → View results.

- Six categories, read from each product's own name: Ceiling clouds (10), Wall panels (3), Textured and 3D panels (10),
  Tiles and strips (5), Acoustic wallpaper (1), Polyester wool and infill (2). No floor category: the data has no floor
  products. Every entry is in exactly one category (tested).
- The versions of a product (thickness, weight, size) are one product with version chips: 31 products instead of a list
  of 90.
- Each product has an original drawing of it in a small lit room, and a description made only from its data.
- Drawings and cards refined after the UniVicoustic online catalogue (inspiration only, nothing copied): collection
  cards for the categories, a catalogue header with a row of facts on a product, hover motion, a deeper drawing for a
  thicker version, and a room sketch under "How much" that fills in as the slider moves.
- Mounting (21 October, from a review): the tested ways of mounting were only behind a closed "Change how it is mounted"
  link after adding, and the product header counted the ways over all versions. Now "How it is mounted" is always open on
  the product page with every tested way of the version shown (drawing, plain name, absorption bars, NRC), can be picked
  before adding, and the header counts the version's own ways.
- A product page shows only what that product needs: versions, how it is mounted (the app's recommendation), how much
  (slider), where it goes, and the result. A version whose test has no value in a band the room is judged on is marked
  and cannot be added (found while testing: such a version stopped the app from working out the amounts of the others).
- Your selection: each product with its drawing, version and amount; Edit, Remove (Undo), Add a product, View results.
  When the app finds that the other products are enough, a product reads "none needed with the other products" and no
  longer blocks View results.
- Works at phone width (products become compact rows); the existing calculation (prediction, verdict, amounts) is
  unchanged and reused.
