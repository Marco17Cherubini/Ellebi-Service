// Prenotazioni lato cliente e ospite, consegne con deposito, modifiche e cancellazioni.
// I test con `todo` descrivono il comportamento atteso per bug noti (docs/refactoring-plan.md):
// vengono eseguiti ma non fanno fallire la suite finché il bug non è corretto.
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
let mario;
let luigi;
let admin;

before(async () => {
  api = await startTestServer();
  mario = await api.registerAndLogin(makeUser('mario'));
  luigi = await api.registerAndLogin(makeUser('luigi'));
  admin = await api.adminCookie();
});

after(() => api.close());

function book(cookie, service, day, time, extra) {
  return api.request('POST', '/api/bookings', {
    cookie,
    body: bookingPayload(service, day, time, extra)
  });
}

function depositsDB() {
  return require('../server/database').depositsDB;
}

function bookingsDB() {
  return require('../server/database').bookingsDB;
}

async function setMaxDeposits(value) {
  const res = await api.request('PUT', '/api/settings/maxDeposits', {
    cookie: admin,
    body: { maxDeposits: value }
  });
  assert.equal(res.status, 200);
}

test('un cliente prenota uno slot libero e lo ritrova tra le sue prenotazioni', async () => {
  const day = futureWeekday(2);
  const olio = findService('Tagliando olio + filtro');
  const res = await book(mario, olio, day, '09:00');
  assert.equal(res.status, 201);
  assert.equal(res.data.booking.giorno, day);
  assert.equal(res.data.booking.durata_minuti, '60');
  assert.equal(res.data.booking.targa, 'AB123CD');

  const list = await api.request('GET', '/api/bookings', { cookie: mario });
  const mine = list.data.bookings.find(b => b.giorno === day && b.ora === '09:00');
  assert.equal(mine.servizio, 'Tagliando olio + filtro');

  const slots = await api.request('GET', `/api/slots/${day}`);
  assert.equal(slotAt(slots.data.slots, '09:00').available, false);
});

test('prenotazioni sovrapposte (anche solo in parte) vengono rifiutate', async () => {
  const day = futureWeekday(3);
  const completo = findService('Tagliando completo'); // 120 minuti
  const olio = findService('Tagliando olio + filtro');
  assert.equal((await book(mario, completo, day, '08:30')).status, 201); // 08:30-10:30
  assert.equal((await book(luigi, olio, day, '08:30')).status, 400);
  assert.equal((await book(luigi, olio, day, '10:00')).status, 400);
  assert.equal((await book(luigi, olio, day, '10:30')).status, 201);
});

test('richieste parallele sullo stesso slot: ne passa una sola', async () => {
  const day = futureWeekday(4);
  const olio = findService('Tagliando olio + filtro');
  const cookies = [];
  for (let i = 0; i < 8; i++) cookies.push(await api.registerAndLogin(makeUser(`par${i}`)));
  const results = await Promise.all(cookies.map(c => book(c, olio, day, '14:30')));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 400).length, 7);
  assert.equal(bookingsDB().findMany(b => b.giorno === day).length, 1);
});

test('una prenotazione senza servizio o con un servizio inesistente viene rifiutata', async () => {
  const day = futureWeekday(1, 8);
  const noService = await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: day, orario: '09:00' }
  });
  assert.equal(noService.status, 400);
  const unknown = await api.request('POST', '/api/bookings', {
    cookie: mario,
    body: { data: day, orario: '09:00', serviceId: 9999 }
  });
  assert.equal(unknown.status, 400);
});

test('dati mancanti o malformati: 400', async () => {
  const olio = findService('Tagliando olio + filtro');
  const day = futureWeekday(2, 4);
  assert.equal((await book(mario, olio, '', '09:00')).status, 400);
  assert.equal((await book(mario, olio, '26/10/2030', '09:00')).status, 400);
  assert.equal((await book(mario, olio, day, '9:00')).status, 400);
  assert.equal((await book(mario, olio, futureWeekday(0), '09:00')).status, 400);
  assert.equal((await book(mario, olio, '2020-01-07', '09:00')).status, 400);
});

test('il cliente cancella la propria prenotazione e lo slot torna libero', async () => {
  const day = futureWeekday(5);
  const olio = findService('Tagliando olio + filtro');
  assert.equal((await book(mario, olio, day, '11:00')).status, 201);
  const del = await api.request('DELETE', '/api/bookings', {
    cookie: mario,
    body: { giorno: day, ora: '11:00' }
  });
  assert.equal(del.status, 200);
  const slots = await api.request('GET', `/api/slots/${day}`);
  assert.equal(slotAt(slots.data.slots, '11:00').available, true);
});

