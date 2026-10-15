'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./loanMath');

const d = (iso) => M.parseDateOnly(iso);
const at = (iso, t = '12:00') => M.istInstant(iso, t);
const R = (rupees) => M.toPaise(rupees);

const base = () => ({
  principal: R(24000), interest: R(2400), schedule: 'Weekly', installment: R(2000),
  startDate: d('2025-10-11'), endDate: d('2026-01-31'), payments: [],
});

test('money helpers never drift', () => {
  assert.equal(M.toPaise(1.1), 110);
  assert.equal(M.toPaise(0.1 + 0.2), 30);
  assert.equal(M.toRupees(110), 1.1);
});

test('weekday: 2025-10-11 is Saturday, 2025-10-12 is Sunday', () => {
  assert.equal(M.weekday(M.storedDay(d('2025-10-11'))), 6);
  assert.equal(M.weekday(M.storedDay(d('2025-10-12'))), 0);
});

test('Sunday due dates move to Monday; Daily skips Sundays', () => {
  const sunStart = M.storedDay(d('2025-10-05')); // Sunday
  M.dueDays(sunStart, 'Weekly', 6).forEach((x) => assert.notEqual(M.weekday(x), 0));
  const daily = M.dueDays(M.storedDay(d('2025-10-06')), 'Daily', 12); // starts Monday
  daily.forEach((x) => assert.notEqual(M.weekday(x), 0));
  assert.equal(new Set(daily).size, 12);
});

test('Monthly clamps to month end (31 Jan → 28 Feb 2025)', () => {
  const day = M.storedDay(d('2025-01-31'));
  assert.equal(M.dayToISO(M.addMonths(day, 1)), '2025-02-28');
  assert.equal(M.dayToISO(M.addMonths(day, 2)), '2025-03-31');
  assert.equal(M.dayToISO(M.addMonths(day, 13)), '2026-02-28');
});

test('default end date follows the terms', () => {
  assert.equal(M.dayToISO(M.defaultEndDay(M.storedDay(d('2025-10-11')), 'Weekly')), '2026-01-29');
  assert.equal(M.dayToISO(M.defaultEndDay(M.storedDay(d('2025-11-30')), 'Monthly')), '2026-02-28');
});

test('fresh loan: nothing paid, rebate applies, balance = grand − rebate', () => {
  const ev = M.evaluate(base(), at('2025-10-15'));   // before the first due date (18 Oct)
  assert.equal(ev.grand, R(26400));
  assert.equal(ev.rebate, R(1200));          // 2400 × (1 − 0.5)
  assert.equal(ev.payable, R(25200));
  assert.equal(ev.balance, R(25200));
  assert.equal(ev.status, 'active');
  assert.equal(ev.plannedInstalments, 13);   // ceil(25200 / 2000)
});

test('paying every instalment on its due day earns the rebate and closes the loan', () => {
  const loan = base();
  const dues = M.dueDays(M.storedDay(loan.startDate), 'Weekly', 13);
  dues.forEach((day, i) => {
    loan.payments.push({ amount: i < 12 ? R(2000) : R(1200), at: at(M.dayToISO(day)) });
  });
  const ev = M.evaluate(loan, at('2026-02-15'));
  assert.equal(ev.invalid, null);
  assert.equal(ev.settled, true);
  assert.equal(ev.status, 'completed');
  assert.equal(ev.paid, R(25200));
  assert.equal(ev.balance, 0);
  assert.equal(ev.rebate, R(1200));
  assert.equal(ev.progress, 100);
});

test('one missed instalment permanently removes the rebate', () => {
  const loan = base();
  // 18 Oct paid on time, 25 Oct MISSED, then catches up (4000) on 30 Oct
  loan.payments.push({ amount: R(2000), at: at('2025-10-18') });
  loan.payments.push({ amount: R(4000), at: at('2025-10-30') });
  const ev = M.evaluate(loan, at('2025-11-04'));
  assert.equal(ev.pending, 1);               // only the 25 Oct instalment was missed
  assert.equal(ev.rebate, 0);
  assert.equal(ev.payable, R(26400));
  assert.equal(ev.balance, R(26400 - 6000));
});

test('late interest = interest ÷ total days × days late (integer paise)', () => {
  const loan = base();
  const ev = M.evaluate(loan, at('2026-02-10'));   // 10 days after 31 Jan
  const days = M.storedDay(loan.endDate) - M.storedDay(loan.startDate);
  assert.equal(days, 112);
  assert.equal(ev.late, Math.round((R(2400) * 10) / 112));
  assert.equal(ev.status, 'overdue');
  assert.equal(ev.rebate, 0);
  assert.equal(ev.payable, R(26400) + ev.late);
});

test('late interest does not accrue until the day AFTER the end date', () => {
  const ev = M.evaluate(base(), at('2026-01-31', '23:30'));
  assert.equal(ev.late, 0);
  assert.equal(M.evaluate(base(), at('2026-02-01', '00:10')).late, Math.round(R(2400) / 112));
});

test('late interest stops once the loan is closed', () => {
  const loan = base();
  const due = M.evaluate(loan, at('2026-02-10'));
  loan.payments.push({ amount: due.payable, at: at('2026-02-10') });
  const later = M.evaluate(loan, at('2026-03-30'));
  assert.equal(later.status, 'completed');
  assert.equal(later.late, due.late);
  assert.equal(later.balance, 0);
});

test('overpaying is detected, with the maximum allowed amount', () => {
  const loan = base();
  loan.payments.push({ amount: R(30000), at: at('2025-10-18') });
  const ev = M.evaluate(loan, at('2025-10-19'));
  assert.equal(ev.invalid.type, 'overpay');
  assert.equal(ev.invalid.maxAmount, R(25200));
});

test('payments after the loan is settled are rejected', () => {
  const loan = base();
  loan.payments.push({ amount: R(25200), at: at('2025-10-18') });
  loan.payments.push({ amount: R(100), at: at('2025-10-19') });
  assert.equal(M.evaluate(loan, at('2025-10-20')).invalid.type, 'after-close');
});

test('manual close with write-off', () => {
  const loan = base();
  loan.payments.push({ amount: R(2000), at: at('2025-10-18') });
  loan.closed = { at: at('2025-11-01') };
  const ev = M.evaluate(loan, at('2025-12-01'));
  assert.equal(ev.status, 'completed');
  assert.equal(ev.balance, 0);
  // 25 Oct was missed → rebate lost → payable is the full 26 400
  assert.equal(ev.writtenOff, R(26400 - 2000));
});

test('as-of evaluation in the past ignores later payments and later closure', () => {
  const loan = base();
  loan.payments.push({ amount: R(2000), at: at('2025-10-18') });
  loan.payments.push({ amount: R(2000), at: at('2025-10-25') });
  assert.equal(M.evaluate(loan, at('2025-10-20')).paid, R(2000));
  assert.equal(M.evaluate(loan, at('2025-10-01')).started, false);
});

test('next instalment + arrears', () => {
  const loan = base();
  loan.payments.push({ amount: R(2000), at: at('2025-10-18') });
  const ev = M.evaluate(loan, at('2025-11-05'));     // 25 Oct and 1 Nov are past
  assert.equal(ev.arrears, R(6000 - 2000));          // required 6 000 by 1 Nov, paid 2 000
  assert.equal(M.dayToISO(ev.nextDueDay), '2025-11-08');
  assert.equal(ev.nextAmount, R(8000 - 2000));       // to be fully current by 8 Nov
});