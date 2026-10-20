/* Step 7 · Acoustic Assessment — how does the measured room compare with the target? The room is judged by the rule of
   its criterion (AM.derive.assessment, AM.services.evaluation): every band the criterion sets has to lie within the
   target range. That is the verdict; the average is its summary, never deciding alone. Bands with their own, wider
   limits are band warnings, shown apart. */
import { D, fmt, RA, TGT } from '../lib';
import type { Ctx, PrimaryAction, SoundGroup } from '../am';
import { Card, Chart, Details, Icon, Legend, Note, Pill, RtScale, Stat, StatusPill, TableWrap, Tag, TechH } from '../ui/kit';
import { SoundStrips } from '../ui/blocks';

const VERDICT: Record<string, [string, string, string]> = { within: ['good', 'Meets the target', 'check'], above: ['critical', 'Does not meet the target', 'arrowUp'], below: ['warn', 'Drier than the target', 'arrowDn'] };
const ROLE: Record<string, string> = { primary: 'Judged, target range', edge: 'Judged, own limit', secondary: 'Warning only', info: 'No limit' };

/* One sentence the sales person can say, from the three groups' statuses, voices first. */
function advice(groups: SoundGroup[]): string {
  const by = (id: string) => groups.find(g => g.id === id), v = by('voices');
  const name: Record<string, string> = { low: 'low sounds like footsteps', high: 'high sounds like clinking cups' };
  const others = groups.filter(g => g.id !== 'voices');
  const echo = others.filter(g => g.status === 'above'), dry = others.filter(g => g.status === 'below');
  const list = (xs: SoundGroup[]) => xs.map(g => name[g.id]).join(' and ');
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  if (!v || v.status == null) return 'Voices could not be measured clearly. Measure again before deciding on treatment.';
  if (v.status === 'above') return `Voices echo, so speech will sound muddy.${echo.length ? ` ${cap(list(echo))} linger too.` : ''} Sound-absorbing treatment will help.`;
  if (v.status === 'below') return 'Voices sound drier than the goal. Adding absorption would make the room drier still.';
  if (echo.length) return `Voices sound clear. ${cap(list(echo))} linger, so panels that absorb ${echo.length > 1 ? 'low and high' : echo[0].id} sounds would help most.`;
  if (dry.length) return `Voices sound clear. ${cap(list(dry))} are a little dry, which needs no treatment.`;
  return 'Voices, low sounds and high sounds are all within the goal.';
}

