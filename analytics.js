// GoatCounter 방문/이벤트 집계 — 쿠키 없음.
// goatcounter.com 가입 후 받은 사이트 코드(xxx.goatcounter.com 의 xxx)를 넣으면 켜짐.
// 비워두면 아무것도 로드하지 않음. localhost 방문은 GoatCounter가 자동으로 무시함.
(function () {
  var GOATCOUNTER_CODE = 'mikihoo';

  var queue = [];
  function flush() {
    if (!window.goatcounter || !window.goatcounter.count) return;
    while (queue.length) window.goatcounter.count(queue.shift());
  }

  // 이벤트 기록: mkTrack('play/트랙id', '곡 제목')
  window.mkTrack = function (path, title) {
    if (!GOATCOUNTER_CODE) return;
    queue.push({ path: path, title: title || path, event: true });
    flush();
  };

  if (!GOATCOUNTER_CODE) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', 'https://' + GOATCOUNTER_CODE + '.goatcounter.com/count');
  s.onload = flush;
  document.head.appendChild(s);
})();
