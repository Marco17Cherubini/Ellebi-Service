const { bookingsDB, usersDB, holidaysDB } = require('./database');
const { generateId } = require('./authService');
const config = require('../config/config');
const crypto = require('crypto');

// Genera token univoco per gestione prenotazione (32 caratteri hex)
function generateBookingToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Durata standard appuntamento (minuti)
const APPOINTMENT_DURATION = config.appointmentDuration || 45;

// 🛡️ Validazione lunghezza input: tronca campi di testo a lunghezze sicure
function sanitizeText(value, maxLen) {
  if (!value) return '';
  return String(value).trim().slice(0, maxLen);
}

// Helper: restituisce il giorno della settimana senza sfasamenti UTC (0=Domenica, 1=LunedÃ¬, ...)
function getLocalDayOfWeek(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    // new Date(anno, mese_index, giorno) crea una data a mezzanotte nel fuso locale
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  }
  return new Date(dateStr).getDay();
}

// Verifica se un giorno Ã¨ disponibile (martedÃ¬-sabato)
function isDayAvailable(date) {
  const dayOfWeek = getLocalDayOfWeek(date);
  return config.businessHours.daysOpen.includes(dayOfWeek);
}

// Verifica se uno slot è in ferie
function isHolidaySlot(date, time) {
  const holidays = holidaysDB.readAll();
  return holidays.some(h => h.giorno === date && h.ora === time);
}

// Ottieni gli slot per un giorno specifico (sabato ha orari diversi)
function getSlotsForDay(date, includeExtraSlots = false) {
  const dayOfWeek = getLocalDayOfWeek(date);
  const hours = dayOfWeek === 6 ? config.businessHours.saturday : config.businessHours.weekday;

  let slots = [
    ...hours.morning.slots,
    ...hours.afternoon.slots
  ];

  // Se VIP o admin, aggiungi orari extra (pre-orario + straordinari serali)
  if (includeExtraSlots) {
    // Slot pre-orario (08:00) disponibile tutti i giorni lavorativi
    const preOpeningSlot = ['08:00'];
    const extraSlotsWeekday = ['18:00', '18:45', '19:30', '20:15', '21:00', '21:45', '22:30', '23:15'];
    const extraSlotsSaturday = ['15:30', '16:15', '17:00', '17:45', '18:30', '19:15', '20:00', '20:45', '21:30', '22:15', '23:00'];
    const extraSlots = dayOfWeek === 6 ? extraSlotsSaturday : extraSlotsWeekday;
    // Aggiungi pre-orario all'inizio, poi slot normali, poi straordinari
    slots = [...preOpeningSlot, ...slots, ...extraSlots];
  }

  return slots;
}

