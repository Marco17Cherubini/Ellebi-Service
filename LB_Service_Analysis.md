# Analisi Approfondita degli Errori di Logica e Coerenza nel Sistema di Prenotazione (LB Service)

Questo documento analizza a fondo le falle architetturali e gli errori di logica introdotti dalle recenti implementazioni (come richiesto dal prompt operativo) all'interno del codebase. Queste implementazioni, che intendevano risolvere problemi legati alle prenotazioni "duration-aware" (che superano la durata di singolo slot), hanno invece introdotto gravi discrepanze e disallineamenti con la logica originale, causando bug a catena nell'intero sistema.

## 1. Il Paradigma Errato del "Multi-Record" per le Prenotazioni (DB Denormalization)

L'errore architetturale più grave, che costituisce la fonte del 90% delle anomalie introdotte, risiede in **`createBooking` e `createConsegnaBooking`** all'interno di `bookingService.js`.

### Cosa è stato inserito:
Per risolvere il problema dell'overbooking di servizi che durano più di 15 minuti, l'implementazione ha deciso di spezzare una singola prenotazione in **N record separati** nel database.
Se un utente prenota un appuntamento da 60 minuti alle 10:00, la funzione calcola `slotsNeeded = 4` e inserisce 4 righe separate nel DB, tutte con la stessa durata (`durata_minuti = 60`) e la medesima anagrafica: `[10:00, 10:15, 10:30, 10:45]`.

### Perché rompe il sistema:
*   **Corruzione delle Statistiche Utente (`getUserBookingStats`)**: 
    La funzione di conteggio per l'utente conta letteralmente i record (`bookings.length`). Spezzando una prenotazione da 2 ore in 8 slot, il sistema segnalerà che l'utente ha effettuato 8 prenotazioni distinte anziché 1.
*   **Impossibilità di Annullare le Prenotazioni Coperte (`cancelBooking` e `adminCancelBooking`)**:
    La logica di cancellazione elimina le prenotazioni identificandole univocamente tramite data e l'orario del singolo intervallo (`b.giorno === giorno && b.ora === ora`). Se un cliente cancella la prenotazione per le 10:00, verrà eliminata **solo** la riga delle 10:00. Le righe 10:15, 10:30 e 10:45 rimarranno "orfane" nel DB. Inibiscono l'orario per futuri appuntamenti, e creano appuntamenti "fittizi" che distruggono il calendario visivo all'Admin.
*   **Sovraccarico Dati Inutile**: È una grave denormalizzazione. Un evento nel mondo reale (1 auto in officina per 2 ore) diventa 8 istanze isolate unite unicamente da un "token" debole che però i metodi esistenti (come cancellazione) non sfruttano a pieno.

---

## 2. Salto Spaziale Impossibile (Falla sul calcolo della Continuità)

All'interno di **`getAvailableSlotsForService`**, per tentare di interpretare anche i salvataggi "single-record" o le consegne estese (come scritto in `PROMPT-FIX-ISSUES.md`), è stato abbozzato un calcolo dinamico dell'occupazione in base alla durata:

### Cosa è stato inserito:
```javascript
const dur = parseInt(b.durata_minuti);
if (dur && dur > 15) {
  const startIdx = allSlots.indexOf(b.ora);
  const count = Math.ceil(dur / 15);
  for (let j = 1; j < count && startIdx + j < allSlots.length; j++) {
    occupiedSlots.add(allSlots[startIdx + j]);
  }
}
```

