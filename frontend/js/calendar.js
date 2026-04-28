import { STATE, getTimeSlotsForDate, getMonday, formatDate, formatDateDisplay, formatDateStringDisplay, workDays, allTimeSlots } from './state.js';

import { openBookingModal, showDetailModal } from './modal.js';
import { startBookingDrag, dropBooking } from './dragDrop.js';
import { toggleHolidaySelection, addToDragSelection } from './specialModes.js';

const apiRequest = window.apiRequest;
const Modal = window.Modal;




// Render calendario settimanale
export function renderCalendar() {
  const grid = document.getElementById('admin-calendar-grid');

  // Rimuovi righe precedenti (mantieni solo header)
  const existingRows = grid.querySelectorAll('.admin-time-header, .admin-cell');
  existingRows.forEach(row => row.remove());

  // Calcola le date della settimana (Lun-Sab)
  const weekDates = [];
  for (let i = 0; i <= 5; i++) { // 0=Lun, 1=Mar, 2=Mer, 3=Gio, 4=Ven, 5=Sab
    const date = new Date(STATE.currentWeekStart);
    date.setDate(date.getDate() + i);
    weekDates.push(date);
  }

  // Aggiorna header con date
  weekDates.forEach((date, index) => {
    const header = document.getElementById(`day-header-${index}`);
    header.innerHTML = `${workDays[index]}<br>${formatDateDisplay(date)}`;
  });

  // Pre-calcola le celle "continuazione" da saltare:
  // per ogni booking con durata > 15 min, segna gli slot successivi come skip.
  const skipCells = new Map(); // Map<dateStr, Set<timeStr>>
  weekDates.forEach(d => skipCells.set(formatDate(d), new Set()));
  STATE.allBookings.forEach(function (booking) {
    const dur = parseInt(booking.durata_minuti) || 60;
    const slotsCount = Math.ceil(dur / 15);
    if (slotsCount <= 1) return;
    const skipSet = skipCells.get(booking.giorno);
    if (!skipSet) return;
    const startIdx = allTimeSlots.indexOf(booking.ora);
    if (startIdx < 0) return;
    for (let i = 1; i < slotsCount; i++) {
        let [h, m] = booking.ora.split(":").map(Number);
        let totalMins = h * 60 + m + (i * 15);
        let nextH = Math.floor(totalMins / 60);
        let nextM = totalMins % 60;
        let nextTimeStr = String(nextH).padStart(2, "0") + ":" + String(nextM).padStart(2, "0");
        skipSet.add(nextTimeStr);
      }
  });

  let rowIndex = 2; // riga 1 = header statico nell'HTML

  allTimeSlots.forEach(time => {
    // Cella orario — posizionamento esplicito colonna 1
    const timeCell = document.createElement('div');
    timeCell.className = 'admin-time-header';
    timeCell.textContent = time;
    timeCell.style.gridColumn = '1';
    timeCell.style.gridRow = String(rowIndex);
    grid.appendChild(timeCell);

    // Celle per ogni giorno
    weekDates.forEach((date, dayIdx) => {
      const dateStr = formatDate(date);

      // Salta le celle di continuazione coperte da un booking multi-slot
      if (skipCells.get(dateStr) && skipCells.get(dateStr).has(time)) return;

      const cell = document.createElement('div');
      cell.className = 'admin-cell';

      const daySlots = getTimeSlotsForDate(date);
      const isValidSlot = daySlots.includes(time);
      const booking = findBooking(dateStr, time);
      const isHoliday = findHoliday(dateStr, time);
      const isSelectedForHoliday = STATE.selectedHolidaySlots.some(s => s.giorno === dateStr && s.ora === time);

      // Posizionamento esplicito nella CSS Grid
      cell.style.gridColumn = String(dayIdx + 2);
      cell.style.gridRow = String(rowIndex);

      // Se è un booking multi-slot, applica lo span sulle righe
      if (booking) {
        const slotsCount = Math.max(1, Math.ceil((parseInt(booking.durata_minuti) || 60) / 15));
        if (slotsCount > 1) cell.style.gridRow = `${rowIndex} / span ${slotsCount}`;
      }

      // Slot dati
      cell.dataset.date = dateStr;
      cell.dataset.time = time;

      // Se lo slot non è valido per questo giorno (es. domenica, sabato pomeriggio)
      if (!isValidSlot && !booking) {
          cell.classList.add('invalid-slot');
          cell.innerHTML = '<div class="no-booking">�</div>';
          grid.appendChild(cell);
          return;
        }

      if (STATE.holidayMode) {
        // ===== MODALITÀ FERIE =====
        if (isSelectedForHoliday) {
          cell.classList.add('holiday-selected');
          cell.innerHTML = '<div class="no-booking">Selezionato</div>';
        } else if (isHoliday) {
          cell.classList.add('is-holiday');
          cell.innerHTML = '<div class="holiday-label">FERIE (rimuovi)</div>';
        } else if (booking) {
          cell.classList.add('has-booking');
          if (isConsegnaBooking(booking)) cell.classList.add('has-booking-deposito');
          cell.innerHTML = renderBookingItem(booking, time);
        } else {
          cell.innerHTML = '<div class="no-booking">+ Ferie</div>';
        }
      } else if (STATE.extraWorkMode) {
        // ===== MODALITÀ LAVORO STRAORDINARIO =====
        const isSelectedForExtraWork = STATE.selectedExtraWorkSlots.some(s => s.giorno === dateStr && s.ora === time);
        if (isSelectedForExtraWork) {
          cell.classList.add('is-extrawork-draft');
          cell.innerHTML = '<div class="no-booking">🔧 Lavoro</div>';
        } else if (isHoliday) {
          cell.classList.add('is-holiday');
          cell.innerHTML = '<div class="holiday-label">FERIE</div>';
        } else if (booking) {
          cell.classList.add('has-booking');
          if (isConsegnaBooking(booking)) cell.classList.add('has-booking-deposito');
          cell.innerHTML = renderBookingItem(booking, time);
        } else {
          cell.innerHTML = '<div class="no-booking">+ Lavoro</div>';
        }

        // Solo celle senza prenotazione e senza ferie possono essere selezionate
      } else if (isHoliday) {
        // ===== MODALITÀ NORMALE - FERIE =====
        cell.classList.add('is-holiday');
        cell.innerHTML = '<div class="holiday-label">FERIE</div>';
      } else if (booking) {
        cell.classList.add('has-booking');
        if (isConsegnaBooking(booking)) cell.classList.add('has-booking-deposito');
        cell.innerHTML = renderBookingItem(booking, time);

        // Drag-and-drop: inizia drag su mousedown sulla prenotazione
        cell.addEventListener('mousedown', (e) => {
          if (STATE.holidayMode) return;
          e.preventDefault();
          startBookingDrag(booking, e);
        });

        // Drag-and-drop: supporto TOUCH (Long Press)
        cell.addEventListener('touchstart', (e) => {
          if (STATE.holidayMode) return;
          if (e.touches.length !== 1) return;

          STATE.touchStartX = e.touches[0].clientX;
          STATE.touchStartY = e.touches[0].clientY;

          // Avvia timer per long press (500ms)
          STATE.longPressTimer = setTimeout(() => {
            e.preventDefault();
            startBookingDrag(booking, e.touches[0]);

            // Feedback vibratile se supportato
            if (navigator.vibrate) navigator.vibrate(50);
          }, 500);
        }, { passive: false });

        cell.addEventListener('touchmove', (e) => {
          // Se ci si muove troppo prima del long press, annulla
          if (STATE.longPressTimer && !STATE.isDraggingBooking) {
            const moveX = e.touches[0].clientX;
            const moveY = e.touches[0].clientY;
            if (Math.abs(moveX - STATE.touchStartX) > 10 || Math.abs(moveY - STATE.touchStartY) > 10) {
              clearTimeout(STATE.longPressTimer);
              STATE.longPressTimer = null;
            }
          }
        }, { passive: false });

        cell.addEventListener('touchend', () => {
          if (STATE.longPressTimer) {
            clearTimeout(STATE.longPressTimer);
            STATE.longPressTimer = null;
          }
        });

        cell.addEventListener('touchcancel', () => {
          if (STATE.longPressTimer) {
            clearTimeout(STATE.longPressTimer);
            STATE.longPressTimer = null;
          }
        });

        // Click su cella con prenotazione -> mostra dettagli (solo se non era drag)
        cell.addEventListener('click', (e) => {
          if (STATE.isDraggingBooking) return;
          e.stopPropagation();
          showDetailModal(booking);
        });
      } else {
        // ===== CELLA VUOTA - MODALITÀ NORMALE =====
        cell.innerHTML = '<div class="no-booking">+ Aggiungi</div>';
        cell.classList.add('droppable');

        // Drop target: evidenzia durante drag
        cell.addEventListener('mouseenter', () => {
          if (STATE.isDraggingBooking) {
            cell.classList.add('drop-target');
          }
        });

        cell.addEventListener('mouseleave', () => {
          cell.classList.remove('drop-target');
        });

        // Drop: rilascia prenotazione
        cell.addEventListener('mouseup', () => {
          if (STATE.isDraggingBooking && STATE.draggedBooking) {
            dropBooking(dateStr, time);
          }
        });

        cell.addEventListener('click', () => {
          if (STATE.isDraggingBooking) return;
          if (STATE.holidayMode || STATE.extraWorkMode) {
            const isH = !!findHoliday(dateStr, time);
            if (STATE.extraWorkMode) {
              STATE.dragMode = STATE.selectedExtraWorkSlots.some(s => s.giorno === dateStr && s.ora === time) ? 'remove' : 'add';
              addToDragSelection(dateStr, time, isH);
            } else {
              toggleHolidaySelection(dateStr, time, isH);
            }
            return;
          }
          openBookingModal(dateStr, time);
        });
      }

      grid.appendChild(cell);
    });

    rowIndex++; // avanza alla riga successiva del CSS Grid
  });
}

