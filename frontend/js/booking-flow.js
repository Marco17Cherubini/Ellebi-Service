// Prenotazione: un solo flusso per ospiti e clienti registrati.
// Veicolo → servizio → giorno e ora → veicolo e contatti → riepilogo → conferma.
// Gli orari vengono sempre dal server (/api/slots/:data/:servizio), che applica durata,
// turni, pausa pranzo, ferie, stagionalità e orari estesi: il browser non ricalcola nulla.
(function () {
  'use strict';

  const DAYS_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const MONTHS = [
    'gennaio',
    'febbraio',
    'marzo',
    'aprile',
    'maggio',
    'giugno',
    'luglio',
    'agosto',
    'settembre',
    'ottobre',
    'novembre',
    'dicembre'
  ];
  const STEP_NAMES = { 1: 'Veicolo', 2: 'Servizio', 3: 'Giorno e ora', 4: 'Dati', 5: 'Riepilogo' };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const state = {
    step: 1,
    user: null, // cliente con sessione
    editing: null, // prenotazione da modificare { giorno, ora, serviceId, ... }
    vehicleType: null,
    services: [],
    service: null,
    date: null,
    time: null,
    daysOpen: [1, 2, 3, 4, 5, 6],
    submitting: false
  };

  const $ = id => document.getElementById(id);
  const isConsegna = s => !!s && s.tipo_servizio === 'consegna';

  // ==================== DATE ====================

  function toDateString(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function longDate(s) {
    const d = parseDate(s);
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function addMinutes(time, min) {
    const [h, m] = time.split(':').map(Number);
    const t = h * 60 + m + min;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  function formatDuration(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return m + ' minuti';
    return h + (h === 1 ? ' ora' : ' ore') + (m ? ' e ' + m + ' minuti' : '');
  }

  // ==================== AVVIO ====================

  async function init() {
    try {
      const me = await apiRequest('/auth/session');
      if (me.user && !me.user.isAdmin) state.user = me.user;
      if (me.user && me.user.isAdmin) {
        $('flow-who').innerHTML =
          'Sei connesso come officina: per inserire appuntamenti usa <a href="/admin">l\'agenda</a>.';
      }
    } catch (e) {
      /* ospite */
    }

    try {
      const cfg = await apiRequest('/config/slots');
      if (cfg.daysOpen) state.daysOpen = cfg.daysOpen;
    } catch (e) {
      /* giorni di default */
    }

    if (state.user) {
      $('flow-who').textContent =
        'Prenoti come ' +
        state.user.nome +
        ' ' +
        state.user.cognome +
        ' (' +
        state.user.email +
        ').';
      $('contact-fields').hidden = true;
      $('remember-row').hidden = false;
      loadSavedVehicles();
      readEditing();
    }

    setupStepOne();
    $('back-btn').addEventListener('click', back);
    $('next-btn').addEventListener('click', next);
    $('other-date').min = toDateString(new Date());
    $('other-date').addEventListener('change', e => {
      if (e.target.value) selectDate(e.target.value);
    });

    if (state.editing) await startEditing();
    else show(1);
  }

  // Modifica di una prenotazione esistente (dalla pagina "Le tue prenotazioni")
  function readEditing() {
    try {
      const raw = sessionStorage.getItem('editingBooking');
      if (raw) state.editing = JSON.parse(raw);
    } catch (e) {
      state.editing = null;
    }
  }

  async function startEditing() {
    const e = state.editing;
    $('flow-title').textContent = 'Sposta la prenotazione';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-quiet btn-sm';
    cancel.textContent = 'Annulla la modifica';
    cancel.addEventListener('click', () => {
      sessionStorage.removeItem('editingBooking');
      window.location.href = '/home';
    });
    $('flow-who').append(
      ' Stai spostando ' + e.servizio + ' di ' + longDate(e.giorno) + ' ore ' + e.ora + '. ',
      cancel
    );

    $('targa').value = e.targa || '';
    $('modello').value = e.modello || '';
    $('note').value = e.note_cliente || '';

    await loadServices();
    const svc = state.services.find(s => String(s.id) === String(e.serviceId));
    if (svc) {
      state.vehicleType = svc.tipo_veicolo;
      state.service = svc;
      show(3);
    } else {
      show(1);
    }
  }

  // ==================== NAVIGAZIONE ====================

  function show(step) {
    state.step = step;
    document.querySelectorAll('.step').forEach(s => {
      s.hidden = s.dataset.step !== String(step);
    });
    const done = step === 'done';
    document.querySelectorAll('.progress span').forEach((b, i) => {
      b.classList.toggle('is-on', done || i < step);
    });
    $('progress-text').textContent = done
      ? 'Fatto'
      : 'Passo ' + step + ' di 5 · ' + STEP_NAMES[step];
    $('action-bar').hidden = done;
    $('back-btn').hidden = step === 1;

    if (step === 2) renderServices();
    if (step === 3) renderDays();
    if (step === 5) renderSummary();
    updateNext();

    const heading = document.querySelector('.step:not([hidden]) h2');
    if (heading) heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function updateNext() {
    const btn = $('next-btn');
    const ready = {
      1: !!state.vehicleType,
      2: !!state.service,
      3: !!(state.date && state.time),
      4: true,
      5: !state.submitting
    }[state.step];
    btn.disabled = !ready;
    btn.textContent = state.step === 5 ? 'Conferma la prenotazione' : 'Continua';
  }

  function back() {
    if (state.step > 1) show(state.step - 1);
  }

  function next() {
    if (state.step === 4) {
      if (validateDetails()) show(5);
      return;
    }
    if (state.step === 5) {
      submit();
      return;
    }
    show(state.step + 1);
  }

  // ==================== PASSO 1: VEICOLO ====================

  function setupStepOne() {
    document.querySelectorAll('[data-vehicle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.vehicle;
        if (state.vehicleType !== type) {
          state.service = null;
          state.date = null;
          state.time = null;
        }
        state.vehicleType = type;
        document
          .querySelectorAll('[data-vehicle]')
          .forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        show(2);
      });
    });
  }

  // ==================== PASSO 2: SERVIZIO ====================

  async function loadServices() {
    if (state.services.length) return;
    const data = await apiRequest('/services');
    state.services = data.services || [];
  }

  async function renderServices() {
    const list = $('service-list');
    try {
      await loadServices();
    } catch (e) {
      list.innerHTML =
        '<p class="form-error">Non riusciamo a caricare i servizi. Controlla la connessione e riprova.</p>';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-outline';
      retry.textContent = 'Riprova';
      retry.addEventListener('click', renderServices);
      list.appendChild(retry);
      return;
    }

    const mine = state.services.filter(s => s.tipo_veicolo === state.vehicleType);
    list.textContent = '';
    if (mine.length === 0) {
      list.innerHTML =
        '<p class="notice">Al momento non ci sono servizi prenotabili online per questo veicolo. Chiama l\'officina al <a href="tel:+393663043908">366 304 3908</a>.</p>';
      return;
    }

    const groups = [
      { title: 'Appuntamento', items: mine.filter(s => !isConsegna(s)) },
      { title: 'Consegna del veicolo', items: mine.filter(isConsegna) }
    ];
    groups.forEach(group => {
      if (group.items.length === 0) return;
      const fs = document.createElement('fieldset');
      fs.className = 'service-group';
      const legend = document.createElement('legend');
      legend.textContent = group.title;
      fs.appendChild(legend);
      group.items.forEach(svc => {
        const label = document.createElement('label');
        label.className = 'service-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'service';
        input.value = svc.id;
        input.checked = !!state.service && String(state.service.id) === String(svc.id);
        input.addEventListener('change', () => selectService(svc));
        const name = document.createElement('span');
        name.className = 'service-name';
        name.textContent = svc.nome;
        const meta = document.createElement('span');
        meta.className = 'service-meta';
        meta.textContent = isConsegna(svc)
          ? '30 min di accoglienza'
          : formatDuration(svc.durata_minuti);
        label.append(input, name, meta);
        fs.appendChild(label);
      });
      list.appendChild(fs);
    });
    $('consegna-info').hidden = !isConsegna(state.service);
  }

  function selectService(svc) {
    if (!state.service || String(state.service.id) !== String(svc.id)) {
      state.date = null;
      state.time = null;
    }
    state.service = svc;
    $('consegna-info').hidden = !isConsegna(svc);
    updateNext();
  }

  // ==================== PASSO 3: GIORNO E ORA ====================

  function renderDays() {
    const svc = state.service;
    $('duration-line').textContent = isConsegna(svc)
      ? svc.nome + ': accoglienza di 30 minuti per lasciare il veicolo.'
      : svc.nome + ': ' + formatDuration(svc.durata_minuti) + ' in officina.';

    const strip = $('day-strip');
    strip.textContent = '';
    const d = new Date();
    let shown = 0;
    for (let i = 0; shown < 21 && i < 40; i++, d.setDate(d.getDate() + 1)) {
      if (!state.daysOpen.includes(d.getDay())) continue;
      const ds = toDateString(d);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'day-chip';
      b.dataset.date = ds;
      b.setAttribute('aria-pressed', String(ds === state.date));
      b.setAttribute('aria-label', (i === 0 ? 'oggi, ' : '') + longDate(ds));
      b.innerHTML =
        '<span class="day-chip-name">' +
        (i === 0 ? 'oggi' : DAYS_SHORT[d.getDay()]) +
        '</span><span class="day-chip-num">' +
        d.getDate() +
        '</span><span class="day-chip-month">' +
        MONTHS[d.getMonth()].slice(0, 3) +
        '</span>';
      b.addEventListener('click', () => selectDate(ds));
      strip.appendChild(b);
      shown++;
    }
    if (state.date) loadSlots(state.date);
    else selectDate(strip.firstChild ? strip.firstChild.dataset.date : null, { quiet: true });
  }

  function selectDate(ds, { quiet = false } = {}) {
    if (!ds) return;
    if (ds !== state.date) state.time = null;
    state.date = ds;
    document
      .querySelectorAll('.day-chip')
      .forEach(c => c.setAttribute('aria-pressed', String(c.dataset.date === ds)));
    const chip = document.querySelector('.day-chip[data-date="' + ds + '"]');
    if (chip && !quiet) chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    updateNext();
    loadSlots(ds);
  }

  let slotRequest = 0;

  async function loadSlots(ds) {
    const area = $('slot-area');
    const req = ++slotRequest;
    area.innerHTML = '<p class="loading-line">Cerco gli orari liberi di ' + longDate(ds) + '…</p>';
    area.setAttribute('aria-busy', 'true');

    const day = parseDate(ds);
    if (!state.daysOpen.includes(day.getDay())) {
      area.innerHTML = '<p class="notice">L\'officina è chiusa ' + DAYS[day.getDay()] + '.</p>';
      area.removeAttribute('aria-busy');
      return;
    }

    let data;
    try {
      let url = '/slots/' + ds + '/' + encodeURIComponent(state.service.id);
      if (state.editing) {
        url +=
          '?excludeGiorno=' +
          encodeURIComponent(state.editing.giorno) +
          '&excludeOra=' +
          encodeURIComponent(state.editing.ora);
      }
      data = await apiRequest(url);
    } catch (e) {
      if (req !== slotRequest) return;
      area.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'form-error';
      p.textContent = 'Non riusciamo a caricare gli orari. Controlla la connessione.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-outline';
      retry.textContent = 'Riprova';
      retry.addEventListener('click', () => loadSlots(ds));
      area.append(p, retry);
      area.removeAttribute('aria-busy');
      return;
    }
    if (req !== slotRequest) return; // risposta di un giorno non più selezionato
    area.removeAttribute('aria-busy');

    const free = (data.slots || []).filter(s => s.available);
    area.textContent = '';
    if (data.outOfSeason) {
      area.innerHTML =
        '<p class="notice">' +
        escapeHTML(state.service.nome) +
        " non è disponibile in questo periodo dell'anno. Scegli un'altra data o un altro servizio.</p>";
      return;
    }
    if (free.length === 0) {
      const p = document.createElement('p');
      p.className = 'notice';
      p.textContent = 'Nessun orario libero ' + longDate(ds) + ' per questo servizio.';
      area.appendChild(p);
      const nextDay = document.querySelector('.day-chip[data-date="' + ds + '"] + .day-chip');
      if (nextDay) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-outline';
        b.textContent = 'Prova ' + longDate(nextDay.dataset.date);
        b.addEventListener('click', () => selectDate(nextDay.dataset.date));
        area.appendChild(b);
      }
      return;
    }

    const durata = isConsegna(state.service) ? 30 : data.durata_minuti;
    const parts = [
      { name: 'Mattina', items: free.filter(s => s.time < '13:00') },
      { name: 'Pomeriggio', items: free.filter(s => s.time >= '13:00' && s.time < '18:45') },
      { name: 'Sera', items: free.filter(s => s.time >= '18:45') }
    ];
    parts.forEach(part => {
      if (part.items.length === 0) return;
      const fs = document.createElement('fieldset');
      fs.className = 'slot-group';
      const legend = document.createElement('legend');
      legend.textContent = part.name;
      fs.appendChild(legend);
      const grid = document.createElement('div');
      grid.className = 'slot-grid';
      part.items.forEach(s => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot-btn';
        b.dataset.time = s.time;
        b.setAttribute('aria-pressed', String(s.time === state.time));
        b.setAttribute('aria-label', 'ore ' + s.time + ', fine ' + addMinutes(s.time, durata));
        b.innerHTML =
          '<span class="slot-start">' +
          s.time +
          '</span><span class="slot-end">→ ' +
          addMinutes(s.time, durata) +
          '</span>';
        b.addEventListener('click', () => {
          state.time = s.time;
          area
            .querySelectorAll('.slot-btn')
            .forEach(x => x.setAttribute('aria-pressed', String(x === b)));
          updateNext();
        });
        grid.appendChild(b);
      });
      fs.appendChild(grid);
      area.appendChild(fs);
    });
  }

  // ==================== PASSO 4: DATI ====================

  async function loadSavedVehicles() {
    try {
      const data = await apiRequest('/vehicles');
      const list = (data.vehicles || []).filter(v => v.targa);
      if (list.length === 0) return;
      const box = $('saved-vehicles');
      const p = document.createElement('p');
      p.className = 'form-label';
      p.textContent = 'I tuoi veicoli';
      box.appendChild(p);
      list.forEach(v => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vehicle-chip';
        b.textContent = v.targa + (v.modello ? ' · ' + v.modello : '');
        b.addEventListener('click', () => {
          $('targa').value = v.targa;
          $('modello').value = v.modello || '';
          clearError('targa');
          clearError('modello');
        });
        box.appendChild(b);
      });
      box.hidden = false;
    } catch (e) {
      /* nessun veicolo salvato */
    }
  }

  function setError(id, message) {
    const input = $(id);
    input.setAttribute('aria-invalid', 'true');
    $(id + '-err').textContent = message;
  }

  function clearError(id) {
    const input = $(id);
    if (!input) return;
    input.removeAttribute('aria-invalid');
    const err = $(id + '-err');
    if (err) err.textContent = '';
  }

  function validateDetails() {
    ['targa', 'modello', 'nome', 'cognome', 'email', 'telefono', 'privacy'].forEach(clearError);
    const errors = [];
    const targa = $('targa').value.trim();
    const modello = $('modello').value.trim();
    if (targa.length < 4) errors.push(['targa', 'Scrivi la targa (almeno 4 caratteri).']);
    if (modello.length < 2) errors.push(['modello', 'Scrivi marca e modello del veicolo.']);

    if (!state.user) {
      if (!$('nome').value.trim()) errors.push(['nome', 'Scrivi il tuo nome.']);
      if (!$('cognome').value.trim()) errors.push(['cognome', 'Scrivi il tuo cognome.']);
      if (!EMAIL_RE.test($('email').value.trim())) {
        errors.push(['email', "Controlla l'email: deve essere nel formato nome@dominio.it."]);
      }
      if ($('telefono').value.replace(/\D/g, '').length < 6) {
        errors.push(['telefono', 'Scrivi un numero di telefono valido.']);
      }
      if (!$('privacy').checked) {
        errors.push([
          'privacy',
          "Serve il consenso all'informativa per registrare la prenotazione."
        ]);
      }
    }

    errors.forEach(([id, msg]) => setError(id, msg));
    if (errors.length) {
      $(errors[0][0]).focus();
      return false;
    }
    return true;
  }

  document.addEventListener('input', e => {
    if (e.target.id && $(e.target.id + '-err')) clearError(e.target.id);
  });

  // ==================== PASSO 5: RIEPILOGO E INVIO ====================

  function summaryRows() {
    const svc = state.service;
    const consegna = isConsegna(svc);
    const durata = consegna ? 30 : svc.durata_minuti;
    const rows = [
      ['Servizio', svc.nome + (consegna ? ' (consegna del veicolo)' : '')],
      [
        'Quando',
        longDate(state.date) +
          ', ore ' +
          state.time +
          (consegna ? ' (accoglienza fino alle ' : ' (fino alle ') +
          addMinutes(state.time, durata) +
          ')'
      ],
      ['Veicolo', $('targa').value.trim().toUpperCase() + ' · ' + $('modello').value.trim()]
    ];
    const note = $('note').value.trim();
    if (note) rows.push(['Note', note]);
    if (state.user) {
      rows.push([
        'Contatti',
        state.user.email + (state.user.telefono ? ' · ' + state.user.telefono : '')
      ]);
    } else {
      rows.push([
        'Contatti',
        $('nome').value.trim() +
          ' ' +
          $('cognome').value.trim() +
          ' · ' +
          $('email').value.trim() +
          ' · ' +
          $('telefono').value.trim()
      ]);
    }
    return rows;
  }

  function fillSummary(dl, rows) {
    dl.textContent = '';
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    });
  }

  function renderSummary() {
    fillSummary($('summary'), summaryRows());
    $('summary-consegna').hidden = !isConsegna(state.service);
    $('submit-error').hidden = true;
  }

  async function submit() {
    if (state.submitting) return;
    state.submitting = true;
    const btn = $('next-btn');
    btn.disabled = true;
    btn.classList.add('is-busy');
    btn.textContent = 'Invio in corso…';
    $('submit-error').hidden = true;

    const payload = {
      data: state.date,
      orario: state.time,
      serviceId: state.service.id,
      targa: $('targa').value.trim(),
      modello: $('modello').value.trim(),
      note_cliente: $('note').value.trim()
    };
    let endpoint = '/bookings';
    if (state.user) {
      if (state.editing) {
        payload.old_giorno = state.editing.giorno;
        payload.old_ora = state.editing.ora;
      }
    } else {
      endpoint = '/bookings/guest';
      Object.assign(payload, {
        nome: $('nome').value.trim(),
        cognome: $('cognome').value.trim(),
        email: $('email').value.trim(),
        telefono: $('telefono').value.trim()
      });
    }

    try {
      await apiRequest(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      const rows = summaryRows();
      if (state.user && state.editing) sessionStorage.removeItem('editingBooking');
      if (state.user && $('remember-vehicle').checked) rememberVehicle(payload);
      showDone(rows);
    } catch (error) {
      showSubmitError(error.message);
    } finally {
      state.submitting = false;
      btn.classList.remove('is-busy');
      updateNext();
    }
  }

  function rememberVehicle(payload) {
    apiRequest('/vehicles', {
      method: 'POST',
      body: JSON.stringify({ targa: payload.targa, modello: payload.modello })
    }).catch(() => {});
  }

  function showSubmitError(message) {
    const box = $('submit-error');
    box.textContent = '';
    const p = document.createElement('p');
    p.textContent = message || 'Non è stato possibile completare la prenotazione.';
    box.appendChild(p);
    // Orario occupato nel frattempo: si torna agli orari senza perdere i dati inseriti
    if (/slot|orario|intervallo|disponibil/i.test(message || '')) {
      p.textContent =
        'Nel frattempo questo orario è stato occupato. I tuoi dati restano: scegli un altro orario.';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-outline';
      b.textContent = 'Scegli un altro orario';
      b.addEventListener('click', () => {
        state.time = null;
        show(3);
      });
      box.appendChild(b);
    }
    box.hidden = false;
    box.focus();
  }

  function showDone(rows) {
    const consegna = isConsegna(state.service);
    // Il server invia il riepilogo via email per gli appuntamenti e per le prenotazioni ospite;
    // per le consegne dei clienti registrati la prenotazione resta nella loro area
    let text = state.user ? 'La trovi nella tua area.' : '';
    if (!state.user || !consegna) text += " Ti abbiamo inviato un'email di riepilogo.";
    if (consegna) text += " Quando il veicolo sarà pronto riceverai un'email.";
    $('done-text').textContent = text.trim();
    fillSummary($('done-summary'), rows);
    if (state.user) {
      $('done-primary').href = '/home';
      $('done-primary').textContent = 'Vai alle tue prenotazioni';
    }
    show('done');
  }

  $('submit-error').tabIndex = -1;
  init();
})();
