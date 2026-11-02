// Regole lato cliente emerse nella Fase 2: dati esposti, prenotazioni già iniziate,
// stagionalità sulla data prenotata, dati dell'ospite, blocchi di lavoro storici, validazioni.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  startTestServer,
  makeUser,
  findService,
  futureWeekday,
  bookingPayload,
  toDateString
} = require('./helpers');

let api;
let admin;

before(async () => {
  api = await startTestServer();
  admin = await api.adminCookie();
});

after(() => api.close());

function db() {
  return require('../server/database');
}

function book(cookie, service, day, time, extra) {
  return api.request('POST', '/api/bookings', {
    cookie,
    body: bookingPayload(service, day, time, extra)
  });
}

// Prenotazione "già iniziata": inserita direttamente con data di ieri
function insertPastBooking(email, service, extra = {}) {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const id = db().bookingsDB.insert({
    nome: 'Mario',
    cognome: 'Passato',
    email,
    telefono: '3330000000',
    giorno: toDateString(d),
    ora: '09:00',
    token: 'past-' + Date.now() + Math.random(),
    service_id: service.id,
    durata_minuti: 60,
    tipo: 'cliente',
    ...extra
  });
  return db().bookingsDB.findOne(b => String(b.id) === String(id));
}

test('le prenotazioni del cliente non espongono note interne né token', async () => {
  const cookie = await api.registerAndLogin(makeUser('privacy'));
  const day = futureWeekday(2);
  const created = await book(cookie, findService('Freni'), day, '09:00');
  assert.equal(created.status, 201);
  assert.equal(created.data.booking.token, undefined);
  assert.equal(created.data.booking.nota_interna, undefined);

  db().bookingsDB.update(b => b.giorno === day && b.ora === '09:00', {
    nota_interna: 'Cliente difficile, chiedere anticipo'
  });
  const list = await api.request('GET', '/api/bookings', { cookie });
  const mine = list.data.bookings.find(b => b.giorno === day);
  assert.ok(mine);
  assert.equal(mine.nota_interna, undefined);
  assert.equal(mine.token, undefined);
  assert.equal(mine.servizio, 'Freni');
});

test('il listino pubblico non espone il prezzo interno', async () => {
  const res = await api.request('GET', '/api/services');
  assert.equal(res.status, 200);
  assert.ok(res.data.services.length > 0);
  for (const s of res.data.services) {
    assert.equal(s.prezzo_interno, undefined);
    assert.ok(s.nome && s.tipo_veicolo && s.tipo_servizio);
  }
});

test('il cliente non può cancellare né modificare una prenotazione già iniziata', async () => {
  const user = makeUser('passato');
  const cookie = await api.registerAndLogin(user);
  const olio = findService('Tagliando olio + filtro');
  const past = insertPastBooking(user.email, olio);

  const del = await api.request('DELETE', '/api/bookings', {
    cookie,
    body: { giorno: past.giorno, ora: past.ora }
  });
  assert.equal(del.status, 400);
  assert.ok(db().bookingsDB.findOne(b => b.id === past.id));

  const day = futureWeekday(3);
  const edit = await book(cookie, olio, day, '10:00', {
    old_giorno: past.giorno,
    old_ora: past.ora
  });
  assert.equal(edit.status, 400);
  assert.ok(db().bookingsDB.findOne(b => b.id === past.id));
  assert.equal(
    db().bookingsDB.findOne(b => b.giorno === day && b.ora === '10:00'),
    undefined
  );

  // L'officina può ancora cancellarla
  const adminDel = await api.request('DELETE', '/api/admin/bookings', {
    cookie: admin,
    body: { giorno: past.giorno, ora: past.ora }
  });
  assert.equal(adminDel.status, 200);
});

