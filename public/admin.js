let posts = [];
let volunteers = [];
let socials = [];
let candidateProfile = null;
let editingSocialId = null;
let scorecards = [];
let editingScorecardId = null;
let editingPostId = null;
let currentTab = 'posts';
let commentSearchQuery = '';
let selectedCommentWard = 'All';

function getAdminKey() {
  return sessionStorage.getItem('campaign_admin_key') || '';
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function verifyAndUnlock(passkey) {
  const res = await fetch('/api/admin/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': passkey
    },
    body: JSON.stringify({ adminKey: passkey })
  });

  if (!res.ok) {
    sessionStorage.removeItem('campaign_admin_key');
    throw new Error('Invalid Campaign Admin Passkey');
  }

  sessionStorage.setItem('campaign_admin_key', passkey);
  document.getElementById('loginGate').style.display = 'none';
  document.getElementById('dashboardArea').classList.add('active');
  document.getElementById('logoutBtn').style.display = 'inline-flex';
  await loadDashboardData();
}

function logoutAdmin() {
  sessionStorage.removeItem('campaign_admin_key');
  location.reload();
}

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginSubmitBtn');
  const key = document.getElementById('loginPasskey').value.trim();
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    await verifyAndUnlock(key);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Unlock Dashboard';
  }
});

async function loadDashboardData() {
  const passkey = getAdminKey();
  const [postsRes, volRes, cardsRes, socialsRes, profileRes] = await Promise.all([
    fetch('/api/posts'),
    fetch('/api/volunteers', {
      headers: { 'x-admin-key': passkey }
    }),
    fetch('/api/scorecards'),
    fetch('/api/socials'),
    fetch('/api/profile')
  ]);

  posts = await postsRes.json();
  volunteers = volRes.ok ? await volRes.json() : [];
  scorecards = cardsRes.ok ? await cardsRes.json() : [];
  socials = socialsRes.ok ? await socialsRes.json() : [];
  candidateProfile = profileRes.ok ? await profileRes.json() : null;

  syncWardFilterOptions();
  renderDashboard();
}
function syncWardFilterOptions() {
  const selectEl = document.getElementById('commentWardSelect');
  if (!selectEl) return;

  const wardSet = new Set();
  for (const p of posts) {
    for (const c of p.comments || []) {
      const w = (c.ward || 'Resident').trim();
      if (w) wardSet.add(w);
    }
  }

  const sortedWards = Array.from(wardSet).sort((a, b) => a.localeCompare(b));
  const currentVal = sortedWards.includes(selectedCommentWard) ? selectedCommentWard : 'All';
  selectedCommentWard = currentVal;

  selectEl.innerHTML =
    `<option value="All">All Wards</option>` +
    sortedWards
      .map(
        (ward) =>
          `<option value="${escapeHTML(ward)}" ${ward === currentVal ? 'selected' : ''}>${escapeHTML(ward)}</option>`
      )
      .join('');
}

function handleCommentFilterChange() {
  const searchEl = document.getElementById('commentSearchInput');
  const wardEl = document.getElementById('commentWardSelect');
  commentSearchQuery = searchEl ? searchEl.value.trim().toLowerCase() : '';
  selectedCommentWard = wardEl ? wardEl.value : 'All';
  renderDashboard();
}

function resetCommentFilters() {
  commentSearchQuery = '';
  selectedCommentWard = 'All';
  const searchEl = document.getElementById('commentSearchInput');
  const wardEl = document.getElementById('commentWardSelect');
  if (searchEl) searchEl.value = '';
  if (wardEl) wardEl.value = 'All';
  renderDashboard();
}

