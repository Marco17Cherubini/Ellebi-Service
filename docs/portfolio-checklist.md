# Checklist per il portfolio

Informazioni che il codice non può dimostrare e che solo l'autore può fornire. Finché mancano, il README descrive soltanto ciò che il repository dimostra.

## Storia e risultati (README → _The story_)

- [ ] Conferma del contesto: officina, persona di riferimento (il README dice "the owner"), periodo in cui l'app è stata sviluppata e adottata.
- [ ] Il problema in numeri, se disponibili: telefonate o messaggi al giorno, tempo speso a organizzare, errori o doppie prenotazioni.
- [ ] Uso reale: l'app è in produzione? Da quando? Con quale URL (se pubblico)?
- [ ] Risultati misurabili: clienti registrati, prenotazioni al mese, depositi gestiti, tempo risparmiato. Fonte di ogni numero (export, report admin, stima dell'officina).
- [ ] Eventuale citazione del titolare, con il suo consenso.

## Screenshot

Quelli in `docs/images/` sono catturati dall'app reale con i **dati sintetici** di `npm run seed`. Se si vogliono screenshot dell'uso reale:

- [ ] report di un mese reale (Resoconto Clientela);
- [ ] calendario admin di una settimana reale;
- [ ] in entrambi i casi, nomi, email, telefoni e targhe oscurati prima di pubblicarli.

## Decisioni aperte

- [ ] **Orari estesi VIP**: oggi sono quelli ereditati dal barbiere (08:00 e serali ogni 45 minuti fino alle 23:15) e non compaiono nella griglia settimanale admin. Da rivedere con l'officina: tenerli, ridurli o mostrarli nel calendario.
- [ ] **Cronologia Git** (decisione D-7): il backup del database rimosso dall'albero resta nei commit precedenti (indirizzi email e hash di password). Valutare la riscrittura della cronologia (richiede un force push) e, se gli account erano reali, un cambio delle password.
- [ ] **Veicoli salvati**: abilitare o meno nel wizard di prenotazione il salvataggio e la scelta dei veicoli (l'API esiste, il selettore è nascosto).
- [ ] **Promemoria tagliando/gomme**: la tabella `notifications` è prevista ma inutilizzata; decidere se implementarli o rimuoverla con una migrazione esplicita.

## Pubblicazione su GitHub

- [ ] Push del branch `refactor/portfolio-cleanup` e pull request verso `main`; verificare che la CI sia verde (il badge nel README punta al workflow `ci.yml`).
- [ ] Descrizione e topic del repository (es. `express`, `sqlite`, `booking`, `workshop`, `vanilla-js`).
- [ ] Facoltativo: link alla demo pubblica, se si decide di pubblicarne una con soli dati sintetici.
