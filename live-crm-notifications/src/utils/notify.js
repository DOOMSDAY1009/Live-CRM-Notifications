const { Notifications } = require('../models');

/**
 * Creates a notification row and pushes it in real time to the owning
 * user's private Socket.io room ONLY (never a broadcast). If the user is
 * offline, the row is still persisted so they see it next time they poll
 * GET /api/notifications.
 */
function createNotification(io, { userId, message, type = 'ASSIGNMENT', metadata = null }) {
  const notification = Notifications.create({
    userId,
    message,
    type,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });

  // Room naming convention: user:<id>. Each socket joins only its own room
  // on connect (see src/sockets/index.js), so this can never leak to others.
  io.to(`user:${userId}`).emit('notification', notification);

  return notification;
}

module.exports = { createNotification };
