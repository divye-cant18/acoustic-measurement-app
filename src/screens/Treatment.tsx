/* Step 8 · Treatment — build a treatment plan: one or more products, each in one of its tested configurations, with its
   own amount and placement. Product data comes only from AM.services.catalog; the project keeps the plan
   (js/stages/treatment.js). The prediction adds every item's own area × α band by band. */
import { acoustics, am, CAT, D, DEMO, fmt, isNum, RA, SURF, ui } from '../lib';
import type { Ctx, PrimaryAction, Project } from '../am';
import { AmountControl, AmountGoal, AreaIn, Btn, Card, Chart, CoverageWarning, ExtLink, GoalUnreachable, Icon, Kv, KvNote, Legend, More, Note, PredPill, QtyStepper, SelectInput, SubH, TableWrap } from '../ui/kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
const SURFACES: [string, string][] = [['Any', 'Any surface'], ['Wall', 'Wall'], ['Ceiling', 'Ceiling']];
const nrcRange = (s: any) => (s.nrcMin == null ? 'NRC —' : s.nrcMin === s.nrcMax ? `NRC ${s.nrcMin.toFixed(2)}` : `NRC ${s.nrcMin.toFixed(2)}–${s.nrcMax.toFixed(2)}`);
const variantText = (p: any) => [p.category, p.finish, p.gsm.raw && `${p.gsm.raw} GSM`, p.thickness.raw && `${p.thickness.raw} mm`, p.size.raw].filter(Boolean).join(' · ');
const trimNum = am.util.trimNum;

function configChips(c: any): string[] {
  const k = c.condition, chips: string[] = [];
  if (k.mounting === 'Direct fix') chips.push('Direct fix');
  if (k.mounting === 'Air gap' && isNum(k.airGapMm)) chips.push(`Air gap ${trimNum(k.airGapMm)} mm`);
  if (k.cavityFill) chips.push(`Fill: ${k.cavityFill.material} ${trimNum(k.cavityFill.thicknessMm)} mm`);
  if (k.backing) chips.push(`Backing: ${k.backing.description} ${trimNum(k.backing.thicknessMm)} mm`);
  if (k.sourceFacing) chips.push(k.sourceFacing);
  return chips;
}
const FlagList = ({ flags }: { flags: any[] }) => (!flags.length ? null : (
  <ul className="flags">{flags.map((f, i) => <li className={`flag flag-${f.severity}`} key={i}><Icon name={f.severity === 'warning' ? 'alert' : 'info'} size={14} sw={2} /><span>{f.message}</span></li>)}</ul>
));
const Chip = ({ action, value, current, label }: { action: string; value: string; current: string; label: string }) => (
  <button type="button" className="chip" data-action={action} data-value={value} aria-pressed={value === current}>{label}</button>
);

