# Piano Implementazione Fix Sicurezza — LB Service

> Generato: 7 aprile 2026  
> Riferimento: Audit completo del booking system  
> Obiettivo: Production-ready per 300+ clienti officina

---

## Ordine di esecuzione

I fix sono ordinati per **dipendenza logica**, non solo per priorità.  
Si parte dai cambiamenti a rischio zero (1 riga, nessun side-effect) e si sale.

---

## FIX 1 — Body size limit su `express.json()`

**File:** `server/server.js` riga 46  
**Rischio attuale:** Un attaccante invia un payload JSON da 100MB e blocca il processo Node.  
**Modifica:**

```diff
- app.use(express.json());
+ app.use(express.json({ limit: '16kb' }));
```

**Side-effect:** Nessuno. I payload legittimi del sistema (booking, login, depositi) sono tutti sotto 2KB.  
**Test:** Provare un `POST /api/bookings/guest` con body > 16KB → deve restituire `413 Payload Too Large`.

---

## FIX 2 — Attributo `sameSite` sul cookie JWT

**File:** `server/server.js` righe 83-87  
**Rischio attuale:** Senza `sameSite`, il cookie JWT potrebbe essere inviato in richieste cross-origin (CSRF).  
**Modifica:**

```diff
  res.cookie('token', token, {
    httpOnly: true,
    secure: config.server.env === 'production',
+   sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
```

**Nota:** Si usa `lax` e non `strict` perché `strict` bloccherebbe il cookie anche navigando verso il sito da un link esterno (es. email di conferma), forzando un re-login. `lax` protegge da CSRF su POST ma permette la navigazione GET.  
**Side-effect:** Nessuno con reverse proxy standard. Se l'app è su un sottodominio diverso dal frontend, `lax` potrebbe creare problemi → in quel caso usare `none` + `secure: true`.  
**Test:** Login → verificare che il cookie abbia `SameSite=Lax` nei DevTools → verificare che le prenotazioni funzionino normalmente.

---

## FIX 3 — Rate limiter su guest checkout e reset-password

**File:** `server/server.js`  
**Rischio attuale:** Nessun limite su creazione prenotazioni guest e tentativi di reset password.  
**Modifica:**

Dopo la definizione di `authLimiter` (riga ~60), aggiungere un secondo limiter:

```js
const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Troppi tentativi. Riprova tra 15 minuti.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: function (req) {
    return req.headers['x-forwarded-for'] || req.ip;
  }
});
```

Poi applicarlo alle route:

```diff
- app.post('/api/bookings/guest', (req, res) => {
+ app.post('/api/bookings/guest', guestLimiter, (req, res) => {
```

```diff
- app.post('/api/auth/reset-password', async (req, res) => {
+ app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
```

**Side-effect:** Un cliente guest reale che sbaglia 5 volte in 15 minuti verrà bloccato. È accettabile: un utente legittimo non prenota 5 volte in 15 minuti.  
**Test:**
1. Fare 6 `POST /api/bookings/guest` in rapida successione → la 6a deve restituire 429.
2. Fare 11 `POST /api/auth/reset-password` → l'11a deve restituire 429.

---

## FIX 4 — Sostituire manual cookie parsing con `req.cookies`

**File:** `server/server.js` righe ~155-180 (route `/api/slots/:date`) e righe ~208-230 (route `/api/services`)  
**Rischio attuale:** Il parsing manuale `cookie.split('=')` tronca i cookie il cui valore contiene `=` (i token JWT contengono `=` nel padding base64).  
**Modifica per `/api/slots/:date`:**

Sostituire l'intero blocco di parsing manuale:

```js
// PRIMA (da rimuovere):
const authHeader = req.headers.cookie;
if (authHeader) {
  const cookies = authHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
  if (cookies.token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(cookies.token, config.jwt.secret);
      // ...
```

```js
// DOPO (sostituzione):
const token = req.cookies.token;
if (token) {
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, config.jwt.secret);
    // ... (la logica interna resta identica)
```

**Ripetere lo stesso pattern** per la route `/api/services` (~riga 208-230).

**Side-effect:** Nessuno — `cookieParser()` è già nel middleware stack (riga 48), quindi `req.cookies` è sempre disponibile.  
**Test:** 
1. Login come VIP → GET `/api/slots/2026-04-09` → deve includere slot extra.
2. Login come admin → GET `/api/services` → deve restituire lista servizi.
3. Senza login → GET `/api/slots/2026-04-09` → deve restituire solo slot normali.

---

## FIX 5 — Rimuovere fallback password plaintext admin

