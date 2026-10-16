/* The application shell: workflow rail, context bar, stage head, the step's screen, action bar, panels (sheets) and
   the toast. It shows the store's state and the stages' own checks (canContinue); the buttons carry data-action, routed
   by src/events.ts exactly as before. */
import { createPortal } from 'react-dom';
import { Component, useLayoutEffect, useRef, type ReactNode } from 'react';
import { am, cx, D, fmt, S, W } from '../lib';
import type { Stage } from '../am';
import { Btn, Icon, Logo, Pill, Slash } from '../ui/kit';
import { HistoryList, summaries } from '../ui/blocks';
import { screenFor, type ScreenDef } from '../screens/registry';
import { TourLayer } from './Tour';

/* ---------- workflow rail ---------- */
const STATE_LABEL: Record<string, string> = { current: 'Current', completed: 'Completed', available: 'Upcoming', locked: 'Locked' };
function RailItem({ s }: { s: Stage }) {
  const p = S.state.project, cur = S.state.current;
  const st = W.status(p, s.id, cur), done = W.isDone(p, s.id), rev = W.needsReview(p, s.id), n = W.stepNo(s.id);
  const mark = st === 'completed' || (st === 'current' && done && s.id !== 'home') ? <Icon name="check" size={13} sw={2.8} />
    : st === 'locked' ? <Icon name="lock" size={11} sw={2.4} /> : s.id === 'home' ? <Icon name="home" size={13} sw={2.2} /> : String(n);
  return (
    <button type="button" className={cx('wf-item', `is-${st}`, done && 'is-done', rev && 'is-flagged')} data-action="nav" data-value={s.id}
      aria-current={st === 'current' ? 'step' : undefined} aria-disabled={st === 'locked' ? 'true' : undefined}>
      <span className="wf-mark">{mark}</span>
      <span className="wf-text"><span className="wf-title">{s.nav}</span><span className="wf-state">{st === 'current' && done ? 'Current · completed' : STATE_LABEL[st]}</span></span>
      {st === 'current' ? <Slash /> : null}
      {rev ? <span className="wf-flag" title="An earlier step changed after this one was finished">Review</span> : null}
    </button>
  );
}

function Rail() {
  const p = S.state.project, cur = S.state.current;
  const g = p ? D.geometry(p) : null;
  const done = p ? p.completed.filter(id => id !== 'home').length : 0, review = p ? p.review.length : 0;
  return (
    <>
      <div className="brand">
        {/* The logo and name lead Home, as on most sites. */}
        <button type="button" className="brand-home" data-action="nav" data-value="home" aria-label={`${am.brand.name}, Home`} title="Home">
          <Logo size={34} />
          <span className="brand-txt"><span className="brand-name">{am.brand.name}</span><span className="brand-sub">Acoustic Measurement</span></span>
        </button>
        <button type="button" className="iconbtn only-mobile rail-close" data-action="closeNav" aria-label="Close workflow"><Icon name="x" size={18} sw={2} /></button>
      </div>
      {p ? (
        <div className="proj">
          <span className="label">Project</span>
          <span className="proj-name">{p.room.name || 'Untitled room'}</span>
          <span className="proj-meta">{g ? `${fmt.dims(g)} · ${fmt.m3(g.V)}` : 'Room not described yet'}</span>
          <span className="proj-saved"><Icon name="check" size={12} sw={2.6} />{`Saved on this device · ${fmt.ago(p.updatedAt)}`}</span>
        </div>
      ) : null}
      <button type="button" className="rail-history" data-action="history"><Icon name="history" size={16} sw={1.9} /><span>Measurement History</span><span className="rail-count">{S.state.projects.length}</span></button>
      <nav className="wf" aria-label="Workflow">
        <RailItem s={W.get('home')} />
        {W.PHASES.map(ph => (
          <div className="wf-group" key={ph}>
            <div className="wf-phase">{ph}</div>
            {W.STAGES.filter(s => s.phase === ph).map(s => <RailItem s={s} key={s.id} />)}
          </div>
        ))}
      </nav>
      <div className="rail-foot">
        <div className="rail-progress"><span>{`${done} of ${W.NUMBERED} steps complete`}</span>{review ? <span className="is-review">{`${review} to review`}</span> : <span>{`${Math.round((done / W.NUMBERED) * 100)}%`}</span>}</div>
        <div className="seg-meter" role="img" aria-label={`${done} of ${W.NUMBERED} steps complete${review ? `, ${review} to review` : ''}`}>
          {W.STAGES.filter(s => s.id !== 'home').map(s => {
            const c = p && W.needsReview(p, s.id) ? 'is-review' : p && W.isDone(p, s.id) ? 'is-done' : s.id === cur ? 'is-now' : '';
            return <i key={s.id} className={c || undefined} data-step={s.id} title={s.nav} />;
          })}
        </div>
        <div className="legend-states" aria-hidden="true">
          <span className="is-completed"><span className="wf-mark" />Completed</span>
          <span className="is-current"><span className="wf-mark" />Current</span>
          <span className="is-available"><span className="wf-mark" />Upcoming</span>
          <span className="is-locked"><span className="wf-mark" />Locked</span>
        </div>
        <button type="button" className="rail-tools" data-action="tools"><Icon name="flask" size={16} sw={1.9} /> Developer tools</button>
      </div>
    </>
  );
}

