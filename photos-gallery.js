/* ── 관측 사진 (갤러리 + 라이트박스) ───────────────────────────────
   데이터: photos.js (scripts/add-photos.py 가 생성)
   로컬 미리보기: ?photos=local → photos/processed/ 에서 읽음            */
(function () {
  'use strict';

  var P = window.PHOTOS;
  var root = document.getElementById('obsPhotos');
  if (!P || !root || !P.batches || !P.batches.length) { if (root) root.remove(); return; }

  var base = P.base;
  try { if (new URLSearchParams(location.search).get('photos') === 'local') base = 'photos/processed/'; } catch (e) {}

  var venue = (window.FORECAST && window.FORECAST.event.venue) || '';
  var batches = P.batches.slice();
  if (P.sort === 'desc') batches.reverse();

  var thumbUrl = function (b, it) { return base + b.id + '/' + it.f + '-t.avif'; };
  var fullUrl  = function (b, it) { return base + b.id + '/' + it.f + '.avif'; };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

  // 조도(lux) — 노출값에서 역산한 그 순간 그 자리의 밝기 (입사광 노출계 C=250 기준)
  function lux(it) {
    if (!it.fn || !it.ss || !it.iso) return null;
    var m = /^1\/(\d+)$/.exec(it.ss), t = m ? 1 / +m[1] : parseFloat(it.ss);
    if (!t) return null;
    var ev100 = Math.log2(it.fn * it.fn / t) - Math.log2(it.iso / 100);
    return 2.5 * Math.pow(2, ev100);
  }
  function fmtLux(v) { return v < 10 ? v.toFixed(1) : String(Math.round(v)); }

  function exposure(it) {
    var r = [];
    if (it.ss)  r.push(it.ss);
    if (it.fn)  r.push('ƒ' + it.fn);
    if (it.iso) r.push('ISO ' + it.iso);
    if (it.mm)  r.push(it.mm + 'mm');
    return r.join(' · ');
  }
  function readout(it) {
    var l = lux(it);
    return (l != null ? '조도 ' + fmtLux(l) + ' lx  ·  ' : '') + exposure(it);
  }
  function outdoor(b) {
    var w = b.wx;
    if (!w) return '';
    return '밖 ' + w.t + '°C · 습도 ' + w.rh + '% · ' + w.wd + ' ' + w.ws + 'm/s' + (w.sky ? ' · ' + w.sky : '') + ' (' + w.at + ')';
  }
  function indoor(b) {
    var ls = b.items.map(lux).filter(function (v) { return v != null; });
    if (!ls.length) return '';
    return '안 조도 ' + fmtLux(Math.min.apply(null, ls)) + '–' + fmtLux(Math.max.apply(null, ls)) + ' lx';
  }

  // 라이트박스 순회용 평면 목록 (회차를 넘나들며 이어짐)
  var flat = [];

  // ── 그리드 렌더 ──
  var html = '<div class="forecast-label">관측 사진 / 觀測寫眞</div>';
  batches.forEach(function (b) {
    html += '<section class="obs-batch">' +
      '<header class="obs-batch-head">' +
        '<span class="obs-batch-title">' + esc(b.label) + '</span>' +
        '<span class="obs-batch-meta">' + esc([b.date, venue].filter(Boolean).join(' · ')) +
          ' — ' + b.items.length + ' frames</span>' +
      '</header>' +
      '<div class="obs-climate">' +
        (b.wx ? '<span>' + esc(outdoor(b)) + '</span>' : '') +
        '<span>' + esc(indoor(b)) + '</span>' +
      '</div>' +
      '<div class="obs-stripes" aria-hidden="true">';
    b.items.forEach(function (it, i) {
      html += '<i data-k="' + (flat.length + i) + '" style="--c:' + (it.c || '#333') + '"></i>';
    });
    html += '</div><div class="obs-grid">';
    b.items.forEach(function (it, i) {
      var ar = (it.w && it.h) ? it.w / it.h : 1.5;
      var k = flat.length;
      flat.push({ b: b, it: it, n: i + 1, total: b.items.length });
      html += '<button type="button" class="obs-ph" data-k="' + k + '" style="--ar:' + ar.toFixed(4) + ';--c:' + (it.c || '#333') + '"' +
                ' aria-label="' + esc(b.label + ' ' + pad(i + 1)) + '">' +
                '<img loading="lazy" decoding="async" alt="" width="' + it.w + '" height="' + it.h + '" src="' + thumbUrl(b, it) + '" />' +
                '<span class="obs-ph-data"><span class="obs-ph-no">' + pad(i + 1) + '</span>' + esc(readout(it)) + '</span>' +
              '</button>';
    });
    html += '<i class="obs-fill" aria-hidden="true"></i></div></section>';
  });
  root.innerHTML = html;

  // 관측 띠 ↔ 사진 연동 (호버 강조, 띠 클릭 = 열기)
  function hl(k, on) {
    root.querySelectorAll('[data-k="' + k + '"]').forEach(function (el) { el.classList.toggle('hl', on); });
    var grid = root.querySelector('.obs-ph[data-k="' + k + '"]');
    if (grid) grid.parentNode.classList.toggle('dim', on);
  }
  root.querySelectorAll('[data-k]').forEach(function (el) {
    el.addEventListener('mouseenter', function () { hl(el.dataset.k, true); });
    el.addEventListener('mouseleave', function () { hl(el.dataset.k, false); });
  });
  root.querySelectorAll('.obs-stripes i').forEach(function (el) {
    el.addEventListener('click', function () { open(+el.dataset.k); });
  });

  root.querySelectorAll('.obs-ph img').forEach(function (img) {
    var done = function () { img.classList.add('in'); };
    if (img.complete && img.naturalWidth) done(); else img.addEventListener('load', done);
  });

  // ── 라이트박스 ──
  var lb = document.createElement('div');
  lb.className = 'obs-lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', '관측 사진');
  lb.innerHTML =
    '<div class="obs-lb-top"><span class="obs-lb-label"></span></div>' +
    '<div class="obs-lb-stage">' +
      '<img class="obs-lb-thumb" alt="" />' +
      '<img class="obs-lb-full" alt="" />' +
      '<button type="button" class="obs-lb-nav prev" aria-label="이전"></button>' +
      '<button type="button" class="obs-lb-nav next" aria-label="다음"></button>' +
    '</div>' +
    '<div class="obs-lb-bottom"><span class="obs-lb-count"></span><span class="obs-lb-data"></span></div>' +
    '<button type="button" class="reel-overlay-close obs-lb-close">닫기</button>';
  document.body.appendChild(lb);

  var stage  = lb.querySelector('.obs-lb-stage');
  var imgT   = lb.querySelector('.obs-lb-thumb');
  var imgF   = lb.querySelector('.obs-lb-full');
  var elLab  = lb.querySelector('.obs-lb-label');
  var elCnt  = lb.querySelector('.obs-lb-count');
  var elData = lb.querySelector('.obs-lb-data');
  var cur = -1, savedOverflow = '', lastFocus = null;
  var preload = {};

  function warm(k) {
    var e = flat[(k + flat.length) % flat.length];
    var u = fullUrl(e.b, e.it);
    if (preload[u]) return;
    preload[u] = new Image();
    preload[u].decoding = 'async';
    preload[u].src = u;
  }

  function show(k) {
    cur = (k + flat.length) % flat.length;
    var e = flat[cur];
    stage.style.setProperty('--ar', (e.it.w / e.it.h).toFixed(4));
    lb.style.setProperty('--c', e.it.c || '#333');
    imgF.classList.remove('in');
    imgF.removeAttribute('src');
    imgT.src = thumbUrl(e.b, e.it);                 // 썸네일 먼저 → 원본으로 교체
    var u = fullUrl(e.b, e.it);
    imgF.onload = function () { if (imgF.getAttribute('src') === u) imgF.classList.add('in'); };
    imgF.src = u;
    elLab.textContent = e.b.label + (e.b.date ? ' — ' + e.b.date : '') + (e.it.cap ? '  ·  ' + e.it.cap : '');
    elCnt.textContent = pad(e.n) + ' / ' + pad(e.total);
    var l = lux(e.it);
    elData.textContent = (l != null ? '조도 ' + fmtLux(l) + ' lx  ·  ' : '') + exposure(e.it);
    warm(cur + 1); warm(cur - 1);
    if (window.mkTrack) window.mkTrack('photo/' + e.b.id + '/' + e.it.f, '📷 ' + e.b.label + ' ' + pad(e.n));
  }

  function open(k) {
    lastFocus = document.activeElement;
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    lb.classList.add('open');
    show(k);
    lb.querySelector('.obs-lb-close').focus({ preventScroll: true });
  }
  function close() {
    if (!lb.classList.contains('open')) return;
    lb.classList.remove('open');
    document.body.style.overflow = savedOverflow;
    stage.style.transform = ''; lb.style.background = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function nav(dir) {
    stage.classList.add('swap');
    setTimeout(function () { show(cur + dir); stage.style.transform = ''; stage.classList.remove('swap'); }, 140);
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('.obs-ph');
    if (t) open(+t.dataset.k);
  });
  lb.querySelector('.obs-lb-close').addEventListener('click', close);
  lb.querySelector('.obs-lb-nav.prev').addEventListener('click', function () { nav(-1); });
  lb.querySelector('.obs-lb-nav.next').addEventListener('click', function () { nav(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target === stage) close(); });

  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape' || e.key === 'ArrowDown') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); nav(-1); }
  });

  // 트랙패드 가로 스와이프
  var wAcc = 0, wLock = false, wT = null;
  lb.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (wLock) return;
    wAcc += e.deltaX;
    clearTimeout(wT); wT = setTimeout(function () { wAcc = 0; }, 200);
    if (Math.abs(wAcc) > 90) {
      wLock = true; nav(wAcc > 0 ? 1 : -1); wAcc = 0;
      setTimeout(function () { wLock = false; }, 420);
    }
  }, { passive: false });

  // 터치: ←→ 이동 / ↓ 닫기 (두 손가락은 브라우저 확대에 맡김)
  var sx = 0, sy = 0, dx = 0, dy = 0, axis = null, drag = false;
  lb.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { drag = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = dy = 0; axis = null; drag = true;
    stage.style.transition = 'none';
  }, { passive: true });
  lb.addEventListener('touchmove', function (e) {
    if (!drag || e.touches.length !== 1) return;
    dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy;
    if (!axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    if (axis === 'y' && dy > 0) {
      e.preventDefault();
      stage.style.transform = 'translateY(' + dy + 'px)';
      lb.style.background = 'rgba(10,10,9,' + (0.97 * (1 - Math.min(dy / (innerHeight * 0.5), 1) * 0.9)).toFixed(3) + ')';
    } else if (axis === 'x') {
      e.preventDefault();
      stage.style.transform = 'translateX(' + dx * 0.4 + 'px)';
    }
  }, { passive: false });
  lb.addEventListener('touchend', function () {
    if (!drag) return;
    drag = false;
    stage.style.transition = '';
    if (axis === 'y' && dy > 100) close();
    else if (axis === 'x' && Math.abs(dx) > 60) nav(dx < 0 ? 1 : -1);
    else { stage.style.transform = ''; lb.style.background = ''; }
  });
})();
