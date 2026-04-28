# Contesto Iniziale e Analisi

## Contesto Iniziale (PreToolUse Grep/Read Analysis)
Allo stato attuale, il sistema presenta alcune incongruenze tra le istruzioni fornite e il codice sorgente in essere:
1. **Caselle Deposito ("Prenotazione")**: I Depositi mostrano "Prenotazione" nelle caselle viola (Accoglienza) perché la funzione `getAllBookings` nel backend (`server.js`) preserva il nome generico "Prenotazione", salvato originariamente nel database al momento del deposito. Non vengono propagati verso la UI né la `nota_lorenzo` (che racchiude "la tipologia di Lavoro, es. Distribuzione") né le relative `ore_stimate` a meno che non si parli di un evento puramente `extra_work`.
2. **Placeholder "h" ai Lavori Straordinari**: Il file `frontend/js/admin-depositi.js` genera esplicitamente il DOM passando `value="..."` per le ore. Quando tali ore sono "0", l'evaluazione di alcune variabili stringa/float impedisce all'attributo `placeholder="h"` di attivarsi correttamente (poiché viene settata una stringa testuale o l'input stesso intercetta lo 0 come valore esistente).
3. **Dropdown e Calendario**: La visualizzazione a griglia (CSS Grid) in `frontend/js/admin.js` impiega array hardcoded che partono nativamente dalle 08:30 (sia in frontend che in `config.js` backend). La granularità attualmente inserita non raggruppa le righe fisiche della griglia CSS allungando visivamente i componenti in maniera asimmetrica; semplicemente modifica l'etichetta delle ore mostrandone una ogni ora/mezz'ora. Le proporzioni saltano completamente.

---

## Tasks da Modifica
**Task 1 (Lavori nella casella Deposito)**: 
*Modifica*: Esporre la `nota_lorenzo` come `nota_interna` fornita lato API; Modificare il layout della funzione condivisa `renderBookingItem` (in `admin.js` e `calendar.js`) in modo che se il booking è di tipo "Consegna/Deposito", il testo scambi "Prenotazione" in favore della "Tipologia lavoro straordinario" accompagnato dalle "Ore" e mantenendo coerente l'interfaccia. 

**Task 2 (Revisione Placeholder 'h')**:
*Modifica*: Assicurarsi che nel form in `admin-depositi.js` l'input per le ore non carichi in nessun caso `"0"` come stringa visibile. Valori prossimi o equivalenti a 0 devono essere convertiti in blocco come stringa vuota `""` per rivelare sempre e nativamente il template placeholder.

**Task 3 (Revisione del Calendario e Formato Orario)**: 
*Modifica*: 
- Correggere gli orari di apertura, portandoli di base ad iniziare dalle 08:00 e non 08:30 (modifica a costanti JS nel backend `config.js` e file frontend `admin.js/calendar.js`).
- Riposizionare chirurgicamente il Dropdown per appoggiarsi alla destra del Menù ad hamburger del cruscotto admin.
- Riscrivere in "Planning Mode" il meccanismo di espansione CSS Grid in `renderCalendar()`: anziché tracciare fisso a blocchi di 15 minuti che distorcono gli eventi, la griglia dovrà sezionare dinamicamente i suoi intervalli a seconda dei minuti richiesti (15, 30, 60, 120), raggruppando `grid-template-rows` o ricalcolando la generazione degli slot e calcolando lo span dell'evento rispettando la nuova proporzione visiva selezionata dall'utente.

---

## Output dell'Incrocio Contesto-Task (Categorizzazione difficoltà)
- **Task 1** -> Medio: Esige modifiche lato export del Server e fix chirurgici nelle rendering function del Frontend in Admin e per i Guest (solo views).
- **Task 2** -> Facile: Manipolazione rapida della sanitizzazione per l'invio al DOM (`val = parseFloat(...) || ''`).
- **Task 3** -> Critico: La revisione profonda delle griglie a calendario richiede Ultrathink. Gli appuntamenti multi-slot dovranno basarsi interamente sulla "Scala temporale visibile" a prescindere dal database logico in uso. In aggiunta, bisogna propagare l'apertura dalle ore 08:00 ovunque (superando le 100 righe, si modificherà ove necessario e in linea col refactoring). Il layout e lo stile delle schede devono essere preservati linearmente.

*(In attesa di approvazione testuale per procedere secondo le rigide regole richieste).*