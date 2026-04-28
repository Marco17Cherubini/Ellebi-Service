/* ================================================================
   admin-listino.js — Gestione Listino Servizi
   ================================================================ */

var allServices = [];
var editingId = null;
var deleteTarget = null;

// ── Init ─────────────────────────────────────────────────────

async function init() {
  try {
    var res = await apiRequest('/auth/me');
    if (!res.success || !res.user.isAdmin) { window.location.href = '/login'; return; }
    await loadServices();
  } catch (e) {
    console.error('Errore init listino:', e);
    window.location.href = '/login';
  }
}

// ── Load ──────────────────────────────────────────────────────

async function loadServices() {
  try {
    var res = await apiRequest('/admin/services');
    if (!res.success) return;
    allServices = res.services || [];
    renderTable();
  } catch (e) {
    console.error('Errore caricamento servizi:', e);
  } finally {
    document.getElementById('loading-state').classList.add('hidden');
  }
}

// ── Render ────────────────────────────────────────────────────

function renderTable() {
  var tbody = document.getElementById('services-tbody');
  var empty = document.getElementById('empty-state');
  var wrapper = document.getElementById('table-wrap');

  if (allServices.length === 0) {
    wrapper.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  wrapper.classList.remove('hidden');
  tbody.innerHTML = allServices.map(buildRow).join('');
  attachRowListeners();
}

function buildRow(s) {
  var attivo = s.attivo != 0 && s.attivo !== false;
  var stagionale = s.stagionale != 0 && s.stagionale !== false;
  var durata = s.durata_minuti ? s.durata_minuti + ' min' : '—';
  var prezzo = s.prezzo_interno ? '€' + parseFloat(s.prezzo_interno).toFixed(2) : '—';

  var tipoVeicoloLabel = s.tipo_veicolo === 'moto' ? 'Moto' : 'Auto';
  var tipoServizioLabel = s.tipo_servizio === 'consegna' ? 'Consegna' : 'Appuntamento';

  var stagBadge = stagionale
    ? '<span class="stagionale-badge">Stag.</span>'
    : '';

  return '<tr class="' + (attivo ? '' : 'row-inactive') + '">' +
    '<td class="td-nome"><strong>' + escHtml(s.nome || '—') + '</strong>' + stagBadge + '</td>' +
    '<td><span class="tipo-badge tipo-' + escHtml(s.tipo_veicolo || 'auto') + '">' + tipoVeicoloLabel + '</span></td>' +
    '<td>' + tipoServizioLabel + '</td>' +
    '<td class="td-center">' + durata + '</td>' +
    '<td class="td-center">' + prezzo + '</td>' +
    '<td class="td-center">' +
    '<label class="toggle-switch" title="' + (attivo ? 'Disattiva' : 'Attiva') + '">' +
    '<input type="checkbox" class="toggle-attivo" data-id="' + s.id + '"' + (attivo ? ' checked' : '') + '>' +
    '<span class="toggle-slider"></span>' +
    '</label>' +
    '</td>' +
    '<td class="td-actions">' +
    '<button class="action-btn btn-edit" data-id="' + s.id + '">Modifica</button>' +
    '<button class="action-btn btn-delete" data-id="' + s.id + '" data-nome="' + escHtml(s.nome || '') + '">Elimina</button>' +
    '</td>' +
    '</tr>';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attachRowListeners() {
  document.querySelectorAll('.toggle-attivo').forEach(function (cb) {
    cb.addEventListener('change', function () { toggleActive(cb.dataset.id, cb.checked); });
  });

  document.querySelectorAll('.btn-edit').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var s = allServices.find(function (x) { return String(x.id) === btn.dataset.id; });
      if (s) openEditModal(s);
    });
  });

  document.querySelectorAll('.btn-delete').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openConfirmDelete(btn.dataset.id, btn.dataset.nome);
    });
  });
}

// ── Toggle active ─────────────────────────────────────────────

async function toggleActive(id, checked) {
  try {
    await apiRequest('/admin/services/' + id, {
      method: 'PUT',
      body: JSON.stringify({ attivo: checked ? 1 : 0 })
    });
    // Update local state — no full reload needed
    var s = allServices.find(function (x) { return String(x.id) === String(id); });
    if (s) s.attivo = checked ? 1 : 0;
    // Sync row opacity
    document.querySelectorAll('#services-tbody tr').forEach(function (tr, i) {
      if (allServices[i]) {
        tr.classList.toggle('row-inactive', !allServices[i].attivo && allServices[i].attivo != 1);
      }
    });
  } catch (e) {
    console.error('Errore toggle attivo:', e);
    await loadServices(); // Revert to server state on error
  }
}

// ── Modal ─────────────────────────────────────────────────────

function openNewModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Nuovo Servizio';
  clearForm();
  document.getElementById('service-modal').classList.add('open');
}

function openEditModal(s) {
  editingId = s.id;
  document.getElementById('modal-title').textContent = 'Modifica Servizio';

  document.getElementById('f-nome').value = s.nome || '';
  document.getElementById('f-tipo-veicolo').value = s.tipo_veicolo || 'auto';
  document.getElementById('f-tipo-servizio').value = s.tipo_servizio || 'appuntamento';
  document.getElementById('f-durata').value = s.durata_minuti || 60;
  document.getElementById('f-prezzo').value = s.prezzo_interno || '';

  // campi_extra: JSON array → comma-separated string
  var campi = '';
  try {
    var arr = JSON.parse(s.campi_extra || '[]');
    campi = Array.isArray(arr) ? arr.join(', ') : '';
  } catch (e) {
    campi = s.campi_extra || '';
  }
  document.getElementById('f-campi-extra').value = campi;

  var attivo = s.attivo != 0 && s.attivo !== false;
  var stagionale = s.stagionale != 0 && s.stagionale !== false;

  document.getElementById('f-attivo').checked = attivo;
  document.getElementById('f-stagionale').checked = stagionale;
  document.getElementById('f-data-inizio').value = s.data_inizio_stagione || '';
  document.getElementById('f-data-fine').value = s.data_fine_stagione || '';

  document.getElementById('stagionale-dates').classList.toggle('visible', stagionale);
  updateDurataState();

  document.getElementById('service-modal').classList.add('open');
}

