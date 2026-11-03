// Ingresso del sito: come in origine si entra solo da accesso, registrazione o prenotazione
// come ospite. Regressione: la home mostrava "Agenda officina" a chi aveva una sessione admin
// e il listino a tutti. Nessuna pagina pubblica deve avere collegamenti all'area admin.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startTestServer } = require('./helpers');

const FRONTEND = path.join(__dirname, '../frontend');
const read = f => fs.readFileSync(path.join(FRONTEND, f), 'utf8');

let api;

before(async () => {
  api = await startTestServer();
});

after(() => api.close());

test('la home offre solo accesso, registrazione e prenotazione come ospite', async () => {
  const admin = await api.adminCookie();
  // Stessa pagina per tutti, con o senza sessione
  for (const cookie of [undefined, admin]) {
    const res = await fetch(api.baseUrl + '/', { headers: cookie ? { Cookie: cookie } : {} });
    assert.equal(res.status, 200);
    const html = await res.text();
    const links = [...html.matchAll(/href="(\/[^"#]*)"/g)]
      .map(m => m[1])
      .filter(h => !h.startsWith('/styles') && !h.startsWith('/fonts') && !h.startsWith('/images'));
    assert.deepEqual(links.sort(), ['/guest-booking', '/login', '/register']);
    assert.doesNotMatch(html, /\/admin|agenda/i);
    // Nessuno script che cambi i collegamenti in base alla sessione
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(scripts, ['/js/theme.js', '/js/legal-footer.js']);
  }
});

test('le pagine pubbliche non collegano l’area admin', () => {
  const files = [
    'index.html',
    'prenota.html',
    'login.html',
    'register.html',
    'reset-password.html',
    'new-password.html',
    'home.html',
    'js/booking-flow.js',
    'js/home.js',
    'js/theme.js',
    'js/legal-footer.js'
  ];
  for (const f of files) {
    assert.doesNotMatch(read(f), /href=["']\/admin/i, f);
  }
});

test('il 3D non è più pubblicato: la home usa solo l’immagine statica', () => {
  assert.equal(fs.existsSync(path.join(FRONTEND, 'js/garage3d.js')), false);
  assert.equal(fs.existsSync(path.join(FRONTEND, 'js/landing.js')), false);
  assert.match(read('index.html'), /auto-assemblata\.webp/);
});
