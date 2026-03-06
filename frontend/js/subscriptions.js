// ============================================================================
// SUBSCRIPTIONS.JS - Gestione selezione tipo abbonamento
// ============================================================================

(function () {
    'use strict';

    // Verifica autenticazione
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

    // Inizializza sidebar
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

    // Gestione selezione abbonamento
    function initSubscriptionCards() {
        const cards = document.querySelectorAll('.subscription-card');

        cards.forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.type;
                const weeks = parseInt(card.dataset.weeks);

                // Salva in sessionStorage
                sessionStorage.setItem('subscriptionType', type);
                sessionStorage.setItem('subscriptionWeeks', weeks);
                sessionStorage.setItem('subscriptionBookings', JSON.stringify([]));
                sessionStorage.setItem('subscriptionCurrentWeek', '0');

                // Redirect al calendario abbonamenti
                window.location.href = '/subscription-booking';
            });

            // Effetto hover migliorato
            card.addEventListener('mouseenter', () => {
                cards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });

            card.addEventListener('mouseleave', () => {
                card.classList.remove('selected');
            });
        });
    }

    // Init
    async function init() {
        const user = await checkAuth();
        if (!user) return;

        initSidebar();
        initSubscriptionCards();
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
