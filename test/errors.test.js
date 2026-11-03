// Gestione centralizzata degli errori: messaggi per l'utente, nessun dettaglio interno
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

let api;

before(async () => {
  api = await startTestServer();
});

after(() => api.close());

test('JSON malformato: 400 con messaggio generico', async () => {
  const res = await fetch(`${api.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"email": '
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { success: false, error: 'Richiesta non valida' });
});

test('corpo troppo grande: rifiutato', async () => {
  const res = await api.request('POST', '/api/auth/login', {
    body: { email: 'a@test.local', password: 'x'.repeat(20 * 1024) }
  });
  assert.equal(res.status, 413);
});

test('errore imprevisto: 500 senza dettagli interni', async () => {
  const { bookingsDB } = require('../server/database');
  const original = bookingsDB.readAll;
  bookingsDB.readAll = () => {
    throw new Error('SQLITE_CORRUPT: dettaglio interno');
  };
  try {
    const res = await api.request('GET', '/api/slots/2030-11-05');
    assert.equal(res.status, 500);
    assert.equal(res.data.error, 'Errore interno del server');
  } finally {
    bookingsDB.readAll = original;
  }
});

test('le pagine principali sono servite con URL senza estensione', async () => {
  // Le pagine admin richiedono la sessione admin (anonimi e clienti: page-guard.test.js)
  const cookie = await api.adminCookie();
  for (const url of ['/', '/login', '/dashboard', '/admin', '/admin/depositi']) {
    const res = await fetch(api.baseUrl + url, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200, url);
    assert.match(res.headers.get('content-type'), /text\/html/);
  }
  assert.equal(
    (await fetch(`${api.baseUrl}/admin/vip`, { headers: { Cookie: cookie } })).status,
    404
  );
});
