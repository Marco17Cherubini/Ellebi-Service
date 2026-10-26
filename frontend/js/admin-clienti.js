let allUsers = [];
let originalStatus = {}; // { email: { vip: bool, banned: bool } }
let pendingChanges = {}; // { email: { vip?: bool, banned?: bool } }

// Carica utenti
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                window.location.href = '/login';
                return;
            }
            throw new Error('Errore caricamento utenti');
        }

        const data = await response.json();
        allUsers = data.users || [];

        // Salva stato originale
        allUsers.forEach(user => {
            originalStatus[user.email] = {
                vip: user.vip === '1' || user.vip === 1 || user.vip === true,
                banned: user.banned === '1' || user.banned === 1 || user.banned === true
            };
        });

        pendingChanges = {};
        renderUsers(allUsers);
        updateConfirmBar();
    } catch (error) {
        console.error('Errore:', error);
        document.getElementById('users-list').innerHTML =
            '<div class="no-users">Errore nel caricamento degli utenti</div>';
    }
}

// Ottieni stato corrente (originale + pending)
function getCurrentStatus(email) {
    const original = originalStatus[email] || { vip: false, banned: false };
    const pending = pendingChanges[email] || {};
    return {
        vip: pending.hasOwnProperty('vip') ? pending.vip : original.vip,
        banned: pending.hasOwnProperty('banned') ? pending.banned : original.banned
    };
}

// Renderizza lista utenti
function renderUsers(users) {
    const container = document.getElementById('users-list');
    const countEl = document.getElementById('users-count');

    // Conta VIP e bannati
    let vipCount = 0, bannedCount = 0;
    users.forEach(u => {
        const status = getCurrentStatus(u.email);
        if (status.vip) vipCount++;
        if (status.banned) bannedCount++;
    });

    countEl.textContent = `${users.length} clienti (${vipCount} VIP, ${bannedCount} bannati)`;

    if (users.length === 0) {
        container.innerHTML = '<div class="no-users">Nessun cliente trovato</div>';
        return;
    }

    container.innerHTML = users.map(user => {
        const original = originalStatus[user.email] || { vip: false, banned: false };
        const current = getCurrentStatus(user.email);
        const pending = pendingChanges[user.email] || {};

        // Determina classi e badge pendenti
        let pendingClass = '';
        let pendingBadges = '';

        if (pending.hasOwnProperty('vip')) {
            if (pending.vip && !original.vip) {
                pendingClass += ' pending-vip-add';
                pendingBadges += '<span class="pending-badge vip-add">+ VIP</span>';
            } else if (!pending.vip && original.vip) {
                pendingClass += ' pending-vip-remove';
                pendingBadges += '<span class="pending-badge vip-remove">- VIP</span>';
            }
        }

        if (pending.hasOwnProperty('banned')) {
            if (pending.banned && !original.banned) {
                pendingClass += ' pending-ban-add';
                pendingBadges += '<span class="pending-badge ban-add">+ BAN</span>';
            } else if (!pending.banned && original.banned) {
                pendingClass += ' pending-ban-remove';
                pendingBadges += '<span class="pending-badge ban-remove">- BAN</span>';
            }
        }

        // Badge attuali
        let currentBadges = '';
        if (current.vip) currentBadges += '<span class="badge badge-vip">VIP</span>';
        if (current.banned) currentBadges += '<span class="badge badge-banned">BAN</span>';

        return `
                    <div class="user-item${pendingClass}" data-email="${user.email}">
                        <div class="user-info">
                            <span class="user-name">${user.cognome} ${user.nome}</span>
                            <div class="user-badges">${currentBadges}</div>
                            ${pendingBadges}
                        </div>
                        <div class="user-actions">
                            <div class="action-group">
                                <span class="action-label vip">VIP</span>
                                <input type="checkbox" class="action-checkbox vip"
                                       data-email="${user.email}" data-type="vip"
                                       ${current.vip ? 'checked' : ''}>
                            </div>
                            <div class="action-group">
                                <span class="action-label ban">BAN</span>
                                <input type="checkbox" class="action-checkbox ban"
                                       data-email="${user.email}" data-type="banned"
                                       ${current.banned ? 'checked' : ''}>
                            </div>
                            <button class="btn-vehicles-toggle" data-email="${user.email}" title="Storico veicoli">Veicoli</button>
                        </div>
                    </div>
                    <div class="vehicles-history hidden" id="vh-${user.email.replace(/[@.]/g, '_')}"></div>
                `;
    }).join('');

    // Event listeners per checkbox
    document.querySelectorAll('.action-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
    });

    // Event listeners per toggle veicoli
    document.querySelectorAll('.btn-vehicles-toggle').forEach(btn => {
        btn.addEventListener('click', function () { toggleVehiclesHistory(this.dataset.email); });
    });
}

