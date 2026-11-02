// Pagina pubblica: giornata dell'officina in quarti d'ora, listino dal gestionale,
// vista esplosa (disegno) e 3D caricato solo su richiesta.
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

  function toDateString(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  async function getJSON(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  // ==================== ACCOUNT ====================

  async function updateAccountLink() {
    try {
      const me = await getJSON('/api/auth/session');
      const link = document.getElementById('account-link');
      if (me.user && link) {
        link.textContent = me.user.isAdmin ? 'Agenda' : 'La tua area';
        link.href = me.user.isAdmin ? '/admin' : '/home';
      }
    } catch (e) {
      /* nessuna sessione: resta "Accedi" */
    }
  }

  // ==================== GIORNATA IN QUARTI D'ORA ====================

  async function renderDay() {
    const shifts = document.getElementById('day-shifts');
    if (!shifts) return;
    try {
      const cfg = await getJSON('/api/config/slots');
      const day = new Date();
      for (let i = 0; i < 14; i++, day.setDate(day.getDate() + 1)) {
        if (!cfg.daysOpen.includes(day.getDay())) continue;
        const date = toDateString(day);
        const data = await getJSON('/api/slots/' + date);
        const free = new Set(data.slots.filter(s => s.available).map(s => s.time));
        if (free.size === 0) continue;
        drawDay(day, cfg, data.slots, free, i === 0);
        return;
      }
    } catch (e) {
      /* rete assente: restano gli orari scritti */
    }
  }

  function drawDay(day, cfg, slots, free, isToday) {
    const all = day.getDay() === 6 ? cfg.saturday : cfg.weekday;
    const listed = new Set(slots.map(s => s.time));
    const morning = all.filter(t => t < '13:00');
    const afternoon = all.filter(t => t >= '13:00');

    const label =
      (isToday ? 'Oggi, ' : '') +
      DAYS[day.getDay()] +
      ' ' +
      day.getDate() +
      ' ' +
      MONTHS[day.getMonth()];
    document.getElementById('day-title').textContent = 'Telemetria · ' + label;
    const first = all.find(t => free.has(t));
    document.getElementById('day-summary').textContent =
      free.size +
      " quarti d'ora liberi su " +
      all.length +
      '. Primo orario libero: ' +
      first +
      '. Ogni segmento vale 15 minuti: chiaro libero, scuro occupato, arancio il primo libero.';

    fillShift(
      document.querySelector('[data-shift="mattina"]'),
      'Mattina',
      morning,
      listed,
      free,
      first
    );
    fillShift(
      document.querySelector('[data-shift="pomeriggio"]'),
      'Pomeriggio',
      afternoon,
      listed,
      free,
      first
    );
  }

  function fillShift(el, name, times, listed, free, first) {
    if (!el || times.length === 0) return;
    el.style.gridTemplateColumns = 'repeat(' + Math.max(times.length, 14) + ', 1fr)';
    const title = document.createElement('span');
    title.className = 'day-shift-label';
    title.textContent = name + ' ' + times[0] + '–' + endOf(times[times.length - 1]);
    el.appendChild(title);
    times.forEach((t, i) => {
      const q = document.createElement('span');
      q.className = 'q';
      q.style.setProperty('--i', i);
      // Gli orari già passati non sono restituiti dal server
      if (!listed.has(t)) q.classList.add('is-past');
      else if (!free.has(t)) q.classList.add('is-busy');
      else if (t === first) q.classList.add('is-first');
      el.appendChild(q);
    });
    el.classList.add('is-filled');
  }

  function endOf(time) {
    const [h, m] = time.split(':').map(Number);
    const end = h * 60 + m + 15;
    return String(Math.floor(end / 60)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0');
  }

  // ==================== LISTINO ====================

  function formatDuration(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return m + ' min';
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  async function renderServices() {
    const cols = document.getElementById('services-cols');
    if (!cols) return;
    try {
      const data = await getJSON('/api/services');
      const groups = { auto: [], moto: [] };
      data.services.forEach(s => (groups[s.tipo_veicolo] || (groups[s.tipo_veicolo] = [])).push(s));
      cols.textContent = '';
      Object.entries(groups).forEach(([tipo, list]) => {
        if (list.length === 0) return;
        const group = document.createElement('div');
        group.className = 'services-group';
        const h3 = document.createElement('h3');
        h3.textContent = tipo === 'moto' ? 'Moto' : 'Auto';
        const count = document.createElement('small');
        count.textContent = list.length + (list.length === 1 ? ' servizio' : ' servizi');
        h3.appendChild(count);
        const ul = document.createElement('ul');
        ul.className = 'services-list';
        list.forEach(s => {
          const consegna = s.tipo_servizio === 'consegna';
          const li = document.createElement('li');
          if (consegna) li.classList.add('is-consegna');
          const name = document.createElement('span');
          name.className = 'svc-name';
          name.textContent = s.nome;
          const kind = document.createElement('span');
          kind.className = 'svc-kind';
          kind.textContent = consegna ? 'Consegna del veicolo' : 'Appuntamento';
          name.appendChild(kind);
          const time = document.createElement('span');
          time.className = 'svc-time';
          time.textContent = consegna ? '30 min' : formatDuration(s.durata_minuti);
          const note = document.createElement('small');
          note.textContent = consegna ? 'accoglienza' : 'in agenda';
          time.appendChild(note);
          li.append(name, time);
          ul.appendChild(li);
        });
        group.append(h3, ul);
        cols.appendChild(group);
      });
    } catch (e) {
      /* resta il rimando alla prenotazione */
    }
  }

  // ==================== AUTO: IMMAGINE E 3D ====================
  // L'immagine (resa dallo stesso modello 3D) è sempre presente e basta da sola.
  // Il 3D si carica: subito dopo il caricamento su schermi larghi con WebGL, senza
  // risparmio dati né movimento ridotto; altrimenti solo con "Ruota in 3D".

  let scene3d = null;
  let exploded = true;

  function setupCar() {
    const stage = document.getElementById('stage-car');
    const poster = document.getElementById('stage-poster');
    const toggle = document.getElementById('explode-toggle');
    const open3d = document.getElementById('open-3d');
    const status = document.getElementById('mechanics-status');
    if (!stage || !toggle) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = !!(navigator.connection && navigator.connection.saveData);

    toggle.addEventListener('click', () => {
      exploded = !exploded;
      toggle.textContent = exploded ? 'Esplosa' : 'Assemblata';
      toggle.setAttribute('aria-pressed', String(exploded));
      poster.src = exploded ? '/images/auto-esplosa.webp' : '/images/auto-assemblata.webp';
      poster.alt = exploded
        ? 'Auto stilizzata in vista esplosa: abitacolo, carrozzeria, sedili, motore, telaio e ruote separati'
        : 'Auto stilizzata assemblata';
      if (scene3d) scene3d.setExploded(exploded);
    });

    if (!hasWebGL()) return;

    async function load(auto) {
      if (scene3d) return;
      open3d.disabled = true;
      if (!auto) status.textContent = 'Caricamento del 3D…';
      const started = performance.now();
      try {
        const mod = await import('/js/garage3d.js');
        scene3d = await mod.mount(stage, {
          exploded,
          intro: auto && !reduced,
          reducedMotion: reduced,
          onLost: () => {
            stage.classList.remove('is-3d');
            scene3d = null;
            open3d.hidden = false;
            open3d.disabled = false;
            status.textContent = "Il 3D si è interrotto: resta l'immagine.";
          }
        });
        stage.classList.add('is-3d');
        open3d.hidden = true;
        status.textContent = auto ? '' : 'Trascina in orizzontale per ruotare.';
        window.__garage3dReadyMs = Math.round(performance.now() - started);
      } catch (e) {
        open3d.disabled = false;
        status.textContent = "Il 3D non è disponibile su questo dispositivo: resta l'immagine.";
      }
    }

    open3d.hidden = false;
    open3d.addEventListener('click', () => load(false));

    const wide = window.matchMedia('(min-width: 1024px)').matches;
    const lowMemory = navigator.deviceMemory && navigator.deviceMemory < 4;
    if (wide && !saveData && !reduced && !lowMemory) {
      const go = () => load(true);
      const idle = window.requestIdleCallback || (cb => setTimeout(cb, 600));
      if (document.readyState === 'complete') idle(go);
      else window.addEventListener('load', () => idle(go), { once: true });
    }
  }

  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  updateAccountLink();
  renderDay();
  renderServices();
  setupCar();
})();
