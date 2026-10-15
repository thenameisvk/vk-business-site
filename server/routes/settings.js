'use strict';
/* =====================================================================
   /api/settings — the admin "Settings" page:
   customers, their cash entries, payments, chat and business settings.
   Every route here is ADMIN-ONLY.
   ===================================================================== */
const express = require('express');
const env = require('../config/env');
const User = require('../models/User');
const Cash = require('../models/Cash');
const Settings = require('../models/Settings');
const Message = require('../models/Message');
const M = require('../loanMath');
const cache = require('../utils/cache');
const validate = require('../middleware/validate');
const { requireAdmin } = require('../middleware/auth');
const { AppError, asyncHandler, escapeRegex } = require('../utils/http');
const { makeSecretKey } = require('../utils/secretkey');
const { serializeLoan, serializeCustomer } = require('../utils/serialize');
const V = require('../utils/validators');

const router = express.Router();
router.use(requireAdmin);

/* any successful write invalidates the dashboard cache */
router.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) cache.clear(); });
  next();
});

const MAX_CASH_PER_CUSTOMER = 50;
const fmt = (paise) => `₹${M.toRupees(paise).toLocaleString('en-IN')}`;

/* =====================================================================
   CUSTOMERS
   ===================================================================== */
const SORTS = {
  newest: { joined: -1, _id: -1 },
  oldest: { joined: 1, _id: 1 },
  'name-asc': { name: 1, _id: 1 },
  'name-desc': { name: -1, _id: 1 },
  'cash-high': { cashCount: -1, _id: 1 },
  'cash-low': { cashCount: 1, _id: 1 },
};

function customerFilter(q) {
  const f = {};
  if (q.status !== 'all') f.status = q.status;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    f.$or = [{ name: rx }, { secretKey: rx }, { phone: rx }];
  }
  if (q.from || q.to) {
    f.joined = {};
    if (q.from) f.joined.$gte = M.istInstant(q.from);                                   // 00:00 IST
    if (q.to) f.joined.$lte = new Date(M.istInstant(q.to, '23:59').getTime() + 59999);  // 23:59:59.999 IST
  }
  if (q.minCash !== undefined || q.maxCash !== undefined) {
    f.cashCount = {};
    if (q.minCash !== undefined) f.cashCount.$gte = q.minCash;
    if (q.maxCash !== undefined) f.cashCount.$lte = q.maxCash;
  }
  return f;
}

/** children first, then the customer — a half-finished delete can simply be retried */
async function removeCustomers(ids) {
  await Cash.deleteMany({ user: { $in: ids } });
  await Message.deleteMany({ user: { $in: ids } });
  const { deletedCount } = await User.deleteMany({ _id: { $in: ids } });
  return deletedCount;
}