test('una consegna con il veicolo già in lavorazione non si cancella dal lato cliente', async () => {
  const user = makeUser('inlavorazione');
  const cookie = await api.registerAndLogin(user);
  const day = futureWeekday(1, 3);
  const res = await book(cookie, findService('Distribuzione'), day, '08:30');
  assert.equal(res.status, 201);
  const depositId = res.data.deposit.id;

  const workDay = futureWeekday(2, 3);
  const schedule = await api.request('POST', `/api/admin/deposits/${depositId}/schedule`, {
    cookie: admin,
    body: { slots: [{ date: workDay, time: '14:30' }] }
  });
  assert.equal(schedule.status, 200);

  const del = await api.request('DELETE', '/api/bookings', {
    cookie,
    body: { giorno: day, ora: '08:30' }
  });
  assert.equal(del.status, 400);
  assert.ok(db().depositsDB.findOne(d => String(d.id) === String(depositId)));
  assert.equal(
    db().bookingsDB.findMany(
      b => String(b.deposit_id) === String(depositId) && b.service_id === 'extra_work'
    ).length,
    1
  );
});

test('stagionalità: si verifica sulla data prenotata, non su quella odierna', async () => {
  const { servicesDB } = db();
  const id = servicesDB.insert({
    nome: 'Servizio solo agosto',
    tipo_veicolo: 'auto',
    tipo_servizio: 'appuntamento',
    durata_minuti: 30,
    attivo: 1,
    stagionale: 1,
    data_inizio_stagione: '08-01',
    data_fine_stagione: '08-31'
  });
  const service = servicesDB.findOne(s => String(s.id) === String(id));

  // Un lunedì di settembre di un anno futuro: fuori stagione
  const outOfSeason = nextWeekdayInMonth(8, 1);
  const inSeason = nextWeekdayInMonth(7, 1);

  const slotsOut = await api.request('GET', `/api/slots/${outOfSeason}/${id}`);
  assert.equal(slotsOut.status, 200);
  assert.equal(slotsOut.data.slots.filter(s => s.available).length, 0);
  assert.equal(slotsOut.data.outOfSeason, true);

  const slotsIn = await api.request('GET', `/api/slots/${inSeason}/${id}`);
  assert.ok(slotsIn.data.slots.some(s => s.available));

  const cookie = await api.registerAndLogin(makeUser('stagione'));
  const out = await book(cookie, service, outOfSeason, '09:00');
  assert.equal(out.status, 400);
  const ok = await book(cookie, service, inSeason, '09:00');
  assert.equal(ok.status, 201);
});

// Prima data futura (anno prossimo) nel mese indicato (0 = gennaio) con quel giorno della settimana
function nextWeekdayInMonth(month, weekday) {
  const d = new Date(new Date().getFullYear() + 1, month, 1, 12);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return toDateString(d);
}

test("prenotazione ospite: telefono e nome digitati arrivano all'officina", async () => {
  const day = futureWeekday(4, 3);
  const res = await api.request('POST', '/api/bookings/guest', {
    body: {
      nome: 'Elena',
      cognome: 'Verdi',
      email: 'elena.verdi@test.local',
      telefono: '3471234567',
      data: day,
      orario: '09:00',
      serviceId: findService('Freni').id,
      targa: 'ZZ999ZZ',
      modello: 'Fiat Punto'
    }
  });
  assert.equal(res.status, 201);
  const saved = db().bookingsDB.findOne(b => b.giorno === day && b.ora === '09:00');
  assert.equal(saved.telefono, '3471234567');
  assert.equal(saved.nome, 'Elena');
  assert.equal(res.data.booking.token, undefined);
});

