import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';   // keep BEFORE Home.css so our overrides win
import {
  ToastProvider, useToast, Modal, useTick, formatINR, copyText, downloadCSV,
} from '../../UI/UserUI';
import '../../styles/user/Home.css';
import API, { errorMessage } from '../../api';
import { useAuth } from '../../context/Authcontext';
import logo from '../../assets/vk.png';
import QR from '../../assets/QR.png';

import Contact from '../../components/Contact'
import About from '../../components/About'

const PAGE_SIZE = 6;
const DAY = 86400000;
const QUICK_REPLIES = ['When is my next payment due?', 'I’ll pay tomorrow', 'I have paid online'];

const STATUS_META = {
  active: { label: 'Active', tone: 'info' },
  'due-soon': { label: 'Due soon', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'danger' },
  completed: { label: 'Completed', tone: 'success' },
};
const METHOD_ICON = { Cash: 'bi-cash', Online: 'bi-globe2', UPI: 'bi-phone', 'Bank Transfer': 'bi-bank' };

/* =====================================================================
   HELPERS — the server does ALL the money maths; this file only formats.
   Dates arrive as "YYYY-MM-DD" (India calendar).
   ===================================================================== */
const fmtISO = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDate = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortId = (id) => `${id.slice(0, 4)}…${id.slice(-4)}`;
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** server account → what the UI components expect */
const prepare = (a) => ({
  ...a,
  amount: a.principal,
  history: a.payments,
  end: new Date(`${a.endDate}T23:59:59+05:30`),
  start: new Date(`${a.startDate}T00:00:00+05:30`),
  repaymentLabel: `${a.schedule} · ${formatINR(a.installment)}`,
});

/* =====================================================================
   SMALL ISOLATED COMPONENTS (each re-renders alone, never the whole page)
   ===================================================================== */
function LiveClock() {
  const now = useTick(1000);
  const date = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="vk-clock">
      <p className="vk-clock-time vk-num" aria-label={`Time in India: ${time}`}>{time}</p>
      <p className="vk-clock-date">{date}</p>
      <p className="vk-clock-zone"><i className="bi bi-globe-asia-australia" aria-hidden="true" /> India Standard Time</p>
    </div>
  );
}

