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

// Verifica se un giorno è disponibile (martedì-sabato)
function isDayAvailable(date) {
  const dayOfWeek = new Date(date).getDay();
  return config.businessHours.daysOpen.includes(dayOfWeek);
}

// Verifica se uno slot è in ferie
function isHolidaySlot(date, time) {
  const holidays = holidaysDB.readAll();
  return holidays.some(h => h.giorno === date && h.ora === time);
}

// Ottieni gli slot per un giorno specifico (sabato ha orari diversi)
function getSlotsForDay(date, includeExtraSlots = false) {
  const dayOfWeek = new Date(date).getDay();
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

// Ottieni tutti gli slot disponibili per una data
function getAvailableSlots(date, includeExtraSlots = false) {
  if (!isDayAvailable(date)) {
    return [];
  }

  const allSlots = getSlotsForDay(date, includeExtraSlots);

  // Trova prenotazioni esistenti per questa data
  const existingBookings = bookingsDB.findMany(
    booking => booking.giorno === date
  );

  const bookedSlots = existingBookings.map(b => b.ora);

  // Trova ferie per questa data
  const holidays = holidaysDB.readAll();
  const holidaySlots = holidays.filter(h => h.giorno === date).map(h => h.ora);

  // Ritorna slot con stato (disponibile, occupato, o ferie)
  const now = new Date(); // Orario server attuale

  return allSlots
    .filter(slot => {
      // Crea data completa dello slot per confronto preciso
      // Assumiamo che date sia formato YYYY-MM-DD e slot HH:MM
      const slotDate = new Date(`${date}T${slot}:00`);

      // Mantiene solo slot futuri
      const keep = slotDate > now;
      if (!keep) {
        // console.log(`[FILTER] Removed past slot ${slot} for ${date} (Server time: ${now.toLocaleTimeString()})`);
      }
      return keep;
    })
    .map(slot => ({
      time: slot,
      available: !bookedSlots.includes(slot) && !holidaySlots.includes(slot),
      isHoliday: holidaySlots.includes(slot)
    }));
}

// Crea una nuova prenotazione (supporta gruppi fino a 3 persone)
function createBooking(userEmail, bookingData) {
  const { data, orario, numPersone = 1 } = bookingData;

  // Validazione
  if (!data || !orario) {
    throw new Error('Data e orario sono obbligatori');
  }

  // Validazione numero persone
  const groupSize = Math.min(Math.max(parseInt(numPersone) || 1, 1), 3);

  // Verifica che il giorno sia disponibile
  if (!isDayAvailable(data)) {
    throw new Error('Il giorno selezionato non è disponibile');
  }

  // Ottieni tutti gli slot per il giorno
  const allSlots = getSlotsForDay(data, true);
  const startIndex = allSlots.indexOf(orario);

  if (startIndex === -1) {
    throw new Error('Orario non valido');
  }

  // Verifica che ci siano abbastanza slot consecutivi
  const slotsToBook = [];
  for (let i = 0; i < groupSize; i++) {
    const slotTime = allSlots[startIndex + i];
    if (!slotTime) {
      throw new Error(`Non ci sono abbastanza slot consecutivi disponibili`);
    }

    // Verifica che lo slot non sia in ferie
    if (isHolidaySlot(data, slotTime)) {
      throw new Error(`Slot ${slotTime} non disponibile (ferie)`);
    }

    // Verifica che lo slot sia ancora disponibile
    const existingBooking = bookingsDB.findOne(
      b => b.giorno === data && b.ora === slotTime
    );

    if (existingBooking) {
      throw new Error(`Slot ${slotTime} già occupato`);
    }

    slotsToBook.push(slotTime);
  }

  // Ottieni dati utente
  const user = usersDB.findOne(u => u.email === userEmail);
  if (!user) {
    throw new Error('Utente non trovato');
  }

  // Crea prenotazioni per tutti gli slot
  const bookingToken = generateBookingToken();
  const createdBookings = [];

  slotsToBook.forEach((slotTime, index) => {
    const booking = {
      nome: user.nome,
      cognome: user.cognome,
      email: user.email,
      telefono: user.telefono,
      giorno: data,
      ora: slotTime,
      token: bookingToken,
      numPersone: groupSize,
      slotIndex: index + 1 // 1, 2, 3 per identificare slot del gruppo
    };

    bookingsDB.insert(booking);
    createdBookings.push(booking);
  });

  // Ritorna la prima prenotazione (principale)
  return createdBookings[0];
}

// Ottieni prenotazioni di un utente
function getUserBookings(userEmail) {
  return bookingsDB.findMany(b => b.email === userEmail);
}

// Ottieni statistiche prenotazioni per un utente
function getUserBookingStats(userEmail) {
  const bookings = bookingsDB.findMany(b => b.email === userEmail);

  // Conta prenotazioni e trova ultima data
  let count = bookings.length;
  let lastDate = null;

  bookings.forEach(booking => {
    if (!lastDate || new Date(booking.giorno) > new Date(lastDate)) {
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
  bookingsDB.delete(b => b.giorno === giorno && b.ora === ora);

  return true;
}

// Ottieni tutte le prenotazioni (per admin)
function getAllBookings() {
  return bookingsDB.readAll();
}

// Crea prenotazione da admin (senza verifica utente)
function createAdminBooking(bookingData) {
  const { nome, cognome, email, telefono, giorno, ora, servizio } = bookingData;

  // Validazione (solo cognome, giorno, ora obbligatori per admin)
  if (!cognome || !giorno || !ora) {
    throw new Error('Cognome, giorno e ora sono obbligatori');
  }

  // Verifica slot non già occupato
  const existingBooking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);
  if (existingBooking) {
    throw new Error('Questo slot è già occupato');
  }

  // Crea prenotazione (campi opzionali possono essere vuoti)
  const booking = {
    nome: nome ? nome.trim() : '',
    cognome: cognome.trim(),
    email: email ? email.trim().toLowerCase() : '',
    telefono: telefono ? telefono.trim() : '',
    giorno,
    ora,
    servizio: servizio ? servizio.trim() : ''
  };

  bookingsDB.insert(booking);

  return booking;
}

// Cancella prenotazione da admin (senza verifica proprietario)
function adminCancelBooking(giorno, ora) {
  if (!giorno || !ora) {
    throw new Error('Giorno e ora sono obbligatori');
  }

  const booking = bookingsDB.findOne(b => b.giorno === giorno && b.ora === ora);
  if (!booking) {
    throw new Error('Prenotazione non trovata');
  }

  bookingsDB.delete(b => b.giorno === giorno && b.ora === ora);

  return true;
}

// Sposta prenotazione da admin (cambia giorno/ora)
function moveBooking(oldGiorno, oldOra, newGiorno, newOra) {
  if (!oldGiorno || !oldOra || !newGiorno || !newOra) {
    throw new Error('Tutti i campi sono obbligatori');
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
  const bookingDate = new Date(booking.giorno + 'T' + booking.ora.replace(':', '') + ':00');
  const now = new Date();
  const hoursUntilBooking = (bookingDate - now) / (1000 * 60 * 60);

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

  // Elimina vecchia prenotazione
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
  const bookingDate = new Date(booking.giorno + 'T' + booking.ora.replace(':', '') + ':00');
  const now = new Date();
  const hoursUntilBooking = (bookingDate - now) / (1000 * 60 * 60);

  if (hoursUntilBooking < 24) {
    throw new Error('Non e possibile cancellare la prenotazione entro 24 ore dall\'appuntamento');
  }

  bookingsDB.delete(b => b.token === token);
  return true;
}

module.exports = {
  isDayAvailable,
  getAvailableSlots,
  createBooking,
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
  generateBookingToken
};
