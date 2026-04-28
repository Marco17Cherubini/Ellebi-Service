# Refactoring Architetturale e Design System (Apple Style)

## Contesto e Filosofia Operativa
Questa sessione di refactoring è stata guidata dalla necessità di **consolidare, pulire ed unificare** l'architettura CSS e HTML del progetto "LB Service", portandola ad aderire a logiche da vero e proprio **Design System scalabile** (con approccio *Apple style* alle variabili, typography scala 8pt, semantica cromatica e shadow states).

L'obiettivo fondamentale non è stato aggiungere nuovo codice per correggere difetti isolati (patch veloci), ma **strutturare il giro lungo**: rimuovere la ridondanza estirpando i "silos" di stili creati unicamente all'interno delle singole pagine (es. form customizzati solo su una view o colori scritti in inline style) riconducendoli in *Single Source of Truth* globali. Tutto questo mantenendo la coerenza grafica al 100% (pixel-perfect preservation) dei layout originali della app e assicurando responsività.

### Modus Operandi (Pipeline di Esecuzione)
Per garantire stabilità e pulizia in ogni singola operazione, l'Agente Frontend adotta per ogni task una metodologia standard ("Hooks"):
1. **[PRE-TOOL HOOK]**: Ispezione massiccia dell'albero base del progetto (`grep_search` e `read_file`) per studiare le dipendenze, capire l'impatto incrociato di classi CSS e le iniezioni lato Javascript.
2. **[EXECUTION HOOK]**: Sostituzione chirurgica e documentata. Spostamento delle direttive visive in un CSS Master (es. *cards.css*, *containers.css*) lasciando nei CSS nativi delle specifiche pagine puramente le logiche posizionali/strutturali (`flex`, `grid`, `margin`).
3. **[POST-TOOL HOOK]**: Verifica finale per validare la rimozione dai file originari delle stringhe modificate, confermando zero conflitti prima di dichiarare la Task conclusa.
4. **[FALLBACK RULE]**: Se la standardizzazione forzata minaccia specificità vitali del layout in JS (come griglie auto-generate) l'Agente deve costruire un layer ibrido per ereditare correttamente il Design System senza imporre refactoring mastodontici sul render dell'HTML.

---

## Log delle Operazioni Effettuate

### Task 1: Consolidamento Cards (`cards.css` come Single Source of Truth)
- **Problema:** Classi grafiche delle card (`.vehicle-card`, `.service-card`, `.deposit-card`, `.stat-card`, `.vh-card`) ripetevano le stesse direttive relative a `border`, `border-radius`, `box-shadow`, `background-color` e micro-animazioni `hover` disseminate in ben cinque o più file CSS di pagina diversi.
- **Intervento:** 
  - Estrazione dello "scheletro" grafico (inclusa la gestione del dark theme e accenti Apple come `--color-bg-elevated`) e raggruppamento massivo delle classi target in un'unica regola base all'interno di `styles/components/cards.css`.
  - Epuration delle regole visive all'interno di `dashboard.css`, `guest-booking.css`, `admin-depositi.css`, `admin-reports.css` e `admin-clienti.css`, lasciando sopravvivere qui solo lo *skeleton-layout* come dimensionamento di griglie.

### Task 2: Standardizzazione dei "Badge Speciali / Violacei"
- **Problema:** Per il layout che identificava la card del "Lavoro Straordinario" (deposito base viola) esistevano molteplici versioni statiche (e persino *inline style* HTML) del medesimo pattern cromatico (`#EED4FF`, `#7B00C8`, `#C800FF`) iniettate via string literals JS o CSS silato (ex. classi fantasma come `.service-tag-consegna`, `.dc-servizio-inline`, `.consegna-info-box`).
- **Intervento:** 
  - Architettati 3 nodi semantici in `tokens/global.css`: (`--color-special-bg`, `--color-special-text`, `--color-special-border`).
  - Create classi Master universali `.badge-special` e `.box-special` all'interno di `base/utilities.css`
  - Sostituite fisicamente e ripulite tutte le injection JavaScript hardcoded in `admin.js`, le chiamate in `dashboard.js`, e aggiornato il markup in `guest-booking.html` e `admin.html`. Rimozione totale degli `style="..."` diretti nel body.

### Task 3: Normalizzazione dei Forms e rimozione overrides (`#extra-fields-panel`)
- **Problema:** Il builder dinamico per i campi extra presente in `dashboard.js` generava input crudi che venivano poi forzatamente formattati con ID-specific styling dentro `dashboard.css` (con overrides aggressivi non documentati in scala, ex. `#extra-fields-panel input:focus`), ignorando completamente la libreria nativa dei forms.
- **Intervento:** 
  - **JS:** Modificate le funzioni generatrici per i pannelli aggiuntivi (in `dashboard.js` e `guest-booking.js`) in modo da far sputare al costruttore in HTML le classi semantiche di sistema: `<div class="form-group">`, `<label class="form-label">`, `<input class="form-input">`. Questo ha garantito l'accessibilità da 44px tap target dettata dal core-system Apple.
  - **CSS:** Resettato il silo in `dashboard.css`, eliminando qualsiasi direttiva forzata riguardante focus, sizing, color e margins.

