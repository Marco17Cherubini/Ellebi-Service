// Pannello admin: prenotazioni, spostamenti, ferie, listino, depositi, impostazioni, clienti, report.
// I test con `todo` descrivono il comportamento atteso per bug noti (docs/refactoring-plan.md).
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
const customerUser = makeUser('admin-cliente');

before(async () => {
  api = await startTestServer();
  admin = await api.adminCookie();
  customer = await api.registerAndLogin(customerUser);
});

after(() => api.close());

function db() {
  return require('../server/database');
}

function adminBook(day, ora, service, extra = {}) {
  return api.request('POST', '/api/admin/bookings', {
    cookie: admin,
    body: {
      nome: 'Paolo',
      cognome: 'Gialli',
      email: 'paolo@test.local',
      telefono: '3332222222',
      giorno: day,
      ora,
      serviceId: service.id,
      durata_minuti: service.durata_minuti,
      targa: 'IJ789KL',
      modello: 'Ford Fiesta',
      ...extra
    }
  });
}

test("l'admin crea una prenotazione e la vede nel calendario con il nome del servizio", async () => {
  const day = futureWeekday(2);
  const freni = findService('Freni');
  const res = await adminBook(day, '15:00', freni);
  assert.equal(res.status, 201);
  assert.equal(res.data.booking.durata_minuti, '90');

  const all = await api.request('GET', '/api/admin/bookings', { cookie: admin });
  const found = all.data.bookings.find(b => b.giorno === day && b.ora === '15:00');
  assert.equal(found.servizio, 'Freni');
  assert.equal(found.tipo_veicolo, 'auto');
});

test("anche l'admin non può sovrapporre prenotazioni", async () => {
  const day = futureWeekday(3);
  const freni = findService('Freni');
  assert.equal((await adminBook(day, '09:00', freni)).status, 201);
  assert.equal((await adminBook(day, '10:00', findService('Tagliando olio + filtro'))).status, 400);
});

test("l'admin può usare gli orari estesi", async () => {
  const res = await adminBook(futureWeekday(4), '20:15', findService('Tagliando olio + filtro'));
  assert.equal(res.status, 201);
});

test(
  "il testo libero 'servizio' di una prenotazione admin viene salvato",
  { todo: 'P17: la colonna servizio non è nella whitelist di bookingsDB' },
  async () => {
    const day = futureWeekday(5);
    const res = await api.request('POST', '/api/admin/bookings', {
      cookie: admin,
      body: { cognome: 'Libero', giorno: day, ora: '09:00', servizio: 'Controllo luci' }
    });
    assert.equal(res.status, 201);
    const stored = db().bookingsDB.findOne(b => b.giorno === day && b.ora === '09:00');
    assert.equal(stored.servizio, 'Controllo luci');
  }
);

test("l'admin sposta una prenotazione su uno slot libero e la cancella", async () => {
  const day = futureWeekday(1, 3);
  const olio = findService('Tagliando olio + filtro');
  assert.equal((await adminBook(day, '09:00', olio)).status, 201);
  const move = await api.request('PUT', '/api/admin/bookings', {
    cookie: admin,
    body: { oldGiorno: day, oldOra: '09:00', newGiorno: day, newOra: '14:30' }
  });
  assert.equal(move.status, 200);
  const slots = (await api.request('GET', `/api/slots/${day}`)).data.slots;
  assert.equal(slotAt(slots, '09:00').available, true);
  assert.equal(slotAt(slots, '14:30').available, false);

  const del = await api.request('DELETE', '/api/admin/bookings', {
    cookie: admin,
    body: { giorno: day, ora: '14:30' }
  });
  assert.equal(del.status, 200);
  assert.equal(db().bookingsDB.findMany(b => b.giorno === day).length, 0);
});

test(
  'spostare una prenotazione dentro un intervallo occupato viene rifiutato',
  { todo: "P07: lo spostamento admin controlla solo l'orario di inizio" },
  async () => {
    const day = futureWeekday(2, 3);
    const completo = findService('Tagliando completo');
    assert.equal((await adminBook(day, '08:30', completo)).status, 201); // 08:30-10:30
    assert.equal((await adminBook(day, '14:30', findService('Freni'))).status, 201);
    const move = await api.request('PUT', '/api/admin/bookings', {
      cookie: admin,
      body: { oldGiorno: day, oldOra: '14:30', newGiorno: day, newOra: '09:30' }
    });
    assert.equal(move.status, 400);
  }
);

