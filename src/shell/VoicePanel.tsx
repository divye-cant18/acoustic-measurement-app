/* The pop-up confirm card of Voice Room Setup (js/services/voice-room.js holds its state and does the work). The rep
   describes the room; the card shows what was heard and each change it would make, with a tick, before anything is
   filled in. Its buttons carry data-action, handled by the Room step (js/stages/room.js). Closing the card in any way
   (Cancel, ×, the backdrop, Escape) releases the microphone and drops a request still on its way. Each change has an
   Edit, which opens the form's own choices for it under the change (ItemEditor). */
import { useEffect, type KeyboardEvent } from 'react';
import { am, cx } from '../lib';
import { Btn, Field, Icon } from '../ui/kit';
import { TypePicker } from '../screens/Room';

const VR = () => (am.services as any).voiceRoom;

function Say() {
  return (
    <>
      <p>Describe the room in English or Hinglish, as you would to a colleague. Say:</p>
      <ul className="voice-say">
        <li>its name, and what kind of room it is and what it is used for</li>
        <li>its length, width and height (metres or feet)</li>
        <li>what each wall, the floor and the ceiling are made of</li>
        <li>how many doors and windows there are, and on which wall</li>
      </ul>
      <p className="small muted">Walls 1 and 3 are the long walls, 2 and 4 the end walls. Only you speak: the microphone is on only until you press Done, for at most a minute.</p>
    </>
  );
}

/* The Edit of one change (the service's editorOf): a choice is taken when it is clicked; a typed value, the material in
   the rep's words and the count of doors or windows with Save or Enter. Escape closes the Edit only, not the card. */
function ItemEditor({ ed }: { ed: any }) {
  const id = `voice-ed-${ed.id}`;
  const keys = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); VR().editCancel(); } };
  const enter = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); const b = document.getElementById(`${id}-save`); if (b) b.click(); } };
  const typed = ed.kind === 'text' || ed.kind === 'size' || ed.kind === 'count';
  const saves = typed || ed.kind === 'stepper' || (ed.kind === 'type' && ed.other);
  let body = null;
  if (ed.kind === 'choice') {
    body = ed.options.length
      ? <Field label={ed.question}><div className="chips" role="group" aria-label={ed.question}>{ed.options.map((o: string) => (
          <button type="button" className="chip" key={o} data-action="voiceEditPick" data-value={`${ed.id}|${o}`} aria-pressed={o === ed.value}>{o}</button>
        ))}</div></Field>
      : <p className="small muted">{ed.empty}</p>;
  } else if (ed.kind === 'type') {
    body = (
      <>
        <TypePicker id={`${id}-type`} kind={ed.surface} room={ed.room} value={ed.value} action="voiceEditPick" keyName={ed.id} question={`${ed.question}: choose the closest`} />
        {ed.other ? <Field id={`${id}-words`} label="Not in the list: what is it, in your words?"><input className="input" type="text" id={`${id}-words`} defaultValue={ed.words} maxLength={80} placeholder="e.g. jute wall covering" autoComplete="off" onKeyDown={enter} /></Field> : null}
      </>
    );
  } else if (typed) {
    body = <Field id={`${id}-in`} label={ed.question} hint={ed.hint}><input className="input" type="text" id={`${id}-in`} defaultValue={ed.value} maxLength={ed.max || 40} inputMode={ed.kind === 'count' ? 'numeric' : undefined} autoComplete="off" onKeyDown={enter} /></Field>;
  } else if (ed.kind === 'stepper') {
    body = (
      <Field label={ed.question}>
        <div className="voice-step">
          <Btn action="voiceEditStep" value={-1} size="sm" icon="minus" id={`${id}-minus`} label="One fewer" />
          <output id={`${id}-n`} aria-live="polite">{ed.value}</output>
          <Btn action="voiceEditStep" value={1} size="sm" icon="plus" id={`${id}-plus`} label="One more" />
        </div>
      </Field>
    );
  }
  return (
    <div className="voice-ed" id={id} role="group" aria-label={`Edit: ${ed.question}`} onKeyDown={keys}>
      {body}
      {ed.error ? <div className="field-err" role="alert"><Icon name="alert" size={13} sw={2.2} />{ed.error}</div> : null}
      <div className="voice-acts">
        {saves ? <Btn action="voiceEditSave" value={ed.id} variant="primary" size="sm" icon="check" id={`${id}-save`}>Save</Btn> : null}
        <Btn action="voiceEditCancel" variant="ghost" size="sm" id={`${id}-cancel`}>Cancel</Btn>
      </div>
    </div>
  );
}

