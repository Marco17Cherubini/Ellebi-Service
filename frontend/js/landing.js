// Pagina pubblica: l'auto in vista esplosa è il menu del sito.
// Ogni pezzo apre un pannello con i servizi che lo riguardano (letti dal gestionale),
// gli orari di oggi o i contatti. Funziona con l'immagine statica; il 3D è un di più
// che si carica solo quando serve e usa gli stessi pezzi e le stesse etichette.
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
  const PHONE = '+393663043908';

  // Quali servizi stanno sotto quale pezzo: è solo una scelta di presentazione basata sul
  // nome (non una regola di business). Le consegne stanno sempre sotto la carrozzeria;
  // ciò che non corrisponde a nulla finisce sotto "Meccanica".
  const PARTS = {
    motore: {
      title: 'Meccanica',
      text: 'Tagliandi, distribuzione e tutto ciò che sta sotto il cofano.',
      match: /tagliand|distribuz|olio|motor|candel|cinghi/i
    },
    ruote: {
      title: 'Gomme e freni',
      text: 'Cambio e vendita gomme, freni.',
      match: /gomm|freni|pneumat/i
    },
    carrozzeria: {
      title: 'Consegna del veicolo',
      text: "Per i lavori lunghi lasci il veicolo. Prenoti 30 minuti di accoglienza per consegnarlo e raccontare il problema: non è la durata del lavoro. L'officina pianifica la riparazione e ti scrive quando è pronto; i tempi si concordano in officina."
    },
    telaio: {
      title: 'Orari',
      text: "Quando l'officina è aperta e quanta parte della giornata è ancora libera."
    },
    cabina: {
      title: 'Contatti',
      text: 'Per chi preferisce parlare: rispondiamo al telefono negli orari di apertura.'
    }
  };

  const $ = id => document.getElementById(id);
  const state = { exploded: true, active: null, services: null, daySummary: null };
  let scene3d = null;

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

  // Durata pubblica di un servizio: quella del listino; se il listino non la definisce,
  // si dice che sarà concordata (nessun valore inventato)
  function durationLabel(s) {
    return s.durata_definita === false ? 'durata da concordare' : formatDuration(s.durata_minuti);
  }

  function formatDuration(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return m + ' min';
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  // ==================== ACCOUNT ====================

  async function updateAccountLink() {
    try {
      const me = await getJSON('/api/auth/session');
      const link = $('account-link');
      if (me.user && link) {
        link.textContent = me.user.isAdmin ? 'Agenda officina' : 'Le tue prenotazioni';
        link.href = me.user.isAdmin ? '/admin' : '/home';
      }
    } catch (e) {
      /* nessuna sessione: resta "Accedi" */
    }
  }

  // ==================== SERVIZI ====================

  // Riga di servizio: titolo e, a destra, durata (con "consegna" e, nei pannelli che
  // mescolano auto e moto, il tipo di veicolo). Tutta la riga porta alla prenotazione.
  function serviceLink(s, { showVehicle = false } = {}) {
    const consegna = s.tipo_servizio === 'consegna';
    const a = document.createElement('a');
    a.className = 'row-link';
    a.href = '/prenota?servizio=' + encodeURIComponent(s.id);
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = s.nome;
    const meta = document.createElement('span');
    meta.className = 'row-meta';
    const bits = [];
    if (showVehicle) bits.push(s.tipo_veicolo === 'moto' ? 'Moto' : 'Auto');
    bits.push(consegna ? 'Consegna · accoglienza 30 min' : durationLabel(s));
    meta.textContent = bits.join(' · ') + ' →';
    a.append(title, meta);
    return a;
  }

  async function loadServices() {
    if (state.services) return state.services;
    try {
      const data = await getJSON('/api/services');
      state.services = data.services || [];
    } catch (e) {
      state.services = [];
    }
    showDurationRange(state.services);
    return state.services;
  }

  // "Appuntamento": l'intervallo reale delle durate del listino (es. "45 min – 2 h")
  function showDurationRange(services) {
    const el = $('way-durations');
    const mins = services
      .filter(s => s.tipo_servizio !== 'consegna' && s.durata_definita !== false)
      .map(s => Number(s.durata_minuti))
      .filter(n => n > 0);
    if (!el || !mins.length) return;
    const lo = Math.min(...mins);
    const hi = Math.max(...mins);
    el.textContent =
      lo === hi ? formatDuration(lo) : formatDuration(lo) + ' – ' + formatDuration(hi);
  }

  async function renderServicesSection() {
    const cols = $('services-cols');
    const services = await loadServices();
    if (!cols || services.length === 0) return;
    cols.textContent = '';
    ['auto', 'moto'].forEach(tipo => {
      const list = services.filter(s => s.tipo_veicolo === tipo);
      if (list.length === 0) return;
      const group = document.createElement('div');
      group.className = 'services-group';
      const head = document.createElement('div');
      head.className = 'services-group-head';
      const h3 = document.createElement('h3');
      h3.textContent = tipo === 'moto' ? 'Moto' : 'Auto';
      const count = document.createElement('span');
      count.className = 'services-count';
      count.textContent = list.length + (list.length === 1 ? ' servizio' : ' servizi');
      head.append(h3, count);
      group.appendChild(head);
      list.forEach(s => group.appendChild(serviceLink(s)));
      cols.appendChild(group);
    });
  }

  // ==================== GIORNATA DI OGGI ====================

  function endOf(time) {
    const [h, m] = time.split(':').map(Number);
    const end = h * 60 + m + 15;
    return String(Math.floor(end / 60)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0');
  }

  async function loadDay() {
    if (state.daySummary) return state.daySummary;
    try {
      const cfg = await getJSON('/api/config/slots');
      const day = new Date();
      for (let i = 0; i < 14; i++, day.setDate(day.getDate() + 1)) {
        if (!cfg.daysOpen.includes(day.getDay())) continue;
        const data = await getJSON('/api/slots/' + toDateString(day));
        const free = new Set(data.slots.filter(s => s.available).map(s => s.time));
        if (free.size === 0) continue;
        const all = day.getDay() === 6 ? cfg.saturday : cfg.weekday;
        state.daySummary = {
          day: new Date(day),
          isToday: i === 0,
          all,
          listed: new Set(data.slots.map(s => s.time)),
          free
        };
        return state.daySummary;
      }
    } catch (e) {
      /* rete assente: restano gli orari scritti */
    }
    state.daySummary = { none: true };
    return state.daySummary;
  }

  function shiftBars(name, times, info, first) {
    const wrap = document.createElement('div');
    wrap.className = 'day-shift';
    wrap.style.gridTemplateColumns = 'repeat(' + times.length + ', 1fr)';
    const label = document.createElement('span');
    label.className = 'day-shift-label';
    label.textContent = name + ' ' + times[0] + '–' + endOf(times[times.length - 1]);
    wrap.appendChild(label);
    times.forEach(t => {
      const q = document.createElement('span');
      q.className = 'q';
      if (!info.listed.has(t)) q.classList.add('is-past');
      else if (!info.free.has(t)) q.classList.add('is-busy');
      else if (t === first) q.classList.add('is-first');
      wrap.appendChild(q);
    });
    return wrap;
  }

  // ==================== PANNELLO ====================

  async function fillPanel(part) {
    const body = $('part-body');
    body.textContent = '';
    if (part === 'carrozzeria') {
      const services = await loadServices();
      services
        .filter(s => s.tipo_servizio === 'consegna')
        .forEach(s => body.appendChild(serviceLink(s)));
    } else if (part === 'motore' || part === 'ruote') {
      const services = await loadServices();
      const mine = services.filter(s => {
        if (s.tipo_servizio === 'consegna') return false;
        const wheels = PARTS.ruote.match.test(s.nome);
        return part === 'ruote' ? wheels : !wheels;
      });
      mine.forEach(s => body.appendChild(serviceLink(s, { showVehicle: true })));
      if (mine.length === 0) {
        const p = document.createElement('p');
        p.className = 'part-note';
        p.textContent = 'Nessun servizio di questo tipo è prenotabile online in questo periodo.';
        body.appendChild(p);
      }
    } else if (part === 'telaio') {
      const info = await loadDay();
      if (info.none) {
        const p = document.createElement('p');
        p.className = 'part-note';
        p.textContent = 'Lun–ven 8:30–12:30 e 14:30–18:30, sabato 8:30–12:00. Domenica chiuso.';
        body.appendChild(p);
        return;
      }
      const label =
        (info.isToday ? 'Oggi, ' : '') +
        DAYS[info.day.getDay()] +
        ' ' +
        info.day.getDate() +
        ' ' +
        MONTHS[info.day.getMonth()];
      const first = info.all.find(t => info.free.has(t));
      const p = document.createElement('p');
      p.className = 'part-note';
      p.style.marginTop = '0';
      p.textContent =
        label +
        ': ' +
        formatDuration(info.free.size * 15) +
        ' ancora liberi in agenda. Il primo orario libero è alle ' +
        first +
        ' (in rame). La durata di ogni intervento dipende dal servizio scelto.';
      body.appendChild(p);
      body.appendChild(
        shiftBars(
          'Mattina',
          info.all.filter(t => t < '13:00'),
          info,
          first
        )
      );
      const afternoon = info.all.filter(t => t >= '13:00');
      if (afternoon.length) body.appendChild(shiftBars('Pomeriggio', afternoon, info, first));
      const link = document.createElement('a');
      link.className = 'row-link';
      link.href = '/prenota';
      link.style.marginTop = '24px';
      const t = document.createElement('span');
      t.className = 'row-title';
      t.textContent = 'Scegli un orario';
      const m = document.createElement('span');
      m.className = 'row-meta';
      m.textContent = 'Prenota →';
      link.append(t, m);
      body.appendChild(link);
    } else if (part === 'cabina') {
      const lines = document.createElement('div');
      lines.className = 'part-lines';
      const phone = document.createElement('a');
      phone.href = 'tel:' + PHONE;
      phone.textContent = '366 304 3908';
      const mail = document.createElement('a');
      mail.href = 'mailto:ellebi_service@libero.it';
      mail.textContent = 'ellebi_service@libero.it';
      const addr = document.createElement('span');
      addr.textContent = 'Via Zerbi 21, San Giuliano Vecchio (AL)';
      lines.append(phone, mail, addr);
      body.appendChild(lines);
    }
  }

  async function openPart(part, { focus = true } = {}) {
    const cfg = PARTS[part];
    if (!cfg) return;
    state.active = part;
    document.querySelectorAll('.hotspot').forEach(b => {
      b.setAttribute('aria-expanded', String(b.dataset.part === part));
    });
    if (scene3d) scene3d.highlight(part);
    const panel = $('part-panel');
    $('part-title').textContent = cfg.title;
    $('part-text').textContent = cfg.text;
    panel.hidden = false;
    $('stage-car').parentElement.classList.add('has-panel');
    panel.classList.remove('is-entering');
    void panel.offsetWidth; // riavvia l'ingresso
    panel.classList.add('is-entering');
    await fillPanel(part);
    if (state.active !== part) return;
    if (focus) {
      $('part-title').focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 1099px)').matches) {
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function closePart() {
    const was = state.active;
    state.active = null;
    $('part-panel').hidden = true;
    $('stage-car').parentElement.classList.remove('has-panel');
    document.querySelectorAll('.hotspot').forEach(b => b.setAttribute('aria-expanded', 'false'));
    if (scene3d) scene3d.highlight(null);
    const btn = was && document.querySelector('.hotspot[data-part="' + was + '"]');
    if (btn) btn.focus();
  }

  function setupMenu() {
    document.querySelectorAll('.hotspot').forEach(b => {
      b.addEventListener('click', () => {
        if (state.active === b.dataset.part) closePart();
        else openPart(b.dataset.part);
      });
      b.addEventListener('mouseenter', () => scene3d && scene3d.highlight(b.dataset.part));
      b.addEventListener('mouseleave', () => scene3d && scene3d.highlight(state.active));
      b.addEventListener('focus', () => scene3d && scene3d.highlight(b.dataset.part));
      b.addEventListener('blur', () => scene3d && scene3d.highlight(state.active));
    });
    $('part-close').addEventListener('click', closePart);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.active) closePart();
    });
  }

  // ==================== POSIZIONI DELLE ETICHETTE ====================

  // Con l'immagine le posizioni sono quelle calcolate dal modello (data-x-…, data-y-…);
  // con il 3D vengono proiettate a ogni fotogramma, così seguono la rotazione.
  function placeFromPoster() {
    const key = state.exploded ? 'esplosa' : 'assemblata';
    document.querySelectorAll('.hotspot').forEach(b => {
      b.style.setProperty('--x', b.dataset['x' + cap(key)]);
      b.style.setProperty('--y', b.dataset['y' + cap(key)]);
      b.classList.toggle('is-left', Number(b.dataset['x' + cap(key)]) > 62);
    });
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function placeFrom3D(positions, yaw) {
    document.querySelectorAll('.hotspot').forEach(b => {
      const p = positions[b.dataset.part === 'cabina' ? 'cabina' : b.dataset.part];
      if (!p) return;
      b.style.setProperty('--x', p.x);
      b.style.setProperty('--y', p.y);
      b.classList.toggle('is-left', p.x > 62);
    });
    $('stage-car').parentElement.style.setProperty('--yaw', yaw.toFixed(3));
  }

  // ==================== VISTA E 3D ====================

  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  function setupCar() {
    const stage = $('stage-car');
    const poster = $('stage-poster');
    const toggle = $('explode-toggle');
    const open3d = $('open-3d');
    const status = $('mechanics-status');

    toggle.addEventListener('click', () => {
      state.exploded = !state.exploded;
      toggle.textContent = state.exploded ? 'Vista esplosa' : 'Assemblata';
      toggle.setAttribute('aria-pressed', String(state.exploded));
      poster.src = state.exploded ? '/images/auto-esplosa.webp' : '/images/auto-assemblata.webp';
      poster.alt = state.exploded
        ? 'Auto stilizzata in vista esplosa: abitacolo, carrozzeria, motore, telaio e ruote separati'
        : 'Auto stilizzata assemblata';
      if (scene3d) scene3d.setExploded(state.exploded);
      else placeFromPoster();
    });

    if (!hasWebGL()) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = !!(navigator.connection && navigator.connection.saveData);

    async function load(auto) {
      if (scene3d) return;
      open3d.disabled = true;
      if (!auto) status.textContent = 'Caricamento del 3D…';
      const started = performance.now();
      try {
        const mod = await import('/js/garage3d.js');
        scene3d = await mod.mount(stage, {
          exploded: state.exploded,
          intro: auto && !reduced,
          reducedMotion: reduced,
          onPick: part => openPart(part),
          onHover: part => {
            document
              .querySelectorAll('.hotspot')
              .forEach(b => b.classList.toggle('is-hover', b.dataset.part === part));
          },
          onFrame: placeFrom3D,
          onLost: () => {
            stage.classList.remove('is-3d');
            scene3d = null;
            placeFromPoster();
            open3d.hidden = false;
            open3d.disabled = false;
            status.textContent = "Il 3D si è interrotto: resta l'immagine.";
          }
        });
        stage.classList.add('is-3d');
        open3d.hidden = true;
        status.textContent = auto ? '' : 'Trascina in orizzontale per ruotare.';
        if (state.active) scene3d.highlight(state.active);
        window.__garage3dReadyMs = Math.round(performance.now() - started);
      } catch (e) {
        open3d.disabled = false;
        status.textContent = "Il 3D non è disponibile su questo dispositivo: resta l'immagine.";
      }
    }

    open3d.hidden = false;
    open3d.addEventListener('click', () => load(false));

    // Avvio automatico, differito, solo dove è sostenibile: schermo largo, senza risparmio
    // dati, senza movimento ridotto e con memoria sufficiente. Altrimenti c'è il pulsante.
    const wide = window.matchMedia('(min-width: 1024px)').matches;
    const lowMemory = navigator.deviceMemory && navigator.deviceMemory < 4;
    if (wide && !saveData && !reduced && !lowMemory) {
      const go = () => load(true);
      const idle = window.requestIdleCallback || (cb => setTimeout(cb, 600));
      if (document.readyState === 'complete') idle(go);
      else window.addEventListener('load', () => idle(go), { once: true });
    }
  }

  // Comparsa progressiva delle sezioni: una volta sola, solo per ciò che è sotto la piega.
  // Senza JS o con movimento ridotto tutto è già visibile.
  function setupReveal() {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const targets = document.querySelectorAll(
      '.ways h2, .way, .services-head, .services-cols, .contact h2, .hours, .contact-lines, .cta-band > *'
    );
    document.documentElement.classList.add('js-reveal');
    const io = new IntersectionObserver(
      entries =>
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px' }
    );
    targets.forEach((el, i) => {
      el.classList.add('reveal');
      el.style.setProperty('--d', (i % 3) * 70 + 'ms');
      io.observe(el);
    });
  }

  updateAccountLink();
  setupReveal();
  setupMenu();
  setupCar();
  renderServicesSection();
})();
