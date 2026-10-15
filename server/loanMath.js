'use strict';
/* =====================================================================
   LOAN MATH — the single source of truth for every money/date number.

   RULES
   • All money is INTEGER PAISE inside the server (₹1 = 100). No floats are
     ever summed; the API converts to/from rupees at the edge only.
   • All business dates use the INDIA (IST, UTC+05:30) calendar.
       – startDate / endDate are stored as UTC-midnight "date only" values.
       – payment times are real instants (Date).
   • Nothing derived (balance, progress, status…) is stored in the database.
     It is recomputed from the loan's facts, so it can never go out of sync.

   BUSINESS RULES (from the customer terms)
   1. grand        = principal + interest
   2. Instalments  fall on schedule dates (Daily / Weekly / Monthly).
                   A due date on a Sunday moves to Monday; Daily skips Sundays.
   3. "Pending"    = an instalment whose due day has passed while the cumulative
                   amount paid by that day is below what the schedule required.
   4. REBATE       If the customer has had NO pendings and is still within the
                   end date, interest is reduced:  10% → 5%  i.e. interest × 0.5
                   (REBATE_RATIO, default 0.5). Once a pending happens the rebate
                   is lost for good (catching up later does not restore it).
   5. LATE INTEREST After the end date, while the loan is open, a flat daily
                   amount is added:   interest ÷ total days (start→end)
                   × whole days late.  Accrual stops when the loan is closed.
   6. A loan CLOSES when payments ≥ amount payable on the day of payment, or
      when an admin closes it manually (optionally writing off the balance).
   ===================================================================== */

const DAY = 86400000;
const IST = 19800000; // 5h30m in ms
const MAX_INSTALMENTS = 1000;

/* ---------- money ---------- */
const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paise) => paise / 100;

/* ---------- day arithmetic (integers = days since 1970-01-01) ---------- */
const istDay = (instant) => Math.floor((instant.getTime() + IST) / DAY);   // calendar day in IST
const storedDay = (dateOnly) => Math.round(dateOnly.getTime() / DAY);      // stored UTC-midnight date
const dayToDate = (n) => new Date(n * DAY);
const dayToISO = (n) => dayToDate(n).toISOString().slice(0, 10);
const weekday = (n) => (((n + 4) % 7) + 7) % 7; // 0 = Sunday (1970-01-01 was a Thursday)

function addMonths(day, k) {
  const d = dayToDate(day);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + k;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();   // length of target month
  return Math.round(Date.UTC(y, m, Math.min(d.getUTCDate(), last)) / DAY);
}

