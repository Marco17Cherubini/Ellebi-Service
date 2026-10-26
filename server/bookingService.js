const {
  bookingsDB,
  usersDB,
  holidaysDB,
  depositsDB,
  servicesDB,
  withTransaction
} = require('./database');
const { badRequest } = require('./errors');
const {
  CONSEGNA_DURATION,
  findService,
  isConsegnaService,
  getServiceDuration
} = require('./catalogService');
const depositService = require('./depositService');
const config = require('../config/config');
const crypto = require('crypto');
const { dayOfWeek, todayString } = require('./dates');

// Genera token univoco per gestione prenotazione (32 caratteri hex)
function generateBookingToken() {
  return crypto.randomBytes(16).toString('hex');
}

// 🛡️ Validazione lunghezza input: tronca campi di testo a lunghezze sicure
function sanitizeText(value, maxLen) {
  if (!value) return '';
  return String(value).trim().slice(0, maxLen);
}

// Verifica se il giorno è tra quelli di apertura (config.businessHours.daysOpen)
function isDayAvailable(date) {
  const weekday = dayOfWeek(date);
  return config.businessHours.daysOpen.includes(weekday);
}

// Ottieni gli slot per un giorno specifico (sabato ha orari diversi)
function getSlotsForDay(date, includeExtraSlots = false) {
  const weekday = dayOfWeek(date);
  const hours = weekday === 6 ? config.businessHours.saturday : config.businessHours.weekday;

  let slots = [...hours.morning.slots, ...hours.afternoon.slots];

  // Se VIP o admin, aggiungi orari extra (pre-orario + straordinari serali)
  if (includeExtraSlots) {
    // Slot pre-orario (08:00) disponibile tutti i giorni lavorativi
    const preOpeningSlot = ['08:00'];
    const extraSlotsWeekday = [
      '18:00',
      '18:45',
      '19:30',
      '20:15',
      '21:00',
      '21:45',
      '22:30',
      '23:15'
    ];
    const extraSlotsSaturday = [
      '15:30',
      '16:15',
      '17:00',
      '17:45',
      '18:30',
      '19:15',
      '20:00',
      '20:45',
      '21:30',
      '22:15',
      '23:00'
    ];
    const extraSlots = weekday === 6 ? extraSlotsSaturday : extraSlotsWeekday;
    // Pre-orario, slot normali, poi serali (senza duplicati: 18:00 è anche uno slot normale)
    slots = [...new Set([...preOpeningSlot, ...slots, ...extraSlots])];
  }

  return slots;
}

// Helper: converte orario stringa (HH:MM) in minuti trascorsi da mezzanotte
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// Prenotazione da ignorare nel calcolo (quella che si sta modificando o spostando):
// per id se disponibile, altrimenti per giorno e ora
function isExcluded(booking, excludeBooking) {
  if (!excludeBooking) return false;
  if (excludeBooking.id) return booking.id === excludeBooking.id;
  return booking.giorno === excludeBooking.giorno && booking.ora === excludeBooking.ora;
}

// Minuti occupati da una prenotazione esistente. Ogni blocco extra_work vale sempre 15 minuti,
// qualunque sia il valore di durata_minuti (dati storici con DEFAULT 60)
function occupiedMinutes(booking) {
  return booking.service_id === 'extra_work' ? 15 : parseInt(booking.durata_minuti, 10) || 15;
}