export function VoicePanel() {
  useEffect(() => () => { VR().close(); }, []);
  const v = VR().view();
  const foot = (
    <div className="sheet-foot"><Icon name="info" size={15} sw={1.9} /><span>The recording is sent to the voice service only to be turned into text and is not kept. What you said is kept with this project, on this device, and nothing is filled in until you press “Fill in Room Setup”.</span></div>
  );
  if (v.phase === 'recording') {
    return (
      <>
        <div className="voice-rec" role="status">
          <span className="voice-dot" aria-hidden="true" />
          <div className="voice-rec-main">
            <b>{v.recording ? 'Listening…' : 'Starting the microphone…'}</b>
            <span className="voice-level" aria-hidden="true"><i id="voice-level-bar" /></span>
          </div>
          <span className="voice-time"><output id="voice-time">0:00</output>{` / ${Math.floor(v.max / 60)}:00`}</span>
        </div>
        <div className="voice-acts">
          <Btn action="voiceStop" variant="primary" icon="check" id="voice-stop" disabled={!v.recording}>Done</Btn>
          <Btn action="voiceCancel" variant="ghost" id="voice-cancel">Cancel</Btn>
        </div>
        {foot}
      </>
    );
  }
  if (v.phase === 'working') {
    return <><div className="voice-busy" role="status"><span className="spin" aria-hidden="true" /><span>{v.step}</span></div><div className="voice-acts"><Btn action="voiceCancel" variant="ghost" id="voice-cancel">Cancel</Btn></div></>;
  }
  if (v.phase === 'review') {
    return (
      <>
        <div className="field">
          <label className="field-l" htmlFor="voice-text">What was heard</label>
          <textarea className="input voice-text" id="voice-text" key={v.textKey} defaultValue={v.text} rows={3} />
          <div className="voice-acts">
            <Btn action="voiceRead" size="sm" icon="refresh" id="voice-read">Read it again</Btn>
            <span className="small muted">Correct a misheard word, then read it again.</span>
          </div>
        </div>
        {v.groups.length ? <p className="voice-lead">These changes will be filled in. Untick any you do not want, or press Edit to correct one.</p> : <div className="note"><Icon name="info" size={16} sw={2} /><div>Nothing new to fill in from this description.</div></div>}
        {v.groups.map((g: any) => (
          <section className="voice-group" key={g.name}>
            <h3 className="voice-g">{g.name}</h3>
            <div className="voice-items">
              {g.items.map((x: any) => {
                const open = !!(v.editor && v.editor.id === x.id);
                return (
                  <div className={cx('voice-row', open && 'is-editing', x.problem && 'has-problem')} key={x.id}>
                    <div className="voice-row-main">
                      <button type="button" className="voice-item" role="checkbox" aria-checked={x.on} id={`voice-item-${x.id}`} data-action="voiceToggle" data-value={x.id}>
                        <span className="voice-box" aria-hidden="true"><Icon name="check" size={12} sw={3} /></span>
                        <span className="voice-item-t">{x.label}{x.edited ? <em className="voice-mine"> · changed by you</em> : null}</span>
                      </button>
                      <button type="button" className="voice-edit" id={`voice-edit-${x.id}`} data-action="voiceEdit" data-value={x.id} aria-expanded={open} aria-controls={open ? `voice-ed-${x.id}` : undefined} aria-label={open ? `Close the edit of: ${x.label}` : `Edit: ${x.label}`}>
                        <Icon name={open ? 'x' : 'pencil'} size={14} sw={2} /><span>{open ? 'Close' : 'Edit'}</span>
                      </button>
                    </div>
                    {x.problem ? <p className="voice-problem" id={`voice-problem-${x.id}`}><Icon name="alert" size={13} sw={2.2} />{x.problem}</p> : null}
                    {open ? <ItemEditor ed={v.editor} /> : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {v.notes.length ? <section className="voice-group"><h3 className="voice-g">Left out</h3><ul className="voice-list">{v.notes.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></section> : null}
        {v.questions.length ? <section className="voice-group"><h3 className="voice-g">Still to answer</h3><ul className="voice-list">{v.questions.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul><p className="small muted">Answer by speaking again, or fill these in on the form.</p></section> : null}
        <div className="voice-acts voice-final">
          <Btn action="voiceApply" variant="primary" icon="check" id="voice-apply" disabled={!v.kept} reason={v.editor ? 'Save or cancel the change you are editing first.' : undefined}>{v.kept ? `Fill in Room Setup (${v.kept})` : 'Fill in Room Setup'}</Btn>
          <Btn action="voiceStart" icon="mic" id="voice-again">Speak again</Btn>
          <Btn action="closeSheet" variant="ghost" id="voice-close">Cancel</Btn>
        </div>
        {foot}
      </>
    );
  }
  // idle or error
  const off = v.health === 'not_configured' || v.health === 'unreachable';
  return (
    <>
      <Say />
      {v.error ? <div className="note note-critical" role="alert"><Icon name="alert" size={16} sw={2} /><div>{v.error}</div></div> : null}
      {v.notice ? <div className="note note-warn" role="status"><Icon name="info" size={16} sw={2} /><div>{v.notice}</div></div> : null}
      {off ? <div className="note note-warn"><Icon name="info" size={16} sw={2} /><div>{v.health === 'not_configured' ? 'Voice is not set up on this server yet: the Cloudflare account ID and token are missing (see server/.env.example). Fill in Room Setup by hand for now.' : 'The app server could not be reached, so voice is not available. Open the app from its server, or fill in Room Setup by hand.'}</div></div> : null}
      <div className="voice-acts">
        <Btn action="voiceStart" variant="primary" icon="mic" id="voice-start" disabled={off || v.health === 'checking'}>{v.error || v.notice ? 'Try again' : 'Start speaking'}</Btn>
        <Btn action="closeSheet" variant="ghost" id="voice-close">Cancel</Btn>
      </div>
      {foot}
    </>
  );
}
