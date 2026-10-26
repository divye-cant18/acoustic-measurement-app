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
    { id: 'mirror', name: 'Mirror', kinds: ['wall'] },
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
      concrete: ['exposed', 'painted', 'plaster', 'wallpaper', 'tiles', 'wood', 'wood-acoustic', 'cork', 'fabric', 'curtain', 'acoustic', 'mirror', 'other'],
      masonry: ['exposed', 'painted', 'plaster', 'render', 'wallpaper', 'tiles', 'wood', 'wood-acoustic', 'cork', 'fabric', 'curtain', 'acoustic', 'mirror', 'other'],
      plasterboard: ['painted', 'wallpaper', 'tiles', 'wood', 'wood-acoustic', 'fabric', 'curtain', 'acoustic', 'mirror', 'other'],
      lath: ['plaster', 'wallpaper', 'other'],
      timber: ['wood', 'painted', 'wood-acoustic', 'fabric', 'curtain', 'acoustic', 'other'],
      metal: ['exposed', 'painted', 'acoustic', 'other'],
      glass: ['exposed', 'curtain', 'mirror', 'other'],
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
    // Whole words: "unpainted" and "unglazed" are not painted.
    const v = String(variant || '').toLowerCase(), painted = /\bpainted\b|\bglazed\b|lime wash/.test(v);
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
      case 'Raised access floor': return { c: ['access-floor'], f: [/with carpet/.test(v) ? 'carpet-tiles' : 'exposed'] };
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

  /* What a wall, floor or ceiling is, in everyday words: the one question Room Setup asks about a surface. Each type
     stands for a construction and a finish (the lists above), and names the library entry used as its TYPICAL sound
     data (js/data/materials.js; never a value of its own): the entry that describes that type most closely, from a
     published table where one has all six bands. null: the library has no sourced data for it yet, so it is recorded
     as described and the treatment prediction treats it as unknown. Anyone who knows the exact build-up can still pick
     the exact library entry (Room Setup, "Exact type and sound data"). Names avoid sizes and trade terms. */
  const T = (id, name, hint, construction, finish, material) => ({ id, name, hint, construction, finish, material });
  const SURFACE_TYPES = {
    wall: [
      T('painted-plaster', 'Painted wall', 'Brick or block with plaster or putty, painted. The most common wall.', 'masonry', 'plaster', 'aua-painted-plaster-on-masonry'),
      T('gypsum-partition', 'Gypsum board partition (drywall)', 'Boards on a metal or wooden frame, usually painted. Sounds hollow when knocked.', 'plasterboard', 'painted', 'hall-gypsum-wallboard-1-2-in-on-studs'),
      T('glass', 'Glass wall or glass partition', 'Fixed glass panels, a glass partition or a full-height window wall.', 'glass', 'exposed', 'hall-heavy-plate-glass'),
      T('wood-panelling', 'Wood or laminate panelling', 'Plywood, veneer or laminate sheets fixed over the wall.', 'timber', 'wood', 'as-plywood-panelling-3-8-in'),
      T('fabric', 'Fabric-covered or upholstered wall', 'Fabric stretched over soft padding, or upholstered wall panels.', 'fabric-system', 'fabric', 'aua-muslin-covered-cotton-felt-25-mm'),
      T('acoustic-panels', 'Acoustic panels (already fitted)', 'Sound-absorbing panels already on the wall, e.g. fabric-wrapped or polyester fibre panels.', 'acoustic-system', 'acoustic', 'mfr-fabric-wrapped-fibreglass-panel-25-mm-type-a'),
      T('felt-panels', 'Acoustic felt or PET panels (already fitted)', 'Polyester (PET) felt panels already on the wall, often coloured, fixed flat.', 'acoustic-system', 'acoustic', 'mfr-autex-quietspace-panel-25-mm'),
      T('bass-absorber', 'Low-frequency absorbers (already fitted)', 'Deep absorbers with a bass layer, as in studios, music rooms and cinemas.', 'acoustic-system', 'acoustic', 'mfr-ecophon-akusto-wall-c-extra-bass-80-mm'),
      T('wood-slats', 'Wooden slats or grooved wood panels', 'Wood with slots, grooves or gaps, often an acoustic design feature.', 'timber', 'wood-acoustic', 'aua-acoustic-timber-wall-panelling'),
      T('wallpaper', 'Wallpaper', 'Paper or vinyl wallpaper on a plastered wall.', 'masonry', 'wallpaper', 'aua-plaster-on-masonry-with-wallpaper'),
      T('tiles-stone', 'Tiles, marble or stone cladding', 'Ceramic wall tiles, marble, granite or stone.', 'masonry', 'tiles', 'as-marble-or-glazed-tile'),
      T('bare-brick', 'Bare brick (no plaster)', 'Exposed brickwork.', 'masonry', 'exposed', 'as-brick-unglazed'),
      T('bare-concrete', 'Bare concrete', 'Exposed concrete, not plastered.', 'concrete', 'exposed', 'hall-concrete-poured'),
      T('block-painted', 'Concrete blocks, painted (no plaster)', 'Blockwork you can see, painted, as in many sports halls and plant rooms.', 'masonry', 'painted', 'hall-concrete-block-painted'),
      T('block-bare', 'Concrete blocks, bare', 'Unpainted, unplastered blockwork.', 'masonry', 'exposed', 'hall-concrete-block-unpainted'),
      T('cork', 'Cork or pin board', 'Notice boards and pin boards, or cork wall covering.', 'masonry', 'cork', 'aua-cork-board-25-mm-on-solid-backing'),
      T('curtains', 'Curtains or drapes', 'Fabric curtains hung along the wall.', '', 'curtain', 'aua-curtains-hung-in-folds-against-solid-wall'),
      T('mirror', 'Mirror wall', 'Large mirrors, e.g. in a gym or dance studio.', 'glass', 'mirror', null),
      T('metal-sheet', 'Metal sheet or cladding', 'Profiled or flat metal sheets, as in workshops and warehouses.', 'metal', 'exposed', null),
      T('other', 'Something else', 'Not in this list: type what it is.', '', 'other', null),
    ],
    floor: [
      T('vitrified-tiles', 'Vitrified or ceramic tiles', 'Glazed floor tiles: the most common hard floor.', 'concrete', 'tiles', 'aua-ceramic-tiles-smooth'),
      T('stone', 'Marble, granite or Kota stone', 'Stone slabs, polished or plain.', 'concrete', 'tiles', 'pra-marble-floor'),
      T('carpet', 'Carpet (wall to wall)', 'Fitted carpet over the whole floor.', 'concrete', 'carpet', 'hall-heavy-carpet-on-concrete'),
      T('carpet-tiles', 'Carpet tiles', 'Square carpet tiles, as in many offices.', 'concrete', 'carpet-tiles', 'mfr-carpet-tiles-11-mm-type-a-lab-audit-sample'),
      T('vinyl', 'Vinyl, linoleum or LVT', 'Thin plastic or lino sheet or planks glued to the floor.', 'concrete', 'vinyl', 'aua-linoleum-or-vinyl-stuck-to-concrete'),
      T('laminate', 'Laminate or wooden parquet', 'Wood-look laminate, engineered wood or parquet laid on concrete.', 'concrete', 'wood', 'ade-hard-floor-covering-lino-parquet-on-concrete'),
      T('wood-floor', 'Wooden floor on battens', 'Wooden boards on joists or battens, including sprung sports floors.', 'timber', 'wood', 'as-wood-floor'),
      T('concrete-floor', 'Concrete, IPS or epoxy floor', 'Bare, polished, painted or epoxy-coated concrete.', 'concrete', 'exposed', 'hall-concrete-poured'),
      T('sports-vinyl', 'Sports vinyl or cushioned floor', 'Cushioned vinyl, PU or rubber-backed sports flooring.', 'concrete', 'vinyl', 'aua-rubber-cork-lino-vinyl-underlay-stuck-to-con'),
      T('rubber', 'Rubber flooring', 'Rubber tiles or mats, as in gyms.', 'concrete', 'rubber', 'aua-rubber-floor-tiles-6-mm'),
      T('raised-floor', 'Raised floor, no carpet', 'Floor panels on legs with cables underneath.', 'access-floor', 'exposed', 'aua-raised-access-floor-no-carpet'),
      T('raised-floor-carpet', 'Raised floor with carpet tiles', 'Floor panels on legs, covered with carpet tiles.', 'access-floor', 'carpet-tiles', 'aua-raised-access-floor-with-carpet-tiles'),
      T('other', 'Something else', 'Not in this list: type what it is.', '', 'other', null),
    ],
    ceiling: [
      T('gypsum-ceiling', 'Gypsum or POP false ceiling', 'A smooth hung ceiling of gypsum board or plaster of Paris, painted.', 'plasterboard', 'painted', 'pra-plasterboard-ceiling-on-battens-large-air-sp'),
      T('grid-tiles', 'Grid ceiling with fibre tiles', 'Square soft tiles resting in a metal grid.', 'suspended', 'ceiling-tiles', 'pra-fissured-ceiling-tile'),
      T('hygiene-tiles', 'Hygiene or cleanable ceiling tiles', 'Washable tiles in a grid, as in clinics, labs and kitchens.', 'suspended', 'ceiling-tiles', 'mfr-rockfon-cleanspace-pro-20-mm-200-mm-plenum'),
      T('metal-tiles', 'Perforated metal ceiling tiles', 'Metal tiles or panels with small holes.', 'suspended', 'perforated-metal', 'pra-perforated-metal-ceiling-200-mm-cavity-miner'),
      T('perforated-gypsum', 'Perforated gypsum ceiling', 'Gypsum board with a pattern of small holes.', 'plasterboard', 'perforated-board', 'pra-perforated-gypsum-ceiling-300-mm-plenum'),
      T('plastered-slab', 'Plastered and painted slab', 'The concrete slab itself, plastered and painted, with no false ceiling.', 'concrete', 'plaster', 'ca-plaster-ceiling-smooth'),
      T('bare-slab', 'Bare concrete or open ceiling', 'Exposed concrete slab, often with ducts and pipes in view.', 'concrete', 'exposed', 'hall-concrete-poured'),
      T('wood-ceiling', 'Wooden ceiling', 'Wooden panels, planks or veneer.', 'timber', 'wood', 'sp-wood-ceiling'),
      T('metal-roof', 'Metal roof sheet (no ceiling)', 'The underside of a metal roof or deck, as in sports halls, factories and warehouses.', 'metal', 'exposed', 'aua-steel-decking'),
      T('acoustic-ceiling', 'Acoustic panels (already fitted)', 'Sound-absorbing panels already fixed to the ceiling.', 'acoustic-system', 'acoustic', 'mfr-fabric-wrapped-fibreglass-panel-25-mm-type-a'),
      T('other', 'Something else', 'Not in this list: type what it is.', '', 'other', null),
    ],
  };

  /* An existing covering over part of a surface (Room Setup, "Existing treatment or covering"): the types that can cover
     part of a surface, by kind. */
  const COVER_TYPES = {
    wall: ['acoustic-panels', 'felt-panels', 'bass-absorber', 'fabric', 'curtains', 'wood-slats', 'wood-panelling', 'cork', 'tiles-stone', 'wallpaper', 'mirror', 'other'],
    floor: ['carpet', 'carpet-tiles', 'vinyl', 'rubber', 'other'],
    ceiling: ['acoustic-ceiling', 'grid-tiles', 'wood-ceiling', 'metal-tiles', 'other'],
  };

  /* Doors and windows in everyday words, with the library entry used as typical data (null: none in the library). */
  const OPENING_TYPES = {
    door: [T('wood-door', 'Wooden door', '', '', '', 'pra-solid-wooden-door'), T('glass-door', 'Glass door', '', '', '', 'hall-heavy-plate-glass'), T('other-door', 'Other door (e.g. metal)', '', '', '', null)],
    window: [T('window', 'Window', 'An ordinary glass window.', '', '', 'hall-ordinary-window-glass'), T('double-window', 'Double-glazed window', 'Two layers of glass with a gap.', '', '', 'pra-double-glazing-2-3-mm-10-mm-gap'),
      T('glass-panel', 'Large glass panel or façade', 'Big panes of thick glass.', '', '', 'hall-heavy-plate-glass')],
    opening: [T('gap', 'Open doorway or gap', 'An opening with no door: it lets all sound through.', '', '', 'sabin-open-doorway-or-gap')],
  };

  /* The surface types most often met in each room type, most common first (offered first in Room Setup). A room type
     the user names ("Other") uses its industry's list. Descriptions only: they never change a value. */
  const L = (wall, floor, ceiling) => ({ wall, floor, ceiling });
  const P = {
    meeting: L(['painted-plaster', 'glass', 'gypsum-partition', 'wood-panelling', 'fabric', 'wood-slats', 'acoustic-panels', 'wallpaper'], ['carpet-tiles', 'carpet', 'vitrified-tiles', 'laminate', 'vinyl'], ['gypsum-ceiling', 'grid-tiles', 'wood-ceiling', 'perforated-gypsum', 'metal-tiles', 'acoustic-ceiling']),
    office: L(['painted-plaster', 'gypsum-partition', 'glass', 'wood-panelling', 'fabric', 'acoustic-panels'], ['carpet-tiles', 'carpet', 'vitrified-tiles', 'vinyl', 'laminate'], ['grid-tiles', 'gypsum-ceiling', 'metal-tiles', 'bare-slab', 'acoustic-ceiling']),
    openPlan: L(['painted-plaster', 'glass', 'gypsum-partition', 'wood-panelling', 'acoustic-panels'], ['raised-floor-carpet', 'carpet-tiles', 'vitrified-tiles', 'vinyl', 'raised-floor'], ['grid-tiles', 'bare-slab', 'metal-tiles', 'gypsum-ceiling', 'acoustic-ceiling']),
    reception: L(['painted-plaster', 'tiles-stone', 'wood-panelling', 'glass', 'wallpaper', 'wood-slats'], ['stone', 'vitrified-tiles', 'carpet-tiles', 'laminate'], ['gypsum-ceiling', 'wood-ceiling', 'grid-tiles', 'metal-tiles']),
    canteen: L(['painted-plaster', 'tiles-stone', 'glass', 'gypsum-partition', 'wood-panelling'], ['vitrified-tiles', 'vinyl', 'stone', 'concrete-floor'], ['grid-tiles', 'gypsum-ceiling', 'metal-tiles', 'bare-slab']),
    training: L(['painted-plaster', 'gypsum-partition', 'glass', 'cork', 'wood-panelling', 'fabric'], ['carpet-tiles', 'vitrified-tiles', 'vinyl', 'carpet', 'laminate'], ['grid-tiles', 'gypsum-ceiling', 'metal-tiles', 'plastered-slab']),
    classroom: L(['painted-plaster', 'cork', 'block-painted', 'gypsum-partition', 'glass', 'wood-panelling'], ['vitrified-tiles', 'stone', 'vinyl', 'concrete-floor', 'carpet-tiles'], ['plastered-slab', 'gypsum-ceiling', 'grid-tiles', 'bare-slab']),
    lecture: L(['painted-plaster', 'wood-panelling', 'wood-slats', 'fabric', 'acoustic-panels', 'curtains'], ['carpet', 'vinyl', 'vitrified-tiles', 'wood-floor', 'stone'], ['gypsum-ceiling', 'wood-ceiling', 'perforated-gypsum', 'plastered-slab', 'acoustic-ceiling']),
    library: L(['painted-plaster', 'wood-panelling', 'glass', 'gypsum-partition'], ['carpet', 'carpet-tiles', 'vinyl', 'vitrified-tiles'], ['grid-tiles', 'gypsum-ceiling', 'plastered-slab', 'metal-tiles']),
    music: L(['painted-plaster', 'wood-panelling', 'wood-slats', 'fabric', 'acoustic-panels', 'curtains'], ['wood-floor', 'carpet', 'vinyl', 'laminate'], ['gypsum-ceiling', 'wood-ceiling', 'acoustic-ceiling', 'perforated-gypsum', 'grid-tiles']),
    sports: L(['block-painted', 'block-bare', 'painted-plaster', 'bare-brick', 'metal-sheet', 'mirror'], ['wood-floor', 'sports-vinyl', 'rubber', 'concrete-floor'], ['metal-roof', 'bare-slab', 'acoustic-ceiling', 'gypsum-ceiling']),
    gym: L(['painted-plaster', 'mirror', 'block-painted', 'glass', 'wood-panelling'], ['rubber', 'wood-floor', 'sports-vinyl', 'vinyl'], ['gypsum-ceiling', 'bare-slab', 'metal-roof', 'grid-tiles', 'acoustic-ceiling']),
    studio: L(['acoustic-panels', 'fabric', 'wood-slats', 'gypsum-partition', 'painted-plaster', 'curtains'], ['wood-floor', 'carpet', 'laminate', 'vinyl'], ['acoustic-ceiling', 'gypsum-ceiling', 'wood-ceiling', 'perforated-gypsum']),
    homeStudio: L(['painted-plaster', 'acoustic-panels', 'fabric', 'wood-slats', 'curtains', 'gypsum-partition'], ['laminate', 'vitrified-tiles', 'carpet', 'wood-floor'], ['plastered-slab', 'gypsum-ceiling', 'acoustic-ceiling', 'wood-ceiling']),
    restaurant: L(['painted-plaster', 'bare-brick', 'wood-panelling', 'tiles-stone', 'wallpaper', 'glass', 'bare-concrete'], ['vitrified-tiles', 'stone', 'laminate', 'wood-floor', 'concrete-floor', 'vinyl'], ['gypsum-ceiling', 'bare-slab', 'wood-ceiling', 'grid-tiles', 'metal-tiles']),
    banquet: L(['painted-plaster', 'wallpaper', 'fabric', 'wood-panelling', 'curtains', 'tiles-stone', 'mirror'], ['carpet', 'stone', 'vitrified-tiles', 'wood-floor'], ['gypsum-ceiling', 'wood-ceiling', 'plastered-slab', 'grid-tiles']),
    lobby: L(['tiles-stone', 'painted-plaster', 'wood-panelling', 'glass', 'wallpaper', 'wood-slats'], ['stone', 'vitrified-tiles', 'carpet'], ['gypsum-ceiling', 'wood-ceiling', 'grid-tiles', 'metal-tiles']),
    health: L(['painted-plaster', 'gypsum-partition', 'tiles-stone', 'glass'], ['vinyl', 'vitrified-tiles', 'stone'], ['grid-tiles', 'gypsum-ceiling', 'metal-tiles', 'plastered-slab']),
    therapy: L(['painted-plaster', 'gypsum-partition', 'fabric', 'wood-panelling'], ['vinyl', 'carpet-tiles', 'laminate', 'vitrified-tiles'], ['grid-tiles', 'gypsum-ceiling', 'acoustic-ceiling']),
    auditorium: L(['painted-plaster', 'wood-panelling', 'wood-slats', 'fabric', 'acoustic-panels', 'curtains'], ['carpet', 'wood-floor', 'vinyl', 'vitrified-tiles'], ['gypsum-ceiling', 'wood-ceiling', 'perforated-gypsum', 'acoustic-ceiling', 'plastered-slab']),
    cinema: L(['fabric', 'acoustic-panels', 'wood-slats', 'curtains', 'gypsum-partition', 'painted-plaster'], ['carpet', 'vinyl', 'vitrified-tiles'], ['gypsum-ceiling', 'acoustic-ceiling', 'perforated-gypsum', 'bare-slab']),
    worship: L(['painted-plaster', 'tiles-stone', 'wood-panelling', 'bare-brick', 'glass'], ['stone', 'vitrified-tiles', 'carpet', 'wood-floor'], ['plastered-slab', 'wood-ceiling', 'gypsum-ceiling', 'bare-slab']),
    community: L(['painted-plaster', 'block-painted', 'wood-panelling', 'curtains', 'glass'], ['vitrified-tiles', 'wood-floor', 'vinyl', 'stone', 'concrete-floor'], ['gypsum-ceiling', 'metal-roof', 'plastered-slab', 'grid-tiles']),
    exhibition: L(['painted-plaster', 'gypsum-partition', 'glass', 'bare-concrete', 'wood-panelling'], ['vitrified-tiles', 'concrete-floor', 'stone', 'carpet-tiles', 'vinyl'], ['bare-slab', 'gypsum-ceiling', 'grid-tiles', 'metal-roof', 'metal-tiles']),
    retail: L(['painted-plaster', 'glass', 'gypsum-partition', 'wood-panelling', 'tiles-stone', 'mirror'], ['vitrified-tiles', 'stone', 'laminate', 'vinyl', 'concrete-floor'], ['gypsum-ceiling', 'grid-tiles', 'bare-slab', 'metal-tiles']),
    industrial: L(['block-bare', 'block-painted', 'bare-brick', 'metal-sheet', 'bare-concrete', 'painted-plaster'], ['concrete-floor', 'vitrified-tiles', 'rubber'], ['metal-roof', 'bare-slab', 'gypsum-ceiling']),
    home: L(['painted-plaster', 'wallpaper', 'wood-panelling', 'curtains', 'tiles-stone', 'glass'], ['vitrified-tiles', 'stone', 'laminate', 'wood-floor', 'carpet'], ['plastered-slab', 'gypsum-ceiling', 'wood-ceiling']),
    homeTheatre: L(['fabric', 'acoustic-panels', 'wood-slats', 'curtains', 'painted-plaster', 'wood-panelling'], ['carpet', 'laminate', 'wood-floor', 'vitrified-tiles'], ['gypsum-ceiling', 'acoustic-ceiling', 'wood-ceiling', 'perforated-gypsum']),
    // Added 26 October 2026 from the Room Material Matrix of the Vicoustic room list (Vicoustic_Advisor_Room_Materials_and_Types.xlsx).
    booth: L(['felt-panels', 'fabric', 'wood-panelling'], ['carpet', 'rubber', 'vinyl'], ['acoustic-ceiling', 'perforated-gypsum']),
    computerLab: L(['gypsum-partition', 'painted-plaster', 'glass', 'cork'], ['vinyl', 'carpet-tiles'], ['grid-tiles', 'gypsum-ceiling']),
    schoolHall: L(['block-painted', 'painted-plaster', 'bare-concrete', 'wood-panelling', 'wood-slats'], ['sports-vinyl', 'wood-floor', 'stone'], ['perforated-gypsum', 'acoustic-ceiling', 'metal-tiles']),
    eventRoom: L(['painted-plaster', 'glass', 'wood-panelling', 'acoustic-panels', 'curtains'], ['carpet', 'wood-floor', 'laminate', 'vinyl'], ['grid-tiles', 'gypsum-ceiling', 'acoustic-ceiling']),
    hotelRoom: L(['gypsum-partition', 'painted-plaster', 'wallpaper', 'wood-panelling', 'fabric', 'curtains'], ['carpet', 'laminate', 'vinyl', 'vitrified-tiles'], ['gypsum-ceiling', 'grid-tiles']),
    clinical: L(['painted-plaster', 'gypsum-partition', 'tiles-stone'], ['vinyl', 'rubber', 'stone'], ['hygiene-tiles', 'gypsum-ceiling', 'grid-tiles']),
    nurse: L(['painted-plaster', 'glass', 'wood-panelling', 'acoustic-panels'], ['vinyl', 'rubber'], ['grid-tiles', 'hygiene-tiles', 'gypsum-ceiling']),
    blackBox: L(['block-painted', 'fabric', 'curtains', 'wood-panelling'], ['vinyl', 'wood-floor', 'carpet'], ['bare-slab', 'acoustic-ceiling']),
    mall: L(['tiles-stone', 'glass', 'painted-plaster', 'wood-panelling', 'metal-sheet'], ['stone', 'vitrified-tiles'], ['bare-slab', 'gypsum-ceiling', 'metal-tiles', 'grid-tiles']),
    monitoring: L(['fabric', 'acoustic-panels', 'wood-slats', 'painted-plaster', 'bass-absorber'], ['carpet-tiles', 'raised-floor-carpet', 'vinyl'], ['grid-tiles', 'acoustic-ceiling', 'bare-slab']),
    homeOffice: L(['painted-plaster', 'gypsum-partition', 'wood-panelling', 'glass', 'acoustic-panels', 'curtains'], ['carpet', 'laminate', 'wood-floor', 'vinyl', 'vitrified-tiles'], ['plastered-slab', 'gypsum-ceiling', 'grid-tiles']),
    council: L(['wood-panelling', 'painted-plaster', 'fabric', 'acoustic-panels', 'glass', 'curtains'], ['carpet', 'wood-floor', 'stone'], ['grid-tiles', 'gypsum-ceiling', 'wood-ceiling', 'acoustic-ceiling']),
    terminal: L(['glass', 'metal-sheet', 'tiles-stone', 'painted-plaster', 'acoustic-panels'], ['stone', 'vitrified-tiles'], ['bare-slab', 'metal-roof', 'metal-tiles', 'acoustic-ceiling']),
    pool: L(['tiles-stone', 'glass', 'bare-concrete', 'painted-plaster'], ['vitrified-tiles', 'concrete-floor'], ['metal-roof', 'bare-slab', 'metal-tiles']),
  };
  const ROOM_MATERIALS = {
    'Conference room': P.meeting, 'Meeting room': P.meeting, 'Boardroom': P.meeting, 'Private office': P.office, 'Open-plan office': P.openPlan,
    'Reception area': P.reception, 'Training room': P.training, 'Staff canteen': P.canteen,
    'Classroom': P.classroom, 'Lecture hall': P.lecture, 'Library': P.library, 'Music room': P.music, 'Sports hall': P.sports, 'Gymnasium': P.gym,
    'Recording studio': P.studio, 'Control room': P.studio, 'Home studio': P.homeStudio, 'Rehearsal room': P.music,
    'Restaurant': P.restaurant, 'Café': P.restaurant, 'Bar': P.restaurant, 'Banquet hall': P.banquet, 'Hotel lobby': P.lobby,
    'Consultation room': P.health, 'Waiting area': P.health, 'Patient room': P.health, 'Therapy room': P.therapy,
    'Auditorium': P.auditorium, 'Cinema': P.cinema, 'Place of worship': P.worship, 'Community hall': P.community,
    'Exhibition hall': P.exhibition, 'Showroom': P.retail, 'Retail store': P.retail, 'Workshop': P.industrial, 'Warehouse': P.industrial,
    'Living room': P.home, 'Bedroom': P.home, 'Home theatre': P.homeTheatre,
    'Phone booth / focus pod': P.booth, 'Lecture theatre': P.lecture, 'Computer lab': P.computerLab, 'Music practice room': P.music, 'School hall': P.schoolHall,
    'Event room': P.eventRoom, 'Hotel guest room': P.hotelRoom, 'Examination room': P.clinical, 'Nurse station': P.nurse, 'Corridor': P.clinical,
    'Drama theatre': P.auditorium, 'Concert hall': P.auditorium, 'Black box theatre': P.blackBox, 'Shopping mall common area': P.mall,
    'Monitoring / control centre': P.monitoring, 'Home office': P.homeOffice, 'Council chamber / courtroom': P.council,
    'Airport / railway waiting hall': P.terminal, 'Swimming pool hall': P.pool, 'Gym / fitness studio': P.gym,
  };
  const INDUSTRY_MATERIALS = {
    [I.corporate]: P.office, [I.education]: P.classroom, [I.studios]: P.studio, [I.hospitality]: P.restaurant, [I.healthcare]: P.health,
    [I.auditoriums]: P.auditorium, [I.industrial]: P.industrial, [I.residential]: P.home,
    'Government and civic': P.council, 'Transport': P.terminal, 'Sports and recreation': P.sports,
  };

  AM.roomFormData = { CONSTRUCTIONS, FINISHES, FITS, classify, EQUIPMENT, QUESTIONS, COMMON, SURFACE_TYPES, COVER_TYPES, OPENING_TYPES, ROOM_MATERIALS, INDUSTRY_MATERIALS };
})(window.AM);
