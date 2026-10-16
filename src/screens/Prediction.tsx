/* Step 9 · Predicted Result — measured condition + the whole treatment plan = predicted condition, compared with the
   target. Predicted values come only from AM.services.prediction (AM.derive.prediction) and are always styled apart from
   measured ones. The predicted verdict judges every band on its own: an average inside the range never hides a band
   outside it. One band's calculation is written out as an example. */
import type { ReactNode } from 'react';
import { acoustics, D, fmt, ui } from '../lib';
import type { Ctx } from '../am';
import { AmountControl, AmountGoal, Card, Chart, CoverageWarning, Icon, Kv, KvNote, Legend, Note, PredPill, RtScale, Stat, StatusPill, TableWrap, Tag, GoalUnreachable } from '../ui/kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
function sentence(pred: any, t: any, st: string, area: number): string {
  if (!area) return 'No treatment area yet, so the prediction equals the measured value.';
  const gain = `Shortens the average RT60 by ${fmt.s(pred.measured - pred.predicted)}`, v = pred.verdict;
  if (st === 'above' && v && v.masked) return `${gain}, into the target range on average, but ${v.above.map((r: any) => `${fmt.hz(r.f)} (${fmt.s(r.rt)})`).join(', ')} would still ring longer than ${fmt.s(t.max)}. Every band has to be in range: more absorption there is needed.`;
  if (st === 'above') return `${gain}. Still ${fmt.s(pred.predicted - t.max)} above the target range.`;
  if (st === 'below') return `${gain}, but overshoots: ${fmt.s(t.min - pred.predicted)} below the target range. Less treatment would do.`;
  return `${gain}, into the target range.`;
}

