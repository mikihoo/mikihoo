import { Renderer, Program, Mesh, Triangle, Texture }
  from 'https://cdn.jsdelivr.net/npm/ogl/+esm';

// ── Supabase ──
const SUPABASE_URL = 'https://bemcdwxyxdguhcrgkhth.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlbWNkd3h5eGRndWhjcmdraHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjMzOTgsImV4cCI6MjA5NjU5OTM5OH0.GrPUSR7EKSlOGXVI7gxQnwvQvwZBUcuOi2I9EsbrNxk';

// ── Cloudflare R2 공개 URL (파일 재생용) ──
const R2_PUBLIC_URL = 'https://pub-941aaefa2376456bbc0093aa25af3344.r2.dev';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const isAdmin = new URLSearchParams(location.search).has('admin');

// ── DOM ──
const trackListEl  = document.getElementById('trackList');
const audioEl      = document.getElementById('audioEl');
const playerBar    = document.getElementById('playerBar');
const playerTitle  = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');
const playToggle   = document.getElementById('playToggle');
const seekBar      = document.getElementById('seekBar');
const curTimeEl    = document.getElementById('curTime');
const durTimeEl    = document.getElementById('durTime');
const visCanvas    = document.getElementById('visualizer');
const listSection  = document.getElementById('listSection');
const repeatOneBtn = document.getElementById('repeatOneBtn');
const repeatAllBtn = document.getElementById('repeatAllBtn');

let tracks       = [];
let currentTrack = null;
let activeFilterTag = 'all';
let repeatMode      = 'none'; // 'none' | 'one' | 'all'