/* GET /customers — server-side search, filters, sort, pagination */
router.get('/customers', validate({ query: V.customerList }), asyncHandler(async (req, res) => {
  const q = req.valid.query;
  const filter = customerFilter(q);
  const [items, total, groups] = await Promise.all([
    User.find(filter).sort(SORTS[q.sort]).collation({ locale: 'en', strength: 2 })
      .skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    User.countDocuments(filter),
    User.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const counts = { all: 0, active: 0, pending: 0, blocked: 0 };
  groups.forEach((g) => { counts[g._id] = g.n; counts.all += g.n; });
  res.json({
    items: items.map(serializeCustomer),
    total,
    page: q.page,
    pages: Math.max(1, Math.ceil(total / q.limit)),
    counts,
  });
}));

/* GET /customers/export — same filters, no paging (max 5 000 rows) */
router.get('/customers/export', validate({ query: V.customerList }), asyncHandler(async (req, res) => {
  const q = req.valid.query;
  const items = await User.find(customerFilter(q)).sort(SORTS[q.sort]).collation({ locale: 'en', strength: 2 }).limit(5000).lean();
  res.json({ items: items.map(serializeCustomer) });
}));

/* POST /customers/bulk */
router.post('/customers/bulk', validate({ body: V.bulkBody }), asyncHandler(async (req, res) => {
  const { action, ids } = req.valid.body;
  if (action === 'delete') return res.json({ affected: await removeCustomers(ids) });
  const r = await User.updateMany({ _id: { $in: ids } }, { $set: { status: 'blocked' } });
  return res.json({ affected: r.modifiedCount });
}));

/* POST /customers */
router.post('/customers', validate({ body: V.customerCreate }), asyncHandler(async (req, res) => {
  const b = req.valid.body;
  const seq = await Settings.nextCustomerSeq();
  const user = await User.create({
    name: b.name, status: b.status, secretKey: makeSecretKey(seq), ...(b.phone ? { phone: b.phone } : {}),
  });
  res.status(201).json(serializeCustomer(user));
}));

/* GET /customers/:id — the customer + all cash entries (calculated) */
router.get('/customers/:id', validate({ params: V.idParam }), asyncHandler(async (req, res) => {
  const user = await User.findById(req.valid.params.id).lean();
  if (!user) throw new AppError(404, 'Customer not found.');
  const docs = await Cash.find({ user: user._id }).sort({ _id: 1 }).lean();
  const now = new Date();
  res.json({ customer: serializeCustomer(user), loans: docs.map((d) => serializeLoan(d, now)) });
}));

/* PATCH /customers/:id */
router.patch('/customers/:id', validate({ params: V.idParam, body: V.customerPatch }), asyncHandler(async (req, res) => {
  const b = req.valid.body;
  const $set = {};
  const $unset = {};
  if (b.name) $set.name = b.name;
  if (b.status) $set.status = b.status;
  if (b.phone !== undefined) { if (b.phone === '') $unset.phone = 1; else $set.phone = b.phone; }
  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  const user = await User.findByIdAndUpdate(req.valid.params.id, update, { new: true, runValidators: true }).lean();
  if (!user) throw new AppError(404, 'Customer not found.');
  res.json(serializeCustomer(user));
}));

/* DELETE /customers/:id (cascades) */
router.delete('/customers/:id', validate({ params: V.idParam }), asyncHandler(async (req, res) => {
  const n = await removeCustomers([req.valid.params.id]);
  if (!n) throw new AppError(404, 'Customer not found.');
  res.json({ ok: true });
}));

/* =====================================================================
   CASH ENTRIES
   ===================================================================== */
function assertPlan(draft) {
  const n = M.plannedInstalments(draft, env.REBATE_RATIO);
  if (n > M.MAX_INSTALMENTS) {
    throw new AppError(422, `That instalment is too small: it would need ${n} instalments (maximum ${M.MAX_INSTALMENTS}).`);
  }
}

function assertPaymentsValid(doc) {
  const ev = M.evaluate(doc.toObject(), new Date(), env.MATH);
  if (!ev.invalid) return;
  if (ev.invalid.type === 'after-close') {
    throw new AppError(422, 'This cash entry is already fully paid, so no further payments can be recorded.');
  }
  const max = ev.invalid.maxAmount;
  throw new AppError(422, max > 0
    ? `That is more than the amount due. The most you can record for that date is ${fmt(max)}.`
    : 'Nothing is due on that date, so this payment would be an overpayment.');
}

async function loadCash(id) {
  const doc = await Cash.findById(id);
  if (!doc) throw new AppError(404, 'Cash entry not found.');
  return doc;
}
const loanResponse = (doc) => serializeLoan(doc, new Date());

/* POST /customers/:id/cash */
router.post('/customers/:id/cash', validate({ params: V.idParam, body: V.cashCreate }), asyncHandler(async (req, res) => {
  const b = req.valid.body;
  const user = await User.findById(req.valid.params.id).select('status cashCount').lean();
  if (!user) throw new AppError(404, 'Customer not found.');
  if (user.status === 'blocked') throw new AppError(403, 'This customer is blocked and cannot take new cash.');
  if ((user.cashCount || 0) >= MAX_CASH_PER_CUSTOMER) throw new AppError(422, `A customer can have at most ${MAX_CASH_PER_CUSTOMER} cash entries.`);

  const settings = await Settings.main();
  const principal = M.toPaise(b.principal);
  const interest = b.interest === undefined
    ? Math.round((principal * settings.defaultInterestPct) / 100)      // default % from Business settings
    : M.toPaise(b.interest);
  const startDate = M.parseDateOnly(b.startDate);
  const endDate = b.endDate ? M.parseDateOnly(b.endDate) : M.dayToDate(M.defaultEndDay(M.storedDay(startDate), b.schedule));
  const draft = { user: user._id, principal, interest, schedule: b.schedule, installment: M.toPaise(b.installment), startDate, endDate, payments: [] };
  assertPlan(draft);

  const doc = await Cash.create(draft);
  await User.updateOne({ _id: user._id }, { $inc: { cashCount: 1 } });
  res.status(201).json(loanResponse(doc));
}));

/* PATCH /cash/:cashId */
router.patch('/cash/:cashId', validate({ params: V.cashParam, body: V.cashPatch }), asyncHandler(async (req, res) => {
  const b = req.valid.body;
  const doc = await loadCash(req.valid.params.cashId);
  if (b.principal !== undefined) doc.principal = M.toPaise(b.principal);
  if (b.interest !== undefined) doc.interest = M.toPaise(b.interest);
  if (b.schedule !== undefined) doc.schedule = b.schedule;
  if (b.installment !== undefined) doc.installment = M.toPaise(b.installment);
  if (b.startDate !== undefined) doc.startDate = M.parseDateOnly(b.startDate);
  if (b.endDate !== undefined) doc.endDate = M.parseDateOnly(b.endDate);
  if (doc.endDate < doc.startDate) throw new AppError(400, 'End date must be on or after the start date.');
  assertPlan(doc);
  assertPaymentsValid(doc);
  await doc.save();
  res.json(loanResponse(doc));
}));

/* DELETE /cash/:cashId */
router.delete('/cash/:cashId', validate({ params: V.cashParam }), asyncHandler(async (req, res) => {
  const doc = await loadCash(req.valid.params.cashId);
  await doc.deleteOne();
  await User.updateOne({ _id: doc.user, cashCount: { $gt: 0 } }, { $inc: { cashCount: -1 } });
  res.json({ ok: true });
}));

/* POST /cash/:cashId/complete — close now (optionally writing off what is left) */
router.post('/cash/:cashId/complete', validate({ params: V.cashParam, body: V.completeBody }), asyncHandler(async (req, res) => {
  const doc = await loadCash(req.valid.params.cashId);
  const now = new Date();
  const ev = M.evaluate(doc.toObject(), now, env.MATH);
  if (ev.closedAt) throw new AppError(409, 'This cash entry is already completed.');
  if (ev.balance > 0 && !req.valid.body.writeOff) {
    throw new AppError(409, `${fmt(ev.balance)} is still due. Confirm to close it and write the balance off.`, { balance: M.toRupees(ev.balance), needsWriteOff: true });
  }
  doc.closed = { at: now, writtenOff: ev.balance };
  await doc.save();
  res.json(loanResponse(doc));
}));

/* POST /cash/:cashId/reopen — only for manually closed entries */
router.post('/cash/:cashId/reopen', validate({ params: V.cashParam }), asyncHandler(async (req, res) => {
  const doc = await loadCash(req.valid.params.cashId);
  const ev = M.evaluate(doc.toObject(), new Date(), env.MATH);
  if (ev.settled) throw new AppError(409, 'This entry was closed by full payment. Delete the last payment to reopen it.');
  if (!doc.closed) throw new AppError(409, 'This cash entry is not closed.');
  doc.closed = undefined;
  await doc.save();
  res.json(loanResponse(doc));
}));

/* =====================================================================
   PAYMENTS
   ===================================================================== */
function paymentInstant(doc, b) {
  const at = M.istInstant(b.date, b.time || '00:00');
  if (at.getTime() > Date.now() + 10 * 60 * 1000) throw new AppError(422, 'A payment cannot be dated in the future.');
  if (M.istDay(at) < M.storedDay(doc.startDate)) throw new AppError(422, 'A payment cannot be dated before the cash entry started.');
  return at;
}

router.post('/cash/:cashId/payments', validate({ params: V.cashParam, body: V.paymentCreate }), asyncHandler(async (req, res) => {
  const b = req.valid.body;
  const doc = await loadCash(req.valid.params.cashId);
  if (doc.closed && doc.closed.at) throw new AppError(409, 'This cash entry is closed. Reopen it to record a payment.');
  doc.payments.push({ amount: M.toPaise(b.amount), at: paymentInstant(doc, b), method: b.method, ...(b.note ? { note: b.note } : {}) });
  assertPaymentsValid(doc);
  await doc.save();
  res.status(201).json(loanResponse(doc));
}));

router.patch('/cash/:cashId/payments/:pid', validate({ params: V.paymentParam, body: V.paymentPatch }), asyncHandler(async (req, res) => {
  const b = req.valid.body;
  const doc = await loadCash(req.valid.params.cashId);
  const p = doc.payments.id(req.valid.params.pid);
  if (!p) throw new AppError(404, 'Payment not found.');
  if (b.amount !== undefined) p.amount = M.toPaise(b.amount);
  if (b.method !== undefined) p.method = b.method;
  if (b.note !== undefined) p.note = b.note || undefined;   // '' clears the note (and saves space)
  if (b.date !== undefined || b.time !== undefined) {
    const cur = M.istParts(p.at);
    p.at = paymentInstant(doc, { date: b.date ?? cur.date, time: b.time ?? cur.time });
  }
  assertPaymentsValid(doc);
  await doc.save();
  res.json(loanResponse(doc));
}));

router.delete('/cash/:cashId/payments/:pid', validate({ params: V.paymentParam }), asyncHandler(async (req, res) => {
  const doc = await loadCash(req.valid.params.cashId);
  const p = doc.payments.id(req.valid.params.pid);
  if (!p) throw new AppError(404, 'Payment not found.');
  p.deleteOne();
  assertPaymentsValid(doc);
  await doc.save();
  res.json(loanResponse(doc));
}));

/* =====================================================================
   CHAT (admin side)
   ===================================================================== */
const mapMessage = (m) => ({ id: String(m._id), from: m.from === 'a' ? 'admin' : 'customer', text: m.text, at: m.at.toISOString() });

router.get('/customers/:id/messages', validate({ params: V.idParam }), asyncHandler(async (req, res) => {
  const id = req.valid.params.id;
  const [items, unread] = await Promise.all([
    Message.find({ user: id }).sort({ at: 1 }).limit(200).select('from text at').lean(),
    Message.countDocuments({ user: id, from: 'u', read: false }),
  ]);
  res.json({ items: items.map(mapMessage), unread });
}));

router.post('/customers/:id/messages', validate({ params: V.idParam, body: V.messageBody }), asyncHandler(async (req, res) => {
  const exists = await User.exists({ _id: req.valid.params.id });
  if (!exists) throw new AppError(404, 'Customer not found.');
  const m = await Message.create({ user: req.valid.params.id, from: 'a', text: req.valid.body.text });
  res.status(201).json(mapMessage(m));
}));

router.post('/customers/:id/messages/read', validate({ params: V.idParam }), asyncHandler(async (req, res) => {
  await Message.updateMany({ user: req.valid.params.id, from: 'u', read: false }, { $set: { read: true } });
  res.json({ ok: true });
}));

/* =====================================================================
   BUSINESS SETTINGS (single document)
   ===================================================================== */
const publicConfig = (s) => ({
  upiId: s.upiId, payeeName: s.payeeName, supportPhone: s.supportPhone,
  defaultInterestPct: s.defaultInterestPct, terms: s.terms,
});

router.get('/config', asyncHandler(async (req, res) => {
  res.json(publicConfig(await Settings.main()));
}));

router.put('/config', validate({ body: V.configBody }), asyncHandler(async (req, res) => {
  await Settings.main(); // make sure it exists
  const s = await Settings.findOneAndUpdate({ _id: 'main' }, { $set: req.valid.body }, { new: true, runValidators: true }).lean();
  res.json(publicConfig(s));
}));

module.exports = router;