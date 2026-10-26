// Rate limiting sulle route di autenticazione (limite basso solo per questo file)
process.env.RATE_LIMIT_AUTH_MAX = '3';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

let api;

before(async () => {
  api = await startTestServer();
});

after(() => api.close());

test('dopo troppi tentativi di login dallo stesso IP: 429', async () => {
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    statuses.push((await api.login('nessuno@test.local', 'Sbagliata123!')).status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
});

test("l'header X-Forwarded-For non permette di aggirare il limite", async () => {
  const res = await api.request('POST', '/api/auth/login', {
    body: { email: 'nessuno@test.local', password: 'Sbagliata123!' },
    headers: { 'X-Forwarded-For': '203.0.113.9' }
  });
  assert.equal(res.status, 429);
});