// 날씨 필터 탭
document.getElementById('weatherFilter').addEventListener('click', e => {
  const btn = e.target.closest('.wf-tab');
  if (!btn) return;
  activeFilterTag = btn.dataset.tag;
  document.querySelectorAll('.wf-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTracks();
});

// 반복 버튼
function updateRepeatUI() {
  repeatOneBtn.classList.toggle('active', repeatMode === 'one');
  repeatAllBtn.classList.toggle('active', repeatMode === 'all');
}
repeatOneBtn.addEventListener('click', () => {
  repeatMode = repeatMode === 'one' ? 'none' : 'one';
  updateRepeatUI();
});
repeatAllBtn.addEventListener('click', () => {
  repeatMode = repeatMode === 'all' ? 'none' : 'all';
  updateRepeatUI();
});

// 날씨 태그: 저장값(code) ↔ 라벨
const WEATHER_TAGS = {
  '01d': '맑음', '10d': '비', '13d': '눈',
  '50d': '안개', 'wind': '바람', '04d': '흐림',
};

// ── 날씨 아이콘 (weather.js의 weatherIconSvg 재사용 + 바람 추가) ──
function weatherIconSvg(iconCode) {
  if (!iconCode) return '';
  const o = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" class="weather-icon-svg">${p}</svg>`;
  if (iconCode === 'wind') {
    return o(`<path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12h15a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16h9a2 2 0 1 1-2 2"/>`);
  }
  const base = iconCode.slice(0, 2);
  const night = iconCode.endsWith('n');
  switch (base) {
    case '01':
      return night
        ? o(`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`)
        : o(`<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`);
    case '02':
      return o(`<path d="M13 17H5a4 4 0 1 1 3.93-5h4.07a3 3 0 1 1 0 6z"/><circle cx="19" cy="8" r="2.5"/><line x1="19" y1="4" x2="19" y2="5.5"/><line x1="22.5" y1="8" x2="21" y2="8"/><line x1="21.2" y1="5.8" x2="20.1" y2="6.9"/>`);
    case '03':
      return o(`<path d="M17 18H7a5 5 0 1 1 4.9-6H17a3 3 0 0 1 0 6z"/>`);
    case '04':
      return o(`<path d="M16 19H6a4 4 0 1 1 3.9-5H16a3 3 0 0 1 0 6z"/><path d="M19.5 14h-.8A3 3 0 1 0 14 18.5"/>`);
    case '09':
      return o(`<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><circle cx="8" cy="20.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="21.5" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="20.5" r="1" fill="currentColor" stroke="none"/>`);
    case '10':
      return o(`<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="19" x2="6.5" y2="23"/><line x1="12" y1="19" x2="10.5" y2="23"/><line x1="16" y1="19" x2="14.5" y2="23"/>`);
    case '11':
      return o(`<path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><polyline points="13 11 9 17 15 17 11 23"/>`);
    case '13':
      return o(`<line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"/><circle cx="12" cy="12" r="2"/>`);
    case '50':
      return o(`<line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/>`);
    default:
      return o(`<circle cx="12" cy="12" r="5"/>`);
  }
}

// ── 곡 목록 ──
function getFilteredTracks() {
  if (activeFilterTag === 'all') return tracks;
  return tracks.filter(t => t.weather_tag === activeFilterTag);
}

async function loadTracks() {
  const { data, error } = await sb
    .from('tracks')
    .select('*')
    .order('order_index', { ascending: true });

  if (error) {
    trackListEl.innerHTML = `<p class="entries-empty">${escapeHtml(error.message)}</p>`;
    return;
  }
  tracks = data || [];
  renderTracks();
}

function renderTracks() {
  const filtered = getFilteredTracks();
  if (!filtered.length) {
    trackListEl.innerHTML = `<p class="entries-empty">아직 아무것도 없습니다.</p>`;
    return;
  }
  trackListEl.innerHTML = filtered.map(t => {
    const fullIdx = tracks.indexOf(t);
    return renderTrack(t, fullIdx, tracks.length);
  }).join('');
  bindTrackEvents();
}

function renderTrack(t, i, total) {
  const icon = weatherIconSvg(t.weather_tag);
  const playing = currentTrack && currentTrack.id === t.id ? ' playing' : '';
  const adminControls = isAdmin ? `
    <span class="admin-controls">
      <button class="ctrl-btn move-up"   data-id="${escapeAttr(t.id)}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="ctrl-btn move-down" data-id="${escapeAttr(t.id)}" ${i === total-1 ? 'disabled' : ''}>↓</button>
      <button class="ctrl-btn edit-btn"   data-id="${escapeAttr(t.id)}">수정</button>
      <button class="ctrl-btn delete-btn" data-id="${escapeAttr(t.id)}">삭제</button>
    </span>` : '';
  return `
    <div class="track-item${playing}" data-id="${escapeAttr(t.id)}">
      <span class="track-icon">${icon}</span>
      <span class="track-title">${escapeHtml(t.title)}</span>
      <span class="track-artist">${escapeHtml(t.artist_name || 'mikihoo')}${adminControls}</span>
    </div>`;
}

function bindTrackEvents() {
  trackListEl.querySelectorAll('.track-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.ctrl-btn')) return;
      const t = tracks.find(x => x.id === el.dataset.id);
      if (t) playTrack(t);
    });
  });

  if (!isAdmin) return;

  trackListEl.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const t = tracks.find(x => x.id === btn.dataset.id);
      if (t) startEdit(t);
    });
  });

  trackListEl.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('삭제할까요?')) return;
      const t = tracks.find(x => x.id === btn.dataset.id);
      if (t && t.file_url) {
        await sb.functions.invoke('r2-storage', {
          body: { action: 'delete', key: t.file_url },
        });
      }
      await sb.from('tracks').delete().eq('id', btn.dataset.id);
      if (editingId === btn.dataset.id) cancelEdit();
      await loadTracks();
    });
  });

  trackListEl.querySelectorAll('.move-up').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const idx = tracks.findIndex(x => x.id === btn.dataset.id);
      if (idx <= 0) return;
      await swapOrder(tracks[idx], tracks[idx - 1]);
    });
  });

  trackListEl.querySelectorAll('.move-down').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const idx = tracks.findIndex(x => x.id === btn.dataset.id);
      if (idx >= tracks.length - 1) return;
      await swapOrder(tracks[idx], tracks[idx + 1]);
    });
  });
}

async function swapOrder(a, b) {
  const oa = a.order_index, ob = b.order_index;
  await sb.from('tracks').update({ order_index: ob }).eq('id', a.id);
  await sb.from('tracks').update({ order_index: oa }).eq('id', b.id);
  await loadTracks();
}

