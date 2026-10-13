/* TargetRecommendation — the RT60 design target for a room, from the criteria in AM.targetData.

   Contract:
     usesFor(type)       -> room uses offered for a room type (the first is the default)
     recommend(room)     -> null when the room is not described enough, otherwise
       { preferred, min, max      the target the measurement is compared with (room as measured: empty)
         inUse                    DIN 18041 group A only: { preferred, min, max, people, present, absorption }
         use, useAssumed, criterionId, criterion, source, interpretation, basisLabel,
         reason, steps[], factors[[label, value, effect]], notes[], sources[] }

   Deterministic: the same room always gives the same target. The UI only displays what this returns. */
(function (AM) {
  'use strict';
  const { isNum, round, clamp, fmt, trimNum } = AM.util;
  const D = AM.targetData, C = D.CONSTANTS;
  const lg = Math.log10;
  const SOFT = { floor: ['Carpet', 'Carpet tiles'], ceiling: ['Acoustic tile'] };

  const usesFor = type => (D.ROOMS[type] || { uses: [] }).uses;

  // Same absorption without the people present: DIN 18041 group A targets are for the room in use.
  function withoutPeople(T, V, extra) {
    const A = C.SABINE * V / T;
    return C.SABINE * V / (A - Math.min(extra, A * C.MAX_PEOPLE_SHARE));
  }

  function recommend(room) {
    const g = AM.acoustics.geometry(room), rule = room && D.ROOMS[room.type];
    if (!g || !rule) return null;
    const use = rule.uses.includes(room.use) ? room.use : rule.uses[0];
    const u = D.USES[use], criterionId = u.criterion, c = D.CRITERIA[criterionId], src = D.SOURCES[c.source];
    const V = g.V, h = g.H, [tLo, tHi] = C.TOLERANCE;
    const steps = [], notes = [], sources = [src];
    let pref, min, max, inUse = null, summary;

    if (c.kind === 'din-a') {
      const Vc = clamp(V, c.vMin, c.vMax);
      let T;
      if (c.above && V > c.vMax) {
        T = c.above;
        steps.push(`Above ${c.vMax} m³, DIN 18041 sets ${fmt.s(T)} for this group.`);
      } else {
        T = c.k * lg(Vc) + c.c;
        steps.push(`T = ${c.k} × lg ${Math.round(Vc)} ${c.c < 0 ? '−' : '+'} ${Math.abs(c.c).toFixed(2)} = ${fmt.s(T)} for the room in use.`);
        if (Vc !== V) notes.push(`The room (${fmt.m3(V)}) is outside the ${c.vMin}–${c.vMax} m³ range of this formula, so the value at ${fmt.m3(Vc)} is used. Treat it as indicative.`);
      }
      steps.push(`Tolerance ${tLo}–${tHi} × T between 250 Hz and 2 kHz: ${(T * tLo).toFixed(2)}–${fmt.s(T * tHi)}.`);
      inUse = { preferred: round(T, 2), min: round(T * tLo, 2), max: round(T * tHi, 2) };
      const people = isNum(room.occupancy) && room.occupancy > 0 ? room.occupancy : 0;
      if (people) {
        const present = people * C.OCCUPIED_SHARE, extra = present * C.PERSON_ABSORPTION_M2;
        pref = withoutPeople(T, V, extra); min = withoutPeople(T * tLo, V, extra); max = withoutPeople(T * tHi, V, extra);
        Object.assign(inUse, { people, present: round(present, 1), absorption: round(extra, 1) });
        steps.push(`The standard assumes 80 % of the occupancy is present: ${trimNum(round(present, 1))} of ${people} people, about ${fmt.m2(extra)} of extra absorption at 1 kHz (${C.PERSON_ABSORPTION_M2} m² per person).`);
        if (extra > (C.SABINE * V / T) * C.MAX_PEOPLE_SHARE) notes.push('The occupancy is very high for this volume, so the allowance for people is limited to half of the room’s absorption in use.');
        steps.push(`The room is measured empty. Without those people, the same room reads ${fmt.s(pref)} (T = 0.163·V/A).`);
        summary = `For ${fmt.m3(V)} that is ${fmt.s(T)} with the room in use. Measured empty, with ${people} people expected, the equivalent target is ${fmt.s(pref)}.`;
      } else {
        pref = T; min = T * tLo; max = T * tHi;
        notes.push('No occupancy was entered, so the in-use target is compared directly with the empty-room measurement. That is on the strict side.');
        summary = `For ${fmt.m3(V)} that is ${fmt.s(T)}.`;
      }
    } else if (c.kind === 'din-b') {
      const av = h > 2.5 ? 1 / (c.c + 4.69 * lg(h)) : c.avMin;
      max = C.SABINE / av; pref = max / tHi; min = pref * tLo;
      steps.push(h > 2.5 ? `A/V ≥ 1 / (${c.c.toFixed(2)} + 4.69 × lg ${trimNum(h)}) = ${av.toFixed(3)} m²/m³ for a ${fmt.m(h)} high room.` : `A/V ≥ ${c.avMin.toFixed(2)} m²/m³ for rooms up to 2.5 m high.`);
      steps.push(`RT60 = 0.163 / ${av.toFixed(3)} = ${fmt.s(max)} at most.`);
      steps.push(`DIN 18041 gives only this upper limit. The design value ${fmt.s(pref)} places it at the top of the same 0.8–1.2 band used for group A rooms.`);
      if (V > c.vMax) notes.push(`DIN 18041 group B covers rooms up to ${c.vMax} m³. This room is larger, so treat the target as indicative.`);
      summary = `For a ${fmt.m(h)} ceiling height that allows at most ${fmt.s(max)}.`;
    } else if (c.kind === 'listening') {
      const raw = c.base * Math.cbrt(V / c.v0);
      pref = clamp(raw, c.lo, c.hi); min = pref - c.tol; max = pref + c.tol;
      steps.push(`Tm = ${c.base} × (${Math.round(V)} / ${c.v0})^⅓ = ${fmt.s(raw)}.`);
      if (raw !== pref) steps.push(`The criterion keeps Tm between ${c.lo} and ${c.hi} s, so ${fmt.s(pref)} is used.`);
      steps.push(`Tolerance ±${c.tol} s.`);
      summary = `For ${fmt.m3(V)} that is ${fmt.s(pref)}.`;
    } else {
      pref = c.value; min = pref * tLo; max = pref * tHi;
      steps.push(`Reference ${fmt.s(pref)}, with the ±20 % band DIN 18041 uses for group A rooms (interpretation).`);
      summary = '';
    }

    // Further criteria for the room type (e.g. a school limit). They can only make the target stricter.
    (rule.checks || []).forEach(key => {
      const ck = D.CHECKS[key], lim = ck.limits.find(l => V <= l.vMax);
      if (!lim) return;
      sources.push(D.SOURCES[ck.source]);
      if (max > lim.max) {
        // Keep the part of the range where both criteria are met.
        max = lim.max;
        if (min >= max) min = max * tLo / tHi;
        if (pref > max || pref < min) pref = (min + max) / 2;
        steps.push(`${ck.label}: at most ${fmt.s(lim.max)} up to ${lim.vMax} m³ (${ck.state}). The range is narrowed to where both criteria are met.`);
        summary += ` The school limit of ${fmt.s(lim.max)} is stricter, so the recommended target is ${fmt.s(pref)}, within ${min.toFixed(2)}–${fmt.s(max)}.`;
      } else {
        steps.push(`${ck.label}: at most ${fmt.s(lim.max)} up to ${lim.vMax} m³ (${ck.state}). Met by this range.`);
      }
    });

    pref = round(pref, 2); min = round(min, 2); max = round(max, 2);
    // Checked on the final target, after any room-type limit has narrowed it.
    if (inUse && inUse.people && pref - inUse.preferred >= 0.15) notes.push(`The audience adds a lot of absorption here, so the empty-room target is ${fmt.s(pref - inUse.preferred)} above the in-use value. With fewer people present the room will sound more reverberant; upholstered seating keeps that difference small.`);

    // Notes only: the surfaces never change the target. Read from the six surfaces when any is set (surfaces.finishes),
    // else from an earlier version's single choices.
    const fin = AM.services.surfaces && room.surfaces ? AM.services.surfaces.finishes(room) : null;
    const soft = fin && fin.described ? fin.soft : SOFT.floor.includes(room.floor) || SOFT.ceiling.includes(room.ceiling) || (room.existing && room.existing !== 'None');
    const described = (fin && fin.described) || room.floor || room.walls || room.ceiling;
    if (room.furnishing === 'Empty') notes.push('The room is empty. The criteria assume a furnished room, so expect the measured RT60 to fall once it is furnished. The target is not relaxed, because furniture absorption varies too much to estimate.');
    if (described && !soft) notes.push('The finishes are hard and there is no acoustic treatment yet, so a room like this usually measures above its target.');

    const occEffect = c.kind !== 'din-a' ? 'Not used by this criterion'
      : inUse.people ? `Empty-room target ${fmt.signedS(pref - inUse.preferred)} versus in use` : 'Not entered';
    const factors = [
      ['Industry', room.industry || '—', rule.checks ? 'Adds the school classroom limit' : 'Narrows the room types'],
      ['Room type', room.type, `${rule.uses.length} use${rule.uses.length > 1 ? 's' : ''} to choose from`],
      ['Room use', use + (use !== room.use ? ' (assumed)' : ''), `${src.short}, ${c.name}`],
      ['Volume', fmt.m3(V), c.kind === 'din-a' || c.kind === 'listening' ? 'Sets the value: larger rooms may ring longer' : 'Not used by this criterion'],
      ['Ceiling height', fmt.m(h), c.kind === 'din-b' ? 'Sets the absorption needed' : 'Included in the volume'],
      ['Occupancy', isNum(room.occupancy) && room.occupancy > 0 ? `${room.occupancy} people` : '—', occEffect],
      ['Furnishing', room.furnishing || '—', 'Does not change the target'],
      ['Surfaces', fin && fin.described ? AM.services.surfaces.describe(room).filter(s => s.chosen).map(s => `${s.name}: ${s.text}`).join('; ') : described ? [room.floor, room.walls, room.ceiling].filter(Boolean).join(', ') : '—', 'Do not change the target'],
    ];

    return {
      preferred: pref, min, max, inUse, use, useAssumed: use !== room.use,
      criterionId, criterion: c, source: src, interpretation: !!u.interpretation,
      basisLabel: `${src.short}, ${c.name}${sources.length > 1 ? ` + ${sources.slice(1).map(s => s.short).join(', ')}` : ''}`,
      reason: `${u.why} ${summary}`.trim(), steps, factors, notes,
      sources: sources.filter((s, i) => sources.indexOf(s) === i),
    };
  }

  AM.services.target = { kind: 'standards-based', usesFor, recommend };
})(window.AM);
