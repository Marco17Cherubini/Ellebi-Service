import { STATE, getTimeSlotsForDate, getMonday, formatDate, formatDateDisplay, formatDateStringDisplay, timeSlotsWeekday, timeSlotsSaturday, allTimeSlots, workDays } from './state.js';

import { loadBookings } from './api.js';
import { renderCalendar } from './calendar.js';

const apiRequest = window.apiRequest;
const Modal = window.Modal;




// Costruisce il pannello custom del service picker
export function buildServicePicker() {
  const panel = document.getElementById('svc-picker-panel');
  if (!panel) return;

  const appuntamenti = allServices.filter(function(s) { return s.tipo_servizio !== 'consegna' && (s.attivo === 1 || s.attivo === '1'); });
  const consegna     = allServices.filter(function(s) { return s.tipo_servizio === 'consegna'  && (s.attivo === 1 || s.attivo === '1'); });

  function buildItem(s) {
    const tipoClass  = s.tipo_servizio === 'consegna' ? 'tipo-consegna' : 'tipo-appuntamento';
    const veicoloLabel = s.tipo_veicolo === 'auto' ? 'Auto' : 'Moto';
    const durataLabel  = s.tipo_servizio === 'consegna' ? 'Consegna' : (s.durata_minuti || '?') + 'min';
    return `<div class="svc-option ${tipoClass}" data-svc-id="${s.id}" data-svc-nome="${s.nome}" role="option" tabindex="-1">
      <div class="svc-option-indicator"></div>
      <span class="svc-option-name">${s.nome}</span>
      <span class="svc-option-meta">${veicoloLabel} · ${durataLabel}</span>
    </div>`;
  }

  let html = '';
  if (appuntamenti.length > 0) {
    html += `<div class="svc-group-header appuntamenti">
      <div class="svc-group-dot"></div>Appuntamenti
    </div>` + appuntamenti.map(buildItem).join('');
  }
  if (consegna.length > 0) {
    html += `<div class="svc-group-header consegna">
      <div class="svc-group-dot"></div>Consegna / Lavori Speciali
    </div>` + consegna.map(buildItem).join('');
  }
  panel.innerHTML = html;

  // Event listener su ogni opzione
  panel.querySelectorAll('.svc-option').forEach(function(opt) {
    opt.addEventListener('click', function() {
      selectServicePicker(opt.dataset.svcId, opt.dataset.svcNome, opt.dataset.svcId && allServices.find(function(s){ return String(s.id) === String(opt.dataset.svcId); }));
      closePicker();
    });
    opt.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        opt.click();
      }
    });
  });
}

export function selectServicePicker(svcId, svcNome, svc) {
  document.getElementById('input-servizio').value = svcId || '';

  // Campi veicolo sempre visibili e obbligatori
  // Mostra/nasconde solo il banner "Lavoro Straordinario" in base al tipo servizio
  const consegnaBanner = document.getElementById('consegna-banner');
  if (consegnaBanner) {
    const isConsegnaSvc = svc && (svc.tipo_servizio === 'consegna' ||
      (svc.nome || '').toLowerCase().includes('consegna'));
    consegnaBanner.classList.toggle('hidden', !isConsegnaSvc);
  }

  const label = document.getElementById('svc-picker-label');
  if (label) {
    if (svcNome) {
      label.textContent = svcNome;
      label.classList.add('has-value');
    } else {
      label.textContent = '— Seleziona servizio —';
      label.classList.remove('has-value');
    }
  }
  // Marca selected
  document.querySelectorAll('#svc-picker-panel .svc-option').forEach(function(o) {
    o.classList.toggle('selected', String(o.dataset.svcId) === String(svcId));
  });
}

export function openPicker() {
  const picker  = document.getElementById('svc-picker');
  const trigger = document.getElementById('svc-picker-trigger');
  const panel   = document.getElementById('svc-picker-panel');
  if (!picker) return;
  picker.classList.add('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  if (panel)   panel.setAttribute('aria-hidden', 'false');
}

export function closePicker() {
  const picker  = document.getElementById('svc-picker');
  const trigger = document.getElementById('svc-picker-trigger');
  const panel   = document.getElementById('svc-picker-panel');
  if (!picker) return;
  picker.classList.remove('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  if (panel)   panel.setAttribute('aria-hidden', 'true');
}

// Inizializza eventi svc-picker
export function setupServicePicker() {
  const trigger = document.getElementById('svc-picker-trigger');
  if (trigger) {
    trigger.addEventListener('click', function () {
      const isOpen = document.getElementById('svc-picker').classList.contains('open');
      isOpen ? closePicker() : openPicker();
    });
    trigger.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openPicker();
        const first = document.querySelector('#svc-picker-panel .svc-option');
        if (first) first.focus();
      }
      if (e.key === 'Escape') closePicker();
    });
  }
  // Chiudi cliccando fuori
  document.addEventListener('click', function(e) {
    const picker = document.getElementById('svc-picker');
    if (picker && !picker.contains(e.target)) closePicker();
  });
}

