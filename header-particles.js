(function () {
  'use strict';

  var TOTAL    = 800;
  var GRAVITY  = 0.22;
  var TURB     = 0.26;
  var SPRING_K = 0.10;
  var DAMPING  = 0.74;

  function init() {
    var anchor = document.querySelector('a.site-title');
    if (!anchor) return;

    var cs         = getComputedStyle(anchor);
    var fontSize   = parseFloat(cs.fontSize);
    var fontFamily = cs.fontFamily;
    var fontWeight = cs.fontWeight || '400';
    var fontStr    = fontWeight + ' ' + fontSize + 'px ' + fontFamily;

    var color = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-title').trim() || '#e8e4de';

    var text  = 'mikihoo / 微氣候';
    var chars = Array.from(text);

    // ── Exact character positions via DOM Range ───────────────────
    // Finds exact browser-rendered x offsets per character,
    // avoiding canvas measureText / letter-spacing discrepancies.
    var textNode = null;
    for (var ni = 0; ni < anchor.childNodes.length; ni++) {
      if (anchor.childNodes[ni].nodeType === 3) { textNode = anchor.childNodes[ni]; break; }
    }
    if (!textNode) return;

    var anchorRect = anchor.getBoundingClientRect();
    var range      = document.createRange();

    var charPos = chars.map(function (ch, i) {
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      var r = range.getBoundingClientRect();
      return { ch: ch, x: r.left - anchorRect.left, w: r.width };
    });
    range.detach();

    var canvasW  = Math.ceil(anchorRect.width);
    var baseline = Math.ceil(fontSize * 1.18);
    var canvasH  = Math.ceil(fontSize * 2.7);

    // ── Sample pixels per character ───────────────────────────────
    var sc    = document.createElement('canvas');
    sc.width  = canvasW;
    sc.height = canvasH;
    var sCtx  = sc.getContext('2d');
    sCtx.font      = fontStr;
    sCtx.fillStyle = '#fff';

    // Draw at DOM-measured positions so samples align with particle origins
    charPos.forEach(function (cp) { sCtx.fillText(cp.ch, cp.x, baseline); });

    var raw     = sCtx.getImageData(0, 0, canvasW, canvasH).data;
    var buckets = charPos.map(function (cp) {
      var pts = [];
      var x0  = Math.max(0, Math.floor(cp.x));
      var x1  = Math.min(canvasW, Math.ceil(cp.x + cp.w));
      for (var py = 0; py < canvasH; py++) {
        for (var px = x0; px < x1; px++) {
          if (raw[(py * canvasW + px) * 4 + 3] > 40) pts.push({ x: px, y: py });
        }
      }
      return pts;
    });

    var totalPx = buckets.reduce(function (s, b) { return s + b.length; }, 0);
    if (!totalPx) return;

    // ── Build particle pool ───────────────────────────────────────
    var particles = [];
    buckets.forEach(function (pts, ci) {
      if (!pts.length) return;
      var n = Math.max(1, Math.round(TOTAL * pts.length / totalPx));
      for (var i = 0; i < n; i++) {
        var src = pts[(Math.random() * pts.length) | 0];
        particles.push({ x: src.x, y: src.y, origX: src.x, origY: src.y,
                         vx: 0, vy: 0, ci: ci });
      }
    });

    // ── Render canvas ─────────────────────────────────────────────
    var dpr = window.devicePixelRatio || 1;
    var rc  = document.createElement('canvas');
    rc.width  = canvasW * dpr;
    rc.height = canvasH * dpr;

    var yPct = ((baseline / canvasH) * 100).toFixed(1);
    rc.style.cssText =
      'position:absolute;left:0;top:50%;' +
      'transform:translateY(-' + yPct + '%);' +
      'width:' + canvasW + 'px;height:' + canvasH + 'px;' +
      'pointer-events:none;';

    anchor.classList.add('has-particles');
    anchor.style.color    = 'transparent';
    anchor.style.position = 'relative';
    anchor.style.display  = 'inline-block';
    anchor.appendChild(rc);

    var ctx = rc.getContext('2d');
    ctx.scale(dpr, dpr);

    // ── Interaction ───────────────────────────────────────────────
    var hovered  = -1;
    var fallDist = fontSize * 1.35;

    function charAt(clientX) {
      var rect = anchor.getBoundingClientRect();
      var mx   = clientX - rect.left;
      for (var i = 0; i < charPos.length; i++) {
        var cp = charPos[i];
        if (mx >= cp.x && mx < cp.x + cp.w) return cp.ch.trim() ? i : -1;
      }
      return -1;
    }

    anchor.addEventListener('mousemove',  function (e) { hovered = charAt(e.clientX); });
    anchor.addEventListener('mouseleave', function ()  { hovered = -1; });
    anchor.addEventListener('touchstart', function (e) { hovered = charAt(e.touches[0].clientX); }, { passive: true });
    anchor.addEventListener('touchmove',  function (e) { hovered = charAt(e.touches[0].clientX); }, { passive: true });
    anchor.addEventListener('touchend',   function ()  { hovered = -1; });

    // ── Animation loop ────────────────────────────────────────────
    function tick() {
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.fillStyle = color;

      for (var i = 0; i < particles.length; i++) {
        var p       = particles[i];
        var falling = (p.ci === hovered);

        if (falling) {
          p.vy += GRAVITY;
          p.vx += (Math.random() - 0.5) * TURB;
          p.vx *= 0.96;
          p.x  += p.vx;
          p.y  += p.vy;

          if (p.y > p.origY + fallDist) {
            p.x  = p.origX + (Math.random() - 0.5) * 2;
            p.y  = p.origY - Math.random() * 5;
            p.vx = (Math.random() - 0.5) * 0.5;
            p.vy = 0;
          }

          var t = Math.max(0, (p.y - p.origY) / fallDist);
          ctx.globalAlpha = 1 - t * 0.88;
        } else {
          p.vx += (p.origX - p.x) * SPRING_K;
          p.vy += (p.origY - p.y) * SPRING_K;
          p.vx *= DAMPING;
          p.vy *= DAMPING;
          p.x  += p.vx;
          p.y  += p.vy;
          ctx.globalAlpha = 1;
        }

        ctx.fillRect(p.x, p.y, 1.4, 1.4);
      }

      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    }

    tick();
  }

  function start() {
    var anchor = document.querySelector('a.site-title');
    if (!anchor) return;
    // Explicitly wait for EB Garamond to be available in canvas context
    var fontSize = parseFloat(getComputedStyle(anchor).fontSize);
    var fontCheck = '400 ' + fontSize + 'px "EB Garamond"';
    if (document.fonts && document.fonts.load) {
      document.fonts.load(fontCheck).then(init);
    } else {
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
