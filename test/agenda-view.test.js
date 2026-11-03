// Vista iniziale dell'agenda officina: la pianificazione richiede sempre la griglia settimanale.
// Regressione: su telefono l'agenda si apriva in vista Giorno anche arrivando da
// "Pianifica a calendario", nascondendo griglia e pulsante Salva: i blocchi non venivano creati.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { agendaInitialView } = require('../frontend/js/agenda-view');

test('arrivando da "Pianifica a calendario" la vista è sempre la settimana', () => {
  for (const wide of [true, false]) {
    for (const saved of [null, 'day', 'week']) {
      assert.equal(agendaInitialView({ search: '?assignDeposit=3&hours=2', saved, wide }), 'week');
    }
  }
});

test('senza pianificazione vale la preferenza, poi la larghezza dello schermo', () => {
  assert.equal(agendaInitialView({ search: '', saved: 'day', wide: true }), 'day');
  assert.equal(agendaInitialView({ search: '', saved: 'week', wide: false }), 'week');
  assert.equal(agendaInitialView({ search: '', saved: null, wide: true }), 'week');
  assert.equal(agendaInitialView({ search: '', saved: null, wide: false }), 'day');
  assert.equal(agendaInitialView({ search: '?hours=2', saved: 'bogus', wide: false }), 'day');
});
