// Lavori straordinari: i blocchi pianificati dall'officina occupano davvero l'agenda
// (per clienti, ospiti e officina) e sono legati al deposito.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  startTestServer,
  makeUser,
  findService,
  futureWeekday,
  bookingPayload,
  slotAt
} = require('./helpers');

let api;
let admin;
let customer;
let depositId;
const day = futureWeekday(3, 4); // un mercoledì futuro, orario pieno

before(async () => {
  api = await startTestServer();
  admin = await api.adminCookie();
  customer = await api.registerAndLogin(makeUser('straordinario'));
  const res = await api.request('POST', '/api/bookings', {
    cookie: customer,
    body: bookingPayload(findService('Distribuzione'), futureWeekday(1, 4), '08:30')
  });
  assert.equal(res.status, 201);
  depositId = res.data.deposit.id;
});

after(() => api.close());

// Esattamente il payload che invia il calendario admin (campi giorno/ora)
function schedule(slots) {
  return api.request('POST', `/api/admin/deposits/${depositId}/schedule`, {
    cookie: admin,
    body: { slots }
  });
}

test("pianificare un'ora di lavoro crea quattro blocchi collegati e porta il deposito in corso", async () => {
  const slots = ['10:00', '10:15', '10:30', '10:45'].map(ora => ({ giorno: day, ora }));
  const res = await schedule(slots);
  assert.equal(res.status, 200);
  assert.equal(res.data.deposit.stato, 'in_corso');

  const all = await api.request('GET', '/api/admin/bookings', { cookie: admin });
  const blocks = all.data.bookings.filter(
    b => b.service_id === 'extra_work' && String(b.deposit_id) === String(depositId)
  );
  assert.deepEqual(blocks.map(b => b.ora).sort(), ['10:00', '10:15', '10:30', '10:45']);
  assert.ok(blocks.every(b => b.giorno === day && b.durata_minuti === '15'));
});

test("i quarti d'ora pianificati non sono più prenotabili da ospiti e clienti", async () => {
  const pub = await api.request('GET', `/api/slots/${day}`);
  for (const ora of ['10:00', '10:15', '10:30', '10:45']) {
    assert.equal(slotAt(pub.data.slots, ora).available, false, ora);
  }
  assert.equal(slotAt(pub.data.slots, '11:00').available, true);

  // Un servizio di 90 minuti non può iniziare se finirebbe dentro il lavoro
  const freni = findService('Freni');
  const svc = await api.request('GET', `/api/slots/${day}/${freni.id}`);
  assert.equal(slotAt(svc.data.slots, '09:00').available, false);
  assert.equal(slotAt(svc.data.slots, '08:30').available, true); // finisce alle 10:00

  const booking = await api.request('POST', '/api/bookings', {
    cookie: customer,
    body: bookingPayload(freni, day, '09:00')
  });
  assert.equal(booking.status, 400);
});

test("anche l'officina non può sovrapporre un appuntamento o altri blocchi", async () => {
  const res = await api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: { cognome: 'Rossi', giorno: day, ora: '10:30', serviceId: findService('Freni').id }
  });
  assert.equal(res.status, 400);

  // Tutto o niente: se un solo quarto d'ora è occupato non si pianifica nulla
  const before = (await api.request('GET', '/api/admin/bookings', { cookie: admin })).data.bookings
    .length;
  const clash = await schedule([
    { giorno: day, ora: '11:00' },
    { giorno: day, ora: '10:45' }
  ]);
  assert.equal(clash.status, 400);
  const afterCount = (await api.request('GET', '/api/admin/bookings', { cookie: admin })).data
    .bookings.length;
  assert.equal(afterCount, before);
});
