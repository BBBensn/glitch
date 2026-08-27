---
date_created: 2026-08-28 01:27:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-28 01:27:00
---

# v2.10.0 — Vorschau-Höhe gedeckelt, Farbstich-Effekt pro Clip (2026-08-28)

**Vorschau-Höhe begrenzt:** `.video-preview` bekommt jetzt `max-height: 42vh` — bei Hochformat-/9:16-Clips füllte das Vorschau-Video vorher fast die ganze Seite und verdrängte Clip-Strip und Timeline nach unten. Jetzt bleibt genug Platz, damit I-/P-Frame-Timeline direkt sichtbar ist.

**Neuer Effekt "Farbstich" pro Clip:** färbt den Clip Richtung einer frei wählbaren Farbe ein — klassischer Anwendungsfall ist ein grüner CCTV-/Nachtsicht-Look, funktioniert aber mit jeder Farbe. Ein Regler "Stärke" blendet stufenlos zwischen Originalfarben (0%) und vollem Farbstich (100%), inklusive "Auf alle Clips anwenden"-Button wie bei der bestehenden Farbkorrektur. Technisch: Server leitet aus der gewählten Farbe Hue/Sättigung ab und nutzt ffmpegs `colorize`-Filter, gemischt mit dem Original per `blend` (split → colorize → blend), da ein reiner `colorize`-Ersatz das Bild komplett ersetzen würde und keine stufenlose Stärke zuließe.

**Ein hartnäckiger Bug beim Bauen, festgehalten für später:** ffmpegs `blend`-Parameter `all_opacity` ist entgegen der naheliegenden Annahme invertiert — `opacity=1` zeigt die *untere* (Original-)Ebene, `opacity=0` die *obere* (gefärbte). Die erste Implementierung hatte das genau andersrum, wodurch der Stärke-Regler bei hohen Werten fast wirkungslos war — auf den ersten Blick sahen die Vorschaubilder bei jedem Test einfach "unverändert" statt "leicht falsch" aus, was die Fehlersuche unnötig lang gemacht hat. Erst numerisches Pixel-Sampling (statt visuelles Prüfen von Screenshots) hat die tatsächliche Richtung aufgedeckt. Der Server rechnet jetzt `opacity = 1 - Stärke`, mit erklärendem Kommentar im Code.

End-to-end getestet: Preview-Höhen-Fix mit einem echten Hochformat-Testclip bestätigt (Timeline blieb sichtbar). Farbstich numerisch verifiziert (Pixelwerte vor/nach Aktivierung an mehreren Bildpunkten verglichen, nicht nur visuell) — sowohl lokal (ffmpeg 8.0.1) als auch direkt gegen den Produktions-ffmpeg (6.1.1). Toggle in beide Richtungen (aktiv/inaktiv) bestätigt korrektes Verhalten. Keine Konsolenfehler.
