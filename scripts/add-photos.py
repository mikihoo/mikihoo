#!/usr/bin/env python3
"""
관측 사진 추가 스크립트
원본 JPG 폴더 하나 = 관측 회차(batch) 하나. 색/톤 보정 없이 AVIF 로만 압축합니다.

  처리 → (R2 업로드) → photos.js 에 회차 블록 생성/갱신 까지 한 번에.

사용법:
  scripts/add-photos.py "<원본 폴더>" <회차id> "<라벨>" [--time 18:00] [--no-upload]
예:
  scripts/add-photos.py "관측 사진/1차" 1 "1차 관측"
  scripts/add-photos.py "관측 사진/2차" 2 "2차 관측" --time 19:30
  scripts/add-photos.py "관측 사진/2차" 2 "2차 관측" --no-upload   # 변환만 (로컬 미리보기)

  --time      그날 바깥 날씨를 기록할 시각 (기본 18:00, 공연 시작)
  --lat/--lon 관측 장소 좌표 (기본 무대륙)

결과물:
  photos/processed/<회차id>/<이름>.avif     원본 해상도 · q95 · 4:4:4 (최대화질)
  photos/processed/<회차id>/<이름>-t.avif   그리드용 1400px · q90 · 4:4:4
  R2: s3://$R2_BUCKET/photos/<회차id>/...
  photos.js: 노출값(ISO/셔터/조리개/화각), 크기, 빛의 색(c), 그날 바깥 날씨(wx)를 자동 기록. 순서/캡션은 손으로 고쳐도 됨
             (다시 돌리면 이미 있는 항목의 순서·캡션은 유지).

로컬 미리보기: forecast.html?phase=after&photos=local  → photos/processed/ 에서 읽음
R2 인증: .env 의 R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (R2_BUCKET 기본 mikihoo-music)
필요 도구: avifenc, magick, exiftool, aws(cli)
"""
import argparse, json, os, re, subprocess, sys, tempfile, urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

ap = argparse.ArgumentParser(usage=__doc__)
ap.add_argument('src'); ap.add_argument('batch'); ap.add_argument('label')
ap.add_argument('--time', default='18:00')
ap.add_argument('--lat', type=float, default=37.5486)   # 무대륙 (마포 토정로5길)
ap.add_argument('--lon', type=float, default=126.9204)
ap.add_argument('--no-upload', action='store_true')
A = ap.parse_args()
SRC, BATCH, LABEL, NO_UPLOAD = Path(A.src), A.batch, A.label, A.no_upload
if not re.fullmatch(r'[a-z0-9-]+', BATCH):
    sys.exit('회차id 는 영문소문자/숫자/하이픈만 (예: 1, 2, encore-1)')
if not re.fullmatch(r'\d{1,2}:\d{2}', A.time):
    sys.exit('--time 은 HH:MM (예: 18:00)')

OUT = ROOT / 'photos' / 'processed' / BATCH
MANIFEST = ROOT / 'photos.js'

# .env 읽기
env = dict(os.environ)
if (ROOT / '.env').exists():
    for line in (ROOT / '.env').read_text().splitlines():
        m = re.match(r'\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$', line)
        if m and m.group(1) not in env:
            env[m.group(1)] = m.group(2).strip('"\'')

if not SRC.is_dir():
    near = sorted(p.name for p in SRC.parent.iterdir() if p.is_dir()) if SRC.parent.is_dir() else []
    sys.exit(f'폴더가 없습니다: {SRC}' + (f'\n  있는 폴더: {", ".join(near)}' if near else ''))
files = sorted(p for p in SRC.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png', '.tif', '.tiff'))
if not files:
    sys.exit(f'원본 사진이 없습니다: {SRC}')
OUT.mkdir(parents=True, exist_ok=True)

meta = json.loads(subprocess.check_output(
    ['exiftool', '-json', '-n', '-DateTimeOriginal', '-FocalLength', '-FNumber',
     '-ExposureTime', '-ISO', '-ImageWidth', '-ImageHeight', '-Orientation', *map(str, files)]))
meta = {Path(m['SourceFile']).name: m for m in meta}


def shutter(t):
    if not t:
        return None
    return f'1/{round(1 / t)}' if t < 1 else f'{t:g}"'


def light_color(path):
    """빛의 색 — 밝은 곳(조명)에 가중치를 준 평균색. 사진은 건드리지 않고 값만 읽음."""
    raw = subprocess.check_output(['magick', str(path), '-resize', '48x48!', '-depth', '8', 'rgb:-'])
    sr = sg = sb = sw = 0.0
    for i in range(0, len(raw), 3):
        r, g, b = raw[i], raw[i + 1], raw[i + 2]
        w = ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) ** 2 + 1e-4
        sr += r * w; sg += g * w; sb += b * w; sw += w
    return '#%02x%02x%02x' % (round(sr / sw), round(sg / sw), round(sb / sw))


