let posts = [];
let allPosts = [];
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

function animateCount(elementId, targetValue, duration = 900) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const end = Math.max(0, Number(targetValue) || 0);
  const start = Number(el.dataset.currentValue || 0);
  el.dataset.currentValue = String(end);

  if (start === end) {
    el.textContent = end.toLocaleString();
    return;
  }

  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);

    el.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = end.toLocaleString();
    }
  }

  requestAnimationFrame(tick);
}

function formatDate(isoString) {
  if (!isoString) return 'Recent';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Recent';
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function trackCampaignEvent(eventName, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}

// Fetch posts & comments from Express -> Turso API
async function fetchPosts() {
  const statusEl = document.getElementById('feedStatus');
  try {
    const res = await fetch('/api/posts');
    if (!res.ok) throw new Error('Failed to load dispatches');
    const data = await res.json();
    posts = Array.isArray(data) ? data : [];
    allPosts = posts.slice();
    statusEl.style.display = 'none';
    renderPosts();
  } catch (err) {
    statusEl.textContent = 'Unable to connect to campaign server. Please refresh.';
    console.error(err);
  }
}

function updateStats() {
  const source = allPosts.length ? allPosts : posts;
  const totalPosts = source.length;
  const totalLikes = source.reduce((sum, p) => sum + Number(p.likes || 0), 0);
  const totalComments = source.reduce(
    (sum, p) => sum + (Array.isArray(p.comments) ? p.comments.length : 0),
    0
  );

  animateCount('statPosts', totalPosts, 700);
  animateCount('statLikes', totalLikes, 1100);
  animateCount('statComments', totalComments, 900);
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
        : `<p style="font-size:0.8rem;color:var(--slate-500);">No Enkiguena entries yet. Be the first resident to speak.</p>`;

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
                <input type="text" name="body" class="form-input" placeholder="Add your Enkiguena view on this proposal..." required />
                <button type="submit" class="btn btn-primary" style="padding:0.5rem 0.9rem;">Post</button>
              </div>
            </form>
          </div>
        </article>
      `;
    })
    .join('');

  observePostCards();
}

function toggleComments(postId) {
  const willOpen = !openCommentDrawers.has(postId);
  if (willOpen) {
    openCommentDrawers.add(postId);
    trackCampaignEvent('toggle_enkiguena_drawer', { post_id: postId });
  } else {
    openCommentDrawers.delete(postId);
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

    const masterPost = allPosts.find((p) => Number(p.id) === numericId);
    if (masterPost) masterPost.likes = Number(data.likes);

    trackCampaignEvent('endorse_dispatch', {
      post_id: numericId,
      action: nextAction,
      ward: (post && post.ward) || 'All Wards'
    });

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

  const masterPost = allPosts.find((p) => p.id === postId);
  if (masterPost && masterPost !== post) {
    if (!masterPost.comments) masterPost.comments = [];
    masterPost.comments.push(newComment);
  }

  trackCampaignEvent('post_enkiguena_comment', {
    post_id: postId,
    ward: ward || 'Constituent'
  });

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
  setButtonLoading(btn, true, 'Posting...');
  try {
    await postCommentToApi(postId, author_name, ward, body);
    form.reset();
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonLoading(btn, false);
  }
}

function openReader(postId) {
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  trackCampaignEvent('open_dispatch_reader', {
    post_id: post.id,
    category: post.category || 'General',
    ward: post.ward || 'All Wards'
  });

  const isLiked = localStorage.getItem(`liked_post_${post.id}`) === 'true';
  const comments = post.comments || [];

  document.getElementById('readerCategory').textContent = `${post.category} • ${post.ward || 'All Wards'}`;
  document.getElementById('readerBody').innerHTML = `
    <img class="reader-cover" src="${escapeHTML(post.image_url || 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=1000&q=80')}" alt="${escapeHTML(post.title)}" />
    <h2 style="font-size:1.55rem;color:var(--obsidian-900);margin-bottom:0.5rem;">${escapeHTML(post.title)}</h2>
    <p style="font-size:0.82rem;color:var(--slate-500);margin-bottom:1.25rem;">Published ${formatDate(post.created_at)}</p>
    <div class="reader-content">${escapeHTML(post.content)}</div>

    <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 0;border-top:1px solid var(--slate-200);border-bottom:1px solid var(--slate-200);margin-bottom:1.25rem;">
      <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="handleLike(${post.id})">
        ${isLiked ? '&#9829; Endorsed by You' : '&#9825; Endorse This Proposal'} (${post.likes || 0})
      </button>
      <span style="font-size:0.85rem;font-weight:700;color:var(--slate-600);">${comments.length} Citizen Responses</span>
    </div>

    <h4 style="margin-bottom:0.75rem;color:var(--obsidian-900);">Enkiguena (Community Dialogue)</h4>
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
          : '<p style="font-size:0.8rem;color:var(--slate-500);">No Enkiguena entries yet. Be the first resident to speak.</p>'
      }
    </div>

    <form class="inline-comment-form" onsubmit="submitModalComment(event, ${post.id})">
      <div class="inline-comment-row">
        <input type="text" name="author_name" class="form-input" placeholder="Your Full Name *" required />
        <input type="text" name="ward" class="form-input" placeholder="Your Ward" />
      </div>
      <textarea name="body" class="form-input" style="min-height:75px;" placeholder="Share your Enkiguena view with Hon. David Kamau..." required></textarea>
      <button type="submit" class="btn btn-primary">Submit Enkiguena Entry</button>
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
  setButtonLoading(btn, true, 'Submitting...');
  try {
    await postCommentToApi(postId, author_name, ward, body);
    openReader(postId);
  } catch (err) {
    alert(err.message);
  } finally {
    setButtonLoading(btn, false);
  }
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function toggleMobileNav() {
  document.getElementById('navLinks').classList.toggle('open');
}

function closeMobileNav() {
  const navLinks = document.getElementById('navLinks');
  if (navLinks) navLinks.classList.remove('open');
}

function filterByNav(category) {
  activeCategory = category;
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.category === category);
  });
  closeMobileNav();
  trackCampaignEvent('filter_dispatch_category', {
    category,
    source: 'nav'
  });
  renderPosts();
}

