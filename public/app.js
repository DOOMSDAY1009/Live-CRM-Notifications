/* ---------------------------------------------------------------------
   Signal — vanilla-JS frontend for the Live CRM Notification demo.
   No build step required; served by the Express static middleware.
------------------------------------------------------------------------*/

const API_BASE = '/api';
let state = {
  token: localStorage.getItem('signal_token') || null,
  user: JSON.parse(localStorage.getItem('signal_user') || 'null'),
  companies: [],
  contacts: [],
  users: [],
  assignments: [],
};
let socket = null;

// ---------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  try {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
    state.token = token;
    state.user = user;
    localStorage.setItem('signal_token', token);
    localStorage.setItem('signal_user', JSON.stringify(user));
    boot();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('signal_token');
  localStorage.removeItem('signal_user');
  if (socket) socket.disconnect();
  state = { ...state, token: null, user: null };
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
});

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
async function boot() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';
  document.getElementById('me-name').textContent = state.user.name;
  document.getElementById('me-role').textContent = state.user.role.toLowerCase();
  document.getElementById('me-avatar').textContent = initials(state.user.name);

  if (state.user.role !== 'ADMIN') {
    document.getElementById('run-job-btn').style.display = 'none';
  } else {
    document.getElementById('assignments-admin-note').textContent = '// admin view — all assignments';
  }

  connectSocket();
  await refreshAll();
  await refreshNotifications();
}

function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

// ---------------------------------------------------------------------
// Connection state — drives the signal-bars mark + status label
// ---------------------------------------------------------------------
function setConnState(mode, label) {
  document.querySelectorAll('.signal-bars').forEach((el) => (el.dataset.state = mode));
  const status = document.getElementById('conn-status');
  status.classList.remove('live', 'error');
  if (mode === 'live') status.classList.add('live');
  if (mode === 'error') status.classList.add('error');
  document.getElementById('conn-label').textContent = label;
}

function connectSocket() {
  socket = io({ auth: { token: state.token } });

  socket.on('connect', () => {
    setConnState('live', 'live');
    pushDispatchLine('connection established — listening for live events', { system: true });
  });

  socket.on('disconnect', () => {
    setConnState('idle', 'disconnected');
    pushDispatchLine('connection lost', { system: true });
  });

  socket.on('connect_error', (err) => {
    setConnState('error', `error: ${err.message}`);
  });

  // The core live-delivery behavior: this event only ever arrives for
  // notifications addressed to the logged-in user (see server room scoping).
  socket.on('notification', (notification) => {
    prependNotification(notification);
    bumpUnreadBadge(1);
    showToast(notification);
    pushDispatchLine(notification.message, { tag: notification.type === 'REMINDER' ? 'reminder' : 'live' });
  });
}

// ---------------------------------------------------------------------
// Dispatch log — signature element. Typewriter-reveals each line so the
// "live" part of "live notifications" is something you can actually watch
// happen, not just infer from a badge count changing.
// ---------------------------------------------------------------------
const MAX_DISPATCH_LINES = 40;

function pushDispatchLine(text, { system = false, tag = null } = {}) {
  const log = document.getElementById('dispatch-log');
  if (!log) return;

  const line = document.createElement('div');
  line.className = 'dispatch-line' + (system ? ' system' : '');

  const time = new Date().toLocaleTimeString([], { hour12: false });
  const prefix = tag ? `[${tag}] ` : '';

  line.innerHTML = `<span class="dispatch-time">${time}</span><span class="dispatch-caret">&gt;</span><span class="dispatch-text"></span>`;
  log.appendChild(line);

  const textEl = line.querySelector('.dispatch-text');
  const fullText = prefix + text;
  textEl.textContent = fullText;
  textEl.style.display = 'inline-block';
  textEl.style.overflow = 'hidden';
  textEl.style.whiteSpace = 'nowrap';
  textEl.style.width = '0px';

  const naturalWidth = textEl.scrollWidth;
  const steps = Math.max(fullText.length, 1);
  const duration = Math.min(1.1, 0.12 + fullText.length * 0.01);

  requestAnimationFrame(() => {
    textEl.style.transition = `width ${duration}s steps(${steps}, end)`;
    textEl.style.width = naturalWidth + 'px';
  });

  while (log.children.length > MAX_DISPATCH_LINES) {
    log.removeChild(log.firstChild);
  }
  log.scrollTop = log.scrollHeight;
}

// ---------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------
async function refreshAll() {
  const [companies, contacts, users] = await Promise.all([
    api('/companies'),
    api('/contacts'),
    api('/users'),
  ]);
  state.companies = companies;
  state.contacts = contacts;
  state.users = users;

  renderCompanies();
  renderContacts();
  populateContactCompanySelect();
  populateAssignUserSelect();

  if (state.user.role === 'ADMIN') {
    state.assignments = await api('/assignments');
    renderAssignmentsTable();
  } else {
    document.getElementById('assignments-table-wrap').innerHTML =
      '<div class="empty-box">Only admins can view the full assignment list. Your own assignments still show as chips on each company/contact card, and every notification you receive shows up via the bell icon.</div>';
  }
}

