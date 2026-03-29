// ============================================================
//  DevMatch — App Logic (Real Users, Auth-Guarded)
// ============================================================

// ---- App State ----
let ME = null;            // current logged-in user
let cardQueue = [];       // users to swipe on
let filteredSkill = '';
let filteredProjectTag = '';
let currentChatPartnerId = null;
let currentChatUnsubscribe = null;
let currentProjectDetail = null;
let activeDrag = null;
let startX = 0, currentX = 0, currentY = 0;
let isDragging = false;

// ============================================================
//  INIT
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  // Auth guard
  ME = DB.getCurrentUser();
  if (!ME) {
    window.location.replace('auth.html');
    return;
  }

  // Ensure avatar exists
  DB.ensureAvatar(ME);

  // Sync from cloud if Firebase available
  await DB.init();
  if (DB._mode === 'firebase') {
    await DB.syncAllUsersFromCloud().catch(() => {});
    await DB.syncProjectsFromCloud().catch(() => {});
    ME = await DB.syncUserFromCloud(ME.id).catch(() => ME);
  }

  // Show DB mode badge
  const badge = document.getElementById('dbModeBadge');
  if (DB._mode === 'firebase') {
    badge.textContent = '☁️ Cloud';
    badge.title = 'Connected to Firebase cloud database';
    badge.classList.add('cloud');
  } else {
    badge.textContent = '💾 Local';
    badge.title = 'Running in local mode (localStorage). Add Firebase config to db.js for cloud sync.';
    badge.classList.add('local');
  }

  applyProfileToUI();
  buildCardQueue();
  renderCards();
  renderMatches();
  renderProjects();
  renderChatList();
  updateBadges();
});

// ============================================================
//  PROFILE
// ============================================================
function applyProfileToUI() {
  document.getElementById('profileName').textContent    = ME.name;
  document.getElementById('profileTitle').textContent   = ME.title;
  document.getElementById('profileEmail').textContent   = ME.email;
  document.getElementById('profileBio').value           = ME.bio || '';
  document.getElementById('githubInput').value          = ME.github ? `https://github.com/${ME.github}` : '';
  document.getElementById('profileAvatar').src          = ME.avatar;
  document.getElementById('navAvatar').src              = ME.avatar;
  document.getElementById('statMatches').textContent    = DB.getMatches(ME.id).length;
  document.getElementById('statLikes').textContent      = DB.getSwipes(ME.id).right.length + DB.getSwipes(ME.id).super.length;
  document.getElementById('statProjects').textContent   = DB.getProjects().filter(p => p.ownerId === ME.id).length;

  // Looking For checkboxes
  const lf = ME.lookingFor || [];
  [['lf-frontend','Frontend Dev'],['lf-backend','Backend Dev'],['lf-ml','AI/ML Engineer'],
   ['lf-design','UI/UX Designer'],['lf-devops','DevOps Engineer'],['lf-mobile','Mobile Dev'],
   ['lf-cofounder','Co-founder'],['lf-mentor','Mentor']].forEach(([id, label]) => {
    const el = document.getElementById(id);
    if (el) el.checked = lf.includes(label);
  });

  // Availability
  const avail = ME.availability || 'Flexible';
  const radio = document.querySelector(`input[name="avail"][value="${avail}"]`);
  if (radio) radio.checked = true;

  renderProfileSkills();
  updateCompletionBar();
}

function updateCompletionBar() {
  const fields = [
    !!ME.name, !!ME.title, !!ME.bio, !!ME.github,
    ME.skills?.length > 0, ME.lookingFor?.length > 0,
    !!ME.location, ME.avatar && !ME.avatar.startsWith('data:image/png'),
  ];
  const done = fields.filter(Boolean).length;
  const pct = Math.round((done / fields.length) * 100);

  document.getElementById('completionPct').textContent = pct + '%';
  document.getElementById('completionFill').style.width = pct + '%';
  document.getElementById('completionFill').style.background =
    pct < 40 ? '#ff4444' : pct < 70 ? '#ffd700' : 'var(--primary)';

  const hints = [];
  if (!ME.bio) hints.push('add a bio');
  if (!ME.github) hints.push('link your GitHub');
  if (!ME.skills?.length) hints.push('add your skills');
  if (!ME.lookingFor?.length) hints.push('set what you\'re looking for');
  document.getElementById('completionHint').textContent =
    hints.length ? '💡 To improve: ' + hints.slice(0, 2).join(', ') : '✅ Great profile!';
}

