// Susak Peaks – Darstellung und Bedienung.
(function () {
  const CONFIG = window.SUSAK_CONFIG;
  const engine = new window.SusakEngine(CONFIG);

  // ---------- Im Browser gespeichert: Guthaben, Einsatz, Autoplay-Einstellungen ----------
  const STORE = 'susak.state';
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (_) { return {}; }
  })();
  if (Number.isFinite(saved.balance) && saved.balance >= 0) engine.balance = saved.balance;
  if (CONFIG.bets.includes(saved.bet)) engine.bet = saved.bet;
  let lastSaved = '';
  function saveState() {
    // Was schon sicher ist, zählt zum Guthaben: offener Cashpot, Kartenspiel-Betrag und im Bonus
    // der gesicherte Gipfel-Cashpot samt Jackpot. Wird die Seite mitten in einer Runde neu geladen,
    // ist das so, als hätte man gesammelt – laufende Freispiele gehen dabei verloren.
    const b = engine.bonus;
    const banked = engine.balance + engine.cashpot + (engine.gamble?.amount ?? 0)
      + (b ? (b.carried ?? 0) + (b.jackpot ?? 0) : 0);
    const data = JSON.stringify({
      balance: Math.round(banked * 100) / 100,
      bet: engine.bet,
      autoCollect: Number(el.autoCollect?.value ?? CONFIG.autoplay.defaultCollectAt),
      autoStopSummit: el.autoStopSummit?.checked ?? true,
    });
    if (data === lastSaved) return;
    lastSaved = data;
    try { localStorage.setItem(STORE, data); } catch (_) { /* ohne Speicher */ }
  }

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
    wheelFrame: $('wheel-frame'), auto: $('btn-auto'), autoMenu: $('auto-menu'), autoCounts: $('auto-counts'), autoCount: $('auto-count'),
    autoCollect: $('auto-collect'), autoStopSummit: $('auto-stop-summit'),
    cashpotLabel: $('cashpot-label'),
    bonusScreen: $('bonus-screen'), bonusIcon: $('bonus-icon'), bonusTitle: $('bonus-title'),
    bonusAmount: $('bonus-amount'), bonusText: $('bonus-text'), bonusBtn: $('bonus-btn'),
    wheel: $('wheel'), wheelDisc: $('wheel-disc'), wheelHub: $('wheel-hub'), bonusStage: $('bonus-stage'),
    bonusChoice: $('bonus-choice'), wheelLegend: $('wheel-legend'),
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
  let lastBonusEnd = null; // Abrechnung des letzten Freispiels (für die Gewinnanzeige)
  let gambleOpen = false; // Kartenspiel Rot/Schwarz ist offen
  let freeSpinPress = null; // wartet im Bonus auf den Druck auf Spin
  let gambleBusy = false; // Karte wird gerade aufgedeckt

  // Automodus-Zustand
  const auto = { active: false, remaining: 0, collectAt: 0, stopOnSummit: true };

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
      <stop offset="0" stop-color="#232a4a"/><stop offset="0.6" stop-color="#121733"/><stop offset="1" stop-color="#070a18"/>
    </linearGradient>
    <linearGradient id="snow-lit" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6f9ff"/><stop offset="0.55" stop-color="#bccdf0" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#6f86c0" stop-opacity="0.2"/>
    </linearGradient>
    <linearGradient id="snow-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9fb1dc" stop-opacity="0.75"/><stop offset="1" stop-color="#4a5c94" stop-opacity="0.15"/>
    </linearGradient>
    <linearGradient id="far-1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b2f5c"/><stop offset="1" stop-color="#131735"/>
    </linearGradient>
    <linearGradient id="far-2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a1f44"/><stop offset="1" stop-color="#0b0f26"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="0.9"/>
    </filter>`;
  svg.appendChild(defs);
  // Entfernte, verschneite Bergketten als Silhouette vor dem Abendglühen
  const farA = 'M0 100 L0 64 L5 60 L9 63 L15 55 L21 61 L27 57 L34 62 L40 54 L46 60 L53 56 L59 61 L66 52 L72 59 L78 55 L85 62 L91 56 L96 60 L100 58 L100 100 Z';
  const farB = 'M0 100 L0 72 L7 67 L13 71 L20 65 L28 70 L36 66 L44 71 L52 67 L60 72 L68 66 L76 71 L84 67 L92 72 L100 68 L100 100 Z';
  svg.appendChild(svgEl('path', { class: 'range__far', fill: 'url(#far-1)', d: farA }));
  svg.appendChild(svgEl('path', { class: 'range__far-rim', d: farA.replace(/L100 100 Z$/, '').replace('M0 100 L0', 'M0') }));
  svg.appendChild(svgEl('path', { class: 'range__far', fill: 'url(#far-2)', d: farB }));
  // Abendglühen am Horizont liegt hinter den Bergen
  const horizon = document.createElement('div');
  horizon.className = 'range__horizon';
  plot.append(horizon, svg);

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
    // Spitzes Felshorn im Matterhorn-Stil: steile Flanken, Schulter links
    const ridge = [
      at(-1.3, 1), at(-0.95, 0.74), at(-0.7, 0.6), at(-0.52, 0.5), at(-0.42, 0.47),
      at(-0.3, 0.3), at(-0.17, 0.17), at(-0.08, 0.06), [x, sy], at(0.06, 0.03),
      at(0.13, 0.13), at(0.2, 0.26), at(0.33, 0.37), at(0.5, 0.44), at(0.62, 0.55), at(0.9, 0.75), at(1.3, 1),
    ];
    // Schneefelder: angeleuchtete Flanke links, Schulter, Rinnen – rechts nur schattiger Schnee
    const snowLit = [
      [[x, sy], at(-0.08, 0.06), at(-0.17, 0.17), at(-0.3, 0.3), at(-0.42, 0.47), at(-0.32, 0.46), at(-0.22, 0.52),
        at(-0.14, 0.41), at(-0.06, 0.46), at(-0.01, 0.31), at(0.02, 0.13)],
      [at(-0.52, 0.5), at(-0.7, 0.6), at(-0.95, 0.74), at(-0.82, 0.79), at(-0.64, 0.73), at(-0.52, 0.64), at(-0.42, 0.6), at(-0.44, 0.52)],
      [at(-0.26, 0.5), at(-0.2, 0.52), at(-0.22, 0.72), at(-0.27, 0.66)],
      [at(-0.09, 0.45), at(-0.05, 0.47), at(-0.06, 0.62), at(-0.1, 0.58)],
    ];
    const snowShade = [
      [[x, sy], at(0.06, 0.03), at(0.13, 0.13), at(0.2, 0.26), at(0.14, 0.3), at(0.09, 0.22), at(0.04, 0.16)],
      [at(0.33, 0.37), at(0.5, 0.44), at(0.42, 0.5), at(0.34, 0.47)],
    ];

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
      points: pts([[x, sy], at(0.06, 0.03), at(0.13, 0.13), at(0.2, 0.26), at(0.33, 0.37), at(0.5, 0.44), at(0.62, 0.55),
        at(0.9, 0.75), at(1.3, 1), at(0.15, 1), at(0.05, 0.5), at(0.02, 0.2)]) }));
    for (const poly of snowLit) relief.appendChild(svgEl('polygon', { class: 'peak__snow', points: pts(poly), fill: 'url(#snow-lit)' }));
    for (const poly of snowShade) relief.appendChild(svgEl('polygon', { class: 'peak__snow peak__snow--shade', points: pts(poly), fill: 'url(#snow-shade)' }));
    g.appendChild(relief);
    g.appendChild(svgEl('polygon', { class: 'peak__glow', points: pts(ridge), fill: ladder.color }));

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

  // Nebel im Tal und ein verschneiter Hang im Vordergrund mit leuchtenden Lagerlichtern
  const mist = document.createElement('div');
  mist.className = 'range__mist';
  plot.appendChild(mist);

  const slope = svgEl('svg', { viewBox: '0 0 1000 90', preserveAspectRatio: 'xMidYMax slice', class: 'range__slope', 'aria-hidden': 'true' });
  slope.innerHTML = `
    <defs>
      <linearGradient id="slope-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c9d8f5"/><stop offset="0.35" stop-color="#6f84bd"/><stop offset="1" stop-color="#1a2246"/>
      </linearGradient>
      <linearGradient id="slope-b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8ea3d6"/><stop offset="0.5" stop-color="#2c3766"/><stop offset="1" stop-color="#0a0e22"/>
      </linearGradient>
      <radialGradient id="lamp"><stop offset="0" stop-color="#e8fbff"/><stop offset="0.25" stop-color="#7fd6ff" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#2a8cff" stop-opacity="0"/></radialGradient>
    </defs>
    <path d="M0 38 C 160 30, 300 46, 460 58 S 800 70, 1000 64 L1000 90 L0 90 Z" fill="url(#slope-a)" opacity="0.9"/>
    <path d="M0 62 C 200 56, 420 70, 640 74 S 900 66, 1000 70 L1000 90 L0 90 Z" fill="url(#slope-b)"/>
    <g class="range__lamps">
      <circle cx="70" cy="44" r="16" fill="url(#lamp)"/><circle cx="112" cy="47" r="10" fill="url(#lamp)"/>
      <circle cx="905" cy="69" r="14" fill="url(#lamp)"/><circle cx="948" cy="66" r="9" fill="url(#lamp)"/>
      <circle cx="560" cy="71" r="7" fill="url(#lamp)"/>
    </g>`;
  plot.appendChild(slope);

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
    base.innerHTML = `<span class="peak-name__icon">${ladder.image
      ? `<img class="peak-name__img" src="${ladder.image}" alt="" draggable="false">`
      : ladder.icon}</span>${ladder.name}`;
    plot.appendChild(base);
    return { steps, summit, peak: p, base };
  });
  el.ladders.appendChild(plot);

  // Symbol als Bild (falls in der Konfiguration angegeben) oder als Emoji
  const symbolHTML = (sym) => sym.image
    ? `<img class="sym-img" src="${sym.image}" alt="${sym.name}" draggable="false">`
    : sym.icon;

  // Walze: je Zelle ein Vorrat fertiger Symbol-Knoten (wie Susak City) – beim Drehen entsteht
  // kein neues DOM und kein Bild muss neu dekodiert werden
  const symbolPool = [];
  function symbolNode(cellIndex, sym) {
    const pool = (symbolPool[cellIndex] ??= new Map());
    let node = pool.get(sym.id);
    if (!node) {
      const tpl = document.createElement('template');
      tpl.innerHTML = `<span class="sym-node">${symbolHTML(sym)}</span>`;
      node = tpl.content.firstElementChild;
      pool.set(sym.id, node);
    }
    return node;
  }

  // Spielregeln: jedes Symbol als Kachel mit kurzem Wirkungs-Schild
  for (const sym of [...CONFIG.symbols, { ...CONFIG.freeSpins.rescuer, effect: 'rescue' }]) {
    const li = document.createElement('li');
    const [chip, tone] = effectChip(sym);
    li.className = `sym-card sym-card--${tone}`;
    if (sym.effect === 'ladder') li.style.setProperty('--c', CONFIG.ladders[sym.ladder].color);
    li.title = describe(sym);
    li.innerHTML = `<span class="sym-card__img">${symbolHTML(sym)}</span>
      <span class="sym-card__name">${sym.name}</span>
      <span class="sym-card__chip">${chip}</span>`;
    el.symbolList.appendChild(li);
  }
  const infoHelmet = $('info-helmet');
  if (infoHelmet) infoHelmet.innerHTML = symbolHTML(CONFIG.freeSpins.rescuer);

  function effectChip(sym) {
    switch (sym.effect) {
      case 'ladder': return ['+1 Lager', 'ladder'];
      case 'all': return ['+1 auf allen Bergen', 'wild'];
      case 'king': return ['3 Gipfel + Bonus', 'king'];
      case 'reset': return ['Cashpot weg', 'bad'];
      case 'rescue': return ['nur im Bonus: hilft', 'bonus'];
    }
    return ['', ''];
  }

  function describe(sym) {
    switch (sym.effect) {
      case 'ladder': return `Bringt den Berg „${CONFIG.ladders[sym.ladder].name}“ ein Lager höher.`;
      case 'all': return 'Wild: Bringt alle drei Berge ein Lager höher.';
      case 'reset': return 'Fegt alle Bergsteiger ins Tal und löscht den Cashpot – auch die Gipfelgewinne.';
      case 'rescue': return 'Nur in den Freispielen statt des Schneesturms: niedrigster Berg +1 Lager, Multiplikator +1 und +1 Freispiel.';
      case 'king':
        return {
          summit: 'Alle drei Berge erreichen sofort den Gipfel – drei Gipfelpreise in den Cashpot, er wird gesichert und die Bergretter-Freispiele starten!',
          all: 'Joker: Bringt alle drei Berge ein Lager höher.',
          blank: 'Ohne Wirkung.',
        }[CONFIG.kingMode];
    }
    return '';
  }

  // ---------- Darstellung ----------
  function render(shown = engine) {
    saveState();
    el.balance.textContent = fmt(shown.balance);
    countTo(el.cashpot, shown.cashpot);
    // Während der Freispiele gelten alle Beträge mit dem Multiplikator der Glücksscheibe
    const m = bonusRunning ? (engine.bonus?.mult || bonusMult) : 1;
    el.summitBank.textContent = bonusRunning && engine.bonus
      ? [m > 1 ? `×${m}${bonusPerks()}` : '', bonusSaved()].filter(Boolean).join(' · ')
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
      ladderEls[i].base.classList.toggle('is-cable', bonusRunning && engine.bonus?.cable === i);
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
    if (bonusRunning && !el.autoMenu.hidden) el.autoMenu.hidden = true;
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
  let drainNext = false; // nach einem Schneesturm zählt der Cashpot sichtbar auf $0 herunter
  function countTo(node, value) {
    const st = counters.get(node) ?? { shown: value, raf: 0 };
    counters.set(node, st);
    cancelAnimationFrame(st.raf);
    node.classList.remove('is-draining'); // ein abgebrochenes Herunterzählen darf nicht rot bleiben
    if (drainNext && value < st.shown && !reducedMotion) {
      drainNext = false;
      const from = st.shown;
      const t0 = performance.now();
      node.classList.add('is-draining');
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 700);
        st.shown = from + (value - from) * (1 - Math.pow(1 - p, 2));
        node.textContent = fmt(st.shown);
        if (p < 1) st.raf = requestAnimationFrame(step);
        else { st.shown = value; node.classList.remove('is-draining'); }
      };
      st.raf = requestAnimationFrame(step);
      return;
    }
    drainNext = false;
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
    el.strip.innerHTML = symbols.map((sym) => `<div class="cell">${symbolHTML(sym)}</div>`).join('');
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
            cells[i].replaceChildren(symbolNode(i, sym));
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
    if (gambleOpen) return; // im Casino wird nicht gedreht
    if (engine.bonus && !bonusRunning) return; // Bonus startet gleich – erst die Glücksscheibe
    if (bonusRunning) {
      // Freispiele startet der Spieler selbst
      if (freeSpinPress) {
        const go = freeSpinPress;
        freeSpinPress = null;
        go();
      }
      return;
    }
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
    // Alle drei Gipfel: ab sofort im Bonus-Modus, damit während der Gipfel-Anzeige
    // kein Spin (Leertaste) ein Freispiel vor der Glücksscheibe auslöst
    if (res.events.some((e) => e.type === 'bonusStart')) bonusRunning = true;
    spinning = false;
    handleEvents(res.symbol, res.events);
    const all = res.events.find((e) => e.type === 'allSummits');
    if (all) {
      // Alle drei eroberten Gipfel kurz zeigen, bevor die neue Runde beginnt
      render({
        levels: CONFIG.ladders.map((l) => l.steps.length + 1), summitHits: all.hits,
        cashpot: all.carried, summitBank: all.carried, balance: engine.balance,
      });
      await sleep(turbo ? 900 : 1800);
    }
    const retrigger = res.events.find((e) => e.type === 'bonusRetrigger');
    if (retrigger) {
      // Eroberte Gipfel kurz zeigen, dann die Verlängerung ankündigen
      render({
        levels: retrigger.levels, summitHits: retrigger.hits,
        cashpot: engine.cashpot, summitBank: engine.summitBank, balance: engine.balance,
      });
      await sleep(turbo ? 700 : 1400);
      sfx.gong();
      render();
      await showBonusScreen({
        icon: symbolHTML(CONFIG.freeSpins.rescuer),
        title: 'Alle drei Gipfel!',
        amount: `+${retrigger.spins} Freispiele`,
        text: `Jetzt noch ${engine.bonus.left} Freispiele. Die Berge starten wieder unten – dein Bonus-Cashpot von ${fmt(engine.cashpot)} bleibt erhalten.`,
        button: 'Weiter',
      });
      say(`⛑️ Verlängert: noch ${engine.bonus.left} Freispiele`, 'bonus');
    }
    const end = res.events.find((e) => e.type === 'bonusEnd');
    if (end) {
      // Endstand der Freispiele noch zeigen, bevor ausgezahlt wird
      render({
        levels: end.levels, summitHits: end.hits,
        cashpot: end.spinsWin, summitBank: 0, balance: engine.balance - end.paid,
      });
      lastBonusEnd = end;
    } else {
      render();
    }
    if (res.events.some((e) => e.type === 'bonusStart')) await playBonus();
    return res;
  }

  // ---------- Bergretter-Freispiele ----------
  function openBonusScreen({ icon, title, amount = '', text, button, wheel = false }) {
    el.bonusIcon.innerHTML = icon; // Text-Emoji oder Bild-HTML
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
  const WHEEL_COLORS = {
    // reine Multiplikatoren in einer Farbe, Sonderfelder jeweils eigen
    x3: '#2f4fb5', x5: '#2f4fb5', x10: '#2f4fb5', jackpot: '#0f8f6b', gold: '#a8740f',
    cable: '#2a8a9a', alarm: '#b8323f', spins: '#7a4ad0', camp: '#4f7a2c', again: '#c2417a', gift: '#d0602f',
  };
  const isPlainMult = (f) => !f.icon;
  function buildWheel() {
    const fields = CONFIG.freeSpins.wheel;
    const n = fields.length;
    const seg = 360 / n;
    const R = 90; // Radius der Felder
    const pt = (deg, r) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return [(Math.cos(a) * r).toFixed(2), (Math.sin(a) * r).toFixed(2)];
    };
    let svg = `<svg viewBox="-100 -100 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="wheel-shade">
          <stop offset="0.25" stop-color="#000" stop-opacity="0.45"/>
          <stop offset="0.62" stop-color="#000" stop-opacity="0"/>
          <stop offset="0.9" stop-color="#fff" stop-opacity="0.1"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0.22"/>
        </radialGradient>
      </defs>
      <circle r="99" fill="#1a1230"/>`;
    fields.forEach((f, i) => {
      const [x0, y0] = pt(i * seg - seg / 2, R);
      const [x1, y1] = pt(i * seg + seg / 2, R);
      svg += `<path d="M0 0 L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z" fill="${WHEEL_COLORS[f.id] ?? '#3b4a92'}"/>`;
    });
    // Tiefe: innen dunkel, außen Glanz – über alle Felder
    svg += `<circle r="${R}" fill="url(#wheel-shade)"/>`;
    // goldene Trennlinien
    fields.forEach((_, i) => {
      const [x, y] = pt(i * seg - seg / 2, R);
      svg += `<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="#ffd36e" stroke-opacity="0.75" stroke-width="1.2"/>`;
    });
    // Beschriftung seitlich entlang des Radius (wie bei einem echten Glücksrad).
    // Reine Multiplikatoren: große Zahl. Sonderfelder: großes Symbol am Rand, darunter ein
    // Stichwort, was passiert – der Multiplikator steht klein daneben.
    // Schriftgröße so wählen, dass der Text sicher zwischen Nabe und Rand bzw. Symbol passt
    // (Unbounded ist breit: ca. 0,84 × Schriftgröße pro Zeichen)
    const HUB = 35;
    const fit = (text, from, to, max) => Math.min(max, (to - from) / (text.length * 0.84));
    fields.forEach((f, i) => {
      const a = i * seg;
      if (f.icon) {
        const [ix, iy] = pt(a, 80);
        svg += `<text x="${ix}" y="${iy}" transform="rotate(${a} ${ix} ${iy})" class="wheel__icon">${f.icon}</text>`;
        // im gedrehten Koordinatensystem läuft x nach außen, y quer über das Feld
        const from = HUB + 1;
        const to = 69;
        const word = f.short || f.label;
        // Stichwörter in der schmaleren Manrope (Großbuchstaben ca. 0,78 × Schriftgröße pro Zeichen)
        const size = Math.min(12, (to - from) / (word.length * 0.78));
        svg += `<g transform="rotate(${a - 90})">
          <text x="${(from + to) / 2}" y="${-3.2}" class="wheel__label wheel__word" font-size="${size.toFixed(1)}">${word}</text>
          <text x="${(from + to) / 2}" y="${size / 2 + 3.4}" class="wheel__label wheel__mult" font-size="7">×${f.mult}</text></g>`;
      } else {
        const to = 86;
        const size = fit(f.label, HUB, to, 23).toFixed(1);
        const [tx, ty] = pt(a, (HUB + to) / 2);
        svg += `<text x="${tx}" y="${ty}" transform="rotate(${a - 90} ${tx} ${ty})" class="wheel__label" font-size="${size}">${f.label}</text>`;
      }
    });
    // dunkler Innenring um die Nabe
    svg += `<circle r="31" fill="#120c22" stroke="#ffd36e" stroke-width="2"/></svg>`;
    el.wheelDisc.innerHTML = svg;

    // Goldrand mit Lichtern als feststehender Rahmen (wie bei einem echten Glücksrad).
    // Er liegt über der Scheibe, damit die drehende Scheibe nie neu gezeichnet werden muss –
    // nur zwei Lichtergruppen blenden abwechselnd, ohne teure Filter.
    let frame = `<svg viewBox="-100 -100 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="wheel-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff3c9"/><stop offset="0.45" stop-color="#ffd36e"/>
          <stop offset="0.7" stop-color="#b07400"/><stop offset="1" stop-color="#ffe7a8"/>
        </linearGradient>
        <radialGradient id="wheel-bulb">
          <stop offset="0" stop-color="#fffbe8"/><stop offset="0.45" stop-color="#ffe9a8"/>
          <stop offset="0.6" stop-color="#ffd36e" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd36e" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle r="${R + 4}" fill="none" stroke="url(#wheel-rim)" stroke-width="8"/>`;
    const bulbs = ['', ''];
    for (let k = 0; k < n * 2; k++) {
      const [bx, by] = pt(k * (seg / 2), R + 4);
      bulbs[k % 2] += `<circle cx="${bx}" cy="${by}" r="4.6"/>`;
    }
    frame += `<g class="wheel__bulbs" fill="url(#wheel-bulb)">${bulbs[0]}</g>
      <g class="wheel__bulbs wheel__bulbs--b" fill="url(#wheel-bulb)">${bulbs[1]}</g></svg>`;
    el.wheelFrame.innerHTML = frame;

    // Legende in den Spielregeln
    if (el.wheelLegend) {
      const plain = fields.filter(isPlainMult).sort((a, b) => a.mult - b.mult);
      const rows = [
        { c: WHEEL_COLORS[plain[0].id], dot: '<span class="wheel-legend__x">×</span>', name: 'Multiplikator', text: fieldText(plain[0]), mult: plain.map((f) => `×${f.mult}`).join(' ') },
        ...fields.filter((f) => !isPlainMult(f)).map((f) => ({ c: WHEEL_COLORS[f.id], dot: f.icon, name: f.name, text: fieldText(f), mult: `×${f.mult}` })),
      ];
      el.wheelLegend.innerHTML = rows.map((r) => `<li style="--c:${r.c}">
        <span class="wheel-legend__dot">${r.dot}</span>
        <span class="wheel-legend__text"><b>${r.name}</b>${r.text}</span>
        <span class="wheel-legend__mult">${r.mult}</span></li>`).join('');
    }
  }

  // Kurzbeschreibung eines Scheibenfelds (Spielregeln)
  function fieldText(f) {
    if (f.jackpot) return `${f.jackpot}× Einsatz, ausgezahlt nach den Freispielen`;
    if (f.respin) return 'Scheibe dreht nochmal, Multiplikatoren addieren sich';
    if (f.spins) return `${f.spins} Freispiele mehr`;
    if (f.camp) return `Alle Berge starten auf Lager ${f.camp}`;
    if (f.cable) return 'Dein gewählter Berg steigt 2 Lager pro Treffer';
    if (f.gift) return 'Ein zufälliger Berg startet am Gipfel';
    if (f.alarm) return 'Der Bergretter kommt doppelt so oft';
    if (f.gold) return 'Jeder Bergretter: Multiplikator +2 statt +1';
    return 'Alle Gewinne der Freispiele zählen mehrfach';
  }

  // Erklärung nach dem Dreh: was das Feld jetzt konkret bewirkt
  function fieldResult(r, gift) {
    const f = r.field;
    const b = engine.bonus;
    const chain = r.mult !== f.mult ? `+${f.mult} → jetzt ×${r.mult}` : `×${r.mult}`;
    const lines = [`<b>Multiplikator ${chain}</b> – alle Lager- und Gipfelgewinne der Freispiele zählen ${r.mult}-fach.`];
    if (f.jackpot) lines.push(`<b>💎 ${fmt(r.jackpot)}</b> (${f.jackpot}× Einsatz) sind dir sicher – ausgezahlt nach den Freispielen.`);
    if (f.respin) lines.push('<b>🔁 Gleich nochmal drehen</b> – der nächste Multiplikator kommt dazu.');
    if (f.spins) lines.push(`<b>🎟️ +${f.spins} Freispiele</b> – du hast jetzt ${b.left}.`);
    if (f.camp) lines.push(`<b>⛺ Vorsprung</b> – alle Berge starten schon auf Lager ${f.camp}.`);
    if (f.cable) lines.push(b.cable != null
      ? `<b>🚡 ${CONFIG.ladders[b.cable].name}</b> steigt bei jedem Treffer 2 Lager statt 1.`
      : '<b>🚡 Wähle einen Berg</b> – er steigt bei jedem Treffer 2 Lager statt 1.');
    if (gift) lines.push(`<b>🚩 ${CONFIG.ladders[gift.ladder].name}</b> startet direkt am Gipfel – sein Gipfelpreis liegt schon im Cashpot.`);
    if (f.alarm) lines.push('<b>🚨 Doppelt so viele Bergretter</b> – jeder bringt +1 Lager, +1 Multiplikator und +1 Freispiel.');
    if (f.gold) lines.push('<b>🥇 Gold-Bergretter</b> – jeder Bergretter erhöht den Multiplikator um 2 statt 1.');
    return lines.map((l) => `<span class="bonus-card__line">${l}</span>`).join('');
  }

  // Was im Bonus schon sicher ist und am Ende ausgezahlt wird
  function bonusSaved() {
    const b = engine.bonus;
    if (!b) return '';
    const safe = (b.carried || 0) + (b.jackpot || 0);
    return safe > 0 ? `🔒 ${fmt(safe)} gesichert` : '';
  }

  // aktive Extras im Bonus als kurze Icon-Liste
  function bonusPerks() {
    const b = engine.bonus;
    if (!b) return '';
    const p = [];
    if (b.cable != null) p.push(`🚡 ${CONFIG.ladders[b.cable].name}`);
    if (b.alarm) p.push('🚨');
    if (b.gold) p.push('🥇');
    return p.length ? ` · ${p.join(' · ')}` : '';
  }

  // Seilbahn: Spieler wählt einen Berg
  function chooseCableLadder() {
    el.bonusBtn.hidden = true;
    el.bonusChoice.hidden = false;
    el.bonusChoice.innerHTML = CONFIG.ladders.map((l, i) => `<button class="bonus-choice__btn" data-i="${i}" style="--c:${l.color}">
      <span class="bonus-choice__img">${symbolHTML(CONFIG.symbols.find((s) => s.ladder === i) ?? l)}</span>${l.name}</button>`).join('');
    return new Promise((resolve) => {
      el.bonusChoice.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        sfx.uiClick();
        engine.chooseCable(Number(b.dataset.i));
        el.bonusChoice.hidden = true;
        el.bonusBtn.hidden = false;
        render();
        resolve();
      }, { once: true }));
    });
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

    // 1. Glücksscheibe: Multiplikator und Extras gelten für den ganzen Bonus
    el.wheelHub.textContent = '?';
    el.bonusChoice.hidden = true;
    openBonusScreen({
      icon: symbolHTML(fs.rescuer),
      title: 'Bergretter-Freispiele',
      amount: `${fs.count} Freispiele`,
      text: `Dein Gipfel-Cashpot von ${fmt(engine.bonus.carried)} ist gesichert und wird nach den Freispielen ausgezahlt. Dreh die Glücksscheibe – Multiplikator und Extras gelten für den ganzen Bonus.`,
      button: 'Glücksscheibe drehen',
      wheel: true,
    });
    await waitBonusButton();
    const got = [];
    let last = null;
    for (;;) {
      el.bonusBtn.disabled = true;
      bonusPrompt = null;
      const r = engine.spinWheel();
      await animateWheel(r.index);
      bonusMult = r.mult;
      el.wheelHub.textContent = `×${r.mult}`;
      const big = r.field.jackpot || r.field.mult >= 10;
      sfx.win(big ? 3 : r.field.respin || r.field.mult >= 5 ? 2 : 1);
      if (r.field.jackpot) sfx.gong();
      flash('win');
      const gift = r.events.find((e) => e.type === 'top');
      last = { r, gift };
      got.push(`${r.field.icon ? r.field.icon + ' ' : ''}${r.field.name}`);
      el.bonusAmount.textContent = r.field.jackpot ? `💎 Jackpot ${fmt(r.jackpot)}` : `${r.field.icon ? r.field.icon + ' ' : ''}${r.field.name}`;
      el.bonusText.innerHTML = fieldResult(r, gift);
      render();
      if (r.done) break;
      el.bonusBtn.textContent = 'Nochmal drehen';
      el.bonusBtn.disabled = false;
      bonusPrompt = el.bonusBtn;
      el.bonusBtn.focus({ preventScroll: true });
      await waitBonusButton();
    }
    if (engine.bonus.cablePending) {
      await sleep(turbo ? 400 : 900);
      el.bonusAmount.textContent = '🚡 Seilbahn';
      el.bonusText.textContent = 'Wähle deinen Berg – er steigt bei jedem Treffer 2 Lager.';
      await chooseCableLadder();
    }
    // Erklärung des Ergebnisses bleibt stehen, darunter die Zusammenfassung für den Bonus
    const b = engine.bonus;
    const saved = b.carried + b.jackpot;
    el.bonusText.innerHTML = fieldResult(last.r, last.gift)
      + (got.length > 1 ? `<span class="bonus-card__line">Erdreht: ${got.join(' + ')}</span>` : '')
      + `<span class="bonus-card__line bonus-card__sum"><b>${b.left} Freispiele mit ×${b.mult}</b> · 🔒 ${fmt(saved)} schon sicher – ausgezahlt wird alles nach den Freispielen.</span>`;
    el.bonusBtn.textContent = 'Freispiele starten';
    el.bonusBtn.disabled = false;
    bonusPrompt = el.bonusBtn;
    el.bonusBtn.focus({ preventScroll: true });
    render();
    await waitBonusButton();
    closeBonusScreen();

    lastBonusEnd = null;
    say(`⛑️ ${engine.bonus.left} Freispiele · ×${engine.mult} – drück Spin`, 'bonus');
    while (engine.bonus) {
      // Jedes Freispiel startet der Spieler selbst (Spin-Button oder Leertaste)
      el.spin.classList.add('is-ready');
      await new Promise((resolve) => { freeSpinPress = resolve; });
      el.spin.classList.remove('is-ready');
      await doSpin();
    }

    // Auszahlung: alles aus dem Bonus auf einmal, mit Gewinn-Animation wie in Susak City
    const end = lastBonusEnd;
    await sleep(turbo ? 500 : 1000);
    await showBonusWin(end);
    bonusRunning = false;
    bonusMult = 1;
    const from = engine.balance - end.paid;
    render({ ...engineState(), balance: from });
    await countBalance(from, engine.balance);
    render();
    say(`⛑️ Bergretter-Bonus: ${fmt(end.paid)} gutgeschrieben`, 'win');
  }

  // aktueller Stand für render() (wie engine, aber veränderbar)
  function engineState() {
    return {
      levels: engine.levels.slice(), summitHits: engine.summitHits.slice(),
      cashpot: engine.cashpot, summitBank: engine.summitBank, balance: engine.balance,
    };
  }

  // Guthaben sichtbar hochzählen
  function countBalance(from, to) {
    if (reducedMotion || to <= from) { el.balance.textContent = fmt(to); return Promise.resolve(); }
    el.balance.classList.add('is-rising');
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 900);
        el.balance.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 2)));
        if (p < 1) requestAnimationFrame(step);
        else { el.balance.classList.remove('is-rising'); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  // ---------- Bonusgewinn: Hochzählen mit Gewinnstufen (wie Susak City) ----------
  const WIN_TIERS = [
    { name: 'Bonusgewinn', min: 0 },
    { name: 'Big Win', min: 10 },
    { name: 'Mega Win', min: 25 },
    { name: 'Epic Win', min: 50 },
  ];
  const winTier = (win, bet) => WIN_TIERS.reduce((t, x, i) => (win >= bet * x.min ? i : t), 0);
  let particles = null;
  let bigWinSkip = null; // Leertaste/Enter überspringt bzw. schließt

  function showBonusWin(end) {
    particles ??= new window.Particles();
    const bet = engine.bet;
    const win = end.paid;
    const finalTier = winTier(win, bet);
    // Zusammensetzung des Gewinns – jede Zeile leuchtet auf, sobald der Zähler sie erreicht hat
    const rows = [
      { icon: '🏔', label: 'Gipfel-Cashpot', note: 'vor dem Bonus gesichert', value: end.carried },
      { icon: '💎', label: 'Jackpot', note: 'Glücksscheibe', value: end.jackpot },
      { icon: '⛑️', label: `${end.total} Freispiele`, note: `inkl. Multiplikator ×${end.mult}`, value: end.spinsWin },
    ].filter((r) => r.value > 0 || r.icon === '⛑️');
    let acc = 0;
    for (const r of rows) r.at = acc += r.value;

    const ov = document.createElement('div');
    ov.className = 'bigwin';
    ov.innerHTML = `
      <div class="bigwin__rays"></div>
      <div class="bigwin__content">
        <div class="bigwin__tier" data-tier="0">${WIN_TIERS[0].name}</div>
        <div class="bigwin__amount">${fmt(0)}</div>
        <div class="bigwin__mult">${(win / bet).toLocaleString('de-DE', { maximumFractionDigits: 1 })}× Einsatz</div>
        <ul class="bigwin__rows">${rows.map((r) => `<li>
          <span class="bigwin__icon">${r.icon}</span>
          <span class="bigwin__label"><b>${r.label}</b>${r.note}</span>
          <span class="bigwin__value">${fmt(r.value)}</span></li>`).join('')}</ul>
        <div class="bigwin__hint">Tippen zum Überspringen</div>
      </div>`;
    document.body.append(ov);
    document.body.classList.add('has-bigwin'); // Deko dahinter anhalten
    requestAnimationFrame(() => ov.classList.add('is-open'));
    const tierEl = ov.querySelector('.bigwin__tier');
    const amountEl = ov.querySelector('.bigwin__amount');
    const rowEls = [...ov.querySelectorAll('.bigwin__rows li')];
    const hint = ov.querySelector('.bigwin__hint');
    const duration = reducedMotion ? 600 : 2800 + finalTier * 2000;
    particles.startFountain(0.6 + finalTier * 0.6);
    sfx.bigWin();

    return new Promise((resolve) => {
      let finished = false;
      let closed = false;
      let tier = 0;
      let lastTick = 0;
      const t0 = performance.now();

      const setTier = (i) => {
        if (i === tier) return;
        tier = i;
        tierEl.textContent = WIN_TIERS[i].name;
        tierEl.dataset.tier = String(i);
        tierEl.classList.remove('pop');
        void tierEl.offsetWidth;
        tierEl.classList.add('pop');
        sfx.tierUp();
        particles.burst(innerWidth / 2, innerHeight * 0.38, 90, ['spark', 'crystal']);
      };
      const showRows = (v) => rows.forEach((r, i) => rowEls[i].classList.toggle('is-on', v >= r.at - 0.5));

      const frame = (now) => {
        if (finished) return;
        const p = Math.min(1, (now - t0) / duration);
        const shown = win * (1 - Math.pow(1 - p, 2.2));
        amountEl.textContent = fmt(shown);
        setTier(winTier(shown, bet));
        showRows(shown);
        if (now - lastTick > 70 && p < 1) { sfx.countTick(); lastTick = now; }
        if (p < 1) requestAnimationFrame(frame);
        else complete();
      };

      const complete = () => {
        if (finished) return;
        finished = true;
        amountEl.textContent = fmt(win);
        setTier(finalTier);
        showRows(win);
        amountEl.classList.add('final');
        hint.textContent = 'Tippen zum Gutschreiben';
        particles.burst(innerWidth / 2, innerHeight * 0.38, 70, ['coin', 'spark']);
        setTimeout(close, 2600);
      };

      const close = () => {
        if (closed) return;
        closed = true;
        bigWinSkip = null;
        particles.stopFountain();
        ov.classList.remove('is-open');
        setTimeout(() => { ov.remove(); document.body.classList.remove('has-bigwin'); resolve(); }, 350);
      };

      bigWinSkip = () => (finished ? close() : complete());
      ov.addEventListener('pointerdown', () => bigWinSkip?.());
      requestAnimationFrame(frame);
    });
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
    Object.assign(auto, {
      active: true,
      remaining: count,
      collectAt: Number(el.autoCollect.value),
      stopOnSummit: el.autoStopSummit.checked,
    });
    runAuto();
  }

  async function runAuto() {
    render();
    let reason = null; // null = letzte Spielmeldung stehen lassen
    while (auto.active && auto.remaining > 0) {
      if (!engine.canSpin()) { refillOffer(); return; }
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
          ? `Autoplay gestoppt – Gipfel! Gambeln oder weiter? Cashpot ${fmt(engine.cashpot)}`
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
    if (rescue) bonusMult = rescue.multAfter;

    for (const c of climbs) bump(c.ladder);

    if (reset) {
      snowStorm(reset.lost);
      say(reset.lost > 0
        ? `${symbol.icon} Schneesturm! Cashpot von ${fmt(reset.lost)} verloren`
        : `${symbol.icon} Schneesturm – zum Glück war der Cashpot leer`, 'bad');
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
      bonusMult = rescue.multAfter;
      el.summitBank.classList.remove('is-up');
      void el.summitBank.offsetWidth;
      el.summitBank.classList.add('is-up');
      say(`${symbol.icon} Bergretter: ×${rescue.multBefore} → ×${rescue.multAfter} · ${CONFIG.ladders[rescue.ladder].name} steigt${rescue.extra ? ` · +${rescue.extra} Freispiel` : ''}`, 'bonus');
      return;
    }
    // Seilbahn erzeugt zwei Schritte am selben Berg – nach Bergen zählen, nicht nach Schritten
    const climbed = [...new Set(climbs.map((c) => c.ladder))];
    const last = climbs[climbs.length - 1];
    const cable = climbs.filter((c) => c.ladder === last.ladder).length > 1 ? ' 🚡' : '';
    const what = climbed.length > 1
      ? `Alle Berge steigen${climbs.length > climbed.length ? ' – Seilbahn doppelt 🚡' : ' ein Lager höher'}`
      : `${CONFIG.ladders[last.ladder].name} steigt auf Lager ${last.level}${cable}`;
    say(`${symbol.icon} ${what}`);
  }

  // Alle drei Gipfel: Cashpot wird gesichert (Auszahlung nach dem Bonus), danach starten die Bergretter-Freispiele
  function onAllSummits(e) {
    sfx.win(3);
    flash('win');
    say(`🏔 Alle drei Gipfel! ${fmt(e.carried)} gesichert – Bergretter-Freispiele!`, 'win');
  }

  // ---------- Schneesturm: deutlich spürbarer Verlust ----------
  function snowStorm(lost) {
    sfx.storm();
    // Android; iOS erlaubt Websites keine Vibration. Nur nach einem echten Tipp erlaubt.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([90, 60, 160]);
    flash('devil');
    const frame = document.querySelector('.reel-frame');
    const parts = [
      [el.cashpotBox, 'lost'], [frame, 'shake'], [frame, 'is-storm'], [el.ladders, 'is-struck'],
      [$('frost'), 'is-on'], [document.body, 'is-storm'],
    ];
    for (const [node, cls] of parts) {
      node.classList.remove(cls);
      void node.offsetWidth;
      node.classList.add(cls);
    }
    setTimeout(() => { for (const [node, cls] of parts) node.classList.remove(cls); }, 1700);
    // Verlorener Betrag fällt sichtbar aus dem Cashpot, der Wert zählt auf $0 herunter
    if (lost > 0) {
      drainNext = true;
      const loss = document.createElement('span');
      loss.className = 'cashpot__loss';
      loss.textContent = `−${fmt(lost)}`;
      el.cashpotBox.appendChild(loss);
      setTimeout(() => loss.remove(), 1500);
    }
    stormGust();
  }

  // Böe: Schneeschlieren jagen kurz schräg über den ganzen Bildschirm
  function stormGust() {
    const canvas = $('storm');
    if (!canvas || reducedMotion) return;
    const ctx = canvas.getContext('2d');
    // Schlieren sind ohnehin unscharf: einfache Auflösung reicht und spart auf dem Handy viel Füllarbeit
    const w = innerWidth;
    const h = innerHeight;
    canvas.width = w;
    canvas.height = h;
    // drei Strichstärken – jede Gruppe wird mit einem einzigen stroke() gezeichnet
    const WIDTHS = [1, 1.8, 2.6];
    const streaks = Array.from({ length: Math.round(Math.min(160, (w * h) / 5000)) }, () => ({
      x: Math.random() * w * 1.4 - w * 0.4, y: Math.random() * h,
      len: 18 + Math.random() * 46, v: 14 + Math.random() * 22, g: Math.floor(Math.random() * WIDTHS.length),
    }));
    const DURATION = 1500;
    const t0 = performance.now();
    canvas.classList.add('is-on');
    const tick = (now) => {
      const p = (now - t0) / DURATION;
      if (p >= 1) {
        canvas.classList.remove('is-on');
        canvas.width = canvas.height = 1; // Speicher der Zeichenfläche wieder freigeben
        return;
      }
      const alpha = Math.sin(Math.PI * Math.min(1, p * 1.15)); // anschwellen und abklingen
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#eef7ff';
      ctx.lineCap = 'round';
      ctx.globalAlpha = alpha * 0.75;
      for (const s of streaks) {
        s.x += s.v;
        s.y += s.v * 0.32;
        if (s.x > w + 60) { s.x = -60; s.y = Math.random() * h; }
        if (s.y > h + 20) s.y = -20;
      }
      WIDTHS.forEach((lw, g) => {
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (const s of streaks) {
          if (s.g !== g) continue;
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.len, s.y - s.len * 0.32);
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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
  const DEALER = { wait: 'assets/dealer-wait.webp', reveal: 'assets/dealer-reveal-blank.webp' };
  // (vorgeladen werden die Bilder auf dem Ladebildschirm, siehe boot.js)

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
    await sleep(350); // Turbo hat im Casino keinen Einfluss

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
      sfx.lose();
      el.gambleMsg.textContent = r.busted ? 'Falsch – der Gewinn ist weg.' : `Falsch – halbiert auf ${fmt(r.amount)}`;
      el.gambleMsg.dataset.tone = 'bad';
    }
    gambleView(); // neuer Betrag, Hinweis und Kassieren-Button (noch gesperrt)
    el.gambleAmount.textContent = fmt(r.amount);
    el.gambleAmount.classList.remove('is-pop');
    void el.gambleAmount.offsetWidth;
    el.gambleAmount.classList.add('is-pop');

    // Aufgedeckte Karte 1,5 s zeigen, dann die nächste Runde
    await sleep(1500);
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

  // ---------- iOS-Web-App vom Home-Bildschirm: volle Bildschirmhöhe (wie Susak City) ----------
  // Mit durchsichtiger Statusleiste meldet WebKit den Viewport um die Statusleistenhöhe zu kurz
  // (unten bleibt ein Streifen). Dann erzwingen wir die volle Höhe über --app-h + Klasse vh-fix.
  // Im Browser und auf Android greift das nicht.
  (function fixStandaloneViewport() {
    if (navigator.standalone !== true) return;
    const root = document.documentElement;
    // Einmal hochkant erkannt, gilt der Fehler für das Gerät dauerhaft – so muss beim
    // Zurückdrehen nicht auf die (verzögerten) Maße von iOS gewartet werden
    let buggy = false;
    // Ausrichtung kommt über screen.orientation sofort, innerWidth/-Height erst verzögert
    const isPortrait = () =>
      screen.orientation?.type ? screen.orientation.type.startsWith('portrait') : innerHeight >= innerWidth;
    const apply = () => {
      const portrait = isPortrait();
      // iOS liefert screen.width/height immer hochkant – passend zur Ausrichtung wählen
      const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      const gap = full - innerHeight;
      // Messung nur trauen, wenn der Viewport schon zur Ausrichtung passt (nicht mitten im Drehen)
      const measured = portrait === (innerHeight >= innerWidth) && gap > 0 && gap <= 100;
      if (portrait && measured) buggy = true;
      const on = portrait ? buggy : measured;
      root.classList.toggle('vh-fix', on);
      if (on) root.style.setProperty('--app-h', `${full}px`);
      else root.style.removeProperty('--app-h');
    };
    // Nach dem Drehen meldet iOS die Maße verzögert richtig → mehrfach nachmessen
    let timers = [];
    const settle = () => {
      apply();
      timers.forEach(clearTimeout);
      timers = [100, 300, 700, 1200].map((ms) => setTimeout(apply, ms));
    };
    apply();
    addEventListener('resize', settle);
    addEventListener('orientationchange', settle);
    screen.orientation?.addEventListener('change', settle);
  })();

  // Kein Zoomen auf Touch-Geräten: iOS ignoriert user-scalable=no, daher Gesten selbst abfangen
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    const stop = (e) => e.preventDefault();
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    // Doppeltipp auf Hintergrund/Text abfangen – aktive Bedienelemente reagieren weiter auf jeden Tipp
    let lastTouch = 0;
    document.addEventListener('touchend', (e) => {
      const interactive = e.target.closest?.('button:not(:disabled), a, input, select, textarea, label');
      if (e.timeStamp - lastTouch < 350 && !interactive && e.cancelable) e.preventDefault();
      lastTouch = e.timeStamp;
    }, { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  // Ton darf erst nach einer Nutzeraktion starten – iOS akzeptiert dafür nur Tipp/Klick
  // (touchend/click), nicht schon das Berühren (pointerdown/touchstart)
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
    addEventListener(ev, () => sfx.unlock(), { capture: true, passive: true });
  }

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
    el.infoDialog.querySelector('.info__body').scrollTop = 0;
  });
  // schnell wieder zu: Tipp neben das Fenster schließt es (✕ und Escape gehen ohnehin)
  el.infoDialog.addEventListener('click', (e) => {
    if (e.target === el.infoDialog) el.infoDialog.close();
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
    if (bigWinSkip && (e.code === 'Space' || e.key === 'Enter')) {
      e.preventDefault();
      if (!e.repeat) bigWinSkip();
      return;
    }
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

  // Feiner Schneefall – nur im Himmel hinter den Bergen. Dort liegt keine Glas-Unschärfe darüber,
  // die das Handy sonst bei jedem Schnee-Bild neu berechnen müsste.
  function startSnow() {
    if (reducedMotion) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'range__snow';
    canvas.setAttribute('aria-hidden', 'true');
    el.ladders.prepend(canvas);
    const ctx = canvas.getContext('2d');
    let flakes = [];
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(1.5, devicePixelRatio || 1); // kleine weiche Flocken brauchen kein Retina
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(45, (w * h) / 9000));
      flakes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.6 + Math.random() * 1.6, v: 0.15 + Math.random() * 0.45,
        sway: Math.random() * Math.PI * 2, a: 0.25 + Math.random() * 0.5,
      }));
    };
    new ResizeObserver(resize).observe(canvas);
    // Pause: Hintergrund-Tab, Ruhemodus oder ein Fenster (Bonus, Casino, Regeln) liegt darüber
    const paused = () => document.hidden || document.body.classList.contains('is-calm')
      || bonusRunning || gambleOpen || el.infoDialog.open;
    // Timer mit 30 Bildern pro Sekunde statt requestAnimationFrame (das würde 60–120× pro Sekunde wecken)
    setInterval(() => {
      if (paused() || !w) return;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#e8f6ff';
      for (const f of flakes) {
        f.y += f.v * 2;
        f.sway += 0.02;
        f.x += Math.sin(f.sway) * 0.5;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        ctx.globalAlpha = f.a;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }, 33);
  }

  // Ruhemodus (wie Susak City): Deko-Animationen halten an, wenn 20 s nichts passiert
  // oder das Fenster den Fokus verliert – spart auf dem Handy Akku und Wärme
  function setupCalmMode() {
    const IDLE_MS = 20000;
    let timer = 0;
    const calm = (on) => document.body.classList.toggle('is-calm', on);
    const wake = () => {
      calm(false);
      clearTimeout(timer);
      timer = setTimeout(() => calm(true), IDLE_MS);
    };
    for (const ev of ['pointerdown', 'keydown', 'focus', 'visibilitychange']) {
      addEventListener(ev, () => { if (!document.hidden) wake(); }, { passive: true });
    }
    addEventListener('blur', () => calm(true));
    wake();
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
      // In den Freispielen steht der Bergretter an der Stelle des Schneesturms
      if (engine.bonus && id === 'DEVIL') id = CONFIG.freeSpins.rescuer.id;
      engine.forceNext(id);
      if (bonusRunning) {
        // im Bonus: Freispiel mit diesem Symbol starten, sobald es bereit ist
        if (freeSpinPress) onSpin();
        else say(`Test: nächstes Freispiel = ${id}`, 'warn');
        return;
      }
      if (spinning) return;
      say(`Test: nächster Spin = ${id}`, 'warn');
      doSpin();
    };
    add('👑 Bonus', () => spinWith('KING'));
    add('❄️ Sturm', () => spinWith('DEVIL'));
    add('☀️ Sonne', () => spinWith('SUN'));
    for (const sym of CONFIG.symbols.filter((x) => x.effect === 'ladder')) add(sym.icon, () => spinWith(sym.id));
    let wheelPick = 0;
    add('🎡 Feld', () => {
      const f = CONFIG.freeSpins.wheel[wheelPick];
      engine.forcedWheel = wheelPick;
      say(`Test: nächstes Scheibenfeld = ${f.name}`, 'warn');
      wheelPick = (wheelPick + 1) % CONFIG.freeSpins.wheel.length;
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

  // Sternenhimmel mit Milchstraße (einmal gezeichnet, bei Größenänderung neu)
  function drawStars() {
    const canvas = $('stars');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = innerWidth;
    const h = innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Milchstraße: diagonales Band von links unten nach rechts oben
    const band = (t) => ({ x: t * w, y: h * (0.62 - 0.55 * t) });
    for (let k = 0; k < 40; k++) {
      const t = rand();
      const p = band(t);
      const r = (0.08 + rand() * 0.12) * Math.max(w, h);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      const hue = rand() < 0.5 ? '170,150,230' : '120,160,255';
      g.addColorStop(0, `rgba(${hue},0.16)`);
      g.addColorStop(1, `rgba(${hue},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    const count = Math.round((w * h) / 450);
    for (let k = 0; k < count; k++) {
      let x;
      let y;
      if (rand() < 0.45) {
        // dichter entlang der Milchstraße
        const p = band(rand());
        const spread = (rand() - 0.5) * 0.22 * h;
        x = p.x + spread * 0.5;
        y = p.y + spread;
      } else {
        x = rand() * w;
        y = rand() * h * 0.85;
      }
      const big = rand() < 0.04;
      const r = big ? 1.1 + rand() * 1 : 0.4 + rand() * 0.7;
      ctx.globalAlpha = big ? 1 : 0.4 + rand() * 0.6;
      ctx.fillStyle = rand() < 0.15 ? '#ffe2c4' : rand() < 0.2 ? '#c9dcff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (big) {
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  drawStars();
  let starTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(starTimer);
    starTimer = setTimeout(drawStars, 150);
  });

  buildWheel();
  buildDevPanel();
  startSnow();
  setupCalmMode();
  fillAutoMenu();
  // gespeicherte Autoplay-Einstellungen übernehmen und Änderungen merken
  if (CONFIG.autoplay.collectAt.includes(saved.autoCollect) || saved.autoCollect === 0) el.autoCollect.value = String(saved.autoCollect);
  if (typeof saved.autoStopSummit === 'boolean') el.autoStopSummit.checked = saved.autoStopSummit;
  el.autoCollect.addEventListener('change', saveState);
  el.autoStopSummit.addEventListener('change', saveState);
  addEventListener('pagehide', saveState);
  showStatic(shownSymbols);
  render();
})();
