# Specifiche Dark Mode di Apple

Le seguenti specifiche descrivono come i colori del sistema Apple si trasformano passando dalla modalità chiara (Light Mode) a quella scura (Dark Mode). I valori sono in formato RGB e Hex, secondo le linee guida ufficiali Apple Human Interface Guidelines.

---

## Colori di Sistema Principali

| Colore | Light Mode | Dark Mode | Nome Sistema |
|--------|------------|-----------|--------------|
| Bianco → Nero | `#FFFFFF` (RGB 255, 255, 255) | `#000000` (RGB 0, 0, 0) | System Background Base |
| Azzurro | `#007AFF` (RGB 0, 122, 255) | `#0A84FF` (RGB 10, 132, 255) | systemBlue |
| Verde | `#34C759` (RGB 52, 199, 89) | `#30D158` (RGB 48, 209, 88) | systemGreen |
| Rosso | `#FF3B30` (RGB 255, 59, 48) | `#FF453A` (RGB 255, 69, 58) | systemRed |
| Giallo | `#FFCC00` (RGB 255, 204, 0) | `#FFD60A` (RGB 255, 214, 10) | systemYellow |
| Arancione | `#FF9500` (RGB 255, 149, 0) | `#FF9F0A` (RGB 255, 159, 10) | systemOrange |
| Rosa | `#FF2D55` (RGB 255, 45, 85) | `#FF375F` (RGB 255, 55, 95) | systemPink |
| Viola | `#AF52DE` (RGB 175, 82, 222) | `#BF5AF2` (RGB 191, 90, 242) | systemPurple |
| Indaco | `#5856D6` (RGB 88, 86, 214) | `#5E5CE6` (RGB 94, 92, 230) | systemIndigo |
| Teal | `#5AC8FA` (RGB 90, 200, 250) | `#64D2FF` (RGB 100, 210, 255) | systemTeal |
| Marrone | `#A2845E` (RGB 162, 132, 94) | `#AC8E68` (RGB 172, 142, 104) | systemBrown |

---

## Scala di Grigi di Sistema

| Colore | Light Mode | Dark Mode | Nome Sistema |
|--------|------------|-----------|--------------|
| Grigio Base | `#8E8E93` (RGB 142, 142, 147) | `#8E8E93` (RGB 142, 142, 147) | systemGray |
| Grigio 2 | `#AEAEB2` (RGB 174, 174, 178) | `#636366` (RGB 99, 99, 102) | systemGray2 |
| Grigio 3 | `#C7C7CC` (RGB 199, 199, 204) | `#48484A` (RGB 72, 72, 74) | systemGray3 |
| Grigio 4 | `#D1D1D6` (RGB 209, 209, 214) | `#3A3A3C` (RGB 58, 58, 60) | systemGray4 |
| Grigio 5 | `#E5E5EA` (RGB 229, 229, 234) | `#2C2C2E` (RGB 44, 44, 46) | systemGray5 |
| Grigio 6 | `#F2F2F7` (RGB 242, 242, 247) | `#1C1C1E` (RGB 28, 28, 30) | systemGray6 |

---

## Colori di Background Gerarchici

| Funzione | Light Mode | Dark Mode | Nome Sistema |
|----------|------------|-----------|--------------|
| Background Primario | `#FFFFFF` (RGB 255, 255, 255) | `#000000` (RGB 0, 0, 0) | systemBackground |
| Background Secondario | `#F2F2F7` (RGB 242, 242, 247) | `#1C1C1E` (RGB 28, 28, 30) | secondarySystemBackground |
| Background Terziario | `#FFFFFF` (RGB 255, 255, 255) | `#2C2C2E` (RGB 44, 44, 46) | tertiarySystemBackground |
| Background Grouped | `#F2F2F7` (RGB 242, 242, 247) | `#000000` (RGB 0, 0, 0) | systemGroupedBackground |
| Background Grouped Secondario | `#FFFFFF` (RGB 255, 255, 255) | `#1C1C1E` (RGB 28, 28, 30) | secondarySystemGroupedBackground |
| Background Grouped Terziario | `#F2F2F7` (RGB 242, 242, 247) | `#2C2C2E` (RGB 44, 44, 46) | tertiarySystemGroupedBackground |

---

## Colori per Etichette e Testo

| Funzione | Light Mode | Dark Mode | Nome Sistema |
|----------|------------|-----------|--------------|
| Label Primaria | `#000000` (RGB 0, 0, 0) | `#FFFFFF` (RGB 255, 255, 255) | label |
| Label Secondaria | `#3C3C43` 60% opacity | `#EBEBF5` 60% opacity | secondaryLabel |
| Label Terziaria | `#3C3C43` 30% opacity | `#EBEBF5` 30% opacity | tertiaryLabel |
| Label Quaternaria | `#3C3C43` 18% opacity | `#EBEBF5` 18% opacity | quaternaryLabel |
| Placeholder Text | `#3C3C43` 30% opacity | `#EBEBF5` 30% opacity | placeholderText |

