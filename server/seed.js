/**
 * Dati dimostrativi per provare Ellebi Service in locale: `npm run seed`
 *
 * Crea clienti fittizi (uno VIP, uno sospeso, un ospite) con i loro veicoli, due mesi di
 * storico per i Report, appuntamenti nelle prossime due settimane, consegne con deposito
 * nei vari stati di lavorazione e un pomeriggio di ferie.
 * Per sicurezza si rifiuta di scrivere su un database che contiene già prenotazioni.
 *
 * Password di tutti i clienti demo: Demo12345!
 * L'admin è quello configurato in .env (ADMIN_EMAIL / ADMIN_PASSWORD).
 */
const bcrypt = require('bcryptjs');
const config = require('../config/config');
const {
  initDatabase,
  usersDB,
  bookingsDB,
  vehiclesDB,
  servicesDB,
  withTransaction
} = require('./database');
const {
  createCustomerBooking,
  createAdminBookingWithDeposit,
  scheduleExtraWork
} = require('./bookingService');
const { updateDeposit, setMaxDeposits } = require('./depositService');
const { addHolidays } = require('./holidayService');
const { toDateString } = require('./dates');

const DEMO_PASSWORD = 'Demo12345!';
const DEMO_DOMAIN = 'demo.example.com';

const CLIENTS = [
  ['Giulia', 'Bianchi', 'Fiat Panda', 'AB123CD'],
  ['Marco', 'Rossi', 'Volkswagen Golf', 'EF456GH'],
  ['Luca', 'Verdi', 'Ford Fiesta', 'IJ789KL'],
  ['Sara', 'Neri', 'Toyota Yaris', 'MN012OP'],
  ['Paolo', 'Gialli', 'Honda CB500F', 'AA12345'],
  ['Chiara', 'Conti', 'Renault Clio', 'QR345ST'],
  ['Andrea', 'Ferri', 'Yamaha MT-07', 'BB67890'],
  ['Elena', 'Galli', 'Peugeot 208', 'UV678WX']
];

const email = (nome, cognome) => `${nome}.${cognome}@${DEMO_DOMAIN}`.toLowerCase();

function service(nome, tipoVeicolo = 'auto') {
  const found = servicesDB.findOne(s => s.nome === nome && s.tipo_veicolo === tipoVeicolo);
  if (!found) throw new Error(`Servizio demo non trovato nel listino: ${nome}`);
  return found;
}

// Giorni di apertura a partire da oggi (+offset), saltando i giorni di chiusura.
// weekdaysOnly: solo lun-ven (orario pieno), così gli orari demo valgono qualunque giorno sia oggi
function openDays(fromOffset, count, weekdaysOnly = false) {
  const days = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + fromOffset);
  while (days.length < count) {
    const open = config.businessHours.daysOpen.includes(d.getDay());
    if (open && !(weekdaysOnly && d.getDay() === 6)) days.push(toDateString(d));
    d.setDate(d.getDate() + (fromOffset >= 0 ? 1 : -1));
  }
  return days;
}

function createClients() {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10); // verificato e aggiornato ad argon2id al login
  CLIENTS.forEach(([nome, cognome, modello, targa], i) => {
    const mail = email(nome, cognome);
    usersDB.insert({
      nome,
      cognome,
      email: mail,
      telefono: `333000${String(i).padStart(4, '0')}`,
      password: hash,
      vip: i === 2 ? '1' : '0',
      banned: i === 7 ? '1' : '0',
      isGuest: '0',
      last_active_at: new Date().toISOString()
    });
    const user = usersDB.findOne(u => u.email === mail);
    vehiclesDB.insert({ user_id: user.id, targa, modello, anno: String(2012 + i) });
  });
  usersDB.insert({
    nome: 'Davide',
    cognome: 'Ospite',
    email: email('davide', 'ospite'),
    telefono: '',
    password: '',
    vip: '0',
    banned: '0',
    isGuest: '1',
    last_active_at: new Date().toISOString()
  });
}

