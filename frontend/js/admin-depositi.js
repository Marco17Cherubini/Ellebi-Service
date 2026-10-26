/* ================================================================
   admin-depositi.js — Gestione Lavori Straordinari
   ================================================================ */

var allDeposits = [];
var saveTimers = {};   // debounce per salvataggio note
var finishConfirmModal = null;
  var attesaConfirmModal = null;

// ── Init ─────────────────────────────────────────────────────

async function init() {
  try {
    var res = await apiRequest('/auth/me');
    if (!res.success || !res.user.isAdmin) { window.location.href = '/login'; return; }
    await loadDeposits();
    showLoginBanner();
    
    // Setup event listener per maxDeposits
    var saveMaxBtn = document.getElementById('save-max-btn');
    if (saveMaxBtn) {
      saveMaxBtn.addEventListener('click', async function() {
        var inputMax = document.getElementById('input-counter-max');
        if (!inputMax) return;
        var newMax = parseInt(inputMax.value, 10);
        if (isNaN(newMax) || newMax < 1) {
          alert("Inserisci un numero valido maggiore di 0");
          return;
        }
        try {
          var updateRes = await apiRequest('/settings/maxDeposits', {
            method: 'PUT',
            body: JSON.stringify({ maxDeposits: newMax })
          });
          if (updateRes.success) {
            alert("Limite massimo aggiornato con successo");
            await loadDeposits();
          } else {
            alert(updateRes.error || "Errore nell'aggiornamento del limite");
          }
        } catch(e) {
          console.error(e);
          alert("Errore nell'aggiornamento del limite");
        }
      });
    }

  } catch (e) {
    console.error('Errore init depositi:', e);
    window.location.href = '/login';
  }
}

// ── Load deposits ─────────────────────────────────────────────

async function loadDeposits() {
  try {
    var res = await apiRequest('/admin/deposits/all');
    if (!res.success) return;

    allDeposits = res.deposits || [];
    var counterEl = document.getElementById('counter-active');
    var maxEl = document.getElementById('input-counter-max');
    if (counterEl) counterEl.textContent = res.count;
    if (maxEl) maxEl.value = res.max;

    renderDeposits();
  } catch (e) {
    console.error('Errore caricamento depositi:', e);
  } finally {
    document.getElementById('loading-state').style.display = 'none';
  }
}

// ── Banner login ──────────────────────────────────────────────

function showLoginBanner() {
  var attesa = allDeposits.filter(function(d) { return d.stato === 'in_attesa'; }).length;
  if (attesa <= 0) return;

  var banner = document.getElementById('login-banner');
  var text = document.getElementById('login-banner-text');
  if (!banner || !text) return;

  var label = attesa === 1
    ? 'Hai 1 lavoro straordinario da fissare'
    : 'Hai ' + attesa + ' lavori straordinari da fissare';
  text.textContent = label;
  banner.style.display = 'flex';

  document.getElementById('login-banner-close').addEventListener('click', function() {
    banner.style.display = 'none';
  });
}

// ── Render ────────────────────────────────────────────────────

function renderDeposits() {
  var active    = allDeposits.filter(function(d) { return d.stato !== 'completato'; });
  var completed = allDeposits.filter(function(d) { return d.stato === 'completato'; });

  var grid    = document.getElementById('depositi-grid');
  var empty   = document.getElementById('empty-state');
  var storico = document.getElementById('storico-section');
  var sGrid   = document.getElementById('storico-grid');

  if (active.length === 0) {
    grid.style.display = 'none';
    empty.style.display = '';
  } else {
    empty.style.display = 'none';
    grid.style.display = '';
    grid.innerHTML = active.map(buildDepositCard).join('');
    attachCardListeners(grid);
  }

  if (completed.length > 0) {
    storico.classList.remove('hidden');
    storico.style.display = '';
    var storicoToggle = document.getElementById('storico-toggle');
    if (storicoToggle) storicoToggle.textContent = 'Storico lavori completati (' + completed.length + ')';
    sGrid.innerHTML = completed.map(buildStoricaCard).join('');
    attachCardListeners(sGrid);
    // Aperto di default
    storico.classList.add('open');
  } else {
    storico.classList.add('hidden');
    storico.style.display = 'none';
  }
}

// ── Helpers ───────────────────────────────────────────────────

