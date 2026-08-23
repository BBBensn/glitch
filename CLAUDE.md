# glitch — CLAUDE.md

Projekt-spezifischer Kontext. Ergänzt `~/.claude/CLAUDE.md`.

---

## Projekt-Basics

- **Name:** glitch
- **Domain:** glitch.bensn.me
- **Version:** v2.0.0
- **Status:** active
- **Stack:** Vanilla JS + Canvas API (Foto-Modus, clientseitig, kein Backend) + Flask/ffmpeg-Backend (Video-Modus, Port 5007)

---

## Lokale Struktur

```
~/Documents/Coding/glitch.bensn.me/
├── index.html          ← Foto-Modus (Upload, Canvas, Effekt-Stack UI)
├── video.html            ← Video-Modus (Upload, Timeline, Datamosh-Parameter)
├── css/style.css          ← Editor-UI, nutzt CSS-Vars aus bensn.css
├── js/
│   ├── effects.js          ← Foto: reine Effekt-Funktionen (ImageData in/out)
│   ├── app.js                ← Foto: State, UI-Wiring, Render-Pipeline
│   ├── datamosh.js            ← Video: AVI/MPEG4-Parser + Byte-Manipulation (pure Funktionen)
│   └── video-app.js            ← Video: Upload/Prepare/Render-Wiring, Timeline-UI
├── server/
│   └── app.py                  ← Flask-Backend: ffmpeg-Wrapper (prepare/render)
├── docs/changelogs/
├── CLAUDE.md
└── .gitignore
```

Foto-Modus: kein Build-Step, keine Dependencies, rein statisch.
Video-Modus: braucht das Flask-Backend für die ffmpeg-Schritte (Encode → moshbares AVI, Decode → MP4).

---

## Remote-Struktur

```
/var/www/glitch/
├── index.html
├── video.html
├── css/style.css
├── js/*.js
└── api/app.py            ← Flask-Backend (systemd: glitch-video-api.service, Port 5007)
```

Nginx: `/api/` → proxy_pass zu 127.0.0.1:5007, `client_max_body_size 150M`.

---

## Deploy

```bash
# Frontend (Foto + Video)
scp ~/Documents/Coding/glitch.bensn.me/index.html ~/Documents/Coding/glitch.bensn.me/video.html \
  bensn:/var/www/glitch/
scp ~/Documents/Coding/glitch.bensn.me/css/style.css bensn:/var/www/glitch/css/style.css
scp ~/Documents/Coding/glitch.bensn.me/js/*.js bensn:/var/www/glitch/js/

# Backend
scp ~/Documents/Coding/glitch.bensn.me/server/app.py bensn:/var/www/glitch/api/app.py
ssh bensn systemctl restart glitch-video-api
```

Kein `systemctl restart` für Frontend-Änderungen nötig (statisch, direkt live nach Upload).

---

## Git

- **Repo:** `https://github.com/BBBensn/glitch`
- **Remote:** `git@github.com:BBBensn/glitch.git`

```bash
git add .
git commit -m "Add [feature]"
git push origin main
```

---

## Auth

- [x] Öffentlich — kein Auth (bewusste Entscheidung, kreatives Tool ohne sensible Daten)

---

## Design & Effekte (Foto-Modus)

- Nutzt Shared Design System (`https://bensn.me/shared/bensn.css`, Syne/DM Mono Fonts, App-Navbar-Pattern)
- Bild wird beim Upload auf max. 1600px Kantenlänge herunterskaliert (Performance bei Pixel Sort etc.)
- Effekt-Stack: beliebig viele Effekte hinzufügen, umsortieren (↑/↓), togglen, entfernen — Pipeline rendert bei jeder Parameteränderung neu vom Original-Bild aus
- Effekte mit Zufallskomponente (Dithering "Random", Noise, Block Glitch) haben einen 🎲-Button zum Neu-Würfeln (fester Seed für Reproduzierbarkeit bis zum Reroll)

**Effekte (Bilder):**
Grundkorrektur (Helligkeit/Kontrast/Sättigung), Gradationskurve, Farbüberlagerung, Pixelation (mit Displacement), Pixel Sort, Dithering (Floyd–Steinberg / Atkinson / Bayer / Random), RGB Shift, Scanlines, Noise, Block Glitch, Posterize, Wave Distortion, JPEG Crunch, Invert

---

## Video-Modus: echtes Datamoshing

**Prinzip:** kein Filter-Effekt, sondern echte Byte-Manipulation am MPEG-4-Bitstream (AVI-Container) — I-Frames werden aus dem Rohdatenstrom entfernt, wodurch der Decoder P-Frame-Bewegungsvektoren auf veraltete Referenzframes anwendet ("melt/smear"-Effekt). Genau die Technik, die Avidemux & Co. auch nutzen.

