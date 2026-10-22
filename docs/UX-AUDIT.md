# Acoustic Measurement app: UX audit

Phase 1 (audit) and Phase 2 (fixes) of the full application review. UX-001 to UX-055 were found by walking the app end to end before any change was made; UX-056 was found while verifying the fixes.

## Summary

| Severity | Found |
|---|---|
| Critical | 0 |
| High | 5 |
| Medium | 23 |
| Low | 28 |
| **Total** | **56** |

## Issue list

| ID | Severity | Screen | Category | Issue | Status |
|---|---|---|---|---|---|
| UX-001 | High | Measurement Setup | Functional | A background-noise check or microphone-access request started in one project is saved into whichever project is open when it finishes. | Fixed |
| UX-002 | High | Room Setup → Target and later steps | Functional | After the room is edited, the recommended target keeps its old value until the Target step is opened again. Other screens combine the new room with the old target. | Fixed |
| UX-003 | High | Treatment, Predicted Result | Validation | A product with 0 panels (or 0 m²) is accepted, and the project can be carried through Prediction and Final Result with it. | Fixed |
| UX-004 | High | Acoustic Measurement | UX | The step's main action, “Start measurement”, is below the fold on a laptop screen, while the visible primary button (“Process recording”) is disabled. | Fixed |
| UX-005 | High | Processing → Acoustic Measurement | UX | After an insufficient measurement, “Repeat measurement” returns to an unchanged Measurement screen with no explanation of what went wrong or what to change. Repeating gives the same failure. | Fixed |
| UX-006 | Medium | All steps (review flags) | Navigation | Changing anything in a finished step flags every later finished step for review, including steps that do not depend on it. | Fixed |
| UX-007 | Medium | Global | Navigation | Refreshing the browser always returns to Home, even in the middle of a step. | Fixed |
| UX-008 | Medium | Target / Ideal RT60 | UI | The RT60 scale under the target editor always ends at 2.0 s, so longer targets are cut off. | Fixed |
| UX-009 | Medium | Target / Ideal RT60 | UX | Target values can only be changed in 0.05 s clicks; a value cannot be typed. | Fixed |
| UX-010 | Medium | Room Setup (and number fields elsewhere) | Validation | Text that is not a number (e.g. “abc”) in a number field is silently discarded: no error is shown, and the text vanishes on the next update. | Fixed |
| UX-011 | Medium | Room Setup | Validation | Typical occupancy accepts negative and unrealistic numbers. | Fixed |
| UX-012 | Medium | Treatment, Predicted Result | Validation | A negative treatment area is accepted without an error and silently used as 0. | Fixed |
| UX-013 | Medium | Treatment, Predicted Result | Validation | The panel quantity field accepts text such as “abc”: the quantity becomes empty with no error. | Fixed |
| UX-014 | Medium | Measurement Setup, Acoustic Measurement, Results | Content | Measuring positions are written for a conference room (“Centre of the table”, “Presenter end”, “Rear seat”) whatever the room type. | Fixed |
| UX-015 | Medium | Home, Measurement History | Functional | Projects cannot be deleted. | Fixed |
| UX-016 | Medium | Home | UX | Every click on New Measurement creates another empty “Untitled room” project, even when an untouched one already exists. | Fixed |
| UX-017 | Medium | Final Result | UI | “Measure after treatment” is a permanently disabled button (with a “Later stage” badge). | Fixed |
| UX-018 | Medium | Final Result | Functional | The final result cannot be printed or saved as a document. | Fixed |
| UX-019 | Medium | Final Result | UI | The “Project complete” badge is shown while earlier steps are flagged for review. | Fixed |
| UX-020 | Medium | Global | UI | The orange accent means four different things: primary action, current step, “above target / needs treatment” status, and the evaluation range in charts. | Fixed |
| UX-021 | Medium | Global | UI | Two competing primary button styles: black (Continue) and orange (New Measurement, Start measurement, Close video). | Fixed |
| UX-022 | Medium | Global | Accessibility | Small text in the “faint” colour has 2.3–2.7:1 contrast (light mode): “Required” labels, sidebar phase headings, locked step names, placeholders. | Fixed |
| UX-023 | Medium | Global | Accessibility | White text on the orange buttons has 3.5:1 contrast (3.1:1 in dark mode). | Fixed |
| UX-024 | Medium | Side panels (History, Explain, Video, Developer tools) | Accessibility | When a panel closes, keyboard focus is lost (goes to the page body). While a panel is open, the page behind it stays focusable. | Fixed |
| UX-025 | Medium | Global (narrow screens) | Responsive | Below 640 px the reason Continue is unavailable (“Enter the room length.”) is hidden. Users only learn it by tapping the button. | Fixed |
| UX-026 | Medium | Treatment (narrow screens) | Responsive | The treatment plan table is about 800 px wide inside a 311 px column, so the quantity controls and results are off-screen. | Fixed |
| UX-027 | Medium | Processing | Content | The advice for an insufficient measurement tells the user to “raise the signal level”, but the app has no signal-level control. | Fixed |
| UX-028 | Medium | Explain this step (all steps) | Content | Every explanation is labelled “Assistant preview” and ends with “In the full app, an assistant will explain your own project data here…”. | Fixed |
| UX-029 | Low | Room Setup | Content | Surfaces note: “Surfaces are recorded for context in this prototype. A later stage will use them…”. | Fixed |
| UX-030 | Low | Measurement Setup | Content | Microphone access card: “This prototype never opens your real microphone.” | Fixed |
| UX-031 | Low | Acoustic Measurement | Content | The room-condition control is labelled “Prototype · simulated room condition” with no explanation of what it does. | Fixed |
| UX-032 | Low | Processing | Content | “Simulated engine. The real signal-processing engine will replace it behind the same interface.” | Fixed |
| UX-033 | Low | Predicted Result | Content | “Not modelled yet: … The full prediction engine replaces this model later.” | Fixed |
| UX-034 | Low | Treatment | Content | Placement hint: “Used to check coverage. Placement guidance comes later.” | Fixed |
| UX-035 | Low | Explain this step (Room Setup, Final Result) | Content | Explanations say “In this prototype…” and “That step is planned for a later stage.” | Fixed |
| UX-036 | Low | Measurement Setup | UX | Background noise can be checked before microphone access is allowed. | Fixed |
| UX-037 | Low | Measurement Setup | UI | The Microphone card always shows a green “Connected” status, even before access is allowed. | Fixed |
| UX-038 | Low | Sidebar | UI | Progress reads “10 of 10 steps complete · 100%” while steps are flagged for review. | Fixed |
| UX-039 | Low | Target / Ideal RT60 | UI | Two explanatory cards come first and push the target editor below the fold (y = 763 px at 800 px tall). | Fixed |
| UX-040 | Low | Mobile workflow menu | Accessibility | The mobile workflow drawer has no close button and does not move focus into itself. | Fixed |
| UX-041 | Low | Results, Home (narrow screens) | Responsive | Small touch targets: band chips 29 px tall, project-name links 24 px tall. | Fixed |
| UX-042 | Low | Acoustic Assessment | Content | The sentence “x of 6 bands are above the range” has the 6 written into the text. | Fixed |
| UX-043 | Low | Final Result | Content | Grammar: “12.5 m² of … are predicted to bring…”. | Fixed |
| UX-044 | Low | Global | Content | Inconsistent capitalisation and naming of actions: “Ready to Measure”, “Play Test Signal”, “Quality Check”, “Start New Measurement” (history) vs “New Measurement” (Home). | Fixed |
| UX-045 | Low | Room Setup | Content | Typical occupancy is not marked optional and does not say what it changes. | Fixed |
| UX-046 | Low | Room Setup | Accessibility | Occupancy (a whole number) opens a decimal keypad on phones. | Fixed |
| UX-047 | Low | Treatment | UX | Removing a product from the plan happens at once, with no confirmation or undo. | Fixed |
| UX-048 | Low | Acoustic Measurement | UX | Leaving the step during a take cancels it silently. | Fixed |
| UX-049 | Low | Global | Navigation | Nothing tells the user that work is saved automatically. | Fixed |
| UX-050 | Low | Predicted Result | Content | “Improves 1000 Hz by 0.31 s” is unclear. | Fixed |
| UX-051 | Low | Processing | Content | If there is no recording, Continue says “Processing is still running.” | Fixed |
| UX-052 | Low | Sidebar | UI | “Developer tools” (demo-data shortcuts, reset) are visible to every user. | Fixed |
| UX-053 | Low | Home | UI | On Home, the context bar shows the open project's name and values, as if Home belonged to that project. | Fixed |
| UX-054 | Low | All steps | UI | “Explain this step” is a borderless ghost button and reads as plain text. | Fixed |
| UX-055 | Low | Treatment, Predicted Result, Final Result | Content | Product names appear in capitals (“UNIZEN ACOUSTIC PANEL”) because that is how the source lists them. | Not changed |
| UX-056 | Low | Treatment | Accessibility | Found during Phase 2 testing: the plan table header “α at 1000 Hz” is shown in capitals, which turns α into the capital Greek letter Α. It reads as “A AT 1000 HZ”. | Fixed |

