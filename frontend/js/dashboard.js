// ==================== Dashboard Wizard ====================
// Flusso: Veicolo → Servizio → Calendario → Riepilogo

let currentUser = null;
let selectedVehicleType = null;  // 'auto' | 'moto'
let selectedService = null;      // oggetto servizio completo
let selectedDate = null;
let selectedTime = null;
let currentMonth = new Date();
let daysOpen = [1, 2, 3, 4, 5, 6]; // Default, aggiornato da API

const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const calendarMonthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

// ==================== INIT ====================

async function init() {
  try {
    currentUser = await getCurrentUser();
    if (!currentUser) {
      redirectToLogin();
      return;
    }

    document.getElementById('welcome-message').textContent =
      'Bentornato, ' + currentUser.nome;

    // Carica giorni aperti dalla config
    try {
      var cfgRes = await apiRequest('/config/slots');
      if (cfgRes.success && cfgRes.daysOpen) {
        daysOpen = cfgRes.daysOpen;
      }
    } catch (e) { /* usa default */ }

    // Mostra Step 1 (vehicle)
    goToStep(1);

  } catch (error) {
    console.error('Errore inizializzazione:', error);
    redirectToLogin();
  }
}

// ==================== STEP NAVIGATION ====================

function goToStep(step) {
  // Nascondi tutte le sezioni
  document.querySelectorAll('.wizard-section').forEach(function (s) {
    s.classList.remove('active');
  });

  // Aggiorna breadcrumb
  for (var i = 1; i <= 4; i++) {
    var el = document.getElementById('bc-' + i);
    if (!el) continue;
    el.classList.remove('current', 'completed');
    if (i < step) el.classList.add('completed');
    else if (i === step) el.classList.add('current');
  }

  // Mostra sezione corretta
  var sectionId = ['step-vehicle', 'step-service', 'step-calendar', 'step-summary'][step - 1];
  var section = document.getElementById(sectionId);
  if (section) section.classList.add('active');

  // Popola dati nel riepilogo quando arriviamo a step 4
  if (step === 4) populateSummary();
}

// ==================== STEP 1: VEICOLO ====================

document.querySelectorAll('.vehicle-card').forEach(function (card) {
  card.addEventListener('click', function () {
    document.querySelectorAll('.vehicle-card').forEach(function (c) { c.classList.remove('selected'); });
    card.classList.add('selected');
    selectedVehicleType = card.dataset.type;
    // Resetta selezioni successive
    selectedService = null;
    selectedDate = null;
    selectedTime = null;
    // Vai a step 2 dopo breve delay
    setTimeout(function () { goToStep(2); loadServices(); }, 200);
  });
});

// ==================== STEP 2: SERVIZIO ====================

async function loadServices() {
  var grid = document.getElementById('services-grid');
  grid.innerHTML = '<div class="services-loading">Caricamento servizi…</div>';

  try {
    var url = '/services';
    if (selectedVehicleType) url += '?tipo_veicolo=' + selectedVehicleType;
    var response = await apiRequest(url);

    if (!response.success || !response.services || response.services.length === 0) {
      grid.innerHTML = '<div class="no-slots-message">Nessun servizio disponibile</div>';
      return;
    }

    grid.innerHTML = '';
    response.services.forEach(function (svc) {
      var card = document.createElement('div');
      card.className = 'service-card';
      card.dataset.serviceId = svc.id;

      var durataLabel = svc.durata_minuti ? (svc.durata_minuti + ' min') : '';
      var prezzoLabel = svc.prezzo ? ('€ ' + parseFloat(svc.prezzo).toFixed(2)) : '';
      var isConsegna = svc.tipo_servizio === 'consegna' || (svc.nome || '').toLowerCase().includes('consegna');

      card.innerHTML =
        '<div class="service-card-name">' + (svc.nome || 'Servizio') + '</div>' +
        (durataLabel ? '<div class="service-card-detail">' + durataLabel + '</div>' : '') +
        (prezzoLabel ? '<div class="service-card-detail">' + prezzoLabel + '</div>' : '') +
        (svc.descrizione ? '<div class="service-card-desc">' + svc.descrizione + '</div>' : '');

      card.addEventListener('click', function () {
        document.querySelectorAll('.service-card').forEach(function (c) { c.classList.remove('selected'); });
        card.classList.add('selected');
        selectedService = svc;
        document.getElementById('service-next-btn').disabled = false;

        // Mostra info consegna se applicabile
        var consegnaInfo = document.getElementById('consegna-info');
        if (consegnaInfo) {
          if (isConsegna) consegnaInfo.classList.remove('hidden');
          else consegnaInfo.classList.add('hidden');
        }
      });

      grid.appendChild(card);
    });

    document.getElementById('service-next-btn').disabled = true;

  } catch (error) {
    console.error('Errore caricamento servizi:', error);
    grid.innerHTML = '<div class="no-slots-message">Errore nel caricamento dei servizi</div>';
  }
}

