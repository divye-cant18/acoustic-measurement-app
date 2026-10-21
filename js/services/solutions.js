/* Acoustic solutions — the product catalogue (AM.services.catalog, the NRC Master File) organised for choosing: products
   in everyday categories, and each product's versions (thickness, weight, size) together under one name.

   Nothing here adds product data. A category is a way of grouping by what a product is, read from its own name in the
   source (a cloud, a tile, wallpaper …); a solution is every product in the source with the same range and name (the
   numbered types of one name, "-90", "-75", "-50", together); its
   description is put together only from its own data (range, finish, thickness, sizes, where it is applied, how many
   tested mountings, the tested NRC). The source has no floor products, so there is no floor category.

   Contract:
     CATEGORIES                     -> [{ id, name, purpose, where }] in display order
     all()                          -> every solution: { key, name, types, range, category, kind, products: [variants], surfaces,
                                       thickness: [min, max] mm, sizes: [labels], mountings, nrcMin, nrcMax }
     byCategory(id)                 -> the solutions of one category
     get(key) / ofProduct(id)       -> one solution
     search(query)                  -> solutions whose name, range or finish matches every word
     variantLabel(solution, product)-> what tells this version apart from the others ("Type 90 · 25 mm · 3600 GSM")
     summary(solution)              -> one sentence from its data
     whereText(solution)            -> "For walls", "For ceilings", "For walls and ceilings" */
