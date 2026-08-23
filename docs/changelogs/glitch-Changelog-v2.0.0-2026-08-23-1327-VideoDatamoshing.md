---
date_created: 2026-08-23 13:27:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-23 13:27:00
---

# v2.0.0 — Echtes Video-Datamoshing (2026-08-23)
- Neuer Video-Modus (`video.html`) mit Mode-Switch in der Nav (Foto ↔ Video)
- Server-Backend `glitch-video-api.service` (Flask + Gunicorn, Port 5007, neu auf dem Server installiert inkl. `ffmpeg` via apt): zwei Endpoints
  - `POST /api/glitch/prepare` — transcodiert Upload zu moshbarem AVI (mpeg4/xvid, 480px, 15fps, GOP 15, max. 20s)
  - `POST /api/glitch/render` — dekodiert korrumpiertes AVI zu H.264/MP4 für Vorschau & Download
- Neuer clientseitiger AVI/MPEG4-Parser (`js/datamosh.js`): erkennt I-/P-Frames über VOP-Start-Code, echte Byte-Manipulation ohne Zwischen-Encoding
- Drei Datamosh-Operationen, alle live auf einer Canvas-Timeline visualisiert und per Drag steuerbar:
  - Cut-Point (Timeline-Drag): I-Frames ab dieser Position werden entfernt → klassischer Melt/Smear-Effekt
  - Wiederhol-Fenster/-Anzahl: P-Frames vor dem Cut-Point mehrfach wiederholen (Freeze/Drag)
  - Byte-Rauschen: zufällige Byte-Korruption in P-Frames nach dem Cut-Point, mit 🎲-Seed
- Nginx-Vhost erweitert: `/api/` → proxy_pass zu Port 5007, `client_max_body_size 150M`
- Technik server- und clientseitig validiert (manuelle AVI-Byte-Tests gegen echtes ffmpeg, bevor der Parser gebaut wurde) und end-to-end live auf glitch.bensn.me getestet (Desktop + Mobile)
