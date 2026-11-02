const bcrypt = require('bcryptjs');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { usersDB, adminDB } = require('./database');
const config = require('../config/config');
const { HttpError, badRequest } = require('./errors');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Parametri argon2id (raccomandazione OWASP) per registrazione e reset
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 15360, timeCost: 2, parallelism: 1 };

// Versione di sessione dell'account: è scritta nel JWT e confrontata a ogni richiesta.
// I token emessi prima della Fase 2 non hanno "sv" e valgono come versione 0.
function sessionVersion(account) {
  return parseInt(account && account.session_version, 10) || 0;
}

function isGuestProfile(user) {
  return user.isGuest === '1' || user.isGuest === 1;
}

// Verifica password admin
async function verifyAdminPassword(email, password) {
  const admin = adminDB.findOne(a => a.email === email.trim().toLowerCase());
  if (!admin) return false;

  try {
    // 🛡️ FASE 3 Sicurezza: Graceful Upgrade per l'Admin
    if (admin.password.startsWith('$argon2')) {
      return await argon2.verify(admin.password, password);
    }
    // Fallback locale per vecchi DB basati su bcryptjs (necessario per non lockare fuori gli utenti)
    else if (admin.password.startsWith('$2')) {
      const isValid = await bcrypt.compare(password, admin.password);
      if (isValid) {
        // Upgrade password has in-place ad Argon2id appena si logga
        const newHash = await argon2.hash(password, { type: argon2.argon2id });
        adminDB.update(a => a.email === admin.email, { password: newHash });
      }
      return isValid;
    }
    // Se la password nel file non è hashata, rifiuta il login e logga il warning
    else {
      console.error(
        '⚠️ Password admin non hashata rilevata per:',
        admin.email,
        '— login rifiutato.'
      );
      return false;
    }
  } catch (err) {
    console.error('Errore verifica admin:', err);
    return false;
  }
}

function touchUserActivity(email) {
  if (!email) return;

  const emailLower = email.trim().toLowerCase();
  const user = usersDB.findOne(u => u.email === emailLower);
  if (!user) return;

  usersDB.update(u => u.email === emailLower, { last_active_at: new Date().toISOString() });
}

