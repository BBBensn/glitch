---
date_created: 2026-08-23 15:24:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-23 15:24:00
---

# v2.1.0 — Multi-Clip-Merge & Verlaufsüberlagerung (2026-08-23)

**Video-Modus komplett umgebaut:** statt einem einzelnen Video mit einem globalen Cut-Point können jetzt beliebig viele Clips hochgeladen, per In/Out getrimmt, in eine beliebige Reihenfolge gebracht und miteinander gemosht werden — der eigentliche Datamosh-Effekt (ein Video meltet ins andere) kommt erst durch das Fusionieren zweier unterschiedlicher Clips richtig zur Geltung.

- Beliebig viele Clips hochladen (Mehrfachauswahl/Drag&Drop), jeder Clip eine eigene Karte mit Mini-Timeline
- Pro Clip: In/Out-Trim + eigener Cut-Point (alle drei per Drag direkt auf der Timeline), Reihenfolge per ↑/↓
- Erster Clip snapt beim Trimmen auf das nächste I-Frame (gültige Decoder-Referenz), spätere Clips starten bewusst ohne eigenes I-Frame → erben die eingefrorene Referenz des vorigen Clips (klassischer Zwei-Video-Morph)
- Funktioniert weiterhin auch mit nur einem Clip (interner Melt, wie die alte Version)
- Neuer Button "Ohne Moshing ansehen" — rendert dieselbe Clip-Reihenfolge sauber verkettet, als Referenz-Vorschau ohne Korruption
- `datamosh.js`: `Datamosh.mosh()` ersetzt durch `Datamosh.selectClipFrames()` + `Datamosh.mergeAndMosh()` für Multi-Source-Merge
- End-to-end mit zwei visuell unterschiedlichen Testclips verifiziert (Farbbalken-Muster morpht sichtbar in ein Mandelbrot-Fraktal)

**Foto-Modus:** neuer Effekt "Verlaufsüberlagerung" — Farbverlauf zwischen zwei Farben mit einstellbarem Winkel, über die 5 bekannten Blend-Modi (Normal/Multiplizieren/Negativ multiplizieren/Ineinanderkopieren/Farbton) und Deckkraft. Die Blend-Logik von Farbüberlagerung wurde dafür in eine gemeinsame `blendChannels()`-Funktion extrahiert (Duplikation entfernt).

**Zurückgestellt (nächste Version):** Masken-Funktion für Effekte (Kreis/Rechteck/Pen-Tool, Effekte nur in einem gewählten Bereich anwenden) — bewusst verschoben, da Datamoshing Priorität hatte.