async function refreshNotifications() {
  const { notifications, unreadCount } = await api('/notifications');
  renderNotifications(notifications);
  setUnreadBadge(unreadCount);

  // Seed the dispatch log with recent history so it isn't empty on load.
  const recent = notifications.slice(0, 6).reverse();
  recent.forEach((n) => pushDispatchLine(n.message, { tag: n.type === 'REMINDER' ? 'reminder' : 'past', system: false }));
  pushDispatchLine(`session started for ${state.user.email}`, { system: true });
}

// ---------------------------------------------------------------------
// Rendering: Companies / Contacts
// ---------------------------------------------------------------------
function renderCompanies() {
  const el = document.getElementById('companies-list');
  el.innerHTML = state.companies.map((c) => `
    <div class="card">
      <div class="card-title">${escapeHtml(c.name)}</div>
      <div class="card-sub">${escapeHtml(c.industry || 'no industry set')} · ${c.contacts.length} contact(s)</div>
      ${renderAssignmentChips(c.assignments)}
      <button class="btn btn-ghost btn-small" data-assign="COMPANY:${c.id}:${escapeAttr(c.name)}">assign to user</button>
    </div>
  `).join('') || '<div class="empty-box">No companies yet. Create one to get started.</div>';
  wireAssignButtons(el);
}

function renderContacts() {
  const el = document.getElementById('contacts-list');
  el.innerHTML = state.contacts.map((c) => `
    <div class="card">
      <div class="card-title">${escapeHtml(c.name)}</div>
      <div class="card-sub">${escapeHtml(c.company ? c.company.name : 'no company')} · ${escapeHtml(c.email || 'no email')}</div>
      ${renderAssignmentChips(c.assignments)}
      <button class="btn btn-ghost btn-small" data-assign="CONTACT:${c.id}:${escapeAttr(c.name)}">assign to user</button>
    </div>
  `).join('') || '<div class="empty-box">No contacts yet. Create one to get started.</div>';
  wireAssignButtons(el);
}

function renderAssignmentChips(assignments) {
  if (!assignments || !assignments.length) {
    return '<div class="card-assignments"><span class="card-empty-assignments">unassigned</span></div>';
  }
  return `<div class="card-assignments">${assignments.map((a) => `
    <div class="assignment-chip">
      <span class="chip-who"><span class="chip-avatar">${escapeHtml(initials(a.user.name))}</span>${escapeHtml(a.user.name)}</span>
      <span class="role">${escapeHtml(a.role)}</span>
    </div>
  `).join('')}</div>`;
}

function renderAssignmentsTable() {
  const wrap = document.getElementById('assignments-table-wrap');
  if (!state.assignments.length) {
    wrap.innerHTML = '<div class="empty-box">No assignments yet — assign a company or contact to a user to create one.</div>';
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>user</th><th>entity</th><th>role</th><th>reminder sent</th><th>created</th></tr></thead>
      <tbody>
        ${state.assignments.map((a) => `
          <tr>
            <td>${escapeHtml(a.user.name)}</td>
            <td>${a.entityType} #${a.entityId}</td>
            <td>${escapeHtml(a.role)}</td>
            <td>${a.reminderSent ? 'yes' : 'no'}</td>
            <td>${new Date(a.createdAt).toLocaleString()}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ---------------------------------------------------------------------
// Rendering: notifications
// ---------------------------------------------------------------------
function renderNotifications(notifications) {
  const el = document.getElementById('notif-list');
  if (!notifications.length) {
    el.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }
  el.innerHTML = notifications.map(notifItemHtml).join('');
  wireNotifItems(el);
}

function prependNotification(n) {
  const el = document.getElementById('notif-list');
  if (el.querySelector('.notif-empty')) el.innerHTML = '';
  el.insertAdjacentHTML('afterbegin', notifItemHtml(n));
  wireNotifItems(el);
}

function notifItemHtml(n) {
  return `
    <div class="notif-item ${n.isRead ? '' : 'unread'}" data-id="${n.id}">
      <div class="notif-msg">${escapeHtml(n.message)}</div>
      <div class="notif-meta">
        <span class="notif-type-pill ${n.type}">${n.type.toLowerCase()}</span>
        <span>${new Date(n.createdAt).toLocaleTimeString()}${n.isRead ? '' : ' · click to mark read'}</span>
      </div>
    </div>
  `;
}

function wireNotifItems(container) {
  container.querySelectorAll('.notif-item.unread').forEach((item) => {
    item.onclick = async () => {
      const id = item.dataset.id;
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
      item.classList.remove('unread');
      item.querySelector('.notif-meta span:last-child').textContent =
        new Date().toLocaleTimeString();
      bumpUnreadBadge(-1);
      pushDispatchLine(`notification #${id} marked read`, { system: true });
    };
  });
}

