/* Step 9 · Predicted Result — measured condition + the whole treatment plan = predicted condition, compared with the
   target. Predicted values come only from AM.services.prediction (AM.derive.prediction) and are always styled apart from
   measured ones. The predicted verdict judges every band on its own: an average inside the range never hides a band
   outside it. The screen leads with that verdict in plain words (now, after treatment, target) and the amount to try.
   Under the technical details: one result line, the room's absorption at 1000 Hz as one bar (what is already there and
   what the products add), and every band now and after treatment on its allowed range; the calculation written out,
   the assumptions and limits, and the band table are folded below them. */
import type { ReactNode } from 'react';
import { acoustics, D, fmt, TGT } from '../lib';
import type { Ctx } from '../am';
import { AmountSlider, Btn, Card, CoverageWarning, Details, Icon, KvNote, Note, PredPill, RtScale, soundsAdvice, soundsText, StatusPill, TableWrap, TechH } from '../ui/kit';
import { BandRanges, type Band } from '../ui/bands';

/* eslint-disable @typescript-eslint/no-explicit-any */
// What the predicted verdict says, band by band, each against its own limits (never a difference that can turn negative).
// A stored input as it is used: up to three decimals, no trailing zeros (0.706, 2.977, 180).
const stored = (x: number) => String(+x.toFixed(3));
const limitOf = (r: any) => (r.min != null ? `${r.min.toFixed(2)}–${fmt.s(r.max)}` : `at most ${fmt.s(r.max)}`);
const bandList = (rs: any[]) => fmt.list(rs.map((r: any) => `${fmt.hz(r.f)} (${fmt.s(r.rt)}, limit ${limitOf(r)})`));
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
// measuredStatus: the room's own verdict before treatment.
function sentence(pred: any, t: any, st: string, area: number, measuredStatus: string): string {
  if (!area) return 'No treatment area yet, so the prediction equals the measured value.';
  const gain = `Shortens the average RT60 by ${fmt.s(pred.measured - pred.predicted)}`, v = pred.verdict;
  // A judged band not measured (often 125 Hz on a phone): within the target where measured, as Assessment says it.
  if (st === 'within' || !v) return `${gain}, ${st === 'within' ? (v && v.complete === false ? 'within the target where measured' : 'within the target in every band it is judged in') : 'with no verdict (the target is not complete)'}.`;
  const parts = [
    v.tmFails ? `the room's Tm, ${fmt.s(v.tm)}, is outside ${t.min.toFixed(2)}–${fmt.s(t.max)}` : '',
    v.above.length ? `longer than allowed at ${bandList(v.above)}` : '',
    v.below.length ? `drier than allowed at ${bandList(v.below)}` : '',
  ].filter(Boolean);
  const less = st === 'below' && !v.above.length
    ? (measuredStatus === 'below' ? ' The room was already below the target range before treatment: adding absorption makes it drier still, so no treatment is recommended.' : ' Less treatment would do.') : '';
  return `${gain}, but not yet within the target: ${parts.join('; ')}.${v.masked ? ' The average alone is inside the range, but every band has to be.' : ''}${less}`;
}

/* The room's absorption at one band as a single bar: what is already in the room (from its measured RT60) and what the
   products add, with the RT60 before and after. More absorption, shorter RT60. */
