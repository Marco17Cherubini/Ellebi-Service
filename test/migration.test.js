// Migrazione automatica da uno schema precedente (database sintetico creato dal test)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { configureTestEnv, startTestServer, futureWeekday } = require('./helpers');

let api;
let dbPath;

// Schema della prima versione (4 tabelle, servizio NOT NULL, nessuna colonna v2)
async function createLegacyDatabase(file) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, cognome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL, telefono TEXT NOT NULL, password TEXT NOT NULL,
    vip INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, cognome TEXT NOT NULL,
    email TEXT NOT NULL, telefono TEXT NOT NULL, giorno TEXT NOT NULL, ora TEXT NOT NULL,
    servizio TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL)`);
  db.run(`CREATE TABLE holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT, giorno TEXT NOT NULL, ora TEXT NOT NULL,
    UNIQUE(giorno, ora))`);
  db.run('INSERT INTO users (nome, cognome, email, telefono, password) VALUES (?, ?, ?, ?, ?)', [
    'Vecchio',
    'Cliente',
    'vecchio@test.local',
    '3330000000',
    bcrypt.hashSync('Password123!', 10)
  ]);
  db.run(
    'INSERT INTO bookings (nome, cognome, email, telefono, giorno, ora, servizio) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      'Vecchio',
      'Cliente',
      'vecchio@test.local',
      '3330000000',
      futureWeekday(2, 6),
      '09:00',
      'Tagliando'
    ]
  );
  db.run("INSERT INTO holidays (giorno, ora) VALUES ('2030-08-14', '08:30')");
  fs.writeFileSync(file, Buffer.from(db.export()));
  db.close();
}

before(async () => {
  dbPath = configureTestEnv();
  await createLegacyDatabase(dbPath);
  api = await startTestServer();
});

after(() => api.close());

test('migrazione: dati e login esistenti preservati, nuove tabelle e colonne create al primo avvio', async () => {
  const { getRawDatabase, bookingsDB, holidaysDB, servicesDB } = require('../server/database');
  const columns = table =>
    getRawDatabase()
      .exec(`PRAGMA table_info(${table})`)[0]
      .values.map(c => ({ name: c[1], notnull: c[3] }));

  const bookingCols = columns('bookings');
  for (const name of [
    'service_id',
    'targa',
    'tipo',
    'stato',
    'deposit_id',
    'durata_minuti',
    'token'
  ]) {
    assert.ok(
      bookingCols.some(c => c.name === name),
      name
    );
  }
  assert.equal(bookingCols.find(c => c.name === 'servizio').notnull, 0);
  for (const name of ['banned', 'isGuest', 'last_active_at']) {
    assert.ok(
      columns('users').some(c => c.name === name),
      name
    );
  }

  const legacy = bookingsDB.findOne(b => b.email === 'vecchio@test.local');
  assert.equal(legacy.ora, '09:00');
  assert.equal(legacy.tipo, 'cliente');
  assert.equal(holidaysDB.readAll().length, 1);
  assert.ok(servicesDB.readAll().length >= 10);

  const login = await api.login('vecchio@test.local', 'Password123!');
  assert.equal(login.status, 200);
  const mine = await api.request('GET', '/api/bookings', { cookie: login.cookie });
  assert.equal(mine.data.bookings.length, 1);
});
