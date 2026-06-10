(function () {
  function showPage() {
    const pageContent = document.getElementById('pageContent');
    if (pageContent) {
      pageContent.style.transition = 'opacity 0.3s ease';
      pageContent.style.opacity = '1';
    }
    document.body.style.overflow = '';
  }

  if (sessionStorage.getItem('intro_done')) {
    showPage();
    return;
  }
  sessionStorage.setItem('intro_done', '1');

  // ── Overlay ──
  const overlay = document.createElement('div');
  overlay.id = 'intro-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:999',
    'background:#0f0f0f', 'display:flex',
    'align-items:center', 'justify-content:center'
  ].join(';');
  document.body.appendChild(overlay);

  document.body.style.overflow = 'hidden';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  overlay.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();

  const isMobile  = window.innerWidth <= 768;
  const fontSize  = Math.round(window.innerWidth * (isMobile ? 0.12 : 0.06));
  const TEXT       = '微氣候';
  const TEXT_COLOR = '#e8e4dc';

  // ── Phase timing (ms) ──
  const T_FADEIN  = 600;
  const T_HOLD    = 1000;
  const T_SCATTER = 1400;
  const T_TOTAL   = T_FADEIN + T_HOLD + T_SCATTER;

  // ── Sample text pixels → particles ──
  function sampleParticles() {
    const off  = document.createElement('canvas');
    off.width  = canvas.width;
    off.height = canvas.height;
    const octx = off.getContext('2d');
    octx.font         = `400 ${fontSize}px 'EB Garamond', serif`;
    octx.fillStyle    = '#ffffff';
    octx.textAlign    = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(TEXT, off.width / 2, off.height / 2);

    const data = octx.getImageData(0, 0, off.width, off.height).data;
    const pts  = [];
    const step = 3;
    for (let y = 0; y < off.height; y += step)
      for (let x = 0; x < off.width; x += step) {
        const i = (y * off.width + x) * 4;
        if (data[i + 3] > 128) pts.push({ x, y });
      }

    if (pts.length > 800) {
      const skip    = pts.length / 800;
      const sampled = [];
      for (let i = 0; i < pts.length; i += skip) sampled.push(pts[Math.floor(i)]);
      return sampled;
    }
    return pts;
  }

  let particles = null;

  function initParticles() {
    const pts = sampleParticles();
    particles = pts.map(p => {
      const grey = Math.random() > 0.5 ? 232 : 168;
      return {
        x: p.x, y: p.y,
        ox: p.x, oy: p.y,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 2.5 + Math.random() * 4,
        size: 1 + Math.random(),
        delay: Math.random() * 0.35,
        color: `rgb(${grey},${grey - 4},${grey - 12})`,
      };
    });
  }

  // ── RAF loop ──
  let startTime = null;

  function tick(ts) {
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (elapsed < T_FADEIN) {
      const t = elapsed / T_FADEIN;
      ctx.globalAlpha = t * t;
      ctx.font         = `400 ${fontSize}px 'EB Garamond', serif`;
      ctx.fillStyle    = TEXT_COLOR;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TEXT, canvas.width / 2, canvas.height / 2);
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);

    } else if (elapsed < T_FADEIN + T_HOLD) {
      ctx.globalAlpha  = 1;
      ctx.font         = `400 ${fontSize}px 'EB Garamond', serif`;
      ctx.fillStyle    = TEXT_COLOR;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TEXT, canvas.width / 2, canvas.height / 2);
      if (!particles) initParticles();
      requestAnimationFrame(tick);

    } else if (elapsed < T_TOTAL) {
      const t = (elapsed - T_FADEIN - T_HOLD) / T_SCATTER;
      if (particles) {
        particles.forEach(p => {
          const pt   = Math.max(0, (t - p.delay) / (1 - p.delay));
          const fall = pt * pt;
          p.x = p.ox + p.vx * pt * fontSize * 0.5;
          p.y = p.oy + p.vy * fall * fontSize * 1.2;
          ctx.globalAlpha = Math.max(0, 1 - pt * 1.3);
          ctx.fillStyle   = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
        });
        ctx.globalAlpha = 1;
      }
      requestAnimationFrame(tick);

    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f0f0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      overlay.style.transition = 'opacity 0.4s ease';
      overlay.style.opacity    = '0';
      showPage();
      setTimeout(() => { overlay.style.display = 'none'; }, 420);
    }
  }

  const fallback = setTimeout(showPage, 3000);

  const start = () => {
    clearTimeout(fallback);
    requestAnimationFrame(tick);
    setTimeout(showPage, T_TOTAL + 1000);
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start);
  } else {
    start();
  }
})();
