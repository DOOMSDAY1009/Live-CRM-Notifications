const express = require('express');
const { Users, Companies, Contacts, Assignments } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createNotification } = require('../utils/notify');

module.exports = function assignmentsRouter(io) {
  const router = express.Router();

  // GET /api/assignments -> admin view of all assignments
  router.get('/', requireAuth, requireAdmin, (req, res) => {
    res.json(Assignments.listAllWithUser());
  });

  // POST /api/assignments { entityType: "COMPANY"|"CONTACT", entityId, userId, role }
  // Admin-only: this is the action the assignment spec describes as
  // "When an admin assigns a company/contact to a user". Creates the
  // Assignment row, then immediately creates+pushes a live notification to
  // ONLY the assigned user's socket room.
  router.post('/', requireAuth, requireAdmin, (req, res) => {
    const { entityType, entityId, userId, role } = req.body;

    if (!entityType || !entityId || !userId || !role) {
      return res.status(400).json({ error: 'entityType, entityId, userId, role are required' });
    }
    if (!['COMPANY', 'CONTACT'].includes(entityType)) {
      return res.status(400).json({ error: 'entityType must be COMPANY or CONTACT' });
    }

    const user = Users.findById(Number(userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    const entity =
      entityType === 'COMPANY'
        ? Companies.findById(Number(entityId))
        : Contacts.findById(Number(entityId));
    if (!entity) return res.status(404).json({ error: `${entityType} not found` });

    const assignment = Assignments.create({
      userId: Number(userId),
      entityType,
      entityId: Number(entityId),
      role,
    });

    const notification = createNotification(io, {
      userId: Number(userId),
      type: 'ASSIGNMENT',
      message: `You have been assigned to ${entity.name} as ${role}.`,
      metadata: { assignmentId: assignment.id, entityType, entityId: Number(entityId) },
    });

    res.status(201).json({ assignment, notification });
  });

  return router;
};
