const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Path del database - usa variabile d'ambiente per Railway Volume, altrimenti default locale
// Su Railway: imposta DATABASE_PATH=/data/database.sqlite e monta un Volume su /data
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../database/database.sqlite');

console.log(`📁 Database path: ${DB_PATH}`);

// Assicurati che la directory esista
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Database instance (sarà inizializzato in modo asincrono)
let db = null;

// Funzione per salvare il database su disco
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

// Inizializza il database
async function initDatabase() {
    const SQL = await initSqlJs();

    // Carica database esistente o crea nuovo
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('📦 Database SQLite caricato da file');
    } else {
        db = new SQL.Database();
        console.log('📦 Nuovo database SQLite creato');
    }

    // Crea tabelle se non esistono
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cognome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      telefono TEXT NOT NULL,
      password TEXT NOT NULL,
      vip INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cognome TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT NOT NULL,
      giorno TEXT NOT NULL,
      ora TEXT NOT NULL,
      servizio TEXT,
      token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      giorno TEXT NOT NULL,
      ora TEXT NOT NULL,
      UNIQUE(giorno, ora)
    )
  `);

    // Aggiungi colonna vip se non esiste (migrazione)
    try {
        db.run(`ALTER TABLE users ADD COLUMN vip INTEGER DEFAULT 0`);
    } catch (e) {
        // Colonna già esiste
    }

    // Aggiungi colonna banned se non esiste (migrazione)
    try {
        db.run(`ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0`);
    } catch (e) {
        // Colonna già esiste
    }

    // Aggiungi colonna isGuest se non esiste (migrazione per Guest Checkout)
    try {
        db.run(`ALTER TABLE users ADD COLUMN isGuest INTEGER DEFAULT 0`);
    } catch (e) {
        // Colonna gia esiste
    }

    // Aggiungi colonna token a bookings se non esiste (migrazione per Smart Rescheduling)
    try {
        db.run(`ALTER TABLE bookings ADD COLUMN token TEXT`);
    } catch (e) {
        // Colonna gia esiste
    }

    // Migrazione: ricrea tabella bookings se servizio è NOT NULL
    // Questo è necessario perché SQLite non supporta ALTER COLUMN
    try {
        // Verifica se serve la migrazione controllando lo schema
        const tableInfo = db.exec("PRAGMA table_info(bookings)");
        const columns = tableInfo[0]?.values || [];
        const servizioCol = columns.find(col => col[1] === 'servizio');

        // Se servizio ha notnull=1, dobbiamo ricreare la tabella
        if (servizioCol && servizioCol[3] === 1) {
            console.log('🔄 Migrazione: rimuovo vincolo NOT NULL da servizio...');

            // Rinomina tabella esistente
            db.run(`ALTER TABLE bookings RENAME TO bookings_old`);

            // Crea nuova tabella con servizio nullable
            db.run(`
                CREATE TABLE bookings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    cognome TEXT NOT NULL,
                    email TEXT NOT NULL,
                    telefono TEXT NOT NULL,
                    giorno TEXT NOT NULL,
                    ora TEXT NOT NULL,
                    servizio TEXT,
                    token TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Copia dati dalla vecchia tabella
            db.run(`
                INSERT INTO bookings (id, nome, cognome, email, telefono, giorno, ora, servizio, token, created_at)
                SELECT id, nome, cognome, email, telefono, giorno, ora, servizio, token, created_at
                FROM bookings_old
            `);

            // Elimina vecchia tabella
            db.run(`DROP TABLE bookings_old`);

            console.log('✅ Migrazione completata: servizio ora è opzionale');
        }
    } catch (e) {
        console.log('Migrazione servizio già eseguita o non necessaria');
    }

    // Salva struttura iniziale
    saveDatabase();

    // Inizializza admin
    initializeDefaultAdmin();

    console.log('📦 Database SQLite inizializzato');
}

// ==================== CLASSE DB WRAPPER ====================

class SQLiteTable {
    constructor(tableName, columns) {
        this.tableName = tableName;
        this.columns = columns;
    }