// Storico (giorni passati) inserito direttamente: le API non accettano date passate
function createHistory() {
  const appointments = [
    service('Tagliando olio + filtro'),
    service('Freni'),
    service('Tagliando completo'),
    service('Vendita gomme'),
    service('Cambio gomme', 'moto')
  ];
  const times = ['08:30', '10:30', '14:30', '16:00'];
  openDays(-1, 45).forEach((giorno, dayIndex) => {
    const perDay = 1 + (dayIndex % 3);
    for (let i = 0; i < perDay; i++) {
      const [nome, cognome, modello, targa] = CLIENTS[(dayIndex + i) % 7];
      const svc = appointments[(dayIndex + i) % appointments.length];
      bookingsDB.insert({
        nome,
        cognome,
        email: email(nome, cognome),
        telefono: '',
        giorno,
        ora: times[i],
        service_id: svc.id,
        targa,
        modello,
        tipo: 'cliente',
        stato: 'confermato',
        durata_minuti: parseInt(svc.durata_minuti, 10)
      });
    }
  });
}

function book(clientIndex, giorno, ora, serviceName, tipoVeicolo, note) {
  const [nome, cognome, modello, targa] = CLIENTS[clientIndex];
  return createCustomerBooking(
    email(nome, cognome),
    {
      data: giorno,
      orario: ora,
      serviceId: service(serviceName, tipoVeicolo).id,
      targa,
      modello,
      note_cliente: note || ''
    },
    { extendedHours: clientIndex === 2 }
  );
}

function createUpcoming() {
  const [d1, d2, d3, d4, d5, d6, d7, d8] = openDays(1, 8, true);

  book(0, d1, '08:30', 'Tagliando olio + filtro');
  book(1, d1, '10:00', 'Freni');
  book(3, d2, '14:30', 'Tagliando completo');
  book(4, d2, '09:00', 'Tagliando completo', 'moto');
  book(5, d3, '11:00', 'Vendita gomme', 'auto', 'Pneumatici 195/65 R15');
  book(2, d4, '08:00', 'Tagliando olio + filtro'); // VIP: orario esteso
  book(6, d5, '15:00', 'Cambio gomme', 'moto');
  book(0, d8, '09:30', 'Freni');

  createAdminBookingWithDeposit({
    nome: 'Roberto',
    cognome: 'Telefono',
    email: '',
    telefono: '3339990000',
    giorno: d3,
    ora: '15:00',
    serviceId: service('Tagliando olio + filtro').id,
    targa: 'YZ901AB',
    modello: 'Fiat Punto'
  });

  // Consegne con deposito: una in attesa, una in lavorazione con ore pianificate, una completata
  const waiting = book(3, d1, '14:30', 'Distribuzione', 'auto', 'Rumore metallico a freddo');
  const working = book(1, d2, '08:30', 'Lavoro straordinario', 'auto', 'Spia motore accesa');
  const done = book(5, d4, '09:30', 'Revisione sospensioni', 'moto', 'Forcella che perde olio');

  updateDeposit(waiting.deposit.id, { ore_stimate: 4, ore_residue: 4 });
  updateDeposit(working.deposit.id, {
    ore_stimate: 2,
    ore_residue: 1.5,
    nota_lorenzo: 'Sostituire sonda lambda'
  });
  scheduleExtraWork(working.deposit.id, [
    { date: d6, time: '14:30' },
    { date: d6, time: '14:45' },
    { date: d6, time: '15:00' },
    { date: d6, time: '15:15' }
  ]);
  updateDeposit(done.deposit.id, { stato: 'completato', nota_lorenzo: 'Paraoli sostituiti' });

  // Ferie: pomeriggio chiuso
  const afternoon = config.businessHours.weekday.afternoon.slots;
  addHolidays(afternoon.map(ora => ({ giorno: d7, ora })));
}

async function seed() {
  await initDatabase();

  if (bookingsDB.readAll().length > 0) {
    throw new Error(
      'Il database contiene già prenotazioni: il seed funziona solo su un database nuovo. ' +
        'Imposta DATABASE_PATH su un file nuovo (es. database/demo.sqlite) e riprova.'
    );
  }

  withTransaction(() => {
    setMaxDeposits(config.maxDeposits);
    createClients();
    createHistory();
    createUpcoming();
  });

  return {
    clients: usersDB.readAll().length,
    bookings: bookingsDB.readAll().length
  };
}

if (require.main === module) {
  seed()
    .then(({ clients, bookings }) => {
      console.log(`✅ Dati demo creati: ${clients} clienti, ${bookings} prenotazioni`);
      console.log(`   Clienti demo: <nome>.<cognome>@${DEMO_DOMAIN} — password ${DEMO_PASSWORD}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Seed non eseguito:', error.message);
      process.exit(1);
    });
}

module.exports = { seed, DEMO_PASSWORD, DEMO_DOMAIN };
