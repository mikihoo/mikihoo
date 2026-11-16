/* ── 관측 사진 ─────────────────────────────────────────────────────
   데이터: photos.js (scripts/add-photos.py 가 생성)
   · 관측 페이지  #obsPhotos            태그별 섹션(영상 + 관측 띠 + 사진) · 태그 필터 · 라이트박스
   · 미기후 페이지 #obsPreview[data-tag] 관측 띠 + 미리보기 줄 → 관측 페이지로 연결
   주소: observe.html?tag=<태그id>&who=<사람>&p=<사진 f>  (태그 필터 / 사람 필터 / 사진 바로 열기)
   사람 필터: 태그에 people 이 있으면 사진 위에 사람별 칩 (사이 = 사람 아닌 사진)
   로컬 미리보기: ?photos=local → photos/processed/ 에서 읽음                          */
(function () {
  'use strict';

  var P = window.PHOTOS;
  var full = document.getElementById('obsPhotos');
  var preview = document.getElementById('obsPreview');
  if (!P || !P.tags || !P.tags.length) {
    if (preview) preview.remove();
    if (full) full.innerHTML = '<p class="obs-empty">아직 관측된 것이 없습니다.</p>';
    return;
  }

  var qs; try { qs = new URLSearchParams(location.search); } catch (e) { qs = { get: function () { return null; } }; }
  var local = qs.get('photos') === 'local';
  var base = local ? 'photos/processed/' : P.base;
  var keep = local ? '&photos=local' : '';     // 로컬 미리보기 중엔 링크에도 유지

  var thumbUrl = function (t, it) { return base + t.id + '/' + it.f + '-t.avif'; };
  var fullUrl  = function (t, it) { return base + t.id + '/' + it.f + '.avif'; };
  var observeUrl = function (t, it) {
    return 'observe.html?tag=' + encodeURIComponent(t.id) + (it ? '&p=' + encodeURIComponent(it.f) : '') + keep;
  };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

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
  function dayLine(d) {
    var s = d.date + (d.venue ? ' · ' + d.venue : '');
    var w = d.wx;
    if (w) s += ' — 바깥 ' + w.t + '°C' + (w.sky ? ' · ' + w.sky : '') + ' · 습도 ' + w.rh + '% · ' + w.wd + ' ' + w.ws + 'm/s (' + w.at + ')';
    return s;
  }
  function luxLine(items) {
    var ls = items.map(lux).filter(function (v) { return v != null; });
    if (!ls.length) return '';
    return '조도 — 가장 어두운 곳 ' + fmtLux(Math.min.apply(null, ls)) + ' lx · 가장 밝은 곳 ' + fmtLux(Math.max.apply(null, ls)) + ' lx';
  }
  function stripes(t, keyOf) {
    return '<div class="obs-stripes" aria-hidden="true">' + t.items.map(function (it, i) {
      return '<i data-k="' + keyOf(i) + '"' + (it.who ? ' data-who="' + esc(it.who) + '"' : '') + ' style="--c:' + (it.c || '#333') + '"></i>';
    }).join('') + '</div>';
  }
  function fog(scope) {
    scope.querySelectorAll('img.obs-fog').forEach(function (img) {
      var done = function () { img.classList.add('in'); };
      if (img.complete && img.naturalWidth) done(); else img.addEventListener('load', done);
    });
  }
  function hlBind(scope) {
    function hl(k, on) {
      scope.querySelectorAll('[data-k="' + k + '"]').forEach(function (el) { el.classList.toggle('hl', on); });
      var ph = scope.querySelector('.obs-ph[data-k="' + k + '"]');
      if (ph) ph.parentNode.classList.toggle('dim', on);
    }
    scope.querySelectorAll('[data-k]').forEach(function (el) {
      el.addEventListener('mouseenter', function () { hl(el.dataset.k, true); });
      el.addEventListener('mouseleave', function () { hl(el.dataset.k, false); });
    });
  }

  /* ── 미기후 페이지: 미리보기 ───────────────────────────────── */
  if (preview) {
    var pt = P.tags.filter(function (t) { return t.id === preview.dataset.tag; })[0];
    if (!pt || !pt.items.length) { preview.remove(); }
    else {
      var N = 8;
      var html = '<div class="forecast-label">관측 사진 / 觀測寫眞</div>' +
        stripes(pt, function (i) { return i; }) +
        '<div class="obs-pv-row">';
      // 사람이 나뉜 태그면 사람마다 고르게 (공연 순서대로 돌아가며)
      var pick = pt.items.slice(0, N);
      if (pt.people && pt.people.length) {
        var by = {}; pt.items.forEach(function (it) { (by[it.who] = by[it.who] || []).push(it); });
        var ppl = pt.people.filter(function (w) { return w !== '사이' && by[w]; });
        pick = [];
        for (var r = 0; pick.length < N && r < pt.items.length; r++) {
          ppl.forEach(function (w) {
            var L = by[w], it = L[Math.floor((r + 0.5) * L.length / Math.ceil(N / ppl.length)) ];
            if (pick.length < N && it && pick.indexOf(it) < 0) pick.push(it);
          });
          if (r >= Math.ceil(N / ppl.length)) break;
        }
      }
      pick.forEach(function (it) {
        var i = pt.items.indexOf(it);
        html += '<a class="obs-ph obs-pv" data-k="' + i + '" href="' + observeUrl(pt, it) + '" style="--ar:' + (it.w / it.h).toFixed(4) + ';--c:' + (it.c || '#333') + '">' +
                  '<img class="obs-fog" loading="lazy" decoding="async" alt="" src="' + thumbUrl(pt, it) + '" /></a>';
      });
      html += '</div><a class="obs-link" href="' + observeUrl(pt) + '">관측 사진 ' + pt.items.length + '장 · 영상 모두 보기 →</a>';
      preview.innerHTML = html;
      preview.querySelectorAll('.obs-stripes i').forEach(function (el) {
        el.addEventListener('click', function () { location.href = observeUrl(pt, pt.items[+el.dataset.k]); });
      });
      fog(preview); hlBind(preview);
    }
  }

  if (!full) return;

  /* ── 관측 페이지: 태그별 섹션 ─────────────────────────────── */
  function whoChips(t) {
    if (!t.people || !t.people.length) return '';
    var n = {};
    t.items.forEach(function (it) { if (it.who) n[it.who] = (n[it.who] || 0) + 1; });
    return '<div class="obs-who" role="group" aria-label="사람">' +
      '<button type="button" data-who="">모두</button>' +
      t.people.filter(function (w) { return n[w]; }).map(function (w) {
        return '<button type="button" data-who="' + esc(w) + '">' + esc(w) + '<sup>' + n[w] + '</sup></button>';
      }).join('') + '</div>';
  }
  var flat = [];             // 라이트박스 순회용 (보이는 태그만)
  var html2 = '';
  P.tags.forEach(function (t) {
    var start = flat.length;
    t.items.forEach(function (it, i) { flat.push({ t: t, it: it, n: i + 1, total: t.items.length }); });
    html2 += '<section class="obs-tag" data-tag="' + esc(t.id) + '">' +
      '<header class="obs-batch-head">' +
        '<span class="obs-batch-title">' + esc(t.label) + '</span>' +
        (t.href ? '<a class="obs-link" href="' + esc(t.href) + '">' + esc(t.label.replace(/^\d{4}\s*/, '')) + ' 페이지 →</a>' : '') +
      '</header>' +
      '<div class="obs-climate">' +
        (t.days || []).map(function (d) {
          var dayItems = t.items.filter(function (it) { return it.d === d.date; });
          return '<span>' + esc(dayLine(d)) + '</span><span>' + esc(luxLine(dayItems.length ? dayItems : t.items)) + '</span>';
        }).join('') +
      '</div>' +
      '<div class="obs-sub" data-reels-wrap><div class="obs-sub-label">영상</div>' +
        '<div class="reel-strip" data-reels="' + esc(t.id) + '"></div></div>' +
      '<div class="obs-sub"><div class="obs-sub-label">사진 — <span class="obs-count">' + t.items.length + '</span></div>' +
        whoChips(t) +
        stripes(t, function (i) { return start + i; }) +
        '<div class="obs-grid">';
    t.items.forEach(function (it, i) {
      var ar = (it.w && it.h) ? it.w / it.h : 1.5;
      html2 += '<button type="button" class="obs-ph" data-k="' + (start + i) + '"' + (it.who ? ' data-who="' + esc(it.who) + '"' : '') + ' style="--ar:' + ar.toFixed(4) + ';--c:' + (it.c || '#333') + '"' +
                ' aria-label="' + esc(t.label + ' ' + pad(i + 1)) + '">' +
                '<img class="obs-fog" loading="lazy" decoding="async" alt="" width="' + it.w + '" height="' + it.h + '" src="' + thumbUrl(t, it) + '" />' +
                '<span class="obs-ph-data"><span class="obs-ph-no">' + pad(i + 1) + '</span>' + esc(readout(it)) + '</span>' +
              '</button>';
    });
    html2 += '<i class="obs-fill" aria-hidden="true"></i></div></div></section>';
  });
  full.innerHTML = html2;
  fog(full); hlBind(full);

  // ── 태그 필터 ──
  var chipsEl = document.getElementById('obsTags');
  var activeTag = qs.get('tag');
  if (!P.tags.some(function (t) { return t.id === activeTag; })) activeTag = '';
  function applyTag(id, push) {
    activeTag = id;
    full.querySelectorAll('.obs-tag').forEach(function (s) { s.hidden = !!id && s.dataset.tag !== id; });
    if (chipsEl) chipsEl.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.dataset.tag === id); });
    if (push) {
      syncUrl();
    }
  }
  if (chipsEl) {
    chipsEl.innerHTML = '<button type="button" data-tag="">전체</button>' + P.tags.map(function (t) {
      return '<button type="button" data-tag="' + esc(t.id) + '">' + esc(t.label) + '</button>';
    }).join('');
    chipsEl.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) applyTag(b.dataset.tag, true);
    });
  }
  applyTag(activeTag, false);

  // ── 사람 필터 (태그마다 따로) ──
  var whoBy = {};
  function syncUrl() {
    var w = activeTag && whoBy[activeTag];
    var u = 'observe.html' + (activeTag ? '?tag=' + encodeURIComponent(activeTag) + (w ? '&who=' + encodeURIComponent(w) : '') + keep
                                        : (local ? '?photos=local' : ''));
    history.replaceState(null, '', u);
  }
  function applyWho(sec, w, push) {
    var id = sec.dataset.tag, n = 0;
    whoBy[id] = w;
    sec.querySelectorAll('.obs-ph, .obs-stripes i').forEach(function (el) {
      el.hidden = !!w && el.dataset.who !== w;
      if (!el.hidden && el.classList.contains('obs-ph')) n++;
    });
    sec.querySelectorAll('.obs-who button').forEach(function (b) { b.classList.toggle('active', b.dataset.who === w); });
    var c = sec.querySelector('.obs-count'); if (c) c.textContent = n;
    if (push) syncUrl();
  }
  var qWho = qs.get('who') || '';
  full.querySelectorAll('.obs-tag').forEach(function (sec) {
    var bar = sec.querySelector('.obs-who');
    if (!bar) return;
    var ok = qWho && sec.dataset.tag === activeTag && bar.querySelector('button[data-who="' + qWho.replace(/"/g, '') + '"]');
    applyWho(sec, ok ? qWho : '', false);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) applyWho(sec, b.dataset.who, true);
    });
  });

  // ── 라이트박스 ──
  var lb = document.createElement('div');
  lb.className = 'obs-lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', '관측 사진');
  lb.innerHTML =
    '<div class="obs-lb-top"><span class="obs-lb-label"></span><a class="obs-lb-link"></a></div>' +
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
  var elLink = lb.querySelector('.obs-lb-link');
  var elCnt  = lb.querySelector('.obs-lb-count');
  var elData = lb.querySelector('.obs-lb-data');
  var cur = -1, savedOverflow = '', lastFocus = null;
  var preload = {};

  // 보이는(필터된) 사진들 안에서만 순회
  function visibleKeys() {
    var ks = [];
    flat.forEach(function (e, k) {
      if ((!activeTag || e.t.id === activeTag) && (!whoBy[e.t.id] || e.it.who === whoBy[e.t.id])) ks.push(k);
    });
    return ks;
  }
  function step(k, dir) {
    var ks = visibleKeys(), i = ks.indexOf(k);
    return ks[(i + dir + ks.length) % ks.length];
  }
  function warm(k) {
    var e = flat[k];
    var u = fullUrl(e.t, e.it);
    if (preload[u]) return;
    preload[u] = new Image();
    preload[u].decoding = 'async';
    preload[u].src = u;
  }

  function show(k) {
    cur = k;
    var e = flat[cur];
    var day = (e.t.days || []).filter(function (d) { return d.date === e.it.d; })[0];
    stage.style.setProperty('--ar', (e.it.w / e.it.h).toFixed(4));
    lb.style.setProperty('--c', e.it.c || '#333');
    imgF.classList.remove('in');
    imgF.removeAttribute('src');
    imgT.src = thumbUrl(e.t, e.it);                 // 안개(흐린 썸네일) 먼저 → 원본으로 걷힘
    var u = fullUrl(e.t, e.it);
    imgF.onload = function () { if (imgF.getAttribute('src') === u) imgF.classList.add('in'); };
    imgF.src = u;
    elLab.textContent = e.t.label + (e.it.who && e.it.who !== '사이' ? ' — ' + e.it.who : '') + (e.it.d ? ' — ' + e.it.d : '') + (day && day.venue ? ' · ' + day.venue : '') + (e.it.cap ? '  ·  ' + e.it.cap : '');
    if (e.t.href) { elLink.href = e.t.href; elLink.textContent = e.t.label.replace(/^\d{4}\s*/, '') + ' 페이지 →'; elLink.hidden = false; }
    else elLink.hidden = true;
    var vis = visibleKeys().filter(function (k) { return flat[k].t === e.t; });
    elCnt.textContent = pad(vis.indexOf(cur) + 1) + ' / ' + pad(vis.length);
    elData.textContent = readout(e.it);
    warm(step(cur, 1)); warm(step(cur, -1));
    if (window.mkTrack) window.mkTrack('photo/' + e.t.id + '/' + e.it.f, '📷 ' + e.t.label + ' ' + pad(e.n));
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
    setTimeout(function () { show(step(cur, dir)); stage.style.transform = ''; stage.classList.remove('swap'); }, 140);
  }

  full.addEventListener('click', function (e) {
    var t = e.target.closest('.obs-ph, .obs-stripes i');
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

  // ── 주소로 사진 바로 열기 (?p=) — 미기후 페이지 미리보기에서 넘어올 때 ──
  var pf = qs.get('p');
  if (pf) {
    var k = -1;
    var vk = visibleKeys();
    flat.forEach(function (e, i) { if (k < 0 && e.it.f === pf && vk.indexOf(i) >= 0) k = i; });
    if (k >= 0) {
      var ph = full.querySelector('.obs-ph[data-k="' + k + '"]');
      if (ph) ph.scrollIntoView({ block: 'center' });
      open(k);
    }
  }
})();