## Details

### UX-001 · High · Measurement Setup

- **Category:** Functional
- **Problem:** A background-noise check or microphone-access request started in one project is saved into whichever project is open when it finishes.
- **Steps to reproduce:** Open a project at Measurement Setup. Click “Check background noise”. Within 1.5 s open Measurement History and start or open another project. Wait 2 s.
- **Expected:** The reading belongs to the project it was taken for, or is discarded if the user left.
- **Actual:** The other project receives the reading (tested: a new project at Room Setup got “34 dB(A), Quiet”). The original project has none. The same applies to “Allow microphone access” (0.7 s).
- **User impact:** One project's data appears in another project. A finished project can also be flagged for review by a reading it never took.
- **Recommended solution:** Remember which project started the check and apply the result only to that project while it is still open; otherwise discard it. Track the busy state per project.
- **Status:** Fixed. Each check remembers the project that started it. The result is applied only to that project while it is still open, otherwise discarded; the busy state is per project. Tested: switching projects during a noise check leaves both projects unchanged.

### UX-002 · High · Room Setup → Target and later steps

- **Category:** Functional
- **Problem:** After the room is edited, the recommended target keeps its old value until the Target step is opened again. Other screens combine the new room with the old target.
- **Steps to reproduce:** Finish a project (30 × 20 × 12 m worship room). Go back to Room Setup and change the height to 10 m. Open Final Result, Assessment or Treatment without opening Target.
- **Expected:** A target that follows the recommendation updates as soon as the room changes, everywhere at once.
- **Actual:** Target stays at 1.48 s (recommendation is now 1.54 s). Final Result says the plan reaches 1.32 s “inside the target range” using the new volume and the old target; the context bar shows 1.48 s.
- **User impact:** Stale and inconsistent results on Treatment, Predicted Result and Final Result until the user happens to reopen Target.
- **Recommended solution:** When room data changes, re-apply the recommendation immediately to a target whose source is “recommended” (custom targets stay as the user set them), then flag the dependent steps for review.
- **Status:** Fixed. The Target step has a sync rule that the store runs on every change: an unadjusted target follows the recommendation as soon as the room changes. Custom targets are kept. Tested: height 3.0 → 3.5 m updated 0.48 → 0.50 s everywhere at once.

### UX-003 · High · Treatment, Predicted Result

