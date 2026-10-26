# Room surfaces and the prediction after treatment

Room Setup describes the room's six surfaces one by one. The surfaces describe the room and tell the treatment
prediction what each product covers. **The room's own RT60 is not estimated from them: it is measured.** This document
records the concept, how the surfaces and the treatment prediction work, where the material data comes from, how they
are kept apart from the measurement, and what has and has not been validated.

## 0. Concept (revised 12 October 2026)

The acoustic workflow centres on three values:

| Value | Comes from | Step |
|---|---|---|
| **Target RT60** | the room's category (type and main activity) and, where the criterion needs it, its volume, only from a verified criterion (`services/target.js`, docs/TARGET-CRITERIA.md); a range, or an upper limit where the standard gives only that | Target |
| **Measured RT60** | the microphone measurement only (`js/measurement`, `services/processing.js`), unchanged | Measurement → Processing → Results |
| **Predicted RT60 after treatment** | the measured RT60 and the chosen products (`services/prediction.js`) | Treatment → Predicted Result |

Room → target → measure → compare with the target → select treatment → predict after treatment → report.

**Removed:** the "room model", which estimated the untreated room's RT60 from its dimensions and surface materials
(A = Σ S·α, RT60 = 0.161 V / A) and showed it on Room Setup ("Predicted existing RT60"), on Predicted Result ("Room
model, for comparison", with the plan) and in the report ("Room model (estimate)"). What went:

- `js/services/room-model.js` (`AM.services.roomModel`), with `predict` (untreated-room RT60) and `withTreatment` (the
  plan applied to that model). Replaced by `js/services/surfaces.js` (`AM.services.surfaces`), which keeps the surfaces,
  their areas and materials and what a treatment covers, and has no absorption total and no RT60.
- `AM.derive.roomPrediction` and `AM.derive.roomTreatment`.
- The per-surface absorption sums (`A`, `missing`) in the surface model: an absorption area is no longer calculated for
  the untreated room.
- The Room Setup "Room model" card (predicted existing RT60, A and RT60 per band, before the last change). The Room
  summary now says how many surfaces are described.
- The "Room model, for comparison" card on Predicted Result.
- The report's "Room model (estimate)" row and `roomModel` field.
- The step guide's text about the room model.

Nothing was stored from the room model (it was calculated on screen), so saved projects need no migration for this
change. Their surfaces, measurements and history are kept as they are.

## 1. What the user sees

- **Six surfaces, each on its own card**: Wall 1, Wall 2, Wall 3, Wall 4, Floor, Ceiling, with name, position (long or
  end wall), dimensions and gross area (and the solid area once openings are taken off), the material, its data class,
  conditions, α per band and source link, and any problems.
- **Material**: by category and family; a family with several constructions gets a "Construction" select. Only
  materials for that kind of surface are offered. With none in the library, the select says so and is disabled.
- **Partly covered by…**: another material over a share (%) of the solid area.
- **Openings** (walls only): doors, windows and open doorways with their material, width, height and number. Doors and
  windows are left for the user to choose; an open doorway gets the open area (α 1.00 by definition).
- **Room summary**: volume, areas, occupancy, "Surfaces described n of 6", the recommended target. No RT60 estimate.
- **Walls in parts (26 October 2026)**: each wall card first shows the wall face-on to scale, one row per part (what it
  is, its width; the wall's own type takes the width left) with "Split the wall", and doors and windows with − and +
  (one more starts at a standard 0.9 × 2.1 m door or 1.2 × 1.2 m window, changeable). Everything else on the wall
  (name, the type buttons, the exact library entry, a covering, opening sizes and types, equipment) is under "More
  details". Each type has its own colour and pattern (`src/ui/looks.ts`), always with its name beside it.
- **The room in 3D** (`src/ui/room3d.ts`, three.js 0.160.0, bundled): in the Room summary, built up as the room is
  entered (the floor once the length and width are in, the walls with the height), with each wall's parts, doors and
  windows and the floor and ceiling in their types' colours. It turns to the surface being edited, a click on a wall
  opens its card, and walls nearer the camera lower themselves. Doors and windows are placed where they usually are
  (their positions are not recorded); added walls (Wall 5 and up) are listed, not drawn. Without WebGL, the flat
  sketch.

## 2. The material library (`js/data/materials.js`)

233 materials from 32 sources, gathered on 12 October 2026 by fetching each page or PDF and reading the values from it
(HTML tables parsed from the raw page, PDFs from their extracted text). Values seen only in a search-result summary were
not used. Two Rockfon pages were checked again by hand afterwards (Sonar, five rows; Koral Tenor): all values matched.
Two entries were added on 26 October 2026 for types of the Vicoustic room list: Rockfon CleanSpace Pro 20 mm, 200 mm
suspension (hygiene ceiling tiles; αp 0.40/0.90/1.00/0.95/1.00/1.00, Rockfon UK product page) and Ecophon Akusto Wall C
Extra Bass, 80 mm (low-frequency wall absorber; αp 0.65/1.00/0.95/1.00/1.00/1.00, the Ecophon system page, matching its
Akusto leaflets). Types for which no sourced octave-band data was found (hygienic PVC or HPL walls, solid metal
cladding, epoxy floors, a slatted ceiling) were not added. In the app the library is used to describe the room and
for the α of the finish a product covers.

| Surface | Categories (families) |
|---|---|
| Walls (143) | Masonry and concrete (brick, concrete block, concrete, stone and lime, tiles and marble) · Plaster and plasterboard · Wood and boards (timber and board linings, slotted and perforated wood, cork) · Curtains and fabrics (curtains and drapes, fabric and felt) · Glass · Acoustic panels and absorbers |
| Floors (65) | Carpet (carpet, carpet tiles) · Hard floors (concrete, stone/marble/tiles, timber floor, parquet) · Resilient floors (linoleum and vinyl, rubber and cork) · Access floors |
| Ceilings (69) | Concrete and plaster · Timber and metal · Suspended acoustic ceilings (acoustic ceiling tiles, perforated metal, perforated plasterboard) · Acoustic panels and absorbers |
| Openings (13) | Doors (1: solid wooden door) · Windows and glazed doors (11 glazing types) · Open areas (1) |

| Class | Count | Meaning |
|---|---|---|
| manufacturer | 50 | A named product tested to ISO 354 (αp per ISO 11654, octave, 0.05 steps) or ASTM C423 (the one-third-octave value at the octave centre), mounting stated |
| published | 20 | A reference table with its citation: Hall, *Musical Acoustics* 2nd ed. Table 15.1 (via HyperPhysics); Approved Document E Table 7.1 (no 125 Hz column) |
| compilation | 162 | Widely reproduced tables without an original citation: Acoustical Surfaces, the acoustic.ua PDF, pyroomacoustics (citing Vorländer, *Auralization*, 2008), sengpielaudio, Commercial Acoustics |
| definition | 1 | Open doorway or gap: 1 m² of opening = 1 sabin |

**Sources**: Acoustical Surfaces "Acoustics 101" (22), Hall via HyperPhysics (12), Approved Document E Table 7.1 (8),
acoustic.ua absorption table (81), pyroomacoustics / Vorländer (45), Commercial Acoustics (10), sengpielaudio (4); test
reports: Müller-BBM curtain fabrics for Zimmer + Rohde, ADO Goldkante and Gabriel (9), Riverbank RAL-A06-219 (1), CSIRO
and Intertek reports for Milliken carpet tiles (4), Acouflor Latin (1), University of Salford audit specimen (1), Rockfon
Sonar, Blanka, Artic, Koral Tenor (10), Acoustics First TecSpecs (15), Autex Quietspace (1), SRL report for Rockwool
slabs (6).

**Rules applied**: a band a source does not give is `null`, never 0 (the acoustic.ua "0.00" placeholders are `null`,
with a note; the only 0.00 values kept are three tested αp values). Values above 1.00 are kept as printed and used
limited to 1.00. Equal values in several compilations are one entry. Left out (27): rows the source contradicts, rows
that disagree with the table they copy, an average, a −0.01 row, a low-confidence row, and every value given per object
(sabin per baffle or cloud), which is not an absorption coefficient. Not found with octave-band data: polished concrete,
plasterboard bonded to masonry, laminate and engineered wood floors, rugs, upholstered walls, plain sheet metal, most
brand-name mineral-fibre tiles, slotted MDF products. The PTB room-acoustics absorption database is the best next source.

## 3. Areas (`surfaces.surfaceModel`)

| Surface | Gross area |
|---|---|
| Wall 1, Wall 3 (long walls) | L × H |
| Wall 2, Wall 4 (end walls) | W × H |
| Floor, Ceiling | L × W |

The six add up to the room's surface 2(LW + LH + WH). Within one surface: openings (walls only, width × height ×
number) come off the gross, never more than the wall; solid = gross − openings; the covering takes its share (0–100 %,
outside values limited and reported) of the solid area; the finish keeps the rest. Every m² is in exactly one part;
nothing is negative. A covering with a material but no share, or a share but no material, is reported.

A wall in sections (`sections [{ id, type, material, widthM }]`, from its left end): the finish area left after the
openings and the covering is shared by width: each section its width's share, the wall's own type the rest. Where the
doors, windows and covering are is not recorded, so they come off every part alike. Sections wider than the wall are
counted up to it and reported; one without a width is not counted and is asked for. A section of acoustic treatment
already fitted (acoustic panels, felt or PET panels, low-frequency absorbers) is not free for a new product; the other
parts are, and what a product covers is their α weighted by area. A wall without sections is exactly as before.

## 4. Prediction after treatment (`services/prediction.js`)

Per octave band, from the **measured** RT60:

    A0(f)          = 0.161 · V / RT60_measured(f)          the room's equivalent absorption area
    ΔA(f)          = Σ S_product · (α_product(f) − α_covered(f))
    RT60_after(f)  = 0.161 · V / (A0(f) + ΔA(f))

**Why from the measured RT60.** A0 is the room's equivalent absorption area: the relation ISO 354 uses to define it from
a measured reverberation time. It contains everything in the room as measured (surfaces, furniture, people, air), so no
inventory of the room is needed and nothing is left out. The products' α come from the same kind of measurement (ISO 354
/ ASTM C423 in a reverberation room), so the two add consistently.