// Bottone "Continua" da Step 2
document.getElementById('service-next-btn').addEventListener('click', function () {
  if (!selectedService) return;
  selectedDate = null;
  selectedTime = null;

  // Mostra recap servizio in step 3
  var recap = document.getElementById('selected-service-recap');
  if (recap) recap.textContent = selectedService.nome + (selectedService.durata_minuti ? ' (' + selectedService.durata_minuti + ' min)' : '');

  goToStep(3);
  renderCalendar();
});

// Back buttons
document.getElementById('back-to-step1').addEventListener('click', function () { goToStep(1); });
document.getElementById('back-to-step2').addEventListener('click', function () { goToStep(2); });
document.getElementById('back-to-step3').addEventListener('click', function () { goToStep(3); });

  // Rendi interattivi i Breadcrumb (solo per i passi completati)
  [1, 2, 3, 4].forEach(function(i) {
    var bc = document.getElementById('bc-' + i);
    if (bc) {
      bc.addEventListener('click', function() {
        if (this.classList.contains('completed')) {
          goToStep(i);
        }
      });
      bc.addEventListener('mouseover', function() {
        if (this.classList.contains('completed')) {
          this.style.cursor = 'pointer';
        } else {
          this.style.cursor = 'default';
        }
      });
    }
  });

  // Renderizza il calendario per la selezione della data
  function renderCalendar() {
    var year = currentMonth.getFullYear();
    var month = currentMonth.getMonth();
  var calendarGrid = document.getElementById('calendar-grid');
  var existingDays = calendarGrid.querySelectorAll('.calendar-day');
  existingDays.forEach(function (day) { day.remove(); });

  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  // Lunedì = 0, Domenica = 6
  var startDay = firstDay === 0 ? 6 : firstDay - 1;
  for (var i = 0; i < startDay; i++) {
    var emptyDay = document.createElement('div');
    emptyDay.className = 'calendar-day empty';
    calendarGrid.appendChild(emptyDay);
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var day = 1; day <= daysInMonth; day++) {
    var date = new Date(year, month, day);
    var yyyy = date.getFullYear();
    var mm = String(date.getMonth() + 1).padStart(2, '0');
    var dd = String(date.getDate()).padStart(2, '0');
    var dateString = yyyy + '-' + mm + '-' + dd;
    var dayOfWeek = date.getDay();

    var dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    dayElement.textContent = day;
    dayElement.dataset.date = dateString;

    // Disabilita giorni passati o giorni chiusi (config-driven)
    if (date < today) {
      dayElement.classList.add('disabled');
    } else if (!daysOpen.includes(dayOfWeek)) {
      dayElement.classList.add('disabled');
    } else {
      (function (ds, el) {
        el.addEventListener('click', function () { selectDate(ds, el); });
      })(dateString, dayElement);
    }

    calendarGrid.appendChild(dayElement);
  }
}

async function selectDate(dateString, element) {
  document.querySelectorAll('.calendar-day.selected').forEach(function (el) {
    el.classList.remove('selected');
  });
  element.classList.add('selected');
  selectedDate = dateString;
  selectedTime = null;

  await loadTimeSlots(dateString);
}