function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  var parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function statoLabel(stato) {
  var map = { in_attesa: 'Attesa', in_corso: 'In corso', completato: 'Finito' };
  return map[stato] || stato;
}

// ── Build card HTML ───────────────────────────────────────────

function buildDepositCard(deposit) {
  var stato   = deposit.stato || 'in_attesa';
  var id      = deposit.id;
  var nome    = ((deposit.nome || '') + ' ' + (deposit.cognome || '')).trim();
  var targa   = deposit.targa || '';
  var modello = deposit.modello || '';
  var servizio = deposit.servizio || '';

  // Dati booking collegato
  var bGiorno  = deposit.booking_giorno  || '';
  var bOra     = deposit.booking_ora     || '';
  var bDurata  = deposit.booking_durata  || '';

  var veicolo = [targa, modello].filter(Boolean).join(' · ') || '—';
  var noteCliente  = deposit.note_cliente  || '';
  var notaInterna  = deposit.nota_lorenzo  || '';
  var calcOreResidue = deposit.ore_residue != null ? parseFloat(deposit.ore_residue) : parseFloat(deposit.ore_stimate);
  var oreResidueVal = (calcOreResidue && calcOreResidue > 0) ? calcOreResidue : '';

  // ── Pill stato sul header
  var pillHtml = '<span class="dc-stato-pill ' + stato + '">' + statoLabel(stato) + '</span>';

  // ── Targa badge header
  var targaBadge = targa
    ? '<span class="dc-sep">·</span><span class="dc-targa-inline">' + targa + '</span>'
    : '';

  // ── Servizio badge header
  var servizioBadge = servizio
    ? '<span class="dc-sep">·</span><span class="badge-special">' + servizio + '</span>'
    : '';

  // ── Booking details section
  var bookingDetailsHtml = '';
  if (bGiorno || bOra) {
    bookingDetailsHtml =
      '<div class="dc-booking-details">' +
      (servizio ? '<span class="dc-detail-item"><strong>Tipologia:</strong> ' + servizio + '</span>' : '') +
      (targa    ? '<span class="dc-detail-item"><strong>Targa:</strong> ' + targa + '</span>' : '') +
      (modello  ? '<span class="dc-detail-item"><strong>Modello:</strong> ' + modello + '</span>' : '') +
      (bGiorno  ? '<span class="dc-detail-item"><strong>Data:</strong> ' + formatDateDisplay(bGiorno) + '</span>' : '') +
      (bOra     ? '<span class="dc-detail-item"><strong>Ora:</strong> ' + bOra + '</span>' : '') +
      (bDurata  ? '<span class="dc-detail-item"><strong>Durata:</strong> ' + bDurata + ' min</span>' : '') +
      (deposit.email   ? '<span class="dc-detail-item"><strong>Email:</strong> ' + deposit.email + '</span>' : '') +
      (deposit.telefono ? '<span class="dc-detail-item"><strong>Telefono:</strong> ' + deposit.telefono + '</span>' : '') +
      '</div>';
  } else {
    // Fallback: mostra almeno email/telefono/modello
    var hasInfo = deposit.email || deposit.telefono || modello;
    if (hasInfo) {
      bookingDetailsHtml =
        '<div class="dc-booking-details">' +
        (servizio         ? '<span class="dc-detail-item"><strong>Tipologia:</strong> ' + servizio + '</span>' : '') +
        (targa            ? '<span class="dc-detail-item"><strong>Targa:</strong> ' + targa + '</span>' : '') +
        (modello          ? '<span class="dc-detail-item"><strong>Modello:</strong> ' + modello + '</span>' : '') +
        (deposit.email    ? '<span class="dc-detail-item"><strong>Email:</strong> ' + deposit.email + '</span>' : '') +
        (deposit.telefono ? '<span class="dc-detail-item"><strong>Telefono:</strong> ' + deposit.telefono + '</span>' : '') +
        '</div>';
    }
  }

  // ── Action buttons nel body espanso
  // Logica:
  //   in_attesa  → [In corso] [Finito]
  //   in_corso   → [Attesa] [Finito]
  //   completato → (nessun bottone)
  var buttons = '';
  var pianificaBtn = '<button class="dc-btn dc-btn-pianifica" data-action="pianifica" data-id="' + id + '">Pianifica a Calendario</button>';
  
  if (stato === 'in_attesa') {
    buttons =
      pianificaBtn +
      '<button class="dc-btn dc-btn-incorso" data-action="in_corso"   data-id="' + id + '">In corso</button>' +
      '<button class="dc-btn dc-btn-finito"  data-action="completato"  data-id="' + id + '" data-email="' + (deposit.email || '') + '">Finito</button>';
  } else if (stato === 'in_corso') {
    buttons =
      pianificaBtn +
      '<button class="dc-btn dc-btn-attesa"  data-action="in_attesa"  data-id="' + id + '">Attesa</button>' +
      '<button class="dc-btn dc-btn-finito"  data-action="completato"  data-id="' + id + '" data-email="' + (deposit.email || '') + '">Finito</button>';
  }

  var footerHtml = buttons
    ? '<div class="deposit-card-footer">' + buttons + '</div>'
    : '';

  return (
    '<div class="deposit-card stato-' + stato + '" id="deposit-card-' + id + '">' +

    // ── Header sempre visibile (click per espandere)
    '<div class="deposit-card-header" data-card-id="' + id + '">' +
      '<div class="dc-header-info">' +
        '<span class="dc-name">' + nome + '</span>' +
        targaBadge +
        servizioBadge +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        pillHtml +
        '<span class="dc-chevron">▼</span>' +
      '</div>' +
    '</div>' +

    // ── Body espandibile
    '<div class="deposit-card-body">' +
      bookingDetailsHtml +

      '<label>Note cliente</label>' +
      '<div class="dc-note-cliente">' +
        (noteCliente
          ? noteCliente
          : '<em style="opacity:0.5;">Nessuna nota dal cliente</em>') +
      '</div>' +

      '<label>Note interne</label>' +
      '<textarea class="dc-nota-interna" data-id="' + id + '" placeholder="Annotazioni di lavoro…">' +
        notaInterna +
      '</textarea>' +

      '<label>Ore residue stimate</label>' +
      '<div class="dc-ore-row">' +
        '<input type="number" class="dc-ore-input" data-id="' + id + '" min="0" step="0.5" value="' + oreResidueVal + '" placeholder="h">' +
        '<span style="font-size:0.8rem;color:var(--color-text-secondary,#888);">ore</span>' +
      '</div>' +

    '</div>' +

    footerHtml +
    '</div>'
  );
}

