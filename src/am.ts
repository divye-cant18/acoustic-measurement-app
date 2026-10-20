/* The application's existing modules, as the interface uses them: window.AM, built by the scripts in js/ (measurement,
   calculation, report, store, workflow). These types describe their data contracts; they change nothing. The interface
   reads through them and never calculates, measures or stores anything itself. */

export type Band = 125 | 250 | 500 | 1000 | 2000 | 4000;
export type Status = 'above' | 'within' | 'below';
export type Tone = 'good' | 'warn' | 'critical' | 'neutral' | 'acoustic' | 'live';

/* ---------- project ---------- */
export interface Opening { id: string; kind: string; w: number | null; h: number | null }
export interface Surface { material: string | null; openings: Opening[]; cover?: { material: string | null; pct: number | null } }
export interface Room {
  name: string; industry: string; type: string; use: string; L: number | null; W: number | null; H: number | null;
  occupancy: number | null; furnishing: string; surfaces?: Record<string, Surface>; [legacy: string]: unknown;
}
/* A target is a range (preferred, min, max) or, when its criterion gives only a maximum, an upper limit (form 'max':
   preferred and min null). record: the criterion's source and conditions (js/services/target.js); note: where a target
   the user entered comes from. */
export interface Target {
  preferred: number | null; min: number | null; max: number | null; form?: 'range' | 'max'; source: 'recommended' | 'custom'; basis: string;
  note?: string; record?: Record<string, unknown>; earlier?: Record<string, unknown>;
}
export interface ValidTarget { preferred: number | null; min: number | null; max: number; form?: 'range' | 'max'; source: string; basis: string }
export interface NoiseResult {
  status: 'valid' | 'warning' | 'unassessed' | 'invalid'; takenAt: string; leqDbfs: number; position?: string | null;
  spreadDb: number; jumpDb: number; driftDb: number; dcDbfs?: number; seconds: number; warnings: string[]; reasons: string[];
  inBand?: { leqDbfs: number; l50: number; soundDb: number; soundBand: number; driftDb: number; spreadDb: number };
  bands: { f: number; leqDbfs: number | null }[];
}
export interface NoiseAttempt { status: 'invalid' | 'failed'; takenAt: string; reasons: string[] }
export interface Setup {
  deviceKind: string | null; deviceId: string; deviceLabel: string; outputId: string; permission: string; position: string;
  sweepLevelDb: number; noise: NoiseResult | null; noiseAttempt: NoiseAttempt | null; prep: Record<string, boolean>; [k: string]: unknown;
}
export interface Take {
  id: string; takenAt: string; status: 'captured' | 'failed'; reason: string | null; deviceLabel: string; outputLabel: string;
  deviceKind: string | null; position: string | null; sampleRate: number; plan: Plan & { levelDb?: number; playedPeakDbfs?: number };
  levels: { peakDbfs: number; preRollDbfs: number; sweepDbfs: number; snrDb: number }; waveform?: number[];
  analysis: { latencySec: number | null; distortion: Distortion | null; [k: string]: unknown }; warnings: string[];
}
export interface Plan { fs: number; f1: number; f2: number; seconds: number; preRoll: number; tail: number; total: number; amplitude: number }
export interface Distortion { h2Db: number | null; h3Db: number | null; floorDb: number }
export interface Fit { from: number; to: number; slope: number; intercept: number; t1: number; t2: number; T: number; r2: number }
export interface ResultBand {
  f: Band; rt60: number | null; path: string | null; t20: number | null; t30: number | null; t60: number | null;
  quality: string; confidence: string; r2: number | null; xi: number | null; curvature: number | null; fit: Fit | null;
  reason: string | null; notes: string[]; decayRangeDb: number | null; noiseFloorDb: number | null; headDb: number | null;
  curve: { dt: number; env: number[]; edc: (number | null)[] } | null; crossSec: number | null; bandwidth: number;
}
export interface Headline { f: Band; rt60: number; method: string; quality: string; confidence: string }
export interface Result {
  valid: boolean; status: 'valid' | 'warning' | 'invalid'; reason: string | null; referenceBand: Band; bands: ResultBand[];
  headline: Headline; warnings: string[]; recordingId: string; takenAt: string; processedAt: string;
  meta: Record<string, unknown> & { position?: string | null; deviceKind?: string | null; deviceLabel?: string; plan?: Take['plan']; levels?: Take['levels'] };
}
export interface Project {
  id: string; kind: string; createdAt: string; updatedAt: string; lastStage: string; pinned?: boolean; followUpOf?: string;
  legacyNote?: string; targetNote?: string; room: Room; target: Target; setup: Setup;
  measurement: { recording: Take | null; failed: { reason: string; takenAt: string; levelDb?: number; position?: string | null } | null; retry: { reason: string | null; position?: string } | null };
  processing: { result: Result | null; attempt: { recordingId: string; takenAt: string; reason: string | null; position?: string; result?: Result } | null; history: unknown[]; positions?: Record<string, Result> };
  treatment: { items: TreatmentItemRef[]; active: string | null };
  completed: string[]; review: string[];
}
export interface TreatmentItemRef { id: string; productId: string; configurationId: string | null; size: string; quantity: number; areaM2?: number | null; placement: string }