// Validatore Temporale Universale a base matematica (Time Ranges)
function computeAvailableSlots(
  date,
  durataMinuti = 15,
  includeExtraSlots = false,
  excludeBooking = null
) {
  if (!date || !DATE_REGEX.test(date)) {
    return [];
  }
  if (!isDayAvailable(date)) {
    return [];
  }

  const effectiveDurata = durataMinuti && durataMinuti > 0 ? parseInt(durataMinuti, 10) : 15;
  const allSlots = getSlotsForDay(date, includeExtraSlots);

  // 1. Mappa occupazioni in intervalli matematici [start, end]
  const existingBookings = bookingsDB.findMany(b => b.giorno === date);
  const occupiedRanges = [];

  existingBookings.forEach(b => {
    // Se stiamo modificando una prenotazione, escludi lo slot originale dal calcolo
    if (isExcluded(b, excludeBooking)) {
      return;
    }
    const startMin = timeToMinutes(b.ora);
    const duration = occupiedMinutes(b);
    occupiedRanges.push({ start: startMin, end: startMin + duration });
  });

  // 2. Mappa ferie in intervalli (le ferie base occupano blocchi da 15min)
  const holidays = holidaysDB.readAll();
  holidays
    .filter(h => h.giorno === date)
    .forEach(h => {
      const startMin = timeToMinutes(h.ora);
      occupiedRanges.push({ start: startMin, end: startMin + 15 });
    });

  // 3. Calcola i limiti di turno (Shifts) per la giornata
  const weekday = dayOfWeek(date);
  const hoursConfig = weekday === 6 ? config.businessHours.saturday : config.businessHours.weekday;

  const validShifts = [];
  if (includeExtraSlots) {
    // Admin o VIP vedono l'intera giornata senza barriere orarie strutturali tra mattina/pomeriggio
    validShifts.push({ start: timeToMinutes('08:00'), end: timeToMinutes('24:00') });
  } else {
    // Utenti normali non possono scavalcare i salti di turno (es. pausa pranzo)
    if (hoursConfig.morning && hoursConfig.morning.start && hoursConfig.morning.end) {
      validShifts.push({
        start: timeToMinutes(hoursConfig.morning.start),
        end: timeToMinutes(hoursConfig.morning.end)
      });
    }
    // Pomeriggio
    if (hoursConfig.afternoon && hoursConfig.afternoon.start && hoursConfig.afternoon.end) {
      validShifts.push({
        start: timeToMinutes(hoursConfig.afternoon.start),
        end: timeToMinutes(hoursConfig.afternoon.end)
      });
    }
  }

  // Solo slot futuri: giorni successivi interi, oggi solo gli orari non ancora passati
  const now = new Date();
  const todayStr = todayString();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return allSlots
    .filter(slot => {
      // Mantiene solo slot futuri (confronto pragmatico basato su stringhe yyyy-mm-dd e minuti passati da mezzanotte)
      if (date > todayStr) return true; // Giorni futuri
      if (date < todayStr) return false; // Giorni passati

      // Stesso giorno, confronto intero matematico
      return timeToMinutes(slot) > nowMinutes;
    })
    .map(slot => {
      const startReq = timeToMinutes(slot);
      const endReq = startReq + effectiveDurata;

      let isHoliday = holidays.some(h => h.giorno === date && h.ora === slot);
      let available = true;

      // A) Controlla se l'intervallo cade interamente in uno dei turni (limita scavalco orari/pranzo)
      let fitsInShift = false;
      for (const shift of validShifts) {
        if (startReq >= shift.start && endReq <= shift.end) {
          fitsInShift = true;
          break;
        }
      }
      if (!fitsInShift) {
        available = false;
      }

      // B) Controlla collisione (intersezione geometrica) con occupazioni o ferie
      if (available) {
        for (const range of occupiedRanges) {
          // c'è intersezione se l'inizio richiesto è prima della fine occupata E la fine richiesta è dopo l'inizio occupato
          if (startReq < range.end && endReq > range.start) {
            available = false;
            break;
          }
        }
      }

      return {
        time: slot,
        available: available,
        isHoliday: isHoliday
      };
    });
}

// Alias legacy per API non aggiornate al V2 duration-aware
function getAvailableSlots(date, includeExtraSlots = false, excludeBooking = null) {
  return computeAvailableSlots(date, 15, includeExtraSlots, excludeBooking);
}

// Wrapper per API service duration-aware
function getAvailableSlotsForService(
  date,
  durataMinuti,
  includeExtraSlots = false,
  excludeBooking = null
) {
  return computeAvailableSlots(date, durataMinuti, includeExtraSlots, excludeBooking);
}

