require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Turso Client
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize Schema & Seed Initial Posts
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
    )`
  ], 'write');

  // Seed default posts if table is empty
  const existing = await db.execute('SELECT COUNT(*) as count FROM posts');
  if (existing.rows[0].count === 0) {
    await db.execute({
      sql: `INSERT INTO posts (title, category, ward, summary, content, image_url, likes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'Digital Hubs & Youth Tech-Bursary Blueprint for 2027',
        'Manifesto & Policy',
        'Central Ward',
        'Every ward deserves high-speed fiber hubs, software bootcamps, and transparent NG-CDF bursary tracking.',
        'Our youth should not have to leave the constituency to access remote digital jobs. Under our 2027 Constituency Transformation Plan, we will establish solar-backed ICT innovation hubs in all 5 wards, paired with direct skill grants and transparent online NG-CDF bursary disbursements.',
        'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1000&q=80',
        48
      ]
    });
  }
}

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

// POST create a new dispatch (Protected by simple campaign key)
app.post('/api/posts', async (req, res) => {
  const { title, category, ward, summary, content, image_url, adminKey } = req.body;

  if (process.env.ADMIN_SECRET && adminKey !== process.env.ADMIN_SECRET) {
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
        summary || content.slice(0, 140) + '...',
        content.trim(),
        image_url || 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=1000&q=80'
      ]
    });
    res.status(201).json({ ...result.rows[0], comments: [] });
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ error: 'Failed to publish dispatch' });
  }
});

// POST increment like count
app.post('/api/posts/:id/like', async (req, res) => {
  const postId = Number(req.params.id);
  try {
    const result = await db.execute({
      sql: 'UPDATE posts SET likes = likes + 1 WHERE id = ? RETURNING likes',
      args: [postId]
    });
    if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    res.json({ likes: result.rows[0].likes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register endorsement' });
  }
});

// POST add a constituent comment
app.post('/api/posts/:id/comments', async (req, res) => {
  const postId = Number(req.params.id);
  const { author_name, ward, body } = req.body;

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
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// ✅ Works in Express 5
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