(function (AM) {
  'use strict';
  const CAT = AM.services.catalog, { isNum } = AM.util;

  // In display order. `where` only draws the small room diagram on the card (which surface it goes on).
  const CATEGORIES = [
    { id: 'clouds', name: 'Ceiling clouds', purpose: 'Shapes hung below the ceiling, spread over the room.', where: 'ceiling', match: n => /cloud/.test(n) },
    { id: 'panels', name: 'Wall panels', purpose: 'Large flat or printed panels, mostly for walls.', where: 'wall', match: () => true },
    { id: 'textured', name: 'Textured and 3D panels', purpose: 'Panels with a fluted, embossed or patterned face.', where: 'wall', match: n => /fluted|3d|embossed|rain pattern|penray/.test(n) },
    { id: 'tiles', name: 'Tiles and strips', purpose: 'Small modules: wall tiles, ceiling grid tiles and laminated strips.', where: 'both', match: n => /tile|strip/.test(n) },
    { id: 'wallpaper', name: 'Acoustic wallpaper', purpose: 'A thin absorbing wall covering, in sheets.', where: 'wall', match: n => /wallpaper/.test(n) },
    { id: 'wool', name: 'Polyester wool and infill', purpose: 'Soft polyester boards and infill, from thin to very thick.', where: 'wall', match: n => /pet wool|infill/.test(n) },
  ];
  // The order in which the rules are tried: the most specific first, plain panels last.
  const RULE_ORDER = ['clouds', 'wallpaper', 'wool', 'tiles', 'textured', 'panels'];
  const categoryOf = name => {
    const n = String(name).toLowerCase();
    return RULE_ORDER.find(id => CATEGORIES.find(c => c.id === id).match(n));
  };

  // The drawing for a solution, from its name (src/ui/solutions.tsx draws each kind).
  function kindOf(name, category) {
    const n = String(name).toLowerCase(), d3 = /3d/.test(n);
    if (category === 'clouds') {
      if (/round/.test(n)) return d3 ? 'cloud-round-3d' : 'cloud-round';
      if (/hexagon/.test(n)) return d3 ? 'cloud-hex-3d' : 'cloud-hex';
      if (/petal/.test(n)) return d3 ? 'cloud-petal-3d' : 'cloud-petal';
      if (/square/.test(n)) return 'cloud-square';
      if (/pet panel cloud/.test(n)) return d3 ? 'cloud-mixed-3d' : 'cloud-mixed';
      return 'cloud-rect';
    }
    if (category === 'wallpaper') return 'roll';
    if (category === 'wool') return 'wool';
    if (category === 'tiles') return /strip/.test(n) ? 'strips' : /panel vmt tile/.test(n) ? 'grid' : 'tiles';
    if (category === 'textured') return /fluted/.test(n) ? 'fluted' : /rain/.test(n) ? 'rain' : /penray/.test(n) ? 'penray' : 'relief';
    return /printed/.test(n) ? 'printed' : 'panel';
  }

  let cache = null;
  function build() {
    const by = new Map();
    CAT.getProducts().forEach(p => {
      // One product per range and name as listed in the source; the types of one name ("-90", "-75", "-50") together.
      const key = p.type ? `${p.category}|${p.sourceName.replace(/-\d{2,3}\s*$/, '').trim()}|types` : `${p.category}|${p.sourceName}`;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(p);
    });
    return [...by.entries()].map(([key, products]) => {
      const p0 = products[0], category = categoryOf(p0.sourceName);
      const types = [...new Set(products.map(p => p.type).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
      const name = types.length ? `${p0.name.replace(/, type \d+$/, '')}, types ${types.length > 1 ? `${types.slice(0, -1).join(', ')} and ${types[types.length - 1]}` : types[0]}` : p0.name;
      // Versions by type (highest number first), then from thin to thick, then light to heavy, as listed otherwise.
      products = products.slice().sort((a, b) => (Number(b.type) || 0) - (Number(a.type) || 0) || (a.thickness.mm || 0) - (b.thickness.mm || 0) || (a.gsm.value || 0) - (b.gsm.value || 0));
      const sums = products.map(p => CAT.getSummary(p.id) || {}), nrcs = sums.flatMap(s => [s.nrcMin, s.nrcMax]).filter(isNum);
      const th = products.map(p => p.thickness.mm).filter(isNum);
      return {
        key, name, types, range: p0.category, category, kind: kindOf(p0.sourceName, category), products,
        surfaces: [...new Set(products.flatMap(p => p.application.surfaces || []))],
        finishes: [...new Set(products.map(p => p.finish).filter(Boolean))],
        thickness: th.length ? [Math.min(...th), Math.max(...th)] : null,
        sizes: [...new Set(products.flatMap(p => p.size.options.map(o => o.label)))],
        mountings: sums.reduce((s, x) => s + (x.configurationCount || 0), 0),
        nrcMin: nrcs.length ? Math.min(...nrcs) : null, nrcMax: nrcs.length ? Math.max(...nrcs) : null,
      };
    });
  }
  const all = () => (cache || (cache = build()));
  const byCategory = id => all().filter(s => s.category === id);
  const get = key => all().find(s => s.key === key) || null;
  const ofProduct = id => all().find(s => s.products.some(p => p.id === id)) || null;
  function search(query) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return all().filter(s => {
      const text = [s.name, s.range, ...s.finishes, ...s.products.map(p => `${p.thickness.raw || ''} mm ${p.gsm.raw || ''} gsm`)].join(' ').toLowerCase();
      return words.every(w => text.includes(w));
    });
  }

  // What tells one version apart from the others of its solution: only the fields that differ between them.
  function variantLabel(sol, p, opts) {
    const vary = f => new Set(sol.products.map(f)).size > 1, withType = !opts || opts.type !== false;
    return [
      withType && vary(x => x.type) && p.type ? `Type ${p.type}` : null,
      vary(x => x.thickness.mm) && isNum(p.thickness.mm) ? `${p.thickness.mm} mm` : null,
      vary(x => x.gsm.raw) && p.gsm.raw ? `${p.gsm.raw} GSM` : null,
      vary(x => x.finish) ? p.finish : null,
      vary(x => x.size.raw) ? p.size.raw : null,
    ].filter(Boolean).join(' · ') || p.size.raw || 'Standard';
  }

  const whereText = s => (s.surfaces.includes('Wall') && s.surfaces.includes('Ceiling') ? 'For walls and ceilings' : s.surfaces.includes('Ceiling') ? 'For ceilings' : s.surfaces.includes('Wall') ? 'For walls' : 'Where it goes is not stated in the source');
  const mm = t => (!t ? null : t[0] === t[1] ? `${t[0]} mm thick` : `${t[0]}–${t[1]} mm thick`);
  // One sentence from the solution's own data.
  function summary(s) {
    const versions = s.products.length > 1 ? `${s.products.length} versions` : null;
    return [`${s.range} range`, s.finishes.join(' / '), mm(s.thickness), versions].filter(Boolean).join(' · ');
  }

  AM.services.solutions = { CATEGORIES: CATEGORIES.map(({ match, ...c }) => c), categoryOf, all, byCategory, get, ofProduct, search, variantLabel, whereText, summary };
})(window.AM);
