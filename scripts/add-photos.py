#!/usr/bin/env python3
"""
관측 사진 추가 스크립트
원본 폴더 하나를 태그(예: 2026 미기후) 아래에 쌓습니다. 색/톤 보정 없이 AVIF 로만 압축.

  처리 → (R2 업로드) → photos.js 갱신 까지 한 번에.

사용법:
  scripts/add-photos.py "<원본 폴더>" <태그id> ["<태그 이름>"] [옵션]
예:
  scripts/add-photos.py "관측 사진/1차" microclimate-2026 "2026 미기후"   # 새 태그
  scripts/add-photos.py "관측 사진/2차" microclimate-2026                  # 같은 태그에 쌓기
  scripts/add-photos.py "관측 사진/2차" microclimate-2026 --no-upload      # 변환만 (로컬 미리보기)

옵션:
  --href forecast.html   태그에서 이어지는 페이지 (새 태그일 때만, 기본 forecast.html)
  --venue 무대륙          관측 장소 이름 (기본 무대륙)
  --lat/--lon            장소 좌표 (기본 무대륙) — 그날 바깥 날씨용
  --time 18:00           그날 바깥 날씨를 기록할 시각 (기본 18:00, 공연 시작)
  --who suheeson         이 폴더 사진이 누구의 사진인지 (사람별 필터). 사람이 아닌 사진은 --who 사이
  --no-upload            R2 업로드 생략

결과물:
  photos/processed/<태그id>/<YYYYMMDD-이름>.avif     원본 해상도 · q95 · 4:4:4 (최대화질)
  photos/processed/<태그id>/<YYYYMMDD-이름>-t.avif   그리드용 1400px · q90 · 4:4:4
  R2: s3://$R2_BUCKET/photos/<태그id>/...
  photos.js: 날짜별(days) 장소·바깥 날씨, 사진별 노출값·빛의 색을 자동 기록.
             순서·cap(캡션)은 손으로 고쳐도 다시 돌릴 때 유지됨 (JSON 형식이라 큰따옴표 유지).

로컬 미리보기: observe.html?photos=local  → photos/processed/ 에서 읽음
R2 인증: .env 의 R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (R2_BUCKET 기본 mikihoo-music)
필요 도구: avifenc, magick, exiftool, aws(cli)
"""
import argparse, json, os, re, subprocess, sys, tempfile, urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

ap = argparse.ArgumentParser(usage=__doc__)
ap.add_argument('src'); ap.add_argument('tag'); ap.add_argument('label', nargs='?')
ap.add_argument('--href', default='forecast.html')
ap.add_argument('--venue', default='무대륙')
ap.add_argument('--lat', type=float, default=37.5486)   # 무대륙 (마포 토정로5길)
ap.add_argument('--lon', type=float, default=126.9204)
ap.add_argument('--time', default='18:00')
ap.add_argument('--who', help='사람 이름 (사람별 필터), 사람 아닌 사진은 사이')
ap.add_argument('--no-upload', action='store_true')
A = ap.parse_args()
SRC, TAG = Path(A.src), A.tag
if not re.fullmatch(r'[a-z0-9-]+', TAG):
    sys.exit('태그id 는 영문소문자/숫자/하이픈만 (예: microclimate-2026)')
if not re.fullmatch(r'\d{1,2}:\d{2}', A.time):
    sys.exit('--time 은 HH:MM (예: 18:00)')

OUT = ROOT / 'photos' / 'processed' / TAG
MANIFEST = ROOT / 'photos.js'
HEADER = """/* ── 관측 사진 데이터 — scripts/add-photos.py 가 갱신합니다 ──────────
   tags: 위에 있을수록 최근. 태그 하나 = 사진 묶음 (예: 2026 미기후)
     href  태그에서 이어지는 페이지 (미기후 페이지 등)
     days  날짜별 장소·바깥 날씨 (wx: at 시각, t 기온, rh 습도, ws 풍속 m/s, wd 풍향, sky 하늘)
     people 사람 순서 (사람별 필터 · 사이 = 사람 아닌 사진: 공간·악기·관객)
     items 사진 (f 파일, d 날짜, w/h 픽셀, iso, ss 셔터, fn 조리개, mm 화각, c 빛의 색, who 사람, cap 캡션)
   순서·cap 은 손으로 고쳐도 됨 (JSON 형식 — 큰따옴표 유지).
   URL: base + <태그id>/<f>.avif (원본) / <f>-t.avif (그리드용)                */
window.PHOTOS = """

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

# 기존 데이터
data = {'base': 'https://pub-941aaefa2376456bbc0093aa25af3344.r2.dev/photos/', 'tags': []}
if MANIFEST.exists():
    txt = MANIFEST.read_text()
    body = txt[txt.index('window.PHOTOS =') + len('window.PHOTOS ='):].strip().rstrip(';')
    data = json.loads(body)
tag = next((t for t in data['tags'] if t['id'] == TAG), None)
if not tag:
    if not A.label:
        sys.exit(f'새 태그입니다 — 태그 이름도 넣어주세요: scripts/add-photos.py "{SRC}" {TAG} "2026 미기후"')
    tag = {'id': TAG, 'label': A.label, 'href': A.href, 'days': [], 'items': []}
    data['tags'].insert(0, tag)
elif A.label:
    tag['label'] = A.label

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


exif_date = {p.name: str(meta.get(p.name, {}).get('DateTimeOriginal', ''))[:10].replace(':', '.') for p in files}
common = Counter(d for d in exif_date.values() if d).most_common(1)
fallback = common[0][0] if common else ''

