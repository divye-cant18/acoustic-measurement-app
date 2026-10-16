/* Home: the application's workspace. Start a new measurement, or reopen a saved project (Measurement History, saved in
   this browser, no account). Pinned projects stay at the top; Recent shows the latest of the rest. */
import { am, W } from '../lib';
import type { Ctx } from '../am';
import { Btn, Icon, Logo, Wordmark } from '../ui/kit';
import { ProjectCard, summaries } from '../ui/blocks';
import { SoundField } from '../ui/SoundField';

const RECENT = 6; // recent projects shown on Home; the history panel lists every project

// What happens in each phase of the workflow, in a sentence. Step numbers come from the workflow itself.
const PHASE_TEXT: Record<string, string> = {
  Define: 'Describe the room. Its size and use set the target RT60.',
  Measure: 'Your device measures the background noise, then plays a test sweep through its speaker and records the room with its microphone.',
  Analyse: 'RT60, the time sound takes to fade by 60 dB, is calculated from the recording and compared with the target.',
  Improve: 'Choose tested acoustic products and see the RT60 they are predicted to give.',
  Summary: 'Review the whole project and download a PDF report.',
};
const PHASE_ICON: Record<string, string> = { Define: 'room', Measure: 'mic', Analyse: 'bars', Improve: 'panels', Summary: 'doc' };

function HowItWorks() {
  return (
    <section className="home-sec" aria-labelledby="how-h">
      <div className="home-sec-h"><h2 id="how-h">How a measurement works</h2><Btn action="openGuide" value="tour" variant="ghost" size="sm" icon="play">{`Watch the walkthrough · ${am.guides.tour.lengthLabel}`}</Btn></div>
      <ol className="how">
        {W.PHASES.map(ph => {
          const n = W.STAGES.filter(s => s.phase === ph).map(s => W.stepNo(s.id));
          return (
            <li className="how-i" key={ph}>
              <span className="how-ic" aria-hidden="true"><Icon name={PHASE_ICON[ph]} size={18} sw={2} /></span>
              <span className="how-h"><b>{ph}</b><span>{n.length > 1 ? `Steps ${n[0]}–${n[n.length - 1]}` : `Step ${n[0]}`}</span></span>
              <span className="how-t">{PHASE_TEXT[ph] || ''}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Home({ ctx }: { ctx: Ctx }) {
  const p = ctx.project, all = summaries(), active = p && p.id;
  const pinned = all.filter(s => s.pinned), others = all.filter(s => !s.pinned), recent = others.slice(0, RECENT);
  return (
    <div className="home">
      <header className="home-head"><div className="home-brand"><Logo size={44} /><Wordmark height={40} /></div></header>
      <section className="home-hero">
        <SoundField />
        {/* The second part of the descriptor in the brand orange, as the logo sets its tagline under the name. */}
        <h1 className="home-title">{(([head, ...rest]) => (rest.length ? <>{head}<br /><span className="home-accent">{`& ${rest.join(' & ')}`}</span></> : head))(am.brand.descriptor.split(' & '))}</h1>
        <p className="home-lede">Measure how long sound lingers in a room, compare it with the target for the way the room is used, and see what acoustic treatment would change.</p>
        {all.length ? (
          <div className="home-actions">
            <Btn action="startNew" variant="primary" size="lg" icon="plus">New Measurement</Btn>
            <Btn action="history" size="lg" icon="history">Measurement History</Btn>
          </div>
        ) : <>
          {/* Nothing saved in this browser yet (a first visit): New Measurement sits here, the first thing seen, and the
              empty state is one line under it rather than a panel below the fold. */}
          <div className="home-actions">
            <Btn action="startNew" variant="primary" size="lg" icon="plus">New Measurement</Btn>
          </div>
          <p className="home-first"><Icon name="wave" size={16} sw={2} /><span><b>No measurements yet.</b> Start your first acoustic measurement to create a project.</span></p>
        </>}
      </section>
      {!all.length ? null : <>
        {pinned.length ? (
          <section className="home-sec" aria-labelledby="pinned-h">
            <div className="home-sec-h"><h2 id="pinned-h"><Icon name="pushpin" size={16} sw={2} /> Pinned projects <span className="home-count">{pinned.length}</span></h2></div>
            <div className="pcards">{pinned.map(s => <ProjectCard s={s} activeId={active} key={s.id} />)}</div>
          </section>
        ) : null}
        {others.length ? (
          <section className="home-sec" aria-labelledby="recent-h">
            <div className="home-sec-h">
              <h2 id="recent-h">Recent projects</h2>
              {others.length > RECENT ? <Btn action="history" variant="ghost" size="sm" iconAfter="arrowR">{`View all ${all.length}`}</Btn>
                : pinned.length ? null : <span className="small muted">Pin a project to keep it at the top.</span>}
            </div>
            <div className="pcards">{recent.map(s => <ProjectCard s={s} activeId={active} key={s.id} />)}</div>
          </section>
        ) : null}
      </>}
      <HowItWorks />
      <p className="home-foot"><Icon name="info" size={14} sw={2} /> Projects are saved in this browser on this device. No account is needed.</p>
    </div>
  );
}