/* ---------- context bar: the project's readouts ---------- */
function Fact({ cls, icon, k, v, tip, stale }: { cls: string; icon: string; k: string; v: string | null; tip?: string; stale?: boolean }) {
  return (
    <span className={cx('fact', cls, v == null && 'is-empty', stale && 'is-stale')} data-watch={`fact-${cls}`} title={tip || undefined}>
      <Icon name={icon} size={13} sw={2} /><span className="fact-k">{k}</span><span className="fact-v">{v ?? '—'}</span>{stale ? <span className="sr-only"> (from an earlier take)</span> : null}
    </span>
  );
}
function TopBar({ stage }: { stage: Stage }) {
  const p = S.state.project, n = W.stepNo(stage.id);
  let facts: ReactNode = null;
  if (p && stage.id !== 'home') { // Home is the application's page; project values belong to project steps
    // Measured and Predicted: the room's summary RT60 over the bands its criterion sets, over the measured positions.
    const g = D.geometry(p), t = D.target(p), avg = D.summaryRT60(p), all = D.averageRT60(p), RA = am.services.rt60Average;
    const pol = D.policy(p), pos = D.positions(p);
    const pr = D.predictionStarted(p, S.state.current) ? D.prediction(p) : null;
    const later = D.laterTakes(p)[0];
    const measuredTip = `${avg.available ? `Average RT60, ${pol.short}: the mean of ${RA.describe(avg)}, over ${pos.count} position${pos.count === 1 ? '' : 's'}${pos.complete ? '' : ` (at least ${pos.required} needed)`}${all.available ? ` · all bands, ${RA.SHORT}: ${fmt.s(all.value)}` : ''}` : avg.reason || ''}${later ? ` · From an earlier take: the latest take (${fmt.when(later.takenAt)}) ${later.kind === 'unprocessed' ? 'has not been processed yet' : 'gave no value'}.` : ''}`;
    facts = (
      <div className="facts" aria-label="Project values">
        <Fact cls="room" icon="room" k="Room" v={g ? fmt.m3(g.V) : null} />
        <Fact cls="target" icon="target" k="Target" v={t && (W.isDone(p, 'target') || stage.id === 'target') ? fmt.s(t.preferred) : null} tip={`Preferred target RT60; every band ${pol.short} is checked against its range`} />
        <Fact cls="measured" icon="mic" k="Measured" v={avg.available ? fmt.s(avg.value) : null} tip={measuredTip} stale={!!later} />
        <Fact cls="predicted" icon="trend" k="Predicted" v={pr ? fmt.s(pr.predicted) : null} tip={`Predicted average RT60, ${pol.short}, after treatment (model estimate)`} />
      </div>
    );
  }
  return (
    <header className="topbar">
      <button type="button" className="iconbtn only-mobile" data-action="openNav" aria-label="Open workflow"><Icon name="menu" size={20} sw={2} /></button>
      <div className="crumb">
        <span className="crumb-project">{stage.id === 'home' ? 'Home' : p ? p.room.name || 'Untitled room' : am.brand.name}</span>
        {stage.id !== 'home' ? <><span className="crumb-sep">/</span><span className="crumb-stage">{`${n}. ${stage.title}`}</span></> : null}
      </div>
      {facts}
      {stage.id === 'home' ? (
        // Home: quick help, the walkthrough of the workflow (the brand is already in the rail and on the page), and the
        // tour of the screen (src/shell/Tour.tsx).
        <div className="topbar-helpers">
          <button type="button" className="topbar-help" data-action="openGuide" data-value="tour" aria-label={`Quick help: ${am.guides.tour.title}, ${am.guides.tour.lengthLabel} video`}>
            <span className="th-play" aria-hidden="true"><Icon name="play" size={12} sw={2.2} /></span>
            <span className="th-txt"><span className="th-k">Quick help</span><span className="th-v">{am.guides.tour.title}</span></span>
            <span className="th-len">{am.guides.tour.lengthLabel}</span>
          </button>
          <button type="button" className="topbar-tour" data-action="startTour" aria-label="Take the tour of this screen">
            <Icon name="tour" size={17} sw={2} /><span className="tt-txt">Take the tour</span>
          </button>
        </div>
      ) : <HelpMenu />}
    </header>
  );
}

