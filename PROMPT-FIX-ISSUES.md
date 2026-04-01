# Prompt Operativo — Fix Sistematico LB Service Booking System

> **Destinazione**: Claude Code (o altro LLM con accesso al codebase)
> **Obiettivo**: Risolvere 10 problematiche identificate nell'analisi sistematica del codebase, dalla più critica alla meno critica, con la soluzione architetturalmente migliore per ciascuna — mai la più veloce.

---

## Regola d'Oro

**Scegliere SEMPRE la strada che porta all'implementazione migliore per la problematica in questione. Assolutamente bandita la soluzione più veloce a livello d'implementazione. "Migliore" = la soluzione più coerente con quanto evidenziato dal problema, che MEGLIO risolve il problema prevenendo eventuali falle future.**

---

## Protocollo Thinking Mode

Ogni task ha un livello di complessità che determina il modo in cui devi ragionare prima di scrivere codice. Rispetta rigorosamente questa scala:

| Livello | Thinking Mode | Quando usarlo |
|---------|--------------|---------------|
| **CRITICO** | `ultrathink` | Bug che causano crash runtime, funzioni mancanti, falle di sicurezza strutturali |
| **DIFFICILE** | `think longer` | Bug di business logic con side-effect su più componenti, refactor cross-file |
| **MEDIO** | `think a lot` | Fix localizzati in 1-2 file, incoerenze UI/UX, validazioni mancanti |
| **SEMPLICE** | `think more` | Fix cosmetici, allineamenti di configurazione, commenti |

**Come applicare**: prima di toccare qualsiasi file per un task, DICHIARA il Thinking Mode e ragiona esplicitamente ad alta voce nel modo corrispondente. Per `ultrathink`, analizza tutte le dipendenze a monte e a valle, tutti gli edge case, tutte le interazioni col resto del sistema. Per `think more`, un rapido check di coerenza basta.

---

## Ciclo di Lavoro: PreToolUse → Tool → PostToolUse

Per ogni singolo task, segui questo ciclo in modo rigoroso. Non saltare mai un passo.

### PreToolUse (Prima di editare)

1. **Leggi TUTTI i file coinvolti** — Non editare mai un file che non hai letto per intero nella sessione corrente. Per ogni task, leggi almeno:
   - Il file che stai per modificare (per intero se < 500 righe, altrimenti le sezioni rilevanti + 50 righe di contesto sopra/sotto)
   - Tutti i file che importano/esportano simboli coinvolti nella modifica
   - Il file di configurazione `config/config.js` se il task tocca business logic

2. **Mappa le dipendenze** — Per ogni funzione che crei o modifichi, cerca nel codebase:
   - Chi la chiama (grep per il nome funzione in `server/` e `frontend/js/`)
   - Chi la importa (grep per `require('./nomeFile')` o `import`)
   - Quali tabelle DB tocca (grep per il nome tabella in `database.js`)

3. **Verifica lo schema DB attuale** — Le colonne disponibili nella tabella `bookings` sono (da `database.js` righe 163-176):
   ```
   id, nome, cognome, email, telefono, giorno, ora, servizio, token, created_at,
   user_id, vehicle_id, service_id, targa, modello, tipo, stato, note_cliente,
   nota_interna, deposit_id, durata_minuti
   ```

4. **Scrivi il piano di modifica** — Prima di toccare codice, scrivi esattamente:
   - Quali file modifichi
   - Quali funzioni crei/modifichi
   - Quali parametri aggiungi
   - Quali effetti a cascata prevedi

### Tool (Esecuzione dell'edit)

5. **Edit chirurgico** — Usa lo strumento Edit (non Write) per modificare file esistenti. Mai sovrascrivere un file intero quando puoi fare un edit puntuale.

6. **Un concetto per edit** — Ogni singola invocazione di Edit deve fare UNA cosa logica. Non mischiare fix di funzioni diverse nello stesso edit.

7. **Mantieni retrocompatibilità** — Ogni modifica a una funzione deve preservare il funzionamento dei caller esistenti. Se aggiungi parametri, rendili opzionali con default sensati.

