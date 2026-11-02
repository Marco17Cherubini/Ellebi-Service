// Applicazione Express: middleware comuni, file statici, route e gestione errori.
// L'avvio (controlli di configurazione, database, retention, listen) è in server.js.
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const config = require('../config/config');
const { notFoundHandler, errorHandler } = require('./errors');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const catalogRoutes = require('./routes/catalog');
const depositRoutes = require('./routes/deposits');
const { router: pageRoutes, FRONTEND_DIR } = require('./routes/pages');

const app = express();

// Content Security Policy: script solo da questo server e nessun handler inline,
// così un eventuale XSS non può eseguire codice iniettato. Gli stili inline restano
// ammessi (attributi style nel markup e negli script). In locale (http) non si forza
// l'upgrade a https delle risorse.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrcAttr: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.server.env === 'production' ? [] : null
      }
    }
  })
);

// L'API accetta solo JSON: senza parser urlencoded un form HTML di un altro sito
// non può inviare richieste valide (difesa aggiuntiva contro il CSRF, oltre a SameSite=Lax)
// Compressione gzip delle risposte testuali (pagine, CSS, JS, JSON): il modulo 3D
// passa da circa 560 KB a circa 150 KB trasferiti
app.use(compression());

app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

// In produzione (Railway) l'app è dietro un proxy: serve per leggere l'IP reale del client
if (config.server.env === 'production') {
  app.set('trust proxy', 1);
}

// I font non cambiano: cache lunga. Il resto si rivalida (ETag) a ogni visita.
app.use(
  express.static(FRONTEND_DIR, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.woff2')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  })
);

// Chart.js (pagina Report) servito dalla dipendenza npm, con versione fissata nel lockfile
const CHART_JS = path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.js');
app.get('/vendor/chart.umd.js', (req, res) => res.sendFile(CHART_JS));

app.use(authRoutes);
app.use(bookingRoutes);
app.use(adminRoutes);
app.use(catalogRoutes);
app.use(depositRoutes);
app.use(pageRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
