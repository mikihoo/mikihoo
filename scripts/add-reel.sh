#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
#  관측 기록(영상) 추가 스크립트
#  원본 파일명과 캡션만 넣으면: 처리 → R2 업로드 → reels.js 한 줄 추가 까지 한 번에.
#
#  사용법:
#    scripts/add-reel.sh "<원본 영상 경로>" "<파일이름(영문소문자-하이픈)>" "<캡션>"
#  예:
#    scripts/add-reel.sh "video/eeajik_live.mp4" "eeajik-live" "eeajik — Live"
#
#  R2 인증은 환경변수(또는 .env)로 받습니다:
#    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
#    R2_BUCKET(기본 mikihoo-music), R2_PREFIX(기본 reels)
#  필요 도구: ffmpeg, ffprobe, avifenc(libavif), aws(cli)
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f .env ] && set -a && . ./.env && set +a || true

IN="${1:?원본 영상 경로}"; NAME="${2:?파일이름}"; CAPTION="${3:?캡션}"
OUT="video/processed"; mkdir -p "$OUT"
BUCKET="${R2_BUCKET:-mikihoo-music}"; PREFIX="${R2_PREFIX:-reels}"
: "${R2_ACCOUNT_ID:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}"
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

f1080="$OUT/reel-$NAME-1080.mp4"
f540="$OUT/reel-$NAME-540.mp4"
f720="$OUT/reel-$NAME-720.mp4"
favif="$OUT/reel-$NAME.avif"

echo "▸ 처리: $NAME"

# ── 1080: 10Mbps 이하면 remux(faststart만), 넘으면 ~8Mbps 재인코딩 ──
BR=$(ffprobe -v error -show_entries format=bit_rate -of csv=p=0 "$IN")
if [ "${BR:-0}" -le 10000000 ]; then
  echo "  1080: ${BR}bps ≤ 10M → remux"
  ffmpeg -y -hide_banner -loglevel error -i "$IN" -c copy -movflags +faststart "$f1080"
else
  echo "  1080: ${BR}bps > 10M → 재인코딩(~8M)"
  ffmpeg -y -hide_banner -loglevel error -i "$IN" \
    -c:v libx264 -preset slow -b:v 8M -maxrate 10M -bufsize 16M \
    -pix_fmt yuv420p -profile:v high -c:a aac -b:a 192k -movflags +faststart "$f1080"
fi

# ── 720 오버레이용 (모바일 빠른 로딩, 소리 포함) ──
ffmpeg -y -hide_banner -loglevel error -i "$IN" -vf scale=720:1280 \
  -c:v libx264 -preset slow -b:v 3M -maxrate 4M -bufsize 6M \
  -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "$f720"

# ── 540 미리보기 (무음) ──
ffmpeg -y -hide_banner -loglevel error -i "$IN" -vf scale=540:960 \
  -c:v libx264 -preset slow -b:v 1.5M -maxrate 2M -bufsize 3M \
  -pix_fmt yuv420p -an -movflags +faststart "$f540"

# ── 썸네일 AVIF (첫 프레임, 고품질 10bit) ──
TMP="$(mktemp -t reelframe).png"
ffmpeg -y -hide_banner -loglevel error -i "$IN" -frames:v 1 "$TMP"
avifenc -q 90 --yuv 444 --depth 10 --speed 4 --jobs all "$TMP" "$favif" >/dev/null
rm -f "$TMP"

ls -lh "$f1080" "$f720" "$f540" "$favif" | awk '{print "  "$5, $9}'

# ── R2 업로드 (Standard) ──
echo "▸ 업로드: s3://$BUCKET/$PREFIX/"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
up() { aws s3 cp "$1" "s3://$BUCKET/$PREFIX/$(basename "$1")" \
        --endpoint-url "$ENDPOINT" --storage-class STANDARD --content-type "$2" --only-show-errors; }
up "$f1080" "video/mp4"
up "$f720"  "video/mp4"
up "$f540"  "video/mp4"
up "$favif" "image/avif"

# ── reels.js 에 한 줄 추가 ──
NEXT=$(grep -oE 'order: *[0-9]+' reels.js | grep -oE '[0-9]+' | sort -n | tail -1); NEXT=$(( ${NEXT:-0} + 1 ))
LINE="    { name: '$NAME', caption: '$CAPTION', order: $NEXT },"
perl -0pi -e "s/(\n  \],\n};)/\n$LINE\$1/ if !/name: '$NAME'/" reels.js
echo "▸ reels.js 추가: $LINE"
echo "✓ 완료 — git add reels.js 후 커밋하면 반영됩니다."