// Validazione Regex sicura per Giorno (YYYY-MM-DD) e Ora (HH:MM)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Valida data/ora e verifica che l'intervallo [orario, orario + durata) sia prenotabile.
// extendedHours: orari estesi (pre-apertura, serali, senza pausa pranzo) solo per VIP e admin.
function assertBookable(data, orario, durata, extendedHours) {
  if (!data || !orario) {
    throw badRequest('Data e orario sono obbligatori');
  }
  if (!DATE_REGEX.test(data)) {
    throw badRequest('Formato data non valido (atteso YYYY-MM-DD)');
  }
  if (!TIME_REGEX.test(orario)) {
    throw badRequest('Formato ora non valido (atteso HH:MM)');
  }

  const slot = computeAvailableSlots(data, durata, extendedHours).find(s => s.time === orario);
  if (!slot) {
    throw badRequest('Orario non valido o non selezionabile per questa data');
  }
  if (!slot.available) {
    throw badRequest(
      "Lo slot o l'intervallo richiesto non è disponibile (conflitto o pausa pranzo)"
    );
  }
}

// Servizio scelto dal cliente: deve esistere ed essere attivo. La durata viene dal listino,
// mai dal client.
function requireBookableService(serviceId) {
  if (!serviceId) throw badRequest('Seleziona un servizio');
  const service = findService(serviceId);
  if (!service || !(service.attivo === 1 || service.attivo === '1')) {
    throw badRequest('Servizio non disponibile');
  }
  return service;
}

// Crea una prenotazione cliente per un servizio a appuntamento
function createBooking(userEmail, bookingData, { extendedHours = false } = {}) {
  const { data, orario, targa, modello, note_cliente } = bookingData;
  const service = requireBookableService(bookingData.serviceId || bookingData.service_id);
  const durata = getServiceDuration(service);

  assertBookable(data, orario, durata, extendedHours);

  const user = usersDB.findOne(u => u.email === userEmail);
  if (!user) {
    throw badRequest('Utente non trovato');
  }

  const bookingToken = generateBookingToken();
  bookingsDB.insert({
    nome: user.nome,
    cognome: user.cognome,
    email: user.email,
    telefono: user.telefono,
    giorno: data,
    ora: orario,
    token: bookingToken,
    service_id: service.id,
    targa: sanitizeText(targa, 10).toUpperCase(),
    modello: sanitizeText(modello, 100),
    durata_minuti: durata,
    tipo: 'cliente',
    note_cliente: sanitizeText(note_cliente, 1000)
  });

  return bookingsDB.findOne(b => b.token === bookingToken);
}

// Crea la prenotazione di accoglienza per una consegna veicolo (durata fissa di 30 minuti)
function createConsegnaBooking(userEmail, bookingData, { extendedHours = false } = {}) {
  const { data, orario, targa, modello, note_cliente, nome, cognome, telefono } = bookingData;
  const service = requireBookableService(bookingData.serviceId || bookingData.service_id);

  if (!targa || !targa.toString().trim()) {
    throw badRequest('La targa del veicolo è obbligatoria per le consegne');
  }
  if (!modello || !modello.toString().trim()) {
    throw badRequest('Il modello del veicolo è obbligatorio per le consegne');
  }
  assertBookable(data, orario, CONSEGNA_DURATION, extendedHours);

  // Dati utente (registrato o ospite)
  const user = usersDB.findOne(u => u.email === userEmail);
  const bookingToken = generateBookingToken();
  bookingsDB.insert({
    nome: user ? user.nome : nome || '',
    cognome: user ? user.cognome : cognome || '',
    email: userEmail,
    telefono: user ? user.telefono : telefono || '',
    giorno: data,
    ora: orario,
    token: bookingToken,
    service_id: service.id,
    targa: sanitizeText(targa, 10).toUpperCase(),
    modello: sanitizeText(modello, 100),
    tipo: 'deposito',
    durata_minuti: CONSEGNA_DURATION,
    note_cliente: sanitizeText(note_cliente, 1000)
  });

  return bookingsDB.findOne(b => b.token === bookingToken);
}

// Ottieni prenotazioni attive di un utente (future + non annullate, escluse extra_work)
function getUserBookings(userEmail) {
  const today = todayString();
  return bookingsDB.findMany(
    b =>
      b.email === userEmail &&
      b.stato !== 'annullato' &&
      b.giorno >= today &&
      b.service_id !== 'extra_work'
  );
}

// Cancella prenotazione
function cancelBooking(giorno, ora, userEmail) {
  const booking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);

  if (!booking) {
    throw badRequest('Prenotazione non trovata');
  }

  if (booking.email !== userEmail) {
    throw badRequest('Non autorizzato');
  }

  // Cancellare una consegna elimina anche il deposito e i blocchi di lavoro collegati
  withTransaction(() => {
    cleanDepositOnCancellation(booking);
    bookingsDB.delete(b => b.id === booking.id);
  });

  return true;
}