async function saveProfile() {
  ME.name         = document.getElementById('profileName').textContent.trim();
  ME.title        = document.getElementById('profileTitle').textContent.trim();
  ME.bio          = document.getElementById('profileBio').value;
  let ghUrl = document.getElementById('githubInput').value.trim();
  if (ghUrl.includes('github.com/')) ghUrl = ghUrl.split('github.com/')[1].split('/')[0];
  ME.github       = ghUrl.replace('@', '');
  ME.availability = document.querySelector('input[name="avail"]:checked')?.value || 'Flexible';

  // Looking for
  ME.lookingFor = [];
  [['lf-frontend','Frontend Dev'],['lf-backend','Backend Dev'],['lf-ml','AI/ML Engineer'],
   ['lf-design','UI/UX Designer'],['lf-devops','DevOps Engineer'],['lf-mobile','Mobile Dev'],
   ['lf-cofounder','Co-founder'],['lf-mentor','Mentor']].forEach(([id, label]) => {
    if (document.getElementById(id)?.checked) ME.lookingFor.push(label);
  });

  ME.profileComplete = !!(ME.bio && ME.skills?.length && ME.lookingFor?.length && ME.github);

  // Update initials/color if name changed
  ME.initials = ME.name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (!ME.avatarCustom) ME.avatar = DB.generateAvatar(ME.initials, ME.color);

  document.getElementById('navAvatar').src = ME.avatar;
  document.getElementById('profileAvatar').src = ME.avatar;

  await DB.saveUserProfile(ME);
  DB.setSession(ME.id); // refresh session
  updateCompletionBar();
  showToast('✅ Profile saved!');
}

function uploadAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    ME.avatar = ev.target.result;
    ME.avatarCustom = true;
    document.getElementById('profileAvatar').src = ev.target.result;
    document.getElementById('navAvatar').src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// Skills
function addSkillOnEnter(e) { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }

function addSkill() {
  const input = document.getElementById('skillInput');
  const val = input.value.trim();
  if (!val) return;
  if (!ME.skills) ME.skills = [];
  if (!ME.skills.includes(val)) {
    ME.skills.push(val);
    renderProfileSkills();
  }
  input.value = '';
}

function removeSkill(skill) {
  ME.skills = ME.skills.filter(s => s !== skill);
  renderProfileSkills();
}

function renderProfileSkills() {
  const el = document.getElementById('profileSkills');
  el.innerHTML = (ME.skills || []).map(s => `
    <span class="skill-tag remove" style="background:${skillColor(s)}22;border-color:${skillColor(s)}77;color:${skillColor(s)}">
      ${s} <button onclick="removeSkill('${s.replace(/'/g, "\\'")}')" title="Remove">×</button>
    </span>
  `).join('');
  updateCompletionBar();
}

// GitHub Stats
async function loadGitHubStats() {
  let username = document.getElementById('githubInput').value.trim();
  if (username.includes('github.com/')) username = username.split('github.com/')[1].split('/')[0];
  username = username.replace('@', '');

  const panel = document.getElementById('githubStats');
  if (!username) { showToast('⚠️ Enter a GitHub profile URL first.'); return; }

  panel.innerHTML = '<div class="loading-spinner"></div><p style="color:var(--text3);margin-top:8px;font-size:.85rem">Loading GitHub data...</p>';
  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`),
      fetch(`https://api.github.com/users/${username}/repos?per_page=10&sort=updated`),
    ]);
    if (!userRes.ok) throw new Error('GitHub user not found');
    const data = await userRes.json();
    const repos = await reposRes.json();

    const langs = {};
    repos.forEach(r => { if (r.language) langs[r.language] = (langs[r.language] || 0) + 1; });
    const topLangs = Object.entries(langs).sort((a,b) => b[1]-a[1]).slice(0,5);
    const totalStars = repos.reduce((a, r) => a + r.stargazers_count, 0);

    panel.innerHTML = `
      <div class="github-profile">
        <img src="${data.avatar_url}" alt="${data.login}" class="gh-avatar" />
        <div class="gh-info">
          <h4>${data.name || data.login}</h4>
          <p>${data.bio || 'No bio on GitHub'}</p>
          <div class="gh-stats">
            <span>📦 ${data.public_repos} repos</span>
            <span>👥 ${data.followers} followers</span>
            <span>⭐ ${totalStars} stars</span>
          </div>
          <div class="gh-langs">
            ${topLangs.map(([l]) => `<span class="lang-tag" style="background:${skillColor(l)}22;border-color:${skillColor(l)}55;color:${skillColor(l)}">${l}</span>`).join('')}
          </div>
        </div>
      </div>
      <a href="https://github.com/${username}" target="_blank" class="github-activity-wrap" style="display:block; margin-top:20px; text-decoration:none;">
        <h4 style="color:var(--primary); margin-bottom:8px; font-size:0.9rem;">Activity Graph</h4>
        <img src="https://ghchart.rshah.org/00e855/${username}" alt="${username}'s GitHub Activity Graph" style="width:100%; max-height:120px; object-fit:cover; object-position:left; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid rgba(0,232,85,0.2); padding:8px;" />
      </a>
      <a href="https://github.com/${username}" target="_blank" class="btn-secondary" style="margin-top:16px;display:inline-flex;align-items:center;gap:6px">
        🐙 View Full Profile
      </a>
    `;
    // Auto-import top languages as skills
    topLangs.forEach(([lang]) => {
      if (!ME.skills) ME.skills = [];
      if (!ME.skills.includes(lang)) ME.skills.push(lang);
    });
    renderProfileSkills();
    showToast('✅ GitHub stats loaded! Top languages added to skills.');
  } catch {
    panel.innerHTML = `
      <p style="color:var(--danger);font-size:.85rem">❌ Could not load GitHub profile. Check the username.</p>
      <button class="btn-secondary" style="margin-top:8px" onclick="loadGitHubStats()">Retry</button>
    `;
  }
}

