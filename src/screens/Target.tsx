/* Step 2 · Target / Ideal RT60 — what we want, decided before measuring. The recommendation comes from
   AM.services.target, only from a verified criterion that applies to the room; the project keeps the values it confirms
   (js/stages/target.js). Without one, the step says why and offers another room category, or the project's own target
   with its source: nothing is filled in by the app. */
import { EVAL, fmt, isNum, stageModel, TGT } from '../lib';
import type { Ctx, Target } from '../am';
import { Btn, Card, Field, GuideThumb, Icon, More, Note, Pill, RtScale, Stat, Stepper, SubH, Tag, TextInput } from '../ui/kit';

interface TargetModel { MIN: number; MAX: number; problem(t: Target, own: boolean): string | null; sameValues(a: unknown, b: unknown): boolean; isOwn(t: Target, rec: unknown): boolean }
const M = () => stageModel<TargetModel>('target');

/* eslint-disable @typescript-eslint/no-explicit-any */
// The six checks made before a target is generated (AM.services.target.availability), in order.
function ChecksList({ checks }: { checks: any[] }) {
  return (
    <ol className="tgt-checks">
      {checks.map(c => (
        <li key={c.id} className={c.ok === true ? 'is-ok' : c.ok === false ? 'is-fail' : 'is-skip'}>
          <Icon name={c.ok === true ? 'check' : c.ok === false ? 'x' : 'minus'} size={15} sw={2.2} />
          <div><b>{c.label}</b>{c.detail ? <span className="small muted">{` ${c.detail}`}</span> : c.ok == null ? <span className="small muted"> Not reached.</span> : null}</div>
        </li>
      ))}
    </ol>
  );
}

