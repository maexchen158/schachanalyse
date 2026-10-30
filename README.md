# Schachanalyse

Lokale Web-App zum Analysieren von Schachpartien. Läuft vollständig im Browser,
die Engine (Stockfish 19, WebAssembly) rechnet auf deinem Rechner. Keine Konten,
keine kostenpflichtigen Dienste.

- Partie als PGN oder Zugfolge einfügen (englisch `N B R Q K` oder deutsch `S L T D K`)
  oder per Link von Lichess bzw. Chess.com laden
- Jeder Zug wird mit Stockfish bewertet und eingeordnet: Theorie, Brillant,
  Großartig, Bester Zug, Ausgezeichnet, Gut, Ungenauigkeit, Fehler,
  Verpasster Gewinn, Blunder
- Genauigkeit beider Spieler, Bewertungsgraph, Bewertungsbalken, Pfeil für den besten Zug
- Eigene Züge auf dem Brett werden als Varianten abgezweigt und genauso analysiert

## Starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 18.

```bash
npm install
```

```bash
npm start
```

Dann im Browser <http://localhost:8080> öffnen. Unter Windows reicht ein
Doppelklick auf `START.bat` (installiert beim ersten Mal und öffnet den Browser).
`npm run dev` ist dasselbe wie `npm start`. Anderer Port: `PORT=3000 npm start`
(PowerShell: `$env:PORT=3000; npm start`).

Warum ein Server und nicht einfach `index.html` öffnen? Browser laden
ES-Module, Web Worker und WebAssembly nicht von `file://`. `server.js` liefert
die App aus, stellt die Bibliotheken aus `node_modules` unter `/vendor/` bereit
und enthält den Chess.com-Proxy. Er hat keine weiteren Abhängigkeiten und
lauscht nur auf `127.0.0.1`.

## Als Website

```bash
npm run build
```

legt in `dist/` eine fertige statische Website an (App plus die benötigten
Dateien aus `node_modules`, ca. 3 MB). Sie läuft auf jedem Webhoster ohne
Node-Server. Ohne Server fehlt nur der Chess.com-Proxy; der wird normalerweise
nicht gebraucht, weil der Browser die Chess.com-API direkt abrufen darf.

**GitHub Pages:** `.github/workflows/pages.yml` baut und testet die Website bei
jedem Push auf `main` und veröffentlicht sie automatisch. Änderungen gehen also
so online: Code ändern, committen, `git push`. Den Stand sieht man im Reiter
„Actions“ des Repositorys.

### Als App installieren (Taskleiste, Startmenü)

Die Seite ist eine installierbare Web-App (`manifest.webmanifest`, `sw.js`,
Symbole in `public/icons/`). In Edge oder Chrome die Website öffnen und in der
Adressleiste auf das Symbol „App verfügbar – Installieren“ klicken (oder Menü
„…“ → „Apps“ → „Diese Website als App installieren“). Im Installationsdialog
„An Taskleiste anheften“ ankreuzen. Die App läuft dann in einem eigenen Fenster,
startet auch ohne Internet (Link-Import braucht natürlich Netz) und aktualisiert
sich, sobald eine neue Fassung veröffentlicht ist. Deinstallieren: in der App
oben rechts „…“ → „Deinstallieren“.

Die Symbole erzeugt `npm run icons` (weißer Springer aus dem cburnett-Satz auf
Brettfeldern, gezeichnet mit Edge/Chrome im Hintergrund).

## Bedienung

| Aktion | Wie |
| --- | --- |
| Partie laden | „Partie laden“ → PGN/Züge einfügen oder Link angeben |
| Vor / zurück | Pfeiltasten ← →, Mausrad über dem Brett, Buttons |
| Anfang / Ende | Pos1 / Ende (oder ↑ / ↓) |
| Zu einem Zug springen | Klick in der Zugliste oder im Bewertungsgraph |
| Brett drehen | Taste `F` oder ⇅ |
| Pfeil bester Zug ein/aus | Taste `B` oder ➚ |
| Eigene Pfeile / Kreise | Rechte Maustaste ziehen bzw. klicken (Umschalt/Strg = rot, Alt = blau, beides = gelb) |
| Zugklänge ein/aus | Taste `M` oder 🔊, Lautstärke in den Einstellungen |
| Eigenen Zug spielen | Figur ziehen oder anklicken und Zielfeld klicken |
| Zurück zur Hauptpartie | ⌂ |
| Variante löschen | ✕ rechts am Variantenblock |
| Tiefe, parallele Engines, Notation | „Einstellungen“ |

