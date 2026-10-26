// Pagine HTML servite con URL "puliti" (i file restano raggiungibili anche come /pagina.html)
const express = require('express');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '../../frontend');

const PAGES = {
  '/': 'index.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/reset-password': 'reset-password.html',
  '/new-password': 'new-password.html',
  '/guest-booking': 'guest-booking.html',
  '/home': 'home.html',
  '/dashboard': 'dashboard.html',
  '/bookings': 'bookings.html',
  '/admin': 'admin.html',
  '/admin/clienti': 'admin-clienti.html',
  '/admin/depositi': 'admin-depositi.html',
  '/admin/listino': 'admin-listino.html',
  '/admin/reports': 'admin-reports.html'
};

const router = express.Router();

for (const [url, file] of Object.entries(PAGES)) {
  router.get(url, (req, res) => res.sendFile(path.join(FRONTEND_DIR, file)));
}

module.exports = { router, FRONTEND_DIR };
