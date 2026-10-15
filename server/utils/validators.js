'use strict';
const { z } = require('zod');
const { SCHEDULES, METHODS } = require('../models/Cash');
const { OBJECT_ID } = require('./http');

const emptyToUndef = (v) => (v === '' || v === null ? undefined : v);

const objectId = z.string().regex(OBJECT_ID, 'Invalid id');
const rupee = (min) =>
  z.number({ invalid_type_error: 'Enter a valid amount', required_error: 'Amount is required' })
    .finite().min(min, `Minimum is ₹${min}`).max(10000000, 'Amount is too large')
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Use at most 2 decimal places');

const isoDate = z.string({ required_error: 'Date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, 'That is not a real date');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:mm');

const nameField = z.string({ required_error: 'Name is required' }).trim()
  .min(2, 'Enter the full name (at least 2 characters)').max(80, 'Name is too long');
const phoneStr = z.string().trim().regex(/^\d{10}$/, 'Phone number must be 10 digits');
const statusEnum = z.enum(['active', 'pending', 'blocked']);

const intQuery = (min, max, def) => {
  const base = z.coerce.number().int().min(min).max(max);
  return def === undefined ? z.preprocess(emptyToUndef, base.optional()) : z.preprocess(emptyToUndef, base.default(def));
};

/* ---------------- params ---------------- */
const idParam = z.object({ id: objectId });
const cashParam = z.object({ cashId: objectId });
const paymentParam = z.object({ cashId: objectId, pid: objectId });
const userIdParam = z.object({ userId: objectId });

/* ---------------- auth ---------------- */
const loginBody = z.object({
  secretKey: z.string({ required_error: 'Secret key is required' }).trim().min(4, 'Secret key is too short').max(40, 'Secret key is too long'),
});

/* ---------------- customers ---------------- */
const customerCreate = z.object({
  name: nameField,
  phone: z.preprocess(emptyToUndef, phoneStr.optional()),
  status: statusEnum.default('active'),
});
const customerPatch = z.object({
  name: nameField.optional(),
  phone: z.union([z.literal(''), phoneStr]).optional(),
  status: statusEnum.optional(),
}).refine((o) => Object.keys(o).length > 0, 'Nothing to update');

const customerList = z.object({
  page: intQuery(1, 100000, 1),
  limit: intQuery(1, 50, 5),
  search: z.preprocess(emptyToUndef, z.string().trim().max(60).optional()),
  status: z.enum(['all', 'active', 'pending', 'blocked']).default('all'),
  sort: z.enum(['newest', 'oldest', 'name-asc', 'name-desc', 'cash-high', 'cash-low']).default('newest'),
  from: z.preprocess(emptyToUndef, isoDate.optional()),
  to: z.preprocess(emptyToUndef, isoDate.optional()),
  minCash: intQuery(0, 1000),
  maxCash: intQuery(0, 1000),
});

const bulkBody = z.object({
  action: z.enum(['delete', 'block']),
  ids: z.array(objectId).min(1, 'Select at least one customer').max(100, 'Select at most 100 customers at a time'),
});

/* ---------------- cash entries + payments ---------------- */
const cashFields = z.object({
  principal: rupee(1),
  interest: z.number().finite().min(0).max(10000000).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Use at most 2 decimal places'),
  schedule: z.enum(SCHEDULES),
  installment: rupee(1),
  startDate: isoDate,
  endDate: isoDate,
});
const cashCreate = cashFields.partial({ interest: true, endDate: true }).refine(
  (o) => !o.endDate || o.endDate >= o.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] }
);
const cashPatch = cashFields.partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');
const completeBody = z.object({ writeOff: z.boolean().default(false) });

const paymentFields = z.object({
  amount: rupee(0.01),
  method: z.enum(METHODS),
  date: isoDate,
  time: z.preprocess(emptyToUndef, hhmm.optional()),
  note: z.preprocess(emptyToUndef, z.string().trim().max(160, 'Note is too long (160 characters max)').optional()),
});
const paymentCreate = paymentFields;
// on edit an empty note means "clear it", so it must not be turned into "undefined"
const paymentPatch = paymentFields.partial()
  .extend({ note: z.string().trim().max(160, 'Note is too long (160 characters max)').optional() })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

/* ---------------- config, messages ---------------- */
const configBody = z.object({
  upiId: z.string().trim().regex(/^[\w.\-]{2,64}@[A-Za-z][\w.\-]{1,30}$/, 'Enter a valid UPI ID, e.g. name@bank').optional(),
  payeeName: z.string().trim().min(1).max(60).optional(),
  supportPhone: z.string().trim().regex(/^\+?\d{10,13}$/, 'Enter a valid phone number').optional(),
  defaultInterestPct: z.number().finite().min(0).max(100).optional(),
  terms: z.array(z.string().trim().min(1).max(300)).min(1).max(12).optional(),
}).refine((o) => Object.keys(o).length > 0, 'Nothing to update');

const messageBody = z.object({ text: z.string({ required_error: 'Type a message' }).trim().min(1, 'Type a message').max(500, 'Message is too long (500 characters max)') });

/* ---------------- dashboard ---------------- */
const chartQuery = z.object({ range: z.enum(['month', 'quarter', 'year']).default('month') });
const recentQuery = z.object({ limit: intQuery(1, 20, 5) });
const isoInstant = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');
const eventsQuery = z.object({ from: isoInstant, to: isoInstant });
const eventFields = z.object({
  title: z.string({ required_error: 'Enter a title for the event' }).trim().min(1, 'Enter a title for the event').max(80, 'Title is too long'),
  date: isoDate,
  time: z.union([hhmm, z.literal(''), z.null()]).optional(),     // '' / null = all-day
  kind: z.enum(['meeting', 'review', 'reminder']).default('meeting'),
});
const eventCreate = eventFields;
const eventPatch = eventFields.partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');

module.exports = {
  idParam, cashParam, paymentParam, userIdParam,
  loginBody, customerCreate, customerPatch, customerList, bulkBody,
  cashCreate, cashPatch, completeBody, paymentCreate, paymentPatch,
  configBody, messageBody, chartQuery, recentQuery, eventsQuery, eventCreate, eventPatch,
};