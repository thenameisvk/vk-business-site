'use strict';
const mongoose = require('mongoose');

/* ONE tiny document ("main") holding business settings + the customer
   counter. Replaces a separate counters collection and keeps UPI details /
   terms out of the frontend code. */
const DEFAULT_TERMS = [
  'Daily payments finish within 110 days.',
  'Weekly payments finish within 15 weeks and 5 days.',
  'Monthly payments finish within 3 months.',
  'Yearly payments currently not available.',
  'The interest will increase if you can’t complete payments before the end date.',
  'You don’t need to pay on Sundays and special/festival holidays.',
  'Payments having no pendings: your 10% interest reduces to 5% interest.',
  'Delay of information (calls, text messages) will affect account access.',
];

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'main' },
    upiId: { type: String, default: '8590898253@naviaxis', trim: true, maxlength: 80 },
    payeeName: { type: String, default: 'VK', trim: true, maxlength: 60 },
    supportPhone: { type: String, default: '8590898253', trim: true, maxlength: 15 },
    defaultInterestPct: { type: Number, default: 10, min: 0, max: 100 },
    terms: { type: [String], default: () => [...DEFAULT_TERMS] },
    customerSeq: { type: Number }, // no default on purpose: created by the first $inc
  },
  { collection: 'settings', versionKey: false }
);

/** the settings document, created on first use */
settingsSchema.statics.main = function main() {
  return this.findOneAndUpdate(
    { _id: 'main' },
    { $setOnInsert: { terms: DEFAULT_TERMS } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
};

/** atomic, never repeats — even after customers are deleted */
settingsSchema.statics.nextCustomerSeq = async function nextCustomerSeq() {
  const doc = await this.findOneAndUpdate(
    { _id: 'main' },
    { $inc: { customerSeq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return doc.customerSeq;
};

module.exports = mongoose.model('Settings', settingsSchema);