### PostToolUse (Dopo ogni edit)

8. **Rileggi il file modificato** — Dopo ogni edit, rileggi le righe modificate ±20 per verificare che l'indentazione sia corretta, che non ci siano syntax error, e che il contesto circostante sia coerente.

9. **Verifica import/export** — Dopo aver creato una nuova funzione in un modulo, verifica che:
   - Sia esportata nel `module.exports` del file
   - Sia importata correttamente in tutti i file che la usano (controlla il destructuring in `server.js` riga 8-19)

10. **Dry-run mentale** — Simula mentalmente l'esecuzione del codice che hai scritto: parti dall'HTTP request, attraversa middleware, entra nella route, chiama il service, interagisce col DB, torna la response. Verifica che ogni step funzioni.

11. **Test finale** — Dopo aver completato TUTTI i task, esegui `npm run lint` per verificare che non ci siano errori di sintassi. Se disponibile, esegui `node -e "require('./server/bookingService')"` per verificare che il modulo carichi senza crash.

---

## Piano di Esecuzione Ordinato

> **IMPORTANTE**: Esegui i task ESATTAMENTE in questo ordine. I task critici vanno prima perché quelli successivi dipendono dalla loro corretta implementazione.

---

### TASK 1 — `getAvailableSlotsForService` non esiste
**Priorità**: CRITICA | **Thinking Mode**: `ultrathink`

**Problema**: `server.js` riga 10 importa `getAvailableSlotsForService` da `bookingService.js`, ma questa funzione non esiste. L'endpoint `GET /api/slots/:date/:serviceId` (server.js riga ~217) chiama `getAvailableSlotsForService(date, durata, includeExtraSlots)` e crasha con `TypeError`.

**Contesto**: Questa funzione deve ritornare gli slot disponibili per una data, tenendo conto della DURATA del servizio. Se un servizio dura 90 minuti (= 6 slot da 15min), uno slot di inizio è "disponibile" solo se TUTTI i 6 slot consecutivi partendo da quello sono liberi e non in ferie.

**Analisi delle dipendenze**:
- Chiamata in `server.js` come: `getAvailableSlotsForService(date, durata, includeExtraSlots)` dove `durata` è in minuti (es. 60, 90, 120)
- Deve coesistere con `getAvailableSlots(date, includeExtraSlots)` (che resta per retrocompatibilità, usata altrove)
- Usa `getSlotsForDay()`, `isHolidaySlot()`, `bookingsDB.findMany()`

**Implementazione richiesta** (in `server/bookingService.js`):
```
function getAvailableSlotsForService(date, duratMinuti, includeExtraSlots = false) {
  // 1. Verifica isDayAvailable(date) — se no, return []
  // 2. Ottieni allSlots = getSlotsForDay(date, includeExtraSlots)
  // 3. Calcola slotsNeeded = Math.ceil(duratMinuti / 15) (granularità 15min da config)
  //    - Se duratMinuti non fornita o <= 0, default a APPOINTMENT_DURATION
  // 4. Ottieni tutte le prenotazioni del giorno: bookingsDB.findMany(b => b.giorno === date)
  //    - Per ogni prenotazione, calcola TUTTI gli slot che occupa:
  //      startIdx = allSlots.indexOf(b.ora)
  //      slotsOccupied = Math.ceil((b.durata_minuti || 60) / 15)
  //      Marca come occupati: allSlots[startIdx] ... allSlots[startIdx + slotsOccupied - 1]
  // 5. Ottieni holiday slots per il giorno
  // 6. Per ogni slot nell'array:
  //    - Lo slot è "disponibile come inizio" se E SOLO SE tutti gli slot da [i] a [i + slotsNeeded - 1]:
  //      a) esistono nell'array (non sforiamo la giornata)
  //      b) non sono occupati da prenotazioni esistenti
  //      c) non sono in ferie
  //      d) non cadono in una fascia oraria diversa (es. non attraversano la pausa pranzo 12:30-14:30)
  //    - ATTENZIONE alla pausa pranzo: gli slot mattutini finiscono a 12:15 (ultimo slot weekday), quelli pomeridiani iniziano a 14:30. Un servizio da 90min che inizia alle 12:00 NON può "sforare" nel pomeriggio.
  // 7. Ritorna array di oggetti: { time, available, isHoliday }
}
```

