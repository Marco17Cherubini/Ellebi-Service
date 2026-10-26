// Persistenza su disco e inizializzazione idempotente
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const {
  configureTestEnv,
  startTestServer,
  makeUser,
  findService,
  futureWeekday,
  bookingPayload
} = require('./helpers');

let api;
let dbPath;

before(async () => {
  dbPath = configureTestEnv();
  api = await startTestServer();
});

after(() => api.close());

test('persistenza: i dati scritti sopravvivono a una nuova apertura del file', async () => {
  const cookie = await api.registerAndLogin(makeUser('persist'));
  const day = futureWeekday(3, 6);
  const res = await api.request('POST', '/api/bookings', {
    cookie,
    body: bookingPayload(findService('Freni'), day, '14:30')
  });
  assert.equal(res.status, 201);

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const reopened = new SQL.Database(fs.readFileSync(dbPath));
  const rows = reopened.exec(`SELECT ora FROM bookings WHERE giorno = '${day}'`);
  reopened.close();
  assert.equal(rows[0].values[0][0], '14:30');
});

test('una seconda inizializzazione sullo stesso file è idempotente', async () => {
  const database = require('../server/database');
  const before = database.servicesDB.readAll().length;
  const users = database.usersDB.readAll().length;
  await database.initDatabase();
  assert.equal(database.servicesDB.readAll().length, before);
  assert.equal(database.usersDB.readAll().length, users);
  assert.equal(database.adminDB.readAll().length, 1);
});