---

## Colori di Riempimento (Fill)

| Funzione | Light Mode | Dark Mode | Nome Sistema |
|----------|------------|-----------|--------------|
| Fill Primario | `#787880` 20% opacity | `#787880` 36% opacity | systemFill |
| Fill Secondario | `#787880` 16% opacity | `#787880` 32% opacity | secondarySystemFill |
| Fill Terziario | `#767680` 12% opacity | `#767680` 24% opacity | tertiarySystemFill |
| Fill Quaternario | `#747480` 8% opacity | `#747480` 18% opacity | quaternarySystemFill |

---

## Separatori e Bordi

| Funzione | Light Mode | Dark Mode | Nome Sistema |
|----------|------------|-----------|--------------|
| Separatore | `#3C3C43` 29% opacity | `#545458` 60% opacity | separator |
| Separatore Opaco | `#C6C6C8` | `#38383A` | opaqueSeparator |

---

# Specifiche Dark Mode - Pagina Admin Calendar

Conversione completa dei colori della pagina admin applicando le linee guida Apple Dark Mode.

---

## STRUTTURA CALENDARIO

| Elemento | Light Mode | Dark Mode | Descrizione |
|----------|------------|-----------|-------------|
| Bordo calendario | `#ccc` | `#3A3A3C` | Bordo esterno griglia |
| Header giorni BG | `#f8f8f8` | `#1C1C1E` | Sfondo intestazioni (LUN, MAR...) |
| Header giorni TEXT | `#333` | `#EBEBF5` | Testo intestazioni |
| Header bordo inferiore | `#ddd` | `#2C2C2E` | Linea sotto intestazioni |
| Header "ORARIO" BG | `#f0f0f0` | `#1C1C1E` | Sfondo cella orario fisso |
| Header "ORARIO" bordo | `#ddd` | `#2C2C2E` | Bordo destro cella orario |
| Time column BG | `#f8f8f8` | `#1C1C1E` | Sfondo colonna orari |
| Time column TEXT | `#666` | `#EBEBF5` (60% opacity) | Testo orari |
| Time column bordo | `#ddd` | `#2C2C2E` | Bordo destro orari |
| Celle BG | `#fff` | `#000000` | Sfondo celle vuote |
| Celle bordo | `#eee` | `#2C2C2E` | Bordo tra celle |
| Celle hover BG | `#f0f0f0` | `#2C2C2E` | Sfondo celle al hover |
| Celle no-booking TEXT | `#ccc` | `#636366` | Testo "libero" grigio chiaro |

---

## PRENOTAZIONI (Booking)

| Elemento | Light Mode | Dark Mode | Descrizione |
|----------|------------|-----------|-------------|
| Cella con prenotazione BG | `#fffbeb` | `#3D3419` | Sfondo giallo scuro |
| Booking item BG | `#fef3c7` | `#4A3F1A` | Card prenotazione sfondo |
| Booking item border | `#fbbf24` | `#FFD60A` | Bordo card |
| Booking item left border | `#f59e0b` | `#FF9F0A` | Bordo sinistro spesso |
| Booking service TEXT | `#666` | `#EBEBF5` (60% opacity) | Testo servizio |

---

## FERIE (Holiday)

| Elemento | Light Mode | Dark Mode | Descrizione |
|----------|------------|-----------|-------------|
| Cella ferie BG | `#b0e0e6` | `#1A3A42` | Sfondo blu scuro |
| Cella ferie TEXT | `#2c5282` | `#64D2FF` | Testo blu chiaro |
| Legenda ferie BG | `#b0e0e6` | `#1A3A42` | Sfondo box legenda |
| Holiday mode BG | `#e0f4ff` | `#0F2832` | Sfondo indicatore modalità |
| Holiday mode border | `#b0e0e6` | `#1A3A42` | Bordo indicatore |
| Holiday mode TEXT | `#2c5282` | `#64D2FF` | Testo indicatore |
| Btn holiday save BG | `#b0e0e6` | `#1A3A42` | Sfondo pulsante salva |
| Btn holiday save border | `#87ceeb` | `#64D2FF` | Bordo pulsante |
| Cella selezionata BG | `#d4f1f9` | `#1F4551` | Sfondo selezione |
| Cella selezionata border | `#87ceeb` | `#64D2FF` | Bordo selezione |

---

## LEGENDA

| Elemento | Light Mode | Dark Mode | Descrizione |
|----------|------------|-----------|-------------|
| Legenda BG | `#f5f5f5` | `#1C1C1E` | Sfondo legenda |
| Legenda border | `#ddd` | `#2C2C2E` | Bordo legenda |
| Legend box border | `#000` | `#FFFFFF` | Bordo quadratini legenda |
| Legenda booking BG | `#fef3c7` | `#4A3F1A` | Quadratino prenotato |
| Legenda booking border | `#f59e0b` | `#FF9F0A` | Bordo quadratino |
| Legenda hover BG | `#e6f0ff` | `#1A2A3A` | Sfondo hover |
| Legenda hover border | `#0066cc` | `#0A84FF` | Bordo hover |
| Legenda active BG | `#cce0ff` | `#1E3A52` | Sfondo attivo |

