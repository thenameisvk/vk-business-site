'use strict';
/* HTTP-layer + schema tests that need NO database connection.
   (Auth, validation, error shapes, Mongoose schemas, response shape.) */
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:1/never-connects';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.ADMIN_SECRET_KEY = 'TESTADMIN1';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('./server');
const Cash = require('./models/Cash');
const User = require('./models/User');
const Message = require('./models/Message');
const Event = require('./models/Event');
const Settings = require('./models/Settings');
const M = require('./loanMath');
const { makeSecretKey } = require('./utils/secretkey');
const { serializeLoan } = require('./utils/serialize');

const sign = (role) => jwt.sign({ sub: role === 'admin' ? 'admin' : '64b000000000000000000001', role }, process.env.JWT_SECRET, { expiresIn: '1h' });
const ADMIN = `Bearer ${sign('admin')}`;
const USER = `Bearer ${sign('user')}`;
const ID = '64b000000000000000000001';

test('health reports the database as disconnected (503) instead of crashing', async () => {
  const r = await request(app).get('/api/health');
  assert.equal(r.status, 503);
  assert.equal(r.body.ok, false);
});

test('admin key signs in without touching the database', async () => {
  const r = await request(app).post('/api/user/login').send({ secretKey: 'testadmin1 ' }); // case/space tolerant
  assert.equal(r.status, 200);
  assert.equal(r.body.role, 'admin');
  assert.equal(jwt.verify(r.body.token, process.env.JWT_SECRET).role, 'admin');
});

test('login validation: missing / too short key', async () => {
  assert.equal((await request(app).post('/api/user/login').send({})).status, 400);
  const r = await request(app).post('/api/user/login').send({ secretKey: 'ab' });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /too short/i);
});

test('protected routes reject missing / wrong-role tokens', async () => {
  assert.equal((await request(app).get('/api/settings/customers')).status, 401);
  assert.equal((await request(app).get('/api/settings/customers').set('Authorization', USER)).status, 403);
  assert.equal((await request(app).get('/api/dashboard/overview').set('Authorization', USER)).status, 403);
  assert.equal((await request(app).get('/api/user/accounts').set('Authorization', ADMIN)).status, 403);
  assert.equal((await request(app).get('/api/user/accounts').set('Authorization', 'Bearer nonsense')).status, 401);
});

test('query / params / body validation returns friendly 400s', async () => {
  assert.equal((await request(app).get('/api/settings/customers?limit=999').set('Authorization', ADMIN)).status, 400);
  assert.equal((await request(app).get('/api/settings/customers/not-an-id').set('Authorization', ADMIN)).status, 400);

  const r = await request(app).post(`/api/settings/customers/${ID}/cash`).set('Authorization', ADMIN)
    .send({ principal: -5, schedule: 'Hourly', installment: 0, startDate: '2025-02-30' });
  assert.equal(r.status, 400);
  assert.ok(Array.isArray(r.body.errors) && r.body.errors.length >= 3);

  const pay = await request(app).post(`/api/settings/cash/${ID}/payments`).set('Authorization', ADMIN)
    .send({ amount: 10.123, method: 'Cheque', date: '2025-10-01' });
  assert.equal(pay.status, 400);

  const cust = await request(app).post('/api/settings/customers').set('Authorization', ADMIN).send({ name: 'A', phone: '123' });
  assert.equal(cust.status, 400);

  const bulk = await request(app).post('/api/settings/customers/bulk').set('Authorization', ADMIN).send({ action: 'delete', ids: [] });
  assert.equal(bulk.status, 400);
});

test('unknown routes and bad JSON give JSON errors', async () => {
  assert.equal((await request(app).get('/api/nope')).status, 404);
  const r = await request(app).post('/api/user/login').set('Content-Type', 'application/json').send('{bad');
  assert.equal(r.status, 400);
});

test('secret key format: VK + DDMMYYYY(IST) + order number', () => {
  assert.equal(makeSecretKey(3, new Date('2026-10-12T10:00:00+05:30')), 'VK1210202603');
  assert.equal(makeSecretKey(7, new Date('2026-10-11T23:30:00Z')), 'VK1210202607'); // already the 12th in IST
  assert.equal(makeSecretKey(123, new Date('2026-01-05T12:00:00+05:30')), 'VK05012026123');
});

test('Mongoose schemas accept good data and reject bad data', () => {
  const user = new User({ name: 'Susan Mathew', phone: '9876500002', secretKey: 'vk0212202602' });
  assert.equal(user.validateSync(), undefined);
  assert.equal(user.secretKey, 'VK0212202602');                 // upper-cased
  assert.ok(new User({ name: 'S', secretKey: 'X' }).validateSync());

  assert.ok(new Message({ user: ID, from: 'x', text: 'hi' }).validateSync());
  assert.ok(new Message({ user: ID, from: 'u', text: 'a'.repeat(501) }).validateSync());
  assert.equal(new Message({ user: ID, from: 'u', text: 'hello' }).validateSync(), undefined);
  assert.equal(new Event({ title: 'Meet', start: new Date(), exp: new Date() }).validateSync(), undefined);

  const s = new Settings({});
  assert.equal(s.defaultInterestPct, 10);
  assert.equal(s.terms.length, 8);
  assert.equal(s.customerSeq, undefined);
});

test('a Mongoose Cash document flows through loanMath + serializer correctly', () => {
  const doc = new Cash({
    user: ID, principal: M.toPaise(24000), interest: M.toPaise(2400), schedule: 'Weekly', installment: M.toPaise(2000),
    startDate: M.parseDateOnly('2025-10-11'), endDate: M.parseDateOnly('2026-01-31'),
  });
  doc.payments.push({ amount: M.toPaise(2000), at: M.istInstant('2025-10-18', '17:20'), method: 'UPI', note: 'first' });
  doc.payments.push({ amount: M.toPaise(2000), at: M.istInstant('2025-10-25', '09:05'), method: 'Cash' });
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.closed, undefined);                          // nothing wasted on an empty "closed"

  const out = serializeLoan(doc, M.istInstant('2025-10-30'));
  assert.equal(out.principal, 24000);
  assert.equal(out.grand, 26400);
  assert.equal(out.rebate, 1200);
  assert.equal(out.paid, 4000);
  assert.equal(out.balance, 21200);                              // 25 200 − 4 000
  assert.equal(out.status, 'active');
  assert.equal(out.interestPct, 10);
  assert.equal(out.payments.length, 2);
  assert.deepEqual(out.payments[0].date, '2025-10-18');
  assert.deepEqual(out.payments[0].time, '17:20');
  assert.equal(out.payments[1].balanceAfter, 21200);
  assert.equal(typeof out.payments[0].id, 'string');

  // overpay is caught through the same path the route uses (doc.toObject())
  doc.payments.push({ amount: M.toPaise(99999), at: M.istInstant('2025-10-29'), method: 'Cash' });
  assert.equal(M.evaluate(doc.toObject(), M.istInstant('2025-10-30')).invalid.type, 'overpay');
});

test('payment array is capped at 400 entries', () => {
  const doc = new Cash({ user: ID, principal: 10000, interest: 0, schedule: 'Daily', installment: 100, startDate: new Date(), endDate: new Date() });
  for (let i = 0; i < 401; i += 1) doc.payments.push({ amount: 1, at: new Date(), method: 'Cash' });
  assert.ok(doc.validateSync());
});