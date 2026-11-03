# Ellebi Service — DESIGN.md

Direzione scelta: **B · L'insegna** (novembre 2026). Questo documento è il riferimento per ogni pagina: se una scelta non è qui, si decide in coerenza con questi principi e si aggiorna il documento.

## 1. Atmosfera e principi

L'officina vista di sera dalla strada: l'**insegna rotonda illuminata** con il logo autentico, l'auto davanti, la luce blu della vetrina. È un'officina reale, non un salone di auto di lusso.

- **Il logo è il protagonista dietro l'auto**: intero, nei suoi colori, su un disco crema come un'insegna. Mai deformato, ricolorato o tagliato.
- **Due modalità, ruoli fissi.** Il _palco_ scuro presenta (homepage, testate). Il _foglio_ chiaro fa lavorare: prenotazione, accesso, area cliente e moduli stanno su superfici chiare, leggibili anche al sole e da chi usa poco le app.
- **L'area amministrativa** usa la modalità scura neutra, senza palco, senza auto, senza effetti: densità utile e velocità.
- **Arancio = agire. Blu = struttura e luce.** Nessun terzo colore di marca.
- La creatività sta nella composizione (insegna, auto, ritmo palco/foglio), non nella decorazione.

Riferimenti studiati (awesome-design-md, solo principi, nessun colore, font o marchio copiato): Ferrari (fondo quasi nero e mai nero puro, un solo accento usato con parsimonia, profondità da luce e fili e non da ombre), BMW M (segno di marca come firma e mai come pulsante, alternanza delle bande), Renault (alternanza catalogo chiaro / racconto scuro, accento riservato alle azioni decisive, schede con il testo sotto l'immagine).

## 2. Palette e ruoli

| Token           | Valore    | Ruolo                                                                                                                     |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--paper`       | `#101317` | Fondo del palco e dell'admin (quasi nero, mai `#000`)                                                                     |
| `--paper-2`     | `#1A1F26` | Superfici sul palco, pannelli admin                                                                                       |
| `--paper-3`     | `#2B323C` | Fili e bordi sul fondo scuro                                                                                              |
| `--ink`         | `#F2F2EF` | Testo sul fondo scuro                                                                                                     |
| `--ink-2`       | `#B3BBC6` | Testo secondario sul fondo scuro (9:1)                                                                                    |
| `--accent`      | `#E07A33` | **Arancio Ellebi**: azione principale, stato selezionato, cifre chiave. Testo su arancio: `--on-accent` `#14100C` (5,6:1) |
| `--blue`        | `#2F6FD6` | **Blu luce**: alone dell'insegna, focus, link sul foglio, passo corrente                                                  |
| `--blue-deep`   | `#0E2A52` | **Blu profondo**: anello dell'insegna, giorno selezionato, intestazioni del foglio                                        |
| `--sheet`       | `#F5F5F2` | Fondo del foglio chiaro                                                                                                   |
| `--sheet-card`  | `#FFFFFF` | Righe e opzioni sul foglio                                                                                                |
| `--sheet-ink`   | `#15191F` | Testo sul foglio (15:1)                                                                                                   |
| `--sheet-ink-2` | `#4A5361` | Testo secondario sul foglio (7,6:1)                                                                                       |
| `--sheet-line`  | `#D8DCE2` | Bordi sul foglio                                                                                                          |
| `--sign`        | `#F6F1E6` | Disco dell'insegna (crema del logo originale)                                                                             |

Semantici: ok `#2E8B57`, attenzione `#B7791F`, errore `#C0392B` (sul foglio); varianti più chiare sul fondo scuro.

Vietato: gradienti decorativi; l'unico alone ammesso è la luce blu dell'insegna. Arancio solo come riempimento o su fondo scuro, mai come testo su chiaro (contrasto insufficiente): sul foglio i link sono blu.

## 3. Tipografia

| Ruolo             | Font                                                    | Uso                                                                                      |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Titoli            | **Saira Condensed 600**, maiuscolo, spaziatura `0.03em` | Solo titoli di pagina e di sezione, mai paragrafi o pulsanti in maiuscolo lunghi         |
| Testo e controlli | **Barlow 400/500/600**                                  | Corpo, etichette, pulsanti (in tondo, non maiuscolo), cifre tabellari per orari e targhe |

Scala: 13 (note) · 16 (corpo, minimo per i campi) · 20 (introduzione) · 28–34 (titolo mobile) · 48–64 (titolo desktop). Interlinea testo 1,5; titoli 1,0. Righe di testo ≤ 70 caratteri. Font self-hosted in `frontend/fonts/` (OFL).

## 4. Griglia e spaziature

Mobile first, progettato a 360–390 px. Margine pagina `--gutter` = `clamp(16px, 4vw, 40px)`. Scala 4 px (`--space-1` … `--space-20`). Bande della homepage separate da 96–128 px su desktop, 64 px su mobile. Contenuti del foglio entro 720 px; admin a tutta larghezza con colonna di navigazione da 248 px oltre i 1100 px.

## 5. Componenti e stati

- **Pulsante primario**: arancio, pillola, 54 px di altezza su mobile (min 44), testo `--on-accent` in Barlow 600. Stati: hover più chiaro (solo puntatore fine), premuto `scale(0.97)`, disabilitato 40 % opacità, in corso con barra animata.
- **Pulsante secondario**: contorno `--paper-3` sul palco, `--sheet-line` sul foglio.
- **Opzioni (servizi, giorni, orari)**: righe o tessere bianche sul foglio con bordo `--sheet-line`; selezionato = blu profondo (giorni) o arancio (orario, servizio scelto). Sempre `aria-pressed` o radio reali.
- **Campi**: etichetta sempre visibile sopra, 48 px, bordo `--sheet-line`, focus blu 2 px, errore sotto il campo collegato con `aria-describedby`.
- **Insegna**: disco `--sign` con il logo vettoriale, anello `--blue-deep`, alone `--blue` diffuso. Solo sulla pagina d'ingresso.
- **Pagina d'ingresso**: come nell'app originale, solo insegna, auto (immagine statica) e tre modi di entrare: **Accedi** (primario), **Registrati** (secondario), **Prenota come ospite** (discreto). Stessa pagina con o senza sessione; nessun collegamento all'area amministrativa da una pagina pubblica.
- **Tabelle su telefono**: sotto i 760 px diventano schede (una per riga, etichetta sopra il valore); mai scorrimento laterale.

## 6. Superfici e profondità

Profondità da luce (alone dell'insegna, ombra a terra dell'auto) e da fili sottili. Nessuna ombra sulle superfici ferme; ombra solo su ciò che galleggia (foglio di prenotazione su mobile, finestre modali, barra delle azioni). Raggi: pillola per pulsanti e chip, 12–14 px per tessere e opzioni, 22 px per l'angolo superiore del foglio.

## 7. Comportamento responsive

- **Mobile first**: si progetta a 360–430 px e si allarga, mai il contrario. A ogni larghezza nessuna pagina è più larga dello schermo: i testi vanno a capo (`min-width: 0`, `overflow-wrap`), le etichette lunghe passano sotto il nome invece di uscire a destra. L'unico scorrimento laterale ammesso è la striscia dei giorni della prenotazione.
- **Ingresso**: una colonna di al massimo 480 px anche su desktop: insegna, auto sovrapposta al terzo inferiore, titolo, tre pulsanti a tutta larghezza.
- Tutto utilizzabile senza hover; zoom 200 % senza perdita di contenuto.

## 8. Movimento e fallback

- Un solo momento firmato: l'insegna si accende (opacità e alone, 600 ms) e l'auto entra (scala 0,96 → 1). Poi niente si muove da solo.
- Feedback ai controlli in 120–200 ms con easing `cubic-bezier(0.23, 1, 0.32, 1)`; niente animazioni sulle azioni da tastiera.
- `prefers-reduced-motion`: niente ingressi né esploso animato, tutto è già al suo posto.
- L'auto è un'immagine statica resa dal modello 3D (`client-src/`); il 3D interattivo non è pubblicato.

## 9. Ammesso e vietato

Ammesso: l'insegna con il logo intero; un alone blu dietro l'insegna; titoli maiuscoli brevi; il foglio chiaro per ogni attività; cifre tabellari per orari e targhe.

Vietato: copiare Lev Space o i marchi studiati; listini, menu o collegamenti dipendenti dalla sessione nella pagina d'ingresso; intere pagine in maiuscolo; finte telemetrie e numeri tecnici interni come decorazione (la griglia da 15 minuti non si mostra al pubblico); gradienti e glassmorphism decorativi; strisce colorate laterali sulle card; arancio come testo su fondo chiaro; effetti del palco nell'area amministrativa.
