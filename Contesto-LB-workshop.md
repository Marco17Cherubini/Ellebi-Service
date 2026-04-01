# Contesto e Analisi per il Refactoring di LB Service (V3 - Analisi Globale e Masterplan Architetturale)

Questo documento traccia la strada definitiva per l'allineamento del backend di LB Service, in base alla decisione di adottare la logica matematica dei **Time Ranges (Intervalli Temporali)** e di trasformare il Frontend in una pura "maschera" del Backend.

L'intera logica pregressa ("Multi-Record" per aggirare i limiti del DB e conteggio indici per scavalcare la pausa pranzo) verrà smantellata. Il focus primario è la solidità dell'infrastruttura ("Single-Record"), la prevenzione assoluta dell'overbooking, e l'unificazione delle vie d'accesso (`admin`, `iscritto`, `guest`) sotto l'ombrello di un unico potentissimo e inattaccabile Validatore Temporale Backend.

---

## FASE 1: Creazione dell'Unico Validatore Temporale (Il Core Matematico)

Al momento il codice dispone di `getAvailableSlots` e `getAvailableSlotsForService` (righe 81-135 circa di `bookingService.js`). Entrambi presentano falle: il primo calcola solo testualmente senza percezione della durata, il secondo conta indici di array e fallisce clamorosamente tra fine mattinata e inizio pomeriggio.

**Obiettivo:** Verranno sostituiti entrambi da un'esclusiva classe/funzione `TimeRangeValidator` o da un singolo metodo unificato `computeAvailableSlots(date, durataMinuti, includeExtraSlots)`.

### La Logica proposta (Opzione B Enterprise - Time Ranges):
1.  **Conversione in Minuti Assoluti:** Qualsiasi tempo (es. `08:30`) viene convertito in minuti dalla mezzanotte (`510`).
2.  **Mappatura DB:** Ogni record nel DB, per un dato `giorno`, viene estrapolato non come stringa, ma come un rettangolo matematico definito da `[inizio, inizio + durata_minuti]`.
3.  **Filtraggio Ferie:** Anche i giorni/orari di ferie vengono mappati in intervalli bloccati (es. `15 min` se ferie normali, o blocco intero).
4.  **Generazione della Griglia Pura:** Dal `config.js` estrapoliamo le fasce lavorative come contenitori (Mattina: `[510, 750]`, Pomeriggio: `[870, 1110]`).
5.  **Controllo Frontale Backend:** Quando API, Gestionali o utenti chiedono uno slot, il server crea l'intervallo richiesto in base al servizio richiesto `[OrarioRichiesto, OrarioRichiesto + DurataServizio]`. Controlla tramite semplice intersezione geometrica `(NuovoInizio < OccupatoFine && NuovoFine > OccupatoInizio)`:
    *   Sbatte in un appuntamento già preso? = Nega Orario
    *   Sfora il turno del mattino cadendo tra le 12:30 e le 14:30? = Nega Orario

**Beneficio per la Sicurezza (Niente logiche lato client):** Il frontend non calcolerà mai se uno slot va bene o no, né userà più la UI per limitare i drop. Domanderà ciecamente al backend, e il backend sfornerà un array rigoroso contenente *esclusivamente* gli orari legalmente prenotabili.

---

## FASE 2: Normalizzazione del Database (Strict Single-Record)

Il DB attuale sta subendo inquinamento dati generato dai vecchi metodi di aggiramento che "spezzavano" un Tagliando da 90 minuti in "6 righe da 15 minuti ciascuna" (Multi-Record).

**Punti di Rifacimento:**
1.  **`createBooking` (utenti) e `createConsegnaBooking` (guest/special):**
    Eliminazione immediata del ciclo distruttivo `slotsToBook.forEach`. Rimpiazzamento con la creazione di UNA stringa unica.
    *   *Proprietà:* `giorno`, `ora` (inizio), `durata_minuti`, `tipo`, `targa`, ecc.
    *   Nessun calcolo farraginoso degli *slotsNeeded*, ma passaggio blindato della `durata_minuti`.

2.  **`createAdminBooking` (admin):**
    Allineato alle stesse regole ferree imposte al cittadino/guest. Se il capo salva dal gestionale, salva una riga con `durata_minuti`.

3.  **Gestione del paradosso "Gruppi" (Retaggio Barberia):**
    Siccome l'officina non ospita "gruppi" ma veicoli, il parametro relitto `numPersone` sarà definitivamente abolito o convertito automaticamente in durata. Ogni cliente prenota un servizio, che si manifesta nel tempo come una singola auto in officina.

