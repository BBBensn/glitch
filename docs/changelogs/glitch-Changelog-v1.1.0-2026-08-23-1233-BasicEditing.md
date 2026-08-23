---
date_created: 2026-08-23 12:33:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-23 12:33:00
---

# v1.1.0 — Basic Editing (2026-08-23)
- Neuer Effekt "Grundkorrektur": Helligkeit, Kontrast, Sättigung
- Neuer Effekt "Gradationskurve": interaktives Kurven-Widget (Punkte setzen/verschieben/löschen, Catmull-Rom-Interpolation), neuer Param-Typ `curve` mit Touch-Unterstützung
- Neuer Effekt "Farbüberlagerung": Farbe + Blend-Modus (Normal/Multiplizieren/Negativ multiplizieren/Ineinanderkopieren/Farbton) + Deckkraft, neuer Param-Typ `color`
- Neuer Effekt "Pixelation": Mosaik-Effekt mit Blockgrößen-Regler und optionalem Displacement-Regler für Glitch-Look
- `defaultParams()` klont jetzt Array-Defaults (Kurvenpunkte), damit mehrere Instanzen sich keine Referenz teilen
