# Standards-based RT60 targets

19 October 2026. How the app decides a room's target RT60, which references it uses and why, and what it does when no
reference applies. The rule:

> **No verified, applicable target criteria means no target RT60.** A target is generated only for a room category whose
> criterion is verified and applies to that room use, with every input the criterion needs, by the method the reference
> documents and within the conditions it states. Nothing is extrapolated, clamped to a range, averaged into one value from
> a range the reference gives no rule for, or borrowed from another room type.

Files: `js/data/targets.js` (the register: references, criteria, room categories; nothing else holds criteria),
`js/services/target.js` (the checks and the method), `js/services/evaluation.js` (how each criterion judges the bands),
`js/stages/target.js` (the project's target), `src/screens/Target.tsx` and `src/screens/Room.tsx` (the screens).
Tests: `tests/target-criteria.html` (47 checks) and the target checks in `tests/calculations.html`,
`tests/multi-position.html`, `tests/rt60-average.html` and `tests/room-form.html`.

## Status of a room category

A room category is an industry's room type and its main activity (the subtype): for example Meeting room · Meetings and
presentations, `rt.meeting-room/meetings`.

| Status | Meaning | Target |
|---|---|---|
| **Verified** | A reference that applies to the room use gives a reverberation time or a documented method for one, and its values were checked | Generated, when the inputs are there and the room is within the criterion's conditions |
| **Incomplete** | A reference covers the room, but gives no reverberation time (e.g. DIN 18041 group B gives only an absorption, A/V), or gives it only in a form that cannot be read (IS 2526's graph) | None. The reason is shown |
| **Unsupported** | No reference found sets a reverberation time for it, or the user named the room type ("Other") | None. The reason is shown |

Room Setup lists every room type of the industry in two groups: those with a verified criterion under "RT60 target from a
standard", and the rest, with "Other", under "No verified RT60 target (can still be measured)" (changed 20 October 2026,
so a living room, a restaurant or a workshop can be chosen and measured instead of being hidden). Main activities are
grouped the same way. Choosing one without a verified criterion never generates a target: the Target step says why and
offers the project's own target with its source.

## The checks before a target is generated

`AM.services.target.availability(room)` makes them in this order and stops at the first that fails; the Target step shows
them.

1. **Category.** The industry, room type and main activity are chosen and form a category in the register. "Other", a
   custom industry, or an activity the room type does not have is unsupported.
2. **Verified criteria.** The category points to a verified criterion. Otherwise: incomplete or unsupported, with the reason.
3. **Applies to the use.** Recorded: the reference names the room among its examples, or the use fits the use type's own
   description (e.g. a boardroom is communication-intensive use, DIN 18041 A3).
4. **Inputs.** Every input the criterion needs is entered. DIN 18041 group A and EBU Tech 3276 need the room volume; NBC
   2016's maximum needs none. Missing: "needs input", and the input is asked for.
5. **Method.** The documented method gives a value for this room, within its conditions: inside the formula's volume range
   (DIN 18041), with the volume formula's guide Tm strictly between 0.2 and 0.4 s (EBU Tech 3276). Outside: no target,
   and the reason.
6. **Record.** The target is saved with its source: category, criterion, reference and issuer, clause, condition, units,
   the inputs used and the method written out (`project.target.record`), and the PDF report states the basis and what it
   applies to.

What happens when there is no target: the Target step says why, links back to Room Setup to choose another category, and
offers the **project's own target**. That target is entered by the user (no value is filled in, and − / + never start from
a made-up value), is marked as the project's own, and cannot be confirmed without saying where it comes from (e.g. the
client's specification). Its bands are the app's default, 500 Hz–2 kHz, which is said to be the app's convention.

## References used

| Reference | Issuer · edition | How its values were checked |
|---|---|---|
| DIN 18041 "Hörsamkeit in Räumen" (Acoustic quality in rooms) | DIN · 2016-03 | **Secondary.** The standard is sold by DIN Media and was not available. Its values were read in: BNB criterion BNB_BN 3.1.4 (German federal building ministry, version 2015, stated to follow DIN 18041:2016-03): formulas A1–A5, 2.0 s above 10,000 m³, the tolerance band per octave; C. Nocke, "Die neue DIN 18041", *Lärmbekämpfung* 11 (2016) No. 2: use types and example rooms, occupied state at 80 %, 125 Hz–4 kHz, group B as A/V only; OWA brochure DS 9558: the volume range of each formula |
| National Building Code of India 2016, Part 8 Section 4 (SP 7:2016) | Bureau of Indian Standards · 2016 | **Primary.** The BIS text (Public.Resource copy), two text layers that agree |
| EBU Tech 3276, listening conditions | EBU · 2nd ed. 1998 (Supplement 1, 2004: no change to reverberation) | **Primary.** The EBU PDF, the tolerance mask read from Fig. 1; ITU-R BS.1116-3 §8.2.3.1 gives the same formula and limits in these bands |