test('modifica: la vecchia prenotazione viene sostituita dalla nuova', async () => {
  const day = futureWeekday(2, 5);
  const olio = findService('Tagliando olio + filtro');
  assert.equal((await book(mario, olio, day, '09:00')).status, 201);
  const moved = await book(mario, olio, day, '15:00', { old_giorno: day, old_ora: '09:00' });
  assert.equal(moved.status, 201);
  const mine = (await api.request('GET', '/api/bookings', { cookie: mario })).data.bookings;
  assert.ok(mine.some(b => b.giorno === day && b.ora === '15:00'));
  assert.ok(!mine.some(b => b.giorno === day && b.ora === '09:00'));
});

test('modifica verso uno slot occupato: la prenotazione originale resta invariata', async () => {
  const day = futureWeekday(3, 5);
  const olio = findService('Tagliando olio + filtro');
  assert.equal((await book(mario, olio, day, '09:00')).status, 201);
  assert.equal((await book(luigi, olio, day, '15:00')).status, 201);
  const moved = await book(mario, olio, day, '15:00', { old_giorno: day, old_ora: '09:00' });
  assert.equal(moved.status, 400);
  const mine = (await api.request('GET', '/api/bookings', { cookie: mario })).data.bookings;
  assert.ok(mine.some(b => b.giorno === day && b.ora === '09:00'));
});

