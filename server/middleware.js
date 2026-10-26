const rateLimit = require('express-rate-limit');
const config = require('../config/config');
const { verifyToken, getUserByEmail, isBanned, isVip } = require('./authService');

// Richiede una sessione valida: imposta req.user ({ ...utente, isAdmin }) oppure risponde 401/403
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ success: false, error: 'Accesso non autorizzato' });
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Token non valido' });
  }

  if (decoded.isAdmin) {
    req.user = { email: decoded.email, isAdmin: true };
    return next();
  }

  const user = getUserByEmail(decoded.email);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Utente non trovato' });
  }

  // Un utente sospeso perde subito l'accesso, anche con un token ancora valido
  if (isBanned(decoded.email)) {
    res.clearCookie('token');
    return res
      .status(403)
      .json({ success: false, error: "Account sospeso. Contattare l'amministrazione." });
  }

  req.user = { ...user, isAdmin: false };
  next();
}

// Da usare dopo authenticateToken sulle route del pannello admin
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ success: false, error: 'Accesso negato' });
  }
  next();
}

// Sessione facoltativa: true per admin e clienti VIP con sessione valida
// (vedono gli orari estesi: pre-apertura e serali)
function hasExtendedHours(req) {
  const token = req.cookies.token;
  if (!token) return false;
  try {
    const decoded = verifyToken(token);
    if (decoded.isAdmin) return true;
    return !!decoded.email && isVip(decoded.email);
  } catch (error) {
    return false;
  }
}

// Rate limiting per IP sulle route esposte ad abusi (tentativi di login, spam di prenotazioni).
// L'IP è req.ip: in produzione l'app imposta 'trust proxy' per leggere quello reale dietro il proxy.
function createLimiter(max, error) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error }
  });
}

const authLimiter = createLimiter(
  config.rateLimit.authMax,
  'Troppi tentativi. Riprova tra 15 minuti.'
);
const guestLimiter = createLimiter(
  config.rateLimit.guestMax,
  'Troppi tentativi. Riprova tra 15 minuti.'
);

module.exports = { authenticateToken, requireAdmin, hasExtendedHours, authLimiter, guestLimiter };
