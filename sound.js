// ── Supabase ──
const SUPABASE_URL = 'https://bemcdwxyxdguhcrgkhth.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlbWNkd3h5eGRndWhjcmdraHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjMzOTgsImV4cCI6MjA5NjU5OTM5OH0.GrPUSR7EKSlOGXVI7gxQnwvQvwZBUcuOi2I9EsbrNxk';

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

let tracks       = [];
let currentTrack = null;

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
  if (!tracks.length) {
    trackListEl.innerHTML = `<p class="entries-empty">아직 아무것도 없습니다.</p>`;
    return;
  }
  trackListEl.innerHTML = tracks.map((t, i) => renderTrack(t, i, tracks.length)).join('');
  bindTrackEvents();
}

function renderTrack(t, i, total) {
  const icon = weatherIconSvg(t.weather_tag);
  const playing = currentTrack && currentTrack.id === t.id ? ' playing' : '';
  const adminControls = isAdmin ? `
    <span class="admin-controls">
      <button class="ctrl-btn move-up"   data-id="${escapeAttr(t.id)}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="ctrl-btn move-down" data-id="${escapeAttr(t.id)}" ${i === total-1 ? 'disabled' : ''}>↓</button>
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

  trackListEl.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('삭제할까요?')) return;
      const t = tracks.find(x => x.id === btn.dataset.id);
      if (t && t.file_url) {
        const path = storagePathFromUrl(t.file_url);
        if (path) await sb.storage.from('audio-tracks').remove([path]);
      }
      await sb.from('tracks').delete().eq('id', btn.dataset.id);
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
  audioEl.src = t.file_url;
  playerTitle.textContent  = t.title;
  playerArtist.textContent = t.artist_name || 'mikihoo';
  playerBar.classList.add('visible');
  renderTracks();              // 재생 중 항목 강조 갱신
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
audioEl.addEventListener('ended', () => { playToggle.textContent = '▶'; });

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

// ── 오디오 분석 파이프라인 (1단계: 데이터 추출만) ──
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
    // 2단계 시각화에서 꺼내 쓸 수 있게 전역 노출
    window.__audioAnalyser = analyser;
    window.__audioFreq     = freqData;
  } catch (e) {
    console.warn('[sound] audio graph failed', e);
  }
}

// ── 비주얼라이저 캔버스 (1단계: 전체 크기 배치 + 프레임마다 데이터 추출) ──
function sizeVisualizer() {
  if (!visCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  visCanvas.width  = Math.floor(window.innerWidth  * dpr);
  visCanvas.height = Math.floor(window.innerHeight * dpr);
}
sizeVisualizer();
window.addEventListener('resize', sizeVisualizer);

function visLoop() {
  requestAnimationFrame(visLoop);
  if (analyser && freqData) {
    analyser.getByteFrequencyData(freqData);
    window.__audioFreq = freqData;             // 매 프레임 최신 주파수 배열 저장
    if (window.__soundDebug) {
      let sum = 0;
      for (let i = 0; i < freqData.length; i++) sum += freqData[i];
      console.log('[sound] avg freq:', (sum / freqData.length).toFixed(1));
    }
  }
  // 1단계: 배경만 (그레인만 보이는 상태). 실제 그리기는 2단계에서.
  const ctx = visCanvas.getContext('2d');
  ctx.clearRect(0, 0, visCanvas.width, visCanvas.height);
}
requestAnimationFrame(visLoop);

// ── 어드민: 업로드 ──
if (isAdmin) {
  const uploadSection = document.getElementById('uploadSection');
  const adminLogin    = document.getElementById('soundAdminLogin');
  const sLoginBtn     = document.getElementById('sLoginBtn');
  const sLoginStatus  = document.getElementById('sLoginStatus');
  const trackTitle    = document.getElementById('trackTitle');
  const trackArtist   = document.getElementById('trackArtist');
  const trackWeather  = document.getElementById('trackWeather');
  const trackFile     = document.getElementById('trackFile');
  const trackFileName = document.getElementById('trackFileName');
  const uploadBtn     = document.getElementById('uploadBtn');
  const uploadStatus  = document.getElementById('uploadStatus');

  uploadSection.style.display = 'block';

  // 세션 확인 → 미로그인 시 로그인 폼
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

  uploadBtn.addEventListener('click', async () => {
    const title  = trackTitle.value.trim();
    const artist = trackArtist.value.trim();
    const wtag   = trackWeather.value;
    const file   = trackFile.files[0];

    if (!title)  { uploadStatus.textContent = '곡 제목을 입력하세요.'; return; }
    if (!file)   { uploadStatus.textContent = '파일을 선택하세요.';   return; }

    uploadBtn.disabled = true;
    uploadStatus.textContent = '업로드 중…';

    const ext  = (file.name.split('.').pop() || 'mp3').toLowerCase();
    const path = `tracks/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: upErr } = await sb.storage
      .from('audio-tracks')
      .upload(path, file, { contentType: file.type || 'audio/mpeg', upsert: false });
    if (upErr) {
      uploadStatus.textContent = `업로드 실패: ${upErr.message}`;
      uploadBtn.disabled = false;
      return;
    }

    const fileUrl = sb.storage.from('audio-tracks').getPublicUrl(path).data.publicUrl;

    // 새 곡은 목록 맨 아래로 (maxOrder + 1)
    const maxOrder = tracks.length ? Math.max(...tracks.map(t => t.order_index ?? 0)) : 0;

    const { error: insErr } = await sb.from('tracks').insert({
      title,
      artist_name: artist || 'mikihoo',
      file_url: fileUrl,
      weather_tag: wtag,
      order_index: maxOrder + 1,
    });
    if (insErr) {
      uploadStatus.textContent = `저장 실패: ${insErr.message}`;
      uploadBtn.disabled = false;
      return;
    }

    uploadStatus.textContent = '완료';
    trackTitle.value = '';
    trackArtist.value = '';
    trackFile.value = '';
    trackFileName.textContent = '';
    uploadBtn.disabled = false;
    await loadTracks();
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
function storagePathFromUrl(url) {
  const marker = '/audio-tracks/';
  const idx = url.indexOf(marker);
  return idx !== -1 ? decodeURIComponent(url.slice(idx + marker.length).split('?')[0]) : null;
}

// ── init ──
loadTracks();
