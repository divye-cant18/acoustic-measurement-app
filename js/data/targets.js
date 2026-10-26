/* RT60 target criteria: the references, the criteria taken from them, and the room categories that may use them.
   AM.services.target reads this file and is the only code that turns a criterion into a target; nothing here is shown or
   calculated by the interface directly. docs/TARGET-CRITERIA.md describes every entry and the evidence behind it.

   The rule (task of 2026-10-19): a target RT60 is generated only for a room category whose criterion is VERIFIED and
   applies to that room use, with every input the criterion needs, by the method the reference documents and within the
   conditions it states. Nothing is extrapolated, clamped, averaged into a single value from an unspecified range, or
   borrowed from another room type. A category without such a criterion is INCOMPLETE (a reference covers the room but
   gives no reverberation time, or its values could not be verified) or UNSUPPORTED (no reference found), and gets no
   target: the user is told why and can choose another category, or enter the project's own target with its source.

   Structure
     REFERENCES   each document: number, edition, title, issuer, how its values were checked (primary = read in the
                  document itself; secondary = read in the publications named in checkedIn, the document not available)
     CRITERIA     each criterion taken from a reference: the clause, the method and its parameters, the conditions it
                  applies under, the bands and units, the inputs it needs, its status, what it was checked in
     USES         the main activities (the subtype of a room type) with a stable id
     CATEGORIES   room type → [main activity, criterion id | { status, reason }]: one entry is one room category
     NOT_USED     references that were checked and are not used for targets, with the reason
   Room types and industries are listed in js/data/demo.js (INDUSTRIES); a room type keeps its industries there. */
