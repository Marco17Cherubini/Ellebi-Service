// Vista iniziale dell'agenda officina.
// Regressione: su telefono "Pianifica a calendario" apriva la vista Giorno senza strumenti di
// pianificazione (erano solo nella griglia settimanale): i blocchi non venivano creati.
// Ora la vista Giorno ha i propri pulsanti per i quarti d'ora; la griglia resta per schermi larghi.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { agendaInitialView } = require('../frontend/js/agenda-view');

test('"Pianifica a calendario": settimana su schermi larghi, giorno su telefono', () => {
  for (const saved of [null, 'day', 'week']) {
    assert.equal(
      agendaInitialView({ search: '?assignDeposit=3&hours=2', saved, wide: true }),
      'week'
    );
    assert.equal(
      agendaInitialView({ search: '?assignDeposit=3&hours=2', saved, wide: false }),
      'day'
    );
  }
});

test('senza pianificazione vale la preferenza, poi la larghezza dello schermo', () => {
  assert.equal(agendaInitialView({ search: '', saved: 'day', wide: true }), 'day');
  assert.equal(agendaInitialView({ search: '', saved: 'week', wide: false }), 'week');
  assert.equal(agendaInitialView({ search: '', saved: null, wide: true }), 'week');
  assert.equal(agendaInitialView({ search: '', saved: null, wide: false }), 'day');
  assert.equal(agendaInitialView({ search: '?hours=2', saved: 'bogus', wide: false }), 'day');
});
