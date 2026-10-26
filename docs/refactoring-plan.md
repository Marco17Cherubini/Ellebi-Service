# Refactoring plan: stato e decisioni

Documento di lavoro per il refactoring di Ellebi Service: rendere il progetto ordinato, affidabile e presentabile nel portfolio.
Va aggiornato a ogni gruppo di task. L'analisi completa (problemi P01–P27 con evidenze) è riassunta in fondo.

## Riferimenti

| Voce | Valore |
|---|---|
| Branch di lavoro | `refactor/portfolio-cleanup` |
| Commit di partenza | `f1dc01b` (`main`) |
| Riferimento di qualità | Lev Space @ `eaa0bf4`, solo lettura |
| Ambiente di verifica | Node 22.22.0, npm 10.9.4, Linux; Chromium + Playwright preinstallati |

## Decisioni approvate

| ID | Decisione |
|---|---|
| D-1 | Retention: resta automatica in produzione; flag `RETENTION_ENABLED` (default `true` solo con `NODE_ENV=production`). Soglie e query invariate |
| D-2 | Regole orarie per ruolo applicate sul server (cliente e ospite: orario di lavoro; VIP e admin: insieme esteso). Gli slot extra VIP attuali restano invariati e vanno segnalati al titolare |
| D-3 | Nessuna regola delle 24 ore: si corregge solo la documentazione |
| D-4 | I report contano gli appuntamenti escludendo i blocchi `extra_work` |
| D-5 | Il codice legacy e non raggiungibile viene rimosso (resta nella cronologia Git), dopo aver verificato che VIP e ban sono gestiti in `admin-clienti` |
| D-6 | I documenti storici in radice vengono tolti dall'albero; restano il manuale aggiornato e questo piano |
| D-7 | Il backup DB viene rimosso solo dall'albero. La riscrittura della cronologia è una decisione separata, da autorizzare |
| D-8 | LICENSE MIT intestata a Marco Cherubini |
| D-9 | Ospite che poi si registra con la stessa email: limite noto, non corretto in questo refactoring |

Comportamenti ambigui mantenuti e documentati: filtro stagionale basato sulla data odierna; consegna riconosciuta anche dal nome del servizio; logout senza revoca del JWT (7 giorni); token di reset riutilizzabile entro un'ora; stato `standby` contato come attivo.

## Stato dei task

Legenda: ✅ completato · 🔄 in corso · ⏳ da fare · ⛔ bloccato · ⏭️ rinviato

| # | ID | Task | Effort | Stato |
|---|---|---|---|---|
| 1 | T00 | Branch, `npm ci`, baseline (lint, format, audit, avvio) | LOW | ✅ |
| 1 | T01 | Rimuovere DB e file WAL tracciati; `.gitignore` | LOW | ✅ |
| 1 | T27 | Normalizzazione LF, ESLint/Prettier coerenti | MEDIUM | ⏳ |
| 2 | T03 | Separare `app.js` e `server.js` | HIGH | ⏳ |
| 2 | T08 | Flag di retention (D-1) | MAX | ⏳ |
| 2 | T02/T04 | Harness `node:test` + test di caratterizzazione | HIGH | ⏳ |
| 3 | T17 | Escape XSS (pannello admin, pagine cliente, email) | HIGH | ⏳ |
| 4 | T05 | Scrittura atomica + `withTransaction` | MAX | ⏳ |
| 4 | T06 | Transazioni nei flussi multi-record | MAX | ⏳ |
| 4 | T07 | `backup.js` usa `DATABASE_PATH` | MEDIUM | ⏳ |
| 5 | T09 | Durata ricavata dal servizio sul server | XHIGH | ⏳ |
| 5 | T10 | Regole orarie per ruolo (D-2) | XHIGH | ⏳ |
| 5 | T11 | Spostamento admin basato sulla durata, id preservato | XHIGH | ⏳ |
| 5 | T12 | Cancellazione del cliente pulisce il deposito | XHIGH | ⏳ |
| 5 | T13 | Depositi: enum degli stati, `schedule` validato | XHIGH | ⏳ |
| 5 | T14 | Salvare `servizio` nelle prenotazioni admin | MEDIUM | ⏳ |
| 6 | T21a | `errors.js`, `requireAdmin`, sessione opzionale | HIGH | ⏳ |
| 6 | T18 | Rate limit: `trust proxy`, limiti da env | MEDIUM | ⏳ |
| 6 | T21b–e | Route estratte per dominio, logica nei servizi | HIGH | ⏳ |
| 6 | T15 | `dates.js`, date locali nei report (D-4) | XHIGH | ⏳ |
| 6 | T16 | Rimuovere le funzioni token morte | LOW | ⏳ |
| 6 | T20a/b | Segnaposto JWT, registrazione case-insensitive | LOW/MED | ⏳ |
| 6 | T22 | Rimuovere i moduli legacy e gli script di riparazione | MEDIUM | ⏳ |
| 6 | T23 | Dipendenze: via `xlsx`, `nodemailer`, `cors` | MEDIUM | ⏳ |
| 7 | T33a | Screenshot "prima" nel browser | HIGH | ⏳ |
| 7 | T24 | Rimuovere il frontend morto | MEDIUM | ⏳ |
| 7 | T19 | CSP senza inline, Chart.js da npm | HIGH | ⏳ |
| 7 | T26 | Audit CSS | MEDIUM | ⏳ |
| 7 | T25 | Valutare la duplicazione delle sidebar admin | HIGH | ⏳ |
| 8 | T30 | Seed con dati sintetici | HIGH | ⏳ |
| 8 | T29 | Metadati di `package.json` | LOW | ⏳ |
| 8 | T28 | Riordino della radice (D-6) | MEDIUM | ⏳ |
| 8 | T32 | README (EN), CLAUDE.md, `.env.example`, LICENSE | MEDIUM | ⏳ |
| 8 | T31 | CI GitHub Actions | MEDIUM | ⏳ |
| 9 | T33b | Verifica finale nel browser | HIGH | ⏳ |
| 9 | T34 | Revisione finale | MAX | ⏳ |

