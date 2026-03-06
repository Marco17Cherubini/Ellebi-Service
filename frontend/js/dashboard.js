let currentUser = null;
let selectedDate = null;
let selectedTime = null;
let currentMonth = new Date();
let lastBooking = null; // Ultimo appuntamento dell'utente
let nextRecurringDate = null; // Data proposta per appuntamento ricorrente
let selectedGroupSize = 1; // Numero persone per la prenotazione (1-3)

// Giorni della settimana in italiano
const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const monthNames = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// Inizializzazione
async function init() {
  try {
    currentUser = await getCurrentUser();

    if (!currentUser) {
      redirectToLogin();
      return;
    }

    // Mostra messaggio di benvenuto
    document.getElementById('welcome-message').textContent =
      `Bentornato, ${currentUser.nome}`;

    // Check for editing mode
    const editingBooking = sessionStorage.getItem('editingBooking');
    if (editingBooking) {
      const booking = JSON.parse(editingBooking);
      showEditingBanner(booking);
      // In editing mode, skip group selection and use group size 1
      selectedGroupSize = 1;
      document.getElementById('group-modal').classList.add('hidden');
      document.getElementById('calendar-section').classList.remove('hidden');
      renderCalendar();
      return;
    }

    // Hide calendar until group is selected
    document.getElementById('calendar-section').classList.add('hidden');

    // Show group selection modal
    showGroupModal();

  } catch (error) {
    console.error('Errore inizializzazione:', error);
    redirectToLogin();
  }
}

// Show group selection modal
function showGroupModal() {
  const modal = document.getElementById('group-modal');
  modal.classList.remove('hidden');

  // Add click handlers to group buttons
  document.querySelectorAll('.group-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      selectedGroupSize = parseInt(btn.dataset.group);
      sessionStorage.setItem('selectedGroupSize', selectedGroupSize);

      // Hide group modal
      modal.classList.add('hidden');

      // Show calendar
      document.getElementById('calendar-section').classList.remove('hidden');

      // Check for recurring appointment (only for single bookings)
      if (selectedGroupSize === 1) {
        await checkRecurringAppointment();
      }

      // Render calendar
      renderCalendar();
    });
  });
}

// Mostra banner per modalità modifica
function showEditingBanner(booking) {
  const container = document.querySelector('.container');
  const banner = document.createElement('div');
  banner.id = 'editing-banner';
  banner.style.cssText = 'background: var(--color-warning, #ffc107); color: #000; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;';
  banner.innerHTML = `
    <span><strong>Modalità Modifica:</strong> Seleziona nuova data e orario per sostituire l'appuntamento del ${formatDate(booking.giorno)} alle ${booking.ora}</span>
    <button onclick="cancelEditing()" class="btn" style="padding: 6px 12px; font-size: 0.9rem;">Annulla Modifica</button>
  `;
  container.insertBefore(banner, container.firstChild.nextSibling);
}

// Annulla modalità modifica
function cancelEditing() {
  sessionStorage.removeItem('editingBooking');
  document.getElementById('editing-banner')?.remove();
}

// Verifica e mostra banner appuntamento ricorrente
async function checkRecurringAppointment() {
  try {
    // Skip if in editing mode
    if (sessionStorage.getItem('editingBooking')) {
      return; // Non mostrare "Il solito" quando si sta modificando
    }

    // Ottieni le prenotazioni dell'utente
    const response = await apiRequest('/bookings');

    if (!response.success || !response.bookings || response.bookings.length === 0) {
      return; // Nessuna prenotazione, niente banner
    }

    // Trova l'ultimo appuntamento (il più recente)
    const sortedBookings = response.bookings.sort((a, b) => {
      const dateA = new Date(a.giorno + 'T' + a.ora);
      const dateB = new Date(b.giorno + 'T' + b.ora);
      return dateB - dateA; // Ordine decrescente
    });

    lastBooking = sortedBookings[0];

    // Calcola la data +7 giorni (stesso giorno della settimana)
    const lastDate = new Date(lastBooking.giorno);
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + 7);

    // Formato YYYY-MM-DD per la verifica disponibilità
    const nextDateStr = formatDateYMD(nextDate);

    // Verifica che la data non sia nel passato
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (nextDate < today) {
      return; // La data proposta è nel passato
    }

    // Verifica disponibilità dello slot
    const slotsResponse = await apiRequest(`/slots/${nextDateStr}`);

    if (!slotsResponse.success || !slotsResponse.slots) {
      return;
    }

    // Cerca lo slot con lo stesso orario
    const targetSlot = slotsResponse.slots.find(s => s.time === lastBooking.ora);

    if (!targetSlot || !targetSlot.available || targetSlot.isHoliday) {
      return; // Slot non disponibile o in ferie
    }

    // Lo slot è disponibile! Mostra il modal
    nextRecurringDate = {
      date: nextDateStr,
      time: lastBooking.ora
    };

    showRecurringModal(lastDate, nextDate, lastBooking.ora, currentUser.nome);

  } catch (error) {
    console.error('Errore verifica appuntamento ricorrente:', error);
  }
}

