/* ── 관측 기록(영상) 데이터 ──────────────────────────────────────────
   영상을 추가할 때는 items 에 한 줄만 추가하면 됩니다:
     { name: '<파일이름>', caption: '<캡션>', order: <번호> }
   URL은 name 으로부터 자동 구성됩니다 (base 아래):
     1080   → reel-<name>-1080.mp4
     540    → reel-<name>-540.mp4
     썸네일 → reel-<name>.avif
   정렬은 sort 하나로 바꿉니다: 'asc'(공개 순서, 기본) | 'desc'
   등록된 항목 수만큼만 표시됩니다 (빈칸/예정칸 없음).                    */
window.REELS = {
  base: 'https://pub-941aaefa2376456bbc0093aa25af3344.r2.dev/reels/',
  sort: 'asc',
  items: [
    { name: 'teaser-1',             caption: 'microclimate — teaser 1', order: 1 },
    { name: 'suheeson-clear-water', caption: 'suheeson — Clear Water',  order: 2 },
    { name: 'saeglopur-teaser-1', caption: 'saeglopur — Copied September', order: 3 },
    { name: 'donizanai-teaser-1', caption: 'donizanai — MADRUGADA', order: 4 },
  ],
};
