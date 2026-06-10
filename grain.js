(function () {
  // ── Canvas grain ──
  const canvas = document.createElement('canvas');
  canvas.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:100%', 'height:100%',
    'pointer-events:none',
    'z-index:50',
    'opacity:0',
    'mix-blend-mode:screen'
  ].join(';');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Small tile reused for perf
  const TILE = 200;
  const offscreen = document.createElement('canvas');
  offscreen.width = offscreen.height = TILE;
  const octx = offscreen.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  function drawNoise() {
    const id = octx.createImageData(TILE, TILE);
    const d  = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255 | 0;
      d[i] = d[i+1] = d[i+2] = v;
      d[i+3] = 255;
    }
    octx.putImageData(id, 0, 0);
  }

  // ── Opacity state ──
  const BASE   = 0.035;
  const SCROLL_MAX = 0.06;
  let displayOpacity = 0;   // what canvas sees
  let scrollTarget   = BASE;
  let fadeStart      = null;
  const FADE_MS      = 2000;

  // ease-in quad
  function easeIn(t) { return t * t; }

  // ── Scroll ──
  let scrollTimer = null;
  function onScroll() {
    const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
    const frac = Math.min(window.scrollY / maxScroll, 1);
    scrollTarget = BASE + frac * (SCROLL_MAX - BASE);
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { scrollTarget = BASE; }, 150);
  }
  window.addEventListener('scroll',     onScroll, { passive: true });
  window.addEventListener('touchmove',  onScroll, { passive: true });

  // ── RAF loop ──
  let frame = 0;
  function tick(ts) {
    requestAnimationFrame(tick);

    // Fade-in on load
    if (fadeStart === null) fadeStart = ts;
    const t = Math.min((ts - fadeStart) / FADE_MS, 1);
    const fadeFactor = easeIn(t);

    // Smooth lerp toward scrollTarget (≈1.5s settling)
    displayOpacity += (scrollTarget - displayOpacity) * 0.012;
    canvas.style.opacity = fadeFactor * displayOpacity;

    // Redraw noise every other frame
    frame++;
    if (frame % 2 === 0) {
      drawNoise();
      const pattern = ctx.createPattern(offscreen, 'repeat');
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  requestAnimationFrame(tick);

  // ── Click / touch ripple ──
  function ripple(x, y) {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed',
      `left:${x - 30}px`,
      `top:${y - 30}px`,
      'width:60px',
      'height:60px',
      'border-radius:50%',
      'background:rgba(168,168,158,0.15)',
      'pointer-events:none',
      'z-index:49',
      'transform:scale(0)',
      'opacity:1',
      'transition:transform 1.5s cubic-bezier(0.2,0,0.4,1),opacity 1.5s ease-out'
    ].join(';');
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = 'scale(3)';
      el.style.opacity   = '0';
    });
    setTimeout(() => el.remove(), 1600);
  }

  document.addEventListener('click', e => {
    if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    ripple(e.clientX, e.clientY);
  });
  document.addEventListener('touchstart', e => {
    for (const t of e.touches) ripple(t.clientX, t.clientY);
  }, { passive: true });
})();
