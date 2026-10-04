// Susak Peaks – Darstellung und Bedienung.
(function () {
  const CONFIG = window.SUSAK_CONFIG;
  const engine = new window.SusakEngine(CONFIG);

  const $ = (id) => document.getElementById(id);
  const sfx = window.sfx;
  const el = {
    cashpot: $('cashpot'), summitBank: $('summitBank'), cashpotBox: $('cashpotBox'),
    message: $('message'), strip: $('strip'), ladders: $('range'),
    symbolList: $('symbolList'), flash: $('flash'),
    // Actionbar
    balance: $('balance'), bet: $('bet'), betUp: $('bet-up'), betDown: $('bet-down'),
    spin: $('btn-spin'), collect: $('btn-collect'), collectValue: $('collect-value'),
    turbo: $('btn-turbo'), sound: $('btn-sound'), info: $('btn-info'), infoDialog: $('info-dialog'),
    auto: $('btn-auto'), autoMenu: $('auto-menu'), autoCounts: $('auto-counts'), autoCount: $('auto-count'),
    autoCollect: $('auto-collect'), autoLoss: $('auto-loss'), autoStopSummit: $('auto-stop-summit'),
    cashpotLabel: $('cashpot-label'),
    bonusScreen: $('bonus-screen'), bonusIcon: $('bonus-icon'), bonusTitle: $('bonus-title'),
    bonusAmount: $('bonus-amount'), bonusText: $('bonus-text'), bonusBtn: $('bonus-btn'),
    wheel: $('wheel'), wheelDisc: $('wheel-disc'), wheelHub: $('wheel-hub'), bonusStage: $('bonus-stage'),
    gamble: $('gamble'), gambleImg: $('gamble-img'), gambleCard: $('gamble-card'), gambleCorner: $('gamble-corner'),
    gambleSuit: $('gamble-suit'), gambleCornerBr: $('gamble-corner-br'), gambleAmount: $('gamble-amount'), gambleHint: $('gamble-hint'),
    gambleHistory: $('gamble-history'), gambleMsg: $('gamble-msg'), gambleRed: $('gamble-red'),
    gambleBlack: $('gamble-black'), gambleTake: $('gamble-take'),
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Wie Susak City: ganze Dollar, Punkt als Tausendertrennung – z. B. $10.000
  const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const fmt = (n) => `$${nf.format(Math.round(n))}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let spinning = false;

  // Turbo: dauerhaft kürzere Walzenlaufzeit (auch im Autoplay), wird pro Browser gemerkt.
  let turbo = false;
  try { turbo = localStorage.getItem('susak.turbo') === '1'; } catch (_) { /* ohne Speicher */ }

  // Bergretter-Freispiele laufen (inkl. Start- und Abschlussbildschirm)
  let bonusRunning = false;
  let bonusPrompt = null; // aktiver Button auf dem Bonus-Bildschirm
  let bonusMult = 1;      // erdrehter Multiplikator der Glücksscheibe
  let gambleOpen = false; // Kartenspiel Rot/Schwarz ist offen
  let gambleBusy = false; // Karte wird gerade aufgedeckt

  // Automodus-Zustand
  const auto = { active: false, remaining: 0, collectAt: 0, stopOnSummit: true, lossLimit: null, startBalance: 0 };

  // ---------- Berglandschaft ----------
  // Jede Leiter ist ein Berg: Lager entlang des Pfads, oben der Gipfel. SVG-Koordinaten sind
  // Prozent der Bühne (viewBox 0–100, gestreckt), die Lager liegen als HTML darüber.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const pts = (list) => list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  const plot = document.createElement('div');
  plot.className = 'range__plot';
  const svg = svgEl('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', class: 'range__svg', 'aria-hidden': 'true' });
  const defs = svgEl('defs');
  defs.innerHTML = `
    <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a3266"/><stop offset="1" stop-color="#0a0f26"/>
    </linearGradient>
    <linearGradient id="snow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4fbff"/><stop offset="1" stop-color="#a6ecff" stop-opacity="0.35"/>
    </linearGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3f86" stop-opacity="0.55"/><stop offset="1" stop-color="#121735" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="0.9"/>
    </filter>`;
  svg.appendChild(defs);
  // Entfernte Bergkette im Dunst
  svg.appendChild(svgEl('path', { class: 'range__far', fill: 'url(#haze)',
    d: 'M0 100 L0 62 L8 55 L14 60 L24 48 L33 57 L41 50 L47 56 L58 44 L66 53 L74 46 L83 55 L91 49 L100 58 L100 100 Z' }));
  plot.appendChild(svg);

  // x-Bereich eines Bergumrisses auf Höhe y (Schnitt der Gratlinie mit einer Waagerechten)
  function spanAt(ridge, y) {
    const xs = [];
    for (let k = 0; k < ridge.length - 1; k++) {
      const [x1, y1] = ridge[k];
      const [x2, y2] = ridge[k + 1];
      if (y1 !== y2 && (y - y1) * (y - y2) <= 0) xs.push(x1 + ((x2 - x1) * (y - y1)) / (y2 - y1));
    }
    return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null;
  }

  const VALLEY_Y = 92; // darunter liegt das Tal mit dem Bergnamen
  const peaks = CONFIG.ladders.map((ladder, i) => {
    const { x, y: sy, w } = ladder.peak;
    const h = 100 - sy;
    const at = (dx, dy) => [x + dx * w, sy + dy * h];
    const ridge = [
      at(-1.25, 1), at(-0.78, 0.6), at(-0.6, 0.47), at(-0.4, 0.38), at(-0.2, 0.15),
      [x, sy],
      at(0.14, 0.11), at(0.3, 0.28), at(0.48, 0.34), at(0.72, 0.6), at(1.25, 1),
    ];
    const snow = [at(-0.2, 0.15), [x, sy], at(0.14, 0.11), at(0.22, 0.2), at(0.08, 0.16), at(-0.04, 0.22), at(-0.12, 0.18)];

    // Segmente quer durch den Berg: unten die Lager, oben die Gipfelkappe
    const n = ladder.steps.length;
    const summitBottom = sy + h * 0.2;
    const edge = (k) => VALLEY_Y - ((VALLEY_Y - summitBottom) * k) / n; // Unterkante von Lager k+1
    const bands = ladder.steps.map((_, k) => ({ top: edge(k + 1), bottom: edge(k) }));

    const clipId = `peak-clip-${i}`;
    const clip = svgEl('clipPath', { id: clipId });
    clip.appendChild(svgEl('polygon', { points: pts(ridge) }));
    defs.appendChild(clip);

    const g = svgEl('g', { class: 'peak' });
    g.style.setProperty('--c', ladder.color);
    g.appendChild(svgEl('polygon', { class: 'peak__rock', points: pts(ridge), fill: 'url(#rock)' }));
    // Schattenflanke (Licht kommt von links oben) und Felsrillen geben dem Berg Volumen
    const relief = svgEl('g', { 'clip-path': `url(#${clipId})` });
    relief.appendChild(svgEl('polygon', { class: 'peak__shade',
      points: pts([[x, sy], at(0.14, 0.11), at(0.3, 0.28), at(0.48, 0.34), at(0.72, 0.6), at(1.25, 1), at(0.12, 1), at(0.04, 0.55), at(0.01, 0.25)]) }));
    for (const [a, b] of [[[-0.4, 0.38], [-0.3, 0.72]], [[-0.6, 0.47], [-0.62, 0.82]], [[-0.2, 0.15], [-0.12, 0.46]],
      [[0.3, 0.28], [0.22, 0.62]], [[0.48, 0.34], [0.56, 0.8]], [[0.14, 0.11], [0.1, 0.38]]]) {
      relief.appendChild(svgEl('polyline', { class: 'peak__crease', points: pts([at(...a), at((a[0] + b[0]) / 2 + 0.04, (a[1] + b[1]) / 2), at(...b)]) }));
    }
    g.appendChild(relief);
    g.appendChild(svgEl('polygon', { class: 'peak__glow', points: pts(ridge), fill: ladder.color }));
    g.appendChild(svgEl('polygon', { class: 'peak__snow', points: pts(snow), fill: 'url(#snow)' }));

    const bandGroup = svgEl('g', { 'clip-path': `url(#${clipId})` });
    const bandEls = bands.map((b) => {
      const r = svgEl('rect', { class: 'band', x: 0, y: b.top, width: 100, height: b.bottom - b.top });
      bandGroup.appendChild(r);
      return r;
    });
    const summitBand = svgEl('rect', { class: 'band band--summit', x: 0, y: sy - 1, width: 100, height: summitBottom - sy + 1 });
    bandGroup.appendChild(summitBand);
    // Trennlinien zwischen den Segmenten
    for (let k = 0; k <= n; k++) {
      bandGroup.appendChild(svgEl('line', { class: 'peak__sep', x1: 0, x2: 100, y1: edge(k), y2: edge(k) }));
    }
    g.appendChild(bandGroup);

    g.appendChild(svgEl('polyline', { class: 'peak__rim peak__rim--blur', points: pts(ridge.slice(1, -1)), filter: 'url(#glow)' }));
    g.appendChild(svgEl('polyline', { class: 'peak__rim', points: pts(ridge.slice(1, -1)) }));
    return { i, g, ridge, bands, bandEls, summitBand, x, sy };
  });
  // Niedrige Berge zuerst zeichnen, der höchste steht vorn
  [...peaks].sort((a, b) => b.sy - a.sy).forEach((p) => svg.appendChild(p.g));

  // Beschriftung mittig im sichtbaren Teil des Segments (vordere, höhere Berge verdecken hintere)
  function labelX(p, y) {
    const span = spanAt(p.ridge, y);
    if (!span) return p.x;
    let parts = [span];
    for (const f of peaks) {
      if (f.sy >= p.sy) continue;
      const fs = spanAt(f.ridge, y);
      if (!fs) continue;
      parts = parts.flatMap(([a, b]) => {
        if (fs[1] <= a || fs[0] >= b) return [[a, b]];
        const out = [];
        if (fs[0] > a) out.push([a, fs[0]]);
        if (fs[1] < b) out.push([fs[1], b]);
        return out;
      });
    }
    const [a, b] = parts.sort((u, v) => (v[1] - v[0]) - (u[1] - u[0]))[0] ?? span;
    return Math.min(96, Math.max(4, (a + b) / 2));
  }

  // Nebel zwischen den Bergen und eine Reihe Tannen im Tal (vor den Bergen, hinter den Beschriftungen)
  const mist = document.createElement('div');
  mist.className = 'range__mist';
  plot.appendChild(mist);

  const forest = svgEl('svg', { viewBox: '0 0 1000 60', preserveAspectRatio: 'xMidYMax slice', class: 'range__forest', 'aria-hidden': 'true' });
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // fester Zufall: Wald sieht immer gleich aus
  let trees = '';
  for (let tx = -10; tx < 1010; tx += 9 + rand() * 16) {
    const th = 18 + rand() * 34;
    const tw = th * (0.32 + rand() * 0.1);
    const base = 60 - rand() * 4;
    const tri = (tipY, footY, half) => `M${tx.toFixed(1)} ${tipY.toFixed(1)} L${(tx + half).toFixed(1)} ${footY.toFixed(1)} L${(tx - half).toFixed(1)} ${footY.toFixed(1)} Z `;
    // Tanne mit zwei Etagen
    trees += tri(base - th * 0.68, base, tw * 0.62) + tri(base - th, base - th * 0.32, tw * 0.42);
  }
  forest.innerHTML = `
    <defs><linearGradient id="pine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2c3a72"/><stop offset="0.7" stop-color="#111a3c"/><stop offset="1" stop-color="#070b1d"/>
    </linearGradient></defs>
    <rect x="0" y="54" width="1000" height="6" fill="#070b1d"/>
    <path d="${trees}" fill="url(#pine)"/>`;
  plot.appendChild(forest);

  const ladderEls = peaks.map((p) => {
    const ladder = CONFIG.ladders[p.i];
    const steps = p.bands.map((b, k) => {
      const cy = (b.top + b.bottom) / 2;
      const camp = document.createElement('div');
      camp.className = 'camp';
      camp.style.cssText = `left:${labelX(p, cy)}%;top:${cy}%;--c:${ladder.color}`;
      camp.title = `${ladder.name} – Lager ${k + 1}`;
      plot.appendChild(camp);
      return camp;
    });
    const summit = document.createElement('div');
    summit.className = 'summit';
    summit.style.cssText = `left:${p.x}%;top:${p.sy}%;--c:${ladder.color}`;
    plot.appendChild(summit);

    const base = document.createElement('div');
    base.className = 'peak-name';
    base.style.cssText = `left:${p.x}%;--c:${ladder.color}`;
    base.innerHTML = `<span class="peak-name__icon">${ladder.icon}</span>${ladder.name}`;
    plot.appendChild(base);
    return { steps, summit, peak: p };
  });
  el.ladders.appendChild(plot);

  for (const sym of [...CONFIG.symbols, { ...CONFIG.freeSpins.rescuer, effect: 'rescue' }]) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="icon">${sym.icon}</span><span><strong>${sym.name}</strong><br>${describe(sym)}</span>`;
    el.symbolList.appendChild(li);
  }

  function describe(sym) {
    switch (sym.effect) {
      case 'ladder': return `Hebt die Leiter „${CONFIG.ladders[sym.ladder].name}“ um eine Stufe.`;
      case 'all': return 'Wild: Hebt alle drei Leitern um eine Stufe.';
      case 'reset': return 'Löscht alle Leitern und den Cashpot – auch die Gipfelgewinne.';
      case 'rescue': return 'Nur in den Freispielen statt des Teufels: bringt den niedrigsten Berg ein Lager höher.';
      case 'king':
        return {
          summit: 'Alle drei Leitern erreichen sofort den Gipfel – drei Gipfelgewinne in den Cashpot!',
          all: 'Joker: Hebt alle drei Leitern um eine Stufe.',
          blank: 'Ohne Wirkung.',
        }[CONFIG.kingMode];
    }
    return '';
  }

  // ---------- Darstellung ----------
  function render(shown = engine) {
    el.balance.textContent = fmt(shown.balance);
    countTo(el.cashpot, shown.cashpot);
    // Während der Freispiele gelten alle Beträge mit dem Multiplikator der Glücksscheibe
    const m = bonusRunning ? bonusMult : 1;
    el.summitBank.textContent = bonusRunning && bonusMult > 1
      ? `Glücksscheibe ×${bonusMult}`
      : shown.summitBank > 0 ? `davon Gipfelgewinne: ${fmt(shown.summitBank)}` : '';
    el.bet.textContent = fmt(engine.bet);

    CONFIG.ladders.forEach((ladder, i) => {
      const lvl = shown.levels[i];
      const { steps, summit, peak } = ladderEls[i];
      const n = ladder.steps.length;
      steps.forEach((camp, k) => {
        camp.classList.toggle('is-reached', k < lvl);
        camp.classList.toggle('is-current', k === lvl - 1);
        camp.textContent = fmt(ladder.steps[k] * engine.bet * m);
      });
      const conquered = lvl > n;
      const hits = shown.summitHits[i];
      summit.classList.toggle('is-near', lvl === n);
      summit.classList.toggle('is-conquered', conquered);
      summit.innerHTML = `<span class="summit__flag" aria-hidden="true"></span>${fmt(ladder.topPrize * engine.bet * m)}`
        + (hits > 1 ? `<span class="summit__hits">×${hits}</span>` : '');
      // Alpenglühen: je höher der Aufstieg, desto stärker glüht der Berg – am Gipfel voll
      peak.g.style.setProperty('--heat', String(Math.min(1, lvl / n)));
      peak.g.classList.toggle('is-conquered', conquered);
      peak.bandEls.forEach((band, k) => {
        band.classList.toggle('is-reached', k < lvl);
        band.classList.toggle('is-current', k === lvl - 1);
      });
      peak.summitBand.classList.toggle('is-reached', conquered);
    });

    // Actionbar (wie Susak City)
    const idx = CONFIG.bets.indexOf(engine.bet);
    const busy = spinning || auto.active || bonusRunning || gambleOpen;
    el.betDown.disabled = busy || engine.betLocked || idx <= 0;
    el.betUp.disabled = busy || engine.betLocked || idx >= CONFIG.bets.length - 1;
    el.collectValue.textContent = fmt(shown.cashpot);
    el.collect.disabled = busy || engine.cashpot <= 0;
    el.collect.classList.toggle('is-winning', !busy && engine.cashpot > 0);
    el.turbo.setAttribute('aria-pressed', String(turbo));
    el.turbo.classList.toggle('is-active', turbo);
    el.sound.classList.toggle('is-muted', sfx.muted);
    el.auto.classList.toggle('is-active', auto.active);
    el.auto.disabled = bonusRunning;
    // Zähler am Spin-Button: verbleibende Freispiele oder Autoplay-Spins
    el.autoCount.textContent = engine.bonus ? String(engine.bonus.left) : auto.active ? String(auto.remaining) : '';
    el.spin.classList.toggle('is-auto', auto.active && !bonusRunning);
    el.cashpotLabel.textContent = bonusRunning ? 'Bonus-Cashpot' : 'Cashpot';
    el.cashpotBox.classList.toggle('has-mult', bonusRunning && bonusMult > 1);
    document.body.classList.toggle('is-bonus', bonusRunning);
    // Wie Susak City: Spin bleibt aktiv – bei zu wenig Guthaben kommt das Auffüll-Angebot
    document.body.classList.toggle('is-spinning', spinning);
  }

  // Ticker über der Actionbar (wie Susak City). tone: '' | 'win' | 'bonus' | 'warn' | 'bad'
  // Betrag weich hochzählen (nach unten springt er sofort)
  const counters = new WeakMap();
  function countTo(node, value) {
    const st = counters.get(node) ?? { shown: value, raf: 0 };
    counters.set(node, st);
    cancelAnimationFrame(st.raf);
    if (reducedMotion || value <= st.shown) {
      st.shown = value;
      node.textContent = fmt(value);
      return;
    }
    const from = st.shown;
    const t0 = performance.now();
    node.classList.remove('is-rising');
    void node.offsetWidth;
    node.classList.add('is-rising');
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 450);
      st.shown = from + (value - from) * (1 - Math.pow(1 - p, 3));
      node.textContent = fmt(Math.round(st.shown * 100) / 100);
      if (p < 1) st.raf = requestAnimationFrame(step);
      else st.shown = value;
    };
    st.raf = requestAnimationFrame(step);
  }

  function say(text, tone = '') {
    const t = el.message;
    t.dataset.tone = tone;
    t.textContent = text;
    t.classList.remove('is-new');
    void t.offsetWidth;
    t.classList.add('is-new');
  }

  // Zu wenig Guthaben: Angebot zum Auffüllen direkt im Ticker (wie Susak City)
  function refillOffer() {
    auto.active = false;
    auto.remaining = 0;
    say('Nicht genug Guthaben – ', 'warn');
    const b = document.createElement('button');
    b.className = 'ticker__action';
    b.textContent = `Auf ${fmt(CONFIG.startBalance)} auffüllen`;
    b.addEventListener('click', () => {
      engine.refill(CONFIG.startBalance);
      sfx.win(1);
      say('Guthaben aufgefüllt. Viel Glück!');
      render();
    });
    el.message.append(b);
    render();
  }

  function flash(kind) {
    el.flash.className = 'flash';
    void el.flash.offsetWidth;
    el.flash.className = 'flash ' + kind;
  }

  // ---------- Walze ----------
  // Bewegungsablauf wie in Susak City: Ausholen → Beschleunigen → konstante Fahrt →
  // Abbremsen → Nachfedern, Bild für Bild per requestAnimationFrame.
  const ROWS = 3;
  const WINDUP_MS = 130;
  const ACCEL_MS = 180;
  const DECEL_MS = 320;
  const BOUNCE_MS = 200;
  const OVERSHOOT = 0.22; // in Zellen
  const WINDUP = 0.22;

  const randomSymbol = () => engine.drawSymbol();
  let shownSymbols = ['A', 'SUN', 'C'].map((id) => CONFIG.symbols.find((s) => s.id === id) || CONFIG.symbols[0]);
  let run = null; // laufende Walzenfahrt

  function showStatic(symbols) {
    el.strip.classList.remove('spinning', 'is-fast');
    el.strip.innerHTML = symbols.map((sym) => `<div class="cell">${sym.icon}</div>`).join('');
  }

  // Lässt die Walze laufen und landet mit `result` auf der Gewinnlinie (mittlere Reihe).
  function animateReel(result) {
    const finalSet = [randomSymbol(), result, randomSymbol()];
    const previous = shownSymbols;
    shownSymbols = finalSet;
    if (reducedMotion) {
      showStatic(finalSet);
      return Promise.resolve();
    }

    const timing = turbo ? CONFIG.reelTiming.turbo : CONFIG.reelTiming.normal;
    const duration = timing.stop;
    const cruise = duration - WINDUP_MS - ACCEL_MS - DECEL_MS;
    const k = Math.max(4, Math.round(timing.speed * (ACCEL_MS / 2 + cruise + DECEL_MS / 2)) - ROWS);
    const dist = ROWS + k;
    const v = (dist + OVERSHOOT) / (ACCEL_MS / 2 + cruise + DECEL_MS / 2);

    // Virtueller Streifen (oben → unten); gerendert werden nur ROWS + 2 wiederverwendete Zellen.
    const ids = [
      randomSymbol(),
      ...finalSet,
      ...Array.from({ length: k }, randomSymbol),
      ...previous,
      randomSymbol(),
      randomSymbol(),
    ];

    const cells = Array.from({ length: ROWS + 2 }, () => {
      const c = document.createElement('div');
      c.className = 'cell';
      return c;
    });
    el.strip.replaceChildren(...cells);
    el.strip.classList.add('spinning');
    const shown = new Array(cells.length).fill(null);

    return new Promise((resolve) => {
      run = { t0: performance.now(), duration, landed: false };

      const tick = (now) => {
        const t = now - run.t0;
        const cruiseEnd = duration - DECEL_MS;
        let d;
        if (t < WINDUP_MS) {
          d = -WINDUP * Math.sin((Math.PI * t) / WINDUP_MS);
        } else if (t < WINDUP_MS + ACCEL_MS) {
          const u = t - WINDUP_MS;
          d = (0.5 * v * u * u) / ACCEL_MS;
        } else if (t < cruiseEnd) {
          d = (v * ACCEL_MS) / 2 + v * (t - WINDUP_MS - ACCEL_MS);
        } else if (t < duration) {
          const u = t - cruiseEnd;
          const base = (v * ACCEL_MS) / 2 + v * (cruiseEnd - WINDUP_MS - ACCEL_MS);
          d = base + v * u - (0.5 * v * u * u) / DECEL_MS;
        } else {
          run.landed = true;
          const u = Math.min(1, (t - duration) / BOUNCE_MS);
          const ease = 1 - Math.pow(1 - u, 3);
          d = dist + OVERSHOOT * (1 - ease) - Math.sin(Math.PI * u) * 0.05;
          if (u >= 1) {
            run = null;
            showStatic(finalSet);
            resolve();
            return;
          }
        }

        // Oberkante des Fensters in Streifen-Koordinaten (Zellen)
        const top = 1 + dist - d;
        const first = Math.floor(top);
        const frac = top - first;
        for (let i = 0; i < cells.length; i++) {
          const sym = ids[first + i - 1] ?? ids[0];
          if (shown[i] !== sym) {
            shown[i] = sym;
            cells[i].textContent = sym.icon;
          }
          cells[i].style.transform = `translate3d(0, ${(i - 1 - frac) * 100}%, 0)`;
        }
        el.strip.classList.toggle('is-fast', t > WINDUP_MS + ACCEL_MS * 0.5 && t < duration - DECEL_MS * 0.5);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // Schneller Stopp: die Walze springt in die Abbremsphase und läuft von dort aus.
  function slam() {
    if (!run || run.landed) return;
    const now = performance.now();
    const target = run.duration - DECEL_MS * 0.35;
    if (now - run.t0 < target) run.t0 = now - target;
  }

  // ---------- Aktionen ----------
  // Wie Susak City: während der Fahrt bremst Spin die Walze ab, im Autoplay (zwischen den Spins) stoppt er ihn.
  function onSpin() {
    if (spinning) { slam(); return; }
    if (bonusRunning || gambleOpen) return; // Freispiele laufen von selbst, im Casino wird nicht gedreht
    if (auto.active) { stopAuto(); return; }
    if (!engine.canSpin()) { refillOffer(); return; }
    doSpin();
  }

  async function doSpin() {
    if (spinning || !engine.canSpin()) return null;
    spinning = true;
    if (engine.bonus) say(`⛑️ Freispiel ${engine.bonus.total - engine.bonus.left + 1} von ${engine.bonus.total} · ×${engine.mult}`, 'bonus');
    else say(auto.active ? `Autoplay – noch ${auto.remaining}` : 'Die Walze dreht …');
    // Leitern, Cashpot und Sofortgewinne erst nach dem Stopp der Walze zeigen
    const before = {
      levels: engine.levels.slice(), summitHits: engine.summitHits.slice(), cashpot: engine.cashpot,
      summitBank: engine.summitBank, balance: engine.balance - (engine.bonus ? 0 : engine.bet),
    };
    const res = engine.spin();
    render(before);
    sfx.spinStart();
    await animateReel(res.symbol);
    sfx.reelStop();
    spinning = false;
    handleEvents(res.symbol, res.events);
    const all = res.events.find((e) => e.type === 'allSummits');
    if (all) {
      // Alle drei eroberten Gipfel kurz zeigen, bevor die neue Runde beginnt
      render({
        levels: CONFIG.ladders.map((l) => l.steps.length + 1), summitHits: all.hits,
        cashpot: all.paid, summitBank: all.paid, balance: engine.balance - all.paid,
      });
      await sleep(turbo ? 900 : 1800);
    }
    const end = res.events.find((e) => e.type === 'bonusEnd');
    if (end) {
      // Endstand der Freispiele noch zeigen, bevor ausgezahlt wird
      render({
        levels: end.levels, summitHits: end.hits,
        cashpot: end.paid, summitBank: 0, balance: engine.balance - end.paid,
      });
    } else {
      render();
    }
    if (res.events.some((e) => e.type === 'bonusStart')) await playBonus();
    return res;
  }

  // ---------- Bergretter-Freispiele ----------
  function openBonusScreen({ icon, title, amount = '', text, button, wheel = false }) {
    el.bonusIcon.textContent = icon;
    el.bonusIcon.hidden = wheel;
    el.bonusTitle.textContent = title;
    el.bonusAmount.textContent = amount;
    el.bonusAmount.hidden = !amount;
    el.bonusText.textContent = text;
    el.bonusBtn.textContent = button;
    el.bonusBtn.disabled = false;
    // Glücksscheibe mit dem Bergretter daneben
    el.bonusStage.hidden = !wheel;
    el.bonusScreen.querySelector('.bonus-card').classList.toggle('has-stage', wheel);
    el.bonusScreen.hidden = false;
    bonusPrompt = el.bonusBtn;
    el.bonusBtn.focus({ preventScroll: true });
  }

  function waitBonusButton() {
    return new Promise((resolve) => {
      el.bonusBtn.addEventListener('click', () => {
        sfx.uiClick();
        resolve();
      }, { once: true });
    });
  }

  function closeBonusScreen() {
    el.bonusScreen.hidden = true;
    bonusPrompt = null;
  }

  async function showBonusScreen(opts) {
    openBonusScreen(opts);
    await waitBonusButton();
    closeBonusScreen();
  }

  // Glücksscheibe: Felder im Uhrzeigersinn, Feld 0 steht oben unter dem Zeiger
  const WHEEL_COLORS = { 2: '#3b5bb0', 3: '#7a4ad0', 5: '#e2456a', 10: '#e0a21c' };
  function buildWheel() {
    const values = CONFIG.freeSpins.wheel;
    const n = values.length;
    const seg = 360 / n;
    const pt = (deg, r) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return [(Math.cos(a) * r).toFixed(2), (Math.sin(a) * r).toFixed(2)];
    };
    let svg = '<svg viewBox="-100 -100 200 200" aria-hidden="true">';
    values.forEach((v, i) => {
      const a0 = i * seg - seg / 2;
      const a1 = i * seg + seg / 2;
      const [x0, y0] = pt(a0, 92);
      const [x1, y1] = pt(a1, 92);
      const color = WHEEL_COLORS[v] ?? (i % 2 ? '#2a3570' : '#3b4a92');
      svg += `<path d="M0 0 L${x0} ${y0} A92 92 0 0 1 ${x1} ${y1} Z" fill="${color}" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>`;
      const [tx, ty] = pt(i * seg, 64);
      svg += `<text x="${tx}" y="${ty}" transform="rotate(${i * seg} ${tx} ${ty})" class="wheel__label">×${v}</text>`;
    });
    // Lichter am Rand
    for (let k = 0; k < n * 2; k++) {
      const [bx, by] = pt(k * (seg / 2), 96);
      svg += `<circle cx="${bx}" cy="${by}" r="2.4" class="wheel__bulb"/>`;
    }
    svg += '<circle r="92" fill="none" stroke="#ffd36e" stroke-width="3"/></svg>';
    el.wheelDisc.innerHTML = svg;
  }

  let wheelRotation = 0;
  function animateWheel(index) {
    const n = CONFIG.freeSpins.wheel.length;
    const seg = 360 / n;
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    // Scheibe so drehen, dass Feld `index` unter dem Zeiger oben landet
    const base = wheelRotation - (wheelRotation % 360) + 360 * (turbo ? 4 : 6);
    const target = base + ((360 - index * seg) % 360) + jitter;
    wheelRotation = target;
    const ms = reducedMotion ? 0 : turbo ? 2200 : 4200;
    el.wheelDisc.style.transition = `transform ${ms}ms cubic-bezier(0.12, 0.75, 0.15, 1)`;
    el.wheelDisc.style.transform = `rotate(${target}deg)`;
    el.wheel.classList.add('is-spinning');
    return sleep(ms + 100).then(() => el.wheel.classList.remove('is-spinning'));
  }

  async function playBonus() {
    const fs = CONFIG.freeSpins;
    bonusRunning = true;
    bonusMult = 1;
    // Wie Susak City: ein laufender Autoplay endet beim Bonus
    auto.active = false;
    auto.remaining = 0;
    render();
    sfx.gong();

    // 1. Glücksscheibe drehen – der Multiplikator gilt für den ganzen Bonus
    el.wheelHub.textContent = '?';
    openBonusScreen({
      icon: fs.rescuer.icon,
      title: 'Bergretter-Freispiele',
      amount: `${fs.count} Freispiele`,
      text: 'Dreh die Glücksscheibe – ihr Multiplikator gilt für alle Gewinne im Bonus.',
      button: 'Glücksscheibe drehen',
      wheel: true,
    });
    await waitBonusButton();
    el.bonusBtn.disabled = true;
    bonusPrompt = null;
    const spin = engine.spinWheel();
    await animateWheel(spin.index);
    bonusMult = spin.mult;
    el.wheelHub.textContent = `×${spin.mult}`;
    sfx.win(spin.mult >= 10 ? 3 : spin.mult >= 5 ? 2 : 1);
    flash('win');
    el.bonusAmount.textContent = `×${spin.mult} Multiplikator`;
    el.bonusText.textContent = `${fs.count} Freispiele ohne Teufel – der Bergretter bringt stattdessen den niedrigsten Berg ein Lager höher. Alle Gewinne zählen ×${spin.mult}, der Bonus-Cashpot wird am Ende ausgezahlt.`;
    el.bonusBtn.textContent = 'Freispiele starten';
    el.bonusBtn.disabled = false;
    bonusPrompt = el.bonusBtn;
    el.bonusBtn.focus({ preventScroll: true });
    render();
    await waitBonusButton();
    closeBonusScreen();

    let paid = 0;
    while (engine.bonus) {
      await sleep(turbo ? 250 : 550);
      const res = await doSpin();
      const end = res && res.events.find((e) => e.type === 'bonusEnd');
      if (end) paid = end.paid;
      else await sleep(turbo ? 150 : 350);
    }

    await sleep(turbo ? 500 : 1000);
    sfx.win(3);
    flash('win');
    await showBonusScreen({
      icon: '🏔',
      title: 'Bonus beendet',
      amount: fmt(paid),
      text: paid > 0
        ? `Der Bonus-Cashpot inklusive Multiplikator ×${bonusMult} wurde deinem Guthaben gutgeschrieben.`
        : 'Diesmal blieb der Bonus-Cashpot leer.',
      button: 'Weiter',
    });
    bonusRunning = false;
    bonusMult = 1;
    render();
    say(`⛑️ Bergretter-Bonus: ${fmt(paid)} gutgeschrieben`, 'win');
  }

  // ---------- Autoplay (Menü wie Susak City) ----------
  function fillAutoMenu() {
    const ap = CONFIG.autoplay;
    for (const n of ap.spins) {
      const b = document.createElement('button');
      b.textContent = n;
      b.addEventListener('click', () => startAuto(n));
      el.autoCounts.appendChild(b);
    }
    el.autoCollect.innerHTML = '<option value="0">Aus</option>' + ap.collectAt
      .map((x) => `<option value="${x}"${x === ap.defaultCollectAt ? ' selected' : ''}></option>`).join('');
    el.autoLoss.value = ap.defaultLossLimit ?? '';
  }

  function updateCollectLabels() {
    for (const opt of el.autoCollect.options) {
      const x = Number(opt.value);
      if (x) opt.textContent = `ab ${x}× (${fmt(x * engine.bet)})`;
    }
  }

  function toggleAutoMenu(show = el.autoMenu.hidden) {
    if (show && spinning) return;
    if (show) updateCollectLabels();
    el.autoMenu.hidden = !show;
  }

  function startAuto(count) {
    toggleAutoMenu(false);
    sfx.uiClick();
    const loss = parseFloat(el.autoLoss.value);
    Object.assign(auto, {
      active: true,
      remaining: count,
      collectAt: Number(el.autoCollect.value),
      stopOnSummit: el.autoStopSummit.checked,
      lossLimit: loss > 0 ? loss : null,
      startBalance: engine.balance,
    });
    runAuto();
  }

  async function runAuto() {
    render();
    let reason = null; // null = letzte Spielmeldung stehen lassen
    while (auto.active && auto.remaining > 0) {
      if (!engine.canSpin()) { refillOffer(); return; }
      if (auto.lossLimit !== null && auto.startBalance - (engine.balance - engine.bet) > auto.lossLimit) {
        reason = `Autoplay gestoppt – Verlustlimit von ${fmt(auto.lossLimit)} erreicht`;
        break;
      }
      auto.remaining--;
      render();
      const res = await doSpin();
      if (!auto.active) return; // während des Spins gestoppt
      if (auto.collectAt && engine.cashpot >= auto.collectAt * engine.bet) {
        await sleep(turbo ? 300 : 700); // Ergebnis kurz zeigen (wie Susak City)
        onCollect(true);
      }
      if (auto.stopOnSummit && res && res.events.some((e) => e.type === 'top')) {
        reason = engine.cashpot > 0
          ? `Autoplay gestoppt – Gipfel! Sammeln oder weiter? Cashpot ${fmt(engine.cashpot)}`
          : 'Autoplay gestoppt – Gipfel erreicht und gesammelt';
        break;
      }
      render();
      // Pausen wie in Susak City: nach Ereignissen länger, sonst kurz
      const notable = res && res.events.some((e) => e.type === 'top' || e.type === 'reset');
      await sleep(notable ? (turbo ? 700 : 1300) : turbo ? 150 : 350);
    }
    if (auto.active) stopAuto(reason);
  }

  function stopAuto(reason = null) {
    auto.active = false;
    auto.remaining = 0;
    render();
    if (reason) say(reason, 'warn');
  }

  function handleEvents(symbol, events) {
    const climbs = events.filter((e) => e.type === 'climb');
    const tops = events.filter((e) => e.type === 'top');
    const reset = events.find((e) => e.type === 'reset');
    const allSummits = events.find((e) => e.type === 'allSummits');
    const rescue = events.find((e) => e.type === 'rescue');

    for (const c of climbs) bump(c.ladder);

    if (reset) {
      sfx.devil();
      flash('devil');
      el.cashpotBox.classList.add('lost');
      document.querySelector('.reel-frame').classList.add('shake');
      el.ladders.classList.add('is-struck');
      setTimeout(() => {
        el.cashpotBox.classList.remove('lost');
        document.querySelector('.reel-frame').classList.remove('shake');
        el.ladders.classList.remove('is-struck');
      }, 900);
      say(reset.lost > 0
        ? `${symbol.icon} Teufel! Cashpot von ${fmt(reset.lost)} verloren`
        : `${symbol.icon} Teufel – zum Glück war der Cashpot leer`, 'bad');
      return;
    }

    if (tops.length) {
      if (symbol.effect === 'king') sfx.gong();
      else sfx.win(2);
      flash('win');
      for (const t of tops) {
        const s = ladderEls[t.ladder].summit;
        s.classList.add('hit');
        setTimeout(() => s.classList.remove('hit'), 1200);
      }
      const total = tops.reduce((s, t) => s + t.prize, 0);
      const names = tops.map((t) => CONFIG.ladders[t.ladder].name).join(', ');
      // Hook für spätere Bonusfunktionen
      for (const t of tops) if (t.bonus) triggerBonus(t);
      if (allSummits) {
        onAllSummits(allSummits);
        return;
      }
      const again = tops.every((t) => t.repeat) ? ' erneut' : '';
      const mult = tops[0].mult > 1 ? ` (inkl. ×${tops[0].mult})` : '';
      const intro = symbol.effect === 'king' ? `${symbol.icon} Der König – alle Gipfel erreicht!` : `⛰ Gipfel ${names}${again}!`;
      say(`${intro} +${fmt(total)}${mult} im Cashpot`, 'win');
      return;
    }

    if (!climbs.length) {
      say(`${symbol.icon} ${symbol.name} – keine Wirkung`);
      return;
    }
    sfx.climb(Math.max(...climbs.map((c) => c.level)));
    if (rescue) {
      say(`${symbol.icon} Bergretter bringt ${CONFIG.ladders[rescue.ladder].name} auf Lager ${climbs[0].level}`, 'bonus');
      return;
    }
    const what = climbs.length > 1
      ? 'Alle Berge steigen ein Lager höher'
      : `${CONFIG.ladders[climbs[0].ladder].name} steigt auf Lager ${climbs[0].level}`;
    say(`${symbol.icon} ${what}`);
  }

  // Alle drei Gipfel: Cashpot wird ausgezahlt, danach starten die Bergretter-Freispiele
  function onAllSummits(e) {
    sfx.win(3);
    flash('win');
    say(`🏔 Alle drei Gipfel! ${fmt(e.paid)} gesammelt – Bergretter-Freispiele!`, 'win');
  }

  function triggerBonus(topEvent) {
    // Platzhalter: Bonusfunktionen werden später definiert.
    console.info('Bonus ausgelöst', topEvent);
  }

  function bump(i) {
    const camp = ladderEls[i].steps[engine.levels[i] - 1];
    if (!camp) return;
    camp.classList.remove('pop');
    void camp.offsetWidth;
    camp.classList.add('pop');
  }

  function onCollect(fromAuto = false) {
    if (spinning || (auto.active && !fromAuto)) return;
    // Von Hand gesammelt: erst ins Kartenspiel Rot oder Schwarz, der Autoplay sammelt direkt
    if (!fromAuto) {
      openGamble();
      return;
    }
    const amount = engine.collect();
    if (amount <= 0) return;
    const ratio = amount / engine.bet;
    sfx.win(ratio < 3 ? 1 : ratio < 10 ? 2 : 3);
    flash('win');
    say(`💰 ${fmt(amount)} gesammelt und gutgeschrieben!`, 'win');
    render();
  }

  // ---------- Kartenspiel Rot oder Schwarz im Susak Casino ----------
  // Aufdecken: Bild mit leerer Karte, das Symbol wird per HTML daraufgesetzt
  const DEALER = { wait: 'assets/dealer-wait.webp', reveal: 'assets/dealer-reveal-blank.webp?v=2' };
  // Bilder vorladen, damit beim Aufdecken nichts flackert
  for (const src of Object.values(DEALER)) new Image().src = src;

  function gambleView() {
    const g = engine.gamble;
    const amount = g ? g.amount : 0;
    el.gambleAmount.textContent = fmt(amount);
    const max = CONFIG.gamble.maxRounds;
    const left = max ? max - (g?.rounds ?? 0) : Infinity;
    el.gambleHint.textContent = g && left > 0
      ? `Richtig: ${fmt(amount * 2)} · Falsch: ${fmt(Math.floor(amount * CONFIG.gamble.loseFactor))}`
      : '';
    const canGuess = !!g && !gambleBusy && left > 0;
    el.gambleRed.disabled = !canGuess;
    el.gambleBlack.disabled = !canGuess;
    el.gambleTake.disabled = !g || gambleBusy;
    el.gambleTake.textContent = g ? `${fmt(amount)} kassieren` : 'Kassieren';
  }

  function openGamble() {
    if (gambleOpen || bonusRunning) return;
    const amount = engine.startGamble();
    if (amount <= 0) return;
    gambleOpen = true;
    sfx.uiClick();
    el.gambleImg.src = DEALER.wait;
    el.gambleCard.hidden = true;
    el.gambleHistory.innerHTML = '';
    el.gambleMsg.textContent = 'Rot oder Schwarz?';
    el.gambleMsg.dataset.tone = '';
    el.gamble.hidden = false;
    toggleAutoMenu(false);
    gambleView();
    render();
    say(`🃏 ${fmt(amount)} im Susak Casino – Rot oder Schwarz?`, 'win');
  }

  function closeGamble() {
    el.gamble.hidden = true;
    gambleOpen = false;
    gambleBusy = false;
    render();
  }

  async function guess(color) {
    if (!gambleOpen || gambleBusy || !engine.gamble) return;
    gambleBusy = true;
    gambleView();
    sfx.uiClick();
    el.gambleMsg.textContent = color === 'red' ? 'Rot gewählt … die Karte wird aufgedeckt' : 'Schwarz gewählt … die Karte wird aufgedeckt';
    el.gambleMsg.dataset.tone = '';
    await sleep(turbo ? 300 : 700);

    const r = engine.guessColor(color);
    // Karte zeigen: die Karte im Bild wird mit der echten Farbe überdeckt
    const suits = r.card === 'red' ? ['♥', '♦'] : ['♠', '♣'];
    const suit = suits[Math.floor(Math.random() * 2)];
    for (const corner of [el.gambleCorner, el.gambleCornerBr]) corner.innerHTML = `<b>A</b><i>${suit}</i>`;
    el.gambleSuit.textContent = suit;
    el.gambleCard.dataset.color = r.card;
    el.gambleImg.src = DEALER.reveal;
    el.gambleCard.hidden = false;
    el.gambleCard.classList.remove('is-flip');
    void el.gambleCard.offsetWidth;
    el.gambleCard.classList.add('is-flip');

    const dot = document.createElement('span');
    dot.className = `gamble__dot gamble__dot--${r.card}`;
    dot.textContent = suit;
    el.gambleHistory.prepend(dot);
    while (el.gambleHistory.children.length > 8) el.gambleHistory.lastChild.remove();

    if (r.win) {
      sfx.win(r.amount / engine.bet >= 10 ? 2 : 1);
      flash('win');
      el.gambleMsg.textContent = `Richtig! Verdoppelt auf ${fmt(r.amount)}`;
      el.gambleMsg.dataset.tone = 'win';
    } else {
      sfx.devil();
      el.gambleMsg.textContent = r.busted ? 'Falsch – der Gewinn ist weg.' : `Falsch – halbiert auf ${fmt(r.amount)}`;
      el.gambleMsg.dataset.tone = 'bad';
    }
    gambleView(); // neuer Betrag, Hinweis und Kassieren-Button (noch gesperrt)
    el.gambleAmount.textContent = fmt(r.amount);
    el.gambleAmount.classList.remove('is-pop');
    void el.gambleAmount.offsetWidth;
    el.gambleAmount.classList.add('is-pop');

    await sleep(turbo ? 900 : 1600);
    if (r.busted) {
      closeGamble();
      say('🃏 Im Susak Casino alles verspielt', 'bad');
      return;
    }
    // Nächste Runde: der Bergretter zieht wieder eine Karte
    el.gambleImg.src = DEALER.wait;
    el.gambleCard.hidden = true;
    gambleBusy = false;
    el.gambleMsg.textContent = 'Nochmal? Rot oder Schwarz – oder kassieren.';
    el.gambleMsg.dataset.tone = '';
    gambleView();
  }

  function takeGamble() {
    if (!gambleOpen || gambleBusy) return;
    const amount = engine.takeGamble();
    closeGamble();
    if (amount <= 0) return;
    const ratio = amount / engine.bet;
    sfx.win(ratio < 3 ? 1 : ratio < 10 ? 2 : 3);
    flash('win');
    say(`💰 ${fmt(amount)} gesammelt und gutgeschrieben!`, 'win');
  }

  el.gambleRed.addEventListener('click', () => guess('red'));
  el.gambleBlack.addEventListener('click', () => guess('black'));
  el.gambleTake.addEventListener('click', takeGamble);

  function changeBet(dir) {
    const idx = CONFIG.bets.indexOf(engine.bet) + dir;
    if (idx < 0 || idx >= CONFIG.bets.length) return;
    if (engine.setBet(CONFIG.bets[idx])) sfx.uiClick();
    render();
  }

  // Ton darf erst nach einer Nutzeraktion starten
  addEventListener('pointerdown', () => sfx.unlock());
  addEventListener('keydown', () => sfx.unlock());

  el.spin.addEventListener('click', onSpin);
  el.collect.addEventListener('click', () => onCollect());
  el.betUp.addEventListener('click', () => changeBet(1));
  el.betDown.addEventListener('click', () => changeBet(-1));

  el.turbo.addEventListener('click', () => {
    turbo = !turbo;
    try { localStorage.setItem('susak.turbo', turbo ? '1' : '0'); } catch (_) { /* ohne Speicher */ }
    sfx.uiClick();
    render();
  });

  el.sound.addEventListener('click', () => {
    sfx.unlock();
    sfx.setMuted(!sfx.muted);
    sfx.uiClick();
    render();
  });

  el.info.addEventListener('click', () => {
    sfx.uiClick();
    el.infoDialog.showModal();
  });

  // Auto-Button: Menü öffnen – oder laufenden Autoplay stoppen
  el.auto.addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.uiClick();
    if (auto.active) { stopAuto('Autoplay gestoppt.'); return; }
    toggleAutoMenu();
  });
  addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.auto')) toggleAutoMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    if (bonusPrompt && (e.code === 'Space' || e.key === 'Enter')) {
      e.preventDefault();
      if (!e.repeat) bonusPrompt.click();
      return;
    }
    if (gambleOpen) {
      const k = e.key.toLowerCase();
      if (k === 'r') guess('red');
      else if (k === 's') guess('black');
      else if (k === 'enter' || k === 'c') { e.preventDefault(); takeGamble(); }
      if (e.code === 'Space') e.preventDefault(); // Leertaste dreht im Casino nicht
      return;
    }
    if (el.infoDialog.open || e.target.closest('select, input')) return;
    if (e.key === 'Escape') { toggleAutoMenu(false); return; }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) onSpin();
    } else if (e.key === 'c' || e.key === 'C') onCollect();
  });

  // Leertaste auf einem fokussierten Button nicht zusätzlich als Klick auslösen
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && e.target.closest('button')) e.preventDefault();
  });

  // Feiner Schneefall im Hintergrund (bei reduzierter Bewegung aus)
  function startSnow() {
    const canvas = $('snow');
    if (!canvas || reducedMotion) return;
    const ctx = canvas.getContext('2d');
    let flakes = [];
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth;
      h = innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(70, (w * h) / 22000));
      flakes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.6 + Math.random() * 1.6, v: 0.15 + Math.random() * 0.45,
        sway: Math.random() * Math.PI * 2, a: 0.25 + Math.random() * 0.5,
      }));
    };
    resize();
    addEventListener('resize', resize);
    const tick = () => {
      if (!document.hidden) {
        ctx.clearRect(0, 0, w, h);
        for (const f of flakes) {
          f.y += f.v;
          f.sway += 0.01;
          f.x += Math.sin(f.sway) * 0.25;
          if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
          ctx.globalAlpha = f.a;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fillStyle = '#e8f6ff';
          ctx.fill();
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- Test-Panel (nur mit ?dev in der Adresse) ----------
  // Wie das DEV-Panel in Susak City: bestimmt das nächste Symbol. Auch per Strg+1…7.
  function buildDevPanel() {
    if (!new URLSearchParams(location.search).has('dev')) return;
    const panel = document.createElement('div');
    panel.className = 'devbar glass';
    panel.innerHTML = '<span class="devbar__title">Test</span>';
    const buttons = [];
    const add = (label, onClick) => {
      const b = document.createElement('button');
      b.innerHTML = `${label}<kbd>${buttons.length + 1}</kbd>`;
      b.addEventListener('click', onClick);
      panel.append(b);
      buttons.push(b);
    };
    const spinWith = (id) => {
      // In den Freispielen steht der Bergretter an der Stelle des Teufels
      if (engine.bonus && id === 'DEVIL') id = CONFIG.freeSpins.rescuer.id;
      engine.forceNext(id);
      if (bonusRunning) {
        say(`Test: nächstes Freispiel = ${id}`, 'warn'); // Freispiele laufen von selbst
        return;
      }
      if (spinning) return;
      say(`Test: nächster Spin = ${id}`, 'warn');
      doSpin();
    };
    add('👑 Bonus', () => spinWith('KING'));
    add('😈 Teufel', () => spinWith('DEVIL'));
    add('☀️ Sonne', () => spinWith('SUN'));
    for (const sym of CONFIG.symbols.filter((x) => x.effect === 'ladder')) add(sym.icon, () => spinWith(sym.id));
    const top = CONFIG.freeSpins.wheel.indexOf(Math.max(...CONFIG.freeSpins.wheel));
    add('🎡 ×Max', () => {
      engine.forcedWheel = top;
      say(`Test: Glücksscheibe landet auf ×${CONFIG.freeSpins.wheel[top]}`, 'warn');
    });
    add('🃏 Rot', () => { engine.forcedCard = 'red'; });
    add('🃏 Schwarz', () => { engine.forcedCard = 'black'; });
    add('+$10.000', () => {
      engine.refill(engine.balance + 10000);
      render();
    });
    document.body.append(panel);
    addEventListener('keydown', (e) => {
      if (!e.ctrlKey || e.metaKey || e.altKey) return;
      const i = Number(e.key);
      if (i >= 1 && i <= buttons.length) {
        e.preventDefault();
        buttons[i - 1].click();
      }
    });
    // Auch per Konsole: susak.force('KING')
    window.susak = { force: (id) => engine.forceNext(id), wheel: (i) => { engine.forcedWheel = i; }, engine };
  }

  buildWheel();
  buildDevPanel();
  startSnow();
  fillAutoMenu();
  showStatic(shownSymbols);
  render();
})();
