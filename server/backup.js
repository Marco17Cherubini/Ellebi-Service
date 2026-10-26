/**
 * Backup del database SQLite: `npm run backup` (o un cron job settimanale sul server)
 *
 * Copia il file indicato da DATABASE_PATH in BACKUP_DIR (default: backups/) con data e ora
 * nel nome e conserva solo gli ultimi MAX_BACKUPS. L'app salva il database con una scrittura
 * atomica (file temporaneo + rinomina), quindi la copia trova sempre un file completo.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const MAX_BACKUPS = 4; // circa un mese con backup settimanali

function timestamp(date) {
  const pad = n => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

function listBackups(backupDir) {
  return fs
    .readdirSync(backupDir)
    .filter(f => f.startsWith('database_') && f.endsWith('.sqlite'))
    .sort()
    .reverse(); // il nome contiene la data: in ordine inverso i più recenti vengono prima
}

// Crea un backup e rimuove i più vecchi; restituisce { file, removed }
function backup({
  databasePath = config.database.path,
  backupDir = config.database.backupDir,
  now = new Date()
} = {}) {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Database non trovato: ${databasePath}`);
  }
  fs.mkdirSync(backupDir, { recursive: true });

  const file = path.join(backupDir, `database_${timestamp(now)}.sqlite`);
  fs.copyFileSync(databasePath, file);

  const removed = listBackups(backupDir).slice(MAX_BACKUPS);
  removed.forEach(name => fs.unlinkSync(path.join(backupDir, name)));

  return { file, removed };
}

if (require.main === module) {
  try {
    const { file, removed } = backup();
    const sizeMB = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
    console.log(`✅ Backup creato: ${file} (${sizeMB} MB)`);
    removed.forEach(name => console.log(`🗑️  Rimosso backup vecchio: ${name}`));
  } catch (error) {
    console.error('❌ Errore durante il backup:', error.message);
    process.exit(1);
  }
}

module.exports = { backup, MAX_BACKUPS };
