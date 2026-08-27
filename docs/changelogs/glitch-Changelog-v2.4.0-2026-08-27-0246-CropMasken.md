---
date_created: 2026-08-27 02:46:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-27 02:46:00
---

# v2.4.0 — Crop, Masken, Leinwand-Farbwähler (2026-08-27)

**Leinwand-Hintergrund:** "Neue Leinwand" hat jetzt einen echten Farbwähler statt der festen Weiß/Schwarz/Transparent-Auswahl, plus eine separate "Transparent"-Checkbox. `canvasBg` speichert entweder `'transparent'` oder einen Hex-Wert.

**Crop pro Ebene:** neuer "Zuschneiden"-Button pro Ebene — vier Kanten-Handles direkt auf den Ebenen-Bounds im Canvas, Ziehen trimmt eine Kante ohne den Rest neu zu skalieren (gleiche Pixeldichte bleibt erhalten). "Crop zurücksetzen" stellt das Originalbild wieder her.

**Crop der Komposition:** "Leinwand zuschneiden" im Toolbar — dieselbe Kanten-Handle-Logik, diesmal über die ganze Leinwand mit gedimmtem Bereich außerhalb der Auswahl. "Übernehmen" verschiebt alle Ebenen entsprechend und verkleinert die Leinwand, "Abbrechen" verwirft.

**Effekt-Masken:** neuer "◐"-Button an jedem Effekt im Stack öffnet den Masken-Editor — auf dem Bild ziehen zeichnet ein Rechteck oder eine Ellipse (Shape-Umschalter), dazu Weichzeichnung (Feather) und Invertieren. Der Effekt läuft weiterhin auf dem ganzen Bild, wird aber nur innerhalb der Maske mit dem Original gemischt — funktioniert dadurch für jeden bestehenden Effekt ohne Sonderfall. Genau der ursprünglich gewünschte Anwendungsfall funktioniert jetzt: Pixelation nur in einem Bereich, ein anderer Filter überlappend woanders.

Kein Pen-Tool/Lasso — bewusst zurückgestellt (war als "wenn nicht zu aufwendig" markiert, und Rechteck+Ellipse decken den Kernwunsch bereits ab).

**Bugs beim Bau gefunden und gefixt:** Crop-/Masken-Panels aktualisierten sich nach einem Drag nicht sofort (z.B. der Weichzeichnung-Regler tauchte erst nach einer zusätzlichen Aktion auf, "Crop zurücksetzen" blieb unsichtbar) — die drei neuen Modi (Ebenen-Crop, Leinwand-Crop, Masken-Editor) rendern jetzt nach jedem Drag-Ende ihre jeweilige UI-Sektion neu und schließen sich über eine gemeinsame `exitEditModes()`-Funktion sauber gegenseitig aus.

End-to-end getestet: Kanten-Crop (Ebene + Leinwand), Rechteck- und Ellipsen-Maske mit Feather/Invert auf dem Pixelation-Effekt, Export mit aktiver Maske.
