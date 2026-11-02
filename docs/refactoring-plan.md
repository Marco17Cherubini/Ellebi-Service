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

**Primo tentativo (scartato dal titolare).** Taste `one-motif` (seed 1018163176): carta tecnica, grafite, il quarto d'ora come blocco quadrato. Funzionava, ma è stato giudicato troppo vicino a Lev Space e al vecchio Ellebi, e il disegno 2D dell'auto troppo debole.

**Direzione adottata: "banco prova notturno".** Taste ridistribuito con tono `bold` (`borrowed-category`): l'officina presentata come il lancio di un'auto. Scelte e motivi:

- **Scuro per primo** (carbonio `#0b0c0e`, alluminio per il tema chiaro facoltativo), **un solo arancio segnale** `#ff4d00` per azioni e cifre: il contrasto massimo per il CTA su telefono, sotto la luce dell'officina.
- **Archivo variabile** (un file, 90 KB, OFL) in maiuscolo esteso al 125% per titoli e cifre, larghezza normale per il testo: la voce delle schede tecniche, leggibile anche a 320 px.
- **Smusso a 45°** su pulsanti e superfici, come un pezzo lavorato; segmenti inclinati per avanzamento e orari.
- **Il nome come monumento** dietro l'auto; la disponibilità di oggi come **telemetria** (segmento = 15 minuti; chiaro libero, scuro occupato, arancio il primo libero).
- Palette e font distribuiti dallo script sono stati sostituiti: rosa/melanzana e caratteri arrotondati "per giocattoli e cosmetici" contraddicevano il soggetto e il marchio.

Gate eseguiti: Taste `inspect.mjs` (da 9 FAIL a 4, tutti motivati: il nome monumentale dietro l'auto è decorativo e `aria-hidden`; nessuna fotografia reale esiste e non ne sono state inventate; l'"eyebrow" segnalato è l'ultima riga della tabella orari prima del piè di pagina; il contrasto 3:1 è letto sul bordo del pulsante, non sul suo riempimento). Impeccable `detect`: da 9 a 1 anti-pattern + 2 avvisi (il tratteggio delle ferie nell'agenda è una convenzione di calendario; la gerarchia "piatta" di `home.html` è letta senza CSS). Emil Kowalski: nessun `transition: all`, hover solo con puntatore fine, pressione 0.97, un solo momento firmato (ingresso del palco), nessuna animazione su azioni da tastiera, tutto disattivato con `prefers-reduced-motion`.

## 3D

- **Modello**: procedurale in `client-src/garage3d.js`, compilato con esbuild (`npm run build:3d`) in `frontend/js/garage3d.js`. Carrozzeria e abitacolo sono superfici a sezioni (superellissi con passaruota ricavati dal profilo inferiore e rastremazione del tetto), ruote con pneumatico a profilo tornito, cerchio a cinque razze, disco e pinza; telaio con assali; motore; sedili e volante. Sette gruppi rigidi con pose assemblata ed esplosa esplicite; stato unico `t` interpolato, reversibile e interrompibile.
- **img2threejs** (v2.0.0, `3e7099e`): applicato come metodo, non come pipeline. Il suo workflow richiede un'immagine di riferimento da ricostruire e produce una factory TypeScript; qui non esiste un'auto reale da rappresentare (e non va ricostruito un modello marchiato). Usati: decomposizione in parti con pivot e ancore, passate progressive (blocchi → forma → materiali → interazione → ottimizzazione), budget di triangoli e revisione visiva su più angolazioni (fronte 3/4, lato, retro) con correzioni documentate (motore che bucava il cofano, fari sporgenti, muso alto, tetto troppo verticale, motore nascosto nella vista esplosa). **Non eseguiti**: `forge/state.py`, i gate automatici e il punteggio di fedeltà, che presuppongono una reference.
- **Caricamento**: l'immagine statica (WebP resa dal modello stesso, 42 KB) è sempre la prima cosa mostrata. Il 3D si avvia da solo solo su schermi ≥ 1024 px con WebGL, senza risparmio dati, senza movimento ridotto e con almeno 4 GB dichiarati; altrimenti c'è il pulsante "Ruota in 3D". Senza WebGL resta l'immagine. Nessun modulo 3D nelle pagine di prenotazione e admin.
- **Esecuzione**: pixel ratio ≤ 1,5, ACES, ambiente `RoomEnvironment` (PMREM), nessuna ombra dinamica né post-processing, ombra di contatto in texture, instancing per ruote, razze, cilindri. Rendering solo durante animazione o trascinamento; pausa con `IntersectionObserver` e scheda nascosta; perdita del contesto gestita (si torna all'immagine); `dispose()` di geometrie, materiali, texture e renderer.
- **Misure** (vedi README): 19.474 triangoli, 28 draw call, 139 KB gzip con Three.js, compilazione shader ~10 ms, pronto in ~0,5 s su desktop. Gli fps non sono misurabili in modo affidabile con GPU software headless: obiettivo 30 fps **non verificato**, nessun telefono fisico provato.

## Verifiche eseguite (finale)

- `npm test`: 118 test, 0 falliti (98 iniziali + 20 nuovi: sessioni, regole cliente, migrazione del listino). Lint e Prettier puliti. `npm audit --omit=dev`: 0 vulnerabilità (resta un avviso solo di sviluppo nella catena di ESLint 8).
- Playwright su database sintetico: 12 pagine a 390 e 1280 px senza overflow né errori in console; prenotazione ospite con solo tocco (errori di campo, doppio clic → una sola prenotazione, telefono salvato); cliente: accesso, sposta, annulla; home senza WebGL, con movimento ridotto, con 3D (controlli raggiungibili sopra la tela: difetto trovato e corretto).
- Misure prima/dopo con la versione di partenza avviata in un worktree separato.

## Rilascio e rollback proposti

1. Backup: al primo avvio della nuova versione su uno schema vecchio, `initDatabase` copia il database in `${DATABASE_PATH}.pre-migrazione-fase2.bak` (sul volume) **prima** di ogni migrazione. In più, se possibile, un backup del volume dal pannello Railway. Annotare il deployment in esercizio per il rollback.
2. Deploy del branch su un ambiente di prova con una **copia** del database: all'avvio partono le migrazioni (`session_version`, servizi "consegna" esplicitati). Controllare il listino e una prenotazione per tipo.
3. Merge su `main` e deploy (una sola istanza). Tutti gli utenti restano connessi: i token senza versione valgono come versione 0.
4. Rollback: ridistribuire il deployment precedente da Railway; se serve tornare anche ai dati di prima, a servizio fermo rimettere il file `.pre-migrazione-fase2.bak` al posto di `DATABASE_PATH` (si perdono le prenotazioni fatte nel frattempo). Le colonne aggiunte sono ignorate dal codice vecchio; l'unico cambiamento di dato non reversibile automaticamente è `tipo_servizio = 'consegna'` sui servizi che lo avevano nel nome, comportamento che il codice vecchio già riconosceva.

## Rischi residui e aperti

- Nessuna prova su telefono fisico, nessun invio email reale, CI su GitHub da verificare dopo la pull request.
- Orari estesi VIP e capacità consumata alla prenotazione: decisioni del titolare, non tecniche.
- La griglia settimanale admin resta drag & drop; l'alternativa da tastiera è la vista giorno.

---

## Fase 1 (2026, portfolio cleanup): stato finale e decisioni

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
