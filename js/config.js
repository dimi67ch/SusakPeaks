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
    },

    // Drei Gewinnleitern. steps[i] = Wert der Stufe i+1 im Cashpot.
    // Ein weiterer Treffer über der letzten Stufe erreicht den Gipfel: topPrize wandert in den
    // Cashpot und der Berg bleibt oben. Jeder weitere Treffer legt topPrize erneut in den Cashpot.
    ladders: [
      // bonus: Platzhalter für spätere Bonusfunktionen (wird beim Erreichen der Spitze gemeldet).
      // peak: Lage des Berges in der Landschaft (in % der Bühne): x = Gipfel horizontal,
      //       y = Gipfelhöhe von oben, w = halbe Bergbreite am Fuß.
      { id: 'A', name: 'Taschenmesser', icon: '🔪', image: 'assets/knife.webp', color: '#46e3a0', peak: { x: 19, y: 34, w: 22 },
        steps: [0.23, 0.53, 1.14, 2.13, 3.57], topPrize: 3.65, bonus: null },
      { id: 'B', name: 'Adler', icon: '🦅', image: 'assets/eagle.webp', color: '#5aa9ff', peak: { x: 81, y: 24, w: 22 },
        steps: [0.3, 0.68, 1.37, 2.58, 4.18], topPrize: 5.32, bonus: null },
      { id: 'C', name: 'Pistenraupe', icon: '🚜', image: 'assets/snowcat.webp', color: '#c08bff', peak: { x: 50, y: 9, w: 26 },
        steps: [0.38, 1.06, 2.13, 3.65, 6.16], topPrize: 8.06, bonus: null },
    ],

    // Walzensymbole mit Gewichtung (Wahrscheinlichkeit = weight / Summe aller weights).
    // effect: 'ladder' (eine Leiter +1), 'all' (alle Leitern +1), 'king' (siehe kingMode),
    //         'reset' (Leitern und Cashpot auf 0)
    symbols: [
      { id: 'A',     name: 'Taschenmesser', icon: '🔪', image: 'assets/knife.webp', weight: 30, effect: 'ladder', ladder: 0 },
      { id: 'B',     name: 'Adler',         icon: '🦅', image: 'assets/eagle.webp', weight: 24, effect: 'ladder', ladder: 1 },
      { id: 'C',     name: 'Pistenraupe',   icon: '🚜', image: 'assets/snowcat.webp', weight: 16, effect: 'ladder', ladder: 2 },
      { id: 'SUN',   name: 'Sonne (Wild)',  icon: '☀️', image: 'assets/sun.webp', weight: 6,  effect: 'all' },
      { id: 'KING',  name: 'König',         icon: '👑', image: 'assets/king.webp', weight: 0.46, effect: 'king' }, // ca. 1 von 200 Spins
      { id: 'DEVIL', name: 'Schneesturm',   icon: '❄️', image: 'assets/snowflake.webp', weight: 15.72, effect: 'reset' },
    ],

    // Bergretter-Freispiele: starten, wenn alle drei Berge am Gipfel stehen (der Cashpot wird gesichert).
    // Zuerst wird die Glücksscheibe gedreht – ihr Multiplikator gilt für alle Beträge im Bonus.
    // Ohne Einsatz, ohne Schneesturm – an seiner Stelle bringt der Bergretter den niedrigsten Berg ein Lager höher.
    // Erreichen im Bonus wieder alle drei Berge den Gipfel, gibt es weitere Freispiele (Berge starten neu).
    // Am Ende wird alles zusammen ausgezahlt: gesicherter Cashpot + Jackpot + Bonus-Cashpot.
    freeSpins: {
      count: 8,
      retrigger: 8, // +8 Freispiele, wenn im Bonus wieder alle drei Gipfel erreicht werden
      // Glücksscheibe: Felder im Uhrzeigersinn, alle gleich groß (= gleich wahrscheinlich).
      // mult: Multiplikator (Felder auf einer Nochmal-drehen-Kette addieren sich)
      // respin: nochmal drehen · spins: Extra-Freispiele · camp: alle Berge starten auf diesem Lager
      // cable: Seilbahn – gewählter Berg steigt bei jedem Treffer 2 Lager · gift: ein Berg startet am Gipfel
      // jackpot: Gewinn (× Einsatz) · alarm: Bergretter doppelt so oft · gold: Bergretter +2 statt +1
      // short: Stichwort auf dem Rad (Sonderfelder), der Multiplikator steht klein daneben
      rescueSpins: 1, // jeder Bergretter im Bonus bringt +1 Freispiel
      wheel: [
        { id: 'x3',      label: '×3',  icon: '',   name: '×3',                 mult: 3 },
        { id: 'cable',   label: '×2',  icon: '🚡', name: 'Seilbahn',           mult: 2, cable: true, short: 'LIFT' },
        { id: 'x10',     label: '×10', icon: '',   name: '×10',                mult: 10 },
        { id: 'alarm',   label: '×3',  icon: '🚨', name: 'Bergretter-Alarm',   mult: 3, alarm: true, short: 'ALARM' },
        { id: 'spins',   label: '×2',  icon: '🎟️', name: '+3 Freispiele',      mult: 2, spins: 3, short: '+3 FS' },
        { id: 'jackpot', label: '250×', icon: '💎', name: 'Jackpot',           mult: 2, jackpot: 250, short: '250×' },
        { id: 'x5',      label: '×5',  icon: '',   name: '×5',                 mult: 5 },
        { id: 'gold',    label: '×3',  icon: '🥇', name: 'Gold-Bergretter',    mult: 3, gold: true, short: 'GOLD' },
        { id: 'camp',    label: '×2',  icon: '⛺', name: 'Basislager',         mult: 2, camp: 2, short: 'LAGER' },
        { id: 'again',   label: '×2',  icon: '🔁', name: 'Nochmal drehen',     mult: 2, respin: true, short: 'NOCHMAL' },
        { id: 'gift',    label: '×2',  icon: '🚩', name: 'Gipfel-Geschenk',    mult: 2, gift: true, short: 'GIPFEL' },
      ],
      // Bergretter: bringt den niedrigsten Berg 1 Lager höher und erhöht den Multiplikator um 1
      rescuer: { id: 'RESCUE', name: 'Bergretter', icon: '⛑️', image: 'assets/helmet.webp' },
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
