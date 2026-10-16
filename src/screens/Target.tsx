/* Step 2 · Target / Ideal RT60 — what we want, decided before measuring. The recommendation comes from
   AM.services.target; the project keeps the values it confirms (js/stages/target.js). */
import { EVAL, fmt, isNum, stageModel, TGT } from '../lib';
import type { Ctx, Target } from '../am';
import { Btn, Card, Field, GuideThumb, Kv, KvNote, More, Note, Pill, RtScale, Stat, Stepper, SubH, Tag } from '../ui/kit';

interface TargetModel { MIN: number; MAX: number; problem(t: Target): string | null; sameValues(a: unknown, b: unknown): boolean }
const M = () => stageModel<TargetModel>('target');

/* eslint-disable @typescript-eslint/no-explicit-any */
function RecommendationCard({ rec }: { rec: any }) {
  if (!rec) return <Card icon="target" title="Recommended target"><Note tone="warn">Describe the room type, use and size in Room Setup to get a recommendation.</Note></Card>;
  const occupied = rec.inUse && rec.inUse.people;
  const pol = EVAL.POLICIES[rec.criterion.kind] || EVAL.POLICIES.default;
  return (
    <Card icon="target" cls="card-rec" title="Recommended target for this room" sub={`${rec.source.short} · ${rec.criterion.name}`}
      right={rec.interpretation ? <Pill tone="warn" text="Engineering interpretation" icon="info" /> : <Pill tone="neutral" text="From the standard" icon="seal" />}>
      <div className={occupied ? 'grid g2' : 'grid'}>
        <Stat kind="target" label={occupied ? 'Recommended RT60, room empty' : 'Recommended RT60'} value={rec.preferred.toFixed(2)} tag={<Tag kind="target" />}
          sub={`Acceptable ${rec.min.toFixed(2)}–${fmt.s(rec.max)} · every band ${pol.short} is checked against it`} />
        {occupied ? <Stat label={`In use, ${(window.AM.util.trimNum as (x: unknown) => string)(rec.inUse.present)} people present`} value={rec.inUse.preferred.toFixed(2)} sub={`${rec.inUse.min.toFixed(2)}–${fmt.s(rec.inUse.max)} · the value the standard sets`} /> : null}
      </div>
      <p className="lead"><b>Why.</b>{` ${rec.reason}`}</p>
      <Note tone="info" icon="target">This is an acoustic design target, not a measured value. The measurement in step 4 is compared with it.</Note>
    </Card>
  );
}

function AnalysisCard({ rec }: { rec: any }) {
  if (!rec) return null;
  // The described surfaces do not change the target and make a long list: folded away under the other factors.
  const surf = rec.factors.find(([k, v]: [string, string]) => k === 'Surfaces' && v.includes('; '));
  return (
    <Card icon="search" title="How it was worked out">
      <SubH>Room analysed</SubH>
      <Kv rows={rec.factors.filter((f: unknown) => f !== surf).map(([k, v, effect]: [string, string, string]) => [k, <>{v}<KvNote>{effect}</KvNote></>])} />
      {surf ? <More summary={`Surfaces described · ${surf[2].toLowerCase()}`}><ul className="rec-sources">{surf[1].split('; ').map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></More> : null}
      <SubH>Sources</SubH>
      <ul className="rec-sources">{rec.sources.map((s: { title: string }, i: number) => <li key={i}>{s.title}</li>)}</ul>
    </Card>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function TargetScreen({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, t = p.target, rec = TGT.recommend(p.room), m = M();
  const err = m.problem(t), custom = t.source === 'custom';
  const stepper = (key: 'preferred' | 'min' | 'max', label: string, big?: boolean) => (
    <Stepper id={`tgt-${key}`} action="nudge" typeAction="typeTarget" unit="s" keyName={key} value={t[key] as number} display={isNum(t[key]) ? (t[key] as number).toFixed(2) : ''} min={m.MIN} max={m.MAX} label={label} big={big} />
  );
  // The scale always shows the whole target range, at least 0–2 s.
  const scaleMax = Math.max(2, Math.ceil((isNum(t.max) ? t.max : 0) * 1.15 / 0.5) * 0.5);
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
      <RecommendationCard rec={rec} />
      <div className="grid split">
        <div className="stack">
          <Card icon="sliders" title="Project target" cls="card-target"
            sub={`Every band ${EVAL.policyFor(p.room, t).short} is checked against this range (the bands the room's criterion sets). Starts at the recommendation; adjust it only if the project has its own criteria. Type a value or use − and +.`}
            right={custom ? <Pill tone="warn" text="Adjusted" /> : <Pill tone="good" text="Recommended" icon="seal" />}>
            <div className="target-row">
              <Field label="Preferred">{stepper('preferred', 'preferred RT60', true)}</Field>
              <Field label="Range from">{stepper('min', 'lower limit')}</Field>
              <Field label="to">{stepper('max', 'upper limit')}</Field>
            </div>
            {err ? <Note tone="critical">{err}</Note> : null}
            <RtScale target={err ? null : (t as { min: number; max: number; preferred: number })} max={scaleMax} />
            {custom && rec && !m.sameValues(t, rec) ? <>
              <Note tone="warn">{`This target differs from the recommendation of ${fmt.s(rec.preferred)} (${rec.min.toFixed(2)}–${fmt.s(rec.max)}).`}</Note>
              <div><Btn action="useRecommended" size="sm">Use the recommended target</Btn></div>
            </> : null}
          </Card>
          <div className="grid g2">
            <section className="card concept is-target"><Tag kind="target" /><h2>What we want</h2><p>The target is a decision: how reverberant this room should be for the way it is used. It is recommended from the room you described, before anything is measured.</p></section>
            <section className="card concept is-measured"><Tag kind="measured" /><h2>What we measure</h2><p>The measured RT60 is evidence from the room itself. It comes from the acoustic measurement in step 4 and is never adjusted to fit the target.</p></section>
          </div>
        </div>
        <AnalysisCard rec={rec} />
      </div>
    </>
  );
}
