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

test('salvataggio atomico: nessun file temporaneo residuo e file sempre leggibile', async () => {
  const { usersDB } = require('../server/database');
  for (let i = 0; i < 5; i++) {
    usersDB.insert({
      nome: 'Atomico',
      cognome: String(i),
      email: `atomico${i}@test.local`,
      telefono: '',
      password: ''
    });
    assert.equal(fs.existsSync(dbPath + '.tmp'), false);
  }
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const reopened = new SQL.Database(fs.readFileSync(dbPath));
  const count = reopened.exec("SELECT COUNT(*) FROM users WHERE nome = 'Atomico'")[0].values[0][0];
  reopened.close();
  assert.equal(count, 5);
});

test("insert restituisce l'id reale del record creato", () => {
  const { vehiclesDB } = require('../server/database');
  const first = vehiclesDB.insert({ user_id: 1, targa: 'ID001', modello: 'A' });
  const second = vehiclesDB.insert({ user_id: 1, targa: 'ID002', modello: 'B' });
  assert.ok(first > 0);
  assert.equal(second, first + 1);
  assert.equal(vehiclesDB.findOne(v => v.id === String(second)).targa, 'ID002');
});

test('withTransaction: un errore annulla tutte le scritture e il file su disco non cambia', () => {
  const { withTransaction, holidaysDB, bookingsDB } = require('../server/database');
  const before = fs.readFileSync(dbPath);
  assert.throws(() =>
    withTransaction(() => {
      holidaysDB.insert({ giorno: '2031-01-07', ora: '08:30' });
      bookingsDB.insert({
        nome: 'T',
        cognome: 'X',
        email: 't@test.local',
        telefono: '',
        giorno: '2031-01-07',
        ora: '09:00'
      });
      throw new Error('errore simulato');
    })
  );
  assert.equal(holidaysDB.findMany(h => h.giorno === '2031-01-07').length, 0);
  assert.equal(bookingsDB.findMany(b => b.giorno === '2031-01-07').length, 0);
  assert.ok(fs.readFileSync(dbPath).equals(before));
});

test('withTransaction: in caso di successo salva una volta tutte le scritture', () => {
  const { withTransaction, holidaysDB } = require('../server/database');
  withTransaction(() => {
    holidaysDB.insert({ giorno: '2031-01-08', ora: '08:30' });
    holidaysDB.insert({ giorno: '2031-01-08', ora: '08:45' });
  });
  assert.equal(holidaysDB.findMany(h => h.giorno === '2031-01-08').length, 2);
});
