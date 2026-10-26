// Pannello admin: calendario prenotazioni, clienti, ferie, impostazioni e report.
// Tutte le route richiedono una sessione admin.
const express = require('express');
const {
  getAdminBookings,
  createAdminBookingWithDeposit,
  adminCancelBooking,
  moveBooking
} = require('../bookingService');
const { getAllUsers, toggleVip, toggleBanned } = require('../authService');
const { addHolidays, removeHolidays } = require('../holidayService');
const { getMaxDeposits, setMaxDeposits } = require('../depositService');
const { getUserVehiclesWithBookingCount, getVehicleHistory } = require('../vehicleService');
const { getBookingStats } = require('../reportService');
const { sendBookingConfirmation, sendInBackground } = require('../emailService');
const { authenticateToken, requireAdmin } = require('../middleware');

const router = express.Router();
const admin = [authenticateToken, requireAdmin];

// ─── Impostazioni ────────────────────────────────────────────────────────────

router.get('/api/settings/maxDeposits', admin, (req, res) => {
  res.json({ success: true, maxDeposits: getMaxDeposits() });
});

router.put('/api/settings/maxDeposits', admin, (req, res) => {
  setMaxDeposits(req.body.maxDeposits);
  res.json({ success: true, message: 'Impostazione salvata con successo' });
});

// ─── Prenotazioni ────────────────────────────────────────────────────────────

router.get('/api/admin/bookings', admin, (req, res) => {
  res.json({ success: true, bookings: getAdminBookings() });
});

router.post('/api/admin/bookings', admin, (req, res) => {
  const { booking, deposit } = createAdminBookingWithDeposit(req.body);
  sendInBackground(sendBookingConfirmation(booking));
  res.status(201).json({ success: true, booking, deposit, emailSent: 'pending' });
});

router.delete('/api/admin/bookings', admin, (req, res) => {
  adminCancelBooking(req.body.giorno, req.body.ora);
  res.json({ success: true, message: 'Prenotazione cancellata' });
});

router.put('/api/admin/bookings', admin, (req, res) => {
  const { oldGiorno, oldOra, newGiorno, newOra } = req.body;
  const booking = moveBooking(oldGiorno, oldOra, newGiorno, newOra);
  res.json({ success: true, booking, message: 'Prenotazione spostata' });
});

// ─── Clienti e veicoli ───────────────────────────────────────────────────────

router.get('/api/admin/users', admin, (req, res) => {
  res.json({ success: true, users: getAllUsers() });
});

router.put('/api/admin/users/:email/vip', admin, (req, res) => {
  const email = req.params.email;
  res.json({ success: true, email, vip: toggleVip(email) });
});

router.put('/api/admin/users/:email/banned', admin, (req, res) => {
  const email = req.params.email;
  res.json({ success: true, email, banned: toggleBanned(email) });
});

router.get('/api/admin/users/:email/vehicles', admin, (req, res) => {
  res.json({ success: true, vehicles: getUserVehiclesWithBookingCount(req.params.email) });
});

router.get('/api/admin/vehicles/targa/:targa', admin, (req, res) => {
  res.json({ success: true, ...getVehicleHistory(req.params.targa) });
});

// ─── Ferie ───────────────────────────────────────────────────────────────────

router.post('/api/admin/holidays', admin, (req, res) => {
  const added = addHolidays(req.body.slots);
  res.status(201).json({ success: true, added, count: added.length });
});

router.delete('/api/admin/holidays', admin, (req, res) => {
  res.json({ success: true, removed: removeHolidays(req.body.slots) });
});

// ─── Report ──────────────────────────────────────────────────────────────────

router.get('/api/admin/reports/bookings-stats', admin, (req, res) => {
  res.json({ success: true, ...getBookingStats(req.query.period) });
});

module.exports = router;
