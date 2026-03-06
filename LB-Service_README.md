# 🚀 LB Service - Sistema Gestionale Completo

Un gestionale completo per la gestione di prenotazioni, clienti e abbonamenti, costruito con **Node.js**, **Express** e **SQLite**.

---

## 📁 Struttura del Progetto

```
LB Service/
├── 📁 config/                 # Configurazione applicazione
│   └── config.js              # Impostazioni server, JWT, orari, email
├── 📁 database/               # Storage persistente
│   └── database.sqlite        # Database SQLite
├── 📁 frontend/               # Interfaccia utente
│   ├── 📁 images/             # Asset grafici
│   ├── 📁 js/                 # Logica JavaScript
│   │   ├── 📁 components/     # Componenti riutilizzabili
│   │   ├── admin.js           # Pannello amministrazione
│   │   ├── dashboard.js       # Dashboard utente
│   │   ├── guest-booking.js   # Prenotazione rapida ospiti
│   │   ├── subscription-booking.js # Gestione abbonamenti
│   │   ├── theme.js           # Switch tema light/dark
│   │   └── utils.js           # Utility condivise
│   ├── 📁 styles/             # Fogli di stile modulari
│   │   ├── 📁 base/           # Reset e base CSS
│   │   ├── 📁 components/     # Stili componenti
│   │   ├── 📁 layout/         # Layout e grid
│   │   ├── 📁 pages/          # Stili pagine specifiche
│   │   └── 📁 tokens/         # Design tokens (colori, font)
│   └── *.html                 # Pagine HTML
├── 📁 server/                 # Backend Express
│   ├── authService.js         # Autenticazione (JWT, bcrypt)
│   ├── bookingService.js      # Logica prenotazioni
│   ├── database.js            # Wrapper SQLite
│   ├── emailService.js        # Invio email (Resend)
│   ├── middleware.js          # Middleware autenticazione
│   └── server.js              # Entry point Express
├── 📁 Logo/                   # Asset logo
├── .env                       # Variabili ambiente (non committare)
├── .env.example               # Template variabili ambiente
├── ecosystem.config.js        # Configurazione PM2 per produzione
└── package.json               # Dipendenze e script NPM
```

---

## ⚙️ Stack Tecnologico

| Layer | Tecnologia | Descrizione |
|-------|------------|-------------|
| **Backend** | Express.js 4.18 | Framework HTTP/REST |
| **Database** | SQLite (sql.js) | Database embedded, zero-config |
| **Autenticazione** | JWT + bcrypt | Token stateless + hash password |
| **Email** | Resend / Nodemailer | Conferme prenotazioni e reset password |
| **Sicurezza** | Helmet | Headers HTTP security |
| **Frontend** | HTML5, CSS3, Vanilla JS | No framework, modulare |
| **Produzione** | PM2 | Process manager Node.js |

---

## 🗄️ Architettura Database

### Tabelle Principali

```sql
-- Utenti registrati
users (
  id INTEGER PRIMARY KEY,
  nome TEXT, cognome TEXT, email TEXT UNIQUE,
  telefono TEXT, password TEXT,
  vip INTEGER DEFAULT 0,       -- Status VIP
  banned INTEGER DEFAULT 0,    -- Utente bannato
  isGuest INTEGER DEFAULT 0    -- Guest checkout
)

-- Prenotazioni
bookings (
  id INTEGER PRIMARY KEY,
  nome TEXT, cognome TEXT, email TEXT, telefono TEXT,
  giorno TEXT,                 -- Data (YYYY-MM-DD)
  ora TEXT,                    -- Orario (HH:MM)
  token TEXT                   -- Token gestione prenotazione
)

-- Amministratori
admins (id, email TEXT UNIQUE, password TEXT)

-- Ferie/Chiusure
holidays (giorno TEXT, ora TEXT, UNIQUE(giorno, ora))
```

---

## 🔐 Sistema di Autenticazione

