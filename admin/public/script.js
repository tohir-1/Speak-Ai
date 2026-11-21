'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TITLES = { dashboard: 'Dashboard', users: 'Foydalanuvchilar', control: 'Bot boshqaruvi' };
const SERVICE_NAMES = { stt: '🎤 Ovoz → Matn', tts: '🔊 Matn → Ovoz', changer: '🎭 Voice Changer', translate: '🌍 Tarjima', summary: '📝 AI Xulosa' };

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('Sessiya tugadi'); }
  if (!res.ok) throw new Error(data.error || `Xato (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

/* ---------- Auth ---------- */
function showLogin() { $('appView').classList.add('hidden'); $('loginView').classList.remove('hidden'); }
function showApp(name) {
  $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden');
  $('meName').textContent = '👤 ' + name;
  route();
}
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    const r = await api('/login', { method: 'POST', body: { username: $('loginUser').value, password: $('loginPass').value } });
    $('loginPass').value = '';
    showApp(r.username);
  } catch (err) { $('loginError').textContent = err.message; }
});
$('logoutBtn').addEventListener('click', async () => { await api('/logout', { method: 'POST', body: {} }).catch(() => {}); showLogin(); });

/* ---------- Navigatsiya ---------- */
function route() {
  const page = (location.hash || '#dashboard').slice(1);
  const name = TITLES[page] ? page : 'dashboard';
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('hidden', p.id !== 'page-' + name));
  document.querySelectorAll('.sidebar nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === name));
  $('pageTitle').textContent = TITLES[name];
  closeSidebar();
  if (name === 'dashboard') loadDashboard();
  if (name === 'users') loadUsers();
  if (name === 'control') loadControl();
}
window.addEventListener('hashchange', route);
const openSidebar = () => { $('sidebar').classList.add('open'); $('backdrop').classList.add('show'); };
const closeSidebar = () => { $('sidebar').classList.remove('open'); $('backdrop').classList.remove('show'); };
$('menuBtn').addEventListener('click', openSidebar);
$('backdrop').addEventListener('click', closeSidebar);

/* ---------- Dashboard ---------- */
async function loadDashboard() {
  try {
    const d = await api('/dashboard');
    const cards = [
      ['👥', d.totalUsers, 'Jami foydalanuvchilar'], ['🆕', d.todayUsers, 'Bugungi yangilar'],
      ['🎧', d.totalAudio, 'Qayta ishlangan audio'], ['🎤', d.stt, 'Ovoz → Matn'],
      ['🔊', d.tts, 'Matn → Ovoz'], ['🎭', d.changer, 'Voice Changer'],
      ['🌍', d.translate, 'Tarjimalar'], ['📝', d.summary, 'Xulosalar'],
      ['👥', d.totalReferrals, 'Referrallar'], ['🚫', d.blockedUsers, 'Bloklanganlar'],
    ];
    $('cards').innerHTML = cards.map(([i, n, l]) => `<div class="card stat"><span class="icon">${i}</span><span class="num">${Number(n).toLocaleString()}</span><span class="label">${esc(l)}</span></div>`).join('');
    $('topRef').innerHTML = d.topReferrers.length
      ? d.topReferrers.map((r, i) => `<div class="item"><span>${i + 1}. ${esc(r.username ? '@' + r.username : r.first_name || r.id)}</span><b>${r.c}</b></div>`).join('')
      : '<p class="muted">Hozircha ma’lumot yo‘q</p>';
    drawChart(d.series);
  } catch (e) { toast(e.message); }
}

function drawChart({ days, users, jobs }) {
  const c = $('chart');
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = 260;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  const pad = { l: 36, r: 10, t: 10, b: 28 };
  const max = Math.max(4, ...users, ...jobs);
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, days.length - 1);
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  g.strokeStyle = '#243049'; g.fillStyle = '#8e9bb5'; g.font = '11px system-ui'; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((max * i) / 4), yy = y(v);
    g.beginPath(); g.moveTo(pad.l, yy); g.lineTo(w - pad.r, yy); g.stroke();
    g.textAlign = 'right'; g.fillText(v, pad.l - 6, yy + 4);
  }
  g.textAlign = 'center';
  days.forEach((d, i) => { if (i % 2 === 0 || days.length < 8) g.fillText(d.slice(5), x(i), h - 8); });
  const line = (arr, color) => {
    g.strokeStyle = color; g.lineWidth = 2.5; g.beginPath();
    arr.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)))); g.stroke();
    g.fillStyle = color; arr.forEach((v, i) => { g.beginPath(); g.arc(x(i), y(v), 3, 0, 7); g.fill(); });
  };
  line(users, '#5b8cff'); line(jobs, '#34d399');
}
window.addEventListener('resize', () => { if (!$('page-dashboard').classList.contains('hidden')) loadDashboard(); });

/* ---------- Foydalanuvchilar ---------- */
const state = { page: 1, pages: 1, q: '' };
async function loadUsers() {
  try {
    const d = await api(`/users?page=${state.page}&q=${encodeURIComponent(state.q)}`);
    state.pages = d.pages;
    $('userTotal').textContent = `Jami: ${d.total}`;
    $('pageInfo').textContent = `${d.page} / ${d.pages}`;
    $('prevPage').disabled = d.page <= 1; $('nextPage').disabled = d.page >= d.pages;
    $('userRows').innerHTML = d.rows.map((u) => `
      <tr>
        <td><a href="#users" data-view="${u.id}">${u.id}</a></td>
        <td>${u.username ? '@' + esc(u.username) : '—'}</td><td>${esc(u.first_name || '—')}</td>
        <td>${esc(u.created_at)}</td><td>${u.stt}</td><td>${u.tts}</td><td>${u.changer}</td><td>${u.referrals}</td>
        <td><span class="badge ${u.is_blocked ? 'bad' : 'ok'}">${u.is_blocked ? 'Bloklangan' : 'Faol'}</span></td>
        <td><button class="btn sm ${u.is_blocked ? 'ok' : 'danger'}" data-toggle="${u.id}" data-blocked="${u.is_blocked}">${u.is_blocked ? 'Blokdan chiqarish' : 'Bloklash'}</button></td>
      </tr>`).join('') || '<tr><td colspan="10" class="muted">Hech narsa topilmadi</td></tr>';
  } catch (e) { toast(e.message); }
}
let searchTimer;
$('userSearch').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; loadUsers(); }, 300); });
$('prevPage').addEventListener('click', () => { if (state.page > 1) { state.page--; loadUsers(); } });
$('nextPage').addEventListener('click', () => { if (state.page < state.pages) { state.page++; loadUsers(); } });
$('userRows').addEventListener('click', async (e) => {
  const view = e.target.closest('[data-view]');
  if (view) { e.preventDefault(); return openUser(view.dataset.view); }
  const t = e.target.closest('[data-toggle]');
  if (!t) return;
  const blocked = t.dataset.blocked === '1';
  if (!blocked && !confirm('Foydalanuvchini bloklaysizmi?')) return;
  try { await api(`/users/${t.dataset.toggle}/${blocked ? 'unblock' : 'block'}`, { method: 'POST', body: {} }); toast(blocked ? '✅ Blokdan chiqarildi' : '🚫 Bloklandi'); loadUsers(); } catch (err) { toast(err.message); }
});
async function openUser(id) {
  try {
    const u = await api('/users/' + id);
    $('modalBody').innerHTML = `<h3>👤 ${esc(u.first_name || '')} ${u.username ? '(@' + esc(u.username) + ')' : ''}</h3>
      <dl class="kv"><dt>Telegram ID</dt><dd>${u.id}</dd><dt>Ro‘yxatdan o‘tgan</dt><dd>${esc(u.created_at)}</dd><dt>Oxirgi faollik</dt><dd>${esc(u.last_seen)}</dd>
      <dt>🎤 Ovoz → Matn</dt><dd>${u.stt_count || 0}</dd><dt>🔊 Matn → Ovoz</dt><dd>${u.tts_count || 0}</dd><dt>🎭 Voice Changer</dt><dd>${u.changer_count || 0}</dd>
      <dt>🌍 Tarjimalar</dt><dd>${u.translate_count || 0}</dd><dt>📝 Xulosalar</dt><dd>${u.summary_count || 0}</dd><dt>👥 Takliflar</dt><dd>${u.referrals}</dd>
      <dt>Holat</dt><dd>${u.is_blocked ? '🚫 Bloklangan' : '✅ Faol'}</dd></dl>`;
    $('modal').classList.remove('hidden');
  } catch (e) { toast(e.message); }
}
const closeModal = () => $('modal').classList.add('hidden');
$('modalClose').addEventListener('click', closeModal);
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ---------- Bot boshqaruvi ---------- */
let bcTimer;
async function loadControl() {
  try {
    const s = await api('/settings');
    $('aboutText').value = s.about_text;
    $('services').innerHTML = Object.entries(SERVICE_NAMES).map(([k, n]) => `<label class="switch"><span>${n}</span><input type="checkbox" data-service="${k}" ${s.services[k] ? 'checked' : ''}></label>`).join('');
    loadAdmins();
    pollBroadcast();
  } catch (e) { toast(e.message); }
}
$('saveSettings').addEventListener('click', async () => {
  const services = {};
  document.querySelectorAll('[data-service]').forEach((i) => { services[i.dataset.service] = i.checked; });
  try { await api('/settings', { method: 'PUT', body: { about_text: $('aboutText').value, services } }); toast('✅ Saqlandi'); } catch (e) { toast(e.message); }
});
$('bcSend').addEventListener('click', async () => {
  const text = $('bcText').value.trim();
  if (!text) return toast('Xabar matnini kiriting');
  if (!confirm('Xabar barcha foydalanuvchilarga yuboriladi. Davom etasizmi?')) return;
  $('bcSend').disabled = true;
  try { await api('/broadcast', { method: 'POST', body: { text } }); $('bcText').value = ''; pollBroadcast(); } catch (e) { toast(e.message); $('bcSend').disabled = false; }
});
async function pollBroadcast() {
  clearTimeout(bcTimer);
  try {
    const s = await api('/broadcast/status');
    if (s.total) $('bcStatus').textContent = `${s.running ? '⏳ Yuborilmoqda' : '✅ Tugadi'}: ${s.sent}/${s.total} (xato: ${s.failed})`;
    $('bcSend').disabled = s.running;
    if (s.running) bcTimer = setTimeout(pollBroadcast, 1500);
  } catch { /* ignore */ }
}
async function loadAdmins() {
  const list = await api('/admins');
  $('adminRows').innerHTML = list.map((a) => `<tr><td>${a.id}</td><td>${esc(a.username)}</td><td>${a.telegram_id || '—'}</td><td>${esc(a.created_at)}</td><td><button class="btn sm danger" data-del="${a.id}">O‘chirish</button></td></tr>`).join('');
}
$('adminRows').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del]');
  if (!b || !confirm('Adminni o‘chirasizmi?')) return;
  try { await api('/admins/' + b.dataset.del, { method: 'DELETE' }); loadAdmins(); } catch (err) { toast(err.message); }
});
$('adminForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/admins', { method: 'POST', body: { username: $('newAdminUser').value, password: $('newAdminPass').value, telegram_id: $('newAdminTg').value || null } });
    $('adminForm').reset(); $('adminMsg').textContent = ''; toast('✅ Admin qo‘shildi'); loadAdmins();
  } catch (err) { $('adminMsg').textContent = err.message; }
});

/* ---------- Start ---------- */
(async () => {
  try { const me = await api('/me'); showApp(me.username); } catch { showLogin(); }
})();