- **Category:** Validation
- **Problem:** A product with 0 panels (or 0 m²) is accepted, and the project can be carried through Prediction and Final Result with it.
- **Steps to reproduce:** Treatment: add a product and configuration, set quantity to 0, click “Predict result”, then “View final result”.
- **Expected:** Continue is blocked until every product in the plan has an amount, with a clear message.
- **Actual:** Prediction shows “No treatment area yet, so the prediction equals the measured value.” Final Result can be finished with a 0-panel treatment.
- **User impact:** A finished project can record a treatment that does nothing. Inputs are accepted but not used meaningfully.
- **Recommended solution:** Treat an item with no amount like an item with no configuration: block Continue on Treatment, Predicted Result and Final Result with “Set an amount for #1 …, or remove it.”
- **Status:** Fixed. New plan check (derive.planProblem) blocks Continue on Treatment, Predicted Result and Final Result when a product has no amount: “Set how many panels of #1 …, or remove it.”

### UX-004 · High · Acoustic Measurement

- **Category:** UX
- **Problem:** The step's main action, “Start measurement”, is below the fold on a laptop screen, while the visible primary button (“Process recording”) is disabled.
- **Steps to reproduce:** Open Acoustic Measurement at 1280 × 800.
- **Expected:** The action that starts the measurement is visible without scrolling.
- **Actual:** “Start measurement” sits at y = 998 px; the action bar is at 731 px and shows a disabled “Process recording”.
- **User impact:** Users must hunt for the core action of the core step.
- **Recommended solution:** Make the action bar's primary button “Start measurement” until a recording exists, then “Process recording”. Keep the in-panel button.
- **Status:** Fixed. The action bar's primary button is “● Start measurement” until a recording exists, then “Process recording”. The in-panel button stays.

### UX-005 · High · Processing → Acoustic Measurement

- **Category:** UX
- **Problem:** After an insufficient measurement, “Repeat measurement” returns to an unchanged Measurement screen with no explanation of what went wrong or what to change. Repeating gives the same failure.
- **Steps to reproduce:** Set the room condition to Insufficient, measure, process. Click “Repeat measurement”.
- **Expected:** The Measurement screen says the last take had too little decay above the noise and lists what to change before measuring again.
- **Actual:** The screen reads “Ready to measure” with no reference to the failure; the room condition is still Insufficient, so the next take fails the same way.
- **User impact:** Users can loop through failed measurements without knowing how to recover.
- **Recommended solution:** Keep a short record of the failed attempt with the project and show a warning on the Measurement screen with concrete steps (and, in this simulated version, which room condition to choose). Clear it after a good take.
- **Status:** Fixed. Repeat measurement keeps a short record of the failed take. The Measurement step shows why it failed (e.g. 32 dB of decay, 35 dB needed), what to change, and, while the simulated condition is Insufficient, which condition to choose. Cleared by the next take.

### UX-006 · Medium · All steps (review flags)

- **Category:** Navigation
- **Problem:** Changing anything in a finished step flags every later finished step for review, including steps that do not depend on it.
- **Steps to reproduce:** Finish a project. Change the room height in Room Setup.
- **Expected:** Only steps that use room data are flagged: Target, Assessment, Treatment, Predicted Result, Final Result.
- **Actual:** 9 steps are flagged, including Measurement Setup, Acoustic Measurement, Processing and Results, which do not use the room size. Each must be re-opened and continued.
- **User impact:** Unnecessary rework; users are asked to re-confirm a measurement that did not change.
- **Recommended solution:** Give each step a list of the steps it depends on and flag only finished steps that depend on the changed one, directly or through another step.
- **Status:** Fixed. Each step lists the steps it depends on; only finished dependants are flagged. Changing the room height now flags 5 steps (Target, Assessment, Treatment, Predicted Result, Final Result) instead of 9.

### UX-007 · Medium · Global

- **Category:** Navigation
- **Problem:** Refreshing the browser always returns to Home, even in the middle of a step.
- **Steps to reproduce:** Open Acoustic Assessment. Press F5.
- **Expected:** A refresh keeps the user on the same step. A newly opened browser can start on Home.
- **Actual:** The app opens on Home; the user must find the project and click Open project.
- **User impact:** Loss of place; users may think their work was lost.
- **Recommended solution:** Remember the current step for this browser tab (sessionStorage) and restore it after a reload. A new tab or browser session still starts on Home.
- **Status:** Fixed. The step on screen is kept in sessionStorage for the tab; a reload returns to it. A new tab or browser session still opens on Home.

### UX-008 · Medium · Target / Ideal RT60

- **Category:** UI
- **Problem:** The RT60 scale under the target editor always ends at 2.0 s, so longer targets are cut off.
- **Steps to reproduce:** Room type Place of worship, use “Services with music and singing” (target 1.34–2.22 s), or raise the upper limit above 2 s.
- **Expected:** The scale extends to show the whole target range.
- **Actual:** The range is clipped at 2.0 s (tested with an upper limit of 2.65 s).
- **User impact:** The visual misrepresents the target for halls, churches and music rooms.
- **Recommended solution:** Size the scale from the target: at least 2 s, otherwise the upper limit plus margin, rounded to 0.5 s.
- **Status:** Fixed. The scale is sized from the target (at least 0–2 s, otherwise the upper limit plus margin). It also gained 0.1 s graduations.

### UX-009 · Medium · Target / Ideal RT60

- **Category:** UX
- **Problem:** Target values can only be changed in 0.05 s clicks; a value cannot be typed.
- **Steps to reproduce:** Change the upper limit from 1.85 s to 2.65 s.
- **Expected:** Type the value, or use the steppers for small changes.
- **Actual:** 16 clicks are needed. Values also drift to uneven numbers (0.48 → 0.53 → 0.58).
- **User impact:** Slow and fiddly for consultants who have a project-specific criterion.
- **Recommended solution:** Make the value in each stepper an editable field (seconds, 0.10–4.00), validated on Enter or when leaving the field.
- **Status:** Fixed. The value in each target stepper is an editable field (0.10–4.00 s), applied on Enter or when leaving the field. Invalid text stays with a red field and a message.

