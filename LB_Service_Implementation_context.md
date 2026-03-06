# LB Service — Documento di Contesto Completo

> Gestionale per officina meccanica di Lorenzo (Ellebi Service SRL)  
> Via Zerbi 21, San Giuliano Vecchio, Alessandria  
> Tel: +39 366 304 3908

---

## Stack Tecnico

- **Backend:** Node.js / Express
- **Database:** SQLite WASM (sql.js) — in-memory + persist su disco
- **Frontend:** Vanilla HTML / CSS / JS (no framework, no build step)
- **Template base:** Lev Space (adattato)
- **Email:** Resend API
- **WhatsApp:** WhatsApp Business API (Twilio o Meta) — fase 2, dopo email
- **Auth:** JWT HTTP-only cookie, 7 giorni
- **Deploy:** Railway con PM2

---

## Orari di Apertura

| Giorno | Mattina | Pomeriggio |
|--------|---------|------------|
| Lun–Ven | 8:30–12:30 | 14:30–18:30 |
| Sabato | 8:30–12:00 | — |
| Domenica | Chiuso | — |

---

## Logica Capacità

**1 meccanico virtuale.** Gli altri dipendenti sono apprendisti — il sistema gestisce la schedule di Lorenzo soltanto.

Uno slot è **libero** o **occupato**. Punto. Nessuna logica di risorse parallele.

Tre entità possono occupare uno slot:

| Tipo | Colore UI | Chi lo crea |
|------|-----------|-------------|
| Prenotazione cliente | 🟡 Giallo/arancio (esistente) | Cliente dal frontend pubblico |
| Ferie / chiusura | 🔵 Azzurro (esistente) | Lorenzo da admin |
| Lavoro straordinario (deposito) | 🟣 `#C800FF` fill / `#A200FF` bordo | Lorenzo da admin |

### Granularità Slot

- **Unità base: 15 minuti** — puro backend, invisibile in UI
- Ogni servizio ha una durata in minuti (multiplo di 15) convertita internamente in unità
- **Il calendario admin mostra righe da 1 ora** — Lorenzo vede blocchi da 1h, 1.5h, 2h ecc., mai da 15min
- I 15 minuti sono solo il denominatore comune per i calcoli: un blocco da 1.5h occupa 6 unità internamente, ma in UI occupa 1.5 righe

---

## Servizi — Catalogo Completo

### Auto

| Servizio | Durata | Tipo | Campi obbligatori |
|----------|--------|------|-------------------|
| Taglio olio + filtro | 1h (4×15min) | Appuntamento | Targa, Modello |
| Tagliando completo | 2h (8×15min) | Appuntamento | Targa, Modello |
| Freni | 1h 30min (6×15min) | Appuntamento | Targa, Modello |
| Distribuzione | — | **Consegna veicolo** | Targa, Modello |
| Lavoro straordinario | — | **Consegna veicolo** | Targa, Modello, Note cliente |
| Cambio gomme stagionale *(15 nov–15 apr)* | 45min (3×15min) | Appuntamento | Targa, Modello |
| Vendita gomme | 45min (3×15min) | Appuntamento | Targa, Modello, Misura, Indice velocità |

### Moto

| Servizio | Durata | Tipo | Campi obbligatori |
|----------|--------|------|-------------------|
| Tagliando completo | 2h (8×15min) | Appuntamento | Targa, Modello |
| Cambio gomme | 1h (4×15min) | Appuntamento | Targa, Modello, Misura |
| Revisione sospensioni | — | **Consegna veicolo** | Targa, Modello |

### Consegna Veicolo — Logica Speciale

Ogni servizio di tipo "consegna veicolo" genera automaticamente:
1. Un **appuntamento di 30min (2×15min)** nel calendario pubblico — etichettato "Consegna veicolo" — per permettere a Lorenzo di ricevere le chiavi e ascoltare il cliente
2. Una **richiesta in coda depositi** nella sezione admin "Lavori Straordinari"

**Limite depositi attivi contemporaneamente: 5** *(provvisorio — aggiornare quando Lorenzo conferma)*

Se il limite è raggiunto, il frontend mostra un messaggio al cliente e non accetta nuove richieste di consegna.

---

## Flusso Prenotazione Cliente

```
Step 1 → Tipo veicolo: Auto / Moto
Step 2 → Seleziona servizio dalla lista (filtrata per tipo veicolo)
         + Compila campi dinamici (targa, modello, misura gomme, ecc.)
Step 3 → Calendario — solo slot liberi visibili
Step 4 → Dati personali + Conferma
```

I servizi "consegna veicolo" saltano il calendario → creano appuntamento 30min + entrano in coda depositi admin.

---

## Vista Admin — Calendario Settimanale

- **Layout:** colonne Lun–Sab, righe orarie
- **Contenuto:** prenotazioni clienti + lavori straordinari + ferie — tutto sovrapposto nella stessa vista
- **Drag & drop:** Lorenzo trascina blocchi viola sugli slot liberi per assegnare ore ai lavori straordinari fino ad esaurire il budget ore stimato
- **Contatore depositi attivi** sempre visibile in evidenza (es. "3/5 depositi attivi")