function clearForm() {
  document.getElementById('f-nome').value = '';
  document.getElementById('f-tipo-veicolo').value = 'auto';
  document.getElementById('f-tipo-servizio').value = 'appuntamento';
  document.getElementById('f-durata').value = '60';
  document.getElementById('f-prezzo').value = '';
  document.getElementById('f-campi-extra').value = '';
  document.getElementById('f-attivo').checked = true;
  document.getElementById('f-stagionale').checked = false;
  document.getElementById('f-data-inizio').value = '';
  document.getElementById('f-data-fine').value = '';
  document.getElementById('stagionale-dates').classList.remove('visible');
  updateDurataState();
}

function closeModal() {
  document.getElementById('service-modal').classList.remove('open');
}

function updateDurataState() {
  var tipoServizio = document.getElementById('f-tipo-servizio').value;
  document.getElementById('f-durata').disabled = (tipoServizio === 'consegna');
}

// ── Save ──────────────────────────────────────────────────────

async function saveService() {
  var nome = (document.getElementById('f-nome').value || '').trim();
  if (!nome) {
    document.getElementById('f-nome').focus();
    return;
  }

  // Comma-separated campi_extra → JSON array string
  var campiStr = (document.getElementById('f-campi-extra').value || '').trim();
  var campiExtra = campiStr
    ? JSON.stringify(campiStr.split(',').map(function (c) { return c.trim(); }).filter(Boolean))
    : '[]';

  var stagionale = document.getElementById('f-stagionale').checked;

  var payload = {
    nome: nome,
    tipo_veicolo: document.getElementById('f-tipo-veicolo').value,
    tipo_servizio: document.getElementById('f-tipo-servizio').value,
    durata_minuti: parseInt(document.getElementById('f-durata').value) || 60,
    prezzo_interno: parseFloat(document.getElementById('f-prezzo').value) || 0,
    campi_extra: campiExtra,
    attivo: document.getElementById('f-attivo').checked ? 1 : 0,
    stagionale: stagionale ? 1 : 0,
    data_inizio_stagione: stagionale ? (document.getElementById('f-data-inizio').value || '') : '',
    data_fine_stagione: stagionale ? (document.getElementById('f-data-fine').value || '') : ''
  };

  var saveBtn = document.getElementById('modal-save');
  saveBtn.disabled = true;

  try {
    var res;
    if (editingId) {
      res = await apiRequest('/admin/services/' + editingId, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      res = await apiRequest('/admin/services', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    if (res.success) {
      closeModal();
      await loadServices();
    } else {
      alert('Errore: ' + (res.error || 'Operazione fallita'));
    }
  } catch (e) {
    console.error('Errore salvataggio servizio:', e);
    alert('Errore di rete. Riprova.');
  } finally {
    saveBtn.disabled = false;
  }
}

// ── Delete ────────────────────────────────────────────────────

function openConfirmDelete(id, nome) {
  deleteTarget = id;
  document.getElementById('confirm-service-name').textContent = '"' + nome + '"';
  document.getElementById('confirm-overlay').classList.add('open');
}

function closeConfirm() {
  deleteTarget = null;
  document.getElementById('confirm-overlay').classList.remove('open');
}

async function confirmDelete() {
  if (!deleteTarget) return;
  var id = deleteTarget;
  closeConfirm();
  try {
    var res = await apiRequest('/admin/services/' + id, { method: 'DELETE' });
    if (res.success) {
      await loadServices();
    } else {
      alert('Errore eliminazione: ' + (res.error || 'Operazione fallita'));
    }
  } catch (e) {
    console.error('Errore eliminazione servizio:', e);
  }
}

// ── Event wiring ──────────────────────────────────────────────

document.getElementById('btn-nuovo-servizio').addEventListener('click', openNewModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-save').addEventListener('click', saveService);

document.getElementById('f-tipo-servizio').addEventListener('change', function () {
  if (this.value === 'consegna') document.getElementById('f-durata').value = '30';
  updateDurataState();
});

document.getElementById('f-stagionale').addEventListener('change', function () {
  document.getElementById('stagionale-dates').classList.toggle('visible', this.checked);
});

// Close modal clicking the overlay background
document.getElementById('service-modal').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

document.getElementById('confirm-no').addEventListener('click', closeConfirm);
document.getElementById('confirm-yes').addEventListener('click', confirmDelete);

// Close confirm clicking the overlay background
document.getElementById('confirm-overlay').addEventListener('click', function (e) {
  if (e.target === this) closeConfirm();
});

// ── Sidebar ───────────────────────────────────────────────────

(function () {
  var ham = document.getElementById('hamburger-btn');
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  var closeBtn = document.getElementById('close-sidebar');
  var logoutBtn = document.getElementById('sidebar-logout');

  function open() { sidebar.classList.add('active'); overlay.classList.add('active'); }
  function close() { sidebar.classList.remove('active'); overlay.classList.remove('active'); }

  ham.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  logoutBtn.addEventListener('click', async function () {
    try { await apiRequest('/auth/logout', { method: 'POST' }); } catch (e) { }
    window.location.href = '/';
  });
})();

// ── Boot ──────────────────────────────────────────────────────

init();