// Helper: converte orario stringa (HH:MM) in minuti trascorsi da mezzanotte 
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// Validatore Temporale Universale a base matematica (Time Ranges)
function computeAvailableSlots(date, durataMinuti = 15, includeExtraSlots = false, excludeBooking = null) {
  if (!date || !DATE_REGEX.test(date)) {
    return [];
  }
  if (!isDayAvailable(date)) {
    return [];
  }

  const effectiveDurata = (durataMinuti && durataMinuti > 0) ? parseInt(durataMinuti, 10) : 15;
  const allSlots = getSlotsForDay(date, includeExtraSlots);

  // 1. Mappa occupazioni in intervalli matematici [start, end]
  const existingBookings = bookingsDB.findMany(b => b.giorno === date);
  const occupiedRanges = [];
  
  existingBookings.forEach(b => {
    // Se stiamo modificando una prenotazione, escludi lo slot originale dal calcolo
    if (excludeBooking && b.giorno === excludeBooking.giorno && b.ora === excludeBooking.ora) {
      return;
    }
    const startMin = timeToMinutes(b.ora);
    // Extra_work: ogni record è SEMPRE un singolo blocco da 15 minuti,
    // indipendentemente da cosa c'è scritto in durata_minuti (fix dati storici con DEFAULT 60)
    const duration = (b.service_id === 'extra_work') ? 15 : (parseInt(b.durata_minuti, 10) || 15);
    occupiedRanges.push({ start: startMin, end: startMin + duration });
  });

  // 2. Mappa ferie in intervalli (le ferie base occupano blocchi da 15min)
  const holidays = holidaysDB.readAll();
  holidays.filter(h => h.giorno === date).forEach(h => {
    const startMin = timeToMinutes(h.ora);
    occupiedRanges.push({ start: startMin, end: startMin + 15 });
  });

  // 3. Calcola i limiti di turno (Shifts) per la giornata
  const dayOfWeek = getLocalDayOfWeek(date);
  const hoursConfig = dayOfWeek === 6 ? config.businessHours.saturday : config.businessHours.weekday;
  
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

  // Confronto "Pragmatic Security" senza instanziare nuovi oggetti Date dalle stringhe     
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
function getAvailableSlotsForService(date, durataMinuti, includeExtraSlots = false, excludeBooking = null) {
  return computeAvailableSlots(date, durataMinuti, includeExtraSlots, excludeBooking);
}

// Validazione Regex sicura per Giorno (YYYY-MM-DD) e Ora (HH:MM)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Crea una nuova prenotazione (supporta campi v2)
function createBooking(userEmail, bookingData) {
  const {
    data, orario, numPersone,
    // Campi v2
    serviceId, service_id, targa, modello, durata_minuti, note_cliente
  } = bookingData;

  // Validazione Pragmatic Security (Blocca input corrotti, SQLi bypass, o malformattazioni)
  if (!data || !orario) {
    throw new Error('Data e orario sono obbligatori');
  }
  if (!DATE_REGEX.test(data)) {
    throw new Error('Formato data non valido (atteso YYYY-MM-DD)');
  }
  if (!TIME_REGEX.test(orario)) {
    throw new Error('Formato ora non valido (atteso HH:MM)');
  }

  // Risoluzione del vecchio concetto di "numPersone" in una pura durata temporale
  const hasDuration = durata_minuti || serviceId || service_id;
  let effectiveDurata = 15;
  
  if (hasDuration) {
    effectiveDurata = parseInt(durata_minuti, 10) || APPOINTMENT_DURATION;
  } else {
    // Legacy support: 1 persona = 15 min, 2 persone = 30 min...
    const validNumPersone = Math.min(Math.max(parseInt(numPersone, 10) || 1, 1), 3);
    effectiveDurata = validNumPersone * 15;
  }

  // Deleghiamo interamente il controllo di validità al Core Matematico
  const availableSlots = computeAvailableSlots(data, effectiveDurata, true);
  const targetSlotObj = availableSlots.find(s => s.time === orario);

  if (!targetSlotObj) {
    throw new Error('Orario non valido o non selezionabile per questa data');
  }
  
  if (!targetSlotObj.available) {
    throw new Error('Lo slot o l\'intervallo richiesto non è disponibile (conflitto o pausa pranzo)');
  }

  // Ottieni dati utente
  const user = usersDB.findOne(u => u.email === userEmail);
  if (!user) {
    throw new Error('Utente non trovato');
  }

  // Inserimento a Singolo Record
  const bookingToken = generateBookingToken();
  const singleBookingRecord = {
    nome: user.nome,
    cognome: user.cognome,
    email: user.email,
    telefono: user.telefono,
    giorno: data,
    ora: orario,
    token: bookingToken,
    // Campi v2
    service_id: service_id || serviceId || null,
    targa: sanitizeText(targa, 10).toUpperCase(),
    modello: sanitizeText(modello, 100),
    durata_minuti: effectiveDurata,
    tipo: 'cliente',
    note_cliente: sanitizeText(note_cliente, 1000)
  };

  bookingsDB.insert(singleBookingRecord);

  // Ritorna la prenotazione creata per consentire il fetch dell'id
  const savedBooking = bookingsDB.findOne(b => b.giorno === data && b.ora === orario && b.token === bookingToken);
  return savedBooking || singleBookingRecord;
}

// Crea prenotazione di consegna veicolo (accoglienza 30 min = Single-Record strutturato)
function createConsegnaBooking(userEmail, bookingData) {
  const { data, orario, serviceId, service_id, targa, modello, note_cliente, nome, cognome, telefono } = bookingData;

  // Validazione Pragmatic Security campi obbligatori e formati
  if (!data || !orario) {
    throw new Error('Data e orario sono obbligatori');
  }
  if (!DATE_REGEX.test(data)) {
    throw new Error('Formato data non valido (atteso YYYY-MM-DD)');
  }
  if (!TIME_REGEX.test(orario)) {
    throw new Error('Formato ora non valido (atteso HH:MM)');
  }
  if (!targa || !targa.toString().trim()) {
    throw new Error('La targa del veicolo è obbligatoria per le consegne');
  }
  if (!modello || !modello.toString().trim()) {
    throw new Error('Il modello del veicolo è obbligatorio per le consegne');
  }

  // Durata fissa accoglienza consegna: 30 minuti singoli
  const CONSEGNA_DURATION = 30;

  // Deleghiamo interamente il controllo di validità al Core Matematico
  const availableSlots = computeAvailableSlots(data, CONSEGNA_DURATION, true);
  const targetSlotObj = availableSlots.find(s => s.time === orario);

  if (!targetSlotObj) {
    throw new Error('Orario non valido o non selezionabile per questa data');
  }
  
  if (!targetSlotObj.available) {
    throw new Error('L\'intervallo richiesto non è disponibile (conflitto o pausa pranzo)');
  }

  // Ottieni dati utente (registrato o guest)
  const user = usersDB.findOne(u => u.email === userEmail);
  const userName = user ? user.nome : (nome || '');
  const userSurname = user ? user.cognome : (cognome || '');
  const userPhone = user ? user.telefono : (telefono || '');

  // Crea l'unico record Single-Record
  const bookingToken = generateBookingToken();
  const singleBookingRecord = {
    nome: userName,
    cognome: userSurname,
    email: userEmail,
    telefono: userPhone,
    giorno: data,
    ora: orario,
    token: bookingToken,
    service_id: service_id || serviceId || null,
    targa: sanitizeText(targa, 10).toUpperCase(),
    modello: sanitizeText(modello, 100),
    tipo: 'deposito',
    durata_minuti: CONSEGNA_DURATION,
    note_cliente: sanitizeText(note_cliente, 1000)
  };

  bookingsDB.insert(singleBookingRecord);

  // Ritorna il primo booking (quello principale per collegare il deposito)
  const savedBooking = bookingsDB.findOne(
    b => b.giorno === data && b.ora === orario && b.token === bookingToken
  );

  return savedBooking || singleBookingRecord;
}

// Ottieni prenotazioni attive di un utente (future + non annullate, escluse extra_work)
function getUserBookings(userEmail) {
  const today = new Date().toISOString().split('T')[0];
  return bookingsDB.findMany(b =>
    b.email === userEmail &&
    b.stato !== 'annullato' &&
    b.giorno >= today &&
    b.service_id !== 'extra_work'
  );
}

// Ottieni statistiche prenotazioni per un utente
function getUserBookingStats(userEmail) {
  const bookings = bookingsDB.findMany(b => b.email === userEmail);

  // Conta prenotazioni e trova ultima data
  let count = bookings.length;
  let lastDate = null;

  bookings.forEach(booking => {
    // Confronto diretto della stringa YYYY-MM-DD
    if (!lastDate || String(booking.giorno) > String(lastDate)) {
      lastDate = booking.giorno;
    }
  });

  return { count, lastDate };
}

// Ottieni prenotazione per giorno e ora (identificatore univoco)
function getBookingByDateTime(giorno, ora) {
  return bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);
}

