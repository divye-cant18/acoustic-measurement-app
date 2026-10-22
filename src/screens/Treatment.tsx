/* Step 8 · Treatment — build a treatment plan: one or more products, each in one of its tested configurations, with its
   own amount and placement. Product data comes only from AM.services.catalog; the project keeps the plan
   (js/stages/treatment.js). The prediction adds every item's own area × α band by band. */
import { acoustics, am, CAT, D, DEMO, fmt, isNum, RA, SURF, TGT, ui } from '../lib';
import type { Ctx, PrimaryAction, Project } from '../am';
import { MountArt, RoomPreview, SolutionArt } from '../ui/solutions';
import { AmountSlider, amountWords, Btn, Card, Chart, CoverageWarning, Icon, Kv, KvNote, Legend, More, Note, Pill, ResultPill, SelectInput, soundsAdvice, soundsText, SubH, TableWrap, whereWords } from '../ui/kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
const variantText = (p: any) => [p.category, p.finish, p.gsm.raw && `${p.gsm.raw} GSM`, p.thickness.raw && `${p.thickness.raw} mm`, p.size.raw].filter(Boolean).join(' · ');
const trimNum = am.util.trimNum;

const FlagList = ({ flags }: { flags: any[] }) => (!flags.length ? null : (
  <ul className="flags">{flags.map((f, i) => <li className={`flag flag-${f.severity}`} key={i}><Icon name={f.severity === 'warning' ? 'alert' : 'info'} size={14} sw={2} /><span>{f.message}</span></li>)}</ul>
));

/* ---------- the solutions explorer: categories → products → one product, the selection kept throughout ----------
   AM.services.solutions groups the catalogue: everyday categories, and each product's versions under one name. Moving
   between the views is screen state (ui.catalog); what is chosen is the plan, so nothing is lost on the way. */
const SOL = () => (am.services as any).solutions;
const nrcText = (s: any) => (s.nrcMin == null ? null : s.nrcMin === s.nrcMax ? `Tested NRC ${s.nrcMin.toFixed(2)}` : `Tested NRC ${s.nrcMin.toFixed(2)}–${s.nrcMax.toFixed(2)}`);
const solOf = (it: any) => SOL().ofProduct(it.product.id);
const chosenIn = (p: Project, sol: any) => D.treatmentItems(p).filter((it: any) => sol.products.some((x: any) => x.id === it.product.id));
/* The bands a version's tests leave without a value, of those this room is judged in (none: it can be predicted here):
   the fewest over its tested mountings. */
function missingFor(p: Project, product: any): number[] {
  const used: number[] = D.summaryBands(p), cfgs: any[] = CAT.getAcousticConfigurations(product.id);
  if (!cfgs.length) return used;
  return cfgs.map(c => used.filter(f => CAT.getOctaveAbsorption(c.id, DEMO.BANDS).missing.includes(f))).sort((x, y) => x.length - y.length)[0];
}

const mmText = (t: [number, number] | null) => (!t ? null : t[0] === t[1] ? `${t[0]} mm` : `${t[0]}–${t[1]} mm`);
const nOf = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function SolutionCard({ p, sol }: { p: Project; sol: any }) {
  const mine = chosenIn(p, sol).length, nrc = nrcText(sol);
  return (
    <li>
      <button type="button" className={mine ? 'sol-card is-chosen' : 'sol-card'} data-action="solOpen" data-value={sol.key}>
        <span className="sol-pic"><SolutionArt kind={sol.kind} mm={sol.thickness ? sol.thickness[1] : null} /></span>
        <span className="sol-body">
          <span className="sol-name">{sol.name}</span>
          <span className="sol-meta">{SOL().summary(sol)}</span>
          <span className="sol-tags"><span className="chip-sm">{SOL().whereText(sol)}</span>{nrc ? <span className="chip-sm">{nrc}</span> : null}</span>
          <span className="sol-col-foot"><span>{sol.products.length > 1 ? nOf(sol.products.length, 'version') : '1 version'}</span><span className="sol-go">View<Icon name="arrowR" size={14} sw={2.2} /></span></span>
        </span>
        {mine ? <span className="sol-chosen"><Icon name="check" size={13} sw={2.6} />In your selection</span> : null}
      </button>
    </li>
  );
}

/* A category as a catalogue collection: a drawing of a typical product in it, its name, what it is, the finishes of its
   products (from the data), how many there are. */
const CATEGORY_ART: Record<string, string> = { clouds: 'cloud-hex', panels: 'printed', textured: 'fluted', tiles: 'tiles', wallpaper: 'roll', wool: 'wool' };
const WHERE_SHORT: Record<string, string> = { ceiling: 'Ceiling', wall: 'Walls', both: 'Walls and ceilings' };
function CategoryCard({ p, c }: { p: Project; c: any }) {
  const list: any[] = SOL().byCategory(c.id), chosen = list.filter((s: any) => chosenIn(p, s).length).length;
  const finishes = [...new Set(list.flatMap((s: any) => s.finishes))].join(' / ');
  return (
    <li>
      <button type="button" className="sol-col" data-action="solCategory" data-value={c.id}>
        <span className="sol-pic">
          <SolutionArt kind={CATEGORY_ART[c.id] || (list[0] && list[0].kind) || 'panel'} />
          <span className="sol-col-where">{WHERE_SHORT[c.where] || ''}</span>
          {chosen ? <span className="sol-chosen"><Icon name="check" size={13} sw={2.6} />{`${chosen} chosen`}</span> : null}
        </span>
        <span className="sol-col-body">
          <span className="sol-col-name">{c.name}</span>
          <span className="sol-col-sub">{c.purpose}</span>
          {finishes ? <span className="sol-col-fin">{finishes}</span> : null}
          <span className="sol-col-foot"><span>{nOf(list.length, 'product')}</span><span className="sol-go">View products<Icon name="arrowR" size={14} sw={2.2} /></span></span>
        </span>
      </button>
    </li>
  );
}

// The search box writes screen state (data-uibind), not project data.
function SearchBox({ value }: { value: string }) {
  return <input id="cat-q" type="text" data-uibind="catalog.query" defaultValue={value} placeholder="Search by name, range, thickness or weight" autoComplete="off" aria-label="Search all products" />;
}

