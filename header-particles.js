(function () {
  'use strict';

  var SAMPLE_STEP = 2;     // sample every Nth glyph pixel (smaller = more, finer particles)
  var DOT         = 0.8;   // particle draw size (css px) — small
  var EASE        = 0.009; // desktop hover: dissolve / reform speed (very slow ~ 5s)
  var EASE_TOUCH  = 0.05;  // touch scrub: faster so a finger swipe is visibly responsive
  var INTRO_EASE   = 0.042; // assemble-on-load speed (mobile intro)
  var INTRO_STAGGER = 0;    // 0 = whole logo gathers at once (no per-char sweep)
  var SCATTER_X   = 24;    // horizontal dispersion (± px)
  var SCATTER_DN  = 30;    // downward drift on scatter (px)
  var SCATTER_UP  = 12;    // upward drift on scatter (px)
  var STAGGER     = 0.4;   // per-particle start spread (organic, non-uniform)

  function ss(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  function init() {
    var anchor = document.querySelector('a.site-title');
    if (!anchor) return;

    var cs         = getComputedStyle(anchor);
    var fontSize   = parseFloat(cs.fontSize);
    var fontStr    = (cs.fontWeight || '400') + ' ' + fontSize + 'px ' + cs.fontFamily;
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

    var canvasW = Math.ceil(anchorRect.width);
    var canvasH = Math.ceil(fontSize * 3.3); // room for scatter drift

    // ── Sample glyph pixels per character ─────────────────────────
    var sc    = document.createElement('canvas');
    sc.width  = canvasW;
    sc.height = canvasH;
    var sCtx  = sc.getContext('2d');
    sCtx.font      = fontStr;
    sCtx.fillStyle = '#fff';

    // Baseline placed so the text's optical centre sits at canvas centre,
    // which is itself centred on the anchor — matches the nav's optical centre.
    var fm      = sCtx.measureText(text);
    var ascent  = fm.actualBoundingBoxAscent  || fontSize * 0.8;
    var descent = fm.actualBoundingBoxDescent || fontSize * 0.2;
    var baseline = Math.round(canvasH / 2 + (ascent - descent) / 2);

    charPos.forEach(function (cp) { sCtx.fillText(cp.ch, cp.x, baseline); });
    var raw = sCtx.getImageData(0, 0, canvasW, canvasH).data;

    // ── Build per-character particle sets ─────────────────────────
    var charState = charPos.map(function (cp) {
      if (!cp.ch.trim()) return null;

      var parts = [];
      var x0 = Math.max(0, Math.floor(cp.x));
      var x1 = Math.min(canvasW, Math.ceil(cp.x + cp.w));
      var k  = 0;
      for (var py = 0; py < canvasH; py++) {
        for (var px = x0; px < x1; px++) {
          if (raw[(py * canvasW + px) * 4 + 3] > 40) {
            if (k++ % SAMPLE_STEP) continue; // thin out for performance
            var t0 = Math.random() * STAGGER;
            parts.push({
              ox: px, oy: py,
              sx: px + (Math.random() - 0.5) * 2 * SCATTER_X,
              sy: py + (Math.random() * (SCATTER_DN + SCATTER_UP) - SCATTER_UP),
              t0: t0, span: 1 - t0
            });
          }
        }
      }
      if (!parts.length) return null;
      return { parts: parts, hover: 0 };
    });

    // ── Render canvas ─────────────────────────────────────────────
    var dpr = window.devicePixelRatio || 1;
    var rc  = document.createElement('canvas');
    rc.width  = canvasW * dpr;
    rc.height = canvasH * dpr;
    rc.style.cssText =
      'position:absolute;left:0;top:50%;transform:translateY(-50%);' +
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
    // Touch devices scrub faster so a finger swipe reads as responsive;
    // desktop hover keeps the slow, calm dissolve.
    var coarse = !!(window.matchMedia &&
      window.matchMedia('(hover: none), (pointer: coarse)').matches);
    var ease = coarse ? EASE_TOUCH : EASE;

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

    // ── Intro (mobile): logo assembles from scattered particles on load ──
    // No hover on touch, so play a one-time left-to-right "gather" sweep.
    var intro = coarse;
    var frame = 0, maxHold = 0;
    if (intro) {
      var order = 0;
      for (var ii = 0; ii < charState.length; ii++) {
        var s = charState[ii];
        if (!s) continue;
        s.hover = 1;                       // start fully scattered / invisible
        s.hold  = order * INTRO_STAGGER;   // staggered assemble start
        maxHold = s.hold;
        order++;
      }
    }

    // ── Animation loop ────────────────────────────────────────────
    function tick() {
      ctx.clearRect(0, 0, canvasW, canvasH);

      if (intro) {
        frame++;
        if (frame > maxHold + 90) intro = false; // sweep finished → normal mode
      }

      for (var ci = 0; ci < charPos.length; ci++) {
        var st = charState[ci];
        if (!st) continue;
        var cp = charPos[ci];

        // ease char dissolve amount toward target (0 = text, 1 = scattered/gone)
        var target = (ci === hovered) ? 1 : 0;
        if (intro && frame < st.hold) {
          st.hover = 1;                    // hold scattered until this char's turn
        } else {
          var r = intro ? INTRO_EASE : ease;
          st.hover += (target - st.hover) * r;
        }
        if (st.hover < 0.001) st.hover = 0;
        else if (st.hover > 0.999) st.hover = 1;
        var p = st.hover;

        // crisp glyph — fully visible until ~0.3, gone by ~0.45
        var ta = 1 - ss((p - 0.05) / 0.4);
        if (ta > 0.002) {
          ctx.globalAlpha = ta;
          ctx.fillStyle   = color;
          ctx.fillText(cp.ch, cp.x, baseline);
        }

        // particles — visible only mid-transition; absent at p=0 and p=1
        if (p > 0.001 && p < 1) {
          ctx.fillStyle = color;
          for (var i = 0; i < st.parts.length; i++) {
            var q  = st.parts[i];
            var pp = ss((p - q.t0) / q.span);         // staggered per-particle progress
            if (pp <= 0) continue;
            var x  = q.ox + (q.sx - q.ox) * pp;
            var y  = q.oy + (q.sy - q.oy) * pp;
            // alpha: rise as it detaches, fade out as it fully scatters
            var a  = pp < 0.45 ? pp / 0.45 : 1 - (pp - 0.45) / 0.55;
            ctx.globalAlpha = a < 0 ? 0 : a;
            ctx.fillRect(x, y, DOT, DOT);
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
