// Listino servizi lato admin (il listino pubblico è in routes/bookings.js)
const express = require('express');
const {
  listAllServices,
  createService,
  updateService,
  deleteService
} = require('../catalogService');
const { authenticateToken, requireAdmin } = require('../middleware');

const router = express.Router();
const admin = [authenticateToken, requireAdmin];

// Tutti i servizi, anche disattivati
router.get('/api/admin/services', admin, (req, res) => {
  res.json({ success: true, services: listAllServices() });
});

router.post('/api/admin/services', admin, (req, res) => {
  res.status(201).json({ success: true, service: createService(req.body) });
});

router.put('/api/admin/services/:id', admin, (req, res) => {
  res.json({ success: true, service: updateService(req.params.id, req.body) });
});

router.delete('/api/admin/services/:id', admin, (req, res) => {
  deleteService(req.params.id);
  res.json({ success: true, message: 'Servizio eliminato' });
});

module.exports = router;
