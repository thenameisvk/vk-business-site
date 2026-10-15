'use strict';
const mongoose = require('mongoose');

/* A customer. Admin is NOT stored here (it signs in with ADMIN_SECRET_KEY),
   so there is no password hash and no wasted document. */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    phone: { type: String, trim: true, match: /^\d{10}$/ },            // omitted when empty
    secretKey: { type: String, required: true, unique: true, uppercase: true, trim: true, immutable: true },
    status: { type: String, enum: ['active', 'pending', 'blocked'], default: 'active' },
    joined: { type: Date, default: Date.now, immutable: true },
    cashCount: { type: Number, default: 0, min: 0 },                   // how many cash entries (kept in step by the routes)
  },
  { collection: 'users', versionKey: false }
);

module.exports = mongoose.model('User', userSchema);