**Vincolo pausa pranzo**: gli slot mattutini e pomeridiani sono generati come array separati poi concatenati. Un servizio multi-slot NON deve attraversare il gap. Per verificarlo: controlla che tra slot[i] e slot[i+1] la differenza sia esattamente 15 minuti. Se la differenza è maggiore (gap pranzo), il servizio non ci sta.

**Dopo l'implementazione**:
- Aggiungila al `module.exports` in fondo a `bookingService.js`
- Verifica che il destructuring in `server.js` riga 10 la trovi correttamente
- Verifica che `server.js` riga ~217 la chiami con la signature corretta

---

### TASK 2 — `createConsegnaBooking` non esiste
**Priorità**: CRITICA | **Thinking Mode**: `ultrathink`

**Problema**: `server.js` riga 12 importa `createConsegnaBooking` da `bookingService.js`, ma non esiste. Chiamata in `server.js` riga ~292 (utente autenticato) e riga ~445 (guest). Crash per tutte le prenotazioni di tipo "consegna veicolo".

**Contesto**: Una "consegna" è quando il cliente porta il veicolo all'officina e lo lascia. Il booking di accoglienza dura 30 minuti (2 slot da 15min). Dopo il booking, viene creato un record `deposit` tramite `depositService.createDeposit()`.

**Analisi dei caller** — `server.js` chiama:
```js
// Utente autenticato (riga ~292):
const bookingResult = createConsegnaBooking(req.user.email, req.body);
// req.body contiene: { data, orario, serviceId, targa, modello, note_cliente, ore_stimate }

// Guest (riga ~445):
const bookingResult = createConsegnaBooking(emailLower, bookingPayload);
// bookingPayload contiene: { data, orario, serviceId, targa, modello, note_cliente, ore_stimate }
```

**Implementazione richiesta** (in `server/bookingService.js`):
```
function createConsegnaBooking(userEmail, bookingData) {
  // 1. Estrai: data, orario, serviceId, targa, modello, note_cliente
  // 2. Validazione: data e orario obbligatori, targa e modello obbligatori
  //    (il depositService li richiede comunque, ma meglio fallire qui con messaggio chiaro)
  // 3. Verifica isDayAvailable(data)
  // 4. Durata fissa accoglienza consegna: 30 minuti = 2 slot da 15min
  // 5. Verifica che i 2 slot consecutivi siano disponibili (stessa logica di createBooking ma per 2 slot)
  //    - allSlots = getSlotsForDay(data, true)  // true: consegne possono usare slot extra
  //    - startIndex = allSlots.indexOf(orario)
  //    - Verifica slot[startIndex] e slot[startIndex + 1] liberi e non in ferie
  // 6. Ottieni dati utente. Due casi:
  //    a) userEmail corrisponde a un utente registrato → usa dati da usersDB
  //    b) userEmail è un guest → usa dati da bookingData (nome, cognome, telefono)
  // 7. Crea il/i record booking con:
  //    - Tutti i campi standard (nome, cognome, email, telefono, giorno, ora)
  //    - service_id: serviceId
  //    - targa: targa
  //    - modello: modello
  //    - tipo: 'deposito'
  //    - durata_minuti: 30
  //    - note_cliente: note_cliente
  //    - token: generateBookingToken()
  // 8. Per i 2 slot, crea un record per il primo slot (quello "principale")
  //    e un secondo record per slot+1 con stessi dati (per bloccare entrambi)
  //    OPPURE: crea un singolo record con durata_minuti=30 e affidati a
  //    getAvailableSlotsForService per il blocking — MA solo se TASK 5 è implementato.
  //    DECISIONE: crea 2 record (approach "multi-record"), perché è la stessa logica
  //    usata da createBooking per i gruppi, ed è più robusto per il check di conflitto.
  // 9. Ritorna il primo booking (principale) con il suo id per collegare il deposito.
}
```

