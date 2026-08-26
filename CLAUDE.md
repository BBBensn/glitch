# glitch — CLAUDE.md

Projekt-spezifischer Kontext. Ergänzt `~/.claude/CLAUDE.md`.

---

## Projekt-Basics

- **Name:** glitch
- **Domain:** glitch.bensn.me
- **Version:** v2.3.0
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
- Effekte mit Zufallskomponente (Dithering "Random", Noise, Block Glitch) haben einen 🎲-Button zum Neu-Würfeln (fester Seed für Reproduzierbarkeit bis zum Reroll)

**Effekte (Bilder):**
Grundkorrektur (Helligkeit/Kontrast/Sättigung), Gradationskurve, Farbüberlagerung, Verlaufsüberlagerung, Pixelation (mit Displacement), Pixel Sort, Dithering (Floyd–Steinberg / Atkinson / Bayer / Random), RGB Shift, Scanlines, Noise, Block Glitch, Posterize, Wave Distortion, JPEG Crunch, Invert

Farbüberlagerung und Verlaufsüberlagerung teilen sich die Blend-Modi-Logik (`blendChannels()` in effects.js: normal/multiply/screen/overlay/color) — neue Blend-Modi dort zentral ergänzen. Das ist eine andere, kleinere Blend-Palette als die Ebenen-Kompositierung unten (Canvas-native Modi) — nicht verwechseln.

---

## Foto-Modus: Ebenen (Layers)

**Datenmodell:** `layers[]` (unten→oben), jede Ebene: `{ img, workW/workH (Arbeitsauflösung, ≤1600px), x/y/w/h (Platzierung in Canvas-Pixeln), baseW/baseH/scalePct (Größen-Regler-Referenz), blendMode, opacity, visible, stack (eigener Effekt-Stack), dirty, renderedCanvas (Cache) }`. Der gemeinsame Canvas (`canvasW/canvasH`) ist entweder die (herunterskalierte) Auflösung des ersten hochgeladenen Bildes oder aus "Neue Leinwand" (freie Breite/Höhe + Hintergrund weiß/schwarz/transparent).

**Rendering (`renderComposite()` in app.js):** pro sichtbarer Ebene bottom-to-top wird `renderLayerCanvas()` aufgerufen (rendert nur den *eigenen* Effekt-Stack der Ebene auf einen Offscreen-Canvas — **cached** über `layer.dirty`, wird nur bei Änderungen am Effekt-Stack dieser Ebene neu berechnet, nicht bei Verschieben/Resize/Deckkraft/Blend-Modus-Änderung anderer Ebenen), dann per `ctx.drawImage(..., x, y, w, h)` mit `ctx.globalAlpha` + `ctx.globalCompositeOperation` auf den Haupt-Canvas kompositiert.

**Wichtig — Blend-Modi sind nativ:** die 16 Modi in `BLEND_MODES` (app.js) sind exakt die [CSS Compositing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation) Werte (`multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`, plus `source-over` für "Normal"). Kein eigener Blend-Code nötig — der Browser übernimmt das. Das ist eine bewusste Design-Entscheidung: keine der 16 Photoshop-Modi händisch nachbauen.

**Interaktion:**
- Ebenen-Panel: Reorder per ↑/↓ oder Drag&Drop (⠿-Handle), Sichtbarkeit toggeln, Blend-Modus + Deckkraft + Größe (%) pro Ebene, Klick auf eine Karte macht sie zur `activeLayerId` — deren Effekt-Stack wird unten angezeigt/editiert
- Verschieben: Drag direkt auf dem Haupt-Canvas (nur innerhalb der Bounds der *aktiven* Ebene startet der Drag, `startLayerDrag`/`moveLayerDrag`)
- Größe: Prozent-Slider skaliert von `baseW/baseH` (der ursprünglichen "fit to canvas"-Größe) aus, zentriert um den Mittelpunkt