WMO = {0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림', 45: '안개', 48: '안개',
       51: '이슬비', 53: '이슬비', 55: '이슬비', 61: '비', 63: '비', 65: '강한 비',
       71: '눈', 73: '눈', 75: '많은 눈', 80: '소나기', 81: '소나기', 82: '소나기', 95: '뇌우'}
DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서']


def outdoor_weather(date):
    """그날 그 시각 관측 장소의 실제 날씨 (Open-Meteo, 키 없음)."""
    d = date.replace('.', '-')
    url = ('https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&start_date=%s&end_date=%s'
           '&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code'
           '&timezone=Asia%%2FSeoul&wind_speed_unit=ms' % (A.lat, A.lon, d, d))
    try:
        h = json.load(urllib.request.urlopen(url, timeout=15))['hourly']
        i = h['time'].index('%sT%02d:00' % (d, int(A.time.split(':')[0])))
        return {'at': A.time, 't': round(h['temperature_2m'][i], 1), 'rh': h['relative_humidity_2m'][i],
                'ws': round(h['wind_speed_10m'][i], 1),
                'wd': DIRS[round(h['wind_direction_10m'][i] / 45) % 8] + '풍',
                'sky': WMO.get(h['weather_code'][i], '')}
    except Exception as e:
        print(f'  (날씨 못 가져옴: {e})')
        return None


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)


items, dates = [], []
print(f'▸ 처리: {SRC} → photos/processed/{BATCH}/  ({len(files)}장)')
for p in files:
    stem = re.sub(r'[^A-Za-z0-9_-]', '-', p.stem)
    m = meta.get(p.name, {})
    w, h = int(m.get('ImageWidth', 0)), int(m.get('ImageHeight', 0))
    if m.get('Orientation') in (5, 6, 7, 8):
        w, h = h, w
    full, thumb = OUT / f'{stem}.avif', OUT / f'{stem}-t.avif'

    with tempfile.TemporaryDirectory() as td:
        # 회전만 픽셀에 반영 (색/톤은 그대로, ICC 유지)
        src = Path(td) / 'src.png'
        run(['magick', str(p), '-auto-orient', str(src)])
        if not full.exists():
            run(['avifenc', '-q', '95', '--yuv', '444', '--speed', '4', '--jobs', 'all',
                 '--ignore-exif', '--ignore-xmp', str(src), str(full)])
        if not thumb.exists():
            t = Path(td) / 't.png'
            run(['magick', str(src), '-resize', '1400x1400>', str(t)])
            run(['avifenc', '-q', '90', '--yuv', '444', '--speed', '4', '--jobs', 'all',
                 '--ignore-exif', '--ignore-xmp', str(t), str(thumb)])

    d = m.get('DateTimeOriginal')
    if d:
        dates.append(str(d)[:10].replace(':', '.'))
    item = {'f': stem, 'w': w, 'h': h}
    if m.get('ISO'): item['iso'] = int(m['ISO'])
    if shutter(m.get('ExposureTime')): item['ss'] = shutter(m['ExposureTime'])
    if m.get('FNumber'): item['fn'] = float(f"{m['FNumber']:g}")
    if m.get('FocalLength'): item['mm'] = round(m['FocalLength'])
    item['c'] = light_color(p)
    items.append(item)
    print(f'  {stem}  {full.stat().st_size // 1024}KB / thumb {thumb.stat().st_size // 1024}KB')