## Criteria

| Criterion | Clause and method | Valid for | Bands and tolerance | Condition | Inputs |
|---|---|---|---|---|---|
| DIN 18041 A1 "Music" | T_soll = (0.45 · lg V + 0.07) s | 30 m³ ≤ V < 1000 m³ | 0.8–1.2 × T_soll 250 Hz–2 kHz; 0.65–1.45 × at 125 Hz; 0.65–1.2 × at 4 kHz | Room in use, 80 % of its normal occupancy | Volume |
| DIN 18041 A2 "Speech/presentation" | T_soll = (0.37 · lg V − 0.14) s | 50 m³ ≤ V < 5000 m³ | as A1 | as A1 | Volume |
| DIN 18041 "Speech/presentation, inclusive" | A3 formula, (0.32 · lg V − 0.17) s | 30 m³ ≤ V < 5000 m³ | as A1 | as A1 | Volume |
| DIN 18041 A3 "Teaching/communication" | T_soll = (0.32 · lg V − 0.17) s | 30 m³ ≤ V < 1000 m³ (this use) | as A1 | as A1 | Volume |
| DIN 18041 A4 "Teaching/communication, inclusive" | T_soll = (0.26 · lg V − 0.14) s | 30 m³ ≤ V < 500 m³ | as A1 | as A1 | Volume |
| DIN 18041 A5 "Sport" | T_soll = (0.75 · lg V − 1.00) s; 2.0 s above 10,000 m³ | 200 m³ ≤ V ≤ 30,000 m³ | 0.8–1.2 × T_soll 250 Hz–2 kHz only | as A1 | Volume |
| NBC 2016, small private offices | cl. 8.3.2.1: not more than 0.75 s | — | at 500 Hz; an upper limit only | Not stated | None |
| NBC 2016, general offices (incl. open plan, 8.3.2.4) | cl. 8.3.2.1: not more than 1.0 s | — | at 500 Hz; an upper limit only | Not stated | None |
| NBC 2016, canteens | cl. 8.3.2.1: recommended maximum 1.0 s | — | at 500 Hz; an upper limit only | Not stated | None |
| EBU Tech 3276, listening and control rooms | §2.3: 0.2 s < Tm < 0.4 s; Tm = 0.25 · (V/100 m³)^⅓ s | Tm within 0.2–0.4 s | Tm ± 0.05 s 250 Hz–4 kHz; at 125 Hz −0.05 to +0.15 s (the mask's line from +0.30 s at 63 Hz to +0.05 s at 200 Hz) | Third-octave bands, the room's own loudspeakers; Appendix 2 also asks ≥ 30 m² floor (40 m² reference listening room) and ≤ 300 m³ (noted, not required) | Volume |

The recommended DIN range is the tolerance at 250 Hz–2 kHz, rounded to 0.01 s; T_soll itself is kept unrounded with the
target (`tsoll`), so the 125 Hz and 4 kHz limits are the standard's own to 0.01 s. The EBU target (changed 20 October
2026, after reading §2.3 again) is the range 0.2–0.4 s for the room's own MEASURED Tm, with the formula's value as the
guide (the preferred value and the treatment aim); every band is judged within ±0.05 s of the measured Tm, because EBU
draws its tolerance mask as T − Tm. An NBC target is
an **upper limit only** (`form: 'max'`): no preferred value and no lower limit, so a band can be within or above it, never
below; treatment aims at the limit.

**Occupied and empty.** DIN 18041 sets its targets for the room in use, 80 % occupied. The room is measured as it is,
usually empty, and reads longer than in use. The standard's Annex A converts between the two with set absorption values
per person, which could not be verified, so the app does not convert: the comparison is with the standard's own target,
and the Target step and the report say so. Occupancy and furnishing are recorded but never change the target.

## How each criterion judges the bands (evaluation)