async function loadTimeSlots(date) {
  try {
    var timeSlotsSection = document.getElementById('time-slots-section');
    var timeSlotsGrid = document.getElementById('time-slots-grid');
    timeSlotsSection.classList.remove('hidden');
    timeSlotsGrid.innerHTML = '<div class="loading">Caricamento orari...</div>';

    // Se stiamo modificando una prenotazione, passa i parametri per escludere lo slot originale
    var excludeParams = '';
    var editingBookingStr = sessionStorage.getItem('editingBooking');
    if (editingBookingStr) {
      try {
        var editingB = JSON.parse(editingBookingStr);
        if (editingB.giorno && editingB.ora) {
          excludeParams = '?excludeGiorno=' + encodeURIComponent(editingB.giorno) + '&excludeOra=' + encodeURIComponent(editingB.ora);
        }
      } catch (e) {}
    }

    // Usa endpoint duration-aware se c'è un servizio selezionato
    var response;
    if (selectedService && selectedService.id) {
      response = await apiRequest('/slots/' + date + '/' + selectedService.id + excludeParams);
    } else {
      response = await apiRequest('/slots/' + date + excludeParams);
    }

    var availableSlots = response.slots.filter(function (slot) {
      return slot.available && !slot.isHoliday;
    });

    if (availableSlots.length === 0) {
      timeSlotsGrid.innerHTML = '<div class="no-slots-message">Nessun orario disponibile per questa data</div>';
      document.getElementById('confirm-datetime-btn').disabled = true;
      return;
    }

    timeSlotsGrid.innerHTML = '';
    availableSlots.forEach(function (slot) {
      var slotEl = document.createElement('div');
      slotEl.className = 'time-slot';
      slotEl.textContent = slot.time;
      slotEl.dataset.time = slot.time;
      slotEl.addEventListener('click', function () { selectTimeSlot(slotEl); });
      timeSlotsGrid.appendChild(slotEl);
    });

    document.getElementById('confirm-datetime-btn').disabled = true;
  } catch (error) {
    console.error('Errore caricamento slot:', error);
    document.getElementById('time-slots-grid').innerHTML =
      '<div class="no-slots-message">Errore nel caricamento degli orari</div>';
  }
}

function selectTimeSlot(element) {
  document.querySelectorAll('.time-slot.selected').forEach(function (el) {
    el.classList.remove('selected');
  });
  element.classList.add('selected');
  selectedTime = element.dataset.time;
  document.getElementById('confirm-datetime-btn').disabled = false;
}

function hideTimeSlots() {
  document.getElementById('time-slots-section').classList.add('hidden');
  selectedDate = null;
  selectedTime = null;
}

// Nav calendario
document.getElementById('prev-month').addEventListener('click', function () {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
  hideTimeSlots();
});

document.getElementById('next-month').addEventListener('click', function () {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
  hideTimeSlots();
});

// Conferma data e ora → vai a step 4 (riepilogo)
document.getElementById('confirm-datetime-btn').addEventListener('click', function () {
  if (selectedDate && selectedTime) {
    goToStep(4);
  }
});

// ==================== STEP 4: RIEPILOGO + CONFERMA ====================

function populateSummary() {
  document.getElementById('booking-service').textContent = selectedService ? selectedService.nome : '—';
  document.getElementById('booking-duration').textContent = selectedService && selectedService.durata_minuti
    ? selectedService.durata_minuti + ' min' : '—';
  document.getElementById('booking-date').textContent = selectedDate ? formatDateDisplay(selectedDate) : '—';
  document.getElementById('booking-time').textContent = selectedTime || '—';
  document.getElementById('customer-name').textContent = currentUser.nome + ' ' + currentUser.cognome;
  document.getElementById('customer-email').textContent = currentUser.email;
  document.getElementById('customer-phone').textContent = currentUser.telefono || '';

  // Nascondi sezione veicoli salvati (feature futura)
  var savedPicker = document.getElementById('saved-vehicles-picker');
  if (savedPicker) savedPicker.classList.add('hidden');

  // Determina se è consegna per rendere targa/modello obbligatori visivamente
  var isConsegna = selectedService && (selectedService.tipo_servizio === 'consegna' ||
    (selectedService.nome || '').toLowerCase().includes('consegna'));

  var targaInput = document.getElementById('input-targa');
  var modelloInput = document.getElementById('input-modello');
  if (targaInput) targaInput.required = true;
  if (modelloInput) modelloInput.required = true;

  // Prefill in caso di modifica
  var editingBookingStr = sessionStorage.getItem('editingBooking');
  if (editingBookingStr) {
    try {
      var editingB = JSON.parse(editingBookingStr);
      if (targaInput && !targaInput.value && editingB.targa) {
        targaInput.value = editingB.targa;
      }
      if (modelloInput && !modelloInput.value && editingB.modello) {
        modelloInput.value = editingB.modello;
      }
      var noteInput = document.getElementById('input-note');
      if (noteInput && !noteInput.value && editingB.note_cliente) {
        noteInput.value = editingB.note_cliente;
      }
    } catch(e) {}
  }
}

function formatDateDisplay(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return dayNames[d.getDay()] + ' ' + d.getDate() + ' ' + calendarMonthNames[d.getMonth()].toLowerCase() + ' ' + d.getFullYear();
}