### UX-010 · Medium · Room Setup (and number fields elsewhere)

- **Category:** Validation
- **Problem:** Text that is not a number (e.g. “abc”) in a number field is silently discarded: no error is shown, and the text vanishes on the next update.
- **Steps to reproduce:** Type “abc” into Length, then change the Industry.
- **Expected:** An inline error “Enter a number” until it is corrected.
- **Actual:** No inline error; the field empties after the next change. Only the footer says “Enter the room length.”
- **User impact:** Users do not learn why their entry was ignored.
- **Recommended solution:** Keep the typed text while it is not a number, mark the field invalid and show “Enter a number, e.g. 4.5”.
- **Status:** Fixed. Text that is not a number is kept in the field with “Enter a number, e.g. 4.5” until corrected, also after other changes re-draw the page.

### UX-011 · Medium · Room Setup

- **Category:** Validation
- **Problem:** Typical occupancy accepts negative and unrealistic numbers.
- **Steps to reproduce:** Enter −5, then 99999 in Typical occupancy.
- **Expected:** Negative values are rejected; implausible densities are flagged.
- **Actual:** Room summary shows “Occupancy −5 people”; 99999 people is accepted for any room.
- **User impact:** Invalid data in the project and in the target calculation inputs (the calculation ignores negatives and caps the people allowance, so the summary and the calculation disagree).
- **Recommended solution:** Validate occupancy: 0 or more, and at most 2 people per m² of floor. Show an inline error and block Continue until it is fixed.
- **Status:** Fixed. Occupancy must be 0 or more and at most 2 people per m² of floor; inline error and Continue blocked. The summary shows “—” for invalid values.

### UX-012 · Medium · Treatment, Predicted Result

- **Category:** Validation
- **Problem:** A negative treatment area is accepted without an error and silently used as 0.
- **Steps to reproduce:** Treatment: choose “Enter the treatment area directly” and type −20.
- **Expected:** Inline error; Continue blocked.
- **Actual:** Field shows −20, “Treatment area 0.0 m²”, no error, Continue enabled.
- **User impact:** What the user sees in the field is not what is used.
- **Recommended solution:** Inline error for negative areas; the plan check from UX-003 blocks Continue.
- **Status:** Fixed. Negative areas show “Enter 0 m² or more” (and a red field in the plan table); Continue is blocked by the plan check.

### UX-013 · Medium · Treatment, Predicted Result

- **Category:** Validation
- **Problem:** The panel quantity field accepts text such as “abc”: the quantity becomes empty with no error.
- **Steps to reproduce:** Type “abc” into the quantity of a product.
- **Expected:** Inline error and Continue blocked.
- **Actual:** Field shows “abc”, quantity is stored as empty, no message.
- **User impact:** Silent invalid state in the treatment plan.
- **Recommended solution:** Same handling as UX-010 for the compact quantity and area fields.
- **Status:** Fixed. Non-numeric quantities keep the text with a red field and “Enter a whole number of panels”; Continue is blocked.

### UX-014 · Medium · Measurement Setup, Acoustic Measurement, Results

- **Category:** Content
- **Problem:** Measuring positions are written for a conference room (“Centre of the table”, “Presenter end”, “Rear seat”) whatever the room type.
- **Steps to reproduce:** Set up a Place of worship, Classroom or Living room and open Measurement Setup.
- **Expected:** Position names that apply to any room.
- **Actual:** “Centre of the table, ear height 1.2 m” for a 6000 m³ place of worship.
- **User impact:** Confusing instructions at the moment the user places the microphone.
- **Recommended solution:** Use room-neutral positions: main listening position (centre of the seating area), front of the room, rear corner.
- **Status:** Fixed. Positions are now Main listening position, Front of the room and Rear corner, with room-neutral descriptions.

### UX-015 · Medium · Home, Measurement History

- **Category:** Functional
- **Problem:** Projects cannot be deleted.
- **Steps to reproduce:** Look for a way to remove a test or abandoned project from Home or Measurement History.
- **Expected:** A delete action with confirmation.
- **Actual:** None. The list only grows.
- **User impact:** History fills with test and abandoned projects; real projects are harder to find.
- **Recommended solution:** Add “Delete project” with an inline confirmation to project cards and history rows. Remove it from this device's storage.
- **Status:** Fixed. Delete (bin icon) on every project card and history row, with an in-place confirmation. The project's storage key and index entry are removed; other open tabs drop it too.

### UX-016 · Medium · Home

- **Category:** UX
- **Problem:** Every click on New Measurement creates another empty “Untitled room” project, even when an untouched one already exists.
- **Steps to reproduce:** Click New Measurement, click Back (Home), click New Measurement again.
- **Expected:** An untouched new project is reused.
- **Actual:** Two empty “Untitled room” projects appear in Recent projects.
- **User impact:** Clutter and duplicate entries that cannot be told apart.
- **Recommended solution:** Reuse an existing project that has no data and no progress instead of creating another one.
- **Status:** Fixed. New Measurement reuses an untouched empty project instead of creating another.

### UX-017 · Medium · Final Result

- **Category:** UI
- **Problem:** “Measure after treatment” is a permanently disabled button (with a “Later stage” badge).
- **Steps to reproduce:** Finish a project with treatment.
- **Expected:** Either a working action or plain guidance text.
- **Actual:** A button that looks clickable but never is.
- **User impact:** Dead control at the end of the workflow.
- **Recommended solution:** Make it work: start a follow-up project with the same room and target, opened at Measurement Setup, so the treated room can be measured.
- **Status:** Fixed. “Measure the treated room” starts a follow-up project with the same room, target and measuring setup, opened at Measurement Setup. The original project is unchanged.

