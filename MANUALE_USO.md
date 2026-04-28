# Manuale d'Uso - LB Service

## Avvio Applicazione

1. Apri un terminale nella cartella del progetto
2. Esegui: `npm start`
3. Apri il browser su: http://localhost:3000

## Flusso Utente Completo

### 1. Registrazione Nuovo Cliente

**URL:** http://localhost:3000/register

**Campi richiesti:**
- Nome
- Cognome  
- Email (deve essere unica)
- Telefono
- Password (minimo 8 caratteri)
- Conferma Password

**Validazioni:**
- Tutti i campi sono obbligatori
- Email non deve essere già registrata
- Password deve corrispondere alla conferma

**Risultato:** Redirect alla pagina login con messaggio di conferma

---

### 2. Login Cliente

**URL:** http://localhost:3000/login

**Campi richiesti:**
- Email
- Password

**Risultato:** Accesso alla Dashboard personale

---

### 3. Dashboard Cliente

**URL:** http://localhost:3000/dashboard (richiede autenticazione)

**Elementi:**

#### Header
- Lato sinistro: "LB Service"
- Lato destro: Pulsante "Logout"

#### Messaggio Benvenuto
- "Bentornato, [Nome]"

#### Cronologia Servizi (se presente)
- Card cliccabili con servizi utilizzati in passato
- Mostra: Nome servizio, Numero utilizzi, Prezzo
- Click su card: preselezione servizio per prenotazione rapida

#### Calendario Prenotazioni
- Vista mensile con navigazione ← →
- **Giorni disponibili:** Martedì-Sabato (lun/dom disabilitati)
- **Giorni passati:** Disabilitati
- Click su giorno → mostra orari disponibili

---

### 4. Selezione Orario

**Quando:** Dopo aver cliccato su un giorno disponibile

**Orari disponibili:**
- **Mattina:** 08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00
- **Pomeriggio:** 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00

**Slot occupati:** Visualizzati in grigio (non cliccabili)

**Azione:** Click su orario disponibile → abilita pulsante "Conferma Giorno e Orario"

---

### 5. Selezione Servizio

**URL:** http://localhost:3000/services

**Visualizza:** Data e ora selezionate

**Servizi disponibili:**

| Servizio | Prezzo |
|----------|--------|
| Capelli | €20 |
| Barba | €15 |
| Barba + Capelli | €30 |

**Azione:** Click su card servizio → abilita pulsante "Conferma Prestazione"

---

### 6. Riepilogo Prenotazione

**URL:** http://localhost:3000/summary

**Visualizza:**

**Dettagli Prenotazione:**
- Data (formato: "martedì 2 dicembre 2025")
- Orario
- Servizio selezionato
- Prezzo

**Dati Cliente (read-only):**
- Nome completo
- Email
- Telefono

**Azione:** Click su "Completa Prenotazione"

---

### 7. Conferma e Email

**Cosa succede:**
1. Prenotazione salvata nel database
2. Email di conferma inviata (se configurata)
3. Alert di conferma
4. Redirect alla Dashboard

**Contenuto Email:**

```
Oggetto: Prenotazione Confermata - LB Service

Caro [Nome],

La tua prenotazione è confermata.

Data: [data completa]
Orario: [orario]
Servizio: [servizio]
Prezzo: €[prezzo]

Contatti:
Telefono: [telefono studio]
Indirizzo: [indirizzo studio]

A presto,
Team LB Service
```

---

## Gestione Slot

### Prenotazione Esistente
- Uno slot prenotato è **automaticamente disabilitato** per tutti gli altri utenti
- Visualizzato in grigio nel calendario

### Transazioni Atomiche
- Il sistema verifica la disponibilità al momento della conferma finale
- Previene overbooking anche con accessi simultanei

---

## Sicurezza

### Password
- Hash BCrypt (non salvate in plain text)
- Minimo 8 caratteri richiesti

### Autenticazione
- JWT Token con cookie HTTP-only
- Durata sessione: 7 giorni
- Validazione su ogni richiesta protetta

### Rate Limiting
- Login/Registrazione: 5 richieste ogni 15 minuti
- API generali: 100 richieste ogni 15 minuti

---

## Logout

**Pulsante:** Header Dashboard (angolo destro)

**Azione:**
- Distrugge sessione
- Cancella cookie token
- Redirect alla Landing Page

---

## Database

### File CSV

**users.csv:**
- id, nome, cognome, email, telefono, password (hashata), created_at

**bookings.csv:**
- id, cliente_id, nome, email, telefono, data, orario, servizio, prezzo, status, created_at

**Posizione:** `database/` nella root del progetto

---

## Troubleshooting

### Email non funzionano
- Verifica configurazione in `.env`
- Consulta `EMAIL_CONFIG.md`
- L'app funziona comunque senza email

### Slot non si aggiornano
- Ricarica la pagina
- Verifica connessione server

### Errore "Credenziali non valide"
- Controlla email e password
- Email salvate in lowercase

### Errore "Email già registrata"
- Usa un'altra email
- O effettua login se sei già registrato

---

## Comandi Utili

```bash
# Avvia server
npm start

# Avvia con auto-reload (sviluppo)
npm run dev

# Installa dipendenze
npm install
```

---

## Contatti Supporto

Per problemi tecnici o richieste, contatta l'amministratore del sistema.