// ── Event listeners ───────────────────────────────────────────

function attachCardListeners(container) {
  // Toggle expand/collapse
  container.querySelectorAll('.deposit-card-header').forEach(function(header) {
    header.addEventListener('click', function(e) {
      // Non espandere se si clicca su un button
      if (e.target.closest('.dc-btn')) return;
      var cardId = header.dataset.cardId;
      var card = document.getElementById('deposit-card-' + cardId);
      if (card) card.classList.toggle('expanded');
    });
  });

  // Stato buttons
  container.querySelectorAll('.dc-btn[data-action]').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      var action = btn.dataset.action;
      var id = btn.dataset.id;
      if (action === 'pianifica') {
        var oreInp = document.querySelector('.dc-ore-input[data-id="' + id + '"]');
        var oreVal = oreInp && oreInp.value ? parseFloat(oreInp.value) : 0;
        if (oreVal > 0) {
          btn.classList.add('dc-btn-saving');
          btn.disabled = true;
          await saveOre(id, oreVal);
          window.location.href = '/admin.html?assignDeposit=' + id + '&hours=' + oreVal;
        } else {
          alert('Inserire un numero di ore (es. 2.5) prima di pianificare.');
        }
        return;
      }
      handleStatusChange(id, action, btn, btn.dataset.email || '');
    });
  });

  // Nota interna (debounce 1s)
  container.querySelectorAll('.dc-nota-interna').forEach(function(ta) {
    ta.addEventListener('input', function() {
      var id = ta.dataset.id;
      clearTimeout(saveTimers[id + '_nota']);
      saveTimers[id + '_nota'] = setTimeout(function() {
        saveNota(id, ta.value);
      }, 1000);
    });
    // Blocca propagazione click per non espandere/collassare quando si clicca dentro
    ta.addEventListener('click', function(e) { e.stopPropagation(); });
  });

  // Ore residue (save on blur)
  container.querySelectorAll('.dc-ore-input').forEach(function(inp) {
    inp.addEventListener('change', function() { saveOre(inp.dataset.id, inp.value); });
    inp.addEventListener('click', function(e) { e.stopPropagation(); });
  });
}

