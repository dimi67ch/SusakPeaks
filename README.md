# Susak Peaks – Ein-Walzen-Slot

Ein-Walzen-Spielautomat mit drei Bergen als Gewinnleitern (reines Frontend, Vanilla JS ohne Build, Spielgeld).
Installierbar als PWA.

```bash
python3 -m http.server 8765   # Spiel unter http://localhost:8765
node tools/simulate.js        # RTP-Simulation (Standard: 2 Mio. Spins)
```

Testmodus mit Knöpfen zum Erzwingen von Symbolen, Glücksrad-Feldern und Karten: `http://localhost:8765/?dev`

## Spielregeln

| | |
|---|---|
| Walze | 1 Walze, das Symbol in der Mitte zählt |
| Berge | 🔪 Taschenmesser · 🦅 Adler · 🚜 Pistenraupe – je 5 Lager, darüber der Gipfel |
| Treffer | Das Symbol eines Berges bringt ihn 1 Lager höher, der Lagerwert liegt im Cashpot |
| Gipfel | Gipfelpreis wandert in den Cashpot, der Berg bleibt oben, jeder weitere Treffer zahlt ihn erneut |
| ☀️ Sonne | Wild, alle drei Berge +1 Lager |
| 👑 König | Alle drei Berge sofort am Gipfel → Bergretter-Freispiele |
| ❄️ Schneesturm | Alle Berge zurück ins Tal, der Cashpot ist verloren |
| Gambeln | Cashpot ins Susak Casino: Rot oder Schwarz, richtig ×2, falsch ÷2 (bis $0) oder kassieren |
| Einsatz | $10 – $1.000, Startguthaben $10.000, bei leerem Guthaben auffüllen |

**Wahrscheinlichkeiten pro Spin:** Taschenmesser 32,5 % · Adler 26,0 % · Pistenraupe 17,4 % · Sonne 6,5 % ·
Schneesturm 17,1 % · König 0,5 % (ca. 1 von 200).

### Bergretter-Freispiele

Startet, wenn alle drei Berge am Gipfel stehen (ca. 1 von 210 Spins).

1. Der Gipfel-Cashpot wird **gesichert** und erst nach dem Bonus ausgezahlt.
2. **Glücksrad** mit 11 gleich großen Feldern: Jedes Feld gibt einen Multiplikator für alle Freispiel-Gewinne,
   Sonderfelder zusätzlich ein Extra.
3. **8 Freispiele**, jedes per Spin-Taste gestartet. Statt Schneesturm kommt der ⛑️ **Bergretter**:
   niedrigster Berg +1 Lager, Multiplikator +1 und +1 Freispiel.
4. Wieder alle drei Gipfel im Bonus: +8 Freispiele, die Berge starten neu.
5. Am Ende wird alles zusammen ausgezahlt (gesicherter Cashpot + Jackpot + Bonus-Cashpot) –
   mit Big/Mega/Epic-Win-Anzeige ab 10× / 25× / 50× Einsatz.

| Feld | Multiplikator | Extra |
|---|---|---|
| ×3 · ×5 · ×10 | ×3 / ×5 / ×10 | – |
| 💎 Jackpot | ×2 | 250× Einsatz |
| 🔁 Nochmal drehen | ×2 | Rad dreht erneut, Multiplikatoren addieren sich |
| 🚩 Gipfel-Geschenk | ×2 | Ein zufälliger Berg startet am Gipfel |
| ⛺ Basislager | ×2 | Alle Berge starten auf Lager 2 |
| 🎟️ +3 Freispiele | ×2 | 3 Freispiele mehr |
| 🚡 Seilbahn | ×2 | Gewählter Berg steigt 2 Lager pro Treffer |
| 🚨 Bergretter-Alarm | ×3 | Bergretter kommt doppelt so oft |
| 🥇 Gold-Bergretter | ×3 | Jeder Bergretter: Multiplikator +2 statt +1 |

## Auszahlungsquote

`node tools/simulate.js` spielt verschiedene Sammel-Strategien durch. Mit normalen Strategien
(Sammeln nach 1–8 Spins oder ab 2–15× Einsatz) liegt der RTP bei **ca. 90–93 %**, davon rund 63 % aus dem Bonus.

**Bekannte Schwäche:** Wer nie sammelt und nur auf den Bonus spielt, kommt auf über 100 % RTP.

Alle Werte (Gewichte, Lagerwerte, Glücksrad, Freispiele) stehen in `js/config.js`.

## Projektstruktur

```
index.html          Seite mit Ladebildschirm, Spielfläche, Spielregeln, Bonus- und Casino-Overlay
css/style.css       Gesamtes Styling (Glassmorphism, Berglandschaft, Overlays, Handy-Layout)
js/
  config.js         Spielkonfiguration (auch von Node für die Simulation genutzt)
  engine.js         Spiellogik ohne DOM: Spin, Leitern, Cashpot, Bonus, Glücksrad, Gambeln
  ui.js             Darstellung und Ablauf: Walze, Berge, Bonus, Big Win, Casino, Autoplay, Dev-Panel
  sfx.js            Synthetisierte Web-Audio-Sounds (mit iOS-Audio-Fix)
  particles.js      Partikel für große Gewinne
  boot.js           Ladebildschirm, Vorladen, Installieren-Button
sw.js               Service Worker (Netzwerk zuerst, offline aus dem Cache)
manifest.json       PWA-Manifest
assets/  icons/     Bilder und App-Icons
tools/simulate.js   RTP-Simulation
```

Nach Änderungen an CSS/JS die Versionsnummer `?v=` in `index.html` und bei neuen Dateien
den Cache-Namen in `sw.js` hochzählen, damit Browser und installierte App die neue Version laden.

## Steuerung

| Taste | Aktion |
|---|---|
| Leertaste | Spin · nochmal drücken = schneller Stopp · im Bonus: Rad drehen / Freispiel |
| C | Gambeln |
| R / S | Im Casino: Rot / Schwarz |
| Enter | Im Casino: kassieren |

⚡ Turbo verkürzt Walzenlauf und Pausen (auch im Autoplay), nicht aber das Kartenspiel.

## PWA (installierbar & offline)

Service Worker brauchen HTTPS oder `localhost`. Über die lokale IP (`http://192.168.x.x`)
läuft das Spiel, ist aber nicht installierbar.

Installieren: Chrome/Edge über das Symbol in der Adressleiste oder den Button im Ladebildschirm,
iOS über Safari → Teilen → „Zum Home-Bildschirm“.
