require('dotenv').config();

// Polyfill Web Fetch globals for older Node.js runtimes on Windows 8.1
if (!globalThis.Headers || !globalThis.fetch) {
  const nodeFetch = require('node-fetch');
  globalThis.fetch = nodeFetch;
  globalThis.Headers = nodeFetch.Headers;
  globalThis.Request = nodeFetch.Request;
  globalThis.Response = nodeFetch.Response;
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to Turso (with automatic local SQLite fallback if URL is missing)
const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
const dbToken = (process.env.TURSO_AUTH_TOKEN || '').trim();

if (!dbUrl) {
  console.warn('TURSO_DATABASE_URL not set — using local SQLite file (local.db)');
}

const db = createClient({
  url: dbUrl || 'file:local.db',
  authToken: dbUrl ? dbToken : undefined,
});

// Helper to verify ADMIN_SECRET from body or header
function isAuthorizedAdmin(req) {
  const secret = (process.env.ADMIN_SECRET || '').trim();
  if (!secret) return true; // Open if ADMIN_SECRET is not configured
  const provided =
    (req.body && req.body.adminKey) ||
    req.headers['x-admin-key'] ||
    '';
  return String(provided).trim() === secret;
}

// Initialize Turso Schema & Seed Initial Data
async function initDatabase() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      ward TEXT DEFAULT 'Constituency HQ',
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      likes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      ward TEXT DEFAULT 'Resident',
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS social_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS volunteers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      ward TEXT DEFAULT 'Constituency HQ',
      role TEXT DEFAULT 'Ward Mobilizer',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ward_scorecards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ward_key TEXT UNIQUE NOT NULL,
      ward_name TEXT NOT NULL,
      allocation TEXT NOT NULL,
      project TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      milestone TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ], 'write');

  // Seed initial dispatches across all 4 sections with endorsements & Enkiguena comments
  const existingPosts = await db.execute('SELECT COUNT(*) as count FROM posts');
  if (Number(existingPosts.rows[0].count) === 0) {
    await db.batch([
      {
        sql: `INSERT INTO posts (title, category, ward, summary, content, image_url, likes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'Digital Hubs & Youth Tech-Bursary Blueprint for 2027',
          'Manifesto & Policy',
          'Central Ward',
          'Solar-backed ICT innovation hubs, coding bootcamps, and transparent online NG-CDF bursary tracking across all 5 wards.',
          'Our youth should not have to leave the constituency to access remote digital jobs. Under our 2027 Constituency Transformation Plan, we will establish solar-backed ICT innovation hubs in all 5 wards, paired with direct TVET and university skill grants and an open online NG-CDF bursary tracker so every family can verify allocations transparently.',
          'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1000&q=80',
          142
        ]
      },
      {
        sql: `INSERT INTO posts (title, category, ward, summary, content, image_url, likes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'Open NG-CDF Water & Solar Borehole Charter',
          'Manifesto & Policy',
          'North Ward',
          'Published quarterly ward water budgets, solar pump maintenance schedules, and livestock trough expansion plans.',
          'Reliable water is dignity and survival. Every ward development committee will publish quarterly project milestones, contractor timelines, and NG-CDF disbursements so residents can track borehole rehabilitation, manyatta water pans, and school tank installations without guesswork.',
          'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1000&q=80',
          118
        ]
      },
      {
        sql: `INSERT INTO posts (title, category, ward, summary, content, image_url, likes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'North & West Ward Manyatta Baraza: Water, Pastures & School Labs',
          'Constituency Tours',
          'North Ward',
          'Highlights from our consultative barazas with elders, Moran vanguard, and parents on borehole reticulation and science labs.',
          'Across our consultative ward barazas in North and West Wards, residents prioritized clean water points near grazing corridors, improved secondary school laboratory equipment, and feeder road drainage ahead of rainy seasons. Every priority raised at the baraza has been logged into our ward action tracker.',
          'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1000&q=80',
          96
        ]
      },
      {
        sql: `INSERT INTO posts (title, category, ward, summary, content, image_url, likes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'East Ward Townhall: Youth Voices, Clinic Solar & Market Access',
          'Constituency Tours',
          'East Ward',
          'Townhall takeaways from East Ward focusing on maternal clinic backup power, youth sports academies, and market road links.',
          'During the East Ward community townhall, young creatives, boda operators, and health volunteers shared practical ideas on extending clinic lighting hours, upgrading local playfields, and linking East Ward farm produce directly to regional markets.',
          'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1000&q=80',
          87
        ]
      },
      {
        sql: `INSERT INTO posts (title, category, ward, summary, content, image_url, likes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'Market Sheds, Solar Cold Storage & Zero-Interest Biashara Fund',
          'Youth & Economy',
          'South Ward',
          'Upgrading open-air markets with solar cold-storage units and revolving table-banking boosts for traders and youth.',
          'Small traders and young entrepreneurs drive daily household livelihoods. Through our Youth & Economy blueprint, we will build modern sheltered market stalls with solar cold storage to cut spoilage and establish structured revolving table-banking support for women and youth enterprises.',
          'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1000&q=80',
          164
        ]
      },
      {
        sql: `INSERT INTO posts (title, category, ward, summary, content, image_url, likes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'Agri-Value Chains & Remote Digital Work Fellowship',
          'Youth & Economy',
          'Central Ward',
          'Connecting graduates and agro-processors with digital freelancing mentorship, equipment leasing, and cooperative buyers.',
          'We are pairing practical digital skills—web engineering, data, digital marketing, and remote customer operations—with cooperative support for horticultural and livestock value addition so young people can earn sustainable incomes locally.',
          'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1000&q=80',
          129
        ]
      },
      {
        sql: `INSERT INTO posts (title, category, ward, summary, content, image_url, likes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'Secretariat Statement: Full Transparency on Bursary & Ward Audit Rollout',
          'Press Releases',
          'All Wards',
          'Official campaign secretariat release welcoming public scrutiny, ward-level project scorecards, and peaceful civic dialogue.',
          'The Hon. David Kamau 2027 Secretariat reaffirms our commitment to issue-based leadership, open NG-CDF accountability, and respectful Enkiguena across every ward. All ward scorecard metrics and citizen submissions are published openly for community verification.',
          'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1000&q=80',
          79
        ]
      },
      {
        sql: `INSERT INTO posts (title, category, ward, summary, content, image_url, likes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'Press Release: Launch of Moran & Community Vanguard Mobilization Desk',
          'Press Releases',
          'West Ward',
          'Formal rollout of ward-level volunteer coordination to support voter civic education, baraza logistics, and ward feedback.',
          'Our newly launched Moran & Community Vanguard desk brings together ward mobilizers, youth coordinators, and community elders to organize peaceful townhalls, share policy summaries, and gather verified ward-level priorities.',
          'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1000&q=80',
          104
        ]
      }
    ], 'write');
  }
  const existingSocials = await db.execute('SELECT COUNT(*) as count FROM social_channels');
  if (Number(existingSocials.rows[0].count) === 0) {
    await db.batch([
      {
        sql: `INSERT INTO social_channels (platform_key, label, url, sort_order) VALUES (?, ?, ?, ?)`,
        args: ['facebook', 'Facebook', 'https://facebook.com/', 1]
      },
      {
        sql: `INSERT INTO social_channels (platform_key, label, url, sort_order) VALUES (?, ?, ?, ?)`,
        args: ['x', 'X (Twitter)', 'https://x.com/', 2]
      },
      {
        sql: `INSERT INTO social_channels (platform_key, label, url, sort_order) VALUES (?, ?, ?, ?)`,
        args: ['whatsapp', 'WhatsApp Channel', 'https://whatsapp.com/channel/', 3]
      },
      {
        sql: `INSERT INTO social_channels (platform_key, label, url, sort_order) VALUES (?, ?, ?, ?)`,
        args: ['tiktok', 'TikTok', 'https://tiktok.com/', 4]
      },
      {
        sql: `INSERT INTO social_channels (platform_key, label, url, sort_order) VALUES (?, ?, ?, ?)`,
        args: ['youtube', 'YouTube', 'https://youtube.com/', 5]
      }
    ], 'write');
  }
  // Seed initial Enkiguena comments if comments table is empty
  const existingComments = await db.execute('SELECT COUNT(*) as count FROM comments');
  if (Number(existingComments.rows[0].count) === 0) {
    const seededPosts = await db.execute('SELECT id, title FROM posts ORDER BY id ASC');
    const postRows = seededPosts.rows || [];

    const sampleCommentsByIndex = [
      [
        { author_name: 'Naserian Ole Tipis', ward: 'Central Ward', body: 'Publishing bursary criteria and hub schedules online will save parents endless trips and build real trust.' },
        { author_name: 'Kevin Mutua', ward: 'Central Ward', body: 'Please include practical coding and digital freelancing tracks for TVET and secondary leavers.' }
      ],
      [
        { author_name: 'Pariken Saitoti', ward: 'North Ward', body: 'Solar-powered pumps with clear maintenance schedules will keep water flowing even during dry spells.' },
        { author_name: 'Grace Wanjiku', ward: 'North Ward', body: 'I support publishing every borehole budget line clearly so the community can monitor progress.' }
      ],
      [
        { author_name: 'Loice Nangurai', ward: 'North Ward', body: 'Thank you for holding the baraza directly with elders and families instead of closed-door meetings.' },
        { author_name: 'Samuel Kiprop', ward: 'West Ward', body: 'Lab equipment and road culverts are urgent—glad to see them captured in the ward plan.' }
      ],
      [
        { author_name: 'Amina Hassan', ward: 'East Ward', body: 'Reliable solar backup at our local clinic is vital for evening mothers and emergencies.' },
        { author_name: 'Dennis Otieno', ward: 'East Ward', body: 'Upgrading youth sports and community grounds will keep young people engaged positively.' }
      ],
      [
        { author_name: 'Mary Ndunge', ward: 'South Ward', body: 'Cold storage at the market will stop fresh produce from going to waste over the weekend.' },
        { author_name: 'Josephine Karanja', ward: 'South Ward', body: 'Affordable revolving table-banking support is exactly what market traders need to grow stock.' }
      ],
      [
        { author_name: 'Brian Mwangi', ward: 'Central Ward', body: 'Connecting youth to remote tech jobs and cooperative value chains is a smart long-term play.' }
      ],
      [
        { author_name: 'Peter ole Kuyioni', ward: 'West Ward', body: 'Peaceful, issue-focused politics and transparent scorecards set a strong standard for 2027.' }
      ],
      [
        { author_name: 'Faith Chebet', ward: 'West Ward', body: 'Just registered with the Vanguard—ready to help mobilize our ward for constructive barazas.' }
      ]
    ];

    const commentInserts = [];
    postRows.forEach((post, idx) => {
      const commentsForPost = sampleCommentsByIndex[idx] || [];
      for (const c of commentsForPost) {
        commentInserts.push({
          sql: `INSERT INTO comments (post_id, author_name, ward, body) VALUES (?, ?, ?, ?)`,
          args: [post.id, c.author_name, c.ward, c.body]
        });
      }
    });

    if (commentInserts.length > 0) {
      await db.batch(commentInserts, 'write');
    }
  }
  // Seed ward NG-CDF scorecards if ward_scorecards table is empty
  const existingScorecards = await db.execute('SELECT COUNT(*) as count FROM ward_scorecards');
  if (Number(existingScorecards.rows[0].count) === 0) {
    await db.batch([
      {
        sql: `INSERT INTO ward_scorecards (ward_key, ward_name, allocation, project, progress, milestone, sort_order)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: ['Central', 'Central Ward', 'KES 18.5M Target', 'Youth Digital Hub, TVET Bursary Portal & Town Market Drainage', 78, 'Hub Site & Bursary Audit Ready', 1]
      },
      {
        sql: `INSERT INTO ward_scorecards (ward_key, ward_name, allocation, project, progress, milestone, sort_order)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: ['North', 'North Ward', 'KES 16.0M Target', 'Solar Borehole Reticulation & Livestock Sale-Yard Water Troughs', 64, 'Hydro-Survey & Piping Plan', 2]
      },
      {
        sql: `INSERT INTO ward_scorecards (ward_key, ward_name, allocation, project, progress, milestone, sort_order)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: ['South', 'South Ward', 'KES 17.2M Target', 'Market Sheds, Solar Cold Storage & Biashara Table-Banking Boost', 82, 'Trader Designs & Cold Unit Spec', 3]
      },
      {
        sql: `INSERT INTO ward_scorecards (ward_key, ward_name, allocation, project, progress, milestone, sort_order)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: ['East', 'East Ward', 'KES 15.4M Target', 'Secondary School Lab Upgrades & All-Weather Feeder Culverts', 58, 'School BoM & Road Needs Mapped', 4]
      },
      {
        sql: `INSERT INTO ward_scorecards (ward_key, ward_name, allocation, project, progress, milestone, sort_order)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: ['West', 'West Ward', 'KES 14.8M Target', 'Maternal Clinic Solar Backup, Water Pans & Youth Agri-Grants', 71, 'Manyatta Water Pan Priority List', 5]
      }
    ], 'write');
  }
}

// POST verify ADMIN_SECRET on Secretariat login screen
app.post('/api/admin/verify', (req, res) => {
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Invalid Campaign Admin Passkey' });
  }
  res.json({ authenticated: true });
});

// GET all posts with nested comments
app.get('/api/posts', async (req, res) => {
  try {
    const postsRes = await db.execute('SELECT * FROM posts ORDER BY created_at DESC');
    const commentsRes = await db.execute('SELECT * FROM comments ORDER BY created_at ASC');

    const commentsByPost = {};
    for (const c of commentsRes.rows) {
      if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
      commentsByPost[c.post_id].push(c);
    }

    const posts = postsRes.rows.map((post) => ({
      ...post,
      comments: commentsByPost[post.id] || []
    }));

    res.json(posts);
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).json({ error: 'Failed to load campaign dispatches' });
  }
});

// POST create a new dispatch (Protected by ADMIN_SECRET)
app.post('/api/posts', async (req, res) => {
  const { title, category, ward, summary, content, image_url } = req.body || {};

  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Invalid Campaign Admin Passkey' });
  }
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  try {
    const result = await db.execute({
      sql: `INSERT INTO posts (title, category, ward, summary, content, image_url)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [
        title.trim(),
        category || 'Manifesto & Policy',
        ward || 'All Wards',
        summary || content.trim().slice(0, 140) + '...',
        content.trim(),
        image_url && image_url.trim()
          ? image_url.trim()
          : 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=1000&q=80'
      ]
    });
    res.status(201).json({ ...result.rows[0], comments: [] });
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ error: 'Failed to publish dispatch' });
  }
});

