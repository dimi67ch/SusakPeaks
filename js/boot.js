// Susak Peaks – Ladebildschirm (wie Susak City): lädt Schriften und Bilder vor,
// danach schaltet „Spiel starten" den Ton frei und blendet den Bildschirm aus.
(function () {
  const boot = document.getElementById('boot');
  if (!boot) return;
  const fill = document.getElementById('boot-fill');
  const status = document.getElementById('boot-status');
  const startBtn = document.getElementById('boot-start');
  const installBtn = document.getElementById('boot-install');

  // Alles, was im Spiel als Bild auftaucht – vorher geladen, damit später nichts nachruckelt
  const IMAGES = [
    'assets/bergretter.webp',
    'assets/king.webp',
    'assets/knife.webp',
    'assets/eagle.webp',
    'assets/snowcat.webp',
    'assets/sun.webp',
    'assets/snowflake.webp',
    'assets/helmet.webp',
    'assets/dealer-wait.webp',
    'assets/dealer-reveal-blank.webp',
    'icons/icon-192.png',
  ];

  const loadImage = (src) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        // dekodieren, damit das erste Anzeigen sofort geht
        (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(resolve);
      };
      img.src = src;
    });

  async function preload() {
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    const jobs = [fonts, ...IMAGES.map(loadImage)];
    let done = 0;
    const total = jobs.length;
    await Promise.all(
      jobs.map((p) =>
        p.then(() => {
          done++;
          const pct = Math.round((done / total) * 100);
          fill.style.width = `${pct}%`;
          status.textContent = `Lade … ${pct} %`;
        }),
      ),
    );
    status.textContent = 'Bereit';
    startBtn.hidden = false;
    startBtn.focus({ preventScroll: true });
  }

  // ── PWA: Installation anbieten, sobald der Browser es erlaubt ──
  let installPrompt = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installBtn.disabled = true;
    await installPrompt.prompt();
    installPrompt = null;
    installBtn.hidden = true;
  });
  addEventListener('appinstalled', () => { installBtn.hidden = true; });

  // Leertaste/Enter auf dem Ladebildschirm startet das Spiel, statt dahinter zu spinnen
  const onBootKey = (e) => {
    if (e.code !== 'Space' && e.key !== 'Enter') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat && !startBtn.hidden && !startBtn.disabled) startBtn.click();
  };
  addEventListener('keydown', onBootKey, { capture: true });

  startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    window.sfx?.unlock(); // dieser Klick schaltet den Ton frei (wichtig für iOS)
    window.sfx?.uiClick();
    removeEventListener('keydown', onBootKey, { capture: true });
    boot.classList.add('is-done');
    setTimeout(() => boot.remove(), 600);
  });

  preload();
})();
