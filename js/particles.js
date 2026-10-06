// Susak Peaks – leichtes Canvas-Partikelsystem für große Gewinne (übernommen aus Susak City,
// statt Geldscheinen mit Eiskristallen). Läuft nur, solange Partikel unterwegs sind.
(function (root) {
  const COLORS = ['#ffd36e', '#a6ecff', '#ffffff', '#ff7a8a', '#ffad6b', '#7fd8ff'];
  const MAX = 240;
  const SPRITE = 64;

  // Glow-Sprites einmal vorrendern – drawImage ist viel billiger als shadowBlur
  function sprite(draw) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SPRITE;
    const c = cv.getContext('2d');
    c.translate(SPRITE / 2, SPRITE / 2);
    draw(c);
    return cv;
  }

  const sparks = COLORS.map((color) => sprite((c) => {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, SPRITE / 2);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.15, color);
    g.addColorStop(0.4, color + '66');
    g.addColorStop(1, color + '00');
    c.fillStyle = g;
    c.fillRect(-SPRITE / 2, -SPRITE / 2, SPRITE, SPRITE);
  }));

  const coin = sprite((c) => {
    c.shadowColor = '#ffd36e';
    c.shadowBlur = 10;
    const g = c.createLinearGradient(0, -18, 0, 18);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.5, '#ffd36e');
    g.addColorStop(1, '#c98a00');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 18, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#7a4b00';
    c.font = 'bold 22px Unbounded, Impact, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('$', 0, 1);
  });

  const crystal = sprite((c) => {
    c.shadowColor = '#a6ecff';
    c.shadowBlur = 8;
    c.strokeStyle = '#e8fbff';
    c.lineWidth = 3;
    c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      c.rotate(Math.PI / 3);
      c.beginPath();
      c.moveTo(0, -20); c.lineTo(0, 20);
      c.moveTo(-6, -14); c.lineTo(0, -8); c.lineTo(6, -14);
      c.moveTo(-6, 14); c.lineTo(0, 8); c.lineTo(6, 14);
      c.stroke();
    }
  });

  class Particles {
    constructor() {
      const canvas = document.createElement('canvas');
      canvas.className = 'particles';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.append(canvas);
      this.ctx = canvas.getContext('2d');
      this.ps = [];
      this.running = false;
      this.fountain = 0;
      const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
      resize();
      addEventListener('resize', resize);
      this.loop = this.loop.bind(this);
    }

    burst(x, y, n = 60, kinds = ['spark']) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 9;
        this.add(this.make(x, y, Math.cos(a) * s, Math.sin(a) * s - 3, kinds));
      }
      this.start();
    }

    // Dauerregen (großer Gewinn), bis stopFountain()
    startFountain(intensity = 1) {
      this.fountain = intensity;
      this.start();
    }

    stopFountain() {
      this.fountain = 0;
    }

    add(p) {
      if (this.ps.length < MAX) this.ps.push(p);
    }

    make(x, y, vx, vy, kinds) {
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      return {
        x, y, vx, vy, kind,
        life: 70 + Math.random() * 60,
        size: kind === 'spark' ? 10 + Math.random() * 14 : 16 + Math.random() * 12,
        img: kind === 'coin' ? coin : kind === 'crystal' ? crystal : sparks[Math.floor(Math.random() * sparks.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
      };
    }

    start() {
      if (this.running) return;
      this.running = true;
      requestAnimationFrame(this.loop);
    }

    loop() {
      const { ctx } = this;
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (this.fountain) {
        const n = Math.round(2 * this.fountain);
        for (let i = 0; i < n; i++) {
          this.add(this.make(Math.random() * w, -20, (Math.random() - 0.5) * 3, 2 + Math.random() * 4, ['coin', 'crystal', 'spark']));
          const left = Math.random() < 0.5;
          this.add(this.make(left ? 0 : w, h * 0.9, (left ? 1 : -1) * (6 + Math.random() * 8), -12 - Math.random() * 8, ['spark', 'coin']));
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      let alive = 0;
      for (const p of this.ps) {
        p.life--;
        p.vy += p.kind === 'spark' ? 0.18 : 0.12;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.life <= 0 || p.y > h + 40) continue;
        this.ps[alive++] = p;
        ctx.globalAlpha = Math.min(1, p.life / 30);
        const s = p.size;
        if (p.kind === 'spark') {
          ctx.drawImage(p.img, p.x - s / 2, p.y - s / 2, s, s);
        } else {
          // Münzen drehen sich (gestauchte Breite), Kristalle trudeln
          const sx = p.kind === 'coin' ? Math.abs(Math.cos(p.rot * 3)) + 0.15 : 1;
          const cos = Math.cos(p.rot);
          const sin = Math.sin(p.rot);
          ctx.setTransform(cos * sx, sin * sx, -sin, cos, p.x, p.y);
          ctx.drawImage(p.img, -s / 2, -s / 2, s, s);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
      this.ps.length = alive;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (this.ps.length || this.fountain) requestAnimationFrame(this.loop);
      else {
        ctx.clearRect(0, 0, w, h);
        this.running = false;
      }
    }
  }

  root.Particles = Particles;
})(window);