function renderDashboard() {
  const allComments = posts.flatMap((p) =>
    (p.comments || []).map((c) => ({ ...c, post_title: p.title }))
  );

  const totalLikes = posts.reduce((sum, p) => sum + Number(p.likes || 0), 0);

  document.getElementById('kpiPosts').textContent = posts.length;
  document.getElementById('kpiLikes').textContent = totalLikes;
  document.getElementById('kpiComments').textContent = allComments.length;
  document.getElementById('tabPostCount').textContent = posts.length;
  document.getElementById('tabCommentCount').textContent = allComments.length;

  const volCountEl = document.getElementById('tabVolunteerCount');
  if (volCountEl) volCountEl.textContent = volunteers.length;

  const cardCountEl = document.getElementById('tabScorecardCount');
  if (cardCountEl) cardCountEl.textContent = scorecards.length;

  const socialCountEl = document.getElementById('tabSocialCount');
  if (socialCountEl) socialCountEl.textContent = socials.length;

  const filterBar = document.getElementById('commentFilterBar');
  if (filterBar) {
    filterBar.classList.toggle('active', currentTab === 'comments');
  }

  const listEl = document.getElementById('moderationList');

  if (currentTab === 'posts') {
    if (posts.length === 0) {
      listEl.innerHTML = `<p style="padding:1.5rem;color:var(--slate-500);">No dispatches published yet.</p>`;
      return;
    }

    listEl.innerHTML = posts
      .map(
        (p) => `
        <div class="item-row">
          <div>
            <div class="item-meta">${escapeHTML(p.category)} &bull; ${escapeHTML(p.ward)} &bull; &#9829; ${p.likes || 0} &bull; &#128172; ${(p.comments || []).length}</div>
            <div class="item-title">${escapeHTML(p.title)}</div>
            <div class="item-desc">${escapeHTML(p.summary)}</div>
          </div>
          <div class="item-actions">
            <button class="btn btn-edit" onclick="startEditPost(${p.id})">Edit</button>
            <button class="btn btn-danger" onclick="deletePost(${p.id})">Delete</button>
          </div>
        </div>`
      )
      .join('');
  } else if (currentTab === 'comments') {
    const filteredComments = allComments.filter((c) => {
      const wardLabel = (c.ward || 'Resident').trim();
      const matchesWard =
        selectedCommentWard === 'All' ||
        wardLabel.toLowerCase() === selectedCommentWard.toLowerCase();

      const matchesQuery =
        !commentSearchQuery ||
        (c.author_name && c.author_name.toLowerCase().includes(commentSearchQuery)) ||
        (c.body && c.body.toLowerCase().includes(commentSearchQuery)) ||
        (c.post_title && c.post_title.toLowerCase().includes(commentSearchQuery)) ||
        wardLabel.toLowerCase().includes(commentSearchQuery);

      return matchesWard && matchesQuery;
    });

    if (allComments.length === 0) {
      listEl.innerHTML = `<p style="padding:1.5rem;color:var(--slate-500);">No constituent comments to moderate.</p>`;
      return;
    }

    if (filteredComments.length === 0) {
      listEl.innerHTML = `<p style="padding:1.5rem;color:var(--slate-500);">No comments match "${escapeHTML(commentSearchQuery)}" in ${escapeHTML(selectedCommentWard)}.</p>`;
      return;
    }

    const summaryBanner = `<div style="padding:0.55rem 1.35rem;font-size:0.78rem;color:var(--slate-600);background:var(--slate-50);border-bottom:1px solid var(--slate-200);">Showing <strong>${filteredComments.length}</strong> of <strong>${allComments.length}</strong> constituent comments</div>`;

    listEl.innerHTML =
      summaryBanner +
      filteredComments
        .map(
          (c) => `
          <div class="item-row">
            <div>
              <div class="item-meta">${escapeHTML(c.author_name)} (${escapeHTML(c.ward || 'Resident')}) &bull; On: "${escapeHTML(c.post_title)}"</div>
              <div class="item-desc" style="color:var(--slate-900);margin-top:0.2rem;">${escapeHTML(c.body)}</div>
            </div>
            <div class="item-actions">
              <button class="btn btn-danger" onclick="deleteComment(${c.id})">Remove</button>
            </div>
          </div>`
        )
        .join('');
  } else if (currentTab === 'volunteers') {
    if (volunteers.length === 0) {
      listEl.innerHTML = `<p style="padding:1.5rem;color:var(--slate-500);">No ward volunteers registered yet.</p>`;
      return;
    }

    listEl.innerHTML = volunteers
      .map((v) => {
        const safeStatus = ['Pending', 'Active', 'Contacted'].includes(v.status)
          ? v.status
          : 'Pending';
        return `
          <div class="item-row">
            <div>
              <div class="item-meta">
                ${escapeHTML(v.ward || 'All Wards')} &bull; ${escapeHTML(v.role || 'Ward Mobilizer')} &bull;
                <span class="status-pill status-${safeStatus}">${escapeHTML(safeStatus)}</span>
              </div>
              <div class="item-title">${escapeHTML(v.full_name)} &mdash; <span style="font-weight:600;color:var(--slate-600);">${escapeHTML(v.phone)}</span></div>
              ${v.notes ? `<div class="item-desc">${escapeHTML(v.notes)}</div>` : ''}
            </div>
            <div class="item-actions">
              <button class="btn btn-edit" onclick="setVolunteerStatus(${v.id}, 'Active')">Mark Active</button>
              <button class="btn btn-edit" onclick="setVolunteerStatus(${v.id}, 'Contacted')">Contacted</button>
              <button class="btn btn-danger" onclick="deleteVolunteer(${v.id})">Remove</button>
            </div>
          </div>
        `;
      })
      .join('');
  } else if (currentTab === 'scorecards') {
    if (scorecards.length === 0) {
      listEl.innerHTML = `<p style="padding:1.5rem;color:var(--slate-500);">No NG-CDF ward scorecards found.</p>`;
      return;
    }

    listEl.innerHTML = scorecards
      .map((card) => {
        const isEditingCard = Number(editingScorecardId) === Number(card.id);

        if (isEditingCard) {
          return `
            <div class="item-row" style="display:block;background:var(--slate-50);">
              <div class="item-meta">Editing ${escapeHTML(card.ward_key)} Ward Scorecard</div>
              <form onsubmit="saveScorecard(event, ${card.id})" style="margin-top:0.65rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
                  <div class="form-group">
                    <label>Ward Name</label>
                    <input type="text" id="scWardName_${card.id}" class="form-input" value="${escapeHTML(card.ward_name)}" required />
                  </div>
                  <div class="form-group">
                    <label>Allocation / Target</label>
                    <input type="text" id="scAllocation_${card.id}" class="form-input" value="${escapeHTML(card.allocation)}" required />
                  </div>
                </div>
                <div class="form-group">
                  <label>Flagship Project &amp; Focus</label>
                  <input type="text" id="scProject_${card.id}" class="form-input" value="${escapeHTML(card.project)}" required />
                </div>
                <div style="display:grid;grid-template-columns:130px 1fr;gap:0.6rem;">
                  <div class="form-group">
                    <label>Readiness (%)</label>
                    <input type="number" id="scProgress_${card.id}" class="form-input" min="0" max="100" value="${Number(card.progress || 0)}" required />
                  </div>
                  <div class="form-group">
                    <label>Current Milestone</label>
                    <input type="text" id="scMilestone_${card.id}" class="form-input" value="${escapeHTML(card.milestone)}" required />
                  </div>
                </div>
                <div class="item-actions">
                  <button type="submit" class="btn btn-primary">Save to Turso</button>
                  <button type="button" class="btn btn-edit" onclick="cancelEditScorecard()">Cancel</button>
                </div>
              </form>
            </div>
          `;
        }

        return `
          <div class="item-row">
            <div>
              <div class="item-meta">${escapeHTML(card.ward_name)} &bull; ${escapeHTML(card.allocation)} &bull; ${Number(card.progress || 0)}%</div>
              <div class="item-title">${escapeHTML(card.project)}</div>
              <div class="item-desc">Milestone: <strong>${escapeHTML(card.milestone)}</strong></div>
            </div>
            <div class="item-actions">
              <button class="btn btn-edit" onclick="startEditScorecard(${card.id})">Edit Ward</button>
            </div>
          </div>
        `;
      })
      .join('');
  } else if (currentTab === 'profile') {
    const profile = candidateProfile || {
      full_name: 'Hon. David Kamau',
      role_title: 'Member of Parliament Aspirant • 2027',
      tagline: '',
      portrait_url: ''
    };

    listEl.innerHTML = `
      <div class="item-row" style="display:block;background:var(--slate-50);">
        <div class="item-meta">Mheshimiwa Official Portrait &amp; Hero Bio</div>
        <div style="display:flex;align-items:center;gap:1rem;margin:0.85rem 0 1.1rem;padding:0.85rem;background:var(--white);border:1px solid var(--slate-200);border-radius:10px;">
          <img
            id="profilePreviewImg"
            src="${escapeHTML(profile.portrait_url)}"
            alt="${escapeHTML(profile.full_name)}"
            style="width:76px;height:76px;object-fit:cover;object-position:top center;border-radius:10px;border:2px solid var(--crimson-600);background:var(--obsidian-900);flex-shrink:0;"
          />
          <div>
            <div style="font-size:0.75rem;font-weight:800;text-transform:uppercase;color:var(--crimson-700);">${escapeHTML(profile.role_title)}</div>
            <div style="font-weight:800;font-size:1.05rem;color:var(--obsidian-900);">${escapeHTML(profile.full_name)}</div>
            <div style="font-size:0.83rem;color:var(--slate-600);margin-top:0.2rem;">${escapeHTML(profile.tagline)}</div>
          </div>
        </div>

        <form onsubmit="saveCandidateProfile(event)">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.65rem;">
            <div class="form-group">
              <label>Candidate Full Name</label>
              <input type="text" id="profFullName" class="form-input" value="${escapeHTML(profile.full_name)}" required />
            </div>
            <div class="form-group">
              <label>Title / Office Tag</label>
              <input type="text" id="profRoleTitle" class="form-input" value="${escapeHTML(profile.role_title)}" required />
            </div>
          </div>
          <div class="form-group">
            <label>Official Portrait URL (https://... or /images/...)</label>
            <input
              type="text"
              id="profPortraitUrl"
              class="form-input"
              value="${escapeHTML(profile.portrait_url)}"
              oninput="previewProfilePortrait(this.value)"
              required
            />
          </div>
          <div class="form-group">
            <label>Hero Bio Tagline</label>
            <textarea id="profTagline" class="form-input" style="min-height:80px;" required>${escapeHTML(profile.tagline)}</textarea>
          </div>
          <div class="item-actions">
            <button type="submit" id="saveProfileBtn" class="btn btn-primary">Save Profile to Turso</button>
          </div>
        </form>
      </div>
    `;
  } else if (currentTab === 'socials') {
    if (socials.length === 0) {
      listEl.innerHTML = `<p style="padding:1.5rem;color:var(--slate-500);">No social channels configured yet.</p>`;
      return;
    }

    listEl.innerHTML = socials
      .map((item) => {
        const isEditing = Number(editingSocialId) === Number(item.id);

        if (isEditing) {
          return `
            <div class="item-row" style="display:block;background:var(--slate-50);">
              <div class="item-meta">Editing ${escapeHTML(item.platform_key)} Channel</div>
              <form onsubmit="saveSocialChannel(event, ${item.id})" style="margin-top:0.65rem;">
                <div style="display:grid;grid-template-columns:1fr 2fr;gap:0.6rem;">
                  <div class="form-group">
                    <label>Display Label</label>
                    <input type="text" id="socLabel_${item.id}" class="form-input" value="${escapeHTML(item.label)}" required />
                  </div>
                  <div class="form-group">
                    <label>Official URL (https://...)</label>
                    <input type="url" id="socUrl_${item.id}" class="form-input" value="${escapeHTML(item.url)}" required />
                  </div>
                </div>
                <div class="item-actions">
                  <button type="submit" class="btn btn-primary">Save Link to Turso</button>
                  <button type="button" class="btn btn-edit" onclick="cancelEditSocialChannel()">Cancel</button>
                </div>
              </form>
            </div>
          `;
        }

        return `
          <div class="item-row">
            <div>
              <div class="item-meta">${escapeHTML(String(item.platform_key || '').toUpperCase())}</div>
              <div class="item-title">${escapeHTML(item.label)}</div>
              <div class="item-desc">${escapeHTML(item.url)}</div>
            </div>
            <div class="item-actions">
              <button class="btn btn-edit" onclick="startEditSocialChannel(${item.id})">Edit URL</button>
            </div>
          </div>
        `;
      })
      .join('');
  }
}
function switchAdminTab(tab) {
  currentTab = tab;
  document.getElementById('tabPostsBtn').classList.toggle('active', tab === 'posts');
  document.getElementById('tabCommentsBtn').classList.toggle('active', tab === 'comments');
  document.getElementById('tabVolunteersBtn').classList.toggle('active', tab === 'volunteers');
  document.getElementById('tabScorecardsBtn').classList.toggle('active', tab === 'scorecards');
  document.getElementById('tabSocialsBtn').classList.toggle('active', tab === 'socials');
  document.getElementById('tabProfileBtn').classList.toggle('active', tab === 'profile');
  renderDashboard();
}

