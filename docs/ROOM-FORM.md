# Room information form (Room Setup)

Step 1 of the workflow records what the room is, its size, what each wall, the floor and the ceiling are made of, and
what is mounted on the walls, so later steps (and the recommendations to come) start from a structured description.
Nothing in it is a guessed acoustic value: absorption comes only from the sourced library (`js/data/materials.js`), and
the room's RT60 is always measured, never estimated from the form.

Files: `src/screens/Room.tsx` (the screen), `js/stages/room.js` (checks and actions), `js/services/surfaces.js` (walls,
areas, what a treatment covers), `js/data/room-form.js` (constructions, finishes, equipment, industry questions),
`js/data/demo.js` (industries, room types, room lists), `js/data/targets.js` (room type → main activities → criterion).

## Fields

| Section | Fields |
|---|---|
| Room | name (required), reference (optional), industry, room type (filtered by the industry; "Other" in every industry, then its name is required), the custom industry's name, main activity (filtered by the room type; it decides the target's criterion), purpose and intended use (optional) |
| About how the room is used | the industry's own questions, all optional, recorded for the recommendations (seats, video calls, learners with hearing needs, the room's role in a studio, how sound is listened to, music, open kitchen, speech privacy, wipe-clean surfaces, sound system, noise sources, sound equipment) |
| Dimensions | shape (rectangular, irregular, connected spaces), length, width, height; volume and floor area worked out |
| Occupancy and furnishing | typical occupancy, furnishing, what is in the room (upholstered seating, curtains, rugs, shelving, plants, acoustic panels or absorbers) |
| Walls (any number) | name (optional), built from, visible finish, the name and notes of a construction or finish not listed, acoustic data from the library, existing treatment or covering (material and share), doors, windows and openings (size, number, material), what is on the wall (ticked); length and height only for an added wall or a room that is not rectangular (walls 1–4 of a rectangular room follow its size); area, solid area and the area free for treatment worked out |
| Floor and ceiling | the same description; ceiling sections (a raft, a bulkhead, another finish) with their own area |
| Acoustic problems and goals | current problems, outcome wanted, notes in the user's words |

