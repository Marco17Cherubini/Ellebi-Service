<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Prepara un markdown di consulto per Antigravity

```md
# Consulto per Antigravity — Spazi & Impaginazione stile Apple (iOS)

Obiettivo: rendere l’app più “Apple-like” migliorando distanze, allineamenti e gerarchia visiva, evitando valori hardcoded e basandosi su guide di sistema (Safe Area, Margins, Readable width) [web:38][web:48].

---

## Principi base (da applicare ovunque)

- Vincolare sempre i contenuti a **Safe Area**: evita notch, rounded corners, home indicator, navbar/tabbar/toolbar che possono coprire contenuti [web:48][web:38].  
- Usare **layoutMargins** / `layoutMarginsGuide` per i margini “di contenuto” (testi, card, form) così l’app si allinea naturalmente ai componenti iOS (es. bar button items) [web:47][web:65].  
- Per testo lungo e layout “a colonna”, usare **readableContentGuide** per non avere righe troppo larghe su schermi grandi e con Dynamic Type [web:68].  
- Spaziature coerenti: griglia basata su multipli di **8pt** (con 4pt solo per micro-regolazioni) per coerenza visiva [web:33].

---

## Distanze dal bordo (top / bottom / laterali)

### Top
- Non fissare un “padding top” assoluto: usa `safeAreaLayoutGuide.topAnchor` per evitare che status bar / notch coprano header e controlli [web:48][web:65].  
- Per header e titoli: parti dalla safe area e poi aggiungi spacing interno basato su 8/16/24pt secondo gerarchia [web:33].

### Bottom
- Qualsiasi CTA o controllo importante vicino al fondo deve stare **dentro la safe area** (home indicator) [web:48][web:65].  
- Se metti un bottone “sticky” in basso, ancoralo al `safeAreaLayoutGuide.bottomAnchor` e aggiungi padding interno coerente (8/16pt) [web:48][web:33].

### Laterali
- Testi e contenuti “principali” vanno vincolati al `layoutMarginsGuide` per avere margini di sistema coerenti [web:47][web:65].  
- Su schermi grandi/landscape, per paragrafi e descrizioni usa `readableContentGuide` per controllare la larghezza ottimale [web:68].

---

## Spacing system consigliato (operativo)

Usare questa scala come “token” di progetto (iOS spacing):
- 4pt: micro-gap (badge, icona+testo strettissimo) [web:33]  
- 8pt: elementi correlati (label + input, titolo + sottotitolo) [web:33]  
- 16pt: distanza standard tra blocchi (card, campi form, righe di lista) [web:33]  
- 24pt: separazione tra sezioni funzionali (Calendario vs Legenda) [web:33]  
- 32pt+: “break” visivi importanti (cambio contesto, CTA isolata) [web:33]  

Nota: l’importante è ripetere sempre gli stessi step (coerenza), non inventare 13/19/27pt casuali [web:33].

---

## Button: regole Apple-like

- Hit area minima: **44×44pt** per ogni elemento interattivo (anche icone) [web:60].  
- Preferire CTA primarie chiare e facili da premere; spesso funziona bene un bottone “full width” per azioni principali [web:60].  
- Se ci sono più azioni vicine, aumenta la separazione tra la primaria e azioni distruttive per ridurre errori (e usa stile distruttivo) [web:60].  

---

## Card / riquadri / form (layout pulito)

- Card e contenitori: padding interno tipico 12–16pt e spacing esterno 16–24pt (sempre su scala 8pt) [web:33].  
- Liste/griglie: allinea tutti i contenuti a una griglia; evita bordi e separatori “random” (o troppo scuri) perché spezzano l’armonia [web:38].  
- Testi lunghi: vincolare al readable guide (iPad e landscape) per “colonna editoriale” [web:68].

---

## “Pagina unica” (single screen): approccio realistico

- Apple privilegia layout adattivi: meglio una schermata con sezioni e scroll piuttosto che comprimere tutto “above the fold” sacrificando tap-accuracy e leggibilità [web:38].  
- Strategia consigliata:
  - CTA importante sempre visibile (sticky bottom o posizionata in modo prevedibile), ma **entro safe area** [web:48].  
  - Sezioni con header + spacing 24pt tra sezioni; contenuti interni a 8/16pt [web:33].  
  - Evitare affollamento: se aumentano opzioni/filtri, usare progressive disclosure (modale / sheet / schermata dedicata) [web:38].

---

## Checklist rapida (da applicare su ogni screen)

- [ ] Tutti i controlli vincolati a `safeAreaLayoutGuide` (top/bottom) [web:48].  
- [ ] Testi e contenuti principali vincolati a `layoutMarginsGuide` [web:47].  
- [ ] Testi lunghi vincolati a `readableContentGuide` [web:68].  
- [ ] Spacing solo su scala 8pt (4/8/16/24/32) [web:33].  
- [ ] Touch target sempre ≥ 44×44pt [web:60].  
- [ ] CTA principale isolata e facilmente raggiungibile (specie in basso) ma dentro safe area [web:48].  

---

## Domande per applicazione (per sbloccare il lavoro)

1) Stack tecnico: iOS nativo (SwiftUI / UIKit) o cross-platform (RN/Flutter)?  
2) Schermata più critica: calendario admin, sidebar, modale, oppure form?  
3) Preferisci CTA sticky (basso) o CTA in alto (navbar) per “Salva/Conferma”?
```

<span style="display:none">[^1][^10][^11][^12][^13][^14][^15][^16][^17][^18][^19][^2][^20][^3][^4][^5][^6][^7][^8][^9]</span>

<div align="center">⁂</div>

[^1]: https://developer.apple.com/design/human-interface-guidelines/layout

[^2]: https://developer.apple.com/documentation/uikit/uiview/insetslayoutmarginsfromsafearea

[^3]: https://developer.apple.com/documentation/uikit/uiview/safearealayoutguide

[^4]: https://developer.apple.com/documentation/uikit/uiview/layoutmargins

[^5]: https://median.co/blog/apples-ui-dos-and-donts-formatting-content

[^6]: https://stackoverflow.com/questions/50214263/is-layoutmarginsguide-seems-to-be-kind-of-excessive

[^7]: https://moldstud.com/articles/p-a-comprehensive-guide-to-apple-human-interface-guidelines-for-ios-apps

[^8]: https://developer.apple.com/br/videos/play/tech-talks/801/

[^9]: https://learn.microsoft.com/en-us/dotnet/api/uikit.uistackview?view=xamarin-ios-sdk-12

[^10]: https://www.designmonks.co/blog/perfect-mobile-button-size

[^11]: https://engineering.monday.com/how-uilayoutguide-can-help-you-manage-ui-complexity/

[^12]: https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/AutolayoutPG/WorkingwithConstraintsinInterfaceBuidler.html

[^13]: https://thisisglance.com/learning-centre/how-do-i-design-buttons-that-everyone-can-actually-press

[^14]: https://designcode.io/ios16-layout-spacing/

[^15]: https://stackoverflow.com/questions/37796884/on-ios-what-are-the-differences-between-margins-edge-insets-content-insets-a

[^16]: https://designcode.io/ios-design-handbook-design-for-touch/

[^17]: https://www.figma.com/community/file/988392183086784844/ios-safe-area-guide

[^18]: https://martiancraft.com/blog/2019/02/notes-from-the-margins/

[^19]: https://developer.apple.com/design/human-interface-guidelines/buttons

[^20]: https://createwithplay.com/blog/considering-ios-safe-area

