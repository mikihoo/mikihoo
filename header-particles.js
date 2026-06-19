(function () {
  'use strict';

  var PER_CHAR   = 90;    // particles spawned per character on hover
  var GRAVITY    = 0.026; // gentle downward pull
  var DRAG       = 0.984; // air resistance
  var SPREAD     = 0.85;  // initial dispersion speed
  var HOVER_EASE = 0.08;  // how fast a char dissolves / reforms
  var LIFE_MIN   = 100;   // frames a particle drifts before respawning
  var LIFE_VAR   = 80;

  function init() {
    var anchor = document.querySelector('a.site-title');
    if (!anchor) return;

    var cs         = getComputedStyle(anchor);
    var fontSize   = parseFloat(cs.fontSize);
    var fontFamily = cs.fontFamily;
    var fontWeight = cs.fontWeight || '400';
    var fontStr    = fontWeight + ' ' + fontSize + 'px ' + fontFamily;

    var color = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-title').trim() || '#e8e4dc';

    var text  = 'mikihoo / 微氣候';
    var chars = Array.from(text);

    // ── Exact per-character x offsets via DOM Range ───────────────
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

    // ── Sample glyph pixels per character (for particle origins) ──
    var sc    = document.createElement('canvas');
    sc.width  = canvasW;
    sc.height = canvasH;
    var sCtx  = sc.getContext('2d');
    sCtx.font      = fontStr;
    sCtx.fillStyle = '#fff';
    charPos.forEach(function (cp) { sCtx.fillText(cp.ch, cp.x, baseline); });
    var raw = sCtx.getImageData(0, 0, canvasW, canvasH).data;

    function newParticle(pts, cx, cy) {
      var src = pts[(Math.random() * pts.length) | 0];
      var ang = Math.atan2(src.y - cy, src.x - cx) + (Math.random() - 0.5);
      var sp  = Math.random() * SPREAD;
      return {
        ox: src.x, oy: src.y,
        x:  src.x, y:  src.y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp * 0.5 - 0.05,
        age: (Math.random() * (LIFE_MIN + LIFE_VAR)) | 0,   // staggered phase
        life: LIFE_MIN + Math.random() * LIFE_VAR
      };
    }

    // ── Build per-character state ─────────────────────────────────
    var charState = charPos.map(function (cp) {
      if (!cp.ch.trim()) return null; // skip spaces / slash region handled below

      var pts = [];
      var x0  = Math.max(0, Math.floor(cp.x));
      var x1  = Math.min(canvasW, Math.ceil(cp.x + cp.w));
      var sx = 0, sy = 0;
      for (var py = 0; py < canvasH; py++) {
        for (var px = x0; px < x1; px++) {
          if (raw[(py * canvasW + px) * 4 + 3] > 40) { pts.push({ x: px, y: py }); sx += px; sy += py; }
        }
      }
      if (!pts.length) return null;
      var cx = sx / pts.length, cy = sy / pts.length;

      var parts = [];
      for (var i = 0; i < PER_CHAR; i++) parts.push(newParticle(pts, cx, cy));

      return { pts: pts, cx: cx, cy: cy, parts: parts, hover: 0 };
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
      'width:' + canvasW + 'px;height:' + canvasH + 'px;pointer-events:none;';

    anchor.classList.add('has-particles');
    anchor.style.color    = 'transparent';
    anchor.style.position = 'relative';
    anchor.style.display  = 'inline-block';
    anchor.appendChild(rc);

    var ctx = rc.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.font         = fontStr;
    ctx.textBaseline = 'alphabetic';

    // ── Interaction ───────────────────────────────────────────────
    var hovered = -1;
    function charAt(clientX) {
      var rect = anchor.getBoundingClientRect();
      var mx   = clientX - rect.left;
      for (var i = 0; i < charPos.length; i++) {
        var cp = charPos[i];
        if (mx >= cp.x && mx < cp.x + cp.w) return charState[i] ? i : -1;
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

      for (var ci = 0; ci < charPos.length; ci++) {
        var st = charState[ci];
        var cp = charPos[ci];

        if (!st) continue;

        // ease hover amount toward target
        var target = (ci === hovered) ? 1 : 0;
        st.hover += (target - st.hover) * HOVER_EASE;
        if (st.hover < 0.002) st.hover = 0;

        // crisp glyph (fades out as it dissolves)
        if (st.hover < 0.999) {
          ctx.globalAlpha = 1 - st.hover;
          ctx.fillStyle   = color;
          ctx.fillText(cp.ch, cp.x, baseline);
        }

        // particles (fade in as it dissolves)
        if (st.hover > 0.002) {
          ctx.fillStyle = color;
          for (var i = 0; i < st.parts.length; i++) {
            var p = st.parts[i];
            p.vy += GRAVITY;
            p.vx *= DRAG;
            p.vy *= DRAG;
            p.x  += p.vx;
            p.y  += p.vy;
            p.age++;

            var lifeT = p.age / p.life;
            if (lifeT >= 1) {
              // respawn at origin with fresh drift
              var ang = Math.atan2(p.oy - st.cy, p.ox - st.cx) + (Math.random() - 0.5);
              var sp  = Math.random() * SPREAD;
              p.x = p.ox; p.y = p.oy;
              p.vx = Math.cos(ang) * sp;
              p.vy = Math.sin(ang) * sp * 0.5 - 0.05;
              p.age = 0;
              p.life = LIFE_MIN + Math.random() * LIFE_VAR;
              lifeT = 0;
            }

            // fade in over first 15%, out over the rest
            var a = lifeT < 0.15 ? lifeT / 0.15 : 1 - (lifeT - 0.15) / 0.85;
            ctx.globalAlpha = st.hover * Math.max(0, a);
            ctx.fillRect(p.x, p.y, 1, 1);
          }
        }
      }

      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    }
    tick();
  }

  function start() {
    var anchor = document.querySelector('a.site-title');
    if (!anchor) return;
    var fontSize = parseFloat(getComputedStyle(anchor).fontSize);
    if (document.fonts && document.fonts.load) {
      document.fonts.load('400 ' + fontSize + 'px "EB Garamond"').then(init);
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
