/* Step 10 · Final Result — the whole journey: room, target, measured, treatment, predicted, compared with target.
   The project report (PDF) is offered once, at the bottom, and only after this project's report form has been received
   (js/services/report-gate.js decides; this screen shows its state). */
import type { ReactNode } from 'react';
import { am, D, fmt, RA, stageModel, TGT, W } from '../lib';
import type { Ctx, PrimaryAction, Project } from '../am';
import { amountWords, Btn, Card, ExtLink, Icon, Kv, KvNote, Note, NoteActions, Pill, ResultPill, RfCheck, RfInput, RfSelect, RfTextarea, RtScale, soundsText, Spin, StatusPill, Tag } from '../ui/kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
const M = () => stageModel<{ reportBusy(): boolean }>('final');
const esc = am.util.esc;

/* ---------- the report form and the PDF report ---------- */
function ReportField({ f, dr }: { f: any; dr: any }) {
  const id = `rf-${f.key}`, v = dr.values[f.key], err: string = dr.errors[f.key] || '', described = `${id}-err`;
  const errEl = <div className="field-err" id={described} hidden={!err}><Icon name="alert" size={13} sw={2.2} /><span dangerouslySetInnerHTML={{ __html: esc(err) }} /></div>;
  if (f.type === 'consent' || f.type === 'checkbox') {
    return (
      <div className={f.type === 'consent' ? 'rf-check is-consent' : 'rf-check'}>
        <label className="check" htmlFor={id}>
          <RfCheck id={id} rf={f.key} checked={!!v} invalid={!!err} describedBy={described} />
          <span className="check-t"><span>{f.label.replace('{brand}', am.brand.name)}</span>{f.required ? <span className="check-h">Required</span> : null}</span>
        </label>
        {errEl}
      </div>
    );
  }
  let control: ReactNode;
  if (f.type === 'select' || f.type === 'country') {
    const view = am.reportGate && (am.reportGate as any).view;
    const opts: string[] = f.type === 'country' ? (view ? view(am.store.state.project).countries : []) : f.options;
    control = <RfSelect id={id} rf={f.key} value={v || ''} options={opts} placeholder={f.placeholder || 'Choose'} invalid={!!err} describedBy={described} country={f.type === 'country'} />;
  } else if (f.type === 'textarea') {
    control = <>
      <RfTextarea id={id} rf={f.key} value={v || ''} maxLength={f.maxLength} invalid={!!err} describedBy={described} />
      <div className="rf-count" id={`${id}-count`} aria-live="off" dangerouslySetInnerHTML={{ __html: `${String(v || '').length} / ${f.maxLength}` }} />
    </>;
  } else {
    control = <RfInput id={id} rf={f.key} value={v || ''} type={f.type === 'email' ? 'email' : 'text'} maxLength={f.maxLength || 200} autoComplete={f.autocomplete || 'off'} invalid={!!err} describedBy={described} />;
  }
  return (
    <div className={f.type === 'textarea' ? 'field rf-wide' : 'field'}>
      <label className="field-l" htmlFor={id}>{f.label || ''}{f.required ? <span className="req">Required</span> : <span className="opt">Optional</span>}</label>
      {control}
      {errEl}
    </div>
  );
}