- **Registrazione**: Campi obbligatori (nome, cognome, email, telefono, password 8+ caratteri)
- **Login**: JWT token salvato in cookie HTTP-only (7 giorni validità)
- **Admin**: Account separato, credenziali in `.env`
- **Reset Password**: Token JWT monouso con scadenza 1 ora
- **Protezione**: Utenti bannati non possono accedere

---

## 📅 Sistema Prenotazioni

### Orari Configurabili

| Giorno | Mattina | Pomeriggio |
|--------|---------|------------|
| Mar-Ven | 08:30 - 13:00 | 14:00 - 18:00 |
| Sabato | 08:30 - 13:00 | 14:00 - 15:30 |

### Funzionalità

- ✅ **Slot 45 minuti** - Durata standard configurabile
- ✅ **Prenotazioni gruppo** - Fino a 3 persone (slot consecutivi)
- ✅ **Guest Checkout** - Prenota senza registrazione completa
- ✅ **Orari VIP** - Slot extra mattutini/serali per clienti VIP
- ✅ **Ferie/Chiusure** - Blocco slot specifici da admin
- ✅ **Smart Rescheduling** - Modifica via token email (24h prima)

---

## 👤 Sistema VIP

Gli utenti **VIP** (impostati da admin) hanno accesso a:

- **Pre-apertura**: Slot 08:00 (tutti i giorni)
- **Straordinari feriali**: 18:00 - 23:15
- **Straordinari sabato**: 15:30 - 23:00

---

## 🛠️ API REST

### Autenticazione

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Registrazione utente |
| `POST` | `/api/auth/login` | Login (ritorna JWT) |
| `POST` | `/api/auth/logout` | Logout (clear cookie) |
| `GET` | `/api/auth/me` | Utente corrente |
| `POST` | `/api/auth/forgot-password` | Richiedi reset password |
| `POST` | `/api/auth/reset-password` | Reset con token |

### Prenotazioni

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| `GET` | `/api/slots/:date` | Slot disponibili |
| `POST` | `/api/bookings` | Crea prenotazione |
| `GET` | `/api/bookings` | Le mie prenotazioni |
| `DELETE` | `/api/bookings` | Cancella prenotazione |
| `POST` | `/api/bookings/guest` | Prenotazione ospite |

### Admin

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| `GET` | `/api/admin/bookings` | Tutte le prenotazioni |
| `POST` | `/api/admin/bookings` | Crea da admin |
| `DELETE` | `/api/admin/bookings` | Elimina da admin |
| `PUT` | `/api/admin/bookings` | Sposta prenotazione |
| `GET` | `/api/admin/users` | Tutti gli utenti |
| `PUT` | `/api/admin/users/:email/vip` | Toggle VIP |
| `PUT` | `/api/admin/users/:email/banned` | Toggle ban |
| `GET/POST/DELETE` | `/api/admin/holidays` | Gestione ferie |
| `GET` | `/api/admin/reports/bookings-stats` | Statistiche |

---

## 🌐 Pagine Frontend

| Pagina | Descrizione |
|--------|-------------|
| `index.html` | Landing page |
| `login.html` | Form login |
| `register.html` | Form registrazione |
| `dashboard.html` | Calendario prenotazioni |
| `bookings.html` | Le mie prenotazioni |
| `services.html` | Selezione servizi |
| `summary.html` | Riepilogo prenotazione |
| `subscriptions.html` | Abbonamenti disponibili |
| `subscription-booking.html` | Prenota con abbonamento |
| `guest-booking.html` | Prenotazione rapida |
| `admin.html` | Pannello admin principale |
| `admin-clienti.html` | Gestione clienti |
| `admin-vip.html` | Gestione VIP |
| `admin-banned.html` | Utenti bannati |
| `admin-reports.html` | Report e statistiche |

---

## 🚀 Installazione e Avvio

### Prerequisiti

- Node.js 18+
- NPM 9+

### Setup

