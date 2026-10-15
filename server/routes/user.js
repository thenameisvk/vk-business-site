'use strict';
/* =====================================================================
   /api/user — login + everything a CUSTOMER sees on the Home page
   ===================================================================== */
const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const User = require('../models/User');
const Cash = require('../models/Cash');
const Settings = require('../models/Settings');
const Message = require('../models/Message');
const validate = require('../middleware/validate');
const { safeEqual, signToken, requireAuth, requireUser } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/http');
const { loginBody, messageBody } = require('../utils/validators');
const { serializeLoan, summarize } = require('../utils/serialize');

const router = express.Router();

/* Brute-force guard: 10 failed sign-ins per 15 min per IP (successes don't count) */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please wait 15 minutes and try again.' },
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `chat:${req.auth?.sub || req.ip}`,
  message: { message: 'You are sending messages too quickly. Please slow down.' },
});

/* ---------- POST /login — admin key OR customer secret key ---------- */
router.post('/login', loginLimiter, validate({ body: loginBody }), asyncHandler(async (req, res) => {
  const key = req.valid.body.secretKey.toUpperCase();

  if (safeEqual(key, env.ADMIN_SECRET_KEY)) {
    return res.json({
      token: signToken({ sub: 'admin', role: 'admin' }, env.ADMIN_TOKEN_TTL),
      role: 'admin',
      user: { name: 'Admin' },
    });
  }

  const u = await User.findOne({ secretKey: key }).select('name status').lean();
  if (!u) throw new AppError(401, 'Invalid secret key. Please check it and try again.');
  if (u.status === 'blocked') throw new AppError(403, 'Your account is blocked. Please contact us.');
  if (u.status === 'pending') throw new AppError(403, 'Your account is awaiting approval. Please contact us.');

  return res.json({
    token: signToken({ sub: String(u._id), role: 'user' }, env.USER_TOKEN_TTL),
    role: 'user',
    user: { id: String(u._id), name: u.name },
  });
}));

/* ---------- GET /public — safe to call before signing in ---------- */
router.get('/public', asyncHandler(async (req, res) => {
  const s = await Settings.main();
  res.json({ supportPhone: s.supportPhone });
}));

/* ---------- GET /me — validates a stored token on page load ---------- */
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  if (req.auth.role === 'admin') return res.json({ role: 'admin', user: { name: 'Admin' } });
  const u = await User.findById(req.auth.sub).select('name status').lean();
  if (!u) throw new AppError(401, 'Account not found. Please sign in again.');
  if (u.status !== 'active') throw new AppError(403, 'This account cannot sign in right now.');
  return res.json({ role: 'user', user: { id: String(u._id), name: u.name } });
}));

/* ---------- everything below needs an ACTIVE customer ---------- */
router.use(requireUser);

router.get('/config', asyncHandler(async (req, res) => {
  const s = await Settings.main();
  res.json({ upiId: s.upiId, payeeName: s.payeeName, supportPhone: s.supportPhone, terms: s.terms });
}));

/* ---------- GET /accounts — the customer's cash entries, fully calculated ---------- */
router.get('/accounts', asyncHandler(async (req, res) => {
  const docs = await Cash.find({ user: req.customer._id }).sort({ startDate: -1, _id: -1 }).lean();
  const now = new Date();
  res.json({
    user: { id: String(req.customer._id), name: req.customer.name },
    summary: summarize(docs, now),
    accounts: docs.map((d) => serializeLoan(d, now)),
  });
}));

/* ---------- chat ---------- */
const mapMessage = (m) => ({ id: String(m._id), from: m.from === 'u' ? 'me' : 'vk', text: m.text, at: m.at.toISOString() });

router.get('/messages', asyncHandler(async (req, res) => {
  const [items, unread] = await Promise.all([
    Message.find({ user: req.customer._id }).sort({ at: 1 }).limit(200).select('from text at').lean(),
    Message.countDocuments({ user: req.customer._id, from: 'a', read: false }),
  ]);
  res.json({ items: items.map(mapMessage), unread });
}));

router.post('/messages', chatLimiter, validate({ body: messageBody }), asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const sent = await Message.countDocuments({ user: req.customer._id, from: 'u', at: { $gte: since } });
  if (sent >= 100) throw new AppError(429, 'Daily message limit reached. Please call us instead.');
  const m = await Message.create({ user: req.customer._id, from: 'u', text: req.valid.body.text });
  res.status(201).json(mapMessage(m));
}));

router.post('/messages/read', asyncHandler(async (req, res) => {
  await Message.updateMany({ user: req.customer._id, from: 'a', read: false }, { $set: { read: true } });
  res.json({ ok: true });
}));

module.exports = router;