// ── Storico veicoli per utente ───────────────────────────────
async function toggleVehiclesHistory(email) {
    const panelId = 'vh-' + email.replace(/[@.]/g, '_');
    const panel = document.getElementById(panelId);
    if (!panel) return;

    if (!panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }

    panel.innerHTML = '<div class="vh-loading">Caricamento veicoli…</div>';
    panel.classList.remove('hidden');

    try {
        const res = await fetch('/api/admin/users/' + encodeURIComponent(email) + '/vehicles', { credentials: 'include' });
        const data = await res.json();

        if (!data.success || !data.vehicles || data.vehicles.length === 0) {
            panel.innerHTML = '<div class="vh-empty">Nessun veicolo salvato.</div>';
            return;
        }

        panel.innerHTML = '<div class="vh-title">Veicoli salvati</div>' +
            data.vehicles.map(v => `
                        <div class="vh-card">
                            <div class="vh-card-main">
                                <strong class="vh-targa">${v.targa || '—'}</strong>
                                <span class="vh-modello">${v.modello || ''}</span>
                                ${v.anno ? '<span class="vh-anno">' + v.anno + '</span>' : ''}
                            </div>
                            <div class="vh-card-meta">
                                <span class="vh-count">${v.booking_count || 0} prenotazioni</span>
                                <button class="vh-storico-btn" data-targa="${v.targa}" onclick="loadTargaStorico('${v.targa}', this)">Storico</button>
                            </div>
                        </div>
                    `).join('') +
            '<div id="storico-detail-' + email.replace(/[@.]/g, '_') + '" class="vh-storico-detail hidden"></div>';

    } catch (e) {
        panel.innerHTML = '<div class="vh-empty">Errore caricamento veicoli.</div>';
    }
}

// ── Storico prenotazioni per targa ───────────────────────────
async function loadTargaStorico(targa, btn) {
    const email = btn.closest('.vehicles-history').id.replace('vh-', '').replace(/_/g, '@').replace(/_/g, '.');
    const detailId = 'storico-detail-' + btn.closest('.vehicles-history').id.replace('vh-', '');
    const detail = document.getElementById(detailId);
    if (!detail) return;

    btn.disabled = true;
    btn.textContent = '…';
    detail.classList.remove('hidden');
    detail.innerHTML = '<div class="vh-loading">Caricamento storico ' + targa + '…</div>';

    try {
        const res = await fetch('/api/admin/vehicles/targa/' + encodeURIComponent(targa), { credentials: 'include' });
        const data = await res.json();

        if (!data.success) {
            detail.innerHTML = '<div class="vh-empty">Errore caricamento storico.</div>';
            return;
        }

        const bookings = (data.bookings || []).sort((a, b) => new Date(b.giorno) - new Date(a.giorno));

        if (bookings.length === 0) {
            detail.innerHTML = '<div class="vh-empty">Nessuna prenotazione trovata per ' + targa + '.</div>';
            return;
        }

        detail.innerHTML = '<div class="vh-storico-title">Storico targa ' + targa + '</div>' +
            bookings.map(b => `
                        <div class="vh-storico-row ${b.stato === 'annullato' ? 'stato-annullato' : ''}">
                            <span class="vhsr-date">${b.giorno} ${b.ora}</span>
                            <span class="vhsr-service">${b.servizio || '—'}</span>
                            <span class="vhsr-stato">${b.stato || 'confermato'}</span>
                        </div>
                    `).join('');
    } catch (e) {
        detail.innerHTML = '<div class="vh-empty">Errore rete.</div>';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Storico';
    }
}

