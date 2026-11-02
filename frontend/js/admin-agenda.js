// Agenda del giorno (pannello officina): elenco in ordine di orario di tutti gli
// appuntamenti, compresi quelli fuori dalla griglia settimanale (orari estesi di VIP e
// officina), i blocchi di lavoro sui depositi, le ferie e i tratti liberi.
// Usa lo stato e le funzioni di admin.js (allBookings, allHolidays, showDetailModal,
// openBookingModal, getTimeSlotsForDate): va caricato dopo admin.js.
/* global allBookings, allHolidays, showDetailModal, openBookingModal, getTimeSlotsForDate, renderCalendar:writable, currentWeekStart */
(function () {
  'use strict';

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
  const VIEW_KEY = 'ellebi-admin-view';
  const $ = id => document.getElementById(id);

  let day = toDateString(new Date());

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

  const toMin = t => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const toTime = n =>
    String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');

  function duration(b) {
    return b.service_id === 'extra_work' ? 15 : parseInt(b.durata_minuti, 10) || 15;
  }

  // ==================== VISTA ====================

  function setView(view) {
    document.body.classList.toggle('view-day', view === 'day');
    document.body.classList.toggle('view-week', view === 'week');
    document.querySelectorAll('.view-btn').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.view === view));
    });
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch (e) {
      /* preferenza non salvata */
    }
  }

  function initialView() {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'day' || saved === 'week') return saved;
    } catch (e) {
      /* nessuna preferenza */
    }
    return window.matchMedia('(min-width: 1024px)').matches ? 'week' : 'day';
  }

  // ==================== ELENCO DEL GIORNO ====================

  function entriesFor(date) {
    const bookings = (typeof allBookings !== 'undefined' ? allBookings : []).filter(
      b => b.giorno === date
    );
    const grid = getTimeSlotsForDate(date);
    const entries = [];

    // Blocchi di lavoro consecutivi dello stesso deposito diventano un solo tratto
    const work = bookings
      .filter(b => b.service_id === 'extra_work')
      .sort((a, b) => toMin(a.ora) - toMin(b.ora));
    work.forEach(b => {
      const last = entries[entries.length - 1];
      if (
        last &&
        last.kind === 'work' &&
        String(last.booking.deposit_id) === String(b.deposit_id) &&
        last.end === toMin(b.ora)
      ) {
        last.end += 15;
      } else {
        entries.push({ kind: 'work', start: toMin(b.ora), end: toMin(b.ora) + 15, booking: b });
      }
    });

    bookings
      .filter(b => b.service_id !== 'extra_work')
      .forEach(b => {
        entries.push({
          kind: b.tipo === 'deposito' ? 'dropoff' : 'appointment',
          start: toMin(b.ora),
          end: toMin(b.ora) + duration(b),
          booking: b
        });
      });

    // Ferie: tratti consecutivi di quarti d'ora chiusi
    const closed = (typeof allHolidays !== 'undefined' ? allHolidays : [])
      .filter(h => h.giorno === date)
      .map(h => toMin(h.ora))
      .sort((a, b) => a - b);
    closed.forEach(start => {
      const last = entries.find(e => e.kind === 'closed' && e.end === start);
      if (last) last.end += 15;
      else entries.push({ kind: 'closed', start, end: start + 15 });
    });

    // Fuori griglia: inizio non previsto dagli orari normali o fine oltre il turno
    const gridSet = new Set(grid);
    entries.forEach(e => {
      if (e.kind === 'closed') return;
      const lastQuarter = toTime(e.end - 15);
      e.offGrid = !gridSet.has(toTime(e.start)) || !gridSet.has(lastQuarter);
    });

    // Tratti liberi negli orari normali
    const busy = new Set();
    entries.forEach(e => {
      for (let t = e.start; t < e.end; t += 15) busy.add(t);
    });
    let gap = null;
    grid.forEach((t, i) => {
      const m = toMin(t);
      const contiguous = gap && gap.end === m;
      if (!busy.has(m) && (contiguous || !gap)) {
        if (!gap) gap = { kind: 'free', start: m, end: m + 15 };
        else gap.end += 15;
      } else {
        if (gap) entries.push(gap);
        gap = busy.has(m) ? null : { kind: 'free', start: m, end: m + 15 };
      }
      if (i === grid.length - 1 && gap) entries.push(gap);
    });

    return entries.sort((a, b) => a.start - b.start || (a.kind === 'free' ? 1 : -1));
  }

  function render() {
    const list = $('agenda-list');
    if (!list) return;
    const d = parseDate(day);
    const today = toDateString(new Date());
    $('agenda-title').textContent =
      (day === today ? 'Oggi, ' : '') +
      DAYS[d.getDay()] +
      ' ' +
      d.getDate() +
      ' ' +
      MONTHS[d.getMonth()];
    $('agenda-date').value = day;

    const entries = entriesFor(day);
    const appointments = entries.filter(e => e.kind === 'appointment' || e.kind === 'dropoff');
    const offGrid = entries.filter(e => e.offGrid).length;
    const isOpen = getTimeSlotsForDate(day).length > 0 && d.getDay() !== 0;
    $('agenda-summary').textContent =
      !isOpen && entries.length === 0
        ? 'Officina chiusa.'
        : appointments.length +
          (appointments.length === 1 ? ' appuntamento' : ' appuntamenti') +
          (offGrid ? ' · ' + offGrid + ' fuori dagli orari normali' : '');

    list.textContent = '';
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'agenda-empty';
      li.textContent = isOpen ? 'Nessun appuntamento.' : 'Nessun appuntamento: officina chiusa.';
      list.appendChild(li);
      return;
    }

    entries.forEach(e => list.appendChild(row(e)));
  }

  function row(e) {
    const li = document.createElement('li');
    li.className = 'agenda-row agenda-' + e.kind + (e.offGrid ? ' is-offgrid' : '');

    const when = document.createElement('div');
    when.className = 'agenda-when';
    when.innerHTML =
      '<span class="agenda-start">' +
      toTime(e.start) +
      '</span>' +
      '<span class="agenda-end">' +
      toTime(e.end) +
      '</span>';
    li.appendChild(when);

    const body = document.createElement('div');
    body.className = 'agenda-body';

    if (e.kind === 'free' || e.kind === 'closed') {
      const label = document.createElement('span');
      label.className = 'agenda-label';
      const minutes = e.end - e.start;
      label.textContent =
        (e.kind === 'free' ? 'Libero' : 'Chiuso (ferie)') +
        ' · ' +
        (minutes >= 60
          ? Math.floor(minutes / 60) + ' h ' + (minutes % 60 ? (minutes % 60) + ' min' : '')
          : minutes + ' min');
      body.appendChild(label);
      li.appendChild(body);
      if (e.kind === 'free' && day >= toDateString(new Date())) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn btn-outline btn-sm agenda-add';
        add.textContent = 'Aggiungi';
        add.setAttribute('aria-label', 'Aggiungi un appuntamento alle ' + toTime(e.start));
        add.addEventListener('click', () => openBookingModal(day, toTime(e.start)));
        li.appendChild(add);
      }
      return li;
    }

    const b = e.booking;
    const kind = { appointment: 'Appuntamento', dropoff: 'Consegna', work: 'Lavoro sul veicolo' }[
      e.kind
    ];
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'agenda-open';
    const name = [b.nome, b.cognome].filter(Boolean).join(' ') || 'Senza nome';
    open.innerHTML =
      '<strong class="agenda-name">' +
      escapeHTML(name) +
      '</strong>' +
      '<span class="agenda-meta">' +
      escapeHTML(kind) +
      (b.servizio ? ' · ' + escapeHTML(b.servizio) : '') +
      (b.targa ? ' · <span class="plate-inline">' + escapeHTML(b.targa) + '</span>' : '') +
      '</span>' +
      (e.offGrid ? '<span class="agenda-flag">Fuori dagli orari normali</span>' : '');
    open.addEventListener('click', () => showDetailModal(b));
    body.appendChild(open);
    li.appendChild(body);

    if (b.telefono) {
      const call = document.createElement('a');
      call.className = 'btn btn-quiet btn-sm agenda-call';
      call.href = 'tel:' + String(b.telefono).replace(/[^\d+]/g, '');
      call.textContent = 'Chiama';
      call.setAttribute('aria-label', 'Chiama ' + name);
      li.appendChild(call);
    }
    return li;
  }

  function shiftDay(delta) {
    const d = parseDate(day);
    do {
      d.setDate(d.getDate() + delta);
    } while (d.getDay() === 0); // la domenica è chiusa
    day = toDateString(d);
    render();
  }

  // ==================== SETTIMANA: AVVISO FUORI GRIGLIA ====================

  function renderOffGridBanner() {
    const banner = $('offgrid-banner');
    if (!banner || typeof currentWeekStart === 'undefined' || !currentWeekStart) return;
    const start = new Date(currentWeekStart);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(toDateString(d));
    }
    const hidden = (allBookings || []).filter(b => {
      if (!days.includes(b.giorno)) return false;
      return !new Set(getTimeSlotsForDate(b.giorno)).has(b.ora);
    });
    banner.hidden = hidden.length === 0;
    if (hidden.length === 0) return;
    banner.textContent = '';
    banner.append(
      hidden.length +
        (hidden.length === 1 ? ' appuntamento è' : ' appuntamenti sono') +
        ' fuori dalla griglia di questa settimana (orari estesi). '
    );
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'btn btn-quiet btn-sm';
    link.textContent = 'Apri ' + (hidden.length === 1 ? 'il giorno' : 'il primo giorno');
    link.addEventListener('click', () => {
      day = hidden.map(b => b.giorno).sort()[0];
      setView('day');
      render();
      $('agenda-title').focus();
    });
    banner.appendChild(link);
  }

  // ==================== AVVIO ====================

  // Ogni aggiornamento del calendario (caricamento, spostamenti, cancellazioni) aggiorna l'elenco
  const originalRender = renderCalendar;
  renderCalendar = function () {
    originalRender.apply(this, arguments);
    render();
    renderOffGridBanner();
  };

  document.querySelectorAll('.view-btn').forEach(b =>
    b.addEventListener('click', () => {
      setView(b.dataset.view);
      if (b.dataset.view === 'day') render();
    })
  );
  $('agenda-prev').addEventListener('click', () => shiftDay(-1));
  $('agenda-next').addEventListener('click', () => shiftDay(1));
  $('agenda-today').addEventListener('click', () => {
    day = toDateString(new Date());
    render();
  });
  $('agenda-date').addEventListener('change', e => {
    if (e.target.value) {
      day = e.target.value;
      render();
    }
  });

  setView(initialView());
  render();
})();
