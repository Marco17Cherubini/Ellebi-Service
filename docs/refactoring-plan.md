# Refactoring plan

Documento di lavoro del refactoring di Ellebi Service. La **Fase 2** (novembre 2026) è in cima; la Fase 1 resta sotto come storico.

# Fase 2: correzioni del backend, redesign mobile-first, vista esplosa 3D

Branch `claude/wizardly-cray-jgmzav`, partenza da `85d017c`. Ambiente: Node 22.23, Chromium + Playwright preinstallati, nessun dispositivo fisico.

## Baseline (prima di ogni modifica)

- `npm test` 98/98, `npm run lint` e `format:check` puliti.
- App avviata su un database temporaneo con `npm run seed` (9 clienti, 106 prenotazioni sintetiche); screenshot di 12 pagine a 390 e 1280 px.
- Errori già presenti: overflow orizzontale a 390 px su `/guest-booking` (49 px) e `/dashboard` (25 px); agenda admin su mobile con sei colonne compresse; homepage composta solo da logo e tre pulsanti.

## Skills e strumenti: cosa era disponibile davvero

Nessuna delle skill richieste era installata nella sessione. I repository pubblici sono stati clonati in una cartella temporanea (fuori dal progetto, mai distribuiti al browser) e le istruzioni lette prima dell'uso.

| Skill | Riferimento letto | Uso effettivo |
|---|---|---|
| ECC (affaan-m/ECC) | `b38be6a`: `security-review`, `tdd-workflow`, `verification-loop`, `backend-patterns` | Checklist per audit di sicurezza, test prima della correzione, ciclo di verifica |
| Taste (Leonxlnx/taste-skill) | `12af471`, `SKILL.md` v2 | `draw.mjs` (due giri: `one-motif`, poi `borrowed-category` con tono bold), `inspect.mjs` sulla home a 1440/768/390 px |
| Impeccable (pbakaus/impeccable) | `6f269c4`, v4.8.0, `craft-floor.md` | `impeccable context` (nessun PRODUCT.md: contesto letto dal codice), craft floor prima delle modifiche UI, `impeccable detect` su pagine, CSS e script |
| Emil Kowalski (emilkowalski/skills) | `f1090be`, `emil-design-eng` | Framework decisionale per le animazioni, durate, easing, reduced motion |
| img2threejs | `3e7099e`, v2.0.0 | Vedi sezione 3D: workflow applicato solo in parte, con i gate realmente eseguiti elencati |
| Figma MCP | disponibile, nessun file Figma del progetto | Non usato: non esiste un file da cui partire |
| Playwright | preinstallato | Screenshot, viewport, flussi end-to-end, misure |

## Interventi

Legenda stato: ✅ fatto e verificato · 🟡 parziale · ⛔ bloccato · 📝 solo documentato