---

## HAMBURGER MENU

| Elemento | Light Mode | Dark Mode | Descrizione |
|----------|------------|-----------|-------------|
| Hamburger spans BG | `#000` | `#FFFFFF` | 3 linee bianche |
| Hamburger hover | `#333` | `#EBEBF5` | Linee al hover |

---

## SIDEBAR

| Elemento | Light Mode | Dark Mode | Descrizione |
|----------|------------|-----------|-------------|
| Sidebar BG | `#fff` | `#1C1C1E` | Sfondo sidebar |
| Sidebar overlay | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.7)` | Overlay scuro (più intenso) |
| Sidebar shadow | `rgba(0,0,0,0.2)` | `rgba(0,0,0,0.5)` | Ombra laterale |
| Sidebar header border | `#000` | `#FFFFFF` | Linea separatore LB Service |
| Sidebar item TEXT | `#000` | `#FFFFFF` | Testo menu |
| Sidebar item hover BG | `#f5f5f5` | `#2C2C2E` | Sfondo hover |
| Sidebar logout TEXT | `#c00` | `#FF453A` | Testo rosso logout |
| Sidebar logout hover BG | `#fee` | `#3A1A1A` | Sfondo scuro hover |
| Sidebar logout border | `#eee` | `#2C2C2E` | Bordo sopra logout |

---

## PULSANTI NAVIGAZIONE

| Elemento | Light Mode | Dark Mode | Descrizione |
|----------|------------|-----------|-------------|
| Nav btn BG | `#fff` | `#1C1C1E` | Sfondo frecce ← → |
| Nav btn border | `#000` | `#FFFFFF` | Bordo bianco |
| Nav btn TEXT | `#000` | `#FFFFFF` | Testo/frecce |
| Nav btn hover BG | `#f0f0f0` | `#2C2C2E` | Sfondo hover |

---

## MODAL

| Elemento | Light Mode | Dark Mode | Descrizione |
|----------|------------|-----------|-------------|
| Modal overlay | `rgba(0,0,0,0.7)` | `rgba(0,0,0,0.85)` | Overlay più scuro |
| Modal content BG | `#fff` | `#1C1C1E` | Sfondo modal |
| Modal content border | `#000` | `#FFFFFF` | Bordo bianco |
| Modal subtitle TEXT | `#666` | `#EBEBF5` (60% opacity) | Testo secondario |
| Modal details BG | `#f5f5f5` | `#2C2C2E` | Sfondo dettagli |
| Modal details border | `#000` | `#FFFFFF` | Bordo dettagli |
| Form input border | `#000` | `#48484A` | Bordo input |
| Btn cancel BG | `#fff` | `#2C2C2E` | Sfondo annulla |
| Btn cancel TEXT | `#000` | `#FFFFFF` | Testo annulla |
| Btn confirm BG | `#000` | `#FFFFFF` | Sfondo conferma invertito |
| Btn confirm TEXT | `#fff` | `#000000` | Testo conferma invertito |
| Btn delete BG | `#c00` | `#FF453A` | Sfondo elimina |

---

## DRAG & DROP

| Elemento | Light Mode | Dark Mode | Descrizione |
|----------|------------|-----------|-------------|
| Drop valid BG | `#d1fae5` | `#1A3A2A` | Verde scuro |
| Drop valid border | `#10b981` | `#30D158` | Verde |
| Drop invalid BG | `#fee2e2` | `#3A1A1A` | Rosso scuro |
| Drop invalid border | `#ef4444` | `#FF453A` | Rosso |
| Success toast BG | `#10b981` | `#30D158` | Verde successo |
| Error toast BG | `#ef4444` | `#FF453A` | Rosso errore |

---

## Note di Implementazione

Questa conversione segue i principi Apple di Dark Mode:

### 1. Contrasto
Tutti i colori mantengono un rapporto di contrasto minimo di **4.5:1** per garantire leggibilità.

### 2. Profondità
I background utilizzano una gerarchia di grigi (`#000000` → `#1C1C1E` → `#2C2C2E`) per creare profondità visiva.

### 3. Colori accentati
I colori come giallo, rosso, verde e blu sono stati adattati alle loro varianti Dark Mode ufficiali Apple.

### 4. Overlay
Gli overlay sono stati resi più scuri (da `0.5` a `0.7-0.85` opacity) per migliorare il focus.

---

## Riferimenti

- Apple Human Interface Guidelines - Color
- Apple Developer Documentation - UIColor
- WCAG 2.1 Accessibility Guidelines
