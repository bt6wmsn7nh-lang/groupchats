const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const helmet = require('helmet');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const PORT = process.env.PORT || 3000;

const dbPath = process.env.DB_PATH || path.join(__dirname, 'messenger.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups_table (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  owner_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(group_id, user_id),
  FOREIGN KEY(group_id) REFERENCES groups_table(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(group_id) REFERENCES groups_table(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

const sessionMiddleware = session({
  store: new SqliteStore({
    client: db,
    expired: { clear: true, intervalMs: 15 * 60 * 1000 }
  }),
  name: 'frxsty.sid',
  secret: process.env.SESSION_SECRET || 'replace-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(sessionMiddleware);
app.get('/style.css', (_req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'You must log in.' });
  next();
}

function cleanUsername(value) {
  return String(value || '').trim();
}

function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[crypto.randomInt(0, alphabet.length)];
  return code;
}

function getUniqueCode() {
  let code;
  do code = generateCode();
  while (db.prepare('SELECT id FROM groups_table WHERE code = ?').get(code));
  return code;
}

function isMember(groupId, userId) {
  return Boolean(db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId));
}

app.post('/api/signup', async (req, res) => {
  try {
    const username = cleanUsername(req.body.username);
    const password = String(req.body.password || '');

    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–20 characters using letters, numbers, or underscores.' });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'Password must be 8–72 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    res.json({ user: { id: result.lastInsertRowid, username } });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'That username is already taken.' });
    console.error(err);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/login', async (req, res) => {
  const username = cleanUsername(req.body.username);
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ user: { id: user.id, username: user.username } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: { id: req.session.userId, username: req.session.username } });
});

app.get('/api/groups', auth, (req, res) => {
  const groups = db.prepare(`
    SELECT g.id, g.name, g.code, g.owner_id, g.created_at,
      (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count,
      (SELECT body FROM messages m WHERE m.group_id = g.id ORDER BY m.id DESC LIMIT 1) AS last_message
    FROM groups_table g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY COALESCE((SELECT MAX(id) FROM messages m2 WHERE m2.group_id = g.id), 0) DESC, g.id DESC
  `).all(req.session.userId);
  res.json({ groups });
});

app.post('/api/groups', auth, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Group name must be 2–40 characters.' });

  const code = getUniqueCode();
  const create = db.transaction(() => {
    const result = db.prepare('INSERT INTO groups_table (name, code, owner_id) VALUES (?, ?, ?)').run(name, code, req.session.userId);
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(result.lastInsertRowid, req.session.userId);
    return result.lastInsertRowid;
  });
  const id = create();
  res.json({ group: { id, name, code, owner_id: req.session.userId, member_count: 1 } });
});

app.post('/api/groups/join', auth, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const group = db.prepare('SELECT * FROM groups_table WHERE code = ?').get(code);
  if (!group) return res.status(404).json({ error: 'No group was found with that code.' });

  db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(group.id, req.session.userId);
  const memberCount = db.prepare('SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?').get(group.id).count;
  res.json({ group: { ...group, member_count: memberCount } });
});

app.get('/api/groups/:id/messages', auth, (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId) || !isMember(groupId, req.session.userId)) return res.status(403).json({ error: 'You are not in that group.' });

  const group = db.prepare('SELECT id, name, code, owner_id FROM groups_table WHERE id = ?').get(groupId);
  const messages = db.prepare(`
    SELECT m.id, m.body, m.created_at, u.id AS user_id, u.username
    FROM messages m JOIN users u ON u.id = m.user_id
    WHERE m.group_id = ? ORDER BY m.id ASC LIMIT 500
  `).all(groupId);
  res.json({ group, messages });
});

app.delete('/api/groups/:id/leave', auth, (req, res) => {
  const groupId = Number(req.params.id);
  const group = db.prepare('SELECT * FROM groups_table WHERE id = ?').get(groupId);
  if (!group || !isMember(groupId, req.session.userId)) return res.status(404).json({ error: 'Group not found.' });
  if (group.owner_id === req.session.userId) return res.status(400).json({ error: 'The group owner cannot leave. Delete ownership features can be added later.' });
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, req.session.userId);
  res.json({ ok: true });
});

io.engine.use(sessionMiddleware);
io.use((socket, next) => {
  const session = socket.request.session;
  if (!session?.userId) return next(new Error('Unauthorized'));
  next();
});

io.on('connection', (socket) => {
  const userId = socket.request.session.userId;
  const username = socket.request.session.username;

  socket.on('join-group', (groupId) => {
    groupId = Number(groupId);
    if (Number.isInteger(groupId) && isMember(groupId, userId)) socket.join(`group:${groupId}`);
  });

  socket.on('send-message', (payload, callback = () => {}) => {
    try {
      const groupId = Number(payload?.groupId);
      const body = String(payload?.body || '').trim();
      if (!Number.isInteger(groupId) || !isMember(groupId, userId)) return callback({ error: 'You are not in that group.' });
      if (!body || body.length > 1000) return callback({ error: 'Message must be 1–1000 characters.' });

      const result = db.prepare('INSERT INTO messages (group_id, user_id, body) VALUES (?, ?, ?)').run(groupId, userId, body);
      const message = db.prepare(`
        SELECT m.id, m.body, m.created_at, u.id AS user_id, u.username
        FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?
      `).get(result.lastInsertRowid);
      io.to(`group:${groupId}`).emit('new-message', { groupId, message });
      callback({ ok: true });
    } catch (err) {
      console.error(err);
      callback({ error: 'Message could not be sent.' });
    }
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => console.log(`Messenger running on port ${PORT}`));
