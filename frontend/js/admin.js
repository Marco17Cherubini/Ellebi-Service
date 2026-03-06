let currentWeekStart = null;
let allBookings = [];
let allUsers = [];
let allHolidays = [];
let selectedSlot = { date: null, time: null };
let selectedBooking = null;
let holidayMode = false;
let selectedHolidaySlots = []; // Slot selezionati per aggiunta/rimozione ferie

// Modal instances (initialized in init())
let bookingModal = null;
let detailModal = null;
let deleteConfirmModal = null;

// Variabili per drag-select ferie
let isDragging = false;
let dragStartCell = null;
let dragMode = null; // 'add' o 'remove' - determina se stiamo aggiungendo o rimuovendo ferie

// Variabili per drag-and-drop prenotazioni
let isDraggingBooking = false;
let draggedBooking = null;
let dragGhostElement = null;
let longPressTimer = null;
let touchStartX = 0;
let touchStartY = 0;

// Orari di lavoro - martedì-venerdì (45 min per appuntamento)
const timeSlotsWeekday = [
  '08:30', '09:15', '10:00', '10:45', '11:30', '12:15',
  '14:00', '14:45', '15:30', '16:15', '17:00'
];

// Orari di lavoro - sabato (45 min per appuntamento)
const timeSlotsSaturday = [
  '08:30', '09:15', '10:00', '10:45', '11:30', '12:15',
  '14:00', '14:45'
];

// Slot pre-orario (08:00) disponibile per admin/VIP
const preOpeningSlot = ['08:00'];

// Slot straordinario (solo admin/VIP) - dopo orario chiusura fino a mezzanotte
const extraSlotsWeekday = [
  '18:00', '18:45', '19:30', '20:15', '21:00', '21:45', '22:30', '23:15'
];

const extraSlotsSaturday = [
  '15:30', '16:15', '17:00', '17:45', '18:30', '19:15', '20:00', '20:45', '21:30', '22:15', '23:00'
];

// Funzione per ottenere gli slot per un giorno (inclusi extra per admin)
function getTimeSlotsForDate(date, includeExtra = true) {
  const dayOfWeek = new Date(date).getDay();
  const normalSlots = dayOfWeek === 6 ? timeSlotsSaturday : timeSlotsWeekday;
  if (includeExtra) {
    const extraSlots = dayOfWeek === 6 ? extraSlotsSaturday : extraSlotsWeekday;
    // Includi pre-orario + slot normali + straordinari
    return [...preOpeningSlot, ...normalSlots, ...extraSlots];
  }
  return normalSlots;
}

// Tutti gli slot possibili (unione per visualizzazione griglia admin)
// Include lo slot pre-orario 08:00 per admin/VIP
const allTimeSlots = [
  '08:00', '08:30', '09:15', '10:00', '10:45', '11:30', '12:15',
  '14:00', '14:45', '15:30', '16:15', '17:00',
  '18:00', '18:45', '19:30', '20:15', '21:00', '21:45', '22:30', '23:15'
];

// Slot normali (per controllo visualizzazione)
const normalEndTimeWeekday = '17:00';
const normalEndTimeSaturday = '14:45';

// Giorni lavorativi (Lun-Sab = indici 0-5 nel nostro array)
const workDays = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

// Inizializzazione
async function init() {
  try {
    // Verifica autenticazione admin
    const response = await apiRequest('/auth/me');

    if (!response.success || !response.user.isAdmin) {
      // Non è admin, redirect a home cliente
      window.location.href = '/home';
      return;
    }

    // Imposta settimana corrente (inizia da lunedì)
    currentWeekStart = getMonday(new Date());

    // Carica utenti per autocompletamento
    await loadUsers();

    // Carica ferie
    await loadHolidays();

    // Carica prenotazioni e renderizza
    await loadBookings();
    renderCalendar();

    // Setup event listeners per modal
    setupModalListeners();
    setupAutocomplete();
    setupHolidayMode();
  } catch (error) {
    console.error('Errore inizializzazione:', error);
    window.location.href = '/login';
  }
}

// Ottieni lunedì della settimana
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Carica tutti gli utenti registrati
async function loadUsers() {
  try {
    const response = await apiRequest('/admin/users');
    if (response.success) {
      allUsers = response.users;
    }
  } catch (error) {
    console.error('Errore caricamento utenti:', error);
    allUsers = [];
  }
}