// Cancella prenotazione
function cancelBooking(giorno, ora, userEmail) {
  const booking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);

  if (!booking) {
    throw new Error('Prenotazione non trovata');
  }

  if (booking.email !== userEmail) {
    throw new Error('Non autorizzato');
  }

  // Elimina la prenotazione dal CSV
  bookingsDB.delete(b => b.giorno === giorno && b.ora === ora && b.email === userEmail);

  return true;
}

// Ottieni tutte le prenotazioni (per admin)
function getAllBookings() {
  return bookingsDB.readAll();
}

// Crea prenotazione da admin (senza verifica utente)
function createAdminBooking(bookingData) {
  const {
    nome, cognome, email, telefono, giorno, ora, servizio,
    // Campi v2
    service_id, serviceId, targa, modello, durata_minuti, tipo,
    note_cliente, nota_interna, deposit_id
  } = bookingData;

  // Validazione Pragmatic Security (solo cognome, giorno, ora obbligatori per admin)
  if (!cognome || !giorno || !ora) {
    throw new Error('Cognome, giorno e ora sono obbligatori');
  }
  if (!DATE_REGEX.test(giorno)) {
    throw new Error('Formato data non valido (atteso YYYY-MM-DD)');
  }
  if (!TIME_REGEX.test(ora)) {
    throw new Error('Formato ora non valido (atteso HH:MM)');
  }

  // Determina se è una consegna (per il caller in server.js che controlla booking.isConsegna)
  const isConsegna = tipo === 'deposito' || tipo === 'consegna';

  // Calcola durata effettiva
  const effectiveDurata = durata_minuti ? (parseInt(durata_minuti, 10) || 15) : 15; 

  // Deleghiamo il controllo al Validatore temporale (admin include extraSlots = true)
  const availableSlots = computeAvailableSlots(giorno, effectiveDurata, true);
  const targetSlotObj = availableSlots.find(s => s.time === ora);

  if (!targetSlotObj) {
    throw new Error('Orario non valido o fuori range lavorativo');
  }

  // L'incrocio invalido viene bloccato anche all'admin
  if (!targetSlotObj.available) {
    throw new Error('L\'intervallo richiesto si sovrappone a una prenotazione esistente o alle ferie');
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
}  // Helper interno per pulire i depositi e blocchi correlati quando si cancella una prenotazione
  function cleanDepositOnCancellation(booking) {
    if (!booking) return;

    const isExtraWork = booking.service_id === 'extra_work';
    const { depositsDB } = require('./database');
    const depositService = require('./depositService');

    // Trova il deposito collegato in modo robusto:
    // 1) Tramite booking_id (il deposito punta a questa prenotazione consegna)
    // 2) Tramite deposit_id (la prenotazione punta al deposito)
    let deposit = depositsDB.findOne(d => String(d.booking_id) === String(booking.id));
    if (!deposit && booking.deposit_id) {
      deposit = depositsDB.findOne(d => String(d.id) === String(booking.deposit_id));
    }

    const isPurpleDelivery = !!deposit && !isExtraWork;
    const depId = deposit ? deposit.id : (booking.deposit_id || null);

    if (!depId) return;

    if (isPurpleDelivery) {
      // Cancellazione della consegna (Deposito) → elimina tutto: extra_work + deposito
      bookingsDB.delete(b => String(b.deposit_id) === String(depId) && b.service_id === 'extra_work');
      try { depositService.deleteDeposit(depId); } catch(e) { console.error('Errore eliminazione deposito:', e); }
    } else if (isExtraWork) {
      // Cancellazione di uno slot extra_work → elimina tutti gli slot, deposito resta (torna in_attesa)
      bookingsDB.delete(b => String(b.deposit_id) === String(depId) && b.service_id === 'extra_work');
      try { depositService.updateDeposit(depId, { stato: 'in_attesa' }); } catch(e) { console.error('Errore aggiornamento deposito:', e); }
    }
  }

  // Cancella prenotazione da admin (senza verifica proprietario)
  function adminCancelBooking(giorno, ora) {
    if (!giorno || !ora) {
      throw new Error('Giorno e ora sono obbligatori');
    }
    if (!DATE_REGEX.test(giorno) || !TIME_REGEX.test(ora)) {
      throw new Error('Formato data o ora non valido');
    }

    const booking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);
    if (!booking) {
      throw new Error('Prenotazione non trovata');
    }

    cleanDepositOnCancellation(booking);

    bookingsDB.delete(b => b.giorno === giorno && b.ora === ora);

    return true;
  }