// ============================================================
//  VIEW ROUTING
// ============================================================
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  const btn = document.querySelector(`.nav-btn[data-view="${name}"]`);
  if (btn) btn.classList.add('active');

  if (name === 'matches')  renderMatches();
  if (name === 'projects') renderProjects();
  if (name === 'messages') renderChatList();
  if (name === 'profile')  applyProfileToUI();
}

// ============================================================
//  SWIPE SYSTEM
// ============================================================
function buildCardQueue(skillFilter) {
  filteredSkill = skillFilter !== undefined ? skillFilter : filteredSkill;
  let candidates = DB.getDiscoverUsers(ME.id);

  if (filteredSkill) {
    candidates = candidates.filter(u =>
      (u.skills || []).some(s => s.toLowerCase().includes(filteredSkill.toLowerCase()))
    );
  }

  // Ensure all have avatars
  cardQueue = candidates.map(u => DB.ensureAvatar(u));
}

function filterSkill(btn, skill) {
  document.querySelectorAll('#filterPills .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  buildCardQueue(skill);
  renderCards();
}

function renderCards() {
  const stack = document.getElementById('cardStack');
  const emptyState = document.getElementById('emptyState');
  const actions = document.getElementById('swipeActions');
  stack.innerHTML = '';

  const allOthers = DB.getDiscoverUsers(ME.id);

  if (cardQueue.length === 0) {
    stack.style.display = 'none';
    emptyState.style.display = 'flex';
    actions.style.display = 'none';

    if (allOthers.length === 0 && DB.getUsers().length <= 1) {
      // Only user in the system
      document.getElementById('emptyIcon').textContent = '🌱';
      document.getElementById('emptyTitle').textContent = "You're the first here!";
      document.getElementById('emptyDesc').textContent = 'Invite other developers to join DevMatch. Once they sign up, they\'ll appear here for you to connect with.';
    } else if (cardQueue.length === 0 && filteredSkill) {
      document.getElementById('emptyIcon').textContent = '🔍';
      document.getElementById('emptyTitle').textContent = `No "${filteredSkill}" devs available`;
      document.getElementById('emptyDesc').textContent = 'Try a different skill filter or reset your swipes.';
    } else {
      document.getElementById('emptyIcon').textContent = '🎉';
      document.getElementById('emptyTitle').textContent = "You've seen everyone!";
      document.getElementById('emptyDesc').textContent = 'You\'ve swiped through all developers. Reset to start over or invite more devs.';
    }
    return;
  }

  stack.style.display = '';
  emptyState.style.display = 'none';
  actions.style.display = 'flex';

  cardQueue.slice(0, 3).forEach((dev, i) => {
    const card = createCard(dev, i);
    stack.appendChild(card);
  });

  attachSwipeListeners(stack.firstElementChild);
}

function createCard(dev, stackPos) {
  const card = document.createElement('div');
  card.className = 'swipe-card';
  card.dataset.id = dev.id;
  card.style.zIndex = 10 - stackPos;
  if (stackPos > 0) {
    card.style.transform = `scale(${1 - stackPos * 0.03}) translateY(${stackPos * 12}px)`;
    card.style.opacity = `${1 - stackPos * 0.15}`;
    card.style.transition = 'none';
  }

  const skills = (dev.skills || []).slice(0, 5);
  const lookingFor = dev.lookingFor || [];

  card.innerHTML = `
    <div class="card-image-area" style="background: linear-gradient(135deg, ${dev.color || '#00e855'}22, ${dev.color || '#00e855'}08);">
      <img src="${dev.avatar}" alt="${dev.name}" class="card-avatar" />
      <div class="card-like-badge">CONNECT ✓</div>
      <div class="card-nope-badge">PASS ✕</div>
      <div class="card-super-badge">SUPER ⭐</div>
    </div>
    <div class="card-body">
      <div class="card-top-info">
        <div>
          <h2 class="card-name">${escHtml(dev.name)}</h2>
          <p class="card-title">${escHtml(dev.title)}</p>
          ${dev.location ? `<p class="card-location">📍 ${escHtml(dev.location)}</p>` : ''}
        </div>
        <div class="card-exp-badge">${dev.experience || 'Dev'}</div>
      </div>
      ${dev.bio ? `<p class="card-bio">${escHtml(dev.bio)}</p>` : '<p class="card-bio" style="color:var(--text3);font-style:italic">No bio yet.</p>'}
      ${skills.length ? `<div class="card-skills">
        ${skills.map(s => `<span class="skill-tag" style="background:${skillColor(s)}22;border-color:${skillColor(s)}55;color:${skillColor(s)}">${escHtml(s)}</span>`).join('')}
      </div>` : ''}
      ${lookingFor.length ? `<div class="card-looking">
        <span class="looking-label">Looking for:</span>
        ${lookingFor.slice(0,3).map(r => `<span class="looking-tag">${escHtml(r)}</span>`).join('')}
      </div>` : ''}
      <div class="card-footer">
        ${dev.github
          ? `<div style="width:100%">
               <a href="https://github.com/${encodeURIComponent(dev.github)}" target="_blank" class="github-link" onclick="event.stopPropagation()" style="display:block; margin-bottom: 8px;">🐙 github.com/${escHtml(dev.github)}</a>
               <a href="https://github.com/${encodeURIComponent(dev.github)}" target="_blank" onclick="event.stopPropagation()" style="display:block; width:100%;">
                 <img src="https://ghchart.rshah.org/00e855/${encodeURIComponent(dev.github)}" alt="GitHub Activity" style="width: 100%; height: 60px; object-fit: cover; object-position: left; border-radius: 6px; background: rgba(0,0,0,0.4); padding: 4px; pointer-events:none;" />
               </a>
             </div>`
          : `<span class="github-link" style="opacity:.4">🐙 No GitHub linked</span>`}
        <div class="card-stats" style="margin-top:auto">
          <span>🗓 Joined ${timeAgo(dev.joinedAt)}</span>
        </div>
      </div>
    </div>
  `;
  return card;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days/30)}mo ago`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Drag & Drop Swipe ----
function attachSwipeListeners(card) {
  if (!card) return;
  card.addEventListener('mousedown', dragStart);
  card.addEventListener('touchstart', dragStart, { passive: true });
  document.addEventListener('mousemove', dragMove);
  document.addEventListener('touchmove', dragMove, { passive: false });
  document.addEventListener('mouseup', dragEnd);
  document.addEventListener('touchend', dragEnd);
}

function dragStart(e) {
  if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
  isDragging = true;
  activeDrag = e.currentTarget;
  startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
  currentX = 0; currentY = 0;
  activeDrag.style.transition = 'none';
}

function dragMove(e) {
  if (!isDragging || !activeDrag) return;
  if (e.cancelable) e.preventDefault();
  const cx = (e.type === 'touchmove' ? e.touches[0].clientX : e.clientX) - startX;
  const cy = (e.type === 'touchmove' ? e.touches[0].clientY : e.clientY);
  currentX = cx; currentY = cy;
  activeDrag.style.transform = `translate(${cx}px, ${cy * 0.15}px) rotate(${cx * 0.07}deg)`;

  const like  = activeDrag.querySelector('.card-like-badge');
  const nope  = activeDrag.querySelector('.card-nope-badge');
  const sup   = activeDrag.querySelector('.card-super-badge');
  const t = 60;
  like.style.opacity = cx > t ? Math.min((cx-t)/50, 1) : 0;
  nope.style.opacity = cx < -t ? Math.min((-cx-t)/50, 1) : 0;
  sup.style.opacity  = 0;
}

function dragEnd() {
  if (!isDragging || !activeDrag) return;
  isDragging = false;
  const threshold = 110;
  if (currentX > threshold)        finalizeSwipe('right');
  else if (currentX < -threshold)  finalizeSwipe('left');
  else {
    activeDrag.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    activeDrag.style.transform = '';
    activeDrag.querySelectorAll('.card-like-badge,.card-nope-badge,.card-super-badge')
      .forEach(el => el.style.opacity = 0);
    activeDrag = null;
  }
  document.removeEventListener('mousemove', dragMove);
  document.removeEventListener('touchmove', dragMove);
  document.removeEventListener('mouseup', dragEnd);
  document.removeEventListener('touchend', dragEnd);
}

function swipeCard(direction) {
  const card = document.querySelector('.swipe-card');
  if (!card) return;
  activeDrag = card;
  finalizeSwipe(direction);
}

function finalizeSwipe(direction) {
  const card = activeDrag || document.querySelector('.swipe-card');
  if (!card) return;

  const devId = card.dataset.id;
  const dev = cardQueue.find(d => d.id === devId);
  if (!dev) { activeDrag = null; return; }

  const sw = window.innerWidth;
  const tx = direction === 'left' ? -sw * 1.5 : direction === 'right' ? sw * 1.5 : 0;
  const ty = direction === 'super' ? -window.innerHeight : -80;
  const rot = direction === 'left' ? -30 : direction === 'right' ? 30 : 0;

  card.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
  card.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
  card.style.opacity = '0';

  const isMatch = DB.recordSwipe(ME.id, devId, direction === 'super' ? 'super' : direction);

  // Update likes count
  const swipes = DB.getSwipes(ME.id);
  document.getElementById('statLikes').textContent = swipes.right.length + swipes.super.length;

  setTimeout(() => {
    card.remove();
    cardQueue.shift();
    activeDrag = null;
    if (isMatch) triggerMatch(dev);
    renderCards();
  }, 480);

  document.removeEventListener('mousemove', dragMove);
  document.removeEventListener('touchmove', dragMove);
  document.removeEventListener('mouseup', dragEnd);
  document.removeEventListener('touchend', dragEnd);
}

function triggerMatch(dev) {
  document.getElementById('matchAvatar1').src = ME.avatar;
  document.getElementById('matchAvatar2').src = dev.avatar;
  document.getElementById('matchName').textContent = `You & ${dev.name}`;
  document.getElementById('matchDesc').textContent = `You both want to collaborate! Start a conversation now.`;
  document.getElementById('matchModal').classList.add('active');
  document.getElementById('statMatches').textContent = DB.getMatches(ME.id).length;
  updateBadges();
}

function closeMatchModal() {
  document.getElementById('matchModal').classList.remove('active');
}

function goToChat() {
  closeMatchModal();
  showView('messages');
}

function resetCards() {
  // Clear swipes for current user
  localStorage.removeItem(`dm_swipes_${ME.id}`);
  buildCardQueue();
  renderCards();
  showToast('🔄 Swipes reset!');
}

function shareApp() {
  const url = window.location.href.replace('index.html', 'auth.html');
  if (navigator.share) {
    navigator.share({ title: 'DevMatch', text: 'Join me on DevMatch — find developer partners!', url });
  } else {
    navigator.clipboard.writeText(url).then(() => showToast('🔗 Link copied! Share it with other developers.'));
  }
}

// ============================================================
//  MATCHES VIEW
// ============================================================
function renderMatches() {
  const grid = document.getElementById('matchesGrid');
  const matchedUsers = DB.getMatchedUsers(ME.id);

  if (matchedUsers.length === 0) {
    grid.innerHTML = `
      <div class="empty-full">
        <div class="empty-icon">💚</div>
        <h2>No matches yet</h2>
        <p>Start swiping to find collaborators! When both of you swipe right, it's a match.</p>
        <button class="btn-primary" onclick="showView('swipe')">🔥 Discover Developers</button>
      </div>`;
    return;
  }

  grid.innerHTML = matchedUsers.map(dev => `
    <div class="match-card" onclick="openChatWithUser('${dev.id}')">
      <div class="match-card-img" style="background: linear-gradient(135deg, ${dev.color || '#00e855'}22, ${dev.color || '#00e855'}08)">
        <img src="${dev.avatar}" alt="${escHtml(dev.name)}" />
        <div class="online-indicator"></div>
      </div>
      <div class="match-card-info">
        <h3>${escHtml(dev.name)}</h3>
        <p>${escHtml(dev.title)}</p>
        <div class="match-skills">
          ${(dev.skills || []).slice(0, 3).map(s => `<span class="skill-tag-sm" style="color:${skillColor(s)}">${escHtml(s)}</span>`).join('')}
        </div>
        <button class="btn-message">💬 Message</button>
      </div>
    </div>
  `).join('');

  updateBadges();
}

function updateBadges() {
  const matchCount = DB.getMatches(ME.id).length;
  const mb = document.getElementById('matchBadge');
  mb.textContent = matchCount;
  mb.style.display = matchCount > 0 ? 'flex' : 'none';

  const unread = DB.getUnreadCount(ME.id);
  const ub = document.getElementById('msgBadge');
  ub.textContent = unread;
  ub.style.display = unread > 0 ? 'flex' : 'none';
}

// ============================================================
//  PROJECTS VIEW
// ============================================================
function renderProjects() {
  const grid = document.getElementById('projectsGrid');
  const search = (document.getElementById('projectSearch')?.value || '').toLowerCase();
  let projs = DB.getProjects();

  if (filteredProjectTag) projs = projs.filter(p => p.type === filteredProjectTag);
  if (search) projs = projs.filter(p =>
    (p.title || '').toLowerCase().includes(search) ||
    (p.description || '').toLowerCase().includes(search) ||
    (p.stack || []).some(s => s.toLowerCase().includes(search))
  );

  if (projs.length === 0) {
    grid.innerHTML = `
      <div class="empty-full" style="grid-column:1/-1">
        <div class="empty-icon">🚀</div>
        <h2>${search || filteredProjectTag ? 'No matching projects' : 'No projects yet'}</h2>
        <p>${search || filteredProjectTag ? 'Try a different search or filter.' : 'Be the first to post a project and find collaborators!'}</p>
        <button class="btn-primary" onclick="showPostProject()">+ Post a Project</button>
      </div>`;
    return;
  }

  grid.innerHTML = projs.map(p => {
    const owner = DB.getUser(p.ownerId);
    const isOwner = p.ownerId === ME.id;
    return `
      <div class="project-card" onclick="openProjectDetail('${p.id}')">
        <div class="project-card-header">
          <div class="project-owner-info">
            <img src="${owner?.avatar || DB.generateAvatar('??', '#00e855')}" alt="${escHtml(p.owner)}" class="project-owner-avatar" />
            <div>
              <span class="project-owner-name">${escHtml(p.owner)}${isOwner ? ' <span style="color:var(--primary);font-size:.7rem">(you)</span>' : ''}</span>
              <span class="project-type-badge ${p.type}">${p.type}</span>
            </div>
          </div>
          <span class="project-status ${p.applicants?.length > 0 ? 'active' : 'seeking'}">${p.applicants?.length > 0 ? 'Active' : 'Seeking Team'}</span>
        </div>
        <h3 class="project-title">${escHtml(p.title)}</h3>
        <p class="project-desc">${escHtml((p.description || '').slice(0, 120))}${(p.description || '').length > 120 ? '...' : ''}</p>
        <div class="project-stack">
          ${(p.stack || []).slice(0, 4).map(s => `<span class="skill-tag" style="background:${skillColor(s)}22;border-color:${skillColor(s)}55;color:${skillColor(s)}">${escHtml(s)}</span>`).join('')}
        </div>
        <div class="project-roles">
          <span class="roles-label">Needs:</span>
          ${(p.rolesNeeded || []).map(r => `<span class="role-tag">${escHtml(r)}</span>`).join('')}
        </div>
        <div class="project-card-footer">
          <div class="project-github-stats">
            <span>👥 ${(p.applicants || []).length} applied</span>
            <span>🗓 ${timeAgo(p.createdAt)}</span>
          </div>
          ${!isOwner ? `<button class="btn-apply" onclick="event.stopPropagation();openProjectDetail('${p.id}')">Apply →</button>` : `<span style="color:var(--text3);font-size:.78rem">Your project</span>`}
        </div>
      </div>
    `;
  }).join('');
}

function filterProjects() { renderProjects(); }

function filterProjectTag(btn, tag) {
  document.querySelectorAll('.project-filters .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  filteredProjectTag = tag;
  renderProjects();
}

function openProjectDetail(id) {
  const p = DB.getProjects().find(x => x.id === id);
  if (!p) return;
  currentProjectDetail = p;
  const isOwner = p.ownerId === ME.id;
  document.getElementById('pdTitle').textContent = p.title;
  const owner = DB.getUser(p.ownerId);
  document.getElementById('pdBody').innerHTML = `
    <div class="pd-owner-row">
      <img src="${owner?.avatar || ''}" class="project-owner-avatar" />
      <div><strong>${escHtml(p.owner)}</strong><span class="project-type-badge ${p.type}" style="margin-left:8px">${p.type}</span></div>
    </div>
    <p style="margin:16px 0;line-height:1.7;color:var(--text2)">${escHtml(p.description)}</p>
    <div style="margin-bottom:16px">
      <h4 style="color:var(--primary);margin-bottom:8px">Tech Stack</h4>
      <div class="project-stack">${(p.stack||[]).map(s=>`<span class="skill-tag" style="background:${skillColor(s)}22;border-color:${skillColor(s)}55;color:${skillColor(s)}">${escHtml(s)}</span>`).join('')}</div>
    </div>
    <div style="margin-bottom:16px">
      <h4 style="color:var(--primary);margin-bottom:8px">Roles Needed</h4>
      <div>${(p.rolesNeeded||[]).map(r=>`<span class="role-tag">${escHtml(r)}</span>`).join('')}</div>
    </div>
    <div class="pd-stats">
      <div class="pd-stat"><span>👥</span><span>${(p.applicants||[]).length}</span><label>Applicants</label></div>
      <div class="pd-stat"><span>🗓</span><span>${timeAgo(p.createdAt)}</span><label>Posted</label></div>
    </div>
    ${p.github ? `<a href="${p.github}" target="_blank" class="github-link" style="margin-top:12px;display:inline-block">🐙 View on GitHub</a>` : ''}
    ${isOwner ? `<div style="margin-top:16px;padding:12px;background:rgba(0,232,85,.05);border:1px solid var(--border);border-radius:10px;font-size:.85rem;color:var(--text2)">📋 Applicants: ${(p.applicants||[]).map(a=>escHtml(a)).join(', ') || 'None yet'}</div>` : ''}
  `;
  document.getElementById('pdApplyBtn').style.display = isOwner ? 'none' : '';
  document.getElementById('projectDetailModal').classList.add('active');
}

function closeProjectDetailModal() {
  document.getElementById('projectDetailModal').classList.remove('active');
  currentProjectDetail = null;
}

function applyToProject() {
  if (!currentProjectDetail) return;
  if (!currentProjectDetail.applicants) currentProjectDetail.applicants = [];
  if (currentProjectDetail.applicants.includes(ME.name)) {
    showToast('ℹ️ You\'ve already applied to this project.');
    return;
  }
  currentProjectDetail.applicants.push(ME.name);
  DB.saveProject(currentProjectDetail);
  closeProjectDetailModal();
  showToast('🙋 Application sent! The project owner will reach out.');
  renderProjects();
}

function showPostProject() {
  document.getElementById('projectModal').classList.add('active');
}

function closeProjectModal() {
  document.getElementById('projectModal').classList.remove('active');
}

function submitProject() {
  const name  = document.getElementById('projName').value.trim();
  const desc  = document.getElementById('projDesc').value.trim();
  const stack = document.getElementById('projStack').value.trim().split(',').map(s=>s.trim()).filter(Boolean);
  const roles = document.getElementById('projRoles').value.trim().split(',').map(s=>s.trim()).filter(Boolean);
  const type  = document.getElementById('projType').value;
  const gh    = document.getElementById('projGithub').value.trim();

  if (!name || !desc) { showToast('⚠️ Project name and description are required.'); return; }

  const proj = {
    id: 'proj_' + Date.now(),
    ownerId: ME.id,
    owner: ME.name,
    title: name,
    description: desc,
    stack,
    rolesNeeded: roles,
    type,
    github: gh || null,
    applicants: [],
    createdAt: Date.now(),
  };

  DB.saveProject(proj);
  ME.projects = (ME.projects || 0) + 1;
  DB.saveUserProfile(ME);
  document.getElementById('statProjects').textContent = ME.projects;

  closeProjectModal();
  renderProjects();
  showToast('🚀 Project posted!');

  ['projName','projDesc','projStack','projRoles','projGithub'].forEach(id => document.getElementById(id).value = '');
}

// ============================================================
//  MESSAGES / CHAT
// ============================================================
function renderChatList() {
  const container = document.getElementById('chatItems');
  const matchedUsers = DB.getMatchedUsers(ME.id);

  if (matchedUsers.length === 0) {
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3);font-size:.85rem">
      No matches yet. Swipe to connect!<br><br>
      <button class="btn-primary" style="font-size:.8rem;padding:8px 16px" onclick="showView('swipe')">Discover Devs</button>
    </div>`;
    return;
  }

  container.innerHTML = matchedUsers.map(dev => {
    const msgs = DB.getMessages(ME.id, dev.id);
    const last = msgs[msgs.length - 1];
    const unread = msgs.filter(m => m.from !== ME.id && !m.read).length;
    const isActive = currentChatPartnerId === dev.id;
    return `
      <div class="chat-item ${isActive ? 'active' : ''}" onclick="openChat('${dev.id}')">
        <div class="chat-item-avatar-wrapper">
          <img src="${dev.avatar}" class="chat-item-avatar" alt="${escHtml(dev.name)}" />
          <div class="chat-item-online"></div>
        </div>
        <div class="chat-item-info">
          <div class="chat-item-name-row">
            <span class="chat-item-name">${escHtml(dev.name)}</span>
            <span class="chat-item-time">${last ? last.time : 'New'}</span>
          </div>
          <div class="chat-item-preview-row">
            <span class="chat-item-preview">
              ${last ? (last.from === ME.id ? '✓ ' : '') + escHtml(last.text.slice(0,40)) + (last.text.length > 40 ? '...' : '') : '🎉 You matched!'}
            </span>
            ${unread > 0 ? `<span class="chat-item-unread">${unread}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterChats(q) {
  const matchedUsers = DB.getMatchedUsers(ME.id);
  const filtered = q ? matchedUsers.filter(u => u.name.toLowerCase().includes(q.toLowerCase())) : matchedUsers;
  const container = document.getElementById('chatItems');
  // Re-render filtered (simplified)
  renderChatList();
}

function openChat(devId) {
  if (currentChatUnsubscribe) {
    currentChatUnsubscribe();
    currentChatUnsubscribe = null;
  }
  
  currentChatPartnerId = devId;
  const dev = DB.getUser(devId);
  if (!dev) return;
  DB.ensureAvatar(dev);

  const panel = document.getElementById('chatPanel');
  panel.innerHTML = `
    <div class="chat-header">
      <img src="${dev.avatar}" alt="${escHtml(dev.name)}" class="chat-header-avatar" />
      <div class="chat-header-info">
        <h3>${escHtml(dev.name)}</h3>
        <p class="chat-header-status"><span class="online-dot-sm"></span> Active on DevMatch</p>
      </div>
      <div class="chat-header-actions">
        ${dev.github ? `<button class="icon-btn" title="GitHub" onclick="window.open('https://github.com/${encodeURIComponent(dev.github)}','_blank')">🐙</button>` : ''}
      </div>
    </div>
    <div class="chat-messages" id="chatMessages">
      ${renderMessages(devId)}
    </div>
    <div class="chat-input-area">
      <input type="text" id="msgInput" placeholder="Type a message..." class="msg-input"
        onkeydown="if(event.key==='Enter')sendMessage('${devId}')" />
      <button class="send-btn" onclick="sendMessage('${devId}')">➤</button>
    </div>
  `;
  
  // Mark messages as read when opening chat
  if (DB.markMessagesAsRead(ME.id, devId)) {
    updateBadges();
  }

  scrollChatBottom();
  renderChatList();

  // Listen for real-time messages
  currentChatUnsubscribe = DB.listenToMessages(ME.id, devId, (msgs) => {
    if (currentChatPartnerId !== devId) return;

    // Auto mark new incoming messages as read while chat is open
    const hasUnread = msgs.some(m => m.from === devId && !m.read);
    if (hasUnread) {
      DB.markMessagesAsRead(ME.id, devId);
      updateBadges();
      // Reload msgs after marking read
      msgs = DB.getMessages(ME.id, devId);
    }

    const chatMsgs = document.getElementById('chatMessages');
    if (chatMsgs) {
      if (msgs.length === 0) {
        chatMsgs.innerHTML = `<div class="chat-match-banner">🎉 You matched! Say hello 👋</div>`;
      } else {
        chatMsgs.innerHTML = msgs.map(m => `
          <div class="msg ${m.from === ME.id ? 'msg-me' : 'msg-them'}">
            <div class="msg-bubble">${escHtml(m.text)}</div>
            <div class="msg-time">${m.time}</div>
          </div>
        `).join('');
      }
      scrollChatBottom();
      renderChatList();
    }
  });
}

function renderMessages(devId) {
  const msgs = DB.getMessages(ME.id, devId);
  if (msgs.length === 0) {
    return `<div class="chat-match-banner">🎉 You matched! Say hello 👋</div>`;
  }
  return msgs.map(m => `
    <div class="msg ${m.from === ME.id ? 'msg-me' : 'msg-them'}">
      <div class="msg-bubble">${escHtml(m.text)}</div>
      <div class="msg-time">${m.time}</div>
    </div>
  `).join('');
}

function openChatWithUser(devId) {
  showView('messages');
  setTimeout(() => openChat(devId), 50);
}

function scrollChatBottom() {
  setTimeout(() => {
    const el = document.getElementById('chatMessages');
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);
}

function sendMessage(devId) {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  DB.addMessage(ME.id, devId, text);

  // We don't need to manually append the message anymore because 
  // the real-time listener will pick it up and re-render!
  // But just in case we are in basic local mode with no listener triggered on self, 
  // we can force a re-render:
  const msgs = DB.getMessages(ME.id, devId);
  const chatMsgs = document.getElementById('chatMessages');
  if (chatMsgs) {
    chatMsgs.innerHTML = msgs.map(m => `
      <div class="msg ${m.from === ME.id ? 'msg-me' : 'msg-them'}">
        <div class="msg-bubble">${escHtml(m.text)}</div>
        <div class="msg-time">${m.time}</div>
      </div>
    `).join('');
  }
  scrollChatBottom();
  renderChatList();
}

// ============================================================
//  TOAST
// ============================================================
let toastTimeout;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 3200);
}
