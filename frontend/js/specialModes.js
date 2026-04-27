import { STATE, getTimeSlotsForDate, getMonday, formatDate, formatDateDisplay, formatDateStringDisplay, timeSlotsWeekday, timeSlotsSaturday, allTimeSlots, workDays } from './state.js';

import { loadHolidays, loadBookings } from './api.js';
import { renderCalendar, findHoliday } from './calendar.js';

const apiRequest = window.apiRequest;
const Modal = window.Modal;




export function setupHolidayMode() {
  const holidayToggle = document.getElementById('holiday-mode-toggle');
  const holidayIndicator = document.getElementById('holiday-mode-indicator');
  const saveBtn = document.getElementById('save-holidays-btn');
  const cancelBtn = document.getElementById('cancel-holidays-btn');
  const calendarContainer = document.querySelector('.admin-calendar');

  // Toggle modalità ferie
  holidayToggle.addEventListener('click', () => {
    if (!STATE.holidayMode && !STATE.extraWorkMode) {
      enterHolidayMode();
    }
  });

  // Salva ferie
  saveBtn.addEventListener('click', saveHolidays);

  // Annulla modalità ferie
  cancelBtn.addEventListener('click', exitHolidayMode);

  // Previeni selezione testo durante il drag (sia mouse che touch)
  document.addEventListener('selectstart', (e) => {
    if (STATE.isDragging) e.preventDefault();
  });
}

export function enterHolidayMode() {
  STATE.holidayMode = true;
  STATE.selectedHolidaySlots = [];

  document.getElementById('holiday-mode-toggle').classList.add('active');
  document.getElementById('holiday-mode-indicator').classList.remove('hidden');
  document.querySelector('.admin-calendar').classList.add('holiday-mode');

  renderCalendar();
  setupHolidayTouch(); // monta i listener touch sul grid (idempotente)
  setupHolidayMouse(); // monta i listener mouse sul grid (idempotente)
}

