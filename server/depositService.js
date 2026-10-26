// Depositi ("Lavori straordinari"): veicoli lasciati in officina, con capacità limitata,
// stati di lavorazione e blocchi di lavoro da 15 minuti pianificati nel calendario admin
const config = require('../config/config');
const {
  depositsDB,
  bookingsDB,
  servicesDB,
  getSetting,
  setSetting,
  withTransaction
} = require('./database');
const { HttpError, badRequest } = require('./errors');

// Stati che occupano capacità (il veicolo è in officina)
const ACTIVE_STATES = ['in_attesa', 'in_corso', 'standby'];

// Blocchi di lavoro pianificati: prenotazioni con questo service_id e deposit_id del deposito
const EXTRA_WORK = 'extra_work';

// Tronca i campi di testo a lunghezze sicure
function sanitizeText(value, maxLen) {
  if (!value) return '';
  return String(value).trim().slice(0, maxLen);
}

// ─── Capacità ─────────────────────────────────────────────────────────────────

// Limite di depositi attivi: impostazione modificabile dall'admin, default da config
function getMaxDeposits() {
  const value = parseInt(getSetting('maxDeposits'), 10);
  return Number.isNaN(value) ? config.maxDeposits : value;
}

function setMaxDeposits(value) {
  if (typeof value !== 'number' || value < 0) {
    throw badRequest('Valore maxDeposits non valido');
  }
  setSetting('maxDeposits', String(value));
}

function getActiveDepositCount() {
  return depositsDB.findMany(d => ACTIVE_STATES.includes(d.stato)).length;
}

function canAcceptDeposit() {
  return getActiveDepositCount() < getMaxDeposits();
}

function depositLimitMessage(suffix) {
  return `Limite depositi raggiunto (${getActiveDepositCount()}/${getMaxDeposits()}). ${suffix}`;
}

// ─── Query ────────────────────────────────────────────────────────────────────

function getActiveDeposits() {
  return depositsDB.findMany(d => d.stato !== 'completato');
}

function getAllDeposits() {
  return depositsDB.readAll();
}

function getDepositById(id) {
  return depositsDB.findOne(d => String(d.id) === String(id));
}

function requireDeposit(id) {
  const deposit = getDepositById(id);
  if (!deposit) throw new HttpError(404, 'Deposito non trovato');
  return deposit;
}

// Tutti i depositi (anche storici) con i dati della prenotazione di consegna collegata;
// i campi mancanti nei depositi più vecchi vengono ricavati dalla prenotazione
function getAllDepositsWithBookings() {
  return getAllDeposits().map(d => {
    const booking = d.booking_id
      ? bookingsDB.findOne(b => String(b.id) === String(d.booking_id))
      : null;
    if (!booking) return { ...d, booking_giorno: '', booking_ora: '', booking_durata: '' };

    let servizio = d.servizio || booking.servizio || '';
    if (!servizio && booking.service_id) {
      const service = servicesDB.findOne(s => String(s.id) === String(booking.service_id));
      if (service) servizio = service.nome;
    }
    return {
      ...d,
      booking_giorno: booking.giorno || '',
      booking_ora: booking.ora || '',
      booking_durata: booking.durata_minuti || '',
      nome: d.nome || booking.nome || '',
      cognome: d.cognome || booking.cognome || '',
      email: d.email || booking.email || '',
      telefono: d.telefono || booking.telefono || '',
      targa: d.targa || booking.targa || '',
      modello: d.modello || booking.modello || '',
      note_cliente: d.note_cliente || booking.note_cliente || '',
      servizio
    };
  });
}

// ─── Creazione ────────────────────────────────────────────────────────────────

/**
 * Crea un nuovo deposito collegato alla prenotazione di consegna (accoglienza 30 minuti).
 * data: { nome, cognome, email, telefono, targa, modello, servizio, note_cliente, ore_stimate? }
 * targa e modello sono obbligatori: il meccanico non può lavorare senza queste informazioni.
 */
