/* Shared interface helpers that are text, not markup: how amounts and statuses are worded, and the registry of number
   fields holding text that is not a number. The interface itself (its components and screens) is React + TypeScript in
   src/, built into js/app/univicoustic-ui.js; it adds the HTML versions of a few shared pieces here (pill, average
   summary, project card, history list, background-noise card) for code that reads them as strings. */
(function (AM) {
  'use strict';
  const { fmt } = AM.util;
  const ui = {};

  // How a band's measurement quality is shown (a pill tone per word).
  ui.tone = { Good: 'good', Fair: 'warn', Insufficient: 'critical', 'Not measured': 'neutral', High: 'good', Medium: 'warn', None: 'critical' };

  /* Text typed into a number field that is not a number, by field id. The shell keeps it here so the field shows
     what was typed with an error, instead of silently dropping it. Cleared when the entry becomes a number. */
  ui.bad = {};

  /* Treatment amounts, shared by Treatment, Predicted Result and the report. sel = one resolved treatment item
     (AM.derive.treatmentItems / treatmentSelection). Units: quantity × the chosen panel size. Area: entered directly. */
  ui.MAX_PANELS = 1000;
  ui.panelArea = a => fmt.m2(a, 3); // 3 decimals so quantity × area × α visibly adds up for small tiles
  ui.amountText = sel => (sel.mode === 'units'
    ? `${sel.quantity} panel${sel.quantity === 1 ? '' : 's'} · ${fmt.m2(sel.areaM2)}`
    : fmt.m2(sel.areaM2));
  // The whole plan in a few words: one item reads as before, several as a count and total area.
  ui.planText = items => (items.length === 1 ? ui.amountText(items[0])
    : `${items.length} products · ${fmt.m2(items.reduce((s, i) => s + i.areaM2, 0))}`);

  /* Deleting a project asks first, in place: state.ui.confirm = 'delete:<id>'. */
  ui.confirmingDelete = id => AM.store.state.ui.confirm === `delete:${id}`;

  AM.ui = ui;
})(window.AM);