/* ---------- workflow and store ---------- */
export interface Stage {
  id: string; title: string; nav: string; phase: string | null; purpose: string; owns: string[]; deps: string[];
  continueLabel?: string;
  canContinue?: (p: Project | null) => { ok: boolean; reason?: string };
  actions?: Record<string, ActionFn>;
  view?: (ctx: Ctx) => View;
  mount?: (root: HTMLElement, ctx: Ctx) => void;
  leave?: (ctx: Ctx) => void;
  resize?: () => void;
  demoFill?: (p: Project) => unknown;
  [k: string]: unknown;
}
export interface PrimaryAction { label: string; action: string; value?: string; rec?: boolean }
export interface View { body: string; primary?: PrimaryAction | null; header?: boolean; footer?: boolean }
export type ActionFn = (ctx: Ctx, value: string | undefined, el: HTMLElement, e?: Event) => unknown;
export interface UiState {
  navOpen: boolean; sheet: null | { kind: 'explain'; stage: string } | { kind: 'tools' } | { kind: 'history' } | { kind: 'guide'; id: string };
  toast: string | null; band: number; confirm: string | null; open?: Record<string, boolean>;
  // The tour of the screen (src/shell/Tour.tsx) and the Help menu on a step's top bar.
  tour?: { kind: 'home' | 'step'; i: number; at: string } | null; help?: boolean;
  catalog: { query: string; category: string; surface: string; browsing: boolean; adding: boolean; view?: 'home' | 'category' | 'product'; cat?: string | null; group?: string | null; variant?: string | null }; [k: string]: unknown;
}
export interface AppState { project: Project | null; projects: Project[]; current: string; ui: UiState }
export interface Ctx { project: Project; state: AppState; store: Store; render: () => void }
export interface Store {
  state: AppState; load(): void; subscribe(fn: (s: AppState) => void): () => void; emit(): void;
  ui(patch: Partial<UiState>): void; uiSet(path: string, v: unknown): void; update(fn: (p: Project) => void): void; set(path: string, v: unknown): void;
  go(id: string): boolean; advance(): void; check(p: Project | null, s: Stage): { ok: boolean; reason?: string }; back(): void; toast(msg: string): void; history(): Project[];
  startProject(kind: string): void; startFollowUp(): void; openProject(id: string): void; closeProject(): void; resetProject(): void;
  deleteProject(id: string): void; togglePin(id: string): void; autofillTo(id: string): void;
}
export interface Workflow {
  STAGES: Stage[]; PHASES: string[]; NUMBERED: number; get(id: string): Stage; idx(id: string): number; next(id: string): Stage | null;
  prev(id: string): Stage | null; stepNo(id: string): number; isDone(p: Project | null, id: string): boolean; needsReview(p: Project | null, id: string): boolean;
  canEnter(p: Project | null, id: string): boolean; status(p: Project | null, id: string, current: string): 'current' | 'completed' | 'available' | 'locked';
}

