'use strict';
/* =====================================================================
   /api/dashboard — admin overview, charts, calendar, messages.
   Every route is ADMIN-ONLY. Heavy numbers are cached for 20 s and the
   cache is cleared automatically after any admin write.
   ===================================================================== */
const express = require('express');
const env = require('../config/env');
const User = require('../models/User');
const Cash = require('../models/Cash');
const Message = require('../models/Message');
const Event = require('../models/Event');
const M = require('../loanMath');
const cache = require('../utils/cache');
const validate = require('../middleware/validate');
const { requireAdmin } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../utils/http');
const { serializeCustomer } = require('../utils/serialize');
const V = require('../utils/validators');

const router = express.Router();
router.use(requireAdmin);

const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) * 1000) / prev) / 10 : null); // 1 decimal; null = no baseline
const istMonth = (now) => { const [y, mo] = M.istParts(now).date.split('-').map(Number); return { y, m: mo - 1 }; };
const monthStartInstant = (y, m) => new Date(Date.UTC(y, m, 1) - M.IST); // 00:00 IST on the 1st (month may be −1 → Dec of last year)

/* =====================================================================
   GET /overview — stat cards + account-status mix
   • Total users     = customers; trend = new this month vs new last month
   • Total revenue   = all money collected; trend = collected this month vs last
   • Total balance   = outstanding receivable (incl. late interest, net of rebate);
                       trend = outstanding now vs outstanding at the start of
                       THIS month (each loan re-evaluated as of that instant)
   ===================================================================== */
router.get('/overview', asyncHandler(async (req, res) => {
  const data = await cache.remember('overview', async () => {
    const now = new Date();
    const { y, m } = istMonth(now);
    const thisStart = monthStartInstant(y, m);
    const prevStart = monthStartInstant(y, m - 1);

    const [loans, userCount, newThis, newPrev] = await Promise.all([
      Cash.find({}).select('principal interest schedule installment startDate endDate closed payments.amount payments.at').lean(),
      User.countDocuments(),
      User.countDocuments({ joined: { $gte: thisStart } }),
      User.countDocuments({ joined: { $gte: prevStart, $lt: thisStart } }),
    ]);

    let collected = 0, collectedThis = 0, collectedPrev = 0;
    let outstanding = 0, outstandingAtMonthStart = 0;
    const mix = { completed: 0, active: 0, dueSoon: 0, overdue: 0 };

    loans.forEach((loan) => {
      const ev = M.evaluate(loan, now, env.MATH);
      outstanding += ev.balance;
      if (ev.status === 'completed') mix.completed += 1;
      else if (ev.status === 'overdue') mix.overdue += 1;
      else if (ev.status === 'due-soon') mix.dueSoon += 1;
      else mix.active += 1;

      const before = M.evaluate(loan, thisStart, env.MATH);
      if (before.started) outstandingAtMonthStart += before.balance;

      loan.payments.forEach((p) => {
        collected += p.amount;
        if (p.at >= thisStart && p.at <= now) collectedThis += p.amount;
        else if (p.at >= prevStart && p.at < thisStart) collectedPrev += p.amount;
      });
    });

    return {
      users: { value: userCount, trend: pct(newThis, newPrev), note: `${newThis} new this month` },
      revenue: { value: M.toRupees(collected), trend: pct(collectedThis, collectedPrev), note: 'collected, all time' },
      balance: { value: M.toRupees(outstanding), trend: pct(outstanding, outstandingAtMonthStart), note: 'outstanding to collect' },
      statusMix: mix,
    };
  });
  res.json(data);
}));

/* =====================================================================
   GET /chart?range=month|quarter|year — cash given vs money collected
   Buckets use IST calendar days; sums are integer paise → rupees at the end.
   ===================================================================== */