| ID | Problema ed evidenza | Impatto | Soluzione | Verifica | Stato |
|---|---|---|---|---|---|
| B1 | Logout e cambio password non invalidano i JWT (7 giorni); un token admin resta valido anche se l'admin non esiste più (`middleware.js`) | Sessione rubata utilizzabile dopo il reset | Colonna `session_version` su utenti e admin, inclusa nel token e verificata a ogni richiesta; il reset password la incrementa | Test di integrazione | ✅ |
| B2 | Link di reset riutilizzabile per un'ora (`authService.resetPassword`) | Chi intercetta il link può riusarlo | Il token di reset porta la `session_version`: dopo l'uso non è più valido | Test | ✅ |
| B3 | `GET /api/bookings` e le risposte di prenotazione restituiscono la riga intera, compresa `nota_interna` dell'officina e il `token` | Esposizione di note interne al cliente | Proiezione dei campi per il cliente | Test | ✅ |
| B4 | `GET /api/services` (pubblico) espone `prezzo_interno` | Prezzo interno visibile a chiunque | Proiezione pubblica senza prezzi | Test | ✅ |
| B5 | Il cliente può cancellare o modificare una prenotazione già iniziata, anche la consegna di un veicolo già in lavorazione: il deposito e i blocchi di lavoro vengono eliminati | Perdita di dati e capacità liberata mentre il veicolo è in officina | Cancellazione e modifica del cliente solo prima dell'inizio, e per le consegne solo con deposito "in attesa"; l'officina resta libera di farlo | Test | ✅ |
| B6 | Stagionalità verificata solo sulla data odierna nel listino e mai sulla data prenotata | Si prenota un servizio fuori stagione | Il server verifica la stagione sulla data della prenotazione; slot vuoti fuori stagione | Test | ✅ |
| B7 | Consegna riconosciuta anche dal nome ("consegna") mentre listino e calendario admin usano `tipo_servizio` | Comportamento diverso tra pannello e server | Migrazione compatibile (`tipo_servizio = 'consegna'` per i nomi che lo contengono), poi solo l'attributo | Test di migrazione | ✅ |
| B8 | Prenotazione ospite: il telefono inserito viene perso (si usa quello del profilo, vuoto) e il nome digitato è ignorato se l'email esiste già | L'officina non può richiamare l'ospite | Dati digitati salvati sulla prenotazione | Test | ✅ |
| B9 | Un cliente sospeso può prenotare come ospite con la stessa email | Il blocco è aggirabile | Prenotazione ospite rifiutata per email sospese (messaggio generico) | Test | ✅ |
| B10 | Chi ha prenotato come ospite non può registrarsi ("Email già registrata") | Ostacolo all'adozione | La registrazione su un profilo ospite invia un link per impostare la password (prova di possesso dell'email) | Test | ✅ |
| B11 | Completare un deposito o riportarlo "in attesa" cancella anche i blocchi di lavoro già svolti | Storico del calendario perso | Si liberano solo i blocchi futuri | Test | ✅ |
| B12 | Ferie, capacità e ore residue accettano valori non validi | Dati incoerenti | Validazione sul server | Test | ✅ |
| B13 | Il wizard ospite calcola gli orari con slot da 15 minuti e una propria regola di contiguità che scavalca la pausa pranzo: propone orari che il server rifiuta | Errore all'ultimo passo | Un unico flusso di prenotazione che usa l'endpoint per servizio (fonte unica: `computeAvailableSlots`) | E2E | ✅ |
| B14 | L'agenda admin mostra solo 08:30–18:15: gli appuntamenti VIP alle 08:00 o serali non compaiono | Appuntamenti invisibili al meccanico | Vista giornaliera a elenco con tutti gli appuntamenti e segnalazione di quelli fuori griglia | E2E | ✅ |
| B15 | `bookings.js` e `formatDate()` leggevano le date in UTC (`toISOString`, `new Date('YYYY-MM-DD')`) | Data sbagliata tra mezzanotte e le 2 o fuori dall'Italia | Pagina sostituita dall'area cliente; `parseLocalDate()` in `utils.js`; `getTimeSlotsForDate` locale | E2E | ✅ |
| O1 | sql.js tiene il DB in memoria e lo riscrive su file: due processi si sovrascrivono | Perdita di dati con più istanze | PM2 fissato a una istanza; vincolo documentato; backup e ripristino descritti | Revisione | ✅ |
| D1 | Redesign completo: identità, area pubblica, prenotazione, area cliente, amministrazione | Adozione | Vedi "Direzione visiva" | Screenshot prima/dopo | ✅ |
| D2 | Auto in vista esplosa | Identità | Disegno statico + modulo 3D su richiesta | Misure | ✅ |

Rischi trasversali: le correzioni B5 e B9 restringono ciò che un cliente può fare via API, ma non toccano orari, durate né la politica di cancellazione (nessun preavviso minimo); B1 forza un nuovo login dopo il reset password.

Ipotesi verificate e **non** confermate: richieste concorrenti sull'ultimo slot o sull'ultimo posto deposito (Node esegue controllo e scrittura in modo sincrono, dentro una transazione: un test lo conferma); doppio invio (il secondo trova lo slot occupato).

Fuori scope, documentati: promemoria (tabella `notifications` mai usata), centralino IA, capacità depositi consumata dalla prenotazione e non dall'arrivo del veicolo (regola esistente).

## Direzione visiva

La direzione è stata rifatta tre volte; le prime due sono state respinte dal titolare e restano come storico.