// ── 플레이어 ──
function playTrack(t) {
  currentTrack = t;
  audioEl.src = t.file_url ? `${R2_PUBLIC_URL}/${t.file_url}` : '';
  playerTitle.textContent  = t.title;
  playerArtist.textContent = t.artist_name || 'mikihoo';
  playerBar.classList.add('visible');
  setWeatherTone(t.weather_tag);     // 비주얼라이저 톤 전환
  renderTracks();                    // 재생 중 항목 강조 갱신
  ensureAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  audioEl.play().catch(err => console.warn('[sound] play failed', err));
}

playToggle.addEventListener('click', () => {
  if (!currentTrack) return;
  if (audioEl.paused) {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    audioEl.play();
  } else {
    audioEl.pause();
  }
});

audioEl.addEventListener('play',  () => { playToggle.textContent = '❚❚'; });
audioEl.addEventListener('pause', () => { playToggle.textContent = '▶'; });
audioEl.addEventListener('ended', () => {
  playToggle.textContent = '▶';
  if (repeatMode === 'one') {
    audioEl.currentTime = 0;
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    audioEl.play().catch(() => {});
  } else if (repeatMode === 'all') {
    const playlist = getFilteredTracks();
    if (!playlist.length) return;
    const idx = playlist.findIndex(x => x.id === currentTrack?.id);
    const next = playlist[(idx + 1) % playlist.length];
    if (next) playTrack(next);
  }
});

audioEl.addEventListener('loadedmetadata', () => {
  durTimeEl.textContent = fmtTime(audioEl.duration);
});

audioEl.addEventListener('timeupdate', () => {
  if (!audioEl.duration) return;
  seekBar.value = (audioEl.currentTime / audioEl.duration) * 1000;
  curTimeEl.textContent = fmtTime(audioEl.currentTime);
});

seekBar.addEventListener('input', () => {
  if (!audioEl.duration) return;
  audioEl.currentTime = (seekBar.value / 1000) * audioEl.duration;
});

function fmtTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── 오디오 분석 파이프라인 ──
let audioCtx = null, analyser = null, srcNode = null, freqData = null;

function ensureAudioGraph() {
  if (audioCtx) return;
  try {
    audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    srcNode   = audioCtx.createMediaElementSource(audioEl);
    analyser  = audioCtx.createAnalyser();
    analyser.fftSize = 512;                     // → frequencyBinCount = 256
    srcNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    freqData  = new Uint8Array(analyser.frequencyBinCount);
    window.__audioAnalyser = analyser;
    window.__audioFreq     = freqData;
  } catch (e) {
    console.warn('[sound] audio graph failed', e);
  }
}

// ══════════════════════════════════════════════════════════════════════
// WebGL 셰이더 비주얼라이저 (OGL)
//   격자 도트 패턴 + 주파수 텍스처 매핑. 저음=중심, 고음=외곽.
//   색: #a8a89e ~ #e8e4dc.  날씨 태그로 톤/노이즈/밀도/흔들림 보정.
//   새벽 4시 모니터 빛 — 미세하게 살아있는 텍스처.
// ══════════════════════════════════════════════════════════════════════
const FREQ_N = 256;
const freqTexData = new Uint8Array(FREQ_N);
let playingEnv = 0;     // 0..1, 일시정지 시 0.5s decay

// RMS 볼륨 + 비트 감지 상태
let rmsEnv = 0;         // 0..1 smoothed (× env)
let bassEma = 0;        // 적응형 비트 threshold용 저음 EMA
let beatPulse = 0;      // 0..1, 비트 순간 1 → 0.2s decay
let beatCooldown = 0;

// 색 (정규화)
const COL_LOW  = [0.659, 0.659, 0.620];  // #a8a89e
const COL_HIGH = [0.910, 0.894, 0.863];  // #e8e4dc

// 격자 밀도: 모바일은 GPU 부담 고려해 데스크탑보다 약간 덜 촘촘
const VIZ_MOBILE  = window.innerWidth <= 768;
const DENS_FACTOR = VIZ_MOBILE ? 0.7 : 1.0;