function createDeposit(bookingId, data) {
  if (!data.targa || !data.targa.toString().trim()) {
    throw badRequest('La targa del veicolo è obbligatoria per i lavori straordinari.');
  }
  if (!data.modello || !data.modello.toString().trim()) {
    throw badRequest('Il modello del veicolo è obbligatorio per i lavori straordinari.');
  }
  if (!canAcceptDeposit()) {
    throw badRequest(depositLimitMessage('Contattare il laboratorio per ulteriori informazioni.'));
  }

  const record = {
    booking_id: String(bookingId),
    nome: sanitizeText(data.nome, 100),
    cognome: sanitizeText(data.cognome, 100),
    email: sanitizeText(data.email, 254),
    telefono: sanitizeText(data.telefono, 20),
    targa: sanitizeText(data.targa, 10).toUpperCase(),
    modello: sanitizeText(data.modello, 100),
    servizio: sanitizeText(data.servizio, 200),
    ore_stimate: data.ore_stimate || 0,
    ore_residue: data.ore_stimate || 0,
    stato: 'in_attesa',
    completed_at: '',
    note_cliente: sanitizeText(data.note_cliente, 1000),
    nota_lorenzo: ''
  };

  const id = depositsDB.insert(record);
  return { ...record, id: String(id) };
}

// ─── Aggiornamento ────────────────────────────────────────────────────────────

/**
 * Aggiorna stato, nota_lorenzo, ore_residue e/o ore_stimate di un deposito.
 * Ritorna il deposito aggiornato o null se non trovato.
 */
function updateDeposit(id, updates) {
  if (!getDepositById(id)) return null;

  const changes = {};
  if (updates.stato !== undefined) {
    changes.stato = sanitizeText(updates.stato, 50);
    changes.completed_at = changes.stato === 'completato' ? new Date().toISOString() : '';
  }
  if (updates.nota_lorenzo !== undefined) {
    changes.nota_lorenzo = sanitizeText(updates.nota_lorenzo, 1000);
  }
  if (updates.ore_residue !== undefined) changes.ore_residue = updates.ore_residue;
  if (updates.ore_stimate !== undefined) changes.ore_stimate = updates.ore_stimate;

  if (Object.keys(changes).length > 0) {
    depositsDB.update(d => String(d.id) === String(id), changes);
  }
  return getDepositById(id);
}

function removeExtraWork(depositId) {
  bookingsDB.delete(b => String(b.deposit_id) === String(depositId) && b.service_id === EXTRA_WORK);
}

// Aggiornamento dalla card del deposito. Tornando "in attesa" o chiudendo il lavoro
// i blocchi pianificati nel calendario vengono liberati.
function updateDepositFromAdmin(id, { stato, nota_lorenzo, ore_residue }) {
  return withTransaction(() => {
    const deposit = updateDeposit(id, { stato, nota_lorenzo, ore_residue });
    if (!deposit) throw new HttpError(404, 'Deposito non trovato');
    if (stato === 'completato' || stato === 'in_attesa') removeExtraWork(deposit.id);
    return deposit;
  });
}

// Pianifica il lavoro: un blocco extra_work da 15 minuti per ogni slot { date, time }
function scheduleDeposit(id, slots, oreStimateInput) {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw badRequest('Nessuno slot fornito');
  }

  return withTransaction(() => {
    const deposit = requireDeposit(id);
    const oreStimate = oreStimateInput || deposit.ore_residue || deposit.ore_stimate || 0;

    for (const slot of slots) {
      const giorno = slot.date || slot.giorno;
      const ora = slot.time || slot.ora;
      if (!giorno || !ora) continue;

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
        service_id: EXTRA_WORK,
        deposit_id: deposit.id,
        ore_stimate: oreStimate,
        durata_minuti: 15
      });
    }

    return updateDeposit(deposit.id, { stato: 'in_corso' });
  });
}

function deleteDeposit(id) {
  depositsDB.delete(d => String(d.id) === String(id));
}

module.exports = {
  EXTRA_WORK,
  getMaxDeposits,
  setMaxDeposits,
  getActiveDepositCount,
  canAcceptDeposit,
  depositLimitMessage,
  getActiveDeposits,
  getAllDeposits,
  getAllDepositsWithBookings,
  getDepositById,
  createDeposit,
  updateDeposit,
  updateDepositFromAdmin,
  scheduleDeposit,
  removeExtraWork,
  deleteDeposit
};