export function AssessmentScreen({ ctx }: { ctx: Ctx }) {
  const a = D.assessment(ctx.project);
  if (!a) return <Note tone="warn">Assessment needs a target and a valid measurement.</Note>;
  const t = a.target, pol = a.policy, v = a.verdict, ex = a.explanation;
  const vd = a.available && a.status ? VERDICT[a.status] : null;
  const groups = D.soundGroups(ctx.project) || [];
  const verdictWord = vd ? (v.complete || a.status !== 'within' ? vd[1] : 'Meets the target where measured') : 'Not assessed';
  return (
    <>
      {a.provisional ? <Note tone="warn" icon="pin"><b>{!a.positions.complete ? `Provisional: measured at ${a.positions.valid} of the ${a.positions.required} positions needed.` : `Provisional: ${(a as any).thinBands.map((f: number) => fmt.hz(f)).join(', ')} rest${(a as any).thinBands.length > 1 ? '' : 's'} on fewer than ${a.positions.required} positions.`}</b> Measure another position in Acoustic Measurement to complete the result.</Note> : null}
      {/* Four figures: the target; the verdict; the summary over the judged bands; the average over all bands. */}
      <div className="grid g4 stat-row">
        {t.preferred != null
          ? <Stat kind="target" label="Preferred target" value={t.preferred.toFixed(2)} tag={<Tag kind="target" />} sub={`Range ${TGT.rangeText(t)} · set in step 2`} />
          : <Stat kind="target" label="Target, upper limit" value={`≤ ${t.max.toFixed(2)}`} tag={<Tag kind="target" />} sub={`At ${pol.short} · set in step 2`} />}
        <Stat label="Verdict" value={verdictWord} words={vd ? vd[0] : 'neutral'} sub={a.available ? <span>{a.status === 'within'
          ? `every band from ${pol.judgedSpan} within its limits${v.complete ? '' : ' (where measured)'}`
          : v.failing && v.failing.length ? `outside its limits: ${fmt.hzList(v.failing.map((r: { f: number }) => r.f))}` : `rule: every band from ${pol.judgedSpan} within its limits`}</span> : <span>too few bands measured</span>} />
        <Stat kind="measured" label={`Average, ${pol.short}`} value={a.available && a.rt != null ? a.rt.toFixed(2) : '—'} unit={a.available ? 's' : ''} tag={<Tag kind="measured" />}
          sub={a.available ? <><StatusPill status={a.summaryStatus} /><span>{`${pol.short} · ${a.summary.partial ? `${a.summary.n} of ${a.summary.total} bands` : a.summary.total === 1 ? 'measured' : `all ${a.summary.total} bands`}`}</span></> : 'Not available'} />
        <Stat kind="measured" label="Average, all bands" value={a.average.available && a.average.value != null ? a.average.value.toFixed(2) : '—'} unit={a.average.available ? 's' : ''}
          sub={a.average.available ? <span>{`${RA.SHORT}${a.average.partial ? ` · ${a.average.n} of ${a.average.total} bands, ${a.average.missing.map(x => fmt.hz(x.f)).join(', ')} not measured` : ''} · overall figure, not judged`}</span> : 'Not available'} />
      </div>
      {/* The verdict, in plain words, with the summary on the scale. */}
      {a.available && vd ? (
        <Card icon="scale" title="Result against the target" right={<Pill tone={vd[0]} text={ex.headline} icon={vd[2]} />} cls={`card-verdict is-${vd[0]}`}>
          <RtScale target={t} measured={a.rt} />
          <p className="lead"><b>{`${ex.headline}.`}</b>{` ${ex.lines.join(' ')}`}</p>
          <p className="small muted">{`How it is judged: ${pol.basis}${pol.custom && pol.criterion ? " The target was adjusted by hand; the bands are those of the room's criterion." : ''} The scale shows the average over ${pol.short}, ${fmt.s(a.rt)}, across ${a.positions.valid} position${a.positions.valid > 1 ? 's' : ''}; it is a summary, and the verdict is decided band by band.`}</p>
        </Card>
      ) : (
        <Card icon="scale" title="Result against the target" right={<Pill tone="warn" text="Not assessed" icon="alert" />}>
          <Note tone="warn" icon="alert"><b>The room cannot be assessed.</b>{` ${a.reason || ''}`}</Note>
          <p className="small">{`The room is judged in the ${pol.label.toLowerCase()}, and at least half of those bands need a value. Without them there is no verdict, no treatment amount and no prediction. Measure again in Acoustic Measurement: a quieter room, or a higher sweep level, can give the missing bands enough usable decay. Each band that has a value is compared below.`}</p>
        </Card>
      )}
      {!a.available ? null
        : a.status === 'above' ? <Note tone="warn"><b>Treatment needed.</b>{` The next step works out how much absorption would bring the ${pol.short} average to ${t.preferred != null ? fmt.s(t.preferred) : `the ${fmt.s(t.max)} limit`}, and checks every band again.`}</Note>
          : a.status === 'within' ? <Note tone="good"><b>{`Room meets target${v.complete ? '' : ' where measured'}.`}</b> Treatment is optional. You can still explore it in the next step.</Note>
            : <Note tone="warn"><b>Drier than the target.</b> Adding absorption would move the room further from the target. Treatment is not recommended.</Note>}
      {ex.warnings.length ? (
        <Card icon="alert" title="Band warnings" right={<Pill tone="warn" text={`${ex.warnings.length} band${ex.warnings.length > 1 ? 's' : ''}`} icon="alert" />}>
          <ul className="bullets">{ex.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          <p className="small muted">{`These bands have their own, wider limits in ${pol.criterion || 'the criterion'}. They are reported separately and do not change the verdict above.`}</p>
        </Card>
      ) : null}
      <Card icon="bars" title="Where the room needs help">
        <SoundStrips groups={groups} t={t} />
        <div className="advice"><Icon name="info" size={17} sw={2} /><span>{advice(groups)}</span></div>
        <Details id="assessment-bands">
          <TechH title="Band by band" note={`Measured RT60 in each octave band (average over the positions), against that band's limits. "Judged": the band decides the verdict, against the target range or the criterion's own limits for that band; "no limit": the criterion sets nothing there.`} />
          <Chart type="bands" spec={{ series: [{ label: 'Measured RT60', kind: 'measured', values: a.bands.map(b => b.rt) }], target: t, limits: a.bands.map(b => ({ min: b.min, max: b.max })), unit: 's', height: 240, yTitle: 'RT60 (s)', aria: 'Measured RT60 by band against the target range' }} height={240} />
          <Legend items={t.preferred != null ? [['measured', 'Measured RT60'], ['zone', `Target range ${TGT.rangeText(t)}`], ['pref', 'Preferred']] : [['measured', 'Measured RT60'], ['zone', `Target ${TGT.rangeText(t)}`]]} />
          <TableWrap>
            <table className="tbl">
              <thead><tr><th>Band</th><th className="r">Measured</th><th className="r">Limits</th><th>Role</th><th className="r">Positions</th><th>Status</th></tr></thead>
              <tbody>
                {a.bands.map(b => (
                  <tr className={b.role === 'primary' || b.role === 'edge' ? 'is-ref' : undefined} key={b.f}>
                    <td>{fmt.hz(b.f)}</td><td className="r">{b.rt != null ? fmt.s(b.rt) : '—'}</td>
                    <td className="r">{b.max != null ? (b.min != null ? `${b.min.toFixed(2)}–${fmt.s(b.max)}` : `≤ ${fmt.s(b.max)}`) : '—'}</td><td>{ROLE[b.role]}</td><td className="r">{`${b.n} of ${b.of}`}</td>
                    <td>{b.status === 'insufficient' ? <span className="nr">Not measured</span> : b.status ? <StatusPill status={b.status} /> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Details>
      </Card>
    </>
  );
}

export function assessmentPrimary(ctx: Ctx): PrimaryAction | null {
  const a = D.assessment(ctx.project);
  return a && a.available ? { label: a.status === 'above' ? 'Explore treatment' : 'Continue to Treatment', action: 'continue' } : null;
}
