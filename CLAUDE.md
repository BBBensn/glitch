# glitch — CLAUDE.md

Projekt-spezifischer Kontext. Ergänzt `~/.claude/CLAUDE.md`.

---

## Projekt-Basics

- **Name:** glitch
- **Domain:** glitch.bensn.me
- **Version:** v2.8.0
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

**Cache-Busting:** `index.html`/`video.html` referenzieren `css/style.css`, `js/*.js` mit `?v=X.X.X` (aktuelle Version). Nginx setzt keine expliziten Cache-Control-Header für statische Files, Browser cachen `<script src>`/`<link>` aber trotzdem oft aggressiv über einfache Reloads hinweg — bei jedem Deploy mit JS/CSS-Änderungen die Versionsnummer in *beiden* HTML-Dateien mitziehen, sonst laufen User (und man selbst beim Testen) auf einem inkonsistenten Mix aus altem/neuem Code (führt zu kryptischen Fehlern wie „X is not a function", weil ein altes `EFFECT_DEFS` auf eine in der alten `effects.js` noch nicht existierende Funktion zeigt).

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
Grundkorrektur (Helligkeit/Kontrast/Sättigung), Gradationskurve, Farbüberlagerung, Verlaufsüberlagerung, Pixelation (mit Displacement), Pixel Sort, Pixel Drag (Richtungs-Schmier-Effekt mit Farbversatz, für "Drip"/Melt-Optik), Dithering (Floyd–Steinberg / Atkinson / Bayer / Random), RGB Shift, Scanlines, Noise, Block Glitch, Posterize, Wave Distortion, JPEG Crunch, Invert

Farbüberlagerung und Verlaufsüberlagerung teilen sich die Blend-Modi-Logik (`blendChannels()` in effects.js: normal/multiply/screen/overlay/color) — neue Blend-Modi dort zentral ergänzen. Das ist eine andere, kleinere Blend-Palette als die Ebenen-Kompositierung unten (Canvas-native Modi) — nicht verwechseln.

---

## Foto-Modus: Ebenen (Layers)

**Datenmodell:** `layers[]` (unten→oben), jede Ebene: `{ img, workW/workH (Arbeitsauflösung, ≤1600px), x/y/w/h (Platzierung in Canvas-Pixeln), crop (siehe unten), basePixelScale/scalePct (Größen-Regler-Referenz), rotation (0/90/180/270), flipH/flipV, blendMode, opacity, visible, collapsed (UI-Zustand der Karte), stack (eigener Effekt-Stack), dirty, renderedCanvas (Cache) }`. Der gemeinsame Canvas (`canvasW/canvasH`) ist entweder die (herunterskalierte) Auflösung des ersten hochgeladenen Bildes oder aus "Neue Leinwand" (freie Breite/Höhe + Hintergrund als Farbwähler oder transparent).

**Rendering (`renderComposite()` in app.js):** pro sichtbarer Ebene bottom-to-top wird `renderLayerCanvas()` aufgerufen (rendert nur den *eigenen*, ggf. zugeschnittenen Effekt-Stack der Ebene auf einen Offscreen-Canvas — **cached** über `layer.dirty`, wird nur bei Änderungen am Effekt-Stack/Crop dieser Ebene neu berechnet, nicht bei Verschieben/Resize/Deckkraft/Blend-Modus-Änderung anderer Ebenen), dann per `ctx.drawImage(..., x, y, w, h)` mit `ctx.globalAlpha` + `ctx.globalCompositeOperation` auf den Haupt-Canvas kompositiert. Danach: `drawCropHandles()` / `drawMaskOverlay()` / `drawCanvasCropOverlay()` — zeichnen nur etwas, wenn der jeweilige Modus aktiv ist.

**Wichtig — Blend-Modi sind nativ:** die 16 Modi in `BLEND_MODES` (app.js) sind exakt die [CSS Compositing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation) Werte (`multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`, plus `source-over` für "Normal"). Kein eigener Blend-Code nötig — der Browser übernimmt das. Das ist eine bewusste Design-Entscheidung: keine der 16 Photoshop-Modi händisch nachbauen.

**Interaktion:**
- Ebenen-Panel: Reorder per ↑/↓ oder Drag&Drop (⠿-Handle), Sichtbarkeit toggeln, Blend-Modus + Deckkraft + Größe (%) pro Ebene, Klick auf eine Karte macht sie zur `activeLayerId` — deren Effekt-Stack wird unten angezeigt/editiert
- Verschieben: Drag direkt auf dem Haupt-Canvas (nur innerhalb der Bounds der *aktiven* Ebene startet der Drag, `startLayerDrag`/`moveLayerDrag`)
- Größe: Prozent-Slider (`resizeLayer()`) skaliert `basePixelScale` (die ursprüngliche "fit to canvas"-Dichte) — `applyLayerTransform()` berechnet daraus `w/h` aus `crop.w/crop.h`, zentriert um den Mittelpunkt
- **Drehen & Spiegeln:** ↺/↻ (90°-Schritte) + ⬌/⬍ pro Ebene (`rotateLayer()`/`toggleFlip()`) — bewusst ein Ebenen-Attribut, kein Effekt-Stack-Eintrag: eine 90°/270°-Drehung vertauscht Breite/Höhe, was mit dem Effekt-Stack-Modell (feste Dimensionen pro Durchlauf, mehrfach hinzufügbar) nicht sauber vereinbar wäre. Wird in `renderLayerCanvas()`/`renderLayerAtScale()` *vor* dem Crop-Ausschnitt und *vor* dem Effekt-Stack angewendet (Canvas-`rotate()`/`scale()`-Transform, kein manuelles Pixel-Remapping), danach laufen Crop-Auswahl, Masken-Koordinaten und Effekte alle im bereits gedrehten Koordinatensystem — kein Sonderfall nötig
- **Ebenen-/Effekt-Panel sind unabhängig scrollbar** (`max-height: 34vh` je Liste) und die Sidebar ist `position: sticky`, damit der Canvas beim Scrollen durch viele Ebenen/Effekte sichtbar bleibt. Jede Ebenen-Karte ist einklappbar (`layer.collapsed`, Chevron-Button) — neu aktivierte Ebenen klappen automatisch auf, alle anderen bleiben wie eingestellt (kein automatisches Zuklappen anderer Ebenen, um keine manuell offen gelassene Referenz-Ebene zu verstecken)

**Crop (pro Ebene, `cropModeLayerId`):** "Zuschneiden"-Button pro Ebene aktiviert 4 Kanten-Handles (Mittelpunkte oben/unten/links/rechts) direkt auf den aktuell sichtbaren Ebenen-Bounds. Ziehen trimmt `layer.crop {x,y,w,h}` (in Arbeitsauflösungs-Pixeln der Ebene) von der jeweiligen Kante — der Rest des Bilds bleibt in derselben Pixeldichte erhalten (kein Reskalieren). Modell: `fullX/fullY` (Position der *ungeschnittenen* Ebene, bleibt während des Drags konstant) + `crop.x/y` bestimmen `layer.x/y = fullX + crop.x*scale`. "Crop zurücksetzen" stellt `crop = {0,0,workW,workH}` wieder her.

**Crop (Komposition, `canvasCropMode`):** "Leinwand zuschneiden" im Toolbar zeigt ein Vorschau-Rechteck (`pendingCanvasCrop`) mit denselben 4 Kanten-Handles über der ganzen Leinwand, gedimmt außerhalb. "Übernehmen" verschiebt alle Ebenen um `-pendingCanvasCrop.x/y` und setzt `canvasW/canvasH` neu — "Abbrechen" verwirft die Auswahl.

**Effekt-Masken (`fx.mask`, pro Eintrag im Effekt-Stack):** "◐"-Button an jedem Effekt öffnet den Masken-Editor (`toggleMaskEdit`) — Ziehen auf dem Canvas zeichnet ein Rechteck oder eine Ellipse (Shape-Umschalter im Panel) neu, Koordinaten als Sichtquotient 0–1 relativ zur Ebene gespeichert (auflösungsunabhängig). Zusätzlich Weichzeichnung (Box-Blur auf die Alpha-Maske, `boxBlurAlpha()`) und Invertieren. Rendering: der Effekt läuft immer auf dem *ganzen* Bild, das Ergebnis wird dann per `buildMaskAlpha()` pixelweise mit dem Original vor dem Effekt gemischt (`out = base*(1-a) + result*a`) — funktioniert für jeden Effekt ohne Sonderfall, auch für welche, die `imgData` in-place mutieren. **Kein Pen-Tool** (bewusst zurückgestellt, siehe Roadmap) — nur Rechteck/Ellipse.

Alle drei Modi (`cropModeLayerId`, `canvasCropMode`, `maskEditFx`) sind gegenseitig exklusiv (`exitEditModes()`) und broadcasten sich in Toolbar/Sidebar via `renderLayerList()`/`renderStackUI()` — nach jeder Drag-*Ende* (nicht während des Drags, das würde die DOM-Listener zerstören) muss die passende UI neu gerendert werden, sonst bleiben Buttons wie "Crop zurücksetzen" oder der Feather-Regler unsichtbar (war ein echter Bug beim ersten Bau, siehe Git-History).

**Export in voller Qualität:** `renderCompositeAtResolution()` skaliert **alle** Ebenen gemeinsam hoch (Ziel: `EXPORT_MAX_DIM` = 4000px auf der langen Canvas-Seite) und rendert jede Ebene erneut mit `renderLayerAtScale()` gegen ihr Original-`img`, respektiert dabei `crop` und `mask` genauso wie die Live-Vorschau. Params mit `scalesWithResolution: true` (z.B. `blockSize`, `amplitude`, RGB-Shift `amount`, Scanline `spacing`/`thickness`) werden proportional mitskaliert (`scaleParams()`), damit der Export optisch der Vorschau entspricht, nur schärfer. Neuer Foto-Effekt mit Pixel-Maßen? `scalesWithResolution: true` am Param nicht vergessen.

**Noch nicht gebaut:** Pen-Tool/Lasso für Masken (bewusst zurückgestellt — "wenn nicht zu aufwendig" war die Vorgabe, und der Rest war schon umfangreich genug).

---

## Foto-Modus: Text-Ebenen

**Datenmodell:** Ebenen haben jetzt ein `type`-Feld (`'image'` oder `'text'`). Text-Ebenen haben **kein** `img`/`crop` — statt der Bild-Ebenen-Unterscheidung "Arbeitsauflösung vs. Natürliche Auflösung" (`natScale`) wird bei Text alles direkt in Canvas-Pixel-Einheiten angegeben: `basePixelScale` ist fix `1`, `workW/workH` sind die *gemessene* Text-Bounding-Box (von `remeasureTextLayer()` berechnet, nicht vom Nutzer gesetzt). Zusätzliche Felder: `text, fontFamily, fontWeight, fontSize, color, align, spamCount, spamSpacing, spamOffsetX, spamSeed`. `applyLayerTransform()` (bestimmt `w/h` aus `basePixelScale * scalePct`) ist entsprechend generalisiert: nutzt `layer.workW/workH` statt `layer.crop.w/h` für Text-Ebenen — sonst identisch zu Bild-Ebenen (inkl. Rotation/Spiegeln-Zentrierung).

**Rendering:** `getLayerSource(layer, factor)` ist der gemeinsame erste Schritt für `renderLayerCanvas()` (Live-Vorschau, `factor=1`) und `renderLayerAtScale()` (Export, `factor>1`) — für Text-Ebenen ruft das `renderTextContent(layer, factor)` auf (rendert Text direkt in der Ziel-Auflösung, kein Hochskalieren eines fixen Rasters → beim Export bleibt Text scharf), für Bild-Ebenen die alte Crop-Extraktion aus `layer.img`. Ab da läuft dieselbe Pipeline wie bei Bildern weiter (Rotation/Spiegeln → Effekt-Stack → Maske) — kein Sonderfall nötig, da rein Canvas/ImageData-basiert.

**Spam-Modus:** `renderTextContent()` stapelt `spamCount` Kopien des gesamten (mehrzeiligen) Textblocks vertikal (`spamSpacing`-Multiplikator auf die Zeilenhöhe), pro Kopie horizontal gejittert über `mulberry32(layer.spamSeed)` (dieselbe seeded-RNG-Funktion wie bei Dithering/Noise/Block-Glitch, mit 🎲-Reroll-Button — bestehende Konvention, siehe oben) im Bereich `±spamOffsetX`. Kein Auto-Zeilenumbruch (nur explizite `\n`). Canvas-Maße auf 8000px pro Achse gedeckelt gegen pathologische Größen bei hohem `spamCount`×`fontSize`×`spamSpacing`.

**Fonts:** `TEXT_FONTS`-Array (app.js) — kuratierte Google-Fonts-Auswahl (Syne, DM Mono, Archivo Black, Bebas Neue, Space Grotesk, Anton, Permanent Marker, IBM Plex Mono), geladen über den bestehenden `<link>` in index.html. Jeder Font trägt seine tatsächlich verfügbaren Gewichte (mehrere Display-Fonts haben nur einen einzigen Schnitt) — das Gewicht-`<select>` wird bei Font-Wechsel dynamisch neu aufgebaut.

**Kein Crop für Text-Ebenen** (ergibt inhaltlich keinen Sinn) — die Crop-Zeile im Ebenen-Panel wird für `type === 'text'` durch das Text-Panel ersetzt (Text, Font, Gewicht, Größe, Farbe, Ausrichtung, Spam-Modus). `remeasureTextLayer()` läuft nach jeder text-/font-/spam-relevanten Änderung (nicht bei Farbe/Ausrichtung, die ändern nur den fertigen Raster-Inhalt, nicht dessen Größe) und zentriert die Ebene dabei um ihren *bisherigen* Mittelpunkt, damit Tippen nicht springt. Bewusst **kein** `renderLayerList()`-Aufruf bei Text-Eingaben (würde die Textarea samt Fokus/Cursor bei jedem Tastendruck zerstören, da die Funktion den ganzen Sidebar-DOM neu baut) — nur `scheduleRender()`, exakt wie bei Deckkraft/Größe-Slidern.

**Ebenen duplizieren:** neuer `⧉`-Button pro Ebenen-Karte (jeder Typ). Echtes Deep-Clone von `crop`/`stack`/`fx.params`/`fx.mask` (via `structuredClone()`) — sonst würde eine Kurven- oder Maskenbearbeitung auf der Kopie das Original mit-verändern. `img` (Bild-Ebenen) wird bewusst per Referenz geteilt (gleiche Pixelquelle). Frische `uid` für Ebene und jeden Stack-Eintrag.

**Bekannter Alpha-Bug gefixt:** `Effects.pixelate` setzte pro gemitteltem Block hart `alpha=255` — bei transparenten Bereichen (Text-Ebenen sind meist transparenter Hintergrund) machte das den Hintergrund an pixelierten Stellen fälschlich blickdicht. Jetzt wird Alpha genauso wie R/G/B gemittelt. Betraf auch transparente PNG-Bild-Ebenen, war da nur weniger auffällig. `Effects.jpegCrunch` hat ein analoges, aber aufwändigeres Alpha-Problem (JPEG kennt keinen Alpha-Kanal) — bewusst nicht gefixt, bekannte Einschränkung.

---

## Video-Modus: echtes Datamoshing (Multi-Clip-Merge)

**Prinzip:** kein Filter-Effekt, sondern echte Byte-Manipulation am MPEG-4-Bitstream (AVI-Container) — I-Frames werden aus dem Rohdatenstrom entfernt, wodurch der Decoder P-Frame-Bewegungsvektoren auf veraltete Referenzframes anwendet ("melt/smear"-Effekt). Der Effekt wirkt am stärksten beim Fusionieren zweier unterschiedlicher Clips (Video A meltet in Video B), deshalb ist das UI um mehrere Clips herum gebaut, nicht um ein einzelnes Video.

**UI-Struktur ("Studio"-Optik, seit v2.8.0):** kompakter `#clipStrip` (ein Block pro Clip — Nummer, Name, Frame-Anzahl, Klick macht ihn zu `activeClipId`) + **ein** immer sichtbares `#clipDetail`-Panel für genau den aktiven Clip (`renderClipDetail()` in video-app.js) — mirrort das Foto-Modus-Muster "Ebenen-Liste + ein aktives Element wird unten editiert". Im Detail-Panel: die frame-genaue Mini-Timeline (In/Out/Cut-Point-Drag, unverändert aus der Vorversion übernommen) ganz oben, darunter vier flache Abschnitte — Zuschnitt, Farbe, Datamosh, Glitch-Filter (siehe unten). Kein Auf-/Zuklappen mehr nötig, da ohnehin nur ein Clip gleichzeitig sichtbar ist.

**Auto-Render statt manuellem Klick:** jede Änderung (Farbe, Datamosh, Glitch-Filter, Trim/Cut-Point bei Drag-Ende, Zuschnitt) ruft `scheduleAutoRender()` — debounced 700ms, dann `runAutoRender()`. Ein Generation-Counter (`renderGeneration`, hochgezählt bei jedem `runAutoRender()`-Aufruf) verhindert, dass eine veraltete Server-Antwort eine neuere überschreibt: `doRender()` prüft `generation !== renderGeneration` sowohl vor dem Fetch als auch in dessen `.then()` (der Fetch kann erst auflösen, nachdem eine neuere Änderung die Generation schon weitergezählt hat). "Vorschau rendern" heißt jetzt "Jetzt aktualisieren" und erzwingt einfach sofort `runAutoRender()` (Debounce umgehen) — als manueller Fallback. "Ohne Moshing ansehen" bleibt bewusst ohne Auto-Trigger (seltene Referenzprüfung).

**Workflow:**
1. Beliebig viele Videos hochladen (`+ Video hinzufügen`, Mehrfachauswahl oder Drag&Drop) — jedes wird server-seitig zu einem moshbaren AVI transkodiert (`/api/glitch/prepare`: mpeg4/xvid, 15fps, `-g 15` → alle ~1s ein I-Frame, keine B-Frames, max. 20s pro Clip)
2. Cut-Point (rote Linie) und In/Out (orange) direkt auf der Timeline des aktiven Clips ziehen
3. Reihenfolge der Clips per ↑/↓ im Strip festlegen — das ist die Reihenfolge im fertigen Video
4. Pro Clip einstellbar: Zuschnitt, Farbe, Datamosh-Parameter, Glitch-Filter (alles unten)
5. Änderungen rendern automatisch neu; "Jetzt aktualisieren" erzwingt es sofort, "Ohne Moshing ansehen" zeigt die Referenz ohne Mosh

**Kernlogik (`datamosh.js`, `Datamosh.selectClipFrames` + `Datamosh.mergeAndMosh`):**
- Für den **ersten** Clip wird der Start immer auf das nächste I-Frame ≤ inFrame zurückgesetzt (`isFirstClip` snapt), damit der Decoder am Anfang eine gültige Referenz hat — dessen allererstes Frame wird nie entfernt, egal wo der Cut-Point steht
- Für **spätere** Clips wird *nicht* gesnapt — der Clip startet bewusst mitten in seiner eigenen GOP, ohne eigenes I-Frame (per Default: Cut-Point = Clip-Start = sofortiger Morph). Dadurch erbt er beim Decodieren die "eingefrorene" Referenz des vorigen Clips → der eigentliche Morph-Effekt zwischen zwei Videos
- Innerhalb eines Clips ab `cutPoint`: alle I-Frames raus (klassischer interner Melt, funktioniert auch mit nur einem einzigen Clip)
- **Wiederhol-Fenster/-Anzahl und Byte-Rauschen sind seit v2.8.0 pro Clip** (`clip.dupWindow/dupCount/noiseIntensity/seed`), nicht mehr ein global geteiltes `opts`-Objekt — `Datamosh.mergeAndMosh(clips)` liest diese Felder jetzt direkt von jedem Clip, die RNG (`dmMulberry32`) wird pro Clip neu mit dessen eigenem Seed konstruiert. Echte Verhaltensänderung, kein reiner Refactor: früher trieb ein Seed einen einzigen RNG-Strom über den *gesamten* Output, jetzt ist jeder Clip unabhängig geseedet und für sich reproduzierbar.
- Kein Header-Patching nötig (dwTotalFrames/idx1 werden nicht korrigiert) — ffmpeg liest das trotzdem sauber, da es `movi` einfach scannt (empirisch gegen echtes ffmpeg getestet, bevor der Parser gebaut wurde)

**Render (Server, `/api/glitch/render`):** der zusammengebaute/korrumpierte AVI-Byte-Stream wird hochgeladen, ffmpeg dekodiert ihn (toleriert die fehlenden I-Frames) und encodet zu H.264/MP4 für Vorschau + Download. Kein Live-Preview ohne Server-Roundtrip möglich, da Browser kein rohes MPEG-4/AVI abspielen können — echtes Frame-genaues Scrubbing wie in einem Schnittprogramm würde ffmpeg.wasm im Client brauchen (bewusst nicht gebaut, siehe unten).

**Warum kein ffmpeg.wasm:** die Byte-Manipulation selbst ist reines JS (schnell, interaktiv, kein Encoder nötig). Nur Encode (prepare) und Decode (render) brauchen einen echten Codec — dafür reicht ein schlanker Server-Endpoint, ohne WASM-Overhead im Browser. Das ist auch der Grund, warum eine echte Timeline-Live-Vorschau (Scrubbing zeigt sofort die Mosh-Korruption) nicht möglich ist — der Melt-Effekt entsteht erst beim echten Decodieren fehlender I-Frames durch ffmpeg/libavcodec, kein Browser-`<video>`-Element bildet das nach. Auto-Render (siehe oben) ist der pragmatische Mittelweg.

**Leinwand-System / Canvas-Fit (seit v2.8.0):** analog zum Foto-Modus-Prinzip legt entweder der erste hochgeladene Clip automatisch eine Ziel-Auflösung fest (anhand seines eigenen Seitenverhältnisses), oder der "Leinwand"-Button öffnet ein Modal mit Presets (9:16/1:1/16:9) + Custom-W/H + Hintergrundfarbe. `canvasCfg = {w,h,bg}` (Client-State, Proxy-Auflösung ≤640px lange Kante) wird bei jedem `/prepare`-Aufruf mitgeschickt; der Server (`build_fit_filter()` in `server/app.py`) baut je nach `fitMode` eine von drei ffmpeg-Filterketten: **cover** (hochskalieren + Überschuss croppen, `panX/panY` verschieben den Ausschnitt), **contain** (runterskalieren + mit `bg` auffüllen), **stretch** (Seitenverhältnis ignorieren, bewusst nutzbare Option für zusätzliche Verzerrung). Jeder Clip hat sein eigenes `fit = {mode, panX, panY}`; eine Änderung setzt `clip.needsReprepare = true`, was `runAutoRender()` vor dem eigentlichen Render abarbeitet (ruft `/prepare` für genau diesen Clip erneut auf, nicht für alle).

Der Server liest nach jedem erfolgreichen Encode per `ffprobe` die tatsächliche Ausgabe-Auflösung zurück und gibt sie als `X-Video-Width`/`X-Video-Height`-Response-Header mit — das Frontend seedet `canvasCfg` beim ersten Clip daraus (Header sind vor `res.arrayBuffer()` lesbar). **Wichtiger Bugfix dabei:** das initiale Hochladen mehrerer Clips gleichzeitig lief anfangs über parallele `/prepare`-Requests — wessen Antwort zuerst zurückkam, legte die Leinwand fest, unabhängig von der tatsächlichen Upload-Reihenfolge (Netzwerk-Race). Gefixt über eine einzige globale `uploadChain`-Promise-Kette (`js/video-app.js`), durch die *jeder* Clip-Prepare-Aufruf über die gesamte Session hinweg läuft, nicht nur innerhalb eines Uploads — die Leinwand wird dadurch deterministisch vom tatsächlich ersten Clip festgelegt.

**Nebeneffekt, der als echter Korrektheits-Fix mitkam:** vor dem Leinwand-System skalierte `/prepare` jeden Clip nur auf eine feste Breite (`scale=width:-2`), wodurch Clips mit unterschiedlichem Quell-Seitenverhältnis unterschiedliche Höhen bekamen — das Merge-Header (`dmAssemble()` nimmt es nur vom ersten Clip) und die tatsächlichen Frame-Daten späterer Clips konnten dadurch bei gemischten Formaten auseinanderdriften. Das Leinwand-System zwingt jetzt alle Clips auf identische W×H und behebt das nebenbei.

**Glitch-Filter pro Clip (seit v2.8.0):** RGB-Shift (`rgbashift=rh=X:bh=-X`), Noise (`noise=alls=X:allf=t`), Pixelate (doppeltes `scale=iw/N:ih/N:flags=neighbor` runter/rauf — nutzt relative `iw`/`ih`-Ausdrücke, braucht keine absoluten Canvas-Maße), Scanlines (`geq=lum='if(mod(floor(Y/2)\,2)\,lum(X\,Y)*factor\,lum(X\,Y))'` — **`lum()`/`cb()`/`cr()` müssen kleingeschrieben sein**, Großschreibung scheitert zumindest auf ffmpeg 6.x/8.x mit "Unknown function"). Jeweils `{enabled, <param>}` pro Clip, im selben Segment-Chain-Mechanismus wie die Farbkorrektur (siehe unten) — vor dem Wiring einzeln gegen echtes ffmpeg smoke-getestet (lokal 8.0.1 *und* Produktions-ffmpeg 6.1.1, da sich Filter-Verhalten zwischen Versionen unterscheiden kann).

**Grundkorrektur (Helligkeit/Kontrast/Sättigung/Farbton/Invertieren/Schwarz-Weiß) — pro Clip:** anders als bei Fotos gibt es hier keine Pixel-Effekt-Pipeline (die Bytes sind komprimierte MPEG4-Daten, kein RGB) — läuft stattdessen als ffmpeg `eq`/`hue`/`negate`-Filterkette im `/api/glitch/render`-Schritt (S/W: zusätzlicher `hue=s=0`-Schritt, unabhängig vom Sättigungs-Regler — vollständige Entsättigung statt nur Regler-Wert). "Auf alle Clips anwenden" (im Farbe-Abschnitt) broadcastet die Werte des aktiven Clips auf alle anderen. Da die Farbgebung *pro Original-Clip* gelten muss, aber der Client vor dem Rendern bereits alle Clips zu einem einzigen gemoshten AVI-Byte-Stream zusammenfügt (`Datamosh.mergeAndMosh`), reicht ein einzelner globaler ffmpeg-Filter nicht aus. Lösung: `mergeAndMosh` gibt `{ bytes, segments }` zurück — `segments[i] = {clipIndex, start, end}` markiert, welcher Ausgabe-Frame-Bereich (inkl. wiederholter Tail-Frames) von welchem Clip stammt. Das Frontend baut daraus ein JSON-Payload (`buildSegmentsPayload()` — Start/Ende + Farbwerte + Glitch-Filter je Segment, `form.append('segments', ...)`), der Server (`build_segment_filter()` in `server/app.py`, vormals `build_color_filter`) übersetzt das in eine ffmpeg `filter_complex`-Kette: pro Segment `trim=start_frame:end_frame,setpts=PTS-STARTPTS,eq=...[,hue=...][,negate][,glitch-filter...]`, alle Segmente per `concat=n=N:v=1:a=0[outv]` wieder zusammengefügt. Funktioniert identisch für Mosh-Vorschau, "Ohne Moshing ansehen" und High-Quality-Export (dort werden die Segment-Werte aus den *Original*-Clip-Objekten gezogen, nicht aus den für den Export neu preparierten Clips, die selbst keine dieser Felder tragen).

**Export in hoher Qualität:** die editierte Mosh-Entscheidung (In/Out, Cut-Point, Wiederhol-/Rausch-Parameter) ist immer eine Liste von Frame-*Indizes* — die bleibt gültig, egal bei welcher Auflösung ein Clip encodiert wurde, solange FPS/GOP gleich bleiben (nur die Zuschnitt-Filterkette ändert sich). Der "Exportieren"-Button skaliert `canvasCfg` proportional auf die gewählte Export-Zielgröße hoch (720p/1080p, lange Kante) und re-preparet damit alle Clips (inkl. ihrer jeweiligen `fit`-Einstellung) neu, wendet dieselben Trim/Cut-Point-Werte an (defensiv auf neue Frame-Anzahl geclampt) und rendert mit `crf=16` statt `20`. Deutlich langsamer als der normale Auto-Render (mehrere Server-Roundtrips), aber nur beim finalen Export nötig.

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
| v2.4.0 | Foto: Crop pro Ebene/Komposition, Masken-Funktion (Kreis/Rechteck, Effekte nur in ausgewähltem Bereich anwenden), Leinwand-Hintergrund per Farbwähler | ✅ done |
| v2.5.0 | Foto: Ebenen-/Effekt-Panel scrollbar + einklappbar, Drehen/Spiegeln pro Ebene, neuer Pixel-Drag-Effekt; Cache-Busting für JS/CSS | ✅ done |
| v2.6.0 | Video: Grundkorrektur (Helligkeit/Kontrast/Sättigung/Farbton/Invertieren) pro Clip statt global, "Auf alle Clips anwenden"-Broadcast; Server-seitige Segment-basierte ffmpeg-Filterkette | ✅ done |
| v2.7.0 | Foto: Text-Ebenen (Google Fonts, Größe/Gewicht/Farbe/Ausrichtung, Spam-Modus mit Versatz), generisches Ebenen-Duplizieren, Pixelate-Alpha-Fix; Video: Schwarz-Weiß pro Clip | ✅ done |
| v2.8.0 | Video: Timeline-Umbau (Clip-Strip + ein aktives Detail-Panel statt gestapelter Karten), Auto-Render mit Debounce+Generation-Counter, Datamosh-Parameter + 4 Glitch-Filter (RGB-Shift/Noise/Pixelate/Scanlines) pro Clip statt global, Leinwand-System (feste Ziel-Auflösung/Seitenverhältnis, Cover/Contain/Stretch-Zuschnitt pro Clip) | ✅ done |

---

## Bekannte Einschränkungen (Video-Modus)

- Max. 20s Clip-Länge, 15fps für den Moshable-Proxy (Performance + Payload-Größe)
- Kein echtes Frame-genaues Scrubbing wie in einem Schnittprogramm — Auto-Render (debounced, ~700ms) ist der pragmatische Mittelweg, kein Live-Preview während des Reglerziehens selbst
- Bei sehr hohem Byte-Rauschen kann ffmpeg beim Rendern scheitern (Fehlermeldung im UI) — dann Intensität reduzieren
- Kein echtes Mehrschicht-Compositing (mehrere Videos gleichzeitig übereinander) — bewusste Entscheidung, Clips bleiben sequenziell, das Leinwand-System passt nur die Ziel-Auflösung/den Zuschnitt an

---

## Obsidian-Doku

- Projekt-MD: `03_Projects/Coding PC/glitch/glitch.md`
- Changelogs: `03_Projects/Coding PC/glitch/Changelogs/`
- Changelog-All: `03_Projects/Coding PC/glitch/glitch-Changelog-All.md`