test(
  'spostare una consegna mantiene il collegamento con il deposito',
  { todo: "P07: lo spostamento elimina e reinserisce la prenotazione cambiando l'id" },
  async () => {
    const day = futureWeekday(3, 3);
    const res = await api.request('POST', '/api/bookings', {
      cookie: customer,
      body: bookingPayload(findService('Distribuzione'), day, '08:30')
    });
    assert.equal(res.status, 201);
    const move = await api.request('PUT', '/api/admin/bookings', {
      cookie: admin,
      body: { oldGiorno: day, oldOra: '08:30', newGiorno: day, newOra: '11:00' }
    });
    assert.equal(move.status, 200);
    const moved = db().bookingsDB.findOne(b => b.giorno === day && b.ora === '11:00');
    assert.ok(db().depositsDB.findOne(d => d.booking_id === moved.id));
  }
);

test("cancellare una consegna dall'admin elimina anche il deposito", async () => {
  const day = futureWeekday(4, 3);
  const res = await api.request('POST', '/api/bookings', {
    cookie: customer,
    body: bookingPayload(findService('Distribuzione'), day, '08:30')
  });
  const bookingId = res.data.booking.id;
  assert.ok(db().depositsDB.findOne(d => d.booking_id === bookingId));
  const del = await api.request('DELETE', '/api/admin/bookings', {
    cookie: admin,
    body: { giorno: day, ora: '08:30' }
  });
  assert.equal(del.status, 200);
  assert.equal(
    db().depositsDB.findOne(d => d.booking_id === bookingId),
    undefined
  );
});

test('ferie: aggiunta idempotente e rimozione', async () => {
  const day = futureWeekday(5, 3);
  const slots = [
    { giorno: day, ora: '08:30' },
    { giorno: day, ora: '08:45' }
  ];
  const add = await api.request('POST', '/api/admin/holidays', { cookie: admin, body: { slots } });
  assert.equal(add.data.count, 2);
  const again = await api.request('POST', '/api/admin/holidays', {
    cookie: admin,
    body: { slots }
  });
  assert.equal(again.data.count, 0);
  const pub = await api.request('GET', '/api/holidays');
  assert.equal(pub.data.holidays.filter(h => h.giorno === day).length, 2);

  const del = await api.request('DELETE', '/api/admin/holidays', {
    cookie: admin,
    body: { slots }
  });
  assert.equal(del.data.removed, 2);
  assert.equal(
    (await api.request('POST', '/api/admin/holidays', { cookie: admin, body: { slots: [] } }))
      .status,
    400
  );
});

test('listino: creazione, modifica, elenco admin (anche inattivi) ed eliminazione', async () => {
  const create = await api.request('POST', '/api/admin/services', {
    cookie: admin,
    body: {
      nome: 'Ricarica clima',
      tipo_veicolo: 'auto',
      tipo_servizio: 'appuntamento',
      durata_minuti: 45
    }
  });
  assert.equal(create.status, 201);
  const created = db().servicesDB.findOne(s => s.nome === 'Ricarica clima');
  assert.equal(created.durata_minuti, '45');

  const update = await api.request('PUT', `/api/admin/services/${created.id}`, {
    cookie: admin,
    body: { prezzo_interno: 80, attivo: 0 }
  });
  assert.equal(update.status, 200);
  assert.equal(update.data.service.attivo, '0');

  const list = await api.request('GET', '/api/admin/services', { cookie: admin });
  assert.ok(list.data.services.some(s => s.id === created.id));
  const pub = await api.request('GET', '/api/services');
  assert.ok(!pub.data.services.some(s => s.id === created.id));

  assert.equal(
    (await api.request('POST', '/api/admin/services', { cookie: admin, body: { nome: 'X' } }))
      .status,
    400
  );
  const del = await api.request('DELETE', `/api/admin/services/${created.id}`, { cookie: admin });
  assert.equal(del.status, 200);
  assert.equal(
    (await api.request('DELETE', `/api/admin/services/${created.id}`, { cookie: admin })).status,
    404
  );
});

