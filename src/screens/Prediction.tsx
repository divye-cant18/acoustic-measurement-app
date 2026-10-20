/* Step 9 · Predicted Result — measured condition + the whole treatment plan = predicted condition, compared with the
   target. Predicted values come only from AM.services.prediction (AM.derive.prediction) and are always styled apart from
   measured ones. The predicted verdict judges every band on its own: an average inside the range never hides a band
   outside it. One band's calculation is written out as an example. */
import type { ReactNode } from 'react';
import { acoustics, D, fmt, TGT, ui } from '../lib';
import type { Ctx } from '../am';
import { AmountSlider, Btn, Card, Chart, CoverageWarning, Icon, KvNote, Legend, Note, PredPill, RtScale, soundsAdvice, soundsText, Stat, StatusPill, TableWrap, Tag, GoalUnreachable } from '../ui/kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
// What the predicted verdict says, band by band, each against its own limits (never a difference that can turn negative).
// A stored input as it is used: up to three decimals, no trailing zeros (0.706, 2.977, 180).
const stored = (x: number) => String(+x.toFixed(3));
const limitOf = (r: any) => (r.min != null ? `${r.min.toFixed(2)}–${fmt.s(r.max)}` : `at most ${fmt.s(r.max)}`);
const bandList = (rs: any[]) => fmt.list(rs.map((r: any) => `${fmt.hz(r.f)} (${fmt.s(r.rt)}, limit ${limitOf(r)})`));
// measuredStatus: the room's own verdict before treatment.
function sentence(pred: any, t: any, st: string, area: number, measuredStatus: string): string {
  if (!area) return 'No treatment area yet, so the prediction equals the measured value.';
  const gain = `Shortens the average RT60 by ${fmt.s(pred.measured - pred.predicted)}`, v = pred.verdict;
  if (st === 'within' || !v) return `${gain}, ${st === 'within' ? 'within the target in every band it is judged in' : 'with no verdict (the target is not complete)'}.`;
  const parts = [
    v.tmFails ? `the room's Tm, ${fmt.s(v.tm)}, is outside ${t.min.toFixed(2)}–${fmt.s(t.max)}` : '',
    v.above.length ? `longer than allowed at ${bandList(v.above)}` : '',
    v.below.length ? `drier than allowed at ${bandList(v.below)}` : '',
  ].filter(Boolean);
  const less = st === 'below' && !v.above.length
    ? (measuredStatus === 'below' ? ' The room was already below the target range before treatment: adding absorption makes it drier still, so no treatment is recommended.' : ' Less treatment would do.') : '';
  return `${gain}, but not yet within the target: ${parts.join('; ')}.${v.masked ? ' The average alone is inside the range, but every band has to be.' : ''}${less}`;
}