export function openBookingModal(date, time) {
    if (holidayMode || extraWorkMode) return;
    

  // Reset form
  document.getElementById('booking-form').reset();
  document.getElementById('form-error').classList.add('hidden');
  document.getElementById('suggestions-list').classList.add('hidden');

  // Reset custom service picker
  selectServicePicker('', '', null);
  closePicker();

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

export function closeBookingModal() {
  bookingModal.close();
}

export function showDetailModal(booking) {
    if (holidayMode || extraWorkMode) return;

  // Risolvi nome servizio
  let serviceName = booking.servizio || '';
  if (!serviceName && booking.service_id) {
    const svc = allServices.find(s => String(s.id) === String(booking.service_id));
    if (svc) serviceName = svc.nome;
  }

  const rows = [
    `<div><strong>Nome:</strong> ${booking.nome || '—'} ${booking.cognome || ''}</div>`,
    `<div><strong>Data:</strong> ${formatDateStringDisplay(booking.giorno)}</div>`,
    `<div><strong>Ora:</strong> ${booking.ora}</div>`,
    serviceName ? `<div><strong>Servizio:</strong> ${serviceName}</div>` : '',
    booking.durata_minuti ? `<div><strong>Durata:</strong> ${booking.durata_minuti} min</div>` : '',
    booking.targa ? `<div><strong>Targa:</strong> ${booking.targa}</div>` : '',
    booking.modello ? `<div><strong>Modello:</strong> ${booking.modello}</div>` : '',
    `<div><strong>Email:</strong> ${booking.email || '—'}</div>`,
    `<div><strong>Telefono:</strong> ${booking.telefono || '—'}</div>`,
    booking.note_cliente ? `<div><strong>Note:</strong> ${booking.note_cliente}</div>` : '',
    booking.tipo === 'deposito' ? `<div class="badge-special mt-2">Lavoro Straordinario</div>` : ''
  ].filter(Boolean).join('');

  document.getElementById('detail-content').innerHTML = rows;
  detailModal.open();
}

export function closeDetailModal() {
  detailModal.close();
  selectedBooking = null;
}

export function showDeleteConfirmModal() {
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

export function closeDeleteConfirmModal() {
  deleteConfirmModal.close();
}

export async function executeDelete() {
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

export function setupAutocomplete() {
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

export function fillUserData(user) {
  document.getElementById('input-cognome').value = user.cognome;
  document.getElementById('input-nome').value = user.nome;
  document.getElementById('input-email').value = user.email;
  document.getElementById('input-telefono').value = user.telefono;
}

export function setupModalListeners() {
  // Initialize Modal instances using the Modal component class
  bookingModal = new Modal('booking-modal', {
    onClose: () => {
      selectedSlot = { date: null, time: null };
      // Nascondi e svuota i campi veicolo
      const cf = document.getElementById('consegna-fields');
      if (cf) cf.classList.add('hidden');
      const t = document.getElementById('input-targa-admin');
      const m = document.getElementById('input-modello-admin');
      const n = document.getElementById('input-note-admin');
      if (t) t.value = '';
      if (m) m.value = '';
      if (n) n.value = '';
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

    const serviceSelectVal = document.getElementById('input-servizio').value;
    const selectedSvc = allServices.find(s => String(s.id) === String(serviceSelectVal));
    const isConsegnaSvc = selectedSvc && (selectedSvc.tipo_servizio === 'consegna' ||
      (selectedSvc.nome || '').toLowerCase().includes('consegna'));
    const formData = {
      nome:         document.getElementById('input-nome').value.trim(),
      cognome:      document.getElementById('input-cognome').value.trim(),
      email:        document.getElementById('input-email').value.trim(),
      telefono:     document.getElementById('input-telefono').value.trim(),
      serviceId:    serviceSelectVal || null,
      servizio:     selectedSvc ? selectedSvc.nome : '',
      durata_minuti: selectedSvc ? selectedSvc.durata_minuti : 60,
      giorno:       selectedSlot.date,
      ora:          selectedSlot.time,
      // Campi veicolo — sempre obbligatori
      targa:        (document.getElementById('input-targa-admin') || {}).value?.trim().toUpperCase() || '',
      modello:      (document.getElementById('input-modello-admin') || {}).value?.trim() || '',
      note_cliente: (document.getElementById('input-note-admin') || {}).value || ''
    };

    // Validazione
    const formError = document.getElementById('form-error');
    formError.classList.add('hidden');

    if (!formData.cognome) {
      formError.textContent = 'Il cognome è obbligatorio';
      formError.classList.remove('hidden');
      return;
    }
    if (!formData.targa) {
      formError.textContent = 'La targa è obbligatoria';
      formError.classList.remove('hidden');
      document.getElementById('input-targa-admin').focus();
      return;
    }
    if (!formData.modello) {
      formError.textContent = 'Il modello del veicolo è obbligatorio';
      formError.classList.remove('hidden');
      document.getElementById('input-modello-admin').focus();
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
