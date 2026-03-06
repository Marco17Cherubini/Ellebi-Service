/**
 * Script di backup settimanale del database SQLite
 * 
 * Esegui manualmente: node server/backup.js
 * Oppure configura un cron job settimanale sul server
 * 
 * Strategia: backup ogni settimana lavorativa (mantiene ultimi 4 backup)
 */

const fs = require('fs');
const path = require('path');

const DATABASE_PATH = path.join(__dirname, '../database/database.sqlite');
const BACKUP_DIR = path.join(__dirname, '../backups');
const MAX_BACKUPS = 4; // Mantieni ultimi 4 backup (circa 1 mese)

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}`;
}

function backup() {
    console.log('\n🔄 Avvio backup database...\n');

    // Verifica che il database esista
    if (!fs.existsSync(DATABASE_PATH)) {
        console.error('❌ Database non trovato:', DATABASE_PATH);
        process.exit(1);
    }

    // Crea directory backup se non esiste
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log('📁 Creata directory backups/');
    }

    // Nome file backup con timestamp
    const timestamp = formatDate(new Date());
    const backupFileName = `database_${timestamp}.sqlite`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    // Copia il database
    try {
        fs.copyFileSync(DATABASE_PATH, backupPath);

        const stats = fs.statSync(backupPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

        console.log(`✅ Backup creato: ${backupFileName}`);
        console.log(`   Dimensione: ${sizeMB} MB`);
        console.log(`   Path: ${backupPath}`);
    } catch (error) {
        console.error('❌ Errore durante il backup:', error.message);
        process.exit(1);
    }

    // Pulizia vecchi backup (mantieni solo ultimi MAX_BACKUPS)
    cleanOldBackups();

    console.log('\n✅ Backup completato!\n');
}

function cleanOldBackups() {
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('database_') && f.endsWith('.sqlite'))
        .map(f => ({
            name: f,
            path: path.join(BACKUP_DIR, f),
            time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // Più recenti prima

    if (files.length > MAX_BACKUPS) {
        const toDelete = files.slice(MAX_BACKUPS);
        console.log(`\n🗑️  Rimozione ${toDelete.length} backup vecchi...`);

        toDelete.forEach(file => {
            fs.unlinkSync(file.path);
            console.log(`   Rimosso: ${file.name}`);
        });
    }
}

// Esegui backup
backup();