test(
  'listino: la risposta di creazione contiene il servizio creato',
  { todo: "P28: insert() restituisce sempre l'id 0" },
  async () => {
    const create = await api.request('POST', '/api/admin/services', {
      cookie: admin,
      body: { nome: 'Assetto', tipo_veicolo: 'auto', tipo_servizio: 'appuntamento' }
    });
    assert.equal(create.data.service.nome, 'Assetto');
  }
);

test('impostazioni: lettura e modifica del limite depositi', async () => {
  const get = await api.request('GET', '/api/settings/maxDeposits', { cookie: admin });
  assert.equal(get.data.maxDeposits, 5);
  const bad = await api.request('PUT', '/api/settings/maxDeposits', {
    cookie: admin,
    body: { maxDeposits: 'tanti' }
  });
  assert.equal(bad.status, 400);
  await api.request('PUT', '/api/settings/maxDeposits', {
    cookie: admin,
    body: { maxDeposits: 7 }
  });
  const deposits = await api.request('GET', '/api/admin/deposits', { cookie: admin });
  assert.equal(String(deposits.data.max), '7');
  await api.request('PUT', '/api/settings/maxDeposits', {
    cookie: admin,
    body: { maxDeposits: 5 }
  });
});

async function newDeposit(day, ora) {
  const res = await api.request('POST', '/api/bookings', {
    cookie: customer,
    body: bookingPayload(findService('Lavoro straordinario'), day, ora, {
      note_cliente: 'Perdita olio'
    })
  });
  assert.equal(res.status, 201);
  return db().depositsDB.findOne(d => d.booking_id === res.data.booking.id);
}

test('depositi: pianificazione in blocchi da 15 minuti, stato in corso, completamento', async () => {
  const day = futureWeekday(1, 4);
  const deposit = await newDeposit(day, '08:30');

  const list = await api.request('GET', '/api/admin/deposits/all', { cookie: admin });
  const enriched = list.data.deposits.find(d => d.id === deposit.id);
  assert.equal(enriched.booking_giorno, day);
  assert.equal(enriched.servizio, 'Lavoro straordinario');

  const schedule = await api.request('POST', `/api/admin/deposits/${deposit.id}/schedule`, {
    cookie: admin,
    body: {
      slots: [
        { date: day, time: '14:30' },
        { date: day, time: '14:45' }
      ],
      ore_stimate: 0.5
    }
  });
  assert.equal(schedule.status, 200);
  assert.equal(schedule.data.deposit.stato, 'in_corso');
  const blocks = db().bookingsDB.findMany(
    b => b.deposit_id === deposit.id && b.service_id === 'extra_work'
  );
  assert.equal(blocks.length, 2);
  const slots = (await api.request('GET', `/api/slots/${day}`)).data.slots;
  assert.equal(slotAt(slots, '14:30').available, false);
  assert.equal(slotAt(slots, '15:00').available, true);

  const nota = await api.request('PUT', `/api/admin/deposits/${deposit.id}/nota`, {
    cookie: admin,
    body: { nota_lorenzo: 'Guarnizione da sostituire' }
  });
  assert.equal(nota.data.deposit.nota_lorenzo, 'Guarnizione da sostituire');
  const ore = await api.request('PUT', `/api/admin/deposits/${deposit.id}/ore`, {
    cookie: admin,
    body: { ore_residue: 1.5 }
  });
  assert.equal(ore.data.deposit.ore_residue, '1.5');

  const done = await api.request('POST', `/api/admin/deposits/${deposit.id}/status`, {
    cookie: admin,
    body: { stato: 'completato' }
  });
  assert.equal(done.status, 200);
  assert.ok(done.data.deposit.completed_at);
  assert.equal(
    db().bookingsDB.findMany(b => b.deposit_id === deposit.id && b.service_id === 'extra_work')
      .length,
    0
  );
  const active = await api.request('GET', '/api/admin/deposits', { cookie: admin });
  assert.ok(!active.data.deposits.some(d => d.id === deposit.id));
});

