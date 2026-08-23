---
date_created: 2026-08-23 10:17:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-23 10:17:00
---

# v1.0.0 — Image Editor Launch (2026-08-23)
- Neues Projekt: glitch.bensn.me — clientseitiger Bild-Glitch-Editor (Vanilla JS + Canvas, kein Backend)
- Upload per Drag&Drop, Klick oder Paste (⌘V)
- Effekt-Stack: beliebig viele Effekte hinzufügen, umsortieren, togglen, entfernen, live Vorschau
- 10 Effekte implementiert: Pixel Sort, Dithering (Floyd–Steinberg / Atkinson / Bayer / Random), RGB Shift, Scanlines, Noise, Block Glitch, Posterize, Wave Distortion, JPEG Crunch, Invert
- "Zufalls-Glitch"-Button für spontane Effekt-Kombinationen
- Download als PNG
- Design im bestehenden Bensn-Hub-System (bensn.css, Syne/DM Mono, App-Navbar), öffentlich erreichbar ohne Auth
- Bild wird auf max. 1600px Kantenlänge herunterskaliert für performante Verarbeitung