## Baseline (T00)

Rilevata sul commit `f1dc01b` prima di qualsiasi modifica.

### Installazione

- `npm ci` completato. I moduli nativi (`argon2`) e `sql.js` si caricano senza errori.
- `npm audit`: **17 vulnerabilità** (1 critical, 11 high, 5 moderate).
  - Dirette: `express` (high, risolvibile senza major), `nodemailer` (high, fix solo con major 10.x: la dipendenza è inutilizzata e va rimossa, T23), `xlsx` (high, **nessun fix disponibile**: usata solo da codice legacy, da rimuovere, T22/T23), `resend` (moderate, risolvibile).
  - Transitive: `proxy-addr` (critical), `body-parser`, `path-to-regexp`, `jws`, `qs` e altre (via express/jsonwebtoken), più la toolchain di sviluppo (`brace-expansion`, `minimatch`, `flatted`, `js-yaml`, `ajv`). Tutte risolvibili con `npm audit fix` senza major. Da valutare in T23 con la suite di test attiva.

### Lint (`npx eslint .`)

Fallisce: **4663 errori e 97 warning** in 43 file su 47.

| Regola | Occorrenze | Natura |
|---|---|---|
| `indent` | 2754 | stile |
| `linebreak-style` | 1078 | CRLF imposto; nel repo: 103 file CRLF, 15 LF, 11 misti |
| `curly` | 337 | stile |
| `brace-style` | 216 | stile |
| `no-trailing-spaces` | 98 | stile |
| `no-unused-vars` | 97 | da esaminare (codice morto) |
| `no-undef` | 29 | **falsi positivi**: `escapeHTML` e `goToStep` sono globali definiti in altri script; la configurazione non dichiara i globali del browser condivisi |
| `eqeqeq` | 6 | `admin-depositi.js`, `admin-listino.js` |
| `no-unreachable` | 1 | `admin.js:1295`: il selettore di granularità è disattivato intenzionalmente (`calendarGranularity = 15; return;`) |
| errori di parsing | 2 | `check-api.js` e `debug.js` sono codificati UTF-16 (artefatti, T28) |

La configurazione dichiara `sourceType: module` su codice CommonJS e usa un solo `env` per backend e frontend.

### Format (`npx prettier --check .`)

114 file non conformi; 4 file non analizzabili (gli artefatti UTF-16 e la `diff_admin.txt`).

### Avvio e smoke test

Avvio con DB temporaneo (fuori dal repo), `RESEND_API_KEY` vuota e admin sintetico (`admin@example.test`).

- Il DB viene creato, l'admin pure, e il seed del listino inserisce 10 servizi. `GET /api/services` ne restituisce 9: "Cambio gomme stagionale" è nascosto dal filtro stagionale (15/11–15/04) alla data del test, 26/10.
- **La retention viene eseguita all'avvio con cancellazioni reali** (confermato dal log `[Retention] Cleanup iniziale completato`). Sul DB vuoto non ha cancellato nulla.
- Pagine: tutte `200` tranne **`/summary` → 404**, con lo stack trace `ENOENT .../frontend/summary.html` nel log (route verso un file inesistente).
- `/admin/vip`, `/admin/banned` e `/services` rispondono `200` ma nessuna pagina le collega.
- Autorizzazione: `GET /api/admin/bookings` → `401` senza sessione, `200` con la sessione admin.
- Email: disattivate come previsto (`RESEND_API_KEY non configurata`).

### Test

