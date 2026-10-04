// Susak Peaks – Spiellogik ohne UI. Läuft im Browser und in Node (für Simulationen).
(function (root) {
  function defaultRng() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] / 4294967296;
    }
    return Math.random();
  }

  // Alle Geldbeträge auf Cent runden, um Fließkomma-Drift zu vermeiden.
  const cents = (n) => Math.round(n * 100) / 100;

  class SusakEngine {
    constructor(config, rng = defaultRng) {
      this.config = config;
      this.rng = rng;
      // In den Freispielen ersetzt der Bergretter den Teufel (gleiche Häufigkeit)
      const fs = config.freeSpins;
      this.bonusSymbols = config.symbols.map((s) =>
        s.effect === 'reset' ? { ...fs.rescuer, weight: s.weight, effect: 'rescue' } : s);
      this.balance = config.startBalance;
      this.bet = config.defaultBet;
      // Level 0 = Tal, 1…n = Lager, n+1 = Gipfel (der Berg bleibt dort bis Sammeln/Teufel)
      this.levels = config.ladders.map(() => 0);
      this.summitHits = config.ladders.map(() => 0); // wie oft der Gipfelpreis kassiert wurde
      this.summitBank = 0; // Gipfelgewinne, die im Cashpot liegen
      this.bonus = null;   // laufende Bergretter-Freispiele: { total, left, mult }
      this.forcedNext = null; // nur zum Testen: Symbol-ID für den nächsten Spin
      this.forcedWheel = null; // nur zum Testen: Feld der Glücksscheibe
      this.gamble = null;      // laufendes Kartenspiel Rot/Schwarz: { amount, start, rounds }
      this.forcedCard = null;  // nur zum Testen: 'red' | 'black'
    }

    // ---------- Kartenspiel Rot oder Schwarz (beim Sammeln) ----------
    // Der Cashpot wandert ins Kartenspiel; richtig geraten verdoppelt, falsch verringert ihn.
    startGamble() {
      if (this.bonus || this.gamble) return 0;
      const amount = this.cashpot;
      if (amount <= 0) return 0;
      this._resetRound();
      this.gamble = { amount, start: amount, rounds: 0 };
      return amount;
    }

    guessColor(color) {
      if (!this.gamble) return null;
      const g = this.gamble;
      const max = this.config.gamble.maxRounds;
      if (max && g.rounds >= max) return null;
      const card = this.forcedCard ?? (this.rng() < 0.5 ? 'red' : 'black');
      this.forcedCard = null;
      const win = card === color;
      const before = g.amount;
      // ganze Dollar: beim Halbieren wird abgerundet, bis irgendwann nichts mehr übrig ist
      g.amount = win ? before * 2 : Math.floor(before * this.config.gamble.loseFactor);
      g.rounds += 1;
      const busted = g.amount <= 0;
      if (busted) this.gamble = null;
      return { card, color, win, before, amount: Math.max(0, g.amount), busted, rounds: g.rounds };
    }

    takeGamble() {
      if (!this.gamble) return 0;
      const amount = this.gamble.amount;
      this.balance = cents(this.balance + amount);
      this.gamble = null;
      return amount;
    }

    // Multiplikator der Glücksscheibe (gilt für alle Beträge während der Freispiele)
    get mult() {
      return this.bonus?.mult ?? 1;
    }

    // Glücksscheibe am Anfang der Freispiele: bestimmt den Multiplikator für den ganzen Bonus.
    // Alle Felder sind gleich groß, also gleich wahrscheinlich.
    spinWheel() {
      if (!this.bonus || this.bonus.mult) return null;
      const wheel = this.config.freeSpins.wheel;
      const forced = this.forcedWheel;
      this.forcedWheel = null;
      const index = forced !== null && forced >= 0 && forced < wheel.length
        ? forced
        : Math.min(wheel.length - 1, Math.floor(this.rng() * wheel.length));
      this.bonus.mult = wheel[index];
      return { index, mult: wheel[index] };
    }

    // Testhilfe: bestimmt das Symbol des nächsten Spins (z. B. 'KING' für den Bonus)
    forceNext(id) {
      this.forcedNext = id;
    }

    isAtSummit(i) {
      return this.levels[i] > this.config.ladders[i].steps.length;
    }

    // Einsatz ist gesperrt, solange eine Runde mit Fortschritt oder ein Bonus läuft.
    get betLocked() {
      return this.cashpot > 0 || this.bonus !== null || this.gamble !== null;
    }

    // Cashpot = Gipfelgewinne + aktuelle Lagerwerte (am Gipfel zählt nur der Gipfelpreis).
    get cashpot() {
      return cents(this.config.ladders.reduce((sum, ladder, i) => {
        const lvl = this.levels[i];
        const onCamp = lvl > 0 && lvl <= ladder.steps.length;
        return sum + (onCamp ? cents(ladder.steps[lvl - 1] * this.bet * this.mult) : 0);
      }, this.summitBank));
    }

    setBet(bet) {
      if (this.betLocked || !this.config.bets.includes(bet)) return false;
      this.bet = bet;
      return true;
    }

    canSpin() {
      if (this.gamble) return false;
      return this.bonus !== null || this.balance >= this.bet;
    }

    drawSymbol() {
      const table = this.bonus ? this.bonusSymbols : this.config.symbols;
      const total = table.reduce((s, x) => s + x.weight, 0);
      let r = this.rng() * total;
      for (const sym of table) {
        if ((r -= sym.weight) < 0) return sym;
      }
      return table[table.length - 1];
    }

    // Führt einen Spin aus und liefert Symbol, Kosten und eine Liste von Ereignissen für die Darstellung.
    spin() {
      if (!this.canSpin()) return null;
      const inBonus = this.bonus !== null;
      const cost = inBonus ? 0 : this.bet;
      this.balance = cents(this.balance - cost);
      if (inBonus) {
        if (!this.bonus.mult) this.spinWheel(); // Sicherheitsnetz, falls die Scheibe nicht gedreht wurde
        this.bonus.left -= 1;
      }

      const table = this.bonus ? this.bonusSymbols : this.config.symbols;
      const forced = this.forcedNext && table.find((x) => x.id === this.forcedNext);
      this.forcedNext = null;
      const symbol = forced || this.drawSymbol();
      const events = [];
      const all = this.levels.map((_, i) => i);

      switch (symbol.effect) {
        case 'ladder':
          this._climb([symbol.ladder], events);
          break;
        case 'all':
          this._climb(all, events);
          break;
        case 'king':
          if (this.config.kingMode === 'summit') {
            for (const i of all) this._reachSummit(i, events);
          } else if (this.config.kingMode === 'all') {
            this._climb(all, events);
          }
          break;
        case 'rescue': {
          // Bergretter: bringt den niedrigsten Berg ein Lager höher
          const lowest = all.reduce((a, b) => (this.levels[b] < this.levels[a] ? b : a));
          events.push({ type: 'rescue', ladder: lowest });
          this._climb([lowest], events);
          break;
        }
        case 'reset': {
          const lost = this.cashpot;
          this._resetRound();
          events.push({ type: 'reset', lost });
          break;
        }
      }

      if (inBonus) {
        // Letztes Freispiel: Bonus-Cashpot wird automatisch ausgezahlt
        if (this.bonus.left <= 0) {
          const total = this.bonus.total;
          const levels = this.levels.slice(); // Endstand für die Anzeige
          const hits = this.summitHits.slice();
          const mult = this.bonus.mult;
          const paid = this._payout(); // noch mit Multiplikator
          this.bonus = null;
          events.push({ type: 'bonusEnd', paid, total, levels, hits, mult });
        }
      } else if (this.levels.every((_, i) => this.isAtSummit(i))) {
        // Alle drei Gipfel: Cashpot auszahlen und Bergretter-Freispiele starten
        const hits = this.summitHits.slice();
        const paid = this._payout();
        events.push({ type: 'allSummits', paid, hits });
        const count = this.config.freeSpins.count;
        this.bonus = { total: count, left: count, mult: null };
        events.push({ type: 'bonusStart', spins: count });
      }
      return { symbol, cost, events };
    }

    // Guthaben auffüllen (wie Susak City: auf den Startwert setzen).
    refill(amount) {
      this.balance = cents(amount);
    }

    // Sammeln: Cashpot auszahlen, alle Leitern zurücksetzen. In den Freispielen nicht möglich.
    collect() {
      if (this.bonus) return 0;
      return this._payout();
    }

    _payout() {
      const amount = this.cashpot;
      if (amount <= 0) return 0;
      this.balance = cents(this.balance + amount);
      this._resetRound();
      return amount;
    }

    _resetRound() {
      this.levels = this.levels.map(() => 0);
      this.summitHits = this.summitHits.map(() => 0);
      this.summitBank = 0;
    }

    _climb(indices, events) {
      for (const i of indices) {
        if (this.levels[i] >= this.config.ladders[i].steps.length) {
          // vom letzten Lager auf den Gipfel – oder erneuter Treffer am Gipfel
          this._reachSummit(i, events);
        } else {
          this.levels[i] += 1;
          events.push({ type: 'climb', ladder: i, level: this.levels[i] });
        }
      }
    }

    // Gipfel: Der Berg bleibt oben, jeder Treffer legt den Gipfelpreis (erneut) in den Cashpot.
    // In den Freispielen gilt der Multiplikator der Glücksscheibe.
    _reachSummit(i, events) {
      const ladder = this.config.ladders[i];
      const mult = this.mult;
      const prize = cents(ladder.topPrize * this.bet * mult);
      const repeat = this.isAtSummit(i);
      this.summitBank = cents(this.summitBank + prize);
      this.levels[i] = ladder.steps.length + 1;
      this.summitHits[i] += 1;
      events.push({ type: 'top', ladder: i, prize, repeat, hits: this.summitHits[i], mult, bonus: ladder.bonus });
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = SusakEngine;
  else root.SusakEngine = SusakEngine;
})(typeof window !== 'undefined' ? window : globalThis);