**Dopo l'implementazione**:
- Aggiungila al `module.exports`
- Verifica i due caller in `server.js` (riga ~292 e ~445) — devono ricevere un oggetto con `.id`, `.giorno`, `.ora`
- Il `.id` viene passato a `depositService.createDeposit(bookingResult.id, depositData)` — verifica che l'id sia l'autoincrement di SQLite

---

### TASK 3 — `createAdminBooking()` ignora i campi v2
**Priorità**: ALTA | **Thinking Mode**: `think a lot`

**Problema**: `bookingService.js` riga 224-252. La funzione estrae solo `{ nome, cognome, email, telefono, giorno, ora, servizio }` dal destructuring. Ignora: `serviceId`, `targa`, `modello`, `durata_minuti`, `tipo`, `note_cliente`, `deposit_id`.

**Contesto dei caller**: `admin.js` (frontend) invia tutti questi campi via `POST /api/admin/bookings`. `server.js` li passa a `createAdminBooking(req.body)`.

**Implementazione richiesta**:

Modifica il destructuring in `createAdminBooking`:
```js
function createAdminBooking(bookingData) {
  const {
    nome, cognome, email, telefono, giorno, ora, servizio,
    // Campi v2
    service_id, serviceId, targa, modello, durata_minuti, tipo,
    note_cliente, nota_interna, deposit_id
  } = bookingData;
```

Modifica l'oggetto `booking` costruito:
```js
  const booking = {
    nome: nome ? nome.trim() : '',
    cognome: cognome.trim(),
    email: email ? email.trim().toLowerCase() : '',
    telefono: telefono ? telefono.trim() : '',
    giorno,
    ora,
    servizio: servizio ? servizio.trim() : '',
    // Campi v2
    service_id: service_id || serviceId || null,
    targa: targa ? targa.trim().toUpperCase() : '',
    modello: modello ? modello.trim() : '',
    durata_minuti: parseInt(durata_minuti) || 60,
    tipo: tipo || 'cliente',
    note_cliente: note_cliente || '',
    nota_interna: nota_interna || '',
    deposit_id: deposit_id || null
  };
```

**ATTENZIONE — Duration-aware blocking per admin**: Se `durata_minuti > 15`, l'admin booking deve creare record aggiuntivi per gli slot successivi (OPPURE un singolo record che viene correttamente interpretato dal sistema di availability — vedi TASK 5). Per coerenza con il sistema esistente (che usa multi-record per i gruppi), crea N record dove N = `Math.ceil(durata_minuti / 15)`. Tutti condividono lo stesso `token` generato da `generateBookingToken()`.

Questo risolve anche il **TASK 5** (overbooking) per le prenotazioni admin.

---

### TASK 4 — `createBooking()` (utente) ignora i campi v2
**Priorità**: ALTA | **Thinking Mode**: `think a lot`

**Problema**: `bookingService.js` riga 93-171. Salva solo `nome, cognome, email, telefono, giorno, ora, token, numPersone, slotIndex`. Non salva `service_id`, `targa`, `modello`, `durata_minuti`, `tipo`, `note_cliente`.

**Contesto**: Attualmente il flusso utente (dashboard → summary) NON invia `serviceId` (vedi TASK 9). Ma il flusso guest booking e il futuro flusso con selezione servizio LO INVIERANNO. Quindi `createBooking` deve essere pronto a riceverli.

**Implementazione richiesta**:

Nel destructuring iniziale, aggiungi i campi v2:
```js
const { data, orario, numPersone = 1, serviceId, service_id, targa, modello, durata_minuti, note_cliente } = bookingData;
```