// Carica tutte le ferie
async function loadHolidays() {
  try {
    const response = await apiRequest('/holidays');
    if (response.success) {
      allHolidays = response.holidays;
    }
  } catch (error) {
    console.error('Errore caricamento ferie:', error);
    allHolidays = [];
  }
}

// Carica tutte le prenotazioni
async function loadBookings() {
  try {
    const response = await apiRequest('/admin/bookings');
    if (response.success) {
      allBookings = response.bookings;
    }
  } catch (error) {
    console.error('Errore caricamento prenotazioni:', error);
    allBookings = [];
  }
}

// Formatta data come YYYY-MM-DD
function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Formatta data per visualizzazione
function formatDateDisplay(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

// Formatta data stringa per visualizzazione
function formatDateStringDisplay(dateStr) {
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Render calendario settimanale
function renderCalendar() {
  const grid = document.getElementById('admin-calendar-grid');

  // Rimuovi righe precedenti (mantieni solo header)
  const existingRows = grid.querySelectorAll('.admin-time-header, .admin-cell');
  existingRows.forEach(row => row.remove());

  // Calcola le date della settimana (Lun-Sab)
  const weekDates = [];
  for (let i = 0; i <= 5; i++) { // 0=Lun, 1=Mar, 2=Mer, 3=Gio, 4=Ven, 5=Sab
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    weekDates.push(date);
  }

  // Aggiorna header con date
  weekDates.forEach((date, index) => {
    const header = document.getElementById(`day-header-${index}`);
    header.innerHTML = `${workDays[index]}<br>${formatDateDisplay(date)}`;
  });

  // Titolo settimana rimosso per maggiore spazio verticale calendario
  // Genera righe per ogni orario (usa allTimeSlots per la griglia)
  allTimeSlots.forEach(time => {
    // Cella orario
    const timeCell = document.createElement('div');
    timeCell.className = 'admin-time-header';
    timeCell.textContent = time;
    grid.appendChild(timeCell);

    // Celle per ogni giorno
    weekDates.forEach(date => {
      const cell = document.createElement('div');
      cell.className = 'admin-cell';

      const dateStr = formatDate(date);
      const dayOfWeek = date.getDay();
      const daySlots = getTimeSlotsForDate(date, true); // Include extra
      const normalSlots = dayOfWeek === 6 ? timeSlotsSaturday : timeSlotsWeekday;
      const isValidSlot = daySlots.includes(time);
      const isExtraSlot = isValidSlot && !normalSlots.includes(time);
      const booking = findBooking(dateStr, time);
      const isHoliday = findHoliday(dateStr, time);
      const isSelectedForHoliday = selectedHolidaySlots.some(s => s.giorno === dateStr && s.ora === time);

      // Slot dati
      cell.dataset.date = dateStr;
      cell.dataset.time = time;

      // Marca slot extra con classe speciale
      if (isExtraSlot) {
        cell.classList.add('extra-slot');
      }

      // Se lo slot non è valido per questo giorno (es. sabato dopo le 23:00)
      if (!isValidSlot) {
        cell.classList.add('invalid-slot');
        cell.innerHTML = '<div class="no-booking">—</div>';
        grid.appendChild(cell);
        return;
      }

      if (holidayMode) {
        // ===== MODALITÀ FERIE =====
        if (isSelectedForHoliday) {
          cell.classList.add('holiday-selected');
          cell.innerHTML = '<div class="no-booking">Selezionato</div>';
        } else if (isHoliday) {
          cell.classList.add('is-holiday');
          cell.innerHTML = '<div class="holiday-label">FERIE (rimuovi)</div>';
        } else if (booking) {
          // Prenotazione esistente - non può essere ferie
          cell.classList.add('has-booking');
          cell.innerHTML = renderBookingItem(booking, time);
        } else {
          cell.innerHTML = '<div class="no-booking">+ Ferie</div>';
        }

        // Solo celle senza prenotazione possono essere selezionate per ferie
        if (!booking) {
          // Drag-select: mousedown inizia il drag
          cell.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startDrag(dateStr, time, isHoliday);
          });

          // Drag-select: mouseenter durante il drag
          cell.addEventListener('mouseenter', () => {
            if (isDragging) {
              addToDragSelection(dateStr, time, isHoliday);
            }
          });
        }
      } else if (isHoliday) {
        // ===== MODALITÀ NORMALE - FERIE =====
        cell.classList.add('is-holiday');
        cell.innerHTML = '<div class="holiday-label">FERIE</div>';
      } else if (booking) {
        cell.classList.add('has-booking');
        cell.innerHTML = renderBookingItem(booking, time);

        // Drag-and-drop: inizia drag su mousedown sulla prenotazione
        cell.addEventListener('mousedown', (e) => {
          if (holidayMode) return;
          e.preventDefault();
          startBookingDrag(booking, e);
        });

        // Drag-and-drop: supporto TOUCH (Long Press)
        cell.addEventListener('touchstart', (e) => {
          if (holidayMode) return;
          if (e.touches.length !== 1) return;

          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;

          // Avvia timer per long press (500ms)
          longPressTimer = setTimeout(() => {
            e.preventDefault();
            startBookingDrag(booking, e.touches[0]);

            // Feedback vibratile se supportato
            if (navigator.vibrate) navigator.vibrate(50);
          }, 500);
        }, { passive: false });

        cell.addEventListener('touchmove', (e) => {
          // Se ci si muove troppo prima del long press, annulla
          if (longPressTimer && !isDraggingBooking) {
            const moveX = e.touches[0].clientX;
            const moveY = e.touches[0].clientY;
            if (Math.abs(moveX - touchStartX) > 10 || Math.abs(moveY - touchStartY) > 10) {
              clearTimeout(longPressTimer);
              longPressTimer = null;
            }
          }
        }, { passive: false });

        cell.addEventListener('touchend', () => {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        });

        cell.addEventListener('touchcancel', () => {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        });

        // Click su cella con prenotazione -> mostra dettagli (solo se non era drag)
        cell.addEventListener('click', (e) => {
          if (isDraggingBooking) return;
          e.stopPropagation();
          showDetailModal(booking);
        });
      } else {
        // ===== CELLA VUOTA - MODALITÀ NORMALE =====
        cell.innerHTML = '<div class="no-booking">+ Aggiungi</div>';
        cell.classList.add('droppable');

        // Drop target: evidenzia durante drag
        cell.addEventListener('mouseenter', () => {
          if (isDraggingBooking) {
            cell.classList.add('drop-target');
          }
        });

        cell.addEventListener('mouseleave', () => {
          cell.classList.remove('drop-target');
        });

        // Drop: rilascia prenotazione
        cell.addEventListener('mouseup', () => {
          if (isDraggingBooking && draggedBooking) {
            dropBooking(dateStr, time);
          }
        });

        cell.addEventListener('click', () => {
          if (isDraggingBooking) return;
          openBookingModal(dateStr, time);
        });
      }

      grid.appendChild(cell);
    });
  });
}