1. **Carta tecnica e grafite** (Taste `one-motif`, seed 1018163176): giudicata troppo vicina a Lev Space e al vecchio Ellebi, con un disegno 2D dell'auto troppo debole.
2. **"Banco prova notturno"** (Taste `borrowed-category`, tono bold): nero con un accento arancio acceso, Archivo esteso, angoli smussati a 45°. Il titolare l'ha trovata ancora generica e identica a Lev Space, e ha notato che avevo eliminato il logo (errore mio: il motivo vero del marchio è il cerchio con il battistrada, e io l'avevo sostituito con un parallelogramma inventato).
3. **Sistema Bugatti da awesome-design-md** (VoltAgent/awesome-design-md @ `fcc7028`, file `design-md/bugatti/DESIGN.md`), **scelta dal titolare** tra Dell 1996, Nintendo 2001, The Verge e una tavola tecnica. Scelte del titolare: direzione Bugatti; logo originale intatto più motivo ricalcato; auto 3D come menu; la correzione dei Lavori Straordinari (PR #2) resta in attesa del redesign.

Come è applicato il sistema:

- Nero puro; titoli Saira Condensed maiuscoli a peso 400 con tracking 0,07 em; testo EB Garamond; JetBrains Mono per pulsanti, navigazione, orari e targhe. I tre caratteri sono i sostituti open source indicati dal `DESIGN.md` (OFL, in `frontend/fonts/`).
- Nessuna ombra, nessun gradiente, nessun raggio tranne i pulsanti a pillola; filo sottile (`#262626`) al posto dei riquadri; campi con sola sottolineatura.
- **Deviazioni dichiarate dal `DESIGN.md`**: (a) un accento, il rame del logo `#d97030`, per l'azione principale, che deve essere subito individuabile (requisito del progetto) e per pochi segni; Bugatti non ha accento. (b) Il pulsante principale è pieno invece che trasparente. (c) Il tema chiaro resta come opzione (l'app originale aveva il selettore).
- **Logo**: il file originale (`LB-Service-Logo.webp`, sfondo bianco) è mostrato intatto su una targa in testata e nel piede; un ricalco con potrace (strumento usato una volta, non nel progetto) del cerchio e delle fasce di battistrada è `images/motivo-battistrada.svg`, usato come palcoscenico dietro l'auto (le fasce ruotano leggermente con la rotazione del 3D) e come fondale tenue di accesso, prenotazione e fascia finale. Il logo non è stato ricolorato né deformato. Una versione vettoriale ridisegnata del logo non è stata fatta (servirebbe l'approvazione di Lorenzo).
- **Struttura non lineare**: l'auto è il menu. I cinque pezzi aprono un pannello (Meccanica, Gomme e freni, Consegna, Orari, Contatti) con i servizi reali, la giornata di oggi in quarti d'ora o i contatti; l'auto scorre a sinistra per lasciare spazio al pannello. Sezioni sotto sfalsate (colonna di destra spostata, titolo dei servizi che resta in vista). La prenotazione resta lineare e semplice, e i servizi della home vi portano già a "giorno e ora" (`/prenota?servizio=ID`). Tutto è raggiungibile da tastiera e con l'immagine statica; l'assegnazione dei servizi ai pezzi è una scelta di presentazione basata sul nome, non una regola di business.

Gate eseguiti sul risultato finale:

- **Taste `inspect.mjs`** sulla home a 1440, 768 e 390 px: da 7 FAIL a 3. Restano (a) "meno di quattro immagini": il progetto non ha fotografie dell'officina e non ne sono state inventate; (b) "2 schermate su 5 quasi vuote": è il respiro del sistema Bugatti, che il suo `DESIGN.md` dichiara contratto del marchio; (c) un "eyebrow" su telefono: corretto riordinando contatti e orari. Restano avvisi motivati: tre caratteri (voluti dal `DESIGN.md`), nessun video (nessuno esiste).
- **Impeccable `detect`**: nessun anti-pattern reale (resta un falso positivo su `home.html`, la cui gerarchia dei corpi dipende dal CSS che il rilevatore non legge).
- **Emil Kowalski**: un solo momento firmato (l'auto entra, poi le etichette una dopo l'altra), poi comparsa progressiva delle sezioni una sola volta; nessuna animazione su azioni da tastiera; pressione 0,97; hover solo con puntatore fine; tutto spento con `prefers-reduced-motion`; nessun `transition: all`.
- **Playwright** (dati sintetici): menu dell'auto con tocco su telefono, tastiera (Invio apre, Esc chiude e restituisce il fuoco) e selezione col raggio sul 3D; collegamento dalla home alla prenotazione al passo "giorno e ora"; prenotazione ospite completa con doppio clic (una sola prenotazione); cliente (accesso, sposta, annulla); pianificazione dei lavori straordinari su telefono e desktop; home senza WebGL e con movimento ridotto; nessun overflow a 320 e 390 px; nessun errore in console.

## 3D

