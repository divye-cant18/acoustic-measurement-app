/* ProductCatalog — SOURCE DATA (NRC Master File).

   Serves the structured product database that tools/import-products.ps1 builds from the source Excel
   (js/data/products.generated.js, same content as data/products.json). The UI never reads the Excel layout,
   so the storage behind this service can change without touching the screens.

   Data model
     Product        one sellable variant: identity, sizes, GSM, thickness, application, fire ratings, certifications
     Configuration  one tested mounting of one product (one source row): certificate, testing condition,
                    reported NRC / class / αw, and α at every frequency in the source
   Configurations are never merged or averaged. α values are exactly as in the source; unusable cells are null.
   Only getOctaveAbsorption forms octave-band values from them, for calculations (see its note).

   Contract
     getSource()                               -> { file, sheet, rows, importedAt, test, counts, frequencies }
     getColumns()                              -> fire and certification column definitions, with source notes
     getFrequencies()                          -> [100, 125, …, 5000] Hz, as present in the source
     getCategories()                           -> ['UNIZEN', 'UNIVIC', …] in source order
     getProducts({ query, category, surface }) -> Product[] in source order
     getProduct(productId)                     -> Product | null
     getAcousticConfigurations(productId)      -> Configuration[]
     getAcousticConfiguration(configId)        -> Configuration | null
     getFrequencyResponse(configId)            -> [{ f, alpha, sourceValue }]
     getAbsorptionAt(configId, freqs)          -> { values: { [f]: α | null }, missing: [f] }   exact bands, never interpolated
     getOctaveAbsorption(configId, octaves)    -> { values: { [f]: α | null }, missing: [f], thirds: { [f]: [f1, f2, f3] },
                                                    capped: [f] }
         The α of each OCTAVE band, for calculations with octave-band reverberation times (the prediction). The source
         is in one-third-octave bands, so an octave's α is the mean of the three one-third-octave values inside it
         (e.g. 800, 1000 and 1250 Hz for 1 kHz), rounded to 0.01 and limited to 1.00, as ISO 11654 forms the practical
         absorption coefficient (there rounded to 0.05). Laboratory values above 1.00 come from the edges of the test
         specimen; no surface absorbs more sound than reaches it. An octave without all three values has none. */
(function (AM) {
  'use strict';

  const DATA = AM.productData || { products: [], configurations: [], frequencies: [], source: {}, test: {}, counts: {}, columns: { fire: [], certifications: [] } };
  const products = DATA.products;
  const configurations = DATA.configurations;
  const productById = new Map(products.map(p => [p.id, p]));
  const configById = new Map(configurations.map(c => [c.id, c]));

  // Browsing helpers derived once from the data (kept beside the products, never written back to the source).
  const summaries = new Map();
  const searchWords = new Map();
  // Search matches the start of whole words, so "02" finds "PENRAY 02" but not the digits inside "3100022894".
  const words = text => String(text).toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);
  products.forEach(p => {
    const cs = p.configurationIds.map(id => configById.get(id)).filter(Boolean);
    const nrcs = cs.map(c => c.ratings.nrc).filter(x => typeof x === 'number');
    const warnings = p.flags.filter(f => f.severity === 'warning').length + cs.reduce((n, c) => n + c.flags.filter(f => f.severity === 'warning').length, 0);
    summaries.set(p.id, { configurationCount: cs.length, nrcMin: nrcs.length ? Math.min(...nrcs) : null, nrcMax: nrcs.length ? Math.max(...nrcs) : null, warnings });
    searchWords.set(p.id, words([p.name, p.category, p.finish, `${p.gsm.raw} gsm`, `${p.thickness.raw} mm`, p.size.raw, p.application.raw,
      ...cs.map(c => c.label), ...cs.map(c => c.test.certificate)].filter(Boolean).join(' ')));
  });

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  function getSource() {
    const s = DATA.source || {};
    return { file: s.file, sheet: s.sheet, title: s.title, rows: [s.firstRow, s.lastRow], sha256: s.sha256, importedAt: s.importedAt, test: DATA.test || {}, counts: DATA.counts || {}, frequencies: DATA.frequencies, bandType: DATA.bandType };
  }

  function getProducts({ query = '', category = 'All', surface = 'Any' } = {}) {
    const tokens = words(query);
    return products.filter(p =>
      (category === 'All' || p.category === category) &&
      (surface === 'Any' || p.application.surfaces.includes(surface)) &&
      tokens.every(t => searchWords.get(p.id).some(w => w.startsWith(t))));
  }

  const getProduct = id => productById.get(id) || null;
  const getSummary = id => summaries.get(id) || null;
  const getAcousticConfiguration = id => configById.get(id) || null;
  function getAcousticConfigurations(productId) {
    const p = getProduct(productId);
    return p ? p.configurationIds.map(id => configById.get(id)).filter(Boolean) : [];
  }

  function getFrequencyResponse(configId) {
    const c = getAcousticConfiguration(configId);
    if (!c) return [];
    return DATA.frequencies.map(f => {
      const k = String(f), v = c.absorption[k];
      return { f, alpha: typeof v === 'number' ? v : null, sourceValue: c.sourceValues && k in c.sourceValues ? c.sourceValues[k] : null };
    });
  }

  function getAbsorptionAt(configId, freqs) {
    const c = getAcousticConfiguration(configId);
    const values = {}, missing = [];
    freqs.forEach(f => {
      const v = c ? c.absorption[String(f)] : undefined;
      values[f] = typeof v === 'number' ? v : null;
      if (values[f] === null) missing.push(f);
    });
    return { values, missing };
  }

  // The source's one-third-octave bands inside one octave: fc / 2^(1/3), fc, fc · 2^(1/3) (nominal frequencies).
  const nearest = x => DATA.frequencies.reduce((b, f) => (Math.abs(Math.log(f / x)) < Math.abs(Math.log(b / x)) ? f : b), DATA.frequencies[0]);
  const thirdsOf = fc => [fc / Math.cbrt(2), fc, fc * Math.cbrt(2)].map(nearest).filter(f => Math.abs(Math.log2(f / fc)) < 0.5);
  const isOneThird = () => DATA.bandType === 'one-third-octave';

  function getOctaveAbsorption(configId, octaves) {
    const c = getAcousticConfiguration(configId);
    const values = {}, missing = [], thirds = {}, capped = [];
    octaves.forEach(fc => {
      const fs = isOneThird() ? thirdsOf(fc) : [fc];
      const vs = fs.map(f => (c ? c.absorption[String(f)] : undefined));
      thirds[fc] = fs;
      if (!c || fs.length !== (isOneThird() ? 3 : 1) || !vs.every(v => typeof v === 'number')) { values[fc] = null; missing.push(fc); return; }
      // Rounded to 0.01, the precision of the source, so a calculation printed with these values adds up as shown.
      const mean = Math.round((vs.reduce((s, v) => s + v, 0) / vs.length) * 100 + 1e-9) / 100;
      if (mean > 1) capped.push(fc);
      values[fc] = Math.min(1, mean);
    });
    return { values, missing, thirds, capped };
  }

  AM.services.catalog = {
    kind: 'source-data',
    getSource,
    getColumns: () => DATA.columns,
    getFrequencies: () => DATA.frequencies.slice(),
    getCategories: () => categories.slice(),
    getProducts,
    getProduct,
    getSummary,
    getAcousticConfigurations,
    getAcousticConfiguration,
    getFrequencyResponse,
    getAbsorptionAt,
    getOctaveAbsorption,
  };
})(window.AM);
