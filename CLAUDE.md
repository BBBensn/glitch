# glitch — CLAUDE.md

Projekt-spezifischer Kontext. Ergänzt `~/.claude/CLAUDE.md`.

---

## Projekt-Basics

- **Name:** glitch
- **Domain:** glitch.bensn.me
- **Version:** v1.1.0
- **Status:** active
- **Stack:** Vanilla JS + Canvas API (rein clientseitig, kein Backend)

---

## Lokale Struktur

```
~/Documents/Coding/glitch.bensn.me/
├── index.html          ← Editor (Upload, Canvas, Effekt-Stack UI)
├── css/style.css        ← Editor-UI, nutzt CSS-Vars aus bensn.css
├── js/
│   ├── effects.js        ← reine Effekt-Funktionen (ImageData in/out)
│   └── app.js             ← State, UI-Wiring, Render-Pipeline
├── docs/changelogs/
├── CLAUDE.md
└── .gitignore
```

Kein Build-Step, keine Dependencies — direkt deploybare statische Dateien.

---

## Remote-Struktur

```
/var/www/glitch/
├── index.html
├── css/style.css
└── js/effects.js, app.js
```

Rein statisch, kein Backend/Port/systemd-Service nötig.

---

## Deploy

```bash
ssh bensn "mkdir -p /var/www/glitch/css /var/www/glitch/js"
scp ~/Documents/Coding/glitch.bensn.me/index.html bensn:/var/www/glitch/index.html
scp ~/Documents/Coding/glitch.bensn.me/css/style.css bensn:/var/www/glitch/css/style.css
scp ~/Documents/Coding/glitch.bensn.me/js/*.js bensn:/var/www/glitch/js/
```

Kein `systemctl restart` nötig (statisch, direkt live nach Upload).

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

## Design & Effekte

- Nutzt Shared Design System (`https://bensn.me/shared/bensn.css`, Syne/DM Mono Fonts, App-Navbar-Pattern)
- Bild wird beim Upload auf max. 1600px Kantenlänge herunterskaliert (Performance bei Pixel Sort etc.)
- Effekt-Stack: beliebig viele Effekte hinzufügen, umsortieren (↑/↓), togglen, entfernen — Pipeline rendert bei jeder Parameteränderung neu vom Original-Bild aus
- Effekte mit Zufallskomponente (Dithering "Random", Noise, Block Glitch) haben einen 🎲-Button zum Neu-Würfeln (fester Seed für Reproduzierbarkeit bis zum Reroll)

**Effekte (Bilder):**
Grundkorrektur (Helligkeit/Kontrast/Sättigung), Gradationskurve, Farbüberlagerung, Pixelation (mit Displacement), Pixel Sort, Dithering (Floyd–Steinberg / Atkinson / Bayer / Random), RGB Shift, Scanlines, Noise, Block Glitch, Posterize, Wave Distortion, JPEG Crunch, Invert

---

## Projekt-spezifische Konventionen

- Effekte sind reine Funktionen in `effects.js`: `(imageData, width, height, params) => void | ImageData` — mutieren entweder in-place oder geben neue ImageData zurück (z.B. `jpegCrunch`, da async über Canvas-Reencoding)
- Neue Effekte registrieren: Eintrag in `EFFECT_DEFS` (app.js) mit `id`, `label`, `color`, `params`-Schema, `apply`-Funktion — UI generiert Controls automatisch aus dem Schema
- Param-Typen: `range`, `select`, `checkbox`, `color`, `curve` (interaktives Kurven-Widget, Punkte via Catmull-Rom interpoliert), `seed` (versteckt, nur 🎲-Button)

---

## Roadmap

| Version | Feature | Status |
|---------|---------|--------|
| v1.0.0 | Bild-Editor: Pixelsort, Dithering, RGB-Shift, Scanlines, Noise, Block Glitch, Posterize, Wave, JPEG Crunch, Invert | ✅ done |
| v1.1.0 | Basic-Editing: Grundkorrektur, Gradationskurve, Farbüberlagerung, Pixelation | ✅ done |
| v2.0.0 | Video-Datamoshing (Upload → moshbares Format → I-Frame-Removal/Korruption → Export) | geplant |

---

## Offene Fragen für v2 (Video/Datamoshing)

- Datamoshing braucht Codec-Manipulation (I-Frames entfernen/korrumpieren in einem P-Frame-lastigen Format wie MPEG-4 Part 2) — im Browser via ffmpeg.wasm möglich, aber langsam bei größeren Videos. Alternative: kleiner Python/Flask-Backend mit echtem ffmpeg auf dem Server (neuer Port + systemd-Service nötig, z.B. 5005 — 5004 ist für Health Tracker reserviert).
- Muss vor Start von v2 geklärt werden: clientseitig (ffmpeg.wasm, langsamer, kein Server nötig) vs. serverseitig (schneller, aber neuer Service).

---

## Obsidian-Doku

- Projekt-MD: `03_Projects/Coding PC/glitch/glitch.md`
- Changelogs: `03_Projects/Coding PC/glitch/Changelogs/`
- Changelog-All: `03_Projects/Coding PC/glitch/glitch-Changelog-All.md`