### UX-018 · Medium · Final Result

- **Category:** Functional
- **Problem:** The final result cannot be printed or saved as a document.
- **Steps to reproduce:** On Final Result, look for a way to share or keep the summary.
- **Expected:** A print or save-as-PDF action with a clean printed layout.
- **Actual:** No action; printing the page includes the sidebar and buttons.
- **User impact:** Users cannot hand the result to a client or colleague.
- **Recommended solution:** Add “Print or save as PDF” and print styles that hide the app chrome.
- **Status:** Fixed. “Print or save as PDF” on Final Result, with print styles that hide the sidebar, action bar and buttons.

### UX-019 · Medium · Final Result

- **Category:** UI
- **Problem:** The “Project complete” badge is shown while earlier steps are flagged for review.
- **Steps to reproduce:** Finish a project, then change the room. Open Final Result.
- **Expected:** “Needs review” instead of “Project complete”.
- **Actual:** Both “Review: an earlier step changed” and “Project complete” are shown.
- **User impact:** Contradictory status at the summary.
- **Recommended solution:** Show “Project complete” only when nothing is flagged; otherwise a review badge.
- **Status:** Fixed. The badge reads “Needs review” while any step is flagged, “Project complete” otherwise.

### UX-020 · Medium · Global

- **Category:** UI
- **Problem:** The orange accent means four different things: primary action, current step, “above target / needs treatment” status, and the evaluation range in charts.
- **Steps to reproduce:** Compare Home, the sidebar, Assessment and Results.
- **Expected:** One colour per meaning: status colours for status, the brand colour for brand and “you are here”.
- **Actual:** “Needs treatment” uses the same colour as the main buttons and the current step.
- **User impact:** Colour does not communicate meaning; a problem state looks like a call to action.
- **Recommended solution:** New colour system: graphite primary actions, brand red only for brand and the current position, acoustic teal for measurement information, amber for “needs attention”, green for success, crimson for failure.
- **Status:** Fixed. New colour system: graphite primary, brand red only for the brand and “now” (current step, live recording), acoustic teal for measurement information, amber for needs attention, green for target met, crimson for failures. “Needs treatment” is amber.

### UX-021 · Medium · Global

- **Category:** UI
- **Problem:** Two competing primary button styles: black (Continue) and orange (New Measurement, Start measurement, Close video).
- **Steps to reproduce:** Compare the Home action, the action bar and the measurement console.
- **Expected:** One primary style.
- **Actual:** Primary actions look different from screen to screen.
- **User impact:** Inconsistent hierarchy; users cannot rely on the look of the main action.
- **Recommended solution:** One primary style everywhere; the record action keeps a red record dot as its only distinction.
- **Status:** Fixed. One primary button style everywhere; the record action is the same button with a red record dot.

### UX-022 · Medium · Global

- **Category:** Accessibility
- **Problem:** Small text in the “faint” colour has 2.3–2.7:1 contrast (light mode): “Required” labels, sidebar phase headings, locked step names, placeholders.
- **Steps to reproduce:** Measure contrast of #9C9792 on #F7F5F3 / #E8E4E0.
- **Expected:** At least 4.5:1 for text.
- **Actual:** 2.66:1 on cards, 2.29:1 on the background.
- **User impact:** Hard to read for many users, especially outdoors on a laptop.
- **Recommended solution:** Use the muted text colour (≥ 4.5:1) for all text; keep the faint colour for borders and icons only, at ≥ 3:1.
- **Status:** Fixed. All text uses the muted colour (≥ 5:1 light, ≥ 6:1 dark); the faint colour is kept for icons and borders.

### UX-023 · Medium · Global

- **Category:** Accessibility
- **Problem:** White text on the orange buttons has 3.5:1 contrast (3.1:1 in dark mode).
- **Steps to reproduce:** Measure the New Measurement button.
- **Expected:** At least 4.5:1 for 14–16 px button text.
- **Actual:** 3.51:1 light, 3.09:1 dark.
- **User impact:** Primary actions are harder to read.
- **Recommended solution:** Primary buttons use graphite with white text (over 15:1).
- **Status:** Fixed. Primary buttons are graphite with white text (17.7:1).

### UX-024 · Medium · Side panels (History, Explain, Video, Developer tools)

- **Category:** Accessibility
- **Problem:** When a panel closes, keyboard focus is lost (goes to the page body). While a panel is open, the page behind it stays focusable.
- **Steps to reproduce:** Focus Measurement History, press Enter, then Escape. Press Tab.
- **Expected:** Focus returns to the control that opened the panel; the page behind is inert while the panel is open.
- **Actual:** Focus moves to <body>; Tab can reach controls behind the panel.
- **User impact:** Keyboard and screen-reader users lose their place.
- **Recommended solution:** Make the app inert while a panel is open and return focus to the opening control when it closes.
- **Status:** Fixed. The page behind an open panel is inert; focus returns to the control that opened the panel.

### UX-025 · Medium · Global (narrow screens)

- **Category:** Responsive
- **Problem:** Below 640 px the reason Continue is unavailable (“Enter the room length.”) is hidden. Users only learn it by tapping the button.
- **Steps to reproduce:** Open Room Setup at 375 px wide.
- **Expected:** The reason is visible above the buttons.
- **Actual:** Hidden by CSS on phones.
- **User impact:** Disabled buttons with no visible explanation on mobile.
- **Recommended solution:** Show the reason as a full-width line above the buttons on narrow screens.
- **Status:** Fixed. On narrow screens the reason shows as a full-width line above the buttons.

### UX-026 · Medium · Treatment (narrow screens)

