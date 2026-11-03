// End-to-end: su telefono nessuna pagina è più larga dello schermo (niente zoom indietro,
// niente scritte che escono). Regressione: nella home le durate del listino uscivano a destra
// e il listino admin scorreva di lato. Richiede Playwright con Chromium: `npm run test:e2e`.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { ADMIN, startTestServer, makeUser } = require('../helpers');

let api;
let browser;
let customer;

before(async () => {
  api = await startTestServer();
  customer = makeUser('mobile');
  await api.registerAndLogin(customer);
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
  await api.close();
});

const PAGES = {
  ospite: ['/', '/guest-booking', '/login', '/register', '/reset-password'],
  cliente: ['/home'],
  admin: ['/admin', '/admin/depositi', '/admin/clienti', '/admin/listino', '/admin/reports']
};

// Elementi visibili che escono dallo schermo, esclusi quelli dentro un contenitore che scorre
// di proposito (striscia dei giorni) e il menu laterale chiuso
function overflowing() {
  const W = document.documentElement.clientWidth;
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('.sidebar')) continue;
    const r = e.getBoundingClientRect();
    if (!r.width || r.right <= 1 || r.right <= W + 1) continue;
    let a = e.parentElement;
    let scrolls = false;
    for (; a && a !== document.body; a = a.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(a).overflowX)) scrolls = true;
    }
    if (!scrolls) out.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`);
  }
  // Scorrimento laterale ammesso solo dove è il gesto previsto (striscia dei giorni)
  const sideways = [...document.querySelectorAll('body *')]
    .filter(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 2)
    .filter(e => /auto|scroll/.test(getComputedStyle(e).overflowX))
    .filter(e => !e.matches('.day-strip'))
    .map(e => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`);
  return {
    scrollWidth: document.documentElement.scrollWidth,
    width: W,
    out: out.concat(sideways).slice(0, 5)
  };
}

for (const width of [360, 390, 430]) {
  for (const [role, urls] of Object.entries(PAGES)) {
    test(`${width}px, ${role}: nessuna pagina più larga dello schermo`, async () => {
      const ctx = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      if (role !== 'ospite') {
        const who = role === 'admin' ? ADMIN : customer;
        const res = await ctx.request.post(api.baseUrl + '/api/auth/login', {
          data: { email: who.email, password: who.password }
        });
        assert.ok(res.ok(), `accesso ${role}`);
      }
      const page = await ctx.newPage();
      for (const url of urls) {
        await page.goto(api.baseUrl + url, { waitUntil: 'networkidle' });
        const r = await page.evaluate(overflowing);
        assert.ok(r.scrollWidth <= r.width, `${url}: larghezza ${r.scrollWidth} > ${r.width}`);
        assert.deepEqual(r.out, [], `${url}: elementi fuori schermo`);
      }
      await ctx.close();
    });
  }
}

test('con la sessione admin la home non mostra collegamenti all’area riservata', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await ctx.request.post(api.baseUrl + '/api/auth/login', {
    data: { email: ADMIN.email, password: ADMIN.password }
  });
  const page = await ctx.newPage();
  await page.goto(api.baseUrl + '/', { waitUntil: 'networkidle' });
  const hrefs = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
  assert.equal(
    hrefs.some(h => h.startsWith('/admin')),
    false
  );
  for (const name of ['Accedi', 'Registrati', 'Prenota come ospite']) {
    assert.ok(await page.getByRole('link', { name, exact: true }).isVisible(), name);
  }
  await ctx.close();
});
