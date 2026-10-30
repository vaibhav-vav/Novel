import { login, signup, logout, getUser, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite } from 'https://esm.sh/@netlify/identity@2.0.0?bundle';

const $ = id => document.getElementById(id);
let state = { posts: [], following: false, unread: 0, admin: false };
let signedIn = false;
let destination = 'follow';
let inviteToken;
let loading = false;
let returnFocus;
function show(id) {
  document.querySelectorAll('.modal-overlay.open').forEach(el => closeModal(el.id));
  returnFocus = document.activeElement;
  openModal(id);
  if (id === 'accountModal') {
    const author = destination === 'dashboard';
    $('accountTitle').textContent = author ? 'Author sign in' : 'Reader account';
    $('readerEmail').type = 'email';
    $('readerEmail').autocomplete = 'username';
    $('readerEmail').previousElementSibling.textContent = 'Email';
    $('signupButton').hidden = author; $('recoverButton').hidden = author;
    $('accountModal').querySelector('.community-copy').textContent = author ? 'Sign in to your private writing desk to publish books and chapters.' : 'Sign in to follow the books and see unread updates across your devices.';
    $('accountStatus').textContent = '';
  }
  $(id).querySelector('input, button')?.focus();
}
async function api(method = 'GET', body) {
  await getUser();
  const res = await fetch('/api/community', { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function render() {
  $('unreadBadge').hidden = !state.unread;
  $('unreadBadge').textContent = state.unread > 99 ? '99+' : state.unread;
  $('updatesButton').setAttribute('aria-label', state.unread ? `Updates, ${state.unread} unread` : 'Updates');
  document.querySelectorAll('.follow-action').forEach(b => { b.textContent = state.following ? 'Unfollow' : 'Follow'; b.disabled = false; });
  document.querySelector('.follow-state').textContent = state.following ? 'You’re following. Look for the unread badge beside Updates when you return.' : '';
  $('accountButton').textContent = signedIn ? 'Your reader account' : 'Reader sign in';
  $('accountButton').hidden = signedIn;
  $('logoutButton').hidden = !signedIn;
  $('dashboardButton').hidden = !state.admin;
  if (!state.admin && $('dashboardModal').classList.contains('open')) closeModal('dashboardModal');
  $('updatesList').replaceChildren();
  if (!state.posts.length) {
    const p = document.createElement('p');
    p.className = 'community-copy'; p.textContent = 'No updates yet. Follow to see what’s new when the author publishes.';
    $('updatesList').append(p);
  }
  for (const post of state.posts) {
    const article = document.createElement('article'); article.className = 'update-entry';
    const time = document.createElement('time'); time.dateTime = post.createdAt;
    time.textContent = new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const title = document.createElement('h3'); title.textContent = post.title;
    const body = document.createElement('p'); body.textContent = post.body;
    article.append(time, title, body); $('updatesList').append(article);
  }
}
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    signedIn = !!(await getUser());
    state = await api(); render();
    if ($('updatesModal').classList.contains('open')) await markRead();
  } finally { loading = false; }
}
async function markRead() {
  if (!state.following || !state.posts.length) return;
  await api('PATCH', { lastReadId: state.posts[0].id });
  state.unread = 0; $('unreadBadge').hidden = true;
  $('updatesButton').setAttribute('aria-label', 'Updates');
}
function message(id, error) { $(id).textContent = error.message || String(error); }
async function busy(button, work, statusId) {
  button.disabled = true;
  try { await work(); } catch (e) { message(statusId, e); } finally { button.disabled = false; }
}
async function follow() {
  if (!(await getUser())) { destination = 'follow'; show('accountModal'); return; }
  await api(state.following ? 'DELETE' : 'PUT');
  await refresh();
}
for (const button of document.querySelectorAll('.follow-action')) {
  button.onclick = async () => {
    button.disabled = true;
    try { await follow(); }
    catch (e) {
      if ($('authorDetailsModal').classList.contains('open')) document.querySelector('.follow-state').textContent = e.message;
      else message('communityStatus', e);
    } finally { button.disabled = false; }
  };
}
$('updatesButton').onclick = async () => {
  show('updatesModal'); $('communityStatus').textContent = '';
  await busy($('updatesButton'), refresh, 'communityStatus');
};
$('accountButton').onclick = () => { destination = 'reader'; show('accountModal'); };
$('dashboardButton').onclick = async () => {
  destination = 'dashboard';
  if (!(await getUser())) { show('accountModal'); return; }
  await busy($('dashboardButton'), async () => {
    await refresh();
    if (!state.admin) throw new Error('This account does not have author access. Sign out and use the author account.');
    show('dashboardModal');
  }, 'communityStatus');
};
async function afterLogin() {
  await refresh();
  if (state.admin) {
    show('dashboardModal');
  } else if (destination === 'dashboard') {
    throw new Error('This account does not have author access.');
  } else if (destination === 'follow') {
    await api('PUT'); await refresh(); show('authorDetailsModal');
  } else { show('updatesModal'); await markRead(); }
}
$('accountForm').onsubmit = event => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const username = $('readerEmail').value.trim();
    if (destination === 'dashboard' && username.toLowerCase() !== 'author@vaibhav.bb') throw new Error('Use the designated author account.');
    const email = username;
    await login(email, $('readerPassword').value);
    $('readerPassword').value = ''; await afterLogin();
  }, 'accountStatus');
};
$('signupButton').onclick = () => {
  if (!$('accountForm').reportValidity()) return;
  busy($('signupButton'), async () => {
    const user = await signup($('readerEmail').value.trim(), $('readerPassword').value);
    $('readerPassword').value = '';
    if (user.confirmedAt) await afterLogin();
    else $('accountStatus').textContent = 'Check your email to confirm your account, then sign in and click Follow. Updates are shown on the website only.';
  }, 'accountStatus');
};
$('recoverButton').onclick = () => {
  if (!$('readerEmail').reportValidity()) return;
  busy($('recoverButton'), async () => {
    await requestPasswordRecovery($('readerEmail').value.trim());
    $('accountStatus').textContent = 'Check your email for a password reset link.';
  }, 'accountStatus');
};
$('passwordForm').onsubmit = event => {
  event.preventDefault();
  busy(event.submitter, async () => {
    if (inviteToken) { await acceptInvite(inviteToken, $('newPassword').value); inviteToken = undefined; }
    else await updateUser({ password: $('newPassword').value });
    $('newPassword').value = ''; $('passwordForm').hidden = true; $('accountForm').hidden = false;
    $('accountStatus').textContent = 'Password saved. Your account is ready.';
    await refresh();
  }, 'accountStatus');
};
$('logoutButton').onclick = () => busy($('logoutButton'), async () => { await logout(); await refresh(); $('communityStatus').textContent = 'Signed out.'; }, 'communityStatus');
$('publishForm').onsubmit = event => {
  event.preventDefault();
  busy(event.submitter, async () => {
    await api('POST', { title: $('updateTitle').value, body: $('updateBody').value });
    $('publishForm').reset(); $('publishStatus').textContent = 'Published. Your update is now visible to readers.';
    await refresh();
  }, 'publishStatus');
};
// Trap keyboard focus inside the active dialog.
document.addEventListener('keydown', event => {
  const modal = document.querySelector('.modal-overlay.open');
  if (!modal) return;
  if (event.key === 'Escape') returnFocus?.focus();
  if (event.key !== 'Tab') return;
  const items = [...modal.querySelectorAll('button, input, textarea, select, a[href]')].filter(el => !el.disabled && el.getClientRects().length);
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
try {
  const callback = await handleAuthCallback();
  if (callback?.type === 'invite' || callback?.type === 'recovery') {
    inviteToken = callback.type === 'invite' ? callback.token : undefined;
    show('accountModal'); $('accountForm').hidden = true; $('passwordForm').hidden = false;
    $('accountStatus').textContent = 'Choose a password to finish setting up your account.';
  } else if (callback) {
    destination = 'reader'; show('accountModal');
    $('accountStatus').textContent = 'Email confirmed. Sign in if needed, then select Follow in the author details.';
  }
  await refresh();
} catch (e) { message('communityStatus', e); }
// Refresh while visitors are on the site and when they return to this tab.
setInterval(() => { if (!document.hidden) refresh().catch(e => message('communityStatus', e)); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().catch(e => message('communityStatus', e)); });

window.addEventListener('library-published', () => refresh().catch(e => message('communityStatus', e)));
