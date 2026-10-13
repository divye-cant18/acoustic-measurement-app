/* Step 1 · Room Setup — what the room is, its size and what it is made of.
   Six surfaces (four walls, floor, ceiling), each with its own finish, an optional partial covering and, on walls,
   doors, windows and openings (AM.services.surfaces). The surfaces describe the room and tell the treatment prediction
   what each product covers. The room's RT60 is not estimated from them: it is measured (Measure), and the only RT60
   predicted is the one after treatment, from the measured room. */
(function (AM) {
  'use strict';
  const { esc, icon, fmt, isNum } = AM.util;
  const W = AM.workflow, S = AM.store, D = AM.demo, ui = AM.ui, TS = AM.services.target;
  const RM = () => AM.services.surfaces;

  // Keep the room use if the room type offers it, otherwise take the type's most common use.
  const fitUse = (type, use) => { const uses = TS.usesFor(type); return uses.includes(use) ? use : uses[0] || ''; };

  const LIMITS = { L: [1, 100], W: [1, 100], H: [1.8, 30] };
  const DIMS = [['L', 'Length', 'length'], ['W', 'Width', 'width'], ['H', 'Height', 'height']];

  function dimError(k, v) {
    if (!isNum(v)) return null;
    const [a, b] = LIMITS[k];
    return v < a || v > b ? `Enter ${a}–${b} m` : null;
  }

  // Occupancy is optional. When given it must be 0 or more and no denser than 2 people per m² of floor.
  const MAX_DENSITY = 2;
  function occError(r) {
    const n = r.occupancy;
    if (!isNum(n)) return null;
    if (n < 0) return 'Enter 0 or more people';
    const g = AM.acoustics.geometry(r), ok = g && !DIMS.some(([k]) => dimError(k, r[k]));
    const cap = ok ? Math.floor(g.floor * MAX_DENSITY) : 10000;
    if (n > cap) return ok ? `That is more than ${MAX_DENSITY} people per m² of floor. At most ${cap} for ${fmt.m2(g.floor, 0)}.` : 'Enter at most 10000 people';
    return null;
  }

  /* Isometric sketch of the room box, scaled to its real proportions. */
  function isoRoom(r) {
    const g = AM.acoustics.geometry(r);
    if (!g || DIMS.some(([k]) => dimError(k, r[k]))) {
      return `<div class="iso-empty">${icon('room', 40, 1.3)}<span>Enter length, width and height to see the room.</span></div>`;
    }
    const c = Math.cos(Math.PI / 6), s = 0.5;
    const P = (x, y, z) => [(x - y) * c, (x + y) * s - z];
    const corners = [[0, 0, 0], [g.L, 0, 0], [0, g.W, 0], [g.L, g.W, 0], [0, 0, g.H], [g.L, 0, g.H], [0, g.W, g.H], [g.L, g.W, g.H]].map(q => P(...q));
    const xs = corners.map(q => q[0]), ys = corners.map(q => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const VW = 340, VH = 230, pad = 34;
    const k = Math.min((VW - 2 * pad) / (maxX - minX), (VH - 2 * pad) / (maxY - minY));
    const ox = (VW - (maxX - minX) * k) / 2, oy = (VH - (maxY - minY) * k) / 2;
    const T = q => { const [x, y] = P(...q); return [ox + (x - minX) * k, oy + (y - minY) * k]; };
    const pts = arr => arr.map(q => T(q).map(n => n.toFixed(1)).join(',')).join(' ');
    const { L, W: Wd, H } = g;
    const mid = (a, b) => { const A = T(a), B = T(b); return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; };
    const lL = mid([0, Wd, 0], [L, Wd, 0]), lW = mid([L, 0, 0], [L, Wd, 0]), lH = mid([0, Wd, 0], [0, Wd, H]);
    const hidden = [T([0, 0, 0]), T([L, 0, 0])], hidden2 = [T([0, 0, 0]), T([0, Wd, 0])], hidden3 = [T([0, 0, 0]), T([0, 0, H])];
    const line = ([a, b]) => `<line class="hidden-edge" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`;
    return `<svg class="iso" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Room sketch, ${fmt.dims(g)}">
      ${line(hidden)}${line(hidden2)}${line(hidden3)}
      <polygon class="f-top" points="${pts([[0, 0, H], [L, 0, H], [L, Wd, H], [0, Wd, H]])}"/>
      <polygon class="f-a" points="${pts([[0, Wd, 0], [L, Wd, 0], [L, Wd, H], [0, Wd, H]])}"/>
      <polygon class="f-b" points="${pts([[L, 0, 0], [L, Wd, 0], [L, Wd, H], [L, 0, H]])}"/>
      <text x="${(lL[0] - 8).toFixed(1)}" y="${(lL[1] + 20).toFixed(1)}" text-anchor="end">${fmt.m(L)}</text>
      <text x="${(lW[0] + 8).toFixed(1)}" y="${(lW[1] + 20).toFixed(1)}">${fmt.m(Wd)}</text>
      <text x="${(lH[0] - 8).toFixed(1)}" y="${(lH[1] + 4).toFixed(1)}" text-anchor="end">${fmt.m(H)}</text>
    </svg>`;
  }

  /* ---------- surfaces ---------- */
  const QUALITY = {
    manufacturer: ['good', 'Manufacturer test data'], published: ['neutral', 'Published reference values'],
    compilation: ['warn', 'Engineering compilation'], definition: ['neutral', 'By definition'], none: ['critical', 'No data'],
  };
  // A material's families for a kind of surface, in categories: [{ category, families: [{ name, variants }] }].
  function families(kind, opening) {
    return RM().materialsFor(kind, opening).map(g => {
      const fam = new Map();
      g.items.forEach(m => { const f = RM().familyOf(m, kind); if (!fam.has(f)) fam.set(f, []); fam.get(f).push(m); });
      return { category: g.category, families: [...fam].map(([name, variants]) => ({ name, variants })) };
    });
  }
  // The material select: families in their categories; a family with several constructions gets a second select.
  function materialPicker({ id, kind, opening, key, part, value, label }) {
    const cur = RM().material(value), groups = families(kind, opening);
    const fam = cur && groups.flatMap(g => g.families.filter(f => f.variants.includes(cur)))[0];
    const opts = groups.map(g => `<optgroup label="${esc(g.category)}">${g.families.map(f => `<option value="${esc(f.variants[0].id)}" ${fam === f ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</optgroup>`).join('');
    // No sourced material for this kind of surface: say so, rather than an empty list.
    const none = !groups.length;
    const sel = `<div class="field"><label class="field-l" for="${id}">${esc(label)}</label><select class="select" id="${id}" data-change-action="surfaceMaterial" data-key="${key}" data-part="${esc(part)}" ${none ? 'disabled' : ''}><option value="" ${!cur ? 'selected' : ''} disabled>${none ? 'No materials in the library for this surface' : 'Choose a material'}</option>${opts}</select></div>`;
    const variant = fam && fam.variants.length > 1
      ? `<div class="field"><label class="field-l" for="${id}-v">Construction</label><select class="select" id="${id}-v" data-change-action="surfaceMaterial" data-key="${key}" data-part="${esc(part)}">${fam.variants.map(m => `<option value="${esc(m.id)}" ${m === cur ? 'selected' : ''}>${esc(m.variant)}</option>`).join('')}</select></div>` : '';
    return { sel, variant, cur };
  }
  // What the data behind a material is: its class, source, the conditions it holds for, and its α per band.
  function dataLine(m) {
    if (!m) return '';
    const [tone, word] = QUALITY[m.quality] || QUALITY.none, src = RM().sourceOf(m), al = RM().alphaOf(m.id);
    return `<div class="surf-data">${ui.pill(tone, word)}
      <span class="small muted" ${m.notes ? `title="${esc(m.notes)}"` : ''}>${m.conditions ? `${esc(m.conditions)} · ` : ''}α ${D.BANDS.map(f => (al.values[f] == null ? '—' : al.values[f].toFixed(2))).join(' · ')}${al.capped.length ? ' (limited to 1.00)' : ''}${src ? ` · <a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.short)}</a>` : ''}</span></div>`;
  }

  function surfaceCard(p, def, model) {
    const s = (p.room.surfaces || {})[def.key] || RM().blankSurface(), key = def.key, ok = model.grossM2 != null;
    const dimText = ok ? `${fmt.m(p.room[def.a])} × ${fmt.m(p.room[def.b])}` : '';
    const fin = materialPicker({ id: `surf-${key}`, kind: def.kind, key, part: 'finish', value: s.material, label: 'Material' });
    const cov = s.cover && (s.cover.material || isNum(s.cover.pct));
    const coverHtml = cov ? (() => {
      const c = materialPicker({ id: `surf-${key}-cov`, kind: def.kind, key, part: 'cover', value: s.cover.material, label: 'Covered by' });
      return `<div class="surf-sub"><div class="grid g2">${c.sel}${c.variant || ''}</div>
        <div class="surf-row">${ui.number({ id: `surf-${key}-pct`, label: 'Share of the surface', bind: `room.surfaces.${key}.cover.pct`, value: s.cover.pct, unit: '%', placeholder: '50', error: isNum(s.cover.pct) && (s.cover.pct < 0 || s.cover.pct > 100) ? 'Enter 0–100 %' : null })}
          <span class="small muted">${ok ? `${fmt.m2(model.coverM2)} covered, ${fmt.m2(model.finishM2)} of the material above` : ''}</span>
          <button class="btn btn-ghost btn-sm" data-action="removeCover" data-value="${key}">${icon('x', 14, 2)} Remove</button></div>
        ${dataLine(c.cur)}</div>`;
    })() : '';
    const ops = def.kind === 'wall' ? (s.openings || []).map((o, i) => {
      const m = materialPicker({ id: `surf-${key}-o${o.id}`, kind: 'opening', opening: o.kind, key, part: o.id, value: o.material, label: RM().OPENINGS[o.kind] || 'Opening' });
      const a = RM().openingArea(o);
      return `<div class="surf-sub surf-op"><div class="grid g2">${m.sel}${m.variant || ''}</div>
        <div class="surf-row surf-dims">
          ${ui.number({ id: `surf-${key}-o${o.id}-w`, label: 'Width', bind: `room.surfaces.${key}.openings.${i}.widthM`, value: o.widthM, unit: 'm', placeholder: 'e.g. 0.9' })}
          ${ui.number({ id: `surf-${key}-o${o.id}-h`, label: 'Height', bind: `room.surfaces.${key}.openings.${i}.heightM`, value: o.heightM, unit: 'm', placeholder: 'e.g. 2.1' })}
          ${ui.number({ id: `surf-${key}-o${o.id}-n`, label: 'How many', bind: `room.surfaces.${key}.openings.${i}.count`, value: o.count, type: 'int', placeholder: '1' })}
          <span class="small muted">${a != null ? fmt.m2(a) : 'Enter its size'}</span>
          <button class="btn btn-ghost btn-sm" data-action="removeOpening" data-value="${key}|${esc(o.id)}" aria-label="Remove this ${esc((RM().OPENINGS[o.kind] || 'opening').toLowerCase())}">${icon('x', 14, 2)}</button></div>
        ${dataLine(m.cur)}</div>`;
    }).join('') : '';
    const adds = `<div class="hstack surf-adds">
      ${!cov ? `<button class="btn btn-ghost btn-sm" data-action="addCover" data-value="${key}">${icon('plus', 14, 2)} Partly covered by…</button>` : ''}
      ${def.kind === 'wall' ? ['door', 'window', 'opening'].map(k => `<button class="btn btn-ghost btn-sm" data-action="addOpening" data-value="${key}|${k}">${icon('plus', 14, 2)} ${k === 'opening' ? 'Opening' : RM().OPENINGS[k]}</button>`).join('') : ''}
    </div>`;
    const migrated = s.origin === 'migrated' && s.legacy ? ui.note(`Filled from the earlier single choice “${esc(s.legacy)}”. Check that it describes ${esc(def.name.toLowerCase())}.`, 'warn') : '';
    const legacy = !s.material && s.legacy ? `<p class="small muted">Earlier entry: “${esc(s.legacy)}”. It does not say which material this is, so choose it here.</p>` : '';
    return `<div class="surf" id="surf-card-${key}">
      <div class="surf-h"><b>${esc(def.name)}</b><span class="small muted">${esc(def.where)}${dimText ? ` · ${dimText}` : ''}</span>
        <span class="surf-area">${ok ? fmt.m2(model.grossM2) : '—'}${ok && model.openingsM2 > 0 ? `<small>${fmt.m2(model.solidM2)} solid</small>` : ''}</span></div>
      ${migrated}${legacy}
      <div class="grid g2">${fin.sel}${fin.variant || ''}</div>
      ${dataLine(fin.cur)}
      ${coverHtml}${ops}${adds}
      ${model.problems.length ? `<ul class="bullets small">${model.problems.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  function view(ctx) {
    const r = ctx.project.room, g = AM.acoustics.geometry(r);
    const validG = g && !DIMS.some(([k]) => dimError(k, r[k]));
    const dims = DIMS.map(([k, label]) => ui.number({ id: `room-${k}`, label, bind: `room.${k}`, value: r[k], unit: 'm', error: dimError(k, r[k]), req: true, placeholder: k === 'H' ? '3.0' : '0.0' })).join('');

    const types = D.roomTypesFor(r.industry), uses = types.includes(r.type) ? TS.usesFor(r.type) : [];
    const rec = validG && uses.includes(r.use) ? TS.recommend(r) : null;
    const left = `<div class="stack">
      ${ui.card({ title: 'Room', body: `<div class="fields">
        ${ui.text({ id: 'room-name', label: 'Room name', bind: 'room.name', value: r.name, placeholder: 'e.g. Conference Room A', req: true })}
        <div class="grid g2">
          ${ui.select({ id: 'room-industry', label: 'Industry type', changeAction: 'setIndustry', value: r.industry, options: D.INDUSTRIES.map(i => i.name), placeholder: 'Choose an industry', req: true })}
          ${ui.select({ id: 'room-type', label: 'Room type', changeAction: 'setType', value: types.includes(r.type) ? r.type : '', options: types, placeholder: r.industry ? 'Choose a room type' : 'Choose an industry first', req: true, disabled: !r.industry })}
        </div>
        ${ui.select({ id: 'room-use', label: 'Room use', bind: 'room.use', value: uses.includes(r.use) ? r.use : '', options: uses, placeholder: r.type ? 'Choose a use' : 'Choose a room type first', hint: 'The main activity decides which acoustic criterion the target follows.', req: true, disabled: !uses.length })}
      </div>` })}
      ${ui.card({ title: 'Dimensions', sub: 'Inside measurements, wall to wall and floor to ceiling.', body: `
        <div class="guide-row">
          <button class="mi-thumb" data-action="openGuide" data-value="dimensions" aria-label="Play the How to measure the room video, ${esc(AM.guides.dimensions.lengthLabel)}">
            ${AM.guide.poster('dimensions')}<span class="mi-play">${icon('play', 18, 2.4)}</span><span class="mi-len">${esc(AM.guides.dimensions.lengthLabel)}</span>
          </button>
          <div class="guide-row-text">
            <span>Measure inside the room: wall face to wall face, and floor to the ceiling you can see. A laser meter is quickest.</span>
            <div><button class="btn btn-secondary btn-sm" data-action="openGuide" data-value="dimensions">${icon('info', 16, 2)} How to measure the room</button></div>
          </div>
        </div>
        <div class="dims-grid">${dims}</div>
        <div class="well vol"><span class="muted small">Volume</span><span class="stat-v">${validG ? g.V.toFixed(0) : '—'}<small>m³</small></span><span class="small muted">${validG ? `${fmt.dims(g)}` : 'Updates as you type'}</span></div>` })}
      ${ui.card({ title: 'Occupancy and furnishing', body: `<div class="grid g2">
        ${ui.number({ id: 'room-occ', label: 'Typical occupancy (people)', bind: 'room.occupancy', value: r.occupancy, type: 'int', placeholder: '0', req: 'optional', error: occError(r), hint: 'Rooms for speech get a target that allows for the people usually present.' })}
        <div class="field"><span class="field-l">Furnishing</span>${ui.seg({ bind: 'room.furnishing', value: r.furnishing, options: D.OPTIONS.furnishing.map(v => ({ value: v, label: v })), label: 'Furnishing', id: 'room-furn' })}</div>
      </div>` })}
      ${ui.card({ title: 'Surfaces', sub: 'What each surface is made of. Walls go round the room: 1 and 3 are the long walls, 2 and 4 the end walls.', body: `<div class="surfs">
        ${RM().SURFACES.map(def => surfaceCard(ctx.project, def, RM().surfaceModel(r, def.key))).join('')}
        </div>
        ${r.existing && r.existing !== 'None' ? `<p class="small muted">Earlier entry for existing treatment: “${esc(r.existing)}”. Describe it on the surfaces it covers.</p>` : ''}
        ${ui.note('The surfaces describe the room and tell the treatment prediction what each product covers, so no surface is counted twice. The room\'s RT60 is measured, not estimated from them; they never change the target or a measurement.')}` })}
    </div>`;

    const right = `<div class="stack sticky">
      ${ui.card({ title: 'Room summary', right: validG ? '' : ui.pill('neutral', 'Incomplete'), body: `${isoRoom(r)}
        ${ui.kv([
          ['Volume', validG ? fmt.m3(g.V) : '—', 'is-strong'],
          ['Floor area', validG ? fmt.m2(g.floor) : '—'],
          ['Wall area', validG ? fmt.m2(g.walls) : '—'],
          ['Ceiling area', validG ? fmt.m2(g.ceiling) : '—'],
          ['Total surface', validG ? fmt.m2(g.total) : '—'],
          ['Occupancy', isNum(r.occupancy) && !occError(r) ? `${r.occupancy} people` : '—'],
          ['Surfaces described', `${RM().finishes(r).chosen} of ${RM().SURFACES.length}`],
          ['Recommended RT60', rec ? `${fmt.s(rec.preferred)}<div class="kv-note">${rec.min.toFixed(2)}–${fmt.s(rec.max)} · ${esc(rec.source.short)}</div>` : '—', 'is-strong'],
        ])}
        <p class="small muted">${rec ? 'Worked out from the room type, use, size and occupancy. Step 2 explains it.' : 'Appears once the room type, use and size are entered.'}</p>` })}
    </div>`;

    return { body: `<div class="grid split">${left}${right}</div>` };
  }

  // A copy of one surface, changed by fn, written back as that surface alone.
  function editSurface(ctx, key, fn) {
    if (!RM().surfaceDef(key)) return;
    const cur = (ctx.project.room.surfaces || {})[key] || RM().blankSurface(), s = JSON.parse(JSON.stringify(cur));
    fn(s);
    S.set(`room.surfaces.${key}`, s);
  }

  function canContinue(p) {
    const r = p.room;
    if (!r.name || !r.name.trim()) return { ok: false, reason: 'Enter a room name.' };
    if (!r.industry) return { ok: false, reason: 'Choose an industry type.' };
    if (!r.type || !D.roomTypesFor(r.industry).includes(r.type)) return { ok: false, reason: `Choose a room type for ${r.industry}.` };
    if (!TS.usesFor(r.type).includes(r.use)) return { ok: false, reason: 'Choose how the room is used.' };
    for (const [k, , word] of DIMS) {
      if (!isNum(r[k])) return { ok: false, reason: `Enter the room ${word}.` };
      const e = dimError(k, r[k]);
      if (e) return { ok: false, reason: `Room ${word}: ${e.toLowerCase()}.` };
    }
    const occ = occError(r);
    if (occ) return { ok: false, reason: `Typical occupancy: ${occ.charAt(0).toLowerCase()}${occ.slice(1).replace(/\.$/, '')}.` };
    return { ok: true };
  }

  W.define('room', {
    view,
    canContinue,
    continueLabel: 'Continue to Target',
    actions: {
      // Industry, room type and use change together, so an incompatible type or use never stays selected.
      setIndustry: (ctx, industry) => {
        const r = ctx.project.room, types = D.roomTypesFor(industry);
        const type = types.includes(r.type) ? r.type : types.length === 1 ? types[0] : '';
        S.set('room', Object.assign({}, r, { industry, type, use: fitUse(type, r.use) }));
      },
      // After the room-measuring video, continue at the first size still to enter.
      closeGuide: ctx => {
        S.ui({ sheet: null });
        const k = DIMS.map(([key]) => key).find(key => !isNum(ctx.project.room[key])) || 'L';
        const el = document.getElementById(`room-${k}`);
        if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
      },
      setType: (ctx, type) => {
        const r = ctx.project.room;
        S.set('room', Object.assign({}, r, { type, use: fitUse(type, r.use) }));
      },
      // Surfaces: each change writes that one surface only (room.surfaces.<key>), so no other surface can change with it.
      surfaceMaterial: (ctx, value, el) => editSurface(ctx, el.dataset.key, s => {
        const part = el.dataset.part;
        if (part === 'finish') { s.material = value; s.origin = 'user'; }
        else if (part === 'cover') s.cover = { material: value, pct: isNum(s.cover && s.cover.pct) ? s.cover.pct : null };
        else { const o = (s.openings || []).find(x => x.id === part); if (o) o.material = value; }
      }),
      addCover: (ctx, key) => editSurface(ctx, key, s => { s.cover = { material: '', pct: 50 }; }),
      removeCover: (ctx, key) => editSurface(ctx, key, s => { s.cover = { material: '', pct: null }; }),
      addOpening: (ctx, v) => {
        const [key, kind] = String(v).split('|');
        // A door or window is left to choose (they differ a lot); an open doorway absorbs everything by definition, so its
        // one material is set.
        const only = RM().materialsFor('opening', kind).flatMap(g => g.items), def = only.length === 1 && only[0].quality === 'definition' ? only[0].id : '';
        editSurface(ctx, key, s => {
          const ops = s.openings || (s.openings = []), n = 1 + Math.max(0, ...ops.map(o => parseInt(String(o.id).slice(1), 10) || 0));
          ops.push({ id: `o${n}`, kind, material: def, widthM: null, heightM: null, count: 1 });
        });
      },
      removeOpening: (ctx, v) => {
        const [key, id] = String(v).split('|');
        editSurface(ctx, key, s => { s.openings = (s.openings || []).filter(o => o.id !== id); });
      },
    },
    demoFill(p) { if (!canContinue(p).ok) p.room = D.demoRoom(); },
  });
})(window.AM);