function AbsorptionBar({ f, existing, added, total, now, after, what }: { f: number; existing: number; added: number; total: number; now: number; after: number; what: string }) {
  const add = Math.max(0, added), whole = existing + add || 1, pct = (x: number) => `${(x / whole * 100).toFixed(2)}%`;
  return (
    <div className="ab">
      <span className="ab-k">{`Absorption at ${fmt.hz(f)}`}</span>
      <div className="ab-row">
        <div className="ab-bar" role="img" aria-label={`${fmt.m2(existing)} already in the room${add > 0 ? `, ${fmt.m2(add)} added by the ${what}` : ''}, ${fmt.m2(total)} in all`}>
          <span className="ab-base" style={{ width: pct(existing) }}><span>{`Already in the room · ${fmt.m2(existing)}`}</span></span>
          {add > 0 ? <span className="ab-add" style={{ width: `max(8px, ${pct(add)})` }} /> : null}
        </div>
        <b className="ab-tot">{`= ${fmt.m2(total)}`}</b>
      </div>
      <div className="ab-row"><span className="ab-add-k">{add > 0 ? `+${fmt.m2(add)} ${what}` : `The ${what} add no absorption at ${fmt.hz(f)}: they absorb no more than the surface they cover.`}</span><span /></div>
      <p className="ab-rt">{`RT60 at ${fmt.hz(f)}: ${fmt.s(now)} now → ${fmt.s(after)} after`}</p>
    </div>
  );
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
  const st = pred.predictedStatus || acoustics.classify(pred.predicted, t), v = pred.verdict, area = pred.plan.areaM2;
  // The "reach the target" suggestion is for the product being edited, given what the others add.
  const sel = items.find(i => i.id === ((D.treatmentSelection(p) || {}) as any).id) || items[items.length - 1];
  const goal = D.treatmentForTarget(p, sel), appAmt = D.autoAmount(p, sel) as any;
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

  // The verdict in plain words: what the plan does, which sounds stay off, and the one thing to try next.
  const aboveF: number[] = v ? v.above.map((r: any) => r.f) : [], belowF: number[] = v ? v.below.map((r: any) => r.f) : [];
  const masked = !!(v && v.masked);
  const [tone, icon, word] = !area ? ['warn', 'minus', 'No treatment yet']
    : st === 'within' ? ['good', 'check', v && v.complete === false ? 'Meets the target where measured' : 'Meets the target']
      : st === 'above' ? ['warn', 'arrowUp', masked ? 'Nearly on target' : 'Still above the target']
        : ['warn', 'arrowDn', 'Drier than the target'];
  const plan = fmt.list(items.filter(it => (it.mode === 'units' ? it.quantity > 0 : it.areaM2 > 0)).map(it => (it.mode === 'units' ? `${it.quantity} × ${it.product.name}` : `${fmt.m2(it.areaM2)} of ${it.product.name}`)));
  const off = soundsText(aboveF, belowF);
  const say = !area ? 'No treatment area yet, so the estimate equals the measured room.'
    : `With ${plan}, the room's RT60 should go from ${fmt.s(pred.measured)} to about ${fmt.s(pred.predicted)}. ${st === 'within' ? 'That is within the target for every pitch it is judged on.'
      : !v ? 'The target is not complete, so there is no verdict yet.' : off ? `${cap(off)}.` : 'The average is still outside the target range.'}`;
  // The technical details in one line: the result, the bands outside their limits after treatment with their value and
  // the limit they miss, the bands not measured, and what that means.
  const offAfter = v ? [...v.above, ...v.below].sort((x: any, y: any) => x.f - y.f) : [], notMeasured = pred.bands.filter((b: any) => b.measured == null);
  const line: [string, string, string] = !area ? ['minus', 'No treatment amount yet', 'The estimate equals the measured room until an amount is chosen.']
    : [st === 'within' ? 'check' : st === 'above' ? 'arrowUp' : 'arrowDn',
      `After treatment: ${fmt.s(pred.predicted)}, ${!v ? 'no verdict yet' : st === 'within' ? 'within the target' : st === 'above' ? (masked ? 'close to the target' : 'still above the target') : 'drier than the target'}`,
      [...(offAfter.length > 2 ? [`${fmt.list(offAfter.map((r: any) => fmt.hz(r.f)))} would ${offAfter.every((r: any) => r.status === 'below') ? 'drop below' : offAfter.every((r: any) => r.status === 'above') ? 'stay above' : 'fall outside'} their ranges.`]
        : offAfter.map((r: any) => (r.status === 'above' ? `${fmt.hz(r.f)} would be ${fmt.s(r.rt)}; it should be at most ${fmt.s(r.max)}.` : `${fmt.hz(r.f)} would drop to ${fmt.s(r.rt)}; it needs at least ${fmt.s(r.min)}.`))),
        notMeasured.length ? `${fmt.list(notMeasured.map((b: any) => fmt.hz(b.f)))} could not be measured.` : '',
        st === 'below' ? (a.status === 'below' ? 'The room was already drier than the target, so no treatment is recommended.' : 'Less treatment would do.') : '',
        st === 'within' && !offAfter.length && !notMeasured.length ? 'Every pitch it is judged on would be within its range.' : '',
      ].filter(Boolean).join(' ')];
  // Every band now and after treatment, each against its own limits as the predicted verdict judges it.
  const bandRows: Band[] = pred.bands.map((b: any) => {
    const vr = (pred.verdictRows || []).find((r: any) => r.f === b.f) || {}, lim = { f: b.f, min: vr.min != null ? vr.min : null, max: vr.max != null ? vr.max : null, role: vr.role };
    if (b.measured == null) return { ...lim, rt: null, status: 'insufficient' };
    if (b.predicted == null || b.missingAlpha || b.coveredExceedsMeasured) return { ...lim, rt: null, from: b.measured, status: 'insufficient', note: b.missingAlpha ? 'no tested value here' : 'finish values do not fit' };
    return { ...lim, rt: b.predicted, from: b.measured, status: vr.status || null };
  });
  const tip: string | null = !area || st === 'within' ? null
    : st === 'below' ? (a.status === 'below' ? 'The room was already drier than the target before treatment, so no treatment is recommended.' : 'Less treatment would do: move the bar below to the left.')
      : goal && goal.meetsBands === false ? `${sel.product.name} alone cannot fix every pitch. ${soundsAdvice(goal.above, goal.below)}`
        // Promised only when the app's own amount (its plan: within the free surface, whole panels) does meet it.
        : goal && !D.isAutoAmount(p, sel) && appAmt && appAmt.meets ? "The app's amount reaches the target: press “Go back to the app's amount” below."
          : goal && appAmt && !appAmt.meets && appAmt.capped ? `Meeting the target needs more ${sel.product.name} than the free surface where it goes allows. Place it on a larger surface, or add another product.`
          : !goal ? `No amount of ${sel.product.name} alone reaches the target. Combine it with another product, or choose another mounting.`
            : soundsAdvice(aboveF, belowF);

  return (
    <>
      <section className={`card av-hero is-stack is-${tone}`} aria-label="Predicted result">
        <div className="av-main">
          <span className="av-ic" aria-hidden="true"><Icon name={icon} size={28} sw={2.4} /></span>
          <div className="av-words">
            <span className="av-k">After treatment</span><b className="av-verdict">{word}</b>
            <p className="av-say">{say}</p>
            {tip ? <p className="av-next">{tip}</p> : null}
          </div>
        </div>
        <div className="av-figs is-three">
          <div className="av-fig is-room"><span className="av-k">Now</span><span className="av-n">{pred.measured.toFixed(2)}<small>s</small></span><span className="av-sub">{`measured, ${SHORT}`}</span></div>
          <div className="av-fig is-pred" data-watch="pred-headline"><span className="av-k">After</span><span className="stat-v av-n">{pred.predicted.toFixed(2)}<small>s</small></span><span className="av-sub">{`estimated, ${SHORT}`}</span></div>
          <div className="av-fig"><span className="av-k">Target</span><span className="av-n">{t.preferred != null ? <>{t.preferred.toFixed(2)}<small>s</small></> : <>{`≤ ${t.max.toFixed(2)}`}<small>s</small></>}</span><span className="av-sub">{t.preferred != null ? `range ${TGT.rangeText(t)}` : 'upper limit'}</span></div>
          <div className="av-scale"><RtScale target={t} measured={pred.measured} predicted={pred.predicted} arrow /></div>
        </div>
      </section>

      <Card icon="sliders" title="Try more or less" sub="Move the bar and the result above changes with it, and so does the plan.">
        {items.map(it => (
          <div className="amount-item" key={it.id}>
            <div className="selected-product"><b>{`${multi ? `#${it.no} ` : ''}${it.product.name}`}</b><span>{it.configuration.label}</span></div>
            <AmountSlider p={p} sel={it} keyName="pred" />
            {D.isAutoAmount(p, it) ? null : <div><Btn action="useAutoAmount" value={it.id} size="sm" cls="btn-wrap">Go back to the app's amount</Btn></div>}
          </div>
        ))}
        <CoverageWarning cov={D.coverage(p)} />
      </Card>

      <section className="card pv-tech" aria-label="Technical details">
        <Details id="pred-tech" summary="Show the technical details: the calculation and every band">
          <div className={`br-result is-${area ? st : 'none'}`}><span className="br-ri" aria-hidden="true"><Icon name={line[0]} size={16} sw={2.4} /></span><div><b>{line[1]}</b><p>{line[2]}</p></div></div>
          <AbsorptionBar f={h.f} existing={h.existingA} added={h.addedA} total={h.totalA} now={h.measured} after={h.predicted} what={multi ? 'products' : items[0] && items[0].mode === 'units' ? 'panels' : 'treatment'} />
          <p className="small muted">Each pitch, now and after treatment, against its allowed range.</p>
          <BandRanges bands={bandRows} preferred={t.preferred} label="Each pitch, now and after treatment, against its allowed range" />
          <Details id="pred-calc" summary="Show the calculation">
            <TechH title="How this is calculated" note={`Simplified Sabine model, written out at ${fmt.hz(h.f)}; every band is calculated the same way.`} />
            <div className="calc">
              {calcRows.filter((r): r is [string, string, ReactNode, string?] => !!r).map(([key, f, val, cls], i) => (
                <div className={`calc-r ${cls || ''}`} key={i}><span className="calc-k">{key}</span><span className="calc-f">{f}</span><span className="calc-v">{val}</span></div>
              ))}
            </div>
          </Details>
          <Details id="pred-limits" summary="Assumptions and limits">
            {(pred.checks || []).map((c: any, i: number) => <p className="small muted" key={i}>{c.text}</p>)}
            <p className="small muted">{`A₀ is the room's equivalent absorption from the measured RT60 (the relation ISO 354 uses): furniture, people and air included. α is the octave-band value of ${items.map(it => `${multi ? `#${it.no} ` : ''}${it.configuration.label} (certificate ${it.configuration.test.certificate || '—'})`).join(', ')}: the mean of the three tested one-third-octave values in each octave, at most 1.00. The finish α is that of the surface each product covers, from Room Setup.${unknownCover.length ? ` For ${unknownCover.map(it => `${multi ? `#${it.no} ` : ''}${it.product.name}`).join(', ')} the covered finish is not set, so its own absorption is not subtracted and the effect may be overstated a little.` : ''} The model assumes an even (diffuse) sound field and that the measured RT60 represents the room; placement and edge effects of the panels are not modelled, so treat the result as an estimate.`}</p>
          </Details>
          <Details id="pred-numbers" summary="Show the numbers">
            <p className="small">{sentence(pred, t, st, area, a.status)}</p>
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
          </Details>
        </Details>
      </section>
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
