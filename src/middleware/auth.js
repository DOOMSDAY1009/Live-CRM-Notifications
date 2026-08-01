const { verifyToken } = require('../utils/token');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization token' });
  }

  try {
    req.user = verifyToken(token); // { id, email, role, name }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin role required for this action' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
