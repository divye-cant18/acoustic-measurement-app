/* The interface's building blocks. Every control carries data-action (+ data-value) or data-bind, as before: the shell's
   event wiring (src/events.ts) routes them to the stage's actions and the project store, so a component never changes
   project data itself. Class names that tests and the shell look for (stat-v, kv-r, tbl, tech, data-watch …) are kept. */
import { useLayoutEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { am, cx, fmt, isNum, ui } from '../lib';
import type { Status, Tone } from '../am';

/* ---------- icons and marks ---------- */
export function Icon({ name, size = 18, sw = 1.8 }: { name: string; size?: number; sw?: number }) {
  return (
    <svg className="i" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: am.util.ICONS[name] || '' }} />
  );
}

/** The supplied application icon on a white tile (the same in light and dark). */
export const Logo = ({ size = 36 }: { size?: number }) => (
  <span className="logo-tile" style={{ width: size, height: size }}><img src={am.brand.icon} alt="" width={size} height={size} decoding="async" /></span>
);
export const Wordmark = ({ height = 32 }: { height?: number }) => (
  <img className="wordmark" src={am.brand.wordmark} alt={`${am.brand.name}. ${am.brand.tagline}.`} style={{ height }} decoding="async" />
);
/** The double slash of the wordmark (UNIV//COUSTIC): marks "you are here". */
export const Slash = () => <span className="slash" aria-hidden="true"><i /><i /></span>;
export const Spin = () => <span className="spin" aria-hidden="true" />;

/* ---------- status ---------- */
export function Pill({ tone, text, icon }: { tone: Tone | string; text: ReactNode; icon?: string | null }) {
  return <span className={`pill pill-${tone}`}>{icon ? <Icon name={icon} size={13} sw={2.2} /> : null}{text}</span>;
}
const STATUS: Record<string, [Tone, string, string]> = {
  above: ['warn', 'arrowUp', 'Needs treatment'], within: ['good', 'seal', 'Meets target'],
  below: ['warn', 'arrowDn', 'Below target'], insufficient: ['critical', 'x', 'Not calculated'],
};
/** A measured value against the target (Assessment wording). */
export function StatusPill({ status, text }: { status: Status | 'insufficient' | null | undefined; text?: string }) {
  const [tone, ic, label] = STATUS[status || 'insufficient'] || STATUS.insufficient;
  return <Pill tone={tone} text={text || label} icon={ic} />;
}
/** The predicted verdict as a tag in everyday words (Treatment, Final Result): too echoey and too dull at once reads
 *  "Not there yet". v: the predicted verdict (its above and below bands). */
export function ResultPill({ v, st }: { v: { above: unknown[]; below: unknown[] } | null | undefined; st: string | null | undefined }) {
  if (st === 'within') return <Pill tone="good" text="Meets the target" icon="seal" />;
  if (v && v.above.length && v.below.length) return <Pill tone="warn" text="Not there yet" icon="alert" />;
  if (st === 'above') return <Pill tone="warn" text="Still too echoey" icon="arrowUp" />;
  if (st === 'below') return <Pill tone="warn" text="Too dull" icon="arrowDn" />;
  return null;
}
/** A predicted value against the target. */
export function PredPill({ status }: { status: Status | null | undefined }) {
  if (status === 'above') return <Pill tone="warn" text="Above target" icon="arrowUp" />;
  if (status === 'within') return <Pill tone="good" text="Within target" icon="seal" />;
  if (status === 'below') return <Pill tone="warn" text="Below target" icon="arrowDn" />;
  return null;
}
const TAGS: Record<string, [string, string, string]> = {
  measured: ['tag-measured', 'mic', 'Measured'], predicted: ['tag-predicted', 'trend', 'Predicted'], target: ['tag-target', 'target', 'Target'],
};
/** What kind of value this is: measured (evidence), predicted (model) or target (decision). */
export function Tag({ kind, text }: { kind: 'measured' | 'predicted' | 'target'; text?: string }) {
  const [cls, ic, label] = TAGS[kind];
  return <span className={`tag ${cls}`}><Icon name={ic} size={12} sw={2.2} />{text || label}</span>;
}

