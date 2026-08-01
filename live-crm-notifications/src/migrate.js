const fs = require('fs');
const path = require('path');
const db = require('./db');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

console.log('Migration applied. Tables ready at', process.env.DATABASE_PATH || path.join(__dirname, '..', 'data.db'));
