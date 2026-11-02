// Registrazione, login/logout, sessione corrente e recupero password
const express = require('express');
const config = require('../../config/config');
const { registerUser, loginUser, generateResetToken, resetPassword } = require('../authService');
const { sendPasswordResetEmail } = require('../emailService');
const { authenticateToken, authLimiter } = require('../middleware');
const { asyncHandler, badRequest } = require('../errors');

const router = express.Router();

const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 giorni, come la scadenza del JWT

function resetLink(token) {
  const baseUrl = process.env.BASE_URL || `http://localhost:${config.server.port}`;
  return `${baseUrl}/new-password?token=${token}`;
}

router.post(
  '/api/auth/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const result = await registerUser(req.body);
    if (result.pendingEmailVerification) {
      // Profilo creato da una prenotazione ospite: la password si imposta dal link inviato
      const token = generateResetToken(result.email);
      await sendPasswordResetEmail(result.email, resetLink(token));
      return res.status(202).json({
        success: true,
        pendingEmailVerification: true,
        message:
          'Hai già prenotato come ospite con questa email. Ti abbiamo inviato un link per scegliere la password.'
      });
    }
    res.status(201).json({ success: true, user: result });
  })
);

router.post(
  '/api/auth/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { user, token, isAdmin } = await loginUser(req.body.email, req.body.password);
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.server.env === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE
    });
    res.json({ success: true, user, isAdmin });
  })
);

router.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logout effettuato' });
});

router.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// Risposta sempre uguale, che l'email esista o no (niente enumerazione degli account)
router.post(
  '/api/auth/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw badRequest('Email obbligatoria');

    const token = generateResetToken(email);
    if (token) {
      await sendPasswordResetEmail(email.trim().toLowerCase(), resetLink(token));
    }
    res.json({ success: true, message: "Se l'email esiste, riceverai un link di reset." });
  })
);

router.post(
  '/api/auth/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    await resetPassword(req.body.token, req.body.password);
    res.json({ success: true, message: 'Password aggiornata con successo' });
  })
);

module.exports = router;