# ── R2 업로드 ──
if not NO_UPLOAD:
    for k in ('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'):
        if not env.get(k):
            sys.exit(f'{k} 가 없습니다 (.env). 변환만 하려면 --no-upload')
    bucket = env.get('R2_BUCKET', 'mikihoo-music')
    endpoint = f"https://{env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    aenv = {**env, 'AWS_ACCESS_KEY_ID': env['R2_ACCESS_KEY_ID'],
            'AWS_SECRET_ACCESS_KEY': env['R2_SECRET_ACCESS_KEY'], 'AWS_DEFAULT_REGION': 'auto'}
    print(f'▸ 업로드: s3://{bucket}/photos/{BATCH}/')
    subprocess.run(['aws', 's3', 'sync', str(OUT), f's3://{bucket}/photos/{BATCH}/',
                    '--endpoint-url', endpoint, '--exclude', '*', '--include', '*.avif',
                    '--content-type', 'image/avif', '--cache-control', 'public, max-age=31536000, immutable',
                    '--only-show-errors'], check=True, env=aenv)

# ── photos.js 갱신 (회차 블록 단위) ──
date = Counter(dates).most_common(1)[0][0] if dates else ''
wx = outdoor_weather(date) if date else None
src_text = MANIFEST.read_text() if MANIFEST.exists() else ''
start, end = f'/* @batch {BATCH} */', f'/* @end {BATCH} */'
block_re = re.compile(re.escape(start) + r'.*?' + re.escape(end), re.S)

old = block_re.search(src_text)
prev = {}
if old:  # 손으로 고친 순서·캡션 유지
    for i, mm in enumerate(re.finditer(r"\{ f: '([^']+)'(.*?)\}", old.group(0))):
        cap = re.search(r"cap: '((?:[^'\\]|\\.)*)'", mm.group(2))
        prev[mm.group(1)] = (i, cap.group(1) if cap else None)
    items.sort(key=lambda it: prev.get(it['f'], (10 ** 6, None))[0])


def js_item(it):
    parts = [f"f: '{it['f']}'", f"w: {it['w']}", f"h: {it['h']}"]
    for k in ('iso', 'fn', 'mm'):
        if k in it: parts.append(f'{k}: {it[k]:g}' if isinstance(it[k], float) else f'{k}: {it[k]}')
    if 'ss' in it: parts.append(f"ss: '{it['ss']}'")
    parts.append(f"c: '{it['c']}'")
    cap = prev.get(it['f'], (0, None))[1]
    if cap: parts.append(f"cap: '{cap}'")
    return '      { ' + ', '.join(parts) + ' },'


if not wx and old:  # 못 가져오면 이전 값 유지
    pw = re.search(r'wx: (\{.*?\}),', old.group(0))
    wx_js = pw.group(1) if pw else 'null'
else:
    wx_js = json.dumps(wx, ensure_ascii=False) if wx else 'null'
block = (f"{start}\n    {{ id: '{BATCH}', label: '{LABEL}', date: '{date}',\n      wx: {wx_js},\n      items: [\n"
         + '\n'.join(js_item(it) for it in items) + f"\n    ]}},\n    {end}")

if not src_text:
    src_text = """/* ── 관측 사진 데이터 ─────────────────────────────────────────────
   scripts/add-photos.py 가 회차 블록을 만들어 줍니다 (손으로 순서·cap 수정 가능).
   URL: base + <회차id>/<f>.avif (원본 해상도) / <f>-t.avif (그리드용)
   회차 필드: wx 그날 바깥 날씨 (at 시각, t 기온, rh 습도, ws 풍속 m/s, wd 풍향, sky 하늘)
   항목 필드: f 파일이름, w/h 픽셀, iso, ss 셔터, fn 조리개, mm 화각, c 빛의 색, cap 캡션(선택)
   sort: 'desc' 최신 회차가 위 | 'asc'                                    */
window.PHOTOS = {
  base: 'https://pub-941aaefa2376456bbc0093aa25af3344.r2.dev/photos/',
  sort: 'desc',
  batches: [
    /* @batches */
  ],
};
"""
if old:
    src_text = block_re.sub(lambda _: block, src_text)
else:
    src_text = src_text.replace('    /* @batches */', '    ' + block + '\n    /* @batches */')
MANIFEST.write_text(src_text)
print(f'▸ photos.js: 회차 {BATCH} ({len(items)}장, {date})')
print('✓ 완료 — git add photos.js 후 커밋하면 반영됩니다.'
      + ('  (업로드 안 함: --no-upload)' if NO_UPLOAD else ''))
