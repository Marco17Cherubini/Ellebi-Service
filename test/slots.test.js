// Disponibilità: orari di apertura, durata dei servizi, sovrapposizioni, ferie, ruoli e listino pubblico
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
let customer;
let admin;

before(async () => {
  api = await startTestServer();
  customer = await api.registerAndLogin(makeUser('slots'));
  admin = await api.adminCookie();
});

after(() => api.close());

async function slots(day, { serviceId, cookie } = {}) {
  const url = serviceId ? `/api/slots/${day}/${serviceId}` : `/api/slots/${day}`;
  const res = await api.request('GET', url, { cookie });
  assert.equal(res.status, 200);
  return res.data.slots;
}

test('domenica, date passate e date non valide non hanno slot', async () => {
  assert.deepEqual(await slots(futureWeekday(0)), []);
  assert.deepEqual(await slots('2020-01-07'), []);
  assert.deepEqual(await slots('non-una-data'), []);
});

test('orari di un cliente: lun-ven 08:30-12:15 e 14:30-18:15 ogni 15 minuti, sabato solo mattina', async () => {
  const weekday = (await slots(futureWeekday(3))).map(s => s.time);
  assert.equal(weekday[0], '08:30');
  assert.equal(weekday.at(-1), '18:15');
  assert.equal(weekday.length, 32);
  assert.ok(!weekday.includes('12:30'));
  assert.ok(!weekday.includes('14:15'));

  const saturday = (await slots(futureWeekday(6))).map(s => s.time);
  assert.equal(saturday[0], '08:30');
  assert.equal(saturday.at(-1), '11:45');
  assert.equal(saturday.length, 14);
});

test('la durata del servizio limita gli orari di inizio al turno (niente scavalco della pausa pranzo)', async () => {
  const day = futureWeekday(2, 3);
  const completo = findService('Tagliando completo'); // 120 minuti
  const list = await slots(day, { serviceId: completo.id });
  assert.equal(slotAt(list, '10:30').available, true); // 10:30-12:30
  assert.equal(slotAt(list, '10:45').available, false); // finirebbe alle 12:45
  assert.equal(slotAt(list, '16:30').available, true); // 16:30-18:30
  assert.equal(slotAt(list, '16:45').available, false);
});

test('i servizi di consegna occupano sempre 30 minuti', async () => {
  const day = futureWeekday(2, 3);
  const distribuzione = findService('Distribuzione');
  const res = await api.request('GET', `/api/slots/${day}/${distribuzione.id}`);
  assert.equal(res.data.durata_minuti, 30);
  assert.equal(slotAt(res.data.slots, '12:00').available, true);
  assert.equal(slotAt(res.data.slots, '12:15').available, false);
});

test('una prenotazione occupa tutto il suo intervallo, non solo lo slot di inizio', async () => {
  const day = futureWeekday(4, 3);
  const freni = findService('Freni'); // 90 minuti
  const res = await api.request('POST', '/api/bookings', {
    cookie: customer,
    body: bookingPayload(freni, day, '09:00')
  });
  assert.equal(res.status, 201);

  const olio = findService('Tagliando olio + filtro'); // 60 minuti
  const list = await slots(day, { serviceId: olio.id });
  assert.equal(slotAt(list, '08:30').available, false); // 08:30-09:30 si sovrappone
  assert.equal(slotAt(list, '09:45').available, false);
  assert.equal(slotAt(list, '10:30').available, true); // inizia quando finisce Freni
});

test('le ferie bloccano singoli slot da 15 minuti', async () => {
  const day = futureWeekday(5, 3);
  const add = await api.request('POST', '/api/admin/holidays', {
    cookie: admin,
    body: { slots: [{ giorno: day, ora: '15:00' }] }
  });
  assert.equal(add.status, 201);

  const list = await slots(day);
  assert.equal(slotAt(list, '15:00').available, false);
  assert.equal(slotAt(list, '15:00').isHoliday, true);
  assert.equal(slotAt(list, '15:15').available, true);

  const olio = findService('Tagliando olio + filtro');
  const withDuration = await slots(day, { serviceId: olio.id });
  assert.equal(slotAt(withDuration, '14:30').available, false); // 14:30-15:30 tocca le ferie
  assert.equal(slotAt(withDuration, '15:15').available, true);

  await api.request('DELETE', '/api/admin/holidays', {
    cookie: admin,
    body: { slots: [{ giorno: day, ora: '15:00' }] }
  });
  assert.equal(slotAt(await slots(day), '15:00').available, true);
});

test('VIP e admin vedono gli orari estesi (08:00 e serali), i clienti no', async () => {
  const day = futureWeekday(1, 3);
  const user = makeUser('vip');
  const vip = await api.registerAndLogin(user);
  await api.request('PUT', `/api/admin/users/${encodeURIComponent(user.email)}/vip`, {
    cookie: admin
  });

  const normal = (await slots(day, { cookie: customer })).map(s => s.time);
  const forVip = (await slots(day, { cookie: vip })).map(s => s.time);
  const forAdmin = (await slots(day, { cookie: admin })).map(s => s.time);
  assert.ok(!normal.includes('08:00') && !normal.includes('21:00'));
  for (const list of [forVip, forAdmin]) {
    assert.equal(new Set(list).size, list.length, 'nessun orario duplicato');
    assert.ok(list.includes('08:00'));
    assert.ok(list.includes('21:00'));
    assert.equal(list.at(-1), '23:15');
  }
});

test('listino pubblico: solo servizi attivi, filtro per tipo veicolo', async () => {
  const all = (await api.request('GET', '/api/services')).data.services;
  const moto = (await api.request('GET', '/api/services?tipo_veicolo=moto')).data.services;
  assert.ok(moto.length > 0 && moto.every(s => s.tipo_veicolo === 'moto'));

  const freni = findService('Freni');
  await api.request('PUT', `/api/admin/services/${freni.id}`, {
    cookie: admin,
    body: { attivo: 0 }
  });
  const after = (await api.request('GET', '/api/services')).data.services;
  assert.equal(after.length, all.length - 1);
  assert.ok(!after.some(s => s.id === freni.id));
  await api.request('PUT', `/api/admin/services/${freni.id}`, {
    cookie: admin,
    body: { attivo: 1 }
  });
});

test('servizi stagionali visibili solo nella loro finestra (rispetto alla data odierna)', async () => {
  const gomme = findService('Cambio gomme stagionale');
  const mmdd = d =>
    `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const inTenDays = new Date(Date.now() + 10 * 86400000);
  const inTwentyDays = new Date(Date.now() + 20 * 86400000);
  const yesterday = new Date(Date.now() - 86400000);
  const visible = async () =>
    (await api.request('GET', '/api/services')).data.services.some(s => s.id === gomme.id);

  await api.request('PUT', `/api/admin/services/${gomme.id}`, {
    cookie: admin,
    body: { data_inizio_stagione: mmdd(yesterday), data_fine_stagione: mmdd(inTenDays) }
  });
  assert.equal(await visible(), true);

  await api.request('PUT', `/api/admin/services/${gomme.id}`, {
    cookie: admin,
    body: { data_inizio_stagione: mmdd(inTenDays), data_fine_stagione: mmdd(inTwentyDays) }
  });
  // La finestra è valutata sulla data odierna, non su quella dell'appuntamento
  assert.equal(await visible(), false);
});
