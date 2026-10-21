/* Step 10 · Final Result — the project at a glance: the room on the brand band, the outcome in one verdict and one
   sentence, and the journey in four figures (RT60 now, treatment, RT60 after, target); the project record is folded
   under the project details. Then what is left to do, and the project report (PDF), offered once, at the bottom, and only
   after this project's report form has been received (js/services/report-gate.js decides; this screen shows its state). */
import type { ReactNode } from 'react';
import { am, D, fmt, stageModel, TGT, W } from '../lib';
import type { Ctx, PrimaryAction, Project } from '../am';
import { amountWords, Btn, Card, Details, Icon, Kv, KvNote, Logo, Note, NoteActions, RfCheck, RfInput, RfSelect, RfTextarea, RtScale, soundsText, Spin } from '../ui/kit';

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
  if (!RG) return <Card icon="doc" title="Get the PDF report" cls="no-print"><Note tone="warn">The report form is not available, so the PDF report is locked.</Note></Card>;
  const v = RG.view(p), reportBusy = M().reportBusy();
  if (v.missing) return <Card icon="doc" title="Get the PDF report" cls="no-print"><Note tone="critical">The report form is missing (js/data/report-form.js), so the report cannot be unlocked.</Note></Card>;
  const [tone, text, ic] = v.pill, st: string = v.st, pr = v.problem, brand: string = v.brand;
  const pillHtml = (window.AM.ui as any).pill(tone, text, ic) as string;
  const state = <span id="rf-state" className="rf-pill" dangerouslySetInnerHTML={{ __html: pillHtml }} />;
  const lockedDownload = (
    <div className="rf-locked">
      <Btn action="downloadReport" size="sm" icon="lock" reason="The PDF report unlocks after the report form is received.">Download PDF Report</Btn>
      <span className="small muted">Unlocks when the form is received.</span>
    </div>
  );
  if (st === 'success') {
    return (
      <Card icon="doc" title="Your PDF report" cls="no-print rf-card is-unlocked" id="report-card" right={state}>
        <Note tone="good"><b>{`Form received${v.rec.submittedAt ? ` on ${fmt.when(v.rec.submittedAt)}` : ''}.`}</b> Thank you. The PDF report for this project is unlocked.</Note>
        <p className="small muted">{`It holds ${about.charAt(0).toLowerCase()}${about.slice(1)}`}</p>
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
      <Card icon="doc" title="Get the PDF report" cls="no-print rf-card" id="report-card" right={state}>
        {st === 'checking' ? <p className="rf-status small muted" id="rf-status" role="status"><Spin /> Confirming this project’s submission with the report server…</p> : problemNote()}
        {lockedDownload}
      </Card>
    );
  }
  const health = v.health, locked = st === 'submitting' || st === 'uncertain', blocked = health === 'file' || health === 'not_configured';
  const healthNote = health === 'file' ? <Note tone="warn" icon="info">This page was opened from a file, so the form cannot be sent. Open the app from its server address instead.</Note>
    : health === 'not_configured' ? <Note tone="warn" icon="info">The report form is not connected yet, so it cannot be sent and the report stays locked.</Note>
      : health === 'unreachable' ? <Note tone="warn" icon="info">The report server cannot be reached right now, so the form cannot be sent. <NoteActions><Btn action="reportHealth" size="sm" icon="refresh">Check again</Btn></NoteActions></Note> : null;
  const fields = v.fields.filter((f: any) => f.type !== 'consent' && f.type !== 'checkbox'), checks = v.fields.filter((f: any) => f.type === 'consent' || f.type === 'checkbox');
  return (
    <Card icon="doc" title="Get the PDF report" sub="One short form, then the PDF is yours." cls="no-print rf-card" id="report-card" right={state}>
      <p className="rf-intro">{`The PDF holds ${about.charAt(0).toLowerCase()}${about.slice(1)} ${brand} keeps your answers and a short summary of this project, securely.`}</p>
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

/* ---------- the summary ---------- */
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const toReport = () => { const el = document.getElementById('report-card'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

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
  // The products actually in the plan (an amount above zero), as the summary names them.
  const shown = items.filter(it => (it.mode === 'units' ? it.quantity > 0 : it.areaM2 > 0)), one = shown.length === 1 ? shown[0] : null;
  const amount = none || !shown.length ? 'None' : one ? amountOf(one) : `${shown.length} products`;
  // "Project complete" only when nothing earlier is waiting for review.
  const flagged = W.needsReview(p, 'final') || p.review.some(id => id !== 'final');
  const warnText = (ws: any[]) => ws.map(w => `${fmt.hz(w.f)} ${w.status === 'above' ? 'longer' : 'shorter'} than its own limit`).join(', ');
  const m = D.measured(p) as any;
  const about = `The room, the measurement at ${a.positions.valid} position${a.positions.valid > 1 ? 's' : ''}, the target and the verdict${none ? '' : ', and the treatment plan with its predicted result (labelled as an estimate)'}.`;
  const RG = am.reportGate as any, unlocked = !!(RG && RG.view(p).st === 'success');

  // The outcome in plain words: one verdict and one sentence (each band is still judged on its own).
  const bandsOut = pv ? soundsText(pv.above.map((r: any) => r.f), pv.below.map((r: any) => r.f)) : '';
  const what = !one ? `${shown.length} products` : one.mode === 'units' ? `${one.quantity} × ${one.product.name}` : `${one.product.name}, ${coverOf(one)}`;
  const drop = pred ? `the room's RT60 should go from ${fmt.s(pred.measured)} to about ${fmt.s(pred.predicted)}` : '';
  const [tone, icon, verdict, say] = none
    ? (a.status === 'within'
      ? ['good', 'check', 'No treatment needed', `The room's RT60 is ${fmt.s(a.rt)}, already within the target (${TGT.rangeText(t)}).`]
      : ['warn', 'arrowDn', 'Below the target', `The room's RT60 is ${fmt.s(a.rt)}, below the target range. More absorption would make it drier, so no treatment was selected.`])
    : !totalArea ? ['warn', 'minus', 'No treatment amount yet', `The room stays at ${fmt.s(pred.measured)} until an amount is chosen in Treatment.`]
      : st === 'within' ? ['good', 'check', 'Meets the target', `With ${what}, ${drop}.`]
        : st === 'above' ? ['warn', 'arrowUp', pv && pv.masked ? 'Nearly on target' : 'Still above the target', `With ${what}, ${drop}.${bandsOut ? ` ${cap(bandsOut)}.` : ''}`]
          : a.status === 'below' ? ['warn', 'arrowDn', 'Treatment not recommended', `The room was already below the target, and ${what} would make it drier still.`]
            : ['warn', 'arrowDn', 'Drier than the target', `With ${what}, ${drop}, below the target range. Less treatment would do.`];

  const record = (
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
  );

  return (
    <>
      {/* The project at a glance: the room on the brand band, then the outcome and the journey in four figures. */}
      <section className={`card fx-hero is-${tone}`} aria-label="Project summary">
        <div className="fx-band">
          <Logo size={40} />
          <div className="fx-room">
            <span className="fx-eyebrow">Project summary</span>
            <h2 className="fx-name">{p.room.name || 'Untitled room'}</h2>
            <span className="fx-meta">{`${[p.room.type, fmt.dims(g), fmt.m3(g.V)].filter(Boolean).join(' · ')}`}</span>
          </div>
          {done ? <span className={`fx-state ${flagged ? 'is-warn' : 'is-good'}`}><Icon name={flagged ? 'alert' : 'seal'} size={15} sw={2.2} />{flagged ? 'Needs review' : 'Project complete'}</span> : null}
        </div>
        <div className="fx-body">
          <div className="fx-verdict"><span className="fx-vi" aria-hidden="true"><Icon name={icon} size={20} sw={2.4} /></span><b>{verdict}</b></div>
          <p className="fx-say">{say}</p>
          <div className="fx-flow">
            <div className="fx-step is-now"><span className="fx-k">RT60 now</span><span className="fx-n">{a.rt.toFixed(2)}<small>s</small></span><span className="fx-s">measured</span></div>
            <span className="fx-arrow" aria-hidden="true"><Icon name="arrowR" size={18} sw={2} /></span>
            <div className="fx-step is-treat"><span className="fx-k">Treatment</span><span className="fx-t">{amount}</span>
              <span className="fx-s">{none ? (a.status === 'within' ? 'not needed' : 'not recommended') : shown.map(it => it.product.name).join(', ') || 'no amount chosen'}</span></div>
            <span className="fx-arrow" aria-hidden="true"><Icon name="arrowR" size={18} sw={2} /></span>
            <div className="fx-step is-after"><span className="fx-k">RT60 after</span><span className="fx-n">{none ? '—' : <>{pred.predicted.toFixed(2)}<small>s</small></>}</span><span className="fx-s">{none ? 'nothing to predict' : 'estimated'}</span></div>
            <div className="fx-step is-target"><span className="fx-k">Target</span><span className="fx-n">{t.preferred != null ? <>{t.preferred.toFixed(2)}<small>s</small></> : <>{`≤ ${t.max.toFixed(2)}`}<small>s</small></>}</span><span className="fx-s">{t.preferred != null ? `range ${TGT.rangeText(t)}` : 'upper limit'}</span></div>
          </div>
          {none ? <RtScale target={t} measured={a.rt} /> : <RtScale target={t} measured={pred.measured} predicted={pred.predicted} arrow />}
          <Details id="final-details" summary="Show the project details">
            {record}
            <p className="small muted">{`RT60 values are the average over ${SHORT}. Measured at ${a.positions.valid} position${a.positions.valid > 1 ? 's' : ''} (latest take ${fmt.when(m.takenAt)}) and judged band by band over ${a.policy.judgedShort} (${a.policy.criterion || "the project's own target, the app's default bands"}): ${a.explanation.headline.toLowerCase()}.${a.warnings.length ? ` Band warning${a.warnings.length > 1 ? 's' : ''}: ${warnText(a.warnings)}.` : ''}${pv && pv.warnings.length ? ` After treatment, predicted: ${warnText(pv.warnings)}.` : ''}`}</p>
          </Details>
        </div>
      </section>

      {/* What is left to do, in order: the report now, a new measurement once the treatment is installed. */}
      {none ? null : (
        <section className="fx-next no-print" aria-label="What's next">
          <div className="fx-act">
            <span className="fx-num" aria-hidden="true">1</span>
            <div className="fx-act-b"><b>Get the PDF report</b><span>{unlocked ? 'The report is unlocked and ready to download.' : 'Fill in one short form, then download it.'}</span></div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={toReport}>{unlocked ? 'Go to the download' : 'Go to the form'}<Icon name="arrowDn" size={15} sw={2.2} /></button>
          </div>
          <div className="fx-act">
            <span className="fx-num" aria-hidden="true">2</span>
            <div className="fx-act-b"><b>Measure again after installing</b><span>{`A new measurement confirms the result. Until then, ${fmt.s(pred.predicted)} is an estimate.`}</span></div>
            <Btn action="followUp" size="sm" icon="mic">Measure the treated room</Btn>
          </div>
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