prev = {it['f']: it for it in tag['items']}
new_items = []
print(f'▸ 처리: {SRC} → photos/processed/{TAG}/  ({len(files)}장)')
for p in files:
    d = exif_date[p.name] or fallback
    stem = (d.replace('.', '') + '-' if d else '') + re.sub(r'[^A-Za-z0-9_-]', '-', p.stem)
    m = meta.get(p.name, {})
    w, h = int(m.get('ImageWidth', 0)), int(m.get('ImageHeight', 0))
    if m.get('Orientation') in (5, 6, 7, 8):
        w, h = h, w
    full, thumb = OUT / f'{stem}.avif', OUT / f'{stem}-t.avif'

    if not (full.exists() and thumb.exists()):
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

    it = {'f': stem, 'd': d, 'w': w, 'h': h}
    if m.get('ISO'): it['iso'] = int(m['ISO'])
    if shutter(m.get('ExposureTime')): it['ss'] = shutter(m['ExposureTime'])
    if m.get('FNumber'): it['fn'] = float(f"{m['FNumber']:g}")
    if m.get('FocalLength'): it['mm'] = round(m['FocalLength'])
    it['c'] = light_color(p)
    if prev.get(stem, {}).get('cap'): it['cap'] = prev[stem]['cap']
    who = A.who or prev.get(stem, {}).get('who')
    if who: it['who'] = who
    if stem in prev:
        prev[stem].clear(); prev[stem].update(it)          # 기존 자리 유지
    else:
        new_items.append(it)
    print(f'  {stem}  {full.stat().st_size // 1024}KB / thumb {thumb.stat().st_size // 1024}KB')

# 사람 순서 (people) — 처음 나온 순서대로, 사이(사람 아닌 사진)는 늘 맨 뒤. 손으로 바꿔도 유지됨
if A.who:
    people = tag.setdefault('people', [])
    if A.who not in people:
        people.append(A.who)
    if '사이' in people:
        people.remove('사이'); people.append('사이')

# 새 사진은 붙이고, 날짜 최신순 → 사람 순서 → 파일명 (사람이 없는 태그는 기존/손으로 고친 순서 유지)
order = {w: i for i, w in enumerate(tag.get('people', []))}
tag['items'] = tag['items'] + new_items
tag['items'].sort(key=lambda x: x.get('d', ''), reverse=True)                     # 안정 정렬
if order:
    tag['items'].sort(key=lambda x: (-int(x.get('d', '').replace('.', '') or 0),
                                     order.get(x.get('who'), len(order)), x['f']))

# 날짜별 장소·바깥 날씨
for d in sorted({exif_date[p.name] or fallback for p in files} - {''}):
    day = next((x for x in tag['days'] if x['date'] == d), None)
    wx = outdoor_weather(d)
    if not day:
        day = {'date': d, 'venue': A.venue}
        tag['days'].append(day)
    day['venue'] = A.venue
    if wx: day['wx'] = wx
tag['days'].sort(key=lambda x: x['date'], reverse=True)

# ── R2 업로드 ──
if not A.no_upload:
    for k in ('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'):
        if not env.get(k):
            sys.exit(f'{k} 가 없습니다 (.env). 변환만 하려면 --no-upload')
    bucket = env.get('R2_BUCKET', 'mikihoo-music')
    endpoint = f"https://{env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    aenv = {**env, 'AWS_ACCESS_KEY_ID': env['R2_ACCESS_KEY_ID'],
            'AWS_SECRET_ACCESS_KEY': env['R2_SECRET_ACCESS_KEY'], 'AWS_DEFAULT_REGION': 'auto'}
    print(f'▸ 업로드: s3://{bucket}/photos/{TAG}/')
    subprocess.run(['aws', 's3', 'sync', str(OUT), f's3://{bucket}/photos/{TAG}/',
                    '--endpoint-url', endpoint, '--exclude', '*', '--include', '*.avif',
                    '--content-type', 'image/avif', '--cache-control', 'public, max-age=31536000, immutable',
                    '--only-show-errors'], check=True, env=aenv)

# ── photos.js 쓰기 (사진 한 장 = 한 줄) ──
def j(o):
    return json.dumps(o, ensure_ascii=False, separators=(', ', ': '))


out = ['{', f'  "base": {j(data["base"])},', '  "tags": [']
for ti, t in enumerate(data['tags']):
    out.append('    {')
    for k in ('id', 'label', 'href'):
        out.append(f'      "{k}": {j(t.get(k, ""))},')
    if t.get('people'):
        out.append(f'      "people": {j(t["people"])},')
    out.append('      "days": [')
    out += [f'        {j(d)}' + (',' if i < len(t['days']) - 1 else '') for i, d in enumerate(t['days'])]
    out.append('      ],')
    out.append('      "items": [')
    out += [f'        {j(x)}' + (',' if i < len(t['items']) - 1 else '') for i, x in enumerate(t['items'])]
    out.append('      ]')
    out.append('    }' + (',' if ti < len(data['tags']) - 1 else ''))
out += ['  ]', '}']
MANIFEST.write_text(HEADER + '\n'.join(out) + ';\n')
print(f'▸ photos.js: {tag["label"]} — {len(tag["items"])}장 ({", ".join(d["date"] for d in tag["days"])})')
print('✓ 완료 — git add photos.js 후 커밋하면 반영됩니다.'
      + ('  (업로드 안 함: --no-upload)' if A.no_upload else ''))