function ReportCard({ p, about }: { p: Project; about: string }) {
  const RG = am.reportGate as any;
  if (!RG) return <Card icon="doc" title="Project report" cls="no-print"><Note tone="warn">The report form is not available, so the PDF report is locked.</Note></Card>;
  const v = RG.view(p), reportBusy = M().reportBusy();
  if (v.missing) return <Card icon="doc" title="Project report" cls="no-print"><Note tone="critical">The report form is missing (js/data/report-form.js), so the report cannot be unlocked.</Note></Card>;
  const [tone, text, ic] = v.pill, st: string = v.st, pr = v.problem, brand: string = v.brand;
  const pillHtml = (window.AM.ui as any).pill(tone, text, ic) as string;
  const state = <span id="rf-state" className="rf-pill" dangerouslySetInnerHTML={{ __html: pillHtml }} />;
  const lockedDownload = (
    <div className="rf-locked">
      <Btn action="downloadReport" size="sm" icon="lock" reason="The PDF report unlocks after the report form is received.">Download PDF Report</Btn>
      <span className="small muted">{`Locked until the form is received. ${about}`}</span>
    </div>
  );
  if (st === 'success') {
    return (
      <Card icon="doc" title="Project report" cls="no-print rf-card is-unlocked" id="report-card" right={state}>
        <Note tone="good"><b>{`Form received${v.rec.submittedAt ? ` on ${fmt.when(v.rec.submittedAt)}` : ''}.`}</b> Thank you. The PDF report for this project is unlocked.</Note>
        <p className="small muted">{about}</p>
        <div className="hstack">
          <button type="button" className="btn btn-primary btn-sm" id="rf-download" data-action="downloadReport" disabled={reportBusy || undefined} aria-busy={reportBusy || undefined}>
            {reportBusy ? <><Spin /> Preparing the PDF…</> : <><Icon name="doc" size={15} sw={1.9} /> Download PDF Report</>}
          </button>
          <span className="rf-ref">{`Submission reference ${String(v.rec.submissionId).slice(0, 8).toUpperCase()}`}</span>
        </div>
      </Card>
    );
  }
  const problemNote = (): ReactNode => {
    if (st === 'uncertain') {
      return (
        <Note tone="warn"><b>Not confirmed yet.</b>{` ${pr ? pr.message : 'The report server did not confirm the submission.'} Your answers may already have been recorded. Checking again sends the same submission, so it cannot be recorded twice.`}
          <NoteActions><button type="button" className="btn btn-primary btn-sm" data-action="reportRetry" disabled={v.busy || undefined} aria-busy={v.busy || undefined}>{v.busy ? <><Spin /> Checking…</> : <><Icon name="refresh" size={15} sw={2} /> Check again</>}</button></NoteActions>
        </Note>
      );
    }
    if (st === 'failed') return <Note tone="critical"><b>Not sent.</b>{` ${pr.message} Your answers are still here: correct them if needed and send again.`}</Note>;
    if (st === 'unconfirmed' && pr) return <Note tone="warn">{pr.message}{pr.kind === 'unreachable' ? <NoteActions><Btn action="reportRetry" size="sm" icon="refresh">Check again</Btn></NoteActions> : null}</Note>;
    if (pr && pr.kind === 'unconfirmed') return <Note tone="warn">{pr.message}</Note>;
    return null;
  };
  if (st === 'checking' || st === 'unconfirmed') {
    // Sent earlier: the server has to confirm the receipt before the report unlocks. No form to fill in.
    return (
      <Card icon="doc" title="Project report" cls="no-print rf-card" id="report-card" right={state}>
        {st === 'checking' ? <p className="rf-status small muted" id="rf-status" role="status"><Spin /> Confirming this project’s submission with the report server…</p> : problemNote()}
        {lockedDownload}
      </Card>
    );
  }
  const health = v.health, locked = st === 'submitting' || st === 'uncertain', blocked = health === 'file' || health === 'not_configured';
  const healthNote = health === 'file' ? <Note tone="warn" icon="info">This page is opened from a file, so the form cannot be sent. Start the app with <b>server/app_server.py</b> and open the address it shows (see README, Report form).</Note>
    : health === 'not_configured' ? <Note tone="warn" icon="info">The report form is not connected to its database yet, so it cannot be sent and the report stays locked. Setup: README, Report form.</Note>
      : health === 'unreachable' ? <Note tone="warn" icon="info">The report server cannot be reached, so the form cannot be sent right now. The app has to be opened from the address <b>server/app_server.py</b> shows (README, Report form). <NoteActions><Btn action="reportHealth" size="sm" icon="refresh">Check again</Btn></NoteActions></Note> : null;
  const fields = v.fields.filter((f: any) => f.type !== 'consent' && f.type !== 'checkbox'), checks = v.fields.filter((f: any) => f.type === 'consent' || f.type === 'checkbox');
  return (
    <Card icon="doc" title="Project report" sub="One short form, then the PDF report is yours." cls="no-print rf-card" id="report-card" right={state}>
      <p className="rf-intro">{`Before the report is created, ${brand} asks who it is for. Fill in the form and submit it: your answers and a short summary of this project are saved in ${brand}’s secure database, and the `}<b>Download PDF Report</b>{' button unlocks as soon as they are received.'}</p>
      {healthNote}{problemNote()}
      <form id="report-form" className="rf" noValidate aria-label="Report form">
        <fieldset className="rf-fields" disabled={locked || undefined}>
          <legend className="sr-only">Your details</legend>
          <div className="rf-grid">{fields.map((f: any) => <ReportField f={f} dr={v.dr} key={f.key} />)}</div>
          <div className="rf-checks">{checks.map((f: any) => <ReportField f={f} dr={v.dr} key={f.key} />)}</div>
        </fieldset>
      </form>
      <details className="more rf-sent">
        <summary>Exactly what is sent, and where</summary>
        <p className="small">{`One record is saved in ${brand}’s private database (hosted by Supabase), which only the report server can write to and only people ${brand} authorises can read. It holds:`}</p>
        <ul className="bullets small">
          <li>your answers above (name, email, role, organisation if given, country, purpose, comments if given) and your two consent choices, with the time;</li>
          <li>{`a short summary of this project: ${v.sent.join(', ')};`}</li>
          <li>a submission reference and the app version.</li>
        </ul>
        <p className="small muted">Nothing else is sent: no recordings or audio, no measurement data or history, nothing about the room beyond the names and notes of materials you typed in yourself (so they can be reviewed for the library), no products, no files and not the report itself. The project stays on this device either way. Until your answers are received they are kept in this browser, so that sending again cannot record them twice.</p>
      </details>
      {st === 'uncertain' ? null : (
        <div className="rf-actions">
          <button type="button" className="btn btn-primary" id="rf-submit" data-action="reportSubmit" disabled={st === 'submitting' || undefined} aria-busy={st === 'submitting' || undefined}
            aria-disabled={blocked && st !== 'submitting' ? 'true' : undefined} data-reason={blocked && st !== 'submitting' ? (health === 'file' ? 'Open the app from its server to send the form.' : 'The report form is not connected to its database yet.') : undefined}>
            {st === 'submitting' ? <><Spin /> Submitting…</> : <><Icon name="arrowR" size={16} sw={2.2} />{` ${st === 'failed' ? 'Send again' : 'Submit and unlock the report'}`}</>}
          </button>
          <span className="rf-status small muted" id="rf-status" role="status" aria-live="polite">{st === 'submitting' ? 'Sending your answers to the report server…' : ''}</span>
        </div>
      )}
      {lockedDownload}
    </Card>
  );
}

