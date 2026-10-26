// Registrazione, login, logout, sessione, ban e recupero password
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ADMIN, startTestServer, makeUser } = require('./helpers');

let api;

before(async () => {
  api = await startTestServer();
});

after(() => api.close());

test('registrazione e login di un cliente impostano un cookie httpOnly', async () => {
  const user = makeUser('reg');
  const reg = await api.request('POST', '/api/auth/register', { body: user });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.email, user.email);
  assert.equal(reg.data.user.password, undefined);

  const login = await api.login(user.email, user.password);
  assert.equal(login.status, 200);
  assert.equal(login.data.isAdmin, false);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i);

  const me = await api.request('GET', '/api/auth/me', { cookie: login.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, user.email);
  assert.equal(me.data.user.password, undefined);
});

test('la registrazione rifiuta campi mancanti, password corte ed email duplicate', async () => {
  const user = makeUser('dup');
  assert.equal(
    (await api.request('POST', '/api/auth/register', { body: { email: 'x@test.local' } })).status,
    400
  );
  assert.equal(
    (await api.request('POST', '/api/auth/register', { body: { ...user, password: 'corta' } }))
      .status,
    400
  );
  assert.equal((await api.request('POST', '/api/auth/register', { body: user })).status, 201);
  const dup = await api.request('POST', '/api/auth/register', { body: user });
  assert.equal(dup.status, 400);
  assert.match(dup.data.error, /già registrata/);
});

test('email duplicata con maiuscole diverse: errore leggibile (non un errore SQLite)', async () => {
  const user = makeUser('case');
  assert.equal((await api.request('POST', '/api/auth/register', { body: user })).status, 201);
  const dup = await api.request('POST', '/api/auth/register', {
    body: { ...user, email: user.email.toUpperCase() }
  });
  assert.equal(dup.status, 400);
  assert.match(dup.data.error, /già registrata/);
});

test('login con credenziali errate restituisce 401 con messaggio generico', async () => {
  const user = makeUser('wrong');
  await api.request('POST', '/api/auth/register', { body: user });
  const wrongPassword = await api.login(user.email, 'Sbagliata123!');
  const unknownUser = await api.login('nessuno@test.local', 'Sbagliata123!');
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.equal(wrongPassword.data.error, unknownUser.data.error);
});

test("login dell'admin e accesso alle API riservate", async () => {
  const login = await api.login(ADMIN.email, ADMIN.password);
  assert.equal(login.status, 200);
  assert.equal(login.data.isAdmin, true);
  const res = await api.request('GET', '/api/admin/users', { cookie: login.cookie });
  assert.equal(res.status, 200);
});

test('logout cancella il cookie di sessione', async () => {
  const user = makeUser('logout');
  const cookie = await api.registerAndLogin(user);
  const res = await api.request('POST', '/api/auth/logout', { cookie });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /token=;/);
});

test('sessione assente o non valida: 401', async () => {
  assert.equal((await api.request('GET', '/api/auth/me')).status, 401);
  const forged = jwt.sign({ email: ADMIN.email, isAdmin: true }, 'altro-segreto');
  assert.equal(
    (await api.request('GET', '/api/auth/me', { cookie: `token=${forged}` })).status,
    401
  );
});

test('un utente sospeso non può accedere e perde la sessione attiva', async () => {
  const user = makeUser('ban');
  const cookie = await api.registerAndLogin(user);
  const admin = await api.adminCookie();
  const ban = await api.request(
    'PUT',
    `/api/admin/users/${encodeURIComponent(user.email)}/banned`,
    {
      cookie: admin
    }
  );
  assert.equal(ban.data.banned, true);

  assert.equal((await api.request('GET', '/api/auth/me', { cookie })).status, 403);
  assert.equal((await api.login(user.email, user.password)).status, 401);

  await api.request('PUT', `/api/admin/users/${encodeURIComponent(user.email)}/banned`, {
    cookie: admin
  });
  assert.equal((await api.login(user.email, user.password)).status, 200);
});

test('recupero password: risposta generica e reset con token valido', async () => {
  const user = makeUser('reset');
  await api.request('POST', '/api/auth/register', { body: user });

  const known = await api.request('POST', '/api/auth/forgot-password', {
    body: { email: user.email }
  });
  const unknown = await api.request('POST', '/api/auth/forgot-password', {
    body: { email: 'nessuno@test.local' }
  });
  assert.equal(known.status, 200);
  assert.deepEqual(known.data, unknown.data);

  const token = jwt.sign({ email: user.email, purpose: 'password-reset' }, process.env.JWT_SECRET, {
    expiresIn: '1h'
  });
  const reset = await api.request('POST', '/api/auth/reset-password', {
    body: { token, password: 'NuovaPassword123!' }
  });
  assert.equal(reset.status, 200);
  assert.equal((await api.login(user.email, user.password)).status, 401);
  assert.equal((await api.login(user.email, 'NuovaPassword123!')).status, 200);
});

test('reset password: token di sessione o scaduto rifiutati', async () => {
  const user = makeUser('reset2');
  await api.request('POST', '/api/auth/register', { body: user });
  const sessionToken = jwt.sign({ email: user.email, isAdmin: false }, process.env.JWT_SECRET);
  const expired = jwt.sign(
    { email: user.email, purpose: 'password-reset' },
    process.env.JWT_SECRET,
    { expiresIn: -10 }
  );
  for (const token of [sessionToken, expired]) {
    const res = await api.request('POST', '/api/auth/reset-password', {
      body: { token, password: 'NuovaPassword123!' }
    });
    assert.equal(res.status, 400);
  }
});

test('hash bcrypt esistenti restano validi e vengono aggiornati ad argon2id al login', async () => {
  const { usersDB } = require('../server/database');
  const email = 'legacy@test.local';
  usersDB.insert({
    nome: 'Legacy',
    cognome: 'Utente',
    email,
    telefono: '3330000000',
    password: bcrypt.hashSync('Password123!', 10),
    vip: '0',
    banned: '0',
    isGuest: '0'
  });

  assert.equal((await api.login(email, 'Password123!')).status, 200);
  assert.match(usersDB.findOne(u => u.email === email).password, /^\$argon2id\$/);
  assert.equal((await api.login(email, 'Password123!')).status, 200);
});

test('un profilo ospite (senza password) non può fare login', async () => {
  const { usersDB } = require('../server/database');
  usersDB.insert({
    nome: 'Ospite',
    cognome: 'Senza',
    email: 'ospite@test.local',
    telefono: '',
    password: '',
    vip: '0',
    banned: '0',
    isGuest: '1'
  });
  assert.equal((await api.login('ospite@test.local', 'qualsiasi')).status, 401);
});