Calcola `slotsNeeded` in base alla durata:
```js
// Se c'è un serviceId, la durata viene dal servizio. Altrimenti, 1 slot per persona del gruppo.
const effectiveDurata = parseInt(durata_minuti) || APPOINTMENT_DURATION;
const slotsForDuration = Math.ceil(effectiveDurata / 15);
// Per i gruppi (numPersone > 1), ogni persona = 1 slot. Per servizi con durata, usa slotsForDuration.
const groupSize = Math.min(Math.max(parseInt(numPersone) || 1, 1), 3);
const slotsNeeded = groupSize > 1 ? groupSize : slotsForDuration;
```

Nell'oggetto booking dentro il forEach, aggiungi:
```js
const booking = {
  nome: user.nome,
  cognome: user.cognome,
  email: user.email,
  telefono: user.telefono,
  giorno: data,
  ora: slotTime,
  token: bookingToken,
  // Campi v2
  service_id: service_id || serviceId || null,
  targa: targa ? targa.trim().toUpperCase() : '',
  modello: modello ? modello.trim() : '',
  durata_minuti: effectiveDurata,
  tipo: 'cliente',
  note_cliente: note_cliente || ''
};
```

---

### TASK 5 — Prenotazioni non bloccano slot duration-aware
**Priorità**: ALTA | **Thinking Mode**: `think a lot`

**Problema**: Una prenotazione per un servizio da 120 minuti crea un singolo record DB. Gli slot "sotto" quel record restano prenotabili da altri utenti → overbooking.

**Questo task è RISOLTO in modo distribuito nei task 1, 2, 3, 4** se implementati correttamente:

1. **TASK 1** (`getAvailableSlotsForService`): Quando calcola la disponibilità, legge `durata_minuti` di ogni booking esistente e marca come occupati TUTTI gli slot coperti, non solo quello di inizio.
2. **TASK 3** (`createAdminBooking`): Crea N record (uno per ogni slot da 15min occupato), così il vecchio `getAvailableSlots` (che non è duration-aware) li vede comunque come occupati.
3. **TASK 4** (`createBooking`): Stesso approccio multi-record.
4. **TASK 2** (`createConsegnaBooking`): Crea 2 record per 30 minuti.

**Verifica post-implementazione**: Simula questo scenario:
- Servizio "Tagliando completo" dura 120 minuti (8 slot)
- Admin crea booking alle 09:00
- Verifica che `getAvailableSlotsForService('2026-03-25', 15, false)` ritorni gli slot 09:00-10:45 come `available: false`
- Verifica che `getAvailableSlots('2026-03-25', false)` ritorni ANCHE questi slot come non disponibili (perché ci sono 8 record nel DB)

---

### TASK 6 — Utenti bannati possono prenotare con token JWT valido
**Priorità**: MEDIA-ALTA | **Thinking Mode**: `think`

**Problema**: `isBanned()` è definita in `authService.js` riga 188-192 e esportata, ma mai chiamata in `server.js` né in `middleware.js`. Un utente bannato con cookie JWT valido (durata 7 giorni) può continuare a prenotare.

**Soluzione migliore**: Aggiungere il check nel middleware `authenticateToken` (`middleware.js`), NON nelle singole route. Così ogni route protetta è automaticamente coperta.

**Implementazione**:

In `server/middleware.js`, importa `isBanned`:
```js
const { verifyToken, getUserByEmail, isAdmin, isBanned } = require('./authService');
```

Nel blocco "Utente normale" (dopo `const user = getUserByEmail(decoded.email)`), aggiungi:
```js
    // Controlla se l'utente è bannato
    if (isBanned(decoded.email)) {
      // Cancella il cookie per forzare un nuovo login (che fallirà)
      res.clearCookie('token');
      return res.status(403).json({ error: 'Account sospeso. Contattare l\'amministrazione.' });
    }
```

**Posizionamento**: Dopo il check `if (!user)` e prima di `req.user = { ...user, isAdmin: false }`.

**Nota**: Questo NON copre le route guest (che non passano per `authenticateToken`). I guest non hanno account quindi non possono essere "bannati" nel senso tradizionale. Se serve bannare per email anche i guest, bisognerebbe aggiungere un check nella route `POST /api/bookings/guest` — ma questo è un enhancement futuro, non un bug attuale.

