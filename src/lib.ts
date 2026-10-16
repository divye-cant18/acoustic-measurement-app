/* Shared access to the application's modules (window.AM) for the interface. The bundle runs after every script in js/,
   so the modules are all there when these are read. Nothing here calculates: it only names what the interface uses. */
import type { AMRoot, Ctx, Project } from './am';

export const am: AMRoot = window.AM;
export const { fmt, isNum } = am.util;
export const W = am.workflow;
export const S = am.store;
export const D = am.derive;
export const ui = am.ui;
export const demo = am.demo;
export const svc = am.services;

/* Services the screens read, as the scripts define them (their own files document their data). */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const A = am as Any;
export const acoustics: Any = A.acoustics;
export const SURF: Any = svc.surfaces;
export const TGT: Any = svc.target;
export const CAT: Any = svc.catalog;
export const MEAS: Any = svc.measurement;
export const PROC: Any = svc.processing;
export const EVAL: Any = svc.evaluation;
export const RA = svc.rt60Average;
export const AN: Any = A.analysis;
export const LIVE: Any = A.live;
export const DEMO: Any = demo;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Class names, the falsy ones left out. */
export const cx = (...a: (string | false | null | undefined | 0)[]): string => a.filter(Boolean).join(' ');

/** The context a stage's view and actions receive (the same object the earlier shell built). */
export const makeCtx = (): Ctx => ({ project: S.state.project as Project, state: S.state, store: S, render: () => am.app && am.app.render() });

/** "1 position", "2 positions". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A stage's own helpers (kept in its js/stages file with its actions and checks). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stageModel = <T = any>(id: string): T => (W.get(id) as unknown as { model: T }).model;