// Crea prenotazione da admin (senza verifica utente)
function createAdminBooking(bookingData) {
  const {
    nome,
    cognome,
    email,
    telefono,
    giorno,
    ora,
    servizio,
    // Campi v2
    service_id,
    serviceId,
    targa,
    modello,
    durata_minuti,
    tipo,
    note_cliente,
    nota_interna,
    deposit_id
  } = bookingData;

  // Validazione Pragmatic Security (solo cognome, giorno, ora obbligatori per admin)
  if (!cognome || !giorno || !ora) {
    throw badRequest('Cognome, giorno e ora sono obbligatori');
  }
  if (!DATE_REGEX.test(giorno)) {
    throw badRequest('Formato data non valido (atteso YYYY-MM-DD)');
  }
  if (!TIME_REGEX.test(ora)) {
    throw badRequest('Formato ora non valido (atteso HH:MM)');
  }

  // Determina se è una consegna (per il caller in server.js che controlla booking.isConsegna)
  const isConsegna = tipo === 'deposito' || tipo === 'consegna';

  // Durata: dal listino se il servizio è indicato, altrimenti quella scelta dall'admin (default 15)
  const service = findService(service_id || serviceId);
  const effectiveDurata = service ? getServiceDuration(service) : parseInt(durata_minuti, 10) || 15;

  // Deleghiamo il controllo al Validatore temporale (admin include extraSlots = true)
  const availableSlots = computeAvailableSlots(giorno, effectiveDurata, true);
  const targetSlotObj = availableSlots.find(s => s.time === ora);

  if (!targetSlotObj) {
    throw badRequest('Orario non valido o fuori range lavorativo');
  }

  // L'incrocio invalido viene bloccato anche all'admin
  if (!targetSlotObj.available) {
    throw badRequest(
      "L'intervallo richiesto si sovrappone a una prenotazione esistente o alle ferie"
    );
  }

  // Crea record Singolo
  const bookingToken = generateBookingToken();

  const singleBookingRecord = {
    nome: sanitizeText(nome, 100),
    cognome: sanitizeText(cognome, 100),
    email: email ? sanitizeText(email, 254).toLowerCase() : '',
    telefono: sanitizeText(telefono, 20),
    giorno: giorno,
    ora: ora,
    servizio: sanitizeText(servizio, 200),
    token: bookingToken,
    // Campi v2
    service_id: service_id || serviceId || null,
    targa: sanitizeText(targa, 10).toUpperCase(),
    modello: sanitizeText(modello, 100),
    durata_minuti: effectiveDurata,
    tipo: tipo || 'cliente',
    note_cliente: sanitizeText(note_cliente, 1000),
    nota_interna: sanitizeText(nota_interna, 1000),
    deposit_id: deposit_id || null
  };

  bookingsDB.insert(singleBookingRecord);

  // Recupera il booking con id dal DB
  const mainBooking = bookingsDB.findOne(
    b => b.giorno === giorno && b.ora === ora && b.token === bookingToken
  );

  const result = mainBooking || singleBookingRecord;

  // Aggiunge flag isConsegna per il caller in server.js
  result.isConsegna = isConsegna;

  return result;
} // Helper interno per pulire i depositi e blocchi correlati quando si cancella una prenotazione
function cleanDepositOnCancellation(booking) {
  if (!booking) return;

  const isExtraWork = booking.service_id === 'extra_work';

  // Trova il deposito collegato in modo robusto:
  // 1) Tramite booking_id (il deposito punta a questa prenotazione consegna)
  // 2) Tramite deposit_id (la prenotazione punta al deposito)
  let deposit = depositsDB.findOne(d => String(d.booking_id) === String(booking.id));
  if (!deposit && booking.deposit_id) {
    deposit = depositsDB.findOne(d => String(d.id) === String(booking.deposit_id));
  }

  const isPurpleDelivery = !!deposit && !isExtraWork;
  const depId = deposit ? deposit.id : booking.deposit_id || null;

  if (!depId) return;

  if (isPurpleDelivery) {
    // Cancellazione della consegna (Deposito) → elimina tutto: extra_work + deposito
    bookingsDB.delete(b => String(b.deposit_id) === String(depId) && b.service_id === 'extra_work');
    try {
      depositService.deleteDeposit(depId);
    } catch (e) {
      console.error('Errore eliminazione deposito:', e);
    }
  } else if (isExtraWork) {
    // Cancellazione di uno slot extra_work → elimina tutti gli slot, deposito resta (torna in_attesa)
    bookingsDB.delete(b => String(b.deposit_id) === String(depId) && b.service_id === 'extra_work');
    try {
      depositService.updateDeposit(depId, { stato: 'in_attesa' });
    } catch (e) {
      console.error('Errore aggiornamento deposito:', e);
    }
  }
}

