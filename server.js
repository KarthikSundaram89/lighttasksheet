// server.js
// LightTaskSheet - Node.js server storing per-user JSON sheets and simple JWT auth.
// Intended for internal networks. Do NOT expose to the public internet without hardening.

const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'please_change_this_secret_for_prod';
const JWT_EXP = process.env.JWT_EXP || '8h'; // token lifetime
const SCRIPTS_DIR = path.join(__dirname, 'scripts');
const BACKUP_SCRIPT = path.join(SCRIPTS_DIR, 'backup_data.sh');

// ensure data dir and users file
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// helpers
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}'); }
  catch (e) { return {}; }
}
function writeUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2), 'utf8'); }
function userDataFile(userId) { return path.join(DATA_DIR, `${userId}.json`); }

// JWT middleware
function authenticateJWT(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'missing authorization' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'invalid authorization format' });
  const token = parts[1];
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(401).json({ error: 'invalid token' });
    req.user = payload; // payload should have { username }
    next();
  });
}

// Register (creates user and an empty sheet)
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = readUsers();
  if (users[username]) return res.status(409).json({ error: 'user exists' });
  const hash = await bcrypt.hash(password, 10);
  users[username] = { passwordHash: hash, createdAt: new Date().toISOString(), isAdmin: false };
  writeUsers(users);
  // create empty sheet
  const emptySheet = { columns: ["Timestamp","Task","Progress"], rows: [] };
  fs.writeFileSync(userDataFile(username), JSON.stringify(emptySheet, null, 2), 'utf8');
  return res.json({ ok: true });
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = readUsers();
  const u = users[username];
  if (!u) return res.status(401).json({ error: 'invalid credentials' });
  const match = await bcrypt.compare(password, u.passwordHash);
  if (!match) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXP });
  return res.json({ token, username });
});

// Get sheet (must be same user)
app.get('/api/sheet/:userId', authenticateJWT, (req, res) => {
  const userId = req.params.userId;
  if (req.user.username !== userId) return res.status(403).json({ error: 'forbidden' });
  const file = userDataFile(userId);
  if (!fs.existsSync(file)) {
    const empty = { columns: ["Timestamp","Task","Progress"], rows: [] };
    fs.writeFileSync(file, JSON.stringify(empty, null, 2), 'utf8');
    return res.json({ sheet: empty });
  }
  try {
    const content = fs.readFileSync(file, 'utf8');
    return res.json({ sheet: JSON.parse(content) });
  } catch (e) {
    return res.status(500).json({ error: 'failed to read sheet' });
  }
});

// Save sheet (must be same user)
app.post('/api/sheet/:userId', authenticateJWT, (req, res) => {
  const userId = req.params.userId;
  if (req.user.username !== userId) return res.status(403).json({ error: 'forbidden' });
  const sheet = req.body.sheet;
  if (!sheet || !Array.isArray(sheet.columns) || !Array.isArray(sheet.rows)) {
    return res.status(400).json({ error: 'invalid sheet format' });
  }
  try {
    fs.writeFileSync(userDataFile(userId), JSON.stringify(sheet, null, 2), 'utf8');
    return res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: 'failed to save sheet' });
  }
});

// --- ADMIN ROUTES ---
// helper to check admin flag from users.json
function isAdminUser(username) {
  const users = readUsers();
  const u = users[username];
  return !!(u && u.isAdmin);
}

// middleware to ensure admin
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.username) return res.status(401).json({ error: 'unauthenticated' });
  if (!isAdminUser(req.user.username)) return res.status(403).json({ error: 'admin required' });
  next();
}

// List users (admin)
app.get('/api/admin/users', authenticateJWT, requireAdmin, (req, res) => {
  const users = readUsers();
  const out = {};
  for (const [k, v] of Object.entries(users)) {
    out[k] = { createdAt: v.createdAt, isAdmin: !!v.isAdmin };
  }
  res.json({ users: out });
});

// Create user (admin)
app.post('/api/admin/users', authenticateJWT, requireAdmin, async (req, res) => {
  const { username, password, isAdmin } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });
  const users = readUsers();
  if (users[username]) return res.status(409).json({ error: 'user exists' });
  const hash = await bcrypt.hash(password, 10);
  users[username] = { passwordHash: hash, createdAt: new Date().toISOString(), isAdmin: !!isAdmin };
  writeUsers(users);
  // create empty user file
  const emptySheet = { columns: ["Timestamp","Task","Progress"], rows: [] };
  fs.writeFileSync(userDataFile(username), JSON.stringify(emptySheet, null, 2), 'utf8');
  res.json({ ok: true, user: { username, isAdmin: !!isAdmin } });
});

// Delete user (admin)
app.delete('/api/admin/users/:u', authenticateJWT, requireAdmin, (req, res) => {
  const u = req.params.u;
  const users = readUsers();
  if (!users[u]) return res.status(404).json({ error: 'user not found' });
  delete users[u];
  writeUsers(users);
  try { fs.unlinkSync(userDataFile(u)); } catch(e){}
  res.json({ ok: true });
});

// Toggle admin flag (admin)
app.post('/api/admin/users/:u/set-admin', authenticateJWT, requireAdmin, (req, res) => {
  const u = req.params.u;
  const { isAdmin } = req.body || {};
  const users = readUsers();
  if (!users[u]) return res.status(404).json({ error: 'user not found' });
  users[u].isAdmin = !!isAdmin;
  writeUsers(users);
  res.json({ ok: true, user: { username: u, isAdmin: users[u].isAdmin } });
});

// Trigger backup (admin) - runs the backup script via child_process
app.post('/api/admin/backup', authenticateJWT, requireAdmin, (req, res) => {
  if (!fs.existsSync(BACKUP_SCRIPT)) return res.status(500).json({ error: 'backup script missing' });
  exec(`bash ${BACKUP_SCRIPT}`, { timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('backup error', err, stderr);
      return res.status(500).json({ error: 'backup failed', details: stderr || err.message });
    }
    return res.json({ ok: true, output: stdout.trim() });
  });
});

// simple status
app.get('/ping', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LightTaskSheet listening on ${PORT} (data dir: ${DATA_DIR})`));
