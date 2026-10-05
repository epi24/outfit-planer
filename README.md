# Outfit Planner

Web-App (PWA) zum Planen und Entdecken von Outfits. Erstes Feature: Color Matching nach
Sanzo Wada, *A Dictionary of Color Combinations*.

- **Kombinationen** – alle 348 Farbkombinationen, filterbar nach 2, 3 oder 4 Farben und
  durchsuchbar nach Farbname oder Nummer.
- **Farbe wählen** – eine der 159 Wada-Farben antippen oder eine eigene Farbe wählen
  (Farbwähler oder Hex-Wert); die App zeigt die passenden Kombinationen.

## Voraussetzungen

Node.js 22.12 oder neuer (Vite 8).

## Befehle

| Befehl            | Zweck                                                              |
| ----------------- | ------------------------------------------------------------------ |
| `npm run dev`     | Entwicklungsserver auf http://localhost:5173                       |
| `npm test`        | Tests der Daten-, Farb- und Routenlogik                            |
| `npm run lint`    | Linter                                                             |
| `npm run build`   | Produktions-Build nach `dist/`                                     |
| `npm run preview` | Produktions-Build auf http://localhost:4173, mit Service Worker    |
| `npm run icons`   | App-Icons aus `public/icon.svg` neu erzeugen                       |

Der Service Worker (Offline-Betrieb) läuft nur im Produktions-Build, nicht unter `npm run dev`.

## Aufbau

- `src/app` – Rahmen: Routen in der URL-Raute (`#/colors/42`), History und Scrollposition,
  Tab-Leiste.
- `src/features/wada` – Color Matching: Daten, Farbmathematik, Bildschirme.
- Weitere Features kommen als `src/features/<name>` plus ein Eintrag in `TABS`
  (`src/app/TabBar.tsx`) dazu.

## Daten

- Quelle: npm-Paket [`dictionary-of-colour-combinations`](https://github.com/mattdesl/dictionary-of-colour-combinations)
  1.0.2 (MIT), ursprünglich zusammengestellt von Dain M. Blodorn Kim für
  https://sanzo-wada.dmbk.io/. 159 Farben, 348 Kombinationen.
- Die Datei `colors.json` der Website selbst ist veraltet (157 Farben, 59 fehlerhafte
  Kombinationen) und wird deshalb nicht verwendet.
- Die Farbwerte werden wie auf der Website aus CMYK berechnet (`cmykToHex` in
  `src/features/wada/color.ts`), nicht aus den farbprofil-korrigierten Werten des Pakets
  übernommen. Sie sind dadurch kräftiger als im gedruckten Buch.
- Für eine eigene Farbe sucht die App die ähnlichsten Wada-Farben über den Abstand in OKLab
  (a und b doppelt gewichtet). Sehr dunkle, unbunte Farben führen immer zu „Black“.

## Aufs iPhone bringen

Die App wird über GitHub Pages ausgeliefert. Jeder Push auf `main` startet
`.github/workflows/deploy.yml`: Linter, Tests, Build und Veröffentlichung unter
`https://<benutzer>.github.io/<repository>/`. Einmalig nötig: im Repository unter
Settings → Pages als Source „GitHub Actions“ wählen.

Auf dem iPhone die Adresse in Safari öffnen und über „Teilen“ → „Zum Home-Bildschirm“
installieren.

GitHub Pages liefert die App unter einem Unterpfad aus; der Workflow übergibt ihn beim
Build als `--base`. Lokal lässt sich das mit `npm run build -- --base=/<repository>/` und
`npm run preview -- --base=/<repository>/` nachstellen (in Git Bash mit vorangestelltem
`MSYS_NO_PATHCONV=1`, sonst wird der Pfad umgeschrieben).

iOS liest Icon, Name und Meta-Tags beim Hinzufügen zum Home-Bildschirm ein. Wer sie später
ändert, muss das Icon löschen und neu hinzufügen; dabei geht der Speicher der installierten
App verloren.

### iPhone-Checkliste

Am PC nicht prüfbar, deshalb nach der ersten Installation durchgehen:

- [ ] App startet vom Home-Bildschirm ohne Safari-Leisten und mit dem Streifen-Icon.
- [ ] Unter der Statusleiste scheint beim Scrollen nichts durch; über der Überschrift ist
      keine übergroße Lücke.
- [ ] Die Tab-Leiste sitzt über dem Home-Indikator.
- [ ] Antippen des Such- oder Hex-Felds zoomt die Seite nicht.
- [ ] Suche „sulpher“ eingeben und Return drücken: die Eingabe wird nicht autokorrigiert.
- [ ] Tastatur einblenden und wieder schließen: die Tab-Leiste sitzt weiter am unteren Rand.
- [ ] Farbwähler öffnen, Farbe wählen, „Passende Farben finden“: genau ein Schritt zurück
      führt wieder zu „Farbe wählen“.
- [ ] Wischgeste vom linken Rand führt zurück, die Liste steht an der alten Position.
- [ ] Hex-Wert antippen kopiert ihn.
- [ ] Dunkelmodus: Farbfelder bleiben an Schwarz und Weiß erkennbar.
- [ ] Flugmodus einschalten, App schließen und neu öffnen: sie startet.
- [ ] Nach einem neuen Deploy: App in den Hintergrund und wieder nach vorn holen; nach
      erneutem Öffnen zeigt die Fußzeile den neuen Stand.