**Pipeline:**
1. **Prepare (Server, `/api/glitch/prepare`):** Upload → ffmpeg transcodiert zu einem "moshbaren" AVI (`mpeg4`/xvid-Codec, 480px breit, 15fps, `-g 15` → alle ~1s ein I-Frame, keine B-Frames, max. 20s). Läuft server-seitig, weil ein echter Encoder gebraucht wird.
2. **Parse + Mosh (Client, `datamosh.js`):** Reines JS liest die RIFF/AVI-Struktur, erkennt I-/P-Frames über den VOP-Start-Code (`0x000001B6`, Typ-Bits danach), und baut anhand der UI-Parameter eine neue Byte-Sequenz:
   - **Cut-Point** (Drag auf der Timeline): alle I-Frames ab dieser Position werden entfernt → Kernstück des Effekts
   - **Wiederhol-Fenster/-Anzahl**: die P-Frames direkt vor dem Cut-Point werden N-mal wiederholt (Freeze/Drag-Effekt)
   - **Byte-Rauschen**: zufällige Bytes in P-Frames nach dem Cut-Point werden korrumpiert (Intensität 0–100 → 0–15% Flip-Wahrscheinlichkeit)
   - Frame 0 (erster I-Frame) wird nie entfernt — sonst hat der Decoder keine Referenz und alles bricht
   - Kein Header-Patching nötig (dwTotalFrames/idx1 werden nicht korrigiert) — ffmpeg liest das trotzdem sauber, da es movi einfach scannt (empirisch getestet)
3. **Render (Server, `/api/glitch/render`):** der korrumpierte AVI-Byte-Stream wird hochgeladen, ffmpeg dekodiert ihn (toleriert die fehlenden I-Frames) und encodet zu H.264/MP4 für Vorschau + Download. Kein Live-Preview ohne Server-Roundtrip möglich, da Browser kein rohes MPEG-4/AVI abspielen können.

**Warum kein ffmpeg.wasm:** die Byte-Manipulation selbst ist reines JS (schnell, interaktiv, kein Encoder nötig). Nur die zwei Encode/Decode-Schritte brauchen einen echten Codec — dafür reicht ein schlanker Server-Endpoint, ohne WASM-Overhead im Browser.

---

## Server & Ports

| Dienst | Port | systemd |
|---|---|---|
| glitch-video-api (Flask + Gunicorn, 2 Worker, Timeout 120s) | 127.0.0.1:5007 | `glitch-video-api.service` |

ffmpeg wurde für dieses Projekt via `apt install ffmpeg` auf dem Server installiert (war vorher nicht vorhanden).

---

## Projekt-spezifische Konventionen

- Foto-Effekte sind reine Funktionen in `effects.js`: `(imageData, width, height, params) => void | ImageData`
- Neue Foto-Effekte registrieren: Eintrag in `EFFECT_DEFS` (app.js) mit `id`, `label`, `color`, `params`-Schema, `apply`-Funktion — UI generiert Controls automatisch
- Param-Typen (Foto): `range`, `select`, `checkbox`, `color`, `curve`, `seed`
- Video-Backend-Endpoints geben bei Fehlern `{error: "..."}` mit passendem HTTP-Status zurück — Frontend zeigt das direkt an

---

## Roadmap

| Version | Feature | Status |
|---------|---------|--------|
| v1.0.0 | Bild-Editor: Pixelsort, Dithering, RGB-Shift, Scanlines, Noise, Block Glitch, Posterize, Wave, JPEG Crunch, Invert | ✅ done |
| v1.1.0 | Basic-Editing: Grundkorrektur, Gradationskurve, Farbüberlagerung, Pixelation | ✅ done |
| v2.0.0 | Video-Datamoshing: Server-Backend (ffmpeg) + clientseitige AVI-Byte-Manipulation | ✅ done |

---

## Bekannte Einschränkungen (Video-Modus)

- Max. 20s Clip-Länge, 480px Breite, 15fps für den Moshable-Proxy (Performance + Payload-Größe)
- Kein Live-Preview während des Reglerziehens — "Vorschau rendern" macht einen Server-Roundtrip (ffmpeg-Encode dauert ein paar Sekunden)
- Bei sehr hohem Byte-Rauschen kann ffmpeg beim Rendern scheitern (Fehlermeldung im UI) — dann Intensität reduzieren

---

## Obsidian-Doku

- Projekt-MD: `03_Projects/Coding PC/glitch/glitch.md`
- Changelogs: `03_Projects/Coding PC/glitch/Changelogs/`
- Changelog-All: `03_Projects/Coding PC/glitch/glitch-Changelog-All.md`