**Export in voller Qualität:** `renderCompositeAtResolution()` skaliert **alle** Ebenen gemeinsam hoch (Ziel: `EXPORT_MAX_DIM` = 4000px auf der langen Canvas-Seite) und rendert jede Ebene erneut mit `renderLayerAtScale()` gegen ihr Original-`img`. Params mit `scalesWithResolution: true` (z.B. `blockSize`, `amplitude`, RGB-Shift `amount`, Scanline `spacing`/`thickness`) werden proportional mitskaliert (`scaleParams()`), damit der Export optisch der Vorschau entspricht, nur schärfer. Neuer Foto-Effekt mit Pixel-Maßen? `scalesWithResolution: true` am Param nicht vergessen.

**Noch nicht gebaut (nächste Version):** Crop pro Ebene/Komposition, Effekt-Masken (Kreis/Rechteck/Pen-Tool) — siehe Roadmap.

---

## Video-Modus: echtes Datamoshing (Multi-Clip-Merge)

**Prinzip:** kein Filter-Effekt, sondern echte Byte-Manipulation am MPEG-4-Bitstream (AVI-Container) — I-Frames werden aus dem Rohdatenstrom entfernt, wodurch der Decoder P-Frame-Bewegungsvektoren auf veraltete Referenzframes anwendet ("melt/smear"-Effekt). Der Effekt wirkt am stärksten beim Fusionieren zweier unterschiedlicher Clips (Video A meltet in Video B), deshalb ist das UI um mehrere Clips herum gebaut, nicht um ein einzelnes Video.

**Workflow:**
1. Beliebig viele Videos hochladen (`+ Video hinzufügen`, Mehrfachauswahl oder Drag&Drop) — jedes wird einzeln server-seitig zu einem moshbaren AVI transkodiert (`/api/glitch/prepare`: mpeg4/xvid, 480px breit, 15fps, `-g 15` → alle ~1s ein I-Frame, keine B-Frames, max. 20s pro Clip)
2. Jeder Clip bekommt eine eigene Mini-Timeline (Canvas) mit drei Drag-Handles:
   - **In/Out** (orange): trimmt den Clip
   - **Cut-Point** (rote Linie): ab hier werden I-Frames *dieses* Clips entfernt
3. Reihenfolge der Clips per ↑/↓ festlegen — das ist die Reihenfolge im fertigen Video
4. Globale Parameter (Wiederhol-Fenster/-Anzahl, Byte-Rauschen) gelten an jedem Clip-Übergang
5. "Ohne Moshing ansehen" rendert dieselbe Clip-Abfolge sauber verkettet (kein Frame entfernt) — Referenz-Vorschau
6. "Vorschau rendern" moshed wirklich

**Kernlogik (`datamosh.js`, `Datamosh.selectClipFrames` + `Datamosh.mergeAndMosh`):**
- Für den **ersten** Clip wird der Start immer auf das nächste I-Frame ≤ inFrame zurückgesetzt (`isFirstClip` snapt), damit der Decoder am Anfang eine gültige Referenz hat — dessen allererstes Frame wird nie entfernt, egal wo der Cut-Point steht
- Für **spätere** Clips wird *nicht* gesnapt — der Clip startet bewusst mitten in seiner eigenen GOP, ohne eigenes I-Frame (per Default: Cut-Point = Clip-Start = sofortiger Morph). Dadurch erbt er beim Decodieren die "eingefrorene" Referenz des vorigen Clips → der eigentliche Morph-Effekt zwischen zwei Videos
- Innerhalb eines Clips ab `cutPoint`: alle I-Frames raus (klassischer interner Melt, funktioniert auch mit nur einem einzigen Clip genau wie die alte Version)
- Wiederhol-Fenster: die letzten N Frames eines Clips (vor dem Übergang zum nächsten) werden M-mal wiederholt (Freeze/Drag)
- Byte-Rauschen: zufällige Bytes in P-Frames ab `cutPoint` korrumpiert (0–100 → 0–15% Flip-Wahrscheinlichkeit)
- Alle Clips müssen mit identischen ffmpeg-Settings (`prepare`) transkodiert sein, sonst sind die VOL-Parameter (Auflösung/Codec-Profil) inkompatibel — deshalb läuft *jeder* Upload durch denselben `/api/glitch/prepare`-Aufruf
- Kein Header-Patching nötig (dwTotalFrames/idx1 werden nicht korrigiert) — ffmpeg liest das trotzdem sauber, da es `movi` einfach scannt (empirisch gegen echtes ffmpeg getestet, bevor der Parser gebaut wurde)