function chartSpec(range, now) {
  const { y, m } = istMonth(now);
  const monthName = (k) => new Date(Date.UTC(y, k, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  if (range === 'month') {
    return { s: Date.UTC(y, m, 1), e: Date.UTC(y, m + 1, 1), labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], bucket: (d) => Math.min(3, Math.floor((d.getUTCDate() - 1) / 7)) };
  }
  if (range === 'quarter') {
    const s = Date.UTC(y, m - 2, 1);
    const sd = new Date(s);
    return {
      s, e: Date.UTC(y, m + 1, 1),
      labels: [m - 2, m - 1, m].map(monthName),
      bucket: (d) => (d.getUTCFullYear() - sd.getUTCFullYear()) * 12 + d.getUTCMonth() - sd.getUTCMonth(),
    };
  }
  return { s: Date.UTC(y, 0, 1), e: Date.UTC(y + 1, 0, 1), labels: Array.from({ length: 12 }, (_, k) => monthName(k)), bucket: (d) => d.getUTCMonth() };
}

router.get('/chart', validate({ query: V.chartQuery }), asyncHandler(async (req, res) => {
  const { range } = req.valid.query;
  const out = await cache.remember(`chart:${range}`, async () => {
    const now = new Date();
    const { s, e, labels, bucket } = chartSpec(range, now);
    const loans = await Cash.find({
      $or: [
        { startDate: { $gte: new Date(s), $lt: new Date(e) } },
        { 'payments.at': { $gte: new Date(s - M.IST), $lt: new Date(e - M.IST) } },
      ],
    }).select('principal startDate payments.amount payments.at').lean();

    const given = new Array(labels.length).fill(0);
    const collected = new Array(labels.length).fill(0);
    loans.forEach((l) => {
      const sd = l.startDate.getTime();
      if (sd >= s && sd < e) given[bucket(l.startDate)] += l.principal;        // date-only value: UTC fields ARE the IST date
      l.payments.forEach((p) => {
        const shifted = new Date(p.at.getTime() + M.IST);                       // UTC fields now read as IST wall time
        const t = shifted.getTime();
        if (t >= s && t < e) collected[bucket(shifted)] += p.amount;
      });
    });
    return { range, labels, given: given.map(M.toRupees), collected: collected.map(M.toRupees) };
  });
  res.json(out);
}));

/* GET /recent-users */
router.get('/recent-users', validate({ query: V.recentQuery }), asyncHandler(async (req, res) => {
  const users = await User.find().sort({ joined: -1, _id: -1 }).limit(req.valid.query.limit).lean();
  res.json({ items: users.map(serializeCustomer) });
}));

/* =====================================================================
   CALENDAR EVENTS
   ===================================================================== */
function serializeEvent(e) {
  const p = M.istParts(e.start);
  return {
    id: String(e._id),
    title: e.title,
    kind: e.kind,
    allDay: e.allDay,
    start: e.allDay ? e.start.toISOString().slice(0, 10) : `${p.date}T${p.time}:00+05:30`,
  };
}
const eventStart = (date, time) => (time ? M.istInstant(date, time) : M.parseDateOnly(date));
const eventExpiry = (start) => new Date(start.getTime() + 90 * M.DAY); // auto-delete 90 days after it happened

router.get('/events', validate({ query: V.eventsQuery }), asyncHandler(async (req, res) => {
  const { from, to } = req.valid.query;
  const items = await Event.find({ start: { $gte: new Date(from), $lt: new Date(to) } }).sort({ start: 1 }).limit(1000).lean();
  res.json(items.map(serializeEvent));
}));

router.post('/events', validate({ body: V.eventCreate }), asyncHandler(async (req, res) => {
  const b = req.valid.body;
  const start = eventStart(b.date, b.time);
  const doc = await Event.create({ title: b.title, kind: b.kind, start, allDay: !b.time, exp: eventExpiry(start) });
  res.status(201).json(serializeEvent(doc));
}));

router.patch('/events/:id', validate({ params: V.idParam, body: V.eventPatch }), asyncHandler(async (req, res) => {
  const b = req.valid.body;
  const doc = await Event.findById(req.valid.params.id);
  if (!doc) throw new AppError(404, 'Event not found.');
  const cur = M.istParts(doc.start);
  const date = b.date ?? (doc.allDay ? doc.start.toISOString().slice(0, 10) : cur.date);
  const time = b.time === undefined ? (doc.allDay ? null : cur.time) : (b.time || null); // null/'' → all-day
  doc.start = eventStart(date, time);
  doc.allDay = !time;
  doc.exp = eventExpiry(doc.start);
  if (b.title !== undefined) doc.title = b.title;
  if (b.kind !== undefined) doc.kind = b.kind;
  await doc.save();
  res.json(serializeEvent(doc));
}));

router.delete('/events/:id', validate({ params: V.idParam }), asyncHandler(async (req, res) => {
  const r = await Event.deleteOne({ _id: req.valid.params.id });
  if (!r.deletedCount) throw new AppError(404, 'Event not found.');
  res.json({ ok: true });
}));

/* =====================================================================
   MESSAGES — latest message per customer + unread counts
   ===================================================================== */
router.get('/messages', asyncHandler(async (req, res) => {
  const [rows, unread] = await Promise.all([
    Message.aggregate([
      { $match: { from: 'u' } },
      { $sort: { at: -1 } },
      { $group: { _id: '$user', text: { $first: '$text' }, at: { $first: '$at' }, unread: { $sum: { $cond: ['$read', 0, 1] } } } },
      { $sort: { at: -1 } },
      { $limit: 8 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', pipeline: [{ $project: { name: 1 } }], as: 'u' } },
      { $unwind: '$u' },
    ]),
    Message.countDocuments({ from: 'u', read: false }),
  ]);
  res.json({
    unread,
    items: rows.map((r) => ({ userId: String(r._id), name: r.u.name, text: r.text, at: r.at.toISOString(), unread: r.unread })),
  });
}));

router.post('/messages/read-all', asyncHandler(async (req, res) => {
  await Message.updateMany({ from: 'u', read: false }, { $set: { read: true } });
  res.json({ ok: true });
}));

router.post('/messages/:userId/read', validate({ params: V.userIdParam }), asyncHandler(async (req, res) => {
  await Message.updateMany({ user: req.valid.params.userId, from: 'u', read: false }, { $set: { read: true } });
  res.json({ ok: true });
}));

module.exports = router;