// Report e date: eseguiti nel fuso dell'officina, dove UTC e data locale differiscono
process.env.TZ = 'Europe/Rome';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, toDateString } = require('./helpers');

let api;
let admin;

before(async () => {
  api = await startTestServer();
  admin = await api.adminCookie();
});

after(() => api.close());

function insertBooking(giorno, ora, extra = {}) {
  const { bookingsDB } = require('../server/database');
  bookingsDB.insert({
    nome: 'Report',
    cognome: 'Test',
    email: 'report@test.local',
    telefono: '',
    giorno,
    ora,
    durata_minuti: 60,
    tipo: 'cliente',
    ...extra
  });
}

function daysAgo(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return toDateString(d);
}

async function weekly() {
  const res = await api.request('GET', '/api/admin/reports/bookings-stats?period=weekly', {
    cookie: admin
  });
  assert.equal(res.status, 200);
  return res.data.counts;
}

test('report settimanale: una prenotazione di oggi è contata nella colonna di oggi', async () => {
  insertBooking(daysAgo(0), '09:00');
  insertBooking(daysAgo(2), '10:00');
  const counts = await weekly();
  assert.equal(counts[6], 1);
  assert.equal(counts[4], 1);
});

test('report: i blocchi di lavoro straordinario non contano come prenotazioni (D-4)', async () => {
  const before = (await weekly()).reduce((a, b) => a + b, 0);
  insertBooking(daysAgo(1), '14:30', {
    service_id: 'extra_work',
    deposit_id: 1,
    durata_minuti: 15
  });
  insertBooking(daysAgo(1), '14:45', {
    service_id: 'extra_work',
    deposit_id: 1,
    durata_minuti: 15
  });
  const afterCount = (await weekly()).reduce((a, b) => a + b, 0);
  assert.equal(afterCount, before);
});
