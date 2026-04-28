let currentUser = null;

// Inizializzazione
async function init() {
  try {
    currentUser = await getCurrentUser();

    if (!currentUser) {
      redirectToLogin();
      return;
    }

    // Carica prenotazioni
    await loadBookings();

  } catch (error) {
    console.error('Errore inizializzazione:', error);
    redirectToLogin();
  }
}

// Carica prenotazioni utente
async function loadBookings() {
  try {
    const response = await apiRequest('/bookings');

    const bookingsList = document.getElementById('bookings-list');
    const noBookings = document.getElementById('no-bookings');

    // Filtra solo prenotazioni di oggi o future (per giorno, non per ora)
    const today = new Date().toISOString().split('T')[0];
    const activeBookings = response.bookings.filter(booking => {
      return booking.giorno >= today;
    }).sort((a, b) => {
      // Ordina per data crescente (più vicini prima)
      return new Date(`${a.giorno}T${a.ora}:00`) - new Date(`${b.giorno}T${b.ora}:00`);
    });

    if (activeBookings.length === 0) {
      bookingsList.classList.add('hidden');
      noBookings.classList.remove('hidden');
      return;
    }

    window.currentActiveBookings = activeBookings;

    bookingsList.innerHTML = activeBookings.map((booking, index) => {
      var sid = booking.service_id || '';
      var durata = booking.durata_minuti ? (booking.durata_minuti + ' min') : '';
      return `
      <div class="card booking-card" data-giorno="${booking.giorno}" data-ora="${booking.ora}">
        <div class="booking-info">
          <div class="card-title">${escapeHTML(booking.servizio)}</div>
          <div class="booking-details">
            <div><strong>Data:</strong> ${escapeHTML(formatDate(booking.giorno))}</div>
            <div><strong>Orario:</strong> ${escapeHTML(booking.ora)}${durata ? ' (' + durata + ')' : ''}</div>
          </div>
        </div>
        <div class="booking-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-edit" onclick="editBooking(${index})">
            Modifica
          </button>
          <button class="btn btn-cancel" onclick="showDeleteConfirm('${booking.giorno}', '${booking.ora}', '${escapeHTML(booking.servizio)}')">
            Cancella
          </button>
        </div>
      </div>
    `}).join('');

  } catch (error) {
    console.error('Errore caricamento prenotazioni:', error);
    document.getElementById('bookings-list').innerHTML =
      '<div class="alert">Errore nel caricamento delle prenotazioni</div>';
  }
}

// Funzione per modificare una prenotazione
function editBooking(index) {
  var b = window.currentActiveBookings[index];
  sessionStorage.setItem('editingBooking', JSON.stringify({ 
    giorno: b.giorno, 
    ora: b.ora, 
    servizio: b.servizio, 
    serviceId: b.service_id || '',
    targa: b.targa || '',
    modello: b.modello || '',
    note_cliente: b.note_cliente || ''
  }));

  // Reindirizza al calendario per selezionare nuovo appuntamento
  window.location.href = '/dashboard';
}

// Variabili per la cancellazione
let bookingToDelete = null;

// Mostra modal di conferma cancellazione
function showDeleteConfirm(giorno, ora, servizio) {
  bookingToDelete = { giorno, ora };

  // Popola i dettagli
  document.getElementById('delete-booking-details').innerHTML = `
    <div><strong>Servizio:</strong> ${escapeHTML(servizio)}</div>
    <div><strong>Data:</strong> ${escapeHTML(formatDate(giorno))}</div>
    <div><strong>Orario:</strong> ${escapeHTML(ora)}</div>
  `;

  // Mostra modal
  document.getElementById('delete-confirm-modal').classList.remove('hidden');
}

// Chiudi modal
function closeDeleteModal() {
  document.getElementById('delete-confirm-modal').classList.add('hidden');
  bookingToDelete = null;
}

// Event listeners per i pulsanti del modal
document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
document.getElementById('delete-confirm').addEventListener('click', executeDelete);

// Chiudi modal cliccando sull'overlay
document.querySelector('#delete-confirm-modal .modal-overlay').addEventListener('click', closeDeleteModal);

// Esegui cancellazione
async function executeDelete() {
  if (!bookingToDelete) return;

  const deleteBtn = document.getElementById('delete-confirm');
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Cancellazione...';

  try {
    await apiRequest('/bookings', {
      method: 'DELETE',
      body: JSON.stringify(bookingToDelete)
    });

    // Chiudi modal e ricarica lista
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Sì, Cancella';
    closeDeleteModal();
    await loadBookings();

  } catch (error) {
    console.error('Errore cancellazione:', error);
    alert('Errore nella cancellazione: ' + error.message);
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Sì, Cancella';
  }
}

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

  // Logout from sidebar
  sidebarLogout.addEventListener('click', async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (error) {
      console.error('Errore logout:', error);
      window.location.href = '/';
    }
  });
}

// Initialize sidebar
setupSidebar();

// Avvia inizializzazione
init();
