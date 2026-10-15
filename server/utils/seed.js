'use strict';
/* Optional: loads a few demo customers so you can try the app straight away.
     npm run seed            (refuses to run if customers already exist)
     npm run seed -- --force (adds the demo customers anyway)            */
const env = require('../config/env');
const connectDB = require('../config/db');
const mongoose = require('mongoose');
const User = require('../models/User');
const Cash = require('../models/Cash');
const Settings = require('../models/Settings');
const M = require('../loanMath');
const { makeSecretKey } = require('./secretkey');

const today = M.istDay(new Date());

function loan(userId, { principal, interest, schedule, installment, startAgo, paid }) {
  const startDay = today - startAgo;
  const inst = M.toPaise(installment);
  const draft = {
    user: userId, principal: M.toPaise(principal), interest: M.toPaise(interest), schedule, installment: inst,
    startDate: M.dayToDate(startDay), endDate: M.dayToDate(M.defaultEndDay(startDay, schedule)), payments: [],
  };
  M.dueDays(startDay, schedule, paid).forEach((d, i) => {
    if (d <= today) draft.payments.push({ amount: inst, at: M.istInstant(M.dayToISO(d), '00:05'), method: i % 2 ? 'UPI' : 'Cash' });
  });
  return draft;
}

const DEMO = [
  { name: 'John Doe', phone: '9876500001', status: 'active', loans: [
    { principal: 24000, interest: 2400, schedule: 'Weekly', installment: 2000, startAgo: 70, paid: 10 },
    { principal: 10000, interest: 1000, schedule: 'Weekly', installment: 1000, startAgo: 14, paid: 2 },
  ] },
  { name: 'Susan Mathew', phone: '9876500002', status: 'active', loans: [
    { principal: 50000, interest: 5000, schedule: 'Monthly', installment: 5000, startAgo: 130, paid: 4 },
  ] },
  { name: 'Rahul Verma', phone: '9876500003', status: 'pending', loans: [] },
];

(async () => {
  await connectDB();
  if ((await User.countDocuments()) > 0 && !process.argv.includes('--force')) {
    console.log('Customers already exist — nothing seeded. Use  npm run seed -- --force  to add the demo customers anyway.');
    return;
  }
  for (const c of DEMO) {
    const seq = await Settings.nextCustomerSeq();
    const user = await User.create({ name: c.name, phone: c.phone, status: c.status, secretKey: makeSecretKey(seq) });
    if (c.loans.length) {
      await Cash.insertMany(c.loans.map((l) => loan(user._id, l)));
      await User.updateOne({ _id: user._id }, { $set: { cashCount: c.loans.length } });
    }
    console.log(`✔ ${c.name.padEnd(14)} secret key: ${user.secretKey}  (${c.status})`);
  }
  console.log(`\nAdmin sign-in key (from .env): ${env.ADMIN_SECRET_KEY}`);
})().catch((e) => { console.error('✖ Seed failed:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.connection.close());