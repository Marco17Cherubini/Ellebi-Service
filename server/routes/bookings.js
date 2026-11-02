// Lato cliente: disponibilità, listino pubblico, prenotazioni (con account o come ospite), veicoli
const express = require('express');
const config = require('../../config/config');
const {
  getAvailableSlots,
  getAvailableSlotsForService,
  createCustomerBooking,
  createGuestBooking,
  getUserBookingList,
  cancelBooking
} = require('../bookingService');
const {
  requireService,
  getServiceDuration,
  isInSeason,
  listPublicServices
} = require('../catalogService');
const { listHolidays } = require('../holidayService');
const { listUserVehicles, addUserVehicle } = require('../vehicleService');
const { touchUserActivity } = require('../authService');
const { sendBookingConfirmation, sendInBackground } = require('../emailService');
const { authenticateToken, hasExtendedHours, guestLimiter } = require('../middleware');

const router = express.Router();

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// In modifica di una prenotazione lo slot originale non conta come occupato
function excludedBooking(query) {
  const { excludeGiorno, excludeOra } = query;
  if (DATE_REGEX.test(excludeGiorno || '') && TIME_REGEX.test(excludeOra || '')) {
    return { giorno: excludeGiorno, ora: excludeOra };
  }
  return null;
}

// La disponibilità cambia di continuo: niente cache
function noStore(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
}

router.get('/api/slots/:date', (req, res) => {
  const slots = getAvailableSlots(
    req.params.date,
    hasExtendedHours(req),
    excludedBooking(req.query)
  );
  noStore(res);
  res.json({ success: true, slots });
});

// Slot in cui il servizio può iniziare, tenendo conto della sua durata
router.get('/api/slots/:date/:serviceId', (req, res) => {
  const service = requireService(req.params.serviceId);
  const durata = getServiceDuration(service);
  noStore(res);

  // Servizio stagionale fuori stagione nel giorno richiesto: nessun orario prenotabile
  if (DATE_REGEX.test(req.params.date) && !isInSeason(service, req.params.date)) {
    return res.json({ success: true, slots: [], durata_minuti: durata, outOfSeason: true });
  }

  const slots = getAvailableSlotsForService(
    req.params.date,
    durata,
    hasExtendedHours(req),
    excludedBooking(req.query)
  );
  res.json({ success: true, slots, durata_minuti: durata });
});

// Orari di apertura per il posizionamento visivo nel calendario admin
router.get('/api/config/slots', (req, res) => {
  const bh = config.businessHours;
  res.json({
    success: true,
    weekday: bh.weekday.morning.slots.concat(bh.weekday.afternoon.slots),
    saturday: bh.saturday.morning.slots.concat(bh.saturday.afternoon.slots),
    slotIntervalMinutes: bh.slotIntervalMinutes,
    daysOpen: bh.daysOpen
  });
});

router.get('/api/services', (req, res) => {
  res.json({ success: true, services: listPublicServices(req.query.tipo_veicolo) });
});

router.get('/api/holidays', (req, res) => {
  res.json({ success: true, holidays: listHolidays() });
});

// Nuova prenotazione (o modifica con old_giorno/old_ora); per le consegne crea anche il deposito
router.post('/api/bookings', authenticateToken, (req, res) => {
  // I clienti VIP possono prenotare anche negli orari estesi
  const { booking, deposit, isConsegna } = createCustomerBooking(req.user.email, req.body, {
    extendedHours: req.user.vip === true
  });
  touchUserActivity(req.user.email);

  if (isConsegna) {
    return res.status(201).json({
      success: true,
      booking,
      deposit,
      slotAssigned: { date: booking.giorno, time: booking.ora },
      message: `Veicolo registrato per la consegna il ${booking.giorno} alle ${booking.ora}.`
    });
  }

  sendInBackground(sendBookingConfirmation(booking));
  res.status(201).json({ success: true, booking, emailSent: 'pending' });
});

router.get('/api/bookings', authenticateToken, (req, res) => {
  res.json({ success: true, bookings: getUserBookingList(req.user.email) });
});

router.delete('/api/bookings', authenticateToken, (req, res) => {
  cancelBooking(req.body.giorno, req.body.ora, req.user.email);
  res.json({ success: true, message: 'Prenotazione cancellata' });
});

// Prenotazione rapida senza account: solo nome, cognome ed email (niente password)
router.post('/api/bookings/guest', guestLimiter, (req, res) => {
  const { booking, deposit } = createGuestBooking(req.body);
  sendInBackground(sendBookingConfirmation(booking));
  res.status(201).json({
    success: true,
    booking,
    deposit,
    message: 'Prenotazione confermata! Riceverai una email con i dettagli.',
    emailSent: 'pending'
  });
});

router.get('/api/vehicles', authenticateToken, (req, res) => {
  res.json({ success: true, vehicles: listUserVehicles(req.user.email) });
});

router.post('/api/vehicles', authenticateToken, (req, res) => {
  touchUserActivity(req.user.email);
  const { vehicle, duplicate } = addUserVehicle(req.user.email, req.body);
  if (duplicate) return res.json({ success: true, vehicle, duplicate: true });
  res.status(201).json({ success: true, vehicle });
});

module.exports = router;
