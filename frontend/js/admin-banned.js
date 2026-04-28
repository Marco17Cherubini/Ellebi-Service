let allUsers = [];
let originalBannedStatus = {}; // Stato originale dal server
let pendingChanges = {};       // Modifiche pendenti { email: newBannedStatus }

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
            originalBannedStatus[user.email] = user.banned === '1' || user.banned === 1;
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

// Renderizza lista utenti
function renderUsers(users) {
    const container = document.getElementById('users-list');
    const countEl = document.getElementById('users-count');

    // Conta bannati (considerando modifiche pendenti)
    const bannedCount = users.filter(u => {
        if (pendingChanges.hasOwnProperty(u.email)) {
            return pendingChanges[u.email];
        }
        return u.banned === '1' || u.banned === 1;
    }).length;

    countEl.textContent = `${users.length} clienti trovati (${bannedCount} bannati)`;

    if (users.length === 0) {
        container.innerHTML = '<div class="no-users">Nessun cliente trovato</div>';
        return;
    }

    container.innerHTML = users.map(user => {
        const hasPendingChange = pendingChanges.hasOwnProperty(user.email);
        const originalBanned = user.banned === '1' || user.banned === 1;
        const displayBanned = hasPendingChange ? pendingChanges[user.email] : originalBanned;
        const isChecked = displayBanned;

        let pendingClass = '';
        let pendingBadge = '';

        if (hasPendingChange) {
            if (pendingChanges[user.email] && !originalBannedStatus[user.email]) {
                pendingClass = 'pending-add';
                pendingBadge = '<span class="pending-badge add">+ BANNATO</span>';
            } else if (!pendingChanges[user.email] && originalBannedStatus[user.email]) {
                pendingClass = 'pending-remove';
                pendingBadge = '<span class="pending-badge remove">- RIMUOVI BAN</span>';
            }
        }

        return `
                    <div class="user-item ${pendingClass}" data-email="${user.email}">
                        <div class="user-info">
                            <span class="banned-badge" style="visibility: ${displayBanned ? 'visible' : 'hidden'}">🚫</span>
                            <span class="user-name">${user.cognome} ${user.nome}</span>
                            ${pendingBadge}
                        </div>
                        <label class="banned-label">
                            <span>Ban</span>
                            <input type="checkbox" class="banned-checkbox" 
                                   data-email="${user.email}" 
                                   ${isChecked ? 'checked' : ''}>
                        </label>
                    </div>
                `;
    }).join('');

    // Event listeners per checkbox
    document.querySelectorAll('.banned-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
    });
}

// Gestisce cambio checkbox (NON salva subito, solo aggiunge a pendingChanges)
function handleCheckboxChange(e) {
    const email = e.target.dataset.email;
    const newValue = e.target.checked;
    const originalValue = originalBannedStatus[email];

    // Se il nuovo valore è uguale all'originale, rimuovi dalle modifiche pendenti
    if (newValue === originalValue) {
        delete pendingChanges[email];
    } else {
        pendingChanges[email] = newValue;
    }

    // Re-render per mostrare stato pendente
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
    const changeCount = Object.keys(pendingChanges).length;

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
        for (const [email, newBannedStatus] of Object.entries(pendingChanges)) {
            const response = await fetch(`/api/admin/users/${encodeURIComponent(email)}/banned`, {
                method: 'PUT',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`Errore aggiornamento ban per ${email}`);
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

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/';
});

// Init
loadUsers();