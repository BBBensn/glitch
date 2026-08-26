---
date_created: 2026-08-27 01:16:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-27 01:16:00
---

# v2.2.0 — Export-Qualität, Drag&Drop, Video-Grundkorrektur (2026-08-27)

**Foto-Modus:**
- Effekt-Stack per Drag&Drop umsortierbar (⠿-Handle), zusätzlich zu den bestehenden ↑/↓-Buttons
- Export in voller Auflösung: Download rendert die komplette Pipeline neu gegen das Original-Bild (bis 4000px), nicht die 1600px-Editier-Auflösung. Pixel-Maß-Parameter (Blockgröße, Amplitude, RGB-Shift-Stärke, Scanline-Abstand/Dicke) skalieren proportional mit, damit der Export optisch der Vorschau entspricht

**Video-Modus:**
- Neue Grundkorrektur (Helligkeit/Kontrast/Sättigung) über ffmpeg `eq`-Filter im Render-Schritt
- Export in 720p/1080p: Clips werden bei Klick in der gewählten Auflösung neu vorbereitet, dieselben Trim/Cut-Point-Entscheidungen (Frame-Indizes bleiben auflösungsunabhängig gültig) angewendet und mit höherer Qualität (`crf=16`) gerendert — "Vorschau rendern" bleibt schnell bei 480p für die Iteration

**Backend:** `/api/glitch/prepare` akzeptiert jetzt `width` (Cap 1920px), `/api/glitch/render` akzeptiert `brightness`/`contrast`/`saturation`/`quality`.