/* ---------- the journey ---------- */
const Node = ({ cls, label, value, sub, tag }: { cls: string; label: string; value: string; sub: ReactNode; tag?: ReactNode }) => (
  <div className={`f-node ${cls}`}><div className="f-node-h"><span className="label">{label}</span>{tag}</div><span className="f-v">{value}</span><span className="f-s">{sub}</span></div>
);
const Arrow = () => <span className="f-arrow" aria-hidden="true"><Icon name="arrowR" size={20} sw={2} /></span>;

export function FinalScreen({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, g = D.geometry(p), a = D.assessment(p) as any, pred = D.prediction(p) as any;
  const none = !pred && D.noTreatment(p); // the room meets (or is below) the target and no treatment was chosen
  if (!g || !a || !a.available || (!pred && !none)) return <Note tone="warn">{a && !a.available ? `The summary needs the room's average RT60. ${a.reason || ''}` : D.predictionMissing(p) || 'The summary needs every earlier step.'}</Note>;
  // The journey is told with the room's summary RT60; the status is the verdict, judged band by band.
  const t = a.target, items: any[] = pred ? pred.items : [], multi = items.length > 1, SHORT = a.policy.short;
  const sel = items[0] || null, prod = sel && sel.product, cfg = sel && sel.configuration, totalArea = pred ? pred.plan.areaM2 : 0;
  const st = pred ? pred.predictedStatus : a.status;
  const pv = pred && pred.verdict;
  const done = W.isDone(p, 'final');
  // How much, in everyday words (no areas): "6 panels", or how much of a surface a product covers.
  const coverOf = (it: any) => amountWords(p, it).replace(/^\d+ panels?, /, '');
  const amountOf = (it: any) => (it.mode === 'units' ? `${it.quantity} panel${it.quantity === 1 ? '' : 's'}` : coverOf(it).replace(/^covering (about )?/, ''));
  const amount = none ? 'None' : multi ? `${items.length} products` : amountOf(sel);
  let headline: string;
  if (none) {
    headline = a.status === 'within'
      ? `The room's average RT60 (${SHORT}) is ${fmt.s(a.rt)}, within the target (${TGT.rangeText(t)}). No treatment is needed.`
      : `The room's average RT60 (${SHORT}) is ${fmt.s(a.rt)}, below the target range. Adding absorption would make it drier, so no treatment was selected.`;
  } else {
    // What would still be wrong after treatment, in everyday words (each band is judged on its own).
    const bandsOut = pv ? soundsText(pv.above.map((r: any) => r.f), pv.below.map((r: any) => r.f)) : '';
    const gapText = pv && pv.masked ? `right on average, but ${bandsOut}`
      : pv && pv.summaryStatus === 'above' ? `still ${fmt.s(pred.predicted - t.max)} above the target${t.min != null ? ' range' : `'s ${fmt.s(t.max)} limit`}${bandsOut ? `: ${bandsOut}` : ''}`
        : `not yet within the target${bandsOut ? `: ${bandsOut}` : ''}`;
    const what = multi ? `the ${items.length} products` : sel.mode === 'units' ? `${sel.quantity} panel${sel.quantity === 1 ? '' : 's'} of ${prod.name} (${coverOf(sel)})` : `${prod.name} ${coverOf(sel)}`;
    headline = !totalArea
      ? `No treatment chosen in an amount yet. The room's average echo time stays at ${fmt.s(pred.measured)} against a target of ${TGT.fullText(t)}.`
      : st === 'within' ? `With ${what}, the average echo time is predicted to go from ${fmt.s(pred.measured)} to ${fmt.s(pred.predicted)}: within the target.`
        : st === 'above' ? `With ${what}, the average echo time is predicted to go from ${fmt.s(pred.measured)} to ${fmt.s(pred.predicted)}. That is ${gapText}.`
          : a.status === 'below' ? `The room was already below the target range before treatment, and ${what} would make it drier still (${fmt.s(pred.predicted)}). No treatment for reverberation is recommended.`
            : `With ${what}, the average echo time is predicted to drop to ${fmt.s(pred.predicted)}, below the target range${bandsOut ? `: ${bandsOut}` : ''}. Less treatment would do.`;
  }
  // "Project complete" only when nothing earlier is waiting for review.
  const flagged = W.needsReview(p, 'final') || p.review.some(id => id !== 'final');
  const warnText = (ws: any[]) => ws.map(w => `${fmt.hz(w.f)} ${w.status === 'above' ? 'longer' : 'shorter'} than its own limit`).join(', ');
  const m = D.measured(p) as any;
  const about = `A PDF to share with a client or an acoustic consultant, made from this project's saved data: the room, the measurement at ${a.positions.valid} position${a.positions.valid > 1 ? 's' : ''} (latest take ${fmt.when(m.takenAt)}) with each position's values, the target and the verdict with its band warnings${none ? '' : ', the treatment plan and the predicted result, labelled as a model estimate'}.`;

  const record = (
    <Card icon="doc" title="Project record">
      <div className="record">
        <Kv rows={[['Room', fmt.dims(g)], ['Volume', fmt.m3(g.V)], ['Use', p.room.use || '—']]} />
        <Kv rows={[
          ['Target', <>{TGT.fullText(t)}{p.target.basis ? <KvNote>{`${p.target.basis}${p.target.note ? ` · ${p.target.note}` : ''}`}</KvNote> : null}</>],
          ['Average RT60', <>{fmt.s(a.rt)}<KvNote>{`${SHORT}, compared with the target`}</KvNote></>],
          [`RT60 at ${fmt.hz(a.ref.f)}`, <>{`${fmt.s(a.ref.rt)} · ${a.ref.method}`}<KvNote>reference band, where a take's validity is decided</KvNote></>],
          ['Confidence', <>{a.ref.confidence}<KvNote>{`at ${fmt.hz(a.ref.f)}`}</KvNote></>],
        ]} />
        {none ? <Kv rows={[['Treatment', 'None'], ['Predicted average', '—']]} />
          : multi ? <Kv rows={[...items.map(it => [`Treatment #${it.no}`, <>{it.product.name}<KvNote>{amountWords(p, it)}</KvNote><KvNote>{`Mounting: ${it.configuration.label}`}</KvNote></>] as [string, ReactNode]), ['Predicted average', fmt.s(pred.predicted)]]} />
            : <Kv rows={[['Treatment', prod.name], ['How much', amountWords(p, sel)], ['Mounting', <>{cfg.label}<KvNote>{cfg.test.certificate ? `Test certificate ${cfg.test.certificate}` : ''}</KvNote></>], ['Predicted average', fmt.s(pred.predicted)]]} />}
      </div>
    </Card>
  );
  const next = none ? null : (
    <Card icon="mic" title="Next: verify with a new measurement" cls="no-print">
      <p className="lead">{`Install the treatment, then measure the room again. Comparing the new measurement with this one is what proves the improvement. Until then, ${fmt.s(pred.predicted)} is an estimate.`}</p>
      <div className="hstack"><Btn action="followUp" size="sm" icon="mic">Measure the treated room</Btn><span className="small muted">Starts a new project with this room and target, at Measurement Setup.</span></div>
    </Card>
  );

  return (
    <>
      <Card icon="seal" cls={done && !flagged ? 'final-hero is-complete' : 'final-hero'} title={p.room.name || 'Untitled room'}
        sub={`${[p.room.industry, p.room.type].filter(Boolean).join(' · ') || 'Room'} · ${fmt.dims(g)} · ${fmt.m3(g.V)}`}
        right={<>{done && !flagged ? <Pill tone="good" text="Project complete" icon="seal" /> : done && flagged ? <Pill tone="warn" text="Needs review" icon="alert" /> : null}{none ? <StatusPill status={st} /> : <ResultPill v={pv} st={st} />}</>}>
        <p className="lead">{headline}</p>
        <p className="small muted">{`Measured at ${a.positions.valid} position${a.positions.valid > 1 ? 's' : ''} and judged band by band over ${a.policy.judgedShort} (${a.policy.criterion || "the project's own target, the app's default bands"}): ${a.explanation.headline.toLowerCase()}.${a.warnings.length ? ` Band warning${a.warnings.length > 1 ? 's' : ''}: ${warnText(a.warnings)}.` : ''}${pv && pv.warnings.length ? ` After treatment, predicted: ${warnText(pv.warnings)}.` : ''}`}</p>
      </Card>
      <Card icon="trend" title={`Before → treatment → predicted → target · average RT60, ${SHORT}`}>
        <div className="flow4">
          <Node cls="is-measured" label="Before" value={fmt.s(a.rt)} sub={`Measured average, ${RA.describe(a.summary)}, ${a.positions.valid} position${a.positions.valid > 1 ? 's' : ''}`} tag={<Tag kind="measured" />} /><Arrow />
          {none ? <Node cls="is-treatment" label="Treatment" value="None" sub={a.status === 'within' ? 'Not needed: the room meets the target' : 'Not recommended: the room is below the target'} />
            : multi ? <Node cls="is-treatment" label="Treatment" value={amount} sub={<>{items.map(it => <span key={it.id}>{`#${it.no} ${it.product.name} · ${amountOf(it)}`}<br /></span>)}</>} />
              : <Node cls="is-treatment" label="Treatment" value={amount} sub={`${prod.name} · ${cfg.label}`} />}<Arrow />
          {none ? <Node cls="is-predicted" label="Predicted" value="—" sub="Nothing to predict without treatment" tag={<Tag kind="predicted" />} />
            : <Node cls="is-predicted" label="Predicted" value={fmt.s(pred.predicted)} sub={`${fmt.signedS(pred.predicted - pred.measured)} vs measured`} tag={<Tag kind="predicted" />} />}<Arrow />
          <Node cls="is-target" label="Target" value={TGT.valueText(t)} sub={!none && totalArea ? (Math.abs(pred.predicted - TGT.aim(t)) < 0.005 ? 'The prediction is right on it' : `The prediction is ${fmt.s(Math.abs(pred.predicted - TGT.aim(t)))} ${pred.predicted > TGT.aim(t) ? 'above' : 'below'} it`) : t.preferred != null ? `Range ${TGT.rangeText(t)}` : 'Upper limit'} tag={<Tag kind="target" />} />
        </div>
        {none ? <RtScale target={t} measured={a.rt} /> : <RtScale target={t} measured={pred.measured} predicted={pred.predicted} arrow />}
      </Card>
      {record}
      {next}
      {/* With a treatment plan: the official panel and wall configurator, in a new tab. It receives nothing from this project. */}
      {none ? null : (
        <section className="card ext-card no-print" aria-label="UniVicoustic Panel and Wall Configurator">
          <ExtLink tone="acoustic" glyph="wall" href={am.brand.links.configurator} level={2} title="Explore panel and wall configurations"
            text="Explore panel and wall configuration options for your acoustic treatment project." label="Open Panel & Wall Configurator"
            note="Opens the UniVicoustic configurator in a new tab, where you sign in. It does not receive this room, the selected products, their quantities or the RT60 results; this project stays as it is here." />
        </section>
      )}
      <ReportCard p={p} about={about} />
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Once finished, the main action goes home, unless an earlier change has put the summary up for review again.
export function finalPrimary(ctx: Ctx): PrimaryAction | null {
  const p = ctx.project, a = D.assessment(p), pred = D.prediction(p);
  if (!D.geometry(p) || !a || !a.available || (!pred && !D.noTreatment(p))) return null;
  return W.isDone(p, 'final') && !W.needsReview(p, 'final') ? { label: 'Back to Home', action: 'go', value: 'home' } : null;
}
