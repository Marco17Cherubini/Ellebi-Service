# Refactoring plan: stato finale e decisioni

Documento di lavoro del refactoring di Ellebi Service: rendere il progetto ordinato, affidabile e presentabile nel portfolio. Riporta decisioni, stato dei task, problemi trovati, verifiche eseguite e passi aperti.

## Riferimenti

| Voce | Valore |
|---|---|
| Branch di lavoro | `refactor/portfolio-cleanup` (solo locale: nessun push, merge o deploy) |
| Commit di partenza | `f1dc01b` (`main`) |
| Riferimento di qualità | Lev Space @ `eaa0bf4`, solo lettura |
| Ambiente di verifica | Node 22.22.0, npm 10.9.4, Linux; Chromium + Playwright preinstallati |

## Valutazione iniziale

Combinazione per area:
- **Integrità dei dati**: refactoring circoscritto ma critico.
- **Regole di prenotazione**: correzioni mirate (il motore a intervalli `computeAvailableSlots` è stato conservato).
- **`server.js`**: suddivisione in route ed errori.
- **Frontend**: pulizia del codice morto e messa in sicurezza.
- **CSS**: architettura conservata.

Conservati: il calcolo a intervalli, la whitelist delle colonne di `SQLiteTable`, le query parametrizzate, la migrazione bcrypt→argon2id, i cookie httpOnly, i design token, i temi e l'identità visiva.

## Decisioni approvate

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

## Stato dei task

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

## Problemi trovati

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

## Verifiche eseguite (HEAD finale)

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

## Struttura finale

- `server/server.js` (63 righe, era 1547) avvia; `app.js` costruisce l'app.
- `routes/` contiene 6 router.
- Servizi: `booking`, `deposit`, `catalog`, `holiday`, `vehicle`, `report`, `auth`, `email`, `retention`.
- Supporto: `database.js` (atomico e transazionale), `errors.js`, `middleware.js`, `dates.js`, `backup.js`, `seed.js`.
- `test/` contiene 15 file di test.
- Radice: `README.md`, `CLAUDE.md`, `LICENSE`, configurazione. Sono spariti 20 documenti storici e 9 artefatti.

## Blocchi e passi aperti

1. **Push del branch e pull request**: da autorizzare. Dopo il push, verificare la CI verde su Node 22 e 24.
2. **D-7, cronologia Git**: il backup del database resta nei commit precedenti a `7efa70e`. La riscrittura (filter-repo + force push) va decisa a parte. Se gli account erano reali, va valutato un cambio delle password.
3. Decisioni di prodotto per il titolare, raccolte in [portfolio-checklist.md](portfolio-checklist.md):
   - orari estesi VIP e loro visibilità nel calendario admin;
   - veicoli salvati nel wizard;
   - prenotazioni ospite con l'email di un cliente registrato;
   - promemoria (tabella `notifications`).
4. Storia, risultati reali e screenshot d'uso: da fornire all'autore (checklist).
