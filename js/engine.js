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
      // In den Freispielen ersetzt der Bergretter den Schneesturm (gleiche Häufigkeit)
      const fs = config.freeSpins;
      this.bonusSymbols = config.symbols.map((s) =>
        s.effect === 'reset' ? { ...fs.rescuer, weight: s.weight, effect: 'rescue' } : s);
      // Bergretter-Alarm (Glücksscheibe): Bergretter kommt doppelt so oft
      this.alarmSymbols = this.bonusSymbols.map((s) => s.effect === 'rescue' ? { ...s, weight: s.weight * 2 } : s);
      this.balance = config.startBalance;
      this.bet = config.defaultBet;
      // Level 0 = Tal, 1…n = Lager, n+1 = Gipfel (der Berg bleibt dort bis Sammeln/Schneesturm)
      this.levels = config.ladders.map(() => 0);
      this.summitHits = config.ladders.map(() => 0); // wie oft der Gipfelpreis kassiert wurde
      this.summitBank = 0; // Gipfelgewinne, die im Cashpot liegen
      // laufende Bergretter-Freispiele: { total, left, mult, wheelDone, cable, cablePending, alarm, gold }
      this.bonus = null;
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

    // Glücksscheibe am Anfang der Freispiele. Ein Dreh = ein Feld; bei „Nochmal drehen“ wird erneut
    // gedreht, Multiplikatoren addieren sich. Alle Felder sind gleich groß, also gleich wahrscheinlich.
    spinWheel() {
      if (!this.bonus || this.bonus.wheelDone) return null;
      const wheel = this.config.freeSpins.wheel;
      const forced = this.forcedWheel;
      this.forcedWheel = null;
      const index = forced !== null && forced >= 0 && forced < wheel.length
        ? forced
        : Math.min(wheel.length - 1, Math.floor(this.rng() * wheel.length));
      const field = wheel[index];
      const b = this.bonus;
      const events = [];
      this._addMult(field.mult);
      if (field.spins) { b.left += field.spins; b.total += field.spins; }
      if (field.camp) this.levels = this.levels.map((l) => Math.max(l, field.camp));
      if (field.cable) b.cablePending = true;
      if (field.alarm) b.alarm = true;
      if (field.gold) b.gold = true;
      if (field.gift) this._reachSummit(Math.floor(this.rng() * this.levels.length), events);
      let jackpot = 0;
      if (field.jackpot) {
        // Jackpot wird gemerkt und erst nach den Freispielen zusammen mit allem anderen ausgezahlt
        jackpot = cents(field.jackpot * this.bet);
        b.jackpot = cents(b.jackpot + jackpot);
      }
      b.wheelDone = !field.respin;
      return { index, field, jackpot, events, mult: b.mult, done: b.wheelDone };
    }

    // Seilbahn (Glücksscheibe): der gewählte Berg steigt im Bonus bei jedem Treffer 2 Lager
    chooseCable(i) {
      if (!this.bonus || !this.bonus.cablePending) return;
      this.bonus.cable = i;
      this.bonus.cablePending = false;
    }

    // Multiplikator erhöhen – er gilt für den ganzen Bonus-Cashpot, auch für schon gesammelte Gipfelpreise
    _addMult(x) {
      const b = this.bonus;
      const m = b.mult || 0;
      const next = m + x;
      if (m > 0) this.summitBank = cents((this.summitBank * next) / m);
      b.mult = next;
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
      const table = this.bonus ? (this.bonus.alarm ? this.alarmSymbols : this.bonusSymbols) : this.config.symbols;
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
        // Sicherheitsnetz, falls die Scheibe nicht (fertig) gedreht oder keine Seilbahn gewählt wurde
        while (!this.bonus.wheelDone) this.spinWheel();
        if (this.bonus.cablePending) this.chooseCable(this.levels.length - 1);
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
          // Bergretter: Multiplikator +1 (Gold-Bergretter: +2) und der niedrigste Berg steigt 1 Lager
          const multBefore = this.bonus.mult;
          this._addMult(this.bonus.gold ? 2 : 1);
          events.push({ type: 'rescue', ladder: lowest, multBefore, multAfter: this.bonus.mult });
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
        // Alle drei Gipfel im Bonus: Freispiele verlängern. Die Berge starten wieder unten,
        // der bisherige Bonus-Cashpot bleibt erhalten.
        if (this.levels.every((_, i) => this.isAtSummit(i))) {
          const levels = this.levels.slice();
          const hits = this.summitHits.slice();
          const add = this.config.freeSpins.retrigger;
          this.summitBank = this.cashpot;
          this.levels = this.levels.map(() => 0);
          this.summitHits = this.summitHits.map(() => 0);
          this.bonus.left += add;
          this.bonus.total += add;
          events.push({ type: 'bonusRetrigger', spins: add, levels, hits });
        }
        // Letztes Freispiel: Bonus-Cashpot wird automatisch ausgezahlt
        if (this.bonus.left <= 0) {
          const total = this.bonus.total;
          const levels = this.levels.slice(); // Endstand für die Anzeige
          const hits = this.summitHits.slice();
          const { mult, carried, jackpot } = this.bonus;
          const spinsWin = this.cashpot; // Bonus-Cashpot inkl. Multiplikator
          this._resetRound();
          // Alles aus dem Bonus auf einmal gutschreiben: gesicherter Cashpot + Jackpot + Freispiele
          const paid = cents(carried + jackpot + spinsWin);
          this.balance = cents(this.balance + paid);
          this.bonus = null;
          events.push({ type: 'bonusEnd', paid, carried, jackpot, spinsWin, total, levels, hits, mult });
        }
      } else if (this.levels.every((_, i) => this.isAtSummit(i))) {
        // Alle drei Gipfel: Cashpot wird gesichert (nicht sofort ausgezahlt) und am Ende
        // der Bergretter-Freispiele zusammen mit dem Bonusgewinn gutgeschrieben
        const hits = this.summitHits.slice();
        const carried = this.cashpot;
        this._resetRound();
        events.push({ type: 'allSummits', carried, hits });
        const count = this.config.freeSpins.count;
        this.bonus = { total: count, left: count, mult: null, wheelDone: false, carried, jackpot: 0 };
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
        // Seilbahn: der gewählte Berg steigt bei jedem Treffer ein zusätzliches Lager
        if (this.bonus && this.bonus.cable === i && !this._cableStep) {
          this._cableStep = true;
          this._climb([i], events);
          this._cableStep = false;
        }
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