// PUT update an existing dispatch (Protected by ADMIN_SECRET)
app.put('/api/posts/:id', async (req, res) => {
  const postId = Number(req.params.id);
  const { title, category, ward, summary, content, image_url } = req.body || {};

  if (!Number.isInteger(postId) || postId <= 0) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Invalid Campaign Admin Passkey' });
  }
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM posts WHERE id = ?',
      args: [postId]
    });
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    const current = existing.rows[0];
    const nextTitle = title.trim();
    const nextCategory = (category || current.category || 'Manifesto & Policy').trim();
    const nextWard = (ward || current.ward || 'All Wards').trim();
    const nextSummary = (summary || content.trim().slice(0, 140) + '...').trim();
    const nextContent = content.trim();
    const nextImage =
      image_url && image_url.trim()
        ? image_url.trim()
        : current.image_url || 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=1000&q=80';

    const updated = await db.execute({
      sql: `UPDATE posts
            SET title = ?, category = ?, ward = ?, summary = ?, content = ?, image_url = ?
            WHERE id = ?
            RETURNING *`,
      args: [nextTitle, nextCategory, nextWard, nextSummary, nextContent, nextImage, postId]
    });

    const commentsRes = await db.execute({
      sql: 'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC',
      args: [postId]
    });

    res.json({
      ...updated.rows[0],
      comments: commentsRes.rows || []
    });
  } catch (err) {
    console.error('Error updating post:', err);
    res.status(500).json({ error: 'Failed to update dispatch' });
  }
});

