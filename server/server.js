'use strict';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const env = require('./config/env');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/error');

const userRoutes = require('./routes/user');
const settingsRoutes = require('./routes/settings');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);   // set when behind Render / Nginx / a load balancer
app.disable('x-powered-by');

app.use(helmet());
app.use(compression());
app.use(cors({
  origin(origin, cb) {
    if (!origin || env.CLIENT_ORIGINS.includes(origin)) return cb(null, true);   // no Origin = curl / server-to-server
    return cb(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));
app.use(express.json({ limit: '50kb' }));
if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({ ok: up, db: up ? 'connected' : 'disconnected', time: new Date().toISOString() });
});

app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests. Please slow down.' } }));

app.use('/api/user', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

/* ---------- start (skipped when imported by tests) ---------- */
if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      const server = app.listen(env.PORT, () => console.log(`✔ API ready on http://localhost:${env.PORT}/api  (${env.NODE_ENV})`));

      const shutdown = (signal) => {
        console.log(`\n${signal} received — shutting down…`);
        server.close(async () => { await mongoose.connection.close(); process.exit(0); });
        setTimeout(() => process.exit(1), 10000).unref();
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    } catch (err) {
      console.error('✖ Could not start the server:', err.message);
      process.exit(1);
    }
  })();
  process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e));
}