/** "YYYY-MM-DD" → stored date-only value */
const parseDateOnly = (iso) => new Date(`${iso}T00:00:00.000Z`);
/** IST wall-clock "YYYY-MM-DD" + "HH:mm" → real instant */
const istInstant = (iso, time = '00:00') => new Date(`${iso}T${time}:00+05:30`);
/** instant → { date: 'YYYY-MM-DD', time: 'HH:mm' } in IST */
function istParts(instant) {
  const s = new Date(instant.getTime() + IST).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

/** Default end date from the terms: Daily/Weekly 110 days, Monthly 3 months. */
const defaultEndDay = (startDay, schedule) =>
  (schedule === 'Monthly' ? addMonths(startDay, 3) : startDay + 110);

/** Due days (ascending) of the first `n` instalments. */
function dueDays(startDay, schedule, n) {
  const out = [];
  if (schedule === 'Daily') {
    let d = startDay;
    while (out.length < n) { d += 1; if (weekday(d) !== 0) out.push(d); }
    return out;
  }
  for (let k = 1; k <= n; k += 1) {
    let d = schedule === 'Monthly' ? addMonths(startDay, k) : startDay + 7 * k;
    if (weekday(d) === 0) d += 1;                // Sunday → Monday
    out.push(d);
  }
  return out;
}

/** How many instalments the plan needs (using the on-time/rebated target). */
function plannedInstalments({ principal, interest, installment }, rebateRatio = 0.5) {
  const target = principal + interest - Math.round(interest * (1 - rebateRatio));
  return Math.max(1, Math.ceil(target / installment));
}

/* =====================================================================
   evaluate(loan, asOf) → every derived number, all in paise
   loan = { principal, interest, schedule, installment, startDate, endDate,
            closed?:{at,writtenOff}, payments:[{_id?,amount,at,method?,note?}] }
   ===================================================================== */
function evaluate(loan, asOfInput = new Date(), opts = {}) {
  const { rebateRatio = 0.5, lateInterest = true } = opts;
  const now = asOfInput;

  const P = loan.principal;
  const I = loan.interest;
  const inst = loan.installment;
  const G = P + I;
  const rebateFull = Math.round(I * (1 - rebateRatio));
  const target = G - rebateFull;               // what an on-time customer pays in total

  const startDay = storedDay(loan.startDate);
  const endDay = storedDay(loan.endDate);
  const duration = Math.max(1, endDay - startDay);

  const n = Math.min(MAX_INSTALMENTS, Math.max(1, Math.ceil(target / inst)));
  const dues = dueDays(startDay, loan.schedule, n);
  const reqs = dues.map((_, i) => Math.min((i + 1) * inst, target)); // cumulative amount required by each due day

  const pays = (loan.payments || [])
    .map((p, i) => ({ id: p._id, amount: p.amount, at: new Date(p.at), method: p.method, note: p.note, day: istDay(new Date(p.at)), i }))
    .sort((a, b) => a.at - b.at || a.i - b.i);

  const paidThrough = (day) => pays.reduce((s, p) => (p.day <= day ? s + p.amount : s), 0);

  /** instalments whose due day is BEFORE `day` and were not fully met by their due day */
  const pendingBy = (day) => {
    let c = 0;
    for (let i = 0; i < dues.length && dues[i] < day; i += 1) {
      if (paidThrough(dues[i]) < reqs[i]) c += 1;
    }
    return c;
  };
  const lateAt = (day) => (lateInterest && day > endDay ? Math.round((I * (day - endDay)) / duration) : 0);
  const eligibleAt = (day) => day <= endDay && pendingBy(day) === 0;
  const targetAt = (day) => G + lateAt(day) - (eligibleAt(day) ? rebateFull : 0);

  /* ----- payment rows + settlement detection ----- */
  let cum = 0;
  let settledIdx = -1;
  const rows = pays.map((p, i) => {
    cum += p.amount;
    const raw = targetAt(p.day) - cum;          // negative ⇒ overpaid
    if (settledIdx < 0 && raw <= 0) settledIdx = i;
    return { id: p.id, no: i + 1, amount: p.amount, at: p.at, method: p.method, note: p.note, rawBalance: raw, balanceAfter: Math.max(0, raw) };
  });
  const settledAt = settledIdx >= 0 ? pays[settledIdx].at : null;
  const manualAt = loan.closed && loan.closed.at ? new Date(loan.closed.at) : null;
  const closeAt = settledAt || manualAt;
  const isClosed = !!closeAt && closeAt <= now;

  /* ----- position as of `asOf` (or the close instant) ----- */
  const asOf = isClosed ? closeAt : now;
  const asDay = istDay(asOf);
  const paid = pays.reduce((s, p) => (p.at <= asOf ? s + p.amount : s), 0);
  const late = lateAt(asDay);
  const rebate = eligibleAt(asDay) ? rebateFull : 0;
  const payable = G + late - rebate;

  let balance = Math.max(0, payable - paid);
  let writtenOff = 0;
  if (isClosed && !settledAt) { writtenOff = balance; balance = 0; }

  let status;
  if (isClosed) status = 'completed';
  else if (asDay > endDay) status = 'overdue';
  else if (endDay - asDay <= 7) status = 'due-soon';
  else status = 'active';

  /* ----- next instalment + arrears ----- */
  let nextDay = null;
  let nextAmount = 0;
  let arrears = 0;
  if (!isClosed) {
    let past = -1;
    for (let i = 0; i < dues.length && dues[i] < asDay; i += 1) past = i;
    if (past >= 0) arrears = Math.max(0, reqs[past] - paid);
    let j = past + 1;
    while (j < dues.length && reqs[j] <= paid) j += 1;
    if (j < dues.length) { nextDay = dues[j]; nextAmount = Math.min(balance, reqs[j] - paid); }
    else nextAmount = balance;
  }

  /* ----- integrity problems the caller may want to reject ----- */
  let invalid = null;
  const over = rows.find((r) => r.rawBalance < 0);
  if (settledIdx >= 0 && settledIdx < rows.length - 1) invalid = { type: 'after-close' };
  else if (over) invalid = { type: 'overpay', maxAmount: over.amount + over.rawBalance };

  return {
    grand: G, paid, late, rebate, rebateFull, payable, balance, writtenOff,
    status,
    started: startDay <= asDay,
    closedAt: isClosed ? closeAt : null,
    settled: !!settledAt,
    pending: pendingBy(asDay),
    nextDueDay: nextDay,
    nextAmount,
    arrears,
    instalmentsLeft: inst > 0 ? Math.ceil(balance / inst) : 0,
    plannedInstalments: n,
    dailyLate: I / duration,
    progress: payable > 0 ? Math.min(100, Math.floor((paid * 1000) / payable) / 10) : 100,
    lastDueDay: dues[dues.length - 1],
    rows, invalid,
  };
}

module.exports = {
  DAY, IST, MAX_INSTALMENTS,
  toPaise, toRupees,
  istDay, storedDay, dayToDate, dayToISO, weekday, addMonths,
  parseDateOnly, istInstant, istParts,
  defaultEndDay, dueDays, plannedInstalments, evaluate,
};