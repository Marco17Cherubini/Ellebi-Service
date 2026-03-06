const bcrypt = require('bcryptjs');
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

  // Confronta password (hash bcrypt)
  try {
    return await bcrypt.compare(password, admin.password);
  } catch {
    // Se la password nel file non è hashata, confronta direttamente
    return admin.password === password;
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

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Crea utente (solo campi: nome, cognome, email, telefono, password)
  const user = {
    nome: nome.trim(),
    cognome: cognome.trim(),
    email: email.trim().toLowerCase(),
    telefono: telefono.trim(),
    password: hashedPassword
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

  const isValid = await bcrypt.compare(password, user.password);
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

  // Hash nuova password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

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