**Benefici Collaterali:**
*   Il ritorno automatico all'affidabilità di `cancelBooking`, `moveBooking`, e dell'assegnazione relazionale dei Depositi (`createConsegnaBooking` assocerà l'id del deposit senza orfani o disallineamenti di ID in caso di reschedule).
*   La UI dell'Admin leggerà stringhe pure (il parser nativo del Calendar fa già questo filtro "span" grafico alla riga 90 circa in CSS Grid senza aver bisogno di pezzi da 15min in cascata).

---

## FASE 3: Centralizzazione del Routing (L'imbuto) e Sicurezza

Per evitare vulnerabilità, i controller HTTP in `server.js` devono smettere di agire per logiche divise tra "prenota utente" (che esige JWT) e "prenota ospite" (aperta) per quanto riguarda il **calcolo**.

1.  **Chiusura dei Dati del Servizio:**
    Il frontend invia unicamente `Data, Ora, ServiceId`. Non invia mai `durata_minuti` fidata.
    L'ecosistema farà *sempre* una validazione al DB. Recupera il servizio `ServiceId`, ne fa il fetch della sua reale `durata_minuti`, e passa i parametri matematici esatti al Validatore Temporale (Fase 1). Il Client non può falsificare la lunghezza.
2.  **Cancellazione a Protetto:**
    La route API verificherà categoricamente l'Ownership (`email === req.user.email`) oppure se proveniente da Admin (`req.user.isAdmin`).

### Tabella degli Allineamenti necessari al File `bookingService.js` (Target Principale del Fix):

| Funzione Attuale | Errore | Nuova Sostituzione |
| :--- | :--- | :--- |
| `getAvailableSlots` (Vecchio) | Ricerca testuale cieca `b.ora === time` | Verrà distrutto in favore di un alias al Validatore Universale. |
| `getAvailableSlotsForService` (Nuovo) | Indici array contati male e crash Pausa Pranzo | Verrà assorbito nel nuovo `computeAvailableSlots(date, durata)` a Intervalli di Minuti. |
| `createBooking` | Ciclo `forEach` inseriva `N` cloni nel db | Stringa secca `insert()` previo assenso dal Validatore Temporale Universale. |
| `createConsegnaBooking` | Infila forzatamente 2 slot da 15min rovinando log | Stringa singola, `durata_minuti: 30`, link univoco per Deposit Table. |
| `createAdminBooking` | Usa logica fallata degli `slotsNeeded` come `forEach` | Ripulitura e allineamento al pattern Single-Record e a `durata_minuti`. |

---

## FASE 4: Analisi degli Agganci (Hooks) sul Frontend

La forza di questo "risanamento matematico" in backend è che si innesterà sul DOM attuale ignorando del tutto gli script di presentazione, senza rompere nessun pulsante, senza alterare nessun form.
Il Frontend non verrà toccato ma riceverà finally dei **dati reali** che processerà esattamente come già sa fare. Di seguito, the riprova che "tutto aderirà perfettamente":

1. **`dashboard.js` e Endpoint `/api/slots/:date` o `/api/slots/:date/:serviceId`**
   - *Com'è ora:* Quando si seleziona "Tagliando", `dashboard.js` chiama `GET /api/slots/:date/:serviceId`. Il backend farlocco risponde con falsi positivi a cavallo della pausa pranzo. Il Frontend li disegna (creando bug di UI e UX).
   - *Come sarà:* Il nuovo Validatore Backend risponderà a questa stessa e identica chiamata di rete con i **soli ed esclusivi** orari compatibili per quella lunghezza. Il JavaScript lato client disegnerà tranquillamente una lista di bottoni, non sapendo (e non dovendo sapere) l'immane logica protettiva che è appena avvenuta dal lato del server.

2. **`guest-booking.js` e Endpoint base `/api/slots/:date`** 
   - *Com'è ora:* Chiama senza ID servizio, si becca tutti gli slot liberi da 15 minuti poi esegue dei cicli for auto-scritti in `js` incastrando i bottoni assieme.
   - *Come sarà:* La nuova via Backend `computeAvailableSlots`, se chiamata senza inviare durata, darà per implicito che si cercano "Buchi singoli da almeno 15 min liberi". Restituirà la lista al povero script Guest, che continuerà spensieratamente a fare i suoi gruppetti tramite frontend ma questa volta appoggiandosi su calcoli di base certificati e non sfalsati.
   - *Nota finale sul parametro "numPersone" dal lato Front*: lo lasceremo scorrere fin dentro il file `server.js`, ma prima dell'insert al DB lo trasformeremo istantaneamente in durata matematica (`numPersone * 15min`), bypassando interamente i falsi cloni.

3. **`admin.js` e visualizzazione del "Calendario Master"**
   - *Com'è ora:* Il file `calendar.js` che fa parte della suite per Admin è un plugin sofisticato che era **già stato progettato** (forse da qualcun altro in passato) per processare i Single-Record tramite il calcolo degli ID. Troviamo nel suo codice la regola: `if (slotsCount > 1) cell.style.gridRow = span + slotsCount`. Tuttavia, essendogli passati finora array Multi-Record con 4 iterazioni della stessa macchina, nascondeva l'errore coprendolo con gli span e un filtro antispam.
   - *Come sarà:* Iniziando a passargli solo e soltanto i nostri nuovi appuntamenti Single-Record (Un record unico con `durata_minuti = 90`!), il Grid span CSS innescherà il suo reale potenziale, plottando a calendario una sola carta lunga 6 righe di colore, perfetta anche per il drag & drop senza più slot distrutti o orfani.

4. **Tracciato di Lavori Straordinari / Deposito**
   - L'anagrafica che aggancia "Id Prenotazione -> Deposit Table" resta univoca (ID = ID), scongiurando finalmente incroci sballati in caso l'amministratore sposti un Lavoro Speciale a un altro orario usando il Drag & Drop.

Punto D'Arrivo:
Mettendo in piedi questo Masterplan creiamo una fortezza Backend agnostica. Non importa quante "maschere" Frontend disegni. Possono arrivarti richieste da Guest, iscritti, dall'App Admin o in futuro da una App nativa Mobile... il "Guardiano del Tempo" in backend proteggerà ciecamente le macchine nel database da Overbooking e sovrapposizioni orarie fallaci usando operazioni logico-matematiche (Time Ranges).

---

### FASE 5: Analisi degli Agganci (Hooks) all'interno del Backend
Poiché l'obiettivo è modificare il core logico senza far crollare i servizi circostanti, è stata condotta una verifica sulle funzioni backend che invocano e dipendono dal sistema di prenotazioni.

**1. Interazione con il Database (`database.js`)**
*   **Stato attuale:** Il DB in memory SQLite-wrapper ha già subìto una migrazione e possiede i campi moderni (`durata_minuti`, `service_id`). Al momento la insert avviene brutalmente all'interno di un ciclo `forEach` in `createBooking`.
*   **Impatto refactoring:** La query di insert non dovrà subire alcuna modifica allo schema. Verrà semplicemente spento il loop. Verrà eseguita *una singola invocazione* a `bookingsDB.insert()`, passandole il payload contenente la reale `durata_minuti`.

**2. Sistema di Notifica Email (`emailService.js`)**
*   **Stato attuale:** `sendBookingConfirmation(booking)` legge `booking.giorno` e `booking.ora`. In caso di appuntamenti multi-record, in passato veniva passato l'oggetto clonato dal primo slot iterato.
*   **Impatto refactoring:** **Compatibilità 100%.** Il record singolo che passeremo in futuro conterrà l'orario di inizio (es. 09:00), che è l'unica cosa che interessa al cliente nell'email. Meno complessità nel passarlo, output invariato.

**3. Cancellazione ed Eliminazione (`cancelBooking` / `adminCancelBooking`)**
*   **Stato attuale (con Bug Orfani):** La funzione cancella lo slot controllando data e ora esatta (`bookingsDB.delete(b => b.giorno === giorno && b.ora === ora)`). Poiché in passato venivano creati 4 record sfalsati per 1h di prenotazione, cliccando l'appuntamento da admin per eliminarlo si eliminava solo il primo, lasciando 3 record "orfani".
*   **Impatto refactoring:** **Risoluzione Passiva del Bug Orfani.** Con il passaggio al Single-Record, una prenotazione di 1 ora sarà un'unica riga nel database avente orario "09:00" (e `durata_minuti: 60`). Quando l'admin chiamerà la funzione di cancel, essa troverà ed eliminerà questa singola riga maestra, purificando totalmente gli slot.

**4. Spostamento Prenotazione (`moveBooking`)**
*   **Stato attuale:** Recupera lo slot originale, lo cancella per orario, ne fa lo spread (`...booking`) e lo reinserisce con nuove coordinate di orario e giorno.
*   **Impatto refactoring:** **Compatibilità 100%.** Lo spread operator clonerà correttamente anche l'attributo `durata_minuti` e l'architettura Time Range lo tratterà immediatamente come un blocco solido nel suo nuovo giorno.

**Esito dell'Analisi Backend:** Le dipendenze interne (`emailService`, database mapper, funzioni di cancellazione e aggiornamento) si innescano *perfettamente* sulla base del Single-Record, poiché l'intricato problema multi-record era unicamente confinato nel parsing in fase di pre-inserimento. Nessun effetto domino è previsto. Siamo pronti ad operare sui cuori di calcolo in `bookingService.js`.