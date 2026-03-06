# LB Service - Sistema Gestionale

Sistema completo di gestione prenotazioni per barber shop.

## Installazione

1. Installa le dipendenze:
```bash
npm install
```

2. Copia `.env.example` in `.env` e configura le variabili:
```bash
copy .env.example .env
```

3. Avvia il server:
```bash
npm start
```

Per sviluppo con auto-reload:
```bash
npm run dev
```

## Accesso

Apri il browser su: `http://localhost:3000`

## Struttura Progetto

- `server/` - Backend Node.js/Express
- `frontend/` - Interfaccia utente HTML/CSS/JS
- `database/` - File CSV per utenti e prenotazioni
- `config/` - Configurazione applicazione

## Funzionalità

- Registrazione e autenticazione utenti
- Dashboard clienti personalizzata
- Calendario prenotazioni interattivo
- Selezione servizi (Capelli, Barba, Barba+Capelli)
- Sistema notifiche email
- Gestione slot orari disponibili