What is on a wall is ticked, with nothing to measure: air conditioner, speaker, display or screen, electrical fixtures,
pipes or cable tray, other (with what it is, optionally). It is recorded for the recommendations and shown on the
wall's line and in the report; it does not change the area free for treatment, a treatment's thickness or its
performance. (Simplified on request: an earlier draft asked each item's position, size, depth and clearance.)

## Industries and room types

Corporate offices and meeting rooms · Education and training facilities · Recording and music studios · Hospitality and
restaurants · Healthcare facilities · Auditoriums and performance spaces · Industrial and commercial facilities ·
Residential spaces · Other / custom industry. Each lists its room types and ends with "Other". Every room type offers
main activities that each follow a criterion already in `js/data/targets.js` (DIN 18041, ANSI/ASA S12.60, EBU Tech 3276,
ISO 16283-1): the new types (training room, rehearsal room, showroom, retail store, workshop, warehouse) reuse existing
activities, and where no criterion names the room (retail, workshop, warehouse, "Other") every activity is offered and
the user chooses the closest. Projects saved with the earlier industry names are moved to the new ones on load, by their
room type (`canonicalIndustry` in `demo.js`).

## Dependent choices

| When this changes | This is cleared, if it no longer fits | Kept |
|---|---|---|
| Industry | room type, main activity, the custom names, answers to questions the industry does not ask | everything else |
| Room type | main activity (the type's most common one is set), the room type's name when it is not "Other", answers that no longer apply | everything else |
| Built from | the finish, when that construction cannot carry it; the acoustic data, when it describes another construction; a typed construction name, when "Other" is left | size, openings, equipment, covering |
| Visible finish | the acoustic data, when it describes another finish (a finish "Other / not listed" has none); a typed finish name, when "Other" is left | construction and the rest |
| Equipment ticked off "Other" | what the other item was | the rest of the wall |

The construction, finish and data selects only offer what fits: finishes a construction can carry
(`FITS` in `room-form.js`), and library entries that describe that construction and finish (`classify`, from each
entry's family and wording; every one of the 231 entries maps to at least one). Constructions and finishes common in the
chosen industry are listed first. The library list can be searched.

## Calculations

- Floor area = length × width; volume = length × width × height (for an irregular room, its average inside size).
- A wall's area = its length × height. In a rectangular room walls 1 and 3 use the room's length, walls 2 and 4 its width,
  and every wall the room's height; their sizes are not asked. An added wall, or any wall of an irregular room or
  connected spaces, can be given its own length and height (an added wall needs its length).
- Ceiling: each section has its own area; the main ceiling keeps the floor area the sections leave (never below 0).
- On each wall: openings come off the area (all together never more than the wall), the existing covering takes its
  share of what is left, and the finish keeps the rest: **free for treatment**.
- A treatment placed on walls or the ceiling covers only the free area (`coveredBy`), at the finish's own α from the
  library; a finish without library data is named as unknown, never given a value.
- Invalid entries are refused with a message and the step cannot be finished: a room size outside its limits, a wall
  length outside 0.1–100 m or height outside 0.5–30 m, a ceiling section of 0 m² or less. Doubtful ones are reported on
  the wall but do not block (sections larger than the floor, openings larger than the wall).

Every area is worked out again from the saved dimensions; no area is stored.

## Saved data

In the project (this browser, `room`):

```
room: { name, reference, industry, industryOther, type, typeOther, use, purpose, L, W, H, shape, occupancy, furnishing,
        furnishings[], problems[], outcomes[], acousticNotes, context{ <question id>: answer },
        wallKeys: ['wall1', …], ceilingKeys: ['ceiling', …],
        surfaces: { <key>: { label, lengthM, heightM | areaM2, construction, constructionOther{name, notes},
                             finish, finishOther{name, notes}, material, cover{material, pct},
                             openings[{id, kind, material, widthM, heightM, count}],
                             equipment: ['ac', 'speaker', …], equipmentOther } } }
```

A wall keeps its key and number when another is removed (Wall 5 stays Wall 5), so every opening and item of equipment
stays with its wall, and a treatment placed on "Wall 5" stays there. A room saved before these fields simply lacks them
and reads as four walls and one ceiling.

## Materials not in the library, and their review

"Other / not listed" opens a name and notes for the construction or finish; they are saved with that wall, floor or
ceiling, and its acoustic properties stay unspecified. When the report form is submitted, the names and notes (with
only their kind and the kind of surface) go with it, each once (`customMaterials` in `report-gate.js`), and the server
checks them strictly (at most 30; kind, surface, name 2–80 and notes up to 300 characters; nothing else). Nothing is sent
at any other time.

In Supabase, `report_submissions.custom_materials` holds them, `public.custom_material_queue` lists every name across
submissions, most used first, with its review status, and `public.material_reviews` records each decision (approved or
rejected, by whom, with a note). Row level security keeps both closed to the anon and authenticated roles: only people
with access to the Supabase project review. An approved material is added to the app's library in a later release, once
its acoustic data has been sourced; the app never reads the review tables. How to record a decision: the comment above
`material_reviews` in `server/supabase/schema.sql`.

## Tests

`tests/room-form.html` (65 checks, on open): the industries and room types, "Other" everywhere and every activity on a
sourced criterion, earlier industry names moved (also in a project saved before); every dependent choice through the
step's own actions; adding, duplicating and removing walls and ceiling sections (asked first, numbers kept, the last wall
and the floor kept); an irregular room's own wall lengths; equipment ticked (no sizes, no area taken, "Other" named and
dropped); openings, coverings and the free area worked by hand (the room's total); materials not in the library (no
value anywhere, sent once, in the report); the calculations and invalid entries; saving, reopening and editing; and the
screen (folded cards, no wall sizes for a rectangular room, adding a wall, the industry's questions, the dependent
selects, equipment ticks).
`tests/room-surfaces.html` (52 checks) still covers the six default surfaces, the library and the treatment prediction;
`tests/report_submission_test.py` covers the server's checks of the custom materials.
