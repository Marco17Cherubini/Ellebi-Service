import { loadBookings } from './api.js';
import { renderCalendar } from './calendar.js';

export function startBookingDrag(booking, event) {
  isDraggingBooking = true;
  draggedBooking = booking;

  // Crea elemento ghost che segue il mouse
  dragGhostElement = document.createElement('div');
  dragGhostElement.className = 'booking-drag-ghost';
  dragGhostElement.innerHTML = `
    <div class="name">${escapeHTML(booking.nome)} ${escapeHTML(booking.cognome)}</div>
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

export function updateGhostPosition(event) {
  if (dragGhostElement) {
    dragGhostElement.style.left = (event.clientX + 10) + 'px';
    dragGhostElement.style.top = (event.clientY + 10) + 'px';
  }
}

export function endBookingDrag(snapBack = false) {
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
export function isSlotAvailable(giorno, ora) {
  const hasBooking = allBookings.some(b => b.giorno === giorno && b.ora === ora);
  const hasHoliday = allHolidays.some(h => h.giorno === giorno && h.ora === ora);
  return !hasBooking && !hasHoliday;
}

// Mostra feedback visivo per drop non valido
export function showDropFeedback(message, isError = false) {
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

export async function dropBooking(newGiorno, newOra) {
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

export function setupDragAndDropListeners() {
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
}
