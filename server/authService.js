const bcrypt = require('bcryptjs');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { usersDB, adminDB } = require('./database');
const config = require('../config/config');

// Genera ID univoco
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Verifica se è admin (solo lettura da admin.xlsx)
function isAdmin(email) {
  const admin = adminDB.findOne(a => a.email === email.trim().toLowerCase());
  return !!admin;
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
      console.error('⚠️ Password admin non hashata rilevata per:', admin.email, '— login rifiutato.');
      return false;
    }
  } catch (err) {
    console.error("Errore verifica admin:", err);
    return false;
  }
}

// Registrazione utente
async function registerUser(userData) {
  const { nome, cognome, email, telefono, password } = userData;

  // Validazione base
  if (!nome || !cognome || !email || !telefono || !password) {
    throw new Error('Tutti i campi sono obbligatori');
  }

  if (password.length < 8) {
    throw new Error('La password deve essere di almeno 8 caratteri');
  }

  // Controlla email duplicata
  const existingUser = usersDB.findOne(user => user.email === email);
  if (existingUser) {
    throw new Error('Email già registrata');
  }

  // 🛡️ FASE 3 Sicurezza: Argon2id (OWASP 2025 Standard)
  const hashedPassword = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 15360,     // 15 MiB mem
    timeCost: 2,           // 2 iterations
    parallelism: 1         // 1 thread
  });

  // Crea utente (solo campi: nome, cognome, email, telefono, password)
  const user = {
    nome: nome.trim(),
    cognome: cognome.trim(),
    email: email.trim().toLowerCase(),
    telefono: telefono.trim(),
    password: hashedPassword,
    vip: 0,
    banned: 0,
    isGuest: 0
  };

  usersDB.insert(user);

  // Ritorna utente senza password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Login utente
async function loginUser(email, password) {
  if (!email || !password) {
    throw new Error('Email e password sono obbligatori');
  }

  const emailLower = email.trim().toLowerCase();

  // Prima controlla se è un admin
  const adminCheck = await verifyAdminPassword(emailLower, password);
  if (adminCheck) {
    // È un admin - genera token con flag isAdmin
    const token = jwt.sign(
      { email: emailLower, isAdmin: true },
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
    throw new Error('Credenziali non valide');
  }

  // Verifica se l'utente è bannato
  if (user.banned === '1' || user.banned === 1) {
    throw new Error('Account sospeso');
  }

  // 🛡️ FASE 3 Sicurezza: Graceful Upgrade Utenti (Argon2id)
  let isValid = false;
  try {
    if (user.password.startsWith('$argon2')) {
      isValid = await argon2.verify(user.password, password);
    } 
    else if (user.password.startsWith('$2')) {
      isValid = await bcrypt.compare(password, user.password);
      if (isValid) {
        // Rihasha la password da bcrypt ad Argon2id transparentemente
        const newHash = await argon2.hash(password, { type: argon2.argon2id });
        usersDB.update(u => u.email === user.email, { password: newHash });
      }
    }
  } catch (err) {
    console.error("Errore verifica password utente:", err);
    throw new Error('Credenziali non valide');
  }

  if (!isValid) {
    throw new Error('Credenziali non valide');
  }

  // Genera JWT token (utente normale)
  const token = jwt.sign(
    { email: user.email, isAdmin: false },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  const { password: _, ...userWithoutPassword } = user;
  return { user: { ...userWithoutPassword, isAdmin: false }, token, isAdmin: false };
}

// Verifica token JWT
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw new Error('Token non valido');
  }
}

// Get user by email
function getUserByEmail(email) {
  const user = usersDB.findOne(u => u.email === email);
  if (!user) return null;

  const { password: _, ...userWithoutPassword } = user;
  return {
    ...userWithoutPassword,
    vip: user.vip === '1' || user.vip === 1
  };
}

// Get all users (per admin - senza password)
function getAllUsers() {
  const users = usersDB.readAll();
  return users.map(user => {
    const { password: _, ...userWithoutPassword } = user;
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
    throw new Error('Utente non trovato');
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
    throw new Error('Utente non trovato');
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
  const token = jwt.sign(
    { email: emailLower, purpose: 'password-reset' },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  return token;
}

// Reset password con token
async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    throw new Error('Token e password sono obbligatori');
  }

  if (newPassword.length < 8) {
    throw new Error('La password deve essere di almeno 8 caratteri');
  }

  // Verifica token
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw new Error('Link scaduto o non valido');
  }

  // Verifica che sia un token di reset
  if (decoded.purpose !== 'password-reset') {
    throw new Error('Token non valido');
  }

  // Trova utente
  const user = usersDB.findOne(u => u.email === decoded.email);
  if (!user) {
    throw new Error('Utente non trovato');
  }

  // 🛡️ FASE 3 Sicurezza: Argon2id per i Reset Passwords (OWASP 2025)
  const hashedPassword = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    memoryCost: 15360,
    timeCost: 2,
    parallelism: 1
  });

  // Aggiorna password
  usersDB.update(u => u.email === decoded.email, { password: hashedPassword });

  return { success: true, email: decoded.email };
}

module.exports = {
  registerUser,
  loginUser,
  verifyToken,
  getUserByEmail,
  generateId,
  isAdmin,
  getAllUsers,
  toggleVip,
  isVip,
  toggleBanned,
  isBanned,
  generateResetToken,
  resetPassword
};