// Cancella prenotazione da admin (senza verifica proprietario)
function adminCancelBooking(giorno, ora) {
  if (!giorno || !ora) {
    throw badRequest('Giorno e ora sono obbligatori');
  }
  if (!DATE_REGEX.test(giorno) || !TIME_REGEX.test(ora)) {
    throw badRequest('Formato data o ora non valido');
  }

  const booking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);
  if (!booking) {
    throw badRequest('Prenotazione non trovata');
  }

  withTransaction(() => {
    cleanDepositOnCancellation(booking);
    bookingsDB.delete(b => b.id === booking.id);
  });

  return true;
}

// Sposta una prenotazione (drag & drop dell'admin) mantenendone id e durata: il nuovo
// intervallo non può sovrapporsi ad altre prenotazioni o alle ferie. L'id invariato
// conserva il collegamento con l'eventuale deposito.
function moveBooking(oldGiorno, oldOra, newGiorno, newOra) {
  if (!oldGiorno || !oldOra || !newGiorno || !newOra) {
    throw badRequest('Tutti i campi sono obbligatori');
  }
  if (!DATE_REGEX.test(newGiorno) || !DATE_REGEX.test(oldGiorno)) {
    throw badRequest('Formato data non valido (atteso YYYY-MM-DD)');
  }
  if (!TIME_REGEX.test(newOra) || !TIME_REGEX.test(oldOra)) {
    throw badRequest('Formato ora non valido (atteso HH:MM)');
  }

  const booking = bookingsDB.findOne(b => b.giorno === oldGiorno && b.ora === oldOra);
  if (!booking) {
    throw badRequest('Prenotazione non trovata');
  }

  const slot = computeAvailableSlots(newGiorno, occupiedMinutes(booking), true, {
    id: booking.id
  }).find(s => s.time === newOra);
  if (!slot || !slot.available) {
    throw badRequest('Il nuovo orario si sovrappone a un altro appuntamento o alle ferie');
  }

  bookingsDB.update(b => b.id === booking.id, { giorno: newGiorno, ora: newOra });
  return bookingsDB.findOne(b => b.id === booking.id);
}

// ==================== FLUSSI COMPLETI (prenotazione + deposito) ====================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Consegna veicolo: prenotazione di accoglienza + deposito collegato (da eseguire in transazione)
function createDropOff(email, payload, depositData, limitMessage, options) {
  if (!depositService.canAcceptDeposit()) throw badRequest(limitMessage);

  const booking = createConsegnaBooking(email, payload, options);
  const deposit = depositService.createDeposit(booking.id, depositData);
  bookingsDB.update(b => String(b.id) === String(booking.id), { deposit_id: deposit.id });
  booking.deposit_id = deposit.id;
  return { booking, deposit };
}

function depositFields(data, service, person) {
  return {
    ...person,
    targa: data.targa || '',
    modello: data.modello || '',
    servizio: service ? service.nome : data.servizio || '',
    ore_stimate: data.ore_stimate || 0,
    note_cliente: data.note_cliente || data.noteCliente || ''
  };
}

/**
 * Prenotazione di un cliente registrato. Con old_giorno/old_ora sostituisce una propria
 * prenotazione (modifica): tutto in una transazione, se la nuova non è valida la vecchia resta.
 * Restituisce { booking, deposit, isConsegna }.
 */