// Conferma prenotazione
document.getElementById('complete-booking-btn').addEventListener('click', function () {
  var targa = (document.getElementById('input-targa').value || '').trim();
  var modello = (document.getElementById('input-modello').value || '').trim();
  var note = (document.getElementById('input-note').value || '').trim();
  var errorEl = document.getElementById('error-message');

  // Validazione
  if (!targa || !modello) {
    errorEl.textContent = 'Targa e modello del veicolo sono obbligatori.';
    errorEl.classList.remove('hidden');
    return;
  }
  
  if (targa.length < 4 || targa.length > 10) {
    errorEl.textContent = 'La targa deve avere tra 4 e 10 caratteri.';
    errorEl.classList.remove('hidden');
    return;
  }
  
  if (modello.length < 2 || modello.length > 15) {
    errorEl.textContent = 'Il modello deve avere tra 2 e 15 caratteri.';
    errorEl.classList.remove('hidden');
    return;
  }
  
  if (note.length > 30) {
    errorEl.textContent = 'Le note non possono superare i 30 caratteri.';
    errorEl.classList.remove('hidden');
    return;
  }
  
  errorEl.classList.add('hidden');

  // Popola modal di conferma
  var modalService = document.getElementById('modal-service');
  var modalDate = document.getElementById('modal-date');
  var modalTime = document.getElementById('modal-time');
  var modalTarga = document.getElementById('modal-targa');

  if (modalService) modalService.textContent = selectedService ? selectedService.nome : '—';
  if (modalDate) modalDate.textContent = formatDateDisplay(selectedDate);
  if (modalTime) modalTime.textContent = selectedTime;
  if (modalTarga) modalTarga.textContent = targa;

  document.getElementById('confirm-modal').classList.remove('hidden');
});

// Annulla modal
document.getElementById('modal-cancel').addEventListener('click', function () {
  document.getElementById('confirm-modal').classList.add('hidden');
});

// Click overlay chiude modal
document.querySelector('#confirm-modal .modal-overlay').addEventListener('click', function () {
  document.getElementById('confirm-modal').classList.add('hidden');
});

// Conferma definitiva
document.getElementById('modal-confirm').addEventListener('click', async function () {
  var btn = document.getElementById('modal-confirm');
  btn.disabled = true;
  btn.textContent = 'Invio in corso...';

  var targa = (document.getElementById('input-targa').value || '').trim();
  var modello = (document.getElementById('input-modello').value || '').trim();
  var note = (document.getElementById('input-note').value || '').trim();

  var payload = {
    data: selectedDate,
    orario: selectedTime,
    serviceId: selectedService ? selectedService.id : null,
    durata_minuti: selectedService ? (selectedService.durata_minuti || 60) : 60,
    targa: targa,
    modello: modello,
    note_cliente: note
  };

  var editingBookingStr = sessionStorage.getItem('editingBooking');
  if (editingBookingStr) {
    try {
      var oldB = JSON.parse(editingBookingStr);
      payload.old_giorno = oldB.giorno;
      payload.old_ora = oldB.ora;
    } catch (e) {}
  }

  try {
    var response = await apiRequest('/bookings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (response.success) {
      // Se stavamo modificando una prenotazione, il backend l'ha sostituita
      sessionStorage.removeItem('editingBooking');

      // Mostra successo nel modal
      var modalContent = document.querySelector('#confirm-modal .modal-content');
      modalContent.innerHTML =
        '<div style="font-size: 4rem; margin-bottom: 20px;">✓</div>' +
        '<h3 class="modal-title" style="color: #000;">Prenotazione Confermata!</h3>' +
        '<p class="modal-text">La tua prenotazione è stata registrata.<br><br>' +
        '<strong>Ti aspettiamo da Ellebi Service SRL!</strong></p>' +
        '<button id="go-home-btn" class="btn" style="background-color: #000; color: #fff; min-width: 150px;">Torna alla Home</button>';

      document.getElementById('go-home-btn').addEventListener('click', function () {
        window.location.href = '/home';
      });
    }
  } catch (error) {
    console.error('Errore prenotazione:', error);
    document.getElementById('confirm-modal').classList.add('hidden');
    var errorEl = document.getElementById('error-message');
    errorEl.textContent = error.message || 'Errore durante la prenotazione';
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Conferma';
  }
});

// ==================== SIDEBAR ====================

function setupSidebar() {
  var hamburgerBtn = document.getElementById('hamburger-btn');
  var sidebar = document.getElementById('sidebar');
  var sidebarOverlay = document.getElementById('sidebar-overlay');
  var closeSidebarBtn = document.getElementById('close-sidebar');
  var sidebarLogout = document.getElementById('sidebar-logout');

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

  sidebarLogout.addEventListener('click', async function () {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (error) {
      console.error('Errore logout:', error);
      window.location.href = '/';
    }
  });
}

setupSidebar();
init();
