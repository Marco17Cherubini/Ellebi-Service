// Punto di avvio: verifica la configurazione, apre il database e mette in ascolto l'app
const config = require('../config/config');

// ==================== VALIDAZIONE SICUREZZA ====================

// Segnaposto pubblicati in .env.example: chi li conosce può firmare token validi
const PLACEHOLDER_JWT_SECRET = 'CAMBIA_QUESTO_CON_UNA_STRINGA_CASUALE_DI_ALMENO_64_CARATTERI';
const PLACEHOLDER_ADMIN_PASSWORD = 'CambiaMi_ConPassword_Sicura_123!';

if (!config.jwt.secret || config.jwt.secret === PLACEHOLDER_JWT_SECRET) {
  console.error('❌ ERRORE CRITICO: JWT_SECRET non configurato!');
  console.error('   Imposta JWT_SECRET nel file .env (il valore di .env.example non è valido)');
  console.error(
    "   Genera un secret con: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
  process.exit(1);
}

if (config.jwt.secret.length < 32) {
  console.warn('⚠️  JWT_SECRET è più corto di 32 caratteri: usa una stringa casuale più lunga');
}

if (process.env.ADMIN_PASSWORD === PLACEHOLDER_ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD è ancora il valore di esempio: cambiala nel file .env');
}

// ==================== START SERVER ====================

const app = require('./app');
const { initDatabase } = require('./database');
const { initializeEmailService } = require('./emailService');
const { startRetentionScheduler } = require('./retentionService');

initializeEmailService();

// Inizializza database (e retention, se abilitata) e poi avvia il server.
// Risolve con l'istanza http.Server, così i test possono usare PORT=0 e leggere la porta.
async function startServer() {
  try {
    await initDatabase();

    if (config.retention.enabled) {
      startRetentionScheduler();
    } else {
      console.log('🗄️  Retention automatica disattivata (RETENTION_ENABLED)');
    }

    return await new Promise(resolve => {
      const server = app.listen(config.server.port, () => {
        console.log(`🚀 Server avviato su http://localhost:${server.address().port}`);
        console.log(`🏪 ${config.studio.name}`);
        resolve(server);
      });
    });
  } catch (error) {
    console.error('❌ Errore avvio server:', error);
    process.exit(1);
  }
}

const serverReady = startServer();

module.exports = { app, serverReady };
