const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const { Pool } = require('pg');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Create/connect a PostgreSQL database.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(20) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));

    CREATE TABLE IF NOT EXISTS groups_table (
      id SERIAL PRIMARY KEY,
      name VARCHAR(40) NOT NULL,
      code VARCHAR(8) NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS groups_code_upper_idx ON groups_table (UPPER(code));

    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES groups_table(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups_table(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body VARCHAR(1000) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS messages_group_id_id_idx ON messages (group_id, id);
  `);
}

const sessionMiddleware = session({
  store: new pgSession({ pool, createTableIfMissing: true }),
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
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'database unavailable' });
  }
});

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'You must log in.' });
  next();
}
function cleanUsername(value) { return String(value || '').trim(); }
function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[crypto.randomInt(0, alphabet.length)];
  return code;
}
async function getUniqueCode() {
  while (true) {
    const code = generateCode();
    const found = await pool.query('SELECT id FROM groups_table WHERE UPPER(code) = UPPER($1)', [code]);
    if (!found.rowCount) return code;
  }
}
async function isMember(groupId, userId) {
  const result = await pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  return result.rowCount > 0;
}

app.post('/api/signup', async (req, res) => {
  try {
    const username = cleanUsername(req.body.username);
    const password = String(req.body.password || '');
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'Username must be 3–20 characters using letters, numbers, or underscores.' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be 8–72 characters.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );
    const user = result.rows[0];
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That username is already taken.' });
    console.error(err);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const username = cleanUsername(req.body.username);
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Incorrect username or password.' });
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not log in.' });
  }
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json({ user: req.session.userId ? { id: req.session.userId, username: req.session.username } : null }));

app.get('/api/groups', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.id, g.name, g.code, g.owner_id, g.created_at,
        (SELECT COUNT(*)::int FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count,
        (SELECT body FROM messages m WHERE m.group_id = g.id ORDER BY m.id DESC LIMIT 1) AS last_message
      FROM groups_table g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = $1
      ORDER BY COALESCE((SELECT MAX(id) FROM messages m2 WHERE m2.group_id = g.id), 0) DESC, g.id DESC
    `, [req.session.userId]);
    res.json({ groups: result.rows });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Could not load groups.' });
  }
});

app.post('/api/groups', auth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Group name must be 2–40 characters.' });
  const client = await pool.connect();
  try {
    const code = await getUniqueCode();
    await client.query('BEGIN');
    const created = await client.query('INSERT INTO groups_table (name, code, owner_id) VALUES ($1, $2, $3) RETURNING id', [name, code, req.session.userId]);
    const id = created.rows[0].id;
    await client.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [id, req.session.userId]);
    await client.query('COMMIT');
    res.json({ group: { id, name, code, owner_id: req.session.userId, member_count: 1 } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Could not create group.' });
  } finally { client.release(); }
});

app.post('/api/groups/join', auth, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    const found = await pool.query('SELECT * FROM groups_table WHERE UPPER(code) = UPPER($1)', [code]);
    const group = found.rows[0];
    if (!group) return res.status(404).json({ error: 'No group was found with that code.' });
    await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [group.id, req.session.userId]);
    const count = await pool.query('SELECT COUNT(*)::int AS count FROM group_members WHERE group_id = $1', [group.id]);
    res.json({ group: { ...group, member_count: count.rows[0].count } });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Could not join group.' });
  }
});

app.get('/api/groups/:id/messages', auth, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || !(await isMember(groupId, req.session.userId))) return res.status(403).json({ error: 'You are not in that group.' });
    const groupResult = await pool.query('SELECT id, name, code, owner_id FROM groups_table WHERE id = $1', [groupId]);
    const messagesResult = await pool.query(`
      SELECT m.id, m.body, m.created_at, u.id AS user_id, u.username
      FROM messages m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = $1 ORDER BY m.id ASC LIMIT 500
    `, [groupId]);
    res.json({ group: groupResult.rows[0], messages: messagesResult.rows });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Could not load messages.' });
  }
});

app.delete('/api/groups/:id/leave', auth, async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const found = await pool.query('SELECT * FROM groups_table WHERE id = $1', [groupId]);
    const group = found.rows[0];
    if (!group || !(await isMember(groupId, req.session.userId))) return res.status(404).json({ error: 'Group not found.' });
    if (group.owner_id === req.session.userId) return res.status(400).json({ error: 'The group owner cannot leave.' });
    await pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, req.session.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Could not leave group.' });
  }
});

io.engine.use(sessionMiddleware);
io.use((socket, next) => socket.request.session?.userId ? next() : next(new Error('Unauthorized')));
io.on('connection', (socket) => {
  const userId = socket.request.session.userId;

  socket.on('join-group', async (groupId) => {
    try {
      groupId = Number(groupId);
      if (Number.isInteger(groupId) && await isMember(groupId, userId)) socket.join(`group:${groupId}`);
    } catch (err) { console.error(err); }
  });

  socket.on('send-message', async (payload, callback = () => {}) => {
    try {
      const groupId = Number(payload?.groupId);
      const body = String(payload?.body || '').trim();
      if (!Number.isInteger(groupId) || !(await isMember(groupId, userId))) return callback({ error: 'You are not in that group.' });
      if (!body || body.length > 1000) return callback({ error: 'Message must be 1–1000 characters.' });
      const result = await pool.query(`
        WITH inserted AS (
          INSERT INTO messages (group_id, user_id, body) VALUES ($1, $2, $3)
          RETURNING id, body, created_at, user_id
        )
        SELECT i.id, i.body, i.created_at, u.id AS user_id, u.username
        FROM inserted i JOIN users u ON u.id = i.user_id
      `, [groupId, userId, body]);
      const message = result.rows[0];
      io.to(`group:${groupId}`).emit('new-message', { groupId, message });
      callback({ ok: true });
    } catch (err) {
      console.error(err); callback({ error: 'Message could not be sent.' });
    }
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

initializeDatabase()
  .then(() => server.listen(PORT, () => console.log(`Messenger running on port ${PORT}`)))
  .catch((err) => { console.error('Database setup failed:', err); process.exit(1); });