// 날씨별 비주얼 파라미터 (density는 이전 대비 약 2배 = 셀 절반 크기)
function weatherVizParams(tag) {
  let p;
  switch (tag) {
    case '01d': p = { tone: [1.06, 1.02, 0.94], noise: 0.020, density: 240, jitter: 0.018 }; break; // 맑음: 밝고 따뜻
    case '10d':                                                                                       // 비
    case '50d': p = { tone: [0.82, 0.88, 1.02], noise: 0.075, density: 256, jitter: 0.030 }; break; // 비/안개: 어둡고 차갑게, 노이즈↑
    case '13d': p = { tone: [1.00, 1.03, 1.07], noise: 0.030, density: 360, jitter: 0.016 }; break; // 눈: 밝고 촘촘
    case 'wind':                                                                                      // 바람
    case '04d': p = { tone: [0.95, 0.95, 0.95], noise: 0.030, density: 256, jitter: 0.060 }; break; // 바람/흐림: 흔들림↑
    default:    p = { tone: [1.00, 1.00, 1.00], noise: 0.022, density: 256, jitter: 0.020 };
  }
  p.density = Math.round(p.density * DENS_FACTOR);
  return p;
}
// 현재 / 목표 (전환 시 부드럽게 lerp)
const VP  = weatherVizParams(null);
const VPt = weatherVizParams(null);
function setWeatherTone(tag) {
  const p = weatherVizParams(tag);
  VPt.tone = p.tone; VPt.noise = p.noise; VPt.density = p.density; VPt.jitter = p.jitter;
}

const VIZ_VERT = /* glsl */`
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const VIZ_FRAG = /* glsl */`
precision highp float;
uniform float uTime;
uniform sampler2D uFreq;   // 256x1, 주파수 진폭 (.r)
uniform float uAudio;      // 재생 반응 envelope 0..1
uniform float uRms;        // 전체 볼륨 0..1
uniform float uPulse;      // 비트 펄스 0..1
uniform vec3  uColLow;
uniform vec3  uColHigh;
uniform vec3  uToneMul;    // 날씨 톤 보정
uniform float uNoiseAmt;   // 날씨 그레인 강도
uniform float uDensity;    // 격자 밀도
uniform float uJitter;     // 미세 흔들림 (바람)
uniform vec2  uRes;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

