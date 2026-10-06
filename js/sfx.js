// Susak Peaks – synthetisierte Sounds per Web Audio API (übernommen aus Susak City, ohne Sprachaufnahmen).
(function (root) {
  // 1 s Stille als WAV (8 kHz, 8 Bit, mono) – für das iOS-Keep-Alive-Element (wie Susak City)
  function silentWavUrl() {
    const rate = 8000;
    const n = rate;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    v.setUint32(4, 36 + n, true);
    str(8, 'WAVEfmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); // PCM
    v.setUint16(22, 1, true); // mono
    v.setUint32(24, rate, true);
    v.setUint32(28, rate, true);
    v.setUint16(32, 1, true);
    v.setUint16(34, 8, true);
    str(36, 'data');
    v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128); // 8-Bit-Stille
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  class Sfx {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseBuf = null;
      this.lastStop = 0;
      this.keepAlive = null;
      this.muted = false;
      try { this.muted = localStorage.getItem('susak.muted') === '1'; } catch (_) { /* ohne Speicher */ }
    }

    // Muss aus einer User-Geste heraus aufgerufen werden (auf iOS: Tipp/Klick, nicht schon beim Berühren).
    // iOS braucht zusätzlich einen kurz abgespielten Puffer und ein <audio>-Element,
    // damit der Ton auch im Home-Bildschirm-Modus und bei aktivem Stummschalter läuft.
    unlock() {
      if (!this.ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        this.master.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        // Kontext nach Hintergrund/Anruf/Sperrbildschirm automatisch wieder aufwecken
        this.ctx.addEventListener('statechange', () => this.resume());
        for (const ev of ['visibilitychange', 'focus', 'pageshow', 'touchend']) {
          addEventListener(ev, () => this.resume(), { passive: true });
        }
      }
      this.primeSilent();
      this.resume();
    }

    // Stille Wiedergabe hält die Audio-Session auf iOS aktiv
    primeSilent() {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);

      if (!this.keepAlive) {
        // Kurzer stiller WAV-Loop: schaltet iOS auf die Wiedergabe-Session um,
        // damit Web Audio nicht vom Stummschalter unterdrückt wird.
        const el = document.createElement('audio');
        el.src = silentWavUrl();
        el.loop = true;
        el.volume = 0.001;
        el.setAttribute('playsinline', '');
        el.setAttribute('aria-hidden', 'true');
        el.style.display = 'none';
        document.body.append(el);
        this.keepAlive = el;
      }
      this.keepAlive.play().catch(() => undefined);
    }

    resume() {
      if (!this.ctx) return;
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
      if (this.keepAlive && !document.hidden) this.keepAlive.play().catch(() => undefined);
    }

    setMuted(m) {
      this.muted = m;
      if (!m) this.resume();
      try { localStorage.setItem('susak.muted', m ? '1' : '0'); } catch (_) { /* ohne Speicher */ }
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }

    get ready() {
      return this.ctx && this.master && this.ctx.state === 'running';
    }

    tone(freq, dur, opts = {}) {
      const ctx = this.ctx;
      const t = ctx.currentTime + (opts.at ?? 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = opts.type ?? 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
      const vol = opts.vol ?? 0.3;
      const a = opts.attack ?? 0.004;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }

    noise(dur, opts = {}) {
      const ctx = this.ctx;
      const t = ctx.currentTime + (opts.at ?? 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = opts.type ?? 'bandpass';
      f.frequency.setValueAtTime(opts.freq ?? 2000, t);
      if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
      f.Q.value = opts.q ?? 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.3, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.05);
    }

    uiClick() {
      if (!this.ready) return;
      this.tone(1800, 0.04, { type: 'triangle', vol: 0.12 });
    }

    spinStart() {
      if (!this.ready) return;
      this.noise(0.35, { freq: 400, sweepTo: 3000, q: 0.8, vol: 0.18 });
      this.tone(120, 0.25, { type: 'sawtooth', vol: 0.05, slideTo: 260 });
    }

    // Mechanischer Einrastton
    reelStop() {
      if (!this.ready) return;
      const now = performance.now();
      const quiet = now - this.lastStop < 40;
      this.lastStop = now;
      const v = quiet ? 0.4 : 1;
      this.noise(0.05, { freq: 2600, q: 3, vol: 0.35 * v });
      this.tone(150, 0.12, { type: 'sine', vol: 0.45 * v, slideTo: 55 });
      this.tone(900, 0.03, { type: 'square', vol: 0.05 * v });
    }

    // Leiter steigt: kurzer Ton, höher je Stufe
    climb(level) {
      if (!this.ready) return;
      const f = 523.25 * Math.pow(2, (level - 1) * (2 / 12));
      this.tone(f, 0.18, { type: 'triangle', vol: 0.12 });
      this.tone(f * 2, 0.12, { type: 'sine', vol: 0.04 });
    }

    // level 0 = klein … 3 = groß
    win(level) {
      if (!this.ready) return;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
      const count = 3 + level;
      for (let i = 0; i < count; i++) {
        const f = notes[i % notes.length] * (i >= notes.length ? 2 : 1);
        this.tone(f, 0.28, { type: 'triangle', vol: 0.14, at: i * 0.07 });
        this.tone(f * 2, 0.18, { type: 'sine', vol: 0.05, at: i * 0.07 });
      }
    }

    // Goldener Gong mit Glitzer-Arpeggio (König)
    gong() {
      if (!this.ready) return;
      [1, 1.47, 2.09, 2.56, 3.43].forEach((h, i) => this.tone(98 * h, 2.6 - i * 0.35, { type: 'sine', vol: 0.22 / (i + 1), attack: 0.01 }));
      this.tone(49, 1.8, { type: 'sine', vol: 0.35, slideTo: 44 });
      this.noise(0.25, { freq: 3000, q: 0.7, vol: 0.12 });
      [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.06, at: 0.35 + i * 0.08 }));
    }

    // Teufel: tiefer, absteigender Klang – Pegel wie die Verlust-Klänge in Susak City
    devil() {
      if (!this.ready) return;
      this.tone(220, 0.45, { type: 'triangle', vol: 0.12, slideTo: 110 });
      this.tone(165, 0.55, { type: 'triangle', vol: 0.1, at: 0.15, slideTo: 70 });
      this.noise(0.35, { freq: 600, sweepTo: 150, q: 1, vol: 0.1 });
    }

    // Schneesturm: heulender Wind und ein dumpfer Schlag, danach die absteigenden Töne
    storm() {
      if (!this.ready) return;
      this.noise(1.4, { freq: 300, sweepTo: 1400, q: 0.7, vol: 0.16 });
      this.noise(1.2, { freq: 900, sweepTo: 250, q: 0.9, vol: 0.12, at: 0.2 });
      this.tone(70, 0.6, { type: 'sine', vol: 0.35, slideTo: 38 });
      this.devil();
    }

    // Großer Gewinn (wie Susak City, Akkord-Fanfare ohne Sprachaufnahme)
    bigWin() {
      if (!this.ready) return;
      const chords = [
        [261.6, 329.6, 392],
        [293.7, 370, 440],
        [329.6, 415.3, 493.9],
        [392, 493.9, 587.3, 784],
      ];
      chords.forEach((c, i) => c.forEach((f) => {
        this.tone(f, i === 3 ? 1.6 : 0.3, { type: 'sawtooth', vol: 0.05, at: i * 0.16 });
        this.tone(f * 2, i === 3 ? 1.4 : 0.25, { type: 'triangle', vol: 0.06, at: i * 0.16 });
      }));
      this.noise(1.2, { freq: 8000, type: 'highpass', vol: 0.06, at: 0.48 });
    }

    // nächste Gewinnstufe (Big → Mega → Epic)
    tierUp() {
      if (!this.ready) return;
      this.noise(0.4, { freq: 500, sweepTo: 5000, vol: 0.18 });
      [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.1, at: i * 0.04 }));
    }

    // Zählgeräusch beim Hochzählen
    countTick() {
      if (!this.ready) return;
      this.tone(2200 + Math.random() * 400, 0.025, { type: 'square', vol: 0.03 });
    }

    // Falsch geraten im Casino (wie „Blackjack verloren" in Susak City)
    lose() {
      if (!this.ready) return;
      this.tone(220, 0.35, { type: 'triangle', vol: 0.12, slideTo: 150 });
      this.tone(165, 0.45, { type: 'triangle', vol: 0.1, at: 0.15, slideTo: 110 });
    }
  }

  root.sfx = new Sfx();
})(window);
