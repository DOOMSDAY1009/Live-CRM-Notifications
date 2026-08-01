require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// Applying schema.sql is safe to run on every boot (CREATE TABLE IF NOT
// EXISTS), and seedDemoData() only inserts the demo companies/contacts the
// first time. Doing both here means the app is self-contained on a fresh
// host: `npm install && npm start` is enough, no separate migrate/seed
// build-step required.
require('./migrate');
const { seedDemoData } = require('./seed');

const { initSockets } = require('./sockets');
const { scheduleFollowupJob } = require('./jobs/followupJob');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const companyRoutes = require('./routes/companies');
const contactRoutes = require('./routes/contacts');
const notificationRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }, // demo-friendly; tighten to your deployed frontend origin in production
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes that don't need the io instance
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/notifications', notificationRoutes);

// Routes that need to emit socket events, wired as factories
app.use('/api/assignments', require('./routes/assignments')(io));
app.use('/api/jobs', require('./routes/jobs')(io));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

initSockets(io);
scheduleFollowupJob(io);

const PORT = process.env.PORT || 4000;

seedDemoData()
  .catch((err) => console.error('[seed] failed (continuing anyway):', err))
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`Live CRM Notification System listening on http://localhost:${PORT}`);
    });
  });
