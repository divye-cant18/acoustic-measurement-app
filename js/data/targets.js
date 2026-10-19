/* RT60 target data: the published criteria, which criterion each room use follows, and the constants the
   recommendation needs. AM.services.target reads this; nothing here is shown or calculated by the UI directly.

   To refine a recommendation, edit this file: add a source, add a criterion, or point a room use at another
   criterion. Values are taken from the sources named; where a room is matched to a criterion by judgement
   rather than by the source's own examples, the use is marked `interpretation` and says why. */
(function (AM) {
  'use strict';

  const SOURCES = {
    din18041: { short: 'DIN 18041:2016', title: 'DIN 18041:2016-03, Acoustic quality in rooms: specifications and instructions for room acoustic design' },
    ansi: { short: 'ANSI/ASA S12.60-2010', title: 'ANSI/ASA S12.60-2010 Part 1, Acoustical performance criteria, design requirements and guidelines for schools' },
    ebu: { short: 'EBU Tech 3276 / ITU-R BS.1116', title: 'EBU Tech 3276 and ITU-R BS.1116, listening conditions for the assessment of sound programme material' },
    iso16283: { short: 'ISO 16283-1', title: 'ISO 16283-1, field measurement of sound insulation: reference reverberation time of furnished dwellings' },
  };

  /* Criteria.
       din-a      DIN 18041 group A. T_soll = k·lg(V) + c within [vMin, vMax], for the room in use (80 % occupied).
                  Tolerance 0.8–1.2 × T_soll from 250 Hz to 2 kHz.
       din-b      DIN 18041 group B. Recommended A/V ≥ avMin for room heights up to 2.5 m, and
                  A/V ≥ 1 / (c + 4.69·lg h) above 2.5 m. Only an upper limit on RT60 (T = 0.163·V/A).
       listening  Reference listening room. Tm = 0.25·(V/100 m³)^(1/3), kept within 0.2–0.4 s, tolerance ±0.05 s.
       fixed      A single reference value. */
  const CRITERIA = {
    A1: { kind: 'din-a', source: 'din18041', name: 'Group A1, music', k: 0.45, c: 0.07, vMin: 30, vMax: 1000 },
    A2: { kind: 'din-a', source: 'din18041', name: 'Group A2, speech and presentations', k: 0.37, c: -0.14, vMin: 50, vMax: 5000 },
    A3: { kind: 'din-a', source: 'din18041', name: 'Group A3, teaching and communication', k: 0.32, c: -0.17, vMin: 30, vMax: 5000 },
    A4: { kind: 'din-a', source: 'din18041', name: 'Group A4, inclusive teaching and communication', k: 0.26, c: -0.14, vMin: 30, vMax: 500 },
    A5: { kind: 'din-a', source: 'din18041', name: 'Group A5, sport', k: 0.75, c: -1.00, vMin: 200, vMax: 10000, above: 2.0 },
    B2: { kind: 'din-b', source: 'din18041', name: 'Group B2, short stays', avMin: 0.15, c: 4.80, vMax: 5000 },
    B3: { kind: 'din-b', source: 'din18041', name: 'Group B3, longer stays', avMin: 0.20, c: 3.13, vMax: 5000 },
    B4: { kind: 'din-b', source: 'din18041', name: 'Group B4, workrooms', avMin: 0.25, c: 2.13, vMax: 5000 },
    B5: { kind: 'din-b', source: 'din18041', name: 'Group B5, rooms with special need for noise reduction', avMin: 0.30, c: 1.47, vMax: 5000 },
    LISTEN: { kind: 'listening', source: 'ebu', name: 'Reference listening room', v0: 100, base: 0.25, lo: 0.2, hi: 0.4, tol: 0.05 },
    HOME: { kind: 'fixed', source: 'iso16283', name: 'Furnished dwelling reference', value: 0.5 },
  };

  /* Room uses. Each follows one criterion; `why` is shown to the user as the reason. */
  const USES = {
    'Meetings and presentations': { criterion: 'A3', why: 'DIN 18041 places meeting, seminar and conference rooms in group A3, teaching and communication.' },
    'Video calls and hybrid meetings': { criterion: 'A4', interpretation: true, why: 'Microphones pick up reverberation that people in the room hardly notice, and remote listeners hear it on top of their own room. The stricter A4 curve, which DIN 18041 sets for listeners with a greater need for clear speech, is applied as an engineering interpretation.' },
    'Lectures and presentations': { criterion: 'A2', why: 'One person speaking to an audience over a longer distance follows DIN 18041 group A2, speech and presentations.' },
    'Teaching': { criterion: 'A3', why: 'DIN 18041 places classrooms and other teaching rooms in group A3, teaching and communication.' },
    'Inclusive teaching': { criterion: 'A4', why: 'DIN 18041 group A4 applies where learners are hearing-impaired, learn in a second language or are taught inclusively.' },
    'Music rehearsal and performance': { criterion: 'A1', why: 'DIN 18041 group A1 covers rooms for music, which need more reverberation than rooms for speech.' },
    'Recording': { criterion: 'A1', interpretation: true, why: 'No standard sets an RT60 for recording rooms. DIN 18041 group A1, music, is used as the closest reference. Studios often vary it on purpose.' },
    'Mixing and critical listening': { criterion: 'LISTEN', why: 'EBU Tech 3276 and ITU-R BS.1116 set the reverberation of reference listening rooms from their volume.' },
    'Film and TV viewing': { criterion: 'LISTEN', interpretation: true, why: 'A home cinema plays back recorded sound, as a listening room does, so the EBU Tech 3276 listening-room criterion is used as the closest reference.' },
    'Film screening': { criterion: 'LISTEN', interpretation: true, why: 'No cinema criterion is in the data yet. A cinema plays back recorded sound, so the listening-room criterion is used, with its 0.4 s upper value for larger rooms. Replace it when a cinema criterion is added.' },
    'Sport and exercise': { criterion: 'A5', why: 'DIN 18041 group A5 covers sports halls.' },
    'Dining and socialising': { criterion: 'B3', why: 'DIN 18041 lists dining rooms and canteens in group B3, rooms for longer stays.' },
    'Events and assemblies': { criterion: 'A2', why: 'Speeches and announcements to a gathered audience follow DIN 18041 group A2, speech and presentations.' },
    'Focused desk work': { criterion: 'B4', why: 'DIN 18041 lists single and multi-person offices in group B4, workrooms.' },
    'Reception and service desk': { criterion: 'B4', why: 'DIN 18041 lists reception and counter areas in group B4, workrooms.' },
    'Waiting and arrival': { criterion: 'B2', why: 'DIN 18041 lists entrance halls and reception areas with waiting zones in group B2, short stays.' },
    'Reading and study': { criterion: 'B3', why: 'DIN 18041 lists libraries in group B3, rooms for longer stays.' },
    'Exhibitions and circulation': { criterion: 'B2', why: 'DIN 18041 lists exhibition rooms in group B2, short stays.' },
    'Patient care and rest': { criterion: 'B3', why: 'DIN 18041 lists patient bedrooms in group B3, rooms for longer stays.' },
    'Consultation and treatment': { criterion: 'B3', why: 'DIN 18041 lists treatment rooms in group B3, rooms for longer stays.' },
    'Therapy and group sessions': { criterion: 'A3', why: 'Group sessions rely on speech between several people, so they follow DIN 18041 group A3, teaching and communication.' },
    'Spoken services': { criterion: 'A2', why: 'Speech to a congregation follows DIN 18041 group A2, speech and presentations.' },
    'Services with music and singing': { criterion: 'A1', why: 'Music and singing follow DIN 18041 group A1, music.' },
    'Living and relaxing': { criterion: 'HOME', interpretation: true, why: 'No standard sets an RT60 for homes. ISO 16283-1 uses 0.5 s as the reverberation time of a furnished dwelling, so 0.5 s is used as the design value.' },
    'Sleeping and relaxing': { criterion: 'HOME', interpretation: true, why: 'No standard sets an RT60 for homes. ISO 16283-1 uses 0.5 s as the reverberation time of a furnished dwelling, so 0.5 s is used as the design value.' },
  };

  /* Room type → the uses offered in Room Setup, most common first (the first is the default).
     `checks` add criteria that also apply to that room type. */
  const SPEECH_ROOM = ['Meetings and presentations', 'Video calls and hybrid meetings'];
  const ROOMS = {
    'Conference room': { uses: SPEECH_ROOM },
    'Meeting room': { uses: SPEECH_ROOM },
    'Boardroom': { uses: SPEECH_ROOM },
    'Private office': { uses: ['Focused desk work', 'Meetings and presentations', 'Video calls and hybrid meetings'] },
    'Open-plan office': { uses: ['Focused desk work'] },
    'Reception area': { uses: ['Reception and service desk', 'Waiting and arrival'] },
    'Classroom': { uses: ['Teaching', 'Inclusive teaching'], checks: ['ansiClassroom'] },
    'Lecture hall': { uses: ['Lectures and presentations', 'Teaching', 'Inclusive teaching'], checks: ['ansiClassroom'] },
    'Library': { uses: ['Reading and study'] },
    'Music room': { uses: ['Music rehearsal and performance'] },
    'Sports hall': { uses: ['Sport and exercise'] },
    'Restaurant': { uses: ['Dining and socialising'] },
    'Café': { uses: ['Dining and socialising'] },
    'Bar': { uses: ['Dining and socialising'] },
    'Banquet hall': { uses: ['Dining and socialising', 'Events and assemblies'] },
    'Hotel lobby': { uses: ['Waiting and arrival'] },
    'Consultation room': { uses: ['Consultation and treatment'] },
    'Waiting area': { uses: ['Waiting and arrival'] },
    'Patient room': { uses: ['Patient care and rest'] },
    'Therapy room': { uses: ['Therapy and group sessions', 'Consultation and treatment'] },
    'Living room': { uses: ['Living and relaxing', 'Film and TV viewing'] },
    'Bedroom': { uses: ['Sleeping and relaxing'] },
    'Home theatre': { uses: ['Film and TV viewing'] },
    'Home studio': { uses: ['Mixing and critical listening', 'Recording'] },
    'Recording studio': { uses: ['Recording', 'Mixing and critical listening'] },
    'Control room': { uses: ['Mixing and critical listening'] },
    'Cinema': { uses: ['Film screening'] },
    'Auditorium': { uses: ['Lectures and presentations', 'Music rehearsal and performance'] },
    'Place of worship': { uses: ['Spoken services', 'Services with music and singing'] },
    'Community hall': { uses: ['Events and assemblies', 'Sport and exercise', 'Dining and socialising'] },
    'Exhibition hall': { uses: ['Exhibitions and circulation'] },
    'Gymnasium': { uses: ['Sport and exercise'] },
    // Added with the industry list of 2026-10-19. Each offers only uses above, so it follows one of their criteria.
    'Training room': { uses: ['Teaching', 'Meetings and presentations', 'Video calls and hybrid meetings', 'Inclusive teaching'] },
    'Rehearsal room': { uses: ['Music rehearsal and performance'] },
    'Showroom': { uses: ['Exhibitions and circulation', 'Reception and service desk'] },
    // No criterion in the data names these rooms: the user chooses the main activity, as for "Other".
    'Retail store': { uses: Object.keys(USES) },
    'Workshop': { uses: Object.keys(USES) },
    'Warehouse': { uses: Object.keys(USES) },
    // A room type the user names: every activity is offered, and the target follows the one chosen.
    'Other': { uses: Object.keys(USES) },
  };

  /* Additional criteria for some room types. ANSI/ASA S12.60: maximum RT60 in unoccupied, furnished
     core learning spaces, 0.6 s up to 283 m³ and 0.7 s up to 566 m³ (no limit above). */
  const CHECKS = {
    ansiClassroom: { source: 'ansi', label: 'ANSI/ASA S12.60 classroom limit', state: 'unoccupied, furnished', limits: [{ vMax: 283, max: 0.6 }, { vMax: 566, max: 0.7 }] },
  };

  const CONSTANTS = {
    SABINE: 0.163,             // T = 0.163·V/A, as used by DIN 18041
    TOLERANCE: [0.8, 1.2],     // DIN 18041 group A, 250 Hz–2 kHz
    OCCUPIED_SHARE: 0.8,       // DIN 18041 group A targets apply with 80 % of the planned occupancy present
    /* Extra absorption per person present at 1 kHz. Typical published values for a seated adult are about
       0.4–0.6 m²; DIN 18041 Annex A gives values by seating and clothing. Replace with project data when known. */
    PERSON_ABSORPTION_M2: 0.5,
    MAX_PEOPLE_SHARE: 0.5,     // people may account for at most half of the in-use absorption (guards unrealistic occupancy)
  };

  AM.targetData = { SOURCES, CRITERIA, USES, ROOMS, CHECKS, CONSTANTS };
})(window.AM);