// Trova ferie per data e ora
export function findHoliday(date, time) {
  return STATE.allHolidays.find(h => h.giorno === date && h.ora === time);
}

// Trova prenotazione per data e ora
export function findBooking(date, time) {
  return STATE.allBookings.find(b => b.giorno === date && b.ora === time);
}

// Helper condiviso: true se la prenotazione è di tipo consegna/lavoro speciale
export function isConsegnaBooking(booking) {
  if (booking.tipo === 'deposito') return true;
  const svc = STATE.allServices.find(function(s) {
    if (booking.service_id && String(booking.service_id) !== '') {
      return String(s.id) === String(booking.service_id);
    }
    return booking.servizio && s.nome === booking.servizio;
  });
  return !!(svc && (svc.tipo_servizio === 'consegna' ||
    (svc.nome || '').toLowerCase().includes('consegna')));
}

// Render singolo appuntamento (con colori per tipo)
export function renderBookingItem(booking, time) {
  const typeClass = isConsegnaBooking(booking) ? 'booking-deposito' : 'booking-cliente';

  // Risolvi nome servizio da STATE.allServices (prima da servizio testuale, poi da service_id)
  let serviceName = booking.servizio || '';
  if (!serviceName && booking.service_id) {
    const svc = STATE.allServices.find(s => String(s.id) === String(booking.service_id));
    if (svc) serviceName = svc.nome;
  }

  // Modifica per le caselle "Deposito" (Consegna)
  let durataStr = booking.durata_minuti ? booking.durata_minuti + ' min' : '';
  if (isConsegnaBooking(booking)) {
    const depNota = booking.nota_interna || 'Lavoro Straordinario';
    if (booking.servizio === 'Prenotazione' || serviceName === 'Prenotazione' || !serviceName) {
      serviceName = depNota;
    } else {
      if (booking.nota_interna) serviceName = booking.nota_interna;
    }
    const depOre = Number(booking.ore_stimate) > 0 ? booking.ore_stimate + 'h' : '';
    if (depOre) {
      durataStr = depOre; // Sovrascriviamo la durata "30 min" generica
    }
  }

  const targaStr = booking.targa ? ' · ' + booking.targa : '';

  // Se c'è solo la targa (senza servizio), mostrarla comunque come riga separata
  const serviceRow = serviceName
    ? `<div class="service">${serviceName}${targaStr}</div>`
    : (booking.targa ? `<div class="service">${booking.targa}</div>` : '');

  return `
    <div class="booking-item ${typeClass}" data-giorno="${booking.giorno}" data-ora="${booking.ora}">
      <div class="name">${booking.nome || '—'} ${booking.cognome || ''}</div>
      ${serviceRow}
      ${durataStr ? `<div class="duration">${durataStr}</div>` : ''}
      <div class="contact">${booking.email || ''}</div>
    </div>
  `;
}


