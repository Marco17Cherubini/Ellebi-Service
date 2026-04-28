import { STATE, getTimeSlotsForDate, getMonday, formatDate, formatDateDisplay, formatDateStringDisplay, timeSlotsWeekday, timeSlotsSaturday, allTimeSlots, workDays } from './state.js';

const apiRequest = window.apiRequest;
const Modal = window.Modal;




// Carica tutti gli utenti registrati
export async function loadUsers() {
  try {
    const response = await apiRequest('/admin/users');
    if (response.success) {
      STATE.allUsers = response.users;
    }
  } catch (error) {
    console.error('Errore caricamento utenti:', error);
    STATE.allUsers = [];
  }
}

// Carica tutte le ferie
export async function loadHolidays() {
  try {
    const response = await apiRequest('/holidays');
    if (response.success) {
      STATE.allHolidays = response.holidays;
    }
  } catch (error) {
    console.error('Errore caricamento ferie:', error);
    STATE.allHolidays = [];
  }
}

// Carica servizi dall'API e popola select
export async function loadServices() {
  try {
    const response = await apiRequest('/admin/services');
    if (response.success) {
      STATE.allServices = response.services || [];
      const { buildServicePicker } = await import('./modal.js');
      buildServicePicker();
    }
  } catch (e) {
    console.error('Errore caricamento servizi:', e);
  }
}

// Carica tutte le prenotazioni
export async function loadBookings() {
  try {
    const response = await apiRequest('/admin/bookings');
    if (response.success) {
      STATE.allBookings = response.bookings;
    }
  } catch (error) {
    console.error('Errore caricamento prenotazioni:', error);
    STATE.allBookings = [];
  }
}


export async function checkPendingDeposits() {
  try {
    const res = await apiRequest('/admin/deposits/all');
    if (!res.success) return;

    const deposits = res.deposits || [];
    // Conta solo i depositi in attesa (nuove consegne non ancora avviate)
    const attesaCount = deposits.filter(function(d) {
      return d.stato === 'in_attesa';
    }).length;

    if (attesaCount <= 0) return;

    // Crea banner se non esiste già
    let banner = document.getElementById('admin-deposit-banner');
    if (banner) return; // già mostrato

    banner = document.createElement('div');
    banner.id = 'admin-deposit-banner';
    banner.style.cssText = [
      'display:flex', 'align-items:center', 'gap:12px',
      'background:#FFF7ED', 'border:1.5px solid #FF6B00', 'border-radius:10px',
      'padding:12px 16px', 'margin-bottom:16px',
      'font-size:0.9rem', 'color:#92400E', 'font-weight:600',
      'cursor:pointer', 'transition:opacity 0.2s'
    ].join(';');

    const label = attesaCount === 1
      ? 'Hai 1 lavoro straordinario da fissare — vai a Lavori Straordinari'
      : 'Hai ' + attesaCount + ' lavori straordinari da fissare — vai a Lavori Straordinari';

    banner.innerHTML =
      '<span style="flex:1;">' + label + '</span>' +
      '<button id="admin-deposit-banner-close" style="background:none;border:none;cursor:pointer;color:#92400E;font-size:1.1rem;padding:2px 6px;border-radius:4px;opacity:0.7;" title="Chiudi">&times;</button>';

    // Inserisci sopra il calendario
    const container = document.querySelector('.container') || document.querySelector('.admin-calendar');
    if (container) {
      container.parentNode.insertBefore(banner, container);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }

    // Click sul banner → vai a Lavori Straordinari
    banner.addEventListener('click', function(e) {
      if (e.target.id === 'admin-deposit-banner-close') {
        banner.style.opacity = '0';
        setTimeout(function() { banner.remove(); }, 250);
        return;
      }
      window.location.href = '/admin/depositi';
    });

    document.getElementById('admin-deposit-banner-close').addEventListener('click', function(e) {
      e.stopPropagation();
      banner.style.opacity = '0';
      setTimeout(function() { banner.remove(); }, 250);
    });

  } catch (e) {
    console.warn('Errore controllo depositi:', e);
  }
}