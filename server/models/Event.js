'use strict';
const mongoose = require('mongoose');

/* Admin calendar events. `exp` lets MongoDB delete an event 90 days after it
   happened, so old reminders never pile up. */
const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    start: { type: Date, required: true },
    allDay: { type: Boolean, default: true },
    kind: { type: String, enum: ['meeting', 'review', 'reminder'], default: 'meeting' },
    exp: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { collection: 'events', versionKey: false }
);

module.exports = mongoose.model('Event', eventSchema);