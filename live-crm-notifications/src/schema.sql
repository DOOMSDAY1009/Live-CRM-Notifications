CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  industry TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  companyId INTEGER REFERENCES companies(id),
  createdAt TEXT NOT NULL
);

-- entityType/entityId identify the target of the assignment (a Company or
-- a Contact) instead of two nullable foreign keys, so new assignable entity
-- types can be added later without a schema change.
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  entityType TEXT NOT NULL CHECK (entityType IN ('COMPANY', 'CONTACT')),
  entityId INTEGER NOT NULL,
  role TEXT NOT NULL,
  reminderSent INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'ASSIGNMENT',
  metadata TEXT,
  isRead INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(userId, isRead);
CREATE INDEX IF NOT EXISTS idx_assignments_reminder ON assignments(reminderSent, createdAt);
