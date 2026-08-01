const express = require('express');
const { Users } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/users  -> list of users (id/name/email/role only), used to
// populate the "assign to" dropdown in the UI.
router.get('/', requireAuth, (req, res) => {
  res.json(Users.list());
});

// GET /api/users/me -> current user's profile (handy for the frontend after login)
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
