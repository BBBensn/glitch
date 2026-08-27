---
date_created: 2026-08-27 07:06:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-27 07:06:00
---

# v2.7.0 — Text-Ebenen, Spam-Modus, Ebenen-Duplizieren, S/W pro Clip (2026-08-27)

**Foto-Modus, neue Text-Ebenen:** "+ Text hinzufügen" legt eine neue Ebene mit Textinhalt, Google-Font-Auswahl (Syne, DM Mono, Archivo Black, Bebas Neue, Space Grotesk, Anton, Permanent Marker, IBM Plex Mono), Schriftgewicht (pro Font dynamisch, da mehrere Display-Fonts nur einen Schnitt haben), Schriftgröße, Farbe und Ausrichtung an. Text-Ebenen sind ein vollwertiger Ebenentyp — Drehen/Spiegeln, Blend-Modi, Deckkraft, Masken und der komplette Effekt-Stack (RGB-Shift, Pixelate, Dithering, etc.) funktionieren identisch zu Bild-Ebenen, da Text zuerst in ein Raster gerendert und danach dieselbe Pipeline durchläuft. Beim Export wird Text direkt in der Zielauflösung neu gerendert statt hochskaliert — bleibt also auch bei 4000px scharf.

**Spam-Modus:** jede Text-Ebene kann sich selbst N-mal vertikal wiederholen (Anzahl-Regler), mit einstellbarem Zeilenabstand und optionalem horizontalem Versatz — der Versatz ist geseedet (🎲-Reroll wie bei Dithering/Noise) statt starr, für einen organischeren "Text-Spam"-Look.

**Ebenen duplizieren:** neuer ⧉-Button an jeder Ebenen-Karte (Bild oder Text) — echtes Deep-Clone, damit das Bearbeiten der Kopie (Crop, Kurven-Punkte, Masken) das Original nicht mit-verändert.

**Kleiner Bugfix im selben Zug:** `Pixelate` setzte bei jedem gemittelten Block hart Alpha=255, wodurch transparente Bereiche (bei Text-Ebenen der Normalfall) fälschlich blickdicht wurden. Jetzt wird Alpha korrekt mitgemittelt.

**Video-Modus:** Schwarz-Weiß-Schalter pro Clip, als weiteres Feld neben Helligkeit/Kontrast/Sättigung/Farbton/Invertieren — läuft in derselben Segment-basierten ffmpeg-Filterkette wie der Rest der Grundkorrektur mit.

**Architektur-Frage beantwortet, nicht umgesetzt:** ob der Video-Modus zu einer Timeline-Optik mit Live-Vorschau (wie ein Schnittprogramm) umgebaut werden kann — Antwort: echtes Live-Scrubbing der Mosh-Korruption ist ohne ffmpeg.wasm im Client nicht möglich, da der Melt-Effekt erst beim echten Decodieren fehlender I-Frames durch ffmpeg entsteht, kein Browser-`<video>` das nachbildet. Ein Timeline-Layout mit Klick-zum-Editieren pro Clip und schnellerem Auto-Re-Render (kleine Proxy-Auflösung) wäre machbar, aber ein eigener größerer Umbau — für eine spätere Session vorgemerkt.

End-to-end getestet: Text-Ebene angelegt (Default-Leinwand 1200×800 sowie auf bestehender Leinwand zentriert), Font-Wechsel inkl. Single-Weight-Font (Gewicht-Select korrekt neu aufgebaut), Spam-Modus mit 6 Wiederholungen + Versatz + Reroll, Rotation (Breite/Höhe korrekt vertauscht), Pixelate-Effekt auf Text-Ebene (Alpha-Fix per Pixel-Sampling verifiziert), Duplizieren (unabhängige Kopie per Pixel-/Objekt-Vergleich bestätigt), Export bei 4000px, Zusammenspiel mit einer normalen Bild-Ebene (Crop-Panel bleibt dort korrekt sichtbar). Video: S/W-Checkbox pro Clip, `defaultClipColor()`-Feld bestätigt. Keine Konsolenfehler in beiden Modi, lokal (Dev-Server) und live auf glitch.bensn.me getestet.