function searchByWard(wardName) {
  activeCategory = 'All';
  searchQuery = wardName;
  document.getElementById('searchInput').value = wardName;
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.category === 'All');
  });
  trackCampaignEvent('search_dispatch_ward', { ward: wardName });
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
  trackCampaignEvent('reset_dispatch_filters');
  renderPosts();
}

document.getElementById('categoryTabs').addEventListener('click', (e) => {
  if (!e.target.classList.contains('tab-btn')) return;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  e.target.classList.add('active');
  activeCategory = e.target.dataset.category;
  trackCampaignEvent('filter_dispatch_category', {
    category: activeCategory,
    source: 'tabs'
  });
  renderPosts();
});

let searchTrackTimer = null;
document.getElementById('searchInput').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  renderPosts();

  clearTimeout(searchTrackTimer);
  if (searchQuery.length >= 2) {
    searchTrackTimer = setTimeout(() => {
      trackCampaignEvent('search_dispatches', { search_term: searchQuery });
    }, 600);
  }
});

document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.classList.remove('open');
  });
});

function openVolunteerModal() {
  const successBox = document.getElementById('volunteerSuccessBox');
  if (successBox) {
    successBox.style.display = 'none';
    successBox.textContent = '';
  }
  closeMobileNav();
  trackCampaignEvent('open_volunteer_modal');
  document.getElementById('volunteerModal').classList.add('open');
}

const volunteerFormEl = document.getElementById('volunteerSignupForm');
if (volunteerFormEl) {
  volunteerFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('volSubmitBtn');
    const successBox = document.getElementById('volunteerSuccessBox');

    setButtonLoading(btn, true, 'Submitting Registration...');

    const payload = {
      full_name: document.getElementById('volFullName').value.trim(),
      phone: document.getElementById('volPhone').value.trim(),
      ward: document.getElementById('volWard').value,
      role: document.getElementById('volRole').value,
      notes: document.getElementById('volNotes').value.trim()
    };

    try {
      const res = await fetch('/api/volunteers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not register volunteer');

      trackCampaignEvent('volunteer_registered', {
        ward: payload.ward,
        role: payload.role
      });

      volunteerFormEl.reset();
      if (successBox) {
        successBox.textContent = `Asante, ${data.full_name}! You are registered for ${data.ward} (${data.role}). Our Secretariat team will contact you shortly.`;
        successBox.style.display = 'block';
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setButtonLoading(btn, false);
    }
  });
}

let postRevealObserver = null;

function observePostCards() {
  const cards = document.querySelectorAll('#postsGrid .post-card');
  if (!cards.length) return;

  if (!('IntersectionObserver' in window)) {
    cards.forEach((card) => card.classList.add('is-visible'));
    return;
  }

  if (!postRevealObserver) {
    postRevealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove('reveal-pending');
            entry.target.classList.add('is-visible');
            postRevealObserver.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -30px 0px'
      }
    );
  }

  cards.forEach((card, index) => {
    card.classList.add('reveal-on-scroll');
    const rect = card.getBoundingClientRect();
    const alreadyInView = rect.top < window.innerHeight * 0.95;

    if (alreadyInView) {
      card.style.transitionDelay = `${Math.min(index * 70, 280)}ms`;
      card.classList.add('is-visible');
    } else {
      card.style.transitionDelay = `${Math.min((index % 3) * 80, 240)}ms`;
      card.classList.add('reveal-pending');
      postRevealObserver.observe(card);
    }
  });
}
function setButtonLoading(btn, isLoading, loadingText = 'Submitting...') {
  if (!btn) return;
  if (isLoading) {
    if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${escapeHTML(loadingText)}`;
  } else {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
  }
}
// Boot application
fetchPosts();