/* ---------- derived values ---------- */
export interface Average {
  available: boolean; value: number | null; n: number; total: number; required: number[]; partial: boolean; reason: string | null;
  included: { f: Band; rt60: number; path?: string; quality?: string }[]; excluded: { f: Band }[]; missing: { f: Band; reason: string }[];
  recordingId?: string | null;
}
export interface AvailableAverage extends Average { available: true; value: number }
export interface Geometry { L: number; W: number; H: number; V: number; floor: number; ceiling: number; walls: number; total: number }
export interface Policy { id: string; name: string; label: string; short: string; span: string; primary: Band[]; judged: Band[]; judgedShort: string; judgedSpan: string; basis: string; brief: string; interpretation: boolean; criterion: string | null; custom: boolean }
export interface BandRow { f: Band; rt: number | null; role: 'primary' | 'edge' | 'secondary' | 'info'; min: number | null; max: number | null; status: Status | 'insufficient' | null; diff: number | null; n?: number; of?: number }
export interface Verdict { available: boolean; status: Status | null; summaryStatus: Status | null; complete: boolean; missing: Band[]; failing: BandRow[]; above: BandRow[]; below: BandRow[]; warnings: BandRow[]; masked: boolean; reason: string | null }
export interface Explanation { headline: string; tone: string; lines: string[]; warnings: string[] }
export interface Assessment {
  target: ValidTarget; policy: Policy; summary: Average; average: Average; mid: Average; midStatus: Status | null; available: boolean; reason: string | null;
  bands: BandRow[]; verdict: Verdict; warnings: BandRow[]; explanation: Explanation; above: number;
  ref: { f: Band; rt: number; method: string; confidence: string }; positions: { valid: number; required: number; complete: boolean }; provisional: boolean;
  rt: number | null; diff: number | null; status: Status | null; summaryStatus: Status | null; blocked?: string;
}
export interface RoomBand { f: Band; rt60: number | null; n: number; of: number; path: string | null; quality: string; confidence: string; reason: string | null; notes: string[]; spread: number | null; values: { position: string; rt60: number | null; path: string | null; quality: string | null; reason: string | null }[] }
export interface RoomResult { valid: true; count: number; minimum: number; complete: boolean; positions: { id: string; name: string; recordingId: string; takenAt: string }[]; referenceBand: Band; headline: { f: Band; rt60: number; method: string; quality: string; confidence: string }; bands: RoomBand[]; status: string; warnings: string[] }
export interface PositionRow { id: string; name: string; detail: string; no: number; result: Result | null; issue: { kind: 'invalid' | 'failed'; takenAt: string; reason: string | null } | null; waiting: boolean; status: 'valid' | 'waiting' | 'invalid' | 'failed' | 'not-measured'; current: boolean }
export interface Positions { rows: PositionRow[]; count: number; required: number; need: number; complete: boolean; next: string | null }
export interface SoundGroup { id: 'low' | 'voices' | 'high'; label: string; example: string; icon: string; bands: Band[]; value: number | null; missing: Band[]; status: Status | 'none' | null }
export interface Summary {
  id: string; name: string; industry: string; type: string; geometry: Geometry | null; measured: number | null; average: number | null; summary: number | null;
  summaryLabel: string; summaryName: string; summaryShort: string; positions: number; positionsRequired: number; measuredAt: string | null; target: number | null; targetText: string | null; status: Status | null; provisional: boolean;
  treatment: { items: number; predicted: number | null; predictedStatus: Status | null; required: boolean };
  done: number; total: number; next: string | null; review: number; reviewNext: string | null; pinned: boolean; updatedAt: string;
}
export interface Product { id: string; name: string; category?: string; thickness?: { mm: number }; gsm?: { value: number }; finish?: string; size: { options: { label: string; areaM2: number }[] }; [k: string]: unknown }
export interface Configuration { id: string; productId: string; label: string; ratings: { nrc: number | null; [k: string]: unknown }; test: { certificate?: string; [k: string]: unknown }; [k: string]: unknown }
export interface PlanItem {
  id: string; index: number; no: number; path: string; placement: string; rawAreaM2: number | null | undefined; product: Product; configuration: Configuration | null;
  complete: boolean; mode: 'units' | 'area'; sizes: { index: number; label: string; areaM2: number }[]; size: { index: number; label: string; areaM2: number } | null;
  quantity: number; areaM2: number; alpha: Record<number, number | null>; missingBands: number[]; alphaThirds: Record<number, number[]>; alphaCapped: number[];
}
export interface PredictionBand { f: Band; measured: number | null; predicted: number | null; alpha: number | null; missingAlpha: boolean; coveredExceedsMeasured?: boolean; existingA: number | null; addedA: number | null; totalA: number | null; items: { addedA: number | null; coveredKnown: boolean; coveredAlpha: number | null }[] }
export interface Prediction {
  model: string; bands: PredictionBand[]; headline: (PredictionBand & { f: Band; predicted: number; measured: number; existingA: number; totalA: number }) | null;
  checks: { id: string; text: string; bands: number[] }[]; average: Average; measured: number; predicted: number; policy: Policy;
  verdict?: Verdict; verdictRows?: BandRow[]; predictedStatus?: Status | null; plan: { items: PlanItem[]; complete: PlanItem[]; areaM2: number };
  items: (PlanItem & { addedA: number | null; alonePredicted: number | null })[];
}