| Criterion | Judged against the target range (and averaged for the summary) | Judged against their own limits | Shown without a limit |
|---|---|---|---|
| DIN 18041 A1–A4 | 250, 500, 1000, 2000 Hz | 125 Hz (0.65–1.45 × T_soll), 4 kHz (0.65–1.2 × T_soll) | — |
| DIN 18041 A5 | 250–2000 Hz | — | 125 Hz, 4 kHz |
| EBU Tech 3276 | 250–4000 Hz, within ±0.05 s of the room's measured Tm, which itself has to lie strictly between 0.2 and 0.4 s | 125 Hz (measured Tm − 0.05 to + 0.15 s) | — |
| NBC 2016 | 500 Hz (at most the limit) | — | the other bands |
| No criterion (the project's own target) | 500–2000 Hz, the app's convention | — | 125, 250, 4000 Hz |

Every judged band has to be within its limits; the average is a summary and never passes the room on its own. A judged
band that could not be measured leaves the verdict "where measured". The edge limits are applied to the target range's
edges (125 Hz: lower × 0.65/0.8, upper × 1.45/1.2), so they are the standard's for the recommended target and follow an
adjusted one. EBU's mask is set in third-octave bands; the app compares its octave bands with the mask at their centre
frequency, and says so.

## Room categories

Generated from `js/data/targets.js` and `js/data/demo.js` (industries shortened to their first word).

| Industry | Room type | Main activity | Status | Criterion, or why there is none |
|---|---|---|---|---|
| Corporate | Conference room | Meetings and presentations | Verified | DIN 18041:2016-03, Use type A3 "Teaching/communication" (named example) |
| Corporate | Conference room | Video calls and hybrid meetings | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (named example) |
| Corporate | Conference room | Inclusive meetings | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (named example) |
| Corporate | Meeting room | Meetings and presentations | Verified | DIN 18041:2016-03, Use type A3 "Teaching/communication" (named example) |
| Corporate | Meeting room | Video calls and hybrid meetings | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (named example) |
| Corporate | Meeting room | Inclusive meetings | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (named example) |
| Corporate | Boardroom | Meetings and presentations | Verified | DIN 18041:2016-03, Use type A3 "Teaching/communication" (by its use definition) |
| Corporate | Boardroom | Video calls and hybrid meetings | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (named example) |
| Corporate | Boardroom | Inclusive meetings | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (named example) |
| Corporate | Private office | Focused desk work | Verified | NBC 2016 Part 8 Sec. 4, Small private offices (named example) |
| Corporate | Private office | Meetings and presentations | Verified | DIN 18041:2016-03, Use type A3 "Teaching/communication" (by its use definition) |
| Corporate | Private office | Video calls and hybrid meetings | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (by its use definition) |
| Corporate | Open-plan office | Focused desk work | Verified | NBC 2016 Part 8 Sec. 4, General offices, including open-plan offices (named example) |
| Corporate | Reception area | Reception and service desk | Incomplete | DIN 18041:2016-03 places reception and counter areas with a permanent workplace in group B4 and gives only a recommended absorption for it (A/V ≥ 0.25 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Corporate | Reception area | Waiting and arrival | Incomplete | DIN 18041:2016-03 places entrance halls and circulation areas used for waiting in group B2 and gives only a recommended absorption for it (A/V ≥ 0.15 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Corporate, Education | Training room | Teaching | Verified | DIN 18041:2016-03, Use type A3 "Teaching/communication" (named example) |
| Corporate, Education | Training room | Meetings and presentations | Verified | DIN 18041:2016-03, Use type A3 "Teaching/communication" (named example) |
| Corporate, Education | Training room | Video calls and hybrid meetings | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (named example) |
| Corporate, Education | Training room | Inclusive teaching | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (named example) |
| Corporate | Staff canteen | Dining and socialising | Verified | NBC 2016 Part 8 Sec. 4, Canteens (named example) |
| Education | Classroom | Teaching | Verified | DIN 18041:2016-03, Use type A3 "Teaching/communication" (named example) |
| Education | Classroom | Inclusive teaching | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (named example) |
| Education | Lecture hall | Lectures and presentations | Verified | DIN 18041:2016-03, Use type A2 "Speech/presentation" (named example) |
| Education | Lecture hall | Lectures and presentations, inclusive | Verified | DIN 18041:2016-03, Use type "Speech/presentation, inclusive" (named example) |
| Education | Lecture hall | Teaching | Verified | DIN 18041:2016-03, Use type A3 "Teaching/communication" (named example) |
| Education | Lecture hall | Inclusive teaching | Verified | DIN 18041:2016-03, Use type A4 "Teaching/communication, inclusive" (named example) |
| Education | Library | Reading and study | Incomplete | DIN 18041:2016-03 places libraries (lending areas B4) in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Education | Music room | Music rehearsal and performance | Verified | DIN 18041:2016-03, Use type A1 "Music" (named example) |
| Education | Sports hall | Sport and exercise | Verified | DIN 18041:2016-03, Use type A5 "Sport" (named example) |
| Education | Gymnasium | Sport and exercise | Verified | DIN 18041:2016-03, Use type A5 "Sport" (named example) |
| Recording | Recording studio | Mixing and critical listening | Verified | EBU Tech 3276, Reference listening room or sound control room (named example) |
| Recording | Recording studio | Recording | Unsupported | No reference found sets a reverberation time for recording rooms. |
| Recording | Control room | Mixing and critical listening | Verified | EBU Tech 3276, Reference listening room or sound control room (named example) |
| Recording, Residential | Home studio | Mixing and critical listening | Verified | EBU Tech 3276, Reference listening room or sound control room (named example) |
| Recording, Residential | Home studio | Recording | Unsupported | No reference found sets a reverberation time for recording rooms. |
| Recording | Rehearsal room | Music rehearsal and performance | Verified | DIN 18041:2016-03, Use type A1 "Music" (by its use definition) |
| Hospitality | Restaurant | Dining and socialising | Incomplete | DIN 18041:2016-03 places dining rooms in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Hospitality | Café | Dining and socialising | Incomplete | DIN 18041:2016-03 places dining rooms in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Hospitality | Bar | Dining and socialising | Incomplete | DIN 18041:2016-03 places dining rooms in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Hospitality | Banquet hall | Events and assemblies | Verified | DIN 18041:2016-03, Use type A2 "Speech/presentation" (by its use definition) |
| Hospitality | Banquet hall | Dining and socialising | Incomplete | DIN 18041:2016-03 places dining rooms in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Hospitality | Hotel lobby | Waiting and arrival | Incomplete | DIN 18041:2016-03 places entrance halls and circulation areas used for waiting in group B2 and gives only a recommended absorption for it (A/V ≥ 0.15 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Healthcare | Consultation room | Consultation and treatment | Incomplete | DIN 18041:2016-03 places consulting, examination and treatment rooms in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Healthcare | Waiting area | Waiting and arrival | Incomplete | DIN 18041:2016-03 places patient waiting rooms in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Healthcare | Patient room | Patient care and rest | Incomplete | DIN 18041:2016-03 places patient bedrooms and rest rooms in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Healthcare | Therapy room | Therapy and group sessions | Verified | DIN 18041:2016-03, Use type A3 "Teaching/communication" (by its use definition) |
| Healthcare | Therapy room | Consultation and treatment | Incomplete | DIN 18041:2016-03 places consulting and treatment rooms in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Auditoriums | Auditorium | Lectures and presentations | Verified | DIN 18041:2016-03, Use type A2 "Speech/presentation" (named example) |
| Auditoriums | Auditorium | Lectures and presentations, inclusive | Verified | DIN 18041:2016-03, Use type "Speech/presentation, inclusive" (named example) |
| Auditoriums | Auditorium | Music rehearsal and performance | Incomplete | DIN 18041 excludes concert halls and theatres. |
| Auditoriums | Cinema | Film screening | Incomplete | DIN 18041 excludes cinemas. |
| Auditoriums | Place of worship | Spoken services | Unsupported | No reference found sets a reverberation time for places of worship. |
| Auditoriums | Place of worship | Services with music and singing | Unsupported | No reference found sets a reverberation time for places of worship. |
| Auditoriums | Community hall | Events and assemblies | Verified | DIN 18041:2016-03, Use type A2 "Speech/presentation" (named example) |
| Auditoriums | Community hall | Lectures and presentations, inclusive | Verified | DIN 18041:2016-03, Use type "Speech/presentation, inclusive" (named example) |
| Auditoriums | Community hall | Dining and socialising | Incomplete | DIN 18041:2016-03 places dining rooms in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Industrial | Exhibition hall | Exhibitions and circulation | Incomplete | DIN 18041:2016-03 places exhibition rooms (B3 when interactive or noisy) in group B2 and gives only a recommended absorption for it (A/V ≥ 0.15 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Industrial | Showroom | Exhibitions and circulation | Incomplete | DIN 18041:2016-03 places exhibition rooms (B3 when interactive or noisy) in group B2 and gives only a recommended absorption for it (A/V ≥ 0.15 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Industrial | Showroom | Reception and service desk | Incomplete | DIN 18041:2016-03 places reception and counter areas with a permanent workplace in group B4 and gives only a recommended absorption for it (A/V ≥ 0.25 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Industrial | Retail store | Sales and customer service | Incomplete | DIN 18041:2016-03 places sales rooms in group B3 and gives only a recommended absorption for it (A/V ≥ 0.20 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Industrial | Workshop | Workshop and manual work | Incomplete | DIN 18041:2016-03 places workshops and other work rooms with a lot of noise in group B5 and gives only a recommended absorption for it (A/V ≥ 0.30 m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. |
| Industrial | Warehouse | Storage and logistics | Unsupported | No reference found sets a reverberation time or an absorption for warehouses. |
| Residential | Living room | Living and relaxing | Unsupported | No reference found sets a reverberation-time target for homes. |
| Residential | Living room | Film and TV viewing | Unsupported | No reference found sets a reverberation-time target for homes. |
| Residential | Bedroom | Sleeping and relaxing | Unsupported | No reference found sets a reverberation-time target for homes. |
| Residential | Home theatre | Film and TV viewing | Unsupported | No reference found sets a reverberation-time target for homes. |

66 categories.

## References checked and not used for targets

| Reference | Why not |
|---|---|
| IS 2526:1963 (BIS, reaffirmed) | Optimum reverberation time only as curves in a graph (Fig. 1, 500 Hz), with no table or formula; NBC 2016 refers to it for auditoria |
| BB93 (Department for Education, England, Feb 2015) | Verified, but it applies to school buildings in England and depends on new build or refurbishment; DIN 18041 is used for teaching rooms |
| ANSI/ASA S12.60 Part 1 | The 2010 edition the app used is superseded by ASA/ANSI S12.60-2026/Part 1, whose values could not be read |
| ISO 23591:2021 (rehearsal rooms) | Its criteria tables could not be read from a free source |
| ISO 22955:2021 (open-plan offices) | Its per-space tables could not be read; one value was seen only in a secondary source |
| HTM 08-01 (2013) | A minimum absorption (Class C over at least 80 % of the floor area), not a reverberation time |
| FGI Guidelines (2010) | Room-average absorption coefficients, not reverberation times; the current edition could not be read |
| WHO Guidelines for Community Noise (1999) | About 0.6 s for classrooms and below 1 s for school halls, with no band or room condition |
| ISO 16283-1 | Its 0.5 s is the reference used to normalise sound-insulation results, not a design target |

## What changed from the earlier targets

| Earlier | Now | Why |
|---|---|---|
| Outside a DIN formula's volume range, the value at the nearest limit was used ("indicative") | No target | Nothing extrapolated or clamped |
| The occupancy converted the in-use target to an empty room with 0.5 m² per person | The standard's own target; occupancy recorded only | The per-person absorption was not verified |
| DIN 18041 group B (offices, dining, libraries, waiting, patient and treatment rooms, exhibitions) gave an RT60 from A/V by Sabine, with a design value at max ÷ 1.2 and a lower limit | Group B rooms are incomplete; offices and canteens follow NBC 2016's limits | DIN gives only A/V for them; the design value and lower limit were invented |
| Classrooms narrowed by ANSI/ASA S12.60-2010 (0.6 / 0.7 s) to a midpoint | DIN 18041 A3/A4 alone | The 2010 edition is superseded; the midpoint was invented |
| Homes 0.5 s (ISO 16283-1); cinemas, home cinemas and recording rooms by interpretation (EBU, DIN A1); places of worship DIN A2/A1 | Unsupported or incomplete | Not targets for those rooms; DIN 18041 excludes cinemas, churches, studios and dwellings |
| DIN 125 Hz and 4 kHz as band warnings at 0.6–1.4 × and 0.6–1.2 × T | Judged at 0.65–1.45 × and 0.65–1.2 × T_soll | The standard's tolerance band (BNB 3.1.4), part of compliance |
| EBU ±0.05 s around the formula's Tm, clamped into 0.2–0.4 s | The room's measured Tm must lie within 0.2–0.4 s; every band within the mask around the measured Tm; the formula is the guide | §2.3: Tm is the average of the measured reverberation times; the range is a requirement, not a clamp |

Saved projects: the room is kept exactly as saved (industry, room type and activity, also one no longer offered). A
recommended target follows the verified criterion; when none applies, its values are kept apart (`target.earlier`, never
used), the project has no target until a supported category or the project's own target is chosen, a note says why, and
the finished steps that relied on it are marked for review. A target the user set stays theirs.

## Open points

- DIN 18041:2016 was checked in published sources, not in the standard. Someone holding it should confirm the volume
  ranges (from the OWA brochure only, except A4 ≤ 500 m³ and A5) and the A5 upper volume (about 30,000 m³).
- NBC 2016 does not define "small" for private offices or "very large" offices; the user chooses the category.
- A fourth revision of NBC was announced in 2025 and could not be read.