Die zuletzt geladene Partie und die Einstellungen merkt sich der Browser.

**Pfeile** (Engine-Pfeil grün, eigene Pfeile orange) liegen auf einer eigenen
Ebene über den Feldern und unter den Figuren (`public/js/arrows.js`).
Springerzüge werden als L gezeichnet: zwei Felder geradeaus, dann eines zur
Seite. Eigene Pfeile verschwinden beim Wechsel der Stellung.

**Klänge** für Zug, Schlagen, Rochade, Umwandlung und Schach werden im Browser
erzeugt (Web Audio, `public/js/sounds.js`), es werden keine fremden
Klangdateien mitgeliefert. Eigene Dateien lassen sich in `config.js` unter
`SOUNDS.files` eintragen.

### Varianten

Ein Zug auf dem Brett, der nicht dem Partiezug entspricht, wird als Variante
angelegt. Die Hauptpartie bleibt unverändert. Varianten erscheinen eingerückt
unter dem Zug, an dem sie abzweigen, und können beliebig weitergespielt und
verschachtelt werden. Jeder Variantenzug wird sofort (vorrangig) analysiert und
klassifiziert. Genauigkeit und Graph beziehen sich nur auf die Hauptpartie.
Varianten aus einer eingefügten PGN werden ebenfalls übernommen.

### Link-Import

**Lichess:** Partie-Links (`lichess.org/abcdEFGH`, auch mit `/black` oder `#12`)
und Studienkapitel (`lichess.org/study/<Studie>/<Kapitel>`). Abruf über die
offizielle API (`/game/export/<id>`), direkt aus dem Browser.

**Chess.com:** Links wie `chess.com/game/live/123456789`,
`chess.com/game/daily/…` oder `chess.com/analysis/game/live/…`.

Die öffentliche Chess.com-API (`api.chess.com/pub`) hat **keinen Endpunkt für
eine einzelne Partie per ID**. Es gibt nur die Monatsarchive eines Spielers
(`/pub/player/<name>/games/<JJJJ>/<MM>`). Deshalb fragt die App nach dem
Benutzernamen eines der beiden Spieler und durchsucht dessen Archive vom
neuesten Monat rückwärts, bis die Partie-ID gefunden ist. Nicht dokumentierte
Endpunkte der Chess.com-Webseite werden bewusst nicht benutzt.

**Namen und Wertungen** kommen aus dem Kopf der geladenen PGN (`White`,
`Black`, `WhiteElo`, `BlackElo`, bei Lichess auch `WhiteTitle`). Bei
Chess.com- und Lichess-Partien ist das die Wertung der Plattform in der
jeweiligen Zeitklasse **zum Zeitpunkt der Partie** (nicht die heutige und nicht
die FIDE-Elo). Die App zeigt sie neben den Namen und schreibt Plattform,
Zeitklasse, Bedenkzeit, Datum und Ergebnis unter den Eröffnungsnamen. Wer nur
eine Zugfolge einfügt, hat keinen PGN-Kopf; dann steht dort „Weiß“/„Schwarz“
ohne Wertung. Dafür gibt es im Ladedialog (Reiter „PGN / Züge“) die
optionalen Felder **Name** und **Elo** für beide Seiten. Ausgefüllte Felder
werden beim Laden als Kopfzeilen (`[White "Anna"]`, `[WhiteElo "1500"]`) in den
Partietext geschrieben, ersetzen dort vorhandene Angaben und bleiben so auch
nach einem Neustart erhalten. Danach sind die Felder wieder leer.

CORS: Getestet (Oktober 2026) erlaubt `api.chess.com` Abrufe direkt aus dem
Browser (`Access-Control-Allow-Origin: *`). Falls das scheitert (CORS-Änderung,
Bot-Schutz, Netzwerkfilter), weicht die App automatisch auf den lokalen Proxy
aus: `server.js` leitet `GET /api/chesscom/player/<name>/games/archives` und
`GET /api/chesscom/player/<name>/games/<JJJJ>/<MM>` an die offizielle API weiter,
mit einer erkennbaren User-Agent-Kennung, wie Chess.com sie für Programme
erbittet. Andere Pfade lehnt der Proxy ab; Antworten werden 60 Sekunden
zwischengespeichert.

