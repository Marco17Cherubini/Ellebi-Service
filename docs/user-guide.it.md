# Guida d'uso — Ellebi Service

Guida alle funzioni presenti nell'applicazione. Sostituisce il vecchio `MANUALE_USO.md`, che descriveva ancora il gestionale del barbiere.

Avvio in locale: vedi la sezione _Getting started_ del [README](../README.md). Per provare l'app con dati di esempio: `npm run seed` su un database nuovo, poi `npm start` e apri `http://localhost:3000`.

## Orari e regole del calendario

- Lunedì–venerdì 08:30–12:30 e 14:30–18:30; sabato 08:30–12:00; domenica chiuso (modificabili in `config/config.js`).
- Il calendario lavora a blocchi di 15 minuti. Ogni servizio ha una durata (dal listino): un orario viene proposto solo se l'intero servizio sta dentro la mattina o il pomeriggio e non si sovrappone ad altri appuntamenti, a lavori pianificati o a ferie.
- I servizi di **consegna veicolo** (es. Distribuzione, Lavoro straordinario, Revisione sospensioni) prenotano 30 minuti di accoglienza e aprono una scheda in _Lavori Straordinari_.
- I clienti **VIP** e l'amministratore vedono anche gli orari estesi (08:00 e serali).

## Clienti

### Registrazione e accesso

- **Registrati** (`/register`): nome, cognome, email, telefono, password di almeno 8 caratteri.
- **Accedi** (`/login`); la sessione dura 7 giorni.
- **Password dimenticata** (`/reset-password`): arriva un'email con un link valido un'ora (serve la configurazione email).

### Prenotare (`/dashboard`)

1. **Veicolo**: auto o moto.
2. **Servizio**: dall'elenco del listino (i servizi stagionali compaiono solo nel loro periodo).
3. **Data e orario**: sono selezionabili solo i giorni aperti e gli orari in cui il servizio ci sta per intero.
4. **Riepilogo**: targa, modello e note facoltative, poi conferma. Se l'email è configurata arriva una conferma.

Tutti i passaggi funzionano anche da tastiera (Tab per spostarsi, Invio o Spazio per scegliere).

### Gestire le prenotazioni (`/bookings`)

- **Modifica**: riapre il calendario; confermando il nuovo orario la vecchia prenotazione viene sostituita. Se il nuovo orario non è valido, la prenotazione originale resta.
- **Cancella**: chiede conferma. Cancellare una consegna veicolo elimina anche la scheda di lavoro collegata.

### Prenotazione senza account (`/guest-booking`)

Stessi passaggi, poi nome, cognome, email, telefono, targa e modello, con il consenso privacy. Non serve password.

## Amministratore

Il menu ☰ porta alle sezioni dell'area admin; si chiude con ×, cliccando fuori o con Esc.

### Calendario appuntamenti (`/admin`)

- Vista settimanale lun–sab, con le frecce per cambiare settimana. Colori: giallo prenotazione, viola consegna/deposito, rosso ore di lavoro pianificate, azzurro ferie.
- **Nuova prenotazione**: clic su una cella libera, poi cognome (con suggerimenti dai clienti esistenti), contatti, servizio, targa e modello. La durata viene dal servizio.
- **Dettaglio**: clic su una prenotazione (Esc o Chiudi per uscire); da qui si può cancellare.
- **Spostare**: trascina la prenotazione su un altro orario (su mobile tieni premuto). Lo spostamento viene rifiutato se la nuova fascia si sovrappone ad altro.
- **Ferie**: attiva la modalità ferie, seleziona trascinando le celle da chiudere (o riaprire), poi salva.

### Lavori Straordinari (`/admin/depositi`)

- Una scheda per ogni veicolo lasciato in officina, con dati del cliente, note del cliente, note interne e ore residue stimate.
- **Pianifica a calendario**: inserisci le ore stimate, poi seleziona sul calendario i blocchi da 15 minuti in cui lavorarci e salva. Il deposito passa _in corso_.
- **Stati**: _In corso_, _Attesa_ (libera i blocchi pianificati), _Finito_ (chiude il lavoro, libera i blocchi e, se l'email è configurata, avvisa il cliente che il veicolo è pronto).
- **Depositi attivi / limite**: quando il numero di veicoli in officina raggiunge il limite, nuove consegne vengono rifiutate. Il limite si cambia qui e si salva.
- In fondo, lo storico dei lavori completati.

### Gestione Clienti (`/admin/clienti`)

- Elenco di clienti registrati e ospiti, con ricerca.
- **VIP** e **BAN** si spuntano accanto al cliente e si confermano con la barra in basso. Un cliente sospeso non può accedere e perde la sessione attiva.
- **Veicoli**: per i veicoli salvati sull'account mostra le prenotazioni per targa e lo storico.

### Listino Servizi (`/admin/listino`)

Nuovo servizio, modifica ed eliminazione: nome, auto/moto, tipo (appuntamento o consegna), durata, prezzo interno (visibile solo all'admin), campi richiesti, attivo, stagionale con data di inizio e fine (MM-GG).

### Resoconto Clientela (`/admin/reports`)

Grafico degli appuntamenti per giorno negli ultimi 7 o 30 giorni, con totale, media giornaliera e giorno migliore. I blocchi di lavoro sui depositi non sono contati come appuntamenti.

## Dati e privacy

- In produzione, ogni 24 ore la retention cancella i dati scaduti (prenotazioni e profili ospite dopo 12 mesi, prenotazioni dei registrati, depositi e account inattivi dopo 24 mesi), come descritto nella privacy policy (`/privacy-policy.html`).
- `npm run backup` copia il database nella cartella dei backup e conserva gli ultimi quattro.
