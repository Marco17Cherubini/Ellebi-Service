const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const config = require('../config/config');
const { registerUser, loginUser } = require('./authService');
const { authenticateToken } = require('./middleware');
const {
  getAvailableSlots,
  getAvailableSlotsForService,
  createBooking,
  createConsegnaBooking,
  getUserBookings,
  cancelBooking,
  getAllBookings,
  createAdminBooking,
  adminCancelBooking,
  moveBooking
} = require('./bookingService');
const { getAllUsers, toggleVip, isVip, toggleBanned, generateResetToken, resetPassword } = require('./authService');
const { initializeEmailService, sendBookingConfirmation, sendPasswordResetEmail, sendDepositCompletionEmail } = require('./emailService');
const { initDatabase } = require('./database');
const depositService = require('./depositService');

// ==================== VALIDAZIONE SICUREZZA ====================

// Verifica che JWT_SECRET sia configurato
if (!config.jwt.secret) {
  console.error('❌ ERRORE CRITICO: JWT_SECRET non configurato!');
  console.error('   Imposta JWT_SECRET nel file .env');
  console.error('   Genera un secret con: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

const rateLimit = require('express-rate-limit');

const app = express();

// Inizializza servizio email
initializeEmailService();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://cdn.iubenda.com",
        "https://www.iubenda.com"
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.iubenda.com"],
      imgSrc: ["'self'", "data:", "https://cdn.iubenda.com", "https://www.iubenda.com"],
      connectSrc: ["'self'", "https://www.iubenda.com", "https://cdn.iubenda.com"],
      fontSrc: ["'self'", "https://cdn.iubenda.com"],
      frameSrc: ["'self'", "https://www.iubenda.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(cookieParser());

// Rate limiter per route di autenticazione (protezione brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minuti
  max: 10,                     // Max 10 tentativi per finestra
  message: { success: false, error: 'Troppi tentativi. Riprova tra 15 minuti.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: function (req) {
    return req.headers['x-forwarded-for'] || req.ip;
  }
});

// Rate limiter per guest checkout (protezione flood prenotazioni)
const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minuti
  max: 5,                      // Max 5 prenotazioni guest per finestra
  message: { success: false, error: 'Troppi tentativi. Riprova tra 15 minuti.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: function (req) {
    return req.headers['x-forwarded-for'] || req.ip;
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// ==================== AUTH ROUTES ====================

// POST /api/auth/register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const user = await registerUser(req.body);
    res.status(201).json({ success: true, user });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { user, token, isAdmin } = await loginUser(req.body.email, req.body.password);

    // Set cookie HTTP-only
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.server.env === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 giorni
    });

    res.json({ success: true, user, isAdmin });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logout effettuato' });
});

// GET /api/auth/me - Ottieni utente corrente
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// POST /api/auth/forgot-password - Richiedi reset password
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email obbligatoria' });
    }

    const token = generateResetToken(email);

    if (token) {
      // Costruisci link di reset
      const baseUrl = process.env.BASE_URL || `http://localhost:${config.server.port}`;
      const resetLink = `${baseUrl}/new-password?token=${token}`;

      // Invia email
      await sendPasswordResetEmail(email.trim().toLowerCase(), resetLink);
    }

    // Risposta generica (anti-enumerazione)
    res.json({ success: true, message: 'Se l\'email esiste, riceverai un link di reset.' });

  } catch (error) {
    console.error('Errore forgot-password:', error);
    res.status(500).json({ success: false, error: 'Errore interno' });
  }
});

// POST /api/auth/reset-password - Reimposta password con token
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    await resetPassword(token, password);

    res.json({ success: true, message: 'Password aggiornata con successo' });

  } catch (error) {
    console.error('Errore reset-password:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== BOOKING ROUTES ====================

// GET /api/slots/:date - Ottieni slot disponibili per una data
// Se l'utente è VIP o admin, include anche gli orari extra
app.get('/api/slots/:date', (req, res) => {
  try {
    // Prova a verificare l'autenticazione (opzionale per questa route)
    let includeExtraSlots = false;

    const token = req.cookies.token;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, config.jwt.secret);

        // Admin o VIP possono vedere orari extra
        if (decoded.isAdmin) {
          includeExtraSlots = true;
        } else if (decoded.email) {
          includeExtraSlots = isVip(decoded.email);
        }
      } catch (e) {
        // Token invalido, ignora
      }
    }

    // Supporto esclusione slot in modifica prenotazione
    let excludeBooking = null;
    if (req.query.excludeGiorno && req.query.excludeOra &&
        /^\d{4}-\d{2}-\d{2}$/.test(req.query.excludeGiorno) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(req.query.excludeOra)) {
      excludeBooking = { giorno: req.query.excludeGiorno, ora: req.query.excludeOra };
    }

    const slots = getAvailableSlots(req.params.date, includeExtraSlots, excludeBooking);

    // Prevent caching of availability
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    res.json({ success: true, slots });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/slots/:date/:serviceId — slot disponibili duration-aware per servizio specifico
app.get('/api/slots/:date/:serviceId', (req, res) => {
  try {
    const { date, serviceId } = req.params;
    const { servicesDB } = require('./database');
    const service = servicesDB.findOne(function (s) { return String(s.id) === String(serviceId); });
    if (!service) {
      return res.status(404).json({ success: false, error: 'Servizio non trovato' });
    }
    // Le consegne occupano sempre 30 minuti (accoglienza chiavi + spiegazione problema)
    const isConsegnaService = service.tipo_servizio === 'consegna' ||
      (service.nome || '').toLowerCase().includes('consegna');
    const durata = isConsegnaService ? 30 : (parseInt(service.durata_minuti) || 60);

    // Verifica VIP/admin per slot extra
    let includeExtraSlots = false;
    const token = req.cookies.token;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, config.jwt.secret);
        if (decoded.isAdmin) includeExtraSlots = true;
        else if (decoded.email) includeExtraSlots = isVip(decoded.email);
      } catch (e) { /* ignora token invalido */ }
    }

    // Supporto esclusione slot in modifica prenotazione
    let excludeBooking = null;
    if (req.query.excludeGiorno && req.query.excludeOra &&
        /^\d{4}-\d{2}-\d{2}$/.test(req.query.excludeGiorno) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(req.query.excludeOra)) {
      excludeBooking = { giorno: req.query.excludeGiorno, ora: req.query.excludeOra };
    }

    const slots = getAvailableSlotsForService(date, durata, includeExtraSlots, excludeBooking);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ success: true, slots, durata_minuti: durata });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/config/slots — array orari per admin.js (posizionamento visivo, non griglia 15min)