**Render (Server, `/api/glitch/render`):** der zusammengebaute/korrumpierte AVI-Byte-Stream wird hochgeladen, ffmpeg dekodiert ihn (toleriert die fehlenden I-Frames) und encodet zu H.264/MP4 für Vorschau + Download. Kein Live-Preview ohne Server-Roundtrip möglich, da Browser kein rohes MPEG-4/AVI abspielen können.

**Warum kein ffmpeg.wasm:** die Byte-Manipulation selbst ist reines JS (schnell, interaktiv, kein Encoder nötig). Nur Encode (prepare) und Decode (render) brauchen einen echten Codec — dafür reicht ein schlanker Server-Endpoint, ohne WASM-Overhead im Browser.

**Grundkorrektur (Helligkeit/Kontrast/Sättigung):** anders als bei Fotos gibt es hier keine Pixel-Effekt-Pipeline (die Bytes sind komprimierte MPEG4-Daten, kein RGB) — läuft stattdessen als ffmpeg `eq`-Filter im `/api/glitch/render`-Schritt (`brightness`/`contrast`/`saturation` als Form-Felder, serverseitig geclamped).

**Export in hoher Qualität:** die editierte Mosh-Entscheidung (In/Out, Cut-Point, Wiederhol-/Rausch-Parameter) ist immer eine Liste von Frame-*Indizes* — die bleibt gültig, egal bei welcher Auflösung ein Clip encodiert wurde, solange FPS/GOP gleich bleiben (nur `-vf scale` ändert sich). Deshalb: `/api/glitch/prepare` nimmt jetzt einen optionalen `width`-Parameter (Default 480, Cap 1920). Der "Exportieren"-Button im Frontend behält das Original-`File` jedes Clips (`clip.file`), re-prepared bei Klick alle Clips in der gewählten Export-Auflösung (720p/1080p), wendet dieselben Trim/Cut-Point-Werte an (defensiv auf neue Frame-Anzahl geclampt, falls sie doch abweicht) und rendert mit `crf=16` statt `20`. Deutlich langsamer als "Vorschau rendern" (mehrere Server-Roundtrips), aber nur nötig beim finalen Export.

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
- Foto-Effekt-Stacks gehören jetzt einer **Ebene** (`layer.stack`), nicht mehr einer globalen Variable — beim Ändern eines Effekt-Parameters immer `markActiveLayerDirty()` vor `scheduleRender()` aufrufen, sonst rendert die gecachte Ebene nicht neu
- Video-Backend-Endpoints geben bei Fehlern `{error: "..."}` mit passendem HTTP-Status zurück — Frontend zeigt das direkt an

---

## Roadmap

| Version | Feature | Status |
|---------|---------|--------|
| v1.0.0 | Bild-Editor: Pixelsort, Dithering, RGB-Shift, Scanlines, Noise, Block Glitch, Posterize, Wave, JPEG Crunch, Invert | ✅ done |
| v1.1.0 | Basic-Editing: Grundkorrektur, Gradationskurve, Farbüberlagerung, Pixelation | ✅ done |
| v2.0.0 | Video-Datamoshing: Server-Backend (ffmpeg) + clientseitige AVI-Byte-Manipulation | ✅ done |
| v2.1.0 | Video: Multi-Clip-Merge (mehrere Videos fusionieren) statt Einzelvideo; Foto: Verlaufsüberlagerung | ✅ done |
| v2.1.1 | Video: Info-Modal erklärt Datamoshing-Prinzip und alle Regler | ✅ done |
| v2.2.0 | Foto: Drag&Drop-Reordering, Export in voller Auflösung; Video: Grundkorrektur, Export in 720p/1080p | ✅ done |
| v2.3.0 | Foto: Ebenen-System — mehrere Bilder überlagern, 16 native Blend-Modi, Deckkraft, Größe, Drag-to-Move, "Neue Leinwand" für Collagen | ✅ done |
| v2.4.0 | Foto: Crop pro Ebene/Komposition, Masken-Funktion (Kreis/Rechteck/Pen-Tool, Effekte nur in ausgewähltem Bereich anwenden) | geplant |

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
