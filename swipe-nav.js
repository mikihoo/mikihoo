/* ── 모바일: 좌우 스와이프로 탭(카테고리) 이동 ──
   ← 밀기 = 다음 탭, → 밀기 = 이전 탭 (상단 nav 순서 그대로, 양 끝은 반대편으로 순환)
   다음 경우엔 동작하지 않아 기존 스와이프가 그대로 유지됩니다.
     - 모달/라이트박스/릴스 오버레이가 열려 있을 때
     - 가로 스크롤 영역(릴스 줄, 사진 미리보기 줄 등), 캔버스, 슬라이더, 입력창에서 시작한 터치
     - 화면 가장자리(iOS 뒤로가기 제스처 영역)에서 시작한 터치                      */
(function () {
  'use strict';

  var MIN_DX    = 70;   // 최소 가로 이동(px)
  var RATIO     = 1.8;  // 가로가 세로보다 이만큼 커야 스와이프로 인정
  var MAX_MS    = 700;  // 이보다 느린 드래그는 무시
  var EDGE      = 24;   // 가장자리 제외 영역(px)

  var mq = window.matchMedia('(max-width: 768px), (pointer: coarse)');

  function modalOpen() {
    var b = document.body;
    if (b.style.overflow === 'hidden' || b.style.position === 'fixed') return true;
    return !!document.querySelector(
      '#postModal.open, #reelOverlay.open, .obs-lb.open, #artistModal.open, [aria-modal="true"].open'
    );
  }

  function blockedTarget(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.nodeType !== 1) continue;
      var tag = el.tagName;
      if (tag === 'CANVAS' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
          tag === 'VIDEO' || el.isContentEditable) return true;
      if (el.classList.contains('site-title')) return true;   // 로고 파티클 터치
      if (el.scrollWidth > el.clientWidth + 1) {
        var ox = getComputedStyle(el).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
    }
    return false;
  }

  function tabs() {
    var nav = document.querySelector('.site-nav');
    return nav ? Array.prototype.slice.call(nav.querySelectorAll('a[href]')) : [];
  }

  function currentIndex(list) {
    for (var i = 0; i < list.length; i++) if (list[i].classList.contains('active')) return i;
    var file = location.pathname.split('/').pop() || 'index.html';
    for (var j = 0; j < list.length; j++) {
      if ((list[j].getAttribute('href') || '').split(/[?#]/)[0] === file) return j;
    }
    return -1;
  }

  var sx = 0, sy = 0, t0 = 0, armed = false, going = false;

  document.addEventListener('touchstart', function (e) {
    armed = false;
    if (going || !mq.matches || e.touches.length !== 1) return;
    var t = e.touches[0];
    if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
    if (modalOpen() || blockedTarget(e.target)) return;
    sx = t.clientX; sy = t.clientY; t0 = Date.now(); armed = true;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (armed && e.touches.length !== 1) armed = false;   // 핀치 확대 등
  }, { passive: true });

  document.addEventListener('touchcancel', function () { armed = false; }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!armed) return;
    armed = false;
    if (modalOpen()) return;                               // 터치 중에 모달이 열린 경우
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - t0 > MAX_MS) return;
    if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * RATIO) return;
    var sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length) return;                 // 텍스트 선택 중

    var list = tabs(), cur = currentIndex(list);
    if (cur < 0) return;
    var n = list.length;
    if (n < 2) return;
    var next = list[(cur + (dx < 0 ? 1 : -1) + n) % n];   // 양 끝에서 반대편으로 순환

    going = true;
    document.body.classList.add('swipe-leaving', dx < 0 ? 'swipe-to-next' : 'swipe-to-prev');
    setTimeout(function () { location.href = next.href; }, 160);
  }, { passive: true });

  // 뒤로가기(bfcache)로 돌아왔을 때 상태 복원
  window.addEventListener('pageshow', function () {
    going = false;
    document.body.classList.remove('swipe-leaving', 'swipe-to-next', 'swipe-to-prev');
  });
})();
