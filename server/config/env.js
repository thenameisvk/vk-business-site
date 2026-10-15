'use strict';
require('dotenv').config();

const required = ['MONGO_URI', 'JWT_SECRET', 'ADMIN_SECRET_KEY'];
const missing = required.filter((k) => !process.env[k] || !process.env[k].trim());
if (missing.length) {
  console.error(`\n✖ Missing required environment variables: ${missing.join(', ')}\n  Copy .env.example to .env and fill them in.\n`);
  process.exit(1);
}

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const list = (v, d) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d);

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: num(process.env.PORT, 5000),
  MONGO_URI: process.env.MONGO_URI.trim(),
  AUTO_INDEX: process.env.AUTO_INDEX !== 'false',

  JWT_SECRET: process.env.JWT_SECRET.trim(),
  ADMIN_SECRET_KEY: process.env.ADMIN_SECRET_KEY.trim().toUpperCase(),
  ADMIN_TOKEN_TTL: process.env.ADMIN_TOKEN_TTL || '8h',
  USER_TOKEN_TTL: process.env.USER_TOKEN_TTL || '7d',

  CLIENT_ORIGINS: list(process.env.CLIENT_ORIGINS, ['http://localhost:5173', 'http://localhost:3000']),
  TRUST_PROXY: num(process.env.TRUST_PROXY, 0),

  /* business rules (see utils/loanMath.js) */
  REBATE_RATIO: Math.min(1, Math.max(0, num(process.env.REBATE_RATIO, 0.5))),   // 10% → 5% = 0.5
  LATE_INTEREST_ENABLED: process.env.LATE_INTEREST_ENABLED !== 'false',
};

if (env.JWT_SECRET.length < 32) {
  console.error('\n✖ JWT_SECRET must be at least 32 characters long.\n');
  process.exit(1);
}
if (env.ADMIN_SECRET_KEY.length < 6) {
  console.error('\n✖ ADMIN_SECRET_KEY must be at least 6 characters long.\n');
  process.exit(1);
}
if (env.NODE_ENV === 'production' && /CHANGE[_-]?ME/i.test(env.ADMIN_SECRET_KEY + env.JWT_SECRET)) {
  console.error('\n✖ Replace the placeholder secrets in .env before running in production.\n');
  process.exit(1);
}

/** options handed to loanMath.evaluate everywhere */
env.MATH = { rebateRatio: env.REBATE_RATIO, lateInterest: env.LATE_INTEREST_ENABLED };

module.exports = env;