// Trova ferie per data e ora
function findHoliday(date, time) {
  return allHolidays.find(h => h.giorno === date && h.ora === time);
}

// Trova prenotazione per data e ora
function findBooking(date, time) {
  return allBookings.find(b => b.giorno === date && b.ora === time);
}

// Render singolo appuntamento
function renderBookingItem(booking, time) {
  return `
    <div class="booking-item" data-giorno="${booking.giorno}" data-ora="${booking.ora}">
      <div class="name">${booking.nome} ${booking.cognome}</div>
      ${booking.servizio ? `<div class="service">${booking.servizio}</div>` : ''}
      <div class="duration">Durata: 30 min.</div>
      <div class="contact">
        ${booking.email}<br>
        ${booking.telefono}
      </div>
    </div>
  `;
}

// ==================== DRAG-AND-DROP PRENOTAZIONI ====================

function startBookingDrag(booking, event) {
  isDraggingBooking = true;
  draggedBooking = booking;

  // Crea elemento ghost che segue il mouse
  dragGhostElement = document.createElement('div');
  dragGhostElement.className = 'booking-drag-ghost';
  dragGhostElement.innerHTML = `
    <div class="name">${booking.nome} ${booking.cognome}</div>
  `;
  document.body.appendChild(dragGhostElement);

  // Posiziona ghost al mouse
  updateGhostPosition(event);

  // Aggiungi classe alla cella originale
  const originalCell = document.querySelector(`[data-date="${booking.giorno}"][data-time="${booking.ora}"]`);
  if (originalCell) {
    originalCell.classList.add('dragging-source');
  }

  // Aggiungi classe al body per cambiare cursore
  document.body.classList.add('is-dragging-booking');
}

