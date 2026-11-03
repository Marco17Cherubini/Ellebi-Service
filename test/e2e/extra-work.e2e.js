// End-to-end (browser reale): pianificazione dei lavori straordinari dall'interfaccia admin.
// Richiede Playwright con Chromium (non è una dipendenza del progetto): `npm run test:e2e`.
// Usa il server di test con un database temporaneo, mai dati reali.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const {
  ADMIN,
  startTestServer,
  makeUser,
  findService,
  futureWeekday,
  bookingPayload,
  slotAt
} = require('../helpers');

let api;
let browser;
let depositId;

before(async () => {
  api = await startTestServer();
  const customer = await api.registerAndLogin(makeUser('e2e'));
  const res = await api.request('POST', '/api/bookings', {
    cookie: customer,
    body: bookingPayload(findService('Distribuzione'), futureWeekday(1, 3), '08:30')
  });
  depositId = res.data.deposit.id;
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
  await api.close();
});

async function adminPage(viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, ...extra });
  await ctx.request.post(api.baseUrl + '/api/auth/login', { data: ADMIN });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return { ctx, page, errors };
}

async function startPlanning(page, hours) {
  await page.goto(api.baseUrl + '/admin/depositi', { waitUntil: 'networkidle' });
  await page.locator(`[data-card-id="${depositId}"]`).first().click();
  await page.locator(`.dc-ore-input[data-id="${depositId}"]`).fill(String(hours));
  await page.locator(`[data-action="pianifica"][data-id="${depositId}"]`).click();
  await page.waitForURL(/\/admin/);
  await page.locator('#extrawork-mode-indicator:not(.hidden)').waitFor();
}

async function blocks() {
  const cookie = await api.adminCookie();
  const res = await api.request('GET', '/api/admin/bookings', { cookie });
  return res.data.bookings
    .filter(b => b.service_id === 'extra_work' && String(b.deposit_id) === String(depositId))
    .map(b => b.giorno + ' ' + b.ora)
    .sort();
}

test("telefono: vista Giorno, tocco e tastiera selezionano i quarti d'ora; dopo il salvataggio sono occupati", async () => {
  const { ctx, page, errors } = await adminPage(
    { width: 390, height: 844 },
    { isMobile: true, hasTouch: true }
  );
  await startPlanning(page, 1);
  assert.match(await page.evaluate(() => document.body.className), /view-day/);
  assert.ok(await page.locator('#save-extrawork-btn').isVisible());

  // Primo giorno con quarti d'ora liberi
  for (let i = 0; i < 10 && !(await page.locator('.pick-btn').count()); i++) {
    await page.locator('#agenda-next').click();
  }
  const day = await page.locator('#agenda-date').inputValue();
  const picks = page.locator('.pick-btn:not([disabled])');
  const t0 = await picks.nth(0).getAttribute('data-time');
  const t1 = await picks.nth(1).getAttribute('data-time');
  await picks.nth(0).tap();
  await page.locator(`.pick-btn[data-time="${t1}"]`).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.pick-btn[aria-pressed="true"]').count(), 2);

  await page.locator('#save-extrawork-btn').click();
  await page.locator('#extrawork-mode-indicator.hidden').waitFor({ state: 'attached' });
  assert.deepEqual(await blocks(), [day + ' ' + t0, day + ' ' + t1].sort());

  // Dopo il ricaricamento i blocchi sono ancora in agenda
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#agenda-date').fill(day);
  await page.locator('#agenda-date').dispatchEvent('change');
  assert.ok((await page.locator('.agenda-work').count()) >= 1);

  const pub = await api.request('GET', `/api/slots/${day}`);
  assert.equal(slotAt(pub.data.slots, t0).available, false);
  assert.equal(slotAt(pub.data.slots, t1).available, false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('desktop: griglia settimanale, trascinamento col mouse, salvataggio', async () => {
  const before = (await blocks()).length;
  const { ctx, page, errors } = await adminPage({ width: 1280, height: 900 });
  await startPlanning(page, 1);
  assert.match(await page.evaluate(() => document.body.className), /view-week/);
  await page.locator('#next-week').click();
  const cell = page.locator('.admin-cell:not(.has-booking)[data-date][data-time="09:00"]').nth(1);
  await cell.evaluate(el => el.scrollIntoView({ block: 'center' }));
  const box = await cell.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 5, box.y + 5 + 3 * box.height, { steps: 8 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => selectedExtraWorkSlots.length), 4);
  await page.locator('#save-extrawork-btn').click();
  await page.locator('#extrawork-mode-indicator.hidden').waitFor({ state: 'attached' });
  assert.equal((await blocks()).length, before + 4);
  assert.deepEqual(errors, []);
  await ctx.close();
});