// Gestisce cambio checkbox
function handleCheckboxChange(e) {
    const email = e.target.dataset.email;
    const type = e.target.dataset.type; // 'vip' o 'banned'
    const newValue = e.target.checked;
    const originalValue = originalStatus[email]?.[type] || false;

    if (!pendingChanges[email]) {
        pendingChanges[email] = {};
    }

    // Se il nuovo valore è uguale all'originale, rimuovi dalle modifiche pendenti
    if (newValue === originalValue) {
        delete pendingChanges[email][type];
        // Se non ci sono più modifiche per questo utente, rimuovi l'oggetto
        if (Object.keys(pendingChanges[email]).length === 0) {
            delete pendingChanges[email];
        }
    } else {
        pendingChanges[email][type] = newValue;
    }

    // Re-render
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const filtered = query ? allUsers.filter(user =>
        user.nome.toLowerCase().includes(query) ||
        user.cognome.toLowerCase().includes(query)
    ) : allUsers;
    renderUsers(filtered);
    updateConfirmBar();
}

// Aggiorna barra conferma
function updateConfirmBar() {
    const bar = document.getElementById('confirm-bar');
    const countEl = document.getElementById('changes-count');

    let changeCount = 0;
    Object.values(pendingChanges).forEach(changes => {
        changeCount += Object.keys(changes).length;
    });

    if (changeCount > 0) {
        bar.classList.add('visible');
        countEl.textContent = changeCount === 1 ? '1 modifica' : `${changeCount} modifiche`;
    } else {
        bar.classList.remove('visible');
    }
}

// Conferma tutte le modifiche
async function confirmChanges() {
    const confirmBtn = document.getElementById('confirm-changes-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Salvataggio...';

    try {
        // Esegui tutte le modifiche
        for (const [email, changes] of Object.entries(pendingChanges)) {
            if (changes.hasOwnProperty('vip')) {
                await fetch(`/api/admin/users/${encodeURIComponent(email)}/vip`, {
                    method: 'PUT',
                    credentials: 'include'
                });
            }
            if (changes.hasOwnProperty('banned')) {
                await fetch(`/api/admin/users/${encodeURIComponent(email)}/banned`, {
                    method: 'PUT',
                    credentials: 'include'
                });
            }
        }

        // Ricarica utenti per avere stato aggiornato
        await loadUsers();

    } catch (error) {
        console.error('Errore:', error);
        alert('Errore nel salvataggio delle modifiche: ' + error.message);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Conferma';
    }
}

// Annulla modifiche
function cancelChanges() {
    pendingChanges = {};
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const filtered = query ? allUsers.filter(user =>
        user.nome.toLowerCase().includes(query) ||
        user.cognome.toLowerCase().includes(query)
    ) : allUsers;
    renderUsers(filtered);
    updateConfirmBar();
}

// Ricerca
document.getElementById('search-input').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
        renderUsers(allUsers);
        return;
    }

    const filtered = allUsers.filter(user =>
        user.nome.toLowerCase().includes(query) ||
        user.cognome.toLowerCase().includes(query)
    );

    renderUsers(filtered);
});

// Event listeners bottoni conferma
document.getElementById('confirm-changes-btn').addEventListener('click', confirmChanges);
document.getElementById('cancel-changes-btn').addEventListener('click', cancelChanges);

// Sidebar functionality
function setupSidebar() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const closeSidebarBtn = document.getElementById('close-sidebar');
    const sidebarLogout = document.getElementById('sidebar-logout');

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

    sidebarLogout.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/';
    });
}

// Init
setupSidebar();
loadUsers();