```bash
# 1. Installa dipendenze
npm install

# 2. Configura ambiente
cp .env.example .env
# Modifica .env con i tuoi valori (JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD)

# 3. Avvia in sviluppo
npm run dev

# Il server sarà su http://localhost:3000
```

### Produzione (PM2)

```bash
# Avvia con PM2
npm run start:prod

# Comandi utili
npm run stop      # Ferma il server
npm run restart   # Riavvia
npm run logs      # Visualizza log
npm run status    # Stato processi
```

---

## 🔧 Configurazione (.env)

```env
# Server
PORT=3000
NODE_ENV=production

# Sicurezza (OBBLIGATORIO - genera con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=stringa_casuale_64_caratteri

# Admin
ADMIN_EMAIL=admin@lbservice.it
ADMIN_PASSWORD=password_sicura

# Email (Opzionale - per conferme email)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=LB Service <noreply@lbservice.it>

# Info Studio
STUDIO_NAME=LB Service
STUDIO_PHONE=+39 123 456 7890
STUDIO_ADDRESS=Via Example 123, Roma
```

---

## 📧 Sistema Email

Il sistema supporta due provider:

1. **Resend** (raccomandato) - API key in `.env`
2. **SMTP** (Gmail, etc.) - Configurazione classica

Le email inviate includono:
- ✉️ **Conferma prenotazione** con dettagli appuntamento
- ✉️ **Link gestione** per modificare/cancellare (24h prima)
- ✉️ **Reset password** con link monouso

---

## 🎨 Tema Light/Dark

Il frontend include un sistema di switch tema salvato in `localStorage`:

- Toggle automatico basato su preferenze sistema
- Persistenza tra sessioni
- CSS variables per facile customizzazione

---

## 📜 Script NPM

| Script | Comando | Descrizione |
|--------|---------|-------------|
| `start` | `node server/server.js` | Avvio diretto |
| `dev` | `nodemon server/server.js` | Sviluppo (hot reload) |
| `start:prod` | `pm2 start ecosystem.config.js` | Produzione PM2 |
| `stop` | `pm2 stop lb-service` | Ferma PM2 |
| `restart` | `pm2 restart lb-service` | Riavvia PM2 |
| `logs` | `pm2 logs lb-service` | Log PM2 |
| `backup` | `node server/backup.js` | Backup database |
| `lint` | `eslint .` | Controllo codice |
| `format` | `prettier --write .` | Formattazione codice |

---

## 📦 Dipendenze Principali

| Pacchetto | Versione | Scopo |
|-----------|----------|-------|
| express | ^4.18.2 | Framework web |
| sql.js | ^1.13.0 | Database SQLite in-memory |
| bcryptjs | ^2.4.3 | Hash password |
| jsonwebtoken | ^9.0.2 | Token JWT |
| helmet | ^7.1.0 | Security headers |
| resend | ^6.6.0 | Email API |
| nodemailer | ^6.9.7 | SMTP email |
| dotenv | ^16.3.1 | Variabili ambiente |
| cookie-parser | ^1.4.6 | Parsing cookies |

### Dev Dependencies

| Pacchetto | Scopo |
|-----------|-------|
| nodemon | Hot reload sviluppo |
| eslint | Linting codice |
| prettier | Formattazione codice |

---

## 🔒 Sicurezza

- ✅ **JWT HTTP-only cookies** - Token non accessibili da JavaScript
- ✅ **Password hash bcrypt** - Salted con 10 rounds
- ✅ **Helmet headers** - Protezione XSS, clickjacking, etc.
- ✅ **Validazione input** - Controlli lato server
- ✅ **Anti-enumerazione** - Risposte generiche su forgot-password

---

## 📄 Licenza

MIT License - Vedi [LICENSE](./LICENSE) per dettagli.

---

## 👥 Autore

**LB Service**

---

> 📝 *Documentazione generata automaticamente - Ultimo aggiornamento: Febbraio 2026*
