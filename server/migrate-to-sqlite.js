/**
 * Script di migrazione: Excel → SQLite
 * 
 * Esegui con: node server/migrate-to-sqlite.js
 * 
 * Questo script:
 * 1. Legge i dati dai file Excel esistenti
 * 2. Li inserisce nel database SQLite
 * 3. Crea backup dei file Excel
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Importa il nuovo database
const { usersDB, bookingsDB, adminDB, holidaysDB, db } = require('./database');

const DATABASE_DIR = path.join(__dirname, '../database');

// ==================== FUNZIONI HELPER ====================

function readExcelFile(filePath, columns) {
    if (!fs.existsSync(filePath)) {
        console.log(`  ⚠️  File non trovato: ${path.basename(filePath)}`);
        return [];
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length <= 1) return [];

    const data = [];
    for (let i = 1; i < jsonData.length; i++) {
        const values = jsonData[i];
        if (!values || values.length === 0) continue;
        const row = {};
        columns.forEach((colName, index) => {
            row[colName] = values[index] !== undefined ? String(values[index]) : '';
        });
        data.push(row);
    }
    return data;
}

function backupFile(filePath) {
    if (!fs.existsSync(filePath)) return;

    const backupPath = filePath.replace('.xlsx', '_backup.xlsx');
    fs.copyFileSync(filePath, backupPath);
    console.log(`  📁 Backup creato: ${path.basename(backupPath)}`);
}

// ==================== MIGRAZIONE ====================

async function migrate() {
    console.log('\n🚀 Avvio migrazione Excel → SQLite\n');
    console.log('='.repeat(50));

    // Definizioni colonne (come in csvManager.js)
    const userColumns = ['nome', 'cognome', 'email', 'telefono', 'password'];
    const bookingColumns = ['nome', 'cognome', 'email', 'telefono', 'giorno', 'ora', 'servizio'];
    const adminColumns = ['email', 'password'];
    const holidayColumns = ['giorno', 'ora'];

    // File da migrare
    const migrations = [
        { name: 'Users', file: 'users.xlsx', columns: userColumns, db: usersDB },
        { name: 'Bookings', file: 'bookings.xlsx', columns: bookingColumns, db: bookingsDB },
        { name: 'Admin', file: 'admin.xlsx', columns: adminColumns, db: adminDB },
        { name: 'Holidays', file: 'holidays.xlsx', columns: holidayColumns, db: holidaysDB }
    ];

    let totalMigrated = 0;

    for (const m of migrations) {
        console.log(`\n📋 ${m.name}:`);
        const filePath = path.join(DATABASE_DIR, m.file);

        // Crea backup
        backupFile(filePath);

        // Leggi dati Excel
        const data = readExcelFile(filePath, m.columns);
        console.log(`  📄 Record trovati in Excel: ${data.length}`);

        if (data.length === 0) {
            console.log('  ⏭️  Nessun dato da migrare');
            continue;
        }

        // Controlla se ci sono già dati nel DB
        const existingData = m.db.readAll();
        if (existingData.length > 0) {
            console.log(`  ⚠️  Database già contiene ${existingData.length} record`);
            console.log('  ⏭️  Saltato per evitare duplicati');
            continue;
        }

        // Inserisci dati
        let inserted = 0;
        for (const record of data) {
            try {
                m.db.insert(record);
                inserted++;
            } catch (error) {
                console.log(`  ❌ Errore inserimento: ${error.message}`);
            }
        }

        console.log(`  ✅ Migrati: ${inserted} record`);
        totalMigrated += inserted;
    }

    console.log('\n' + '='.repeat(50));
    console.log(`\n✅ Migrazione completata! Totale record migrati: ${totalMigrated}`);
    console.log('\n📍 Database SQLite: database/database.sqlite');
    console.log('📁 I file Excel originali sono stati backuppati con suffisso _backup');
    console.log('\n💡 Puoi ora cancellare i file .xlsx originali se tutto funziona correttamente.\n');
}

// Esegui
migrate().catch(err => {
    console.error('❌ Errore durante la migrazione:', err);
    process.exit(1);
});
