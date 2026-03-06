// Guest Booking - Prenotazione rapida senza account
// Flusso: Persone -> Data/Ora -> Dati personali

(function () {
    'use strict';

    // State
    let currentStep = 0;
    let selectedGroupSize = 1;
    let guestData = {
        nome: '',
        cognome: '',
        email: '',
        giorno: '',
        ora: '',
        numPersone: 1
    };
    let currentMonth = new Date();
    let holidays = [];
    let allSlotsForDay = []; // Cached for consecutive filtering

    // DOM Elements
    let stepIndicators, sections;

    // Initialize
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        stepIndicators = {
            0: document.getElementById('step-ind-0'),
            1: document.getElementById('step-ind-1'),
            2: document.getElementById('step-ind-2')
        };

        sections = {
            0: document.getElementById('step-0'),
            1: document.getElementById('step-1'),
            2: document.getElementById('step-2'),
            confirmation: document.getElementById('step-confirmation')
        };

        loadHolidays();
        setupEventListeners();
        // Don't render calendar until group is selected
    }

    function setupEventListeners() {
        // Step 0: Group selection
        document.querySelectorAll('.group-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedGroupSize = parseInt(btn.dataset.group);
                guestData.numPersone = selectedGroupSize;
                goToStep(1);
                renderCalendar();
            });
        });

        // Step 1: Calendario
        document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
        document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

        // Step 2: Form dati personali
        document.getElementById('guest-info-form').addEventListener('submit', handleConfirmBooking);
    }

    // ==================== STEP NAVIGATION ====================

    window.goToStep = function (step) {
        // Hide all sections
        Object.values(sections).forEach(s => {
            if (s) s.classList.remove('active');
        });

        // Update step indicators (0-2)
        for (let i = 0; i <= 2; i++) {
            if (stepIndicators[i]) {
                stepIndicators[i].classList.remove('active', 'completed');
                if (i < step) {
                    stepIndicators[i].classList.add('completed');
                } else if (i === step) {
                    stepIndicators[i].classList.add('active');
                }
            }
        }

        // Show current section
        if (sections[step]) {
            sections[step].classList.add('active');
        }

        currentStep = step;

        // Update summary for step 2 (personal data)
        if (step === 2) {
            document.getElementById('summary-date').textContent = formatDateDisplay(guestData.giorno);
            document.getElementById('summary-time').textContent = guestData.ora;
        }
    };

    // ==================== STEP 1: CALENDARIO ====================

    async function loadHolidays() {
        try {
            const response = await fetch('/api/holidays');
            const data = await response.json();
            if (data.success) {
                holidays = data.holidays || [];
            }
        } catch (error) {
            console.error('Errore caricamento ferie:', error);
        }
    }

    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const monthLabel = document.getElementById('current-month');

        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

        monthLabel.textContent = `${monthNames[month]} ${year}`;

        // Clear existing days (keep headers)
        const headers = grid.querySelectorAll('.calendar-day-header');
        grid.innerHTML = '';
        headers.forEach(h => grid.appendChild(h));

        // First day of month
        const firstDay = new Date(year, month, 1);
        let startDay = firstDay.getDay() - 1;
        if (startDay < 0) startDay = 6;

        // Days in month
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Today
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Empty cells before first day
        for (let i = 0; i < startDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day empty';
            grid.appendChild(emptyCell);
        }

        // Day cells
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const cell = document.createElement('div');
            cell.className = 'calendar-day';
            cell.textContent = day;

            const dateStr = formatDateForAPI(date);
            cell.dataset.date = dateStr;

            // Check if past or Sunday
            const dayOfWeek = date.getDay();
            const isPast = date < today;
            const isSunday = dayOfWeek === 0;

            if (isPast || isSunday) {
                cell.classList.add('disabled');
            } else {
                cell.addEventListener('click', () => selectDate(dateStr, date));
            }

            grid.appendChild(cell);
        }
    }

    function changeMonth(delta) {
        currentMonth.setMonth(currentMonth.getMonth() + delta);
        renderCalendar();

        // Hide time slots when changing month
        document.getElementById('time-slots-container').classList.add('hidden');
        guestData.giorno = '';
        guestData.ora = '';
    }

    async function selectDate(dateStr, dateObj) {
        // Update UI
        document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
        const cell = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
        if (cell) {
            cell.classList.add('selected');
        }

        guestData.giorno = dateStr;
        guestData.ora = '';

        // Load available slots
        await loadTimeSlots(dateStr, dateObj);
    }

    async function loadTimeSlots(dateStr, dateObj) {
        const container = document.getElementById('time-slots-container');
        const grid = document.getElementById('time-slots-grid');
        const title = document.getElementById('selected-date-title');

        container.classList.remove('hidden');
        grid.innerHTML = '<div class="loading">Caricamento orari...</div>';

        const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        title.textContent = `Orari disponibili - ${dayNames[dateObj.getDay()]} ${dateObj.getDate()}`;

        try {
            const response = await fetch(`/api/slots/${dateStr}`);
            const data = await response.json();

            if (data.success && data.slots.length > 0) {
                grid.innerHTML = '';

                // Cache all slots for consecutive filtering
                allSlotsForDay = data.slots;
                const allSlotTimes = data.slots.map(s => typeof s === 'object' ? s.time : s);

                // Build set of available times
                const availableTimes = new Set();
                data.slots.forEach(slot => {
                    const slotTime = typeof slot === 'object' ? slot.time : slot;
                    const isAvailable = typeof slot === 'object' ? slot.available : true;
                    const isHoliday = typeof slot === 'object' ? slot.isHoliday : false;
                    const holidayMatch = holidays.some(h => h.giorno === dateStr && h.ora === slotTime);

                    if (isAvailable && !isHoliday && !holidayMatch) {
                        availableTimes.add(slotTime);
                    }
                });

                // Filter slots based on group size (consecutive availability)
                let validSlots = [];
                data.slots.forEach(slot => {
                    const slotTime = typeof slot === 'object' ? slot.time : slot;

                    if (!availableTimes.has(slotTime)) return;

                    // Check if N consecutive slots are available
                    const startIndex = allSlotTimes.indexOf(slotTime);
                    if (startIndex === -1) return;

                    let canBook = true;
                    for (let i = 1; i < selectedGroupSize; i++) {
                        const nextSlotTime = allSlotTimes[startIndex + i];
                        if (!nextSlotTime || !availableTimes.has(nextSlotTime)) {
                            canBook = false;
                            break;
                        }
                    }

                    if (canBook) {
                        validSlots.push(slotTime);
                    }
                });

                if (validSlots.length === 0) {
                    const message = selectedGroupSize > 1
                        ? `Nessun orario con ${selectedGroupSize} slot consecutivi disponibili`
                        : 'Nessun orario disponibile per questa data';
                    grid.innerHTML = `<div class="no-slots-message">${message}</div>`;
                    return;
                }

                validSlots.forEach(slotTime => {
                    const slotEl = document.createElement('div');
                    slotEl.className = 'time-slot';
                    const groupLabel = selectedGroupSize > 1 ? ` (+${selectedGroupSize - 1})` : '';
                    slotEl.innerHTML = `${slotTime}<small>${groupLabel}</small>`;
                    slotEl.dataset.time = slotTime;
                    slotEl.addEventListener('click', () => selectTimeSlot(slotTime));
                    grid.appendChild(slotEl);
                });

            } else {
                grid.innerHTML = '<div class="no-slots-message">Nessun orario disponibile per questa data</div>';
            }
        } catch (error) {
            console.error('Errore caricamento slot:', error);
            grid.innerHTML = '<div class="no-slots-message">Errore nel caricamento degli orari</div>';
        }
    }

    function selectTimeSlot(time) {
        document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
        const slot = document.querySelector(`.time-slot[data-time="${time}"]`);
        if (slot) {
            slot.classList.add('selected');
        }

        guestData.ora = time;

        // Auto-advance to step 2 (personal data)
        setTimeout(() => goToStep(2), 300);
    }

    // ==================== STEP 2: CONFERMA PRENOTAZIONE ====================

    async function handleConfirmBooking(e) {
        e.preventDefault();

        const nome = document.getElementById('nome').value.trim();
        const cognome = document.getElementById('cognome').value.trim();
        const email = document.getElementById('email').value.trim();

        // Validation
        if (!nome || !cognome || !email) {
            showError('Compila tutti i campi');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showError('Inserisci un indirizzo email valido');
            return;
        }

        // Save data
        guestData.nome = nome;
        guestData.cognome = cognome;
        guestData.email = email;

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Prenotazione in corso...';

        try {
            const response = await fetch('/api/bookings/guest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(guestData)
            });

            const data = await response.json();

            if (data.success) {
                showConfirmation();
            } else {
                showError(data.error || 'Errore durante la prenotazione');
                btn.disabled = false;
                btn.textContent = 'Conferma Prenotazione';
            }
        } catch (error) {
            console.error('Errore prenotazione:', error);
            showError('Errore di connessione. Riprova.');
            btn.disabled = false;
            btn.textContent = 'Conferma Prenotazione';
        }
    }

    function showConfirmation() {
        // Hide all sections
        Object.values(sections).forEach(s => {
            if (s) s.classList.remove('active');
        });

        // Update step indicators to all completed
        for (let i = 0; i <= 2; i++) {
            if (stepIndicators[i]) {
                stepIndicators[i].classList.remove('active');
                stepIndicators[i].classList.add('completed');
            }
        }

        // Show confirmation
        sections.confirmation.classList.add('active');

        // Fill confirmation details
        document.getElementById('conf-nome').textContent = `${guestData.nome} ${guestData.cognome}`;
        document.getElementById('conf-data').textContent = formatDateDisplay(guestData.giorno);
        document.getElementById('conf-ora').textContent = guestData.ora;
    }

    // ==================== UTILITIES ====================

    function formatDateForAPI(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatDateDisplay(dateStr) {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        const date = new Date(year, month - 1, day);
        const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

        return `${dayNames[date.getDay()]} ${day} ${monthNames[date.getMonth()]} ${year}`;
    }



    function showError(message) {
        const errorEl = document.getElementById('form-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');

            setTimeout(() => {
                errorEl.classList.add('hidden');
            }, 5000);
        } else {
            alert(message);
        }
    }

})();