export interface Derive {
  geometry(p: Project | null): Geometry | null; target(p: Project | null): ValidTarget | null; measured(p: Project | null): Result | null;
  room(p: Project | null): RoomResult | null; positions(p: Project): Positions; positionOf(r: unknown): string; policy(p: Project | null): Policy;
  summaryRT60(p: Project | null): Average; averageRT60(p: Project | null): Average; midAverageRT60(p: Project | null): Average;
  noiseChange(p: Project): number | null; assessment(p: Project | null): Assessment | null; soundGroups(p: Project): SoundGroup[] | null;
  prediction(p: Project): Prediction | null; predictionMissing(p: Project): string | null; predictionStarted(p: Project, current: string): boolean; planProblem(p: Project): string | null;
  treatmentPlan(p: Project): { items: PlanItem[]; complete: PlanItem[]; incomplete: PlanItem[]; areaM2: number }; treatmentItems(p: Project): PlanItem[];
  treatmentSelection(p: Project): PlanItem | null; treatmentForTarget(p: Project, item?: PlanItem): { areaM2: number; units: number | null; itemId: string; withOthers: boolean; meetsBands: boolean; above: number[]; below: number[] } | null;
  autoAmount(p: Project, item: PlanItem): { mode: string; quantity: number | null; areaM2: number; capped: boolean; availableM2: number | null; needed: boolean; goal: { areaM2: number; meetsBands: boolean; above: number[]; below: number[] } | null } | null;
  isAutoAmount(p: Project, item: PlanItem): boolean; recommendConfig(p: Project, item: PlanItem): string | null; summaryBands(p: Project): number[];
  treatmentRequired(p: Project): boolean; noTreatment(p: Project): boolean; absorptionGap(p: Project): number | null; coverage(p: Project, placement?: string): { placement: string; label: string; surfaceM2: number; areaM2: number; fraction: number; count: number }[];
  summary(p: Project): Summary; laterTakes(p: Project): { kind: 'unprocessed' | 'invalid' | 'failed'; takenAt: string; reason: string | null }[];
  takeComparison(p: Project): { rows: TakeRow[]; spread: number | null }; diagnostics(p: Project): unknown; coveredBy(p: Project, item: PlanItem): { alpha: Record<number, number | null>; known: boolean } | null;
}
export interface TakeRow { status: 'current' | 'in-use' | 'superseded' | 'invalid' | 'failed'; takenAt: string; position: string | null; levelDb: number; rt60: number | null; method: string | null; average?: number | null; averageBands?: string; decayDb?: number | null; t20?: number | null; t30?: number | null; r2?: number | null; bandsValid?: number; bandsTotal?: number; distortion?: Distortion | null; reason?: string | null }