function RecommendationCard({ rec, av, pol }: { rec: any; av: any; pol: any }) {
  if (!rec) {
    const blocked = av.status === 'unsupported' || av.status === 'incomplete' || av.status === 'outside';
    return (
      <Card icon="target" cls="card-rec" title={blocked ? 'No verified target criteria' : 'Recommended target'} sub={av.category ? `${av.category.type} · ${av.category.use}` : undefined}
        right={blocked ? <Pill tone="warn" text={av.status === 'outside' ? 'Outside the criterion' : av.status === 'incomplete' ? 'Criteria incomplete' : 'Not supported'} icon="alert" /> : <Pill tone="neutral" text="Needs information" />}>
        <Note tone="warn">{av.message}</Note>
        {blocked ? <p className="small muted">No target RT60 is generated: the app does not substitute a generic value or another room type's target. Choose a supported room type or main activity, or set the project's own target below from a specification you have.</p> : null}
        <div><Btn action="go" value="room" size="sm" icon="room">Change the room in Room Setup</Btn></div>
        <More summary="The checks made before a target is generated"><ChecksList checks={av.checks} /></More>
      </Card>
    );
  }
  const max = rec.form === 'max';
  return (
    <Card icon="target" cls="card-rec" title="Recommended target for this room" sub={`${rec.reference.short} · ${rec.criterion.name}`}
      right={<Pill tone="good" text={rec.reference.evidence === 'primary' ? 'Verified criterion' : 'Verified in published sources'} icon="seal" />}>
      <div className="grid">
        {max
          ? <Stat kind="target" label="Upper limit" value={`≤ ${rec.max.toFixed(2)}`} tag={<Tag kind="target" />} sub={`At ${pol.short}. No preferred value or lower limit: any value at or below it meets the target.`} />
          : pol.relative
            ? <Stat kind="target" label="Recommended Tm (guide)" value={rec.preferred.toFixed(2)} tag={<Tag kind="target" />} sub={`The room's measured Tm between ${rec.min.toFixed(2)} and ${fmt.s(rec.max)} · every band ${pol.judgedShort} within ±0.05 s of it (125 Hz: −0.05 to +0.15 s)`} />
            : <Stat kind="target" label="Recommended RT60" value={rec.preferred.toFixed(2)} tag={<Tag kind="target" />} sub={`Acceptable ${rec.min.toFixed(2)}–${fmt.s(rec.max)} · every band ${pol.judgedShort} is judged`} />}
      </div>
      <p className="lead"><b>Why.</b>{` ${rec.reason}`}</p>
      <Note tone="info" icon="target"><b>Condition:</b>{` ${rec.condition}`}</Note>
      {rec.notes.length ? <ul className="rec-notes small">{rec.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul> : null}
    </Card>
  );
}

function SourceCard({ rec, av }: { rec: any; av: any }) {
  if (!rec) return null;
  const ref = rec.reference;
  return (
    <Card icon="search" title="Source and how it was worked out">
      <dl className="rec-workings">{rec.workings.map(([k, v]: [string, string]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <SubH>Reference</SubH>
      <ul className="rec-sources">
        <li>{`${ref.number}, ${ref.edition}: ${ref.title}. ${ref.issuer}.`}</li>
        {ref.checkedIn.map((c: string, i: number) => <li key={i} className="small muted">{c}</li>)}
      </ul>
      <More summary="The checks made before this target was generated"><ChecksList checks={av.checks} /></More>
    </Card>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function TargetScreen({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, t = p.target, av = TGT.availability(p.room), rec = TGT.recommend(p.room), m = M();
  const own = m.isOwn(t, rec), custom = t.source === 'custom', pol = EVAL.policyFor(p.room, t);
  const showEditor = !!rec || custom, max = TGT.form(t) === 'max';
  const err = showEditor ? m.problem(t, own) : null;
  const stepper = (key: 'preferred' | 'min' | 'max', label: string, big?: boolean) => (
    <Stepper id={`tgt-${key}`} action="nudge" typeAction="typeTarget" unit="s" keyName={key} value={t[key] as number} display={isNum(t[key]) ? (t[key] as number).toFixed(2) : ''} min={m.MIN} max={m.MAX} label={label} big={big} />
  );
  // The scale always shows the whole target range, at least 0–2 s.
  const scaleMax = Math.max(2, Math.ceil((isNum(t.max) ? t.max : 0) * 1.15 / 0.5) * 0.5);
  const pill = !custom ? <Pill tone="good" text="Recommended" icon="seal" /> : own ? <Pill tone="warn" text="Project's own target" /> : <Pill tone="warn" text="Adjusted" />;
  return (
    <>
      {/* A one-minute explainer, before the decision: what RT60 is and why it matters (AM.guides.rt60, played in the panel). */}
      <section className="card learn-strip" aria-label="Video: what RT60 is">
        <GuideThumb id="rt60" size={18} />
        <div className="learn-body">
          <span className="label">New to RT60? · 1 min video</span>
          <h2 className="learn-title">What RT60 is, and why it matters</h2>
          <p className="learn-text">How sound lingers in a room, what a long or short RT60 does to speech, and how treatment changes it.</p>
        </div>
        <div className="learn-act"><Btn action="openGuide" value="rt60" size="sm" icon="play">Watch the explainer</Btn></div>
      </section>
      {p.targetNote ? <Note tone="warn" icon="alert">{p.targetNote}</Note> : null}
      <RecommendationCard rec={rec} av={av} pol={pol} />
      <div className="grid split">
        <div className="stack">
          <Card icon="sliders" title="Project target" cls="card-target"
            sub={rec
              ? `${max ? `The ${pol.short} band is judged against this limit.` : pol.relative ? `The room's measured Tm (${pol.short}) has to lie within this range, and every band ${pol.judgedShort} within the tolerance around it; the preferred value is the guide and the treatment aim.` : pol.judgedShort === pol.short ? `${pol.primary.length === 1 ? `The ${pol.short} band is` : `Every band ${pol.short} is`} judged against this range; the other bands have no limit.` : `Every band ${pol.judgedShort} is judged: ${pol.short} against this range, the others against the criterion's own limits.`} Starts at the recommendation; adjust it only if the project has its own criteria. Type a value or use − and +.`
              : own ? `Entered for this project. No verified criterion sets the bands, so the app checks ${pol.short} against it.` : 'No target yet.'}
            right={showEditor ? pill : null}>
            {showEditor ? <>
              {max
                ? <div className="target-row"><Field label="Upper limit">{stepper('max', 'upper limit', true)}</Field></div>
                : <div className="target-row">
                  <Field label="Preferred">{stepper('preferred', 'preferred RT60', true)}</Field>
                  <Field label="Range from">{stepper('min', 'lower limit')}</Field>
                  <Field label="to">{stepper('max', 'upper limit')}</Field>
                </div>}
              {own ? <TextInput id="tgt-note" label="Where this target comes from" bind="target.note" value={t.note} placeholder="e.g. Client specification, section 4.2" req
                hint="Required: the app has no verified criterion for this room, so the target's source is recorded with it." /> : null}
              {err ? <Note tone="critical">{err}</Note> : null}
              <RtScale target={err ? null : (t as { min: number | null; max: number; preferred: number | null })} max={scaleMax} />
              {custom && rec && !m.sameValues(t, rec) ? <>
                <Note tone="warn">{`This target differs from the recommendation, ${TGT.fullText(rec)}.`}</Note>
                <div><Btn action="useRecommended" size="sm">Use the recommended target</Btn></div>
              </> : null}
              {own ? <div><Btn action="dropOwnTarget" size="sm">Remove the project's own target</Btn></div> : null}
            </> : <>
              <p className="small">A target can only come from a verified criterion for this room, and there is none. If the project has its own specification, enter that target and where it comes from; it is marked as the project's own, not as a standard's.</p>
              <div><Btn action="ownTarget" size="sm" icon="sliders">Set the project's own target</Btn></div>
            </>}
          </Card>
          <div className="grid g2">
            <section className="card concept is-target"><Tag kind="target" /><h2>What we want</h2><p>The target is a decision: how reverberant this room should be for the way it is used. It comes from a verified standard for the room, before anything is measured.</p></section>
            <section className="card concept is-measured"><Tag kind="measured" /><h2>What we measure</h2><p>The measured RT60 is evidence from the room itself. It comes from the acoustic measurement in step 4 and is never adjusted to fit the target.</p></section>
          </div>
        </div>
        <SourceCard rec={rec} av={av} />
      </div>
    </>
  );
}

