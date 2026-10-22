/* TargetRecommendation — the RT60 target for a room, only from a verified criterion that applies to it
   (criteria and room categories: js/data/targets.js; docs/TARGET-CRITERIA.md).

   Contract:
     usesFor(type)          -> the main activities offered for a room type: those with a verified criterion (first = default)
     knownUses(type)        -> every main activity the classification has for the room type, verified or not
     offeredTypes(industry) -> room types with a verified category, then "Other"
     typeGroups(industry)   -> every room type of the industry for Room Setup, in two groups: { target: with a verified
                               RT60 criterion, none: without one (they can still be measured; no target is generated),
                               "Other" last }
     offeredIndustries()    -> industries with a room type that has a verified category, then the custom industry
     category(type, use)    -> the room category: { id, industryIds, type, typeId, use, useId, status, criterion,
                               reference, basis, why, reason } or null when the type does not have that activity
     availability(room)     -> the six checks made before a target is generated, in order:
                                 1 category  the industry and room type are recognised and the main activity chosen
                                 2 criteria  verified target criteria exist for the category
                                 3 applies   the reference applies to this room use (on its examples or its own definition)
                                 4 inputs    every input the criterion needs is entered
                                 5 method    the documented method gives a value for this room, within its stated conditions
                                 6 record    the source and the conditions are recorded with the target
                               { status: ok | unselected | unsupported | incomplete | needs-input | outside,
                                 checks: [{ id, label, ok (true | false | null: not reached), detail }],
                                 category, criterion, reference, missing: [input], title, message, target (when ok) }
     recommend(room)        -> null unless availability is ok, otherwise
       { preferred, min, max, form ('range' | 'max': an upper limit only, preferred and min null),
         criterionId, criterion, reference, source (= reference), category, basisLabel, clause, condition, reason,
         steps[], workings[[label, value]], notes[], sources[], checks[], record (what the project keeps with the target) }
     Target values: form(t), complete(t), aim(t) (the value a treatment aims at: preferred, or the upper limit),
                    rangeText(t), valueText(t), fullText(t)

   No target is ever made up: outside a criterion's volume range nothing is extrapolated or clamped, a range without a
   documented rule is never turned into one value, and one room type's criterion is never used for another. The
   surfaces, furnishing and occupancy never change the target. Deterministic: the same room always gives the same answer. */
