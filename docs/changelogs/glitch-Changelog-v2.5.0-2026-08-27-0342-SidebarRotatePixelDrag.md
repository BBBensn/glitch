---
date_created: 2026-08-27 03:42:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-27 03:42:00
---

# v2.5.0 — Scrollbare Sidebar, Drehen/Spiegeln, Pixel Drag (2026-08-27)

**Sidebar-Layout gefixt:** Ebenen- und Effekt-Panel waren bei vielen Ebenen/Effekten so lang, dass man bis unten scrollen musste und dabei das Bild aus dem Blickfeld verlor. Jetzt: beide Panels sind unabhängig scrollbar (eigene Scrollbar je Liste), die Sidebar ist `position: sticky` und bleibt beim Scrollen im Viewport. Jede Ebenen-Karte ist über einen Chevron-Button einklappbar (zeigt nur noch Name + Sichtbarkeit + Reorder) — neu ausgewählte Ebenen klappen automatisch auf, andere bleiben wie eingestellt.

**Drehen & Spiegeln pro Ebene:** ↺/↻ (90°-Schritte) + horizontal/vertikal spiegeln. Bewusst als Ebenen-Eigenschaft umgesetzt statt als Effekt-Stack-Eintrag, da eine 90°/270°-Drehung Breite/Höhe vertauscht — das passt nicht ins Effekt-Stack-Modell (feste Dimensionen, mehrfach hinzufügbar). Läuft in der Render-Pipeline vor Crop-Ausschnitt und Effekt-Stack, per nativer Canvas-Transform (kein manuelles Pixel-Remapping).

**Neuer Effekt "Pixel Drag":** Richtungs-Schmier-Effekt — zufällige Zeilen/Spalten werden mit variabler Länge "gezogen", mit leichtem Farbversatz zwischen den RGB-Kanälen pro Streak. Passt zum "Melt/Drip"-Look mit Farbfransen, wie in den mitgeschickten Referenzbildern zu sehen.

**Bug gefunden (Test-Artefakt, kein echter Code-Fehler):** beim Testen tauchte ein `def.apply is not a function`-Fehler auf — der Browser hatte eine alte, gecachte Version von `effects.js` geladen, obwohl auf dem Server längst die neue Version lag. Als Konsequenz: `index.html`/`video.html` referenzieren `css/style.css` und alle `js/*.js`-Dateien jetzt mit `?v=2.5.0` — bei jedem künftigen Deploy mit JS/CSS-Änderungen muss diese Versionsnummer mitgezogen werden, sonst droht genau dieser stille Alt/Neu-Mix.

End-to-end getestet: Scroll-Verhalten mit 5 Ebenen, Karten-Collapse, 90°-Rotation (Seitenverhältnis korrekt vertauscht, keine Verzerrung), horizontale Spiegelung, Pixel Drag in Kombination mit Rotation+Spiegelung, Export mit allen kombiniert, mobile Ansicht.
