/* ── 예보(공연) 설정 — 탭 이름/위치, 공연 정보, 라인업을 한 곳에서 관리 ──
   공연 후 "관측"으로 바꾸려면 아래 nav.label / nav.position 만 수정하면 됩니다.
   (예: label:'관측', position: 99 → 맨 뒤로)                                  */
(function () {
  'use strict';

  var FC = {
    nav:  { label: '예보', position: 0 },          // position 0 = 맨 앞 / 99 = 맨 뒤
    href: 'forecast.html',

    event: {
      dateLabel: '2026.11.14 (토) 18:00',          // 예보 페이지 메타
      barDate:   '11.14 (토) 18:00',               // 상단 날씨 바
      cardDate:  '11.14',                           // 채집자 카드 공연시간 앞 날짜
      venue:     '무대륙',
      y: 2026, mo: 11, d: 14,                       // D-day 계산 기준 (KST, mo는 1-based)
    },

    poster: 'forecast-poster.avif',
    entry:  { time: '17:50', label: '입장' },

    // 출연 순서 = 표시 순서. icon은 채음 아이콘 세트 코드(임시) — 나중에 교체 쉬움
    lineup: [
      { name: 'saeglopur', time: '18:00 — 18:30', start: '18:00', img: 'forecast-saeglopur.avif', icon: '01d' },
      { name: 'suheeson',  time: '18:40 — 19:15', start: '18:40', img: 'forecast-suheeson.avif',  icon: '10d' },
      { name: 'donizanai', time: '19:25 — 20:05', start: '19:25', img: 'forecast-donizanai.avif', icon: '04d' },
      { name: 'eeajik',    time: '20:10 — 20:50', start: '20:10', img: 'forecast-eeajik.avif',    icon: '13d' },
    ],
  };

  // ── D-day (KST 기준 달력일 차이) ──
  FC.dday = function () {
    var now = new Date();
    var utc = now.getTime() + now.getTimezoneOffset() * 60000;
    var kst = new Date(utc + 9 * 3600000);
    var today = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
    var ev = Date.UTC(FC.event.y, FC.event.mo - 1, FC.event.d);
    var diff = Math.round((ev - today) / 86400000);
    if (diff > 0)  return { phase: 'before', label: 'D-' + diff, days: diff };
    if (diff === 0) return { phase: 'dday', label: 'D-DAY', days: 0 };
    return { phase: 'after', label: '', days: diff };
  };
  FC.active = function () { return FC.dday().phase !== 'after'; };

  // 채집자 카드 공연시간 한 줄 (예: "11.14 — 18:40"), 공연 다음 날부터 null
  FC.showtimeFor = function (name) {
    if (!FC.active()) return null;
    for (var i = 0; i < FC.lineup.length; i++) {
      if (FC.lineup[i].name === name) return FC.event.cardDate + ' — ' + FC.lineup[i].start;
    }
    return null;
  };

  window.FORECAST = FC;

  // ── 네비게이션에 탭 1개만 삽입 (기존 탭은 건드리지 않음) ──
  function injectNav() {
    var onForecast = /forecast\.html$/.test(location.pathname);
    document.querySelectorAll('.site-nav').forEach(function (nav) {
      if (nav.querySelector('[data-forecast-nav]')) return;
      var a = document.createElement('a');
      a.href = FC.href;
      a.textContent = FC.nav.label;
      a.setAttribute('data-forecast-nav', '');
      if (onForecast) a.classList.add('active');
      var kids = Array.prototype.slice.call(nav.children);
      var pos = Math.max(0, Math.min(FC.nav.position, kids.length));
      if (pos >= kids.length) nav.appendChild(a);
      else nav.insertBefore(a, kids[pos]);
    });
  }

  // ── 상단 날씨 바에 예보 한 줄 덧붙이기 (렌더될 때마다 유지) ──
  function barHTML() {
    var d = FC.dday();
    if (d.phase === 'after') return '';
    return '<a class="wb-forecast" href="' + FC.href + '">⁄ 예보 — ' +
           FC.event.barDate + ', ' + FC.event.venue + ' · ' + d.label + '</a>';
  }
  function mountBar(bar) {
    if (!FC.active()) return;
    var apply = function () {
      if (bar.querySelector('.wb-forecast')) return;  // 이미 있음
      if (!bar.querySelector('span')) return;          // 날씨가 아직 안 그려짐
      bar.insertAdjacentHTML('beforeend', barHTML());
    };
    new MutationObserver(apply).observe(bar, { childList: true });
    apply();
    // 날씨 로드 실패 대비: 5초 후에도 없으면 예보만이라도 표시
    setTimeout(function () {
      if (!bar.querySelector('.wb-forecast')) {
        bar.insertAdjacentHTML('beforeend', barHTML());
        bar.classList.add('visible');
      }
    }, 5000);
  }

  function init() {
    injectNav();
    document.querySelectorAll('.weather-bar').forEach(mountBar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