---

### TASK 7 — Filtro stagionale a cavallo d'anno non funziona
**Priorità**: MEDIA | **Thinking Mode**: `think`

**Problema**: `server.js` riga 253-258. Il servizio "Cambio gomme stagionale" ha `data_inizio_stagione: '11-15'` e `data_fine_stagione: '04-15'`. Il confronto lessicografico `todayMMDD >= '11-15' && todayMMDD <= '04-15'` è SEMPRE false perché nessuna stringa MM-DD è contemporaneamente >= '11-15' e <= '04-15'.

**Implementazione**:

Sostituisci il blocco filtro stagionale in `server.js` (riga ~253-258):

```js
    services = services.filter(function (s) {
      if (!s.stagionale || s.stagionale === 0 || s.stagionale === '0') return true;
      if (!s.data_inizio_stagione || !s.data_fine_stagione) return true;

      var inizio = s.data_inizio_stagione; // formato MM-DD
      var fine = s.data_fine_stagione;     // formato MM-DD

      if (inizio <= fine) {
        // Intervallo NON a cavallo d'anno (es. 03-01 → 06-30)
        return todayMMDD >= inizio && todayMMDD <= fine;
      } else {
        // Intervallo A CAVALLO d'anno (es. 11-15 → 04-15)
        // La data è nel range se è >= inizio OPPURE <= fine
        return todayMMDD >= inizio || todayMMDD <= fine;
      }
    });
```

**Verifica**: Con data odierna `03-24`, il servizio con range `11-15 → 04-15` deve risultare VISIBILE (perché `03-24 <= 04-15` è true).

---

### TASK 8 — Rate-limiting disabilitato
**Priorità**: MEDIA | **Thinking Mode**: `think`

**Problema**: `server.js` definisce `authLimiter` come `(req, res, next) => next()` — un no-op. Le route di login e registrazione non hanno protezione brute-force.

**Implementazione**: Usa `express-rate-limit` (già usato tipicamente con Express, ma verifica se è nelle dipendenze):

```bash
# Verifica se è già installato
npm ls express-rate-limit
# Se non installato:
npm install express-rate-limit
```

Sostituisci il no-op `authLimiter` con:
```js
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minuti
  max: 10,                     // Max 10 tentativi per finestra
  message: { success: false, error: 'Troppi tentativi. Riprova tra 15 minuti.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Identifica per IP (o X-Forwarded-For se dietro proxy/Railway)
  keyGenerator: function (req) {
    return req.headers['x-forwarded-for'] || req.ip;
  }
});
```

**Dove applicarlo**: Verifica in `server.js` dove `authLimiter` è referenziato. Dovrebbe essere applicato a:
- `POST /api/login`
- `POST /api/register`
- `POST /api/password-reset`

Se non è già applicato a queste route, aggiungilo come middleware.

---

### TASK 9 — Flusso utente senza selezione servizio
**Priorità**: MEDIA | **Thinking Mode**: `think`

**Problema**: Il flusso dashboard → summary non include la selezione del servizio. L'utente sceglie data/ora e conferma, ma non specifica cosa deve fare (tagliando, revisione, ecc.). Il campo `service_id` non viene mai inviato nella prenotazione utente.

**Nota**: Questo è un problema di UX/architettura che richiede modifiche frontend significative. NON è un crash e NON è un bug nel senso stretto. Il backend (dopo TASK 4) è pronto a ricevere `serviceId` — manca il frontend.

**Implementazione raccomandata** — Approccio incrementale:

**Fase 1 (minimo vitale)**: Aggiungi una select di servizio nella pagina `summary.js` prima della conferma:
- Quando l'utente arriva su summary.html, carica i servizi da `GET /api/services`
- Mostra un dropdown/card-list per scegliere il servizio
- Il servizio scelto popola `serviceId` e `durata_minuti` nel payload inviato a `POST /api/bookings`
- Se il servizio ha durata diversa da 60min, avvisa l'utente che potrebbero servire più slot

