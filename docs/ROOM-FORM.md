# Room information form (Room Setup)

Step 1 of the workflow records what the room is, its size, what each wall, the floor and the ceiling are made of, and
what is mounted on the walls, so later steps (and the recommendations to come) start from a structured description.
Nothing in it is a guessed acoustic value: absorption comes only from the sourced library (`js/data/materials.js`), and
the room's RT60 is always measured, never estimated from the form.

Files: `src/screens/Room.tsx` (the screen), `js/stages/room.js` (checks and actions), `js/services/surfaces.js` (walls,
areas, what a treatment covers), `js/data/room-form.js` (constructions, finishes, equipment, industry questions),
`js/data/demo.js` (industries, room types, room lists), `js/data/targets.js` (room type → main activities → criterion,
or why there is none; docs/TARGET-CRITERIA.md).

## Fields

| Section | Fields |
|---|---|
| Room | name (required), reference (optional), industry, room type (filtered by the industry; those with a verified RT60 criterion first, the others grouped as having none; "Other" in every industry, then its name is required), the custom industry's name, main activity (filtered by the room type, grouped the same way; it decides the target's criterion; not asked for "Other"), purpose and intended use (optional); whether a verified criterion applies |
| About how the room is used | the industry's own questions, all optional, recorded for the recommendations (seats, video calls, learners with hearing needs, the room's role in a studio, how sound is listened to, music, open kitchen, speech privacy, wipe-clean surfaces, sound system, noise sources, sound equipment) |
| Dimensions | shape (rectangular, irregular, connected spaces), length, width, height; volume and floor area worked out |
| Occupancy and furnishing | typical occupancy, furnishing, what is in the room (upholstered seating, curtains, rugs, shelving, plants, acoustic panels or absorbers) |
| Walls (any number) | name (optional), **what it is, in everyday words** (one button: "Painted wall", "Gypsum board partition (drywall)", "Glass wall or glass partition", …; "Something else" asks its name), how much sound it absorbs in plain words, optionally the exact library entry, something covering part of it (type and share), doors, windows and openings (type, size, number), what is on the wall (ticked); length and height only for an added wall or a room that is not rectangular (walls 1–4 of a rectangular room follow its size); area, solid area and the area free for treatment worked out |
| Floor and ceiling | the same description, with floor and ceiling types; ceiling sections (a raft, a bulkhead, another finish) with their own area |
| Acoustic problems and goals | current problems, outcome wanted, notes in the user's words |

