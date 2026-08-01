const express = require('express');
const bcrypt = require('bcryptjs');
const { Users } = require('../models');
const { signToken } = require('../utils/token');

const router = express.Router();

// POST /api/auth/login
// Simple email+password login. Seeded users (see src/seed.js):
//   admin@example.com / admin123   (ADMIN)
//   alice@example.com / alice123   (USER)
//   bob@example.com   / bob123     (USER)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = Users.findByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

module.exports = router;
