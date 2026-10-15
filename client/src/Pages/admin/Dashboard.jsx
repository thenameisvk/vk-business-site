import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

import '../../styles/admin/Dashboard.css';
import API, { errorMessage, fieldErrors } from '../../api';
import ErrorBoundary from '../../components/ErrorBoundary';
import {
  AdminUIProvider, useToast, useConfirm, Modal, Field, StatusBadge, EmptyState,
  Avatar, formatINR, formatDate, todayISO, useDebouncedValue,
} from '../../UI/AdminUI';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);
ChartJS.defaults.font.family = '"Inter", system-ui, sans-serif';
ChartJS.defaults.color = '#b0b0bd';

/* =====================================================================
   CONSTANTS
   ===================================================================== */
const RANGES = { month: 'This month', quarter: 'Last 3 months', year: 'This year' };
const MIX = [
  { key: 'completed', label: 'Completed', color: '#22d38a' },
  { key: 'active',    label: 'On track',  color: '#5aa9ff' },
  { key: 'dueSoon',   label: 'Ending soon', color: '#ffb020' },
  { key: 'overdue',   label: 'Overdue',   color: '#ff0033' },
];
const USER_TONE = { active: 'success', pending: 'warning', blocked: 'danger' };
const EVENT_KINDS = {
  meeting:  { label: 'Meeting',  backgroundColor: '#ff0033', borderColor: '#ff0033', textColor: '#fff' },
  review:   { label: 'Review',   backgroundColor: '#d4af37', borderColor: '#d4af37', textColor: '#000' },
  reminder: { label: 'Reminder', backgroundColor: '#3a3a48', borderColor: '#55556a', textColor: '#fff' },
};
const NET_TYPES = {
  wifi: 'Wi-Fi', ethernet: 'Ethernet', cellular: 'Cellular',
  bluetooth: 'Bluetooth', wimax: 'WiMAX', none: 'Offline',
  other: 'Other', unknown: 'Unknown',
};

/** instant → India date/time (matches the server's IST calendar) */
const istParts = (d) => {
  const s = new Date(d.getTime() + 19800000).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
};
const msgTime = (iso) => {
  const d = new Date(iso);
  return istParts(d).date === istParts(new Date()).date
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

/* =====================================================================
   NORMALIZERS — make sure no shape mismatch can ever crash the UI
   ===================================================================== */
const EMPTY_MIX = { completed: 0, active: 0, dueSoon: 0, overdue: 0 };

function normalizeOverview(data) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const trend = (v) => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    users: {
      value: num(data?.users?.value),
      trend: trend(data?.users?.trend),
      note:  data?.users?.note  || 'vs last month',
    },
    revenue: {
      value: num(data?.revenue?.value),
      trend: trend(data?.revenue?.trend),
      note:  data?.revenue?.note  || 'vs last month',
    },
    balance: {
      value: num(data?.balance?.value),
      trend: trend(data?.balance?.trend),
      note:  data?.balance?.note  || 'vs last month',
    },
    statusMix: {
      completed: num(data?.statusMix?.completed),
      active:    num(data?.statusMix?.active),
      dueSoon:   num(data?.statusMix?.dueSoon),
      overdue:   num(data?.statusMix?.overdue),
    },
  };
}

/* =====================================================================
   PAGE
   ===================================================================== */
function DashboardPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  /* ---------- overview (stat cards + status mix) ---------- */
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState('');

  const loadOverview = useCallback(async () => {
    try {
      const { data } = await API.get('/dashboard/overview');
      setOverview(normalizeOverview(data));
      setOverviewError('');
    } catch (err) {
      setOverviewError(errorMessage(err, 'Could not load the dashboard numbers.'));
    }
  }, []);

  /* ---------- chart ---------- */
  const [range, setRange] = useState('month');
  const [chart, setChart] = useState(null);

  useEffect(() => {
    let alive = true;
    setChart(null); // reset on range change so skeleton shows
    API.get('/dashboard/chart', { params: { range } })
      .then(({ data }) => {
        if (!alive) return;
        // Defensive: ensure arrays exist
        setChart({
          labels:    Array.isArray(data?.labels)    ? data.labels    : [],
          given:     Array.isArray(data?.given)     ? data.given     : [],
          collected: Array.isArray(data?.collected) ? data.collected : [],
        });
      })
      .catch((err) => {
        if (!alive) return;
        setChart({ labels: [], given: [], collected: [] });
        toast.error(errorMessage(err, 'Could not load the chart.'));
      });
    return () => { alive = false; };
  }, [range, toast]);

  const barData = useMemo(() => ({
    labels: chart?.labels || [],
    datasets: [
      {
        label: 'Cash given',
        data: chart?.given || [],
        backgroundColor: 'rgba(255,255,255,0.22)',
        hoverBackgroundColor: 'rgba(255,255,255,0.4)',
        borderRadius: 6,
        maxBarThickness: 36,
      },
      {
        label: 'Collected',
        data: chart?.collected || [],
        backgroundColor: 'rgba(255, 0, 51, 0.85)',
        hoverBackgroundColor: '#ff2a55',
        borderRadius: 6,
        maxBarThickness: 36,
      },
    ],
  }), [chart]);

  const tooltipStyle = {
    backgroundColor: '#15151c',
    borderColor: '#363644',
    borderWidth: 1,
    titleColor: '#fff',
    bodyColor: '#d6d6e0',
    padding: 10,
    cornerRadius: 8,
  };

  const barOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: { color: '#d6d6e0', usePointStyle: true, boxWidth: 8 },
      },
      tooltip: {
        ...tooltipStyle,
        callbacks: { label: (c) => ` ${c.dataset.label}: ${formatINR(c.parsed.y)}` },
      },
    },
    scales: {
      x: { ticks: { color: '#9a9aa8' }, grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: {
          color: '#9a9aa8',
          callback: (v) => (v >= 1000 ? `₹${v / 1000}k` : `₹${v}`),
        },
        grid: { color: 'rgba(255,255,255,0.06)' },
      },
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- status mix (SAFE) ---------- */
  const mixTotal = useMemo(() => {
    const mix = overview?.statusMix;
    if (!mix || typeof mix !== 'object') return 0;
    return MIX.reduce((s, m) => s + (Number(mix[m.key]) || 0), 0);
  }, [overview]);

  const pieData = useMemo(() => {
    const mix = overview?.statusMix || EMPTY_MIX;
    return {
      labels: MIX.map((m) => m.label),
      datasets: [{
        data: MIX.map((m) => Number(mix[m.key]) || 0),
        backgroundColor: MIX.map((m) => m.color),
        borderColor: '#0f0f14',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    };
  }, [overview]);

  const pieOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#d6d6e0', padding: 16, usePointStyle: true, boxWidth: 8 },
      },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          label: (c) => ` ${c.label}: ${c.parsed} ${c.parsed === 1 ? 'entry' : 'entries'}`,
        },
      },
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- recent users ---------- */
  const [users, setUsers] = useState(null);
  const [uQuery, setUQuery] = useState('');
  const dUQuery = useDebouncedValue(uQuery, 200);
  const [uStatus, setUStatus] = useState('all');
  const [viewUser, setViewUser] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await API.get('/dashboard/recent-users', { params: { limit: 5 } });
      setUsers(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load recent users.'));
      setUsers((u) => u || []);
    }
  }, [toast]);

  const shownUsers = useMemo(() => {
    const q = dUQuery.trim().toLowerCase();
    return (users || []).filter((u) =>
      (uStatus === 'all' || u.status === uStatus) &&
      (!q || u.name?.toLowerCase().includes(q) || (u.phone || '').includes(q))
    );
  }, [users, dUQuery, uStatus]);

  const deleteUser = async (u) => {
    const ok = await confirm({
      title: 'Delete user',
      itemName: u.name,
      consequences: [
        'Their cash entries, payments and messages are permanently removed.',
        'They will no longer be able to sign in.',
      ],
    });
    if (!ok) return;
    try {
      await API.delete(`/settings/customers/${u.id}`);
      toast.success(`${u.name} was deleted.`, { title: 'Deleted' });
      loadUsers();
      loadOverview();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  /* ---------- messages ---------- */
  const [msgs, setMsgs] = useState({ unread: 0, items: [] });
  const [msgTab, setMsgTab] = useState('all');

  const loadMessages = useCallback(async () => {
    try {
      const { data } = await API.get('/dashboard/messages');
      setMsgs({
        unread: Number(data?.unread) || 0,
        items: Array.isArray(data?.items) ? data.items : [],
      });
    } catch {
      /* silent: polling */
    }
  }, []);

  const shownMessages = msgTab === 'unread'
    ? msgs.items.filter((m) => m.unread > 0)
    : msgs.items;

  const openChat = (m) => navigate('/admin/settings', { state: { openId: m.userId, openChat: true } });

  const markAllRead = async () => {
    try {
      await API.post('/dashboard/messages/read-all');
      toast.success('All messages marked as read.', { duration: 2500 });
      loadMessages();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  /* ---------- initial load + refresh ---------- */
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadOverview(), loadUsers(), loadMessages()]);
    setRefreshing(false);
  }, [loadOverview, loadUsers, loadMessages]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  useEffect(() => {
    const t = setInterval(loadMessages, 30000);
    return () => clearInterval(t);
  }, [loadMessages]);

  /* ---------- calendar (events come from the server for the visible range) ---------- */
  const calRef = useRef(null);
  const [eventForm, setEventForm] = useState(null); // { id?, title, date, time, kind, error, saving }
  const refetchEvents = () => calRef.current?.getApi().refetchEvents();

  const fetchEvents = useCallback((info, success, failure) => {
    API.get('/dashboard/events', { params: { from: info.startStr, to: info.endStr } })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        success(list.map((e) => ({ ...e, ...EVENT_KINDS[e.kind] })));
      })
      .catch((err) => {
        failure(err);
        toast.error(errorMessage(err, 'Could not load calendar events.'));
      });
  }, [toast]);

  const openNewEvent = (dateStr = todayISO()) => {
    const [date, t] = String(dateStr).split('T');
    setEventForm({
      title: '', date, time: t ? t.slice(0, 5) : '',
      kind: 'meeting', error: '', saving: false,
    });
  };

  const handleEventClick = ({ event }) => {
    const p = event.allDay
      ? { date: event.startStr.slice(0, 10), time: '' }
      : istParts(event.start);
    setEventForm({
      id: event.id,
      title: event.title,
      date: p.date,
      time: p.time,
      kind: event.extendedProps.kind || 'meeting',
      error: '',
      saving: false,
    });
  };

  const handleEventDrop = ({ event, revert }) => {
    const p = event.allDay
      ? { date: event.startStr.slice(0, 10), time: null }
      : istParts(event.start);
    API.patch(`/dashboard/events/${event.id}`, { date: p.date, time: p.time })
      .then(() => toast.info(`"${event.title}" was rescheduled.`, { duration: 2500 }))
      .catch((err) => {
        revert();
        toast.error(errorMessage(err, 'Could not reschedule the event.'));
      });
  };

  const saveEvent = async (e) => {
    e?.preventDefault();
    if (eventForm.saving) return;
    if (!eventForm.title.trim()) {
      setEventForm((f) => ({ ...f, error: 'Enter a title for the event.' }));
      return;
    }
    if (!eventForm.date) {
      setEventForm((f) => ({ ...f, error: 'Choose a date.' }));
      return;
    }
    setEventForm((f) => ({ ...f, saving: true }));
    const body = {
      title: eventForm.title.trim(),
      date: eventForm.date,
      time: eventForm.time || null,
      kind: eventForm.kind,
    };
    try {
      if (eventForm.id) {
        await API.patch(`/dashboard/events/${eventForm.id}`, body);
        toast.success('Event updated.');
      } else {
        await API.post('/dashboard/events', body);
        toast.success(`"${body.title}" added to your calendar.`);
      }
      setEventForm(null);
      refetchEvents();
    } catch (err) {
      const fe = fieldErrors(err);
      setEventForm((f) => ({
        ...f,
        saving: false,
        error: fe.title || fe.date || fe.time || errorMessage(err),
      }));
    }
  };

  const deleteEvent = async () => {
    const target = eventForm;
    setEventForm(null);
    const ok = await confirm({
      title: 'Delete event',
      itemName: target.title,
      steps: 1,
      confirmLabel: 'Delete event',
      description: `"${target.title}" will be removed from the calendar.`,
    });
    if (!ok) return;
    try {
      await API.delete(`/dashboard/events/${target.id}`);
      refetchEvents();
      toast.success('Event deleted.', {
        duration: 7000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await API.post('/dashboard/events', {
                title: target.title,
                date: target.date,
                time: target.time || null,
                kind: target.kind,
              });
              refetchEvents();
            } catch (err) {
              toast.error(errorMessage(err, 'Could not restore the event.'));
            }
          },
        },
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  /* ---------- live clock + network (browser only) ---------- */
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const liveDate = now.toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const liveTime = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
  const [clockMain, clockAmPm] = [liveTime.slice(0, 8), liveTime.slice(9).toUpperCase()];

  const [net, setNet] = useState({
    online: true, type: '—', bandwidth: '—', latency: '—', effective: '—',
  });

  useEffect(() => {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const read = () => setNet({
      online: navigator.onLine,
      type: conn?.type ? NET_TYPES[conn.type] || 'Unknown' : 'Not reported',
      bandwidth: conn?.downlink ? `${conn.downlink} Mbps` : '—',
      latency: conn?.rtt != null ? `${conn.rtt} ms` : '—',
      effective: conn?.effectiveType ? conn.effectiveType.toUpperCase() : '—',
    });
    read();
    conn?.addEventListener?.('change', read);
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    return () => {
      conn?.removeEventListener?.('change', read);
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
    };
  }, []);

  /* ---------- stat cards ---------- */
  const stats = overview ? [
    {
      key: 'users',
      label: 'Total users',
      value: overview.users.value.toLocaleString('en-IN'),
      icon: 'bi-people-fill',
      ...overview.users,
      tone: 'good',
    },
    {
      key: 'revenue',
      label: 'Total revenue',
      value: formatINR(overview.revenue.value),
      icon: 'bi-currency-rupee',
      ...overview.revenue,
      tone: 'good',
    },
    {
      key: 'balance',
      label: 'Total balance',
      value: formatINR(overview.balance.value),
      icon: 'bi-wallet2',
      ...overview.balance,
      tone: 'neutral',
    },
  ] : [];

  const trendClass = (s) => {
    if (s.trend === null || s.trend === 0) return 'flat';
    if (s.tone === 'neutral') return s.trend > 0 ? 'warn' : 'up';
    return s.trend > 0 ? 'up' : 'down';
  };

  /* =====================================================================
     RENDER
     ===================================================================== */
  return (
    <section className="adm-page">
      <div className="adm-page-inner">
        <header className="adm-page-head">
          <div>
            <h1 className="adm-title">Dashboard</h1>
            <p className="adm-subtitle">{liveDate}</p>
          </div>
          <div className="db-head-actions">
            <button
              type="button"
              className="adm-btn"
              onClick={refreshAll}
              disabled={refreshing}
            >
              <i className={`bi bi-arrow-repeat ${refreshing ? 'adm-spin' : ''}`} /> Refresh
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => openNewEvent()}
            >
              <i className="bi bi-calendar-plus" /> New event
            </button>
          </div>
        </header>

        {overviewError && (
          <div className="adm-alert" role="alert">
            <i className="bi bi-exclamation-triangle-fill" />
            <span>{overviewError}</span>
            <button type="button" className="adm-btn adm-btn--sm" onClick={loadOverview}>
              Try again
            </button>
          </div>
        )}

        {/* ---------- Stat cards ---------- */}
        <div className="db-stats">
          {!overview && !overviewError && [0, 1, 2].map((i) => (
            <div key={i} className="adm-card">
              <div className="adm-skel adm-skel--tall" />
            </div>
          ))}
          {stats.map((s) => {
            const cls = trendClass(s);
            return (
              <article key={s.key} className="adm-card db-stat">
                <span className="db-stat-icon">
                  <i className={`bi ${s.icon}`} aria-hidden="true" />
                </span>
                <div>
                  <p className="db-stat-label">{s.label}</p>
                  <p className="db-stat-value">{s.value}</p>
                  <span className={`db-trend ${cls}`}>
                    {s.trend !== null && s.trend !== 0 && (
                      <i className={`bi ${s.trend > 0 ? 'bi-arrow-up-right' : 'bi-arrow-down-right'}`} />
                    )}
                    {s.trend === null
                      ? 'No last-month data'
                      : s.trend === 0
                        ? 'No change this month'
                        : `${Math.abs(s.trend)}% vs last month`}
                  </span>
                  <p className="db-stat-note">{s.note}</p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="db-main">
          {/* ================= LEFT ================= */}
          <div className="db-left">
            <div className="adm-card">
              <div className="adm-card-head">
                <h3><i className="bi bi-calendar3" /> Calendar</h3>
                <span className="adm-help">
                  Click a day to add · click an event to edit · drag to reschedule
                </span>
              </div>
              <div className="db-calendar">
                <FullCalendar
                  ref={calRef}
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay',
                  }}
                  editable
                  eventDurationEditable={false}
                  selectable
                  nowIndicator
                  dayMaxEvents={3}
                  events={fetchEvents}
                  dateClick={(arg) => openNewEvent(arg.dateStr)}
                  eventClick={handleEventClick}
                  eventDrop={handleEventDrop}
                  height="auto"
                />
              </div>
            </div>

            <div className="db-charts">
              <div className="adm-card">
                <div className="adm-card-head">
                  <h3><i className="bi bi-bar-chart-line-fill" /> Cash given vs collected</h3>
                  <select
                    className="adm-select db-range"
                    value={range}
                    onChange={(e) => setRange(e.target.value)}
                    aria-label="Chart range"
                  >
                    {Object.entries(RANGES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="db-chart-canvas">
                  {chart ? <Bar data={barData} options={barOptions} /> : <div className="adm-skel adm-skel--fill" />}
                </div>
              </div>

              <div className="adm-card">
                <div className="adm-card-head">
                  <h3><i className="bi bi-pie-chart-fill" /> Account status</h3>
                  <span className="adm-help">{mixTotal} cash entries</span>
                </div>
                <div className="db-chart-canvas">
                  {!overview ? (
                    <div className="adm-skel adm-skel--fill" />
                  ) : mixTotal === 0 ? (
                    <EmptyState
                      icon="bi-pie-chart"
                      title="No cash entries yet"
                      text="Add a cash entry to a customer to see the mix."
                    />
                  ) : (
                    <Pie data={pieData} options={pieOptions} />
                  )}
                </div>
              </div>
            </div>

            <div className="adm-card">
              <div className="adm-card-head">
                <h3><i className="bi bi-person-lines-fill" /> Recently joined users</h3>
                <button
                  type="button"
                  className="adm-btn adm-btn--sm"
                  onClick={() => navigate('/admin/settings')}
                >
                  View all <i className="bi bi-arrow-right" />
                </button>
              </div>

              <div className="db-user-tools">
                <div className="adm-search">
                  <i className="bi bi-search" aria-hidden="true" />
                  <input
                    className="adm-input"
                    type="search"
                    placeholder="Search name or phone"
                    aria-label="Search users"
                    value={uQuery}
                    onChange={(e) => setUQuery(e.target.value)}
                  />
                </div>
                <div className="adm-seg" role="group" aria-label="Filter users by status">
                  {['all', 'active', 'pending', 'blocked'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={uStatus === s}
                      onClick={() => setUStatus(s)}
                    >
                      {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {!users ? (
                <div className="st-skeletons">
                  <div className="adm-skel" />
                  <div className="adm-skel" />
                  <div className="adm-skel" />
                </div>
              ) : shownUsers.length === 0 ? (
                <EmptyState
                  icon="bi-person-x"
                  title="No users found"
                  text={users.length === 0
                    ? 'Customers you add will appear here.'
                    : 'Try a different search or status filter.'}
                  action={users.length > 0 && (
                    <button
                      type="button"
                      className="adm-btn"
                      onClick={() => { setUQuery(''); setUStatus('all'); }}
                    >
                      Clear filters
                    </button>
                  )}
                />
              ) : (
                <div className="adm-table-wrap">
                  <table className="adm-table adm-table--stack">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Phone</th>
                        <th>Joined</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownUsers.map((u) => (
                        <tr key={u.id}>
                          <td data-label="User">
                            <div className="adm-cell-user">
                              <Avatar name={u.name} />
                              <strong className="notranslate" translate="no">{u.name}</strong>
                            </div>
                          </td>
                          <td data-label="Phone">{u.phone || '—'}</td>
                          <td data-label="Joined">{formatDate(u.joined)}</td>
                          <td data-label="Status">
                            <StatusBadge tone={USER_TONE[u.status]}>{u.status}</StatusBadge>
                          </td>
                          <td data-label="">
                            <div className="adm-row-actions">
                              <button
                                type="button"
                                className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm"
                                onClick={() => setViewUser(u)}
                                aria-label={`View ${u.name}`}
                                title="View"
                              >
                                <i className="bi bi-eye" />
                              </button>
                              <button
                                type="button"
                                className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm db-del"
                                onClick={() => deleteUser(u)}
                                aria-label={`Delete ${u.name}`}
                                title="Delete"
                              >
                                <i className="bi bi-trash3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ================= RIGHT ================= */}
          <aside className="db-right">
            <div className="adm-card db-clock">
              <div className="adm-card-head">
                <h3><i className="bi bi-clock-history" /> Live clock</h3>
              </div>
              <p className="db-clock-time" aria-label={liveTime}>
                {clockMain}<span>{clockAmPm}</span>
              </p>
              <p className="db-clock-date">
                <i className="bi bi-calendar-event" /> {liveDate}
              </p>
            </div>

            <div className="adm-card">
              <div className="adm-card-head">
                <h3><i className="bi bi-wifi" /> Network</h3>
                <StatusBadge tone={net.online ? 'success' : 'danger'}>
                  {net.online ? 'Online' : 'Offline'}
                </StatusBadge>
              </div>
              <dl className="db-net">
                <div><dt>Connection</dt><dd>{net.type}</dd></div>
                <div><dt>Bandwidth</dt><dd>{net.bandwidth}</dd></div>
                <div><dt>Latency</dt><dd>{net.latency}</dd></div>
                <div><dt>Network class</dt><dd>{net.effective}</dd></div>
              </dl>
            </div>

            <div className="adm-card">
              <div className="adm-card-head">
                <h3>
                  <i className="bi bi-chat-dots-fill" /> Recent messages{' '}
                  {msgs.unread > 0 && <span className="adm-count db-count">{msgs.unread}</span>}
                </h3>
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost adm-btn--sm"
                  onClick={markAllRead}
                  disabled={!msgs.unread}
                >
                  Mark all read
                </button>
              </div>
              <div className="adm-seg" role="group" aria-label="Filter messages">
                <button
                  type="button"
                  aria-pressed={msgTab === 'all'}
                  onClick={() => setMsgTab('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  aria-pressed={msgTab === 'unread'}
                  onClick={() => setMsgTab('unread')}
                >
                  Unread
                </button>
              </div>
              <div className="db-messages">
                {shownMessages.length === 0 ? (
                  <EmptyState
                    icon="bi-check2-all"
                    title={msgTab === 'unread' ? 'All caught up' : 'No messages'}
                    text={msgTab === 'unread'
                      ? 'No unread messages.'
                      : 'Customer messages from the last 24 hours show here.'}
                  />
                ) : shownMessages.map((m) => (
                  <button
                    key={m.userId}
                    type="button"
                    className={`db-msg ${m.unread ? 'is-unread' : ''}`}
                    onClick={() => openChat(m)}
                  >
                    <Avatar name={m.name} />
                    <span className="db-msg-body">
                      <span className="db-msg-head">
                        <strong className="notranslate" translate="no">{m.name}</strong>
                        <small>{msgTime(m.at)}</small>
                      </span>
                      <span className="db-msg-text">{m.text}</span>
                    </span>
                    {m.unread > 0 && <span className="adm-count">{m.unread}</span>}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ---------- Event modal ---------- */}
      <Modal
        open={!!eventForm}
        onClose={() => setEventForm(null)}
        size="sm"
        icon={eventForm?.id ? 'bi-pencil-square' : 'bi-calendar-plus'}
        title={eventForm?.id ? 'Edit event' : 'New event'}
        footer={eventForm && (
          <>
            {eventForm.id && (
              <button
                type="button"
                className="adm-btn adm-btn--danger db-event-del"
                onClick={deleteEvent}
              >
                <i className="bi bi-trash3" /> Delete
              </button>
            )}
            <button
              type="button"
              className="adm-btn adm-btn--ghost"
              onClick={() => setEventForm(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="event-form"
              className="adm-btn adm-btn--primary"
              disabled={eventForm.saving}
            >
              {eventForm.saving ? 'Saving…' : eventForm.id ? 'Save changes' : 'Add event'}
            </button>
          </>
        )}
      >
        {eventForm && (
          <form id="event-form" className="adm-form" onSubmit={saveEvent} noValidate>
            <Field label="Title" required error={eventForm.error}>
              <input
                className="adm-input"
                data-autofocus
                autoComplete="off"
                maxLength={80}
                placeholder="e.g. Collection round"
                value={eventForm.title}
                onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value, error: '' }))}
              />
            </Field>
            <div className="adm-form-grid">
              <Field label="Date" required>
                <input
                  className="adm-input"
                  type="date"
                  value={eventForm.date}
                  onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))}
                />
              </Field>
              <Field label="Time" hint="Leave empty for all-day">
                <input
                  className="adm-input"
                  type="time"
                  value={eventForm.time}
                  onChange={(e) => setEventForm((f) => ({ ...f, time: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Type">
              <select
                className="adm-select"
                value={eventForm.kind}
                onChange={(e) => setEventForm((f) => ({ ...f, kind: e.target.value }))}
              >
                {Object.entries(EVENT_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>
          </form>
        )}
      </Modal>

      {/* ---------- User details modal ---------- */}
      <Modal
        open={!!viewUser}
        onClose={() => setViewUser(null)}
        size="sm"
        icon="bi-person-badge"
        title="User details"
        footer={
          <>
            <button
              type="button"
              className="adm-btn adm-btn--ghost"
              onClick={() => setViewUser(null)}
            >
              Close
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => navigate('/admin/settings', { state: { openId: viewUser.id } })}
            >
              Open account
            </button>
          </>
        }
      >
        {viewUser && (
          <div className="db-user-detail">
            <Avatar name={viewUser.name} large />
            <h4 className="notranslate" translate="no">{viewUser.name}</h4>
            <StatusBadge tone={USER_TONE[viewUser.status]}>{viewUser.status}</StatusBadge>
            <dl className="db-net">
              <div><dt>Phone</dt><dd>{viewUser.phone || '—'}</dd></div>
              <div><dt>Joined</dt><dd>{formatDate(viewUser.joined)}</dd></div>
              <div><dt>Cash entries</dt><dd>{viewUser.cashTaken}</dd></div>
              <div>
                <dt>Secret key</dt>
                <dd className="adm-mono notranslate" translate="no">{viewUser.secretKey}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </section>
  );
}

/* =====================================================================
   EXPORT — wrapped in ErrorBoundary + AdminUIProvider
   ===================================================================== */
export default function Dashboard() {
  return (
    <AdminUIProvider>
      <ErrorBoundary>
        <DashboardPage />
      </ErrorBoundary>
    </AdminUIProvider>
  );
}