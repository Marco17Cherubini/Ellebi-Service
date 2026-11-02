// Migrazione di un listino storico (Fase 2): la consegna indicata solo dal nome diventa
// esplicita (tipo_servizio = 'consegna'); utenti e admin ricevono la versione di sessione
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { configureTestEnv, startTestServer } = require('./helpers');

let api;

async function createDatabaseWithLegacyCatalog(file) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE services (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, tipo_veicolo TEXT NOT NULL,
    tipo_servizio TEXT NOT NULL, durata_minuti INTEGER DEFAULT 60, prezzo_interno REAL DEFAULT 0,
    campi_extra TEXT DEFAULT '[]', attivo INTEGER DEFAULT 1, stagionale INTEGER DEFAULT 0,
    data_inizio_stagione TEXT DEFAULT '', data_fine_stagione TEXT DEFAULT '')`);
  db.run(
    "INSERT INTO services (nome, tipo_veicolo, tipo_servizio) VALUES ('Consegna per carrozzeria', 'auto', 'appuntamento'), ('Freni', 'auto', 'appuntamento')"
  );
  fs.writeFileSync(file, Buffer.from(db.export()));
  db.close();
}

before(async () => {
  await createDatabaseWithLegacyCatalog(configureTestEnv());
  api = await startTestServer();
});

after(() => api.close());

test('i servizi di consegna indicati dal nome diventano di tipo consegna', async () => {
  const { servicesDB, adminDB } = require('../server/database');
  const byName = nome => servicesDB.findOne(s => s.nome === nome);
  assert.equal(byName('Consegna per carrozzeria').tipo_servizio, 'consegna');
  assert.equal(byName('Freni').tipo_servizio, 'appuntamento');
  assert.ok(adminDB.readAll().every(a => a.session_version === '0'));

  // Il listino pubblico la presenta come consegna con accoglienza da 30 minuti
  const res = await api.request('GET', '/api/services');
  const consegna = res.data.services.find(s => s.nome === 'Consegna per carrozzeria');
  assert.equal(consegna.tipo_servizio, 'consegna');
  assert.equal(consegna.durata_minuti, 30);
});
