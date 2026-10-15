'use strict';
const mongoose = require('mongoose');

const METHODS = ['Cash', 'Online', 'UPI', 'Bank Transfer'];
const SCHEDULES = ['Daily', 'Weekly', 'Monthly'];

/* Payments live INSIDE the cash entry: one read gives the whole account and
   there is no second collection or extra index to pay for.
   Money is stored as integer paise. Balance / progress / status are never
   stored — see utils/loanMath.js. */
const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    at: { type: Date, required: true },
    method: { type: String, enum: METHODS, required: true },
    note: { type: String, trim: true, maxlength: 160 },
  },
  {}                                             // keeps its own _id (needed to edit / delete one payment)
);

const cashSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    principal: { type: Number, required: true, min: 100 },
    interest: { type: Number, required: true, min: 0 },
    schedule: { type: String, enum: SCHEDULES, required: true },
    installment: { type: Number, required: true, min: 100 },
    startDate: { type: Date, required: true },   // date-only (UTC midnight)
    endDate: { type: Date, required: true },
    closed: { type: new mongoose.Schema({ at: Date, writtenOff: Number }, { _id: false }), default: undefined },
    payments: {
      type: [paymentSchema],
      default: [],
      validate: [(v) => v.length <= 400, 'A cash entry can hold at most 400 payments.'],
    },
  },
  { collection: 'cash', versionKey: false }
);

module.exports = mongoose.model('Cash', cashSchema);
module.exports.METHODS = METHODS;
module.exports.SCHEDULES = SCHEDULES;