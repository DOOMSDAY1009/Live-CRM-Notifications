const express = require('express');
const { Companies, Assignments } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/companies -> list all companies with their contacts + assignments
router.get('/', requireAuth, (req, res) => {
  const companies = Companies.listWithContacts();
  const assignments = Assignments.listAllWithUser().filter((a) => a.entityType === 'COMPANY');

  const withAssignments = companies.map((c) => ({
    ...c,
    assignments: assignments.filter((a) => a.entityId === c.id),
  }));

  res.json(withAssignments);
});

// POST /api/companies { name, industry }
router.post('/', requireAuth, (req, res) => {
  const { name, industry } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const company = Companies.create({ name, industry });
  res.status(201).json(company);
});

module.exports = router;
