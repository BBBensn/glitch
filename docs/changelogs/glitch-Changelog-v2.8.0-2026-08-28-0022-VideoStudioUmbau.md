---
date_created: 2026-08-28 00:22:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-28 00:22:00
---

# v2.8.0 — Video-Modus-Umbau: Timeline, Auto-Render, Leinwand, mehr Kontrolle pro Clip (2026-08-28)

**Timeline-Umbau:** die bisherige Liste hoher Karten (eine pro Clip, jede mit eigener Mini-Timeline) weicht einem kompakten Clip-Strip + einem einzigen Detail-Panel für den gerade aktiven Clip — dasselbe Muster wie die Ebenen-Liste im Foto-Modus. Klick auf einen Clip im Strip öffnet dessen komplette Steuerung darunter: frame-genaue Timeline (In/Out/Cut-Point), Zuschnitt, Farbe, Datamosh, Glitch-Filter.

**Auto-Render:** Änderungen rendern automatisch neu (debounced, ~700ms nach der letzten Eingabe) statt einen manuellen Klick auf "Vorschau rendern" zu verlangen. Ein Generation-Counter sorgt dafür, dass eine veraltete Server-Antwort niemals eine neuere überschreibt, auch wenn mehrere Änderungen schnell hintereinander passieren. "Vorschau rendern" heißt jetzt "Jetzt aktualisieren" und erzwingt es sofort als Fallback.

**Mehr Kontrolle pro Clip:** die bisher global geteilten Datamosh-Parameter (Wiederhol-Fenster/-Anzahl, Byte-Rauschen) sind jetzt individuell pro Clip einstellbar — echte Verhaltensänderung, jeder Clip ist jetzt unabhängig geseedet statt einen gemeinsamen Zufallsstrom zu teilen. Neu dazu: vier klassische Glitch-Filter pro Clip (RGB-Shift, Noise, Pixelate, Scanlines), als ffmpeg-Filter im selben Segment-basierten Mechanismus wie die bestehende Farbkorrektur.

**Leinwand-System:** analog zum "Neue Leinwand"-Prinzip im Foto-Modus lässt sich jetzt eine feste Ziel-Auflösung/Seitenverhältnis festlegen (Presets für Hochformat/Quadrat/Querformat, z.B. für Instagram) — jeder Clip wird automatisch eingepasst (Füllen/Cover mit Versatz-Reglern, Einpassen/Contain mit Hintergrundfarbe, oder bewusst verzerrendes Strecken). Ohne explizite Wahl legt der erste hochgeladene Clip die Leinwand anhand seines eigenen Seitenverhältnisses fest. Nebeneffekt: behebt einen latenten Bug, bei dem Clips mit unterschiedlichem Quell-Seitenverhältnis unterschiedliche Proxy-Höhen bekamen und potenziell nicht mehr sauber zusammen gemosht werden konnten.

**Ein während der Umsetzung gefundener und gefixter Bug:** beim gleichzeitigen Hochladen mehrerer Clips liefen die initialen `/prepare`-Aufrufe parallel — welche Antwort zuerst zurückkam, legte (fälschlich) die Leinwand fest, unabhängig von der tatsächlichen Reihenfolge. Gefixt über eine globale sequenzielle Prepare-Queue, damit die Leinwand deterministisch vom wirklich ersten Clip stammt.

Alle neuen ffmpeg-Filterketten (Leinwand-Zuschnitt, die vier Glitch-Filter) wurden vor dem Einbau einzeln gegen echtes ffmpeg smoke-getestet — sowohl lokal (8.0.1) als auch direkt gegen den Produktions-ffmpeg (6.1.1), da sich Filter-Verhalten zwischen Versionen unterscheiden kann (z.B. verlangt der `geq`-Scanline-Filter kleingeschriebene `lum()`/`cb()`/`cr()`-Funktionsnamen).

End-to-end getestet: zwei Test-Clips mit unterschiedlichem Seitenverhältnis (Quer- und Hochformat), Leinwand-Etablierung durch den ersten Clip bestätigt (Race-Condition-Fix verifiziert), Cover- und Contain-Zuschnitt visuell bestätigt (Frame-Extraktion), Leinwand-Modal mit Preset-Wechsel inkl. automatischem Re-Prepare aller Clips, RGB-Shift/Noise/Pixelate/Scanlines einzeln und kombiniert (lokal und live), unabhängige Datamosh-Parameter pro Clip, High-Quality-Export mit korrekt skalierter Leinwand-Auflösung. Keine Konsolenfehler.
