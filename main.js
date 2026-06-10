const SUPABASE_URL = 'https://bemcdwxyxdguhcrgkhth.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlbWNkd3h5eGRndWhjcmdraHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjMzOTgsImV4cCI6MjA5NjU5OTM5OH0.GrPUSR7EKSlOGXVI7gxQnwvQvwZBUcuOi2I9EsbrNxk';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const isAdmin = new URLSearchParams(location.search).has('admin');

// ── DOM ──
const adminPanel      = document.getElementById('adminPanel');
const loginBox        = document.getElementById('loginBox');
const writeBox        = document.getElementById('writeBox');
const loginBtn        = document.getElementById('loginBtn');
const logoutBtn       = document.getElementById('logoutBtn');
const postBtn         = document.getElementById('postBtn');
const loginStatus     = document.getElementById('loginStatus');
const postStatus      = document.getElementById('postStatus');
const archiveList     = document.getElementById('archiveList');
const postPhoto       = document.getElementById('postPhoto');
const postFileName    = document.getElementById('postFileName');
const postFilterStatus= document.getElementById('postFilterStatus');
const multiPreview    = document.getElementById('multiPreview');
const postModal       = document.getElementById('postModal');
const modalClose      = document.getElementById('modalClose');
const modalImages     = document.getElementById('modalImages');
const modalDate       = document.getElementById('modalDate');
const modalTitle      = document.getElementById('modalTitle');
const modalExcerpt    = document.getElementById('modalExcerpt');
const modalWeather    = document.getElementById('modalWeather');

const OW_KEY = '22e32b9735460bfc73f39f24811548cf';
let posts        = [];
let filteredBlobs = [];
let currentWeather = null;

// 날씨 가져오기 — 표시 + 글 작성 시 포함
function setIndexWeather(text) {
  currentWeather = text;
  const bar = document.getElementById('indexWeatherBar');
  if (bar) { bar.textContent = `지금 이곳 — ${text}`; bar.classList.add('visible'); }
}

