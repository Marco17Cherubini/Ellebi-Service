// Seed dimostrativo: crea dati coerenti su un database nuovo e rifiuta un database già usato
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { configureTestEnv } = require('./helpers');

const dbPath = configureTestEnv();
console.log = () => {};
const { seed, DEMO_DOMAIN } = require('../server/seed');

after(() => fs.rmSync(dbPath, { force: true }));

test('il seed popola un database nuovo con dati sintetici coerenti', async () => {
  const result = await seed();
  assert.ok(result.clients >= 9);
  assert.ok(result.bookings > 50);

  const { usersDB, depositsDB, bookingsDB, holidaysDB } = require('../server/database');
  const users = usersDB.readAll();
  assert.ok(users.every(u => u.email.endsWith(`@${DEMO_DOMAIN}`)));
  assert.equal(users.filter(u => u.vip === '1').length, 1);
  assert.equal(users.filter(u => u.banned === '1').length, 1);
  assert.equal(users.filter(u => u.isGuest === '1').length, 1);

  const states = depositsDB
    .readAll()
    .map(d => d.stato)
    .sort();
  assert.deepEqual(states, ['completato', 'in_attesa', 'in_corso']);
  assert.equal(bookingsDB.findMany(b => b.service_id === 'extra_work').length, 4);
  assert.ok(holidaysDB.readAll().length > 0);
});

test('il seed si rifiuta di scrivere su un database che contiene prenotazioni', async () => {
  await assert.rejects(seed(), /già prenotazioni/);
});
