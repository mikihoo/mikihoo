/*
  Supabase setup required:
  1. Table: weather_entries
     - id          uuid primary key default gen_random_uuid()
     - nickname    text not null
     - message     text not null
     - photo_url   text
     - created_at  timestamptz default now()
  2. Enable Row Level Security, then add policies:
     - SELECT: true (anyone can read)
     - INSERT: true (anyone can insert)
  3. Storage bucket: weather-photos
     - Public bucket
     - Policy: allow INSERT for anon role
*/

const SUPABASE_URL = 'https://bemcdwxyxdguhcrgkhth.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OqRSqp72ZNcx_ZkYF19sDg_apt4HTOD';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const form       = document.getElementById('weatherForm');
const nickInput  = document.getElementById('nickname');
const msgInput   = document.getElementById('message');
const photoInput = document.getElementById('photo');
const fileNameEl = document.getElementById('fileName');
const previewImg = document.getElementById('previewImg');
const submitBtn  = document.getElementById('submitBtn');
const statusEl   = document.getElementById('formStatus');
const listEl     = document.getElementById('entriesList');

// ── Photo preview ──

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) {
    fileNameEl.textContent = '';
    previewImg.style.display = 'none';
    previewImg.src = '';
    return;
  }
  fileNameEl.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    previewImg.style.display = 'block';
  };
  reader.readAsDataURL(file);
});

// ── Submit ──

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nickname = nickInput.value.trim();
  const message  = msgInput.value.trim();

  if (!nickname || !message) {
    statusEl.textContent = '닉네임과 날씨를 모두 적어주세요.';
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = '—';

  let photo_url = null;

  const file = photoInput.files[0];
  if (file) {
    const ext  = file.name.split('.').pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await sb.storage
      .from('weather-photos')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      statusEl.textContent = '사진 업로드에 실패했습니다. 다시 시도해주세요.';
      submitBtn.disabled = false;
      return;
    }

    const { data: urlData } = sb.storage
      .from('weather-photos')
      .getPublicUrl(path);

    photo_url = urlData.publicUrl;
  }

  const { error: insertError } = await sb
    .from('guestbook')
    .insert({ nickname, message, image_url: photo_url });

  if (insertError) {
    statusEl.textContent = '저장에 실패했습니다. 잠시 후 다시 시도해주세요.';
    submitBtn.disabled = false;
    return;
  }

  statusEl.textContent = '남겨졌습니다.';
  form.reset();
  fileNameEl.textContent = '';
  previewImg.style.display = 'none';
  previewImg.src = '';
  submitBtn.disabled = false;

  await loadEntries();
});

// ── Load entries ──

async function loadEntries() {
  const { data, error } = await sb
    .from('guestbook')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(60);

  if (error || !data || data.length === 0) {
    listEl.innerHTML = '<p class="entries-empty">아직 아무것도 없습니다.</p>';
    return;
  }

  listEl.innerHTML = data.map(renderEntry).join('');
}

function renderEntry(entry) {
  const date = formatDate(entry.created_at);
  const photoHtml = entry.image_url
    ? `<img class="entry-photo" src="${escapeAttr(entry.image_url)}" alt="" loading="lazy" />`
    : '';

  return `
    <div class="entry ${entry.image_url ? 'has-photo' : ''}">
      ${photoHtml}
      <div class="entry-meta">
        <span class="entry-nickname">${escapeHtml(entry.nickname)}</span>
        <span class="entry-date">${date}</span>
      </div>
      <div class="entry-message">${escapeHtml(entry.message)}</div>
    </div>
  `;
}

function formatDate(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Init ──

loadEntries();