// Helper Pragmatic Security: Calcola le ore mancanti a una prenotazione usando il fuso orario locale Node.js
// senza interpolare stringhe ISO-8601 errate che producono sfasamenti o NaN.   
function getHoursUntilBooking(giorno, ora) {
  if (!giorno || !ora) return 0;
  const [y, m, d] = giorno.split('-').map(Number);
  const [h, min] = ora.split(':').map(Number);
  
  // new Date(anno, mese_index, giorno, ore, minuti) Ã¨ sicuro nel fuso locale     
  const bookingTime = new Date(y, m - 1, d, h, min, 0).getTime();
  const now = new Date().getTime();
  return (bookingTime - now) / (1000 * 60 * 60);
}

// Sposta prenotazione da admin (cambia giorno/ora)
function moveBooking(oldGiorno, oldOra, newGiorno, newOra) {
  if (!oldGiorno || !oldOra || !newGiorno || !newOra) {
    throw new Error('Tutti i campi sono obbligatori');
  }
  if (!DATE_REGEX.test(newGiorno) || !DATE_REGEX.test(oldGiorno)) {
    throw new Error('Formato data non valido (atteso YYYY-MM-DD)');
  }
  if (!TIME_REGEX.test(newOra) || !TIME_REGEX.test(oldOra)) {
    throw new Error('Formato ora non valido (atteso HH:MM)');
  }

  // Trova la prenotazione da spostare
  const booking = bookingsDB.findOne(b => b.giorno === oldGiorno && b.ora === oldOra);
  if (!booking) {
    throw new Error('Prenotazione non trovata');
  }

  // Verifica che il nuovo slot non sia occupato
  const existingBooking = bookingsDB.findOne(b => b.giorno === newGiorno && b.ora === newOra);
  if (existingBooking) {
    throw new Error('Questo slot è già occupato');
  }

  // Verifica che il nuovo slot non sia in ferie
  if (isHolidaySlot(newGiorno, newOra)) {
    throw new Error('Slot non disponibile (ferie)');
  }

  // Elimina la vecchia prenotazione
  bookingsDB.delete(b => b.giorno === oldGiorno && b.ora === oldOra);

  // Crea la nuova prenotazione con i nuovi dati
  const newBooking = {
    ...booking,
    giorno: newGiorno,
    ora: newOra
  };

  bookingsDB.insert(newBooking);

  return newBooking;
}