function updateGhostPosition(event) {
  if (dragGhostElement) {
    dragGhostElement.style.left = (event.clientX + 10) + 'px';
    dragGhostElement.style.top = (event.clientY + 10) + 'px';
  }
}

function endBookingDrag(snapBack = false) {
  const sourceCell = document.querySelector('.dragging-source');

  // Snap-back animation se richiesto
  if (snapBack && sourceCell) {
    sourceCell.classList.add('snap-back-animation');
    setTimeout(() => {
      sourceCell.classList.remove('snap-back-animation');
    }, 400);
  }

  isDraggingBooking = false;
  draggedBooking = null;

  // Rimuovi ghost
  if (dragGhostElement) {
    dragGhostElement.remove();
    dragGhostElement = null;
  }

  // Rimuovi classi
  document.body.classList.remove('is-dragging-booking');
  document.querySelectorAll('.dragging-source').forEach(el => el.classList.remove('dragging-source'));
  document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  document.querySelectorAll('.drop-invalid').forEach(el => el.classList.remove('drop-invalid'));
}

// Verifica se uno slot e disponibile (non occupato e non in ferie)
function isSlotAvailable(giorno, ora) {
  const hasBooking = allBookings.some(b => b.giorno === giorno && b.ora === ora);
  const hasHoliday = allHolidays.some(h => h.giorno === giorno && h.ora === ora);
  return !hasBooking && !hasHoliday;
}

// Mostra feedback visivo per drop non valido
function showDropFeedback(message, isError = false) {
  // Crea elemento feedback
  const feedback = document.createElement('div');
  feedback.className = `drop-feedback ${isError ? 'error' : 'success'}`;
  feedback.textContent = message;
  document.body.appendChild(feedback);

  // Rimuovi dopo animazione
  setTimeout(() => {
    feedback.classList.add('fade-out');
    setTimeout(() => feedback.remove(), 300);
  }, 1500);
}

async function dropBooking(newGiorno, newOra) {
  if (!draggedBooking) return;

  const oldGiorno = draggedBooking.giorno;
  const oldOra = draggedBooking.ora;

  // Se lo slot e lo stesso, non fare nulla
  if (oldGiorno === newGiorno && oldOra === newOra) {
    endBookingDrag();
    return;
  }

  // Validazione client-side: verifica disponibilita slot
  if (!isSlotAvailable(newGiorno, newOra)) {
    // Slot occupato: snap-back con feedback visivo
    showDropFeedback('Slot occupato', true);
    endBookingDrag(true); // true = attiva snap-back
    return;
  }

  try {
    // Aggiornamento asincrono del database
    const response = await apiRequest('/admin/bookings', {
      method: 'PUT',
      body: JSON.stringify({
        oldGiorno,
        oldOra,
        newGiorno,
        newOra
      })
    });

    if (response.success) {
      showDropFeedback('Prenotazione spostata', false);
      // Haptic feedback on successful drop
      if (navigator.vibrate) navigator.vibrate(50);
      endBookingDrag();
      await loadBookings();
      renderCalendar();
    } else {
      // Errore server: snap-back
      showDropFeedback(response.error || 'Errore spostamento', true);
      endBookingDrag(true);
    }
  } catch (error) {
    // Errore connessione: snap-back
    showDropFeedback('Errore: ' + error.message, true);
    endBookingDrag(true);
  }
}

// Event listener globali per drag prenotazioni
document.addEventListener('mousemove', (e) => {
  if (isDraggingBooking) {
    updateGhostPosition(e);
  }
});

document.addEventListener('mouseup', () => {
  if (isDraggingBooking) {
    endBookingDrag();
  }
});

// Supporto Touch per Mobile (Global)
document.addEventListener('touchmove', (e) => {
  if (isDraggingBooking) {
    e.preventDefault(); // Previene lo scroll
    updateGhostPosition(e.touches[0]);

    // Identifica manualmente il target del drop
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = target ? target.closest('.admin-cell') : null;

    // Rimuovi highlight precedenti
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

    if (cell && cell.classList.contains('droppable')) {
      cell.classList.add('drop-target');
    }
  }
}, { passive: false });

document.addEventListener('touchend', (e) => {
  if (isDraggingBooking) {
    e.preventDefault();

    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = target ? target.closest('.admin-cell') : null;

    if (cell && cell.classList.contains('droppable')) {
      const date = cell.dataset.date;
      const time = cell.dataset.time;
      // Haptic feedback immediato al drop
      if (navigator.vibrate) navigator.vibrate(50);
      dropBooking(date, time);
    } else {
      // Vibrazione breve per drop non valido
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
      endBookingDrag(true); // Snap back se drop non valido
    }
  }
});

