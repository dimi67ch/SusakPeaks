// Susak Peaks – zentrale Spielkonfiguration.
// Alles, was später noch definiert wird (Symbole, Stufen, Auszahlungen, Bonus),
// wird hier angepasst. Werte in "steps" und "topPrize" sind Vielfache des Einsatzes.
(function (root) {
  const CONFIG = {
    // Wie Susak City: Startguthaben und Einsatzstufen
    startBalance: 10000,
    bets: [10, 20, 50, 100, 200, 500, 1000],
    defaultBet: 20,

    // Walzenlauf (wie Susak City): stop = ms bis zum Stopp, speed = Zellen pro ms
    reelTiming: {
      normal: { stop: 1000, speed: 0.026 },
      turbo: { stop: 420, speed: 0.034 },
    },

    // Autoplay: Auswahl im Menü der Actionbar
    autoplay: {
      spins: [10, 25, 50, 100],
      collectAt: [2, 4, 6, 10, 15, 20], // Auto-Sammeln ab Cashpot ≥ x × Einsatz
      defaultCollectAt: 6,
      defaultLossLimit: 2000,            // in Dollar, leer = kein Limit
    },

    // Drei Gewinnleitern. steps[i] = Wert der Stufe i+1 im Cashpot.
    // Ein weiterer Treffer über der letzten Stufe erreicht den Gipfel: topPrize wandert in den
    // Cashpot und der Berg bleibt oben. Jeder weitere Treffer legt topPrize erneut in den Cashpot.
    ladders: [
      // bonus: Platzhalter für spätere Bonusfunktionen (wird beim Erreichen der Spitze gemeldet).
      // peak: Lage des Berges in der Landschaft (in % der Bühne): x = Gipfel horizontal,
      //       y = Gipfelhöhe von oben, w = halbe Bergbreite am Fuß.
      { id: 'A', name: 'Platzhalter A', icon: '🌲', color: '#46e3a0', peak: { x: 19, y: 34, w: 22 },
        steps: [0.3, 0.8, 1.7, 3.2, 5.3], topPrize: 5.5, bonus: null },
      { id: 'B', name: 'Platzhalter B', icon: '🦅', color: '#5aa9ff', peak: { x: 81, y: 24, w: 22 },
        steps: [0.4, 1, 2.1, 3.9, 6.2], topPrize: 8, bonus: null },
      { id: 'C', name: 'Platzhalter C', icon: '💎', color: '#c08bff', peak: { x: 50, y: 9, w: 26 },
        steps: [0.6, 1.6, 3.2, 5.5, 9.2], topPrize: 12, bonus: null },
    ],

    // Walzensymbole mit Gewichtung (Wahrscheinlichkeit = weight / Summe aller weights).
    // effect: 'ladder' (eine Leiter +1), 'all' (alle Leitern +1), 'king' (siehe kingMode),
    //         'reset' (Leitern und Cashpot auf 0)
    symbols: [
      { id: 'A',     name: 'Platzhalter A', icon: '🌲', weight: 30, effect: 'ladder', ladder: 0 },
      { id: 'B',     name: 'Platzhalter B', icon: '🦅', weight: 24, effect: 'ladder', ladder: 1 },
      { id: 'C',     name: 'Platzhalter C', icon: '💎', weight: 16, effect: 'ladder', ladder: 2 },
      { id: 'SUN',   name: 'Sonne (Wild)',  icon: '☀️', weight: 6,  effect: 'all' },
      { id: 'KING',  name: 'König',         icon: '👑', weight: 0.74, effect: 'king' },
      { id: 'DEVIL', name: 'Teufel',        icon: '😈', weight: 15.72, effect: 'reset' },
    ],

    // Bergretter-Freispiele: starten, wenn alle drei Berge am Gipfel stehen (Cashpot wird vorher ausgezahlt).
    // Zuerst wird die Glücksscheibe gedreht – ihr Multiplikator gilt für alle Beträge im Bonus.
    // Ohne Einsatz, ohne Teufel – an seiner Stelle bringt der Bergretter den niedrigsten Berg ein Lager höher.
    // Der Bonus-Cashpot wird am Ende automatisch ausgezahlt.
    freeSpins: {
      count: 8,
      // Felder der Glücksscheibe im Uhrzeigersinn (alle gleich groß = gleich wahrscheinlich)
      wheel: [2, 3, 2, 5, 2, 3, 2, 10],
      rescuer: { id: 'RESCUE', name: 'Bergretter', icon: '⛑️' },
    },

    // Kartenspiel Rot oder Schwarz beim Sammeln: richtig = ×2, falsch = × loseFactor (abgerundet).
    // maxRounds: höchstens so viele Runden pro Sammeln (null = unbegrenzt, bis der Gewinn auf $0 ist).
    gamble: {
      loseFactor: 0.5,
      maxRounds: null,
    },

    // König-Variante:
    //  'summit' – alle drei Leitern erreichen sofort den Gipfel (Gipfelgewinne in den Cashpot)
    //  'all'    – Joker, hebt alle Leitern um eine Stufe (wie die Sonne)
    //  'blank'  – König hat keine Wirkung
    kingMode: 'summit',
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.SUSAK_CONFIG = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
