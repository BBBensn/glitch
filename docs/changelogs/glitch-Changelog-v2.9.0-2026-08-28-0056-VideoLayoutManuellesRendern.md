---
date_created: 2026-08-28 00:56:00
type: changelog
tags:
  - project
  - changelog
date_modified: 2026-08-28 00:56:00
---

# v2.9.0 — Video-Layout überarbeitet, Auto-Render wieder entfernt (2026-08-28)

**Layout auf Basis von Feedback neu geordnet:** Vorschau-Video steht jetzt ganz oben, direkt darunter der Clip-Strip und die frame-genaue Timeline des aktiven Clips. Die restlichen Einstellungen (Zuschnitt, Farbe, Datamosh, Glitch-Filter) sitzen jetzt in der Sidebar unter den Render-/Download-/Export-Buttons — als eigener, unabhängig scrollbarer Bereich (`#clipDetail`), während die Buttons selbst dank `position: sticky` immer sichtbar bleiben (gleiches Muster wie die Ebenen-/Effekt-Panels im Fotomodus). Damit bleibt die Vorschau beim Durchscrollen der Einstellungen immer im Blick.

**Einstellungs-Karten sind jetzt einklappbar:** Zuschnitt, Farbe, Datamosh und Glitch-Filter lassen sich per Klick auf den Karten-Header ein-/ausklappen (`buildCollapsibleSection()`), der Zustand ist über alle Clips hinweg geteilt (wer "Datamosh" nie anfasst, hat es beim nächsten Clip auch zu).

**Auto-Render wieder entfernt:** der in der letzten Version eingeführte automatische Re-Render (debounced) wurde nach Rückmeldung wieder rausgenommen — "Jetzt aktualisieren" funktionierte dadurch unzuverlässig bzw. wirkte kaputt. Rendern ist jetzt bewusst rein manuell: der Button preparet zuerst alle Clips mit ausstehenden Zuschnitt-Änderungen neu und rendert danach — mit klarem Button-Feedback (deaktiviert + "Aktualisiert…" während der Ausführung). Ein Nebeneffekt, der vermutlich zum "kaputt wirkenden" Verhalten beitrug: Render-Fehler landeten im Auto-Render-Pfad nur in der Konsole, nie sichtbar für den Nutzer — jetzt zeigt ein fehlgeschlagenes Rendern einen expliziten Alert.

End-to-end getestet: neues Layout visuell bestätigt (Vorschau oben, Sidebar-Buttons bleiben beim Scrollen fix, Einstellungen scrollen unabhängig — per JS verifiziert, dass Scrollen in den Einstellungen die Fensterposition nicht verändert), Einklappen/Aufklappen der vier Karten, manueller Render-Button inkl. Button-Disable/Text-Feedback, automatisches Re-Prepare bei ausstehender Zuschnitt-Änderung vor dem Rendern. Keine Konsolenfehler.
