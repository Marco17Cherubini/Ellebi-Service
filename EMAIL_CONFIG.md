# Guida Configurazione Email

Il sistema di notifiche email è già integrato ma richiede configurazione SMTP.

## Configurazione Gmail (Consigliato)

### 1. Attiva l'autenticazione a 2 fattori

Vai su: https://myaccount.google.com/security

### 2. Crea una App Password

1. Vai su: https://myaccount.google.com/apppasswords
2. Seleziona "App: Mail" e "Dispositivo: Windows Computer"
3. Clicca "Genera"
4. Copia la password generata (16 caratteri)

### 3. Modifica il file .env

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tua-email@gmail.com
EMAIL_PASSWORD=la_password_app_generata
EMAIL_FROM=LB Service <noreply@brumastudio.com>
```

### 4. Riavvia il server

```bash
npm start
```

## Configurazione Outlook/Hotmail

```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USER=tua-email@outlook.com
EMAIL_PASSWORD=tua_password
EMAIL_FROM=LB Service <noreply@outlook.com>
```

## Configurazione Custom SMTP

Puoi usare qualsiasi servizio SMTP (SendGrid, Mailgun, etc.):

```env
EMAIL_HOST=smtp.tuodominio.com
EMAIL_PORT=587
EMAIL_USER=username
EMAIL_PASSWORD=password
EMAIL_FROM=LB Service <noreply@tuodominio.com>
```

## Test Email

Dopo aver configurato, completa una prenotazione per testare l'invio email.

## Note

- Le email sono inviate automaticamente dopo il completamento di ogni prenotazione
- Se l'email non è configurata, il sistema funziona ugualmente (senza notifiche)
- I log del server mostrano eventuali errori di invio email