- **Category:** Responsive
- **Problem:** The treatment plan table is about 800 px wide inside a 311 px column, so the quantity controls and results are off-screen.
- **Steps to reproduce:** Open Treatment at 375 px wide with a product in the plan.
- **Expected:** Each product readable and editable without sideways scrolling.
- **Actual:** Horizontal scrolling inside the table; the steppers and “Predicted RT60” are hidden.
- **User impact:** The plan is hard to read and edit on a phone.
- **Recommended solution:** Below 760 px, show each plan row as a stacked block with labels.
- **Status:** Fixed. Below 760 px each product in the plan is a stacked block with labels; no sideways scrolling.

### UX-027 · Medium · Processing

- **Category:** Content
- **Problem:** The advice for an insufficient measurement tells the user to “raise the signal level”, but the app has no signal-level control.
- **Steps to reproduce:** Process an insufficient measurement.
- **Expected:** Advice the user can follow.
- **Actual:** “Reduce background noise or raise the signal level, then measure again.”
- **User impact:** Users look for a control that does not exist.
- **Recommended solution:** Give concrete steps: close doors and windows, switch off ventilation, keep everyone silent, check the noise again, then measure again.
- **Status:** Fixed. Advice now lists steps the user can take (doors, ventilation, silence).

### UX-028 · Medium · Explain this step (all steps)

- **Category:** Content
- **Problem:** Every explanation is labelled “Assistant preview” and ends with “In the full app, an assistant will explain your own project data here…”.
- **Steps to reproduce:** Click “Explain this step” on any step.
- **Expected:** Product language that describes what the panel is.
- **Actual:** Prototype and roadmap wording on every step.
- **User impact:** Undermines trust; the product reads as unfinished.
- **Recommended solution:** Label it “Step guide” and say what it does: it uses this project's numbers and never changes results.
- **Status:** Fixed. Badge “Step guide”; footnote says the guide uses this project's numbers and never changes results.

### UX-029 · Low · Room Setup

- **Category:** Content
- **Problem:** Surfaces note: “Surfaces are recorded for context in this prototype. A later stage will use them…”.
- **Steps to reproduce:** Open Room Setup, Surfaces card.
- **Expected:** Says what the surfaces are used for now.
- **Actual:** Prototype and roadmap wording.
- **User impact:** Reads as unfinished; unclear whether surfaces matter.
- **Recommended solution:** “Surfaces are saved with the project for reference. They do not change the target or the prediction.”
- **Status:** Fixed. Rewritten: surfaces are saved for reference and do not change the target or prediction.

### UX-030 · Low · Measurement Setup

- **Category:** Content
- **Problem:** Microphone access card: “This prototype never opens your real microphone.”
- **Steps to reproduce:** Open Measurement Setup.
- **Expected:** A plain statement that this version simulates the microphone.
- **Actual:** Prototype wording.
- **User impact:** Reads as unfinished.
- **Recommended solution:** “This version simulates the microphone. It does not open your device's microphone.”
- **Status:** Fixed. Rewritten: “This version simulates the microphone…”. The USB microphone note no longer says “comes later”.

### UX-031 · Low · Acoustic Measurement

- **Category:** Content
- **Problem:** The room-condition control is labelled “Prototype · simulated room condition” with no explanation of what it does.
- **Steps to reproduce:** Open Acoustic Measurement.
- **Expected:** A label that explains the control.
- **Actual:** Prototype label; effect not described.
- **User impact:** Users do not know that this is how the simulated background noise is chosen (and how to recover from UX-005).
- **Recommended solution:** “Simulated room condition” with a one-line description of each option's effect.
- **Status:** Fixed. Label “Simulated room condition” with the selected option's description under it.

### UX-032 · Low · Processing

- **Category:** Content
- **Problem:** “Simulated engine. The real signal-processing engine will replace it behind the same interface.”
- **Steps to reproduce:** Open Processing.
- **Expected:** User-facing description.
- **Actual:** Developer roadmap text.
- **User impact:** Reads as unfinished.
- **Recommended solution:** “This version processes a simulated recording. The checks and the choice of T20, T30 or T60 work as they would on a real recording.”
- **Status:** Fixed. Rewritten as a plain description of what is simulated and what works as on a real recording.

### UX-033 · Low · Predicted Result

- **Category:** Content
- **Problem:** “Not modelled yet: … The full prediction engine replaces this model later.”
- **Steps to reproduce:** Open Predicted Result, calculation card.
- **Expected:** A clear statement of the model's limits.
- **Actual:** Roadmap wording.
- **User impact:** Reads as unfinished.
- **Recommended solution:** State the limits plainly: placement, air absorption and uneven sound fields are not included; treat the result as an estimate.
- **Status:** Fixed. States the model's limits plainly (placement, air absorption, uneven sound field).

### UX-034 · Low · Treatment

- **Category:** Content
- **Problem:** Placement hint: “Used to check coverage. Placement guidance comes later.”
- **Steps to reproduce:** Open Treatment, Quantity card.
- **Expected:** Says what placement does.
- **Actual:** Roadmap wording.
- **User impact:** Reads as unfinished.
- **Recommended solution:** “Used to check that the treatment fits on that surface.”
- **Status:** Fixed. “Used to check that the treatment fits on that surface.”

### UX-035 · Low · Explain this step (Room Setup, Final Result)

- **Category:** Content
- **Problem:** Explanations say “In this prototype…” and “That step is planned for a later stage.”
- **Steps to reproduce:** Explain this step on Room Setup and Final Result.
- **Expected:** Explanations of the step as it works today.
- **Actual:** Prototype wording.
- **User impact:** Reads as unfinished.
- **Recommended solution:** Rewrite both paragraphs.
- **Status:** Fixed. Both paragraphs rewritten; Final Result's guide points to “Measure the treated room”.

### UX-036 · Low · Measurement Setup

