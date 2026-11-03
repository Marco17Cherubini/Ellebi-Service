// End-to-end: con il 3D attivo i controlli della homepage restano utilizzabili su telefono.
// Regressione: la tela 3D copriva le etichette dei pezzi (il menu dell'auto) sotto i 760 px.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startTestServer } = require('../helpers');

let api;
let browser;

before(async () => {
  api = await startTestServer();
  // WebGL software, come nei browser senza GPU dedicata
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
});

after(async () => {
  await browser.close();
  await api.close();
});

for (const width of [360, 390, 768]) {
  test(`${width}px: dopo "Ruota in 3D" etichette, pulsanti e scroll funzionano`, async () => {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: width < 600,
      hasTouch: width < 600
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(api.baseUrl + '/', { waitUntil: 'networkidle' });
    await page.locator('#open-3d').click();
    await page.waitForFunction(() =>
      document.getElementById('stage-car').classList.contains('is-3d')
    );

    // Ogni etichetta riceve il tocco e apre il pannello del pezzo
    const hotspots = page.locator('.hotspot');
    const n = await hotspots.count();
    assert.ok(n >= 5);
    for (let i = 0; i < n; i++) {
      // Aprire un pannello può far scorrere la pagina fino a esso: si aspetta che lo scroll finisca
      await page.waitForFunction(
        () =>
          new Promise(r => {
            const y = scrollY;
            setTimeout(() => r(scrollY === y), 250);
          })
      );
      await hotspots.nth(i).click({ timeout: 10000 });
      assert.equal(await hotspots.nth(i).getAttribute('aria-expanded'), 'true');
    }

    // Lo scroll della pagina non è catturato dalla scena
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
    assert.ok((await page.evaluate(() => scrollY)) > 0);

    // Il pulsante di prenotazione della barra porta alla prenotazione
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator('.site-bar-cta').click();
    await page.waitForURL('**/prenota');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