// ==================== MODAL INSERIMENTO ====================

function openBookingModal(date, time) {
  selectedSlot = { date, time };

  // Reset form
  document.getElementById('booking-form').reset();
  document.getElementById('form-error').classList.add('hidden');
  document.getElementById('suggestions-list').classList.add('hidden');

  // Imposta titolo e sottotitolo
  document.getElementById('modal-title').textContent = 'Nuovo Appuntamento';
  document.getElementById('modal-date-display').textContent = formatDateStringDisplay(date);
  document.getElementById('modal-time-display').textContent = time;

  // Mostra modal using Modal class
  bookingModal.open();

  // Focus su cognome
  setTimeout(() => {
    document.getElementById('input-cognome').focus();
  }, 100);
}

function closeBookingModal() {
  bookingModal.close();
}

// ==================== MODAL DETTAGLIO ====================

function showDetailModal(booking) {
  selectedBooking = booking;

  document.getElementById('detail-content').innerHTML = `
    <div><strong>Nome:</strong> ${booking.nome} ${booking.cognome}</div>
    <div><strong>Data:</strong> ${formatDateStringDisplay(booking.giorno)}</div>
    <div><strong>Ora:</strong> ${booking.ora}</div>
    <div><strong>Email:</strong> ${booking.email}</div>
    <div><strong>Telefono:</strong> ${booking.telefono}</div>
  `;

  detailModal.open();
}

function closeDetailModal() {
  detailModal.close();
  selectedBooking = null;
}

// ==================== MODAL CONFERMA CANCELLAZIONE ====================

function showDeleteConfirmModal() {
  if (!selectedBooking) return;

  // Popola il modal di conferma
  document.getElementById('delete-client-name').textContent =
    `${selectedBooking.nome} ${selectedBooking.cognome}`;

  document.getElementById('delete-booking-details').innerHTML = `
    <div><strong>Data:</strong> ${formatDateStringDisplay(selectedBooking.giorno)}</div>
    <div><strong>Ora:</strong> ${selectedBooking.ora}</div>
  `;

  // Chiudi modal dettaglio e apri conferma
  detailModal.close();
  deleteConfirmModal.open();
}

function closeDeleteConfirmModal() {
  deleteConfirmModal.close();
}

async function executeDelete() {
  if (!selectedBooking) return;

  try {
    const deleteBtn = document.getElementById('delete-confirm');
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Cancellazione...';

    const response = await apiRequest('/admin/bookings', {
      method: 'DELETE',
      body: JSON.stringify({
        giorno: selectedBooking.giorno,
        ora: selectedBooking.ora
      })
    });

    if (response.success) {
      // Riabilita il pulsante prima di chiudere
      const deleteBtn = document.getElementById('delete-confirm');
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Sì, Cancella';

      closeDeleteConfirmModal();
      selectedBooking = null;
      await loadBookings();
      renderCalendar();
    }
  } catch (error) {
    alert('Errore nella cancellazione: ' + error.message);
    const deleteBtn = document.getElementById('delete-confirm');
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Sì, Cancella';
  }
}

// ==================== AUTOCOMPLETAMENTO ====================

function setupAutocomplete() {
  const cognomeInput = document.getElementById('input-cognome');
  const suggestionsList = document.getElementById('suggestions-list');

  cognomeInput.addEventListener('input', () => {
    const value = cognomeInput.value.trim().toLowerCase();

    if (value.length < 2) {
      suggestionsList.classList.add('hidden');
      return;
    }

    // Cerca utenti che matchano il cognome
    const matches = allUsers.filter(user =>
      user.cognome.toLowerCase().includes(value) ||
      user.nome.toLowerCase().includes(value)
    );

    if (matches.length === 0) {
      suggestionsList.classList.add('hidden');
      return;
    }

    // Mostra suggerimenti
    suggestionsList.innerHTML = matches.map(user => `
      <div class="suggestion-item" data-user='${JSON.stringify(user).replace(/'/g, "\\'")}'>
        <div class="suggestion-name">${user.cognome} ${user.nome}</div>
        <div class="suggestion-details">${user.email} | ${user.telefono}</div>
      </div>
    `).join('');

    suggestionsList.classList.remove('hidden');

    // Click su suggerimento
    suggestionsList.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const user = JSON.parse(item.dataset.user.replace(/\\'/g, "'"));
        fillUserData(user);
        suggestionsList.classList.add('hidden');
      });
    });
  });

  // Chiudi suggerimenti quando si clicca fuori
  document.addEventListener('click', (e) => {
    if (!cognomeInput.contains(e.target) && !suggestionsList.contains(e.target)) {
      suggestionsList.classList.add('hidden');
    }
  });
}