function LocationCard() {
  const toast = useToast();
  const [state, setState] = useState({ loading: false, place: null, error: null });

  const locate = () => {
    if (!navigator.geolocation) { setState({ loading: false, place: null, error: 'Your browser does not support location.' }); return; }
    setState({ loading: true, place: null, error: null });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        const coordsText = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=en&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          const a = data?.address || {};
          const area = a.city || a.town || a.village || a.suburb || a.county || '';
          const name = [area, a.state].filter(Boolean).join(', ') || coordsText;
          setState({ loading: false, place: name, error: null });
          toast.success(name, { title: 'Location found' });
        } catch {
          setState({ loading: false, place: coordsText, error: null });
          toast.info('Showing coordinates because the place name could not be loaded.');
        }
      },
      (err) => {
        const messages = {
          1: 'Location permission was denied. Allow it in your browser settings to try again.',
          2: 'Your location is unavailable right now.',
          3: 'The location request timed out. Please try again.',
        };
        setState({ loading: false, place: null, error: messages[err.code] || 'Something went wrong while finding your location.' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <div className="vk-loc">
      {state.place ? (
        <p className="vk-loc-result"><i className="bi bi-geo-alt-fill" aria-hidden="true" /> <span>{state.place}</span>
          <button type="button" className="vk-btn vk-btn--ghost vk-btn--sm vk-btn--icon" onClick={() => setState({ loading: false, place: null, error: null })} aria-label="Clear location"><i className="bi bi-x-lg" /></button>
        </p>
      ) : (
        <button type="button" className="vk-btn vk-btn--block" onClick={locate} disabled={state.loading}>
          <i className={`bi ${state.loading ? 'bi-arrow-repeat vk-spin' : 'bi-crosshair'}`} aria-hidden="true" />
          {state.loading ? 'Finding your location…' : 'Show my location'}
        </button>
      )}
      {state.error && <p className="vk-error" role="alert">{state.error}</p>}
    </div>
  );
}

function ProgressRing({ value }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const shown = Math.round(value);
  return (
    <svg viewBox="0 0 120 120" className="vk-ring" role="img" aria-label={`${shown}% repaid`}>
      <circle cx="60" cy="60" r={r} className="vk-ring-track" />
      <circle cx="60" cy="60" r={r} className="vk-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 60 60)" />
      <text x="60" y="60" textAnchor="middle" className="vk-ring-value">{shown}%</text>
      <text x="60" y="80" textAnchor="middle" className="vk-ring-sub">repaid</text>
    </svg>
  );
}

/* Real countdown to the END date; counts UP once it has passed. */
function Countdown({ acc }) {
  const now = useTick(1000);
  if (acc.status === 'completed') {
    return (
      <div className="vk-count vk-count--done">
        <i className="bi bi-patch-check-fill" aria-hidden="true" />
        <div><strong>Fully paid</strong><p>This account is closed. Thank you!</p></div>
      </div>
    );
  }
  const overdue = now > acc.end;
  const diff = Math.abs(acc.end - now);
  const parts = [
    ['Days', Math.floor(diff / DAY)],
    ['Hours', Math.floor((diff % DAY) / 3600000)],
    ['Minutes', Math.floor((diff % 3600000) / 60000)],
    ['Seconds', Math.floor((diff % 60000) / 1000)],
  ];
  return (
    <div className={`vk-count ${overdue ? 'vk-count--late' : ''}`}>
      <p className="vk-count-title">{overdue ? 'Overdue by' : 'Time left until end date'}</p>
      <div className="vk-count-grid" role="timer" aria-live="off">
        {parts.map(([label, v]) => (
          <div key={label} className="vk-count-cell">
            <span className="vk-count-num vk-num">{String(v).padStart(2, '0')}</span>
            <span className="vk-count-label">{label}</span>
          </div>
        ))}
      </div>
      <p className="vk-count-range">
        {fmtISO(acc.startDate)} → {fmtISO(acc.endDate)}
        {overdue && acc.dailyLate > 0 && <> · late interest adds {formatINR(acc.dailyLate)} a day</>}
      </p>
    </div>
  );
}

/* =====================================================================
   CHAT (hook + modal) — polls every 8 s while open, every 60 s otherwise
   ===================================================================== */
function useChat(open) {
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  const refresh = useCallback(async () => {
    try {
      const { data } = await API.get('/user/messages');
      setMessages(data.items);
      if (openRef.current && data.unread > 0) { await API.post('/user/messages/read'); setUnread(0); }
      else setUnread(data.unread);
    } catch { /* silent: background refresh */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const t = setInterval(refresh, open ? 8000 : 60000);
    return () => clearInterval(t);
  }, [open, refresh]);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const send = async (text) => {
    const msg = text.trim();
    if (!msg || sending) return false;
    setSending(true);
    try {
      const { data } = await API.post('/user/messages', { text: msg });
      setMessages((m) => [...m, data]);
      return true;
    } catch (err) { toast.error(errorMessage(err, 'Your message could not be sent.')); return false; }
    finally { setSending(false); }
  };
  return { messages, unread, sending, send };
}

function ChatModal({ open, onClose, chat }) {
  const [draft, setDraft] = useState('');
  const end = useRef(null);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'end' }); }, [chat.messages.length, open]);

  const submit = async (text = draft) => { if (await chat.send(text)) setDraft(''); };

  return (
    <Modal
      open={open} onClose={onClose} icon="bi-chat-dots" title="Chat with us"
      footer={(
        <div className="vk-composer">
          <div className="vk-quick" aria-label="Quick replies">
            {QUICK_REPLIES.map((q) => <button key={q} type="button" className="vk-chip" onClick={() => submit(q)} disabled={chat.sending}>{q}</button>)}
          </div>
          <div className="vk-composer-row">
            <input className="vk-input" placeholder="Type a message…" aria-label="Message" data-autofocus maxLength={500}
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
            <button type="button" className="vk-btn vk-btn--primary vk-btn--icon" onClick={() => submit()} disabled={!draft.trim() || chat.sending} aria-label="Send message"><i className="bi bi-send" /></button>
          </div>
          <small>Your messages are end to end encrypted and auto-delete within each 24 hrs.</small>
        </div>
      )}
    >
      <div className="vk-chat-head"><img src={logo} alt="" /><div><strong>VK</strong><span className="vk-online">Online</span></div></div>
      <div className="vk-thread" role="log" aria-live="polite">
        {chat.messages.length === 0 && <p className="vk-muted" style={{ textAlign: 'center' }}>No messages yet. Say hello!</p>}
        {chat.messages.map((m) => (
          <div key={m.id} className={`vk-msg vk-msg--${m.from}`}><p>{m.text}</p><small>{fmtTime(m.at)}</small></div>
        ))}
        <div ref={end} />
      </div>
    </Modal>
  );
}