/* ---------- formatting and shared text helpers (js/core/util.js, js/ui/live-ui.js) ---------- */
export interface Fmt {
  s(x: number | null | undefined, d?: number): string; signedS(x: number | null | undefined, d?: number): string; m(x: number | null | undefined): string;
  m2(x: number | null | undefined, d?: number): string; m3(x: number | null | undefined, d?: number): string; db(x: number | null | undefined, d?: number): string;
  dbfs(x: number | null | undefined, d?: number): string; hz(f: number): string; hzShort(f: number): string; list(xs: string[]): string; hzList(fs: number[]): string; pct(x: number | null | undefined, d?: number): string;
  dims(r: { L: number | null; W: number | null; H: number | null } | null): string; ago(iso: string): string; when(iso: string): string;
}
export interface Util { esc(s: unknown): string; isNum(x: unknown): x is number; num(v: unknown): number | null; int(v: unknown): number | null; clamp(x: number, a: number, b: number): number; trimNum(x: unknown, d?: number): string; fmt: Fmt; ICONS: Record<string, string>; icon(name: string, size?: number, sw?: number): string; getPath(o: unknown, path: string): unknown }
export interface UiHelpers {
  tone: Record<string, Tone>; bad: Record<string, string>; MAX_PANELS: number; dbfs(x: number | null | undefined, d?: number): string; levelDb(db: number | null | undefined, withDefault?: boolean): string;
  distortionText(d: Distortion | null | undefined): string; distortionNote(d: Distortion | null | undefined): string | null; timeOf(iso: string): string; inputSettings(st: unknown): string;
  accessHelp(permission: string): string; noiseWord(st: string): string; panelArea(a: number): string; amountText(sel: PlanItem): string; planText(items: PlanItem[]): string; confirmingDelete(id: string): boolean;
  [k: string]: unknown;
}

export interface AMRoot {
  util: Util; workflow: Workflow; store: Store; derive: Derive; ui: UiHelpers;
  brand: { name: string; tagline: string; descriptor: string; icon: string; wordmark: string; links: { catalogue: string; configurator: string } };
  demo: { BANDS: Band[]; REFERENCE_BAND: Band; POSITIONS: { id: string; name: string; detail: string; x: number; y: number }[]; DEVICE_KINDS: Record<string, { name: string; noun: string; [k: string]: unknown }>; [k: string]: unknown };
  services: { rt60Average: { SHORT: string; LABEL: string; METHOD: string; describe(a: Average): string; of(r: unknown): Average; ofBands(r: unknown, set: number[]): Average; eligible(b: unknown): boolean }; explain: { forStage(id: string, p: Project | null): { title: string; paragraphs: string[] } }; [k: string]: unknown };
  charts: { hydrate(root: ParentNode): void; BUILDERS: Record<string, (spec: unknown, width: number) => string> };
  guide: { html(id: string): string; sync(root: HTMLElement, sheet: UiState['sheet']): void; poster(id: string): string };
  guides: Record<string, { title: string; lengthLabel: string; closeLabel?: string; [k: string]: unknown }>;
  live: { state: { mic: { status: string; [k: string]: unknown }; take: unknown; noise: unknown }; kindOf(p: Project): string; [k: string]: unknown };
  analysis: { CRITERIA: { decay: { directAllowanceDb: number; [k: string]: unknown }; [k: string]: unknown }; [k: string]: unknown };
  reportGate?: { card(p: Project, opts: { about: string; reportBusy: boolean }): string; [k: string]: unknown };
  app?: { render(): void };
  [k: string]: unknown;
}

declare global {
  interface Window { AM: AMRoot }
}

export const AM = (): AMRoot => window.AM;