function setUnreadBadge(count) {
  const badge = document.getElementById('unread-badge');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function bumpUnreadBadge(delta) {
  const badge = document.getElementById('unread-badge');
  const current = Number(badge.textContent || '0');
  setUnreadBadge(Math.max(0, current + delta));
}

function showToast(n) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast' + (n.type === 'REMINDER' ? ' type-reminder' : '');
  toast.innerHTML = `<strong>${n.type === 'REMINDER' ? 'reminder' : 'new assignment'}</strong>${escapeHtml(n.message)}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

document.getElementById('bell-btn').addEventListener('click', () => {
  const dd = document.getElementById('notif-dropdown');
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
});
document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.bell-wrap');
  if (!wrap.contains(e.target)) document.getElementById('notif-dropdown').style.display = 'none';
});
document.getElementById('mark-all-read').addEventListener('click', async () => {
  await api('/notifications/read-all', { method: 'PATCH' });
  document.querySelectorAll('.notif-item.unread').forEach((i) => i.classList.remove('unread'));
  setUnreadBadge(0);
  pushDispatchLine('all notifications marked read', { system: true });
});

// ---------------------------------------------------------------------
// Background job trigger (admin demo convenience)
// ---------------------------------------------------------------------
document.getElementById('run-job-btn').addEventListener('click', async () => {
  const btn = document.getElementById('run-job-btn');
  btn.disabled = true;
  btn.textContent = 'running…';
  try {
    const { created } = await api('/jobs/run-followup', { method: 'POST' });
    btn.textContent = `run background job (${created} created)`;
    pushDispatchLine(`follow-up scan complete — ${created} reminder(s) created`, { system: true });
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = 'run background job'; }, 2500);
  }
});

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(view) {
  // Two nav lists exist (sidebar + mobile bottom nav) sharing data-view —
  // keep both in sync regardless of which one was clicked.
  document.querySelectorAll('.nav-item').forEach((b) => {
    const active = b.dataset.view === view;
    b.classList.toggle('active', active);
    b.querySelector('.nav-caret').innerHTML = active ? '&gt;' : '&nbsp;';
  });
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
}

// ---------------------------------------------------------------------
// Modals: new company / new contact / assign
// ---------------------------------------------------------------------
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

document.querySelectorAll('[data-close-modal]').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('.modal-overlay').style.display = 'none');
});

document.getElementById('new-company-btn').addEventListener('click', () => openModal('modal-company'));
document.getElementById('new-contact-btn').addEventListener('click', () => openModal('modal-contact'));

document.getElementById('form-company').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('company-name').value;
  const industry = document.getElementById('company-industry').value;
  await api('/companies', { method: 'POST', body: { name, industry } });
  closeModal('modal-company');
  e.target.reset();
  await refreshAll();
  pushDispatchLine(`company created: ${name}`, { system: true });
});

document.getElementById('form-contact').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('contact-name').value;
  const email = document.getElementById('contact-email').value;
  const phone = document.getElementById('contact-phone').value;
  const companyId = document.getElementById('contact-company').value || null;
  await api('/contacts', { method: 'POST', body: { name, email, phone, companyId } });
  closeModal('modal-contact');
  e.target.reset();
  await refreshAll();
  pushDispatchLine(`contact created: ${name}`, { system: true });
});

function populateContactCompanySelect() {
  const sel = document.getElementById('contact-company');
  sel.innerHTML = '<option value="">— none —</option>' +
    state.companies.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

function populateAssignUserSelect() {
  const sel = document.getElementById('assign-user');
  sel.innerHTML = state.users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)} (${u.role.toLowerCase()})</option>`).join('');
}

function wireAssignButtons(container) {
  container.querySelectorAll('[data-assign]').forEach((btn) => {
    btn.onclick = () => {
      const [entityType, entityId, entityName] = btn.dataset.assign.split(':');
      document.getElementById('assign-entity-type').value = entityType;
      document.getElementById('assign-entity-id').value = entityId;
      document.getElementById('assign-entity-label').textContent = `assigning: ${entityName} (${entityType.toLowerCase()})`;
      openModal('modal-assign');
    };
  });
}

document.getElementById('form-assign').addEventListener('submit', async (e) => {
  e.preventDefault();
  const entityType = document.getElementById('assign-entity-type').value;
  const entityId = document.getElementById('assign-entity-id').value;
  const userId = document.getElementById('assign-user').value;
  const role = document.getElementById('assign-role').value;

  try {
    await api('/assignments', { method: 'POST', body: { entityType, entityId, userId, role } });
    closeModal('modal-assign');
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
});

// ---------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str).replace(/:/g, '%3A'); }

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
if (state.token && state.user) {
  boot();
} else {
  document.getElementById('login-screen').style.display = 'flex';
}
