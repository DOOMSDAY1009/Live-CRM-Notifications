const db = require('./db');

const nowISO = () => new Date().toISOString();
const toBool = (v) => !!v;

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------
const Users = {
  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },
  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  create({ name, email, password, role = 'USER' }) {
    const createdAt = nowISO();
    const info = db
      .prepare('INSERT INTO users (name, email, password, role, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(name, email, password, role, createdAt);
    return Users.findById(info.lastInsertRowid);
  },
  list() {
    return db.prepare('SELECT id, name, email, role FROM users ORDER BY name ASC').all();
  },
};

// ---------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------
const Companies = {
  findById(id) {
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  },
  create({ name, industry }) {
    const createdAt = nowISO();
    const info = db
      .prepare('INSERT INTO companies (name, industry, createdAt) VALUES (?, ?, ?)')
      .run(name, industry || null, createdAt);
    return Companies.findById(info.lastInsertRowid);
  },
  listWithContacts() {
    const companies = db.prepare('SELECT * FROM companies ORDER BY createdAt DESC').all();
    const contacts = db.prepare('SELECT * FROM contacts').all();
    return companies.map((c) => ({
      ...c,
      contacts: contacts.filter((ct) => ct.companyId === c.id),
    }));
  },
  count() {
    return db.prepare('SELECT COUNT(*) as count FROM companies').get().count;
  },
};

// ---------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------
const Contacts = {
  findById(id) {
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  },
  create({ name, email, phone, companyId }) {
    const createdAt = nowISO();
    const info = db
      .prepare('INSERT INTO contacts (name, email, phone, companyId, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(name, email || null, phone || null, companyId || null, createdAt);
    return Contacts.findById(info.lastInsertRowid);
  },
  listWithCompany() {
    const contacts = db.prepare('SELECT * FROM contacts ORDER BY createdAt DESC').all();
    const companies = db.prepare('SELECT * FROM companies').all();
    return contacts.map((c) => ({
      ...c,
      company: companies.find((co) => co.id === c.companyId) || null,
    }));
  },
};

// ---------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------
const Assignments = {
  create({ userId, entityType, entityId, role }) {
    const createdAt = nowISO();
    const info = db
      .prepare(
        'INSERT INTO assignments (userId, entityType, entityId, role, reminderSent, createdAt) VALUES (?, ?, ?, ?, 0, ?)'
      )
      .run(userId, entityType, entityId, role, createdAt);
    return db.prepare('SELECT * FROM assignments WHERE id = ?').get(info.lastInsertRowid);
  },
  listByEntityType(entityType) {
    return db.prepare('SELECT * FROM assignments WHERE entityType = ?').all(entityType);
  },
  listAllWithUser() {
    const assignments = db.prepare('SELECT * FROM assignments ORDER BY createdAt DESC').all();
    const users = db.prepare('SELECT id, name, email FROM users').all();
    return assignments.map((a) => ({
      ...a,
      reminderSent: toBool(a.reminderSent),
      user: users.find((u) => u.id === a.userId),
    }));
  },
  listDueForReminder(cutoffISO) {
    return db
      .prepare('SELECT * FROM assignments WHERE reminderSent = 0 AND createdAt <= ?')
      .all(cutoffISO);
  },
  markReminderSent(id) {
    db.prepare('UPDATE assignments SET reminderSent = 1 WHERE id = ?').run(id);
  },
};

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------
const Notifications = {
  create({ userId, message, type = 'ASSIGNMENT', metadata = null }) {
    const createdAt = nowISO();
    const info = db
      .prepare(
        'INSERT INTO notifications (userId, message, type, metadata, isRead, createdAt) VALUES (?, ?, ?, ?, 0, ?)'
      )
      .run(userId, message, type, metadata, createdAt);
    return Notifications.findById(info.lastInsertRowid);
  },
  findById(id) {
    const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    return row ? { ...row, isRead: toBool(row.isRead) } : row;
  },
  listForUser(userId, { unreadOnly = false } = {}) {
    const rows = unreadOnly
      ? db
          .prepare('SELECT * FROM notifications WHERE userId = ? AND isRead = 0 ORDER BY createdAt DESC')
          .all(userId)
      : db.prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    return rows.map((r) => ({ ...r, isRead: toBool(r.isRead) }));
  },
  countUnread(userId) {
    return db
      .prepare('SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND isRead = 0')
      .get(userId).count;
  },
  markRead(id) {
    db.prepare('UPDATE notifications SET isRead = 1 WHERE id = ?').run(id);
    return Notifications.findById(id);
  },
  markAllRead(userId) {
    db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0').run(userId);
  },
};

module.exports = { Users, Companies, Contacts, Assignments, Notifications };