// DELETE remove a dispatch and its comments (Protected by ADMIN_SECRET)
app.delete('/api/posts/:id', async (req, res) => {
  const postId = Number(req.params.id);

  if (!Number.isInteger(postId) || postId <= 0) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Invalid Campaign Admin Passkey' });
  }

  try {
    const deleted = await db.execute({
      sql: 'DELETE FROM posts WHERE id = ? RETURNING id',
      args: [postId]
    });
    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    await db.execute({
      sql: 'DELETE FROM comments WHERE post_id = ?',
      args: [postId]
    });

    res.json({ deleted: true, id: postId });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({ error: 'Failed to delete dispatch' });
  }
});

// POST toggle endorsement (+1 or -1)
app.post('/api/posts/:id/like', async (req, res) => {
  const postId = Number(req.params.id);
  const action = req.body && req.body.action === 'unlike' ? 'unlike' : 'like';

  if (!Number.isInteger(postId) || postId <= 0) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }

  try {
    const sql =
      action === 'unlike'
        ? 'UPDATE posts SET likes = MAX(0, likes - 1) WHERE id = ? RETURNING likes'
        : 'UPDATE posts SET likes = likes + 1 WHERE id = ? RETURNING likes';

    const result = await db.execute({ sql, args: [postId] });
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({
      likes: Number(result.rows[0].likes),
      liked: action === 'like'
    });
  } catch (err) {
    console.error('Error toggling endorsement:', err);
    res.status(500).json({ error: 'Failed to update endorsement' });
  }
});

