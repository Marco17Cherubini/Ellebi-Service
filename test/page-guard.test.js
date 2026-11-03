// Pagine riservate: l'interfaccia admin e l'area cliente non vengono inviate a chi non ha la
// sessione giusta, nemmeno come file .html diretti. (Le API sono verificate in
// authorization.test.js: nascondere una pagina non basta a proteggere i dati.)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, makeUser } = require('./helpers');

let api;
let customer;
let admin;

before(async () => {
  api = await startTestServer();
  customer = await api.registerAndLogin(makeUser('pagine'));
  admin = await api.adminCookie();
});

after(() => api.close());

async function get(path, cookie) {
  const res = await fetch(api.baseUrl + path, {
    redirect: 'manual',
    headers: cookie ? { Cookie: cookie } : {}
  });
  return { status: res.status, location: res.headers.get('location') };
}

const ADMIN_PAGES = [
  '/admin',
  '/admin/',
  '/admin/clienti',
  '/admin/depositi',
  '/admin/listino',
  '/admin/reports',
  '/admin.html',
  '/admin-clienti.html',
  '/admin-depositi.html',
  '/admin-listino.html',
  '/admin-reports.html'
];

test('pagine admin: anonimo al login, cliente alla sua area, admin ammesso', async () => {
  for (const page of ADMIN_PAGES) {
    assert.deepEqual(await get(page), { status: 302, location: '/login' }, page);
    assert.deepEqual(await get(page, customer), { status: 302, location: '/home' }, page);
    if (page !== '/admin/') assert.equal((await get(page, admin)).status, 200, page);
  }
});

test('area cliente: solo con una sessione cliente', async () => {
  for (const page of ['/home', '/bookings', '/home.html']) {
    assert.deepEqual(await get(page), { status: 302, location: '/login' }, page);
    assert.equal((await get(page, customer)).status, 200, page);
    assert.deepEqual(await get(page, admin), { status: 302, location: '/admin' }, page);
  }
});

test('sessione non valida o scaduta: trattata come anonima', async () => {
  const bad = 'token=abc.def.ghi';
  assert.deepEqual(await get('/admin', bad), { status: 302, location: '/login' });
  assert.deepEqual(await get('/home', bad), { status: 302, location: '/login' });
});

test('pagine pubbliche restano accessibili a tutti', async () => {
  for (const page of ['/', '/prenota', '/login', '/register', '/privacy-policy.html']) {
    assert.equal((await get(page)).status, 200, page);
  }
});
