const express = require('express');
const { Notifications } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications?unread=true
// Always scoped to req.user.id — a user can only ever see their own
// notifications, regardless of what's in the DB.
router.get('/', requireAuth, (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const notifications = Notifications.listForUser(req.user.id, { unreadOnly });
  const unreadCount = Notifications.countUnread(req.user.id);
  res.json({ notifications, unreadCount });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, (req, res) => {
  const id = Number(req.params.id);

  const notification = Notifications.findById(id);
  if (!notification || notification.userId !== req.user.id) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  res.json(Notifications.markRead(id));
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, (req, res) => {
  Notifications.markAllRead(req.user.id);
  res.json({ success: true });
});

module.exports = router;