// ==================== GESTIONE VIA TOKEN (Smart Rescheduling) ====================

// Ottieni prenotazione tramite token univoco
function getBookingByToken(token) {
  if (!token) return null;
  return bookingsDB.findOne(b => b.token === token);
}

// Aggiorna prenotazione tramite token (cambio data/ora)
function updateBookingByToken(token, updates) {
  const booking = getBookingByToken(token);
  if (!booking) {
    throw new Error('Prenotazione non trovata');
  }

  const { newGiorno, newOra } = updates;

    // Verifica politica 24h: non modificabile entro 24h dall'appuntamento
    const hoursUntilBooking = getHoursUntilBooking(booking.giorno, booking.ora);

  if (hoursUntilBooking < 24) {
    throw new Error('Non e possibile modificare la prenotazione entro 24 ore dall\'appuntamento');
  }

  // Se cambia data/ora, verifica disponibilita
  if (newGiorno && newOra && (newGiorno !== booking.giorno || newOra !== booking.ora)) {
    // Verifica slot non occupato
    const existingBooking = bookingsDB.findOne(b =>
      b.giorno === newGiorno && b.ora === newOra && b.token !== token
    );
    if (existingBooking) {
      throw new Error('Questo slot e gia occupato');
    }

    // Verifica non in ferie
    if (isHolidaySlot(newGiorno, newOra)) {
      throw new Error('Slot non disponibile (ferie)');
    }
  }

  // Elimina vecchia prenotazione vincolando strettamente il token
  bookingsDB.delete(b => b.token === token);

  // Crea nuova con dati aggiornati (mantiene lo stesso token)
  const updatedBooking = {
    nome: booking.nome,
    cognome: booking.cognome,
    email: booking.email,
    telefono: booking.telefono,
    giorno: newGiorno || booking.giorno,
    ora: newOra || booking.ora,
    token: booking.token
  };

  bookingsDB.insert(updatedBooking);

  return updatedBooking;
}

// Cancella prenotazione tramite token
function cancelBookingByToken(token) {
  const booking = getBookingByToken(token);
  if (!booking) {
    throw new Error('Prenotazione non trovata');
  }

  // Verifica politica 24h
    const hoursUntilBooking = getHoursUntilBooking(booking.giorno, booking.ora);

  if (hoursUntilBooking < 24) {
    throw new Error('Non e possibile cancellare la prenotazione entro 24 ore dall\'appuntamento');
  }

  // Assicura proprietà al momento del `.delete` vincolandolo al token
  cleanDepositOnCancellation(booking);
    cleanDepositOnCancellation(booking);
    bookingsDB.delete(b => b.token === token && b.id === booking.id);
  return true;
}

module.exports = {
  isDayAvailable,
  getAvailableSlots,
  getAvailableSlotsForService,
  createBooking,
  createConsegnaBooking,
  getUserBookings,
  getUserBookingStats,
  getBookingByDateTime,
  cancelBooking,
  getAllBookings,
  createAdminBooking,
  adminCancelBooking,
  moveBooking,
  getBookingByToken,
  updateBookingByToken,
  cancelBookingByToken,
  generateBookingToken,
  cleanDepositOnCancellation
};