- **Category:** UX
- **Problem:** Background noise can be checked before microphone access is allowed.
- **Steps to reproduce:** New project at Measurement Setup: click “Check background noise” first.
- **Expected:** The check needs the microphone.
- **Actual:** It runs and returns a reading.
- **User impact:** Illogical order; would fail with a real microphone.
- **Recommended solution:** Disable the check until access is allowed, with the reason shown.
- **Status:** Fixed. The noise check is disabled until microphone access is allowed, with the reason next to it.

### UX-037 · Low · Measurement Setup

- **Category:** UI
- **Problem:** The Microphone card always shows a green “Connected” status, even before access is allowed.
- **Steps to reproduce:** New project at Measurement Setup.
- **Expected:** “Waiting for access” until access is allowed.
- **Actual:** Green “Connected” next to “Not requested yet”.
- **User impact:** Contradictory status indicators.
- **Recommended solution:** Show the connection state from the permission.
- **Status:** Fixed. Shows “Waiting for microphone access” until allowed, then “Connected”.

### UX-038 · Low · Sidebar

- **Category:** UI
- **Problem:** Progress reads “10 of 10 steps complete · 100%” while steps are flagged for review.
- **Steps to reproduce:** Finish a project, then edit Room Setup.
- **Expected:** Progress mentions the steps to review.
- **Actual:** 100% with 9 steps flagged.
- **User impact:** Misleading status.
- **Recommended solution:** Show “n to review” next to the count and colour the bar accordingly.
- **Status:** Fixed. The sidebar progress is a segmented meter (one segment per step: done, to review, current) with “n to review”.

### UX-039 · Low · Target / Ideal RT60

- **Category:** UI
- **Problem:** Two explanatory cards come first and push the target editor below the fold (y = 763 px at 800 px tall).
- **Steps to reproduce:** Open Target at 1280 × 800.
- **Expected:** The recommendation and the editor first, background explanation after.
- **Actual:** Explanation first, the thing to act on last.
- **User impact:** Weak hierarchy on a decision step.
- **Recommended solution:** Order: recommendation, editor with the analysis, then the “what we want vs what we measure” explanation.
- **Status:** Fixed. Order is now recommendation, editor with analysis, then the explanation.

### UX-040 · Low · Mobile workflow menu

- **Category:** Accessibility
- **Problem:** The mobile workflow drawer has no close button and does not move focus into itself.
- **Steps to reproduce:** At 375 px, open the menu.
- **Expected:** A visible close button; focus moves into the drawer.
- **Actual:** Close only by tapping outside or Escape; focus stays on the page.
- **User impact:** Harder to use with a keyboard or screen reader.
- **Recommended solution:** Add a close button in the drawer header and focus the current step when it opens.
- **Status:** Fixed. Close button in the drawer; focus moves to the current step on open and back to the menu button on close.

### UX-041 · Low · Results, Home (narrow screens)

- **Category:** Responsive
- **Problem:** Small touch targets: band chips 29 px tall, project-name links 24 px tall.
- **Steps to reproduce:** Open Results at 375 px.
- **Expected:** About 40 px or more for touch.
- **Actual:** 29 px and 24 px.
- **User impact:** Mis-taps on phones and tablets.
- **Recommended solution:** Larger chips and hit areas on touch screens.
- **Status:** Fixed. Chips and segmented buttons are taller on touch screens; project-name links have a larger hit area. No control under 30 px at 375 px wide.

### UX-042 · Low · Acoustic Assessment

- **Category:** Content
- **Problem:** The sentence “x of 6 bands are above the range” has the 6 written into the text.
- **Steps to reproduce:** Read the assessment sentence.
- **Expected:** Count taken from the data.
- **Actual:** Fixed “of 6”.
- **User impact:** Breaks if the band set changes.
- **Recommended solution:** Use the number of bands in the result.
- **Status:** Fixed. Count taken from the result; “is/are” follows it.

### UX-043 · Low · Final Result

- **Category:** Content
- **Problem:** Grammar: “12.5 m² of … are predicted to bring…”.
- **Steps to reproduce:** Finish a project with an area-based treatment.
- **Expected:** “12.5 m² of … is predicted…”.
- **Actual:** “are” for a single area.
- **User impact:** Minor polish.
- **Recommended solution:** Choose “is” or “are” from the amount.
- **Status:** Fixed. “is” for a single area, “are” for panels or several products. “short of the target range” became “still … above the target range”.

### UX-044 · Low · Global

- **Category:** Content
- **Problem:** Inconsistent capitalisation and naming of actions: “Ready to Measure”, “Play Test Signal”, “Quality Check”, “Start New Measurement” (history) vs “New Measurement” (Home).
- **Steps to reproduce:** Compare Measurement Setup, Acoustic Measurement and Measurement History.
- **Expected:** One style (sentence case) and one name per action.
- **Actual:** Mixed.
- **User impact:** Minor inconsistency.
- **Recommended solution:** Sentence case for labels; “New Measurement” everywhere.
- **Status:** Fixed. Sentence case for labels (Ready to measure, Play test signal, Quality check); “New Measurement” in the history panel too.

### UX-045 · Low · Room Setup

- **Category:** Content
- **Problem:** Typical occupancy is not marked optional and does not say what it changes.
- **Steps to reproduce:** Open Room Setup.
- **Expected:** “Optional” and a one-line explanation.
- **Actual:** No hint, although it changes the recommended target for speech rooms.
- **User impact:** Users skip it or guess.
- **Recommended solution:** Hint: “Optional. Rooms for speech get a target adjusted for the people usually present.”
- **Status:** Fixed. Marked Optional, with a one-line hint on what it changes.

### UX-046 · Low · Room Setup