function fillUserData(user) {
  document.getElementById('input-cognome').value = user.cognome;
  document.getElementById('input-nome').value = user.nome;
  document.getElementById('input-email').value = user.email;
  document.getElementById('input-telefono').value = user.telefono;
}

// ==================== EVENT LISTENERS ====================

function setupModalListeners() {
  // Initialize Modal instances using the Modal component class
  bookingModal = new Modal('booking-modal', {
    onClose: () => {
      selectedSlot = { date: null, time: null };
    }
  });

  detailModal = new Modal('detail-modal', {
    onClose: () => {
      // Keep selectedBooking for delete flow
    }
  });

  deleteConfirmModal = new Modal('delete-confirm-modal', {
    onClose: () => {
      // selectedBooking is cleared after delete
    }
  });

  // Button handlers (Modal handles overlay click and escape key automatically)
  document.getElementById('modal-cancel').addEventListener('click', () => bookingModal.close());
  document.getElementById('detail-close').addEventListener('click', () => detailModal.close());
  document.getElementById('detail-delete').addEventListener('click', showDeleteConfirmModal);
  document.getElementById('delete-cancel').addEventListener('click', () => deleteConfirmModal.close());
  document.getElementById('delete-confirm').addEventListener('click', executeDelete);

  // Submit form inserimento
  document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
      nome: document.getElementById('input-nome').value.trim(),
      cognome: document.getElementById('input-cognome').value.trim(),
      email: document.getElementById('input-email').value.trim(),
      telefono: document.getElementById('input-telefono').value.trim(),
      servizio: document.getElementById('input-servizio').value,
      giorno: selectedSlot.date,
      ora: selectedSlot.time
    };

    // Validazione (solo cognome obbligatorio per admin)
    if (!formData.cognome) {
      document.getElementById('form-error').textContent = 'Il cognome è obbligatorio';
      document.getElementById('form-error').classList.remove('hidden');
      return;
    }

    try {
      const saveBtn = document.getElementById('modal-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvataggio...';

      const response = await apiRequest('/admin/bookings', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      if (response.success) {
        // Riabilita il pulsante prima di chiudere
        const saveBtn = document.getElementById('modal-save');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Conferma';

        closeBookingModal();
        await loadBookings();
        renderCalendar();
      } else {
        const saveBtn = document.getElementById('modal-save');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Conferma';
      }
    } catch (error) {
      document.getElementById('form-error').textContent = error.message;
      document.getElementById('form-error').classList.remove('hidden');
      const saveBtn = document.getElementById('modal-save');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salva Appuntamento';
    }
  });
}

// Navigazione settimana precedente
document.getElementById('prev-week').addEventListener('click', async () => {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  await loadBookings();
  renderCalendar();
});

// Navigazione settimana successiva
document.getElementById('next-week').addEventListener('click', async () => {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  await loadBookings();
  renderCalendar();
});

// ==================== SIDEBAR MENU ====================

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

// ==================== GESTIONE FERIE ====================

function setupHolidayMode() {
  const holidayToggle = document.getElementById('holiday-mode-toggle');
  const holidayIndicator = document.getElementById('holiday-mode-indicator');
  const saveBtn = document.getElementById('save-holidays-btn');
  const cancelBtn = document.getElementById('cancel-holidays-btn');
  const calendarContainer = document.querySelector('.admin-calendar');

  // Toggle modalità ferie
  holidayToggle.addEventListener('click', () => {
    if (!holidayMode) {
      enterHolidayMode();
    }
  });

  // Salva ferie
  saveBtn.addEventListener('click', saveHolidays);

  // Annulla modalità ferie
  cancelBtn.addEventListener('click', exitHolidayMode);
}

function enterHolidayMode() {
  holidayMode = true;
  selectedHolidaySlots = [];

  document.getElementById('holiday-mode-toggle').classList.add('active');
  document.getElementById('holiday-mode-indicator').classList.remove('hidden');
  document.querySelector('.admin-calendar').classList.add('holiday-mode');

  renderCalendar();
}

