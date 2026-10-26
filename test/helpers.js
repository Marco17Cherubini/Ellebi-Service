// Utility condivise dai test: avviano il server reale su una porta libera
// con un database SQLite temporaneo, isolato per ogni file di test
// (node --test esegue ogni file in un processo separato).
// Nessun test usa dati reali, invia email o esegue la retention.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ADMIN = { email: 'admin@test.local', password: 'AdminPassword123!' };

let dbPath = null;

// Idempotente: va chiamata prima di qualunque require dei moduli server,
// perché database.js e config.js leggono l'ambiente al momento del caricamento
function configureTestEnv() {
  if (dbPath) return dbPath;
  dbPath = path.join(os.tmpdir(), `ellebi-test-${process.pid}-${Date.now()}.sqlite`);
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '0',
    JWT_SECRET: 'test-secret-'.padEnd(64, 'x'),
    DATABASE_PATH: dbPath,
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    RESEND_API_KEY: '',
    RETENTION_ENABLED: 'false',
    // I test fanno molte richieste dallo stesso IP: limiti alti salvo override del singolo file
    RATE_LIMIT_AUTH_MAX: process.env.RATE_LIMIT_AUTH_MAX || '10000',
    RATE_LIMIT_GUEST_MAX: process.env.RATE_LIMIT_GUEST_MAX || '10000'
  });
  return dbPath;
}

// Avvia il server e restituisce un client HTTP minimale con gestione del cookie di sessione
async function startTestServer() {
  configureTestEnv();

  // I log di avvio e delle email saltate renderebbero illeggibile l'output dei test
  console.log = () => {};
  console.warn = () => {};

  const { serverReady } = require('../server/server');
  const server = await serverReady;
  const baseUrl = `http://localhost:${server.address().port}`;

  async function request(method, url, { body, cookie, headers } = {}) {
    const res = await fetch(baseUrl + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data, headers: res.headers };
  }

  async function login(email, password) {
    const res = await request('POST', '/api/auth/login', { body: { email, password } });
    const match = (res.headers.get('set-cookie') || '').match(/token=[^;]+/);
    return { ...res, cookie: match ? match[0] : null };
  }

  async function registerAndLogin(user) {
    const reg = await request('POST', '/api/auth/register', { body: user });
    if (reg.status !== 201) {
      throw new Error(`Registrazione fallita: ${JSON.stringify(reg.data)}`);
    }
    return (await login(user.email, user.password)).cookie;
  }

  async function adminCookie() {
    return (await login(ADMIN.email, ADMIN.password)).cookie;
  }

  function close() {
    return new Promise(resolve => {
      server.close(() => {
        fs.rmSync(dbPath, { force: true });
        fs.rmSync(dbPath + '.tmp', { force: true });
        resolve();
      });
    });
  }

  return { baseUrl, request, login, registerAndLogin, adminCookie, close };
}

function makeUser(suffix) {
  return {
    nome: 'Mario',
    cognome: `Rossi${suffix}`,
    email: `mario.${suffix}@test.local`,
    telefono: '3331234567',
    password: 'Password123!'
  };
}

// Servizio del listino seed per nome (e tipo veicolo), letto direttamente dal database
function findService(nome, tipoVeicolo = 'auto') {
  const { servicesDB } = require('../server/database');
  const service = servicesDB.findOne(s => s.nome === nome && s.tipo_veicolo === tipoVeicolo);
  if (!service) throw new Error(`Servizio non trovato: ${nome}`);
  return service;
}

// Data locale 'YYYY-MM-DD' del giorno della settimana richiesto (0=dom ... 6=sab),
// almeno `weeksAhead` settimane nel futuro, così i test non scadono col tempo
function futureWeekday(dayOfWeek, weeksAhead = 2) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + weeksAhead * 7);
  d.setDate(d.getDate() + ((dayOfWeek - d.getDay() + 7) % 7));
  return toDateString(d);
}

function toDateString(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Payload di una prenotazione cliente per un servizio del listino
function bookingPayload(service, data, orario, extra = {}) {
  return {
    data,
    orario,
    serviceId: service.id,
    durata_minuti: service.durata_minuti,
    targa: 'AB123CD',
    modello: 'Fiat Panda',
    ...extra
  };
}

function slotAt(slots, time) {
  return slots.find(s => s.time === time);
}

module.exports = {
  ADMIN,
  configureTestEnv,
  startTestServer,
  makeUser,
  findService,
  futureWeekday,
  toDateString,
  bookingPayload,
  slotAt
};