**No surface counted twice.** The finish a product covers is already part of A0, so its absorption is replaced:
α_covered is the area-weighted α of the finish on the surfaces the product is placed on (`surfaces.coveredBy`); openings
and an existing covering are not available to cover. Where the surfaces there are not described, ΔA = S·α_product and
the prediction says the covered finish is not known (the effect is then overstated by S·α_covered). The surfaces enter
the prediction only this way: a product on the ceiling gives the same result whatever the walls are made of (tested).

**Missing information.** A band without a reliable measured value, or where a product has no tested α, gets no
prediction. The room's volume is needed (V); its total surface (from L, W, H) is needed for the checks below.

**Assumptions, and when this room puts them in doubt** (`checks`, shown on Predicted Result and in the report):

- *A diffuse sound field.* Sabine's relation holds for a modest average absorption coefficient (A / S). Above about 0.3
  it overstates RT60 (Eyring's form fits better), so the real result is likely a little shorter than predicted. Flagged
  when the predicted room's average coefficient exceeds 0.3.
- *The measured RT60 represents the room*: one position, the conditions at the time of the take.
- *A0 cannot exceed the room's surface.* If the measured RT60 implies more absorption than the room has surface, the
  dimensions or the measurement are wrong; flagged, and that band's prediction cannot be relied on.
- *Laboratory α on the installed product*, in the tested mounting; edge effects, spacing and placement are not modelled.
- *Air absorption* is part of the measured A0 and does not change with treatment.

The prediction is an estimate. Only a measurement after installation confirms it.

## 5. Isolation of the measurement

- `surfaces.js` and `materials.js` are read by Room Setup, Target's notes, Treatment, Predicted Result, the report and
  `derive.js`. None of the twelve measurement files (DSP, analysis, audio I/O, live take, measurement and processing
  services, live UI, the Setup, Measure, Processing, Results and Assessment steps) refers to them (tested).
- The same recording gives the same processing result whatever the surfaces are; changing all six surfaces of a
  measured project leaves the take, its processing, the noise check, the target and the assessment exactly as they were.
- A surface change marks only Treatment, Predicted Result and Final Result for review.
- The measurement algorithm was not changed by this work.

## 6. Saving and migration

The surfaces are stored with the project (`room.surfaces`: `material`, `cover {material, pct}`, `openings [...]`, on walls `sections [...]`,
`origin`, `legacy`) and reopen exactly as entered. Projects saved before the surfaces are migrated on load
(`store.migrate` → `surfaces.fromLegacy`): an earlier single choice fills a surface only where it names one material
(`LEGACY` in `materials.js`: walls "Brick", floor "Vinyl", "Tile", "Concrete", ceiling "Concrete"), marked to check;
other choices are left to choose, with the earlier entry shown. The earlier fields stay unchanged.

## 7. Tests

`tests/room-surfaces.html` runs on open; results on the page and in `window.ROOM_SURFACES_TEST`. **52 of 52 checks
pass** (12 October 2026):

- No untreated-room prediction: no room model service, no `predict`/`withTreatment` on the surfaces, no
  `roomPrediction`/`roomTreatment` in derive; a surface carries no absorption total or RT60; none of the app's 42 scripts
  contains "room model", "predicted existing", "as built" or those functions; with every surface described, a target and
  a treatment chosen but no measurement, no RT60 is predicted, measured or assessed; the Room step shows none.
- Library: complete, sourced, no 0 for a missing value, every surface and opening kind, the open doorway by definition,
  the legacy map valid and conservative, the sample room fully described.
- Geometry: six areas for three rooms; openings and coverings (parts = gross); oversized openings, missing sizes, out of
  range shares; no openings on floor or ceiling; no areas without a room size.
- What a treatment covers: 96 m² of walls at α 0.10; only the free finish (14.055 m²); several surfaces weighted by
  area (0.08125); missing data named (no value at 125 Hz, no material, not in the library); incomplete coverings reported.
- The six surfaces independent through the Room step's actions; doors and windows not pre-chosen; saved and reopened;
  the screen updating on a select change ("Surfaces described" 5 → 6), a typed length and the Window button.
- Prediction after treatment: A0 = 43.47 m², ΔA = 10 × (0.80 − 0.10) = 7 m², 0.6029 s by hand; through
  `AM.derive.prediction` with and without described walls; a ceiling product unaffected by the walls; the 0.3 average
  absorption check (0.34 flagged, 0.23 not); the impossible-absorption check; the checks passed through the app.
- The target unchanged by the surfaces; measurement isolation (same recording → same result; stored measurement
  untouched; review flags only on Treatment/Predicted/Final; no reference in the 12 measurement files).
- Migration of two projects saved before the surfaces.
- A wall in sections (26 October 2026; 68 of 68 checks pass): parts by width with a door (7.0275 + 8.433 + 12.6495 +
  1.89 = 30 m²), free area without the fitted panels (19.677 m²), the α covered (0.0575 / 0.7), the room's free wall area,
  the description, missing data named per section, sections wider than the wall, a section without its width or 0 m
  wide, a wall without sections unchanged; on the screen: a part's type, "Split the wall", a section's width, doors and
  windows + and −, the strip, removing a section.
- Report and PDF: surfaces described, no `roomModel`, measured value unchanged, the prediction after treatment from the
  measured room with its assumptions; the PDF says "Prediction after treatment … starting from the measured room" and has
  no room model, no predicted existing RT60 and no unsupported characters.

Regression suites, all passing: `tests/dsp.html` 62/62, `tests/validation.html` 71/71, `tests/calculations.html` 22/22,
`tests/sweep-level.html` 13/13 (end to end), `python -B tests/report_submission_test.py` 26/26.

## 8. Limitations and real-room validation still needed

The tests check the arithmetic, the data handling, the isolation and that no untreated-room estimate remains. They do
not show how well the prediction after treatment matches real rooms. That needs rooms measured with a calibrated system
(ISO 3382-2) before and after treatment, the prediction compared band by band, and the spread reported, including rooms
whose treated average absorption exceeds 0.3. Until then the prediction is presented as an estimate everywhere.