// ── API calls ─────────────────────────────────────────────────

async function handleStatusChange(id, nuovoStato, btn, email) {
  if (nuovoStato === 'completato') {
    if (!finishConfirmModal) finishConfirmModal = new Modal('finish-confirm-modal');
    
    // Gestione bottoni modale
    const confirmBtn = document.getElementById('finish-confirm');
    const cancelBtn = document.getElementById('finish-cancel');
    
    // Rimuovi vecchi listener clonando i nodi
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newConfirmBtn.addEventListener('click', async () => {
      finishConfirmModal.close();
      await performStatusChange(id, nuovoStato, btn, email);
    });

    newCancelBtn.addEventListener('click', () => {
      finishConfirmModal.close();
    });

    finishConfirmModal.open();
  } else if (nuovoStato === 'in_attesa') {
    if (!attesaConfirmModal) attesaConfirmModal = new Modal('attesa-confirm-modal');

    const confirmBtn = document.getElementById('attesa-confirm');
    const cancelBtn = document.getElementById('attesa-cancel');

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newConfirmBtn.addEventListener('click', async () => {
      attesaConfirmModal.close();
      await performStatusChange(id, nuovoStato, btn, email);
    });

    newCancelBtn.addEventListener('click', () => {
      attesaConfirmModal.close();
    });

    attesaConfirmModal.open();
  } else {
    await performStatusChange(id, nuovoStato, btn, email);
  }
}

async function performStatusChange(id, nuovoStato, btn, email) {
  btn.classList.add('dc-btn-saving');
  btn.disabled = true;

  try {
    var nota = '';
    var ta = document.querySelector('.dc-nota-interna[data-id="' + id + '"]');
    if (ta) nota = ta.value;

    var res = await apiRequest('/admin/deposits/' + id + '/status', {
      method: 'POST',
      body: JSON.stringify({ stato: nuovoStato, nota_lorenzo: nota })
    });

    if (res.success) {
      if (nuovoStato === 'completato') {
        // Mostra banner email
        showEmailBanner(email);
        // Animazione out
        var card = document.getElementById('deposit-card-' + id);
        if (card) {
          card.style.transition = 'opacity 0.4s, transform 0.4s';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          setTimeout(function() { loadDeposits(); }, 400);
        } else {
          loadDeposits();
        }
      } else {
        loadDeposits();
      }
    }
  } catch (e) {
    console.error('Errore cambio stato:', e);
    btn.classList.remove('dc-btn-saving');
    btn.disabled = false;
  }
}
// ── Email banner ──────────────────────────────────────────────

function showEmailBanner(email) {
  var existing = document.querySelector('.deposit-email-banner');
  if (existing) existing.remove();

  var banner = document.createElement('div');
  banner.className = 'deposit-email-banner';
  banner.innerHTML =
    '<span>✅</span>' +
    '<span>Lavoro completato — notifica ritiro inviata' +
    (email ? ' a <strong>' + email + '</strong>' : '') +
    '</span>';
  document.body.appendChild(banner);

  setTimeout(function() {
    banner.style.transition = 'opacity 0.4s, transform 0.4s';
    banner.style.opacity = '0';
    banner.style.transform = 'translateX(-50%) translateY(-16px)';
    setTimeout(function() { banner.remove(); }, 400);
  }, 4000);
}

async function saveNota(id, nota) {
  try {
    await apiRequest('/admin/deposits/' + id + '/nota', {
      method: 'PUT',
      body: JSON.stringify({ nota_lorenzo: nota })
    });
  } catch (e) { /* silenzioso */ }
}

async function saveOre(id, ore) {
  try {
    await apiRequest('/admin/deposits/' + id + '/ore', {
      method: 'PUT',
      body: JSON.stringify({ ore_residue: parseFloat(ore) || 0 })
    });
  } catch (e) { /* silenzioso */ }
}

// ── Storico toggle ────────────────────────────────────────────

document.getElementById('storico-toggle').addEventListener('click', function() {
  document.getElementById('storico-section').classList.toggle('open');
});