(function (AM) {
  'use strict';
  const { isNum, round, fmt, trimNum } = AM.util;
  const D = AM.targetData, DEMO = AM.demo;
  const lg = Math.log10;
  const OTHER = () => DEMO.OTHER_TYPE;
  const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* The classification ----------------------------------------------------------------------------------------- */
  const entries = type => D.CATEGORIES[type] || [];
  const knownUses = type => entries(type).map(([use]) => use);
  const isVerified = rule => !!(rule && rule.criterion && D.CRITERIA[rule.criterion] && D.CRITERIA[rule.criterion].status === 'verified');
  const usesFor = type => entries(type).filter(([, rule]) => isVerified(rule)).map(([use]) => use);
  const offeredTypes = industry => DEMO.roomTypesFor(industry).filter(t => t === OTHER() || usesFor(t).length);
  const typeGroups = industry => {
    if (!industry) return { target: [], none: [] }; // no list until an industry is chosen
    const all = DEMO.roomTypesFor(industry).filter(t => t !== OTHER());
    return { target: all.filter(t => usesFor(t).length), none: [...all.filter(t => !usesFor(t).length), OTHER()] };
  };
  // Main activities of a room type in the same two groups: with a verified criterion, and without one.
  const useGroups = type => ({ target: usesFor(type), none: knownUses(type).filter(u => !usesFor(type).includes(u)) });
  const offeredIndustries = () => DEMO.INDUSTRIES.filter(i => i.name === DEMO.OTHER_INDUSTRY || i.types.some(t => t !== OTHER() && usesFor(t).length)).map(i => i.name);

  function category(type, use) {
    const e = entries(type).find(([u]) => u === use);
    if (!e) return null;
    const rule = e[1], crit = isVerified(rule) ? D.CRITERIA[rule.criterion] : null;
    const typeId = `rt.${slug(type)}`, useId = (D.USES[use] || { id: slug(use) }).id;
    return {
      id: `${typeId}/${useId}`, industryIds: DEMO.INDUSTRIES.filter(i => i.types.includes(type)).map(i => i.id),
      type, typeId, use, useId,
      status: crit ? 'verified' : rule.status || 'unsupported',
      criterion: crit, reference: crit ? D.REFERENCES[crit.reference] : null,
      basis: crit ? rule.basis : null, why: crit ? rule.why : null, reason: crit ? null : rule.reason,
    };
  }

  /* Target values ------------------------------------------------------------------------------------------------ */
  const form = t => (t && t.form === 'max' ? 'max' : 'range');
  const complete = t => !!t && (form(t) === 'max' ? isNum(t.max) && t.max > 0 : [t.preferred, t.min, t.max].every(isNum));
  const aim = t => (t ? (isNum(t.preferred) ? t.preferred : t.max) : null);
  const rangeText = t => (form(t) === 'max' ? `at most ${fmt.s(t.max)}` : `${t.min.toFixed(2)}–${fmt.s(t.max)}`);
  const valueText = t => (form(t) === 'max' ? `≤ ${fmt.s(t.max)}` : fmt.s(t.preferred));
  const fullText = t => (form(t) === 'max' ? `at most ${fmt.s(t.max)}` : `${fmt.s(t.preferred)} (${rangeText(t)})`);

  /* Each method, exactly as its reference documents it. Returns { ok, T?, preferred?, min?, max?, steps[], detail }. */
  const METHODS = {
    'din-formula'(c, g) {
      const V = g.V, lgV = lg(V);
      if (c.fixedAbove && V > c.vMax && V <= c.fixedAbove.vMax) {
        return { ok: true, T: c.fixedAbove.value, steps: [`Above ${trimNum(c.vMax)} m³ the standard sets T_soll = ${fmt.s(c.fixedAbove.value)} for this use (up to about ${trimNum(c.fixedAbove.vMax)} m³).`] };
      }
      const inRange = c.fixedAbove ? V >= c.vMin && V <= c.vMax : V >= c.vMin && V < c.vMax;
      const span = c.fixedAbove ? `${trimNum(c.vMin)} m³ to about ${trimNum(c.fixedAbove.vMax)} m³` : `${trimNum(c.vMin)} m³ up to ${trimNum(c.vMax)} m³`;
      if (!inRange) return { ok: false, steps: [], detail: `The standard gives T_soll for this use from ${span}. This room is ${fmt.m3(V)}, outside that range, so it has no target from this criterion. No value is extrapolated.` };
      const T = c.k * lgV + c.c;
      return { ok: true, T, steps: [`T_soll = ${c.k} × lg ${trimNum(round(V, 1))} ${c.c < 0 ? '−' : '+'} ${Math.abs(c.c).toFixed(2)} = ${fmt.s(T)} (valid for ${span}).`] };
    },
    maximum(c) {
      return { ok: true, steps: [`At most ${fmt.s(c.value)} at ${c.band} Hz.`] };
    },
    'ebu-tm'(c, g) {
      const Tm = c.base * Math.cbrt(g.V / c.v0);
      const step = `Tm = ${c.base} × (${trimNum(round(g.V, 1))} / ${c.v0})^⅓ = ${Tm.toFixed(3)} s.`;
      if (!(Tm > c.lo && Tm < c.hi)) return { ok: false, steps: [step], detail: `${step} The criterion requires ${c.lo} s < Tm < ${c.hi} s, so it gives no target for a room of ${fmt.m3(g.V)}. No value is clamped to the range.` };
      return { ok: true, T: Tm, steps: [step, `Within the required ${c.lo}–${c.hi} s.`] };
    },
  };

  // The target values from the method's result: the documented tolerance only.
  function values(c, res) {
    if (c.method === 'maximum') return { form: 'max', preferred: null, min: null, max: c.value, steps: [] };
    if (c.method === 'ebu-tm') {
      // §2.3: the room's own measured Tm has to lie between 0.2 and 0.4 s; the formula is the guide (the preferred value
      // and the treatment aim); every band is judged within ±tol around the MEASURED Tm (AM.services.evaluation).
      return { form: 'range', preferred: round(res.T, 2), min: c.lo, max: c.hi,
        steps: [`The room's measured Tm (the mean from 250 Hz to 4 kHz) has to lie between ${c.lo} and ${c.hi} s; ${fmt.s(res.T)} is the guide for this volume. Every band is judged within ±${c.tol} s of the measured Tm (at 125 Hz −${c.tol} to +0.15 s).`] };
    }
    const [lo, hi] = c.tolerance[250];
    return { form: 'range', preferred: round(res.T, 2), min: round(res.T * lo, 2), max: round(res.T * hi, 2), tsoll: res.T,
      steps: [`Tolerance ${lo}–${hi} × T_soll from 250 Hz to 2 kHz: ${(res.T * lo).toFixed(2)}–${fmt.s(res.T * hi)}.${c.tolerance[125] ? ` At 125 Hz ${c.tolerance[125].join('–')} × T_soll and at 4 kHz ${c.tolerance[4000].join('–')} × T_soll: every band 125 Hz–4 kHz is judged.` : ' Only these bands are judged.'}`] };
  }

  const INPUT_LABEL = { volume: 'the room size (length, width and height)' };
  const CHECK_LABELS = {
    category: 'Industry, room type and main activity recognised',
    criteria: 'Verified target criteria exist for this category',
    applies: 'The reference applies to this room use',
    inputs: 'Every input the criterion needs is entered',
    method: 'The documented method gives a value for this room',
    record: 'Source and conditions recorded with the target',
  };

  /* The room size as Room Setup accepts it (its limits, stages/room.js): the first length, width or height outside them,
     as a sentence, or null. A size outside them gives no volume anywhere (AM.derive.geometry), so no target from it. */
  function sizeError(r) {
    const st = AM.workflow && AM.workflow.get('room'), m = st && st.model;
    if (!m) return null;
    const bad = m.DIMS.find(([k]) => m.dimError(k, r[k]));
    return bad ? `The room ${bad[2]} must be ${m.dimError(bad[0], r[bad[0]]).replace(/^Enter /, '')}.` : null;
  }

  // A target worked out from DIN 18041 (not the project's own): its verdict is a guide, not an official DIN check.
  const isDin = t => !!(t && t.source !== 'custom' && t.record && /^din18041/.test(t.record.criterion));

  function availability(room) {
    const checks = Object.keys(CHECK_LABELS).map(id => ({ id, label: CHECK_LABELS[id], ok: null, detail: '' }));
    const at = id => checks.find(c => c.id === id);
    const out = (status, title, message, extra) => Object.assign({ status, title, message, checks, category: null, criterion: null, reference: null, missing: [] }, extra);
    const fail = (id, detail) => { const c = at(id); c.ok = false; c.detail = detail; };
    const pass = (id, detail) => { const c = at(id); c.ok = true; c.detail = detail; };
    const r = room || {};

    // 1. The category.
    if (!r.industry || !r.type) {
      fail('category', 'The industry and room type are not chosen yet.');
      return out('unselected', 'Room not described yet', 'Choose the industry, room type and main activity in Room Setup.');
    }
    if (r.type === OTHER() || r.industry === DEMO.OTHER_INDUSTRY) {
      const name = r.type === OTHER() ? (r.typeOther || '').trim() : '';
      fail('category', `${name ? `“${name}” is` : 'A room type you name is'} not in the classification.`);
      return out('unsupported', 'No verified target criteria', `No verified target criteria are available for ${name ? `“${name}”` : 'a room type you name'}: only the listed room types are matched to a standard. Choose a listed room type in Room Setup, or set the project's own target from a specification you have.`);
    }
    if (!DEMO.roomTypesFor(r.industry).includes(r.type) || !entries(r.type).length) {
      fail('category', `“${r.type}” is not a room type of ${r.industry}.`);
      return out('unsupported', 'No verified target criteria', `“${r.type}” is not in the classification for ${r.industry}, so no verified target criteria are available. Choose a listed room type in Room Setup.`);
    }
    if (!r.use) {
      fail('category', 'The main activity is not chosen yet.');
      return out('unselected', 'Main activity not chosen', 'Choose the main activity in Room Setup: it decides which criterion applies.');
    }
    const cat = category(r.type, r.use);
    if (!cat) {
      fail('category', `“${r.use}” is not a main activity of a ${r.type.toLowerCase()} in the classification.`);
      return out('unsupported', 'No verified target criteria', `No verified target criteria are available for a ${r.type.toLowerCase()} used for “${r.use}”: that is not a category in the classification. Choose one of the room type's listed activities in Room Setup.`);
    }
    pass('category', `${r.type} · ${r.use} (${cat.id}).`);

    // 2. Verified criteria for the category.
    if (cat.status !== 'verified') {
      fail('criteria', cat.reason);
      return out(cat.status, 'No verified target criteria', `No verified target criteria are available for a ${r.type.toLowerCase()} used for ${r.use.charAt(0).toLowerCase()}${r.use.slice(1)}. ${cat.reason} The app does not substitute another value.`, { category: cat });
    }
    const c = cat.criterion, ref = cat.reference;
    pass('criteria', `${ref.short}, ${c.name}: verified (${ref.evidence === 'primary' ? 'read in the document' : 'checked in published sources'}).`);
    const base = { category: cat, criterion: c, reference: ref };

    // 3. The reference applies to this use.
    pass('applies', `${cat.basis === 'example' ? 'Named in the reference' : 'By the use type\'s own description'}: ${cat.why}`);

    // 4. Required inputs: the volume from a room size Room Setup accepts.
    const badSize = c.inputs.includes('volume') ? sizeError(r) : null, g = badSize ? null : AM.acoustics.geometry(r);
    if (badSize) {
      fail('inputs', `Room size: ${badSize}`);
      return out('needs-input', 'Room size to check', `${ref.short} sets this target from the room's volume. ${badSize} Correct it in Room Setup.`, Object.assign({ missing: ['volume'] }, base));
    }
    const missing = c.inputs.filter(k => k === 'volume' && !g);
    if (missing.length) {
      fail('inputs', `Missing: ${missing.map(k => INPUT_LABEL[k]).join(', ')}.`);
      return out('needs-input', 'More information needed', `${ref.short} sets this target from the room's volume. Enter the length, width and height in Room Setup.`, Object.assign({ missing }, base));
    }
    pass('inputs', c.inputs.length ? `Volume ${fmt.m3(g.V)} (${fmt.dims(g)}).` : 'None: the criterion is a fixed value for this room use.');

    // 5. The documented method, within its conditions.
    const res = METHODS[c.method](c, g);
    if (!res.ok) {
      fail('method', res.detail);
      return out('outside', 'Outside the criterion', `${ref.short}, ${c.name}: ${res.detail} Choose another main activity whose criterion covers this room, or set the project's own target.`, base);
    }
    const v = values(c, res);
    pass('method', [...res.steps, ...v.steps].join(' '));

    // 6. The record kept with the target.
    const record = {
      category: cat.id, criterion: c.id, reference: `${ref.short} (${ref.issuer})`, clause: c.clause, condition: c.condition,
      units: c.units, inputs: c.inputs.length ? { volumeM3: round(g.V, 1) } : {}, method: [...res.steps, ...v.steps].join(' '),
      evidence: ref.evidence,
    };
    pass('record', `${ref.short}, ${c.clause}`);
    return out('ok', 'Target from a verified criterion', '', Object.assign({ target: Object.assign({ form: v.form, preferred: v.preferred, min: v.min, max: v.max }, v.tsoll != null ? { tsoll: v.tsoll } : {}, { record }), steps: [...res.steps, ...v.steps] }, base));
  }

  function recommend(room) {
    const a = availability(room);
    if (a.status !== 'ok') return null;
    const r = room, c = a.criterion, ref = a.reference, cat = a.category, t = a.target, g = AM.acoustics.geometry(r);
    const notes = [];
    if (c.bands === 'din-a' || c.bands === 'din-a5') notes.push('DIN 18041 sets this target for the room in use, with 80 % of its normal occupancy present. The room is measured as it is, usually empty, and an empty room reads longer than the same room in use. The standard\'s Annex A converts between the two with set absorption values per person; those values could not be verified, so the app does not convert. A room that meets the target empty will read somewhat shorter in use.');
    if (c.method === 'maximum') notes.push(`${ref.short} gives only an upper limit, at ${c.band} Hz. There is no preferred value or lower limit: any value at or below ${fmt.s(c.value)} meets it. The app judges the ${c.band} Hz band and shows the others without a limit.`);
    if (c.method === 'ebu-tm') {
      notes.push('EBU Tech 3276 sets this criterion in third-octave bands, measured with the room\'s own loudspeakers. The app measures octave bands with the device\'s speaker and compares each with the tolerance at its centre frequency.');
      if (g.floor < c.roomSize.floorMin || g.V > c.roomSize.vMax) notes.push(`EBU Tech 3276 also asks for at least ${c.roomSize.floorMin} m² of floor (${c.roomSize.floorMinListening} m² for a reference listening room) and at most ${c.roomSize.vMax} m³; this room has ${fmt.m2(g.floor)} and ${fmt.m3(g.V)}, so it is ${g.V > c.roomSize.vMax ? 'larger' : 'smaller'} than the rooms the criterion is written for.`);
    }
    if (ref.evidence === 'secondary') notes.push(`${ref.note}`);
    // Notes only: the surfaces and furnishing never change the target.
    const fin = AM.services.surfaces && r.surfaces ? AM.services.surfaces.finishes(r) : null;
    if (r.furnishing === 'Empty') notes.push('The room is unfurnished. Furniture and people add absorption, so it will read shorter once furnished and in use. The target does not change.');
    if (fin && fin.described && !fin.soft) notes.push('The finishes are hard and there is no acoustic treatment yet, so a room like this usually measures above its target.');

    const summary = t.form === 'max' ? `For a ${r.type.toLowerCase()} that is at most ${fmt.s(t.max)} at ${c.band} Hz.` : `For ${fmt.m3(g.V)} that is ${fmt.s(t.preferred)}, within ${t.min.toFixed(2)}–${fmt.s(t.max)}.`;
    const workings = [
      ['Room category', `${r.type} · ${r.use}`],
      ['Reference', `${ref.number}, ${ref.edition} · ${ref.issuer}`],
      ['Clause', c.clause],
      ['Applies because', cat.why],
      ['Inputs used', c.inputs.length ? `Volume ${fmt.m3(g.V)} (${fmt.dims(g)})` : 'None: a fixed value for this use'],
      ['Method', a.steps.join(' ')],
      ['Condition', c.condition],
      ['Units and bands', c.units],
      ['Verification', ref.evidence === 'primary' ? `Verified in the document itself. ${c.checked}` : `Verified in published sources (the document was not available). ${c.checked}`],
    ];
    return Object.assign({}, t, {
      criterionId: c.id, criterion: c, reference: ref, source: ref, category: cat,
      basisLabel: `${ref.short}, ${c.name}`, clause: c.clause, condition: c.condition,
      reason: `${cat.why} ${summary}`, steps: a.steps, workings, notes, sources: [ref], checks: a.checks, record: t.record,
    });
  }

  AM.services.target = {
    kind: 'standards-based', usesFor, knownUses, offeredTypes, typeGroups, useGroups, offeredIndustries, category, availability, recommend,
    form, complete, aim, rangeText, valueText, fullText, isDin,
  };
})(window.AM);