// Formatta data come YYYY-MM-DD
function formatDateYMD(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Formatta data in italiano (es. "Giovedì 27 novembre 2025")
function formatDateItalian(date) {
  const dayName = dayNames[date.getDay()];
  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${dayName} ${day} ${month} ${year}`;
}

// Mostra il modal dell'appuntamento ricorrente
function showRecurringModal(lastDate, nextDate, time, userName) {
  const modal = document.getElementById('recurring-modal');
  const title = document.getElementById('recurring-title');
  const prevDateEl = document.getElementById('recurring-prev-date');
  const nextDateEl = document.getElementById('recurring-next-date');

  // Imposta titolo personalizzato
  title.textContent = `Il solito ${userName}?`;

  // Formatta le date
  // Format: "Mercoledì 31 dicembre 2025, 17:00"
  const prevDateStr = `${formatDateItalian(lastDate)}, ${time}`;
  const nextDateStr = `${formatDateItalian(nextDate)}, ${time}`;

  prevDateEl.textContent = prevDateStr;
  nextDateEl.textContent = `→ ${nextDateStr}`;

  // Mostra il modal
  modal.classList.remove('hidden');

  // Event listeners
  document.getElementById('recurring-btn-no').onclick = () => {
    modal.classList.add('hidden');
  };

  document.getElementById('recurring-btn-book').onclick = bookRecurringAppointment;
}

// Prenota l'appuntamento ricorrente
function bookRecurringAppointment() {
  if (!nextRecurringDate) return;

  // Salva i dati in sessionStorage
  sessionStorage.setItem('selectedDate', nextRecurringDate.date);
  sessionStorage.setItem('selectedTime', nextRecurringDate.time);

  // Vai direttamente al riepilogo
  window.location.href = '/summary';
}



// Render calendario
function renderCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Mostra mese corrente (usa prima lettera maiuscola)
  const calendarMonthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  document.getElementById('current-month').textContent =
    `${calendarMonthNames[month]} ${year}`;

  // Calcola primo giorno e numero di giorni
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Ottieni riferimento alla griglia (rimuovi solo i giorni, mantieni headers)
  const calendarGrid = document.getElementById('calendar-grid');

  // Rimuovi tutti i giorni precedenti (mantieni solo i 7 header)
  const existingDays = calendarGrid.querySelectorAll('.calendar-day');
  existingDays.forEach(day => day.remove());

  // Aggiungi giorni vuoti all'inizio (Lunedì = 0, Domenica = 6)
  // firstDay: 0=Domenica, 1=Lunedì, 2=Martedì, ecc (JS standard)
  // Convertiamo: Lunedì=0, Martedì=1, ..., Domenica=6
  const startDay = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < startDay; i++) {
    const emptyDay = document.createElement('div');
    emptyDay.className = 'calendar-day empty';
    calendarGrid.appendChild(emptyDay);
  }

  // Aggiungi giorni del mese
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    // Formato data locale YYYY-MM-DD (evita problemi UTC)
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateString = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = date.getDay();

    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    dayElement.textContent = day;
    dayElement.dataset.date = dateString;

    // Disabilita giorni passati
    if (date < today) {
      dayElement.classList.add('disabled');
    }
    // Disabilita domenica (0) e lunedì (1)
    else if (dayOfWeek === 0 || dayOfWeek === 1) {
      dayElement.classList.add('disabled');
    }
    // Giorni disponibili
    else {
      dayElement.addEventListener('click', () => selectDate(dateString, dayElement));
    }

    calendarGrid.appendChild(dayElement);
  }
}

// Seleziona data
async function selectDate(dateString, element) {
  // Rimuovi selezione precedente
  document.querySelectorAll('.calendar-day.selected').forEach(el => {
    el.classList.remove('selected');
  });

  // Seleziona nuovo giorno
  element.classList.add('selected');
  selectedDate = dateString;
  selectedTime = null;

  // Carica slot disponibili
  await loadTimeSlots(dateString);
}

// Carica slot orari
async function loadTimeSlots(date) {
  try {
    const response = await apiRequest(`/slots/${date}`);

    const timeSlotsSection = document.getElementById('time-slots-section');
    const timeSlotsGrid = document.getElementById('time-slots-grid');

    timeSlotsSection.classList.remove('hidden');

    // Filtra solo gli slot disponibili (non prenotati e non in ferie)
    let availableSlots = response.slots.filter(slot => slot.available && !slot.isHoliday);

    // Se la data selezionata è oggi, filtra anche gli orari già passati
    const today = new Date();
    const selectedDateObj = new Date(date);
    const isToday = selectedDateObj.toDateString() === today.toDateString();

    if (isToday) {
      const currentHour = today.getHours();
      const currentMinute = today.getMinutes();

      availableSlots = availableSlots.filter(slot => {
        const [slotHour, slotMinute] = slot.time.split(':').map(Number);
        // Slot è futuro se l'ora è maggiore, o se l'ora è uguale ma i minuti sono maggiori
        return slotHour > currentHour || (slotHour === currentHour && slotMinute > currentMinute);
      });
    }

    // NUOVO: Filtra per prenotazioni di gruppo
    // Se selectedGroupSize > 1, mostra solo slot con N consecutivi disponibili
    if (selectedGroupSize > 1) {
      const allSlotTimes = response.slots.map(s => s.time);
      const availableTimes = new Set(availableSlots.map(s => s.time));

      availableSlots = availableSlots.filter(slot => {
        const startIndex = allSlotTimes.indexOf(slot.time);
        if (startIndex === -1) return false;

        // Verifica che i prossimi N-1 slot siano disponibili
        for (let i = 1; i < selectedGroupSize; i++) {
          const nextSlotTime = allSlotTimes[startIndex + i];
          if (!nextSlotTime || !availableTimes.has(nextSlotTime)) {
            return false;
          }
        }
        return true;
      });
    }

    if (availableSlots.length === 0) {
      const message = selectedGroupSize > 1
        ? `Nessun orario con ${selectedGroupSize} slot consecutivi disponibili`
        : 'Nessun orario disponibile per questa data';
      timeSlotsGrid.innerHTML = `<div class="no-slots-message">${message}</div>`;
      return;
    }

    timeSlotsGrid.innerHTML = availableSlots.map(slot => {
      const groupLabel = selectedGroupSize > 1 ? ` <small>(+${selectedGroupSize - 1})</small>` : '';
      return `
        <div class="time-slot" data-time="${slot.time}">
          ${slot.time}${groupLabel}
        </div>
      `;
    }).join('');

    // Aggiungi event listener per slot disponibili (non ferie, non occupati)
    document.querySelectorAll('.time-slot:not(.disabled):not(.holiday)').forEach(slot => {
      slot.addEventListener('click', () => selectTimeSlot(slot));
    });

    // Disabilita pulsante conferma
    document.getElementById('confirm-datetime-btn').disabled = true;
  } catch (error) {
    console.error('Errore caricamento slot:', error);
    alert('Errore nel caricamento degli orari disponibili');
  }
}

// Seleziona slot orario
function selectTimeSlot(element) {
  // Rimuovi selezione precedente
  document.querySelectorAll('.time-slot.selected').forEach(el => {
    el.classList.remove('selected');
  });

  // Seleziona nuovo slot
  element.classList.add('selected');
  selectedTime = element.dataset.time;

  // Abilita pulsante conferma
  document.getElementById('confirm-datetime-btn').disabled = false;
}

// Navigation calendario
document.getElementById('prev-month').addEventListener('click', () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
  hideTimeSlots();
});

document.getElementById('next-month').addEventListener('click', () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
  hideTimeSlots();
});

function hideTimeSlots() {
  document.getElementById('time-slots-section').classList.add('hidden');
  selectedDate = null;
  selectedTime = null;
}

// Conferma data e ora
document.getElementById('confirm-datetime-btn').addEventListener('click', () => {
  if (selectedDate && selectedTime) {
    // Salva in sessionStorage
    sessionStorage.setItem('selectedDate', selectedDate);
    sessionStorage.setItem('selectedTime', selectedTime);

    // Vai direttamente al riepilogo (servizio rimosso)
    window.location.href = '/summary';
  }
});

// Sidebar functionality
function setupSidebar() {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const closeSidebarBtn = document.getElementById('close-sidebar');
  const sidebarLogout = document.getElementById('sidebar-logout');

  function openSidebar() {
    sidebar.classList.add('active');
    sidebarOverlay.classList.add('active');
  }

  function closeSidebar() {
    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
  }

  hamburgerBtn.addEventListener('click', openSidebar);
  closeSidebarBtn.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  // Logout from sidebar
  sidebarLogout.addEventListener('click', async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (error) {
      console.error('Errore logout:', error);
      window.location.href = '/';
    }
  });
}

// Initialize sidebar
setupSidebar();

// Avvia inizializzazione
init();