// POST add a constituent comment
app.post('/api/posts/:id/comments', async (req, res) => {
  const postId = Number(req.params.id);
  const { author_name, ward, body } = req.body || {};

  if (!author_name || !body) {
    return res.status(400).json({ error: 'Name and comment text are required' });
  }

  try {
    const result = await db.execute({
      sql: `INSERT INTO comments (post_id, author_name, ward, body)
            VALUES (?, ?, ?, ?) RETURNING *`,
      args: [postId, author_name.trim(), (ward || 'Constituent').trim(), body.trim()]
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error posting comment:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// DELETE moderate/remove a constituent comment (Protected by ADMIN_SECRET)
app.delete('/api/comments/:id', async (req, res) => {
  const commentId = Number(req.params.id);

  if (!Number.isInteger(commentId) || commentId <= 0) {
    return res.status(400).json({ error: 'Invalid comment ID' });
  }
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Invalid Campaign Admin Passkey' });
  }

  try {
    const deleted = await db.execute({
      sql: 'DELETE FROM comments WHERE id = ? RETURNING id',
      args: [commentId]
    });
    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    res.json({ deleted: true, id: commentId });
  } catch (err) {
    console.error('Error deleting comment:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// POST public volunteer registration
app.post('/api/volunteers', async (req, res) => {
  const { full_name, phone, ward, role, notes } = req.body || {};

  if (!full_name || !phone) {
    return res.status(400).json({ error: 'Full name and phone number are required' });
  }

  try {
    const result = await db.execute({
      sql: `INSERT INTO volunteers (full_name, phone, ward, role, notes)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *`,
      args: [
        full_name.trim(),
        phone.trim(),
        (ward || 'All Wards').trim(),
        (role || 'Ward Mobilizer').trim(),
        (notes || '').trim()
      ]
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error registering volunteer:', err);
    res.status(500).json({ error: 'Failed to submit volunteer registration' });
  }
});

// GET all volunteers (Protected by ADMIN_SECRET)
app.get('/api/volunteers', async (req, res) => {
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Invalid Campaign Admin Passkey' });
  }

  try {
    const result = await db.execute('SELECT * FROM volunteers ORDER BY created_at DESC');
    res.json(result.rows || []);
  } catch (err) {
    console.error('Error fetching volunteers:', err);
    res.status(500).json({ error: 'Failed to load volunteers' });
  }
});

// PATCH update volunteer status (Pending / Active / Contacted) (Protected by ADMIN_SECRET)
app.patch('/api/volunteers/:id', async (req, res) => {
  const volunteerId = Number(req.params.id);
  const { status } = req.body || {};
  const allowedStatuses = ['Pending', 'Active', 'Contacted'];

  if (!Number.isInteger(volunteerId) || volunteerId <= 0) {
    return res.status(400).json({ error: 'Invalid volunteer ID' });
  }
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Invalid Campaign Admin Passkey' });
  }
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    const updated = await db.execute({
      sql: 'UPDATE volunteers SET status = ? WHERE id = ? RETURNING *',
      args: [status, volunteerId]
    });
    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Volunteer not found' });
    }
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Error updating volunteer status:', err);
    res.status(500).json({ error: 'Failed to update volunteer status' });
  }
});

// DELETE remove a volunteer record (Protected by ADMIN_SECRET)
app.delete('/api/volunteers/:id', async (req, res) => {
  const volunteerId = Number(req.params.id);

  if (!Number.isInteger(volunteerId) || volunteerId <= 0) {
    return res.status(400).json({ error: 'Invalid volunteer ID' });
  }
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Invalid Campaign Admin Passkey' });
  }

  try {
    const deleted = await db.execute({
      sql: 'DELETE FROM volunteers WHERE id = ? RETURNING id',
      args: [volunteerId]
    });
    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: 'Volunteer not found' });
    }
    res.json({ deleted: true, id: volunteerId });
  } catch (err) {
    console.error('Error deleting volunteer:', err);
    res.status(500).json({ error: 'Failed to delete volunteer' });
  }
});

// GET all ward NG-CDF scorecards (Public)
app.get('/api/scorecards', async (req, res) => {
  try {
    const result = await db.execute(
      'SELECT * FROM ward_scorecards ORDER BY sort_order ASC, id ASC'
    );
    res.json(result.rows || []);
  } catch (err) {
    console.error('Error fetching scorecards:', err);
    res.status(500).json({ error: 'Failed to load ward scorecards' });
  }
});

// PUT update a ward NG-CDF scorecard (Protected by ADMIN_SECRET)
app.put('/api/scorecards/:id', async (req, res) => {
  const scorecardId = Number(req.params.id);
  const { ward_name, allocation, project, progress, milestone } = req.body || {};

  if (!Number.isInteger(scorecardId) || scorecardId <= 0) {
    return res.status(400).json({ error: 'Invalid scorecard ID' });
  }
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Invalid Campaign Admin Passkey' });
  }
  if (!ward_name || !allocation || !project || !milestone) {
    return res.status(400).json({ error: 'Ward name, allocation, project, and milestone are required' });
  }

  const parsedProgress = Math.max(0, Math.min(100, Number(progress) || 0));

  try {
    const updated = await db.execute({
      sql: `UPDATE ward_scorecards
            SET ward_name = ?,
                allocation = ?,
                project = ?,
                progress = ?,
                milestone = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            RETURNING *`,
      args: [
        ward_name.trim(),
        allocation.trim(),
        project.trim(),
        parsedProgress,
        milestone.trim(),
        scorecardId
      ]
    });

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Ward scorecard not found' });
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Error updating scorecard:', err);
    res.status(500).json({ error: 'Failed to update ward scorecard' });
  }
});
// GET all Mheshimiwa social media channels (Public)
app.get('/api/socials', async (req, res) => {
  try {
    const result = await db.execute(
      'SELECT * FROM social_channels ORDER BY sort_order ASC, id ASC'
    );
    res.json(result.rows || []);
  } catch (err) {
    console.error('Error fetching social channels:', err);
    res.status(500).json({ error: 'Failed to load social channels' });
  }
});

// PUT update a social media channel URL/label (Protected by ADMIN_SECRET)
app.put('/api/socials/:id', async (req, res) => {
  const channelId = Number(req.params.id);
  const { label, url } = req.body || {};

  if (!Number.isInteger(channelId) || channelId <= 0) {
    return res.status(400).json({ error: 'Invalid social channel ID' });
  }
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Invalid Campaign Admin Passkey' });
  }
  if (!label || !url) {
    return res.status(400).json({ error: 'Platform label and URL are required' });
  }

  const cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    return res.status(400).json({ error: 'URL must start with https:// or http://' });
  }

  try {
    const updated = await db.execute({
      sql: `UPDATE social_channels
            SET label = ?,
                url = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            RETURNING *`,
      args: [label.trim(), cleanUrl, channelId]
    });

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Social channel not found' });
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Error updating social channel:', err);
    res.status(500).json({ error: 'Failed to update social channel' });
  }
});
// Serve Secretariat Dashboard at /admin (before wildcard fallback)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Express 5 wildcard fallback route
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Campaign server live on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Turso initialization failed:', err);
    process.exit(1);
  });