function createCustomerBooking(email, data, options = {}) {
  return withTransaction(() => {
    if (data.old_giorno && data.old_ora) {
      const old = getUserBookings(email).find(
        b => b.giorno === data.old_giorno && b.ora === data.old_ora
      );
      if (old) {
        cleanDepositOnCancellation(old);
        bookingsDB.delete(b => b.id === old.id);
      }
    }

    const service = findService(data.serviceId);
    if (!isConsegnaService(service)) {
      return { booking: createBooking(email, data, options), deposit: null, isConsegna: false };
    }

    const user = usersDB.findOne(u => u.email === email) || {};
    const person = {
      nome: data.nome || user.nome || '',
      cognome: data.cognome || user.cognome || '',
      email,
      telefono: data.telefono || user.telefono || ''
    };
    const result = createDropOff(
      email,
      data,
      depositFields(data, service, person),
      depositService.depositLimitMessage('Contattare il laboratorio.'),
      options
    );
    return { ...result, isConsegna: true };
  });
}

/**
 * Prenotazione senza account: crea (o riusa) un profilo ospite senza password.
 * Accetta sia { data, orario } sia { giorno, ora }. Restituisce { booking, deposit }.
 */
function createGuestBooking(data) {
  const { nome, cognome, email, giorno, ora } = data;
  if (!nome || !cognome || !email) throw badRequest('Nome, cognome e email sono obbligatori');
  if (!giorno || !ora) throw badRequest('Dati prenotazione incompleti (giorno, ora)');
  if (!EMAIL_REGEX.test(email)) throw badRequest('Formato email non valido');

  const emailLower = email.trim().toLowerCase();
  const payload = { ...data, data: data.data || giorno, orario: data.orario || ora };

  return withTransaction(() => {
    const now = new Date().toISOString();
    if (usersDB.findOne(u => u.email === emailLower)) {
      usersDB.update(u => u.email === emailLower, { last_active_at: now });
    } else {
      usersDB.insert({
        nome: nome.trim().slice(0, 100),
        cognome: cognome.trim().slice(0, 100),
        email: emailLower,
        telefono: '',
        password: '',
        vip: '0',
        banned: '0',
        isGuest: '1',
        last_active_at: now
      });
    }

    const service = findService(data.serviceId);
    if (!isConsegnaService(service)) {
      return { booking: createBooking(emailLower, payload), deposit: null };
    }
    const person = {
      nome: nome.trim(),
      cognome: cognome.trim(),
      email: emailLower,
      telefono: data.telefono || ''
    };
    return createDropOff(
      emailLower,
      payload,
      depositFields(data, service, person),
      'Limite depositi raggiunto. Contattare il laboratorio.'
    );
  });
}

/**
 * Prenotazione inserita dall'admin dal calendario; per i servizi di consegna crea anche il deposito.
 * Restituisce { booking, deposit }.
 */
function createAdminBookingWithDeposit(data) {
  const service = findService(data.serviceId || data.service_id);
  const consegna = isConsegnaService(service);
  if (consegna && !depositService.canAcceptDeposit()) {
    throw badRequest(
      depositService.depositLimitMessage('Non è possibile aggiungere altri lavori straordinari.')
    );
  }

  return withTransaction(() => {
    const booking = createAdminBooking(consegna ? { ...data, tipo: 'deposito' } : data);
    if (!booking.isConsegna) return { booking, deposit: null };

    const person = {
      nome: data.nome || '',
      cognome: data.cognome || '',
      email: data.email || '',
      telefono: data.telefono || ''
    };
    const deposit = depositService.createDeposit(booking.id, depositFields(data, service, person));
    bookingsDB.update(b => String(b.id) === String(booking.id), { deposit_id: deposit.id });
    booking.deposit_id = deposit.id;
    return { booking, deposit };
  });
}

/**
 * Pianifica il lavoro su un deposito: un blocco extra_work da 15 minuti per ogni slot
 * { date, time } (o { giorno, ora }) e deposito "in corso". Ogni blocco deve cadere in un
 * orario libero: se uno solo non è disponibile non viene pianificato nulla.
 */