export function PredictionScreen({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, pred = D.prediction(p) as any, a = D.assessment(p) as any, g = D.geometry(p), SHORT = D.policy(p).short;
  if (a && !a.available) return <Note tone="warn" icon="alert"><b>No prediction without the room's average RT60.</b>{` ${a.reason || ''}`}</Note>;
  if (a && !pred && D.noTreatment(p)) {
    // No treatment chosen because the room does not need it: nothing to model, the measured room stands.
    return (
      <Card icon="target" title="Average RT60 and target" right={<StatusPill status={a.status} />}>
        <RtScale target={a.target} measured={a.rt} />
        <p className="lead">{`No treatment was selected, so there is nothing to predict. The room's average RT60 (${SHORT}) is ${fmt.s(a.rt)}, ${a.status === 'within' ? 'within the target' : 'below the target range'}.`}</p>
      </Card>
    );
  }
  if (!pred || !a || !g) return <Note tone="warn">{D.predictionMissing(p) || 'Prediction needs a valid measurement and a selected product configuration.'}</Note>;
  const h = pred.headline, t = a.target, items: any[] = pred.items, multi = items.length > 1;
  const st = pred.predictedStatus || acoustics.classify(pred.predicted, t);
  // The "reach the target" suggestion is for the product being edited, given what the others add.
  const sel = items.find(i => i.id === ((D.treatmentSelection(p) || {}) as any).id) || items[items.length - 1];
  const goal = D.treatmentForTarget(p, sel);
  const k = h.items, V = g.V;
  // Where Room Setup says what finish an item covers, its own absorption is replaced: area × (α − finish α).
  const addedRows: [string, string, ReactNode, string?][] = items.map((it, i) => {
    const label = multi ? `Added by #${it.no} ${it.product.name}` : 'Added absorption', sym = multi ? `ΔA${it.no}` : 'ΔA', x = k[i];
    // Inputs as stored (finish α to 0.001, areas to 0.001 m²), so each line adds up as printed, as in the PDF report.
    const factor = x.coveredKnown ? '(α − finish α)' : 'α', fv = x.coveredKnown ? `(${x.alpha.toFixed(2)} − ${stored(x.coveredAlpha)})` : x.alpha.toFixed(2);
    return it.mode === 'units'
      ? [label, `${sym} = panels × panel area × ${factor}(${h.f} Hz)`, <>{`${it.quantity} × ${it.size.areaM2.toFixed(3)} × ${fv} = `}<b>{fmt.m2(x.addedA)}</b></>]
      : [label, `${sym} = treatment area × ${factor}(${h.f} Hz)`, <>{`${stored(it.areaM2)} × ${fv} = `}<b>{fmt.m2(x.addedA)}</b></>];
  });
  const calcRows: ([string, string, ReactNode, string?] | null)[] = [
    ['Room volume', 'V', <b>{fmt.m3(V)}</b>],
    ['Existing absorption', 'A₀ = 0.161 × V ÷ measured RT60', <>{`0.161 × ${stored(V)} ÷ ${stored(h.measured)} = `}<b>{fmt.m2(h.existingA)}</b></>],
    ...addedRows,
    multi ? ['Added, all products', `ΔA = ${items.map(it => `ΔA${it.no}`).join(' + ')}`, <b>{fmt.m2(h.addedA)}</b>] : null,
    ['Total absorption', 'A = A₀ + ΔA', <b>{fmt.m2(h.totalA)}</b>],
    [`Predicted RT60 at ${fmt.hz(h.f)}`, 'RT60 = 0.161 × V ÷ A', <>{`0.161 × ${stored(V)} ÷ ${h.totalA.toFixed(1)} = `}<b>{fmt.s(h.predicted)}</b></>],
    ['Predicted average', 'the same in each band of the average, then their mean', <>{`(${pred.average.included.map((b: any) => b.rt60.toFixed(3)).join(' + ')}) ÷ ${pred.average.n} = `}<b>{fmt.s(pred.predicted)}</b></>, 'is-result'],
  ];
  const unknownCover = items.filter((_it, i) => !k[i].coveredKnown);
  return (
    <>
      <div className="compare">
        <Stat kind="measured" label="Current" value={pred.measured.toFixed(2)} tag={<Tag kind="measured" />} sub={`Average ${SHORT} · from the measurement`} />
        <span className="compare-sep" aria-hidden="true"><Icon name="arrowR" size={22} sw={2} /></span>
        <Stat kind="predicted" label={multi ? 'Predicted, all products' : 'Predicted'} value={pred.predicted.toFixed(2)} tag={<Tag kind="predicted" />} sub={`Average ${SHORT} · ${ui.planText(items)}`} watch="pred-headline" />
        <span className="compare-sep" aria-hidden="true">vs</span>
        <Stat kind="target" label="Target" value={t.preferred != null ? t.preferred.toFixed(2) : `≤ ${t.max.toFixed(2)}`} tag={<Tag kind="target" />} sub={t.preferred != null ? `Range ${TGT.rangeText(t)}` : 'Upper limit'} />
      </div>
      <Card icon="scale" title={`Measured, predicted and target · average RT60, ${SHORT}`} right={<PredPill status={st} />}>
        <RtScale target={t} measured={pred.measured} predicted={pred.predicted} arrow />
        <p className="lead">{sentence(pred, t, st, pred.plan.areaM2, a.status)}</p>
      </Card>
      <div className="grid split">
        <Card icon="gauge" title="How this is calculated" sub={`Simplified Sabine model, written out at ${fmt.hz(h.f)}; every band is calculated the same way`}>
          <div className="calc">
            {calcRows.filter((r): r is [string, string, ReactNode, string?] => !!r).map(([key, f, v, cls], i) => (
              <div className={`calc-r ${cls || ''}`} key={i}><span className="calc-k">{key}</span><span className="calc-f">{f}</span><span className="calc-v">{v}</span></div>
            ))}
          </div>
          {(pred.checks || []).map((c: any, i: number) => <Note tone="warn" key={i}>{c.text}</Note>)}
          <Note tone="info" icon="flask">{`A₀ is the room's equivalent absorption from the measured RT60 (the relation ISO 354 uses): furniture, people and air included. α is the octave-band value of ${items.map(it => `${multi ? `#${it.no} ` : ''}${it.configuration.label} (certificate ${it.configuration.test.certificate || '—'})`).join(', ')}: the mean of the three tested one-third-octave values in each octave, at most 1.00. The finish α is that of the surface each product covers, from Room Setup.${unknownCover.length ? ` For ${unknownCover.map(it => `${multi ? `#${it.no} ` : ''}${it.product.name}`).join(', ')} the covered finish is not set, so its own absorption is not subtracted and the effect may be overstated a little.` : ''} The model assumes an even (diffuse) sound field and that the measured RT60 represents the room; placement and edge effects of the panels are not modelled, so treat the result as an estimate.`}</Note>
        </Card>
        <Card icon="sliders" title="Try more or less" sub="Move the bar: the result above changes with it, and so does the plan.">
          {items.map(it => (
            <div className="amount-item" key={it.id}>
              <div className="selected-product"><b>{`${multi ? `#${it.no} ` : ''}${it.product.name}`}</b><span>{it.configuration.label}</span></div>
              <AmountSlider p={p} sel={it} keyName="pred" />
              {D.isAutoAmount(p, it) ? null : <div><Btn action="useAutoAmount" value={it.id} size="sm" cls="btn-wrap">Go back to the app's amount</Btn></div>}
            </div>
          ))}
          <CoverageWarning cov={D.coverage(p)} />
          {goal && goal.meetsBands === false ? <Note tone="warn">{`${sel.product.name} cannot fix every part of the sound on its own: ${soundsText(goal.above, goal.below)}. ${soundsAdvice(goal.above, goal.below)}`}</Note>
            : !goal && st === 'above' ? <GoalUnreachable sel={sel} targetRT={TGT.aim(t)} /> : null}
        </Card>
      </div>
      <Card icon="bars" title="Band by band">
        <Chart type="bands" cls="chart-compact" spec={{ line: true, series: [{ label: 'Measured', kind: 'measured', values: pred.bands.map((b: any) => b.measured) }, { label: 'Predicted', kind: 'predicted', values: pred.bands.map((b: any) => b.predicted) }], target: t, limits: pred.verdictRows ? pred.verdictRows.map((r: any) => ({ min: r.min, max: r.max })) : undefined, unit: 's', height: 200, yTitle: 'RT60 (s)', aria: 'Measured and predicted RT60 by band' }} height={200} />
        <Legend items={[['ln-measured', 'Measured'], ['ln-predicted', 'Predicted (modelled)'], ...(t.preferred != null ? [['zone', `Target range ${TGT.rangeText(t)}`], ['pref', 'Preferred']] : [['zone', `Target ${TGT.rangeText(t)}`]]) as [string, string][]]} />
        <TableWrap>
          <table className="tbl">
            <thead><tr><th>Band</th><th className="r">Measured</th><th className="r">Predicted</th><th className="r">Change</th><th>Predicted vs target</th></tr></thead>
            <tbody>
              {pred.bands.map((b: any) => {
                // Each band against its own limits, as the verdict judges it (pred.verdictRows).
                const vr = (pred.verdictRows || []).find((r: any) => r.f === b.f), s = vr ? vr.status : acoustics.classify(b.predicted, t);
                return (
                  <tr key={b.f}>
                    <td>{fmt.hz(b.f)}</td><td className="r">{fmt.s(b.measured)}</td><td className="r">{fmt.s(b.predicted)}</td><td className="r">{b.predicted != null ? fmt.signedS(b.predicted - b.measured) : '—'}</td>
                    <td>{b.measured == null ? <span className="small muted">Not measured reliably</span> : b.missingAlpha ? <span className="small muted">No tested α at this band</span>
                      : b.coveredExceedsMeasured ? <span className="small muted">Finish values do not fit the room here</span>
                        : s ? <><PredPill status={s} />{vr && vr.max != null ? <KvNote>{`${vr.role === 'edge' ? 'own limit' : vr.role === 'secondary' ? 'warning limit' : 'judged'} ${vr.min != null ? `${vr.min.toFixed(2)}–${fmt.s(vr.max)}` : `≤ ${fmt.s(vr.max)}`}`}</KvNote> : null}</> : <span className="small muted">No limit at this band</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