// Registrazione utente
async function registerUser(userData) {
  const { nome, cognome, email, telefono, password } = userData;

  // Validazione base
  if (!nome || !cognome || !email || !telefono || !password) {
    throw badRequest('Tutti i campi sono obbligatori');
  }

  if (password.length < 8) {
    throw badRequest('La password deve essere di almeno 8 caratteri');
  }

  const emailLower = String(email).trim().toLowerCase();
  if (!EMAIL_REGEX.test(emailLower)) {
    throw badRequest('Formato email non valido');
  }
  // Chi ha già prenotato come ospite ha un profilo senza password. Non basta conoscere
  // l'email per prenderne possesso: si invia un link all'indirizzo (prova di possesso) e la
  // password si imposta da lì. Il chiamante invia l'email.
  const existing = usersDB.findOne(user => user.email === emailLower);
  if (existing && isGuestProfile(existing) && !existing.password) {
    return { pendingEmailVerification: true, email: emailLower };
  }

  const assertEmailFree = () => {
    if (usersDB.findOne(user => user.email === emailLower)) {
      throw badRequest('Email già registrata');
    }
  };
  assertEmailFree();

  const hashedPassword = await argon2.hash(password, ARGON2_OPTIONS);

  // Durante l'hash (asincrono) potrebbe essere arrivata una registrazione con la stessa email
  assertEmailFree();

  const user = {
    nome: nome.trim(),
    cognome: cognome.trim(),
    email: emailLower,
    telefono: telefono.trim(),
    password: hashedPassword,
    vip: 0,
    banned: 0,
    isGuest: 0,
    last_active_at: new Date().toISOString()
  };

  usersDB.insert(user);

  // Ritorna utente senza password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Login utente
async function loginUser(email, password) {
  if (!email || !password) {
    throw new HttpError(401, 'Email e password sono obbligatori');
  }

  const emailLower = email.trim().toLowerCase();

  // Prima controlla se è un admin
  const adminCheck = await verifyAdminPassword(emailLower, password);
  if (adminCheck) {
    // È un admin - genera token con flag isAdmin
    const admin = adminDB.findOne(a => a.email === emailLower);
    const token = jwt.sign(
      { email: emailLower, isAdmin: true, sv: sessionVersion(admin) },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return {
      user: { email: emailLower, isAdmin: true },
      token,
      isAdmin: true
    };
  }

  // Non è admin, cerca tra gli utenti normali
  const user = usersDB.findOne(u => u.email === emailLower);
  if (!user) {
    throw new HttpError(401, 'Credenziali non valide');
  }

  // Verifica se l'utente è bannato
  if (user.banned === '1' || user.banned === 1) {
    throw new HttpError(401, 'Account sospeso');
  }

  // 🛡️ FASE 3 Sicurezza: Graceful Upgrade Utenti (Argon2id)
  let isValid = false;
  try {
    if (user.password.startsWith('$argon2')) {
      isValid = await argon2.verify(user.password, password);
    } else if (user.password.startsWith('$2')) {
      isValid = await bcrypt.compare(password, user.password);
      if (isValid) {
        // Rihasha la password da bcrypt ad Argon2id transparentemente
        const newHash = await argon2.hash(password, { type: argon2.argon2id });
        usersDB.update(u => u.email === user.email, { password: newHash });
      }
    }
  } catch (err) {
    console.error('Errore verifica password utente:', err);
    throw new HttpError(401, 'Credenziali non valide');
  }

  if (!isValid) {
    throw new HttpError(401, 'Credenziali non valide');
  }

  touchUserActivity(user.email);

  // Genera JWT token (utente normale)
  const token = jwt.sign(
    { email: user.email, isAdmin: false, sv: sessionVersion(user) },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  const { password: _, session_version: __, ...userWithoutPassword } = user;
  return { user: { ...userWithoutPassword, isAdmin: false }, token, isAdmin: false };
}

// Verifica token JWT
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw new HttpError(401, 'Token non valido');
  }
}

// Verifica il JWT di sessione e che l'account esista ancora con la stessa versione di sessione.
// Restituisce il payload decodificato; lancia 401 se il token non vale più.
function verifySession(token) {
  const decoded = verifyToken(token);
  if (decoded.purpose) throw new HttpError(401, 'Token non valido');
  const account = decoded.isAdmin
    ? adminDB.findOne(a => a.email === decoded.email)
    : usersDB.findOne(u => u.email === decoded.email);
  if (!account || sessionVersion(account) !== (parseInt(decoded.sv, 10) || 0)) {
    throw new HttpError(401, 'Sessione scaduta: accedi di nuovo');
  }
  return decoded;
}

// Get user by email
function getUserByEmail(email) {
  const user = usersDB.findOne(u => u.email === email);
  if (!user) return null;

  const { password: _, session_version: __, ...userWithoutPassword } = user;
  return {
    ...userWithoutPassword,
    vip: user.vip === '1' || user.vip === 1
  };
}

// Get all users (per admin - senza password)
function getAllUsers() {
  const users = usersDB.readAll();
  return users.map(user => {
    const { password: _, session_version: __, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      vip: user.vip === '1' || user.vip === 1
    };
  });
}

// Toggle VIP status per un utente
function toggleVip(email) {
  const user = usersDB.findOne(u => u.email === email);
  if (!user) {
    throw badRequest('Utente non trovato');
  }

  const newVipStatus = user.vip === '1' || user.vip === 1 ? '0' : '1';
  usersDB.update(u => u.email === email, { vip: newVipStatus });

  return newVipStatus === '1';
}

// Verifica se un utente è VIP
function isVip(email) {
  const user = usersDB.findOne(u => u.email === email);
  if (!user) return false;
  return user.vip === '1' || user.vip === 1;
}

// Toggle banned status per un utente
function toggleBanned(email) {
  const user = usersDB.findOne(u => u.email === email);
  if (!user) {
    throw badRequest('Utente non trovato');
  }

  const newBannedStatus = user.banned === '1' || user.banned === 1 ? '0' : '1';
  usersDB.update(u => u.email === email, { banned: newBannedStatus });

  return newBannedStatus === '1';
}

// Verifica se un utente è bannato
function isBanned(email) {
  const user = usersDB.findOne(u => u.email === email);
  if (!user) return false;
  return user.banned === '1' || user.banned === 1;
}

// Genera token per reset password (JWT con scadenza 1 ora)
function generateResetToken(email) {
  const emailLower = email.trim().toLowerCase();
  const user = usersDB.findOne(u => u.email === emailLower);

  if (!user) {
    // Non rivelare se l'email esiste o meno
    return null;
  }

  // Genera token con email e timestamp per invalidazione automatica
  // La versione di sessione rende il link monouso: il reset la incrementa
  return jwt.sign(
    { email: emailLower, purpose: 'password-reset', sv: sessionVersion(user) },
    config.jwt.secret,
    { expiresIn: '1h' }
  );
}

// Reset password con token
async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    throw badRequest('Token e password sono obbligatori');
  }

  if (newPassword.length < 8) {
    throw badRequest('La password deve essere di almeno 8 caratteri');
  }

  // Verifica token
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw badRequest('Link scaduto o non valido');
  }

  // Verifica che sia un token di reset
  if (decoded.purpose !== 'password-reset') {
    throw badRequest('Token non valido');
  }

  const findUser = () => usersDB.findOne(u => u.email === decoded.email);
  const assertUnused = user => {
    if (!user || sessionVersion(user) !== (parseInt(decoded.sv, 10) || 0)) {
      throw badRequest('Link scaduto o già utilizzato');
    }
  };
  assertUnused(findUser());

  const hashedPassword = await argon2.hash(newPassword, ARGON2_OPTIONS);

  // Durante l'hash (asincrono) lo stesso link potrebbe essere stato usato da un'altra richiesta
  const user = findUser();
  assertUnused(user);

  // Nuova password, sessioni aperte invalidate; un profilo ospite diventa un account
  usersDB.update(u => u.email === decoded.email, {
    password: hashedPassword,
    session_version: sessionVersion(user) + 1,
    isGuest: 0
  });

  return { success: true, email: decoded.email };
}

module.exports = {
  registerUser,
  loginUser,
  verifyToken,
  verifySession,
  getUserByEmail,
  getAllUsers,
  toggleVip,
  isVip,
  toggleBanned,
  isBanned,
  generateResetToken,
  resetPassword,
  touchUserActivity
};
