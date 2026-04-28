# Piano di Implementazione Definitivo: Touchmove Resiliente (Ferie & Ore Straordinarie)

## Obiettivo Primario
Ripristinare la funzionalità di trascinamento touch (drag-to-select) per le modalità Ferie e Ore Straordinarie, garantendo che sia **totalmente immune** alle rigenerazioni del DOM causate dalle policy di sicurezza XSS (es. `innerHTML` o `textContent`). L'approccio deve rispecchiare l'architettura solida del `mousemove`, utilizzando l'Event Delegation e il rilevamento spaziale.

## Architettura del Problema
Attualmente, il doppio tap touch fallisce perché memorizza temporaneamente il **riferimento fisico al nodo DOM** (`_holLastTapCell = cell`). Se tra il primo e il secondo tap il DOM viene aggiornato, il nodo cambia in memoria e il controllo fallisce. Al contrario, il mouse funziona perché usa un click singolo e rileva le celle "in volo" calcolando le coordinate a schermo tramite `document.elementFromPoint()`.

---

## 📋 Task List Operativa e Architetturale

### STEP 1: Disaccoppiamento dello Stato ("State-DOM Decoupling")
La logica del doppio tap deve basarsi sui dati, non sui nodi fisici.
- [ ] **Variabili di Stato:** Sostituire `let _holLastTapCell = null;` con `let _holLastTapTargetId = null;`.
- [ ] **Costruzione ID Univoco:** Al primo tocco di una cella, mappare il bersaglio tramite i suoi `dataset`: `const targetId = \`\${cell.dataset.date}_\${cell.dataset.time}\`;`.
- [ ] **Validazione Doppio Tap:** Al secondo tocco, confrontare `targetId === _holLastTapTargetId` e il delta temporale (`< 450ms`). In questo modo, anche se la cella è stata distrutta e ricreata dal motore di rendering di sicurezza, l'ID virtuale combacerà perfettamente.

### STEP 2: Event Delegation e Lifecycle su `#admin-calendar-grid` (Touch Start)
Il grid deve fare da listener stabile per l'avvio, delegando poi tutto il resto a `window` per non perdere i touch fuori bordo.
- [ ] **Gestione `touchstart` sul contenitore padre:** Agganciare l'evento direttamente al grid.
- [ ] **Scrolling Nativo:** *Non* chiamare `e.preventDefault()` al primo tap. Lo scroll di sistema deve poter scorrere liberamente se l'utente sta solo navigando.
- [ ] **Innesco del Drag:** Se il doppio tap viene validato, chiamare `e.preventDefault()` per bloccare lo scrolling nativo iOS/Android, far vibrare il dispositivo (`navigator.vibrate`) come feedback aptico, e scatenare l'avvio del Drag.

### STEP 3: Geometria e Rilevamento "In Volo" (Touch Move)
Uniformare il comportamento del touch a quello del mouse, ignorando i figli del DOM e le loro gerarchie, analizzando solo "cosa c'è sotto il dito in questo istante".
- [ ] **Listener Dinamici su Window:** Nel momento dell'innesco, agganciare `window.addEventListener('touchmove', _holOnWindowTouchMove, { passive: false })`.
- [ ] **Coordinate Assolute:** All'interno di `_holOnWindowTouchMove`, recuperare le coordinate `x` e `y` del touch attivo `e.touches[0]`.
- [ ] **Raycasting (`elementFromPoint`):** Invece di affidarsi al target eventuale, usare `document.elementFromPoint(clientX, clientY)` per scovare la cella `.admin-cell` posizionata in quel millimetro di schermo. Se esiste, validarne i `dataset` ed eseguire `addToDragSelection()`. In questo modo la distruzione/ricreazione DOM via `innerHTML` è ininfluente per il dito in movimento.

### STEP 4: Auto-Scrolling Fluido e Limitazione Aree (RAF Scroll)
Il calendario deve scorrere automaticamente se il dito si avvicina ai bordi superiore/inferiore del container visibile, in totale parallelismo con il funzionamento desktop.
- [ ] **Container Lock (`touch-action`):** Applicare dinamicamente durante il drag la regola CSS inline `document.documentElement.style.touchAction = 'none'` per annullare il pull-to-refresh dei dispositivi mobile, che interferirebbe col drag.
- [ ] **RequestAnimationFrame Loop:** Usare lo stesso identico ciclo RAF del mouse, aggiornando `cal.scrollTop` in base a una frazione proporzionale di avvicinamento ai bordi (`_holComputeScrollFactor`).
- [ ] **Aggiornamento in movimento:** Agganciare il ricalcolo continuo della cella sottostante durante lo scroll automatico, poiché la griglia scivola sotto il dito immobile.

### STEP 5: Pulizia ed Escalation (Touch End & Cancel)
Prevenire memory leak, listener pendenti o la paralisi del layout.
- [ ] **Chiusura Fisiologica:** Su `touchend` o `touchcancel`, annullare immediatamente il ciclo `requestAnimationFrame`.
- [ ] **Ripristino Nativi:** Rimuovere `touchAction = 'none'` ripristinando la navigabilità originale di sistema.
- [ ] **Garbage Collection Listeners:** Rimuovere rigorosamente `touchmove`, `touchend` e `touchcancel` dall'oggetto `window`.
- [ ] **Azzeramento Feedback:** Rimuovere le classi di feedback UI introdotte all'avvio (`is-holiday-dragging`).

---

## 🔍 Checklist di Verifica Finale (Anti-Regressione)
- [] L'Event Listener `touchstart` non previene lo scroll verticale a tocco singolo.
- [] Il `touchmove` seleziona nuove celle in tempo reale usando `elementFromPoint()`.
- [] Anche se `innerHTML` rimpiazza l'intero contenuto della tabella 100 volte in 1 secondo, il drag non si blocca e non perde l'aggancio del dito.
- [] Risorsa libera da *Memory Leak*: nessun event listener persiste su `window` quando si rialza il dito dallo schermo.