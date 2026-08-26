---
date_created: 2026-08-27 01:26:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-27 01:26:00
---

# v2.3.0 — Ebenen-System (2026-08-27)

Foto-Modus von "ein Bild, ein Effekt-Stack" auf ein echtes Ebenen-System umgebaut — Grundlage für Bild-Überlagerung, Collagen und (nächste Version) Masken.

- Beliebig viele Bilder als Ebenen hochladen (Mehrfachauswahl, Drag&Drop) oder mit "Neue Leinwand" (freie Breite/Höhe, Hintergrund weiß/schwarz/transparent) bei null anfangen
- 16 klassische Blend-Modi pro Ebene (Multiplizieren, Negativ multiplizieren, Ineinanderkopieren, Abdunkeln, Aufhellen, Farbig abwedeln/nachbelichten, Hartes/Weiches Licht, Differenz, Ausschluss, Farbton, Sättigung, Farbe, Luminanz) — laufen komplett über die native Canvas-`globalCompositeOperation`, kein eigener Blend-Code nötig
- Deckkraft- und Größen-Regler pro Ebene, Verschieben per Drag direkt auf dem Canvas
- Jede Ebene hat ihren **eigenen** Effekt-Stack (alle bisherigen Foto-Effekte weiterhin nutzbar, jetzt pro Ebene statt global) — Effekt-Rendering ist pro Ebene gecacht, Verschieben/Deckkraft/Blend-Modus-Änderungen lösen kein Neu-Rendern der Effekte aus, nur die Kompositierung
- Ebenen-Reihenfolge per ↑/↓ oder Drag&Drop
- Export in voller Qualität berücksichtigt jetzt alle Ebenen gemeinsam (weiterhin bis 4000px, Pixel-Maß-Parameter skalieren proportional mit)

End-to-end getestet: zwei Ebenen mit unterschiedlichen Blend-Modi/Deckkraft/Position, Effekt nur auf einer Ebene, Ebenen-Reordering, "Neue Leinwand" mit transparentem Hintergrund, Export-Canvas bei voller Zielauflösung (4000×4000px bestätigt).

**Zurückgestellt (nächste Version):** Crop pro Ebene/Komposition, Effekt-Masken (Kreis/Rechteck/Pen-Tool).