    // Leggi tutti i record
    readAll() {
        if (!db) return [];
        const stmt = db.prepare(`SELECT * FROM ${this.tableName}`);
        const rows = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            const obj = {};
            this.columns.forEach(col => {
                obj[col] = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
            });
            rows.push(obj);
        }
        stmt.free();
        return rows;
    }

    // Trova un record
    findOne(filterFn) {
        const data = this.readAll();
        return data.find(filterFn);
    }

    // Trova più record
    findMany(filterFn) {
        const data = this.readAll();
        return data.filter(filterFn);
    }

    // Inserisci un record
    insert(record) {
        if (!db) return null;
        const cols = this.columns.filter(c => record[c] !== undefined);
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map(c => record[c]);

        db.run(
            `INSERT INTO ${this.tableName} (${cols.join(', ')}) VALUES (${placeholders})`,
            values
        );

        saveDatabase();
        return db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
    }

    // Aggiorna record che matchano il filtro
    update(filterFn, updates) {
        if (!db) return;
        const allData = this.readAll();

        allData.forEach(row => {
            if (filterFn(row)) {
                const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
                const values = Object.values(updates);

                let whereClause, whereValues;
                if (this.tableName === 'users' || this.tableName === 'admins') {
                    whereClause = 'email = ?';
                    whereValues = [row.email];
                } else if (this.tableName === 'bookings') {
                    whereClause = 'giorno = ? AND ora = ? AND email = ?';
                    whereValues = [row.giorno, row.ora, row.email];
                } else {
                    whereClause = 'giorno = ? AND ora = ?';
                    whereValues = [row.giorno, row.ora];
                }

                db.run(
                    `UPDATE ${this.tableName} SET ${setClauses} WHERE ${whereClause}`,
                    [...values, ...whereValues]
                );
            }
        });

        saveDatabase();
    }

    // Elimina record che matchano il filtro
    delete(filterFn) {
        if (!db) return false;
        const allData = this.readAll();
        let deleted = false;

        allData.forEach(row => {
            if (filterFn(row)) {
                let whereClause, whereValues;
                if (this.tableName === 'users' || this.tableName === 'admins') {
                    whereClause = 'email = ?';
                    whereValues = [row.email];
                } else if (this.tableName === 'bookings') {
                    whereClause = 'giorno = ? AND ora = ? AND email = ?';
                    whereValues = [row.giorno, row.ora, row.email];
                } else {
                    whereClause = 'giorno = ? AND ora = ?';
                    whereValues = [row.giorno, row.ora];
                }

                db.run(`DELETE FROM ${this.tableName} WHERE ${whereClause}`, whereValues);
                deleted = true;
            }
        });

        if (deleted) saveDatabase();
        return deleted;
    }

    // Riscrivi tutti i dati (per compatibilità)
    writeAll(data) {
        if (!db) return;
        db.run(`DELETE FROM ${this.tableName}`);

        for (const record of data) {
            this.insert(record);
        }

        saveDatabase();
    }
}

// ==================== INIZIALIZZA TABELLE ====================

const userColumns = ['nome', 'cognome', 'email', 'telefono', 'password', 'vip', 'banned', 'isGuest'];
const bookingColumns = ['nome', 'cognome', 'email', 'telefono', 'giorno', 'ora', 'token'];
const adminColumns = ['email', 'password'];
const holidayColumns = ['giorno', 'ora'];

const usersDB = new SQLiteTable('users', userColumns);
const bookingsDB = new SQLiteTable('bookings', bookingColumns);
const adminDB = new SQLiteTable('admins', adminColumns);
const holidaysDB = new SQLiteTable('holidays', holidayColumns);

// ==================== INIZIALIZZA ADMIN ====================

function initializeDefaultAdmin() {
    if (!db) return;
    const admins = adminDB.readAll();
    if (admins.length === 0) {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
            console.log('⚠️  ATTENZIONE: ADMIN_EMAIL e ADMIN_PASSWORD non configurati nel .env');
            console.log('   Imposta queste variabili per creare l\'account admin');
            return;
        }

        const hashedPassword = bcrypt.hashSync(adminPassword, 10);
        adminDB.insert({
            email: adminEmail.toLowerCase(),
            password: hashedPassword
        });
        console.log(`👤 Admin creato: ${adminEmail}`);
    }
}

// ==================== EXPORT ====================

module.exports = {
    usersDB,
    bookingsDB,
    adminDB,
    holidaysDB,
    initDatabase,
    saveDatabase
};
