(function () {
  'use strict';

  var FC = window.FORECAST;
  if (!FC) return;

  // ── 날씨 아이콘 (채음/날씨 탭과 동일 세트) ──
  function weatherIconSvg(code) {
    if (!code) return '';
    var base = code.slice(0, 2), night = code.endsWith('n');
    var o = function (p) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" class="weather-icon-svg">' + p + '</svg>';
    };
    switch (base) {
      case '01': return night
        ? o('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>')
        : o('<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>');
      case '02': return night
        ? o('<path d="M13 17H5a4 4 0 1 1 3.93-5h4.07a3 3 0 1 1 0 6z"/><path d="M22 9.5A3.5 3.5 0 0 1 18.5 13 3.5 3.5 0 0 0 22 6a3.5 3.5 0 0 1 0 3.5z"/>')
        : o('<path d="M13 17H5a4 4 0 1 1 3.93-5h4.07a3 3 0 1 1 0 6z"/><circle cx="19" cy="8" r="2.5"/><line x1="19" y1="4" x2="19" y2="5.5"/><line x1="22.5" y1="8" x2="21" y2="8"/><line x1="21.2" y1="5.8" x2="20.1" y2="6.9"/>');
      case '03': return o('<path d="M17 18H7a5 5 0 1 1 4.9-6H17a3 3 0 0 1 0 6z"/>');
      case '04': return o('<path d="M16 19H6a4 4 0 1 1 3.9-5H16a3 3 0 0 1 0 6z"/><path d="M19.5 14h-.8A3 3 0 1 0 14 18.5"/>');
      case '09': return o('<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><circle cx="8" cy="20.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="21.5" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="20.5" r="1" fill="currentColor" stroke="none"/>');
      case '10': return o('<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="19" x2="6.5" y2="23"/><line x1="12" y1="19" x2="10.5" y2="23"/><line x1="16" y1="19" x2="14.5" y2="23"/>');
      case '11': return o('<path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><polyline points="13 11 9 17 15 17 11 23"/>');
      case '13': return o('<line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"/><circle cx="12" cy="12" r="2"/>');
      case '50': return o('<line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/>');
      default:   return o('<circle cx="12" cy="12" r="5"/>');
    }
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── 타임표 렌더 ──
  var tt = document.getElementById('fcTimetable');
  if (tt) {
    var html = '';
    FC.lineup.forEach(function (p) {
      html += '<div class="track-item fc-slot" data-name="' + esc(p.name) + '">' +
                '<span class="track-icon">' + weatherIconSvg(p.icon) + '</span>' +
                '<span class="track-title">' + esc(p.time) + '</span>' +
                '<span class="track-artist">' + esc(p.name) + '</span>' +
              '</div>';
    });
    tt.innerHTML = html;
  }

  // ── 이미지 크로스페이드 ──
  var frame = document.getElementById('fcFrame');
  var poster = document.getElementById('fcPoster');
  if (frame && poster) {
    var byName = {};
    frame.querySelectorAll('.fc-img[data-name]').forEach(function (img) { byName[img.dataset.name] = img; });

    function showArtist(name) {
      var target = byName[name];
      if (!target) return;
      frame.querySelectorAll('.fc-img').forEach(function (i) { i.classList.remove('show'); });
      target.classList.add('show');
    }
    function showPoster() {
      frame.querySelectorAll('.fc-img').forEach(function (i) { i.classList.remove('show'); });
      poster.classList.add('show');
    }

    var rows = tt ? tt.querySelectorAll('.fc-slot') : [];
    var canHover = window.matchMedia('(hover: hover)').matches;

    if (canHover) {
      rows.forEach(function (row) {
        row.addEventListener('mouseenter', function () { showArtist(row.dataset.name); });
      });
      tt.addEventListener('mouseleave', showPoster);
    } else {
      // 모바일: 이미지가 위, 타임표는 아래라 행 탭은 효과를 보기 어렵다.
      // → 이미지를 탭하면 포스터 → 출연자들 → 포스터 순으로 순환.
      var cycle = ['__poster__'].concat(FC.lineup.map(function (p) { return p.name; }));
      var idx = 0;
      function applyIdx() {
        var n = cycle[idx];
        if (n === '__poster__') showPoster(); else showArtist(n);
      }
      frame.style.cursor = 'pointer';
      frame.addEventListener('click', function () {
        idx = (idx + 1) % cycle.length;
        applyIdx();
      });
      // 타임표 행 탭도 해당 출연자로 전환 (이미지 순환 위치도 동기화)
      rows.forEach(function (row) {
        row.addEventListener('click', function () {
          var i = cycle.indexOf(row.dataset.name);
          if (i >= 0) { idx = i; applyIdx(); }
        });
      });
    }
  }
})();
