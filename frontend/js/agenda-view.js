// Scelta della vista iniziale dell'agenda officina (Giorno o Settimana).
// Funzione pura: usata dal browser (admin-agenda.js) e dai test Node.
//
// La pianificazione di un lavoro straordinario (?assignDeposit=…) e la modalità ferie
// funzionano solo sulla griglia settimanale: in quei casi la vista è sempre "week",
// qualunque sia lo schermo o la preferenza salvata. Altrimenti vale la preferenza;
// senza preferenza, Settimana sugli schermi larghi e Giorno su telefono e tablet.
function agendaInitialView({ search = '', saved = null, wide = false } = {}) {
  const params = new URLSearchParams(search);
  if (params.get('assignDeposit')) return 'week';
  if (saved === 'day' || saved === 'week') return saved;
  return wide ? 'week' : 'day';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { agendaInitialView };
}
