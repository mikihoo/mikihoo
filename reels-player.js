/* ── 관측 기록 (영상) — 스트립 + 오버레이 플레이어 ─────────────────────
   데이터: reels.js
   페이지에 <div class="reel-strip" data-reels="<태그id>"></div> 를 두면 그 태그 영상만,
   data-reels="" 면 전체를 그립니다. 미기후 페이지 · 관측 페이지 공용.             */
(function () {
  var R = window.REELS;
  if (!R) return;

  var base = R.base;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  var url1080 = function (n) { return base + 'reel-' + n + '-1080.mp4'; };
  var url540  = function (n) { return base + 'reel-' + n + '-540.mp4'; };
  var urlThmb = function (n) { return base + 'reel-' + n + '.avif'; };

  function listFor(tag) {
    return R.items
      .filter(function (it) { return !tag || (it.tag || R.tag) === tag; })
      .sort(function (a, b) { return R.sort === 'desc' ? b.order - a.order : a.order - b.order; });
  }
  window.reelsFor = listFor;

  // ── 오버레이 (페이지에 없으면 만든다) ──
  var overlay = document.getElementById('reelOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'reel-overlay';
    overlay.id = 'reelOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '영상 재생');
    overlay.innerHTML = '<video class="reel-overlay-video" id="reelBig" playsinline controls preload="auto"></video>' +
                        '<button class="reel-overlay-close" id="reelClose" type="button">닫기</button>';
    document.body.appendChild(overlay);
  }
  var big      = document.getElementById('reelBig');
  var closeBtn = document.getElementById('reelClose');

  var allVids = [];
  var overlayOpen = false;
  var items = [];          // 오버레이가 순회하는 목록 (누른 스트립 기준)
  var curIndex = 0;
  var savedOverflow = '';
  var prefetchName = '';

  if (coarse) big.removeAttribute('controls');     // 모바일은 제스처로 제어

  // ── 보이는 카드만 재생 ──
  var io = (!reduce && 'IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting && e.intersectionRatio > 0.5) {
        if (!overlayOpen) { if (v.preload === 'none') v.preload = 'auto'; v.play().catch(function () {}); }
      } else {
        v.pause();
      }
    });
  }, { threshold: [0, 0.5, 1] }) : null;

  function mount(strip, list) {
    if (!list.length) { strip.closest('[data-reels-wrap]') && strip.closest('[data-reels-wrap]').remove(); return; }
    list.forEach(function (it) {
      var card = document.createElement('figure');
      card.className = 'reel-card';

      var frame = document.createElement('div');
      frame.className = 'reel-frame';

      var v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.preload = 'none';
      v.poster = urlThmb(it.name);
      if (!reduce) {                 // 모션 최소화면 썸네일만, 자동재생 안 함
        var s = document.createElement('source');
        s.src = url540(it.name); s.type = 'video/mp4';
        v.appendChild(s);
      }
      frame.appendChild(v);

      var cap = document.createElement('figcaption');
      cap.className = 'reel-cap';
      cap.textContent = it.caption;

      card.appendChild(frame);
      card.appendChild(cap);
      card.addEventListener('click', function () { openOverlay(list, it); });
      strip.appendChild(card);
      allVids.push(v);
      if (io) io.observe(v);
    });

    // 모바일: 가운데 보이는 카드의 1080을 미리 버퍼링 → 탭하면 바로 재생
    if (coarse) {
      var pfT;
      var pf = function () { doPrefetch(strip, list); };
      strip.addEventListener('scroll', function () { clearTimeout(pfT); pfT = setTimeout(pf, 300); }, { passive: true });
      setTimeout(pf, 900);
      strip._prefetch = pf;
    }
  }

  function pfCentered(strip, list) {
    var sc = strip.getBoundingClientRect(), cx = sc.left + sc.width / 2, best = -1, bd = 1e9;
    if (sc.bottom < 0 || sc.top > window.innerHeight) return null;   // 화면 밖 스트립은 건너뜀
    strip.querySelectorAll('.reel-card').forEach(function (c, i) {
      var r = c.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - cx);
      if (d < bd) { bd = d; best = i; }
    });
    return best >= 0 ? list[best] : null;
  }
  function doPrefetch(strip, list) {
    if (!coarse || overlayOpen) return;
    var it = pfCentered(strip, list);
    if (!it || prefetchName === it.name) return;
    prefetchName = it.name;
    big.muted = true;
    big.poster = urlThmb(it.name);
    big.preload = 'auto';
    big.src = url1080(it.name);                     // 재생은 안 함 — 버퍼링만
  }

  function trackReel(it) {
    if (window.mkTrack) window.mkTrack('reel/' + it.name, '🎬 ' + (it.caption || it.name));
  }

  function loadIndex(i) {
    curIndex = (i + items.length) % items.length;  // 무한 루프
    var name = items[curIndex].name;
    big.poster = urlThmb(name);                    // 로딩 중 썸네일 표시
    big.src = url1080(name);                       // 1080 (모바일도 동일 화질)
    big.muted = false;
    big.play().catch(function () {});
    trackReel(items[curIndex]);
  }

  function openOverlay(list, it) {
    items = list;
    overlayOpen = true;
    allVids.forEach(function (v) { v.pause(); });  // 스트립 미리보기 일시정지
    overlay.classList.add('open');
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    big.style.transition = ''; big.style.transform = ''; big.style.opacity = '';
    overlay.style.background = '';
    var i = items.indexOf(it);
    if (coarse && prefetchName === it.name && big.getAttribute('src')) {
      curIndex = i;                                // 이미 프리페치됨 → 버퍼에서 바로 재생
      big.muted = false;
      big.play().catch(function () {});
      trackReel(it);
    } else {
      loadIndex(i);
    }
  }
  function closeOverlay() {
    if (!overlay.classList.contains('open')) return;
    overlay.classList.remove('open');
    overlayOpen = false;
    big.pause();
    big.removeAttribute('src');
    big.load();                                    // 메모리 해제
    big.style.transition = ''; big.style.transform = ''; big.style.opacity = '';
    overlay.style.background = '';
    document.body.style.overflow = savedOverflow;
    prefetchName = '';
    if (!reduce) allVids.forEach(function (v) {     // 보이는 미리보기 재개
      var r = v.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) v.play().catch(function () {});
    });
    if (coarse) setTimeout(function () {            // 다음 탭 대비 재프리페치
      document.querySelectorAll('.reel-strip').forEach(function (s) { if (s._prefetch) s._prefetch(); });
    }, 400);
  }

  // 좌우 이동 (무한 루프) — 짧은 페이드로 교체
  function nav(dir) {
    big.style.transition = 'opacity 0.16s ease';
    big.style.opacity = '0';
    setTimeout(function () {
      loadIndex(curIndex + dir);
      big.style.transform = '';
      requestAnimationFrame(function () { big.style.opacity = '1'; });
      setTimeout(function () { big.style.transition = ''; big.style.opacity = ''; }, 180);
    }, 150);
  }

  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
  closeBtn.addEventListener('click', closeOverlay);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOverlay(); });

  // ── 모바일 제스처: ↓닫기 / ←→이전·다음 / 탭=재생·일시정지 ──
  if (coarse) {
    var sx = 0, sy = 0, dx = 0, dy = 0, axis = null, dragging = false, moved = false, startT = null;
    var VH = function () { return window.innerHeight; };

    overlay.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { dragging = false; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      dx = dy = 0; axis = null; dragging = true; moved = false; startT = e.target;
      big.style.transition = 'none';
    }, { passive: true });

    overlay.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      if (!axis && moved) axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
      if (axis === 'y' && dy > 0) {                 // 아래로 → 닫기 피드백
        e.preventDefault();
        big.style.transform = 'translateY(' + dy + 'px)';
        var t = Math.min(dy / (VH() * 0.5), 1);
        overlay.style.background = 'rgba(10,10,9,' + (0.94 * (1 - t * 0.9)).toFixed(3) + ')';
      } else if (axis === 'x') {                     // 좌우 → 이동 피드백(저항)
        e.preventDefault();
        big.style.transform = 'translateX(' + (dx * 0.35) + 'px)';
      }
    }, { passive: false });

    overlay.addEventListener('touchend', function () {
      if (!dragging) return;
      dragging = false;
      big.style.transition = 'transform 0.25s ease, opacity 0.2s ease';
      if (axis === 'y' && dy > 100) {               // 닫기
        closeOverlay();
      } else if (axis === 'x' && Math.abs(dx) > 70) { // 좌=다음 / 우=이전
        overlay.style.background = '';
        nav(dx < 0 ? 1 : -1);
      } else if (!moved && startT === big) {         // 탭 → 재생/일시정지
        big.style.transform = '';
        if (big.paused) big.play().catch(function () {}); else big.pause();
      } else {                                        // 임계값 미달 → 원위치
        big.style.transform = '';
        overlay.style.background = '';
      }
    });
  }

  // ── 데스크탑: 키보드 ←/→ 이전·다음(무한 루프), ↓ 닫기 / 트랙패드 좌우 스와이프 ──
  if (!coarse) {
    document.addEventListener('keydown', function (e) {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'ArrowRight')      { e.preventDefault(); nav(1); }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); nav(-1); }
      else if (e.key === 'ArrowDown')  { e.preventDefault(); closeOverlay(); }
    });

    var wAccum = 0, wLock = false, wTimer = null;
    overlay.addEventListener('wheel', function (e) {
      if (!overlay.classList.contains('open')) return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // 가로 스와이프만
      e.preventDefault();
      if (wLock) return;
      wAccum += e.deltaX;
      clearTimeout(wTimer); wTimer = setTimeout(function () { wAccum = 0; }, 200);
      if (Math.abs(wAccum) > 90) {
        wLock = true;
        nav(wAccum > 0 ? 1 : -1);                 // 왼쪽으로 스와이프 → 다음
        wAccum = 0;
        setTimeout(function () { wLock = false; }, 420);
      }
    }, { passive: false });
  }

  // ── 페이지의 스트립 자동 연결 ──
  document.querySelectorAll('.reel-strip[data-reels]').forEach(function (strip) {
    mount(strip, listFor(strip.getAttribute('data-reels')));
  });
})();
