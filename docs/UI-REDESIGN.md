# Interface redesign: React + TypeScript (2026-10-16)

The whole interface was rebuilt in React + TypeScript with a new visual system. The measurement, calculations,
averaging, target, treatment, prediction, report, report form, API and database are unchanged: they are the same
scripts in `js/` and `server/`, and every test suite passes against the new interface.

## What changed

- **Interface code** (`src/`, built by `npm run build` into `js/app/univicoustic-ui.js`, which `index.html` loads last):
  the shell (rail, context bar, stage head, action bar, panels, toast) and one typed screen per step, built from a
  component kit (`src/ui/kit.tsx`) and shared blocks (`src/ui/blocks.tsx`).
- **Stage files** (`js/stages/*.js`) keep everything that is not markup: checks (`canContinue`), actions, developer-tool
  fills, and the live wiring (`mount` / `leave`: microphone, scope, level meter, processing job, report form). Helpers a
  screen needs to read are exposed on the stage as `model` (for example `measure.model.startBlocker`). `js/stages/home.js`
  held only markup and is gone; Home is `src/screens/Home.tsx`.
- **`js/app.js`** is replaced by `src/main.tsx` (render loop) and `src/events.ts` (the same document-level event wiring:
  `data-action`, `data-bind`, `data-change-action`, `data-uibind`, tooltips, details, the 450 ms action-bar guard).
- **`js/ui/components.js` / `live-ui.js`** keep only wording helpers and the live level meter; their HTML builders moved
  into the kit. `AM.ui.pill`, `averageSummary`, `projectCard`, `historyList` and `noiseBody` still return HTML strings
  (rendered from the same React components) for code that reads them as text.
- **`js/services/report-gate.js`**: its card markup became `view(project)`, a read-only description of the form's state
  that the Final Result screen draws. Validation, sending, receipts and unlocking are unchanged.
- **`css/app.css`**: rewritten as the new design system (light and dark), same file name so every page and test that
  links it still works.
- **Build and deploy config**: `package.json` / `package-lock.json` (React 19.3.0, TypeScript 5.9.3, Vite 8.3.1, pinned),
  `tsconfig.json` (strict), `vite.config.ts`; `vercel.json` now runs `npm ci` and `npm run build` before publishing
  (`src/` and `node_modules/` excluded from the functions). The built script is kept in the repository so the Python
  server and the test pages run without Node.js.

## How the React shell stays equivalent

- `AM.app.render()` is synchronous (React `flushSync`), as before: tests and the live code call it and read the DOM
  straight after. A render asked for during a render runs right after it.
- Each stage's `view(ctx)` still returns `{ body, primary }`: the screen is drawn into a detached element and read back
  as HTML, so the text-level tests read the same screens the app shows.
- Inputs are uncontrolled and follow the stored value whenever they are not being typed in; text that is not a number
  stays in its field with its message (`ui.bad`), as before.