**Fase 2 (ideale)**: Integra la selezione servizio PRIMA del calendario, così che il calendario mostri solo gli slot dove il servizio ci sta (usando `GET /api/slots/:date/:serviceId` — TASK 1). Questo richiede ristrutturare il flusso in: selezione servizio → calendario (filtrato per durata) → conferma.

**Per ora implementa Fase 1**: è meno invasiva e non rompe il flusso esistente.

---

### TASK 10 — Guest booking permette selezione del lunedì
**Priorità**: BASSA | **Thinking Mode**: `think briefly`

**Problema**: `guest-booking.js` riga ~162-166 disabilita solo `dayOfWeek === 0` (domenica). `dashboard.js` disabilita `dayOfWeek === 0 || dayOfWeek === 1` (domenica E lunedì). Ma la config `daysOpen: [1,2,3,4,5,6]` INCLUDE il lunedì (1 = lunedì).

**Analisi**: La config dice che il lunedì è aperto. Quindi `dashboard.js` è SBAGLIATO a disabilitarlo, oppure la config è sbagliata. Dato che l'officina è una gommista che probabilmente è aperta lunedì-sabato, e la config include esplicitamente il lunedì, il bug è in `dashboard.js` che disabilita un giorno che dovrebbe essere aperto.

**Implementazione**: Allinea sia `dashboard.js` che `guest-booking.js` alla config, usando i `daysOpen` come source of truth:

In `guest-booking.js`, sostituisci il check `isSunday`:
```js
// Vecchio: const isSunday = dayOfWeek === 0;
// Nuovo: check dinamico basato su config
const isClosedDay = ![1, 2, 3, 4, 5, 6].includes(dayOfWeek);
// OPPURE meglio: carica daysOpen da un endpoint /api/config e usalo qui
```

**Approccio migliore**: Crea un endpoint `GET /api/config/business-hours` che esponga `daysOpen` (se non esiste già — verifica `GET /api/config/slots`). Poi sia `dashboard.js` che `guest-booking.js` leggono da lì i giorni aperti, invece di hardcodarli.

In `dashboard.js`, rimuovi `dayOfWeek === 1` dal check di disabilitazione e usa la stessa logica config-driven.

---

## Checklist di Verifica Finale

Dopo aver completato tutti i task, esegui questa verifica sistematica:

```bash
# 1. Lint check
npm run lint

# 2. Module load check (no crash al require)
node -e "const bs = require('./server/bookingService'); console.log('Exports:', Object.keys(bs));"

# 3. Verifica che le nuove funzioni siano esportate
node -e "const bs = require('./server/bookingService'); console.log('getAvailableSlotsForService:', typeof bs.getAvailableSlotsForService); console.log('createConsegnaBooking:', typeof bs.createConsegnaBooking);"

# 4. Verifica middleware
node -e "const m = require('./server/middleware'); console.log('Middleware exports:', Object.keys(m));"

# 5. Dry-start del server (se possibile)
timeout 5 node server/server.js || true
```

Se il server avvia senza crash, tutti i task critici (1, 2) sono risolti. Se il lint passa, non ci sono syntax error.

---

## Note Architetturali per il Futuro

Queste NON sono da implementare ora, ma da tenere a mente per non creare debito tecnico:

1. **`numPersone` e `slotIndex` non sono nelle colonne DB** — Vengono passati a `insert()` ma SQLite li ignora silenziosamente. Se servono, aggiungi le migrazioni in `database.js`.

2. **Dualismo admin.js (classic script) vs ES modules** — `admin.js` usa variabili globali, `state.js` e `calendar.js` usano `export/import`. Non mischiare i due pattern nello stesso contesto.

3. **`helmet` con CSP disabilitato** — `contentSecurityPolicy: false` va rimpiazzato con una policy corretta quando si eliminano gli inline scripts.

4. **`express-rate-limit` in ambiente Railway** — Se il server è dietro un proxy/load balancer, configura `app.set('trust proxy', 1)` per far funzionare correttamente il rate limiter con `X-Forwarded-For`.
