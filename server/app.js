// Applicazione Express: middleware comuni, file statici, route e gestione errori.
// L'avvio (controlli di configurazione, database, retention, listen) è in server.js.
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const config = require('../config/config');
const { notFoundHandler, errorHandler } = require('./errors');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const catalogRoutes = require('./routes/catalog');
const depositRoutes = require('./routes/deposits');
const { router: pageRoutes, FRONTEND_DIR } = require('./routes/pages');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://cdn.iubenda.com',
          'https://www.iubenda.com'
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.iubenda.com'],
        imgSrc: ["'self'", 'data:', 'https://cdn.iubenda.com', 'https://www.iubenda.com'],
        connectSrc: ["'self'", 'https://www.iubenda.com', 'https://cdn.iubenda.com'],
        fontSrc: ["'self'", 'https://cdn.iubenda.com'],
        frameSrc: ["'self'", 'https://www.iubenda.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    }
  })
);

// L'API accetta solo JSON: senza parser urlencoded un form HTML di un altro sito
// non può inviare richieste valide (difesa aggiuntiva contro il CSRF, oltre a SameSite=Lax)
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

// In produzione (Railway) l'app è dietro un proxy: serve per leggere l'IP reale del client
if (config.server.env === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.static(FRONTEND_DIR));

app.use(authRoutes);
app.use(bookingRoutes);
app.use(adminRoutes);
app.use(catalogRoutes);
app.use(depositRoutes);
app.use(pageRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