export function PredictionScreen({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, pred = D.prediction(p) as any, a = D.assessment(p) as any, g = D.geometry(p), SHORT = D.policy(p).short;
  if (a && !a.available) return <Note tone="warn" icon="alert"><b>No prediction without the room's average RT60.</b>{` ${a.reason || ''}`}</Note>;
  if (a && !pred && D.noTreatment(p)) {
    // No treatment chosen because the room does not need it: nothing to model, the measured room stands.
    return (
      <Card icon="target" title="Average RT60 and target" right={<StatusPill status={a.status} />}>
        <RtScale target={a.target} measured={a.rt} />
        <p className="lead">{`No treatment was selected, so there is nothing to predict. The room's average RT60 (${SHORT}) is ${fmt.s(a.rt)}, ${a.status === 'within' ? 'inside the target range' : 'below the target range'}.`}</p>
      </Card>
    );
  }
  if (!pred || !a || !g) return <Note tone="warn">{D.planProblem(p) || 'Prediction needs a valid measurement and a selected product configuration.'}</Note>;
  const h = pred.headline, t = a.target, items: any[] = pred.items, multi = items.length > 1;
  const st = pred.predictedStatus || acoustics.classify(pred.predicted, t);
  // The "reach the target" suggestion is for the product being edited, given what the others add.
  const sel = items.find(i => i.id === ((D.treatmentSelection(p) || {}) as any).id) || items[items.length - 1];
  const goal = D.treatmentForTarget(p, sel);
  const goalText = !goal ? null : sel.mode === 'units' ? `${goal.units} panels` : fmt.m2(goal.areaM2);
  const k = h.items, V = g.V;
  // Where Room Setup says what finish an item covers, its own absorption is replaced: area × (α − finish α).
  const addedRows: [string, string, ReactNode, string?][] = items.map((it, i) => {
    const label = multi ? `Added by #${it.no} ${it.product.name}` : 'Added absorption', sym = multi ? `ΔA${it.no}` : 'ΔA', x = k[i];
    const factor = x.coveredKnown ? '(α − finish α)' : 'α', fv = x.coveredKnown ? `(${x.alpha.toFixed(2)} − ${x.coveredAlpha.toFixed(2)})` : x.alpha.toFixed(2);
    return it.mode === 'units'
      ? [label, `${sym} = panels × panel area × ${factor}(${h.f} Hz)`, <>{`${it.quantity} × ${it.size.areaM2.toFixed(3)} × ${fv} = `}<b>{fmt.m2(x.addedA)}</b></>]
      : [label, `${sym} = treatment area × ${factor}(${h.f} Hz)`, <>{`${it.areaM2.toFixed(1)} × ${fv} = `}<b>{fmt.m2(x.addedA)}</b></>];
  });
  const calcRows: ([string, string, ReactNode, string?] | null)[] = [
    ['Room volume', 'V', <b>{fmt.m3(V)}</b>],
    ['Existing absorption', 'A₀ = 0.161 × V ÷ measured RT60', <>{`0.161 × ${V.toFixed(0)} ÷ ${h.measured.toFixed(2)} = `}<b>{fmt.m2(h.existingA)}</b></>],
    ...addedRows,
    multi ? ['Added, all products', `ΔA = ${items.map(it => `ΔA${it.no}`).join(' + ')}`, <b>{fmt.m2(h.addedA)}</b>] : null,
    ['Total absorption', 'A = A₀ + ΔA', <b>{fmt.m2(h.totalA)}</b>],
    [`Predicted RT60 at ${fmt.hz(h.f)}`, 'RT60 = 0.161 × V ÷ A', <>{`0.161 × ${V.toFixed(0)} ÷ ${h.totalA.toFixed(1)} = `}<b>{fmt.s(h.predicted)}</b></>],
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
        <Stat kind="target" label="Target" value={t.preferred.toFixed(2)} tag={<Tag kind="target" />} sub={`Range ${t.min.toFixed(2)}–${fmt.s(t.max)}`} />
      </div>
      <Card icon="scale" title={`Measured, predicted and target · average RT60, ${SHORT}`} right={<PredPill status={st} />}>
        <RtScale target={t} measured={pred.measured} predicted={pred.predicted} arrow />
        <p className="lead">{sentence(pred, t, st, pred.plan.areaM2)}</p>
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
        <Card icon="sliders" title="Try a different amount" sub="Changes here update the treatment plan and the prediction together.">
          {items.map(it => (
            <div className="amount-item" key={it.id}>
              <div className="selected-product"><b>{`${multi ? `#${it.no} ` : ''}${it.product.name}`}</b><span>{it.configuration.label}</span></div>
              <AmountControl sel={it} keyName="pred" />
            </div>
          ))}
          <CoverageWarning cov={D.coverage(p)} />
          {goalText ? <Kv rows={[[`${sel.mode === 'units' ? 'Panels' : 'Area'}${multi ? ` of #${sel.no}` : ''} to reach ${fmt.s(t.preferred)}`, goalText, 'is-strong']]} /> : null}
          {goal ? <AmountGoal goal={goal} sel={sel} targetRT={t.preferred} /> : st === 'above' ? <GoalUnreachable sel={sel} targetRT={t.preferred} /> : null}
        </Card>
      </div>
      <Card icon="bars" title="Band by band">
        <Chart type="bands" cls="chart-compact" spec={{ line: true, series: [{ label: 'Measured', kind: 'measured', values: pred.bands.map((b: any) => b.measured) }, { label: 'Predicted', kind: 'predicted', values: pred.bands.map((b: any) => b.predicted) }], target: t, unit: 's', height: 200, yTitle: 'RT60 (s)', aria: 'Measured and predicted RT60 by band' }} height={200} />
        <Legend items={[['ln-measured', 'Measured'], ['ln-predicted', 'Predicted (modelled)'], ['zone', `Target range ${t.min.toFixed(2)}–${t.max.toFixed(2)} s`], ['pref', 'Preferred']]} />
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
                        : s ? <><PredPill status={s} />{vr && vr.min != null ? <KvNote>{`${vr.role === 'primary' ? 'judged' : 'own limit'} ${vr.min.toFixed(2)}–${fmt.s(vr.max)}`}</KvNote> : null}</> : <span className="small muted">No limit at this band</span>}</td>
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
