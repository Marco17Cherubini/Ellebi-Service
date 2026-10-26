// Veicoli salvati dai clienti e storico per targa (vista admin)
const { usersDB, vehiclesDB, bookingsDB, depositsDB } = require('./database');
const { HttpError, badRequest } = require('./errors');

function normalizeTarga(targa) {
  return String(targa || '')
    .toUpperCase()
    .trim();
}

function listUserVehicles(email) {
  const user = usersDB.findOne(u => u.email === email);
  if (!user) return [];
  return vehiclesDB.findMany(v => String(v.user_id) === String(user.id));
}

// Salva un veicolo per il cliente; se la targa è già registrata restituisce quello esistente
function addUserVehicle(email, { targa, modello, anno }) {
  const user = usersDB.findOne(u => u.email === email);
  if (!user) throw new HttpError(404, 'Utente non trovato');
  if (!targa) throw badRequest('Targa obbligatoria');

  const plate = normalizeTarga(targa);
  const existing = vehiclesDB.findOne(
    v => String(v.user_id) === String(user.id) && v.targa === plate
  );
  if (existing) return { vehicle: existing, duplicate: true };

  const id = vehiclesDB.insert({
    user_id: user.id,
    targa: plate,
    modello: modello || '',
    anno: anno || null
  });
  return { vehicle: vehiclesDB.findOne(v => String(v.id) === String(id)), duplicate: false };
}

// Veicoli di un cliente con il numero di prenotazioni (non annullate) per targa
function getUserVehiclesWithBookingCount(email) {
  const user = usersDB.findOne(u => u.email === email);
  if (!user) throw new HttpError(404, 'Utente non trovato');
  return vehiclesDB
    .findMany(v => String(v.user_id) === String(user.id))
    .map(v => ({
      ...v,
      booking_count: bookingsDB.findMany(
        b => normalizeTarga(b.targa) === normalizeTarga(v.targa) && b.stato !== 'annullato'
      ).length
    }));
}

function getVehicleHistory(targa) {
  const plate = normalizeTarga(targa);
  return {
    targa: plate,
    bookings: bookingsDB.findMany(b => normalizeTarga(b.targa) === plate),
    deposits: depositsDB.findMany(d => normalizeTarga(d.targa) === plate)
  };
}

module.exports = {
  listUserVehicles,
  addUserVehicle,
  getUserVehiclesWithBookingCount,
  getVehicleHistory
};
