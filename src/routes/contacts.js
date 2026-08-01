const express = require('express');
const { Contacts, Assignments } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/contacts -> list all contacts (with parent company + assignments)
router.get('/', requireAuth, (req, res) => {
  const contacts = Contacts.listWithCompany();
  const assignments = Assignments.listAllWithUser().filter((a) => a.entityType === 'CONTACT');

  const withAssignments = contacts.map((c) => ({
    ...c,
    assignments: assignments.filter((a) => a.entityId === c.id),
  }));

  res.json(withAssignments);
});

// POST /api/contacts { name, email, phone, companyId }
router.post('/', requireAuth, (req, res) => {
  const { name, email, phone, companyId } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const contact = Contacts.create({
    name,
    email,
    phone,
    companyId: companyId ? Number(companyId) : null,
  });
  res.status(201).json(contact);
});

module.exports = router;
