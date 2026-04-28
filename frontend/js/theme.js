// ============================================================================
// THEME MANAGER - Apple Style Light/Dark Mode Toggle
// Gestisce il cambio tema e la persistenza con localStorage
// ============================================================================

(function () {
    'use strict';

    const THEME_KEY = 'lb-service-theme';
    const THEMES = {
        LIGHT: 'light',
        DARK: 'dark'
    };

    // Ottieni tema salvato o default a light
    function getSavedTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved && Object.values(THEMES).includes(saved)) {
            return saved;
        }
        // Check system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return THEMES.DARK;
        }
        return THEMES.LIGHT;
    }

    // Applica tema al documento
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
    }

    // Toggle tra light e dark con Wipe Animation
    function toggleTheme() {
        const root = document.documentElement;
        const current = root.getAttribute('data-theme') || THEMES.LIGHT;
        const next = current === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT;

        const direction = next === THEMES.DARK ? 'to-dark' : 'to-light';
        root.setAttribute('data-vt', direction);

        const performUpdate = () => {
            applyTheme(next);
        };

        // Supporto View Transitions API
        if (document.startViewTransition) {
            document.startViewTransition(() => performUpdate());
        } else {
            // Fallback per browser non supportati (Overlay Wipe)
            toggleThemeFallback(next, performUpdate);
        }

        return next;
    }

    // Fallback animation per browser senza View Transitions
    function toggleThemeFallback(nextTheme, updateCallback) {
        const root = document.documentElement;
        const overlay = document.createElement('div');
        overlay.className = 'theme-wipe is-on ' + (nextTheme === THEMES.DARK ? 'ltr' : 'rtl');

        // Colore dell’overlay = colore finale
        overlay.style.setProperty('--wipe-color', nextTheme === THEMES.DARK ? '#000' : '#fff');
        document.body.appendChild(overlay);

        // Cambia tema a metà animazione
        setTimeout(() => {
            updateCallback();
        }, 210);

        // Rimuovi overlay a fine animazione
        setTimeout(() => {
            overlay.remove();
        }, 450);
    }

    // Crea il toggle button se non esiste
    function createThemeToggle() {
        // Mostra toggle solo in Home Page
        const path = window.location.pathname;
        const isHome = path === '/' || path === '/index.html' || path.endsWith('/index.html');

        if (!isHome || document.querySelector('.theme-toggle')) {
            return;
        }

        const toggle = document.createElement('div');
        toggle.className = 'theme-toggle';
        toggle.innerHTML = `
      <button class="theme-switch" aria-label="Cambia tema" title="Cambia tema">
        <span class="theme-switch-icon sun">☀</span>
        <span class="theme-switch-icon moon">☾</span>
      </button>
    `;

        toggle.querySelector('.theme-switch').addEventListener('click', toggleTheme);
        document.body.appendChild(toggle);
    }

    // Inizializzazione
    function init() {
        // Applica tema salvato immediatamente (evita flash)
        const savedTheme = getSavedTheme();
        applyTheme(savedTheme);

        // Crea toggle quando DOM e pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createThemeToggle);
        } else {
            createThemeToggle();
        }

        // Ascolta cambiamenti preferenza di sistema
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                // Solo se non c'e preferenza salvata manualmente
                if (!localStorage.getItem(THEME_KEY)) {
                    applyTheme(e.matches ? THEMES.DARK : THEMES.LIGHT);
                }
            });
        }
    }

    // Esporta globalmente
    window.ThemeManager = {
        toggle: toggleTheme,
        setTheme: applyTheme,
        getTheme: () => document.documentElement.getAttribute('data-theme') || THEMES.LIGHT,
        THEMES
    };

    // Auto-init
    init();

})();
