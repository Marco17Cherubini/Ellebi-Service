const dbModule = require('./server/database.js');

const bookingsDB = dbModule.bookingsDB;
const db = dbModule.db; // if needed, but bookingsDB works directly.

let count = 0;
const allBookings = bookingsDB.readAll();

allBookings.forEach((b) => {
  if (b.service_id === 'extra_work' && parseInt(b.durata_minuti, 10) !== 15) {
    bookingsDB.update(
      (row) => String(row.id) === String(b.id),
      { durata_minuti: 15 }
    );
    count++;
  }
});

console.log('Record di Lavoro Straordinario corrotti corretti: ' + count);
