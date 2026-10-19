/* Room Setup reference lists: what a surface is built from (its construction, the substrate), its visible finish, the
   equipment and obstructions on a wall, and the questions an industry adds. Descriptions only: nothing in this file
   has an acoustic value. Absorption comes only from the sourced library (js/data/materials.js); a construction and a
   finish narrow which of its entries are offered (services/surfaces.js), and where none fits, the surface simply has
   no absorption value: never a guessed one. A construction or finish that is not listed is typed in by the user
   ("Other / not listed") and kept with the room, with its properties left unspecified. */
(function (AM) {
  'use strict';

  /* Constructions: what the wall, floor or ceiling is built from. kinds: the surfaces it is offered for. */
  const CONSTRUCTIONS = [
    { id: 'concrete', name: 'Concrete or reinforced concrete', kinds: ['wall', 'floor', 'ceiling'] },
    { id: 'masonry', name: 'Brick, block or stone masonry', kinds: ['wall'] },
    { id: 'plasterboard', name: 'Plasterboard, gypsum board or partition system', kinds: ['wall', 'ceiling'] },
    { id: 'lath', name: 'Lath and plaster', kinds: ['wall', 'ceiling'] },
    { id: 'timber', name: { wall: 'Wood, plywood or timber boards', floor: 'Timber floor on joists or battens', ceiling: 'Timber boards or joists' }, kinds: ['wall', 'floor', 'ceiling'] },
    { id: 'metal', name: 'Metal sheet, cladding or deck', kinds: ['wall', 'ceiling'] },
    { id: 'glass', name: 'Glass or glazed partition', kinds: ['wall'] },
    { id: 'fabric-system', name: 'Fabric-covered wall system', kinds: ['wall'] },
    { id: 'acoustic-system', name: 'Existing acoustic panel system', kinds: ['wall', 'ceiling'] },
    { id: 'suspended', name: 'Suspended ceiling grid', kinds: ['ceiling'] },
    { id: 'access-floor', name: 'Raised access floor', kinds: ['floor'] },
    { id: 'other', name: 'Other / not listed', kinds: ['wall', 'floor', 'ceiling'] },
  ];

  /* Visible finishes: what the surface shows on the room side. */
  const FINISHES = [
    { id: 'exposed', name: { wall: 'Exposed, no finish', floor: 'Bare or polished, no covering', ceiling: 'Exposed, no finish' }, kinds: ['wall', 'floor', 'ceiling'] },
    { id: 'painted', name: 'Painted', kinds: ['wall', 'ceiling'] },
    { id: 'plaster', name: 'Plastered (bare or painted)', kinds: ['wall', 'ceiling'] },
    { id: 'render', name: 'Rendered', kinds: ['wall'] },
    { id: 'wallpaper', name: 'Wallpaper', kinds: ['wall'] },
    { id: 'tiles', name: { wall: 'Tiles, stone or marble', floor: 'Tiles, stone, marble or terrazzo' }, kinds: ['wall', 'floor'] },
    { id: 'wood', name: { wall: 'Wood panelling or boards', floor: 'Wood boards or parquet', ceiling: 'Wood boards or lining' }, kinds: ['wall', 'floor', 'ceiling'] },
    { id: 'wood-acoustic', name: 'Slotted or perforated wood', kinds: ['wall'] },
    { id: 'cork', name: 'Cork', kinds: ['wall'] },
    { id: 'fabric', name: 'Fabric or felt covering', kinds: ['wall'] },
    { id: 'curtain', name: 'Curtains or drapes', kinds: ['wall'] },
    { id: 'acoustic', name: 'Acoustic panels or absorbers', kinds: ['wall', 'ceiling'] },
    { id: 'ceiling-tiles', name: 'Acoustic ceiling tiles', kinds: ['ceiling'] },
    { id: 'perforated-metal', name: 'Perforated metal', kinds: ['ceiling'] },
    { id: 'perforated-board', name: 'Perforated plasterboard', kinds: ['ceiling'] },
    { id: 'carpet', name: 'Carpet', kinds: ['floor'] },
    { id: 'carpet-tiles', name: 'Carpet tiles', kinds: ['floor'] },
    { id: 'vinyl', name: 'Vinyl or linoleum', kinds: ['floor'] },
    { id: 'rubber', name: 'Rubber or cork tiles', kinds: ['floor'] },
    { id: 'other', name: 'Other / not listed', kinds: ['wall', 'floor', 'ceiling'] },
  ];

  /* The finishes each construction can carry, per kind of surface ('other' construction: every finish of that kind). */
  const FITS = {
    wall: {
      concrete: ['exposed', 'painted', 'plaster', 'wallpaper', 'tiles', 'wood', 'wood-acoustic', 'cork', 'fabric', 'curtain', 'acoustic', 'other'],
      masonry: ['exposed', 'painted', 'plaster', 'render', 'wallpaper', 'tiles', 'wood', 'wood-acoustic', 'cork', 'fabric', 'curtain', 'acoustic', 'other'],
      plasterboard: ['painted', 'wallpaper', 'tiles', 'wood', 'wood-acoustic', 'fabric', 'curtain', 'acoustic', 'other'],
      lath: ['plaster', 'wallpaper', 'other'],
      timber: ['wood', 'painted', 'wood-acoustic', 'fabric', 'curtain', 'acoustic', 'other'],
      metal: ['exposed', 'painted', 'acoustic', 'other'],
      glass: ['exposed', 'curtain', 'other'],
      'fabric-system': ['fabric', 'other'],
      'acoustic-system': ['acoustic', 'fabric', 'other'],
    },
    floor: {
      concrete: ['exposed', 'carpet', 'carpet-tiles', 'vinyl', 'rubber', 'wood', 'tiles', 'other'],
      timber: ['wood', 'carpet', 'vinyl', 'other'],
      'access-floor': ['exposed', 'carpet-tiles', 'other'],
    },
    ceiling: {
      concrete: ['exposed', 'painted', 'plaster', 'wood', 'acoustic', 'other'],
      plasterboard: ['painted', 'perforated-board', 'acoustic', 'other'],
      lath: ['plaster', 'other'],
      timber: ['wood', 'painted', 'acoustic', 'other'],
      metal: ['exposed', 'painted', 'perforated-metal', 'acoustic', 'other'],
      suspended: ['ceiling-tiles', 'perforated-metal', 'perforated-board', 'other'],
      'acoustic-system': ['acoustic', 'other'],
    },
  };

  /* Which construction(s) and finish(es) a library entry describes, from its family and wording. Used only to offer
     the entries that fit what the user chose; an entry that fits none is still offered when the construction is not
     chosen or is "Other". { c: construction ids, f: finish ids } */
  const ANY = ['concrete', 'masonry', 'plasterboard', 'lath', 'timber', 'metal', 'glass', 'fabric-system', 'acoustic-system', 'suspended'];
  function classify(family, variant, kind) {
    const v = String(variant || '').toLowerCase(), painted = /paint|glazed|lime wash/.test(v);
    switch (family) {
      case 'Brick': return { c: ['masonry'], f: [/render/.test(v) ? 'render' : painted ? 'painted' : 'exposed'] };
      case 'Concrete block': return { c: ['masonry'], f: [painted ? 'painted' : 'exposed'] };
      case 'Stone and lime finishes': return { c: ['masonry'], f: [/lime wash/.test(v) ? 'painted' : 'exposed'] };
      case 'Tiles and marble': return { c: ['concrete', 'masonry', 'plasterboard'], f: ['tiles'] };
      case 'Plaster': return { c: /lath/.test(v) ? ['lath'] : ['masonry', 'concrete'], f: /wallpaper/.test(v) ? ['wallpaper'] : /fair-faced/.test(v) ? ['exposed', 'plaster'] : ['plaster'] };
      case 'Plasterboard': return { c: ['plasterboard'], f: ['painted'] };
      case 'Concrete':
        if (kind === 'floor') return { c: ['concrete'], f: ['exposed'] };
        return { c: /fair-faced concrete or plastered/.test(v) ? ['concrete', 'masonry'] : ['concrete'], f: /fair-faced/.test(v) ? ['exposed', 'plaster'] : [painted ? 'painted' : 'exposed'] };
      case 'Timber and board linings': return { c: kind === 'ceiling' ? ['timber', 'concrete'] : ['timber', 'concrete', 'masonry', 'plasterboard'], f: [painted ? 'painted' : 'wood'] };
      case 'Slotted and perforated wood': return { c: ['timber', 'concrete', 'masonry', 'plasterboard'], f: ['wood-acoustic'] };
      case 'Cork': return { c: ['concrete', 'masonry'], f: ['cork'] };
      case 'Glass': return { c: ['glass'], f: ['exposed'] };
      case 'Curtains and drapes': return { c: ANY, f: ['curtain'] };
      case 'Fabric and felt': return { c: ANY, f: ['fabric'] };
      case 'Acoustic panels and absorbers': return { c: ANY, f: ['acoustic'] };
      case 'Metal': return { c: ['metal'], f: ['exposed'] };
      case 'Acoustic ceiling tiles': return { c: ['suspended'], f: ['ceiling-tiles'] };
      case 'Perforated metal ceiling': return { c: ['suspended', 'metal'], f: ['perforated-metal'] };
      case 'Perforated plasterboard': return { c: ['suspended', 'plasterboard'], f: ['perforated-board'] };
      case 'Carpet': return { c: /wood floor|wooden/.test(v) ? ['timber'] : /concrete/.test(v) ? ['concrete'] : ['concrete', 'timber'], f: ['carpet'] };
      case 'Carpet tiles': return { c: ['concrete', 'access-floor'], f: ['carpet-tiles'] };
      case 'Stone, marble and tiles': return { c: ['concrete'], f: ['tiles'] };
      case 'Linoleum and vinyl': return { c: ['concrete'], f: /parquet/.test(v) ? ['vinyl', 'wood'] : ['vinyl'] };
      case 'Rubber and cork': return { c: ['concrete'], f: ['rubber'] };
      case 'Timber floor': return { c: ['timber'], f: ['wood'] };
      case 'Parquet': return { c: ['concrete', 'timber'], f: ['wood'] };
      case 'Raised access floor': return { c: ['access-floor'], f: [/carpet/.test(v) ? 'carpet-tiles' : 'exposed'] };
      default: return { c: [], f: [] };
    }
  }

  /* What is on a wall, ticked per wall: recorded for the recommendations, with no sizes asked. Nothing here decides a
     treatment's thickness or performance, and the area free for treatment is not reduced by it. */
  const EQUIPMENT = [
    { id: 'ac', name: 'Air conditioner' }, { id: 'speaker', name: 'Speaker' }, { id: 'display', name: 'Display or screen' },
    { id: 'electrical', name: 'Electrical fixtures' }, { id: 'services', name: 'Pipes or cable tray' }, { id: 'other', name: 'Other' },
  ];

  /* Questions an industry (and sometimes a room type) adds. All optional, recorded for later recommendations; none
     changes the target or a measurement. kind: 'int' | 'choice' | 'multi'. */
  const I = {
    corporate: 'Corporate offices and meeting rooms', education: 'Education and training facilities', studios: 'Recording and music studios',
    hospitality: 'Hospitality and restaurants', healthcare: 'Healthcare facilities', auditoriums: 'Auditoriums and performance spaces',
    industrial: 'Industrial and commercial facilities', residential: 'Residential spaces',
  };
  const QUESTIONS = [
    { id: 'seats', label: 'Seats or places the room is laid out for', kind: 'int', industries: [I.corporate, I.education, I.hospitality, I.auditoriums] },
    { id: 'calls', label: 'Video calls in this room', kind: 'choice', options: ['Often', 'Sometimes', 'Never'], industries: [I.corporate, I.education],
      types: ['Conference room', 'Meeting room', 'Boardroom', 'Private office', 'Training room', 'Classroom', 'Lecture hall'] },
    { id: 'hearing', label: 'Learners with hearing needs, or learning in a second language', kind: 'choice', options: ['Yes', 'No', 'Not sure'], industries: [I.education],
      hint: 'If yes, “Inclusive teaching” as the main activity gives the stricter target made for this.' },
    { id: 'studioRole', label: 'The room’s role in the studio', kind: 'choice', options: ['Live or recording room', 'Control or mixing room', 'Vocal or instrument booth', 'Rehearsal room', 'Several of these'], industries: [I.studios] },
    { id: 'monitoring', label: 'How sound is listened to', kind: 'choice', options: ['Near-field speakers', 'Main or far-field speakers', 'Mostly headphones'], industries: [I.studios] },
    { id: 'music', label: 'Music in the room', kind: 'choice', options: ['None', 'Background music', 'Live music'], industries: [I.hospitality] },
    { id: 'kitchen', label: 'Open kitchen or bar counter in the room', kind: 'choice', options: ['Yes', 'No'], industries: [I.hospitality] },
    { id: 'privacy', label: 'Conversations must not be overheard', kind: 'choice', options: ['Yes', 'No'], industries: [I.healthcare, I.corporate],
      types: ['Consultation room', 'Patient room', 'Therapy room', 'Waiting area', 'Private office', 'Boardroom', 'Meeting room', 'Conference room'] },
    { id: 'hygiene', label: 'Surfaces must be wipe-clean or washable', kind: 'choice', options: ['Yes', 'No'], industries: [I.healthcare, I.hospitality] },
    { id: 'sound', label: 'Sound system', kind: 'choice', options: ['Amplified', 'Natural, unamplified', 'Both'], industries: [I.auditoriums] },
    { id: 'noise', label: 'Main noise sources', kind: 'multi', options: ['Machinery', 'Ventilation or plant', 'Vehicles', 'People and customers', 'Music or announcements'], industries: [I.industrial] },
    { id: 'homeAudio', label: 'Sound equipment in the room', kind: 'multi', options: ['TV or home cinema', 'Hi-fi', 'Musical instruments'], industries: [I.residential] },
  ];

  /* Constructions and finishes most often met in an industry: offered first, the rest after them. */
  const COMMON = {
    [I.studios]: { c: ['masonry', 'plasterboard', 'timber', 'acoustic-system', 'fabric-system'], f: ['acoustic', 'fabric', 'wood-acoustic', 'curtain', 'carpet', 'ceiling-tiles'] },
    [I.auditoriums]: { c: ['concrete', 'masonry', 'plasterboard', 'timber', 'acoustic-system'], f: ['acoustic', 'wood', 'wood-acoustic', 'fabric', 'curtain', 'carpet'] },
    [I.industrial]: { c: ['concrete', 'masonry', 'metal', 'glass'], f: ['exposed', 'painted', 'perforated-metal'] },
    [I.healthcare]: { c: ['plasterboard', 'concrete', 'masonry', 'suspended'], f: ['painted', 'vinyl', 'tiles', 'ceiling-tiles', 'rubber'] },
    [I.hospitality]: { c: ['plasterboard', 'concrete', 'masonry', 'glass', 'timber'], f: ['painted', 'plaster', 'wood', 'tiles', 'curtain', 'carpet'] },
    [I.corporate]: { c: ['plasterboard', 'glass', 'concrete', 'suspended', 'access-floor'], f: ['painted', 'exposed', 'carpet-tiles', 'ceiling-tiles', 'acoustic'] },
    [I.education]: { c: ['masonry', 'plasterboard', 'concrete', 'suspended'], f: ['painted', 'plaster', 'vinyl', 'ceiling-tiles', 'acoustic'] },
    [I.residential]: { c: ['masonry', 'plasterboard', 'timber', 'concrete'], f: ['painted', 'plaster', 'wallpaper', 'wood', 'carpet', 'curtain'] },
  };

  AM.roomFormData = { CONSTRUCTIONS, FINISHES, FITS, classify, EQUIPMENT, QUESTIONS, COMMON };
})(window.AM);
