# Theme toggle con animazione “wipe” (Light ⇄ Dark) — guida operativa

Obiettivo: quando l’utente attiva Dark Mode, l’interfaccia passa gradualmente da Light→Dark con un **wipe da sinistra verso destra**; quando torna a Light Mode, wipe **da destra verso sinistra**.  
Approccio consigliato: usare **View Transitions API** quando disponibile (animazione fluida del cambio stato DOM), con fallback CSS (overlay + clip-path) per browser non compatibili [web:74][web:76].

---

## 1) Prerequisito: tema già gestito via `data-theme`

Assumiamo che il tuo tema sia controllato così:

- Light: `html[data-theme="light"]`
- Dark: `html[data-theme="dark"]`

Questo pattern è comune per sovrascrivere/gestire manualmente il tema e salvarlo in storage [web:79].  
Se non lo fai ancora, implementalo così (minimo):

```js
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}
________________________________________
2) CSS: definisci colori tramite custom properties
Invece di cambiare 200 classi, definisci variabili e riferiscile ovunque (background, text, border, ecc.).
Esempio (riduci/espandi con la tua palette):
css
:root {
  --bg: #ffffff;
  --text: #000000;
  --card: #f5f5f5;
}

html[data-theme="dark"] {
  --bg: #000000;
  --text: #ffffff;
  --card: #1c1c1e;
}

body {
  background: var(--bg);
  color: var(--text);
}
.card {
  background: var(--card);
}
________________________________________
3) Soluzione principale: View Transitions API (wipe L→R / R→L)
La View Transition API permette di animare il passaggio tra due stati del DOM con pseudo-elementi ::view-transition-old() e ::view-transition-new() [web:74][web:76].
CSS (wipe orizzontale)
css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none !important;
  }
}

@media (prefers-reduced-motion: no-preference) {
  /* Il root è l'intera pagina */
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation-duration: 420ms;
    animation-timing-function: ease-in-out;
  }

  /* Dark ON: rivela il nuovo stato da sinistra verso destra */
  html[data-vt="to-dark"]::view-transition-new(root) {
    animation-name: wipe-ltr;
  }

  /* Light ON: rivela il nuovo stato da destra verso sinistra */
  html[data-vt="to-light"]::view-transition-new(root) {
    animation-name: wipe-rtl;
  }

  @keyframes wipe-ltr {
    from { clip-path: inset(0 100% 0 0); }
    to   { clip-path: inset(0 0 0 0); }
  }

  @keyframes wipe-rtl {
    from { clip-path: inset(0 0 0 100%); }
    to   { clip-path: inset(0 0 0 0); }
  }
}
Nota: clip-path è una tecnica standard per creare effetti “wipe” (maschera che scopre progressivamente) [web:87][web:78].
JS (toggle con document.startViewTransition)
js
function toggleThemeWithWipe(nextTheme) {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme') || 'light';

  const direction = nextTheme === 'dark' ? 'to-dark' : 'to-light';
  root.setAttribute('data-vt', direction);

  const apply = () => {
    root.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  // Se supportato, anima il cambio tema
  if (document.startViewTransition) {
    document.startViewTransition(() => apply());
  } else {
    // Fallback: applica direttamente (vedi sezione 4)
    apply();
  }
}
Questo pattern (“se supportato usa startViewTransition, altrimenti esegui il cambio tema diretto”) è quello tipico d’uso [web:73][web:74].
________________________________________
4) Fallback per browser senza View Transitions (overlay wipe)
Se document.startViewTransition non è disponibile, puoi simulare il wipe con un overlay full-screen che anima la sua maschera e, a metà animazione, cambia tema.
CSS overlay
css
.theme-wipe {
  position: fixed;
  inset: 0;
  background: var(--wipe-color);
  pointer-events: none;
  z-index: 999999;
  clip-path: inset(0 100% 0 0);
}

.theme-wipe.is-on.ltr { animation: wipe-ltr 420ms ease-in-out forwards; }
.theme-wipe.is-on.rtl { animation: wipe-rtl 420ms ease-in-out forwards; }

@keyframes wipe-ltr {
  from { clip-path: inset(0 100% 0 0); }
  to   { clip-path: inset(0 0 0 0); }
}

@keyframes wipe-rtl {
  from { clip-path: inset(0 0 0 100%); }
  to   { clip-path: inset(0 0 0 0); }
}
JS fallback
js
function toggleThemeFallback(nextTheme) {
  const root = document.documentElement;

  const overlay = document.createElement('div');
  overlay.className = 'theme-wipe is-on ' + (nextTheme === 'dark' ? 'ltr' : 'rtl');

  // Colore dell’overlay = colore finale, così “sembra” che i colori virino
  overlay.style.setProperty('--wipe-color', nextTheme === 'dark' ? '#000' : '#fff');

  document.body.appendChild(overlay);

  // Cambia tema a metà animazione
  window.setTimeout(() => {
    root.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
  }, 210);

  // Rimuovi overlay a fine animazione
  window.setTimeout(() => {
    overlay.remove();
  }, 450);
}
________________________________________
5) Logo: versione bianca/nera + inversione
Opzione A (consigliata): due asset e swap via CSS
xml
<img class="brand-logo" src="/logo-light.svg" alt="Logo">
css
html[data-theme="dark"] .brand-logo { content: url("/logo-dark.svg"); }
html[data-theme="light"] .brand-logo { content: url("/logo-light.svg"); }
Questo evita filtri e mantiene resa perfetta (specie se il logo non è monocromatico).
Opzione B: un solo asset + filtro
Se il logo è monocromatico, puoi invertire con filter: invert(1) ma è meno controllabile su colori/antialiasing [web:86].
________________________________________
6) Persistenza: tema scelto “solo all’inizio”
Salva il tema in localStorage e applicalo subito al load (prima del render) per evitare “flash”:
js
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();
(Lo schema di salvataggio/restore via storage + data-theme è un approccio comune) [web:79].
________________________________________
7) Rimuovere i tasti Light/Dark da tutte le pagine tranne Home
Strategia (pulita): render condizionale per route/pagina
•	Mostra il toggle solo in Home
•	Nelle altre pagine: non renderizzare proprio il componente (evita “spazio vuoto” e DOM inutile)
Esempi rapidi:
Se usi routing (pseudo)
js
const isHome = location.pathname === '/';
toggleEl.style.display = isHome ? 'block' : 'none';
Se usi template server-side
•	Inserisci il markup del toggle solo nel template della Home.
•	Oppure passa una flag showThemeToggle al layout.
Importante
Il tema resta applicato globalmente perché è sul tag html[data-theme="..."], quindi vale per tutte le pagine senza bisogno del bottone ovunque [web:79].
________________________________________
Mini-checklist di accettazione
•	Dark ON: wipe sinistra → destra
•	Light ON: wipe destra → sinistra
•	Rispetta prefers-reduced-motion (se ridotto, niente animazione) [web:88]
•	Tema persistente via localStorage [web:79]
•	Toggle visibile solo in Home, ma tema globale su tutto il sito/app [web:79]