function exitHolidayMode() {
  holidayMode = false;
  selectedHolidaySlots = [];

  document.getElementById('holiday-mode-toggle').classList.remove('active');
  document.getElementById('holiday-mode-indicator').classList.add('hidden');
  document.querySelector('.admin-calendar').classList.remove('holiday-mode');

  renderCalendar();
}

function toggleHolidaySelection(date, time, isCurrentlyHoliday) {
  const slotIndex = selectedHolidaySlots.findIndex(s => s.giorno === date && s.ora === time);

  if (slotIndex >= 0) {
    // Rimuovi dalla selezione
    selectedHolidaySlots.splice(slotIndex, 1);
  } else {
    // Aggiungi alla selezione (con flag per indicare se è da rimuovere o aggiungere)
    selectedHolidaySlots.push({ giorno: date, ora: time, isRemove: isCurrentlyHoliday });
  }

  renderCalendar();
}

async function saveHolidays() {
  if (selectedHolidaySlots.length === 0) {
    exitHolidayMode();
    return;
  }

  const saveBtn = document.getElementById('save-holidays-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvataggio...';

  try {
    // Separa slot da aggiungere e da rimuovere
    const toAdd = selectedHolidaySlots.filter(s => !s.isRemove).map(s => ({ giorno: s.giorno, ora: s.ora }));
    const toRemove = selectedHolidaySlots.filter(s => s.isRemove).map(s => ({ giorno: s.giorno, ora: s.ora }));

    // Aggiungi nuove ferie
    if (toAdd.length > 0) {
      await apiRequest('/admin/holidays', {
        method: 'POST',
        body: JSON.stringify({ slots: toAdd })
      });
    }

    // Rimuovi ferie esistenti
    if (toRemove.length > 0) {
      await apiRequest('/admin/holidays', {
        method: 'DELETE',
        body: JSON.stringify({ slots: toRemove })
      });
    }

    // Ricarica ferie e esci dalla modalità
    await loadHolidays();
    exitHolidayMode();

  } catch (error) {
    console.error('Errore salvataggio ferie:', error);
    alert('Errore nel salvataggio delle ferie: ' + error.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Salva Ferie';
  }
}

// ==================== DRAG-SELECT FERIE ====================

function startDrag(date, time, isHoliday) {
  isDragging = true;
  dragStartCell = { date, time };

  // Determina la modalità: se clicco su ferie esistente -> rimuovo, altrimenti -> aggiungo
  dragMode = isHoliday ? 'remove' : 'add';

  // Aggiungi la prima cella alla selezione
  addToDragSelection(date, time, isHoliday);
}

function addToDragSelection(date, time, isHoliday) {
  // Verifica se lo slot è già selezionato
  const alreadySelected = selectedHolidaySlots.some(s => s.giorno === date && s.ora === time);

  if (!alreadySelected) {
    // In base alla modalità drag, aggiungi o rimuovi
    if (dragMode === 'add' && !isHoliday) {
      // Aggiungi nuova ferie
      selectedHolidaySlots.push({ giorno: date, ora: time, isRemove: false });
      updateCellVisual(date, time, true);
    } else if (dragMode === 'remove' && isHoliday) {
      // Rimuovi ferie esistente
      selectedHolidaySlots.push({ giorno: date, ora: time, isRemove: true });
      updateCellVisual(date, time, true);
    }
  }
}

function endDrag() {
  isDragging = false;
  dragStartCell = null;
  dragMode = null;
}

function updateCellVisual(date, time, isSelected) {
  // Trova la cella nel DOM e aggiorna visualmente
  const cells = document.querySelectorAll('.admin-cell');
  cells.forEach(cell => {
    if (cell.dataset.date === date && cell.dataset.time === time) {
      if (isSelected) {
        cell.classList.add('holiday-selected');
        cell.innerHTML = '<div class="no-booking">Selezionato</div>';
      }
    }
  });
}

// Event listener globale per mouseup (fine drag)
document.addEventListener('mouseup', () => {
  if (isDragging) {
    endDrag();
  }
});

// Previeni selezione testo durante il drag
document.addEventListener('selectstart', (e) => {
  if (isDragging) {
    e.preventDefault();
  }
});

// Avvia inizializzazione
init();
