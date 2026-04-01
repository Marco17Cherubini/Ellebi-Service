// Guest Booking - Prenotazione rapida senza account
// Flusso: Veicolo -> Servizio -> Data/Ora -> Dati personali/Veicolo

(function () {
    'use strict';

    // State
    const guestData = {
        nome: '',
        cognome: '',
        email: '',
        telefono: '',
        targa: '',
        modello: '',
        note_cliente: ''
    };
    
    let currentStep = 0;
    let selectedVehicleType = null;
    let selectedService = null;
    let selectedDate = null;
    let selectedTime = null;
    
    let currentMonth = new Date();
    let holidays = [];
    let guestDaysOpen = [1, 2, 3, 4, 5, 6]; // Default

    // DOM Elements
    let stepIndicators, sections;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        stepIndicators = {
            0: document.getElementById('step-ind-0'),
            1: document.getElementById('step-ind-1'),
            2: document.getElementById('step-ind-2'),
            3: document.getElementById('step-ind-3') // Se presente
        };

        sections = {
            0: document.getElementById('step-0'),
            1: document.getElementById('step-1'),
            2: document.getElementById('step-2'),
            3: document.getElementById('step-3'),
            confirmation: document.getElementById('step-confirmation')
        };

        loadHolidays();
        loadDaysOpen();
        setupEventListeners();
    }

    function setupEventListeners() {
        // Step 0: Tipo Veicolo
        document.querySelectorAll('.vehicle-card').forEach(function(card) {
            card.addEventListener('click', function() {
                document.querySelectorAll('.vehicle-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedVehicleType = card.dataset.type;
                
                // Vai allo step successivo dopo breve pausa
                setTimeout(() => { goToStep(1); loadServices(); }, 200);
            });
        });

        // Step 1: Servizio next btn
        const nextBtn = document.getElementById('service-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                goToStep(2);
                renderCalendar();
            });
        }

        // Step 2: Calendario
        const prevMonthBtn = document.getElementById('prev-month');
        const nextMonthBtn = document.getElementById('next-month');
        if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => changeMonth(-1));
        if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => changeMonth(1));

        // Step 3: Dati Personali Form
        const form = document.getElementById('guest-info-form');
        if (form) form.addEventListener('submit', handleConfirmBooking);

        // Breadcrumbs cliccabili per tornare ai passaggi completati
        [0, 1, 2, 3].forEach(function(i) {
            let stepEl = document.getElementById('step-ind-' + i);
            if (stepEl) {
                stepEl.addEventListener('click', function() {
                    if (this.classList.contains('completed')) {
                        goToStep(i);
                    }
                });
                // Effetto hover
                stepEl.addEventListener('mouseover', function() {
                    if (this.classList.contains('completed')) {
                        this.style.cursor = 'pointer';
                    } else {
                        this.style.cursor = 'default';
                    }
                });
            }
        });
    }

    window.goToStep = function (step) {
        Object.values(sections).forEach(s => {
            if (s) s.classList.remove('active');
        });

        for (let i = 0; i <= 3; i++) {
            if (stepIndicators[i]) {
                stepIndicators[i].classList.remove('active', 'completed');
                if (i < step) stepIndicators[i].classList.add('completed');
                else if (i === step) stepIndicators[i].classList.add('active');
            }
        }

        if (sections[step]) {
            sections[step].classList.add('active');
        }
        currentStep = step;

        updateSummary();
    };

    function updateSummary() {
        const sumService = document.getElementById('summary-service');
        const sumDate = document.getElementById('summary-date');
        const sumTime = document.getElementById('summary-time');
        
        if (sumService) sumService.textContent = selectedService ? selectedService.nome : '—';
        if (sumDate) sumDate.textContent = selectedDate ? formatDateDisplay(selectedDate) : '—';
        if (sumTime) sumTime.textContent = selectedTime || '—';
    }

    // ==================== API / DATA LOADERS ====================

    async function loadHolidays() {
        try {
            const response = await fetch('/api/holidays');
            const data = await response.json();
            if (data.success) holidays = data.holidays || [];
        } catch (e) { console.error('Holidays error:', e); }
    }

    async function loadDaysOpen() {
        try {
            const response = await fetch('/api/config/slots');
            const data = await response.json();
            if (data.success && data.daysOpen) guestDaysOpen = data.daysOpen;
        } catch (e) { /* use default */ }
    }

    async function loadServices() {
        const grid = document.getElementById('services-grid');
        grid.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">Caricamento servizi…</div>';

        try {
            let url = '/api/services';
            if (selectedVehicleType) url += '?tipo_veicolo=' + selectedVehicleType;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (!data.success || !data.services || data.services.length === 0) {
                grid.innerHTML = '<div class="no-slots-message">Nessun servizio disponibile</div>';
                return;
            }

            grid.innerHTML = '';
            data.services.forEach(svc => {
                const card = document.createElement('div');
                card.className = 'service-card';
                card.dataset.serviceId = svc.id;

                const durataLabel = svc.durata_minuti ? (svc.durata_minuti + ' min') : '';
                const prezzoLabel = svc.prezzo ? ('€ ' + parseFloat(svc.prezzo).toFixed(2)) : '';
                const isConsegna = svc.tipo_servizio === 'consegna' || (svc.nome || '').toLowerCase().includes('consegna');

                card.innerHTML =
                    '<div class="service-card-name">' + (svc.nome || 'Servizio') + '</div>' +
                    (durataLabel ? '<div class="service-card-detail">' + durataLabel + '</div>' : '') +
                    (prezzoLabel ? '<div class="service-card-detail">' + prezzoLabel + '</div>' : '') +
                    (svc.descrizione ? '<div class="service-card-desc">' + svc.descrizione + '</div>' : '');

                card.addEventListener('click', () => {
                    document.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    selectedService = svc;
                    
                    document.getElementById('service-next-btn').disabled = false;
                    
                    const conInfo = document.getElementById('consegna-note');
                    if (conInfo) {
                        if (isConsegna) conInfo.style.display = 'block';
                        else conInfo.style.display = 'none';
                    }
                });

                grid.appendChild(card);
            });
            document.getElementById('service-next-btn').disabled = true;

        } catch (error) {
            grid.innerHTML = '<div class="no-slots-message">Errore nel caricamento servizi</div>';
        }
    }

    // ==================== CALENDARIO ====================

    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const monthLabel = document.getElementById('current-month');

        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

        monthLabel.textContent = monthNames[month] + ' ' + year;

        const headers = grid.querySelectorAll('.calendar-day-header');
        grid.innerHTML = '';
        headers.forEach(h => grid.appendChild(h));

        const firstDay = new Date(year, month, 1);
        let startDay = firstDay.getDay() - 1;
        if (startDay < 0) startDay = 6;

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < startDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day empty';
            grid.appendChild(emptyCell);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const cell = document.createElement('div');
            cell.className = 'calendar-day';
            cell.textContent = day;

            const dateStr = formatDateForAPI(date);
            cell.dataset.date = dateStr;

            const dayOfWeek = date.getDay();
            if (date < today || !guestDaysOpen.includes(dayOfWeek)) {
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
        
        const container = document.getElementById('time-slots-container');
        if (container) container.classList.add('hidden');
        selectedDate = null;
        selectedTime = null;
    }

    async function selectDate(dateStr, dateObj) {
        document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
        const cell = document.querySelector('.calendar-day[data-date="' + dateStr + '"]');
        if (cell) cell.classList.add('selected');

        selectedDate = dateStr;
        selectedTime = null;
        updateSummary();

        await loadTimeSlots(dateStr, dateObj);
    }

    async function loadTimeSlots(dateStr, dateObj) {
        const container = document.getElementById('time-slots-container');
        const grid = document.getElementById('time-slots-grid');
        const title = document.getElementById('selected-date-title');

        if (!container || !grid) return;

        container.classList.remove('hidden');
        grid.innerHTML = '<div class="loading">Caricamento orari...</div>';

        const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        if (title) title.textContent = 'Orari disponibili - ' + dayNames[dateObj.getDay()] + ' ' + dateObj.getDate();

        // Calculate slots needed (1 slot = 30min default, or dynamic based on duration)
        const duration = selectedService ? (selectedService.durata_minuti || 60) : 60;
        const slotsNeeded = Math.ceil(duration / 30);

        try {
            const response = await fetch('/api/slots/' + dateStr);
            const data = await response.json();

            if (data.success && data.slots.length > 0) {
                grid.innerHTML = '';
                
                const allSlotTimes = data.slots.map(s => typeof s === "object" ? s.time : s);
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

                let validSlots = [];
                data.slots.forEach(slot => {
                    const slotTime = typeof slot === 'object' ? slot.time : slot;
                    if (!availableTimes.has(slotTime)) return;

                    const startIndex = allSlotTimes.indexOf(slotTime);
                    if (startIndex === -1) return;

                    let canBook = true;
                    for (let i = 1; i < slotsNeeded; i++) {
                        const nextSlotTime = allSlotTimes[startIndex + i];
                        if (!nextSlotTime || !availableTimes.has(nextSlotTime)) {
                            canBook = false;
                            break;
                        }
                    }

                    if (canBook) validSlots.push(slotTime);
                });

                if (validSlots.length === 0) {
                    grid.innerHTML = '<div class="no-slots-message">Nessun orario sufficiente disponibile</div>';
                    return;
                }

                validSlots.forEach(slotTime => {
                    const slotEl = document.createElement('div');
                    slotEl.className = 'time-slot';
                    slotEl.innerHTML = slotTime;
                    slotEl.dataset.time = slotTime;
                    slotEl.addEventListener('click', () => selectTimeSlot(slotTime));
                    grid.appendChild(slotEl);
                });
            } else {
                grid.innerHTML = '<div class="no-slots-message">Nessun orario disponibile</div>';
            }
        } catch (error) {
            grid.innerHTML = '<div class="no-slots-message">Errore caricamento. Riprova.</div>';
        }
    }

    function selectTimeSlot(time) {
        document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
        const slot = document.querySelector('.time-slot[data-time="' + time + '"]');
        if (slot) slot.classList.add('selected');

        selectedTime = time;
        updateSummary();
        setTimeout(() => goToStep(3), 300);
    }

    // ==================== CONFERMA PRENOTAZIONE ====================

    async function handleConfirmBooking(e) {
        e.preventDefault();

        // Raccogli dati dal form
        const nome = document.getElementById('nome').value.trim();
        const cognome = document.getElementById('cognome').value.trim();
        const email = document.getElementById('email').value.trim();
        
        const telEl = document.getElementById('telefono');
        const telefono = telEl ? telEl.value.trim() : '';

        const targaEl = document.getElementById('targa');
        const modelloEl = document.getElementById('modello');
        const noteEl = document.getElementById('note_cliente');
        
        const targa = targaEl ? targaEl.value.trim() : '';
        const modello = modelloEl ? modelloEl.value.trim() : '';
        const note_cliente = noteEl ? noteEl.value.trim() : '';

        // Validation
        if (!nome || !cognome || !email || !targa || !modello) {
            showError('Compila tutti i campi obbligatori');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showError('Inserisci un indirizzo email valido');
            return;
        }

        if (!selectedDate || !selectedTime || !selectedService) {
            showError('Devi selezionare un servizio, una data e un orario.');
            return;
        }

        const payload = {
            nome: nome,
            cognome: cognome,
            email: email,
            telefono: telefono,
            targa: targa,
            modello: modello,
            note_cliente: note_cliente,
            data: selectedDate,         // Formato v2
            orario: selectedTime,       // Formato v2
            giorno: selectedDate,       // Fallback
            ora: selectedTime,          // Fallback
            serviceId: selectedService.id,
            durata_minuti: selectedService.durata_minuti || 60,
            tipo: 'cliente',
            isGuest: 1
        };

        const btn = e.target.querySelector('button[type="submit"]');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Prenotazione in corso...';
        }

        try {
            const response = await fetch('/api/bookings/guest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.success) {
                showConfirmation(payload);
            } else {
                showError(data.error || 'Errore durante la prenotazione');
                if (btn) { btn.disabled = false; btn.textContent = 'Conferma Prenotazione'; }
            }
        } catch (error) {
            console.error('Errore prenotazione:', error);
            showError('Errore di connessione. Riprova.');
            if (btn) { btn.disabled = false; btn.textContent = 'Conferma Prenotazione'; }
        }
    }

    function showConfirmation(payload) {
        Object.values(sections).forEach(s => {
            if (s) s.classList.remove('active');
        });

        for (let i = 0; i <= 3; i++) {
            if (stepIndicators[i]) {
                stepIndicators[i].classList.remove('active');
                stepIndicators[i].classList.add('completed');
            }
        }

        if (sections.confirmation) sections.confirmation.classList.add('active');

        const confMsg = document.getElementById('conf-message');
        if (confMsg) {
            confMsg.innerHTML = 'La prenotazione per <strong>' + 
            (selectedService ? selectedService.nome : 'Servizio') + 
            '</strong> il <strong>' + formatDateDisplay(selectedDate) + '</strong> alle <strong>' + selectedTime + '</strong> è stata confermata.<br><br>' +
            'Riceverai a breve una email di riepilogo.';
        }

        const confNome = document.getElementById('conf-nome');
        const confService = document.getElementById('conf-service');
        const confDate = document.getElementById('conf-data');
        const confTime = document.getElementById('conf-ora');
        
        if (confNome) confNome.textContent = (payload && payload.nome ? payload.nome : '') + ' ' + (payload && payload.cognome ? payload.cognome : '');
        if (confService) confService.textContent = selectedService ? selectedService.nome : 'Servizio';
        if (confDate) confDate.textContent = formatDateDisplay(selectedDate);
        if (confTime) confTime.textContent = selectedTime;
    }

    // ==================== UTILITIES ====================

    function formatDateForAPI(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function formatDateDisplay(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length < 3) return dateStr;
        
        const date = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
        const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

        return dayNames[date.getDay()] + ' ' + parts[2] + ' ' + monthNames[date.getMonth()] + ' ' + parts[0];
    }

    function showError(message) {
        const errorEl = document.getElementById('form-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
            setTimeout(() => { errorEl.classList.add('hidden'); }, 5000);
        } else {
            alert(message);
        }
    }

})();
