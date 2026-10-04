// Monte-Carlo-Simulation der Auszahlungsquote (RTP) für verschiedene Sammel-Strategien.
// Aufruf: node tools/simulate.js [spins]
const CONFIG = require('../js/config.js');
const SusakEngine = require('../js/engine.js');

const SPINS = Number(process.argv[2]) || 2_000_000;

function run(label, shouldCollect) {
  const engine = new SusakEngine({ ...CONFIG, startBalance: Infinity }, Math.random);
  let wagered = 0;
  let returned = 0;
  let resets = 0;
  let tops = 0;
  let allSummits = 0;
  let bonusWon = 0;
  let spinsInRound = 0;
  for (let n = 0; n < SPINS; n++) {
    const res = engine.spin();
    wagered += res.cost;
    spinsInRound++;
    for (const e of res.events) {
      if (e.type === 'top') tops++;
      if (e.type === 'allSummits') { returned += e.paid; allSummits++; spinsInRound = 0; }
      if (e.type === 'bonusStart') engine.spinWheel();
      if (e.type === 'bonusEnd') { returned += e.paid; bonusWon += e.paid; spinsInRound = 0; }
      if (e.type === 'reset') { resets++; spinsInRound = 0; }
    }
    if (engine.cashpot > 0 && shouldCollect(engine, spinsInRound)) {
      returned += engine.collect();
      spinsInRound = 0;
    }
  }
  const rtp = (returned / wagered) * 100;
  console.log(
    `${label.padEnd(34)} RTP ${rtp.toFixed(2).padStart(6)} %   ` +
    `Teufel ${(resets / SPINS * 100).toFixed(1)} %   Bonus 1 von ${Math.round(SPINS / allSummits)}   davon Bonus-RTP ${(bonusWon / wagered * 100).toFixed(1)} %`
  );
}

console.log(`Simuliere ${SPINS.toLocaleString('de-DE')} Spins pro Strategie (kingMode: ${CONFIG.kingMode})\n`);
for (const n of [1, 2, 3, 4, 5, 6, 8]) run(`Sammeln nach ${n} Spin(s)`, (_, s) => s >= n);
for (const x of [2, 4, 6, 10, 15, 20, 30]) run(`Sammeln ab Cashpot ≥ ${x}× Einsatz`, (e) => e.cashpot >= x * e.bet);