- Elements updated directly by live code (progress, level meter, the report form's state pill, character count) are
  drawn so React never fights those updates. Charts stay with `js/ui/charts.js` (`data-chart` placeholders).
- Element ids, `data-*` hooks and the class names tests read (`stat-v`, `kv-r`, `tbl`, `details.tech`, `data-watch`,
  `.surf`, `.fact` …) are kept.

## Design system

A measuring instrument: a dark graphite rail drawing the workflow as a signal chain (lit teal where steps are done, the
red `//` of the wordmark on the step you are on); a cool light workspace with white, hairline-bordered panels; readouts
in IBM Plex Mono with small units; tracked capitals for labels. One accent, teal, for measured data and acoustic
information; violet only for predicted values; the target a neutral wash with a dashed edge; green / amber / crimson only
for status. The context bar shows the project's readouts (room, target, measured, predicted). Responsive at desktop,
tablet (rail as a drawer below 900 px) and phone; light and dark themes; reduced motion respected.

## Simpler by default (2026-10-16, after review)

Technical records lead with plain facts and keep the full detail one click away ("Show all recording details"):

- **Results, Latest take**: where (position, how many measured), with what (device), when, three recording checks
  worded as the full record words them (continuity, input level, signal above background) and one line on calibration.
  The 18-row record, the calibration note and Copy diagnostics are unchanged inside the disclosure.
- **Measure, Latest take**: position, sweep level and signal above background, with any warning still shown; the
  12-row record inside the disclosure. No pass/fail is claimed there: Processing has not checked the take yet.
- **Results, warnings**: a warning that is the same at several positions is said once ("P1 and P2: …"). The stored
  warnings and the PDF report are unchanged.

## Take deck and Home sound field (2026-10-16, on request)

- **Results, takes as a deck** (`TakeDeck` in `src/screens/Results.tsx`): one card per take in the project, the current
  measurement first, then every other take newest first (the same takes as "Takes in this project"). Swipe on a phone or
  trackpad, drag with the mouse, use the arrows, the dots or the arrow keys. A valid take shows where, device, when, its
  own average and RT60 at 1 kHz, and its recording checks; a take that was not valid shows its reason; a replaced take
  shows the figures kept for it. Each card's full record is behind "Show all recording details".
- **Home, 3D sound field** (`src/ui/SoundField.tsx`): a wireframe surface in perspective behind the title, with sound
  radiating from a source (the red dot) and an impulse that spreads and dies away every few seconds. Canvas only, no
  library; decorative, never a measurement. It pauses off screen and in hidden tabs, follows the pointer slightly, and
  is still for reduced motion. The text side of the panel is kept clear by a fade.

## Brand orange (2026-10-16, on request)

The orange of the wordmark's tagline now carries the brand through the app, as the logo pairs black with orange: primary
actions (a deeper step, `--action` #D2401F, so white text reads at 4.7:1), chosen options (chips, segmented choices,
configurations, catalogue rows, checkboxes, the active plan row, the take deck's dots), panel and phase icons, the
current step in the rail, a 2 px rule across the top of the workspace, the second line of the Home title and, in the
3D sound field, the impulse ring and a warm glow. Teal stays for measured data and measurement information (positions,
live signal), violet for predicted values, amber and crimson for status, so no meaning moved.

## "What is RT60?" explainer (2026-10-16, on request)

A one-minute animated explainer on the Target step, built on the app's own guide player (js/ui/guide.js, the same as
"How to measure"): seven chapters with captions, chapter jumps and a written transcript ("Read the steps instead").
Sound lingering (a clap and its reflections, drawn as mirror-image sources), RT60 defined on a level-against-time graph
(the fall by 60 dB), too long (words overlapping) and short (words clear), the right value by room use (room types in
their usual order, no values), what changes it (hard surfaces and size make it longer, panels shorter), and how the
app uses it. It opens from a slim "New to RT60?" strip above the recommendation and plays in the side panel, so the page
layout is unchanged. Content: `AM.guides.rt60` in js/data/guides.js; scenes `rtWhat` … `rtInApp`. To use a filmed video
instead, set its `video.src`; the chapters then become jump points.

## Walkthrough: "How the app works" (2026-10-16, on request)

A two-minute walkthrough of the workflow, on the same guide player: the steps in order and what you do at each, not
every feature. Twelve chapters: the workflow (Define, Measure, Analyse, Improve, Summary), then one chapter per step
(Room Setup, Target, Measurement Setup, Measure, Processing, Results, Assessment, Treatment, Predicted Result, Final
Result), then a closing chapter. Each step is drawn as a sketch of the app with the workflow rail on the left showing
that step, two plain captions per chapter. It opens from "Quick help · How the app works" in the Home top bar (the
crumb now reads "Home" there instead of repeating the brand); a second "Watch the walkthrough" link beside "How a
measurement works" was removed on 21 October as a repeat of it. It only explains; it never starts or records a measurement. Content: `AM.guides.tour` in
js/data/guides.js; scenes `tourIntro` … `tourOutro` in js/ui/guide.js.

## Tour of the screen (2026-10-16, on request)

A spotlight tour of the real interface (src/shell/Tour.tsx), alongside the walkthrough video (which is unchanged). The
page dims, one control at a time is ringed in the brand orange, and a card beside it says what it is for: Next, Back,
Skip, the arrow keys, Escape. There are two tours, chosen by where you are:

- **Home** (up to 5 stops): New Measurement, the ten steps, your projects, Measurement History, Quick help.
- **A step** (6 stops): the ten steps, what this step is for, Explain this step, the project readouts, the main button,
  Help.

The words come from the workflow and from the screen itself, so the tour cannot disagree with the interface: "You are on
step 3, Measurement Setup. 2 of 10 done", "Measured fills in once a measurement has been processed, in step 5", and on
the main button either "Ready: Continue to Target" or the step's own reason it cannot continue yet ("Not yet: Enter a
room name."). A stop with nothing on screen is left out (no projects yet, the step list folded away on a phone, where
its menu button is shown instead). On a phone the card is a sheet at the bottom, or at the top when the control is low.

