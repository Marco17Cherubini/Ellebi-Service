// Date di calendario 'YYYY-MM-DD' nel fuso locale del server (quello dell'officina).
// Evitare toISOString() per ricavare il giorno: restituisce la data UTC, che in Italia
// differisce da quella locale tra mezzanotte e l'una o le due.

function toDateString(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function todayString() {
  return toDateString(new Date());
}

// Giorno della settimana (0 = domenica) di una data 'YYYY-MM-DD', senza passare da UTC
function dayOfWeek(dateString) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

module.exports = { toDateString, todayString, dayOfWeek };