function startEditPost(postId) {
  const post = posts.find((p) => Number(p.id) === Number(postId));
  if (!post) return;

  editingPostId = Number(postId);
  document.getElementById('editorHeading').textContent = `Editing Dispatch #${editingPostId}`;
  document.getElementById('saveDispatchBtn').textContent = 'Save Changes to Turso';
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';

  document.getElementById('postTitle').value = post.title || '';
  document.getElementById('postCategory').value = post.category || 'Manifesto & Policy';
  document.getElementById('postWard').value = post.ward || 'All Wards';
  document.getElementById('postImage').value = post.image_url || '';
  document.getElementById('postSummary').value = post.summary || '';
  document.getElementById('postContent').value = post.content || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetEditor() {
  editingPostId = null;
  document.getElementById('dispatchForm').reset();
  document.getElementById('editorHeading').textContent = 'Draft New Dispatch';
  document.getElementById('saveDispatchBtn').textContent = 'Publish Live Dispatch';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

document.getElementById('dispatchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveDispatchBtn');
  const passkey = getAdminKey();
  const isEditing = editingPostId !== null;

  btn.disabled = true;
  btn.textContent = isEditing ? 'Saving...' : 'Publishing...';

  const payload = {
    adminKey: passkey,
    title: document.getElementById('postTitle').value.trim(),
    category: document.getElementById('postCategory').value,
    ward: document.getElementById('postWard').value.trim() || 'All Wards',
    image_url: document.getElementById('postImage').value.trim(),
    summary: document.getElementById('postSummary').value.trim(),
    content: document.getElementById('postContent').value.trim()
  };

  try {
    const res = await fetch(isEditing ? `/api/posts/${editingPostId}` : '/api/posts', {
      method: isEditing ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': passkey
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Operation failed');

    resetEditor();
    await loadDashboardData();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = editingPostId !== null ? 'Save Changes to Turso' : 'Publish Live Dispatch';
  }
});

async function deletePost(postId) {
  if (!confirm('Delete this dispatch and all its comments permanently?')) return;
  const passkey = getAdminKey();

  try {
    const res = await fetch(`/api/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': passkey }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');

    if (editingPostId === Number(postId)) resetEditor();
    await loadDashboardData();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteComment(commentId) {
  if (!confirm('Remove this constituent comment?')) return;
  const passkey = getAdminKey();

  try {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': passkey }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove comment');

    await loadDashboardData();
  } catch (err) {
    alert(err.message);
  }
}
async function setVolunteerStatus(volunteerId, status) {
  const passkey = getAdminKey();
  try {
    const res = await fetch(`/api/volunteers/${volunteerId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': passkey
      },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update status');
    await loadDashboardData();
  } catch (err) {
    alert(err.message);
  }
}
function startEditScorecard(scorecardId) {
  editingScorecardId = Number(scorecardId);
  renderDashboard();
}

function cancelEditScorecard() {
  editingScorecardId = null;
  renderDashboard();
}
function previewProfilePortrait(url) {
  const img = document.getElementById('profilePreviewImg');
  if (img && url.trim()) {
    img.src = url.trim();
  }
}

async function saveCandidateProfile(event) {
  event.preventDefault();
  const passkey = getAdminKey();
  const btn = document.getElementById('saveProfileBtn');

  btn.disabled = true;
  btn.textContent = 'Saving...';

  const payload = {
    adminKey: passkey,
    full_name: document.getElementById('profFullName').value.trim(),
    role_title: document.getElementById('profRoleTitle').value.trim(),
    portrait_url: document.getElementById('profPortraitUrl').value.trim(),
    tagline: document.getElementById('profTagline').value.trim()
  };

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': passkey
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update candidate profile');

    candidateProfile = data;
    renderDashboard();
    alert('Candidate portrait and bio updated in Turso!');
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Profile to Turso';
  }
}
async function saveScorecard(event, scorecardId) {
  event.preventDefault();
  const passkey = getAdminKey();

  const payload = {
    adminKey: passkey,
    ward_name: document.getElementById(`scWardName_${scorecardId}`).value.trim(),
    allocation: document.getElementById(`scAllocation_${scorecardId}`).value.trim(),
    project: document.getElementById(`scProject_${scorecardId}`).value.trim(),
    progress: Number(document.getElementById(`scProgress_${scorecardId}`).value),
    milestone: document.getElementById(`scMilestone_${scorecardId}`).value.trim()
  };

  try {
    const res = await fetch(`/api/scorecards/${scorecardId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': passkey
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update scorecard');

    editingScorecardId = null;
    await loadDashboardData();
  } catch (err) {
    alert(err.message);
  }
}
async function deleteVolunteer(volunteerId) {
  if (!confirm('Remove this volunteer record from Turso?')) return;
  const passkey = getAdminKey();
  try {
    const res = await fetch(`/api/volunteers/${volunteerId}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': passkey }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove volunteer');
    await loadDashboardData();
  } catch (err) {
    alert(err.message);
  }
}
// Auto-unlock if session passkey is already stored
(async function initAdmin() {
  const saved = getAdminKey();
  if (saved) {
    try {
      await verifyAndUnlock(saved);
    } catch {
      // Stay on login gate
    }
  }
})();