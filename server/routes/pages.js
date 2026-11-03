// Pagine HTML servite con URL "puliti" (i file restano raggiungibili anche come /pagina.html)
const express = require('express');
const path = require('path');
const { verifySession, isBanned } = require('../authService');

const FRONTEND_DIR = path.join(__dirname, '../../frontend');

const PAGES = {
  '/': 'index.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/reset-password': 'reset-password.html',
  '/new-password': 'new-password.html',
  // Un solo flusso di prenotazione per ospiti e clienti; i vecchi indirizzi restano validi
  '/prenota': 'prenota.html',
  '/guest-booking': 'prenota.html',
  '/dashboard': 'prenota.html',
  '/home': 'home.html',
  '/bookings': 'home.html',
  '/admin': 'admin.html',
  '/admin/clienti': 'admin-clienti.html',
  '/admin/depositi': 'admin-depositi.html',
  '/admin/listino': 'admin-listino.html',
  '/admin/reports': 'admin-reports.html'
};

// Pagine riservate: anche come file .html diretti (serviti dai file statici) e prima di
// inviare qualunque markup. Le API restano protette a parte (authenticateToken/requireAdmin):
// questo controllo evita solo di mostrare l'interfaccia a chi non può usarla.
const ADMIN_PAGE = /^\/admin(\/|$)|^\/admin[-\w]*\.html$/;
const CUSTOMER_PAGE = /^\/(home|bookings)\/?$|^\/home\.html$/;

function sessionOf(req) {
  const token = req.cookies && req.cookies.token;
  if (!token) return null;
  try {
    const decoded = verifySession(token);
    if (!decoded.isAdmin && isBanned(decoded.email)) return null;
    return decoded;
  } catch (error) {
    return null;
  }
}

function pageGuard(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const admin = ADMIN_PAGE.test(req.path);
  const customer = CUSTOMER_PAGE.test(req.path);
  if (!admin && !customer) return next();

  const session = sessionOf(req);
  res.set('Cache-Control', 'no-store');
  if (!session) return res.redirect(302, '/login');
  if (admin && !session.isAdmin) return res.redirect(302, '/home');
  if (customer && session.isAdmin) return res.redirect(302, '/admin');
  next();
}

const router = express.Router();

for (const [url, file] of Object.entries(PAGES)) {
  router.get(url, (req, res) => res.sendFile(path.join(FRONTEND_DIR, file)));
}

module.exports = { router, pageGuard, FRONTEND_DIR };