export function exitHolidayMode() {
    STATE.holidayMode = false;
    STATE.selectedHolidaySlots = [];

    document.getElementById('holiday-mode-toggle').classList.remove('active');
    document.getElementById('holiday-mode-indicator').classList.add('hidden');
    document.querySelector('.admin-calendar').classList.remove('holiday-mode');

    renderCalendar();
  }

  export function toggleHolidaySelection(date, time, isCurrentlyHoliday) {
    const slotIndex = STATE.selectedHolidaySlots.findIndex(s => s.giorno === date && s.ora === time);

    if (slotIndex >= 0) {
      // Rimuovi dalla selezione
      STATE.selectedHolidaySlots.splice(slotIndex, 1);
    } else {
      // Aggiungi alla selezione (con flag per indicare se è da rimuovere o aggiungere)
      STATE.selectedHolidaySlots.push({ giorno: date, ora: time, isRemove: isCurrentlyHoliday });
    }

    renderCalendar();
  }
  
   export async function saveHolidays() {
  if (STATE.selectedHolidaySlots.length === 0) {
    exitHolidayMode();
    return;
  }

  const saveBtn = document.getElementById('save-holidays-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvataggio...';

  try {
    // Separa slot da aggiungere e da rimuovere
    const toAdd = STATE.selectedHolidaySlots.filter(s => !s.isRemove).map(s => ({ giorno: s.giorno, ora: s.ora }));
    const toRemove = STATE.selectedHolidaySlots.filter(s => s.isRemove).map(s => ({ giorno: s.giorno, ora: s.ora }));

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

export function startDrag(date, time, isHoliday, isDoubleTap = false) {
    STATE.isDragging = true;
    STATE.dragStartCell = { date, time };

    if (STATE.extraWorkMode) {
      const isAlreadySelected = STATE.selectedExtraWorkSlots.some(s => s.giorno === date && s.ora === time);
      // Se è un double tap da touch, Tap #1 ha già invertito lo stato. 
      // Quindi la direzione corretta del drag è proprio lo stato attuale!
      STATE.dragMode = isDoubleTap ? (isAlreadySelected ? 'add' : 'remove') : (isAlreadySelected ? 'remove' : 'add');
      addToDragSelection(date, time, isHoliday);
      return;
    }
    
    // Per le ferie stessa logica
    STATE.dragMode = isDoubleTap ? (isHoliday ? 'add' : 'remove') : (isHoliday ? 'remove' : 'add');

  // Aggiungi la prima cella alla selezione
  addToDragSelection(date, time, isHoliday);
}

export function addToDragSelection(date, time, isHoliday) {
  if (STATE.extraWorkMode) {
    if (isHoliday) return;
    
    if (STATE.dragMode === 'add') {
      const oreSelezionate = STATE.selectedExtraWorkSlots.length * 0.25;
      if (oreSelezionate >= STATE.extraWorkHoursTotal) {
        return; // Raggiunto il limite
      }
      if (!STATE.selectedExtraWorkSlots.some(s => s.giorno === date && s.ora === time)) {
        STATE.selectedExtraWorkSlots.push({ giorno: date, ora: time });
        updateExtraWorkHoursLeft();
        updateCellVisual(date, time, true, false);
      }
    } else if (STATE.dragMode === 'remove') {
      const idx = STATE.selectedExtraWorkSlots.findIndex(s => s.giorno === date && s.ora === time);
      if (idx !== -1) {
        STATE.selectedExtraWorkSlots.splice(idx, 1);
        updateExtraWorkHoursLeft();
        updateCellVisual(date, time, false, false);
      }
    }
    
    // Feedback visuale al termine/rimozione
    if (STATE.selectedExtraWorkSlots.length * 0.25 >= STATE.extraWorkHoursTotal) {
      document.getElementById('extrawork-hours-left').style.color = 'green';
      document.getElementById('extrawork-mode-indicator').style.borderColor = 'green';
    } else {
      document.getElementById('extrawork-hours-left').style.color = '';
      document.getElementById('extrawork-mode-indicator').style.borderColor = '#ff9999';
    }
    return;
  }
  const alreadySelected = STATE.selectedHolidaySlots.some(s => s.giorno === date && s.ora === time);

  if (!alreadySelected) {
    // In base alla modalità drag, aggiungi o rimuovi
    if (STATE.dragMode === 'add' && !isHoliday) {
      // Aggiungi nuova ferie
      STATE.selectedHolidaySlots.push({ giorno: date, ora: time, isRemove: false });
      updateCellVisual(date, time, true, false);
    } else if (STATE.dragMode === 'remove' && isHoliday) {
      // Rimuovi ferie esistente
      STATE.selectedHolidaySlots.push({ giorno: date, ora: time, isRemove: true });
      updateCellVisual(date, time, true, true);
    }
  }
}

export function endDrag() {
  STATE.isDragging = false;
  STATE.dragStartCell = null;
  STATE.dragMode = null;
}

export function updateCellVisual(date, time, isSelected, isRemove = false) {
  const cell = document.querySelector(`.admin-cell[data-date="${date}"][data-time="${time}"]`);
  if (!cell) return;

  if (STATE.extraWorkMode) {
    // Modalità lavoro straordinario
    if (isSelected) {
      cell.classList.add('is-extrawork-draft');
      cell.innerHTML = '<div class="no-booking text-sm">🔧 Lavoro</div>';
    } else {
      cell.classList.remove('is-extrawork-draft');
      cell.innerHTML = '<div class="no-booking">+ Lavoro</div>';
    }
    return;
  }

  // Modalità ferie (originale)
  if (isSelected) {
    if (isRemove) {
      cell.classList.remove('is-holiday');
      cell.classList.add('holiday-remove-selected');
      cell.innerHTML = '<div class="no-booking text-sm">✕ rimosso</div>';
    } else {
      cell.classList.add('holiday-selected');
      cell.innerHTML = '<div class="no-booking text-sm text-secondary">ferie</div>';
    }
  } else {
    cell.classList.remove('holiday-selected', 'holiday-remove-selected');
    if (findHoliday(date, time)) {
      cell.classList.add('is-holiday');
      cell.innerHTML = '<div class="holiday-label">FERIE (rimuovi)</div>';
    } else {
      cell.innerHTML = '<div class="no-booking">+ Ferie</div>';
    }
  }
}

// ─── Holiday drag-scroll — costanti e formula proporzionale ─────────────────
// Formula iOS-gallery: la posizione del dito/cursore nel container determina
// la velocità di scroll proporzionale (non solo edge-zone fissi).

const HOL_MAX_SCROLL  = 12;   // px per frame (a 60fps ≈ 720px/s max)
const HOL_DEAD_FACTOR = 0.25; // 25% dead zone intorno al centro (±12.5%)

/**
 * Calcola il fattore di scroll (-1.0..+1.0) in base alla posizione verticale
 * del dito/cursore all'interno del container .admin-calendar.
 *   relY ≈ 0.0 → bordo superiore → fattore ≈ -1.0 (scroll up max)
 *   relY = 0.5 → centro          → fattore =  0.0 (dead zone, nessuno scroll)
 *   relY ≈ 1.0 → bordo inferiore → fattore ≈ +1.0 (scroll down max)
 * Dito oltre il bordo del container: clamped a ±1.0.
 */
function _holComputeScrollFactor(clientY, calRect) {
  if (!calRect || calRect.height === 0) return 0;
  const relY     = (clientY - calRect.top) / calRect.height; // 0..1 (extra: <0 o >1)
  const dist     = relY - 0.5;                                // -0.5..+0.5
  const halfDead = HOL_DEAD_FACTOR / 2;                       // ±12.5%
  if (Math.abs(dist) <= halfDead) return 0;                   // dead zone
  const sign      = dist > 0 ? 1 : -1;
  const effective = (Math.abs(dist) - halfDead) / (0.5 - halfDead); // 0..1
  return sign * Math.min(effective, 1);                       // clamped ±1.0
}

// ─── TOUCH (mobile — primary) ── holiday drag-select ─────────────────────────
// Gestore primario: touch events. Scroll proporzionale via _holComputeScrollFactor().
// RAF avviato al touchstart e fermato al touchend — legge _holScrollFactor ogni frame.

let _holScrollRaf    = null;
let _holScrollFactor = 0;    // float -1.0..+1.0 (velocità+dir scroll touch)
let _holLastTouch    = null;

function _holSelectAt(clientX, clientY) {
  const el   = document.elementFromPoint(clientX, clientY);
  const cell = el && el.closest('.admin-cell');
  if (cell && !cell.classList.contains('has-booking') && cell.dataset.date && cell.dataset.time) {
    addToDragSelection(cell.dataset.date, cell.dataset.time, !!findHoliday(cell.dataset.date, cell.dataset.time));
  }
}

function _holScrollTick() {
  if (!STATE.isDragging || (!STATE.holidayMode && !STATE.extraWorkMode)) { _holScrollRaf = null; return; }
  const cal = document.querySelector('.admin-calendar');
  if (cal && _holScrollFactor !== 0) {
    cal.scrollTop += _holScrollFactor * HOL_MAX_SCROLL;
    if (_holLastTouch) _holSelectAt(_holLastTouch.clientX, _holLastTouch.clientY);
  }
  _holScrollRaf = requestAnimationFrame(_holScrollTick);
}

function _holStopScroll() {
  _holScrollFactor = 0;
  if (_holScrollRaf) { cancelAnimationFrame(_holScrollRaf); _holScrollRaf = null; }
}

// Handler touchmove — aggiunto a window solo per la durata del drag
function _holOnWindowTouchMove(e) {
  if (!STATE.isDragging || (!STATE.holidayMode && !STATE.extraWorkMode)) return;
  e.preventDefault(); // blocca scroll pagina (touch-action: none sul container fa lo stesso)
  const t = e.touches[0];
  _holLastTouch = t;
  _holSelectAt(t.clientX, t.clientY);

  // Aggiorna fattore proporzionale — il RAF già in esecuzione lo applicherà al prossimo frame
  const cal = document.querySelector('.admin-calendar');
  if (!cal) return;
  _holScrollFactor = _holComputeScrollFactor(t.clientY, cal.getBoundingClientRect());
}

function _holEndDrag() {
  _holStopScroll();
  _holLastTouch = null;

  // Ripristina touchAction
  const container = document.querySelector('.container') || document.querySelector('.admin-calendar');
  if (container) container.style.touchAction = '';

  // Rimuovi tutti e tre i listener dinamici — pattern speculare a _holMouseEndDrag()
  window.removeEventListener('touchmove',   _holOnWindowTouchMove);
  window.removeEventListener('touchend',    _holEndDrag);
  window.removeEventListener('touchcancel', _holEndDrag);
  if (STATE.isDragging) {
    endDrag();
    document.querySelector('.admin-calendar')?.classList.remove('is-holiday-dragging');
  }
}

// Un solo touchstart sul grid, montato una volta (idempotente via _holReady).
// touchmove, touchend e touchcancel aggiunti a window DINAMICAMENTE solo durante il drag
// — speculare a setupHolidayMouse() — così il rilascio del dito è intercettato anche
// quando il dito è uscito dal grid (es. durante auto-scroll del container).
let _holLastTapTime = 0;
  let _holLastTapTargetId = null;

  function setupHolidayTouch() {
    const grid = document.getElementById('admin-calendar-grid');
    if (!grid || grid._holReady) return;
    grid._holReady = true;

    grid.addEventListener('touchstart', (e) => {
      if (!STATE.holidayMode && !STATE.extraWorkMode) return;
      const cell = e.target.closest('.admin-cell');
      if (!cell || cell.classList.contains('has-booking') || !cell.dataset.date || !cell.dataset.time) return;

      // Avvia immediatamente il drag al primo tocco, esattamene come il mousedown
      e.preventDefault();
      
      // Blocca scroll/pull-to-refresh aggiungendo touchAction al container parent
      const container = document.querySelector('.container') || document.querySelector('.admin-calendar');
      if (container) container.style.touchAction = 'none';

      // Feedback aptico immediato
      if (navigator.vibrate) navigator.vibrate(30);

      // Avvia RAF loop
      _holScrollFactor = 0;
      if (!_holScrollRaf) _holScrollRaf = requestAnimationFrame(_holScrollTick);

      window.addEventListener('touchmove',   _holOnWindowTouchMove, { passive: false });
      window.addEventListener('touchend',    _holEndDrag);
      window.addEventListener('touchcancel', _holEndDrag);

      startDragWithFeedback(cell.dataset.date, cell.dataset.time, !!findHoliday(cell.dataset.date, cell.dataset.time));
    }, { passive: false });
    // touchend/touchcancel NON più sul grid — gestiti via window listener dinamici
  }

  // Feedback visivo: aggiunge classe al calendario durante il drag
  function startDragWithFeedback(date, time, isHoliday, isDoubleTap = false) {
    startDrag(date, time, isHoliday, isDoubleTap);
    document.querySelector('.admin-calendar')?.classList.add('is-holiday-dragging');
  }

let _holMouseLastPos     = null;  // ultima posizione cursore { x, y }
let _holMouseScrollRaf   = null;  // handle RAF auto-scroll mouse
let _holMouseScrollFactor = 0;    // float -1.0..+1.0 (velocità+dir scroll mouse)

function _holMouseSelectAt(clientX, clientY) {
  const el   = document.elementFromPoint(clientX, clientY);
  const cell = el && el.closest('.admin-cell');
  if (cell && !cell.classList.contains('has-booking') && cell.dataset.date && cell.dataset.time) {
    addToDragSelection(cell.dataset.date, cell.dataset.time, !!findHoliday(cell.dataset.date, cell.dataset.time));
  }
}

function _holMouseScrollTick() {
  if (!STATE.isDragging || (!STATE.holidayMode && !STATE.extraWorkMode)) { _holMouseScrollRaf = null; return; }
  const cal = document.querySelector('.admin-calendar');
  if (cal && _holMouseScrollFactor !== 0) {
    cal.scrollTop += _holMouseScrollFactor * HOL_MAX_SCROLL;
    if (_holMouseLastPos) _holMouseSelectAt(_holMouseLastPos.x, _holMouseLastPos.y);
  }
  _holMouseScrollRaf = requestAnimationFrame(_holMouseScrollTick);
}

function _holMouseStopScroll() {
  _holMouseScrollFactor = 0;
  if (_holMouseScrollRaf) { cancelAnimationFrame(_holMouseScrollRaf); _holMouseScrollRaf = null; }
}

// Handler mousemove — aggiunto a window solo per la durata del drag
function _holOnWindowMouseMove(e) {
  if (!STATE.isDragging || (!STATE.holidayMode && !STATE.extraWorkMode)) return;
  _holMouseLastPos = { x: e.clientX, y: e.clientY };
  _holMouseSelectAt(e.clientX, e.clientY);

  // Aggiorna fattore proporzionale — il RAF già in esecuzione lo applicherà al prossimo frame
  const cal = document.querySelector('.admin-calendar');
  if (!cal) return;
  _holMouseScrollFactor = _holComputeScrollFactor(e.clientY, cal.getBoundingClientRect());
}

function _holMouseEndDrag() {
  _holMouseStopScroll();
  _holMouseLastPos = null;
  // Rimuovi i listener window immediatamente — pattern identico al touch
  window.removeEventListener('mousemove', _holOnWindowMouseMove);
  window.removeEventListener('mouseup',   _holMouseEndDrag);
  if (STATE.isDragging) {
    endDrag();
    document.querySelector('.admin-calendar')?.classList.remove('is-holiday-dragging');
  }
}

// Registrato una sola volta sul grid (idempotente grazie a _holMouseReady)
function setupHolidayMouse() {
  const grid = document.getElementById('admin-calendar-grid');
  if (!grid || grid._holMouseReady) return;
  grid._holMouseReady = true;

  grid.addEventListener('mousedown', (e) => {
    if (!STATE.holidayMode && !STATE.extraWorkMode) return;
    const cell = e.target.closest('.admin-cell');
    if (!cell || cell.classList.contains('has-booking')) return;
    e.preventDefault(); // blocca selezione testo e comportamenti default
    // Avvia RAF loop per tutta la durata del drag (fermato in _holMouseEndDrag)
    _holMouseScrollFactor = 0;
    if (!_holMouseScrollRaf) _holMouseScrollRaf = requestAnimationFrame(_holMouseScrollTick);
    // Aggiungi mousemove/mouseup a window ORA — verranno rimossi in _holMouseEndDrag
    window.addEventListener('mousemove', _holOnWindowMouseMove);
    window.addEventListener('mouseup',   _holMouseEndDrag);
    startDragWithFeedback(cell.dataset.date, cell.dataset.time, !!findHoliday(cell.dataset.date, cell.dataset.time));
  });
}

// ==================== GESTIONE EXTRA WORK ====================

export function enterExtraWorkMode(depositId, hours) {
  STATE.extraWorkMode = true;
  STATE.currentAssignDepositId = depositId;
  STATE.extraWorkHoursTotal = hours;
  STATE.selectedExtraWorkSlots = [];

  // Mostra indicator/banner
  const indicator = document.getElementById('extrawork-mode-indicator');
  if (indicator) {
    indicator.classList.remove('hidden');
  }
  updateExtraWorkHoursLeft();

  // Aggiungi classe per styling puntatore
  const calendarEl = document.querySelector('.admin-calendar');
  if (calendarEl) calendarEl.classList.add('extrawork-mode');

  // Inizializza i gestori drag mouse/touch
  setupHolidayTouch();
  setupHolidayMouse();

  // Wiring pulsanti salva/annulla
  const saveBtn = document.getElementById('save-extrawork-btn');
  const cancelBtn = document.getElementById('cancel-extrawork-btn');
  if (saveBtn) saveBtn.onclick = saveExtraWork;
  if (cancelBtn) cancelBtn.onclick = cancelExtraWork;

  // Re-render per mostrare le celle in modalità extra work
  renderCalendar();

  // Rimuovi parametri dall'URL senza ricaricare
  window.history.replaceState({}, '', '/admin.html');
}

export function updateExtraWorkHoursLeft() {
  const hoursLeftEl = document.getElementById('extrawork-hours-left');
  if (hoursLeftEl) {
    const oreSelezionate = STATE.selectedExtraWorkSlots.length * 0.25; // 15 minuti = 0.25 ore
    const rimanenti = Math.max(0, STATE.extraWorkHoursTotal - oreSelezionate);
    hoursLeftEl.textContent = rimanenti.toFixed(2);
  }
}

export async function saveExtraWork() {
  if (STATE.selectedExtraWorkSlots.length === 0) {
    alert("Seleziona almeno uno slot (trascina sulle celle vuote).");
    return;
  }
  try {
    const response = await apiRequest('/admin/deposits/' + STATE.currentAssignDepositId + '/schedule', {
      method: 'POST',
      body: JSON.stringify({ slots: STATE.selectedExtraWorkSlots })
    });
    if (response.success) {
      alert("Lavoro straordinario programmato con successo.");
      exitExtraWorkMode();
      loadBookings().then(renderCalendar);
    } else {
      alert("Errore durante il salvataggio: " + (response.error || 'Errore sconosciuto'));
    }
  } catch (err) {
    console.error(err);
    alert("Errore durante la comunicazione col server.");
  }
}

export function cancelExtraWork() {
  if (STATE.selectedExtraWorkSlots.length > 0) {
    // Azzera selezioni per poter ripartire
    STATE.selectedExtraWorkSlots = [];
    updateExtraWorkHoursLeft();
    renderCalendar(); // Ricarica la griglia per spazzar via le celle "in attesa"
  } else {
    // Se non ha selezionato niente, esce dalla modalità rimbalzando ai depositi
    exitExtraWorkMode();
    window.location.href = '/admin-depositi.html'; // Invia di nuovo alla sezione da cui si regola l'orario
  }
}

export function exitExtraWorkMode() {
  STATE.extraWorkMode = false;
  STATE.currentAssignDepositId = null;
  STATE.extraWorkHoursTotal = 0;
  STATE.selectedExtraWorkSlots = [];

  const indicator = document.getElementById('extrawork-mode-indicator');
  if (indicator) {
    indicator.classList.add('hidden');
    indicator.style.borderColor = ''; // Resetta eventuale verde
  }
  const hoursLeftEl = document.getElementById('extrawork-hours-left');
  if (hoursLeftEl) {
    hoursLeftEl.style.color = ''; // Resetta eventuale verde
  }

  // Rimuovi classe puntatore extra work
  const calendarEl = document.querySelector('.admin-calendar');
  if (calendarEl) calendarEl.classList.remove('extrawork-mode');

  // Triggera un renderCalendar() pulito per azzerare tutta la griglia fittizia
  renderCalendar();
}