**The option to take it.** Once on a device, a small card offers it (Take the tour / Not now / or watch the 2-minute
video): on Home for the Home tour, and on the first step opened for the step tour (also after the Home tour). Each card
appears once, answered or not; "Not now" stops both and says where the tour lives. It is offered once more only after 30
days without opening the app (kept in this browser: which cards were shown, "Not now", the last opening; until 21
October it was offered on every visit, which kept popping up). It is never offered, and cannot start, while a
measurement is running.

**Where it lives afterwards.** Home: "Take the tour" beside the Quick help video in the top bar. Every step: a Help menu
in the top bar with the tour of this screen, the How the app works video and Explain this step.

While the tour runs the page behind it is inert (as behind a panel), so it only points and never changes anything.
Nothing about the tour is stored (an earlier version's `acoustic-measurement-prototype:tour` entry is cleared).

## Home on a first visit, logo to Home, sound field (2026-10-16, on request)

- With nothing saved in this browser, New Measurement sits in the hero, the first thing seen, with "No measurements yet"
  as one line under it (it was a panel below the fold). With saved projects Home is unchanged.
- The logo and name at the top of the rail lead to Home (the same as the rail's Home step).
- The sound field behind the Home title is drawn a little darker (higher line opacity), still in the measured teal.

## Band charts as small line charts (2026-10-16, on request)

The RT60-by-band chart on Results and the Band by band chart on Predicted Result are drawn as small line charts: one
round open marker per band, joined by a line, at most 760 px wide and about 190-200 px high. Same values, hover
tooltips, target range and preferred line as before (charts.js `bands` with `line: true`). A band without a value
leaves a gap in the line and a dash, never a point at zero. With measured and predicted together, the measured line is
drawn wider underneath, so where they are the same both still show. The other band charts are unchanged.

## Verified (2026-10-16)

- `npm run build` (`tsc --noEmit` strict + Vite): no errors; bundle 412 kB (121 kB gzipped).
- Test pages, against the built interface: calculations 32/32, validation 72/72, dsp 64/64, room-surfaces 52/52,
  rt60-average 60/60, multi-position 44/44 (parts A and B), audio-config 52/52 (A and B), rt60-responsiveness 27/27
  (A and B), sweep-level 14/14, mobile study done; server `tests/report_submission_test.py` 42 OK. One responsiveness
  run lost take 1 to an audio dropout that the app's own integrity check rejected (as designed); the rerun passed.
- Screenshots of every step at 1440, 820 and 390 px and in dark mode, from a real two-position session through the
  test harness's virtual room: no horizontal overflow at any width.

## Limits

- The look was checked in Chrome only (headless and the app's browser pane), not on physical phones or in Safari or
  Firefox; nothing here is a claim of physical-device validation.
- Node.js is needed only to change the interface (`npm ci`, `npm run build`).

## Narrated videos (21 October 2026, on request)

Every video (How the app works, How to measure, How to measure the room, What is RT60?) now has a voice. The captions
were rewritten as a spoken script (short sentences, numbers said as words, a warm second person, a clear next step at
the end, nothing the app does not do), and the player speaks each line as it appears, so the subtitles are exactly what
is said. Each chapter lasts as long as its lines take to say (js/data/guides.js, timed()), and the picture waits at the
end of a line until the voice has finished, so a slower voice is never cut off. Pausing or seeking stops the voice;
playing again repeats the current line.

The voice is the device's own speech (the browser's Web Speech API, no files and no network of the app's own). There is
one narrator, chosen by one fixed rule on every device (js/ui/guide.js, NARRATOR): a warm, clear female English voice,
Indian English first (Microsoft Neerja, natural, in Edge), then British, then American, natural voices before standard
ones; no choice of voice is offered, only a sound button, remembered in the browser. A pronunciation list (SAY_AS) spells
words for the ear (RT60 as "R T sixty", PDF as "P D F"). Devices differ in the voices they have, so the narrator is
the closest each one offers: the same voice on every device needs recorded audio. Without speech the videos play with
captions only. Lengths are now 1½ to 2½ minutes.
