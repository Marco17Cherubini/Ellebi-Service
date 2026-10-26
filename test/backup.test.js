// Backup: copia del database indicato da DATABASE_PATH e rotazione degli ultimi 4
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ellebi-backup-'));
const dbPath = path.join(workDir, 'data', 'officina.sqlite');
const backupDir = path.join(workDir, 'backups');
fs.mkdirSync(path.dirname(dbPath));
fs.writeFileSync(dbPath, 'contenuto-sintetico');
process.env.DATABASE_PATH = dbPath;
process.env.BACKUP_DIR = backupDir;

const { backup, MAX_BACKUPS } = require('../server/backup');

after(() => fs.rmSync(workDir, { recursive: true, force: true }));

test('il backup copia il file indicato da DATABASE_PATH nella cartella BACKUP_DIR', () => {
  const { file } = backup({ now: new Date(2031, 0, 6, 9, 0, 0) });
  assert.equal(path.dirname(file), backupDir);
  assert.equal(fs.readFileSync(file, 'utf8'), 'contenuto-sintetico');
});

test('vengono conservati solo gli ultimi backup', () => {
  for (let day = 7; day <= 12; day++) backup({ now: new Date(2031, 0, day, 9, 0, 0) });
  const files = fs.readdirSync(backupDir).sort();
  assert.equal(files.length, MAX_BACKUPS);
  assert.equal(files[0], 'database_2031-01-09_09-00-00.sqlite');
});

test('database mancante: errore esplicito', () => {
  assert.throws(
    () => backup({ databasePath: path.join(workDir, 'nessuno.sqlite') }),
    /non trovato/
  );
});