**File:** `server/authService.js` righe ~39-48  
**Rischio attuale:** Se la password admin nel DB non è hashata, viene confrontata in chiaro. Se il DB viene compromesso, un attaccante vede la password.  
**Modifica:**

```diff
  // RIMUOVERE questo blocco:
- else {
-   const isValid = (admin.password === password);
-   if (isValid) {
-     const newHash = await argon2.hash(password, { type: argon2.argon2id });
-     adminDB.update(a => a.email === admin.email, { password: newHash });
-   }
-   return isValid;
- }

  // SOSTITUIRE con:
+ else {
+   // Password non riconosciuta come hash valido — forza rehash al prossimo login corretto
+   console.error('⚠️ Password admin non hashata rilevata. Eseguire rehash manuale.');
+   return false;
+ }
```

**ATTENZIONE — Prima di applicare questo fix:**
1. Verificare che la password admin nel DB sia già hashata: 
   ```sql
   SELECT email, substr(password, 1, 20) FROM admins;
   ```
   Se inizia con `$argon2` o `$2b$` → è hashata, si può procedere.
   Se è plaintext → fare prima un login admin (che triggera l'upgrade automatico), poi applicare il fix.

**Side-effect:** Se per qualche ragione la password non fosse ancora hashata, l'admin non potrà più loggarsi. Da qui la verifica preventiva.  
**Test:** Login admin con credenziali corrette → successo. Login admin con credenziali errate → fallimento. Controllare nei log che non compaia il warning.

---

## FIX 6 — CSP base in Helmet

**File:** `server/server.js` righe 43-45  
**Rischio attuale:** Senza CSP, qualsiasi XSS injection può caricare script esterni.  
**Modifica:**

```diff
  app.use(helmet({
-   contentSecurityPolicy: false
+   contentSecurityPolicy: {
+     directives: {
+       defaultSrc: ["'self'"],
+       scriptSrc: ["'self'", "'unsafe-inline'"],
+       styleSrc: ["'self'", "'unsafe-inline'"],
+       imgSrc: ["'self'", "data:"],
+       connectSrc: ["'self'"],
+       fontSrc: ["'self'"],
+       objectSrc: ["'none'"],
+       frameAncestors: ["'none'"]
+     }
+   }
  }));
```

**Nota:** `'unsafe-inline'` per script e style è necessario perché il frontend usa inline styles e potenzialmente inline event handlers. L'obiettivo è bloccare script da domini esterni, non i nostri inline. Se in futuro si migra a un framework con build step, eliminare `'unsafe-inline'` e usare nonces.

**Side-effect ALTO:** Questa modifica può rompere funzionalità se ci sono:
- Script caricati da CDN (verificare tutti gli `<script src="...">` negli HTML)
- Font caricati da Google Fonts o simili
- Immagini caricate da URL esterni

**Verifica preventiva:**
```bash
grep -r "src=" frontend/*.html | grep -v "js/" | grep -v "styles/"
grep -r "href=" frontend/*.html | grep "http"
```
Se ci sono risorse esterne → aggiungerle alle rispettive direttive CSP.

**Test:** 
1. Aprire ogni pagina HTML del frontend → console DevTools non deve mostrare errori CSP.
2. Verificare login, prenotazione, calendario admin funzionino normalmente.

---

## FIX 7 — `escapeHTML()` in guest-booking.js

**File:** `frontend/js/guest-booking.js` riga ~473  
**Rischio attuale:** `selectedService.nome` viene iniettato in `innerHTML` senza sanitizzazione. Un servizio con nome malevolo causa XSS per tutti i guest.  
**Modifica:**

```diff
  confMsg.innerHTML = 'La prenotazione per <strong>' + 
-   (selectedService ? selectedService.nome : 'Servizio') + 
+   (selectedService ? escapeHTML(selectedService.nome) : 'Servizio') + 
    '</strong> il <strong>' + formatDateDisplay(selectedDate) + '</strong> alle <strong>' + selectedTime + '</strong> è stata confermata.<br><br>' +
    'Riceverai a breve una email di riepilogo.';
```

**Prerequisito:** Verificare che `escapeHTML` sia disponibile in `guest-booking.js`. La funzione è definita in `frontend/js/utils.js` — verificare che `guest-booking.html` includa `utils.js` prima di `guest-booking.js`.

**Side-effect:** Nessuno. I nomi dei servizi legittimi non contengono `<` o `>`.  
**Test:** Creare temporaneamente un servizio con nome `Test<img onerror=alert(1)>` → nella pagina di conferma guest deve apparire il testo letterale, non eseguire lo script.

---

## FIX 8 — Cambiare DEFAULT durata_minuti nella migrazione

**File:** `server/database.js` riga della migrazione `ALTER TABLE bookings ADD COLUMN durata_minuti`  
**Rischio attuale:** Nuovi record che non impostano esplicitamente `durata_minuti` ereditano 60 (1 ora) invece di 15 minuti, causando blocco slot (il bug risolto precedentemente).  
**Modifica:**

Trovare la riga di migrazione:
```diff
- db.run("ALTER TABLE bookings ADD COLUMN durata_minuti INTEGER DEFAULT 60");
+ db.run("ALTER TABLE bookings ADD COLUMN durata_minuti INTEGER DEFAULT 15");
```

**Side-effect:** La migrazione `ALTER TABLE ... ADD COLUMN` è dentro un `try/catch` → se la colonna esiste già (il nostro caso), viene skippata. Quindi questa modifica impatta solo su database nuovi (primo avvio).  
Per i database esistenti, il default colonna è già fissato e non cambia con il codice. Se si vuole cambiare il default anche on-disk, aggiungere dopo la migrazione esistente:

```js
try {
  // Aggiorna il default della colonna per nuovi record
  // SQLite non supporta ALTER COLUMN, ma i nuovi INSERT useranno il codice che forza 15
} catch (e) { /* già migrato */ }
```

In pratica: dato che il codice applicativo forza `15` per `extra_work` e i servizi regolari passano sempre `durata_minuti` esplicitamente, il vero fix è già nel codice di `bookingService.js`. Questa modifica è puramente difensiva.

**Test:** Creare un nuovo database da zero → inserire un booking senza specificare `durata_minuti` → verificare che il default sia 15.

---

## FIX 9 — Validazione lunghezza campi di testo

**File:** `server/server.js` (nei controller delle route booking) e `server/bookingService.js`  
**Rischio attuale:** Campi come `note_cliente`, `nome`, `cognome` non hanno limiti. Un attaccante può inserire megabyte di testo.  
**Modifica:**

Aggiungere una utility di troncamento in `server/bookingService.js` (in cima al file):

```js
function sanitizeText(value, maxLen) {
  if (!value) return '';
  return String(value).trim().slice(0, maxLen);
}
```

Poi applicarla nei punti di ingresso dati. Esempio in `createBooking`:

```js
nome:         sanitizeText(data.nome, 100),
cognome:      sanitizeText(data.cognome, 100),
email:        sanitizeText(data.email, 254),
telefono:     sanitizeText(data.telefono, 20),
targa:        sanitizeText(data.targa, 10),
modello:      sanitizeText(data.modello, 100),
note_cliente: sanitizeText(data.note_cliente, 1000),
nota_interna: sanitizeText(data.nota_interna, 1000),
```

Stessa logica in `createConsegnaBooking`, `createAdminBooking` e `depositService.createDeposit`.

**Anche nella route guest checkout** (`server/server.js` ~riga 414):
```js
nome: sanitizeText(nome, 100),
cognome: sanitizeText(cognome, 100),
```

**Side-effect:** Se un cliente ha un cognome di 101+ caratteri (praticamente impossibile), viene troncato.  
**Test:** Inviare un `POST /api/bookings/guest` con `note_cliente` da 5000 char → nel DB deve avere max 1000 char.

---

## CHECKLIST DI VALIDAZIONE FINALE

Dopo aver applicato tutti i fix, eseguire questa checklist:

| # | Test | Risultato atteso |
|---|------|-----------------|
| 1 | `POST /api/bookings/guest` con body > 16KB | 413 Payload Too Large |
| 2 | Cookie nei DevTools dopo login | `HttpOnly; SameSite=Lax` |
| 3 | 6 prenotazioni guest in 15 min | La 6a restituisce 429 |
| 4 | Login admin | Successo (password hashata) |
| 5 | Login admin con password sbagliata | 401, nessun confronto plaintext |
| 6 | Console DevTools su ogni pagina | Nessun errore CSP |
| 7 | Conferma guest con servizio dal nome "Test" | Testo escaped correttamente |
| 8 | GET `/api/slots/2026-04-09` come VIP | Slot extra visibili |
| 9 | GET `/api/slots/2026-04-09` senza login | Solo slot normali |
| 10 | Prenotazione + cancellazione normale | Flusso completo funzionante |
| 11 | Calendario admin, drag & drop | Funzionante |
| 12 | Depositi / Lavori straordinari | Flusso completo funzionante |
