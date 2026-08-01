const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { runFollowupCheck } = require('../jobs/followupJob');

module.exports = function jobsRouter(io) {
  const router = express.Router();

  // POST /api/jobs/run-followup
  // The follow-up reminder job already runs automatically every 30s (see
  // src/jobs/followupJob.js). This endpoint just lets a reviewer trigger it
  // on demand during a live demo instead of waiting.
  router.post('/run-followup', requireAuth, requireAdmin, (req, res) => {
    const created = runFollowupCheck(io);
    res.json({ created: created.length, notifications: created });
  });

  return router;
};
