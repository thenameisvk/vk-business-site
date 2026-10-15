'use strict';
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const User = require('../models/User');
const { AppError, asyncHandler } = require('../utils/http');

/** constant-time string compare (hashes first so lengths never leak) */
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const signToken = (payload, expiresIn) => jwt.sign(payload, env.JWT_SECRET, { expiresIn });

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError(401, 'Please sign in to continue.'));
  try {
    const p = jwt.verify(token, env.JWT_SECRET);
    req.auth = { sub: p.sub, role: p.role };
    return next();
  } catch {
    return next(new AppError(401, 'Your session has expired. Please sign in again.'));
  }
}

const requireAdmin = [
  requireAuth,
  (req, res, next) => (req.auth.role === 'admin' ? next() : next(new AppError(403, 'Admin access only.'))),
];

/** customer token + a live DB check, so blocking someone takes effect immediately */
const requireUser = [
  requireAuth,
  asyncHandler(async (req, res, next) => {
    if (req.auth.role !== 'user') throw new AppError(403, 'Customer access only.');
    const u = await User.findById(req.auth.sub).select('name status').lean();
    if (!u) throw new AppError(401, 'Account not found. Please sign in again.');
    if (u.status === 'blocked') throw new AppError(403, 'Your account is blocked. Please contact us.');
    if (u.status === 'pending') throw new AppError(403, 'Your account is awaiting approval.');
    req.customer = u;
    next();
  }),
];

module.exports = { safeEqual, signToken, requireAuth, requireAdmin, requireUser };