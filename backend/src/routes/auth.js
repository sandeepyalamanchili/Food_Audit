const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');

function sign(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /api/auth/register
// The very first account to register becomes an admin; everyone after is an auditor
// unless promoted. This keeps setup simple without an invite-code system.
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.length) return res.status(409).json({ error: 'An account with that email already exists' });

    const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM users');
    const role = Number(countRows[0].count) === 0 ? 'admin' : 'auditor';

    const password_hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const { rows } = await pool.query(
      'INSERT INTO users (id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [id, name.trim(), email.trim().toLowerCase(), password_hash, role]
    );
    const user = rows[0];
    const token = sign(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) return res.status(400).json({ error: 'email and password are required' });

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (!rows.length) return res.status(401).json({ error: 'Incorrect email or password' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });

    const token = sign(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

// GET /api/auth/me — used on app load to check if a stored token is still valid
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