(function (AM) {
  'use strict';

  const REFERENCES = {
    din18041: {
      id: 'din18041', number: 'DIN 18041', edition: '2016-03', short: 'DIN 18041:2016-03',
      title: 'Hörsamkeit in Räumen – Anforderungen, Empfehlungen und Hinweise für die Planung (Acoustic quality in rooms – Specifications and instructions for the room acoustic design)',
      issuer: 'DIN Deutsches Institut für Normung e. V.',
      scope: 'Rooms for hearing at medium and large distances (group A: music, speech, teaching and communication, sport) and at short distances (group B). It does not cover concert halls, theatres, cinemas, churches, studios or other rooms with special requirements for recording or reproducing music and speech.',
      evidence: 'secondary',
      checkedIn: [
        'BNB criterion BNB_BN 3.1.4 "Akustischer Komfort", version 2015, German Federal Ministry for the Environment, Building and Nuclear Safety (BMUB): the T_soll formulas for A1–A5, the 2.0 s above 10,000 m³ for A5, and the tolerance band per octave band, stated to follow DIN 18041:2016-03.',
        'C. Nocke, "Die neue DIN 18041", Lärmbekämpfung 11 (2016) No. 2, pp. 50–55: the use types and their example rooms, the occupied state (80 % of the normal occupancy), the octave bands 125 Hz–4 kHz, A4 not for rooms over 500 m³, and group B given as A/V guide values only.',
        'OWA technical brochure DS 9558: the volume range of each formula.',
      ],
      note: 'The standard is sold by DIN Media and its text was not available. Its values were checked in the publications above, which agree with one another.',
    },
    nbc2016: {
      id: 'nbc2016', number: 'SP 7:2016 (NBC 2016), Part 8, Section 4', edition: '2016 (third revision)', short: 'NBC 2016 Part 8 Sec. 4',
      title: 'National Building Code of India 2016, Volume 2, Part 8 Building services, Section 4 Acoustics, sound insulation and noise control',
      issuer: 'Bureau of Indian Standards (BIS)',
      scope: 'Acoustic design and noise control of buildings in India, by building type.',
      evidence: 'primary',
      checkedIn: ['The BIS text (Public.Resource copy, archive.org "nationalbuilding02"), born-digital and scanned text layers, which agree.'],
      note: '',
    },
    ebu3276: {
      id: 'ebu3276', number: 'EBU Tech 3276', edition: '2nd edition, May 1998 (Supplement 1, May 2004: no change to the reverberation requirements)', short: 'EBU Tech 3276',
      title: 'Listening conditions for the assessment of sound programme material: monophonic and two-channel stereophonic',
      issuer: 'European Broadcasting Union (EBU)',
      scope: 'Reference listening rooms and high-quality sound control rooms.',
      evidence: 'primary',
      checkedIn: ['The EBU PDF (tech.ebu.ch, tech3276.pdf and tech3276s1.pdf); the tolerance mask read from Fig. 1 and its drawing coordinates.', 'ITU-R BS.1116-3 (02/2015), §8.2.3.1, gives the same Tm formula. It does not state the 0.2–0.4 s range and asks for different floor areas, so it confirms the formula only.'],
      note: '',
    },
  };

  /* Band rules: how a criterion judges the octave bands (read by AM.services.evaluation).
       din-a    DIN 18041 A1–A4: 0.8–1.2 × T_soll from 250 Hz to 2 kHz (the target range), 0.65–1.45 × T_soll at 125 Hz
                and 0.65–1.2 × T_soll at 4 kHz; every band from 125 Hz to 4 kHz within its limits
       din-a5   DIN 18041 A5: 0.8–1.2 × T_soll from 250 Hz to 2 kHz only
       ebu      EBU Tech 3276: Tm ± 0.05 s from 250 Hz to 4 kHz; at 125 Hz the mask's limits at that frequency
       nbc-500  NBC 2016 offices: a maximum at 500 Hz */

  const CONDITION_DIN_A = 'The room in use, with 80 % of its normal occupancy present (DIN 18041:2016, group A).';
  const dinA = (id, name, k, c, vMin, vMax, extra) => Object.assign({
    id, reference: 'din18041', status: 'verified', name, method: 'din-formula', k, c, vMin, vMax, bands: 'din-a', form: 'range',
    tolerance: { 125: [0.65, 1.45], 250: [0.8, 1.2], 500: [0.8, 1.2], 1000: [0.8, 1.2], 2000: [0.8, 1.2], 4000: [0.65, 1.2] },
    condition: CONDITION_DIN_A, units: 's, octave bands 125 Hz–4 kHz', inputs: ['volume'],
  }, extra);

  const CRITERIA = {
    'din18041-A1': dinA('din18041-A1', 'Use type A1 "Music"', 0.45, 0.07, 30, 1000, {
      clause: 'Group A, use type A1 "Musik": T_soll = (0.45 · lg V/m³ + 0.07) s for 30 m³ ≤ V < 1000 m³; tolerance band for A1–A4.',
      checked: 'Formula and tolerance: BNB 3.1.4; volume range: OWA DS 9558.',
    }),
    'din18041-A2': dinA('din18041-A2', 'Use type A2 "Speech/presentation"', 0.37, -0.14, 50, 5000, {
      clause: 'Group A, use type A2 "Sprache/Vortrag": T_soll = (0.37 · lg V/m³ − 0.14) s for 50 m³ ≤ V < 5000 m³; tolerance band for A1–A4.',
      checked: 'Formula and tolerance: BNB 3.1.4; volume range: OWA DS 9558.',
    }),
    'din18041-A2i': dinA('din18041-A2i', 'Use type A3 "Speech/presentation, inclusive"', 0.32, -0.17, 30, 5000, {
      clause: 'Group A, use type A3, "Sprache/Vortrag inklusiv" (speech and presentation for people who depend on good speech intelligibility; A3 also covers teaching and communication): T_soll = (0.32 · lg V/m³ − 0.17) s, for this use up to 5000 m³; tolerance band for A1–A4.',
      checked: 'A3 formula for this use: BNB 3.1.4; range up to 5000 m³: OWA DS 9558; the use and its examples: Nocke 2016, Table 1.',
    }),
    'din18041-A3': dinA('din18041-A3', 'Use type A3 "Teaching/communication"', 0.32, -0.17, 30, 1000, {
      clause: 'Group A, use type A3 "Unterricht/Kommunikation": T_soll = (0.32 · lg V/m³ − 0.17) s, for this use up to 1000 m³ (30 m³ ≤ V < 1000 m³); tolerance band for A1–A4.',
      checked: 'Formula and tolerance: BNB 3.1.4; range for this use (to 1000 m³): OWA DS 9558.',
    }),
    'din18041-A4': dinA('din18041-A4', 'Use type A4 "Teaching/communication, inclusive"', 0.26, -0.14, 30, 500, {
      clause: 'Group A, use type A4 "Unterricht/Kommunikation inklusiv": T_soll = (0.26 · lg V/m³ − 0.14) s for 30 m³ ≤ V < 500 m³ (not suitable for larger rooms or for music); tolerance band for A1–A4.',
      checked: 'Formula and tolerance: BNB 3.1.4; not above 500 m³: Nocke 2016, Table 1; lower limit 30 m³: OWA DS 9558.',
    }),
    'din18041-A5': dinA('din18041-A5', 'Use type A5 "Sport"', 0.75, -1.00, 200, 10000, {
      clause: 'Group A, use type A5 "Sport": T_soll = (0.75 · lg V/m³ − 1.00) s for 200 m³ ≤ V ≤ 10,000 m³, and 2.0 s above 10,000 m³ (sports halls are covered up to about 30,000 m³); 0.8–1.2 × T_soll from 250 Hz to 2 kHz.',
      fixedAbove: { value: 2.0, vMax: 30000 }, bands: 'din-a5', units: 's, octave bands 250 Hz–2 kHz',
      tolerance: { 250: [0.8, 1.2], 500: [0.8, 1.2], 1000: [0.8, 1.2], 2000: [0.8, 1.2] },
      checked: 'Formula, 2.0 s above 10,000 m³ and tolerance: BNB 3.1.4; sports halls to about 30,000 m³: OWA DS 9558 and the standard\'s published scope.',
    }),
    'nbc2016-small-office': {
      id: 'nbc2016-small-office', reference: 'nbc2016', status: 'verified', name: 'Small private offices', method: 'maximum', value: 0.75, band: 500, bands: 'nbc-500', form: 'max',
      clause: 'Clause 8.3.2.1 "Noise reduction within rooms": in small private offices the reverberation time should not exceed 0.75 s. Note: all reverberation times are specified for a frequency of 500 Hz.',
      condition: 'None stated in the clause (occupied or empty is not specified).', units: 's, at 500 Hz', inputs: [],
      checked: 'Read in the BIS text.',
    },
    'nbc2016-general-office': {
      id: 'nbc2016-general-office', reference: 'nbc2016', status: 'verified', name: 'General offices, including open-plan offices', method: 'maximum', value: 1.0, band: 500, bands: 'nbc-500', form: 'max',
      clause: 'Clause 8.3.2.1 "Noise reduction within rooms": the reverberation time should not exceed 1.0 s in all general offices of the types listed in 8.3.2.2 to 8.3.2.6 (large general offices, lightweight construction, open plan offices, office equipment rooms, banking halls). Note: all reverberation times are specified for a frequency of 500 Hz.',
      condition: 'None stated in the clause (occupied or empty is not specified).', units: 's, at 500 Hz', inputs: [],
      checked: 'Read in the BIS text.',
    },
    'nbc2016-canteen': {
      id: 'nbc2016-canteen', reference: 'nbc2016', status: 'verified', name: 'Canteens', method: 'maximum', value: 1.0, band: 500, bands: 'nbc-500', form: 'max',
      clause: 'Clause 8.3.2.1 "Noise reduction within rooms" (office buildings): for canteens, the recommended maximum reverberation time is 1.0 s. Note: all reverberation times are specified for a frequency of 500 Hz.',
      condition: 'None stated in the clause (occupied or empty is not specified).', units: 's, at 500 Hz', inputs: [],
      checked: 'Read in the BIS text.',
    },
    'ebu3276-control-room': {
      id: 'ebu3276-control-room', reference: 'ebu3276', status: 'verified', name: 'Reference listening room or sound control room', method: 'ebu-tm',
      base: 0.25, v0: 100, lo: 0.2, hi: 0.4, tol: 0.05, bands: 'ebu', form: 'range',
      clause: '§2.3 Reverberation field: Tm, the mean reverberation time from 200 Hz to 4 kHz, should lie between 0.2 s and 0.4 s; Tm = 0.25 · (V/V0)^1/3 s with V0 = 100 m³ as a guide; Fig. 1, tolerance mask relative to Tm.',
      condition: 'The room as used for listening, with at least 30 m² of floor (40 m² for a reference listening room) and at most 300 m³ (Appendix 2): outside that size the criterion gives no target. The criterion is set in third-octave bands measured with the room\'s own loudspeakers.',
      units: 's, octave bands 125 Hz–4 kHz (the criterion: third-octave bands 63 Hz–8 kHz)', inputs: ['volume'],
      roomSize: { floorMin: 30, floorMinListening: 40, vMax: 300 },
      checked: 'Read in the EBU PDF; ITU-R BS.1116-3 §8.2.3.1 gives the same Tm formula (not the 0.2–0.4 s range or the floor areas).',
    },
  };

  /* Main activities: the subtype of a room type. The label is what the project saves; the id is stable. */
  const USES = {
    'Meetings and presentations': { id: 'meetings' },
    'Inclusive meetings': { id: 'meetings-inclusive', hint: 'For people who depend on clear speech: hearing impairment, a second language, inclusive use.' },
    'Video calls and hybrid meetings': { id: 'video-calls' },
    'Lectures and presentations': { id: 'lectures' },
    'Lectures and presentations, inclusive': { id: 'lectures-inclusive', hint: 'For listeners who depend on clear speech: hearing impairment, a second language, inclusive use.' },
    'Teaching': { id: 'teaching' },
    'Inclusive teaching': { id: 'teaching-inclusive', hint: 'For learners who depend on clear speech: hearing impairment, a second language, inclusive teaching.' },
    'Music rehearsal and performance': { id: 'music' },
    'Recording': { id: 'recording' },
    'Mixing and critical listening': { id: 'critical-listening' },
    'Film and TV viewing': { id: 'film-tv' },
    'Film screening': { id: 'film-screening' },
    'Sport and exercise': { id: 'sport' },
    'Dining and socialising': { id: 'dining' },
    'Events and assemblies': { id: 'events' },
    'Focused desk work': { id: 'desk-work' },
    'Reception and service desk': { id: 'reception' },
    'Waiting and arrival': { id: 'waiting' },
    'Reading and study': { id: 'reading' },
    'Exhibitions and circulation': { id: 'exhibitions' },
    'Sales and customer service': { id: 'sales' },
    'Workshop and manual work': { id: 'workshop' },
    'Storage and logistics': { id: 'storage' },
    'Patient care and rest': { id: 'patient-care' },
    'Consultation and treatment': { id: 'consultation' },
    'Therapy and group sessions': { id: 'group-sessions' },
    'Spoken services': { id: 'spoken-services' },
    'Services with music and singing': { id: 'services-music' },
    'Living and relaxing': { id: 'living' },
    'Sleeping and relaxing': { id: 'sleeping' },
    'Calls and focused work': { id: 'calls-focus' },
    'Staff work and coordination': { id: 'staff-work' },
    'Circulation and waiting': { id: 'circulation-waiting' },
    'Circulation and shopping': { id: 'circulation-shopping' },
    'Spoken drama and performance': { id: 'drama' },
    'Flexible performance and rehearsal': { id: 'flexible-performance' },
    'Monitoring and control work': { id: 'monitoring' },
    'Remote work and calls': { id: 'remote-work' },
    'Formal proceedings and debate': { id: 'proceedings' },
    'Formal proceedings, inclusive': { id: 'proceedings-inclusive', hint: 'For listeners who depend on clear speech: hearing impairment, a second language, inclusive use.' },
    'Waiting and announcements': { id: 'waiting-announcements' },
  };

  /* Categories without a verified criterion: no target, and the reason shown to the user. */
  const dinB = (group, av, rooms) => ({ status: 'incomplete', references: ['din18041'],
    reason: `DIN 18041:2016-03 places ${rooms} in group ${group} and gives only a recommended absorption for it (A/V ≥ ${av} m²/m³ for rooms up to 2.5 m high, from 250 Hz to 2 kHz), not a reverberation time. No other verified reference sets one for this room.` });
  const NONE = {
    recording: { status: 'unsupported', references: ['din18041', 'ebu3276'], reason: 'No reference found sets a reverberation time for recording rooms. DIN 18041 excludes studios, and EBU Tech 3276 covers listening and control rooms only.' },
    worship: { status: 'unsupported', references: ['din18041'], reason: 'No reference found sets a reverberation time for places of worship. DIN 18041 excludes churches and other sacred spaces.' },
    dwelling: { status: 'unsupported', references: ['din18041', 'nbc2016'], reason: 'No reference found sets a reverberation-time target for homes. DIN 18041 excludes dwellings and NBC 2016 gives none for residential buildings. The 0.5 s of ISO 16283-1 is the reference used to normalise sound-insulation measurements, not a design target.' },
    music: { status: 'incomplete', references: ['din18041', 'is2526'], reason: 'DIN 18041 excludes concert halls and theatres. IS 2526:1963 (clause 6.1, Fig. 1) gives the optimum reverberation time for music halls only as a graph at 500 Hz, with no table or formula to read a value from, and NBC 2016 refers to it for auditoria.' },
    cinema: { status: 'incomplete', references: ['din18041', 'is2526'], reason: 'DIN 18041 excludes cinemas. IS 2526:1963 (clause 6.1, Fig. 1) has a curve for motion picture theatres, but only as a graph at 500 Hz, with no table or formula to read a value from.' },
    warehouse: { status: 'unsupported', references: [], reason: 'No reference found sets a reverberation time or an absorption for warehouses.' },
    theatre: { status: 'unsupported', references: ['din18041'], reason: 'DIN 18041 excludes theatres, and no other verified reference found sets a reverberation time for them.' },
    booth: { status: 'unsupported', references: [], reason: 'No reference found sets a reverberation time for phone booths or focus pods (small enclosures inside a room).' },
    hotelRoom: { status: 'unsupported', references: [], reason: 'No reference found sets a reverberation time for hotel guest rooms.' },
    nurseStation: { status: 'unsupported', references: ['din18041'], reason: 'No reference found sets a reverberation time for nurse stations. DIN 18041 gives rooms like these only a recommended absorption (group B) and does not name them.' },
  };

  /* Room type → its categories (main activity → criterion), most common first: the first verified one is the default.
     basis: 'example' when the reference names this room or use among its examples, 'definition' when the room use fits
     the use type's own description; why: shown to the user. */
  const V = (criterion, basis, why) => ({ criterion, basis, why });
  const A3_MEET = V('din18041-A3', 'example', 'DIN 18041 names meeting, conference and seminar rooms as examples of use type A3, teaching and communication.');
  const A4_MEET = V('din18041-A4', 'example', 'DIN 18041 names meeting and conference rooms as examples of use type A4, the same use for people who depend on good speech intelligibility.');
  const A4_VIDEO = V('din18041-A4', 'example', 'DIN 18041 names the video-conference room as an example of use type A4, teaching and communication, inclusive.');
  const A3_TEACH = V('din18041-A3', 'example', 'DIN 18041 names classrooms, seminar rooms and differentiation rooms as examples of use type A3, teaching and communication.');
  const A4_TEACH = V('din18041-A4', 'example', 'DIN 18041 names classrooms and seminar rooms as examples of use type A4, for learners who depend on good speech intelligibility (hearing impairment, a second language, inclusive teaching).');
  const A2_LECT = V('din18041-A2', 'example', 'DIN 18041 names lecture halls, assembly rooms and school halls as examples of use type A2, speech and presentation.');
  const A2I_LECT = V('din18041-A2i', 'example', 'DIN 18041 names lecture halls and assembly rooms as examples of "speech/presentation, inclusive", part of use type A3: speech and presentation for listeners who depend on good speech intelligibility.');
  const A1_MUSIC = V('din18041-A1', 'example', 'DIN 18041 names the music room with active music-making and singing as the example of use type A1, music.');
  const A5_SPORT = V('din18041-A5', 'example', 'DIN 18041 names sports and swimming halls used almost only for sport as the example of use type A5, sport.');
  const EBU_LISTEN = V('ebu3276-control-room', 'example', 'EBU Tech 3276 sets the reverberation of reference listening rooms and high-quality sound control rooms from their volume.');
  const EBU_STUDIO = V('ebu3276-control-room', 'definition', 'A studio room used for mixing and critical listening is used as a sound control room, which EBU Tech 3276 covers. EBU Tech 3276 does not name recording or home studios.');
  const A3_LECT_TEACH = V('din18041-A3', 'definition', 'A lecture hall used for teaching is used like the classrooms and seminar rooms DIN 18041 names as examples of use type A3. DIN 18041 lists lecture halls themselves under A2, speech and presentation.');
  const A4_LECT_TEACH = V('din18041-A4', 'definition', 'A lecture hall used for inclusive teaching is used like the classrooms and seminar rooms DIN 18041 names as examples of use type A4. DIN 18041 lists lecture halls themselves under A2, and A4 is not for rooms over 500 m³.');
  const SPEECH_ROOM = [['Meetings and presentations', A3_MEET], ['Video calls and hybrid meetings', A4_VIDEO], ['Inclusive meetings', A4_MEET]];
  const A2_CIVIC = V('din18041-A2', 'example', 'DIN 18041 names court rooms and council chambers (Gerichts- und Ratssaal) as examples of use type A2, speech and presentation.');
  const A2I_CIVIC = V('din18041-A2i', 'example', 'DIN 18041 names court rooms and council chambers among the examples of "speech/presentation, inclusive", part of use type A3: speech and presentation for listeners who depend on good speech intelligibility.');
  const A5_POOL = V('din18041-A5', 'example', 'DIN 18041 names swimming halls used almost only for sport as an example of use type A5, sport.');

  const CATEGORIES = {
    'Conference room': SPEECH_ROOM,
    'Meeting room': SPEECH_ROOM,
    'Boardroom': [
      ['Meetings and presentations', V('din18041-A3', 'definition', 'A boardroom is a meeting room: communication-intensive use with several people speaking, which DIN 18041 sets as use type A3 (its examples: meeting and conference rooms).')],
      ['Video calls and hybrid meetings', A4_VIDEO],
      ['Inclusive meetings', A4_MEET],
    ],
    'Private office': [
      ['Focused desk work', V('nbc2016-small-office', 'example', 'NBC 2016 sets a maximum for small private offices (clause 8.3.2.1). DIN 18041 gives offices only a recommended absorption (group B4, single offices B3), not a reverberation time. NBC does not say how small a "small" office is: for a large office, NBC\'s 1.0 s for general offices may be the limit that applies, and the app keeps the stricter 0.75 s.')],
      ['Meetings and presentations', V('din18041-A3', 'definition', 'An office used mainly for meetings is communication-intensive use with several people speaking, which DIN 18041 sets as use type A3.')],
      ['Video calls and hybrid meetings', V('din18041-A4', 'definition', 'An office used mainly for video calls is used as a video-conference room, which DIN 18041 names as an example of use type A4.')],
    ],
    'Open-plan office': [
      ['Focused desk work', V('nbc2016-general-office', 'example', 'NBC 2016 sets a maximum for general offices, open-plan offices among them (clauses 8.3.2.1 and 8.3.2.4). DIN 18041 gives offices only a recommended absorption (group B4). ISO 22955 (open-plan offices) is not used: its values could not be verified.')],
    ],
    'Reception area': [
      ['Reception and service desk', dinB('B4', '0.25', 'reception and counter areas with a permanent workplace')],
      ['Waiting and arrival', dinB('B2', '0.15', 'entrance halls and circulation areas used for waiting')],
    ],
    'Training room': [
      ['Teaching', A3_TEACH], ['Meetings and presentations', A3_MEET], ['Video calls and hybrid meetings', A4_VIDEO], ['Inclusive teaching', A4_TEACH],
    ],
    'Staff canteen': [
      ['Dining and socialising', V('nbc2016-canteen', 'example', 'NBC 2016 sets a recommended maximum for canteens in office buildings (clause 8.3.2.1).')],
    ],
    'Classroom': [['Teaching', A3_TEACH], ['Inclusive teaching', A4_TEACH]],
    'Lecture hall': [
      ['Lectures and presentations', A2_LECT], ['Lectures and presentations, inclusive', A2I_LECT], ['Teaching', A3_LECT_TEACH], ['Inclusive teaching', A4_LECT_TEACH],
    ],
    'Library': [['Reading and study', dinB('B3', '0.20', 'libraries (lending areas B4)')]],
    'Lecture theatre': [['Lectures and presentations', A2_LECT], ['Lectures and presentations, inclusive', A2I_LECT]],
    'Computer lab': [
      ['Teaching', V('din18041-A3', 'definition', 'A computer lab used for teaching is used like the classrooms DIN 18041 names as examples of use type A3. DIN 18041 also lists laboratories in group B, so check that the room is used mainly for teaching.')],
      ['Inclusive teaching', V('din18041-A4', 'definition', 'A computer lab used for inclusive teaching is used like the classrooms DIN 18041 names as examples of use type A4 (not for rooms over 500 m³).')],
    ],
    'Music practice room': [['Music rehearsal and performance', A1_MUSIC]],
    'School hall': [
      ['Events and assemblies', V('din18041-A2', 'example', 'DIN 18041 names school halls (Schulaula) and assembly rooms as examples of use type A2, speech and presentation.')],
      ['Lectures and presentations, inclusive', V('din18041-A2i', 'example', 'DIN 18041 names school halls among the examples of "speech/presentation, inclusive", part of use type A3: speech and presentation for listeners who depend on good speech intelligibility.')],
    ],
    'Music room': [['Music rehearsal and performance', A1_MUSIC]],
    'Sports hall': [['Sport and exercise', A5_SPORT]],
    'Swimming pool hall': [['Sport and exercise', A5_POOL]],
    'Gym / fitness studio': [['Sport and exercise', V('din18041-A5', 'definition', 'A fitness studio used for sport and exercise is used like the sports halls DIN 18041 names for use type A5; the studio itself is not named.')]],
    'Gymnasium': [['Sport and exercise', V('din18041-A5', 'definition', 'A gymnasium used for sport and exercise is used like the sports halls DIN 18041 names as the example of use type A5; the gymnasium itself is not named.')]],
    'Recording studio': [['Mixing and critical listening', EBU_STUDIO], ['Recording', NONE.recording]],
    'Control room': [['Mixing and critical listening', EBU_LISTEN]],
    'Home studio': [['Mixing and critical listening', EBU_STUDIO], ['Recording', NONE.recording]],
    'Rehearsal room': [
      ['Music rehearsal and performance', V('din18041-A1', 'definition', 'A rehearsal room is a music room with active music-making, the example DIN 18041 gives for use type A1. ISO 23591:2021 sets criteria for rehearsal rooms by type of music; its values could not be verified, so it is not used.')],
    ],
    'Restaurant': [['Dining and socialising', dinB('B3', '0.20', 'dining rooms')]],
    'Café': [['Dining and socialising', dinB('B3', '0.20', 'dining rooms')]],
    'Bar': [['Dining and socialising', dinB('B3', '0.20', 'dining rooms')]],
    'Banquet hall': [
      ['Events and assemblies', V('din18041-A2', 'definition', 'Speeches and presentations to a seated audience, mostly from one position, are use type A2 in DIN 18041 (its examples: assembly rooms and community halls).')],
      ['Dining and socialising', dinB('B3', '0.20', 'dining rooms')],
    ],
    'Hotel lobby': [['Waiting and arrival', dinB('B2', '0.15', 'entrance halls and circulation areas used for waiting')]],
    'Event room': [
      ['Meetings and presentations', V('din18041-A3', 'example', 'DIN 18041 names conference venue rooms (Tagungsraum) and conference rooms as examples of use type A3, teaching and communication.')],
      ['Events and assemblies', V('din18041-A2', 'example', 'DIN 18041 names assembly rooms (Versammlungsraum) as examples of use type A2, speech and presentation.')],
      ['Video calls and hybrid meetings', A4_VIDEO],
    ],
    'Hotel guest room': [['Sleeping and relaxing', NONE.hotelRoom]],
    'Consultation room': [['Consultation and treatment', dinB('B3', '0.20', 'consulting, examination and treatment rooms')]],
    'Waiting area': [['Waiting and arrival', dinB('B3', '0.20', 'patient waiting rooms')]],
    'Patient room': [['Patient care and rest', dinB('B3', '0.20', 'patient bedrooms and rest rooms')]],
    'Examination room': [['Consultation and treatment', dinB('B3', '0.20', 'examination and treatment rooms')]],
    'Nurse station': [['Staff work and coordination', NONE.nurseStation]],
    'Corridor': [['Circulation and waiting', dinB('B3', '0.20', 'circulation areas with places to wait in hospitals and care facilities')]],
    'Therapy room': [
      ['Therapy and group sessions', V('din18041-A3', 'definition', 'Group sessions are communication-intensive use with several people speaking, which DIN 18041 sets as use type A3 (its examples include group rooms in care facilities).')],
      ['Consultation and treatment', dinB('B3', '0.20', 'consulting and treatment rooms')],
    ],
    'Auditorium': [
      ['Lectures and presentations', A2_LECT], ['Lectures and presentations, inclusive', A2I_LECT], ['Music rehearsal and performance', NONE.music],
    ],
    'Cinema': [['Film screening', NONE.cinema]],
    'Drama theatre': [['Spoken drama and performance', NONE.theatre]],
    'Concert hall': [['Music rehearsal and performance', NONE.music]],
    'Black box theatre': [['Flexible performance and rehearsal', NONE.theatre]],
    'Place of worship': [['Spoken services', NONE.worship], ['Services with music and singing', NONE.worship]],
    'Community hall': [
      ['Events and assemblies', V('din18041-A2', 'example', 'DIN 18041 names community halls and assembly rooms as examples of use type A2, speech and presentation.')],
      ['Lectures and presentations, inclusive', A2I_LECT],
      ['Dining and socialising', dinB('B3', '0.20', 'dining rooms')],
    ],
    'Exhibition hall': [['Exhibitions and circulation', dinB('B2', '0.15', 'exhibition rooms (B3 when interactive or noisy)')]],
    'Showroom': [
      ['Exhibitions and circulation', dinB('B2', '0.15', 'exhibition rooms (B3 when interactive or noisy)')],
      ['Reception and service desk', dinB('B4', '0.25', 'reception and counter areas with a permanent workplace')],
    ],
    'Retail store': [['Sales and customer service', dinB('B3', '0.20', 'sales rooms')]],
    'Shopping mall common area': [['Circulation and shopping', dinB('B2', '0.15', 'entrance halls and circulation areas with places to stay')]],
    'Monitoring / control centre': [['Monitoring and control work', dinB('B5', '0.30', 'control centres and security centres')]],
    'Workshop': [['Workshop and manual work', dinB('B5', '0.30', 'workshops and other work rooms with a lot of noise')]],
    'Warehouse': [['Storage and logistics', NONE.warehouse]],
    'Living room': [['Living and relaxing', NONE.dwelling], ['Film and TV viewing', NONE.dwelling]],
    'Bedroom': [['Sleeping and relaxing', NONE.dwelling]],
    'Home theatre': [['Film and TV viewing', NONE.dwelling]],
    'Home office': [['Remote work and calls', NONE.dwelling]],
    'Council chamber / courtroom': [['Formal proceedings and debate', A2_CIVIC], ['Formal proceedings, inclusive', A2I_CIVIC]],
    'Airport / railway waiting hall': [['Waiting and announcements', dinB('B2', '0.15', 'counter halls and entrance halls with waiting areas')]],
    'Phone booth / focus pod': [['Calls and focused work', NONE.booth]],
  };

  /* Checked and not used for targets (docs/TARGET-CRITERIA.md has the details and sources). */
  const NOT_USED = {
    is2526: { short: 'IS 2526:1963', title: 'IS 2526:1963 Code of practice for acoustical design of auditoriums and conference halls (BIS, reaffirmed)', reason: 'The optimum reverberation time is given only as curves in a graph (Fig. 1, 500 Hz), with no table or formula.' },
    bb93: { short: 'BB93 (2015)', title: 'Building Bulletin 93, Acoustic design of schools: performance standards (Department for Education, England, February 2015)', reason: 'Verified, but it applies to school buildings in England and depends on new build or refurbishment; the app follows DIN 18041 for teaching rooms.' },
    ansiS1260: { short: 'ANSI/ASA S12.60', title: 'ANSI/ASA S12.60 Part 1, classroom acoustics', reason: 'The 2010 edition is superseded by ASA/ANSI S12.60-2026/Part 1, whose values could not be read.' },
    iso23591: { short: 'ISO 23591:2021', title: 'ISO 23591:2021 Acoustic quality criteria for music rehearsal rooms and spaces', reason: 'Its tables (the criteria) could not be read from any free source.' },
    iso22955: { short: 'ISO 22955:2021', title: 'ISO 22955:2021 Acoustic quality of open office spaces', reason: 'Its per-space tables could not be read; only one value was seen, in a secondary source.' },
    htm0801: { short: 'HTM 08-01 (2013)', title: 'Health Technical Memorandum 08-01 Acoustics (Department of Health, England, 2013)', reason: 'Sets a minimum absorption (Class C over at least 80 % of the floor area), not a reverberation time.' },
    fgi2010: { short: 'FGI Guidelines (2010)', title: 'FGI Guidelines for Design and Construction of Health Care Facilities, 2010', reason: 'Sets room-average absorption coefficients, not reverberation times; the current edition could not be read.' },
    who1999: { short: 'WHO 1999', title: 'WHO Guidelines for Community Noise (1999)', reason: 'Gives about 0.6 s for classrooms and below 1 s for school halls, with no frequency band or room condition.' },
    iso16283: { short: 'ISO 16283-1', title: 'ISO 16283-1, field measurement of sound insulation', reason: 'Its 0.5 s is the reference reverberation time used to normalise sound-insulation results, not a design target.' },
  };

  AM.targetData = { REFERENCES, CRITERIA, USES, CATEGORIES, NOT_USED };
})(window.AM);
