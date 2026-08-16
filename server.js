/* ============================================================
   CatVerse — Backend Server (Node.js + Express + MySQL / SQLite)
   Real SQL Database with Live WebSockets & REST API
   ============================================================ */

require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 8085;

// Middleware (Support large image/video uploads)
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(path.join(__dirname)));

// ─── Database Abstraction Layer (MySQL with SQLite Auto-Fallback) ─
let dbType = 'sqlite'; // 'mysql' | 'sqlite'
let mysqlPool = null;
let sqliteDb = null;

// Helper to execute parameterized SQL query
async function query(sql, params = []) {
  if (dbType === 'mysql') {
    const [rows] = await mysqlPool.execute(sql, params);
    return rows;
  } else {
    return new Promise((resolve, reject) => {
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
      if (isSelect) {
        sqliteDb.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else {
        sqliteDb.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ insertId: this.lastID, affectedRows: this.changes });
        });
      }
    });
  }
}

// Initialize MySQL or SQLite
async function initDatabase() {
  const mysqlHost = process.env.DB_HOST || 'localhost';
  const mysqlUser = process.env.DB_USER || 'root';
  const mysqlPass = process.env.DB_PASSWORD || '';
  const mysqlDbName = process.env.DB_NAME || 'catverse_db';
  const mysqlPort = parseInt(process.env.DB_PORT || '3306', 10);

  let mysqlAvailable = false;

  try {
    const mysql = require('mysql2/promise');
    // Attempt connecting to MySQL server
    const conn = await mysql.createConnection({
      host: mysqlHost,
      user: mysqlUser,
      password: mysqlPass,
      port: mysqlPort
    });

    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${mysqlDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.end();

    mysqlPool = mysql.createPool({
      host: mysqlHost,
      user: mysqlUser,
      password: mysqlPass,
      database: mysqlDbName,
      port: mysqlPort,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test pool connection
    await mysqlPool.query('SELECT 1');
    dbType = 'mysql';
    mysqlAvailable = true;
    console.log(`🐬 Connected to real MySQL database: ${mysqlDbName} on ${mysqlHost}:${mysqlPort}`);

    // Create MySQL Tables
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        bio TEXT,
        avatar LONGTEXT,
        created_at BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS posts (
        id VARCHAR(64) PRIMARY KEY,
        author_username VARCHAR(50) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'cat',
        cat_name VARCHAR(100),
        title VARCHAR(200),
        description TEXT,
        media LONGTEXT,
        media_type VARCHAR(20) DEFAULT 'image',
        ai_breed VARCHAR(100),
        ai_confidence INT DEFAULT 100,
        tags TEXT,
        created_at BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id VARCHAR(64) NOT NULL,
        username VARCHAR(50) NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE KEY unique_like (post_id, username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS comments (
        id VARCHAR(64) PRIMARY KEY,
        post_id VARCHAR(64) NOT NULL,
        author_username VARCHAR(50) NOT NULL,
        comment_text TEXT NOT NULL,
        created_at BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_a VARCHAR(50) NOT NULL,
        user_b VARCHAR(50) NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE KEY unique_friendship (user_a, user_b)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS saved_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        post_id VARCHAR(64) NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE KEY unique_save (username, post_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

  } catch (err) {
    console.log(`ℹ️ MySQL not active on ${mysqlHost}:${mysqlPort} (${err.message}). Using local embedded SQL relational engine.`);
    dbType = 'sqlite';
  }

  if (!mysqlAvailable) {
    const sqlite3 = require('sqlite3').verbose();
    const dbFilePath = path.join(__dirname, 'catverse_local.db');
    sqliteDb = new sqlite3.Database(dbFilePath);

    console.log(`📁 Connected to local SQL relational database: ${dbFilePath}`);

    // Create SQLite relational tables (identical SQL schema)
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT NOT NULL,
        bio TEXT,
        avatar TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        author_username TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'cat',
        cat_name TEXT,
        title TEXT,
        description TEXT,
        media TEXT,
        media_type TEXT DEFAULT 'image',
        ai_breed TEXT,
        ai_confidence INTEGER DEFAULT 100,
        tags TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        username TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (post_id, username)
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        author_username TEXT NOT NULL,
        comment_text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_a TEXT NOT NULL,
        user_b TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (user_a, user_b)
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS saved_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        post_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (username, post_id)
      );
    `);
  }
}

// ─── WebSocket Live Broadcasting ─────────────────────────────
function broadcast(event, payload) {
  const msg = JSON.stringify({ event, data: payload });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ event: 'CONNECTED', dbType }));
});

// ─── REST API ROUTES ─────────────────────────────────────────

// Database status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    database: dbType,
    serverTime: Date.now()
  });
});

// Auth: Sign Up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password, displayName, bio, avatar } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    const existing = await query('SELECT username FROM users WHERE username = ?', [cleanUsername]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    if (cleanEmail) {
      const existingEmail = await query('SELECT username FROM users WHERE email = ?', [cleanEmail]);
      if (existingEmail.length > 0) {
        return res.status(400).json({ error: 'Email is already registered' });
      }
    }

    const now = Date.now();
    await query(
      'INSERT INTO users (username, email, password, display_name, bio, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cleanUsername, cleanEmail, password, displayName || cleanUsername, bio || '', avatar || '', now]
    );

    const newUser = {
      username: cleanUsername,
      email: cleanEmail,
      displayName: displayName || cleanUsername,
      bio: bio || '',
      avatar: avatar || '',
      friends: [],
      saved: []
    };

    broadcast('NEW_USER', newUser);
    res.json({ success: true, user: newUser });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create user account' });
  }
});

// Auth: Log In (Supports Username or Email)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const identifier = username?.trim().toLowerCase();
    const rows = await query('SELECT * FROM users WHERE username = ? OR email = ?', [identifier, identifier]);

    if (rows.length === 0 || rows[0].password !== password) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const user = rows[0];

    // Fetch user's friends
    const friendRows = await query(
      'SELECT user_b as friend FROM friends WHERE user_a = ? UNION SELECT user_a as friend FROM friends WHERE user_b = ?',
      [user.username, user.username]
    );

    // Fetch user's saved posts
    const savedRows = await query('SELECT post_id FROM saved_posts WHERE username = ?', [user.username]);

    res.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        bio: user.bio,
        avatar: user.avatar,
        friends: friendRows.map(r => r.friend),
        saved: savedRows.map(r => r.post_id)
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get All Posts (with likes and comments)
app.get('/api/posts', async (req, res) => {
  try {
    const postRows = await query('SELECT * FROM posts ORDER BY created_at DESC LIMIT 100');
    const posts = [];

    for (const p of postRows) {
      // Get likes
      const likes = await query('SELECT username FROM likes WHERE post_id = ?', [p.id]);
      // Get comments
      const comments = await query('SELECT id, author_username as author, comment_text as text, created_at as timestamp FROM comments WHERE post_id = ? ORDER BY created_at ASC', [p.id]);

      posts.push({
        id: p.id,
        author: p.author_username,
        type: p.type,
        catName: p.cat_name,
        title: p.title,
        description: p.description,
        media: p.media,
        mediaType: p.media_type,
        aiBreed: p.ai_breed,
        aiConfidence: p.ai_confidence,
        tags: p.tags ? p.tags.split(',').filter(Boolean) : [],
        likes: likes.map(l => l.username),
        comments: comments,
        timestamp: Number(p.created_at)
      });
    }

    res.json(posts);
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Create Post (Cat Photo or CatTake Video)
app.post('/api/posts', async (req, res) => {
  try {
    const { id, type, author, catName, title, description, media, mediaType, aiBreed, aiConfidence, tags } = req.body;
    if (!author) return res.status(400).json({ error: 'Author is required' });

    const now = Date.now();
    const postId = id || 'id_' + now.toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    const tagsStr = Array.isArray(tags) ? tags.join(',') : (tags || '');

    await query(
      `INSERT INTO posts (id, author_username, type, cat_name, title, description, media, media_type, ai_breed, ai_confidence, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [postId, author, type || 'cat', catName || null, title || null, description || '', media || null, mediaType || 'image', aiBreed || 'Cat', aiConfidence || 100, tagsStr, now]
    );

    const fullPost = {
      id: postId,
      author,
      type: type || 'cat',
      catName: catName || null,
      title: title || null,
      description: description || '',
      media: media || null,
      mediaType: mediaType || 'image',
      aiBreed: aiBreed || 'Cat',
      aiConfidence: aiConfidence || 100,
      tags: Array.isArray(tags) ? tags : [],
      likes: [],
      comments: [],
      timestamp: now
    };

    broadcast('NEW_POST', fullPost);
    res.json({ success: true, post: fullPost });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Delete Post
app.delete('/api/posts/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    await query('DELETE FROM posts WHERE id = ?', [postId]);
    await query('DELETE FROM likes WHERE post_id = ?', [postId]);
    await query('DELETE FROM comments WHERE post_id = ?', [postId]);

    broadcast('DELETE_POST', { postId });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Toggle Like on Post
app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const postId = req.params.id;
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const existing = await query('SELECT * FROM likes WHERE post_id = ? AND username = ?', [postId, username]);
    let liked = false;

    if (existing.length > 0) {
      await query('DELETE FROM likes WHERE post_id = ? AND username = ?', [postId, username]);
      liked = false;
    } else {
      await query('INSERT INTO likes (post_id, username, created_at) VALUES (?, ?, ?)', [postId, username, Date.now()]);
      liked = true;
    }

    const allLikes = await query('SELECT username FROM likes WHERE post_id = ?', [postId]);
    const likesList = allLikes.map(l => l.username);

    broadcast('POST_LIKES_UPDATED', { postId, likes: likesList });
    res.json({ success: true, liked, likes: likesList });
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Add Comment to Post
app.post('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = req.params.id;
    const { author, text } = req.body;
    if (!author || !text) return res.status(400).json({ error: 'Author and text required' });

    const commentId = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
    const now = Date.now();

    await query(
      'INSERT INTO comments (id, post_id, author_username, comment_text, created_at) VALUES (?, ?, ?, ?, ?)',
      [commentId, postId, author, text.trim(), now]
    );

    const newComment = { id: commentId, author, text: text.trim(), timestamp: now };
    broadcast('NEW_COMMENT', { postId, comment: newComment });
    res.json({ success: true, comment: newComment });
  } catch (err) {
    console.error('Comment error:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// Delete Comment
app.delete('/api/posts/:id/comments/:commentId', async (req, res) => {
  try {
    const { commentId, id: postId } = req.params;
    await query('DELETE FROM comments WHERE id = ?', [commentId]);
    broadcast('DELETE_COMMENT', { postId, commentId });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Get Users List
app.get('/api/users', async (req, res) => {
  try {
    const userRows = await query('SELECT username, display_name as displayName, bio, avatar, created_at FROM users');
    const usersMap = {};

    for (const u of userRows) {
      const friendRows = await query(
        'SELECT user_b as friend FROM friends WHERE user_a = ? UNION SELECT user_a as friend FROM friends WHERE user_b = ?',
        [u.username, u.username]
      );
      usersMap[u.username] = {
        username: u.username,
        displayName: u.displayName,
        bio: u.bio,
        avatar: u.avatar,
        friends: friendRows.map(f => f.friend)
      };
    }

    res.json(usersMap);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Toggle Friendship (Add/Remove Friend)
app.post('/api/friends/toggle', async (req, res) => {
  try {
    const { userA, userB } = req.body;
    if (!userA || !userB || userA === userB) return res.status(400).json({ error: 'Invalid users' });

    const u1 = userA < userB ? userA : userB;
    const u2 = userA < userB ? userB : userA;

    const existing = await query('SELECT * FROM friends WHERE user_a = ? AND user_b = ?', [u1, u2]);
    let isFriend = false;

    if (existing.length > 0) {
      await query('DELETE FROM friends WHERE user_a = ? AND user_b = ?', [u1, u2]);
      isFriend = false;
    } else {
      await query('INSERT INTO friends (user_a, user_b, created_at) VALUES (?, ?, ?)', [u1, u2, Date.now()]);
      isFriend = true;
    }

    broadcast('FRIENDSHIP_CHANGED', { userA, userB, isFriend });
    res.json({ success: true, isFriend });
  } catch (err) {
    console.error('Friend toggle error:', err);
    res.status(500).json({ error: 'Failed to toggle friendship' });
  }
});

// Toggle Save/Bookmark
app.post('/api/saves/toggle', async (req, res) => {
  try {
    const { username, postId } = req.body;
    if (!username || !postId) return res.status(400).json({ error: 'Username and postId required' });

    const existing = await query('SELECT * FROM saved_posts WHERE username = ? AND post_id = ?', [username, postId]);
    let saved = false;

    if (existing.length > 0) {
      await query('DELETE FROM saved_posts WHERE username = ? AND post_id = ?', [username, postId]);
      saved = false;
    } else {
      await query('INSERT INTO saved_posts (username, post_id, created_at) VALUES (?, ?, ?)', [username, postId, Date.now()]);
      saved = true;
    }

    res.json({ success: true, saved });
  } catch (err) {
    console.error('Save toggle error:', err);
    res.status(500).json({ error: 'Failed to toggle save' });
  }
});

// ─── Start Server ────────────────────────────────────────────
initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`🐾 CatVerse Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize CatVerse server:', err);
});
