// ============================================================================
// SUBSCRIPTION-BOOKING.JS - Calendario per prenotazioni abbonamento
// ============================================================================

(function () {
    'use strict';

    // State
    let currentUser = null;
    let subscriptionType = null;
    let totalSlots = 0;
    let selectedBookings = [];
    let currentWeekIndex = 0;
    let currentMonth = new Date();
    let selectedDate = null;
    let selectedTime = null;
    let pendingBooking = null;

    // DOM Elements
    let calendarGrid, timeSlotsSection, timeSlotsGrid;

    // ==================== AUTH ====================

    async function checkAuth() {
        try {
            const response = await fetch('/api/auth/me');
            const data = await response.json();

            if (!data.success) {
                window.location.href = '/login';
                return null;
            }

            return data.user;
        } catch (error) {
            console.error('Errore verifica auth:', error);
            window.location.href = '/login';
            return null;
        }
    }

    // ==================== SIDEBAR ====================

    function initSidebar() {
        const hamburger = document.getElementById('hamburger-btn');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const closeBtn = document.getElementById('close-sidebar');
        const logoutBtn = document.getElementById('sidebar-logout');

        function openSidebar() {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        }

        function closeSidebar() {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        }

        if (hamburger) hamburger.addEventListener('click', openSidebar);
        if (overlay) overlay.addEventListener('click', closeSidebar);
        if (closeBtn) closeBtn.addEventListener('click', closeSidebar);

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
            });
        }
    }

    // ==================== SUBSCRIPTION STATE ====================

    function loadSubscriptionState() {
        subscriptionType = sessionStorage.getItem('subscriptionType');
        totalSlots = parseInt(sessionStorage.getItem('subscriptionWeeks')) || 4;

        const savedBookings = sessionStorage.getItem('subscriptionBookings');
        selectedBookings = savedBookings ? JSON.parse(savedBookings) : [];

        currentWeekIndex = parseInt(sessionStorage.getItem('subscriptionCurrentWeek')) || 0;

        if (!subscriptionType) {
            window.location.href = '/subscriptions';
            return false;
        }

        return true;
    }

    function saveSubscriptionState() {
        sessionStorage.setItem('subscriptionBookings', JSON.stringify(selectedBookings));
        sessionStorage.setItem('subscriptionCurrentWeek', currentWeekIndex.toString());
    }

    function updateUI() {
        // Update banner
        document.getElementById('current-count').textContent = selectedBookings.length;
        document.getElementById('max-count').textContent = totalSlots;
        document.getElementById('total-slots').textContent = totalSlots;

        // Update type label
        const labels = {
            'monthly': 'Prenotazione Mensile',
            'bimonthly': 'Prenotazione Bimestrale',
            'quarterly': 'Prenotazione Trimestrale'
        };
        document.getElementById('subscription-type-label').textContent = labels[subscriptionType] || 'Prenotazione';

        // Update week info
        document.getElementById('week-number').textContent = currentWeekIndex + 1;
        document.getElementById('total-weeks').textContent = totalSlots;

        // Show selected bookings
        updateSelectedBookingsList();

        // Check if complete
        if (selectedBookings.length >= totalSlots) {
            showConfirmModal();
        }
    }

    function updateSelectedBookingsList() {
        const container = document.getElementById('selected-bookings');
        const list = document.getElementById('selected-bookings-list');

        if (selectedBookings.length === 0) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        list.innerHTML = selectedBookings.map((booking, index) => `
            <div class="selected-booking-item">
                <div class="selected-booking-info">
                    <div class="selected-booking-date">${formatDate(booking.giorno)}</div>
                    <div class="selected-booking-time">${booking.ora} - ${booking.servizio}</div>
                    <div class="selected-booking-week">Settimana ${index + 1}</div>
                </div>
                <button class="btn-modify" onclick="modifyBooking(${index})">Modifica</button>
            </div>
        `).join('');
    }

    // ==================== CALENDAR ====================

    function initCalendar() {
        calendarGrid = document.getElementById('calendar-grid');
        timeSlotsSection = document.getElementById('time-slots-section');
        timeSlotsGrid = document.getElementById('time-slots-grid');

        document.getElementById('prev-month').addEventListener('click', () => {
            currentMonth.setMonth(currentMonth.getMonth() - 1);
            renderCalendar();
        });

        document.getElementById('next-month').addEventListener('click', () => {
            currentMonth.setMonth(currentMonth.getMonth() + 1);
            renderCalendar();
        });

        renderCalendar();
    }

    function renderCalendar() {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        // Update month display
        const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        document.getElementById('current-month').textContent = `${monthNames[month]} ${year}`;

        // Clear existing days (keep headers)
        const headers = calendarGrid.querySelectorAll('.calendar-day-header');
        calendarGrid.innerHTML = '';
        headers.forEach(h => calendarGrid.appendChild(h));

        // Get first day of month (0 = Sunday, adjust to Monday = 0)
        const firstDay = new Date(year, month, 1).getDay();
        const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;

        // Get days in month
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Empty cells for days before first
        for (let i = 0; i < adjustedFirstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day empty';
            calendarGrid.appendChild(emptyCell);
        }

        // Days of month
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateStr = formatDateISO(date);
            const dayOfWeek = date.getDay();

            const cell = document.createElement('div');
            cell.className = 'calendar-day';
            cell.textContent = day;

            // Sunday or past date
            if (dayOfWeek === 0 || date < today) {
                cell.classList.add('disabled');
            } else {
                // Check if already booked in this subscription
                const alreadyBooked = selectedBookings.some(b => b.giorno === dateStr);
                if (alreadyBooked) {
                    cell.classList.add('selected', 'disabled');
                    cell.title = 'Giorno già selezionato';
                }

                // Check if in allowed week range
                const weekOfBooking = getWeekNumber(date);
                const canBook = isDateInAllowedWeek(date);

                if (!canBook && !alreadyBooked) {
                    cell.classList.add('disabled');
                    cell.title = 'Questa settimana è già stata prenotata';
                }

                cell.addEventListener('click', () => {
                    if (!cell.classList.contains('disabled')) {
                        selectDate(dateStr, cell);
                    }
                });
            }

            calendarGrid.appendChild(cell);
        }
    }

    function getWeekNumber(date) {
        const start = new Date(date.getFullYear(), 0, 1);
        const diff = date - start;
        const oneWeek = 604800000;
        return Math.ceil(diff / oneWeek);
    }

    function isDateInAllowedWeek(date) {
        // Check if this week already has a booking
        const weekStart = getWeekStart(date);
        const weekEnd = getWeekEnd(date);

        return !selectedBookings.some(booking => {
            const bookingDate = new Date(booking.giorno);
            return bookingDate >= weekStart && bookingDate <= weekEnd;
        });
    }

    function getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function getWeekEnd(date) {
        const start = getWeekStart(date);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return end;
    }

    async function selectDate(dateStr, cell) {
        selectedDate = dateStr;

        // Clear previous selection
        document.querySelectorAll('.calendar-day.selected').forEach(c => {
            if (!selectedBookings.some(b => b.giorno === c.dataset?.date)) {
                c.classList.remove('selected');
            }
        });
        cell.classList.add('selected');
        cell.dataset.date = dateStr;

        // Update week info
        const dateObj = new Date(dateStr);
        const weekStart = getWeekStart(dateObj);
        const weekEnd = getWeekEnd(dateObj);
        document.getElementById('week-dates').textContent =
            `${formatDate(formatDateISO(weekStart))} - ${formatDate(formatDateISO(weekEnd))}`;

        // Load time slots
        await loadTimeSlots(dateStr);
    }

    async function loadTimeSlots(dateStr) {
        timeSlotsSection.classList.remove('hidden');
        timeSlotsGrid.innerHTML = '<div class="loading">Caricamento orari...</div>';

        try {
            const response = await fetch(`/api/slots/${dateStr}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            // Client-side filtering for today (consistency with dashboard.js)
            let availableSlots = data.slots;

            // Check if selected date is Today
            const today = new Date();
            const selectedDateObj = new Date(dateStr);
            // Reset hours to compare just the date part properly
            today.setHours(0, 0, 0, 0);
            selectedDateObj.setHours(0, 0, 0, 0);

            const isToday = selectedDateObj.getTime() === today.getTime();

            if (isToday) {
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();

                availableSlots = availableSlots.filter(slot => {
                    // Always keep already booked slots (visual consistency) or holidays
                    if (!slot.available || slot.isHoliday) return true;

                    const [slotHour, slotMinute] = slot.time.split(':').map(Number);
                    return slotHour > currentHour || (slotHour === currentHour && slotMinute > currentMinute);
                });
            }

            renderTimeSlots(availableSlots);
        } catch (error) {
            console.error('Errore caricamento slot:', error);
            timeSlotsGrid.innerHTML = '<div class="no-slots-message">Errore nel caricamento degli orari</div>';
        }
    }

    function renderTimeSlots(slots) {
        if (!slots || slots.length === 0) {
            timeSlotsGrid.innerHTML = '<div class="no-slots-message">Nessun orario disponibile</div>';
            return;
        }

        timeSlotsGrid.innerHTML = slots.map(slot => {
            const isHoliday = slot.isHoliday;
            const isBooked = !slot.available && !isHoliday;
            const classes = ['time-slot'];

            if (isHoliday) classes.push('holiday', 'disabled');
            else if (isBooked) classes.push('disabled');

            return `
                <div class="${classes.join(' ')}" 
                     data-time="${slot.time}"
                     ${(isHoliday || isBooked) ? '' : `onclick="selectTime('${slot.time}')"`}>
                    ${slot.time}
                </div>
            `;
        }).join('');
    }

    // ==================== TIME SELECTION ====================

    window.selectTime = function (time) {
        selectedTime = time;
        // Aggiungi prenotazione direttamente senza modal servizio
        addBooking(selectedDate, selectedTime);
    };

    function addBooking(giorno, ora) {
        // Add to selected bookings
        selectedBookings.push({
            giorno,
            ora,
            weekIndex: currentWeekIndex
        });

        currentWeekIndex++;

        // Save state
        saveSubscriptionState();

        // Hide time slots
        timeSlotsSection.classList.add('hidden');
        selectedDate = null;
        selectedTime = null;

        // Update UI
        updateUI();

        // If not complete, auto-advance to next week
        if (selectedBookings.length < totalSlots) {
            const lastBookingDate = new Date(giorno);
            lastBookingDate.setDate(lastBookingDate.getDate() + 7);
            currentMonth = new Date(lastBookingDate);
            renderCalendar();
        }
    }

    // ==================== MODIFY BOOKING ====================

    window.modifyBooking = function (index) {
        const booking = selectedBookings[index];

        // Remove this booking
        selectedBookings.splice(index, 1);

        // Reset current week to this index
        currentWeekIndex = index;

        // Navigate to that week
        const bookingDate = new Date(booking.giorno);
        currentMonth = new Date(bookingDate);

        saveSubscriptionState();
        updateUI();
        renderCalendar();
    };

    // ==================== CONFIRM MODAL ====================

    function showConfirmModal() {
        const modal = document.getElementById('confirm-modal');
        const list = document.getElementById('modal-booking-list');

        list.innerHTML = selectedBookings.map((booking, index) => `
            <div class="modal-booking-item">
                <div>
                    <strong>Settimana ${index + 1}</strong><br>
                    ${formatDate(booking.giorno)} alle ${booking.ora}<br>
                    <small>${booking.servizio}</small>
                </div>
                <button class="btn-modify" onclick="closeModalAndModify(${index})">Modifica</button>
            </div>
        `).join('');

        modal.classList.remove('hidden');
    }

    window.closeModalAndModify = function (index) {
        document.getElementById('confirm-modal').classList.add('hidden');
        window.modifyBooking(index);
    };

    function initConfirmModal() {
        const modal = document.getElementById('confirm-modal');
        const cancelBtn = document.getElementById('modal-cancel');
        const confirmBtn = document.getElementById('modal-confirm');

        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        confirmBtn.addEventListener('click', async () => {
            await confirmSubscription();
        });

        modal.querySelector('.modal-overlay').addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    async function confirmSubscription() {
        const confirmBtn = document.getElementById('modal-confirm');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Conferma in corso...';

        try {
            // Create all bookings
            for (const booking of selectedBookings) {
                const response = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        data: booking.giorno,
                        orario: booking.ora
                    })
                });

                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.error || 'Errore nella creazione della prenotazione');
                }
            }

            // Clear session storage
            sessionStorage.removeItem('subscriptionType');
            sessionStorage.removeItem('subscriptionWeeks');
            sessionStorage.removeItem('subscriptionBookings');
            sessionStorage.removeItem('subscriptionCurrentWeek');

            document.getElementById('confirm-modal').classList.add('hidden');
            document.getElementById('success-modal').classList.remove('hidden');

        } catch (error) {
            console.error('Errore conferma abbonamento:', error);
            alert('Errore nella conferma: ' + error.message);
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Conferma Abbonamento';
        }
    }

    // ==================== SUCCESS MODAL ====================

    function initSuccessModal() {
        const homeBtn = document.getElementById('success-home-btn');
        if (homeBtn) {
            homeBtn.addEventListener('click', () => {
                window.location.href = '/bookings';
            });
        }
    }

    // ==================== CANCEL ====================

    function initCancelButton() {
        document.getElementById('cancel-subscription').addEventListener('click', () => {
            if (confirm('Sei sicuro di voler annullare la prenotazione? Tutti gli appuntamenti selezionati andranno persi.')) {
                sessionStorage.removeItem('subscriptionType');
                sessionStorage.removeItem('subscriptionWeeks');
                sessionStorage.removeItem('subscriptionBookings');
                sessionStorage.removeItem('subscriptionCurrentWeek');
                window.location.href = '/subscriptions';
            }
        });
    }

    // ==================== UTILS ====================

    function formatDate(dateStr) {
        const [year, month, day] = dateStr.split('-');
        const date = new Date(year, month - 1, day);
        const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
        return `${days[date.getDay()]} ${day} ${months[date.getMonth()]}`;
    }

    function formatDateISO(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ==================== INIT ====================

    async function init() {
        currentUser = await checkAuth();
        if (!currentUser) return;

        if (!loadSubscriptionState()) return;

        initSidebar();
        initCalendar();
        initConfirmModal();
        initSuccessModal();
        initCancelButton();
        updateUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
