// Durate pubbliche: vengono dal listino (services.durata_minuti); la griglia di 15 minuti è
// interna all'agenda e non va presentata come durata dei servizi. Le consegne riservano
// 30 minuti di accoglienza, che non sono la durata della riparazione.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startTestServer } = require('./helpers');

let api;

before(async () => {
  api = await startTestServer();
});

after(() => api.close());

test('il listino pubblico riporta la durata del listino e segnala quella non definita', async () => {
  const { servicesDB } = require('../server/database');
  servicesDB.insert({
    nome: 'Diagnosi elettronica',
    tipo_veicolo: 'auto',
    tipo_servizio: 'appuntamento',
    durata_minuti: 0,
    attivo: 1
  });
  const res = await api.request('GET', '/api/services');
  const byName = n => res.data.services.find(s => s.nome === n);
  assert.equal(byName('Freni').durata_minuti, 90);
  assert.equal(byName('Freni').durata_definita, true);
  assert.equal(byName('Distribuzione').tipo_servizio, 'consegna');
  assert.equal(byName('Distribuzione').durata_minuti, 30);
  assert.equal(byName('Distribuzione').durata_definita, true);
  // Durata assente: il sito dice "da concordare"; in agenda resta il valore predefinito
  assert.equal(byName('Diagnosi elettronica').durata_definita, false);
});

test('le pagine pubbliche non presentano i 15 minuti come durata', () => {
  const files = ['index.html', 'prenota.html', 'js/landing.js', 'js/booking-flow.js'];
  for (const f of files) {
    const text = fs.readFileSync(path.join(__dirname, '../frontend', f), 'utf8');
    assert.doesNotMatch(text, />\s*15 min\s*</i, f);
    assert.doesNotMatch(text, /quarti d'ora liberi|ogni segmento vale/i, f);
  }
});
