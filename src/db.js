const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// node:sqlite is Node's built-in SQLite driver (stable, unflagged as of
// Node 22.13.0 / 23.4.0+). We use it instead of a native module like
// better-sqlite3 specifically because it ships inside Node itself — no
// node-gyp/Visual-Studio/Xcode build step required on any OS, which is
// what caused `npm install` to fail on Windows without build tools.
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data.db');

const db = global.__db || new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

if (process.env.NODE_ENV !== 'production') {
  global.__db = db;
}

module.exports = db;