async function initIndexWeather() {
  const gps = await new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    const t = setTimeout(() => resolve(null), 5000);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { clearTimeout(t); resolve(coords); },
      ()           => { clearTimeout(t); resolve(null); }
    );
  });
  try {
    const coords = gps || await fetch('https://ipinfo.io/json').then(r => r.json()).then(d => {
      const [lat, lon] = d.loc.split(',').map(Number); return { latitude: lat, longitude: lon };
    });
    const d = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${coords.latitude}&lon=${coords.longitude}&appid=${OW_KEY}&units=metric&lang=kr`).then(r => r.json());
    if (d.main) setIndexWeather(`${Math.round(d.main.temp)}°C · ${d.main.humidity}% · ${d.weather[0].description}`);
  } catch (_) {}
}
initIndexWeather();

// ── Admin ──
if (isAdmin) {
  adminPanel.style.display = 'block';
  sb.auth.getSession().then(({ data }) => {
    if (data.session) showWriteBox();
  });
}

// ── Retro filter ──
function applyRetroFilter(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1400;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        const r = Math.min(MAX / w, MAX / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const id = ctx.getImageData(0, 0, w, h);
      const px = id.data;
      const cx = w / 2, cy = h / 2, maxDist = Math.sqrt(cx*cx + cy*cy);

      for (let i = 0; i < px.length; i += 4) {
        let r = px[i], g = px[i+1], b = px[i+2];

        // 완전 흑백
        let v = px[i] * 0.299 + px[i+1] * 0.587 + px[i+2] * 0.114;

        // brightness 0.82 + contrast 1.5
        v = (v * 0.82 - 128) * 1.5 + 128;

        // 비네팅
        const px_ = (i / 4) % w, py_ = Math.floor((i / 4) / w);
        const dx = px_ - cx, dy = py_ - cy;
        const dist = Math.sqrt(dx*dx + dy*dy) / maxDist;
        const vig = dist > 0.35 ? (dist - 0.35) / 0.65 * 0.65 : 0;
        v = v * (1 - vig);

        // 그레인
        const n = (Math.random() - 0.5) * 22;
        const out = Math.min(255, Math.max(0, v + n));
        px[i]   = out;
        px[i+1] = out;
        px[i+2] = out;
      }
      ctx.putImageData(id, 0, 0);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.88);
    };
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(file);
  });
}

// ── Multi photo preview ──
postPhoto.addEventListener('change', async () => {
  const files = Array.from(postPhoto.files);
  filteredBlobs = [];
  multiPreview.innerHTML = '';

  if (!files.length) { postFileName.textContent = ''; postFilterStatus.textContent = ''; return; }

  postFileName.textContent    = `${files.length}장 선택됨`;
  postFilterStatus.textContent = '필터 적용 중—';

  for (const file of files) {
    const blob = await applyRetroFilter(file);
    filteredBlobs.push(blob);
    const img = document.createElement('img');
    img.className = 'multi-thumb';
    img.src = URL.createObjectURL(blob);
    multiPreview.appendChild(img);
  }

  postFilterStatus.textContent = '';
});

// ── Login ──
async function doLogin() {
  const email    = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  if (!email || !password) return;
  loginBtn.disabled = true;
  loginStatus.textContent = '—';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { loginStatus.textContent = error.message; loginBtn.disabled = false; return; }
  showWriteBox();
}

loginBtn.addEventListener('click', doLogin);
document.getElementById('adminPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

logoutBtn.addEventListener('click', async () => {
  await sb.auth.signOut();
  writeBox.style.display = 'none';
  loginBox.style.display = 'block';
});

// ── Post submit ──
postBtn.addEventListener('click', async () => {
  const title   = document.getElementById('postTitle').value.trim();
  const excerpt = document.getElementById('postExcerpt').value.trim();
  const date    = document.getElementById('postDate').value.trim();
  const artist  = document.getElementById('postArtist').value.trim();
  if (!title) { postStatus.textContent = '제목을 입력해주세요.'; return; }
  postBtn.disabled = true;
  postStatus.textContent = '—';

  const image_urls = [];
  const blobs = filteredBlobs.length ? filteredBlobs : Array.from(postPhoto.files);

  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i];
    const path = `archive/${Date.now()}-${Math.random().toString(36).slice(2)}-${i}.jpg`;
    const { error: upErr } = await sb.storage
      .from('weather-photos')
      .upload(path, blob, { contentType: 'image/jpeg' });
    if (upErr) {
      postStatus.textContent = `사진 업로드 실패 (${i+1}번): ${upErr.message}`;
      postBtn.disabled = false;
      return;
    }
    image_urls.push(sb.storage.from('weather-photos').getPublicUrl(path).data.publicUrl);
  }

  const minOrder = posts.length ? Math.min(...posts.map(p => p.order_index ?? 0)) : 0;

  const { error } = await sb.from('archive_posts').insert({
    title,
    excerpt: excerpt || null,
    image_url: image_urls[0] || null,
    image_urls: image_urls,
    post_date: date || null,
    artist: artist || null,
    weather_text: currentWeather || null,
    order_index: minOrder - 1
  });

  if (error) {
    postStatus.textContent = `저장 실패: ${error.message}`;
    postBtn.disabled = false;
    return;
  }

  postStatus.textContent = '올라갔습니다.';
  ['postTitle','postExcerpt','postDate','postArtist'].forEach(id => document.getElementById(id).value = '');
  postPhoto.value = '';
  postFileName.textContent = '';
  filteredBlobs = [];
  multiPreview.innerHTML = '';
  postBtn.disabled = false;
  await loadArchive();
});

// ── Load archive ──
async function loadArchive() {
  const { data, error } = await sb
    .from('archive_posts')
    .select('*')
    .order('order_index', { ascending: true });

  if (error || !data || data.length === 0) {
    archiveList.innerHTML = '<div class="list-empty">—</div>';
    posts = [];
    return;
  }

  posts = data;
  archiveList.innerHTML = data.map((post, i) => renderItem(post, i, data.length)).join('');
  bindItemEvents();
}

function renderItem(post, i, total) {
  const meta = post.post_date || String(i + 1).padStart(2, '0');
  const adminControls = isAdmin ? `
    <span class="admin-controls">
      <button class="ctrl-btn move-up"   data-id="${escapeAttr(post.id)}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="ctrl-btn move-down" data-id="${escapeAttr(post.id)}" ${i === total-1 ? 'disabled' : ''}>↓</button>
      <button class="ctrl-btn delete-btn" data-id="${escapeAttr(post.id)}">삭제</button>
    </span>` : '';

  return `
    <div class="list-item" data-id="${escapeAttr(post.id)}">
      <span class="list-item-meta">${escapeHtml(meta)}</span>
      <span class="list-item-title">${escapeHtml(post.title)}${adminControls}</span>
      <span class="list-item-artist">${escapeHtml(post.artist || 'mikihoo')}</span>
    </div>`;
}

function bindItemEvents() {
  archiveList.querySelectorAll('.list-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.ctrl-btn')) return;
      const post = posts.find(p => p.id === el.dataset.id);
      if (post) openModal(post);
    });
  });

  if (!isAdmin) return;

  archiveList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('삭제할까요?')) return;
      const post = posts.find(p => p.id === btn.dataset.id);
      if (post) {
        const urls = post.image_urls?.length ? post.image_urls : (post.image_url ? [post.image_url] : []);
        const paths = urls.map(storagePathFromUrl).filter(Boolean);
        if (paths.length) await sb.storage.from('weather-photos').remove(paths);
      }
      await sb.from('archive_posts').delete().eq('id', btn.dataset.id);
      await loadArchive();
    });
  });

  archiveList.querySelectorAll('.move-up').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const idx = posts.findIndex(p => p.id === btn.dataset.id);
      if (idx <= 0) return;
      await swapOrder(posts[idx], posts[idx - 1]);
    });
  });

  archiveList.querySelectorAll('.move-down').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const idx = posts.findIndex(p => p.id === btn.dataset.id);
      if (idx >= posts.length - 1) return;
      await swapOrder(posts[idx], posts[idx + 1]);
    });
  });
}

async function swapOrder(a, b) {
  const oa = a.order_index, ob = b.order_index;
  await sb.from('archive_posts').update({ order_index: ob }).eq('id', a.id);
  await sb.from('archive_posts').update({ order_index: oa }).eq('id', b.id);
  await loadArchive();
}

// ── Modal ──
function openModal(post) {
  // 이미지 목록: image_urls 배열 우선, 없으면 image_url 단일
  const imgs = (post.image_urls && post.image_urls.length)
    ? post.image_urls
    : (post.image_url ? [post.image_url] : []);

  modalImages.innerHTML = imgs.map(url =>
    `<img class="modal-img" src="${escapeAttr(url)}" alt="" loading="lazy" />`
  ).join('');

  modalDate.textContent    = post.post_date || '';
  modalTitle.textContent   = post.title;
  modalExcerpt.textContent = post.excerpt || '';
  if (modalWeather) modalWeather.textContent = post.weather_text || '';
  postModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  postModal.classList.remove('open');
  document.body.style.overflow = '';
  modalImages.innerHTML = '';
}

modalClose.addEventListener('click', closeModal);
postModal.addEventListener('click', e => { if (e.target === postModal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function showWriteBox() {
  loginBox.style.display = 'none';
  writeBox.style.display = 'block';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(str) {
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function storagePathFromUrl(url) {
  const marker = '/weather-photos/';
  const idx = url.indexOf(marker);
  return idx !== -1 ? decodeURIComponent(url.slice(idx + marker.length).split('?')[0]) : null;
}

loadArchive();

// ── Hero parallax (desktop only) ──
if (window.innerWidth > 768) {
  const heroVideo = document.querySelector('.hero-video');
  if (heroVideo) {
    const moveHero = (scroll) => {
      heroVideo.style.transform = `translateY(${scroll * 0.35}px)`;
    };
    if (window.lenis) {
      window.lenis.on('scroll', ({ scroll }) => moveHero(scroll));
    } else {
      let ticking = false;
      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => { moveHero(window.scrollY); ticking = false; });
          ticking = true;
        }
      }, { passive: true });
    }
  }
}