Nessuna suite di test (`package.json` non ha lo script `test`). Le verifiche di comportamento partono da T04.

### Difetti preesistenti confermati nel codice (da riprodurre con test in T04)

P02 (prenotazione spostata al 1970 se il limite depositi è raggiunto), P05 (durata decisa dal client), P06 (orari estesi aperti a tutti via API), P07 (spostamento admin), P08 (deposito orfano alla cancellazione), P09/P10 (depositi), P11 (XSS memorizzata nel pannello admin), P15/P16 (date UTC). Dettagli nella sezione seguente.

## Riepilogo dell'analisi

Valutazione: **combinazione per area**.
- Integrità dei dati: refactoring circoscritto ma critico.
- Regole di prenotazione: correzioni mirate (il motore a intervalli `computeAvailableSlots` resta).
- `server.js`: suddivisione meccanica in route ed errori.
- Frontend: pulizia del codice morto.
- CSS: conservato.

| ID | Problema | Riferimento |
|---|---|---|
| P01 | DB e file WAL tracciati (contengono indirizzi email e hash) | `database/` |
| P02 | Modifica verso una consegna con limite raggiunto → prenotazione persa (`1970-01-01`) | `server/server.js:338,356` |
| P03 | Scrittura del DB non atomica; corruzione già osservata | `server/database.js:29-35`, `error.asc` |
| P04 | booking, deposito e collegamento sono scritture separate | `server/server.js` (3 route) |
| P05 | Durata decisa dal client | `server/bookingService.js:220-224` |
| P06 | Orari estesi per tutti i ruoli via API | `server/bookingService.js:232,300` |
| P07 | Spostamento admin: ignora la durata, cambia l'id | `server/bookingService.js:544-585` |
| P08 | Cancellazione del cliente senza pulizia del deposito | `server/bookingService.js:380-395` |
| P09 | `schedule` dei depositi senza validazione | `server/server.js:1374-1427` |
| P10 | Stato del deposito come testo libero | `server/depositService.js:92` |
| P11 | XSS memorizzata nel pannello admin | `frontend/js/admin.js:704-707` e altri |
| P12 | Iniezione HTML nelle email | `server/emailService.js` |
| P13 | Rate limit aggirabile con `x-forwarded-for` | `server/server.js:77-91` |
| P14 | CSP con `unsafe-inline`; Chart.js da CDN senza versione | `server/server.js:48-56` |
| P15 | Report: giorno sfasato in UTC, blocchi `extra_work` contati | `server/server.js:1154-1160` |
| P16 | `getUserBookings` usa la data UTC | `server/bookingService.js:347` |
| P17 | `servizio` scartato dalla whitelist delle colonne | `server/database.js:468-472` |
| P18 | Duplicato email case-sensitive in registrazione | `server/authService.js:72` |
| P19 | Il backup ignora `DATABASE_PATH` | `server/backup.js:13` |
| P20 | JS e pagine frontend non raggiungibili | `frontend/` |
| P21 | Endpoint e script di riparazione una tantum | `server/server.js:861-936`, `fix-extrawork-db.js` |
| P22 | Retention distruttiva in ogni ambiente | `server/retentionService.js:304` |
| P23 | Lint inutilizzabile (CRLF, terminazioni miste) | `.eslintrc.json`, `.prettierrc` |
| P24 | Dipendenze inutilizzate (`xlsx`, `nodemailer`, `cors`) | `package.json` |
| P25 | README, CLAUDE.md e `.env.example` non aggiornati | radice |
| P26 | Funzioni token inutilizzate | `server/bookingService.js:587-665` |
| P27 | `maxDeposits` con tre fonti | `server/server.js:656`, `config/config.js:94` |

## T01: pulizia dei dati nel repository

- Rimossi dall'albero, senza leggerne i contenuti: `database/database.sqlite.bak` e 8 file `database/.fuse_hidden*` (file WAL e shared memory di SQLite). Restano nella cronologia Git: la riscrittura è la decisione separata D-7.
- `.claude/settings.local.json` non è più tracciato (configurazione locale); il file locale resta.
- `.gitignore`: ignora tutto `database/` tranne `.gitkeep`, più `*.sqlite`, `*.sqlite-*`, `*.sqlite.bak` e `.fuse_hidden*` ovunque.
- Verifica: `git check-ignore` sui percorsi tipici (DB, WAL, CSV legacy, file fuse, impostazioni locali). Avvio con il percorso di default: `database/database.sqlite` viene creato, risulta ignorato e il server risponde `200`. Il DB sintetico di prova è stato eliminato.

## Prossimo passo

T27: normalizzare le terminazioni di riga in LF (`.gitattributes`, un commit meccanico registrato in `.git-blame-ignore-revs`) e rendere coerenti ESLint e Prettier (env node/browser, CommonJS, globali condivisi del frontend).
