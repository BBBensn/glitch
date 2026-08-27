---
date_created: 2026-08-27 04:56:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-27 04:56:00
---

# v2.6.0 — Farbkorrektur pro Clip statt global (2026-08-27)

**Video-Modus, Grundkorrektur jetzt pro Clip:** Helligkeit, Kontrast und Sättigung waren bisher nur global für das gesamte gemergte/gemoshte Video einstellbar. Jeder Clip hat jetzt seine eigenen Regler (hinter einem "Farbe"-Toggle an der Clip-Karte), zusätzlich neu: Farbton-Regler und ein Invertieren-Checkbox. Ein "Auf alle Clips anwenden"-Button überträgt die Werte eines Clips auf alle anderen, für den Fall dass man doch eine einheitliche Grading will.

**Technisch die eigentliche Herausforderung:** die Clips werden clientseitig zu einem einzigen gemoshten AVI-Byte-Stream zusammengefügt, bevor überhaupt ein Server-Roundtrip passiert — ein einzelner globaler ffmpeg-Filter reicht also nicht mehr, sobald jeder Clip seine eigene Farbgebung haben soll. Lösung: `Datamosh.mergeAndMosh` (js/datamosh.js) trackt jetzt zusätzlich zu den zusammengebauten Bytes auch `segments` — welcher Ausgabe-Frame-Bereich von welchem Ursprungs-Clip stammt (inkl. wiederholter Tail-Frames am Übergang). Der Server (`build_color_filter()` in server/app.py) baut daraus eine ffmpeg `filter_complex`-Kette: pro Segment `trim` + `eq`/`hue`/`negate`, alle Segmente per `concat` wieder zusammengefügt. Vor dem Einbau in die App wurde der Ansatz isoliert mit einem handgebauten ffmpeg-Test verifiziert (zwei Segmente, eins aufgehellt, eins invertiert — anhand extrahierter Frames bestätigt).

Betrifft alle drei Render-Pfade identisch: Mosh-Vorschau, "Ohne Moshing ansehen" und High-Quality-Export — beim Export werden die Farbwerte aus den *Original*-Clip-Objekten gezogen, nicht aus den für den Export neu preparierten Clips (die selbst keine Farbwerte tragen).

End-to-end getestet: zwei Testclips hochgeladen, unterschiedliche Grading-Werte pro Clip gesetzt (Clip A invertiert, Clip B Helligkeit +80), per Frame-Extraktion aus dem gerenderten Video visuell bestätigt dass jeder Clip nur seine eigene Grading zeigt (kein globaler Bleed-Over). "Auf alle Clips anwenden" getestet (broadcastet korrekt). Mosh-Vorschau, "Ohne Moshing ansehen" und High-Quality-Export (720p) alle erfolgreich durchlaufen, keine Konsolenfehler.