test('un cliente sospeso non può aggirare il blocco prenotando come ospite', async () => {
  const user = makeUser('sospeso2');
  await api.request('POST', '/api/auth/register', { body: user });
  db().usersDB.update(u => u.email === user.email, { banned: '1' });

  const res = await api.request('POST', '/api/bookings/guest', {
    body: {
      nome: 'Mario',
      cognome: 'Sospeso',
      email: user.email,
      telefono: '3330000000',
      data: futureWeekday(5, 3),
      orario: '09:00',
      serviceId: findService('Freni').id,
      targa: 'AA111AA',
      modello: 'Fiat Uno'
    }
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /contatta/i);
});

test('consegna riconosciuta dal tipo di servizio, anche per listini storici con il nome', async () => {
  const { servicesDB } = db();
  const catalog = require('../server/catalogService');
  // Dopo la migrazione all'avvio nessun servizio di consegna dipende più dal nome
  const legacy = { nome: 'Consegna per carrozzeria', tipo_servizio: 'appuntamento' };
  assert.equal(catalog.isConsegnaService(legacy), false);
  assert.equal(
    catalog.isConsegnaService({ nome: 'Distribuzione', tipo_servizio: 'consegna' }),
    true
  );
  const distribuzione = servicesDB.findOne(s => s.nome === 'Distribuzione');
  assert.equal(distribuzione.tipo_servizio, 'consegna');
});

test('completare un deposito libera solo i blocchi di lavoro futuri', async () => {
  const cookie = await api.registerAndLogin(makeUser('storico'));
  const day = futureWeekday(1, 4);
  const res = await book(cookie, findService('Distribuzione'), day, '09:00');
  const depositId = res.data.deposit.id;

  // Un blocco già svolto (ieri) e uno futuro
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  db().bookingsDB.insert({
    nome: 'Mario',
    cognome: 'Storico',
    email: 'interno@test.local',
    telefono: '',
    giorno: toDateString(yesterday),
    ora: '10:00',
    service_id: 'extra_work',
    deposit_id: depositId,
    durata_minuti: 15,
    tipo: 'deposito'
  });
  await api.request('POST', `/api/admin/deposits/${depositId}/schedule`, {
    cookie: admin,
    body: { slots: [{ date: futureWeekday(2, 4), time: '15:00' }] }
  });

  const done = await api.request('POST', `/api/admin/deposits/${depositId}/status`, {
    cookie: admin,
    body: { stato: 'completato' }
  });
  assert.equal(done.status, 200);
  const blocks = db().bookingsDB.findMany(
    b => String(b.deposit_id) === String(depositId) && b.service_id === 'extra_work'
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].giorno, toDateString(yesterday));
});

test('ferie, capacità e ore residue: valori non validi rifiutati', async () => {
  const badHoliday = await api.request('POST', '/api/admin/holidays', {
    cookie: admin,
    body: { slots: [{ giorno: 'domani', ora: '9' }] }
  });
  assert.equal(badHoliday.status, 400);

  for (const maxDeposits of [2.5, -1, '3']) {
    const res = await api.request('PUT', '/api/settings/maxDeposits', {
      cookie: admin,
      body: { maxDeposits }
    });
    assert.equal(res.status, 400);
  }

  const cookie = await api.registerAndLogin(makeUser('ore'));
  const res = await book(cookie, findService('Distribuzione'), futureWeekday(3, 4), '09:00');
  const ore = await api.request('PUT', `/api/admin/deposits/${res.data.deposit.id}/ore`, {
    cookie: admin,
    body: { ore_residue: 'tante' }
  });
  assert.equal(ore.status, 400);
});

test('ultimo posto deposito: due richieste simultanee, una sola consegna accettata', async () => {
  const { getActiveDepositCount } = require('../server/depositService');
  const count = getActiveDepositCount();
  await api.request('PUT', '/api/settings/maxDeposits', {
    cookie: admin,
    body: { maxDeposits: count + 1 }
  });
  const a = await api.registerAndLogin(makeUser('corsaA'));
  const b = await api.registerAndLogin(makeUser('corsaB'));
  const service = findService('Distribuzione');
  const [ra, rb] = await Promise.all([
    book(a, service, futureWeekday(4, 5), '09:00'),
    book(b, service, futureWeekday(4, 5), '10:00')
  ]);
  assert.deepEqual([ra.status, rb.status].sort(), [201, 400]);
  assert.equal(getActiveDepositCount(), count + 1);
  await api.request('PUT', '/api/settings/maxDeposits', {
    cookie: admin,
    body: { maxDeposits: 50 }
  });
});

test('stesso slot richiesto due volte insieme (doppio invio): una sola prenotazione', async () => {
  const cookie = await api.registerAndLogin(makeUser('doppioinvio'));
  const day = futureWeekday(5, 5);
  const service = findService('Freni');
  const results = await Promise.all([1, 2, 3].map(() => book(cookie, service, day, '14:30')));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 400, 400]);
  assert.equal(db().bookingsDB.findMany(b => b.giorno === day).length, 1);
});
