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

    db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

    // Imposta default per maxDeposits se non esiste
    const maxDepositsResult = db.exec("SELECT value FROM settings WHERE key = 'maxDeposits'");
    if (!maxDepositsResult.length || maxDepositsResult[0].values.length === 0) {
        db.run("INSERT INTO settings (key, value) VALUES ('maxDeposits', '5')");
    }

    // ── Nuove tabelle v2 ────────────────────────────────────────────────────────

    db.run(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      targa TEXT NOT NULL,
      modello TEXT NOT NULL,
      anno TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo_veicolo TEXT NOT NULL,
      tipo_servizio TEXT NOT NULL,
      durata_minuti INTEGER DEFAULT 60,
      prezzo_interno REAL DEFAULT 0,
      campi_extra TEXT DEFAULT '[]',
      attivo INTEGER DEFAULT 1,
      stagionale INTEGER DEFAULT 0,
      data_inizio_stagione TEXT DEFAULT '',
      data_fine_stagione TEXT DEFAULT ''
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      nome TEXT NOT NULL,
      cognome TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT DEFAULT '',
      targa TEXT DEFAULT '',
      modello TEXT DEFAULT '',
      ore_stimate REAL DEFAULT 0,
      ore_residue REAL DEFAULT 0,
      stato TEXT DEFAULT 'in_attesa',
      note_cliente TEXT DEFAULT '',
      nota_lorenzo TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      booking_id INTEGER,
      tipo TEXT DEFAULT '',
      data_prevista TEXT DEFAULT '',
      inviata INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // ── Migrazioni colonne su bookings (schema v2) ───────────────────────────
    const bookingsMigrazioni = [
        "ALTER TABLE bookings ADD COLUMN user_id INTEGER",
        "ALTER TABLE bookings ADD COLUMN vehicle_id INTEGER",
        "ALTER TABLE bookings ADD COLUMN service_id INTEGER",
        "ALTER TABLE bookings ADD COLUMN targa TEXT DEFAULT ''",
        "ALTER TABLE bookings ADD COLUMN modello TEXT DEFAULT ''",
        "ALTER TABLE bookings ADD COLUMN tipo TEXT DEFAULT 'cliente'",
        "ALTER TABLE bookings ADD COLUMN stato TEXT DEFAULT 'confermato'",
        "ALTER TABLE bookings ADD COLUMN note_cliente TEXT DEFAULT ''",
        "ALTER TABLE bookings ADD COLUMN nota_interna TEXT DEFAULT ''",
        "ALTER TABLE bookings ADD COLUMN deposit_id INTEGER",
        "ALTER TABLE bookings ADD COLUMN durata_minuti INTEGER DEFAULT 15"
    ];
    bookingsMigrazioni.forEach(function(sql) {
        try { db.run(sql); } catch (e) { /* colonna già presente */ }
    });

    // ── Migrazioni legacy su users ───────────────────────────────────────────

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

    // Migrazione deposits: aggiunge colonna 'servizio' per mostrare il tipo di lavoro nelle card
    try {
        db.run(`ALTER TABLE deposits ADD COLUMN servizio TEXT DEFAULT ''`);
    } catch (e) {
        // Colonna già presente
    }

    // Migrazione: corregge nome errato 'Taglio olio + filtro' → 'Tagliando olio + filtro'
    try {
        db.run(`UPDATE services SET nome = 'Tagliando olio + filtro' WHERE nome = 'Taglio olio + filtro'`);
    } catch (e) {
        // Tabella non ancora presente
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
    // Popola catalogo servizi (idempotente)
    seedServices();

    console.log('📦 Database SQLite inizializzato');
}

// ==================== CLASSE DB WRAPPER ====================

class SQLiteTable {
    constructor(tableName, columns, idField) {
        this.tableName = tableName;
        this.columns = columns;
        // Se specificato, update/delete useranno WHERE {idField} = ? (es. 'id')
        this.idField = idField || null;
    }

    // Leggi tutti i record
    readAll() {
        if (!db) return [];
        const stmt = db.prepare(`SELECT * FROM ${this.tableName}`);
        const rows = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            const obj = {};
            // Includi sempre id: serve per update/delete con idField
            if (row.id !== null && row.id !== undefined) {
                obj.id = String(row.id);
            }
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
        
        // FASE 1 Sicurezza: Prevenzione SQLi / Prototype Pollution
        // Filtra rigidamente solo le chiavi note nello schema della tabella
        const cols = this.columns.filter(c => record[c] !== undefined && record[c] !== null);
        if (cols.length === 0) return null;

        const placeholders = cols.map(() => '?').join(', ');
        // Sanitizzazione base per SQLite: forza i tipi complessi a stringa
        const values = cols.map(c => 
            typeof record[c] === 'object' ? JSON.stringify(record[c]) : record[c]
        );

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
                // FASE 1 Sicurezza: Eliminazione vulnerabilità SQLi su Object.keys
                // Accetta esclusivamente le chiavi dichiarate in this.columns
                const validKeys = Object.keys(updates).filter(k => this.columns.includes(k));
                if (validKeys.length === 0) return; // Se update usa payload malevolo o chiavi invalide, interrompi

                const setClauses = validKeys.map(k => `${k} = ?`).join(', ');
                const values = validKeys.map(k => 
                    typeof updates[k] === 'object' ? JSON.stringify(updates[k]) : updates[k]
                );

                let whereClause, whereValues;
                if (this.idField) {
                    whereClause = this.idField + ' = ?';
                    whereValues = [row[this.idField]];
                } else if (this.tableName === 'users' || this.tableName === 'admins') {
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
                if (this.idField) {
                    whereClause = this.idField + ' = ?';
                    whereValues = [row[this.idField]];
                } else if (this.tableName === 'users' || this.tableName === 'admins') {
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
const bookingColumns = [
    'nome', 'cognome', 'email', 'telefono', 'giorno', 'ora', 'token',
    'user_id', 'vehicle_id', 'service_id', 'targa', 'modello',
    'tipo', 'stato', 'note_cliente', 'nota_interna', 'deposit_id', 'durata_minuti'
];
const adminColumns = ['email', 'password'];
const holidayColumns = ['giorno', 'ora'];
const vehicleColumns = ['user_id', 'targa', 'modello', 'anno'];
const serviceColumns = [
    'nome', 'tipo_veicolo', 'tipo_servizio', 'durata_minuti',
    'prezzo_interno', 'campi_extra', 'attivo',
    'stagionale', 'data_inizio_stagione', 'data_fine_stagione'
];
const depositColumns = [
    'booking_id', 'nome', 'cognome', 'email', 'telefono', 'targa', 'modello',
    'ore_stimate', 'ore_residue', 'stato', 'note_cliente', 'nota_lorenzo', 'servizio'
];
const settingColumns = ['key', 'value'];

const usersDB    = new SQLiteTable('users',         userColumns);
const bookingsDB = new SQLiteTable('bookings',      bookingColumns, 'id');
const adminDB    = new SQLiteTable('admins',         adminColumns);
const holidaysDB = new SQLiteTable('holidays',      holidayColumns);
const vehiclesDB = new SQLiteTable('vehicles',      vehicleColumns, 'id');
const servicesDB = new SQLiteTable('services',      serviceColumns, 'id');
const depositsDB = new SQLiteTable('deposits',      depositColumns, 'id');
const settingsDB = new SQLiteTable('settings',      settingColumns, 'key');

// Helper per settings
function getSetting(key) {
    const s = settingsDB.findOne(r => r.key === key);
    return s ? s.value : null;
}

function setSetting(key, value) {
    const exists = settingsDB.findOne(r => r.key === key);
    if (exists) {
        settingsDB.update(r => r.key === key, { value });
    } else {
        settingsDB.insert({ key, value });
    }
}

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

// ==================== SEED SERVIZI ====================

function seedServices() {
    if (!db) return;
    if (servicesDB.readAll().length > 0) return; // idempotente

    var catalogo = [
        // ── AUTO ──────────────────────────────────────────────────────────────
        {
            nome: 'Tagliando olio + filtro',
            tipo_veicolo: 'auto',
            tipo_servizio: 'appuntamento',
            durata_minuti: 60,
            prezzo_interno: 0,
            campi_extra: JSON.stringify(['targa', 'modello']),
            attivo: 1, stagionale: 0,
            data_inizio_stagione: '', data_fine_stagione: ''
        },
        {
            nome: 'Tagliando completo',
            tipo_veicolo: 'auto',
            tipo_servizio: 'appuntamento',
            durata_minuti: 120,
            prezzo_interno: 0,
            campi_extra: JSON.stringify(['targa', 'modello']),
            attivo: 1, stagionale: 0,
            data_inizio_stagione: '', data_fine_stagione: ''
        },
        {
            nome: 'Freni',
            tipo_veicolo: 'auto',
            tipo_servizio: 'appuntamento',
            durata_minuti: 90,
            prezzo_interno: 0,
            campi_extra: JSON.stringify(['targa', 'modello']),
            attivo: 1, stagionale: 0,
            data_inizio_stagione: '', data_fine_stagione: ''
        },
        {
            nome: 'Distribuzione',
            tipo_veicolo: 'auto',
            tipo_servizio: 'consegna',
            durata_minuti: 30,  // slot accoglienza
            prezzo_interno: 0,
            campi_extra: JSON.stringify(['targa', 'modello']),
            attivo: 1, stagionale: 0,
            data_inizio_stagione: '', data_fine_stagione: ''
        },
        {
            nome: 'Lavoro straordinario',
            tipo_veicolo: 'auto',
            tipo_servizio: 'consegna',
            durata_minuti: 30,  // slot accoglienza
            prezzo_interno: 0,
            campi_extra: JSON.stringify(['targa', 'modello', 'note_cliente']),
            attivo: 1, stagionale: 0,
            data_inizio_stagione: '', data_fine_stagione: ''
        },
        {
            nome: 'Cambio gomme stagionale',
            tipo_veicolo: 'auto',
            tipo_servizio: 'appuntamento',
            durata_minuti: 45,
            prezzo_interno: 0,
            campi_extra: JSON.stringify(['targa', 'modello']),
            attivo: 1, stagionale: 1,
            data_inizio_stagione: '11-15', data_fine_stagione: '04-15' // 15 nov – 15 apr
        },
        {
            nome: 'Vendita gomme',
            tipo_veicolo: 'auto',
            tipo_servizio: 'appuntamento',
            durata_minuti: 45,
            prezzo_interno: 0,
            campi_extra: JSON.stringify(['targa', 'modello', 'misura', 'indice_velocita']),
            attivo: 1, stagionale: 0,
            data_inizio_stagione: '', data_fine_stagione: ''
        },
        // ── MOTO ──────────────────────────────────────────────────────────────
        {
            nome: 'Tagliando completo',
            tipo_veicolo: 'moto',
            tipo_servizio: 'appuntamento',
            durata_minuti: 120,
            prezzo_interno: 0,
            campi_extra: JSON.stringify(['targa', 'modello']),
            attivo: 1, stagionale: 0,
            data_inizio_stagione: '', data_fine_stagione: ''
        },
        {
            nome: 'Cambio gomme',
            tipo_veicolo: 'moto',
            tipo_servizio: 'appuntamento',
            durata_minuti: 60,
            prezzo_interno: 0,
            campi_extra: JSON.stringify(['targa', 'modello', 'misura']),
            attivo: 1, stagionale: 0,
            data_inizio_stagione: '', data_fine_stagione: ''
        },
        {
            nome: 'Revisione sospensioni',
            tipo_veicolo: 'moto',
            tipo_servizio: 'consegna',
            durata_minuti: 30,  // slot accoglienza
            prezzo_interno: 0,
            campi_extra: JSON.stringify(['targa', 'modello']),
            attivo: 1, stagionale: 0,
            data_inizio_stagione: '', data_fine_stagione: ''
        }
    ];

    catalogo.forEach(function(s) { servicesDB.insert(s); });
    console.log('\uD83D\uDD27 Catalogo servizi inizializzato (' + catalogo.length + ' servizi)');
}

// ==================== EXPORT ====================

module.exports = {
    usersDB,
    bookingsDB,
    adminDB,
    holidaysDB,
    vehiclesDB,
    servicesDB,
    depositsDB,
    settingsDB,
    getSetting,
    setSetting,
    initDatabase,
    saveDatabase
};
