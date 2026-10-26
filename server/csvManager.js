const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const config = require('../config/config');

class CSVManager {
  constructor(filePath, columns) {
    // Converti path da .csv a .xlsx
    this.filePath = filePath.replace('.csv', '.xlsx');
    this.columns = columns; // Array di nomi colonne come in db_manager.py
    this.initializeFile();
  }

  initializeFile() {
    // Crea directory se non esiste
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Se il file non esiste, crealo con le colonne formattate
    if (!fs.existsSync(this.filePath)) {
      this.createFormattedExcel([]);
    }
  }

  // Crea file Excel con intestazioni in GRASSETTO e MAIUSCOLO
  createFormattedExcel(data) {
    // Crea workbook e worksheet
    const wb = XLSX.utils.book_new();

    // Intestazioni in MAIUSCOLO
    const headers = this.columns.map(col => col.toUpperCase());

    // Prepara dati con intestazioni
    const wsData = [headers];
    data.forEach(row => {
      const rowValues = this.columns.map(col => row[col] || '');
      wsData.push(rowValues);
    });

    // Crea worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Imposta larghezza colonne
    ws['!cols'] = this.columns.map(() => ({ wch: 20 }));

    // Aggiungi worksheet al workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Dati');

    // Salva file
    XLSX.writeFile(wb, this.filePath);
  }

  // Leggi tutti i record come array di oggetti
  readAll() {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const workbook = XLSX.readFile(this.filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Converti in JSON (skip header row)
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length <= 1) return [];

    const data = [];
    // Parti dalla riga 2 (indice 1) - i dati
    for (let i = 1; i < jsonData.length; i++) {
      const values = jsonData[i];
      if (!values || values.length === 0) continue;
      const row = {};
      // Mappa ogni valore alla sua colonna (usa nome originale lowercase)
      this.columns.forEach((colName, index) => {
        row[colName] = values[index] !== undefined ? String(values[index]) : '';
      });
      data.push(row);
    }
    return data;
  }

  findOne(filterFn) {
    const data = this.readAll();
    return data.find(filterFn);
  }

  findMany(filterFn) {
    const data = this.readAll();
    return data.filter(filterFn);
  }

  // Inserisci nuovo record - ogni campo va nella sua colonna
  insert(record) {
    const data = this.readAll();
    data.push(record);
    this.createFormattedExcel(data);
  }

  update(filterFn, updates) {
    const data = this.readAll();
    const updatedData = data.map(row => {
      if (filterFn(row)) {
        return { ...row, ...updates };
      }
      return row;
    });
    this.createFormattedExcel(updatedData);
  }

  delete(filterFn) {
    const data = this.readAll();
    const filteredData = data.filter(row => !filterFn(row));
    this.createFormattedExcel(filteredData);
  }

  // Riscrivi tutto il file mantenendo struttura colonne
  writeAll(data) {
    this.createFormattedExcel(data);
  }
}

// Definisci le colonne per ogni database (come in db_manager.py)
const userColumns = ['nome', 'cognome', 'email', 'telefono', 'password'];
const bookingColumns = ['nome', 'cognome', 'email', 'telefono', 'giorno', 'ora', 'servizio'];
const adminColumns = ['email', 'password']; // Solo lettura - credenziali admin
const holidayColumns = ['giorno', 'ora']; // Ferie: giorno e ora

// Inizializza i manager
const usersDB = new CSVManager(
  config.database.usersFile,
  userColumns
);

const bookingsDB = new CSVManager(
  config.database.bookingsFile,
  bookingColumns
);

// Admin DB - solo lettura (non usare insert/update/delete)
const adminDB = new CSVManager(
  config.database.adminFile,
  adminColumns
);

// Inizializza admin da variabili d'ambiente (non più hardcoded)
function initializeDefaultAdmin() {
  const admins = adminDB.readAll();
  if (admins.length === 0) {
    // Usa credenziali da .env
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

// Holidays DB - ferie
const holidaysDB = new CSVManager(
  config.database.holidaysFile,
  holidayColumns
);

// Esegui inizializzazione
initializeDefaultAdmin();

module.exports = { usersDB, bookingsDB, adminDB, holidaysDB, CSVManager };