- **Modello**: procedurale in `client-src/garage3d.js`, compilato con esbuild (`npm run build:3d`) in `frontend/js/garage3d.js`. Carrozzeria e abitacolo sono superfici a sezioni (superellissi con passaruota ricavati dal profilo inferiore e rastremazione del tetto), ruote con pneumatico a profilo tornito, cerchio a cinque razze, disco e pinza; telaio con assali; motore; sedili e volante. Sette gruppi rigidi con pose assemblata ed esplosa esplicite; stato unico `t` interpolato, reversibile e interrompibile.
- **img2threejs** (v2.0.0, `3e7099e`): applicato come metodo, non come pipeline. Il suo workflow richiede un'immagine di riferimento da ricostruire e produce una factory TypeScript; qui non esiste un'auto reale da rappresentare (e non va ricostruito un modello marchiato). Usati: decomposizione in parti con pivot e ancore, passate progressive (blocchi → forma → materiali → interazione → ottimizzazione), budget di triangoli e revisione visiva su più angolazioni (fronte 3/4, lato, retro) con correzioni documentate (motore che bucava il cofano, fari sporgenti, muso alto, tetto troppo verticale, motore nascosto nella vista esplosa). **Non eseguiti**: `forge/state.py`, i gate automatici e il punteggio di fedeltà, che presuppongono una reference.
- **Menu sull'auto**: ogni pezzo ha materiali propri (clonati) per l'evidenziazione, un punto di aggancio che segue il pezzo anche in vista esplosa, e viene scelto col raggio (tocco senza trascinamento). Le posizioni delle etichette per l'immagine statica sono calcolate dallo stesso modello (`hotspots.json` in fase di generazione, copiate negli attributi `data-x-…` della home), così immagine e 3D coincidono.
- **Caricamento**: l'immagine statica (WebP resa dal modello stesso, 42 KB) è sempre la prima cosa mostrata. Il 3D si avvia da solo solo su schermi ≥ 1024 px con WebGL, senza risparmio dati, senza movimento ridotto e con almeno 4 GB dichiarati; altrimenti c'è il pulsante "Ruota in 3D". Senza WebGL resta l'immagine. Nessun modulo 3D nelle pagine di prenotazione e admin.
- **Esecuzione**: pixel ratio ≤ 1,5, ACES, ambiente `RoomEnvironment` (PMREM), nessuna ombra dinamica né post-processing, ombra di contatto in texture, instancing per ruote, razze, cilindri. Rendering solo durante animazione o trascinamento; pausa con `IntersectionObserver` e scheda nascosta; perdita del contesto gestita (si torna all'immagine); `dispose()` di geometrie, materiali, texture e renderer.
- **Misure** (vedi README): 19.474 triangoli, 28 draw call, 140 KB gzip con Three.js, compilazione shader ~10 ms, pronto in ~0,5 s su desktop. Gli fps non sono misurabili in modo affidabile con GPU software headless: obiettivo 30 fps **non verificato**, nessun telefono fisico provato.

## Verifiche eseguite (finale)

- `npm test`: 118 test, 0 falliti (98 iniziali + 20 nuovi: sessioni, regole cliente, migrazione del listino). Lint e Prettier puliti. `npm audit --omit=dev`: 0 vulnerabilità (resta un avviso solo di sviluppo nella catena di ESLint 8).
- Playwright su database sintetico: 12 pagine a 390 e 1280 px senza overflow né errori in console; prenotazione ospite con solo tocco (errori di campo, doppio clic → una sola prenotazione, telefono salvato); cliente: accesso, sposta, annulla; home senza WebGL, con movimento ridotto, con 3D (controlli raggiungibili sopra la tela: difetto trovato e corretto).
- Misure prima/dopo con la versione di partenza avviata in un worktree separato.

## Rilascio e rollback proposti

1. Backup: al primo avvio della nuova versione su uno schema vecchio, `initDatabase` copia il database in `${DATABASE_PATH}.pre-migrazione-fase2.bak` (sul volume) **prima** di ogni migrazione. In più, se possibile, un backup del volume dal pannello Railway. Annotare il deployment in esercizio per il rollback.
2. Deploy del branch su un ambiente di prova con una **copia** del database: all'avvio partono le migrazioni (`session_version`, servizi "consegna" esplicitati). Controllare il listino e una prenotazione per tipo.
3. Merge su `main` e deploy (una sola istanza). Tutti gli utenti restano connessi: i token senza versione valgono come versione 0.
4. Rollback: ridistribuire il deployment precedente da Railway; se serve tornare anche ai dati di prima, a servizio fermo rimettere il file `.pre-migrazione-fase2.bak` al posto di `DATABASE_PATH` (si perdono le prenotazioni fatte nel frattempo). Le colonne aggiunte sono ignorate dal codice vecchio; l'unico cambiamento di dato non reversibile automaticamente è `tipo_servizio = 'consegna'` sui servizi che lo avevano nel nome, comportamento che il codice vecchio già riconosceva.

## Correzione dopo il rilascio: pianificazione dei lavori straordinari

| Problema ed evidenza | Causa | Correzione | Verifica |
|---|---|---|---|
| Da "Lavori straordinari → Pianifica a calendario" i blocchi di lavoro non venivano creati: lo slot restava prenotabile dai clienti. In produzione (2 novembre) cinque tentativi da iPhone, nessuna richiesta `/schedule` | Regressione della Fase 2: sotto i 1024 px l'agenda si apriva nella nuova vista Giorno, che nasconde la griglia settimanale e la barra Salva/Annulla della pianificazione; l'unico pulsante visibile ("Aggiungi") crea un appuntamento normale. Su desktop il percorso funzionava | Con `?assignDeposit` e in modalità lavoro o ferie la vista è sempre Settimana, senza cambiare la preferenza salvata (`agenda-view.js`, `showWeekForPlanning`); la vista Giorno non si può aprire durante la pianificazione. Pulsanti della barra resi leggibili con il nuovo stile | `test/agenda-view.test.js`, `test/extra-work.test.js` (blocchi creati e legati al deposito, slot occupati per ospiti, clienti e servizi lunghi, officina compresa, tutto o niente); Playwright a 390 e 1280 px con tocco e trascinamento |

Nessun dato da correggere: in produzione non è stato creato alcun appuntamento sostitutivo; il deposito coinvolto è ancora "in attesa" e va pianificato.

## Rischi residui e aperti

- Nessuna prova su telefono fisico, nessun invio email reale, CI su GitHub da verificare dopo la pull request.
- Orari estesi VIP e capacità consumata alla prenotazione: decisioni del titolare, non tecniche.
- La griglia settimanale admin resta drag & drop; l'alternativa da tastiera è la vista giorno.

---

## Fase 3: verifica dei difetti segnalati e direzione "L'insegna" (3 novembre 2026)

Partenza da `c7dc5fb`. Baseline: 124 test verdi, lint e formattazione puliti.

| Difetto | Esito | Causa | Correzione | Verifica |
|---|---|---|---|---|
| A. Lavori straordinari da telefono | Riprodotto | La vista Giorno (predefinita sotto i 1024 px) non aveva strumenti di pianificazione; la correzione precedente forzava la griglia settimanale. `saveOre` ignorava gli errori | Pianificazione nella vista Giorno con pulsanti per i quarti d'ora; barra Salva/Annulla fuori dalla griglia; stop se le ore non si salvano; pianificazione reale (minuti, prossimo blocco) nelle schede, distinta dallo stato | `test/extra-work.test.js` (concorrenza, stati, tutto o niente), `test/agenda-view.test.js`, e2e telefono (tocco, tastiera, reload) e desktop (mouse) |
| B. Accesso admin | API: non riprodotto (tutte 401/403 per anonimo e cliente). Pagine: riprodotto (HTML admin servito a tutti) | Nessun controllo sulle pagine e sui `.html` statici | `pageGuard` lato server prima dei file statici; etichette "Agenda officina" e "Le tue prenotazioni" | `test/page-guard.test.js`, matrice di 38 rotte × 3 sessioni |
| C. "Ruota in 3D" blocca i controlli | Riprodotto sotto i 760 px; desktop non riprodotto | La tela (`inset: 0`) copriva le etichette in flusso dentro lo stesso contenitore; `.btn` annullava `[hidden]` | Etichette sopra la tela; `[hidden]` sempre nascosto | `test/e2e/home-3d.e2e.js` a 360/390/768 px, rosso prima della correzione |
| D. Durate | Riprodotto ("15 min", "quarti d'ora liberi", "30 min · consegna") | Testi pubblici | Intervallo reale dal listino, accoglienza ≠ lavorazione, "da concordare" se la durata manca (`durata_definita`) | `test/durations.test.js` |

Direzione visiva: tre proposte (mockup), scelta del titolare **B · L'insegna**; logo ricalcato in vettoriale (sovrapposizione col raster 96 % scuro, 95 % arancio; 36 KB compresso contro 51 KB); auto costruita in codice con proporzioni da GT a motore centrale (tre giri di revisione da cinque angolazioni). Limite dichiarato: credibile ma stilizzata, non fotorealistica. Riferimenti awesome-design-md letti: Ferrari, BMW M, Renault (`fcc7028`).

Non verificato: telefono fisico, fps reali (GPU software), invio email reale.

## Fase 4: ritorno alla struttura d'origine e mobile first (3 novembre 2026)

Segnalazione del titolare dopo il rilascio di `f89b1e8` (screenshot da iPhone): in alto nella home compariva "Agenda officina" (sessione admin), la home era diventata una vetrina pubblica e nel listino le etichette uscivano a destra, tanto che la pagina si poteva rimpicciolire. Decisione: tenere la grafica B, riportare la struttura alle origini (ingresso con Accedi / Registrati / Ospite, come l'app originale e come l'ingresso di Lev Space).

| Problema | Causa | Correzione | Verifica |
|---|---|---|---|
| Collegamento all'agenda nella home | `landing.js` cambiava "Accedi" in "Agenda officina" con una sessione admin | Home statica, uguale per tutti; nessun `href="/admin"` nelle pagine pubbliche; avviso testuale senza link nel flusso di prenotazione | `test/entry.test.js`, e2e con sessione admin |
| Home come vetrina (listino, menu 3D) | Scelta delle fasi 2–3 | Pagina d'ingresso: insegna, auto statica, tre pulsanti; 3D non più pubblicato (`client-src/build/`, ignorato) | `test/entry.test.js` |
| Scritte fuori schermo, zoom indietro | `.row-meta` in `nowrap` più larga della riga (pagina 456 px a 360) | Sparita con la vetrina | `test/e2e/mobile-layout.e2e.js` a 360/390/430 px in tre ruoli |
| Listino admin largo 687 px | Tabella in un contenitore a scorrimento | Schede sotto i 760 px | e2e, rosso prima della correzione |
| Elenco clienti stretto | Nome e controlli sulla stessa riga | Due righe sotto i 600 px | Screenshot 360 px |
| Primo giorno attaccato al bordo | Aggancio dello scorrimento senza `scroll-padding` | `scroll-padding-inline` | Screenshot 360 px |
| Selettore del tema sopra il footer | Pulsante fisso | Statico nella pagina d'ingresso | Screenshot 360/390 px |
| Layout in px ("desktop first") | 68 larghezze fisse (contenitori 720–1240 px, colonne minime, menu 264 px) e punti di cambio in px | Larghezze in % e `fr`, margine `5vw`, punti di cambio in em; px solo per icone e soglie di tocco | `test/css-units.test.js`, rosso prima della correzione; fogli di controllo a 360/768/1440 |

# Fase 1 (2026, portfolio cleanup): stato finale e decisioni

Documento di lavoro del refactoring di Ellebi Service: rendere il progetto ordinato, affidabile e presentabile nel portfolio. Riporta decisioni, stato dei task, problemi trovati, verifiche eseguite e passi aperti.

### Riferimenti

| Voce | Valore |
|---|---|
| Branch di lavoro | `refactor/portfolio-cleanup` (solo locale: nessun push, merge o deploy) |
| Commit di partenza | `f1dc01b` (`main`) |
| Riferimento di qualità | Lev Space @ `eaa0bf4`, solo lettura |
| Ambiente di verifica | Node 22.22.0, npm 10.9.4, Linux; Chromium + Playwright preinstallati |

### Valutazione iniziale

Combinazione per area:
- **Integrità dei dati**: refactoring circoscritto ma critico.
- **Regole di prenotazione**: correzioni mirate (il motore a intervalli `computeAvailableSlots` è stato conservato).
- **`server.js`**: suddivisione in route ed errori.
- **Frontend**: pulizia del codice morto e messa in sicurezza.
- **CSS**: architettura conservata.

Conservati: il calcolo a intervalli, la whitelist delle colonne di `SQLiteTable`, le query parametrizzate, la migrazione bcrypt→argon2id, i cookie httpOnly, i design token, i temi e l'identità visiva.

### Decisioni approvate

| ID | Decisione | Esito |
|---|---|---|
| D-1 | Retention automatica solo in produzione, `RETENTION_ENABLED` per forzarla | Applicata; soglie e query invariate |
| D-2 | Regole orarie per ruolo applicate sul server; orari VIP invariati e da segnalare al titolare | Applicata; segnalata in README e checklist |
| D-3 | Nessuna regola delle 24 ore; correggere la documentazione | Applicata |
| D-4 | I report escludono i blocchi `extra_work` | Applicata |
| D-5 | Rimozione del codice legacy e non raggiungibile | Applicata (resta nella cronologia Git) |
| D-6 | Documenti storici tolti dall'albero | Applicata |
| D-7 | Backup DB rimosso dall'albero; cronologia da decidere a parte | Albero pulito; **riscrittura della cronologia non eseguita** |
| D-8 | LICENSE MIT, Marco Cherubini | Applicata |
| D-9 | Ospite che poi si registra: limite noto | Documentato |

Comportamenti ambigui mantenuti e documentati: filtro stagionale sulla data odierna; consegna riconosciuta anche dal nome del servizio; logout senza revoca del JWT; token di reset riutilizzabile entro un'ora; prenotazione ospite con email di un cliente registrato agganciata a quell'account.

### Stato dei task

Legenda: ✅ completato · ⛔ bloccato · ⏭️ rinviato

| ID | Task | Esito |
|---|---|---|
| T00 | Branch, baseline | ✅ |
| T01 | DB e file WAL fuori dal repository | ✅ |
| T27 | LF, ESLint/Prettier coerenti, formattazione | ✅ (lint: 0 errori e 0 warning; format: pulito) |
| T03 | `app.js` / `server.js` | ✅ |
| T08 | Flag di retention | ✅ |
| T02/T04 | Harness `node:test` e test di caratterizzazione | ✅ (98 test) |
| T17 | XSS: escape in pagine admin, cliente ed email | ✅ |
| T05 | Scrittura atomica, `withTransaction`, id reali, migrazione sicura | ✅ |
| T06 | Transazioni nei flussi multi-record | ✅ (insieme a T21) |
| T07 | Backup su `DATABASE_PATH` | ✅ |
| T09 | Durata dal listino, servizio attivo obbligatorio | ✅ |
| T10 | Orari per ruolo | ✅ |
| T11 | Spostamento basato sulla durata, id preservato | ✅ |
| T12 | Cancellazione cliente con pulizia del deposito | ✅ |
| T13 | Stati dei depositi e pianificazione validati | ✅ |
| T14 | `servizio` salvato | ✅ |
| T15 | Date locali, report D-4 | ✅ |
| T16 | Funzioni morte | ✅ |
| T18 | Rate limit senza `X-Forwarded-For` falsificabile | ✅ |
| T19 | CSP senza inline, Chart.js da npm | ✅ |
| T20a/b | Segnaposto JWT, registrazione case-insensitive | ✅ |
| T21 | Route per dominio, errori centralizzati, logica nei servizi | ✅ |
| T22 | Moduli legacy ed endpoint di riparazione | ✅ |
| T23 | Dipendenze | ✅ (npm audit: da 17 vulnerabilità a 0, senza aggiornamenti di versione maggiore) |
| T24 | Frontend morto | ✅ |
| T25 | Sidebar condivisa | ✅ (comportamento in `utils.js`; markup lasciato nelle pagine) |
| T26 | Audit CSS | ✅ (solo regole morte rimosse) |
| T28 | Riordino della radice | ✅ |
| T29 | Metadati del pacchetto | ✅ |
| T30 | Seed con dati sintetici | ✅ |
| T31 | CI GitHub Actions | ✅ scritta e validata (YAML); **eseguita su GitHub solo dopo un push autorizzato** |
| T32 | README, CLAUDE.md, `.env.example`, LICENSE, guida utente | ✅ |
| T33 | Verifica nel browser prima e dopo | ✅ |
| T34 | Revisione finale | ✅ |

### Fuori piano, motivati e committati separatamente

- Accessibilità da tastiera nei wizard di prenotazione (prima card, giorni e orari non si raggiungevano con Tab).
- `TZ=Europe/Rome` come default quando non configurato: su un server in UTC gli slot del mattino già passati risultavano prenotabili.
- Slot 18:00 duplicato negli orari estesi.
- Markup e CSS della pagina depositi (un `div` non chiuso e una `}` in più).
- Configurazione SMTP inutilizzata rimossa.

### Problemi trovati

| ID | Problema | Stato |
|---|---|---|
| P01 | DB e file WAL tracciati (email e hash) | Albero ✅; cronologia ⛔ (D-7) |
| P02 | Modifica verso una consegna con limite raggiunto → prenotazione spostata al 1970 | ✅ test |
| P03 | Scrittura del DB non atomica | ✅ test |
| P04 | Scritture multi-record non atomiche | ✅ test |
| P05 | Durata decisa dal client, servizio non verificato | ✅ test |
| P06 | Orari estesi aperti a tutti via API | ✅ test |
| P07 | Spostamento admin senza controllo della durata e con cambio di id | ✅ test |
| P08 | Deposito orfano alla cancellazione del cliente | ✅ test |
| P09 | Pianificazione dei depositi senza controlli | ✅ test |
| P10 | Stato del deposito come testo libero | ✅ test |
| P11 | XSS memorizzata nel pannello admin da un ospite non autenticato | ✅ riprodotta su `f1dc01b`, corretta e verificata nel browser |
| P12 | Iniezione HTML nelle email | ✅ test |
| P13 | Rate limit aggirabile con `X-Forwarded-For` | ✅ test |
| P14 | CSP permissiva; Chart.js da CDN senza versione | ✅ |
| P15 | Report in UTC | ✅ test (TZ Europe/Rome) |
| P16 | Prenotazioni del cliente con data UTC | ✅ |
| P17 | `servizio` scartato | ✅ test |
| P18 | Email duplicate con maiuscole diverse | ✅ test |
| P19 | Backup sul file sbagliato | ✅ test |
| P20 | Frontend non raggiungibile | ✅ |
| P21 | Endpoint e script di riparazione | ✅ rimossi senza eseguirli |
| P22 | Retention distruttiva in ogni ambiente | ✅ test |
| P23 | Lint inutilizzabile | ✅ |
| P24 | Dipendenze inutilizzate e vulnerabili | ✅ |
| P25 | Documentazione errata | ✅ |
| P26 | Funzioni token inutilizzate | ✅ |
| P27 | `maxDeposits` con tre fonti | ✅ |
| P28 | `insert()` restituiva sempre id 0 (deposit_id "0") | ✅ test (emerso dai test) |
| P29 | La migrazione dallo schema iniziale perdeva le colonne v2 | ✅ test (emerso dai test) |

### Verifiche eseguite (HEAD finale)

Locali, in questo ambiente:
- `npm test`: **98 test, 0 falliti, 0 todo**. I test girano sul server reale con un database SQLite temporaneo, email disattivate e retention spenta. Suite superata anche con `TZ=UTC` e con `TZ` non impostato.
- `npm run lint`: 0 errori, 0 warning. `npm run format:check`: pulito. `npm audit`: 0 vulnerabilità.
- Riproducibilità: clone pulito → `npm install` → `.env` da `.env.example` → `npm run seed` → `npm start` → login admin e cliente demo → `npm test`, seguendo il README alla lettera.
- Seed eseguito spostando l'orologio su tutti i 7 giorni della settimana.
- Browser (Chromium via Playwright, app servita dal backend locale, dati sintetici):
  - 13 pagine × tema chiaro/scuro × desktop 1280/mobile 390, confrontate pixel per pixel con la baseline `f1dc01b`. Differenze solo dove volute: layout della pagina depositi e grafico dei report, che prima non si caricava dal CDN.
  - Percorsi end-to-end, desktop e mobile: prenotazione ospite (anche il pulsante "Indietro"), prenotazione e cancellazione del cliente, dettaglio e chiusura con Esc nel calendario admin, depositi, listino, clienti, grafico dei report.
  - Registrazione, login, logout, richiesta e reimpostazione password, redirect dell'area admin senza sessione.
  - Prenotazione ospite usando solo la tastiera, con focus visibile.
  - Menu laterale su tutte le pagine: apertura, chiusura con × ed Esc, logout.
  - Pianificazione di un deposito dal calendario (selezione trascinando 4 blocchi) e drag & drop di un appuntamento.
  - XSS: payload inseriti da API pubbliche eseguiti su `f1dc01b` in `/admin`, `/admin/clienti` e `/admin/depositi`; con il codice finale nessuna esecuzione.
  - Nessun errore in console né violazione CSP.

Non eseguite:
- **CI su GitHub**: richiede un push.
- **Node 24**: in locale c'è solo Node 22; la CI lo coprirà.
- **Invio email reale**: escluso per scelta; sono testati i template.
- **Deploy**.

Gli script di verifica nel browser sono rimasti fuori dal repository per non aggiungere Playwright come dipendenza. La procedura è descritta qui sopra e il README la indica come verifica locale.

### Struttura finale

- `server/server.js` (63 righe, era 1547) avvia; `app.js` costruisce l'app.
- `routes/` contiene 6 router.
- Servizi: `booking`, `deposit`, `catalog`, `holiday`, `vehicle`, `report`, `auth`, `email`, `retention`.
- Supporto: `database.js` (atomico e transazionale), `errors.js`, `middleware.js`, `dates.js`, `backup.js`, `seed.js`.
- `test/` contiene 15 file di test.
- Radice: `README.md`, `CLAUDE.md`, `LICENSE`, configurazione. Sono spariti 20 documenti storici e 9 artefatti.

### Blocchi e passi aperti

1. **Push del branch e pull request**: da autorizzare. Dopo il push, verificare la CI verde su Node 22 e 24.
2. **D-7, cronologia Git**: il backup del database resta nei commit precedenti a `7efa70e`. La riscrittura (filter-repo + force push) va decisa a parte. Se gli account erano reali, va valutato un cambio delle password.
3. Decisioni di prodotto per il titolare, raccolte in [portfolio-checklist.md](portfolio-checklist.md):
   - orari estesi VIP e loro visibilità nel calendario admin;
   - veicoli salvati nel wizard;
   - prenotazioni ospite con l'email di un cliente registrato;
   - promemoria (tabella `notifications`).
4. Storia, risultati reali e screenshot d'uso: da fornire all'autore (checklist).
