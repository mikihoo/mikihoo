const SUPABASE_URL = 'https://bemcdwxyxdguhcrgkhth.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlbWNkd3h5eGRndWhjcmdraHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjMzOTgsImV4cCI6MjA5NjU5OTM5OH0.GrPUSR7EKSlOGXVI7gxQnwvQvwZBUcuOi2I9EsbrNxk';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const isAdmin = new URLSearchParams(location.search).has('admin');

// ── DOM refs ──
const adminPanel  = document.getElementById('adminPanel');
const loginBox    = document.getElementById('loginBox');
const writeBox    = document.getElementById('writeBox');
const loginBtn    = document.getElementById('loginBtn');
const logoutBtn   = document.getElementById('logoutBtn');
const postBtn     = document.getElementById('postBtn');
const loginStatus = document.getElementById('loginStatus');
const postStatus  = document.getElementById('postStatus');
const archiveList = document.getElementById('archiveList');
const postPhoto   = document.getElementById('postPhoto');
const postPreview = document.getElementById('postPreview');
const postFileName= document.getElementById('postFileName');

// ── Admin panel visibility ──
if (isAdmin) {
  adminPanel.style.display = 'block';
  sb.auth.getSession().then(({ data }) => {
    if (data.session) showWriteBox();
  });
}

// ── Photo preview ──
postPhoto.addEventListener('change', () => {
  const file = postPhoto.files[0];
  if (!file) { postPreview.style.display = 'none'; postFileName.textContent = ''; return; }
  postFileName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => { postPreview.src = e.target.result; postPreview.style.display = 'block'; };
  reader.readAsDataURL(file);
});

// ── Login ──
loginBtn.addEventListener('click', async () => {
  const email    = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  loginBtn.disabled = true;
  loginStatus.textContent = '—';

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    loginStatus.textContent = error.message;
    loginBtn.disabled = false;
    return;
  }
  showWriteBox();
});

// ── Logout ──
logoutBtn.addEventListener('click', async () => {
  await sb.auth.signOut();
  writeBox.style.display = 'none';
  loginBox.style.display = 'block';
});

// ── Submit post ──
postBtn.addEventListener('click', async () => {
  const title   = document.getElementById('postTitle').value.trim();
  const excerpt = document.getElementById('postExcerpt').value.trim();
  const date    = document.getElementById('postDate').value.trim();

  if (!title) { postStatus.textContent = '제목을 입력해주세요.'; return; }

  postBtn.disabled = true;
  postStatus.textContent = '—';

  let image_url = null;
  const file = postPhoto.files[0];
  if (file) {
    const ext  = file.name.split('.').pop();
    const path = `archive/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await sb.storage
      .from('weather-photos')
      .upload(path, file, { contentType: file.type });
    if (upErr) {
      postStatus.textContent = `사진 업로드 실패: ${upErr.message}`;
      postBtn.disabled = false;
      return;
    }
    image_url = sb.storage.from('weather-photos').getPublicUrl(path).data.publicUrl;
  }

  const { error } = await sb
    .from('archive_posts')
    .insert({ title, excerpt: excerpt || null, image_url, post_date: date || null });

  if (error) {
    postStatus.textContent = `저장 실패: ${error.message}`;
    postBtn.disabled = false;
    return;
  }

  postStatus.textContent = '올라갔습니다.';
  document.getElementById('postTitle').value   = '';
  document.getElementById('postExcerpt').value = '';
  document.getElementById('postDate').value    = '';
  postPhoto.value = '';
  postPreview.style.display = 'none';
  postFileName.textContent  = '';
  postBtn.disabled = false;

  await loadArchive();
});

// ── Load archive ──
async function loadArchive() {
  const { data, error } = await sb
    .from('archive_posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    archiveList.innerHTML = '<p class="entries-empty" style="padding:2rem 0;">—</p>';
    return;
  }

  archiveList.innerHTML = data.map(renderCard).join('');

  // delete buttons (admin only)
  if (isAdmin) {
    archiveList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('삭제할까요?')) return;
        await sb.from('archive_posts').delete().eq('id', id);
        await loadArchive();
      });
    });
  }
}

function renderCard(post) {
  const imgHtml = post.image_url
    ? `<div class="archive-card-img"><img src="${escapeAttr(post.image_url)}" alt="" loading="lazy" /></div>`
    : '';

  const deleteBtn = isAdmin
    ? `<button class="delete-btn" data-id="${escapeAttr(post.id)}" style="font-size:0.62rem;letter-spacing:0.1em;color:var(--text-faint);background:none;border:none;cursor:pointer;margin-top:0.6rem;font-family:'EB Garamond',serif;opacity:0.5;">삭제</button>`
    : '';

  return `
    <div class="archive-card ${post.image_url ? '' : 'no-img'}">
      ${imgHtml}
      <div class="archive-card-body">
        ${post.post_date ? `<div class="archive-card-date">${escapeHtml(post.post_date)}</div>` : ''}
        <div class="archive-card-title">${escapeHtml(post.title)}</div>
        ${post.excerpt ? `<div class="archive-card-excerpt">${escapeHtml(post.excerpt)}</div>` : ''}
        ${deleteBtn}
      </div>
    </div>
  `;
}

function showWriteBox() {
  loginBox.style.display = 'none';
  writeBox.style.display = 'block';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Init ──
loadArchive();