### Perché rompe il sistema:
L'array `allSlots` contiene la giustapposizione di due o più blocchi separati. Ad esempio, per i giorni feriali contiene un blocco dalle `08:30` alle `12:30` attaccato immediatamente al blocco dalle `14:30` alle `18:30`.
Un appuntamento da 60 minuti salvato ingenuamente alle `12:00` ha teoricamente bisogno di 4 slot consecutivi.
*   L'indice di `12:00` è ad esempio 14.
*   Il calcolo ciclerà aggiungendo gli indici `14, 15, 16, 17`.
*   Tuttavia, `allSlots[15]` è `12:15` (ultimo del mattino), ma **`allSlots[16]` è `14:30`**.
La logica va a **marcare come occupate le 14:30 e le 14:45**. Questo significa che la pausa pranzo viene ignorata a livello di indicizzazione e un appuntamento slitta magicamente nel pomeriggio, bloccando artificialmente la disponibilità pomeridiana per un orario che è fisicamente in conflitto e impossibile per un meccanico reale. 

---

## 3. Disconnessione nei Lavori Straordinari (Consegne / Depositi)

La funzione **`createConsegnaBooking`** implementata soffre della stessa degenerazione del "Multi-Record": introduce magicamente 2 slot forzati a `durata_minuti = 30`.

### Cosa è stato inserito:
La funzione prenota i due slot accodandoli al DB, e alla fine ritorna `mainBooking` o il primo record inserito, passandolo al `depositService.createDeposit(bookingId)`.

### Perché rompe il sistema:
Il deposito (che gestisce auto in giacenza per interventi straordinari prolungati) rimane agganciato solo e unicamente al primo slot (esimo ID di autoincrement in DB). 
Questo design indebolisce la resilienza relazionale del Database. Quando interviene una manipolazione della lista slot da Calendario Admin (ad esempio, uno spostamento drag and drop o cancellazione), lo slot secondario resta slegato dal Deposito, producendo inconsistenze di log.

---

## 4. Middleware e Sicurezza Rate Limiter: Promiscuità Architetturale

La direttiva chiedeva l'aggiunta di protezioni. Le dipendenze come `express-rate-limit` sono state caricate dentro a `server.js` ma la gestione di utenti bannati è stata incollata, spesso con promiscuità di import, in punti imprecisi o senza una coerenza con le logiche globali del proxy.

### Problema del Check di Ban
Inserire `isBanned` su token validi bloccherà futuri tentativi di interazione, ma se gestito maldestramente a livello del singolo `authenticateToken` con un `.clearCookie('token')`, intercetta in pancia ad un middleware HTTP logic-less una risposta a browser, alterando la pulizia dell'architettura Express esistente che prevedeva le deleghe logiche al service (es. un return `403` netto e gestione del logout via client wrapper API).

---

## Quale Sarebbe Dovuta Essere l'Implementazione "Migliore" (Best Practice)

La "soluzione migliore per l'architettura", che prevenisce tutte le instabilità elencate, consiste in un paradigma concettualmente opposto a quello inserito artificialmente nel codice:

1.  **Approccio a RECORD SINGOLO per Prenotazione**:
    Ogni prenotazione DEVE e DOVREBBE produrre **una singola riga di database** contenente `ora_inizio` e la rispettiva `durata_minuti`. Non deve mai esistere più di una riga per la stessa auto o persona.

2.  **Calcolo della Disponibilità basato sul Tempo Cinetico, NON sugli indici array**:
    Il `getAvailableSlotsForService` non deve controllare la continuità usando un array sciapo (`allSlots[i+1]`). Modificare `occupiedSlots` in modo tale che, iterando le singole prenotazioni già presenti nel DB, estrapoli il reale tempo di inizio in Minuti (Es. `12:00` -> `720 min`) e si estenda fino alla somma (`ora_inizio_min + durata_min_record`), bloccando eventuali orari proposti dal match logico usando l'ora esatta di orologio e accertandosi che la sommatoria (`ora_nuova + durata_nuova`) non superi la soglia della pausa pranzo né che cada in sovrapposizione esatta coi minuti occorsi ad ad altri impegni.

I ritocchi effettuati in base a tale prompt errato dovranno essere **obliterati**, riportati a salvare singole entità `giorno, ora, durata` e appoggiandosi interamente sulla matematica degli overlapping di interval temporali per blindare eventuali sovrapposizioni.