## Wie die Analyse funktioniert

1. Jede Stellung (Hauptpartie und Varianten) wird von Stockfish bis zur
   eingestellten Tiefe (Standard 16) mit **MultiPV 3** analysiert. Mehrere
   Engine-Instanzen laufen parallel in Web Workern (Standard: Kerne − 1, höchstens 4).
2. Bewertungen werden in **Gewinnwahrscheinlichkeit** umgerechnet
   (Lichess-Formel `50 + 50 · (2 / (1 + e^(−0,00368208 · f · cp)) − 1)`, begrenzt auf
   ±10 Bauern; Matt = 0 % bzw. 100 %). Wie bei Chess.com hängt die Einordnung von
   der Spielstärke ab: `f = 1 + (Wertung − 1500) / 4000`, begrenzt auf 0,8–1,3.
   Für schwächere Spieler ist die Kurve flacher, ein Fehler wiegt also weniger.
   Das ist eine eigene Näherung; Chess.com veröffentlicht seine Werte nicht.
3. **Verlust** eines Zuges = Gewinnwahrscheinlichkeit des besten Zuges minus die
   des gespielten Zuges (aus Sicht des Ziehenden). Steht der gespielte Zug in den
   MultiPV-Zeilen, wird dessen Wert genommen, sonst die Bewertung der Folgestellung.
4. Kategorien, in dieser Reihenfolge geprüft:

| Kategorie | Regel (Schwellen in `public/js/config.js`) |
| --- | --- |
| Theorie | Alle Stellungen bis hierher stehen in der Eröffnungsdatenbank |
| (einziger legaler Zug) | wird als „Bester Zug“ gewertet |
| Brillant | Ein Figurenopfer (siehe unten), Verlust ≤ 2 % (unter 1000 Wertung ≤ 5 %), danach ≥ 45 %, nicht ohnehin gewonnen (zweitbester Zug < 93 % und nicht beide Züge mit Mattzwang), keine Umwandlung, nicht aus dem Schach heraus |
| Großartig | Engine-Topzug, zweitbester Zug ≥ 13 Punkte schlechter (unter 1000 Wertung ≥ 10) und selbst ≤ 75 %, Stellung danach ≥ 25 %, kein Zurückschlagen, kein Matt in eins, die gezogene Figur hängt nicht, kein Fluchtzug aus dem Schach mit ≤ 3 Möglichkeiten |
| Bester Zug | entspricht dem Engine-Topzug |
| Verpasster Gewinn | Gegner verlor im Zug davor ≥ 10 %, bester Zug hätte ≥ 60 % gebracht, gespielter Zug verliert ≥ 10 % und man steht wieder etwa wie vor dem Gegnerfehler |
| Ausgezeichnet | Verlust < 2 % |
| Gut | < 5 % |
| Ungenauigkeit | 5–10 % |
| Fehler | 10–20 % |
| Blunder | > 20 % |

**Opfererkennung** (nach dem, was Chess.com öffentlich beschreibt: „ein gutes
Figurenopfer“, großzügiger bei schwächeren Spielern): Nach dem Zug wird jede
eigene Figur ab Springer geprüft. Sie gilt als geopfert, wenn sie **hängt**, also
von einer billigeren Figur angegriffen wird oder per Abtausch (mit echten legalen
Schlagzügen, Fesselungen zählen mit) verloren geht. Ausgenommen sind Figuren, die
nicht mehr wert sind als das gerade Geschlagene (das ist ein Tausch). Auch eine
Figur, die schon angegriffen war und bewusst stehen gelassen wird, zählt
(**indirektes Opfer**, z. B. 5…d5 nach 5.Sxf7 mit Turm auf h8). Das Opfer muss
echt sein: Bei Opfern unter Turmwert muss es ein Schlagen geben, nach dem nicht
sofort Matt in 1 folgt.

**Erklärungen:** Zu jedem Zug erzeugt `public/js/explain.js` einen kurzen Satz aus
Kategorie und Engine-Daten: Eröffnungsname, Opfer, einziger guter Zug, Matt
erlaubt bzw. verpasst, hängende Figur samt der Antwort, die sie gewinnt,
verpasster Gewinnzug und der bessere Zug mit Bewertung.

Geprüft an vier Partien: eine 400er-Partie (2× Brillant, wie in der
Chess.com-Vorschau), die Opernpartie (Sxb5, Txd7, Db8+), eine Blitzpartie von
Carlsen und eine von Nakamura.