### Task 4: Estrazione componenti Layout / Componenti Wizard Multi-Step
- **Problema:** La navbar con l'hamburger-menu usava un container `header-left` copiato interamente tra admin e dashboard. Stessa sorte per i form flow: in Dashboard esisteva un tracker degli step logici chiamato `.wizard-breadcrumb`, mentre il Guest-flow usava il cugino clonato `.step-indicator` per le medesime funzioni visive.
- **Intervento:** 
  - Traslazione logica in `styles/layout/containers.css`.
  - Isolata la `.header-left` all'interno del comparto degli header primari.
  - Creato un blocco unico `/* WIZARD COMPONENT (STEPS & BREADCRUMBS) */` per amalgamare le logiche in comune tra `guest-booking` e moduli base, unificandone media query (ex. rimozione `.step-label` al di sotto dei `480px`) e transizioni di fadeIn visivo. Eliminazione completa dei rami morti da tutti i CSS logici di pagina.

---
**Nota finale per i prossimi Agenti AI:** Quando operi su questo repository, usa i **Design Tokens Globali** per definire tutto il CSS stilistico, separa chiaramente le feature strutturali da quelle estetiche, rispetta fedelmente la regola di griglia 8pt convertita a **rem** e, in caso d'incertezza, sfrutta il *fallback* ibrido senza rompere o generare codice ridondante. Uccidi i silo, favorisci l'architettura. Evita l'aggiunta di stili inline nell'HTML.

---

## Modus Operandi & Architettura per il Futuro Refactoring JavaScript (Vanilla)

A seguito di uno scanning approfondito (tramite `read_file` e `grep_search` mirati su cartelle come `frontend/js/`, chiamate `apiRequest` e manipolazioni del DOM come `document.getElementById`), è emerso che il comparto logico JavaScript si basa interamente su un'architettura **Vanilla JS** senza build step, bundler o framework (React/Vue/ecc.).

Le logiche di fetch sono già parzialmente centralizzate in `utils.js` (tramite il wrapper `apiRequest`), ma si osserva un pesante intreccio nelle specifiche logiche di pagina (es. file "monolito" come `dashboard.js` e `guest-booking.js` che mescolano gestione di stato locale, manipolazione imperativa del DOM ed eventi).

Per allinearci al refactoring chirurgico già applicato a UI/CSS, il refactoring del comparto JS dovrà seguire questo preciso manifesto:

### Principio Base (Philosophy)
Mantenere assolutamente il **Buildless Vanilla JS** (Nessun toolchain complesso). Operare spostando il codice vitale da paradigmi procedurali "spaghetti-code" su file di vista a logiche modulari riutilizzabili e separate. *Don't Repeat Yourself (DRY)* e *Single Responsibility Principle (SRP)* sono la stella polare.

### Pipeline di Esecuzione JS (The JS Hooks)
Anche sulle funzioni, i successivi Agenti interagiranno tramite Lifecycle Hooks:
1. **[PRE-TOOL HOOK - Analisi Call Graph]**: Prima di toccare qualunque funzione (es. un API call duplicato tra `admin.js` e `dashboard.js`), usa `grep_search` per trovare tutte le occorrenze delle stringhe associate a quell'elemento per prevenire la rottura di riferimenti incrociati o funzioni dipendenti asincrone.
2. **[EXECUTION HOOK - Compartimentalizzazione]**:
    - **A.** Separazione: Estrazione del data-fetching non generico in file di servizio (es. `apiService.js` o macro-funzioni per entità dentro `utils.js`).
    - **B.** Componentizzazione DOM: Elementi complessi e ricorrenti (es. il Wizard degli step, la stampa del Calendario appuntamenti, la renderizzazione della preview del veicolo) devono diventare funzioni di utility di rendering (o "Vanilla Components") da iniettare, smettendo di usare `innerHTML` ridondanti riga per riga sulle logiche di pagina.
3. **[POST-TOOL HOOK - Validazione Stato]**: Assicurarsi che le variabili globali in testa ai file (es. `var selectedService = null;`) non si siano de-sinronizzate dopo il refactoring.
4. **[FALLBACK RULE - Stabilità sopra l'astrazione]**: Se l'esportazione di un componente vanilla (ad es. i form modali di `admin-depositi`) dovesse richiedere di riscrivere pesantemente tutta la meccanica di init asincrona compromettendo il testing rapido, crea semplicemente delle **funzioni helper locali** limitando la visibilità a livello di pagina anziché imporre file moduli esterni prematuri.

### Roadmap Suggerita (Da affrontare a Blocchi)
- **Task 1: Consolidamento Builder UI (Wizard / Calendari)**: Estrarre le funzioni come `renderCalendar`, logiche del multi-step ("Avanti/Indietro") e interpolazioni HTML ricorrenti in helper o oggetti dedicati (es. in `components/wizardForm.js` o simili supporti vanilla).
- **Task 2: Standardizzazione Gestione Errori/Feedback**: Sebbene `utils.js` abbia `showError`/`showSuccess`, molte view modificano dinamicamente e localmente `document.getElementById('form-error')`. Slegare interamente i nodi DOM dai controller e fare affidamento solo sui wrapper.
- **Task 3: Refactoring delle logiche in Admin**: Le viste d'amministrazione contengono enormi funzioni `fetch` annidate all'interno di listener per l'apertura modali e per confermare status (es. cambia stato deposito). Isolare le fetch calls in file dedicati che gestiscano esclusivamente API requests per i Depositi e per le Gestione Utenti.