const { verifyToken, getUserByEmail, isAdmin } = require('./authService');

// Middleware per autenticazione
function authenticateToken(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Accesso non autorizzato' });
  }

  try {
    const decoded = verifyToken(token);
    
    // Controlla se è admin
    if (decoded.isAdmin) {
      req.user = { 
        email: decoded.email, 
        isAdmin: true 
      };
      return next();
    }
    
    // Utente normale
    const user = getUserByEmail(decoded.email);
    
    if (!user) {
      return res.status(401).json({ error: 'Utente non trovato' });
    }

    req.user = { ...user, isAdmin: false };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token non valido' });
  }
}

module.exports = { authenticateToken };