void main() {
  vec2 uv = vUv;
  vec2 p  = uv * 2.0 - 1.0;
  p.x *= uRes.x / uRes.y;
  float r = clamp(length(p) / 1.414, 0.0, 1.0);   // 중심 0 → 외곽 1

  // 격자 셀 (위치는 거의 고정). 가로:세로 비율 보정으로 셀을 정사각형 유지
  // → 캔버스가 와이드해도 도트가 타원으로 늘어지지 않음. uDensity = 가로 셀 수.
  float aspect = uRes.x / uRes.y;
  vec2 g    = vec2(uv.x * uDensity, uv.y * uDensity / aspect);
  vec2 cell = floor(g);
  float rnd = hash(cell);

  // 바람: 셀 단위 느린 흔들림
  vec2 jit = vec2(sin(uTime * 0.7 + rnd * 6.2832),
                  cos(uTime * 0.6 + rnd * 6.2832)) * uJitter;
  vec2 f   = fract(g) - 0.5 - jit;
  // 도트 크기: RMS 볼륨에 따라 확장 (조용하면 작게, 크면 크게)
  float dotR = 0.30 + uRms * 0.25;
  float dotShape = smoothstep(dotR, 0.10, length(f));

  // 주파수: 반지름 → 인덱스 (저음 중심, 고음 외곽)
  float freqVal = texture2D(uFreq, vec2(r, 0.5)).r;

  // 오디오 없이도 살아있는 느린 명멸
  float base   = 0.10 + 0.05 * sin(uTime * 0.5 + rnd * 40.0);
  float bright = base + freqVal * uAudio * 1.3;
  bright *= 0.55 + 0.45 * rnd;
  bright *= 1.0 + uRms * 0.9;        // 전체 볼륨 → 밝기 스케일
  bright += uPulse * 0.45;           // 비트 펄스 → 순간 밝기 증가

  // 날씨별 그레인 플리커
  float grain = (hash(cell + floor(uTime * 6.0)) - 0.5) * uNoiseAmt;
  bright = clamp(bright + grain, 0.0, 1.0);

  vec3 col = mix(uColLow, uColHigh, bright) * uToneMul;
  float alpha = dotShape * bright;
  alpha *= smoothstep(1.05, 0.2, r);   // 외곽 소프트 페이드 (사각 경계 숨김)

  // 불투명 캔버스에 배경(#0f0f0f) 위로 빛을 가산 — 페이지 배경과 이음새 없음
  vec3 bg = vec3(0.059);
  gl_FragColor = vec4(bg + col * alpha, 1.0);
}`;

let vizRenderer, vizGl, vizProgram, vizMesh, freqTexture, vizOK = false;

function desiredVizSize() {
  const isMob = window.innerWidth <= 768;
  // 모바일: 가로 꽉 채움(100%), 세로는 적절히. 데스크탑: 기존 유지.
  const wPct = isMob ? 1.00 : 0.68;
  const hPct = isMob ? 0.50 : 0.60;
  return { w: Math.round(window.innerWidth * wPct), h: Math.round(window.innerHeight * hPct) };
}

function sizeVisualizer() {
  if (!vizRenderer) return;
  const { w, h } = desiredVizSize();
  vizRenderer.setSize(w, h);
  vizProgram.uniforms.uRes.value = [w, h];
}

function initVisualizer() {
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    vizRenderer = new Renderer({ canvas: visCanvas, alpha: false, antialias: false, dpr });
    vizGl = vizRenderer.gl;

    freqTexture = new Texture(vizGl, {
      image: freqTexData, width: FREQ_N, height: 1,
      format: vizGl.LUMINANCE, internalFormat: vizGl.LUMINANCE, type: vizGl.UNSIGNED_BYTE,
      generateMipmaps: false,
      minFilter: vizGl.LINEAR, magFilter: vizGl.LINEAR,
      wrapS: vizGl.CLAMP_TO_EDGE, wrapT: vizGl.CLAMP_TO_EDGE,
      flipY: false,
    });

    vizProgram = new Program(vizGl, {
      vertex: VIZ_VERT, fragment: VIZ_FRAG,
      uniforms: {
        uTime:     { value: 0 },
        uFreq:     { value: freqTexture },
        uAudio:    { value: 0 },
        uRms:      { value: 0 },
        uPulse:    { value: 0 },
        uColLow:   { value: COL_LOW },
        uColHigh:  { value: COL_HIGH },
        uToneMul:  { value: VP.tone },
        uNoiseAmt: { value: VP.noise },
        uDensity:  { value: VP.density },
        uJitter:   { value: VP.jitter },
        uRes:      { value: [1, 1] },
      },
    });

    vizMesh = new Mesh(vizGl, { geometry: new Triangle(vizGl), program: vizProgram });
    sizeVisualizer();
    window.addEventListener('resize', sizeVisualizer);
    vizOK = true;
  } catch (e) {
    console.warn('[sound] visualizer init failed', e);
    vizOK = false;
  }
}

// RMS 볼륨 평균 + 적응형 비트 감지
function analyzeAudio(dt) {
  if (!freqData) {
    rmsEnv    += (0 - rmsEnv) * Math.min(1, dt / 0.3);
    beatPulse  = Math.max(0, beatPulse - dt / 0.2);
    return;
  }
  // 전체 RMS
  let sumSq = 0;
  for (let i = 0; i < freqData.length; i++) { const v = freqData[i] / 255; sumSq += v * v; }
  const rmsInst = Math.sqrt(sumSq / freqData.length) * playingEnv;
  rmsEnv += (rmsInst - rmsEnv) * Math.min(1, dt / 0.12);

  // 저음 에너지 → 적응형 threshold 비트 감지
  let bsum = 0; const BN = 12;
  for (let i = 0; i < BN; i++) bsum += freqData[i] / 255;
  const bass = (bsum / BN) * playingEnv;
  bassEma += (bass - bassEma) * 0.08;
  beatCooldown -= dt;
  if (bass > bassEma * 1.45 + 0.06 && beatCooldown <= 0) {
    beatPulse = 1;
    beatCooldown = 0.12;   // 연속 오탐 방지
  }
  beatPulse = Math.max(0, beatPulse - dt / 0.2);   // 0.2s decay
}

function renderViz(dt) {
  if (!vizOK) return;

  // 재생 반응 envelope (일시정지 시 0.5s decay)
  const target = (currentTrack && !audioEl.paused) ? 1 : 0;
  playingEnv += (target - playingEnv) * Math.min(1, dt / 0.5);

  // RMS 볼륨 + 비트 감지
  analyzeAudio(dt);

  // 날씨 파라미터 부드러운 전환
  const lp = Math.min(1, dt / 0.6);
  for (let i = 0; i < 3; i++) VP.tone[i] += (VPt.tone[i] - VP.tone[i]) * lp;
  VP.noise   += (VPt.noise   - VP.noise)   * lp;
  VP.density += (VPt.density - VP.density) * lp;
  VP.jitter  += (VPt.jitter  - VP.jitter)  * lp;

  // 주파수 텍스처 갱신
  if (freqData) freqTexData.set(freqData); else freqTexData.fill(0);
  freqTexture.image = freqTexData;
  freqTexture.needsUpdate = true;

  const u = vizProgram.uniforms;
  u.uTime.value   += dt;
  u.uAudio.value   = playingEnv;
  u.uRms.value     = rmsEnv;
  u.uPulse.value   = beatPulse;
  u.uToneMul.value = VP.tone;
  u.uNoiseAmt.value = VP.noise;
  u.uDensity.value = VP.density;
  u.uJitter.value  = VP.jitter;

  vizRenderer.render({ scene: vizMesh });
}

// ── 메인 루프 ──
let lastTs = null;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0.016;
  lastTs = ts;

  if (analyser && freqData) {
    analyser.getByteFrequencyData(freqData);
    window.__audioFreq = freqData;
  }
  renderViz(dt);
}

// ── 어드민: 업로드 / 수정 ──
let editingId = null;

// 편집 핸들러는 admin 블록 안에서 실제 구현이 연결됨 (비-admin이면 no-op)
let startEditImpl = null, cancelEditImpl = null;
function startEdit(t) { if (startEditImpl) startEditImpl(t); }
function cancelEdit() { if (cancelEditImpl) cancelEditImpl(); }

if (isAdmin) {
  const uploadSection = document.getElementById('uploadSection');
  const uploadLabel   = document.getElementById('uploadLabel');
  const adminLogin    = document.getElementById('soundAdminLogin');
  const sLoginBtn     = document.getElementById('sLoginBtn');
  const sLoginStatus  = document.getElementById('sLoginStatus');
  const trackTitle    = document.getElementById('trackTitle');
  const trackArtist   = document.getElementById('trackArtist');
  const trackWeather  = document.getElementById('trackWeather');
  const trackFile     = document.getElementById('trackFile');
  const trackFileName = document.getElementById('trackFileName');
  const uploadBtn     = document.getElementById('uploadBtn');
  const uploadCancel  = document.getElementById('uploadCancelBtn');
  const uploadStatus  = document.getElementById('uploadStatus');

  uploadSection.style.display = 'block';

  sb.auth.getSession().then(({ data }) => {
    if (!data.session) adminLogin.style.display = 'block';
  });

  sLoginBtn.addEventListener('click', async () => {
    const email    = document.getElementById('sAdminEmail').value.trim();
    const password = document.getElementById('sAdminPassword').value;
    if (!email || !password) return;
    sLoginBtn.disabled = true;
    sLoginStatus.textContent = '—';
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      sLoginStatus.textContent = error.message;
      sLoginBtn.disabled = false;
      return;
    }
    adminLogin.style.display = 'none';
    sLoginStatus.textContent = '';
  });

  document.getElementById('sAdminPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') sLoginBtn.click();
  });

  trackFile.addEventListener('change', () => {
    trackFileName.textContent = trackFile.files[0] ? trackFile.files[0].name : '';
  });

  // 수정 시작 — 업로드 폼을 편집 모드로 전환
  function _startEdit(t) {
    editingId = t.id;
    trackTitle.value   = t.title || '';
    trackArtist.value  = t.artist_name || '';
    trackWeather.value = t.weather_tag || '01d';
    trackFile.value    = '';
    trackFileName.textContent = '';
    uploadLabel.textContent = '음원 수정';
    uploadBtn.textContent   = '수정 저장';
    uploadCancel.style.display = 'inline-block';
    uploadStatus.textContent = '파일은 교체할 때만 선택하세요.';
    uploadSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  startEditImpl = _startEdit;

  function resetForm() {
    editingId = null;
    trackTitle.value = '';
    trackArtist.value = '';
    trackWeather.value = '01d';
    trackFile.value = '';
    trackFileName.textContent = '';
    uploadLabel.textContent = '새 음원';
    uploadBtn.textContent   = '업로드';
    uploadCancel.style.display = 'none';
    uploadStatus.textContent = '';
  }
  cancelEditImpl = resetForm;

  uploadCancel.addEventListener('click', resetForm);

  uploadBtn.addEventListener('click', async () => {
    const title  = trackTitle.value.trim();
    const artist = trackArtist.value.trim();
    const wtag   = trackWeather.value;
    const file   = trackFile.files[0];

    if (!title) { uploadStatus.textContent = '곡 제목을 입력하세요.'; return; }
    if (!editingId && !file) { uploadStatus.textContent = '파일을 선택하세요.'; return; }

    uploadBtn.disabled = true;
    uploadStatus.textContent = editingId ? '저장 중…' : '업로드 중…';

    // 파일이 있으면 R2에 업로드 (presigned URL 방식)
    let fileKey = null;
    if (file) {
      const ext = (file.name.split('.').pop() || 'mp3').toLowerCase();
      const key = `tracks/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      // 1단계: Edge Function에서 presigned PUT URL 발급
      uploadStatus.textContent = '업로드 준비 중…';
      const { data: fnData, error: fnErr } = await sb.functions.invoke('r2-storage', {
        body: { action: 'upload', key },
      });
      if (fnErr || !fnData?.url) {
        uploadStatus.textContent = `업로드 실패: ${fnErr?.message || '알 수 없는 오류'}`;
        uploadBtn.disabled = false;
        return;
      }

      // 2단계: presigned URL로 R2에 직접 PUT
      uploadStatus.textContent = '업로드 중…';
      const putRes = await fetch(fnData.url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'audio/mpeg' },
      });
      if (!putRes.ok) {
        uploadStatus.textContent = `업로드 실패: R2 ${putRes.status}`;
        uploadBtn.disabled = false;
        return;
      }
      fileKey = key;
    }

    if (editingId) {
      // ── 수정 ──
      const patch = { title, artist_name: artist || 'mikihoo', weather_tag: wtag };
      if (fileKey) {
        const old = tracks.find(t => t.id === editingId);
        if (old && old.file_url) {
          await sb.functions.invoke('r2-storage', {
            body: { action: 'delete', key: old.file_url },
          });
        }
        patch.file_url = fileKey;
      }
      const { error: updErr } = await sb.from('tracks').update(patch).eq('id', editingId);
      if (updErr) {
        uploadStatus.textContent = `저장 실패: ${updErr.message}`;
        uploadBtn.disabled = false;
        return;
      }
    } else {
      // ── 신규 ──
      const maxOrder = tracks.length ? Math.max(...tracks.map(t => t.order_index ?? 0)) : 0;
      const { error: insErr } = await sb.from('tracks').insert({
        title, artist_name: artist || 'mikihoo', file_url: fileKey,
        weather_tag: wtag, order_index: maxOrder + 1,
      });
      if (insErr) {
        uploadStatus.textContent = `저장 실패: ${insErr.message}`;
        uploadBtn.disabled = false;
        return;
      }
    }

    uploadBtn.disabled = false;
    resetForm();
    uploadStatus.textContent = '완료';
    await loadTracks();
    setTimeout(() => { if (uploadStatus.textContent === '완료') uploadStatus.textContent = ''; }, 1500);
  });
}

// ── helpers ──
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── init ──
initVisualizer();
requestAnimationFrame(loop);
loadTracks();