/* =====================================================================
   SHARED HERO PIECES
   ===================================================================== */
function Dock({ onPay, onChat, unread }) {
  return (
    <div className="vk-dock" role="group" aria-label="Quick actions">
      {onPay && <button type="button" className="vk-btn vk-btn--primary" onClick={onPay}><i className="bi bi-lightning-charge-fill" aria-hidden="true" /> Pay now</button>}
      <button type="button" className="vk-btn vk-btn--dock" onClick={onChat}>
        <i className="bi bi-chat-dots" aria-hidden="true" /> Chat with us
        {unread > 0 && <span className="vk-unread" aria-label={`${unread} unread`}>{unread}</span>}
      </button>
    </div>
  );
}

const useGreeting = () => useMemo(() => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}, []);

/* =====================================================================
   CONTENT — a customer with at least one cash entry
   ===================================================================== */
function HomeContent({ name, rawAccounts, summary, config, onSignOut, onRefresh, refreshing, modal, setModal, chat }) {
  const toast = useToast();
  const greeting = useGreeting();
  const today = useMemo(() => new Date(), []);

  const accounts = useMemo(() => rawAccounts.map(prepare), [rawAccounts]);
  const [selectedId, setSelectedId] = useState(accounts[0].id);
  const active = accounts.find((a) => a.id === selectedId) || accounts[0];
  const detailRef = useRef(null);
  const totals = summary;

  /* ---------- account list controls ---------- */
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('end');
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => { setVisible(PAGE_SIZE); }, [query, filter, sort]);

  const counts = useMemo(() => {
    const c = { all: accounts.length, active: 0, 'due-soon': 0, overdue: 0, completed: 0 };
    accounts.forEach((a) => { c[a.status] += 1; });
    return c;
  }, [accounts]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/[₹,\s]/g, '');
    const sorters = {
      end: (a, b) => a.end - b.end,
      amount: (a, b) => b.amount - a.amount,
      balance: (a, b) => b.balance - a.balance,
      progress: (a, b) => b.progress - a.progress,
    };
    return accounts
      .filter((a) => (filter === 'all' || a.status === filter) && (!q || a.id.toLowerCase().includes(q) || String(a.amount).includes(q)))
      .sort(sorters[sort]);
  }, [accounts, query, filter, sort]);

  const selectAccount = (id) => {
    setSelectedId(id);
    setHistoryDesc(true);
    setCalDate(null);
    if (window.matchMedia('(max-width: 900px)').matches) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  };

  /* ---------- history table ---------- */
  const [historyDesc, setHistoryDesc] = useState(true);
  const rows = useMemo(() => (historyDesc ? [...active.history].reverse() : active.history), [active, historyDesc]);

  const exportStatement = () => {
    downloadCSV(`statement-${active.id}.csv`, active.history.map((h) => ({
      No: h.no, Paid: h.paid, 'Balance after': h.balanceAfter, Method: h.method, Date: h.date, Time: h.time, Note: h.note,
    })));
    toast.success('Your statement was downloaded as a CSV file.', { title: 'Statement ready' });
  };
  const copyId = async () => {
    (await copyText(active.id)) ? toast.success('Account ID copied.', { duration: 2000 }) : toast.error('Could not copy the ID.');
  };

  /* ---------- calendar ---------- */
  const [calDate, setCalDate] = useState(null);
  const [calStart, setCalStart] = useState(today);
  const paidDays = useMemo(() => {
    const m = new Map();
    active.history.forEach((h) => m.set(h.date, [...(m.get(h.date) || []), h]));
    return m;
  }, [active]);

  const tileClass = ({ date, view }) => {
    if (view !== 'month') return null;
    const k = toKey(date);
    return [paidDays.has(k) && 'vk-tile-paid', k === active.endDate && 'vk-tile-end', k === active.startDate && 'vk-tile-start'].filter(Boolean).join(' ') || null;
  };

  const dayEvents = useMemo(() => {
    if (!calDate) return null;
    const k = toKey(calDate);
    const ev = [];
    if (k === active.startDate) ev.push({ icon: 'bi-flag', text: 'Account started' });
    (paidDays.get(k) || []).forEach((h) => ev.push({ icon: 'bi-check-circle-fill', text: `${formatINR(h.paid)} paid via ${h.method} at ${h.time}`, good: true }));
    if (k === active.nextDue) ev.push({ icon: 'bi-calendar-event', text: `Next instalment due: ${formatINR(active.nextAmount)}` });
    if (k === active.endDate) ev.push({ icon: 'bi-calendar-x', text: 'Account end date', bad: true });
    return ev;
  }, [calDate, paidDays, active]);

  /* ---------- Pay Now ---------- */
  const [payTab, setPayTab] = useState('upi');
  const [payAmount, setPayAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const suggested = Math.min(active.nextAmount > 0 ? active.nextAmount : active.balance, active.balance);

  const openPay = () => { setPayAmount(suggested ? String(suggested) : ''); setPayTab('upi'); setModal('pay'); };
  const amountNum = Number(payAmount);
  const amountError = !payAmount ? '' : !(amountNum > 0) ? 'Enter an amount greater than zero.' : amountNum > active.balance ? `That is more than your balance (${formatINR(active.balance)}).` : '';
  const upiLink = `upi://pay?pa=${encodeURIComponent(config.upiId)}&pn=${encodeURIComponent(config.payeeName)}${amountNum > 0 && !amountError ? `&am=${amountNum}` : ''}&cu=INR&tn=${encodeURIComponent(`Payment ${active.id}`)}`;

  const copyUPI = async () => {
    if (await copyText(config.upiId)) {
      setCopied(true);
      toast.success(`${config.upiId} copied.`, { duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } else toast.error('Could not copy. Please select and copy the ID manually.');
  };

  // lets Footer.css keep clear of the floating dock on phones
  useEffect(() => {
    document.body.classList.add('vk-has-dock');
    return () => document.body.classList.remove('vk-has-dock');
  }, []);

  const meta = STATUS_META[active.status];
  const lateExample = (100 / 110).toFixed(2);

  /* =====================================================================
     RENDER
     ===================================================================== */
  return (
    <section className="vk-home vk-scope" id="home">
      <header className="vk-hero">
        <div className="vk-hero-main">
          <div className="vk-hero-top">
            <p className="vk-kicker">Hi, I’m VK</p>
            <button type="button" className="vk-btn vk-btn--ghost vk-btn--sm" onClick={onSignOut}><i className="bi bi-box-arrow-right" aria-hidden="true" /> Sign out</button>
          </div>
          <h1 className="vk-h1">{greeting}, <span className="notranslate" translate="no">{name}</span></h1>
          <p className="vk-lead">
            {totals.overdue > 0
              ? `${totals.overdue} of your ${accounts.length} accounts ${totals.overdue === 1 ? 'is' : 'are'} past the end date. Review them below.`
              : totals.dueSoon > 0
                ? `${totals.dueSoon} ${totals.dueSoon === 1 ? 'account ends' : 'accounts end'} within a week.`
                : 'All your accounts are on track. Nice work.'}
          </p>
          <div className="vk-card vk-widget"><LiveClock /><hr className="vk-rule" /><LocationCard /></div>
        </div>

        <div className="vk-card vk-cal">
          <div className="vk-card-head">
            <h2 className="vk-h2"><i className="bi bi-calendar3" aria-hidden="true" /> Payment calendar</h2>
            <div className="vk-cal-jump">
              <button type="button" className="vk-btn vk-btn--ghost vk-btn--sm" onClick={() => { setCalStart(new Date()); setCalDate(new Date()); }}>Today</button>
              <button type="button" className="vk-btn vk-btn--ghost vk-btn--sm" onClick={() => { setCalStart(active.end); setCalDate(active.end); }}>End date</button>
            </div>
          </div>
          <Calendar
            value={calDate} onChange={setCalDate} activeStartDate={calStart}
            onActiveStartDateChange={({ activeStartDate }) => activeStartDate && setCalStart(activeStartDate)}
            tileClassName={tileClass} locale="en-IN" next2Label={null} prev2Label={null}
          />
          <ul className="vk-legend" aria-label="Calendar legend">
            <li><span className="vk-dot vk-dot--paid" /> Payment made</li>
            <li><span className="vk-dot vk-dot--end" /> End date</li>
            <li><span className="vk-dot vk-dot--start" /> Start date</li>
          </ul>
          <div className="vk-day" aria-live="polite">
            {!calDate ? <p className="vk-muted">Select a day to see activity for account {shortId(active.id)}.</p> : (
              <>
                <p className="vk-day-title">{fmtDate(calDate)}</p>
                {dayEvents.length === 0 ? <p className="vk-muted">No activity on this day.</p>
                  : <ul>{dayEvents.map((e) => <li key={e.text} className={e.good ? 'is-good' : e.bad ? 'is-bad' : ''}><i className={`bi ${e.icon}`} aria-hidden="true" /> {e.text}</li>)}</ul>}
              </>
            )}
          </div>
        </div>
      </header>

      <section className="vk-overview" aria-label="Overview of all accounts">
        <div className="vk-kpi">
          <span className="vk-kpi-icon vk-kpi-icon--gold"><i className="bi bi-cash-stack" aria-hidden="true" /></span>
          <div><p>Total borrowed</p><strong className="vk-num vk-gold">{formatINR(totals.borrowed)}</strong></div>
        </div>
        <div className="vk-kpi">
          <span className="vk-kpi-icon vk-kpi-icon--green"><i className="bi bi-check2-circle" aria-hidden="true" /></span>
          <div><p>Total repaid</p><strong className="vk-num">{formatINR(totals.paid)}</strong><small>{totals.repaidPct}% of everything payable</small></div>
        </div>
        <div className="vk-kpi">
          <span className="vk-kpi-icon vk-kpi-icon--red"><i className="bi bi-wallet2" aria-hidden="true" /></span>
          <div><p>Outstanding</p><strong className="vk-num vk-red">{formatINR(totals.outstanding)}</strong></div>
        </div>
        <div className="vk-kpi">
          <span className={`vk-kpi-icon ${totals.overdue ? 'vk-kpi-icon--red' : 'vk-kpi-icon--green'}`}><i className={`bi ${totals.overdue ? 'bi-exclamation-triangle' : 'bi-shield-check'}`} aria-hidden="true" /></span>
          <div><p>Needs attention</p><strong className="vk-num">{totals.overdue + totals.dueSoon || 'None'}</strong><small>{totals.overdue} overdue · {totals.dueSoon} due soon</small></div>
        </div>
      </section>

      <section className="vk-section" aria-labelledby="accounts-h">
        <div className="vk-section-head">
          <div>
            <h2 className="vk-h2 vk-h2--lg" id="accounts-h">Your payment accounts</h2>
            <p className="vk-muted">Select an account to see its countdown, terms and history.</p>
          </div>
          <button type="button" className="vk-btn vk-btn--sm" onClick={onRefresh} disabled={refreshing}>
            <i className={`bi bi-arrow-repeat ${refreshing ? 'vk-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
        </div>

        <div className="vk-toolbar">
          <div className="vk-search">
            <i className="bi bi-search" aria-hidden="true" />
            <input className="vk-input" type="search" placeholder="Search by ID or amount" aria-label="Search accounts" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="vk-seg" role="group" aria-label="Filter by status">
            {['all', 'active', 'due-soon', 'overdue', 'completed'].map((s) => (
              <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
                {s === 'all' ? 'All' : STATUS_META[s].label}<span className="vk-seg-count">{counts[s]}</span>
              </button>
            ))}
          </div>
          <select className="vk-input vk-select vk-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort accounts">
            <option value="end">Ending soonest</option><option value="amount">Largest amount</option>
            <option value="balance">Highest balance</option><option value="progress">Most repaid</option>
          </select>
        </div>

        {list.length === 0 ? (
          <div className="vk-empty"><i className="bi bi-search" aria-hidden="true" /><h3>No accounts match</h3><p>Try a different search or show all statuses.</p>
            <button type="button" className="vk-btn" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button></div>
        ) : (
          <>
            <div className="vk-grid">
              {list.slice(0, visible).map((a) => {
                const m = STATUS_META[a.status];
                const daysLeft = Math.ceil((a.end - today) / DAY);
                return (
                  <button key={a.id} type="button" className={`vk-acct ${a.id === active.id ? 'is-active' : ''}`} aria-pressed={a.id === active.id} onClick={() => selectAccount(a.id)}>
                    <span className="vk-acct-top">
                      <span className="vk-acct-id" title={a.id}>{shortId(a.id)}</span>
                      <span className={`vk-badge vk-badge--dot vk-badge--${m.tone}`}>{m.label}</span>
                    </span>
                    <span className="vk-acct-amount vk-num">{formatINR(a.amount)}</span>
                    <span className="vk-acct-sub">+ {formatINR(a.interest)} interest · {a.repaymentLabel}</span>
                    <span className="vk-acct-bar" aria-hidden="true"><span style={{ width: `${a.progress}%` }} /></span>
                    <span className="vk-acct-foot">
                      <span>{Math.round(a.progress)}% repaid</span>
                      <span>{a.status === 'completed' ? 'Closed' : daysLeft >= 0 ? `${daysLeft} days left` : `${Math.abs(daysLeft)} days late`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {list.length > visible && (
              <div className="vk-more">
                <button type="button" className="vk-btn" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, list.length - visible)} more <i className="bi bi-chevron-down" aria-hidden="true" />
                </button>
                <span className="vk-muted">Showing {visible} of {list.length}</span>
              </div>
            )}
          </>
        )}
      </section>

      <section className="vk-section vk-detail" ref={detailRef} aria-labelledby="detail-h">
        <div className="vk-detail-head">
          <div>
            <h2 className="vk-h2 vk-h2--lg" id="detail-h">Account details</h2>
            <p className="vk-detail-id">
              <span className="vk-mono">{active.id}</span>
              <button type="button" className="vk-btn vk-btn--ghost vk-btn--icon vk-btn--sm" onClick={copyId} aria-label="Copy account ID"><i className="bi bi-copy" /></button>
              <span className={`vk-badge vk-badge--dot vk-badge--${meta.tone}`}>{meta.label}</span>
            </p>
          </div>
        </div>

        <div className="vk-detail-top">
          <div className="vk-card vk-ring-card">
            <ProgressRing value={active.progress} />
            <dl className="vk-ring-stats">
              <div><dt>Paid so far</dt><dd className="vk-num">{formatINR(active.paid)}</dd></div>
              <div><dt>Balance due</dt><dd className="vk-num vk-red">{formatINR(active.balance)}</dd></div>
              {active.status !== 'completed' && (
                <div>
                  <dt>{active.nextDue ? 'Next instalment' : 'Due now'}</dt>
                  <dd className="vk-num">{formatINR(active.nextDue ? active.nextAmount : active.balance)}{active.nextDue && ` · ${fmtISO(active.nextDue)}`}</dd>
                </div>
              )}
              {active.status !== 'completed' && active.arrears > 0 && (
                <div><dt>Behind schedule by</dt><dd className="vk-num vk-red">{formatINR(active.arrears)}</dd></div>
              )}
            </dl>
          </div>
          <div className="vk-card"><Countdown acc={active} /></div>
        </div>

        <div className="vk-facts">
          <div><small>Amount given</small><strong className="vk-num vk-gold">{formatINR(active.amount)}</strong></div>
          <div><small>Interest ({active.interestPct}%)</small><strong className="vk-num">{formatINR(active.interest)}</strong></div>
          <div><small>Grand total</small><strong className="vk-num">{formatINR(active.grand)}</strong></div>
          {active.late > 0 && <div><small>Late interest</small><strong className="vk-num vk-red">+{formatINR(active.late)}</strong></div>}
          {active.rebate > 0 && <div><small>Interest rebate</small><strong className="vk-num vk-green">−{formatINR(active.rebate)}</strong></div>}
          <div><small>Amount payable</small><strong className="vk-num vk-gold">{formatINR(active.payable)}</strong></div>
          <div><small>Repayment</small><strong>{active.repaymentLabel}</strong></div>
          <div><small>Start date</small><strong>{fmtISO(active.startDate)}</strong></div>
          <div><small>End date</small><strong>{fmtISO(active.endDate)}</strong></div>
        </div>

        {active.rebate > 0 && active.status !== 'completed' && (
          <p className="vk-callout vk-callout--good"><i className="bi bi-stars" aria-hidden="true" /> You have no pending instalments, so your interest is reduced by {formatINR(active.rebate)}. Stay on schedule to keep it.</p>
        )}
        {active.pending > 0 && active.status !== 'completed' && active.rebate === 0 && active.late === 0 && (
          <p className="vk-callout"><i className="bi bi-info-circle" aria-hidden="true" /> {active.pending} instalment{active.pending > 1 ? 's were' : ' was'} missed, so the interest reduction no longer applies.</p>
        )}

        <div className="vk-card">
          <div className="vk-card-head">
            <h3 className="vk-h2"><i className="bi bi-clock-history" aria-hidden="true" /> Payment history</h3>
            <div className="vk-card-tools">
              <button type="button" className="vk-btn vk-btn--sm" onClick={() => setHistoryDesc((v) => !v)}>
                <i className={`bi ${historyDesc ? 'bi-sort-down' : 'bi-sort-up'}`} aria-hidden="true" /> {historyDesc ? 'Newest first' : 'Oldest first'}
              </button>
              <button type="button" className="vk-btn vk-btn--sm" onClick={exportStatement} disabled={!active.history.length}><i className="bi bi-download" aria-hidden="true" /> Download CSV</button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="vk-empty"><i className="bi bi-receipt" aria-hidden="true" /><h3>No payments yet</h3><p>Your first payment will appear here once we record it.</p></div>
          ) : (
            <div className="vk-table-wrap">
              <table className="vk-table">
                <caption className="vk-sr-only">Payment history for account {active.id}</caption>
                <thead><tr><th scope="col">#</th><th scope="col">Paid</th><th scope="col">Balance after</th><th scope="col">Method</th><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Note</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label="#">{String(r.no).padStart(2, '0')}</td>
                      <td data-label="Paid" className="vk-paid vk-num">{formatINR(r.paid)}</td>
                      <td data-label="Balance after" className="vk-num">{formatINR(r.balanceAfter)}</td>
                      <td data-label="Method"><span className="vk-badge vk-badge--muted"><i className={`bi ${METHOD_ICON[r.method] || 'bi-wallet2'}`} aria-hidden="true" /> {r.method}</span></td>
                      <td data-label="Date">{fmtISO(r.date)}</td>
                      <td data-label="Time">{r.time}</td>
                      <td data-label="Note">{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td data-label="" colSpan={2} className="vk-total-label">Total paid</td>
                    <td data-label="Total paid" className="vk-paid vk-num">{formatINR(active.paid)}</td>
                    <td data-label="" colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="vk-card vk-terms" id="terms" aria-labelledby="terms-h">
        <h2 className="vk-h2 vk-h2--lg" id="terms-h"><i className="bi bi-journal-text" aria-hidden="true" /> Terms and conditions</h2>
        <ol>{config.terms.map((t) => <li key={t}>{t}</li>)}</ol>
        <details className="vk-details">
          <summary>How interest grows after the end date</summary>
          <p>
            When the countdown ends, interest is added every day until the account is closed. Each late day adds
            your total interest ÷ the total number of days of the plan. Example: ₹1,000 given with ₹100 interest over
            110 days → ₹100 ÷ 110 = ₹{lateExample} added per day.
          </p>
        </details>
        <p className="vk-thanks">Thank you for being with us.</p>
      </section>

      {!modal && <Dock onPay={openPay} onChat={() => setModal('chat')} unread={chat.unread} />}

      {/* ============ PAY MODAL ============ */}
      <Modal open={modal === 'pay'} onClose={() => setModal(null)} icon="bi-credit-card-2-front" title="Pay now">
        {active.balance <= 0 ? (
          <div className="vk-empty"><i className="bi bi-patch-check-fill" aria-hidden="true" /><h3>Nothing to pay</h3><p>This account is fully paid.</p></div>
        ) : (
          <div className="vk-pay">
            <p className="vk-pay-for">Paying for <span className="vk-mono">{shortId(active.id)}</span> · balance <strong>{formatINR(active.balance)}</strong></p>

            <label className="vk-label" htmlFor="pay-amount">Amount (₹)</label>
            <input id="pay-amount" data-autofocus className="vk-input vk-num" type="number" inputMode="decimal" min="1" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} aria-invalid={!!amountError} aria-describedby="pay-msg" />
            <div className="vk-pay-chips">
              {active.nextAmount > 0 && active.nextAmount < active.balance && (
                <button type="button" className="vk-chip" onClick={() => setPayAmount(String(active.nextAmount))}>Next instalment {formatINR(active.nextAmount)}</button>
              )}
              <button type="button" className="vk-chip" onClick={() => setPayAmount(String(active.balance))}>Full balance {formatINR(active.balance)}</button>
            </div>
            <p id="pay-msg" className={amountError ? 'vk-error' : 'vk-hint'}>{amountError || 'Pick a suggestion or type your own amount. Your balance updates once we record your payment.'}</p>

            <div className="vk-seg vk-pay-tabs" role="tablist" aria-label="Payment method">
              <button type="button" role="tab" aria-selected={payTab === 'upi'} onClick={() => setPayTab('upi')}><i className="bi bi-phone" aria-hidden="true" /> UPI ID</button>
              <button type="button" role="tab" aria-selected={payTab === 'qr'} onClick={() => setPayTab('qr')}><i className="bi bi-qr-code" aria-hidden="true" /> QR code</button>
            </div>

            {payTab === 'upi' ? (
              <div className="vk-pay-panel" role="tabpanel">
                <div className="vk-upi">
                  <span className="vk-mono">{config.upiId}</span>
                  <button type="button" className="vk-btn vk-btn--sm" onClick={copyUPI}><i className={`bi ${copied ? 'bi-check2-all' : 'bi-copy'}`} aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}</button>
                </div>
                <a className={`vk-btn vk-btn--gold vk-btn--block ${amountError || !payAmount ? 'is-disabled' : ''}`} href={amountError || !payAmount ? undefined : upiLink} aria-disabled={!!amountError || !payAmount}>
                  <i className="bi bi-box-arrow-up-right" aria-hidden="true" /> Open in UPI app
                </a>
                <p className="vk-hint">The button works on phones with a UPI app installed.</p>
              </div>
            ) : (
              <div className="vk-pay-panel" role="tabpanel">
                <div className="vk-qr"><img src={QR} alt="Payment QR code" /><p>Scan with GPay, PhonePe, Paytm or any UPI app.</p></div>
                <p className="vk-hint">This QR doesn’t include an amount. Enter {payAmount ? formatINR(amountNum) : 'the amount'} in your app.</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}

/* =====================================================================
   PAGE — loads data, then shows content / empty / error states
   ===================================================================== */
function HomePage() {
  const toast = useToast();
  const { session, logout } = useAuth();
  const greeting = useGreeting();

  const [state, setState] = useState({ loading: true, refreshing: false, error: '', data: null });
  const [modal, setModal] = useState(null); // 'pay' | 'chat'
  const chat = useChat(modal === 'chat');

  const load = useCallback(async (silent = false) => {
    setState((s) => ({ ...s, loading: !silent && !s.data, refreshing: silent, error: '' }));
    try {
      const [acc, cfg] = await Promise.all([API.get('/user/accounts'), API.get('/user/config')]);
      setState({ loading: false, refreshing: false, error: '', data: { ...acc.data, config: cfg.data } });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, refreshing: false, error: errorMessage(err, 'Could not load your accounts.') }));
      if (silent) toast.error(errorMessage(err, 'Could not refresh your accounts.'));
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  // fresh numbers whenever the customer comes back to this tab
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) load(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const { loading, refreshing, error, data } = state;
  const name = data?.user?.name || session?.user?.name || 'there';

  if (loading) {
    return (
      <section className="vk-home vk-scope" aria-busy="true" aria-label="Loading your accounts">
        <div className="vk-skel vk-skel--hero" /><div className="vk-skel-row"><div className="vk-skel" /><div className="vk-skel" /><div className="vk-skel" /><div className="vk-skel" /></div><div className="vk-skel vk-skel--tall" />
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="vk-home vk-scope">
        <div className="vk-empty" role="alert"><i className="bi bi-wifi-off" aria-hidden="true" /><h3>We couldn’t load your accounts</h3><p>{error}</p>
          <div className="vk-pay-chips"><button type="button" className="vk-btn vk-btn--primary" onClick={() => load()}>Try again</button>
            <button type="button" className="vk-btn" onClick={logout}>Sign out</button></div></div>
      </section>
    );
  }

  return (
    <>
      {data.accounts.length === 0 ? (
        <section className="vk-home vk-scope" id="home">
          <header className="vk-hero">
            <div className="vk-hero-main">
              <div className="vk-hero-top">
                <p className="vk-kicker">Hi, I’m VK</p>
                <button type="button" className="vk-btn vk-btn--ghost vk-btn--sm" onClick={logout}><i className="bi bi-box-arrow-right" aria-hidden="true" /> Sign out</button>
              </div>
              <h1 className="vk-h1">{greeting}, <span className="notranslate" translate="no">{name}</span></h1>
              <p className="vk-lead">You don’t have any cash entries yet. They will show up here as soon as we add one for you.</p>
              <div className="vk-card vk-widget"><LiveClock /><hr className="vk-rule" /><LocationCard /></div>
            </div>
          </header>
          <div className="vk-empty"><i className="bi bi-cash-stack" aria-hidden="true" /><h3>Nothing to show yet</h3>
            <p>Questions? Send us a message and we will help.</p>
            <button type="button" className="vk-btn vk-btn--primary" onClick={() => setModal('chat')}><i className="bi bi-chat-dots" aria-hidden="true" /> Chat with us</button></div>
          <section className="vk-card vk-terms" id="terms"><h2 className="vk-h2 vk-h2--lg"><i className="bi bi-journal-text" aria-hidden="true" /> Terms and conditions</h2>
            <ol>{data.config.terms.map((t) => <li key={t}>{t}</li>)}</ol></section>
        </section>
      ) : (
        <HomeContent
          name={name} rawAccounts={data.accounts} summary={data.summary} config={data.config}
          onSignOut={logout} onRefresh={() => load(true)} refreshing={refreshing}
          modal={modal} setModal={setModal} chat={chat}
        />
      )}
      <ChatModal open={modal === 'chat'} onClose={() => setModal(null)} chat={chat} />
    </>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <HomePage />
      <About/>
      <Contact/>
    </ToastProvider>
  );
}