/* Help on a step: the tour of the screen, the walkthrough video and the step's own guide, in one menu. */
function HelpMenu() {
  const open = !!S.state.ui.help, menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const first = open && menu.current && menu.current.querySelector<HTMLElement>('[role="menuitem"]');
    if (first) first.focus({ preventScroll: true });
  }, [open]);
  const g = am.guides.tour;
  return (
    <div className="help-wrap">
      <button type="button" className="topbar-helpbtn" data-action="toggleHelp" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'help-menu' : undefined} aria-label="Help">
        <Icon name="help" size={18} sw={2} /><span className="hb-txt">Help</span>
      </button>
      {open ? (
        <div className="help-menu" id="help-menu" role="menu" aria-label="Help" ref={menu}>
          <button type="button" role="menuitem" className="hm-item" data-action="startTour">
            <span className="hm-ic" aria-hidden="true"><Icon name="tour" size={18} sw={2} /></span>
            <span className="hm-txt"><b>Tour of this screen</b><span>Where everything is, one stop at a time</span></span>
          </button>
          <button type="button" role="menuitem" className="hm-item" data-action="openGuide" data-value="tour">
            <span className="hm-ic is-play" aria-hidden="true"><Icon name="play" size={14} sw={2.2} /></span>
            <span className="hm-txt"><b>{g.title}</b><span>{`${g.lengthLabel} video of the whole workflow`}</span></span>
          </button>
          <button type="button" role="menuitem" className="hm-item" data-action="explain">
            <span className="hm-ic" aria-hidden="true"><Icon name="info" size={18} sw={2} /></span>
            <span className="hm-txt"><b>Explain this step</b><span>With this project’s own numbers</span></span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- stage head and action bar ---------- */
function StageHead({ stage }: { stage: Stage }) {
  const p = S.state.project, done = W.isDone(p, stage.id), rev = W.needsReview(p, stage.id);
  return (
    <header className="stage-head">
      <div className="stage-head-text">
        <div className="eyebrow"><Slash /><span>{`Step ${W.stepNo(stage.id)} of ${W.NUMBERED}`}</span><span className="eyebrow-sep" aria-hidden="true" /><span>{stage.phase}</span></div>
        <h1 className="stage-title">{stage.title}</h1>
        <p className="stage-purpose">{stage.purpose}</p>
      </div>
      <div className="stage-tools">
        {rev ? <Pill tone="warn" text="Review: an earlier step changed" icon="alert" /> : done ? <Pill tone="neutral" text="Completed" icon="check" /> : null}
        <Btn action="explain" size="sm" icon="info">Explain this step</Btn>
      </div>
    </header>
  );
}

function ActionBar({ stage, screen }: { stage: Stage; screen: ScreenDef }) {
  if (screen.footer === false) return null;
  const p = S.state.project, prev = W.prev(stage.id), nxt = W.next(stage.id), ctx = { project: p!, state: S.state, store: S, render: () => am.app && am.app.render() };
  const primary = (screen.primary && screen.primary(ctx)) || { label: stage.continueLabel || (nxt ? `Continue to ${nxt.nav}` : 'Finish'), action: 'continue' };
  const chk = primary.action === 'continue' && stage.canContinue ? stage.canContinue(p) : { ok: true };
  return (
    <footer className="actionbar">
      {prev ? <button type="button" className="btn btn-secondary" data-action="back"><Icon name="chevL" size={16} sw={2.2} /><span className="hide-sm">{prev.nav}</span><span className="show-sm">Back</span></button> : <span />}
      <span className="actionbar-note">{chk.ok ? null : <><Icon name="info" size={15} sw={2} />{chk.reason}</>}</span>
      <button type="button" className={cx('btn btn-primary', primary.rec && 'is-rec')} data-action={primary.action} data-value={primary.value}
        aria-disabled={chk.ok ? undefined : 'true'} data-reason={chk.ok ? undefined : chk.reason}>
        {primary.rec ? <span className="rec"><Icon name="rec" size={16} sw={2} /></span> : null}{primary.label}{primary.rec ? null : <Icon name="arrowR" size={16} sw={2.2} />}
      </button>
    </footer>
  );
}

/* ---------- panels ---------- */
function Sheet() {
  const sh = S.state.ui.sheet;
  if (!sh) return null;
  const p = S.state.project;
  let title = '', badge: ReactNode = null, body: ReactNode = null, cls = '';
  if (sh.kind === 'explain') {
    const e = am.services.explain.forStage(sh.stage, p);
    title = e.title;
    badge = <span className="tag tag-guide">Step guide</span>;
    body = <>{e.paragraphs.map((t, i) => <p key={i}>{t}</p>)}<div className="sheet-foot"><Icon name="info" size={15} sw={1.9} /><span>This guide uses this project's own numbers. It explains the results; it never calculates or changes them.</span></div></>;
  } else if (sh.kind === 'tools') {
    title = 'Developer tools';
    body = <>
      <p>Shortcuts for reviewing one step without clicking through the ones before it. Room Setup and Target are filled with a sample room. Measurement steps are never filled in: they need a real background-noise measurement and a real take, so the shortcut stops at the first step that needs one.</p>
      <div className="sub-h">Jump to a step</div>
      <div className="tool-list">{W.STAGES.filter(s => s.id !== 'home').map(s => (
        <button type="button" className="tool-row" data-action="autofill" data-value={s.id} key={s.id}><span className="wf-mark">{W.stepNo(s.id)}</span><span>{s.title}</span><Icon name="chevR" size={14} sw={2} /></button>
      ))}</div>
      {p ? <>
        <div className="sub-h">This project</div>
        {S.state.ui.confirm === 'reset'
          ? <div className="confirm"><span>Reset clears this project’s data and progress.</span><Btn action="doReset" variant="primary" size="sm">Reset project</Btn><Btn action="cancelReset" variant="ghost" size="sm">Cancel</Btn></div>
          : <div className="hstack"><Btn action="askReset" size="sm" icon="refresh">Reset project</Btn><Btn action="closeProject" variant="ghost" size="sm">Close project</Btn></div>}
      </> : null}
    </>;
  } else if (sh.kind === 'history') {
    title = 'Measurement History';
    body = <>
      <div><Btn action="startNew" variant="primary" size="sm" icon="plus">New Measurement</Btn></div>
      <HistoryList items={summaries()} activeId={p && p.id} />
      <div className="sheet-foot"><Icon name="info" size={15} sw={1.9} /><span>Measurements are kept in this browser on this device. There is no account. The only thing ever sent is the report form, when you submit it on Final Result.</span></div>
    </>;
  } else if (sh.kind === 'guide') {
    // Instructional video. It only plays a guide; closing it returns to the same step.
    const g = am.guides[sh.id];
    title = g.title;
    badge = <span className="tag tag-sim"><Icon name="play" size={12} sw={2.2} />{`${g.lengthLabel} video`}</span>;
    cls = 'sheet-video';
    body = <>
      <div className="gv-host" dangerouslySetInnerHTML={{ __html: am.guide.html(sh.id) }} />
      <div className="hstack"><Btn action="closeGuide" variant="primary" size="sm">{g.closeLabel || 'Close'}</Btn></div>
      <div className="sheet-foot"><Icon name="info" size={15} sw={1.9} /><span>This video only explains. It does not start or record a measurement.</span></div>
    </>;
  }
  return (
    <>
      <div className="sheet-scrim" data-action="closeSheet" />
      <aside className={cx('sheet', cls)} role="dialog" aria-modal="true" aria-labelledby="sheet-title" key={`${sh.kind}:${'id' in sh ? sh.id : 'stage' in sh ? sh.stage : ''}`}>
        <header className="sheet-h"><h2 id="sheet-title">{title}</h2>{badge}<button type="button" className="iconbtn" id="sheet-close" data-action="closeSheet" aria-label="Close"><Icon name="x" size={18} sw={2} /></button></header>
        <div className="sheet-b">{body}</div>
      </aside>
    </>
  );
}
function Toast() {
  const t = S.state.ui.toast;
  return t ? <div className="toast"><Icon name="info" size={16} sw={2} /><span>{t}</span></div> : null;
}

/* A screen that fails to draw says so, and the rest of the application (rail, panels, navigation) keeps working. */
class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override componentDidCatch(error: Error) { console.error(error); }
  override render() {
    if (!this.state.error) return this.props.children;
    return <div className="note note-critical"><Icon name="alert" size={16} sw={2} /><div><b>This step could not be shown.</b>{` ${this.state.error.message} Your project is saved; go back a step, or reload the page.`}</div></div>;
  }
}

/* ---------- the whole application ---------- */
export function App({ sameView }: { sameView: boolean }) {
  const st = S.state, stage = W.get(st.current), screen = screenFor(stage.id);
  const ctx = { project: st.project!, state: st, store: S, render: () => am.app && am.app.render() };
  const Body = screen.Body;
  const pid = st.project ? st.project.id : 'none';
  return (
    <>
      <aside className={cx('rail', st.ui.navOpen && 'open')} aria-label="Workflow"><Rail /></aside>
      {st.ui.navOpen ? <div className="scrim" data-action="closeNav" /> : null}
      <main className={cx('main', `is-${stage.id}`)}>
        <TopBar stage={stage} />
        <div className="content">
          <div className={cx('content-inner', !sameView && 'is-entering', stage.id === 'home' && 'is-home')} key={`${pid}:${stage.id}`}>
            {screen.header === false ? null : <StageHead stage={stage} />}
            <ScreenBoundary><Body ctx={ctx} /></ScreenBoundary>
          </div>
        </div>
        <ActionBar stage={stage} screen={screen} />
      </main>
      {createPortal(<Sheet />, document.getElementById('sheet-root')!)}
      {createPortal(<Toast />, document.getElementById('toast-root')!)}
      {createPortal(<TourLayer />, document.getElementById('tour-root')!)}
    </>
  );
}
