const { verifyToken } = require('../utils/token');

/**
 * Wires up Socket.io: every connecting client must present the same JWT it
 * uses for REST calls (via `auth: { token }` on the client). We verify it,
 * then join the socket to a room scoped to that single user's id. All
 * notification emits go to `user:<id>` only — no broadcast, so users never
 * see each other's notifications.
 */
function initSockets(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication token required'));

    try {
      const payload = verifyToken(token);
      socket.user = payload;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const room = `user:${socket.user.id}`;
    socket.join(room);
    console.log(`[socket] ${socket.user.email} connected -> joined room ${room}`);

    socket.on('disconnect', () => {
      console.log(`[socket] ${socket.user.email} disconnected`);
    });
  });
}

module.exports = { initSockets };
