let posts = [];
let activeCategory = 'All';
let searchQuery = '';
const openCommentDrawers = new Set();

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoString) {
  if (!isoString) return 'Recent';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Recent';
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Fetch posts & comments from Express -> Turso API
async function fetchPosts() {
  const statusEl = document.getElementById('feedStatus');
  try {
    const res = await fetch('/api/posts');
    if (!res.ok) throw new Error('Failed to load dispatches');
    posts = await res.json();
    statusEl.style.display = 'none';
    renderPosts();
  } catch (err) {
    statusEl.textContent = 'Unable to connect to campaign server. Please refresh.';
    console.error(err);
  }
}

function updateStats() {
  const totalPosts = posts.length;
  const totalLikes = posts.reduce((sum, p) => sum + Number(p.likes || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.comments ? p.comments.length : 0), 0);

  document.getElementById('statPosts').textContent = totalPosts;
  document.getElementById('statLikes').textContent = totalLikes;
  document.getElementById('statComments').textContent = totalComments;
}

function renderPosts() {
  updateStats();
  const grid = document.getElementById('postsGrid');
  const statusEl = document.getElementById('feedStatus');

  const filtered = posts.filter((post) => {
    const matchesCat = activeCategory === 'All' || post.category === activeCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      (post.title && post.title.toLowerCase().includes(q)) ||
      (post.summary && post.summary.toLowerCase().includes(q)) ||
      (post.ward && post.ward.toLowerCase().includes(q)) ||
      (post.content && post.content.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '';
    statusEl.style.display = 'block';
    statusEl.textContent = 'No campaign dispatches match your current filter.';
    return;
  }

  statusEl.style.display = 'none';
  grid.innerHTML = filtered
    .map((post) => {
      const isLiked = localStorage.getItem(`liked_post_${post.id}`) === 'true';
      const comments = post.comments || [];
      const isDrawerOpen = openCommentDrawers.has(post.id);

      const commentsHtml = comments.length
        ? comments
            .map(
              (c) => `
            <div class="comment-item">
              <div class="comment-header">
                ${escapeHTML(c.author_name)}
                <span>${escapeHTML(c.ward || 'Constituent')}</span>
              </div>
              <div>${escapeHTML(c.body)}</div>
            </div>`
            )
            .join('')
        : `<p style="font-size:0.8rem;color:var(--slate-500);">No comments yet. Be the first resident to weigh in.</p>`;

      return `
        <article class="post-card">
          <img
            class="post-cover"
            src="${escapeHTML(post.image_url || 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=1000&q=80')}"
            alt="${escapeHTML(post.title)}"
            onclick="openReader(${post.id})"
          />
          <div class="post-body">
            <div class="post-meta">
              <span class="badge-category">${escapeHTML(post.category)}</span>
              <span class="badge-ward">${escapeHTML(post.ward || 'All Wards')} &bull; ${formatDate(post.created_at)}</span>
            </div>
            <h3 class="post-title" onclick="openReader(${post.id})">${escapeHTML(post.title)}</h3>
            <p class="post-summary">${escapeHTML(post.summary)}</p>
            <div class="post-actions">
              <div class="action-group">
                <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="handleLike(${post.id})">
                  ${isLiked ? '&#9829; Endorsed' : '&#9825; Endorse'} (${post.likes || 0})
                </button>
                <button class="comment-toggle-btn" onclick="toggleComments(${post.id})">
                  &#128172; ${comments.length}
                </button>
              </div>
              <button class="read-more-btn" onclick="openReader(${post.id})">Read Full &rarr;</button>
            </div>
          </div>
          <div class="inline-comments ${isDrawerOpen ? 'open' : ''}" id="comments-drawer-${post.id}">
            <div class="comment-list">${commentsHtml}</div>
            <form class="inline-comment-form" onsubmit="submitInlineComment(event, ${post.id})">
              <div class="inline-comment-row">
                <input type="text" name="author_name" class="form-input" placeholder="Your Name *" required />
                <input type="text" name="ward" class="form-input" placeholder="Your Ward (e.g. North)" />
              </div>
              <div style="display:flex;gap:0.45rem;">
                <input type="text" name="body" class="form-input" placeholder="Add your view on this proposal..." required />
                <button type="submit" class="btn btn-primary" style="padding:0.5rem 0.9rem;">Post</button>
              </div>
            </form>
          </div>
        </article>
      `;
    })
    .join('');
}

function toggleComments(postId) {
  if (openCommentDrawers.has(postId)) {
    openCommentDrawers.delete(postId);
  } else {
    openCommentDrawers.add(postId);
  }
  renderPosts();
}

async function handleLike(postId) {
    const numericId = Number(postId);
    const likedKey = `liked_post_${numericId}`;
    const currentlyLiked = localStorage.getItem(likedKey) === 'true';
    const nextAction = currentlyLiked ? 'unlike' : 'like';
  
    try {
      const res = await fetch(`/api/posts/${numericId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextAction })
      });
      if (!res.ok) throw new Error('Toggle endorsement failed');
  
      const data = await res.json();
  
      if (data.liked) {
        localStorage.setItem(likedKey, 'true');
      } else {
        localStorage.removeItem(likedKey);
      }
  
      const post = posts.find((p) => Number(p.id) === numericId);
      if (post) post.likes = Number(data.likes);
  
      renderPosts();
  
      if (document.getElementById('readerModal').classList.contains('open')) {
        openReader(numericId);
      }
    } catch (err) {
      console.error(err);
      alert('Could not update endorsement. Please try again.');
    }
  }

async function postCommentToApi(postId, author_name, ward, body) {
  const res = await fetch(`/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author_name, ward, body })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to post comment');
  }
  const newComment = await res.json();
  const post = posts.find((p) => p.id === postId);
  if (post) {
    if (!post.comments) post.comments = [];
    post.comments.push(newComment);
  }
  openCommentDrawers.add(postId);
  renderPosts();
}

async function submitInlineComment(event, postId) {
  event.preventDefault();
  const form = event.target;
  const author_name = form.author_name.value.trim();
  const ward = form.ward.value.trim() || 'Constituent';
  const body = form.body.value.trim();
  if (!author_name || !body) return;

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await postCommentToApi(postId, author_name, ward, body);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

function openReader(postId) {
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  const isLiked = localStorage.getItem(`liked_post_${post.id}`) === 'true';
  const comments = post.comments || [];

  document.getElementById('readerCategory').textContent = `${post.category} • ${post.ward || 'All Wards'}`;
  document.getElementById('readerBody').innerHTML = `
    <img class="reader-cover" src="${escapeHTML(post.image_url || 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=1000&q=80')}" alt="${escapeHTML(post.title)}" />
    <h2 style="font-size:1.55rem;color:var(--navy-900);margin-bottom:0.5rem;">${escapeHTML(post.title)}</h2>
    <p style="font-size:0.82rem;color:var(--slate-500);margin-bottom:1.25rem;">Published ${formatDate(post.created_at)}</p>
    <div class="reader-content">${escapeHTML(post.content)}</div>

    <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 0;border-top:1px solid var(--slate-200);border-bottom:1px solid var(--slate-200);margin-bottom:1.25rem;">
      <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="handleLike(${post.id})">
        ${isLiked ? '&#9829; Endorsed by You' : '&#9825; Endorse This Proposal'} (${post.likes || 0})
      </button>
      <span style="font-size:0.85rem;font-weight:700;color:var(--slate-600);">${comments.length} Citizen Responses</span>
    </div>
    
  <button class="read-more-btn" onclick="openReader(${post.id})">Read Full &rarr;</button>
</div>
    <h4 style="margin-bottom:0.75rem;color:var(--navy-900);">Constituent Townhall Comments</h4>
    <div class="comment-list" style="max-height:240px;margin-bottom:1rem;">
      ${
        comments.length
          ? comments
              .map(
                (c) => `
              <div class="comment-item">
                <div class="comment-header">
                  ${escapeHTML(c.author_name)}
                  <span>${escapeHTML(c.ward || 'Constituent')}</span>
                </div>
                <div>${escapeHTML(c.body)}</div>
              </div>`
              )
              .join('')
          : '<p style="font-size:0.85rem;color:var(--slate-500);">No responses yet. Share your thoughts below.</p>'
      }
    </div>

    <form class="inline-comment-form" onsubmit="submitModalComment(event, ${post.id})">
      <div class="inline-comment-row">
        <input type="text" name="author_name" class="form-input" placeholder="Your Full Name *" required />
        <input type="text" name="ward" class="form-input" placeholder="Your Ward" />
      </div>
      <textarea name="body" class="form-input" style="min-height:75px;" placeholder="Write your message to Hon. David Kamau..." required></textarea>
      <button type="submit" class="btn btn-primary">Submit Constituent Comment</button>
    </form>
  `;
  document.getElementById('readerModal').classList.add('open');
}

async function submitModalComment(event, postId) {
  event.preventDefault();
  const form = event.target;
  const author_name = form.author_name.value.trim();
  const ward = form.ward.value.trim() || 'Constituent';
  const body = form.body.value.trim();
  if (!author_name || !body) return;

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await postCommentToApi(postId, author_name, ward, body);
    openReader(postId);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

let editingPostId = null;

function getSavedAdminKey() {
  return sessionStorage.getItem('campaign_admin_key') || '';
}

function saveAdminKey(key) {
  if (key) {
    sessionStorage.setItem('campaign_admin_key', key);
  }
}

// Prompt for or reuse ADMIN_SECRET when clicking Edit or Delete
function requestAdminPasskey(promptMessage = 'Enter Campaign Admin Passkey:') {
  const existing = getSavedAdminKey();
  const entered = window.prompt(promptMessage, existing);
  if (entered === null) return null; // User cancelled
  const trimmed = entered.trim();
  if (!trimmed) {
    alert('Admin passkey is required.');
    return null;
  }
  saveAdminKey(trimmed);
  return trimmed;
}

// Open modal in CREATE mode
function openAdminModal() {
  editingPostId = null;
  const form = document.getElementById('createPostForm');
  const headerTitle = document.querySelector('#adminModal .modal-header h3');
  const submitBtn = document.getElementById('publishSubmitBtn');

  if (headerTitle) headerTitle.textContent = 'Publish Campaign Dispatch';
  if (submitBtn) submitBtn.textContent = 'Publish Live to Turso';

  form.reset();
  const keyInput = document.getElementById('adminKey');
  if (keyInput) keyInput.value = getSavedAdminKey();

  document.getElementById('adminModal').classList.add('open');
}

// Open modal in EDIT mode pre-filled with the selected post
function openEditPost(postId) {
  const numericId = Number(postId);
  const post = posts.find((p) => Number(p.id) === numericId);
  if (!post) return;

  const passkey = requestAdminPasskey('Enter Campaign Admin Passkey to edit this dispatch:');
  if (!passkey) return;

  editingPostId = numericId;
  const headerTitle = document.querySelector('#adminModal .modal-header h3');
  const submitBtn = document.getElementById('publishSubmitBtn');

  if (headerTitle) headerTitle.textContent = 'Edit Campaign Dispatch';
  if (submitBtn) submitBtn.textContent = 'Save Changes to Turso';

  document.getElementById('adminKey').value = passkey;
  document.getElementById('postTitle').value = post.title || '';
  document.getElementById('postCategory').value = post.category || 'Manifesto & Policy';
  document.getElementById('postWard').value = post.ward || 'All Wards';
  document.getElementById('postImage').value = post.image_url || '';
  document.getElementById('postSummary').value = post.summary || '';
  document.getElementById('postContent').value = post.content || '';

  document.getElementById('adminModal').classList.add('open');
}

// Delete a post after confirmation + ADMIN_SECRET check
async function handleDeletePost(postId) {
  const numericId = Number(postId);
  const post = posts.find((p) => Number(p.id) === numericId);
  const label = post ? `"${post.title}"` : `dispatch #${numericId}`;

  if (!window.confirm(`Delete ${label}? This will also remove its comments.`)) {
    return;
  }

  const passkey = requestAdminPasskey('Enter Campaign Admin Passkey to confirm deletion:');
  if (!passkey) return;

  try {
    const res = await fetch(`/api/posts/${numericId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': passkey
      },
      body: JSON.stringify({ adminKey: passkey })
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) sessionStorage.removeItem('campaign_admin_key');
      throw new Error(data.error || 'Failed to delete dispatch');
    }

    posts = posts.filter((p) => Number(p.id) !== numericId);
    openCommentDrawers.delete(numericId);
    renderPosts();

    if (document.getElementById('readerModal').classList.contains('open')) {
      closeModal('readerModal');
    }
  } catch (err) {
    alert(err.message);
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function toggleMobileNav() {
  document.getElementById('navLinks').classList.toggle('open');
}

function filterByNav(category) {
  activeCategory = category;
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.category === category);
  });
  document.getElementById('navLinks').classList.remove('open');
  renderPosts();
}

function searchByWard(wardName) {
  activeCategory = 'All';
  searchQuery = wardName;
  document.getElementById('searchInput').value = wardName;
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.category === 'All');
  });
  renderPosts();
}

function resetFilters(e) {
  if (e) e.preventDefault();
  activeCategory = 'All';
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.category === 'All');
  });
  renderPosts();
}

// Replace your createPostForm submit listener with this combined Create + Update handler
const postFormEl = document.getElementById('createPostForm');
const freshFormEl = postFormEl.cloneNode(true);
postFormEl.parentNode.replaceChild(freshFormEl, postFormEl);

freshFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('publishSubmitBtn');
  const isEditing = editingPostId !== null;

  btn.disabled = true;
  btn.textContent = isEditing ? 'Updating Turso...' : 'Publishing to Turso...';

  const adminKeyVal = document.getElementById('adminKey').value.trim();
  const payload = {
    adminKey: adminKeyVal,
    title: document.getElementById('postTitle').value.trim(),
    category: document.getElementById('postCategory').value,
    ward: document.getElementById('postWard').value.trim() || 'All Wards',
    image_url: document.getElementById('postImage').value.trim(),
    summary: document.getElementById('postSummary').value.trim(),
    content: document.getElementById('postContent').value.trim()
  };

  const url = isEditing ? `/api/posts/${editingPostId}` : '/api/posts';
  const method = isEditing ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKeyVal
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) sessionStorage.removeItem('campaign_admin_key');
      throw new Error(data.error || 'Request failed');
    }

    saveAdminKey(adminKeyVal);

    if (isEditing) {
      posts = posts.map((p) => (Number(p.id) === Number(editingPostId) ? data : p));
    } else {
      posts.unshift(data);
    }

    renderPosts();
    freshFormEl.reset();
    editingPostId = null;
    closeModal('adminModal');
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = editingPostId !== null ? 'Save Changes to Turso' : 'Publish Live to Turso';
  }
});
document.getElementById('categoryTabs').addEventListener('click', (e) => {
  if (!e.target.classList.contains('tab-btn')) return;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  e.target.classList.add('active');
  activeCategory = e.target.dataset.category;
  renderPosts();
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  renderPosts();
});

document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.classList.remove('open');
  });
});

// Boot application
fetchPosts();