test('depositi: tornare "in attesa" libera i blocchi pianificati', async () => {
  const day = futureWeekday(2, 4);
  const deposit = await newDeposit(day, '08:30');
  await api.request('POST', `/api/admin/deposits/${deposit.id}/schedule`, {
    cookie: admin,
    body: { slots: [{ date: day, time: '15:00' }] }
  });
  const res = await api.request('POST', `/api/admin/deposits/${deposit.id}/status`, {
    cookie: admin,
    body: { stato: 'in_attesa' }
  });
  assert.equal(res.data.deposit.stato, 'in_attesa');
  assert.equal(
    db().bookingsDB.findMany(b => b.service_id === 'extra_work' && b.giorno === day).length,
    0
  );
});

test('depositi: id inesistente → 404', async () => {
  for (const [method, url, body] of [
    ['POST', '/api/admin/deposits/9999/status', { stato: 'in_corso' }],
    ['PUT', '/api/admin/deposits/9999/nota', { nota_lorenzo: 'x' }],
    [
      'POST',
      '/api/admin/deposits/9999/schedule',
      { slots: [{ date: futureWeekday(2), time: '09:00' }] }
    ]
  ]) {
    assert.equal((await api.request(method, url, { cookie: admin, body })).status, 404, url);
  }
});

test(
  'depositi: uno stato sconosciuto viene rifiutato',
  { todo: 'P10: lo stato del deposito è testo libero' },
  async () => {
    const deposit = await newDeposit(futureWeekday(3, 4), '08:30');
    const res = await api.request('POST', `/api/admin/deposits/${deposit.id}/status`, {
      cookie: admin,
      body: { stato: 'boh' }
    });
    assert.equal(res.status, 400);
  }
);

test(
  'depositi: la pianificazione non può sovrapporsi ad altre prenotazioni',
  { todo: 'P09: schedule inserisce blocchi senza controllare la disponibilità' },
  async () => {
    const day = futureWeekday(4, 4);
    const deposit = await newDeposit(day, '08:30');
    assert.equal(
      (await adminBook(day, '15:00', findService('Tagliando olio + filtro'))).status,
      201
    );
    const res = await api.request('POST', `/api/admin/deposits/${deposit.id}/schedule`, {
      cookie: admin,
      body: { slots: [{ date: day, time: '15:15' }] }
    });
    assert.equal(res.status, 400);
  }
);

test('clienti: elenco senza password, VIP, veicoli e storico per targa', async () => {
  const users = await api.request('GET', '/api/admin/users', { cookie: admin });
  const me = users.data.users.find(u => u.email === customerUser.email);
  assert.ok(me);
  assert.equal(me.password, undefined);
  assert.equal(me.vip, false);

  const vip = await api.request(
    'PUT',
    `/api/admin/users/${encodeURIComponent(customerUser.email)}/vip`,
    {
      cookie: admin
    }
  );
  assert.equal(vip.data.vip, true);

  await api.request('POST', '/api/vehicles', {
    cookie: customer,
    body: { targa: 'AB123CD', modello: 'Fiat Panda' }
  });
  const vehicles = await api.request(
    'GET',
    `/api/admin/users/${encodeURIComponent(customerUser.email)}/vehicles`,
    { cookie: admin }
  );
  assert.equal(vehicles.data.vehicles.length, 1);
  assert.ok(vehicles.data.vehicles[0].booking_count > 0);

  const history = await api.request('GET', '/api/admin/vehicles/targa/ab123cd', { cookie: admin });
  assert.ok(history.data.bookings.length > 0);
  assert.ok(history.data.deposits.length > 0);
});

test('report: 7 giorni (settimanale) o 30 giorni (mensile)', async () => {
  const weekly = await api.request('GET', '/api/admin/reports/bookings-stats?period=weekly', {
    cookie: admin
  });
  assert.equal(weekly.data.labels.length, 7);
  assert.equal(weekly.data.counts.length, 7);
  const monthly = await api.request('GET', '/api/admin/reports/bookings-stats?period=monthly', {
    cookie: admin
  });
  assert.equal(monthly.data.labels.length, 30);
});