What is on a wall is ticked, with nothing to measure: air conditioner, speaker, display or screen, electrical fixtures,
pipes or cable tray, other (with what it is, optionally). It is recorded for the recommendations and shown on the
wall's line and in the report; it does not change the area free for treatment, a treatment's thickness or its
performance. (Simplified on request: an earlier draft asked each item's position, size, depth and clearance.)

## Industries and room types

Corporate offices and meeting rooms · Education and training facilities · Recording and music studios · Hospitality and
restaurants · Healthcare facilities · Auditoriums and performance spaces · Industrial and commercial facilities ·
Residential spaces · Government and civic · Transport · Sports and recreation · Other / custom industry (the last three
and further room types added on 26 October 2026 from the Vicoustic room list). Each lists all its room types and ends with "Other", in two groups: those
with a verified RT60 standard (docs/TARGET-CRITERIA.md) under "RT60 target from a standard", the rest under "No verified
RT60 target (can still be measured)": restaurants, libraries, patient rooms, homes, cinemas, places of worship, shops,
workshops and warehouses, and "Other". They can be chosen and measured; step 2 says why no target is recommended and
offers the project's own target. Main activities are grouped the same way, and choosing a room type sets its most common
activity. "Other" has no activity. Projects saved with the earlier industry names
are moved to the new ones on load, by their room type (`canonicalIndustry` in `demo.js`).

## What a surface is, in everyday words (changed 2026-10-20)

Each wall, the floor and each ceiling section is described by one question, "What is this wall?" (or the floor, or this
ceiling), answered with a button. The types most often met in the room's type come first ("Common in a conference room"),
the rest after them, and "Something else" last; a room type the user names uses its industry's list. A type's tooltip
says what it looks like, and once chosen its line says how much sound it absorbs, in words, with a small meter.

Behind each type (`SURFACE_TYPES` in `js/data/room-form.js`) are the construction and finish it stands for, and the
library entry used as its **typical** sound data: the entry that describes it most closely, from a published table where
one has all six bands. No value is made up: where the library has nothing for a type (a mirror wall, metal sheet), none
is set, the surface is recorded as described, and the treatment prediction treats it as unknown. Anyone who knows the
exact build-up can open "Exact type and sound data (optional)" and pick the exact library entry (with its sizes and α per
band); only that type's entries are offered there. The detailed construction and finish lists of the earlier form are no
longer asked: the type sets them.

Plain words for sound (`soundRating` in `services/surfaces.js`): the mean α over the octave bands 250 Hz–2 kHz of the
chosen entry, under 0.10 "Hard: reflects almost all sound", under 0.30 "Absorbs a little sound", under 0.60 "Absorbs some
sound", from 0.60 "Absorbs a lot of sound". These bands are the app's own way of putting the data into words, not a rating
from a standard.

A new door or window starts as its most common type (a wooden door, an ordinary window), highlighted and changeable with
one click; an opening's sound data is descriptive only (it never enters the treatment prediction). Something covering part
of a surface is chosen the same way, from the types that can cover one.

A surface saved before types existed keeps everything it had: its type is recognised from its construction and finish for
display (nothing is written), and one that matches no type is shown as "Recorded earlier: …".

Materials named for the room categories the app serves (offices, schools, studios, hospitality, healthcare, auditoriums,
industrial, homes) were added in everyday words: vitrified tiles, marble, granite and Kota stone, laminate, IPS and epoxy
floors, sports vinyl, gypsum and POP false ceilings, grid ceilings, metal roofs, laminate panelling, upholstered walls,
pin boards and mirror walls. Each uses an existing library entry for the same kind of surface, or none.

**Walls**

| Type | Typical sound data (library entry) | Source |
|---|---|---|
| Painted wall | Painted plaster on masonry | Absorption coefficients table (acoustic.ua) |
| Gypsum board partition (drywall) | Gypsum wallboard 1/2 in on studs | HyperPhysics (Hall, Musical Acoustics) |
| Glass wall or glass partition | Heavy plate glass | HyperPhysics (Hall, Musical Acoustics) |
| Wood or laminate panelling | Plywood panelling 3/8 in | Acoustical Surfaces, Acoustics 101 |
| Fabric-covered or upholstered wall | Muslin-covered cotton felt 25 mm | Absorption coefficients table (acoustic.ua) |
| Acoustic panels (already fitted) | Fabric-wrapped fibreglass panel 25 mm (Type A) | Acoustics First TecSpecs (Effective January 2024) |
| Acoustic felt or PET panels (already fitted) | Autex Quietspace Panel 25 mm | Quietspace Panel Data Sheet (Autex/Momentum USA, Jan26) |
| Low-frequency absorbers (already fitted) | Ecophon Akusto Wall C Extra Bass 80 mm (low-frequency) | Ecophon Akusto Wall C Extra Bass |
| Wooden slats or grooved wood panels | Acoustic timber wall panelling | Absorption coefficients table (acoustic.ua) |
| Wallpaper | Plaster on masonry with wallpaper | Absorption coefficients table (acoustic.ua) |
| Tiles, marble or stone cladding | Marble or glazed tile | Acoustical Surfaces, Acoustics 101 |
| Bare brick (no plaster) | Brick, unglazed | Acoustical Surfaces, Acoustics 101 |
| Bare concrete | Concrete, poured | HyperPhysics (Hall, Musical Acoustics) |
| Concrete blocks, painted (no plaster) | Concrete block, painted | HyperPhysics (Hall, Musical Acoustics) |
| Concrete blocks, bare | Concrete block, unpainted | HyperPhysics (Hall, Musical Acoustics) |
| Cork or pin board | Cork board 25 mm on solid backing | Absorption coefficients table (acoustic.ua) |
| Curtains or drapes | Curtains hung in folds against solid wall | Absorption coefficients table (acoustic.ua) |
| Mirror wall | none in the library (recorded, treated as unknown) | — |
| Metal sheet or cladding | none in the library (recorded, treated as unknown) | — |
| Something else | none in the library (recorded, treated as unknown) | — |

**Floors**

| Type | Typical sound data (library entry) | Source |
|---|---|---|
| Vitrified or ceramic tiles | Ceramic tiles, smooth | Absorption coefficients table (acoustic.ua) |
| Marble, granite or Kota stone | Marble floor | pyroomacoustics database (Vorländer 2008) |
| Carpet (wall to wall) | Heavy carpet on concrete | HyperPhysics (Hall, Musical Acoustics) |
| Carpet tiles | Carpet tiles 11 mm, Type A (lab audit sample) | University of Salford Test Laboratory |
| Vinyl, linoleum or LVT | Linoleum or vinyl stuck to concrete | Absorption coefficients table (acoustic.ua) |
| Laminate or wooden parquet | Hard floor covering (lino, parquet) on concrete | Approved Document E, Table 7.1 |
| Wooden floor on battens | Wood floor | Acoustical Surfaces, Acoustics 101 |
| Concrete, IPS or epoxy floor | Concrete, poured | HyperPhysics (Hall, Musical Acoustics) |
| Sports vinyl or cushioned floor | Rubber/cork/lino/vinyl + underlay stuck to concrete | Absorption coefficients table (acoustic.ua) |
| Rubber flooring | Rubber floor tiles 6 mm | Absorption coefficients table (acoustic.ua) |
| Raised floor, no carpet | Raised access floor, no carpet | Absorption coefficients table (acoustic.ua) |
| Raised floor with carpet tiles | Raised access floor with carpet tiles | Absorption coefficients table (acoustic.ua) |
| Something else | none in the library (recorded, treated as unknown) | — |

**Ceilings**

| Type | Typical sound data (library entry) | Source |
|---|---|---|
| Gypsum or POP false ceiling | Plasterboard ceiling on battens, large air space | pyroomacoustics database (Vorländer 2008) |
| Grid ceiling with fibre tiles | Fissured ceiling tile | pyroomacoustics database (Vorländer 2008) |
| Hygiene or cleanable ceiling tiles | Rockfon CleanSpace Pro 20 mm, 200 mm plenum (hygiene) | Rockfon CleanSpace Pro |
| Perforated metal ceiling tiles | Perforated metal ceiling, 200 mm cavity, mineral wool | pyroomacoustics database (Vorländer 2008) |
| Perforated gypsum ceiling | Perforated gypsum ceiling, 300 mm plenum | pyroomacoustics database (Vorländer 2008) |
| Plastered and painted slab | Plaster ceiling, smooth | Commercial Acoustics chart |
| Bare concrete or open ceiling | Concrete, poured | HyperPhysics (Hall, Musical Acoustics) |
| Wooden ceiling | Wood ceiling | sengpielaudio table |
| Metal roof sheet (no ceiling) | Steel decking | Absorption coefficients table (acoustic.ua) |
| Acoustic panels (already fitted) | Fabric-wrapped fibreglass panel 25 mm (Type A) | Acoustics First TecSpecs (Effective January 2024) |
| Something else | none in the library (recorded, treated as unknown) | — |

**Doors and windows**

| Type | Typical sound data |
|---|---|
| Wooden door | Solid wooden door |
| Glass door | Heavy plate glass |
| Other door (e.g. metal) | none in the library |
| Window | Ordinary window glass |
| Double-glazed window | Double glazing 2–3 mm, 10 mm gap |
| Large glass panel or façade | Heavy plate glass |
| Open doorway or gap | Open doorway or gap |

**Common in each room type** (offered first)

| Room type | Walls | Floor | Ceiling |
|---|---|---|---|
| Conference room | Painted wall, Glass wall or glass partition, Gypsum board partition (drywall), Wood or laminate panelling, Fabric-covered or upholstered wall, Wooden slats or grooved wood panels, Acoustic panels (already fitted), Wallpaper | Carpet tiles, Carpet (wall to wall), Vitrified or ceramic tiles, Laminate or wooden parquet, Vinyl, linoleum or LVT | Gypsum or POP false ceiling, Grid ceiling with fibre tiles, Wooden ceiling, Perforated gypsum ceiling, Perforated metal ceiling tiles, Acoustic panels (already fitted) |
| Meeting room | Painted wall, Glass wall or glass partition, Gypsum board partition (drywall), Wood or laminate panelling, Fabric-covered or upholstered wall, Wooden slats or grooved wood panels, Acoustic panels (already fitted), Wallpaper | Carpet tiles, Carpet (wall to wall), Vitrified or ceramic tiles, Laminate or wooden parquet, Vinyl, linoleum or LVT | Gypsum or POP false ceiling, Grid ceiling with fibre tiles, Wooden ceiling, Perforated gypsum ceiling, Perforated metal ceiling tiles, Acoustic panels (already fitted) |
| Boardroom | Painted wall, Glass wall or glass partition, Gypsum board partition (drywall), Wood or laminate panelling, Fabric-covered or upholstered wall, Wooden slats or grooved wood panels, Acoustic panels (already fitted), Wallpaper | Carpet tiles, Carpet (wall to wall), Vitrified or ceramic tiles, Laminate or wooden parquet, Vinyl, linoleum or LVT | Gypsum or POP false ceiling, Grid ceiling with fibre tiles, Wooden ceiling, Perforated gypsum ceiling, Perforated metal ceiling tiles, Acoustic panels (already fitted) |
| Private office | Painted wall, Gypsum board partition (drywall), Glass wall or glass partition, Wood or laminate panelling, Fabric-covered or upholstered wall, Acoustic panels (already fitted) | Carpet tiles, Carpet (wall to wall), Vitrified or ceramic tiles, Vinyl, linoleum or LVT, Laminate or wooden parquet | Grid ceiling with fibre tiles, Gypsum or POP false ceiling, Perforated metal ceiling tiles, Bare concrete or open ceiling, Acoustic panels (already fitted) |
| Open-plan office | Painted wall, Glass wall or glass partition, Gypsum board partition (drywall), Wood or laminate panelling, Acoustic panels (already fitted) | Raised floor with carpet tiles, Carpet tiles, Vitrified or ceramic tiles, Vinyl, linoleum or LVT, Raised floor, no carpet | Grid ceiling with fibre tiles, Bare concrete or open ceiling, Perforated metal ceiling tiles, Gypsum or POP false ceiling, Acoustic panels (already fitted) |
| Reception area | Painted wall, Tiles, marble or stone cladding, Wood or laminate panelling, Glass wall or glass partition, Wallpaper, Wooden slats or grooved wood panels | Marble, granite or Kota stone, Vitrified or ceramic tiles, Carpet tiles, Laminate or wooden parquet | Gypsum or POP false ceiling, Wooden ceiling, Grid ceiling with fibre tiles, Perforated metal ceiling tiles |
| Training room | Painted wall, Gypsum board partition (drywall), Glass wall or glass partition, Cork or pin board, Wood or laminate panelling, Fabric-covered or upholstered wall | Carpet tiles, Vitrified or ceramic tiles, Vinyl, linoleum or LVT, Carpet (wall to wall), Laminate or wooden parquet | Grid ceiling with fibre tiles, Gypsum or POP false ceiling, Perforated metal ceiling tiles, Plastered and painted slab |
| Staff canteen | Painted wall, Tiles, marble or stone cladding, Glass wall or glass partition, Gypsum board partition (drywall), Wood or laminate panelling | Vitrified or ceramic tiles, Vinyl, linoleum or LVT, Marble, granite or Kota stone, Concrete, IPS or epoxy floor | Grid ceiling with fibre tiles, Gypsum or POP false ceiling, Perforated metal ceiling tiles, Bare concrete or open ceiling |
| Phone booth / focus pod | Acoustic felt or PET panels (already fitted), Fabric-covered or upholstered wall, Wood or laminate panelling | Carpet (wall to wall), Rubber flooring, Vinyl, linoleum or LVT | Acoustic panels (already fitted), Perforated gypsum ceiling |
| Classroom | Painted wall, Cork or pin board, Concrete blocks, painted (no plaster), Gypsum board partition (drywall), Glass wall or glass partition, Wood or laminate panelling | Vitrified or ceramic tiles, Marble, granite or Kota stone, Vinyl, linoleum or LVT, Concrete, IPS or epoxy floor, Carpet tiles | Plastered and painted slab, Gypsum or POP false ceiling, Grid ceiling with fibre tiles, Bare concrete or open ceiling |
| Lecture hall | Painted wall, Wood or laminate panelling, Wooden slats or grooved wood panels, Fabric-covered or upholstered wall, Acoustic panels (already fitted), Curtains or drapes | Carpet (wall to wall), Vinyl, linoleum or LVT, Vitrified or ceramic tiles, Wooden floor on battens, Marble, granite or Kota stone | Gypsum or POP false ceiling, Wooden ceiling, Perforated gypsum ceiling, Plastered and painted slab, Acoustic panels (already fitted) |
| Lecture theatre | Painted wall, Wood or laminate panelling, Wooden slats or grooved wood panels, Fabric-covered or upholstered wall, Acoustic panels (already fitted), Curtains or drapes | Carpet (wall to wall), Vinyl, linoleum or LVT, Vitrified or ceramic tiles, Wooden floor on battens, Marble, granite or Kota stone | Gypsum or POP false ceiling, Wooden ceiling, Perforated gypsum ceiling, Plastered and painted slab, Acoustic panels (already fitted) |
| Computer lab | Gypsum board partition (drywall), Painted wall, Glass wall or glass partition, Cork or pin board | Vinyl, linoleum or LVT, Carpet tiles | Grid ceiling with fibre tiles, Gypsum or POP false ceiling |
| Library | Painted wall, Wood or laminate panelling, Glass wall or glass partition, Gypsum board partition (drywall) | Carpet (wall to wall), Carpet tiles, Vinyl, linoleum or LVT, Vitrified or ceramic tiles | Grid ceiling with fibre tiles, Gypsum or POP false ceiling, Plastered and painted slab, Perforated metal ceiling tiles |
| Music room | Painted wall, Wood or laminate panelling, Wooden slats or grooved wood panels, Fabric-covered or upholstered wall, Acoustic panels (already fitted), Curtains or drapes | Wooden floor on battens, Carpet (wall to wall), Vinyl, linoleum or LVT, Laminate or wooden parquet | Gypsum or POP false ceiling, Wooden ceiling, Acoustic panels (already fitted), Perforated gypsum ceiling, Grid ceiling with fibre tiles |
| Music practice room | Painted wall, Wood or laminate panelling, Wooden slats or grooved wood panels, Fabric-covered or upholstered wall, Acoustic panels (already fitted), Curtains or drapes | Wooden floor on battens, Carpet (wall to wall), Vinyl, linoleum or LVT, Laminate or wooden parquet | Gypsum or POP false ceiling, Wooden ceiling, Acoustic panels (already fitted), Perforated gypsum ceiling, Grid ceiling with fibre tiles |
| School hall | Concrete blocks, painted (no plaster), Painted wall, Bare concrete, Wood or laminate panelling, Wooden slats or grooved wood panels | Sports vinyl or cushioned floor, Wooden floor on battens, Marble, granite or Kota stone | Perforated gypsum ceiling, Acoustic panels (already fitted), Perforated metal ceiling tiles |
| Sports hall | Concrete blocks, painted (no plaster), Concrete blocks, bare, Painted wall, Bare brick (no plaster), Metal sheet or cladding, Mirror wall | Wooden floor on battens, Sports vinyl or cushioned floor, Rubber flooring, Concrete, IPS or epoxy floor | Metal roof sheet (no ceiling), Bare concrete or open ceiling, Acoustic panels (already fitted), Gypsum or POP false ceiling |
| Gymnasium | Painted wall, Mirror wall, Concrete blocks, painted (no plaster), Glass wall or glass partition, Wood or laminate panelling | Rubber flooring, Wooden floor on battens, Sports vinyl or cushioned floor, Vinyl, linoleum or LVT | Gypsum or POP false ceiling, Bare concrete or open ceiling, Metal roof sheet (no ceiling), Grid ceiling with fibre tiles, Acoustic panels (already fitted) |
| Recording studio | Acoustic panels (already fitted), Fabric-covered or upholstered wall, Wooden slats or grooved wood panels, Gypsum board partition (drywall), Painted wall, Curtains or drapes | Wooden floor on battens, Carpet (wall to wall), Laminate or wooden parquet, Vinyl, linoleum or LVT | Acoustic panels (already fitted), Gypsum or POP false ceiling, Wooden ceiling, Perforated gypsum ceiling |
| Control room | Acoustic panels (already fitted), Fabric-covered or upholstered wall, Wooden slats or grooved wood panels, Gypsum board partition (drywall), Painted wall, Curtains or drapes | Wooden floor on battens, Carpet (wall to wall), Laminate or wooden parquet, Vinyl, linoleum or LVT | Acoustic panels (already fitted), Gypsum or POP false ceiling, Wooden ceiling, Perforated gypsum ceiling |
| Home studio | Painted wall, Acoustic panels (already fitted), Fabric-covered or upholstered wall, Wooden slats or grooved wood panels, Curtains or drapes, Gypsum board partition (drywall) | Laminate or wooden parquet, Vitrified or ceramic tiles, Carpet (wall to wall), Wooden floor on battens | Plastered and painted slab, Gypsum or POP false ceiling, Acoustic panels (already fitted), Wooden ceiling |
| Rehearsal room | Painted wall, Wood or laminate panelling, Wooden slats or grooved wood panels, Fabric-covered or upholstered wall, Acoustic panels (already fitted), Curtains or drapes | Wooden floor on battens, Carpet (wall to wall), Vinyl, linoleum or LVT, Laminate or wooden parquet | Gypsum or POP false ceiling, Wooden ceiling, Acoustic panels (already fitted), Perforated gypsum ceiling, Grid ceiling with fibre tiles |
| Restaurant | Painted wall, Bare brick (no plaster), Wood or laminate panelling, Tiles, marble or stone cladding, Wallpaper, Glass wall or glass partition, Bare concrete | Vitrified or ceramic tiles, Marble, granite or Kota stone, Laminate or wooden parquet, Wooden floor on battens, Concrete, IPS or epoxy floor, Vinyl, linoleum or LVT | Gypsum or POP false ceiling, Bare concrete or open ceiling, Wooden ceiling, Grid ceiling with fibre tiles, Perforated metal ceiling tiles |
| Café | Painted wall, Bare brick (no plaster), Wood or laminate panelling, Tiles, marble or stone cladding, Wallpaper, Glass wall or glass partition, Bare concrete | Vitrified or ceramic tiles, Marble, granite or Kota stone, Laminate or wooden parquet, Wooden floor on battens, Concrete, IPS or epoxy floor, Vinyl, linoleum or LVT | Gypsum or POP false ceiling, Bare concrete or open ceiling, Wooden ceiling, Grid ceiling with fibre tiles, Perforated metal ceiling tiles |
| Bar | Painted wall, Bare brick (no plaster), Wood or laminate panelling, Tiles, marble or stone cladding, Wallpaper, Glass wall or glass partition, Bare concrete | Vitrified or ceramic tiles, Marble, granite or Kota stone, Laminate or wooden parquet, Wooden floor on battens, Concrete, IPS or epoxy floor, Vinyl, linoleum or LVT | Gypsum or POP false ceiling, Bare concrete or open ceiling, Wooden ceiling, Grid ceiling with fibre tiles, Perforated metal ceiling tiles |
| Banquet hall | Painted wall, Wallpaper, Fabric-covered or upholstered wall, Wood or laminate panelling, Curtains or drapes, Tiles, marble or stone cladding, Mirror wall | Carpet (wall to wall), Marble, granite or Kota stone, Vitrified or ceramic tiles, Wooden floor on battens | Gypsum or POP false ceiling, Wooden ceiling, Plastered and painted slab, Grid ceiling with fibre tiles |
| Event room | Painted wall, Glass wall or glass partition, Wood or laminate panelling, Acoustic panels (already fitted), Curtains or drapes | Carpet (wall to wall), Wooden floor on battens, Laminate or wooden parquet, Vinyl, linoleum or LVT | Grid ceiling with fibre tiles, Gypsum or POP false ceiling, Acoustic panels (already fitted) |
| Hotel lobby | Tiles, marble or stone cladding, Painted wall, Wood or laminate panelling, Glass wall or glass partition, Wallpaper, Wooden slats or grooved wood panels | Marble, granite or Kota stone, Vitrified or ceramic tiles, Carpet (wall to wall) | Gypsum or POP false ceiling, Wooden ceiling, Grid ceiling with fibre tiles, Perforated metal ceiling tiles |
| Hotel guest room | Gypsum board partition (drywall), Painted wall, Wallpaper, Wood or laminate panelling, Fabric-covered or upholstered wall, Curtains or drapes | Carpet (wall to wall), Laminate or wooden parquet, Vinyl, linoleum or LVT, Vitrified or ceramic tiles | Gypsum or POP false ceiling, Grid ceiling with fibre tiles |
| Consultation room | Painted wall, Gypsum board partition (drywall), Tiles, marble or stone cladding, Glass wall or glass partition | Vinyl, linoleum or LVT, Vitrified or ceramic tiles, Marble, granite or Kota stone | Grid ceiling with fibre tiles, Gypsum or POP false ceiling, Perforated metal ceiling tiles, Plastered and painted slab |
| Examination room | Painted wall, Gypsum board partition (drywall), Tiles, marble or stone cladding | Vinyl, linoleum or LVT, Rubber flooring, Marble, granite or Kota stone | Hygiene or cleanable ceiling tiles, Gypsum or POP false ceiling, Grid ceiling with fibre tiles |
| Waiting area | Painted wall, Gypsum board partition (drywall), Tiles, marble or stone cladding, Glass wall or glass partition | Vinyl, linoleum or LVT, Vitrified or ceramic tiles, Marble, granite or Kota stone | Grid ceiling with fibre tiles, Gypsum or POP false ceiling, Perforated metal ceiling tiles, Plastered and painted slab |
| Patient room | Painted wall, Gypsum board partition (drywall), Tiles, marble or stone cladding, Glass wall or glass partition | Vinyl, linoleum or LVT, Vitrified or ceramic tiles, Marble, granite or Kota stone | Grid ceiling with fibre tiles, Gypsum or POP false ceiling, Perforated metal ceiling tiles, Plastered and painted slab |
| Therapy room | Painted wall, Gypsum board partition (drywall), Fabric-covered or upholstered wall, Wood or laminate panelling | Vinyl, linoleum or LVT, Carpet tiles, Laminate or wooden parquet, Vitrified or ceramic tiles | Grid ceiling with fibre tiles, Gypsum or POP false ceiling, Acoustic panels (already fitted) |
| Nurse station | Painted wall, Glass wall or glass partition, Wood or laminate panelling, Acoustic panels (already fitted) | Vinyl, linoleum or LVT, Rubber flooring | Grid ceiling with fibre tiles, Hygiene or cleanable ceiling tiles, Gypsum or POP false ceiling |
| Corridor | Painted wall, Gypsum board partition (drywall), Tiles, marble or stone cladding | Vinyl, linoleum or LVT, Rubber flooring, Marble, granite or Kota stone | Hygiene or cleanable ceiling tiles, Gypsum or POP false ceiling, Grid ceiling with fibre tiles |
| Auditorium | Painted wall, Wood or laminate panelling, Wooden slats or grooved wood panels, Fabric-covered or upholstered wall, Acoustic panels (already fitted), Curtains or drapes | Carpet (wall to wall), Wooden floor on battens, Vinyl, linoleum or LVT, Vitrified or ceramic tiles | Gypsum or POP false ceiling, Wooden ceiling, Perforated gypsum ceiling, Acoustic panels (already fitted), Plastered and painted slab |
| Cinema | Fabric-covered or upholstered wall, Acoustic panels (already fitted), Wooden slats or grooved wood panels, Curtains or drapes, Gypsum board partition (drywall), Painted wall | Carpet (wall to wall), Vinyl, linoleum or LVT, Vitrified or ceramic tiles | Gypsum or POP false ceiling, Acoustic panels (already fitted), Perforated gypsum ceiling, Bare concrete or open ceiling |
| Drama theatre | Painted wall, Wood or laminate panelling, Wooden slats or grooved wood panels, Fabric-covered or upholstered wall, Acoustic panels (already fitted), Curtains or drapes | Carpet (wall to wall), Wooden floor on battens, Vinyl, linoleum or LVT, Vitrified or ceramic tiles | Gypsum or POP false ceiling, Wooden ceiling, Perforated gypsum ceiling, Acoustic panels (already fitted), Plastered and painted slab |
| Concert hall | Painted wall, Wood or laminate panelling, Wooden slats or grooved wood panels, Fabric-covered or upholstered wall, Acoustic panels (already fitted), Curtains or drapes | Carpet (wall to wall), Wooden floor on battens, Vinyl, linoleum or LVT, Vitrified or ceramic tiles | Gypsum or POP false ceiling, Wooden ceiling, Perforated gypsum ceiling, Acoustic panels (already fitted), Plastered and painted slab |
| Black box theatre | Concrete blocks, painted (no plaster), Fabric-covered or upholstered wall, Curtains or drapes, Wood or laminate panelling | Vinyl, linoleum or LVT, Wooden floor on battens, Carpet (wall to wall) | Bare concrete or open ceiling, Acoustic panels (already fitted) |
| Place of worship | Painted wall, Tiles, marble or stone cladding, Wood or laminate panelling, Bare brick (no plaster), Glass wall or glass partition | Marble, granite or Kota stone, Vitrified or ceramic tiles, Carpet (wall to wall), Wooden floor on battens | Plastered and painted slab, Wooden ceiling, Gypsum or POP false ceiling, Bare concrete or open ceiling |
| Community hall | Painted wall, Concrete blocks, painted (no plaster), Wood or laminate panelling, Curtains or drapes, Glass wall or glass partition | Vitrified or ceramic tiles, Wooden floor on battens, Vinyl, linoleum or LVT, Marble, granite or Kota stone, Concrete, IPS or epoxy floor | Gypsum or POP false ceiling, Metal roof sheet (no ceiling), Plastered and painted slab, Grid ceiling with fibre tiles |
| Exhibition hall | Painted wall, Gypsum board partition (drywall), Glass wall or glass partition, Bare concrete, Wood or laminate panelling | Vitrified or ceramic tiles, Concrete, IPS or epoxy floor, Marble, granite or Kota stone, Carpet tiles, Vinyl, linoleum or LVT | Bare concrete or open ceiling, Gypsum or POP false ceiling, Grid ceiling with fibre tiles, Metal roof sheet (no ceiling), Perforated metal ceiling tiles |
| Showroom | Painted wall, Glass wall or glass partition, Gypsum board partition (drywall), Wood or laminate panelling, Tiles, marble or stone cladding, Mirror wall | Vitrified or ceramic tiles, Marble, granite or Kota stone, Laminate or wooden parquet, Vinyl, linoleum or LVT, Concrete, IPS or epoxy floor | Gypsum or POP false ceiling, Grid ceiling with fibre tiles, Bare concrete or open ceiling, Perforated metal ceiling tiles |
| Retail store | Painted wall, Glass wall or glass partition, Gypsum board partition (drywall), Wood or laminate panelling, Tiles, marble or stone cladding, Mirror wall | Vitrified or ceramic tiles, Marble, granite or Kota stone, Laminate or wooden parquet, Vinyl, linoleum or LVT, Concrete, IPS or epoxy floor | Gypsum or POP false ceiling, Grid ceiling with fibre tiles, Bare concrete or open ceiling, Perforated metal ceiling tiles |
| Shopping mall common area | Tiles, marble or stone cladding, Glass wall or glass partition, Painted wall, Wood or laminate panelling, Metal sheet or cladding | Marble, granite or Kota stone, Vitrified or ceramic tiles | Bare concrete or open ceiling, Gypsum or POP false ceiling, Perforated metal ceiling tiles, Grid ceiling with fibre tiles |
| Workshop | Concrete blocks, bare, Concrete blocks, painted (no plaster), Bare brick (no plaster), Metal sheet or cladding, Bare concrete, Painted wall | Concrete, IPS or epoxy floor, Vitrified or ceramic tiles, Rubber flooring | Metal roof sheet (no ceiling), Bare concrete or open ceiling, Gypsum or POP false ceiling |
| Monitoring / control centre | Fabric-covered or upholstered wall, Acoustic panels (already fitted), Wooden slats or grooved wood panels, Painted wall, Low-frequency absorbers (already fitted) | Carpet tiles, Raised floor with carpet tiles, Vinyl, linoleum or LVT | Grid ceiling with fibre tiles, Acoustic panels (already fitted), Bare concrete or open ceiling |
| Warehouse | Concrete blocks, bare, Concrete blocks, painted (no plaster), Bare brick (no plaster), Metal sheet or cladding, Bare concrete, Painted wall | Concrete, IPS or epoxy floor, Vitrified or ceramic tiles, Rubber flooring | Metal roof sheet (no ceiling), Bare concrete or open ceiling, Gypsum or POP false ceiling |
| Living room | Painted wall, Wallpaper, Wood or laminate panelling, Curtains or drapes, Tiles, marble or stone cladding, Glass wall or glass partition | Vitrified or ceramic tiles, Marble, granite or Kota stone, Laminate or wooden parquet, Wooden floor on battens, Carpet (wall to wall) | Plastered and painted slab, Gypsum or POP false ceiling, Wooden ceiling |
| Bedroom | Painted wall, Wallpaper, Wood or laminate panelling, Curtains or drapes, Tiles, marble or stone cladding, Glass wall or glass partition | Vitrified or ceramic tiles, Marble, granite or Kota stone, Laminate or wooden parquet, Wooden floor on battens, Carpet (wall to wall) | Plastered and painted slab, Gypsum or POP false ceiling, Wooden ceiling |
| Home theatre | Fabric-covered or upholstered wall, Acoustic panels (already fitted), Wooden slats or grooved wood panels, Curtains or drapes, Painted wall, Wood or laminate panelling | Carpet (wall to wall), Laminate or wooden parquet, Wooden floor on battens, Vitrified or ceramic tiles | Gypsum or POP false ceiling, Acoustic panels (already fitted), Wooden ceiling, Perforated gypsum ceiling |
| Home office | Painted wall, Gypsum board partition (drywall), Wood or laminate panelling, Glass wall or glass partition, Acoustic panels (already fitted), Curtains or drapes | Carpet (wall to wall), Laminate or wooden parquet, Wooden floor on battens, Vinyl, linoleum or LVT, Vitrified or ceramic tiles | Plastered and painted slab, Gypsum or POP false ceiling, Grid ceiling with fibre tiles |
| Council chamber / courtroom | Wood or laminate panelling, Painted wall, Fabric-covered or upholstered wall, Acoustic panels (already fitted), Glass wall or glass partition, Curtains or drapes | Carpet (wall to wall), Wooden floor on battens, Marble, granite or Kota stone | Grid ceiling with fibre tiles, Gypsum or POP false ceiling, Wooden ceiling, Acoustic panels (already fitted) |
| Airport / railway waiting hall | Glass wall or glass partition, Metal sheet or cladding, Tiles, marble or stone cladding, Painted wall, Acoustic panels (already fitted) | Marble, granite or Kota stone, Vitrified or ceramic tiles | Bare concrete or open ceiling, Metal roof sheet (no ceiling), Perforated metal ceiling tiles, Acoustic panels (already fitted) |
| Swimming pool hall | Tiles, marble or stone cladding, Glass wall or glass partition, Bare concrete, Painted wall | Vitrified or ceramic tiles, Concrete, IPS or epoxy floor | Metal roof sheet (no ceiling), Bare concrete or open ceiling, Perforated metal ceiling tiles |
| Gym / fitness studio | Painted wall, Mirror wall, Concrete blocks, painted (no plaster), Glass wall or glass partition, Wood or laminate panelling | Rubber flooring, Wooden floor on battens, Sports vinyl or cushioned floor, Vinyl, linoleum or LVT | Gypsum or POP false ceiling, Bare concrete or open ceiling, Metal roof sheet (no ceiling), Grid ceiling with fibre tiles, Acoustic panels (already fitted) |

## Dependent choices

| When this changes | This is cleared, if it no longer fits | Kept |
|---|---|---|
| Industry | room type, main activity, the custom names, answers to questions the industry does not ask | everything else |
| Room type | main activity (the type's most common one is set), the room type's name when it is not "Other", answers that no longer apply | everything else |
| What it is (its type) | the construction, finish and sound data, replaced by the new type's (the same type again keeps an exact entry chosen for it); a typed name, when "Something else" is left | size, openings, equipment, covering |
| Exact library entry | the type, when the entry is not one of that type's | everything else |
| Equipment ticked off "Other" | what the other item was | the rest of the wall |

The construction, finish and data selects only offer what fits: finishes a construction can carry
(`FITS` in `room-form.js`), and library entries that describe that construction and finish (`classify`, from each
entry's family and wording; every one of the 233 entries maps to at least one). Constructions and finishes common in the
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
                             type, finish, finishOther{name, notes}, material, cover{type, material, pct, name},
                             openings[{id, kind, type, material, widthM, heightM, count}],
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

`tests/room-form.html` (78 checks, on open): the industries and room types, "Other" everywhere, every activity with a
criterion in the data or the reason it has none and only verified ones offered, earlier industry names moved (also in a project saved before); every dependent choice through the
step's own actions; adding, duplicating and removing walls and ceiling sections (asked first, numbers kept, the last wall
and the floor kept); an irregular room's own wall lengths; equipment ticked (no sizes, no area taken, "Other" named and
dropped); openings, coverings and the free area worked by hand (the room's total); materials not in the library (no
value anywhere, sent once, in the report); the calculations and invalid entries; saving, reopening and editing; and the
screen (folded cards, no wall sizes for a rectangular room, adding a wall, the industry's questions, the dependent
selects, equipment ticks); the everyday types (every type's construction, finish and typical entry checked against the
library; a list for every room type; choosing, keeping an exact entry, "Something else"; a wall saved earlier recognised;
the sound words worked out by hand; doors, windows and coverings; one click on the screen, with no millimetres outside the
optional exact type).
`tests/room-surfaces.html` (52 checks) still covers the six default surfaces, the library and the treatment prediction;
`tests/report_submission_test.py` covers the server's checks of the custom materials.
