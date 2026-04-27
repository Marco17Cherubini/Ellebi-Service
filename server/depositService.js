const { depositsDB, getSetting } = require('./database');
const config = require('../config/config');

// 🛡️ Validazione lunghezza input: tronca campi di testo a lunghezze sicure
function sanitizeText(value, maxLen) {
  if (!value) return '';
  return String(value).trim().slice(0, maxLen);
}

// ─── Query ────────────────────────────────────────────────────────────────────

function getActiveDepositCount() {
  return depositsDB.findMany(function(d) {
    return d.stato === 'in_attesa' || d.stato === 'in_corso' || d.stato === 'standby';
  }).length;
}

function canAcceptDeposit() {
  return getActiveDepositCount() < getSetting('maxDeposits');
}

function getActiveDeposits() {
  return depositsDB.findMany(function(d) {
    return d.stato !== 'completato';
  });
}

function getAllDeposits() {
  return depositsDB.readAll();
}

function getDepositById(id) {
  return depositsDB.findOne(function(d) { return String(d.id) === String(id); });
}

// ─── Creazione ────────────────────────────────────────────────────────────────

/**
 * Crea un nuovo deposito.
 * bookingId: id della prenotazione "Accoglienza consegna" (30min viola).
 * data: { nome, cognome, email, telefono, targa, modello, servizio, note_cliente, ore_stimate? }
 * targa e modello sono OBBLIGATORI — il meccanico non può lavorare senza queste info.
 */
function createDeposit(bookingId, depositData) {
  if (!depositData.targa || !depositData.targa.toString().trim()) {
    throw new Error('La targa del veicolo è obbligatoria per i lavori straordinari.');
  }
  if (!depositData.modello || !depositData.modello.toString().trim()) {
    throw new Error('Il modello del veicolo è obbligatorio per i lavori straordinari.');
  }

  if (!canAcceptDeposit()) {
    throw new Error(
      'Limite depositi raggiunto (' +
        getActiveDepositCount() +
        '/' +
        getSetting('maxDeposits') +
        '). Contattare il laboratorio per ulteriori informazioni.'
    );
  }

  var record = {
    booking_id:   String(bookingId),
    nome:         sanitizeText(depositData.nome, 100),
    cognome:      sanitizeText(depositData.cognome, 100),
    email:        sanitizeText(depositData.email, 254),
    telefono:     sanitizeText(depositData.telefono, 20),
    targa:        sanitizeText(depositData.targa, 10).toUpperCase(),
    modello:      sanitizeText(depositData.modello, 100),
    servizio:     sanitizeText(depositData.servizio, 200),
    ore_stimate:  depositData.ore_stimate  || 0,
    ore_residue:  depositData.ore_stimate  || 0,
    stato:        'in_attesa',
    note_cliente: sanitizeText(depositData.note_cliente, 1000),
    nota_lorenzo: ''
  };

  var insertedId = depositsDB.insert(record);
  return Object.assign({}, record, { id: String(insertedId) });
}

// ─── Aggiornamento ────────────────────────────────────────────────────────────

/**
 * Aggiorna stato, nota_lorenzo e/o ore_residue di un deposito.
 * Ritorna il deposito aggiornato o null se non trovato.
 */
function updateDeposit(id, updates) {
  var deposit = getDepositById(id);
  if (!deposit) return null;

  var changes = {};
  if (updates.stato !== undefined)       changes.stato        = sanitizeText(updates.stato, 50);
  if (updates.nota_lorenzo !== undefined) changes.nota_lorenzo = sanitizeText(updates.nota_lorenzo, 1000);
  if (updates.ore_residue !== undefined)  changes.ore_residue  = updates.ore_residue;
  if (updates.ore_stimate !== undefined)  changes.ore_stimate  = updates.ore_stimate;

  if (Object.keys(changes).length > 0) {
    depositsDB.update(
      function(d) { return String(d.id) === String(id); },
      changes
    );
  }

  return getDepositById(id);
}

function markCompleted(id) {
  return updateDeposit(id, { stato: 'completato' });
}

function deleteDeposit(id) {
  depositsDB.delete(function(d) { return String(d.id) === String(id); });
}

// ─── Export ─────────────────────────────────────────────────────────

module.exports = {
  getActiveDepositCount,
  canAcceptDeposit,
  getActiveDeposits,
  getAllDeposits,
  getDepositById,
  createDeposit,
  updateDeposit,
  markCompleted,
  deleteDeposit,
  get MAX_DEPOSITS() { return getSetting('maxDeposits'); }
};