test('prenotazione ospite: crea un profilo senza password e la prenotazione', async () => {
  const day = futureWeekday(4, 5);
  const olio = findService('Tagliando olio + filtro');
  const res = await api.request('POST', '/api/bookings/guest', {
    body: {
      nome: 'Sara',
      cognome: 'Neri',
      email: 'Sara.Neri@Test.local',
      telefono: '3331111111',
      giorno: day,
      ora: '10:00',
      serviceId: olio.id,
      durata_minuti: 60,
      targa: 'ef456gh',
      modello: 'VW Golf'
    }
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.booking.email, 'sara.neri@test.local');
  assert.equal(res.data.booking.targa, 'EF456GH');
  const { usersDB } = require('../server/database');
  const guest = usersDB.findOne(u => u.email === 'sara.neri@test.local');
  assert.equal(guest.isGuest, '1');
  assert.equal(guest.password, '');
});

test('prenotazione ospite: dati obbligatori ed email validati', async () => {
  const base = {
    nome: 'A',
    cognome: 'B',
    email: 'a@test.local',
    giorno: futureWeekday(4),
    ora: '09:00'
  };
  for (const body of [
    { ...base, nome: '' },
    { ...base, email: 'non-valida' },
    { ...base, giorno: '' }
  ]) {
    assert.equal((await api.request('POST', '/api/bookings/guest', { body })).status, 400);
  }
});

test('consegna veicolo: appuntamento di 30 minuti + deposito "in attesa"', async () => {
  const day = futureWeekday(1, 6);
  const distribuzione = findService('Distribuzione');
  const res = await book(mario, distribuzione, day, '08:30', { note_cliente: 'Rumore' });
  assert.equal(res.status, 201);
  assert.equal(res.data.booking.tipo, 'deposito');
  assert.equal(res.data.booking.durata_minuti, '30');
  assert.equal(res.data.deposit.stato, 'in_attesa');
  assert.equal(res.data.deposit.servizio, 'Distribuzione');
  assert.equal(res.data.deposit.booking_id, res.data.booking.id);
});

test('consegna veicolo: prenotazione e deposito sono collegati dai loro id reali', async () => {
  const res = await book(mario, findService('Distribuzione'), futureWeekday(1, 6), '10:00');
  assert.equal(res.status, 201);
  const stored = depositsDB().findOne(d => d.booking_id === res.data.booking.id);
  assert.equal(res.data.deposit.id, stored.id);
  assert.equal(bookingsDB().findOne(b => b.id === res.data.booking.id).deposit_id, stored.id);
});

test('consegna veicolo: targa e modello obbligatori', async () => {
  const distribuzione = findService('Distribuzione');
  const res = await book(mario, distribuzione, futureWeekday(1, 6), '10:00', { targa: '' });
  assert.equal(res.status, 400);
});

test('consegna veicolo: rifiutata quando il limite di depositi attivi è raggiunto', async () => {
  const active = depositsDB().findMany(d => d.stato !== 'completato').length;
  await setMaxDeposits(active);
  const res = await book(luigi, findService('Distribuzione'), futureWeekday(2, 6), '08:30');
  assert.equal(res.status, 400);
  assert.match(res.data.error, /Limite depositi/);
  await setMaxDeposits(5);
});

test('modifica verso una consegna con limite raggiunto: la prenotazione originale resta', async () => {
  const day = futureWeekday(3, 6);
  const olio = findService('Tagliando olio + filtro');
  assert.equal((await book(luigi, olio, day, '09:00')).status, 201);
  const active = depositsDB().findMany(d => d.stato !== 'completato').length;
  await setMaxDeposits(active);
  try {
    const res = await book(luigi, findService('Distribuzione'), day, '15:00', {
      old_giorno: day,
      old_ora: '09:00'
    });
    assert.equal(res.status, 400);
    assert.equal(bookingsDB().findMany(b => b.giorno === '1970-01-01').length, 0);
    const mine = (await api.request('GET', '/api/bookings', { cookie: luigi })).data.bookings;
    assert.ok(mine.some(b => b.giorno === day && b.ora === '09:00'));
  } finally {
    await setMaxDeposits(5);
  }
});

test(
  'cancellare una consegna elimina anche il deposito collegato',
  { todo: 'P08: la cancellazione del cliente lascia il deposito orfano' },
  async () => {
    const day = futureWeekday(4, 6);
    const res = await book(mario, findService('Revisione sospensioni', 'moto'), day, '14:30');
    assert.equal(res.status, 201);
    const bookingId = res.data.booking.id;
    assert.ok(depositsDB().findOne(d => d.booking_id === bookingId));
    const del = await api.request('DELETE', '/api/bookings', {
      cookie: mario,
      body: { giorno: day, ora: '14:30' }
    });
    assert.equal(del.status, 200);
    assert.equal(
      depositsDB().findOne(d => d.booking_id === bookingId),
      undefined
    );
  }
);

test('la durata viene dal listino, non dal client', async () => {
  const day = futureWeekday(5, 6);
  const completo = findService('Tagliando completo'); // 120 minuti
  const res = await book(mario, completo, day, '08:30', { durata_minuti: 15 });
  assert.equal(res.status, 201);
  assert.equal(res.data.booking.durata_minuti, '120');
  const slots = await api.request('GET', `/api/slots/${day}`);
  assert.equal(slotAt(slots.data.slots, '10:00').available, false);
});

test('un servizio disattivato non è prenotabile', async () => {
  const freni = findService('Freni');
  await api.request('PUT', `/api/admin/services/${freni.id}`, {
    cookie: admin,
    body: { attivo: 0 }
  });
  try {
    const res = await book(mario, freni, futureWeekday(1, 7), '09:00');
    assert.equal(res.status, 400);
  } finally {
    await api.request('PUT', `/api/admin/services/${freni.id}`, {
      cookie: admin,
      body: { attivo: 1 }
    });
  }
});

test('clienti e ospiti non possono prenotare fuori orario né scavalcare la pausa pranzo', async () => {
  const day = futureWeekday(2, 7);
  const olio = findService('Tagliando olio + filtro');
  assert.equal((await book(mario, olio, day, '21:00')).status, 400);
  assert.equal((await book(mario, olio, day, '12:00')).status, 400); // 12:00-13:00
  const guest = await api.request('POST', '/api/bookings/guest', {
    body: {
      nome: 'Ospite',
      cognome: 'Serale',
      email: 'serale@test.local',
      giorno: day,
      ora: '22:30',
      serviceId: olio.id,
      targa: 'AA111AA',
      modello: 'Panda'
    }
  });
  assert.equal(guest.status, 400);
});

test('un VIP può prenotare negli orari estesi', async () => {
  const user = makeUser('vipbook');
  const vip = await api.registerAndLogin(user);
  await api.request('PUT', `/api/admin/users/${encodeURIComponent(user.email)}/vip`, {
    cookie: admin
  });
  const res = await book(vip, findService('Tagliando olio + filtro'), futureWeekday(3, 7), '19:30');
  assert.equal(res.status, 201);
});

test('veicoli: il cliente salva un veicolo, senza duplicati per targa', async () => {
  const first = await api.request('POST', '/api/vehicles', {
    cookie: mario,
    body: { targa: 'zz999zz', modello: 'Fiat Uno' }
  });
  assert.equal(first.status, 201);
  assert.equal(first.data.vehicle.targa, 'ZZ999ZZ');
  const dup = await api.request('POST', '/api/vehicles', {
    cookie: mario,
    body: { targa: 'ZZ999ZZ', modello: 'Fiat Uno' }
  });
  assert.equal(dup.data.duplicate, true);
  assert.equal(
    (await api.request('POST', '/api/vehicles', { cookie: mario, body: {} })).status,
    400
  );
  const list = await api.request('GET', '/api/vehicles', { cookie: mario });
  assert.equal(list.data.vehicles.length, 1);
});

test('prenotazione ospite rifiutata: nessun profilo ospite resta nel database', async () => {
  const { usersDB } = require('../server/database');
  const res = await api.request('POST', '/api/bookings/guest', {
    body: {
      nome: 'Rifiutato',
      cognome: 'Ospite',
      email: 'rifiutato@test.local',
      giorno: futureWeekday(0),
      ora: '09:00'
    }
  });
  assert.equal(res.status, 400);
  assert.equal(
    usersDB.findOne(u => u.email === 'rifiutato@test.local'),
    undefined
  );
});

test('consegna con deposito non valido: nessuna prenotazione orfana', async () => {
  const day = futureWeekday(5, 7);
  const res = await book(mario, findService('Distribuzione'), day, '08:30', { modello: '' });
  assert.equal(res.status, 400);
  assert.equal(bookingsDB().findMany(b => b.giorno === day).length, 0);
});