/* ---------- product browser ---------- */
function Browser({ ctx, sel, adding }: { ctx: Ctx; sel: any; adding: boolean }) {
  const c = ctx.state.ui.catalog, src = CAT.getSource();
  const list: any[] = CAT.getProducts({ query: c.query, category: c.category, surface: c.surface });
  return (
    <Card icon="panels" cls="card-catalog" title={adding ? 'Add a product to the plan' : sel ? `Change the product of #${sel.no}` : 'Choose a product'}
      sub={`${src.counts.products} products, ${src.counts.configurations} tested configurations · ${src.file}`}
      right={sel ? <Btn action="cancelBrowse" variant="ghost" size="sm">Cancel</Btn> : null}>
      {/* Product discovery on the official catalogue, in a new tab; the plan is built only from the tested data below. */}
      <ExtLink tone="brand" glyph="panels" href={am.brand.links.catalogue} title="Discover acoustic products"
        text="Explore acoustic products, finishes and applications to discover potential solutions for your room."
        label="Explore UniVicoustic Product Catalogue"
        note="Opens the UniVicoustic website in a new tab; this project stays as it is. To use a product here, choose it below: the prediction uses only the tested data in this list." />
      <div className="cat-filters">
        <label className="search" htmlFor="cat-q"><Icon name="search" size={16} sw={2} /><SearchBox value={c.query} /></label>
        <div className="chips">{['All', ...CAT.getCategories()].map((v: string) => <Chip key={v} action="catCategory" value={v} current={c.category} label={v === 'All' ? 'All categories' : v} />)}</div>
        <div className="chips">{SURFACES.map(([v, l]) => <Chip key={v} action="catSurface" value={v} current={c.surface} label={l} />)}</div>
      </div>
      <div className="cat-count">{list.length === src.counts.products ? `${list.length} products` : `${list.length} of ${src.counts.products} products`}</div>
      {list.length ? (
        <ul className="cat-list">
          {list.map(p => {
            const s = CAT.getSummary(p.id);
            return (
              <li key={p.id}>
                <button type="button" className="cat-row" data-action="pickProduct" data-value={p.id} aria-pressed={!adding && !!sel && sel.product.id === p.id}>
                  <span className="cat-main"><span className="cat-name">{p.name}</span><span className="cat-meta">{variantText(p)}</span></span>
                  <span className="cat-side"><span className="cat-nrc">{nrcRange(s)}</span><span className="cat-cfg">{`${s.configurationCount} tested configuration${s.configurationCount === 1 ? '' : 's'}`}</span></span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <div className="cat-empty">No products match. Try fewer words or another category.</div>}
    </Card>
  );
}
// The catalogue search box writes screen state (data-uibind), not project data.
function SearchBox({ value }: { value: string }) {
  return <input id="cat-q" type="text" data-uibind="catalog.query" defaultValue={value} placeholder="Search name, GSM, thickness, mounting or certificate" autoComplete="off" />;
}

/* ---------- selected product, its configurations, and the chosen configuration's α(f) ---------- */
function ProductCard({ sel, refBand }: { sel: any; refBand: number }) {
  const p = sel.product, c = sel.configuration, cfgs: any[] = CAT.getAcousticConfigurations(p.id), src = CAT.getSource();
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
        <div className="src"><Icon name="doc" size={14} sw={1.9} /><span>{`${src.file} › ${c.source.sheet} › row ${c.source.row}${c.source.srNo != null ? ` (SR ${c.source.srNo})` : ''} · Certificate ${c.test.certificate || '—'} · ${c.test.method || 'Method not stated'}${c.test.lab ? `, ${c.test.lab}` : ''} · NRC ${c.ratings.nrc != null ? c.ratings.nrc.toFixed(2) : '—'} as per test report`}</span></div>
      </div>
    );
  } else {
    detail = <Note tone="warn">{`This product was tested in ${cfgs.length} configurations. Choose the one that matches how it will be installed; each has its own absorption data.`}</Note>;
  }
  const noted = (x: any, defs: any[]) => <>{x.value || '—'}{[...x.notes, ...noteFor(defs, x.key)].map((n: string, i: number) => <KvNote key={i}>{n}</KvNote>)}</>;
  return (
    <Card icon="panels" title={p.name} sub={variantText(p)} cls="card-product"
      right={<><Btn action="removeItem" value={sel.id} variant="ghost" size="sm">Remove</Btn><Btn action="browse" size="sm">Change product</Btn></>}>
      <Kv rows={[
        ['Thickness', p.thickness.mm != null ? <>{`${trimNum(p.thickness.mm)} mm`}{p.thicknessTolerance.raw ? <span className="muted">{` (${p.thicknessTolerance.raw} mm)`}</span> : null}</> : p.thickness.raw || '—'],
        ['GSM', p.gsm.raw || '—'],
        ['Sizes', p.size.options.length ? <>{p.size.options.map((o: any, i: number) => <span key={i}>{i ? <br /> : null}{o.label}{isNum(o.areaM2) ? <>{' '}<span className="muted">{ui.panelArea(o.areaM2)}</span></> : null}</span>)}</> : '—'],
        ['Application', p.application.raw || 'Not stated'],
      ]} />
      <div>
        <SubH>{`Tested configurations (${cfgs.length})`}</SubH>
        <ul className="cfg-list">
          {cfgs.map(x => {
            const warn = x.flags.filter((f: any) => f.severity === 'warning').length, chips = configChips(x);
            return (
              <li key={x.id}>
                <button type="button" className="cfg" data-action="pickConfig" data-value={x.id} aria-pressed={!!c && c.id === x.id}>
                  <span className="cfg-radio" aria-hidden="true" />
                  <span className="cfg-main"><span className="cfg-label">{x.label}</span>{chips.length ? <span className="cfg-chips">{chips.map((t, i) => <span className="chip-sm" key={i}>{t}</span>)}</span> : null}<span className="cfg-cert">{x.test.certificate || 'No certificate number'}</span></span>
                  <span className="cfg-side">
                    <span className="cfg-nrc">{`NRC ${x.ratings.nrc != null ? x.ratings.nrc.toFixed(2) : '—'}`}</span>
                    <span className="cfg-sub">{[x.ratings.nrcClass.grade && `Class ${x.ratings.nrcClass.grade}`, x.ratings.alphaW != null && `αw ${x.ratings.alphaW.toFixed(2)}`].filter(Boolean).join(' · ')}</span>
                    {warn ? <span className="cfg-warn"><Icon name="alert" size={12} sw={2.2} />{`${warn} to check`}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {detail}
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
    <Card icon="list" title="Treatment plan" sub={`${n} product${plural}. Each keeps its own configuration, amount and absorption data.`} cls="card-plan"
      right={<Btn action="addProduct" size="sm" icon="plus">Add another product</Btn>}>
      {pred ? (
        <div className="plan-total">
          <span>{'Combined: '}<b>{ui.planText(plan.complete)}</b>{' adds '}<b>{fmt.m2(h.addedA)}</b>{` of absorption at ${fmt.hz(f)}, and absorption in every band`}</span>
          <span className="plan-rt"><span className="small muted">{`Average ${SHORT}`}</span>{` ${fmt.s(pred.measured)} `}<Icon name="arrowR" size={15} sw={2} />{' '}<b className="plan-pred" data-watch="plan-pred">{fmt.s(pred.predicted)}</b><PredPill status={pred.predictedStatus || acoustics.classify(pred.predicted, a.target)} /></span>
        </div>
      ) : <Note tone="info">{D.planProblem(p) || 'Choose a tested configuration for each product to see the combined result.'}</Note>}
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
                    ? <><QtyStepper q={it.quantity} max={ui.MAX_PANELS} sel={it} keyName="plan" /><KvNote>{`of ${it.size.label} · ${ui.panelArea(it.size.areaM2)} each`}</KvNote></>
                    : <><AreaIn sel={it} keyName="plan" /><KvNote>area entered</KvNote></>}</td>
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
      <CoverageWarning cov={D.coverage(p)} />
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
        <p className="small">{`Average RT60 over ${RA.describe(pred.measuredAverage)}, ${SHORT}: measured ${fmt.s(pred.measured)}, predicted ${fmt.s(pred.predicted)} with all products. This average is what the target is compared with.`}</p>
        <p className="small muted">Each product adds its own area × its own octave-band α in every band (the mean of its tested one-third-octave values in that octave, at most 1.00). Where Room Setup says what finish it covers, that finish's own absorption on the same area is replaced, not counted twice: area × (α − finish α). The plan adds them up: RT60 = 0.161 × V ÷ (A₀ + ΣΔA). A band where any product has no tested α is not predicted.</p>
      </> : null}
    </Card>
  );
}

/* ---------- the amount of the item being edited ---------- */
function AmountCard({ p, sel, pred, a, need }: { p: Project; sel: any; pred: any; a: any; need: number }) {
  const title = `Quantity · #${sel.no}`, sub = 'This product’s amount in the plan. The product database is not changed.';
  if (!sel.complete) return <Card title={title} sub={sub}><Note>Choose a tested configuration first.</Note></Card>;
  const x = pred && pred.items.find((i: any) => i.id === sel.id), cov = D.coverage(p, sel.placement)[0], goal = need > 0.05 ? D.treatmentForTarget(p, sel) : null;
  const under = SURF.coveredBy(p.room, sel.placement), f0 = DEMO.REFERENCE_BAND;
  const covers = under.known
    ? `It covers the finish of ${under.names.join(', ')} (α ${under.alpha[f0].toFixed(2)} at ${fmt.hz(f0)}, from Room Setup), whose own absorption on this area is replaced, not counted twice.`
    : `The finish there is not complete in Room Setup (${under.why || 'not set'}), so its own absorption is not subtracted: the prediction may overstate the effect a little. Set the surfaces in Room Setup to include it.`;
  const sizeOptions = [...sel.sizes.map((o: any) => ({ value: String(o.index), label: `${o.label} · ${ui.panelArea(o.areaM2)} each` })), { value: 'area', label: 'Enter the treatment area directly' }];
  return (
    <Card title={title} sub={sub} cls="card-amount">
      {sel.sizes.length
        ? <SelectInput id={`treat-size-${sel.id}`} label="Panel size" bind={`${sel.path}.size`} value={sel.mode === 'area' ? 'area' : String(sel.size.index)} options={sizeOptions} />
        : <Note tone="info">The source gives no panel area for this product, so enter the treatment area directly.</Note>}
      <AmountControl sel={sel} keyName="edit" />
      <Kv rows={[
        ['Treatment area', fmt.m2(sel.areaM2), 'is-strong'],
        cov && [`Free surface on ${/^Wall \d$/.test(cov.label) ? cov.label : cov.label.toLowerCase()}`, fmt.m2(cov.surfaceM2)],
        cov && [`Coverage${cov.count > 1 ? ` (${cov.count} products)` : ''}`, fmt.pct(cov.fraction, 1)],
        [`Added absorption at ${fmt.hz(f0)}`, x && isNum(x.addedA) ? fmt.m2(x.addedA) : '—'],
      ]} />
      {need > 0.05 ? (goal ? <AmountGoal goal={goal} sel={sel} targetRT={a.target.preferred} /> : D.planProblem(p) ? null : <GoalUnreachable sel={sel} targetRT={a.target.preferred} />) : null}
      <SelectInput id={`place-${sel.id}`} label="Placement" bind={`${sel.path}.placement`} value={sel.placement} options={SURF.PLACEMENTS.map((pl: any) => ({ value: pl.value, label: pl.label }))} hint={`Where it goes. ${covers}`} />
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
  const cat = ctx.state.ui.catalog, browsing = !sel || cat.browsing, adding = !!sel && cat.adding;
  const removed = ctx.state.ui.removed as { no: number; name: string } | null | undefined;
  return (
    <>
      {need > 0.05 ? (
        <Card icon="gauge" title="Absorption needed" sub={`Simplified Sabine estimate from the average RT60, ${SHORT}`} cls="card-need">
          <div className="need">
            <div className="need-v"><span className="stat-v">{need.toFixed(1)}<small>m²</small></span><span className="small muted">{`more absorption to bring the average RT60 from ${fmt.s(a.rt)} to the preferred ${fmt.s(a.target.preferred)}`}</span></div>
            <div>
              <div className={share >= 1 ? 'meter good' : 'meter'}><i style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%` }} /></div>
              <div className="need-cap">{pred
                ? <><span>{`${plan.complete.length > 1 ? 'This plan' : 'This selection'} adds the equivalent of `}<b>{`${added.toFixed(1)} m²`}</b></span><span>{`${fmt.pct(share)} of what is needed`}</span></>
                : <span>Choose a product and configuration to see how much of this it covers.</span>}</div>
            </div>
          </div>
        </Card>
      ) : a.status === 'below'
        ? <Note tone="warn">The room's average RT60 is below the target range. Adding absorption would make it drier still, so treatment is not recommended. You can continue without it.</Note>
        : <Note tone="good">The room's average RT60 already meets the target. Treatment is optional: continue without it, or choose a product to explore.</Note>}
      {removed ? <div className="undo-bar" role="status"><Icon name="trash" size={15} sw={1.9} /><span>{`Removed #${removed.no} ${removed.name} from the plan.`}</span><Btn action="undoRemove" size="sm">Undo</Btn></div> : null}
      {plan.items.length ? <PlanCard p={p} plan={plan} pred={pred} a={a} sel={sel} /> : null}
      {browsing ? <>
        {sel ? <div className="section-label">{adding ? `Add product #${plan.items.length + 1}` : `Change the product of #${sel.no}`}</div> : null}
        <Browser ctx={ctx} sel={sel} adding={adding} />
      </> : <>
        <div className="section-label" id="treat-editor">{`Editing #${sel.no} · ${sel.product.name}`}</div>
        <div className="grid split"><ProductCard sel={sel} refBand={DEMO.REFERENCE_BAND} /><AmountCard p={p} sel={sel} pred={pred} a={a} need={need} /></div>
      </>}
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function treatmentPrimary(ctx: Ctx): PrimaryAction | null {
  const p = ctx.project, a = D.assessment(p);
  if (!a || !D.geometry(p) || !a.available) return null;
  return !D.treatmentPlan(p).items.length && !D.treatmentRequired(p) ? { label: 'Continue without treatment', action: 'continue' } : null;
}
