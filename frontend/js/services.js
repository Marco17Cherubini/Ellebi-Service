let selectedService = null;
let selectedDate = null;
let selectedTime = null;

// Inizializzazione
async function init() {
  // Verifica autenticazione
  const user = await getCurrentUser();
  if (!user) {
    redirectToLogin();
    return;
  }

  // Recupera data e ora da sessionStorage
  selectedDate = sessionStorage.getItem('selectedDate');
  selectedTime = sessionStorage.getItem('selectedTime');

  if (!selectedDate || !selectedTime) {
    // Torna alla dashboard se mancano dati
    window.location.href = '/dashboard';
    return;
  }

  // Mostra data e ora selezionate
  displaySelectedDateTime();

  // Carica servizi
  await loadServices();

  // Check per servizio preselezionato
  const preselectedService = sessionStorage.getItem('preselectedService');
  if (preselectedService) {
    const serviceCard = document.querySelector(`[data-service-id="${preselectedService}"]`);
    if (serviceCard) {
      serviceCard.click();
    }
    sessionStorage.removeItem('preselectedService');
  }
}

// Mostra data e ora selezionate
function displaySelectedDateTime() {
  const display = document.getElementById('datetime-display');
  display.textContent = `${formatDate(selectedDate)}, ore ${selectedTime}`;
}

// Carica servizi disponibili
async function loadServices() {
  try {
    const response = await apiRequest('/services');

    const servicesList = document.getElementById('services-list');

    servicesList.innerHTML = response.services.map(service => `
      <div class="card card-clickable" data-service-id="${service.id}">
        <div class="card-title">${service.name}</div>
      </div>
    `).join('');

    // Aggiungi event listener
    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => selectService(card));
    });

  } catch (error) {
    console.error('Errore caricamento servizi:', error);
    alert('Errore nel caricamento dei servizi');
  }
}

// Seleziona servizio
function selectService(element) {
  // Rimuovi selezione precedente
  document.querySelectorAll('.card.selected').forEach(el => {
    el.classList.remove('selected');
  });

  // Seleziona nuovo servizio
  element.classList.add('selected');
  selectedService = element.dataset.serviceId;

  // Abilita pulsante conferma
  document.getElementById('confirm-service-btn').disabled = false;
}

// Conferma servizio
document.getElementById('confirm-service-btn').addEventListener('click', () => {
  if (selectedService) {
    // Salva servizio in sessionStorage
    sessionStorage.setItem('selectedService', selectedService);

    // Vai a pagina riepilogo
    window.location.href = '/summary';
  }
});

// Pulsante indietro
document.getElementById('back-btn').addEventListener('click', () => {
  window.location.href = '/dashboard';
});

// Avvia inizializzazione
init();
