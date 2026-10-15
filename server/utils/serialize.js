'use strict';
const M = require('../loanMath');
const env = require('../config/env');

const rupees = M.toRupees;
const dateOnly = (d) => d.toISOString().slice(0, 10);

/** one cash entry → everything the frontend shows, in RUPEES, computed fresh */
function serializeLoan(cash, now = new Date()) {
  const c = typeof cash.toObject === 'function' ? cash.toObject() : cash;
  const ev = M.evaluate(c, now, env.MATH);
  return {
    id: String(c._id),
    principal: rupees(c.principal),
    interest: rupees(c.interest),
    interestPct: c.principal ? Math.round((c.interest * 10000) / c.principal) / 100 : 0,
    schedule: c.schedule,
    installment: rupees(c.installment),
    startDate: dateOnly(c.startDate),
    endDate: dateOnly(c.endDate),

    grand: rupees(ev.grand),
    late: rupees(ev.late),
    rebate: rupees(ev.rebate),
    payable: rupees(ev.payable),
    paid: rupees(ev.paid),
    balance: rupees(ev.balance),
    writtenOff: rupees(ev.writtenOff),
    dailyLate: Math.round(ev.dailyLate) / 100,
    progress: ev.progress,
    status: ev.status,
    pending: ev.pending,
    arrears: rupees(ev.arrears),
    nextDue: ev.nextDueDay == null ? null : M.dayToISO(ev.nextDueDay),
    nextAmount: rupees(ev.nextAmount),
    instalmentsLeft: ev.instalmentsLeft,
    plannedInstalments: ev.plannedInstalments,
    closed: !!ev.closedAt,
    settled: ev.settled,
    closedAt: ev.closedAt ? ev.closedAt.toISOString() : null,

    payments: ev.rows.map((r) => ({
      id: String(r.id),
      no: r.no,
      paid: rupees(r.amount),
      balanceAfter: rupees(r.balanceAfter),
      method: r.method,
      ...M.istParts(r.at),            // { date, time } in IST
      note: r.note || '',
    })),
  };
}

const serializeCustomer = (u) => ({
  id: String(u._id),
  secretKey: u.secretKey,
  name: u.name,
  phone: u.phone || '',
  joined: M.istParts(u.joined).date,
  status: u.status,
  cashTaken: u.cashCount || 0,
});

/** totals across a customer's cash entries (sums are done in paise) */
function summarize(cashDocs, now = new Date()) {
  const t = { principal: 0, payable: 0, paid: 0, balance: 0, overdue: 0, dueSoon: 0 };
  const evs = cashDocs.map((c) => M.evaluate(c, now, env.MATH));
  evs.forEach((ev, i) => {
    t.principal += cashDocs[i].principal;
    t.payable += ev.payable;
    t.paid += ev.paid;
    t.balance += ev.balance;
    if (ev.status === 'overdue') t.overdue += 1;
    if (ev.status === 'due-soon') t.dueSoon += 1;
  });
  return {
    borrowed: rupees(t.principal),
    paid: rupees(t.paid),
    outstanding: rupees(t.balance),
    repaidPct: t.payable ? Math.min(100, Math.round((t.paid * 100) / t.payable)) : 0,
    overdue: t.overdue,
    dueSoon: t.dueSoon,
  };
}

module.exports = { serializeLoan, serializeCustomer, summarize };