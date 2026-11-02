// Ferie e chiusure: bloccano singoli slot da 15 minuti del calendario
const { holidaysDB, withTransaction } = require('./database');
const { badRequest } = require('./errors');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function requireSlots(slots) {
  const valid =
    Array.isArray(slots) &&
    slots.length > 0 &&
    slots.length <= 2000 &&
    slots.every(s => s && DATE_REGEX.test(s.giorno) && TIME_REGEX.test(s.ora));
  if (!valid) throw badRequest('Slot ferie non validi');
}

function listHolidays() {
  return holidaysDB.readAll();
}

// Aggiunge gli slot { giorno, ora } non già presenti; restituisce quelli aggiunti
function addHolidays(slots) {
  requireSlots(slots);
  return withTransaction(() => {
    const existing = holidaysDB.readAll();
    const added = [];
    for (const slot of slots) {
      const exists = existing.some(h => h.giorno === slot.giorno && h.ora === slot.ora);
      if (!exists) {
        holidaysDB.insert({ giorno: slot.giorno, ora: slot.ora });
        existing.push({ giorno: slot.giorno, ora: slot.ora });
        added.push(slot);
      }
    }
    return added;
  });
}

// Rimuove gli slot indicati; restituisce quanti erano presenti
function removeHolidays(slots) {
  requireSlots(slots);
  return withTransaction(() => {
    let removed = 0;
    for (const slot of slots) {
      if (holidaysDB.delete(h => h.giorno === slot.giorno && h.ora === slot.ora)) removed++;
    }
    return removed;
  });
}

module.exports = { listHolidays, addHolidays, removeHolidays };
