require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Users, Companies, Contacts } = require('./models');

/**
 * Safe to call on every server boot: users are upserted by email, and the
 * demo companies/contacts are only created the first time (i.e. if the
 * companies table is still empty). This matters for hosting platforms that
 * just run `npm start` on every deploy/restart with no separate one-off
 * seed step — without this guard, restarting the app would duplicate the
 * demo companies every time.
 */
async function seedDemoData() {
  const ensureUser = async (data) => {
    const existing = Users.findByEmail(data.email);
    if (existing) return existing;
    const hashed = await bcrypt.hash(data.password, 10);
    return Users.create({ ...data, password: hashed });
  };

  await ensureUser({ name: 'Ana Admin', email: 'admin@example.com', password: 'admin123', role: 'ADMIN' });
  await ensureUser({ name: 'Alice Owner', email: 'alice@example.com', password: 'alice123', role: 'USER' });
  await ensureUser({ name: 'Bob Rep', email: 'bob@example.com', password: 'bob123', role: 'USER' });

  if (Companies.count() === 0) {
    const acme = Companies.create({ name: 'Acme Corp', industry: 'Manufacturing' });
    const globex = Companies.create({ name: 'Globex Inc', industry: 'Software' });
    Contacts.create({ name: 'Jane Cooper', email: 'jane@acme.com', phone: '555-0101', companyId: acme.id });
    Contacts.create({ name: 'Mark Lee', email: 'mark@globex.com', phone: '555-0102', companyId: globex.id });
  }
}

// Still runnable directly: `npm run seed`
if (require.main === module) {
  seedDemoData()
    .then(() => {
      console.log('Seed complete.');
      console.log('Login with:');
      console.log('  admin@example.com / admin123  (ADMIN)');
      console.log('  alice@example.com / alice123  (USER)');
      console.log('  bob@example.com   / bob123    (USER)');
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { seedDemoData };