- **Category:** Accessibility
- **Problem:** Occupancy (a whole number) opens a decimal keypad on phones.
- **Steps to reproduce:** Tap Typical occupancy on a phone.
- **Expected:** Numeric keypad.
- **Actual:** Decimal keypad.
- **User impact:** Minor friction.
- **Recommended solution:** inputmode “numeric” for whole-number fields.
- **Status:** Fixed. Whole-number fields use inputmode “numeric”.

### UX-047 · Low · Treatment

- **Category:** UX
- **Problem:** Removing a product from the plan happens at once, with no confirmation or undo.
- **Steps to reproduce:** Click × on a plan row.
- **Expected:** A way to undo.
- **Actual:** The product, its configuration and amount are gone.
- **User impact:** Accidental loss of plan details.
- **Recommended solution:** Show “Removed … Undo” after a removal.
- **Status:** Fixed. After a removal: “Removed #1 … from the plan. Undo”, which puts it back in place.

### UX-048 · Low · Acoustic Measurement

- **Category:** UX
- **Problem:** Leaving the step during a take cancels it silently.
- **Steps to reproduce:** Start a take and click another step in the sidebar.
- **Expected:** A message that the take was cancelled.
- **Actual:** Nothing is said.
- **User impact:** Users may think the take finished.
- **Recommended solution:** Show “Measurement cancelled. No recording was stored.”
- **Status:** Fixed. Toast: “Measurement cancelled. No recording was stored.”

### UX-049 · Low · Global

- **Category:** Navigation
- **Problem:** Nothing tells the user that work is saved automatically.
- **Steps to reproduce:** Work through any step and look for a save state.
- **Expected:** A quiet “Saved on this device” state.
- **Actual:** No indication (only on Home's footer).
- **User impact:** Users worry about losing work when going back or leaving.
- **Recommended solution:** Show “Saved on this device · time” under the project in the sidebar.
- **Status:** Fixed. “✓ Saved on this device · time” under the project in the sidebar.

### UX-050 · Low · Predicted Result

- **Category:** Content
- **Problem:** “Improves 1000 Hz by 0.31 s” is unclear.
- **Steps to reproduce:** Open Predicted Result.
- **Expected:** “Shortens RT60 at 1000 Hz by 0.31 s”.
- **Actual:** Ambiguous phrasing.
- **User impact:** Minor clarity.
- **Recommended solution:** Rephrase.
- **Status:** Fixed. “Shortens RT60 at 1000 Hz by 0.30 s.”

### UX-051 · Low · Processing

- **Category:** Content
- **Problem:** If there is no recording, Continue says “Processing is still running.”
- **Steps to reproduce:** Edge case: a project reaches Processing without a recording.
- **Expected:** “Measure the room first.”
- **Actual:** Wrong reason.
- **User impact:** Misleading message.
- **Recommended solution:** Separate messages for no recording and processing in progress.
- **Status:** Fixed. “Measure the room first.” when there is no recording.

### UX-052 · Low · Sidebar

- **Category:** UI
- **Problem:** “Developer tools” (demo-data shortcuts, reset) are visible to every user.
- **Steps to reproduce:** Look at the sidebar footer.
- **Expected:** Hidden from normal users, or clearly secondary.
- **Actual:** Visible on every screen.
- **User impact:** Clutter; a reset action one click away.
- **Recommended solution:** Keep for testing (used by the team), visually secondary. Hiding it behind a setting is a product decision.
- **Status:** Fixed (22 October 2026). The step shortcuts appear only when turned on with `?dev=1` (remembered on the device, `?dev=0` turns them off), and they only ever fill a sample project. Everyone else sees “Project options”: reset or close the project, and how its target was worked out.

### UX-053 · Low · Home

- **Category:** UI
- **Problem:** On Home, the context bar shows the open project's name and values, as if Home belonged to that project.
- **Steps to reproduce:** Open a project, then go Home.
- **Expected:** Home shows the application, the cards show projects.
- **Actual:** “Audit Hall · Room 6000 m³ · Target …” above the Home page.
- **User impact:** Confusing sense of place.
- **Recommended solution:** Show the context bar values only on project steps.
- **Status:** Fixed. Home shows the application name; project values appear only on project steps.

### UX-054 · Low · All steps

- **Category:** UI
- **Problem:** “Explain this step” is a borderless ghost button and reads as plain text.
- **Steps to reproduce:** Look at any step header.
- **Expected:** Recognisable as a button.
- **Actual:** Text with an icon.
- **User impact:** Help is easy to miss.
- **Recommended solution:** Give it the secondary button style.
- **Status:** Fixed. “Explain this step” uses the secondary button style with an info icon.

### UX-055 · Low · Treatment, Predicted Result, Final Result

- **Category:** Content
- **Problem:** Product names appear in capitals (“UNIZEN ACOUSTIC PANEL”) because that is how the source lists them.
- **Steps to reproduce:** Choose any product.
- **Expected:** Readable product names.
- **Actual:** All capitals in sentences.
- **User impact:** Sentences read as shouting.
- **Recommended solution:** Not changed in this pass: product names come from the catalogue, which must stay as it is.
- **Status:** Not changed. Product names come from the catalogue, which must stay unchanged. A display-only title case could be added later if wanted.

### UX-056 · Low · Treatment

- **Category:** Accessibility
- **Problem:** Found during Phase 2 testing: the plan table header “α at 1000 Hz” is shown in capitals, which turns α into the capital Greek letter Α. It reads as “A AT 1000 HZ”.
- **Steps to reproduce:** Treatment with a product in the plan: read the table header (desktop) or the stacked labels (phone).
- **Expected:** “α at 1000 Hz”.
- **Actual:** “Α AT 1000 HZ”.
- **User impact:** The absorption coefficient column is mislabelled.
- **Recommended solution:** Keep α out of the capitalisation; use sentence case for the stacked labels.
- **Status:** Fixed. α is excluded from the capitalisation in the header; the stacked labels on phones use sentence case.