/* ---------- containers ---------- */
export interface CardProps { title?: ReactNode; sub?: ReactNode; right?: ReactNode; icon?: string; cls?: string; id?: string; children?: ReactNode; label?: string }
export function Card({ title, sub, right, icon, cls, id, children, label }: CardProps) {
  return (
    <section className={cx('card', cls)} id={id} aria-label={label}>
      {title ? (
        <header className="card-h">
          {icon ? <span className="card-ic" aria-hidden="true"><Icon name={icon} size={16} sw={2} /></span> : null}
          <div className="card-ht"><h2 className="card-t">{title}</h2>{sub ? <p className="card-s">{sub}</p> : null}</div>
          {right ? <div className="card-hr">{right}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

const NOTE_ICON: Record<string, string> = { good: 'seal', info: 'info', warn: 'alert', critical: 'alert' };
export function Note({ tone = 'info', icon, children }: { tone?: 'info' | 'good' | 'warn' | 'critical'; icon?: string; children: ReactNode }) {
  return <div className={`note note-${tone}`}><Icon name={icon || NOTE_ICON[tone] || 'alert'} size={16} sw={2} /><div>{children}</div></div>;
}
export const NoteActions = ({ children }: { children: ReactNode }) => <div className="note-actions">{children}</div>;

export type KvRow = [ReactNode, ReactNode, string?] | null | false | undefined | '';
export function Kv({ rows }: { rows: KvRow[] }) {
  return (
    <dl className="kv">
      {rows.filter((r): r is [ReactNode, ReactNode, string?] => !!r).map(([k, v, c], i) => (
        <div className={cx('kv-r', c)} key={i}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}
export const KvNote = ({ children }: { children: ReactNode }) => <div className="kv-note">{children}</div>;
export const SubH = ({ children }: { children: ReactNode }) => <div className="sub-h">{children}</div>;
export const Small = ({ muted, children, cls }: { muted?: boolean; children: ReactNode; cls?: string }) => <p className={cx('small', muted && 'muted', cls)}>{children}</p>;
export const Bullets = ({ items, small }: { items: ReactNode[]; small?: boolean }) => (
  <ul className={cx('bullets', small && 'small')}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
);

/* ---------- figures ---------- */
export interface StatProps { kind?: 'plain' | 'measured' | 'predicted' | 'target'; label: string; value: string; unit?: string; sub?: ReactNode; tag?: ReactNode; watch?: string; words?: Tone | string | null }
/** A figure with its label. words: the value is a short phrase (a verdict), set as text with its tone. */
export function Stat({ kind = 'plain', label, value, unit = 's', sub, tag, watch, words }: StatProps) {
  return (
    <div className={`stat stat-${kind}`} data-watch={watch || undefined}>
      <div className="stat-h"><span className="stat-l">{label}</span>{tag}</div>
      <div className={cx('stat-v', words && `is-words is-${words}`)}>{value}{unit && !words ? <small>{unit}</small> : null}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}
/** A value in seconds as a figure: "0.62" with a small "s". */
export const Secs = ({ v, cls, watch }: { v: number | null | undefined; cls?: string; watch?: string }) => (
  <span className={cls || 'stat-v'} data-watch={watch || undefined}>{isNum(v) ? <>{v.toFixed(2)}<small>s</small></> : '—'}</span>
);

export function Legend({ items }: { items: [string, ReactNode][] }) {
  return <div className="legend">{items.map(([c, t], i) => <span className="lg" key={i}><i className={`lg-${c}`} />{t}</span>)}</div>;
}

/** A chart placeholder: js/ui/charts.js draws it (AM.charts.hydrate) once it has a width. React never renders inside it. */
export function Chart({ type, spec, height, cls }: { type: 'bands' | 'decay'; spec: unknown; height: number; cls?: string }) {
  return <div className={cx('chart', cls)} data-chart={type} data-spec={JSON.stringify(spec)} style={{ minHeight: height }} />;
}

/** Technical details, folded away; stays open across re-renders (state.ui.open, kept by the shell). */
export function Details({ id, summary = 'Show technical details', children }: { id: string; summary?: string; children: ReactNode }) {
  const open = !!((am.store.state.ui || {}).open || {})[id];
  return (
    <details className="tech" data-open-id={id} open={open}>
      <summary><Icon name="chevR" size={14} sw={2.2} />{summary}</summary>
      <div className="tech-b">{children}</div>
    </details>
  );
}
export function More({ summary, children, cls }: { summary: ReactNode; children: ReactNode; cls?: string }) {
  return <details className={cx('more', cls)}><summary>{summary}</summary>{children}</details>;
}
export const TechH = ({ title, note }: { title: ReactNode; note?: ReactNode }) => (
  <div className="tech-h"><b>{title}</b>{note ? <span className="small muted">{note}</span> : null}</div>
);

/** A table that may be wider than the screen: says so under it when it scrolls sideways. */
export function TableWrap({ children, cls }: { children: ReactNode; cls?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => { setMore(el.scrollWidth > el.clientWidth + 1); setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1); };
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    if (ro) ro.observe(el);
    el.addEventListener('scroll', check, { passive: true });
    return () => { if (ro) ro.disconnect(); el.removeEventListener('scroll', check); };
  }, []);
  return (
    <>
      <div ref={ref} className={cx('tbl-wrap', cls, more && 'is-scrollable', more && atEnd && 'at-end')}>{children}</div>
      {more ? <p className="tbl-hint">Scroll the table sideways to see every column.</p> : null}
    </>
  );
}
/** "Not reliable" (or a dash) with the reason as a tooltip. */
export const NotReliable = ({ reason, text = 'Not reliable' }: { reason?: string | null; text?: string }) => <span className="nr" title={reason || ''}>{text}</span>;

/* ---------- buttons ---------- */
export interface BtnProps {
  action?: string; value?: string | number; item?: string; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'lg';
  icon?: string; iconAfter?: string; disabled?: boolean; reason?: string; id?: string; label?: string; pressed?: boolean; children?: ReactNode; cls?: string; busy?: boolean;
}
/** A button routed by the shell: data-action, data-value, data-item. A reason makes it look disabled and say why. */
export function Btn({ action, value, item, variant = 'secondary', size, icon, iconAfter, disabled, reason, id, label, pressed, children, cls, busy }: BtnProps) {
  return (
    <button type="button" id={id} className={cx('btn', `btn-${variant}`, size && `btn-${size}`, cls)} data-action={action} data-value={value != null ? String(value) : undefined}
      data-item={item} disabled={disabled || undefined} aria-disabled={reason ? 'true' : undefined} data-reason={reason} aria-label={label}
      aria-pressed={pressed == null ? undefined : pressed} aria-busy={busy || undefined}>
      {icon ? <Icon name={icon} size={size === 'lg' ? 18 : size === 'sm' ? 15 : 16} sw={2.1} /> : null}{children}{iconAfter ? <Icon name={iconAfter} size={15} sw={2.2} /> : null}
    </button>
  );
}
export const HStack = ({ children, cls }: { children: ReactNode; cls?: string }) => <div className={cx('hstack', cls)}>{children}</div>;

/** A link to an official UniVicoustic website, in a new tab. Nothing from the project is sent to it. */
export function ExtLink({ tone = 'brand', glyph, title, text, label, href, note, level = 3 }: { tone?: 'brand' | 'acoustic'; glyph: string; title: string; text: string; label: string; href: string; note?: string; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className={`ext-cta ext-${tone}`}>
      <span className="ext-ic" aria-hidden="true"><Icon name={glyph} size={22} sw={1.9} /></span>
      <div className="ext-body"><H className="ext-t">{title}</H><p className="ext-s">{text}</p>{note ? <p className="ext-n">{note}</p> : null}</div>
      <a className="btn ext-btn" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens in a new tab)`}>{label} <span className="ext-arrow" aria-hidden="true">↗</span></a>
    </div>
  );
}

/* ---------- form controls ---------- */
/** An input the user owns while it has focus: React leaves it alone then, and shows the stored value otherwise. */
function useSynced<T extends HTMLInputElement | HTMLTextAreaElement>(value: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => { const el = ref.current; if (el && document.activeElement !== el && el.value !== value) el.value = value; });
  return ref;
}
function useSyncedSelect(value: string) {
  const ref = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => { const el = ref.current; if (el && el.value !== value) el.value = value; });
  return ref;
}
function useSyncedCheck(checked: boolean) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { const el = ref.current; if (el && el.checked !== checked) el.checked = checked; });
  return ref;
}

/** A select whose options the caller writes (e.g. in groups), kept on the stored value. */
export function SyncSelect({ value, children, ...rest }: { value: string; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'defaultValue' | 'children'>) {
  const ref = useSyncedSelect(value);
  return <select ref={ref} defaultValue={value} {...rest}>{children}</select>;
}

type Req = boolean | 'optional' | undefined;
export function Field({ id, label, req, hint, children, cls }: { id?: string; label: ReactNode; req?: Req; hint?: ReactNode; children: ReactNode; cls?: string }) {
  const tag = req === true ? <span className="req">Required</span> : req === 'optional' ? <span className="opt">Optional</span> : null;
  return (
    <div className={cx('field', cls)}>
      {id ? <label className="field-l" htmlFor={id}>{label}{tag}</label> : <span className="field-l">{label}{tag}</span>}
      {children}
      {hint ? <div className="field-h">{hint}</div> : null}
    </div>
  );
}
export const FieldErr = ({ id, children }: { id?: string; children: ReactNode }) => <div className="field-err" id={id}><Icon name="alert" size={13} sw={2.2} />{children}</div>;

export function TextInput({ id, label, bind, value, placeholder = '', hint, req }: { id: string; label: string; bind: string; value: string | null | undefined; placeholder?: string; hint?: ReactNode; req?: Req }) {
  const v = value ?? '', ref = useSynced<HTMLInputElement>(v);
  return <Field id={id} label={label} hint={hint} req={req}><input ref={ref} className="input" id={id} type="text" data-bind={bind} defaultValue={v} placeholder={placeholder} autoComplete="off" /></Field>;
}

/** Text typed into a number field that is not a number stays there with a message (ui.bad, kept by the shell). */
const badText = (id: string, type: string) => (ui.bad[id] != null ? (type === 'int' ? 'Enter a whole number, e.g. 12' : 'Enter a number, e.g. 4.5') : null);
export interface NumberProps { id: string; label: string; bind: string; value: number | null | undefined; unit?: string; hint?: ReactNode; req?: Req; error?: string | null; type?: 'num' | 'int'; placeholder?: string }
export function NumberInput({ id, label, bind, value, unit, hint, req, error, type = 'num', placeholder = '' }: NumberProps) {
  const err = badText(id, type) || error, shown = ui.bad[id] != null ? String(ui.bad[id]) : isNum(value) ? String(value) : '';
  const ref = useSynced<HTMLInputElement>(shown);
  return (
    <Field id={id} label={label} hint={hint} req={req}>
      <div className="unit">
        <input ref={ref} className={cx('input', err && 'is-invalid')} id={id} type="text" inputMode={type === 'int' ? 'numeric' : 'decimal'} data-bind={bind} data-type={type}
          defaultValue={shown} placeholder={placeholder} autoComplete="off" aria-invalid={err ? 'true' : undefined} aria-describedby={err ? `${id}-err` : undefined} />
        {unit ? <span className="unit-s">{unit}</span> : null}
      </div>
      {err ? <FieldErr id={`${id}-err`}>{err}</FieldErr> : null}
    </Field>
  );
}

export type Opt = string | { value: string; label: string };
export interface SelectProps { id: string; label?: ReactNode; bind?: string; value: string | null | undefined; options: Opt[]; groups?: { label: string; options: Opt[] }[]; placeholder?: string; hint?: ReactNode; req?: Req; disabled?: boolean; changeAction?: string; data?: Record<string, string> }
/** changeAction: the change goes to a stage action (for linked fields) instead of straight to data-bind. groups: options in
 *  labelled groups, after the ungrouped options (a group with no options is left out). */
export function SelectInput({ id, label, bind, value, options, groups, placeholder, hint, req, disabled, changeAction, data }: SelectProps) {
  const v = value || '', ref = useSyncedSelect(v);
  const opt = (o: Opt) => { const ov = typeof o === 'string' ? o : o.value, ol = typeof o === 'string' ? o : o.label; return <option key={ov} value={ov}>{ol}</option>; };
  const sel = (
    <select ref={ref} className="select" id={id} data-change-action={changeAction} data-bind={changeAction ? undefined : bind} disabled={disabled || undefined} defaultValue={v} {...data}>
      {placeholder ? <option value="" disabled>{placeholder}</option> : null}
      {options.map(opt)}
      {(groups || []).filter(g => g.options.length).map(g => <optgroup key={g.label} label={g.label}>{g.options.map(opt)}</optgroup>)}
    </select>
  );
  return label == null ? sel : <Field id={id} label={label} hint={hint} req={req}>{sel}</Field>;
}

/** A segmented choice: each button sets data-bind to its value (action 'set'), or calls a stage action. */
export function Seg({ bind, value, options, type = 'str', label, id, action = 'set' }: { bind: string; value: unknown; options: { value: string; label: string; icon?: string }[]; type?: string; label?: string; id?: string; action?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o, i) => (
        <button type="button" key={o.value} id={id ? `${id}-${i}` : undefined} data-action={action} data-bind={bind} data-type={type} data-value={o.value} aria-pressed={String(o.value) === String(value)}>
          {o.icon ? <Icon name={o.icon} size={14} sw={2} /> : null}{o.label}
        </button>
      ))}
    </div>
  );
}

/** − value +. data-value is "-1" / "1", prefixed with "key|" when one action serves several steppers.
    typeAction: the value can also be typed; the stage action gets it when the field is committed. */
export interface StepperProps { id: string; action: string; keyName?: string; value: number; display: string; min: number; max: number; label: string; big?: boolean; typeAction?: string; unit?: string; disabled?: boolean }
export function Stepper({ id, action, keyName, value, display, min, max, label, big, typeAction, unit, disabled }: StepperProps) {
  const v = (d: number) => (keyName ? `${keyName}|${d}` : String(d)), inId = `${id}-in`, bad = ui.bad[inId] != null;
  const shown = bad ? String(ui.bad[inId]) : display;
  const ref = useSynced<HTMLInputElement>(shown);
  return (
    <div className={cx('stepper', big && 'big')} role="group" aria-label={label}>
      <button type="button" id={`${id}-dec`} data-action={action} data-value={v(-1)} aria-label={`Decrease ${label}`} disabled={disabled || value <= min + 1e-9 || undefined}><Icon name="minus" size={16} sw={2.2} /></button>
      {typeAction
        ? <label className={cx('step-val', bad && 'is-invalid')}>
            <input ref={ref} className="step-in" id={inId} type="text" inputMode="decimal" autoComplete="off" defaultValue={shown} data-change-action={typeAction} data-key={keyName || ''} aria-label={label} aria-invalid={bad ? 'true' : undefined} />
            {unit ? <small>{unit}</small> : null}
          </label>
        : <output id={`${id}-out`}>{display}</output>}
      <button type="button" id={`${id}-inc`} data-action={action} data-value={v(1)} aria-label={`Increase ${label}`} disabled={disabled || value >= max - 1e-9 || undefined}><Icon name="plus" size={16} sw={2.2} /></button>
    </div>
  );
}

export function Check({ id, bind, checked, label, hint }: { id: string; bind: string; checked: boolean; label: string; hint?: string }) {
  const ref = useSyncedCheck(!!checked);
  return (
    <label className="check" htmlFor={id}>
      <input ref={ref} type="checkbox" id={id} data-bind={bind} defaultChecked={!!checked} />
      <span className="check-t"><span>{label}</span>{hint ? <span className="check-h">{hint}</span> : null}</span>
    </label>
  );
}

/** A text field of the report form (js/services/report-gate.js reads data-rf and keeps the draft). */
export function RfInput({ id, rf, value, type, maxLength, autoComplete, invalid, describedBy }: { id: string; rf: string; value: string; type: 'email' | 'text'; maxLength: number; autoComplete: string; invalid: boolean; describedBy: string }) {
  const ref = useSynced<HTMLInputElement>(value);
  return <input ref={ref} className={cx('input', invalid && 'is-invalid')} id={id} data-rf={rf} type={type} inputMode={type === 'email' ? 'email' : undefined} spellCheck={type === 'email' ? false : undefined}
    defaultValue={value} maxLength={maxLength} autoComplete={autoComplete} aria-invalid={invalid ? 'true' : undefined} aria-describedby={describedBy} />;
}
export function RfTextarea({ id, rf, value, maxLength, invalid, describedBy }: { id: string; rf: string; value: string; maxLength: number; invalid: boolean; describedBy: string }) {
  const ref = useSynced<HTMLTextAreaElement>(value);
  return <textarea ref={ref} className={cx('input rf-textarea', invalid && 'is-invalid')} id={id} data-rf={rf} rows={3} maxLength={maxLength} defaultValue={value} aria-invalid={invalid ? 'true' : undefined} aria-describedby={describedBy} />;
}
export function RfSelect({ id, rf, value, options, placeholder, invalid, describedBy, country }: { id: string; rf: string; value: string; options: string[]; placeholder: string; invalid: boolean; describedBy: string; country: boolean }) {
  const ref = useSyncedSelect(value);
  return (
    <select ref={ref} className={cx('select', invalid && 'is-invalid')} id={id} data-rf={rf} defaultValue={value} aria-invalid={invalid ? 'true' : undefined} aria-describedby={describedBy} autoComplete={country ? 'country-name' : undefined}>
      <option value="" disabled>{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
export function RfCheck({ id, rf, checked, invalid, describedBy }: { id: string; rf: string; checked: boolean; invalid: boolean; describedBy: string }) {
  const ref = useSyncedCheck(checked);
  return <input ref={ref} type="checkbox" id={id} data-rf={rf} defaultChecked={checked} className={invalid ? 'is-invalid' : undefined} aria-invalid={invalid ? 'true' : undefined} aria-describedby={describedBy} />;
}

/* ---------- treatment amounts (Treatment and Predicted Result) ---------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = any;
export function QtyStepper({ q, max, sel, keyName = 'edit' }: { q: number; max: number; sel: Item; keyName?: string }) {
  const id = `${keyName}-qty-${sel.id}`, bad = ui.bad[id] != null, shown = bad ? String(ui.bad[id]) : String(q);
  const ref = useSynced<HTMLInputElement>(shown);
  return (
    <div className={cx('stepper', bad && 'is-invalid')} role="group" aria-label={`Panel quantity, ${sel.product.name}`}>
      <button type="button" id={`${id}-dec`} data-action="qty" data-value="-1" data-item={sel.id} aria-label="One panel fewer" disabled={q <= 0 || undefined}><Icon name="minus" size={16} sw={2.2} /></button>
      <input ref={ref} id={id} className={cx('qty-in', bad && 'is-invalid')} type="text" inputMode="numeric" data-bind={`${sel.path}.quantity`} data-type="int" data-min="0" data-max={String(max)}
        defaultValue={shown} aria-label={`Number of panels, ${sel.product.name}`} aria-invalid={bad ? 'true' : undefined} />
      <button type="button" id={`${id}-inc`} data-action="qty" data-value="1" data-item={sel.id} aria-label="One panel more" disabled={q >= max || undefined}><Icon name="plus" size={16} sw={2.2} /></button>
    </div>
  );
}
const areaError = (sel: Item) => (isNum(sel.rawAreaM2) && sel.rawAreaM2 < 0 ? 'Enter 0 m² or more' : null);
/* "How much": one slider in terms anyone can picture: a number of panels, or, for a product sold without a panel size,
   how much of the wall or ceiling it covers. The app's suggestion is marked on it. The result follows as it moves
   (events.ts setAmount). Areas in m² are left to "Show the calculation". */
export const whereWords = (pl: string) => (/^Wall \d$/.test(pl) ? pl : pl === 'Ceiling' ? 'the ceiling' : pl === 'Walls' ? 'the walls' : `the ${pl.toLowerCase()}`);
export function amountWords(p: unknown, it: Item): string {
  // None, set by the app: the other products are enough (AM.derive.autoPlan).
  if (!(it.areaM2 > 0) && it.amountBy === 'app') return 'none needed with the other products';
  const D = am.derive as any, cov = D.coverage(p, it.placement)[0], share = cov && cov.surfaceM2 > 0 ? it.areaM2 / cov.surfaceM2 : null;
  const of = share != null ? `${share < 0.995 ? 'about ' : ''}${Math.round(Math.min(1, share) * 100)} % of ${whereWords(it.placement)}` : `on ${whereWords(it.placement)}`;
  return it.mode === 'units' ? `${it.quantity} panel${it.quantity === 1 ? '' : 's'}, covering ${of}` : share != null ? `covering ${of}` : `on ${whereWords(it.placement)}`;
}
export function AmountSlider({ p, sel, keyName = 'edit' }: { p: unknown; sel: Item; keyName?: string }) {
  const D = am.derive as any, amt = D.autoAmount(p, sel), avail: number | null = amt ? amt.availableM2 : null;
  const id = `${keyName}-amount-${sel.id}`, units = sel.mode === 'units', per = units ? sel.size.areaM2 : 1;
  // Panels: up to what fits where it goes (at least the current and the suggested amount). A share: 0–100 % of the free surface.
  const max = units ? Math.min(ui.MAX_PANELS, Math.max(1, sel.quantity, amt && amt.quantity != null ? amt.quantity : 0, avail != null ? Math.floor(avail / per + 1e-9) : 50)) : 100;
  const value = units ? sel.quantity : avail ? Math.round(Math.min(1, sel.areaM2 / avail) * 100) : 0;
  const rec = amt ? (units ? amt.quantity : avail ? Math.round(Math.min(1, amt.areaM2 / avail) * 100) : 0) : null;
  const ref = useSynced<HTMLInputElement>(String(value));
  const big = units ? `${value} panel${value === 1 ? '' : 's'}` : `${value} % of ${whereWords(sel.placement)}`;
  const small = units ? amountWords(p, sel).replace(/^\d+ panels?, /, '') : avail ? 'of the free surface there' : '';
  return (
    <div className="amount-slider">
      <label className="as-head" htmlFor={id}><span className="as-k">How much</span><b className="as-v" data-watch={`${keyName}-amount`}>{big}</b><span className="small muted">{small}</span></label>
      <input ref={ref} id={id} type="range" className="as-range" min={0} max={max} step={1} defaultValue={String(value)} list={rec != null ? `${id}-rec` : undefined}
        data-input-action="setAmount" data-item={sel.id} data-mode={units ? 'units' : 'share'} data-avail={avail != null ? String(avail) : '0'}
        aria-valuetext={big} aria-describedby={`${id}-hint`} />
      {rec != null ? <datalist id={`${id}-rec`}><option value={String(rec)} /></datalist> : null}
      <div className="as-scale small muted" aria-hidden="true"><span>None</span><span>{units ? `${max} panels` : 'All of it'}</span></div>
      <p className="small muted" id={`${id}-hint`}>{rec == null ? 'Move it to see what each amount does.'
        : value === rec ? `This is the amount the app suggests for this room.` : `The app suggests ${units ? `${rec} panel${rec === 1 ? '' : 's'}` : `${rec} %`} (marked on the bar).`}</p>
    </div>
  );
}

export function AmountControl({ sel, keyName = 'edit' }: { sel: Item; keyName?: string }) {
  if (sel.mode === 'units') {
    return (
      <div className="qty-row">
        <QtyStepper q={sel.quantity} max={ui.MAX_PANELS} sel={sel} keyName={keyName} />
        <span className="muted">panels of {ui.panelArea(sel.size.areaM2)}</span>
        {ui.bad[`${keyName}-qty-${sel.id}`] != null ? <span className="field-err"><Icon name="alert" size={13} sw={2.2} />Enter a whole number of panels</span> : null}
      </div>
    );
  }
  return <NumberInput id={`${keyName}-area-${sel.id}`} label="Treatment area" bind={`${sel.path}.areaM2`} value={sel.rawAreaM2} unit="m²" placeholder="0.0" error={areaError(sel)} />;
}
/** Compact area field for tables. */
export function AreaIn({ sel, keyName = 'plan' }: { sel: Item; keyName?: string }) {
  const id = `${keyName}-area-${sel.id}`, bad = ui.bad[id] != null || !!areaError(sel);
  const shown = ui.bad[id] != null ? String(ui.bad[id]) : isNum(sel.rawAreaM2) ? String(sel.rawAreaM2) : '';
  const ref = useSynced<HTMLInputElement>(shown);
  return (
    <span className="area-in">
      <input ref={ref} id={id} className={cx('qty-in', bad && 'is-invalid')} type="text" inputMode="decimal" data-bind={`${sel.path}.areaM2`} data-type="num" defaultValue={shown} placeholder="0.0"
        aria-label={`Treatment area of ${sel.product.name}`} aria-invalid={bad ? 'true' : undefined} />
      <span className="muted">m²</span>
    </span>
  );
}
/* Octave bands in everyday words, as on Results: low sounds (125, 250 Hz), voices (500 Hz–2 kHz), high sounds (4 kHz). */
const soundOf = (f: number) => (f <= 250 ? 'low sounds' : f >= 4000 ? 'high sounds' : 'voices');
export function soundsText(above: number[], below: number[]): string {
  const names = (fs: number[]) => fmt.list([...new Set(fs.map(soundOf))]);
  return [above.length ? `${names(above)} would still echo too long` : '', below.length ? `${names(below)} would become too dull` : ''].filter(Boolean).join(', and ');
}
// What would help, in everyday words: a product that absorbs where the room still falls short.
export function soundsAdvice(above: number[], below: number[]): string {
  const low = above.some(f => f <= 250), dull = below.length > 0;
  return low ? `Add a second product that absorbs low sounds well (thicker panels, or panels mounted with an air gap)${dull ? ', and use less of this one' : ''}, or choose another mounting.`
    : dull ? 'Use less of it, or combine it with a product that absorbs evenly across the range.'
      : 'Add a second product, or choose another mounting.';
}

/* The amount of the product being edited that meets the target (AM.derive.treatmentForTarget): every judged band within
   its limits. When no amount does, the amount that brings the average to the aim, said as such, with the bands that
   stay outside. The area is rounded up to 0.1 m², so the amount shown still meets what it says. */
export function AmountGoal({ goal, sel, targetRT }: { goal: { areaM2: number; units: number | null; withOthers: boolean; meetsBands?: boolean; above?: number[]; below?: number[] } | null; sel: Item; targetRT: number }) {
  if (!goal || goal.areaM2 <= 0) return null;
  const also = goal.withOthers ? ' with the other products' : '', all = goal.meetsBands !== false;
  const what = all ? 'to meet the target in every band' : `to bring the average to ${fmt.s(targetRT)}`;
  const hz = (fs: number[]) => fmt.hzList(fs);
  const short = all ? null : (
    <Note tone="warn">{`${sel.product.name}${also} cannot fix every part of the sound on its own. With the amount that brings the average to ${fmt.s(targetRT)}, ${soundsText(goal.above || [], goal.below || []) || 'some bands would stay outside their limits'} (${[goal.above && goal.above.length ? `${hz(goal.above)} above` : '', goal.below && goal.below.length ? `${hz(goal.below)} below` : ''].filter(Boolean).join(', ')} their limits). ${soundsAdvice(goal.above || [], goal.below || [])}`}</Note>
  );
  if (sel.mode === 'units') {
    if (goal.units === sel.quantity) return short;
    if ((goal.units || 0) > ui.MAX_PANELS) return <Note tone="warn">{`This needs ${goal.units} panels of this size, more than the ${ui.MAX_PANELS} this tool allows. Choose a larger panel or enter the area directly.`}</Note>;
    return <>{short}<div><Btn action="setQty" value={goal.units ?? 0} item={sel.id} size="sm" cls="btn-wrap">{`Use ${goal.units} panels ${what}${also}`}</Btn></div></>;
  }
  const a = Math.ceil(goal.areaM2 * 10 - 1e-9) / 10;
  return Math.abs(a - sel.areaM2) < 0.05 ? short : <>{short}<div><Btn action="setArea" value={a} item={sel.id} size="sm" cls="btn-wrap">{`Use ${a.toFixed(1)} m² ${what}${also}`}</Btn></div></>;
}
export const GoalUnreachable = ({ sel, targetRT }: { sel: Item; targetRT: number }) => (
  <Note tone="info">{`No amount of ${sel.product.name} brings the predicted average RT60 to ${fmt.s(targetRT)}, with the rest of the plan as it is: in some bands it absorbs too little, or less than the finish it covers. Combine it with another product, or choose a more absorbent configuration.`}</Note>
);
/** The treatment placed on a surface is larger than that surface. cov = AM.derive.coverage(p). */
export function CoverageWarning({ cov }: { cov: { label: string; areaM2: number; count: number; surfaceM2: number; fraction: number }[] | null }) {
  return <>{(cov || []).filter(c => c.fraction > 1).map((c, i) => (
    <Note tone="warn" key={i}>{`The treatment placed on ${/^Wall \d$/.test(c.label) ? c.label : `the ${c.label.toLowerCase()}`} (${fmt.m2(c.areaM2)}${c.count > 1 ? `, ${c.count} products` : ''}) is more than the free surface there (${fmt.m2(c.surfaceM2)}: its area less doors, windows and any existing covering). Check the amounts or the placement.`}</Note>
  ))}</>;
}

/* ---------- RT60 scale: target band, measured and predicted on one axis ---------- */
/* An upper-limit target (min and preferred null) is drawn from 0 to its limit, with no preferred line. */
export function RtScale({ target, measured, predicted, arrow = false, max }: { target: { min: number | null; max: number; preferred: number | null } | null; measured?: number | null; predicted?: number | null; arrow?: boolean; max?: number }) {
  const top = Math.max(measured || 0, predicted || 0, target ? target.max : 0);
  const M = max || Math.max(1.5, Math.ceil(top * 1.3 / 0.5) * 0.5);
  const pos = (v: number) => Math.min(100, Math.max(0, v / M * 100));
  const lab = (v: number, text: string) => { const x = pos(v); return <span className={cx('rts-lab', x < 9 ? 'a-start' : x > 91 ? 'a-end' : '')} style={{ left: `${x}%` }}>{text}</span>; };
  const ticks: ReactNode[] = [], minor: ReactNode[] = [];
  for (let v = 0, i = 0; v <= M + 1e-9; v += 0.5, i++) { const x = pos(v); ticks.push(<span key={i} className={x < 3 ? 'edge-l' : x > 97 ? 'edge-r' : ''} style={{ left: `${x}%` }}>{`${v.toFixed(1)} s`}</span>); }
  for (let k = 1; k * 0.1 < M - 1e-9; k++) minor.push(<i key={k} className={k % 5 ? '' : 'mj'} style={{ left: `${pos(k * 0.1)}%` }} />);
  const legend: [string, string][] = [];
  const lo = target && isNum(target.min) ? target.min : 0;
  if (target) legend.push(isNum(target.min) ? ['zone', `Target range ${target.min.toFixed(2)}–${target.max.toFixed(2)} s`] : ['zone', `Target: at most ${target.max.toFixed(2)} s`]);
  if (target && isNum(target.preferred)) legend.push(['pref', `Preferred ${target.preferred.toFixed(2)} s`]);
  if (isNum(measured)) legend.push(['measured lg-dot', 'Measured']);
  if (isNum(predicted)) legend.push(['predicted lg-dot', 'Predicted (modelled)']);
  const aria = [isNum(measured) ? `Measured ${fmt.s(measured)}` : '', isNum(predicted) ? `predicted ${fmt.s(predicted)}` : '', target ? (isNum(target.min) ? `target ${target.min}–${target.max} s` : `target at most ${target.max} s`) : ''].filter(Boolean).join(', ');
  return (
    <div className="rts" role="img" aria-label={aria}>
      <div className="rts-row">{isNum(measured) ? lab(measured, `Measured ${fmt.s(measured)}`) : null}</div>
      <div className="rts-track">
        {target ? <><div className="rts-band" style={{ left: `${pos(lo)}%`, width: `${pos(target.max) - pos(lo)}%` }} />{isNum(target.preferred) ? <div className="rts-pref" style={{ left: `${pos(target.preferred)}%` }} /> : null}</> : null}
        {arrow && isNum(measured) && isNum(predicted) && predicted < measured - 0.005 ? <div className="rts-arrow" style={{ left: `${pos(predicted)}%`, width: `${pos(measured) - pos(predicted)}%` }} /> : null}
        {isNum(measured) ? <span className="rts-dot measured" style={{ left: `${pos(measured)}%` }} /> : null}
        {isNum(predicted) ? <span className="rts-dot predicted" style={{ left: `${pos(predicted)}%` }} /> : null}
      </div>
      <div className="rts-ticks" aria-hidden="true">{minor}</div>
      <div className="rts-row below">{isNum(predicted) ? lab(predicted, `Predicted ${fmt.s(predicted)}`) : null}</div>
      <div className="rts-axis">{ticks}</div>
      <Legend items={legend} />
    </div>
  );
}

/** A guide video thumbnail (js/ui/guide.js draws the poster). */
export function GuideThumb({ id, size = 22, disabled }: { id: string; size?: number; disabled?: boolean }) {
  const g = am.guides[id];
  return (
    <button type="button" className="mi-thumb" data-action="openGuide" data-value={id} disabled={disabled || undefined} aria-label={`Play the ${g.title} video, ${g.lengthLabel}`}>
      <span className="mi-poster" dangerouslySetInnerHTML={{ __html: am.guide.poster(id) }} />
      <span className="mi-play"><Icon name="play" size={size} sw={2.4} /></span><span className="mi-len">{g.lengthLabel}</span>
    </button>
  );
}
