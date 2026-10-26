// Statistiche per la pagina Report: prenotazioni per giorno negli ultimi 7 o 30 giorni
const { bookingsDB } = require('./database');

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

function getBookingStats(period = 'weekly') {
  const weekly = period === 'weekly';
  const days = weekly ? 7 : 30;
  const allBookings = bookingsDB.readAll();

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (days - 1));

  const labels = [];
  const counts = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    labels.push(
      weekly ? `${DAY_NAMES[d.getDay()]} ${d.getDate()}` : `${d.getDate()}/${d.getMonth() + 1}`
    );

    const dateStr = d.toISOString().split('T')[0];
    counts.push(allBookings.filter(b => b.giorno === dateStr).length);
  }

  return { labels, counts, period };
}

module.exports = { getBookingStats };
