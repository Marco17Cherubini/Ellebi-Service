// Statistiche per la pagina Report: appuntamenti per giorno negli ultimi 7 o 30 giorni
const { bookingsDB } = require('./database');
const { toDateString } = require('./dates');

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

// Conta gli appuntamenti (clienti e consegne). I blocchi di lavoro sui depositi (extra_work,
// 15 minuti ciascuno) non sono prenotazioni e sono esclusi (decisione D-4).
function getBookingStats(period = 'weekly') {
  const weekly = period === 'weekly';
  const days = weekly ? 7 : 30;

  const perDay = {};
  bookingsDB
    .findMany(b => b.service_id !== 'extra_work')
    .forEach(b => {
      perDay[b.giorno] = (perDay[b.giorno] || 0) + 1;
    });

  const start = new Date();
  start.setHours(12, 0, 0, 0); // mezzogiorno: nessun cambio di data con l'ora legale
  start.setDate(start.getDate() - (days - 1));

  const labels = [];
  const counts = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    labels.push(
      weekly ? `${DAY_NAMES[d.getDay()]} ${d.getDate()}` : `${d.getDate()}/${d.getMonth() + 1}`
    );
    counts.push(perDay[toDateString(d)] || 0);
  }

  return { labels, counts, period };
}

module.exports = { getBookingStats };
