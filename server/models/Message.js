'use strict';
const mongoose = require('mongoose');

/* Chat messages auto-delete after 24 hours (MongoDB TTL index), which is
   exactly what the chat window promises — and keeps the collection tiny. */
const messageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    from: { type: String, enum: ['u', 'a'], required: true },        // u = customer, a = admin
    text: { type: String, required: true, trim: true, maxlength: 500 },
    read: { type: Boolean, default: false },                         // read by the OTHER side
    at: { type: Date, default: Date.now, index: { expireAfterSeconds: 86400 } },
  },
  { collection: 'messages', versionKey: false }
);
messageSchema.index({ user: 1, at: 1 });

module.exports = mongoose.model('Message', messageSchema);