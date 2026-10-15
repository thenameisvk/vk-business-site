import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import '../styles/admin/Settings.css';
import API, { errorMessage, fieldErrors } from '../api';
import {
  useToast, useConfirm, Modal, Drawer, Field, Pagination, StatusBadge,
  EmptyState, Avatar, formatINR, formatDate, todayISO, downloadCSV,
  useDebouncedValue, copyText,
} from '../UI/AdminUI';

const STATUS_TONE = { active: 'success', pending: 'warning', blocked: 'danger' };
const LOAN_STATE = {
  completed: { tone: 'success', label: 'Completed' },
  overdue: { tone: 'danger', label: 'Overdue' },
  'due-soon': { tone: 'warning', label: 'Ending soon' },
  active: { tone: 'info', label: 'On track' },
};
const METHODS = ['Cash', 'Online', 'UPI', 'Bank Transfer'];
const EMPTY_PAY = { paid: '', method: 'Cash', date: '', time: '', note: '' };
const EMPTY_LOAN = { principal: '', interest: '', schedule: 'Weekly', installment: '', startDate: '', endDate: '' };
const nowTime = () => new Date().toTimeString().slice(0, 5);
const fmtMsgTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/* =====================================================================
   COMPONENT — every number shown here is calculated by the server
   (utils/loanMath.js). This file only displays and edits.
   ===================================================================== */