**Genauigkeit** pro Spieler nach dem Verfahren von Lichess: Genauigkeit je Zug
`103,17 · e^(−0,0435 · Verlust) − 3,17` (+1), daraus Mittel aus
volatilitätsgewichtetem und harmonischem Mittel. Sie erscheint, sobald alle
Stellungen der Hauptpartie bewertet sind.

**Eröffnungen:** Datenbank [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)
(CC0), lokal in `public/data/openings.json` (3865 Eröffnungen, 7981 Stellungen,
Zugumstellungen werden erkannt). Neu erzeugen mit `npm run openings`.
Die Lichess-Opening-Explorer-API verlangt inzwischen eine Anmeldung
(HTTP 401) und wird deshalb nicht benutzt.

Die Einordnung lehnt sich an bekannte Game-Review-Funktionen an, ist aber eine
eigene Umsetzung mit eigenen Schwellen; sie liefert nicht exakt dieselben
Ergebnisse.

## Aufbau

```
server.js                 lokaler Server + Chess.com-Proxy
START.bat                 Doppelklick-Start unter Windows
scripts/build.mjs         baut die statische Website nach dist/
scripts/make-icons.mjs    erzeugt die App-Symbole in public/icons/
scripts/build-openings.mjs  erzeugt public/data/openings.json
.github/workflows/pages.yml veröffentlicht auf GitHub Pages
public/
  index.html, css/style.css
  data/openings.json      Eröffnungsdatenbank
  js/
    config.js             alle Schwellenwerte und Engine-Einstellungen
    notation.js           Parser: PGN, Zugfolgen, deutsch/englisch, Varianten
    tree.js               Partiebaum (Hauptpartie + Varianten)
    engine.js             Stockfish-Worker-Pool (UCI)
    analysis.js           verteilt Stellungen an die Engine, löst Klassifizierung aus
    classify.js           Gewinnwahrscheinlichkeit, Kategorien, Opfer, Genauigkeit
    openings.js           Nachschlagen in der Eröffnungsdatenbank
    importer.js           Link-Import Lichess / Chess.com
    board.js              Brett (chessground), Umwandlung, Symbol
    arrows.js             Pfeile unter den Figuren, Springer in L-Form
    sounds.js             Zugklänge (Web Audio)
    movelist.js           Zugliste mit Varianten
    panels.js             Bewertungsbalken, Zuginfo, Genauigkeit
    graph.js              Bewertungsgraph
    categories.js         Namen, Symbole, Farben der Kategorien
    gameinfo.js           Spieler, Wertung, Zeitklasse aus dem PGN-Kopf
    main.js               verbindet alles, Bedienung
tests/                    Tests für Parser, Klassifizierung, Link-Erkennung
```

Tests ausführen:

```bash
npm test
```

### Engine

Standard ist das volle **Stockfish 19** (Single-Thread-Fassung,
`stockfish-19-single.js`, ca. 95 MB mit eingebautem Netz). Es wird beim ersten
Aufruf einmal geladen und danach vom Service Worker gespeichert; währenddessen
zeigt die Fortschrittsleiste „Stockfish wird geladen“. Unter „Einstellungen“
lässt sich auf **Stockfish 19 Lite** (1,8 MB, kleineres Netz) umschalten, etwa
für Handys oder langsame Verbindungen. Beide Varianten stehen in
`ENGINE.variants` in `public/js/config.js`. Die Mehr-Thread-Fassungen werden nicht
benutzt, weil sie besondere Server-Header brauchen, die GitHub Pages nicht setzt;
stattdessen laufen mehrere Engines parallel.

## Lizenzen

- [chess.js](https://github.com/jhlywa/chess.js) – BSD-2-Clause
- [chessground](https://github.com/lichess-org/chessground) – GPL-3.0
- Figuren: cburnett-Set (aus chessground) – GPL / CC BY-SA 3.0
- [Stockfish.js](https://github.com/nmrugg/stockfish.js) – GPL-3.0
- Eröffnungsdaten: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) – CC0

Wegen chessground und Stockfish steht dieses Projekt unter GPL-3.0-or-later.
Es verwendet keine Logos, Namen oder Grafiken von Chess.com. Die
Kategorie-Symbole sind eigene SVG-Zeichnungen in `public/js/categories.js`
(farbiger Kreis mit weißem Zeichen, wie auf Analyse-Seiten üblich).
