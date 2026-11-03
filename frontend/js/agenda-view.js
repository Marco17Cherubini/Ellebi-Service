// Scelta della vista iniziale dell'agenda officina (Giorno o Settimana).
// Funzione pura: usata dal browser (admin-agenda.js) e dai test Node.
//
// Pianificazione di un lavoro straordinario (?assignDeposit=…): griglia settimanale sugli
// schermi larghi, vista Giorno con i quarti d'ora come pulsanti su telefono e tablet,
// qualunque sia la preferenza salvata. Altrimenti vale la preferenza; senza preferenza,
// Settimana sugli schermi larghi e Giorno su telefono e tablet.
function agendaInitialView({ search = '', saved = null, wide = false } = {}) {
  const params = new URLSearchParams(search);
  if (params.get('assignDeposit')) return wide ? 'week' : 'day';
  if (saved === 'day' || saved === 'week') return saved;
  return wide ? 'week' : 'day';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { agendaInitialView };
}
