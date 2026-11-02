// Area cliente: prossime prenotazioni (sposta o annulla finché è consentito) e veicoli salvati
(function () {
  'use strict';

  let bookings = [];
  let pending = null; // prenotazione da annullare
  let lastFocus = null;

  const $ = id => document.getElementById(id);

  async function init() {
    const user = await getCurrentUser();
    if (!user) {
      redirectToLogin();
      return;
    }
    if (user.isAdmin) {
      window.location.href = '/admin';
      return;
    }
    $('welcome-message').textContent = 'Ciao, ' + user.nome;
    if (user.vip) {
      $('welcome-sub').textContent =
        'Prenotazioni in arrivo e veicoli salvati. Puoi prenotare anche negli orari estesi.';
    }
    showFlash();
    await Promise.all([loadBookings(), loadVehicles()]);
  }

  function showFlash() {
    const msg = sessionStorage.getItem('accountFlash');
    if (!msg) return;
    sessionStorage.removeItem('accountFlash');
    $('flash').textContent = msg;
    $('flash').hidden = false;
  }

  function formatDuration(min) {
    const n = parseInt(min, 10) || 0;
    const h = Math.floor(n / 60);
    const m = n % 60;
    if (!h) return m + ' min';
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  async function loadBookings() {
    const list = $('bookings-list');
    try {
      const res = await apiRequest('/bookings');
      bookings = res.bookings.sort((a, b) => (a.giorno + a.ora).localeCompare(b.giorno + b.ora));
    } catch (error) {
      list.innerHTML =
        '<li class="form-error">Non riusciamo a caricare le prenotazioni. Ricarica la pagina.</li>';
      return;
    }

    if (bookings.length === 0) {
      list.textContent = '';
      list.hidden = true;
      $('no-bookings').hidden = false;
      return;
    }
    list.hidden = false;
    $('no-bookings').hidden = true;
    list.innerHTML = bookings
      .map((b, i) => {
        const consegna = b.tipo === 'deposito';
        const what = consegna
          ? 'Consegna del veicolo'
          : 'Appuntamento · ' + formatDuration(b.durata_minuti);
        const actions = b.modificabile
          ? '<div class="booking-actions">' +
            '<button type="button" class="btn btn-outline btn-sm" data-edit="' +
            i +
            '">Sposta</button>' +
            '<button type="button" class="btn btn-quiet btn-sm" data-cancel="' +
            i +
            '">Annulla</button>' +
            '</div>'
          : '<p class="booking-locked">' +
            (consegna
              ? 'Veicolo in officina: per cambi chiama.'
              : 'Già iniziato: per cambi chiama.') +
            '</p>';
        return (
          '<li class="booking-row">' +
          '<div class="booking-when"><span class="booking-day">' +
          escapeHTML(formatDate(b.giorno)) +
          '</span><span class="booking-time">' +
          escapeHTML(b.ora) +
          '</span></div>' +
          '<div class="booking-what"><strong>' +
          escapeHTML(b.servizio) +
          '</strong><span>' +
          escapeHTML(what) +
          (b.targa ? ' · ' + escapeHTML(b.targa) : '') +
          '</span></div>' +
          actions +
          '</li>'
        );
      })
      .join('');

    list
      .querySelectorAll('[data-edit]')
      .forEach(btn =>
        btn.addEventListener('click', () => edit(bookings[Number(btn.dataset.edit)]))
      );
    list
      .querySelectorAll('[data-cancel]')
      .forEach(btn =>
        btn.addEventListener('click', () => askCancel(bookings[Number(btn.dataset.cancel)], btn))
      );
  }

  function edit(b) {
    sessionStorage.setItem(
      'editingBooking',
      JSON.stringify({
        giorno: b.giorno,
        ora: b.ora,
        servizio: b.servizio,
        serviceId: b.service_id || '',
        targa: b.targa || '',
        modello: b.modello || '',
        note_cliente: b.note_cliente || ''
      })
    );
    window.location.href = '/prenota';
  }

  function askCancel(b, trigger) {
    pending = b;
    lastFocus = trigger;
    $('delete-booking-details').innerHTML =
      '<div><strong>' +
      escapeHTML(b.servizio) +
      '</strong></div>' +
      '<div>' +
      escapeHTML(formatDate(b.giorno)) +
      ', ore ' +
      escapeHTML(b.ora) +
      '</div>';
    $('delete-confirm-modal').classList.remove('hidden');
    $('delete-cancel').focus();
  }

  function closeModal() {
    $('delete-confirm-modal').classList.add('hidden');
    pending = null;
    if (lastFocus) lastFocus.focus();
  }

  async function confirmCancel() {
    if (!pending) return;
    const btn = $('delete-confirm');
    btn.disabled = true;
    btn.classList.add('is-busy');
    try {
      await apiRequest('/bookings', {
        method: 'DELETE',
        body: JSON.stringify({ giorno: pending.giorno, ora: pending.ora })
      });
      $('delete-confirm-modal').classList.add('hidden');
      pending = null;
      $('flash').textContent = 'Appuntamento annullato.';
      $('flash').hidden = false;
      await loadBookings();
      $('upcoming-title').focus();
    } catch (error) {
      $('delete-booking-details').insertAdjacentHTML(
        'beforeend',
        '<div class="field-error">' + escapeHTML(error.message) + '</div>'
      );
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  }

  async function loadVehicles() {
    try {
      const res = await apiRequest('/vehicles');
      const list = res.vehicles || [];
      if (list.length === 0) {
        $('no-vehicles').hidden = false;
        return;
      }
      $('vehicles-list').innerHTML = list
        .map(
          v =>
            '<li><span class="plate">' +
            escapeHTML(v.targa) +
            '</span>' +
            '<span>' +
            escapeHTML(v.modello || '') +
            '</span></li>'
        )
        .join('');
    } catch (error) {
      $('no-vehicles').hidden = false;
    }
  }

  $('upcoming-title').tabIndex = -1;
  $('delete-cancel').addEventListener('click', closeModal);
  $('delete-confirm').addEventListener('click', confirmCancel);
  document
    .querySelector('#delete-confirm-modal .modal-overlay')
    .addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pending) closeModal();
  });
  $('logout-btn').addEventListener('click', async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/';
    }
  });

  init();
})();