function scheduleExtraWork(depositId, slots) {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw badRequest('Nessuno slot fornito');
  }

  return withTransaction(() => {
    const deposit = depositService.requireDeposit(depositId);

    for (const slot of slots) {
      const giorno = slot.date || slot.giorno;
      const ora = slot.time || slot.ora;
      assertBookable(giorno, ora, 15, true);

      bookingsDB.insert({
        nome: deposit.nome || 'Straordinario',
        cognome: deposit.cognome || '',
        email: deposit.email || 'interno@lb-service.it',
        telefono: deposit.telefono || '',
        targa: deposit.targa || '',
        modello: deposit.modello || '',
        tipo: 'deposito',
        giorno,
        ora,
        stato: 'confermato',
        service_id: depositService.EXTRA_WORK,
        deposit_id: deposit.id,
        durata_minuti: 15
      });
    }

    return depositService.updateDeposit(deposit.id, { stato: 'in_corso' });
  });
}

// ==================== VISTE ====================

function serviceName(booking) {
  if (booking.service_id) {
    const service = servicesDB.findOne(s => String(s.id) === String(booking.service_id));
    if (service) return service.nome;
  }
  return booking.servizio || 'Prenotazione';
}

// Prenotazioni attive del cliente, con nome del servizio; le prenotazioni con lo stesso
// token (vecchie prenotazioni multi-slot) vengono mostrate come una sola
function getUserBookingList(email) {
  const byToken = {};
  const standalone = [];

  getUserBookings(email).forEach(b => {
    if (b.token) (byToken[b.token] = byToken[b.token] || []).push(b);
    else standalone.push({ ...b, servizio: serviceName(b) });
  });

  const grouped = Object.values(byToken).map(group => {
    group.sort((a, b) => (a.ora < b.ora ? -1 : 1));
    const first = group[0];
    const durata = first.durata_minuti ? parseInt(first.durata_minuti, 10) : group.length * 15;
    return { ...first, servizio: serviceName(first), durata_minuti: durata };
  });

  return [...grouped, ...standalone];
}

// Prenotazioni per il calendario admin, arricchite con servizio, tipo veicolo e,
// per consegne e blocchi di lavoro, con i dati del deposito collegato
function getAdminBookings() {
  const findById = id => servicesDB.findOne(s => String(s.id) === String(id));

  return bookingsDB.readAll().map(bk => {
    let servizio = bk.servizio || '';
    if (!servizio && bk.service_id) {
      const service = findById(bk.service_id);
      if (service) servizio = service.nome;
    }
    let tipoVeicolo = '';
    if (bk.service_id && bk.service_id !== 'extra_work') {
      const service = findById(bk.service_id);
      if (service) tipoVeicolo = service.tipo_veicolo || '';
    }

    if (bk.tipo !== 'deposito') {
      const changes = {};
      if (servizio !== bk.servizio) changes.servizio = servizio;
      if (tipoVeicolo) changes.tipo_veicolo = tipoVeicolo;
      return Object.keys(changes).length ? { ...bk, ...changes } : bk;
    }

    // Deposito collegato: via booking_id (consegna) oppure via deposit_id (blocco di lavoro)
    const deposit =
      depositsDB.findOne(d => String(d.booking_id) === String(bk.id)) ||
      (bk.deposit_id ? depositsDB.findOne(d => String(d.id) === String(bk.deposit_id)) : null);
    if (!deposit) return { ...bk, servizio, tipo_veicolo: tipoVeicolo };

    if (bk.service_id === 'extra_work' && deposit.servizio) {
      const service = servicesDB.findOne(s => s.nome === deposit.servizio);
      if (service) tipoVeicolo = service.tipo_veicolo || '';
    }
    return {
      ...bk,
      // Per i blocchi di lavoro il servizio del deposito ha la precedenza
      servizio:
        bk.service_id === 'extra_work'
          ? deposit.servizio || servizio || ''
          : servizio || deposit.servizio || '',
      targa: bk.targa || deposit.targa || '',
      modello: bk.modello || deposit.modello || '',
      note_cliente: bk.note_cliente || deposit.note_cliente || '',
      telefono: bk.telefono || deposit.telefono || '',
      ore_stimate: deposit.ore_stimate || 0,
      nota_interna: deposit.nota_lorenzo || '',
      tipo_veicolo: tipoVeicolo
    };
  });
}

module.exports = {
  getAvailableSlots,
  getAvailableSlotsForService,
  createCustomerBooking,
  createGuestBooking,
  createAdminBookingWithDeposit,
  scheduleExtraWork,
  getUserBookingList,
  getAdminBookings,
  cancelBooking,
  adminCancelBooking,
  moveBooking
};
