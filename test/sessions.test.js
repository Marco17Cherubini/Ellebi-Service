// Sessioni e recupero password: invalidazione dei token dopo il reset, link monouso,
// sessione admin legata a un account esistente, registrazione di chi ha prenotato come ospite.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startTestServer, makeUser, ADMIN } = require('./helpers');

let api;

before(async () => {
  api = await startTestServer();
});

after(() => api.close());

function auth() {
  return require('../server/authService');
}

test('il reset della password chiude le sessioni aperte e il link non si può riusare', async () => {
  const user = makeUser('sessioni');
  const cookie = await api.registerAndLogin(user);
  assert.equal((await api.request('GET', '/api/auth/me', { cookie })).status, 200);

  const token = auth().generateResetToken(user.email);
  const reset = await api.request('POST', '/api/auth/reset-password', {
    body: { token, password: 'NuovaPassword123!' }
  });
  assert.equal(reset.status, 200);

  // La vecchia sessione non vale più
  assert.equal((await api.request('GET', '/api/auth/me', { cookie })).status, 401);

  // Lo stesso link non funziona una seconda volta
  const again = await api.request('POST', '/api/auth/reset-password', {
    body: { token, password: 'AltraPassword123!' }
  });
  assert.equal(again.status, 400);

  const login = await api.login(user.email, 'NuovaPassword123!');
  assert.equal(login.status, 200);
  assert.equal((await api.request('GET', '/api/auth/me', { cookie: login.cookie })).status, 200);
});

test('un link di reset vecchio non vale dopo un reset più recente', async () => {
  const user = makeUser('dueLink');
  await api.request('POST', '/api/auth/register', { body: user });
  const first = auth().generateResetToken(user.email);
  const second = auth().generateResetToken(user.email);

  const ok = await api.request('POST', '/api/auth/reset-password', {
    body: { token: second, password: 'NuovaPassword123!' }
  });
  assert.equal(ok.status, 200);
  const stale = await api.request('POST', '/api/auth/reset-password', {
    body: { token: first, password: 'AltraPassword123!' }
  });
  assert.equal(stale.status, 400);
});

test('un token admin firmato per un account inesistente viene rifiutato', async () => {
  const forged = jwt.sign(
    { email: 'non.esiste@test.local', isAdmin: true },
    process.env.JWT_SECRET
  );
  const res = await api.request('GET', '/api/admin/bookings', { cookie: `token=${forged}` });
  assert.equal(res.status, 401);

  const real = await api.adminCookie();
  assert.equal((await api.request('GET', '/api/admin/bookings', { cookie: real })).status, 200);
});

test('una sessione admin non vale più se la versione di sessione cambia', async () => {
  const cookie = await api.adminCookie();
  const { adminDB } = require('../server/database');
  const current = adminDB.findOne(a => a.email === ADMIN.email);
  adminDB.update(a => a.email === ADMIN.email, {
    session_version: String((parseInt(current.session_version, 10) || 0) + 1)
  });
  assert.equal((await api.request('GET', '/api/admin/bookings', { cookie })).status, 401);
  assert.equal(
    (await api.request('GET', '/api/admin/bookings', { cookie: await api.adminCookie() })).status,
    200
  );
});

test('chi ha prenotato come ospite può registrarsi: riceve un link per impostare la password', async () => {
  // Profilo creato da una prenotazione ospite: nessuna password
  const { usersDB } = require('../server/database');
  usersDB.insert({
    nome: 'Ugo',
    cognome: 'Ospite',
    email: 'ugo.ospite@test.local',
    telefono: '',
    password: '',
    vip: '0',
    banned: '0',
    isGuest: '1'
  });

  const reg = await api.request('POST', '/api/auth/register', {
    body: { ...makeUser('ugo'), email: 'Ugo.Ospite@test.local' }
  });
  assert.equal(reg.status, 202);
  assert.equal(reg.data.success, true);
  assert.equal(reg.data.pendingEmailVerification, true);

  // Nessuna password impostata finché non si usa il link inviato all'email
  const profile = usersDB.findOne(u => u.email === 'ugo.ospite@test.local');
  assert.equal(profile.password, '');
  assert.equal(profile.isGuest, '1');

  const token = auth().generateResetToken('ugo.ospite@test.local');
  const set = await api.request('POST', '/api/auth/reset-password', {
    body: { token, password: 'PasswordUgo123!' }
  });
  assert.equal(set.status, 200);
  assert.equal(usersDB.findOne(u => u.email === 'ugo.ospite@test.local').isGuest, '0');
  assert.equal((await api.login('ugo.ospite@test.local', 'PasswordUgo123!')).status, 200);
});

test('la registrazione con email di un cliente già registrato resta rifiutata', async () => {
  const user = makeUser('doppio');
  await api.request('POST', '/api/auth/register', { body: user });
  const res = await api.request('POST', '/api/auth/register', { body: user });
  assert.equal(res.status, 400);
});

test('sessione facoltativa: 200 con utente nullo per gli anonimi', async () => {
  const anon = await api.request('GET', '/api/auth/session');
  assert.equal(anon.status, 200);
  assert.equal(anon.data.user, null);

  const user = makeUser('sessioneFacoltativa');
  const cookie = await api.registerAndLogin(user);
  const res = await api.request('GET', '/api/auth/session', { cookie });
  assert.equal(res.data.user.email, user.email.toLowerCase());
  assert.equal(res.data.user.password, undefined);
  assert.equal(res.data.user.session_version, undefined);
});