function ProductPage({ ctx, sol }: { ctx: Ctx; sol: any }) {
  const p = ctx.project, S = SOL(), c = ctx.state.ui.catalog;
  const mine = chosenIn(p, sol), active = mine.find((it: any) => it.id === p.treatment.active) || mine[0] || null;
  const shown = active ? active.product : (sol.products.find((x: any) => x.id === c.variant) || sol.products[0]);
  const a = D.assessment(p) as any, pred = D.prediction(p) as any, nrc = nrcText(sol), gap = missingFor(p, shown);
  // Versions (thickness, weight, size): chips, or a list when there are many.
  const versions = sol.products.length < 2 ? null : sol.products.length > 8
    ? <SelectInput id="sol-version" label="Version" changeAction="solVariant" value={shown.id} options={sol.products.map((x: any) => ({ value: x.id, label: S.variantLabel(sol, x) }))} />
    : (
      <div className="sol-versions" role="group" aria-label="Version">
        <span className="as-k">Version</span>
        <div className="chips">{sol.products.map((x: any) => { const no = missingFor(p, x).length > 0; return <button type="button" key={x.id} className={no ? 'chip is-nodata' : 'chip'} data-action="solVariant" data-value={x.id} aria-pressed={x.id === shown.id} title={no ? 'Its test has no value in a band this room is judged on' : undefined}>{S.variantLabel(sol, x)}{no ? ' · no test data here' : ''}</button>; })}</div>
      </div>
    );
  // The facts row, as in a catalogue: all from the data.
  const cat = S.CATEGORIES.find((x: any) => x.id === sol.category), thick = shown.thickness && isNum(shown.thickness.mm) ? shown.thickness.mm : null;
  // A mounting picked before the product is added (screen state); used when it is added.
  const cfgsShown: any[] = CAT.getAcousticConfigurations(shown.id), picked = !active && c.config && cfgsShown.some((x: any) => x.id === c.config) ? c.config : null;
  const specs: [string, string][] = [
    ['Finish', sol.finishes.join(' / ') || 'Not stated'],
    ['Thickness', mmText(sol.thickness) || 'Not stated'],
    ['Tested NRC', nrc ? nrc.replace('Tested NRC ', '') : 'Not stated'],
    ['Mounting', nOf(cfgsShown.length, 'tested way')],
  ];
  return (
    <div className="sol-product">
      <div className="sol-hero">
        <figure className="sol-stage">
          <SolutionArt kind={sol.kind} mm={thick} variant="hero" />
          <figcaption>{`Drawing for illustration${sol.products.length > 1 ? `, shown at ${S.variantLabel(sol, shown)}` : ''}. Thicker versions are drawn deeper.`}</figcaption>
        </figure>
        <div className="sol-hero-t">
          <span className="sol-eyebrow">{`${cat ? cat.name : 'Product'} · ${sol.range} range`}{active ? <span className="sol-chosen"><Icon name="check" size={13} sw={2.6} />In your selection</span> : null}</span>
          <h3 className="sol-title is-big">{sol.name}<span className="sol-title-2">{S.whereText(sol)}</span></h3>
          <dl className="sol-specs">{specs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {versions}
          {sol.types && sol.types.length > 1 ? <p className="small muted">{`Types ${sol.types.slice(0, -1).join(', ')} and ${sol.types[sol.types.length - 1]} are named this way in the UniVicoustic product list, which does not describe how they differ. Pick a type under Version and compare their tested absorption under How it is mounted.`}</p> : null}
          <p className="small muted">{`Sizes: ${shown.size.raw || 'not stated in the source'}`}</p>
          {gap.length ? <Note tone="warn">{`This version's test has no absorption value at ${fmt.hzList(gap)}, which this room is judged on, so its effect cannot be predicted here. Choose another version${sol.products.length > 1 ? '' : ' or another product'}.`}</Note> : null}
        </div>
      </div>
      {gap.length ? null : <MountingPicker p={p} product={shown} active={active} picked={picked} richer={sol.products.filter((x: any) => x.id !== shown.id && CAT.getAcousticConfigurations(x.id).length > cfgsShown.length).map((x: any) => S.variantLabel(sol, x))} />}
      {active ? <>
        <div className="grid split"><AmountCard p={p} sel={active} pred={pred} a={a} /><ProductDetails sel={active} refBand={DEMO.REFERENCE_BAND} /></div>
        <div className="sol-actions">
          <Btn action="removeItem" value={active.id} variant="ghost" icon="trash">Remove from my selection</Btn>
          <Btn action="solHome" icon="check">Done: choose another product</Btn>
        </div>
      </> : (
        <div className="sol-add">
          <div className="sol-add-t"><b>Not in your selection yet</b><span className="small muted">{picked ? 'Add it, mounted as you picked above, and the app works out how much your room needs. You can change both afterwards.' : 'Add it, and the app picks the best mounting and works out how much your room needs. You can change both afterwards.'}</span></div>
          <Btn action="solAdd" value={shown.id} variant="primary" icon="plus" reason={gap.length ? 'This version has no test data for a band this room is judged on. Choose another version.' : undefined}>Add to my selection</Btn>
        </div>
      )}
    </div>
  );
}

function Explorer({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, c = ctx.state.ui.catalog, S = SOL();
  const view = c.view || 'home', cat = S.CATEGORIES.find((x: any) => x.id === c.cat) || null, sol = c.group ? S.get(c.group) : null;
  let body;
  if (view === 'product' && sol) body = <ProductPage ctx={ctx} sol={sol} />;
  else if (view === 'category' && cat) {
    body = <>
      <div className="sol-head"><span className="sol-mini is-head" aria-hidden="true"><SolutionArt kind={CATEGORY_ART[cat.id] || 'panel'} variant="mini" /></span><div><span className="sol-eyebrow">{`${WHERE_SHORT[cat.where] || ''} · ${nOf(S.byCategory(cat.id).length, 'product')}`}</span><h3 className="sol-title">{cat.name}</h3><p className="small muted">{cat.purpose}</p></div></div>
      <ul className="sol-grid">{S.byCategory(cat.id).map((s: any) => <SolutionCard key={s.key} p={p} sol={s} />)}</ul>
    </>;
  } else {
    const q = String(c.query || '').trim(), found: any[] | null = q ? S.search(q) : null;
    body = <>
      <label className="search sol-search" htmlFor="cat-q"><Icon name="search" size={16} sw={2} /><SearchBox value={c.query} /></label>
      {found
        ? (found.length ? <><p className="small muted">{`${found.length} product${found.length === 1 ? '' : 's'} found`}</p><ul className="sol-grid">{found.map((s: any) => <SolutionCard key={s.key} p={p} sol={s} />)}</ul></>
          : <div className="cat-empty">No products match. Try fewer words, or choose a category.</div>)
        : <ul className="sol-cats">{S.CATEGORIES.map((x: any) => <CategoryCard key={x.id} p={p} c={x} />)}</ul>}
    </>;
  }
  return (
    <section className="card sol" id="solutions" aria-label="Acoustic solutions">
      <div className="sol-top">
        <div className="sol-where">
          <nav className="sol-crumbs" aria-label="Where you are in the products">
            {view === 'home' ? <span aria-current="page">All solutions</span> : <button type="button" data-action="solHome"><Icon name="chevL" size={15} sw={2.2} />All solutions</button>}
            {cat && view !== 'home' ? <><Icon name="chevR" size={14} sw={2} />{view === 'category' ? <span aria-current="page">{cat.name}</span> : <button type="button" data-action="solCategory" data-value={cat.id}>{cat.name}</button>}</> : null}
            {sol && view === 'product' ? <><Icon name="chevR" size={14} sw={2} /><span aria-current="page">{sol.name}</span></> : null}
          </nav>
          <span className="small muted">{`${S.all().length} products, each with tested sound absorption`}</span>
        </div>
        {/* Official UniVicoustic websites, in a new tab. Links only: nothing from this project is sent to them, and a
            product is used here only when it is chosen in this list (the prediction uses its tested data). */}
        <div className="sol-links" role="group" aria-label="UniVicoustic websites">
          <a className="btn btn-secondary sol-link" href={am.brand.links.catalogue} target="_blank" rel="noopener noreferrer"
            title="Opens the UniVicoustic product catalogue in a new tab. Nothing from this project is sent to it." aria-label="Product catalogue (opens in a new tab)">
            <Icon name="panels" size={16} sw={2} />Product catalogue<span className="ext-arrow" aria-hidden="true">↗</span>
          </a>
          <a className="btn btn-secondary sol-link is-config" href={am.brand.links.configurator} target="_blank" rel="noopener noreferrer"
            title="Opens the UniVicoustic panel and wall configurator in a new tab, where you sign in. It does not receive this room, the products or the results." aria-label="Wall configurator (opens in a new tab)">
            <Icon name="wall" size={16} sw={2} />Wall configurator<span className="ext-arrow" aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      {body}
    </section>
  );
}

/* ---------- how it is mounted: every tested way for the version shown, side by side ----------
   Each mounting is a tested configuration from the source: a cut-through drawing, its name in plain words, how much
   it absorbs of low sounds, voices and high sounds (its octave-band α, AM.derive.SOUND_GROUPS) and its NRC. In the
   selection a choice changes the item's mounting (pickConfig) and the amounts are worked out again; before the
   product is added it is kept for when it is (solMount). A mounting without a test value in a band this room is
   judged on cannot be predicted, so it cannot be chosen. */
function mountTitle(k: any): string {
  if (k.mounting === 'Direct fix') return k.backing ? 'Fixed flat, on a backing panel' : 'Fixed flat to the surface';
  if (k.mounting === 'Air gap') {
    const fill = k.cavityFill ? `, filled with ${k.cavityFill.material}${isNum(k.cavityFill.thicknessMm) ? ` (${trimNum(k.cavityFill.thicknessMm)} mm)` : ''}` : '';
    return `${isNum(k.airGapMm) ? `${trimNum(k.airGapMm)} mm air gap` : 'Air gap'} behind it${fill}`;
  }
  return k.backing ? 'On a backing panel' : 'How it was tested is not stated';
}
const mountExtras = (k: any): string[] => [
  k.backing ? `Backing: ${k.backing.description}${isNum(k.backing.thicknessMm) ? ` ${trimNum(k.backing.thicknessMm)} mm` : ''}` : null,
  k.sourceFacing ? String(k.sourceFacing).replace(/^./, (ch: string) => ch.toUpperCase()) : null,
].filter(Boolean) as string[];
function absorbsBy(cfgId: string) {
  const oct = CAT.getOctaveAbsorption(cfgId, DEMO.BANDS).values, groups: any[] = (D as any).SOUND_GROUPS || [];
  return groups.map(g => { const v = g.bands.map((f: number) => oct[f]).filter(isNum); return { id: g.id, label: g.label, v: v.length ? v.reduce((s: number, x: number) => s + x, 0) / v.length : null }; });
}
function MountingPicker({ p, product, active, picked, richer }: { p: Project; product: any; active: any; picked: string | null; richer: string[] }) {
  const cfgs: any[] = CAT.getAcousticConfigurations(product.id), used: number[] = D.summaryBands(p);
  if (!cfgs.length) return null;
  const current = active && active.configuration ? active.configuration.id : null, rec = active ? active.recommendedConfig : null, one = cfgs.length === 1;
  const on = (id: string) => one || (active ? current === id : picked === id);
  const sub = one ? `This version was tested one way only.${richer.length ? ` More ways were tested for ${richer.join(', ')}: choose that version above to see them.` : ''}`
    : active ? (current && current === rec ? `${cfgs.length} tested ways for this version. The app picked the best one for your room; choose another if it will be installed differently.` : `${cfgs.length} tested ways for this version. You picked this one; the app's best for your room is marked.`)
      : `${cfgs.length} tested ways for this version. The app picks the best one for your room when you add it, or choose one yourself if you know how it will be installed.`;
  return (
    <Card icon="wall" title="How it is mounted" sub={sub} cls="mt-card" id="mounting"
      right={active && rec && current !== rec ? <Btn action="pickConfig" value={rec} size="sm" cls="btn-wrap">Use the app's choice</Btn> : null}>
      {one ? null : <p className="small muted">An air gap or a filling behind a panel usually helps it absorb lower sounds, and needs more depth on the wall. The bars show how much of the sound each tested way absorbs.</p>}
      <ul className="mt-grid" role="list">
        {!active && !one ? (
          <li>
            <button type="button" className="mt mt-auto" data-action="solMount" data-value="" aria-pressed={!picked}>
              <span className="mt-on" aria-hidden="true"><Icon name="check" size={13} sw={2.6} /></span>
              <span className="mt-pic"><Icon name="seal" size={30} sw={1.6} /></span>
              <span className="mt-body">
                <span className="mt-title">Let the app choose</span>
                <span className="small muted">It tries every tested way in your room and keeps the one that reaches the target with the least material.</span>
              </span>
            </button>
          </li>
        ) : null}
        {cfgs.map(x => {
          const miss = used.filter(f => CAT.getOctaveAbsorption(x.id, DEMO.BANDS).missing.includes(f)), warn = x.flags.filter((f: any) => f.severity === 'warning').length;
          const extras = mountExtras(x.condition);
          return (
            <li key={x.id}>
              <button type="button" className="mt" data-action={active ? 'pickConfig' : 'solMount'} data-value={x.id} aria-pressed={on(x.id)} disabled={miss.length > 0 || (one && !active)}
                title={miss.length ? `Its test has no value at ${fmt.hzList(miss)}, which this room is judged on` : undefined}>
                <span className="mt-on" aria-hidden="true"><Icon name="check" size={13} sw={2.6} /></span>
                <span className="mt-pic"><MountArt cond={x.condition} /></span>
                <span className="mt-body">
                  <span className="mt-title">{mountTitle(x.condition)}</span>
                  {x.id === rec ? <span className="mt-rec"><Icon name="seal" size={12} sw={2.2} />Best for this room</span> : null}
                  {extras.length ? <span className="cfg-chips">{extras.map((t, i) => <span className="chip-sm" key={i}>{t}</span>)}</span> : null}
                  <span className="mt-bars" aria-label="How much of the sound it absorbs">
                    {absorbsBy(x.id).map(g => (
                      <span className="mt-bar" key={g.id}>
                        <span className="mt-bk">{g.label}</span>
                        <span className="mt-track"><i style={{ width: `${g.v != null ? Math.round(Math.min(1, g.v) * 100) : 0}%` }} /></span>
                        <span className="mt-bv">{g.v != null ? `${Math.round(Math.min(1, g.v) * 100)} %` : '—'}</span>
                      </span>
                    ))}
                  </span>
                  <span className="mt-foot">{[`NRC ${x.ratings.nrc != null ? x.ratings.nrc.toFixed(2) : '—'}`, warn ? `${warn} to check in the test data` : null, miss.length ? `no test value at ${fmt.hzList(miss)}` : null].filter(Boolean).join(' · ')}</span>
                  <span className="mt-src">{`As tested: ${x.label}`}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- selected product, its configurations, and the chosen configuration's α(f) ---------- */
function ProductDetails({ sel, refBand }: { sel: any; refBand: number }) {
  const p = sel.product, c = sel.configuration, cfgs: any[] = CAT.getAcousticConfigurations(p.id);
  const columns = CAT.getColumns();
  const noteFor = (defs: any[], key: string) => (defs.find(d => d.key === key) || { notes: [] }).notes;
  let detail;
  if (c) {
    const fr: any[] = CAT.getFrequencyResponse(c.id);
    // The prediction works in octave bands: each octave's α is the mean of its three one-third-octave values, ≤ 1.00.
    const oct = CAT.getOctaveAbsorption(c.id, DEMO.BANDS);
    const grouped = DEMO.BANDS.flatMap((f: number) => oct.thirds[f]).join() === fr.map(x => x.f).join();
    const octCell = (f: number) => (oct.values[f] != null ? oct.values[f].toFixed(2) : <span className="cell-missing">—</span>);
    const above1 = fr.some(x => x.alpha != null && x.alpha > 1);
    detail = (
      <div className="cfg-detail">
        <SubH>{`Sound absorption by frequency · ${c.label}`}</SubH>
        <Chart type="bands" spec={{ freqs: fr.map(x => x.f), series: [{ label: 'α', kind: 'material', values: fr.map(x => x.alpha) }], emphasis: fr.map(x => x.f), ticks: DEMO.BANDS, label: refBand, digits: 2, unit: '', step: 0.25, height: 210, yTitle: 'α', missingText: 'no usable value in the source', aria: `Absorption coefficient by one-third-octave band, ${c.label}` }} height={210} />
        <Legend items={[['material', 'α as tested, one-third-octave bands']]} />
        <TableWrap>
          <table className="tbl alpha-tbl">
            <thead><tr><th>Hz</th>{fr.map(x => <th className="r" key={x.f}>{x.f}</th>)}</tr></thead>
            <tbody>
              <tr><td>α</td>{fr.map(x => <td className="r" key={x.f}>{x.alpha != null ? x.alpha.toFixed(2) : <span className="cell-missing" title={`Source cell: ${x.sourceValue || 'empty'}`}>—</span>}</td>)}</tr>
              {grouped ? <tr className="alpha-oct"><td>Octave α used</td>{DEMO.BANDS.map((f: number) => <td className="is-used" colSpan={3} key={f}><span className="muted">{f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`}</span>{' '}{octCell(f)}</td>)}</tr> : null}
            </tbody>
          </table>
        </TableWrap>
        {grouped ? null : <p className="small">{'Octave-band α used by the prediction: '}{DEMO.BANDS.map((f: number, i: number) => <span key={f}>{i ? ' · ' : ''}{`${fmt.hz(f)} `}{octCell(f)}</span>)}</p>}
        <p className="small muted">{`The prediction uses one α per octave band: the mean of the three one-third-octave values inside it, at most 1.00 (as ISO 11654 forms the practical absorption coefficient).${above1 ? ' Values above 1.00 are as reported by the test, which is common in reverberation-room measurements; no surface absorbs more sound than reaches it.' : ''}`}</p>
        <FlagList flags={[...p.flags, ...c.flags]} />
        <div className="src"><Icon name="doc" size={14} sw={1.9} /><span>{`Certificate ${c.test.certificate || '—'} · ${c.test.method || 'Method not stated'}${c.test.lab ? `, ${c.test.lab}` : ''} · NRC ${c.ratings.nrc != null ? c.ratings.nrc.toFixed(2) : '—'} as per test report`}</span></div>
      </div>
    );
  } else {
    detail = <Note tone="warn">{`This product was tested in ${cfgs.length} ways. Choose how it is mounted above.`}</Note>;
  }
  const noted = (x: any, defs: any[]) => <>{x.value || '—'}{[...x.notes, ...noteFor(defs, x.key)].map((n: string, i: number) => <KvNote key={i}>{n}</KvNote>)}</>;
  // The tested result of the mounting in use (chosen under "How it is mounted"), then the full test data.
  return (
    <Card icon="doc" title="Test results" sub={c ? `As tested: ${c.label}` : variantText(p)} cls="card-product">
      {c ? (
        <Kv rows={[
          ['NRC', c.ratings.nrc != null ? c.ratings.nrc.toFixed(2) : '—', 'is-strong'],
          c.ratings.alphaW != null ? ['αw', `${c.ratings.alphaW.toFixed(2)}${c.ratings.nrcClass.grade ? ` · Class ${c.ratings.nrcClass.grade}` : ''}`] : null,
          ['Certificate', c.test.certificate || 'No certificate number'],
        ]} />
      ) : null}
      <More summary="Show the test data">
        <Kv rows={[
          ['Thickness', p.thickness.mm != null ? <>{`${trimNum(p.thickness.mm)} mm`}{p.thicknessTolerance.raw ? <span className="muted">{` (${p.thicknessTolerance.raw} mm)`}</span> : null}</> : p.thickness.raw || '—'],
          ['GSM', p.gsm.raw || '—'],
          ['Sizes', p.size.options.length ? <>{p.size.options.map((o: any, i: number) => <span key={i}>{i ? <br /> : null}{o.label}{isNum(o.areaM2) ? <>{' '}<span className="muted">{ui.panelArea(o.areaM2)}</span></> : null}</span>)}</> : '—'],
          ['Application', p.application.raw || 'Not stated'],
        ]} />
        {detail}
      </More>
      <More summary="More product data from the source">
        <Kv rows={[
          ...p.fire.map((x: any) => [`Fire · ${x.standard}`, noted(x, columns.fire)]),
          ...p.certifications.map((x: any) => [x.label, noted(x, columns.certifications)]),
          p.remarks.length ? ['Remarks', <>{p.remarks.map((r: string, i: number) => <span key={i}>{i ? <br /> : null}{r}</span>)}</>] : null,
        ]} />
        <p className="small muted">{`Shown exactly as listed in the source, rows ${p.source.rows.join(', ')}.`}</p>
      </More>
    </Card>
  );
}

/* ---------- the treatment plan: every item on its own, then combined ---------- */
function PlanCard({ p, plan, pred, a, sel }: { p: Project; plan: any; pred: any; a: any; sel: any }) {
  // α and added absorption are shown at the reference band (product data, one band); every predicted RT60 is the average.
  const f = DEMO.REFERENCE_BAND, h = pred ? pred.headline : null, items: any[] = plan.items, SHORT = D.policy(p).short;
  const r = (id: string) => pred && pred.items.find((i: any) => i.id === id);
  const n = items.length, plural = n === 1 ? '' : 's';
  const eff = h && plan.areaM2 > 0 ? h.addedA / plan.areaM2 : null;
  const counted = plan.complete.length === n ? `All ${n} product${plural}` : `${plan.complete.length} of ${n} products (the rest need a configuration)`;
  return (
    <Card icon="list" title="Your selection" sub={`${n} product${plural}. The app chooses how each is mounted and how much is needed; open one to change it.`} cls="card-plan" id="treat-summary"
      right={<Btn action="addProduct" size="sm" icon="plus">Add a product</Btn>}>
      {pred ? (
        <div className="plan-total">
          <span>{n > 1 ? 'All products together' : 'With this product'}</span>
          <span className="plan-rt"><span className="small muted">{`Echo time, average ${SHORT}`}</span>{` ${fmt.s(pred.measured)} `}<Icon name="arrowR" size={15} sw={2} />{' '}<b className="plan-pred" data-watch="plan-pred">{fmt.s(pred.predicted)}</b><ResultPill v={pred.verdict} st={pred.predictedStatus || acoustics.classify(pred.predicted, a.target)} /></span>
        </div>
      ) : D.overfill(p) ? null : <Note tone="info">{D.planProblem(p) || 'Choose a tested configuration for each product to see the combined result.'}</Note>}
      {/* Each product in one line: what, how mounted, how much, where. */}
      <ul className="plan-list">
        {items.map(it => (
          <li className={it.id === sel.id ? 'is-active' : undefined} key={it.id}>
            <span className="sol-mini" aria-hidden="true">{solOf(it) ? <SolutionArt kind={solOf(it).kind} mm={it.product.thickness.mm} variant="mini" /> : null}</span>
            <span className="plan-what"><b>{it.product.name}</b><span className="small muted">{[solOf(it) && solOf(it).products.length > 1 ? SOL().variantLabel(solOf(it), it.product, { type: false }) : null, it.complete ? amountWords(p, it) : 'Choose how it is mounted'].filter(Boolean).join(' · ')}</span></span>
            <span className="plan-act">
              <Btn action="editItem" value={it.id} variant="ghost" size="sm" pressed={it.id === sel.id}>Edit</Btn>
              <button type="button" className="iconbtn" data-action="removeItem" data-value={it.id} aria-label={`Remove ${it.product.name} from the plan`}><Icon name="x" size={16} sw={2} /></button>
            </span>
          </li>
        ))}
      </ul>
      <CoverageWarning cov={D.coverage(p)} />
      <div className="sol-results"><Btn action="continue" variant="primary" iconAfter="arrowR">View results</Btn><span className="small muted">Shows the echo time after treatment, band by band, against the target.</span></div>
      <More summary="Show the calculation">
      {pred ? <p className="small">{`${ui.planText(plan.complete)} adds ${fmt.m2(h.addedA)} of absorption at ${fmt.hz(h.f)}, and absorption in every band.`}</p> : null}
      <TableWrap>
        <table className="tbl pl-tbl">
          <thead><tr><th /><th>Product · configuration · placement</th><th>Quantity · panel size</th><th className="r">Area</th><th className="r"><span className="nocase">α</span>{` at ${fmt.hz(f)}`}</th><th className="r">{`Added at ${fmt.hz(f)}`}</th><th className="r">Predicted average</th><th /></tr></thead>
          <tbody>
            <tr className="pl-grp"><td colSpan={8}>Individual products</td></tr>
            {items.map(it => {
              const x = r(it.id), al = it.complete ? it.alpha[f] : null;
              return (
                <tr className={it.id === sel.id ? 'is-active' : undefined} key={it.id}>
                  <td className="pl-n">{it.no}</td>
                  <td className="pl-prod" data-label={`#${it.no}`}>
                    <div className="pl-name">{it.product.name}</div>
                    {it.complete ? <div className="pl-cfg">{it.configuration.label}</div> : <div className="pl-cfg is-missing"><Icon name="alert" size={12} sw={2.2} /> Choose a tested configuration</div>}
                    <KvNote>{it.placement}</KvNote>
                  </td>
                  <td className="pl-qty" data-label="Quantity · panel size">{it.mode === 'units'
                    ? <>{`${it.quantity} × ${it.size.label}`}<KvNote>{`${ui.panelArea(it.size.areaM2)} each`}</KvNote></>
                    : <>{fmt.m2(it.areaM2)}<KvNote>{amountWords(p, it)}</KvNote></>}</td>
                  <td className="r" data-label="Area">{fmt.m2(it.areaM2)}</td>
                  <td className="r" data-label={`α at ${fmt.hz(f)}`}>{isNum(al) ? al.toFixed(2) : '—'}</td>
                  <td className="r" data-label={`Added at ${fmt.hz(f)}`}>{x && isNum(x.addedA) ? fmt.m2(x.addedA) : '—'}</td>
                  <td className="r" data-label="Predicted average">{x && x.alonePredicted != null ? fmt.s(x.alonePredicted) : '—'}<KvNote>on its own</KvNote></td>
                  <td className="pl-act">
                    <Btn action="editItem" value={it.id} variant="ghost" size="sm" pressed={it.id === sel.id}>Edit</Btn>
                    <button type="button" className="iconbtn" data-action="removeItem" data-value={it.id} aria-label={`Remove ${it.product.name} from the plan`}><Icon name="x" size={16} sw={2} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="pl-grp"><td colSpan={8}>Combined treatment</td></tr>
            <tr className="pl-total">
              <td /><td className="pl-prod"><b>{counted}</b></td><td />
              <td className="r" data-label="Area"><b>{fmt.m2(plan.areaM2)}</b></td>
              <td className="r" data-label={`α at ${fmt.hz(f)}`}>{eff != null ? eff.toFixed(2) : '—'}<KvNote>area-weighted</KvNote></td>
              <td className="r" data-label={`Added at ${fmt.hz(f)}`}><b>{h ? fmt.m2(h.addedA) : '—'}</b></td>
              <td className="r" data-label="Predicted average"><b>{pred ? fmt.s(pred.predicted) : '—'}</b><KvNote>together</KvNote></td><td />
            </tr>
          </tfoot>
        </table>
      </TableWrap>
      {pred ? <>
        {/* Frequency-dependent data: each item's α and added absorption, the combined total, and the predicted room. */}
        <SubH>Absorption by frequency · individual and combined</SubH>
        <TableWrap>
          <table className="tbl pl-freq">
            <thead><tr><th />{pred.bands.map((b: any) => <th className="r" key={b.f}>{fmt.hz(b.f)}</th>)}</tr></thead>
            <tbody>
              {pred.items.map((it: any, k: number) => {
                const covered = pred.bands.some((b: any) => b.items[k].coveredKnown);
                return [
                  <tr className="pl-item" key={`${it.id}-a`}><td>{`#${it.no} ${it.product.name} · α`}</td>{pred.bands.map((b: any) => <td className="r" key={b.f}>{isNum(b.items[k].alpha) ? b.items[k].alpha.toFixed(2) : <span className="cell-missing">—</span>}</td>)}</tr>,
                  covered ? <tr className="pl-sub" key={`${it.id}-c`}><td>{`α of the finish it covers (${it.placement})`}</td>{pred.bands.map((b: any) => <td className="r" key={b.f}>{isNum(b.items[k].coveredAlpha) ? b.items[k].coveredAlpha.toFixed(2) : '—'}</td>)}</tr> : null,
                  <tr className="pl-sub" key={`${it.id}-d`}><td>{`Added: ${it.areaM2.toFixed(2)} m² × ${covered ? '(α − finish α)' : 'α'}`}</td>{pred.bands.map((b: any) => <td className="r" key={b.f}>{isNum(b.items[k].addedA) ? b.items[k].addedA.toFixed(2) : '—'}</td>)}</tr>,
                ];
              })}
              <tr className="pl-sum"><td>Combined added absorption (m²)</td>{pred.bands.map((b: any) => <td className="r" key={b.f}>{isNum(b.addedA) ? b.addedA.toFixed(2) : '—'}</td>)}</tr>
              <tr><td>Measured RT60</td>{pred.bands.map((b: any) => <td className="r" key={b.f}>{fmt.s(b.measured)}</td>)}</tr>
              <tr className="pl-sum"><td>Predicted RT60, all products</td>{pred.bands.map((b: any) => <td className="r" key={b.f}>{fmt.s(b.predicted)}</td>)}</tr>
            </tbody>
          </table>
        </TableWrap>
        <p className="small">{`Average RT60 over ${RA.describe(pred.measuredAverage)}, ${SHORT}: measured ${fmt.s(pred.measured)}, predicted ${fmt.s(pred.predicted)} with all products. This average is a summary: the verdict judges every band on its own.`}</p>
        <p className="small muted">Each product adds its own area × its own octave-band α in every band (the mean of its tested one-third-octave values in that octave, at most 1.00). Where Room Setup says what finish it covers, that finish's own absorption on the same area is replaced, not counted twice: area × (α − finish α). The plan adds them up: RT60 = 0.161 × V ÷ (A₀ + ΣΔA). A band where any product has no tested α is not predicted.</p>
      </> : null}
      </More>
    </Card>
  );
}

/* ---------- the amount of the item being edited: set by the app, the result first ---------- */
const whereText = (pl: string) => `on ${whereWords(pl)}`;
/* The amount in the room: the share of the free surface there that this product covers (and the plan's other products
   there, in grey), drawn on a sketch of a room. It follows the slider as it moves. */
function RoomSketch({ p, sel, cov }: { p: Project; sel: any; cov: any }) {
  const sol = solOf(sel);
  if (!sol || !cov || !(cov.surfaceM2 > 0)) return null;
  const share = Math.min(1, Math.max(0, sel.areaM2 / cov.surfaceM2)), others = Math.max(0, Math.min(1 - share, (cov.areaM2 - sel.areaM2) / cov.surfaceM2));
  const pct = (x: number) => `${x > 0 && x < 0.995 ? 'about ' : ''}${Math.round(x * 100)} %`;
  return (
    <figure className="rp-wrap">
      <RoomPreview kind={sol.kind} placement={sel.placement} share={share} others={others} />
      <figcaption>
        <span className="rp-key" aria-hidden="true" />{`${amountWords(p, sel).replace(/^\w/, ch => ch.toUpperCase())}.`}
        {others > 0.0005 ? <> <span className="rp-key is-other" aria-hidden="true" />{`Your other products there: ${pct(others)}.`}</> : null}
        {' A sketch of how much is covered, not of where each piece goes.'}
      </figcaption>
    </figure>
  );
}

function AmountCard({ p, sel, pred, a }: { p: Project; sel: any; pred: any; a: any }) {
  const title = 'How much to put up', sub = 'The app sets it for this room. Move the bar to see what more or less would do.';
  if (!sel.complete) return <Card title={title} sub={sub}><Note>Choose how it is mounted first.</Note></Card>;
  const amt = D.autoAmount(p, sel) as any, auto = D.isAutoAmount(p, sel), multi = D.treatmentPlan(p).complete.length > 1;
  const x = pred && pred.items.find((i: any) => i.id === sel.id), cov = D.coverage(p, sel.placement)[0], goal = amt ? amt.goal : null;
  const under = SURF.coveredBy(p.room, sel.placement), f0 = pred && pred.headline ? pred.headline.f : DEMO.REFERENCE_BAND, SHORT = D.policy(p).short;
  const covers = under.known
    ? `It covers the finish of ${under.names.join(', ')} (α ${under.alpha[DEMO.REFERENCE_BAND].toFixed(2)} at ${fmt.hz(DEMO.REFERENCE_BAND)}, from Room Setup), whose own absorption on this area is replaced, not counted twice.`
    : `The finish there is not complete in Room Setup (${under.why || 'not set'}), so its own absorption is not subtracted: the prediction may overstate the effect a little.`;
  const sizeOptions = sel.sizes.map((o: any) => ({ value: String(o.index), label: o.label }));
  const v = pred && pred.verdict, st = pred ? pred.predictedStatus : null;
  // The result in everyday words: meets the target, or what would still be wrong and what would help.
  const verdict = !pred ? null
    : st === 'within' ? <p className="auto-say is-good"><Icon name="seal" size={16} sw={2.2} />{multi ? 'With the whole plan the room meets the target in every band.' : 'The room meets the target in every band.'}</p>
      : st === 'below' && a.status === 'below' ? <p className="auto-say">The room was already below the target, so it would become drier still. Treatment is not recommended.</p>
        : v ? <p className="auto-say">{`Not fully there: ${soundsText(v.above.map((r: any) => r.f), v.below.map((r: any) => r.f)) || "the room's mean echo time is outside the range"}. ${st === 'below' ? 'Use less of it.' : soundsAdvice(v.above.map((r: any) => r.f), v.below.map((r: any) => r.f))}`}</p> : null;
  const amountNote = !amt ? null
    : !amt.needed && amt.areaM2 === 0 ? 'The room already meets the target, so the app suggests none. Move the bar to see what some would do.'
      : amt.areaM2 === 0 && D.treatmentPlan(p).complete.length > 1 ? 'With your other products the room needs none of this one, so the app suggests none. Move the bar to use some anyway, or remove it.'
      : amt.capped ? `The room needs more than fits ${whereText(sel.placement)}, so the app suggests covering all the free space there.`
        : amt.needed && !goal ? 'Even a lot of this product does not reach the target here, so the app suggests covering all the free space.' : null;
  return (
    <Card title={title} sub={sub} cls="card-amount">
      <div className="auto-amount">
        <RoomSketch p={p} sel={sel} cov={cov} />
        <AmountSlider p={p} sel={sel} keyName="edit" />
        <div className="auto-use">{auto ? <Pill tone="neutral" text="Set by the app" icon="seal" /> : <><Pill tone="neutral" text="Set by you" /><Btn action="useAutoAmount" value={sel.id} size="sm" cls="btn-wrap">Go back to the app's amount</Btn></>}</div>
        {amountNote ? <p className="small muted">{amountNote}</p> : null}
        {pred ? <div className="auto-result"><span className="small muted">{`Echo time, average ${SHORT}`}</span><span className="auto-rt">{fmt.s(pred.measured)}<Icon name="arrowR" size={16} sw={2} /><b className="plan-pred" data-watch="amount-pred">{fmt.s(pred.predicted)}</b></span><ResultPill v={v} st={st} /></div>
          : <Note tone="info">{D.planProblem(p) || 'The result appears once the plan is complete.'}</Note>}
        {verdict}
      </div>
      <More summary="More options: panel size, where it goes">
        <div className="stack-sm">
          {sel.sizes.length > 1
            ? <SelectInput id={`treat-size-${sel.id}`} label="Panel size" changeAction="setSize" data={{ 'data-key': sel.id }} value={sel.mode === 'area' ? '' : String(sel.size.index)} options={sizeOptions} placeholder="Choose a panel size" /> : null}
          <SelectInput id={`place-${sel.id}`} label="Where it goes" changeAction="setPlacement" data={{ "data-key": sel.id }} value={sel.placement} options={SURF.placementsFor(p.room).map((pl: any) => ({ value: pl.value, label: pl.label }))} />
        </div>
      </More>
      <More summary="Show the calculation">
        <Kv rows={[
          ['Treatment area', fmt.m2(sel.areaM2), 'is-strong'],
          cov && [`Free surface on ${/^Wall \d$/.test(cov.label) ? cov.label : cov.label.toLowerCase()}`, fmt.m2(cov.surfaceM2)],
          cov && [`Coverage${cov.count > 1 ? ` (${cov.count} products)` : ''}`, fmt.pct(cov.fraction, 1)],
          [`Added absorption at ${fmt.hz(f0)}`, x && isNum(x.addedA) ? fmt.m2(x.addedA) : '—'],
          goal ? ['The app’s amount', goal.meetsBands ? `${fmt.m2(goal.areaM2)}: the least that keeps every band ${D.policy(p).judgedShort} within its limits` : `${fmt.m2(goal.areaM2)}: brings the average to ${fmt.s(TGT.aim(a.target))}; ${fmt.hzList(goal.above)}${goal.above.length && goal.below.length ? ' above, ' : goal.above.length ? ' above' : ''}${goal.below.length ? `${fmt.hzList(goal.below)} below` : ''} their limits`] : null,
        ]} />
        <p className="small muted">{covers}</p>
      </More>
    </Card>
  );
}

export function TreatmentScreen({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, g = D.geometry(p), a = D.assessment(p) as any;
  if (!a || !g) return <Note tone="warn">Treatment needs a room, a target and a valid measurement.</Note>;
  if (!a.available) return <Note tone="warn" icon="alert"><b>Treatment needs the room's average RT60, which this measurement does not have.</b>{` ${a.reason || ''} Measure again in Acoustic Measurement.`}</Note>;
  const plan = D.treatmentPlan(p) as any, sel = D.treatmentSelection(p) as any, pred = D.prediction(p) as any;
  // Sabine's equivalent absorption for the average RT60: what reaching the target needs, and what the plan adds.
  const need = D.absorptionGap(p) || 0, SHORT = a.policy.short;
  const added = pred ? acoustics.absorptionFromRT(g.V, pred.predicted) - acoustics.absorptionFromRT(g.V, pred.measured) : 0, share = need > 0 ? added / need : 0;
  const removed = ctx.state.ui.removed as { no: number; name: string } | null | undefined;
  return (
    <>
      {/* Chosen by the verdict (every judged band), not by the average alone. */}
      {a.status === 'above' && need > 0.05 ? (
        <Card icon="gauge" title="The goal" sub={`Echo time, average ${SHORT}`} cls="card-need">
          <div className="need">
            <div className="need-v"><span className="stat-v">{TGT.aim(a.target).toFixed(2)}<small>s</small></span><span className="small muted">{`${a.target.preferred != null ? `the preferred echo time (range ${TGT.rangeText(a.target)})` : `the ${fmt.s(a.target.max)} limit`}, from ${fmt.s(a.rt)} now`}</span></div>
            <div>
              <div className={share >= 1 ? 'meter good' : 'meter'}><i style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%` }} /></div>
              <div className="need-cap">{pred
                ? <><span>{plan.complete.length > 1 ? 'These products get the room' : 'This product gets the room'}</span><span>{`${fmt.pct(Math.min(1, share))} of the way`}</span></>
                : <span>{plan.items.length ? D.planProblem(p) || 'Complete the plan to see how far it gets.' : 'Choose a product: the app works out how it is mounted and how much is needed.'}</span>}</div>
            </div>
          </div>
          <More summary="Show the calculation"><p className="small muted">{`Simplified Sabine estimate from the average RT60: about ${need.toFixed(1)} m² more absorption brings it from ${fmt.s(a.rt)} to ${fmt.s(TGT.aim(a.target))}${pred ? `; the plan adds the equivalent of ${added.toFixed(1)} m²` : ''}. The amount the app suggests is worked out band by band, so every band is checked, not only this average.`}</p></More>
        </Card>
      ) : a.status === 'above'
        // The average is at the aim already, but a band rings longer than its limit.
        ? <Note tone="warn">{a.verdict.above.length
          ? `The average over ${SHORT} is already at the target, but ${fmt.hzList(a.verdict.above.map((r: any) => r.f))} ring${a.verdict.above.length > 1 ? '' : 's'} longer than allowed. Choose a product that absorbs most in ${a.verdict.above.length > 1 ? 'those bands' : 'that band'}; the amount suggested below meets every band where one can.`
          : `The average over ${SHORT} is already at the target, but the room does not meet it in every band it is judged in (see Acoustic Assessment). The amount suggested below meets every band where one can.`}</Note>
        : a.status === 'below'
          ? <Note tone="warn">The room is below the target range. Adding absorption would make it drier still, so treatment is not recommended. You can continue without it.</Note>
          : <Note tone="good">The room already meets the target in every band it is judged in. Treatment is optional: continue without it, or choose a product to explore.</Note>}
      {removed ? <div className="undo-bar" role="status"><Icon name="trash" size={15} sw={1.9} /><span>{`Removed #${removed.no} ${removed.name} from the plan.`}</span><Btn action="undoRemove" size="sm">Undo</Btn></div> : null}
      {plan.items.length ? <PlanCard p={p} plan={plan} pred={pred} a={a} sel={sel} /> : null}
      <Explorer ctx={ctx} />
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function treatmentPrimary(ctx: Ctx): PrimaryAction | null {
  const p = ctx.project, a = D.assessment(p);
  if (!a || !D.geometry(p) || !a.available) return null;
  return !D.treatmentPlan(p).items.length && !D.treatmentRequired(p) ? { label: 'Continue without treatment', action: 'continue' } : null;
}