app.get('/api/config/slots', (req, res) => {
  const bh = config.businessHours;
  res.json({
    success: true,
    weekday: bh.weekday.morning.slots.concat(bh.weekday.afternoon.slots),
    saturday: bh.saturday.morning.slots.concat(bh.saturday.afternoon.slots),
    slotIntervalMinutes: bh.slotIntervalMinutes || 15,
    daysOpen: bh.daysOpen || [1, 2, 3, 4, 5, 6]
  });
});

// GET /api/services — lista servizi attivi (filtrabili per tipo_veicolo)
app.get('/api/services', (req, res) => {
  try {
    const { servicesDB } = require('./database');
    let services = servicesDB.findMany(function (s) { return s.attivo === 1 || s.attivo === '1'; });

    // Filtro per tipo_veicolo (auto | moto)
    if (req.query.tipo_veicolo) {
      services = services.filter(function (s) { return s.tipo_veicolo === req.query.tipo_veicolo; });
    }

    // Filtro stagionale: escludi servizi fuori stagione
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayMMDD = mm + '-' + dd;

    services = services.filter(function (s) {
      if (!s.stagionale || s.stagionale === 0 || s.stagionale === '0') return true;
      if (!s.data_inizio_stagione || !s.data_fine_stagione) return true;

      var inizio = s.data_inizio_stagione; // formato MM-DD
      var fine = s.data_fine_stagione;     // formato MM-DD

      if (inizio <= fine) {
        // Intervallo NON a cavallo d'anno (es. 03-01 → 06-30)
        return todayMMDD >= inizio && todayMMDD <= fine;
      } else {
        // Intervallo A CAVALLO d'anno (es. 11-15 → 04-15)
        return todayMMDD >= inizio || todayMMDD <= fine;
      }
    });

    res.json({ success: true, services });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/bookings - Crea nuova prenotazione (con supporto consegna veicolo)
app.post('/api/bookings', authenticateToken, (req, res) => {
  try {
    const { servicesDB } = require('./database');
    const { serviceId, old_giorno, old_ora } = req.body;

    let oldBooking = null;
    let oldDeposit = null;
    if (old_giorno && old_ora) {
      const { getUserBookings } = require('./bookingService');
      const userBookings = getUserBookings(req.user.email);
      oldBooking = userBookings.find(b => b.giorno === old_giorno && b.ora === old_ora);
      
      if (oldBooking) {
        const { bookingsDB, depositsDB } = require('./database');
        oldDeposit = depositsDB.findOne(d => String(d.booking_id) === String(oldBooking.id));
        // Sposta temporaneamente la vecchia prenotazione per liberare lo slot
        bookingsDB.update(b => b.id === oldBooking.id, { giorno: '1970-01-01' });
      }
    }

    try {
      // Determina se il servizio è di tipo 'consegna' (per tipo o per nome)
      let isConsegna = false;
    if (serviceId) {
      const service = servicesDB.findOne(function (s) { return String(s.id) === String(serviceId); });
      if (service && (service.tipo_servizio === 'consegna' ||
        (service.nome || '').toLowerCase().includes('consegna'))) {
        isConsegna = true;
      }
    }

    if (isConsegna) {
      // Verifica limite depositi attivi
      if (!depositService.canAcceptDeposit()) {
        return res.status(400).json({
          success: false,
          error: 'Limite depositi raggiunto (' + depositService.getActiveDepositCount() + '/' + depositService.MAX_DEPOSITS + '). Contattare il laboratorio.'
        });
      }

      // Crea prenotazione di accoglienza (sempre 30min, data/ora scelta dal cliente)
      const bookingResult = createConsegnaBooking(req.user.email, req.body);

      // Risolvi il nome del servizio per mostrarlo nella card Lavori Straordinari
      const { servicesDB: svcDB2 } = require('./database');
      const svcForDeposit2 = svcDB2.findOne(function (s) { return String(s.id) === String(serviceId); });

      // Crea record deposito associato (targa e modello già validati in createConsegnaBooking)
      const depositData = {
        nome: req.body.nome || req.user.nome || '',
        cognome: req.body.cognome || req.user.cognome || '',
        email: req.user.email,
        telefono: req.body.telefono || '',
        targa: req.body.targa || '',
        modello: req.body.modello || '',
        servizio: svcForDeposit2 ? svcForDeposit2.nome : (req.body.servizio || ''),
        ore_stimate: req.body.ore_stimate || 0,
        note_cliente: req.body.note_cliente || ''
      };
      const deposit = depositService.createDeposit(bookingResult.id, depositData);
        if (deposit && deposit.id) {
          const { bookingsDB } = require('./database');
          bookingsDB.update(function(b) { return String(b.id) === String(bookingResult.id); }, { deposit_id: deposit.id });
          bookingResult.deposit_id = deposit.id;
        }

      if (oldBooking) {
        const { bookingsDB, depositsDB } = require('./database');
        const { cleanDepositOnCancellation } = require('./bookingService');
        cleanDepositOnCancellation(oldBooking);
        bookingsDB.delete(b => b.id === oldBooking.id);
        if (oldDeposit) depositsDB.delete(d => d.id === oldDeposit.id);
      }

      res.status(201).json({
        success: true,
        booking: bookingResult,
        deposit,
        slotAssigned: { date: bookingResult.giorno, time: bookingResult.ora },
        message: 'Veicolo registrato per la consegna il ' + bookingResult.giorno + ' alle ' + bookingResult.ora + '.'
      });
      return;
    }

    // Prenotazione normale (appuntamento)
    const booking = createBooking(req.user.email, req.body);

    // Invia email di conferma in background (fire-and-forget)
    sendBookingConfirmation(booking)
      .then(function (result) {
        if (!result.success) console.log('Email non inviata:', result.message);
      })
      .catch(function (err) {
        console.error('Errore invio email:', err.message);
      });

    if (oldBooking) {
      const { bookingsDB, depositsDB } = require('./database');
      bookingsDB.delete(b => b.id === oldBooking.id);
      if (oldDeposit) depositsDB.delete(d => d.id === oldDeposit.id);
    }

    res.status(201).json({
      success: true,
      booking,
      emailSent: 'pending'
    });
    
    } catch (err) {
      if (oldBooking) {
        const { bookingsDB } = require('./database');
        bookingsDB.update(b => b.id === oldBooking.id, { giorno: oldBooking.giorno });
      }
      throw err;
    }

  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/bookings - Ottieni prenotazioni dell'utente
app.get('/api/bookings', authenticateToken, (req, res) => {
  try {
    const bookings = getUserBookings(req.user.email);
    const { servicesDB } = require('./database');

    // Raggruppa per token: booking con stesso token = unica prenotazione multi-slot
    const tokenMap = {};
    const standalone = [];

    bookings.forEach(b => {
      if (b.token) {
        if (!tokenMap[b.token]) tokenMap[b.token] = [];
        tokenMap[b.token].push(b);
      } else {
        standalone.push(b);
      }
    });

    const grouped = [];

    Object.values(tokenMap).forEach(group => {
      // Ordina per ora crescente per prendere il primo slot come orario di inizio
      group.sort((a, b) => (a.ora < b.ora ? -1 : 1));
      const first = group[0];

      // Durata: usa durata_minuti se presente (nuovo sistema), altrimenti calcola da slot count
      const durata = first.durata_minuti
        ? parseInt(first.durata_minuti, 10)
        : group.length * 15;

      // Risolvi nome servizio
      let servizioNome = first.servizio || 'Prenotazione';
      if (first.service_id) {
        const svc = servicesDB.findOne(s => String(s.id) === String(first.service_id));
        if (svc) servizioNome = svc.nome;
      }

      grouped.push(Object.assign({}, first, {
        servizio: servizioNome,
        durata_minuti: durata
      }));
    });

    // Aggiungi standalone (senza token)
    standalone.forEach(b => {
      let servizioNome = b.servizio || 'Prenotazione';
      if (b.service_id) {
        const svc = servicesDB.findOne(s => String(s.id) === String(b.service_id));
        if (svc) servizioNome = svc.nome;
      }
      grouped.push(Object.assign({}, b, { servizio: servizioNome }));
    });

    res.json({ success: true, bookings: grouped });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/bookings - Cancella prenotazione (usando giorno e ora)
app.delete('/api/bookings', authenticateToken, (req, res) => {
  try {
    const { giorno, ora } = req.body;
    cancelBooking(giorno, ora, req.user.email);
    res.json({ success: true, message: 'Prenotazione cancellata' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== GUEST CHECKOUT ====================

const { usersDB } = require('./database');

// POST /api/bookings/guest - Prenotazione rapida senza account
// Richiede solo: nome, cognome, email (niente password)
app.post('/api/bookings/guest', guestLimiter, (req, res) => {
  try {
    const { nome, cognome, email, giorno, ora, numPersone } = req.body;

    // Validazione campi obbligatori
    if (!nome || !cognome || !email) {
      return res.status(400).json({
        success: false,
        error: 'Nome, cognome e email sono obbligatori'
      });
    }

    if (!giorno || !ora) {
      return res.status(400).json({
        success: false,
        error: 'Dati prenotazione incompleti (giorno, ora)'
      });
    }

    // Validazione formato email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Formato email non valido'
      });
    }

    const emailLower = email.trim().toLowerCase();

    // Verifica se l'email esiste gia nel sistema
    let existingUser = usersDB.findOne(u => u.email === emailLower);

    if (!existingUser) {
      // Crea profilo Guest silente (senza password)
      usersDB.insert({
        nome: nome.trim().slice(0, 100),
        cognome: cognome.trim().slice(0, 100),
        email: emailLower,
        telefono: '',
        password: '',
        vip: '0',
        banned: '0',
        isGuest: '1'
      });
      console.log(`[Guest Checkout] Nuovo profilo guest creato: ${emailLower}`);
    } else {
      console.log(`[Guest Checkout] Email esistente, associo prenotazione: ${emailLower}`);
    }

    // Crea la prenotazione usando il nuovo formato (serviceId, targa, modello, note_cliente)
    // Mantieni retrocompatibilità: se arriva {giorno, ora} mappa su {data, orario}
    const bookingPayload = Object.assign({}, req.body, {
      data: req.body.data || giorno,
      orario: req.body.orario || ora
    });

    const { servicesDB } = require('./database');
    const serviceId = req.body.serviceId;
    let isConsegna = false;
    if (serviceId) {
      const svc = servicesDB.findOne(function (s) { return String(s.id) === String(serviceId); });
      if (svc && (svc.tipo_servizio === 'consegna' ||
        (svc.nome || '').toLowerCase().includes('consegna'))) isConsegna = true;
    }

    let booking, deposit;
    if (isConsegna) {
      if (!depositService.canAcceptDeposit()) {
        return res.status(400).json({
          success: false,
          error: 'Limite depositi raggiunto. Contattare il laboratorio.'
        });
      }
      const bookingResult = createConsegnaBooking(emailLower, bookingPayload);
      booking = bookingResult;

      // Risolvi nome servizio per la card Lavori Straordinari
      const { servicesDB: svcDBGuest } = require('./database');
      const svcGuest = svcDBGuest.findOne(function (s) { return String(s.id) === String(serviceId); });

      deposit = depositService.createDeposit(booking.id, {
        nome: nome.trim(),
        cognome: cognome.trim(),
        email: emailLower,
        telefono: req.body.telefono || '',
        targa: req.body.targa || '',
        modello: req.body.modello || '',
        servizio: svcGuest ? svcGuest.nome : (req.body.servizio || ''),
        ore_stimate: req.body.ore_stimate || 0,
        note_cliente: req.body.note_cliente || ''
      });
    } else {
      booking = createBooking(emailLower, bookingPayload);
    }

    // Invia email di conferma (fire-and-forget)
    sendBookingConfirmation(booking)
      .then(function (result) {
        if (!result.success) console.log('Email non inviata:', result.message);
      })
      .catch(function (err) {
        console.error('Errore invio email:', err.message);
      });

    // Risposta immediata - nessun redirect a dashboard
    res.status(201).json({
      success: true,
      booking,
      deposit: deposit || null,
      message: 'Prenotazione confermata! Riceverai una email con i dettagli.',
      emailSent: 'pending'
    });

  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});



// ==================== ADMIN ROUTES ====================

// GET /api/settings/maxDeposits - Leggi impostazione maxDeposits (solo admin)
app.get('/api/settings/maxDeposits', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { getSetting } = require('./database');
    const maxDeposits = getSetting('maxDeposits', '20');
    res.json({ success: true, maxDeposits: parseInt(maxDeposits, 10) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/settings/maxDeposits - Salva impostazione maxDeposits (solo admin)
app.put('/api/settings/maxDeposits', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { maxDeposits } = req.body;
    if (typeof maxDeposits !== 'number' || maxDeposits < 0) {
      return res.status(400).json({ success: false, error: 'Valore maxDeposits non valido' });
    }
    
    const { setSetting } = require('./database');
    setSetting('maxDeposits', maxDeposits.toString());
    
    res.json({ success: true, message: 'Impostazione salvata con successo' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/bookings - Ottieni tutte le prenotazioni (solo admin)
app.get('/api/admin/bookings', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { depositsDB: dDB, servicesDB: svcDB } = require('./database');
    const rawBookings = getAllBookings();
    // Arricchisce i booking di tipo 'deposito' con i dati del deposito collegato
    // (risolve targa/modello/servizio mancanti per booking storici)
    const bookings = rawBookings.map(function (bk) {
      // Risolvi nome servizio se mancante
      let servizio = bk.servizio || '';
      if (!servizio && bk.service_id) {
        const svc = svcDB.findOne(function (s) { return String(s.id) === String(bk.service_id); });
        if (svc) servizio = svc.nome;
      }
      // Risolvi tipo_veicolo da service_id (per booking normali)
      let tipoVeicolo = '';
      if (bk.service_id && bk.service_id !== 'extra_work') {
        const svc = svcDB.findOne(function (s) { return String(s.id) === String(bk.service_id); });
        if (svc) tipoVeicolo = svc.tipo_veicolo || '';
      }
      if (bk.tipo !== 'deposito') {
        const changes = {};
        if (servizio !== bk.servizio) changes.servizio = servizio;
        if (tipoVeicolo) changes.tipo_veicolo = tipoVeicolo;
        return Object.keys(changes).length ? Object.assign({}, bk, changes) : bk;
      }
      // Cerca il deposito associato: prima via booking_id (consegna), poi via deposit_id (extrawork)
      const dep = dDB.findOne(function (d) { return String(d.booking_id) === String(bk.id); })
        || (bk.deposit_id ? dDB.findOne(function (d) { return String(d.id) === String(bk.deposit_id); }) : null);
      if (!dep) return Object.assign({}, bk, { servizio: servizio, tipo_veicolo: tipoVeicolo });
      // Per extrawork, risolvi tipo_veicolo dal nome servizio del deposito
      if (bk.service_id === 'extra_work' && dep.servizio) {
        const depSvc = svcDB.findOne(function (s) { return s.nome === dep.servizio; });
        if (depSvc) tipoVeicolo = depSvc.tipo_veicolo || '';
      }
      // Per extrawork (service_id='extra_work'), dep.servizio ha priorità su bk.servizio
      // perché bk.servizio contiene un valore generico ('Prenotazione') salvato alla creazione.
      const finalServizio = bk.service_id === 'extra_work'
        ? (dep.servizio || servizio || '')
        : (servizio || dep.servizio || '');
      return Object.assign({}, bk, {
        servizio: finalServizio,
        targa: bk.targa || dep.targa || '',
        modello: bk.modello || dep.modello || '',
        note_cliente: bk.note_cliente || dep.note_cliente || '',
        telefono: bk.telefono || dep.telefono || '',
        ore_stimate: dep.ore_stimate || 0,
        nota_interna: dep.nota_lorenzo || '',
        tipo_veicolo: tipoVeicolo
      });
    });
    res.json({ success: true, bookings });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/admin/users - Ottieni tutti gli utenti registrati (solo admin)
app.get('/api/admin/users', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const users = getAllUsers();
    res.json({ success: true, users });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/admin/bookings - Crea prenotazione da admin (solo admin)
app.post('/api/admin/bookings', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }

    // Controlla in anticipo se il servizio è una consegna per verificare il limite depositi
    const { servicesDB } = require('./database');
    const adminServiceId = req.body.serviceId || req.body.service_id;
    let adminIsConsegna = false;
    if (adminServiceId) {
      const adminSvc = servicesDB.findOne(function (s) { return String(s.id) === String(adminServiceId); });
      if (adminSvc && (adminSvc.tipo_servizio === 'consegna' ||
        (adminSvc.nome || '').toLowerCase().includes('consegna'))) {
        adminIsConsegna = true;
      }
    }

    // Per le consegne: verifica limite depositi PRIMA di creare il booking
    if (adminIsConsegna && !depositService.canAcceptDeposit()) {
      return res.status(400).json({
        success: false,
        error: 'Limite depositi raggiunto (' + depositService.getActiveDepositCount() + '/' + depositService.MAX_DEPOSITS + '). Non è possibile aggiungere altri lavori straordinari.'
      });
    }

    if (adminIsConsegna) {
      req.body.tipo = 'deposito';
    }

    const booking = createAdminBooking(req.body);

    // Se è una consegna: crea il record deposito in Lavori Straordinari
    let deposit = null;
    if (booking.isConsegna) {
      // Risolvi il nome del servizio selezionato
      const { servicesDB: svcDBAdmin } = require('./database');
      const svcAdmin = svcDBAdmin.findOne(function (s) { return String(s.id) === String(adminServiceId); });

      const adminDepositData = {
        nome: req.body.nome || '',
        cognome: req.body.cognome || '',
        email: req.body.email || '',
        telefono: req.body.telefono || '',
        targa: req.body.targa || '',
        modello: req.body.modello || '',
        servizio: svcAdmin ? svcAdmin.nome : (req.body.servizio || ''),
        ore_stimate: req.body.ore_stimate || 0,
        note_cliente: req.body.note_cliente || req.body.noteCliente || ''
      };
      deposit = depositService.createDeposit(booking.id, adminDepositData);
      
      // Associa il deposit_id al booking appena creato
      if (deposit && deposit.id) {
        const { bookingsDB } = require('./database');
        bookingsDB.update(function(b) { return String(b.id) === String(booking.id); }, { deposit_id: deposit.id });
        booking.deposit_id = deposit.id;
      }
    }

    // Invia email di conferma in background (fire-and-forget)
    sendBookingConfirmation(booking)
      .then(result => {
        if (!result.success) {
          console.log('Email non inviata:', result.message);
        }
      })
      .catch(err => {
        console.error('Errore invio email:', err.message);
      });

    res.status(201).json({ success: true, booking, deposit, emailSent: 'pending' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/bookings - Cancella prenotazione da admin (solo admin)
app.delete('/api/admin/bookings', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { giorno, ora } = req.body;
    adminCancelBooking(giorno, ora);
    res.json({ success: true, message: 'Prenotazione cancellata' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/bookings - Sposta prenotazione da admin (solo admin)
app.put('/api/admin/bookings', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { oldGiorno, oldOra, newGiorno, newOra } = req.body;
    const booking = moveBooking(oldGiorno, oldOra, newGiorno, newOra);
    res.json({ success: true, booking, message: 'Prenotazione spostata' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
// POST /api/admin/repair-deposits - Ripara booking consegna esistenti senza deposito
// Usare UNA SOLA VOLTA per sincronizzare i booking "viola" già presenti nel calendario
app.post('/api/admin/repair-deposits', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }

    const { bookingsDB, servicesDB, depositsDB } = require('./database');
    const allBookings = bookingsDB.readAll();
    const allDeposits = depositsDB.readAll();
    const existingBookingIds = new Set(allDeposits.map(function (d) { return String(d.booking_id); }));

    const repaired = [];
    const skipped = [];

    allBookings.forEach(function (b) {
      // Salta annullati
      if (b.stato === 'annullato') return;

      // Determina se è una consegna
      const isDeposito = b.tipo === 'deposito';
      let isConsegnaByService = false;
      if (b.service_id) {
        const svc = servicesDB.findOne(function (s) { return String(s.id) === String(b.service_id); });
        if (svc && (svc.tipo_servizio === 'consegna' || (svc.nome || '').toLowerCase().includes('consegna'))) {
          isConsegnaByService = true;
        }
      }

      if (!isDeposito && !isConsegnaByService) return;

      // Ha già un deposito?
      if (existingBookingIds.has(String(b.id))) {
        skipped.push({ id: b.id, nome: b.nome, cognome: b.cognome, motivo: 'deposito già esistente' });
        return;
      }

      // Crea il deposito mancante
      try {
        const dep = depositService.createDeposit(b.id, {
          nome: b.nome || '',
          cognome: b.cognome || '',
          email: b.email || '',
          telefono: b.telefono || '',
          targa: b.targa || '',
          modello: b.modello || '',
          ore_stimate: 0,
          note_cliente: b.note_cliente || ''
        });

        // Aggiorna anche il campo tipo del booking se non era già 'deposito'
        if (b.tipo !== 'deposito') {
          bookingsDB.update(
            function (bk) { return String(bk.id) === String(b.id); },
            { tipo: 'deposito' }
          );
        }

        repaired.push({ bookingId: b.id, depositId: dep.id, nome: b.nome, cognome: b.cognome });
      } catch (err) {
        skipped.push({ id: b.id, nome: b.nome, cognome: b.cognome, motivo: err.message });
      }
    });

    res.json({
      success: true,
      message: 'Riparazione completata',
      repaired: repaired.length,
      skipped: skipped.length,
      details: { repaired, skipped }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== VIP ROUTES ====================

// PUT /api/admin/users/:email/vip - Toggle VIP status (solo admin)
app.put('/api/admin/users/:email/vip', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const email = decodeURIComponent(req.params.email);
    const isNowVip = toggleVip(email);
    res.json({ success: true, email, vip: isNowVip });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/auth/me - includi info VIP nell'utente corrente
// (già gestito da authenticateToken + info utente)

// ==================== HOLIDAYS (FERIE) ROUTES ====================

const { holidaysDB } = require('./database');

// GET /api/holidays - Ottieni tutte le ferie
app.get('/api/holidays', (req, res) => {
  try {
    const holidays = holidaysDB.readAll();
    res.json({ success: true, holidays });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/admin/holidays - Aggiungi ferie (solo admin)
app.post('/api/admin/holidays', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { slots } = req.body; // Array di { giorno, ora }

    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ success: false, error: 'Slot ferie non validi' });
    }

    // Aggiungi ogni slot
    const added = [];
    const existingHolidays = holidaysDB.readAll();

    for (const slot of slots) {
      // Verifica che non esista già
      const exists = existingHolidays.find(h => h.giorno === slot.giorno && h.ora === slot.ora);
      if (!exists) {
        holidaysDB.insert({ giorno: slot.giorno, ora: slot.ora });
        added.push(slot);
      }
    }

    res.status(201).json({ success: true, added, count: added.length });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/holidays - Rimuovi ferie (solo admin)
app.delete('/api/admin/holidays', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const { slots } = req.body; // Array di { giorno, ora }

    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ success: false, error: 'Slot ferie non validi' });
    }

    // Rimuovi ogni slot
    let removed = 0;
    for (const slot of slots) {
      const deleted = holidaysDB.delete(h => h.giorno === slot.giorno && h.ora === slot.ora);
      if (deleted) removed++;
    }

    res.json({ success: true, removed });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== FRONTEND ROUTES ====================

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// Register page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/register.html'));
});

// Guest Booking - Prenotazione rapida senza account
app.get('/guest-booking', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/guest-booking.html'));
});




// Home page (dopo login)
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/home.html'));
});

// Dashboard/Calendario (protetta)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// Gestione prenotazioni
app.get('/bookings', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/bookings.html'));
});

// Service selection page
app.get('/services', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/services.html'));
});

// Booking summary page
app.get('/summary', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/summary.html'));
});

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Admin VIP page (legacy)
app.get('/admin/vip', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-vip.html'));
});

// Admin Reports page
app.get('/admin/reports', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-reports.html'));
});

// Admin Banned Users page (legacy)
app.get('/admin/banned', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-banned.html'));
});

// Admin Unified Client Management page
app.get('/admin/clienti', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-clienti.html'));
});

// Admin Lavori Straordinari (Depositi)
app.get('/admin/depositi', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-depositi.html'));
});

// Admin Listino Servizi
app.get('/admin/listino', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin-listino.html'));
});

// ==================== REPORTS API ====================

const { bookingsDB } = require('./database');

// GET /api/admin/reports/bookings-stats - Statistiche prenotazioni
app.get('/api/admin/reports/bookings-stats', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }

    const period = req.query.period || 'weekly';
    const allBookings = bookingsDB.readAll();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate, labels = [], dateFormat;

    if (period === 'weekly') {
      // Ultimi 7 giorni
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 6);

      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
        labels.push(dayNames[d.getDay()] + ' ' + d.getDate());
      }
    } else {
      // Ultimi 30 giorni (raggruppati per settimana)
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 29);

      for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        labels.push(d.getDate() + '/' + (d.getMonth() + 1));
      }
    }

    // Conta prenotazioni per ogni giorno
    const counts = labels.map((_, index) => {
      const targetDate = new Date(startDate);
      targetDate.setDate(targetDate.getDate() + index);
      const dateStr = targetDate.toISOString().split('T')[0];

      return allBookings.filter(b => b.giorno === dateStr).length;
    });

    res.json({ success: true, labels, counts, period });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== BANNED USERS API ====================

// PUT /api/admin/users/:email/banned - Toggle banned status (solo admin)
app.put('/api/admin/users/:email/banned', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Accesso negato' });
    }
    const email = decodeURIComponent(req.params.email);
    const isNowBanned = toggleBanned(email);
    res.json({ success: true, email, banned: isNowBanned });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== SERVICES API (ADMIN CRUD) ====================

// POST /api/admin/services — crea nuovo servizio
app.post('/api/admin/services', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const { servicesDB } = require('./database');
    const { nome, tipo_veicolo, tipo_servizio, durata_minuti, prezzo_interno, campi_extra, attivo, stagionale, data_inizio_stagione, data_fine_stagione } = req.body;
    if (!nome || !tipo_veicolo || !tipo_servizio) {
      return res.status(400).json({ success: false, error: 'nome, tipo_veicolo e tipo_servizio sono obbligatori' });
    }
    const id = servicesDB.insert({
      nome, tipo_veicolo, tipo_servizio,
      durata_minuti: durata_minuti || 60,
      prezzo_interno: prezzo_interno || null,
      campi_extra: campi_extra || '[]',
      attivo: attivo !== undefined ? attivo : 1,
      stagionale: stagionale || 0,
      data_inizio_stagione: data_inizio_stagione || null,
      data_fine_stagione: data_fine_stagione || null
    });
    const service = servicesDB.findOne(function (s) { return String(s.id) === String(id); });
    res.status(201).json({ success: true, service });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/services/:id — aggiorna servizio
app.put('/api/admin/services/:id', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const { servicesDB } = require('./database');
    const sid = req.params.id;
    const service = servicesDB.findOne(function (s) { return String(s.id) === String(sid); });
    if (!service) return res.status(404).json({ success: false, error: 'Servizio non trovato' });

    const allowed = ['nome', 'tipo_veicolo', 'tipo_servizio', 'durata_minuti', 'prezzo_interno', 'campi_extra', 'attivo', 'stagionale', 'data_inizio_stagione', 'data_fine_stagione'];
    const changes = {};
    allowed.forEach(function (k) { if (req.body[k] !== undefined) changes[k] = req.body[k]; });

    servicesDB.update(function (s) { return String(s.id) === String(sid); }, changes);
    const updated = servicesDB.findOne(function (s) { return String(s.id) === String(sid); });
    res.json({ success: true, service: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/services/:id — elimina servizio
app.delete('/api/admin/services/:id', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const { servicesDB } = require('./database');
    const sid = req.params.id;
    const service = servicesDB.findOne(function (s) { return String(s.id) === String(sid); });
    if (!service) return res.status(404).json({ success: false, error: 'Servizio non trovato' });
    servicesDB.delete(function (s) { return String(s.id) === String(sid); });
    res.json({ success: true, message: 'Servizio eliminato' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/admin/services — tutti i servizi (anche inattivi) per admin
app.get('/api/admin/services', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const { servicesDB } = require('./database');
    const services = servicesDB.readAll();
    res.json({ success: true, services });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== DEPOSITS API (ADMIN) ====================

// GET /api/admin/deposits — depositi attivi + contatore
app.get('/api/admin/deposits', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const deposits = depositService.getActiveDeposits();
    res.json({
      success: true,
      deposits,
      count: depositService.getActiveDepositCount(),
      max: depositService.MAX_DEPOSITS
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/admin/deposits/all — tutti i depositi incluso storico (arricchiti con dati booking)
app.get('/api/admin/deposits/all', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const deposits = depositService.getAllDeposits();
    const { bookingsDB: bDB, servicesDB: svcDB } = require('./database');
    // Arricchisce ogni deposito con i dati del booking collegato
    // Risolve anche i campi mancanti nei depositi storici (targa, modello, nome, email, telefono, servizio)
    const enriched = deposits.map(function (d) {
      if (d.booking_id) {
        const bk = bDB.findOne(function (b) { return String(b.id) === String(d.booking_id); });
        if (bk) {
          // Risolvi nome servizio: usa il deposito, poi il booking, poi service_id
          let servizio = d.servizio || bk.servizio || '';
          if (!servizio && bk.service_id) {
            const svc = svcDB.findOne(function (s) { return String(s.id) === String(bk.service_id); });
            if (svc) servizio = svc.nome;
          }
          return Object.assign({}, d, {
            booking_giorno: bk.giorno || '',
            booking_ora: bk.ora || '',
            booking_durata: bk.durata_minuti || '',
            // Fallback campi anagrafici dal booking se mancanti nel deposito
            nome: d.nome || bk.nome || '',
            cognome: d.cognome || bk.cognome || '',
            email: d.email || bk.email || '',
            telefono: d.telefono || bk.telefono || '',
            targa: d.targa || bk.targa || '',
            modello: d.modello || bk.modello || '',
            note_cliente: d.note_cliente || bk.note_cliente || '',
            servizio: servizio
          });
        }
      }
      return Object.assign({}, d, { booking_giorno: '', booking_ora: '', booking_durata: '' });
    });
    res.json({ success: true, deposits: enriched, count: depositService.getActiveDepositCount(), max: depositService.MAX_DEPOSITS });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/admin/deposits/:id/status — cambia stato deposito
app.post('/api/admin/deposits/:id/status', authenticateToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const { stato, nota_lorenzo, ore_residue } = req.body;
    const deposit = depositService.updateDeposit(req.params.id, { stato, nota_lorenzo, ore_residue });
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposito non trovato' });

// Se completato o in attesa rimuove task da calendario, se completato invia email
      if (stato === 'completato' || stato === 'in_attesa') {
        const { bookingsDB } = require('./database');
        bookingsDB.delete(function(b) {
          return String(b.deposit_id) === String(deposit.id) && b.service_id === 'extra_work';
        });

        if (stato === 'completato' && deposit.email) {
        sendDepositCompletionEmail(deposit)
          .then(function (r) { if (!r.success) console.log('Email ritiro non inviata:', r.message); })
          .catch(function (e) { console.error('Errore email ritiro:', e.message); });
      }
    }

    res.json({ success: true, deposit });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/deposits/:id/nota — aggiorna nota_lorenzo
app.put('/api/admin/deposits/:id/nota', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const { nota_lorenzo } = req.body;
    const deposit = depositService.updateDeposit(req.params.id, { nota_lorenzo });
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposito non trovato' });
    res.json({ success: true, deposit });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/deposits/:id/ore — aggiorna ore_residue
app.put('/api/admin/deposits/:id/ore', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const { ore_residue } = req.body;
    const deposit = depositService.updateDeposit(req.params.id, { ore_residue });
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposito non trovato' });
    res.json({ success: true, deposit });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/admin/deposits/:id/schedule — assegna slot al deposito e cambia stato
app.post('/api/admin/deposits/:id/schedule', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });

    const { slots } = req.body;
    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ success: false, error: 'Nessuno slot fornito' });
    }

    const { bookingsDB } = require('./database');
    const depositService = require('./depositService'); // Ensure it's required
    const allDeposits = depositService.getAllDeposits();
    const deposit = allDeposits.find(d => String(d.id) === String(req.params.id));
    
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposito non trovato' });

    const ore_stimate = req.body.ore_stimate || deposit.ore_residue || deposit.ore_stimate || 0;
    
    // Create a booking for each provided slot
    for (const slot of slots) {
      const slotDate = slot.date || slot.giorno;
      const slotTime = slot.time || slot.ora;
      if (!slotDate || !slotTime) continue;

      const booking = {
        nome: deposit.nome || 'Straordinario',
        cognome: deposit.cognome || '',
        email: deposit.email || 'interno@lb-service.it',
        telefono: deposit.telefono || '',
        targa: deposit.targa || '',
        modello: deposit.modello || '',
        tipo: 'deposito',
        giorno: slotDate,
        ora: slotTime,
        stato: 'confermato',
        service_id: 'extra_work',
        deposit_id: deposit.id,
        user_id: deposit.user_id || null,
        ore_stimate: ore_stimate,
        durata_minuti: 15
      };
      bookingsDB.insert(booking);
    }

    // Set status to in_corso automatically upon scheduling
    const updatedDeposit = depositService.updateDeposit(deposit.id, { stato: 'in_corso' });

    res.json({ success: true, deposit: updatedDeposit, message: 'Slot assegnati e stato aggiornato a in_corso' });
  } catch (error) {
    console.error('Error scheduling deposit:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== VEHICLES API ====================

// GET /api/vehicles — veicoli dell'utente autenticato
app.get('/api/vehicles', authenticateToken, (req, res) => {
  try {
    const { vehiclesDB, usersDB: uDB } = require('./database');
    const user = uDB.findOne(function (u) { return u.email === req.user.email; });
    if (!user) return res.json({ success: true, vehicles: [] });
    const vehicles = vehiclesDB.findMany(function (v) { return String(v.user_id) === String(user.id); });
    res.json({ success: true, vehicles });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/vehicles — salva veicolo per l'utente autenticato
app.post('/api/vehicles', authenticateToken, (req, res) => {
  try {
    const { vehiclesDB, usersDB: uDB } = require('./database');
    const user = uDB.findOne(function (u) { return u.email === req.user.email; });
    if (!user) return res.status(404).json({ success: false, error: 'Utente non trovato' });
    const { targa, modello, anno } = req.body;
    if (!targa) return res.status(400).json({ success: false, error: 'Targa obbligatoria' });
    // Evita duplicati per stessa targa
    const existing = vehiclesDB.findOne(function (v) {
      return String(v.user_id) === String(user.id) && v.targa === targa.toUpperCase().trim();
    });
    if (existing) return res.json({ success: true, vehicle: existing, duplicate: true });
    const id = vehiclesDB.insert({ user_id: user.id, targa: targa.toUpperCase().trim(), modello: modello || '', anno: anno || null });
    const vehicle = vehiclesDB.findOne(function (v) { return String(v.id) === String(id); });
    res.status(201).json({ success: true, vehicle });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/admin/users/:email/vehicles — veicoli salvati di un utente + conteggio prenotazioni
app.get('/api/admin/users/:email/vehicles', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const { usersDB, vehiclesDB, bookingsDB: bDB } = require('./database');
    const user = usersDB.findOne(function (u) { return u.email === req.params.email; });
    if (!user) return res.status(404).json({ success: false, error: 'Utente non trovato' });
    const vehicles = vehiclesDB.findMany(function (v) { return String(v.user_id) === String(user.id); });
    const result = vehicles.map(function (v) {
      const bookingCount = bDB.findMany(function (b) {
        return (b.targa || '').toUpperCase() === (v.targa || '').toUpperCase() && b.stato !== 'annullato';
      }).length;
      return Object.assign({}, v, { booking_count: bookingCount });
    });
    res.json({ success: true, vehicles: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/admin/vehicles/targa/:targa — storico veicolo per targa (admin)
app.get('/api/admin/vehicles/targa/:targa', authenticateToken, (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Accesso negato' });
    const targa = req.params.targa.toUpperCase().trim();
    const { bookingsDB: bDB, depositsDB: dDB } = require('./database');
    const bookings = bDB.findMany(function (b) { return (b.targa || '').toUpperCase() === targa; });
    const deposits = dDB.findMany(function (d) { return (d.targa || '').toUpperCase() === targa; });
    res.json({ success: true, targa, bookings, deposits });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==================== PAGE ROUTES ====================

// Serve password reset pages
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/reset-password.html'));
});

app.get('/new-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/new-password.html'));
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status < 500 ? err.message : 'Errore interno del server' });
});

// ==================== START SERVER ====================

const PORT = config.server.port;

// Inizializza database e poi avvia server
async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 Server avviato su http://localhost:${PORT}`);
      console.log(`🏪 ${config.studio.name}`);
    });
  } catch (error) {
    console.error('❌ Errore avvio server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;