---

## Sezione "Lavori Straordinari" (Menu Admin)

Voce aggiuntiva nel menu hamburger admin, accanto a Gestione Clienti ecc.

### Layout Card

Ogni deposito attivo mostra una card con:
- **Nome / Cognome** cliente
- **Modello / Targa** veicolo
- **Note cliente** (inserite al momento della richiesta)
- **Nota di Lorenzo** — campo libero per annotare causa del problema, diagnosi, schedule lavoro
- **Ore residue** — campo manuale aggiornato da Lorenzo con le ore rimanenti alla conclusione
- **Pulsante stato** (vedi sotto)

### Stati del Lavoro

| Stato | Cosa vede Lorenzo | Azione disponibile |
|-------|-------------------|--------------------|
| In attesa | Card in coda, nessun blocco calendario | Assegna ore sul calendario settimanale |
| In corso | Ore residue visibili | Aggiorna ore residue |
| **Terminato** | — | Sistema invia automaticamente email + WhatsApp al cliente per ritiro veicolo |
| Standby | Card in pausa | Slot rimangono **bloccati** nel calendario; Lorenzo può riattivare o liberare manualmente |

### Flusso "Terminato"

Quando Lorenzo marca il lavoro come **terminato**:
→ Email automatica via Resend al cliente  
→ WhatsApp automatico via Business API al cliente  
*(Messaggio: invito a passare a ritirare il veicolo)*

Nessun banner di conferma — l'invio è diretto.

### Flusso "Annulla / Standby"

Se il lavoro non è ancora terminato:
- Lorenzo può **reinserire le ore mancanti** → il sistema ricalcola e aggiorna le ore residue
- Oppure mette il lavoro in **standby** → lavoro sospeso, slot rimangono bloccati nel calendario

---

## Listino Prezzi

- Visibile **solo lato admin** — non esposto via API pubblica
- CRUD dalla dashboard admin
- Utile a Lorenzo e alla segretaria per preventivi veloci
- Tabella `services` nel DB: `nome`, `durata_minuti`, `prezzo_interno`, `attivo`

---

## Storico Cliente e Veicoli

- Utente registrato → dati veicolo salvati nella tabella `vehicles`
- Alla prenotazione successiva → dropdown con veicoli già registrati
- Lorenzo dalla dashboard → storico completo per cliente / targa

---

## Notifiche Proattive

- Tagliando → sistema registra `next_service_due` (data + X mesi configurabile)
- Cambio gomme stagionale → flag "notifica a novembre / aprile"
- Cron job giornaliero controlla scadenze e manda email ai clienti
- Lorenzo può gestire manualmente le notifiche dalla dashboard

---

## Schema Database

```sql
users (
  id, nome, cognome, email, telefono,
  password, vip, banned, isGuest, created_at
)

vehicles (
  id, user_id, targa, modello, anno
)

services (
  id, nome, tipo_veicolo, durata_minuti,
  prezzo_interno, attivo
)

bookings (
  id, user_id, vehicle_id, service_id,
  targa, modello, giorno, ora,
  tipo,         -- 'cliente' | 'deposito' | 'ferie'
  stato,        -- 'confermato' | 'completato' | 'annullato'
  note_cliente,
  nota_interna, -- campo Lorenzo
  token,
  created_at
)

deposits (
  id, booking_id,
  ore_stimate, ore_residue,
  stato,        -- 'in_attesa' | 'in_corso' | 'completato' | 'standby'
  note_cliente, nota_lorenzo,
  created_at
)

admins (
  id, email, password
)

holidays (
  id, giorno, ora
)

notifications (
  id, user_id, booking_id,
  tipo, data_prevista, inviata
)
```

---

## Ruoli Utente

| Ruolo | Accesso |
|-------|---------|
| **Admin** | Dashboard completa — calendario, depositi, clienti, listino, notifiche |
| **VIP** | Slot extra (ereditato dal template — da valutare se mantenere) |
| **Guest** | Prenotazione senza account — dati salvati come utente guest |
| **Registrato** | Prenotazione con storico veicoli e notifiche proattive |

---

## Roadmap Sviluppo

1. `config.js` — slot reali Ellebi + moltiplicatori servizi
2. `database.js` — nuovo schema (vehicles, services, deposits, notifications)
3. Flusso prenotazione cliente — step veicolo → servizio → calendario → conferma
4. Vista admin settimanale — drag & drop blocchi viola per depositi
5. Sezione "Lavori Straordinari" — card + stati + invio automatico
6. Listino prezzi admin
7. Storico cliente / veicoli
8. Notifiche proattive (cron job)
9. WhatsApp Business API *(fase 2)*

---

## Note Aperte

- **Limite depositi:** 5 provvisorio — aggiornare quando Lorenzo conferma
- **WhatsApp:** da integrare in fase 2, non blocca il core
- **Slot VIP:** valutare se ha senso mantenerlo per Ellebi o rimuoverlo
- **Granularità UI calendario admin:** righe da 1h — confermato
