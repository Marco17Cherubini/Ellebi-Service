// Depositi ("Lavori straordinari") lato admin: elenco, stato, note, ore e pianificazione
const express = require('express');
const {
  getActiveDeposits,
  getActiveDepositCount,
  getAllDepositsWithBookings,
  getMaxDeposits,
  updateDeposit,
  updateDepositFromAdmin
} = require('../depositService');
const { scheduleExtraWork } = require('../bookingService');
const { sendDepositCompletionEmail, sendInBackground } = require('../emailService');
const { authenticateToken, requireAdmin } = require('../middleware');
const { HttpError } = require('../errors');

const router = express.Router();
const admin = [authenticateToken, requireAdmin];

function capacity() {
  return { count: getActiveDepositCount(), max: getMaxDeposits() };
}

function requireUpdated(deposit) {
  if (!deposit) throw new HttpError(404, 'Deposito non trovato');
  return deposit;
}

// Depositi non completati + contatore di capacità
router.get('/api/admin/deposits', admin, (req, res) => {
  res.json({ success: true, deposits: getActiveDeposits(), ...capacity() });
});

// Tutti i depositi, storico compreso, con i dati della prenotazione di consegna
router.get('/api/admin/deposits/all', admin, (req, res) => {
  res.json({ success: true, deposits: getAllDepositsWithBookings(), ...capacity() });
});

// Cambio di stato; al completamento il cliente riceve l'email di ritiro
router.post('/api/admin/deposits/:id/status', admin, (req, res) => {
  const { stato, nota_lorenzo, ore_residue } = req.body;
  const deposit = updateDepositFromAdmin(req.params.id, { stato, nota_lorenzo, ore_residue });
  if (stato === 'completato' && deposit.email) {
    sendInBackground(sendDepositCompletionEmail(deposit));
  }
  res.json({ success: true, deposit });
});

router.put('/api/admin/deposits/:id/nota', admin, (req, res) => {
  const deposit = updateDeposit(req.params.id, { nota_lorenzo: req.body.nota_lorenzo });
  res.json({ success: true, deposit: requireUpdated(deposit) });
});

router.put('/api/admin/deposits/:id/ore', admin, (req, res) => {
  const deposit = updateDeposit(req.params.id, { ore_residue: req.body.ore_residue });
  res.json({ success: true, deposit: requireUpdated(deposit) });
});

// Assegna gli slot di lavoro nel calendario e porta il deposito "in corso"
router.post('/api/admin/deposits/:id/schedule', admin, (req, res) => {
  const deposit = scheduleExtraWork(req.params.id, req.body.slots);
  res.json({
    success: true,
    deposit,
    message: 'Slot assegnati e stato aggiornato a in_corso'
  });
});

module.exports = router;
