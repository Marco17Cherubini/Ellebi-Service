# Analisi dei Legami Rotti (JS - HTML - CSS)

A seguito del refactoring strutturale del CSS, la logica JavaScript (che genera o manipola il DOM rigidamente) e i template HTML hanno subìto degli scollamenti. Questo documento traccia tutte le rotture critiche da risolvere.

## 1. Il Toggle dei Componenti Multi-Step (Il problema delle "Card fantasma")
**File coinvolti:** `frontend/js/dashboard.js`, `frontend/dashboard.html`
- **Il Cortocircuito:** Nel file `dashboard.js` la funzione `showStep()` cambia la visibilità degli step del wizard (Auto, Servizio, Data) aggiungendo o rimuovendo esclusivamente la classe `.hidden`.
- **La realtà CSS:** In `containers.css` (Task 4) abbiamo standardizzato che i `.wizard-section` partissero con `display: none;` per poi comparire SOLO quando viene aggiunta la classe `.active`. 
- **Risultato:** Entrando in Dashboard nessuna area acquisisce la classe `.active`, rendendo tutte le `vehicle-card` e `service-card` invisibili perennemente.

## 2. Iniettori DOM con Stili Hardcoded ("Silos inline")
La regola del Design System (no `style=`) viene perennemente violata dal codice JS che, non avendo un framework di appoggio, stampa "HTML crudo" tramite `.innerHTML`.
**File critici da fixare:**
- **`dashboard.js` (Righe 99, 192):** Genera il banner di "Modalità Modifica" e il panel dei `campi_extra` forzando dimensioni (`font-size:0.82rem`) e colori.
- **`guest-booking.js` (Righe 94, 105, 112):** Scrive stati di Caricamento/Errore via JS con `<div style="text-align:center;padding:20px;color:#888;">`, ignorando le utility classes `text-center`, `color-text-secondary`, `p-4`.
- **`admin.js` (Righe 1279, 1283, 1532):** Il calendario backend genera cellette per "ferie" e i banner di stato "deposito" immettendo attributi `style=` brutalmente incapsulati per la micro-tipografia, invece di usare i `badge-special` o utility.
- **`admin-depositi.js` (Riga 207, 221):** Modali di logica generati con `display:flex` sparsi via stringa anziché farli generare al modulo form builder.

## 3. Disallineamento Logiche di Officina ("Buchi Funzionali")
Il prodotto è un ecosistema per officina meccanica, ma attualmente le properties (strutture dati) sono gestite genericamente.
- Nel `dashboard.js`, i *Campi Extra* (es. Targa, Chilometri) non sono mappati a componenti specifici delle autofficine, ma generati genericamente.
- Il file `summary.html` mostra un riepilogo che poggia su *inline-styles* per stampare le risposte utente (Riga 90 `style="resize:vertical..."`).
- Le form modali per gestire "Il solito?" o i "Depositi" (es. gomme) sono manipolate a mano anziché usare una `components/modal.css` unica e pulita tramite JS handler astratti.

## Piano di Ripristino (JS Hooks)
1. Eseguire un _Grep Search & Replace_ mirato per trasformare la logica `.hidden` in logica `.active` sui file JS (Dashboard e Guest).
2. De-stilizzare le _Stringhe Template_ di tutti i `.js` e rimpiazzarle con i `Design Tokens` utility.
3. Raccogliere e aggiornare i widget "Officina" (Depositi e Recap) appigliandoli al nuovo CSS.