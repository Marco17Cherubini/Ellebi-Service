// Ogni API riservata rifiuta chi non ha una sessione (401) e i clienti non admin (403)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, makeUser } = require('./helpers');

let api;
let customer;

const ADMIN_ROUTES = [
  ['GET', '/api/settings/maxDeposits'],
  ['PUT', '/api/settings/maxDeposits'],
  ['GET', '/api/admin/bookings'],
  ['POST', '/api/admin/bookings'],
  ['PUT', '/api/admin/bookings'],
  ['DELETE', '/api/admin/bookings'],
  ['GET', '/api/admin/users'],
  ['PUT', '/api/admin/users/x%40test.local/vip'],
  ['PUT', '/api/admin/users/x%40test.local/banned'],
  ['GET', '/api/admin/users/x%40test.local/vehicles'],
  ['GET', '/api/admin/vehicles/targa/AB123CD'],
  ['POST', '/api/admin/holidays'],
  ['DELETE', '/api/admin/holidays'],
  ['GET', '/api/admin/reports/bookings-stats'],
  ['GET', '/api/admin/services'],
  ['POST', '/api/admin/services'],
  ['PUT', '/api/admin/services/1'],
  ['DELETE', '/api/admin/services/1'],
  ['GET', '/api/admin/deposits'],
  ['GET', '/api/admin/deposits/all'],
  ['POST', '/api/admin/deposits/1/status'],
  ['PUT', '/api/admin/deposits/1/nota'],
  ['PUT', '/api/admin/deposits/1/ore'],
  ['POST', '/api/admin/deposits/1/schedule']
];

const CUSTOMER_ROUTES = [
  ['GET', '/api/auth/me'],
  ['GET', '/api/bookings'],
  ['POST', '/api/bookings'],
  ['DELETE', '/api/bookings'],
  ['GET', '/api/vehicles'],
  ['POST', '/api/vehicles']
];

before(async () => {
  api = await startTestServer();
  customer = await api.registerAndLogin(makeUser('authz'));
});

after(() => api.close());

test('API admin: 401 senza sessione', async () => {
  for (const [method, url] of ADMIN_ROUTES) {
    const res = await api.request(method, url, { body: method === 'GET' ? undefined : {} });
    assert.equal(res.status, 401, `${method} ${url}`);
  }
});

test('API admin: 403 per un cliente autenticato', async () => {
  for (const [method, url] of ADMIN_ROUTES) {
    const res = await api.request(method, url, {
      body: method === 'GET' ? undefined : {},
      cookie: customer
    });
    assert.equal(res.status, 403, `${method} ${url}`);
  }
});

test('API cliente: 401 senza sessione', async () => {
  for (const [method, url] of CUSTOMER_ROUTES) {
    const res = await api.request(method, url, { body: method === 'GET' ? undefined : {} });
    assert.equal(res.status, 401, `${method} ${url}`);
  }
});

test('un cliente non può cancellare la prenotazione di un altro', async () => {
  const { findService, futureWeekday, bookingPayload } = require('./helpers');
  const other = await api.registerAndLogin(makeUser('authz-other'));
  const day = futureWeekday(2);
  const service = findService('Tagliando olio + filtro');
  const created = await api.request('POST', '/api/bookings', {
    cookie: other,
    body: bookingPayload(service, day, '09:00')
  });
  assert.equal(created.status, 201);

  const res = await api.request('DELETE', '/api/bookings', {
    cookie: customer,
    body: { giorno: day, ora: '09:00' }
  });
  assert.equal(res.status, 400);
  const list = await api.request('GET', '/api/bookings', { cookie: other });
  assert.equal(list.data.bookings.length, 1);
});

test('endpoint sconosciuto: 404 JSON', async () => {
  const res = await api.request('GET', '/api/non-esiste');
  assert.equal(res.status, 404);
  assert.ok(res.data.error);
});