export default function ViewCustomer({ customerId, onClose, openChat = false }) {
  const toast = useToast();
  const confirm = useConfirm();

  const [customer, setCustomer] = useState(null);
  const [loans, setLoans] = useState([]);
  const [loanId, setLoanId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [defaultPct, setDefaultPct] = useState(10);

  // payment table controls
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);
  const [method, setMethod] = useState('all');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  // overlays
  const [payForm, setPayForm] = useState(null);   // { mode, id?, values, errors, saving }
  const [loanForm, setLoanForm] = useState(null);
  const [busy, setBusy] = useState(false);        // complete / reopen / delete entry

  // chat
  const [msgOpen, setMsgOpen] = useState(openChat);
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const threadEnd = useRef(null);
  const msgOpenRef = useRef(msgOpen);
  msgOpenRef.current = msgOpen;

  const loan = loans.find((l) => l.id === loanId) || loans[0] || null;

  /* ---------- load customer + cash entries ---------- */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get(`/settings/customers/${customerId}`);
      setCustomer(data.customer);
      setLoans(data.loans);
      setLoanId((prev) => (data.loans.some((l) => l.id === prev) ? prev : data.loans[0]?.id || ''));
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load this customer.'));
    } finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    API.get('/settings/config').then(({ data }) => setDefaultPct(data.defaultInterestPct)).catch(() => {});
  }, []);

  const replaceLoan = (updated) => setLoans((all) => all.map((l) => (l.id === updated.id ? updated : l)));

  /* ---------- chat ---------- */
  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await API.get(`/settings/customers/${customerId}/messages`);
      setMessages(data.items);
      if (msgOpenRef.current && data.unread > 0) {
        await API.post(`/settings/customers/${customerId}/messages/read`);
        setUnread(0);
      } else setUnread(data.unread);
    } catch { /* silent: polling */ }
  }, [customerId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => {
    if (!msgOpen) return undefined;
    fetchMessages();
    const t = setInterval(fetchMessages, 8000);
    return () => clearInterval(t);
  }, [msgOpen, fetchMessages]);
  useEffect(() => {
    if (msgOpen) setTimeout(() => threadEnd.current?.scrollIntoView({ block: 'end' }), 60);
  }, [msgOpen, messages.length]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { data } = await API.post(`/settings/customers/${customerId}/messages`, { text });
      setMessages((m) => [...m, data]);
      setDraft('');
    } catch (err) { toast.error(errorMessage(err, 'Message could not be sent.')); }
    finally { setSending(false); }
  };

  /* ---------- payment table (search / method / sort are local) ---------- */
  const view = useMemo(() => {
    if (!loan) return [];
    const q = debouncedQuery.trim().toLowerCase();
    let r = loan.payments.filter((p) =>
      (method === 'all' || p.method === method) &&
      (!q || String(p.paid).includes(q) || p.date.includes(q) || (p.note || '').toLowerCase().includes(q)));
    if (order === 'desc') r = [...r].reverse();
    return r;
  }, [loan, debouncedQuery, method, order]);

  const totalPages = Math.max(1, Math.ceil(view.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = view.slice((safePage - 1) * perPage, safePage * perPage);
  useEffect(() => { setPage(1); }, [debouncedQuery, method, order, perPage, loanId]);

  /* ---------- add / edit payment ---------- */
  const openAddPayment = () => setPayForm({
    mode: 'create', saving: false, errors: {},
    values: { ...EMPTY_PAY, paid: String(loan.nextAmount > 0 ? loan.nextAmount : loan.balance), date: todayISO(), time: nowTime() },
  });
  const openEditPayment = (p) => setPayForm({
    mode: 'edit', id: p.id, saving: false, errors: {},
    values: { paid: String(p.paid), method: p.method, date: p.date, time: p.time, note: p.note || '' },
  });
  const setPay = (key) => (e) => setPayForm((f) => ({ ...f, values: { ...f.values, [key]: e.target.value }, errors: { ...f.errors, [key]: '' } }));

  const submitPayment = async (e) => {
    e?.preventDefault();
    if (payForm.saving) return;
    const v = payForm.values;
    const amount = Number(v.paid);
    const errors = {};
    if (!v.paid || !(amount > 0)) errors.paid = 'Enter an amount greater than zero.';
    if (!v.date) errors.date = 'Choose the payment date.';
    if (Object.keys(errors).length) { setPayForm((f) => ({ ...f, errors })); return; }

    setPayForm((f) => ({ ...f, saving: true }));
    const body = { amount, method: v.method, date: v.date, time: v.time || undefined, note: v.note.trim() };
    try {
      const res = payForm.mode === 'create'
        ? await API.post(`/settings/cash/${loan.id}/payments`, body)
        : await API.patch(`/settings/cash/${loan.id}/payments/${payForm.id}`, body);
      replaceLoan(res.data);
      if (payForm.mode === 'create') {
        toast.success(`${formatINR(amount)} recorded via ${v.method.toLowerCase()}.`, { title: 'Payment added' });
        setOrder('asc');
        setPage(Math.max(1, Math.ceil(res.data.payments.length / perPage)));
      } else toast.success('Payment details were updated.', { title: 'Changes saved' });
      setPayForm(null);
    } catch (err) {
      const fe = fieldErrors(err, { amount: 'paid' });
      if (Object.keys(fe).length) setPayForm((f) => ({ ...f, saving: false, errors: fe }));
      else if (err.response?.status === 422) setPayForm((f) => ({ ...f, saving: false, errors: { paid: errorMessage(err) } }));
      else { setPayForm((f) => ({ ...f, saving: false })); toast.error(errorMessage(err)); }
    }
  };

  const deletePayment = async (p) => {
    const ok = await confirm({
      title: 'Delete payment record',
      itemName: `${formatINR(p.paid)} on ${formatDate(p.date)}`,
      consequences: ['The balance due increases by this amount.', 'Running balances and the interest rebate are recalculated.'],
    });
    if (!ok) return;
    const target = loan;
    try {
      const { data } = await API.delete(`/settings/cash/${target.id}/payments/${p.id}`);
      replaceLoan(data);
      toast.success(`${formatINR(p.paid)} payment removed.`, {
        title: 'Deleted', duration: 8000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const res = await API.post(`/settings/cash/${target.id}/payments`, {
                amount: p.paid, method: p.method, date: p.date, time: p.time, note: p.note || undefined,
              });
              replaceLoan(res.data);
              toast.success('Payment restored.', { duration: 2500 });
            } catch (err) { toast.error(errorMessage(err, 'Could not restore the payment.')); }
          },
        },
      });
    } catch (err) { toast.error(errorMessage(err)); }
  };

  /* ---------- add / edit cash entry ---------- */
  const openAddLoan = () => setLoanForm({ mode: 'create', saving: false, errors: {}, values: { ...EMPTY_LOAN, startDate: todayISO() } });
  const openEditLoan = () => setLoanForm({
    mode: 'edit', saving: false, errors: {},
    values: {
      principal: String(loan.principal), interest: String(loan.interest), schedule: loan.schedule,
      installment: String(loan.installment), startDate: loan.startDate, endDate: loan.endDate,
    },
  });
  const setLoanVal = (key) => (e) => setLoanForm((f) => ({ ...f, values: { ...f.values, [key]: e.target.value }, errors: { ...f.errors, [key]: '' } }));

  const loanPreview = loanForm ? (() => {
    const p = Math.round((Number(loanForm.values.principal) || 0) * 100);
    const interestBlank = loanForm.values.interest === '';
    const i = interestBlank ? Math.round((p * defaultPct) / 100) : Math.round((Number(loanForm.values.interest) || 0) * 100);
    const inst = Math.round((Number(loanForm.values.installment) || 0) * 100);
    return { grand: (p + i) / 100, count: inst ? Math.ceil((p + i) / inst) : 0, pct: p ? Math.round((i * 10000) / p) / 100 : 0, usingDefault: interestBlank };
  })() : null;

  const submitLoan = async (e) => {
    e?.preventDefault();
    if (loanForm.saving) return;
    const v = loanForm.values;
    const errors = {};
    if (!(Number(v.principal) > 0)) errors.principal = 'Enter the amount given.';
    if (v.interest !== '' && Number(v.interest) < 0) errors.interest = 'Interest cannot be negative.';
    if (!(Number(v.installment) > 0)) errors.installment = 'Enter the instalment amount.';
    if (!v.startDate) errors.startDate = 'Choose a start date.';
    if (v.endDate && v.startDate && v.endDate < v.startDate) errors.endDate = 'End date must be after the start date.';
    if (Object.keys(errors).length) { setLoanForm((f) => ({ ...f, errors })); return; }

    const principal = Number(v.principal);
    const body = {
      principal, schedule: v.schedule, installment: Number(v.installment), startDate: v.startDate,
      endDate: v.endDate || undefined,
      interest: v.interest === '' ? (loanForm.mode === 'create' ? undefined : Math.round(principal * defaultPct) / 100) : Number(v.interest),
    };
    setLoanForm((f) => ({ ...f, saving: true }));
    try {
      if (loanForm.mode === 'create') {
        const { data } = await API.post(`/settings/customers/${customerId}/cash`, body);
        setLoans((all) => [...all, data]);
        setLoanId(data.id);
        toast.success(`${formatINR(data.principal)} cash entry created.`, { title: 'Cash entry added' });
      } else {
        const { data } = await API.patch(`/settings/cash/${loan.id}`, body);
        replaceLoan(data);
        toast.success('Cash entry details were updated.', { title: 'Changes saved' });
      }
      setLoanForm(null);
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setLoanForm((f) => ({ ...f, saving: false, errors: fe }));
      else if (err.response?.status === 422) setLoanForm((f) => ({ ...f, saving: false, errors: { installment: errorMessage(err) } }));
      else { setLoanForm((f) => ({ ...f, saving: false })); toast.error(errorMessage(err)); }
    }
  };

  const deleteLoan = async () => {
    const ok = await confirm({
      title: 'Delete cash entry',
      itemName: `Cash entry of ${formatINR(loan.principal)}`,
      consequences: [`All ${loan.payments.length} payment records inside it are permanently removed.`, 'This cannot be undone.'],
    });
    if (!ok) return;
    setBusy(true);
    try {
      await API.delete(`/settings/cash/${loan.id}`);
      const rest = loans.filter((l) => l.id !== loan.id);
      setLoans(rest);
      setLoanId(rest[0]?.id || '');
      toast.success('Cash entry deleted.', { title: 'Deleted' });
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(false); }
  };

  /* ---------- mark completed / reopen ---------- */
  const completeLoan = async () => {
    const first = await confirm({
      title: 'Mark as completed', verb: 'Complete', itemName: `Cash entry of ${formatINR(loan.principal)}`,
      variant: 'primary', steps: 1, confirmLabel: 'Mark completed',
      description: 'The entry will be closed and late interest stops growing. You can reopen it later.',
    });
    if (!first) return;
    setBusy(true);
    try {
      const { data } = await API.post(`/settings/cash/${loan.id}/complete`, { writeOff: false });
      replaceLoan(data);
      toast.success('Cash entry marked as completed.', { title: 'Completed' });
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.needsWriteOff) {
        const bal = err.response.data.balance;
        const sure = await confirm({
          title: 'Balance still due', verb: 'Write off', itemName: formatINR(bal), phrase: 'WRITE OFF', variant: 'warning', confirmLabel: 'Write off & close',
          description: `${formatINR(bal)} has not been paid. Closing now writes this amount off.`,
          consequences: ['The balance is removed from your outstanding total.', 'You can reopen the entry later if needed.'],
        });
        if (sure) {
          try {
            const { data } = await API.post(`/settings/cash/${loan.id}/complete`, { writeOff: true });
            replaceLoan(data);
            toast.success(`${formatINR(bal)} written off and the entry closed.`, { title: 'Completed' });
          } catch (e2) { toast.error(errorMessage(e2)); }
        }
      } else toast.error(errorMessage(err));
    } finally { setBusy(false); }
  };

  const reopenLoan = async () => {
    setBusy(true);
    try {
      const { data } = await API.post(`/settings/cash/${loan.id}/reopen`);
      replaceLoan(data);
      toast.success('Cash entry reopened.', { title: 'Reopened' });
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setBusy(false); }
  };

  /* ---------- misc ---------- */
  const exportPayments = () => {
    downloadCSV(`${customer.name.replace(/\s+/g, '-')}-payments-${todayISO()}.csv`, view.map((p) => ({
      No: p.no, Paid: p.paid, 'Balance after': p.balanceAfter, Method: p.method, Date: p.date, Time: p.time, Note: p.note || '',
    })));
    toast.success(`${view.length} payment records exported.`, { title: 'Export ready' });
  };
  const copyKey = async () => {
    (await copyText(customer.secretKey)) ? toast.success('Secret key copied.', { duration: 2000 }) : toast.error('Could not copy the key.');
  };

  /* =====================================================================
     LOADING / ERROR
     ===================================================================== */
  if (loading && !customer) {
    return (
      <div className="vc">
        <div className="vc-top">{onClose && <button type="button" className="adm-btn adm-btn--ghost vc-back" onClick={onClose}><i className="bi bi-arrow-left" /> Back to customers</button>}</div>
        <div className="adm-card st-skeletons" aria-busy="true" aria-label="Loading customer"><div className="adm-skel adm-skel--tall" /><div className="adm-skel" /><div className="adm-skel" /></div>
      </div>
    );
  }
  if (error && !customer) {
    return (
      <div className="vc">
        <div className="vc-top">{onClose && <button type="button" className="adm-btn adm-btn--ghost vc-back" onClick={onClose}><i className="bi bi-arrow-left" /> Back to customers</button>}</div>
        <div className="adm-card"><EmptyState icon="bi-exclamation-triangle" title="Could not load this customer" text={error}
          action={<button type="button" className="adm-btn adm-btn--primary" onClick={load}>Try again</button>} /></div>
      </div>
    );
  }

  const state = loan ? LOAN_STATE[loan.status] : null;
  const loanIndex = loan ? loans.findIndex((l) => l.id === loan.id) + 1 : 0;

  /* =====================================================================
     RENDER
     ===================================================================== */
  return (
    <div className="vc">
      <div className="vc-top">
        {onClose && <button type="button" className="adm-btn adm-btn--ghost vc-back" onClick={onClose}><i className="bi bi-arrow-left" /> Back to customers</button>}
      </div>

      <header className="adm-card vc-header">
        <Avatar name={customer.name} large />
        <div className="vc-id">
          <h1 className="adm-title notranslate" translate="no">{customer.name}</h1>
          <div className="vc-meta">
            <button type="button" className="vc-chip vc-chip--btn notranslate" translate="no" onClick={copyKey} title="Copy secret key">
              <i className="bi bi-key-fill" /> <span className="adm-mono">{customer.secretKey}</span> <i className="bi bi-copy" />
            </button>
            <span className="vc-chip"><i className="bi bi-calendar-check" /> Joined {formatDate(customer.joined)}</span>
            <StatusBadge tone={STATUS_TONE[customer.status] || 'muted'}>{customer.status}</StatusBadge>
          </div>
        </div>
        <div className="vc-header-actions">
          <button type="button" className="adm-btn" onClick={() => setMsgOpen(true)}>
            <i className="bi bi-chat-dots" /> Messages {unread > 0 && <span className="adm-count">{unread}</span>}
          </button>
          <button type="button" className="adm-btn adm-btn--primary" onClick={openAddLoan} disabled={customer.status === 'blocked'} title={customer.status === 'blocked' ? 'Blocked customers cannot take new cash' : undefined}>
            <i className="bi bi-plus-lg" /> Add cash entry
          </button>
        </div>
      </header>

      {!loan ? (
        <div className="adm-card">
          <EmptyState icon="bi-cash-stack" title="No cash entries yet"
            text={`Record the first cash amount given to ${customer.name} to start tracking payments.`}
            action={<button type="button" className="adm-btn adm-btn--primary" onClick={openAddLoan} disabled={customer.status === 'blocked'}><i className="bi bi-plus-lg" /> Add cash entry</button>} />
        </div>
      ) : (
        <>
          {loans.length > 1 && (
            <div className="adm-seg vc-tabs" role="tablist" aria-label="Cash entries">
              {loans.map((l, i) => (
                <button key={l.id} type="button" role="tab" aria-selected={l.id === loan.id} aria-pressed={l.id === loan.id} onClick={() => setLoanId(l.id)}>
                  Cash #{i + 1} <span className="adm-seg-count">{formatINR(l.principal)}</span>
                </button>
              ))}
            </div>
          )}

          <section className="vc-summary" aria-label="Summary">
            <div className="vc-stat"><i className="bi bi-cash-coin" /><small>Total paid</small><strong>{formatINR(loan.paid)}</strong></div>
            <div className="vc-stat vc-stat--due"><i className="bi bi-wallet2" /><small>Balance due</small><strong>{formatINR(loan.balance)}</strong></div>
            <div className="vc-stat"><i className="bi bi-receipt" /><small>Payments made</small><strong>{loan.payments.length}</strong></div>
            <div className="vc-stat"><i className="bi bi-hourglass-split" /><small>Instalments left</small><strong>{loan.instalmentsLeft}</strong></div>
          </section>

          <div className="adm-card vc-progress">
            <div className="vc-progress-label">
              <span><i className="bi bi-graph-up-arrow" /> Repayment progress <StatusBadge tone={state.tone}>{state.label}</StatusBadge></span>
              <strong>{loan.progress.toFixed(1)}%</strong>
            </div>
            <div className="vc-bar" role="progressbar" aria-valuenow={Math.round(loan.progress)} aria-valuemin={0} aria-valuemax={100}>
              <div className="vc-bar-fill" style={{ width: `${loan.progress}%` }} />
            </div>
            {!loan.closed && loan.arrears > 0 && (
              <p className="vc-next is-overdue"><i className="bi bi-exclamation-triangle-fill" /> Behind schedule by <strong>{formatINR(loan.arrears)}</strong></p>
            )}
            {!loan.closed && (
              <p className="vc-next">
                <i className="bi bi-calendar-event" />
                {loan.nextDue
                  ? <>Next instalment <strong>{formatINR(loan.nextAmount)}</strong> by <strong>{formatDate(loan.nextDue)}</strong></>
                  : <>The scheduled instalments are over. <strong>{formatINR(loan.balance)}</strong> is due now.</>}
              </p>
            )}
            {loan.closed && (
              <p className="vc-next vc-closed-note">
                <i className="bi bi-patch-check-fill" /> Closed on <strong>{formatDate(loan.closedAt.slice(0, 10))}</strong>
                {loan.writtenOff > 0 && <> · <strong>{formatINR(loan.writtenOff)}</strong> written off</>}
              </p>
            )}
          </div>

          <div className="adm-card">
            <div className="vc-terms">
              <div><small>Amount given</small><strong>{formatINR(loan.principal)}</strong></div>
              <div><small>Interest ({loan.interestPct}%)</small><strong>{formatINR(loan.interest)}</strong></div>
              <div><small>Grand total</small><strong>{formatINR(loan.grand)}</strong></div>
              {loan.late > 0 && <div><small>Late interest</small><strong className="vc-late">+{formatINR(loan.late)}</strong></div>}
              {loan.rebate > 0 && <div><small>Interest rebate</small><strong className="vc-rebate">−{formatINR(loan.rebate)}</strong></div>}
              <div className="vc-terms-grand"><small>Amount payable</small><strong>{formatINR(loan.payable)}</strong></div>
              <div><small>Repayment</small><strong>{loan.schedule} · {formatINR(loan.installment)}</strong></div>
              <div><small>Start date</small><strong>{formatDate(loan.startDate)}</strong></div>
              <div><small>End date</small><strong>{formatDate(loan.endDate)}</strong></div>
            </div>

            <p className="vc-note">
              <i className="bi bi-info-circle" />
              {loan.late > 0
                ? <span>The end date has passed, so <strong>{formatINR(loan.dailyLate)}</strong> of late interest is added every day until the entry is closed.</span>
                : loan.rebate > 0
                  ? <span>No pending instalments, so a <strong>{formatINR(loan.rebate)}</strong> interest rebate applies. Missing an instalment removes it.</span>
                  : loan.pending > 0
                    ? <span>{loan.pending} instalment{loan.pending > 1 ? 's were' : ' was'} missed, so the interest rebate no longer applies.</span>
                    : <span>Daily and weekly entries finish within 110 days · monthly entries within 3 months.</span>}
            </p>

            <div className="adm-card-head vc-pay-head">
              <h3><i className="bi bi-list-check" /> Payment history</h3>
              <div className="vc-loan-actions">
                <button type="button" className="adm-btn adm-btn--sm" onClick={openEditLoan} disabled={busy}><i className="bi bi-pencil-square" /> Edit cash entry</button>
                {loan.closed && !loan.settled
                  ? <button type="button" className="adm-btn adm-btn--sm" onClick={reopenLoan} disabled={busy}><i className="bi bi-arrow-counterclockwise" /> Reopen</button>
                  : !loan.closed && <button type="button" className="adm-btn adm-btn--sm adm-btn--success btn-mark" onClick={completeLoan} disabled={busy}><i className="bi bi-check2-circle" /> Mark as completed</button>}
                <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={deleteLoan} disabled={busy}><i className="bi bi-trash3" /> Delete entry</button>
              </div>
            </div>

            <div className="st-toolbar">
              <div className="adm-search">
                <i className="bi bi-search" aria-hidden="true" />
                <input className="adm-input" type="search" placeholder="Search amount, date or note" aria-label="Search payments" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="adm-seg" role="group" aria-label="Filter by method">
                {['all', ...METHODS].map((m) => (
                  <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>{m === 'all' ? 'All' : m}</button>
                ))}
              </div>
              <select className="adm-select st-sort" value={order} onChange={(e) => setOrder(e.target.value)} aria-label="Sort payments">
                <option value="asc">Oldest first</option><option value="desc">Newest first</option>
              </select>
              <button type="button" className="adm-btn" onClick={exportPayments} disabled={!view.length}><i className="bi bi-download" /> Export</button>
              <button type="button" className="adm-btn adm-btn--primary" onClick={openAddPayment} disabled={loan.closed} title={loan.closed ? 'This cash entry is closed' : undefined}>
                <i className="bi bi-plus-lg" /> Add payment
              </button>
            </div>

            {view.length === 0 ? (
              <EmptyState icon="bi-receipt"
                title={loan.payments.length === 0 ? 'No payments yet' : 'No payments match'}
                text={loan.payments.length === 0 ? 'Record the first instalment to start the repayment history.' : 'Try another search or switch the method filter.'}
                action={loan.payments.length === 0
                  ? <button type="button" className="adm-btn adm-btn--primary" onClick={openAddPayment} disabled={loan.closed}><i className="bi bi-plus-lg" /> Add payment</button>
                  : <button type="button" className="adm-btn" onClick={() => { setQuery(''); setMethod('all'); }}>Clear filters</button>} />
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table adm-table--stack">
                  <thead><tr><th>#</th><th>Paid</th><th>Balance after</th><th>Method</th><th>Date</th><th>Time</th><th>Note</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {paginated.map((p) => (
                      <tr key={p.id}>
                        <td data-label="#">{p.no}</td>
                        <td data-label="Paid" className="vc-paid">{formatINR(p.paid)}</td>
                        <td data-label="Balance after" className="vc-bal">{formatINR(p.balanceAfter)}</td>
                        <td data-label="Method"><StatusBadge tone={p.method === 'Cash' ? 'gold' : 'info'} dot={false}><i className={`bi ${p.method === 'Cash' ? 'bi-cash' : p.method === 'Bank Transfer' ? 'bi-bank' : 'bi-credit-card'}`} /> {p.method}</StatusBadge></td>
                        <td data-label="Date">{formatDate(p.date)}</td>
                        <td data-label="Time">{p.time}</td>
                        <td data-label="Note" className="vc-note-cell">{p.note || '—'}</td>
                        <td data-label="">
                          <div className="adm-row-actions">
                            <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => openEditPayment(p)}><i className="bi bi-pencil" /> Edit</button>
                            <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm st-del" onClick={() => deletePayment(p)}><i className="bi bi-trash3" /> Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {view.length > 0 && (
              <Pagination page={safePage} totalPages={totalPages} total={view.length} perPage={perPage}
                onPage={(p) => setPage(Math.min(Math.max(1, p), totalPages))} onPerPage={setPerPage} label="payments" perPageOptions={[5, 10, 25]} />
            )}
          </div>
        </>
      )}

      {/* ---------- DRAWER: add / edit payment ---------- */}
      <Drawer open={!!payForm} onClose={() => setPayForm(null)} side="right"
        icon={payForm?.mode === 'edit' ? 'bi-pencil-square' : 'bi-plus-circle'} title={payForm?.mode === 'edit' ? 'Edit payment' : 'Add payment'}
        footer={(<>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setPayForm(null)}>Cancel</button>
          <button type="submit" form="payment-form" className="adm-btn adm-btn--primary" disabled={payForm?.saving}>
            <i className={`bi ${payForm?.saving ? 'bi-arrow-repeat' : 'bi-check-lg'}`} /> {payForm?.saving ? 'Saving…' : payForm?.mode === 'edit' ? 'Save changes' : 'Add payment'}
          </button>
        </>)}>
        {payForm && loan && (
          <form id="payment-form" className="adm-form" onSubmit={submitPayment} noValidate>
            <Field label="Paid amount (₹)" required error={payForm.errors.paid} hint={`Balance due now: ${formatINR(loan.balance)}`}>
              <input className="adm-input" data-autofocus type="number" min="0.01" step="0.01" inputMode="decimal" value={payForm.values.paid} onChange={setPay('paid')} />
            </Field>
            <Field label="Payment method" required>
              <select className="adm-select" value={payForm.values.method} onChange={setPay('method')}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            </Field>
            <div className="adm-form-grid">
              <Field label="Date" required error={payForm.errors.date}><input className="adm-input" type="date" max={todayISO()} min={loan.startDate} value={payForm.values.date} onChange={setPay('date')} /></Field>
              <Field label="Time" error={payForm.errors.time}><input className="adm-input" type="time" value={payForm.values.time} onChange={setPay('time')} /></Field>
            </div>
            <Field label="Note" error={payForm.errors.note} hint="Optional · visible only to admins">
              <textarea className="adm-textarea" rows={3} maxLength={160} value={payForm.values.note} onChange={setPay('note')} />
            </Field>
          </form>
        )}
      </Drawer>

      {/* ---------- DRAWER: add / edit cash entry ---------- */}
      <Drawer open={!!loanForm} onClose={() => setLoanForm(null)} side="bottom" wide
        icon={loanForm?.mode === 'edit' ? 'bi-pencil-square' : 'bi-cash-stack'} title={loanForm?.mode === 'edit' ? 'Edit cash entry' : 'Add cash entry'}
        footer={(<>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setLoanForm(null)}>Cancel</button>
          <button type="submit" form="loan-form" className="adm-btn adm-btn--primary" disabled={loanForm?.saving}>
            <i className={`bi ${loanForm?.saving ? 'bi-arrow-repeat' : 'bi-check-lg'}`} /> {loanForm?.saving ? 'Saving…' : loanForm?.mode === 'edit' ? 'Save changes' : 'Add cash entry'}
          </button>
        </>)}>
        {loanForm && (
          <form id="loan-form" className="adm-form" onSubmit={submitLoan} noValidate>
            <div className="adm-form-grid">
              <Field label="Amount given (₹)" required error={loanForm.errors.principal}>
                <input className="adm-input" data-autofocus type="number" min="1" step="0.01" value={loanForm.values.principal} onChange={setLoanVal('principal')} />
              </Field>
              <Field label="Total interest (₹)" error={loanForm.errors.interest} hint={`Leave blank to use the default ${defaultPct}%`}>
                <input className="adm-input" type="number" min="0" step="0.01" value={loanForm.values.interest} onChange={setLoanVal('interest')} />
              </Field>
              <Field label="Repayment schedule">
                <select className="adm-select" value={loanForm.values.schedule} onChange={setLoanVal('schedule')}><option>Daily</option><option>Weekly</option><option>Monthly</option></select>
              </Field>
              <Field label="Instalment amount (₹)" required error={loanForm.errors.installment}>
                <input className="adm-input" type="number" min="1" step="0.01" value={loanForm.values.installment} onChange={setLoanVal('installment')} />
              </Field>
              <Field label="Start date" required error={loanForm.errors.startDate}><input className="adm-input" type="date" value={loanForm.values.startDate} onChange={setLoanVal('startDate')} /></Field>
              <Field label="End date" error={loanForm.errors.endDate} hint="Optional · defaults to 110 days (daily/weekly) or 3 months (monthly)">
                <input className="adm-input" type="date" min={loanForm.values.startDate || undefined} value={loanForm.values.endDate} onChange={setLoanVal('endDate')} />
              </Field>
            </div>
            {loanPreview.grand > 0 && (
              <div className="vc-preview">
                <i className="bi bi-calculator" />
                <span>Grand total <strong>{formatINR(loanPreview.grand)}</strong></span>
                <span>Interest <strong>{loanPreview.pct}%</strong>{loanPreview.usingDefault && ' (default)'}</span>
                {loanPreview.count > 0 && <span>About <strong>{loanPreview.count}</strong> instalments</span>}
              </div>
            )}
          </form>
        )}
      </Drawer>

      {/* ---------- MODAL: messages ---------- */}
      <Modal open={msgOpen} onClose={() => setMsgOpen(false)} icon="bi-chat-dots" title={`Messages · ${customer.name}`}
        footer={(
          <div className="vc-composer">
            <div className="vc-composer-row">
              <input className="adm-input" placeholder="Type a message…" aria-label="Message" maxLength={500} value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
              <button type="button" className="adm-btn adm-btn--primary adm-btn--icon" onClick={sendMessage} disabled={!draft.trim() || sending} aria-label="Send message"><i className="bi bi-send" /></button>
            </div>
            <small><i className="bi bi-lock-fill" /> End-to-end encrypted · auto-delete within 24 hours</small>
          </div>
        )}>
        <div className="vc-thread" role="log" aria-live="polite">
          {messages.length === 0 && <p className="adm-help" style={{ textAlign: 'center' }}>No messages in the last 24 hours.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`vc-msg vc-msg--${m.from}`}>
              <p>{m.text}</p>
              <small>{m.from === 'admin' ? 'You' : customer.name} · {fmtMsgTime(m.at)}</small>
            </div>
          ))}
          <div ref={threadEnd} />
        </div>
      </Modal>
    </div>
  );
}