// ── Build storico card HTML (read-only) ───────────────────────

function buildStoricaCard(deposit) {
  var id      = deposit.id;
  var nome    = ((deposit.nome || '') + ' ' + (deposit.cognome || '')).trim() || '—';
  var targa   = deposit.targa   || '';
  var modello = deposit.modello || '';
  var servizio = deposit.servizio || '';
  var bGiorno  = deposit.booking_giorno || '';
  var bOra     = deposit.booking_ora    || '';
  var noteCliente  = deposit.note_cliente || '';
  var notaInterna  = deposit.nota_lorenzo || '';
  var oreStimate   = parseFloat(deposit.ore_stimate) || 0;
  var createdAt    = deposit.created_at ? deposit.created_at.slice(0, 10) : '';
  var createdDisplay = createdAt ? (function(d) {
    var p = d.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d;
  })(createdAt) : '';

  var targaBadge = targa
    ? '<span class="dc-sep">\u00b7</span><span class="dc-targa-inline">' + targa + '</span>'
    : '';
  var servizioBadge = servizio
    ? '<span class="dc-sep">\u00b7</span><span class="badge-special">' + servizio + '</span>'
    : '';

  var detailRows =
    (servizio ? '<div class="sc-row"><span class="sc-label">Tipologia</span><span>' + servizio + '</span></div>' : '') +
    (targa    ? '<div class="sc-row"><span class="sc-label">Targa</span><span>' + targa + '</span></div>' : '') +
    (modello  ? '<div class="sc-row"><span class="sc-label">Modello</span><span>' + modello + '</span></div>' : '') +
    (deposit.email    ? '<div class="sc-row"><span class="sc-label">Email</span><span>' + deposit.email + '</span></div>' : '') +
    (deposit.telefono ? '<div class="sc-row"><span class="sc-label">Telefono</span><span>' + deposit.telefono + '</span></div>' : '') +
    '<div class="sc-row"><span class="sc-label">Ore stimate</span><span>' + (oreStimate > 0 ? oreStimate + 'h' : '—') + '</span></div>' +
    (bGiorno  ? '<div class="sc-row"><span class="sc-label">Data lavoro</span><span>' + formatDateDisplay(bGiorno) + (bOra ? ' alle ' + bOra : '') + '</span></div>' : '') +
    (createdDisplay  ? '<div class="sc-row"><span class="sc-label">Aperto il</span><span>' + createdDisplay + '</span></div>' : '');

  var noteSection =
    (noteCliente
      ? '<div class="sc-note-block"><span class="sc-label">Note cliente</span><p>' + noteCliente + '</p></div>'
      : '') +
    '<div class="sc-note-block' + (noteCliente ? ' sc-note-interna' : '') + '"><span class="sc-label">Note meccanico</span><p>' + (notaInterna || '<em class="sc-empty">Nessuna nota</em>') + '</p></div>';

  return (
    '<div class="deposit-card storica-card stato-completato" id="deposit-card-' + id + '">'

    + '<div class="deposit-card-header" data-card-id="' + id + '">'
      + '<div class="dc-header-info">'
        + '<span class="dc-name">' + nome + '</span>'
        + targaBadge
        + servizioBadge
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
        + (createdDisplay ? '<span class="sc-date">' + createdDisplay + '</span>' : '')
        + '<span class="dc-chevron">\u25bc</span>'
      + '</div>'
    + '</div>'

    + '<div class="deposit-card-body">'
      + (detailRows ? '<div class="sc-detail-grid">' + detailRows + '</div>' : '')
      + noteSection
    + '</div>'

    + '</div>'
  );
}

// ── Sidebar ───────────────────────────────────────────────────

(function() {
  var ham     = document.getElementById('hamburger-btn');
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  var closeBtn  = document.getElementById('close-sidebar');
  var logoutBtn = document.getElementById('sidebar-logout');

  function open()  { sidebar.classList.add('active');    overlay.classList.add('active'); }
  function close() { sidebar.classList.remove('active'); overlay.classList.remove('active'); }

  ham.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  logoutBtn.addEventListener('click', async function() {
    try { await apiRequest('/auth/logout', { method: 'POST' }); } catch (e) {}
    window.location.href = '/';
  });
})();

// ── Boot ──────────────────────────────────────────────────────

init();
