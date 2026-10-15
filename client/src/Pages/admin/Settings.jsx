import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../../styles/admin/Settings.css';
import ViewCustomer from '../../components/ViewCustomer';
import API, { errorMessage, fieldErrors } from '../../api';
import {
  AdminUIProvider, useToast, useConfirm, Drawer, Modal, Field, Pagination,
  StatusBadge, EmptyState, Avatar, formatDate, todayISO, downloadCSV,
  useDebouncedValue, copyText,
} from '../../UI/AdminUI';

const STATUS_TONE = { active: 'success', pending: 'warning', blocked: 'danger' };
const STATUS_TABS = ['all', 'active', 'pending', 'blocked'];
const SORT_LABELS = {
  newest: 'Newest first', oldest: 'Oldest first', 'name-asc': 'Name A–Z', 'name-desc': 'Name Z–A',
  'cash-high': 'Most cash taken', 'cash-low': 'Least cash taken',
};
const EMPTY_FILTERS = { from: '', to: '', minCash: '', maxCash: '' };
const EMPTY_PAGE = { items: [], total: 0, pages: 1, counts: { all: 0, active: 0, pending: 0, blocked: 0 } };

/* =====================================================================
   PAGE
   ===================================================================== */
function SettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();

  const [data, setData] = useState(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');

  const [activeId, setActiveId] = useState(null);
  const [openChat, setOpenChat] = useState(false);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [selected, setSelected] = useState(() => new Set());

  const [form, setForm] = useState(null);       // { mode, id?, values, errors, saving }
  const [created, setCreated] = useState(null); // customer just created (shows the secret key)
  const [cfg, setCfg] = useState(null);         // business settings drawer
  const searchRef = useRef(null);
  const reqRef = useRef(0);

  /* ---------- query sent to the server ---------- */
  const filterParams = useMemo(() => ({
    search: debouncedSearch.trim() || undefined,
    status,
    sort,
    from: filters.from || undefined,
    to: filters.to || undefined,
    minCash: filters.minCash !== '' ? Number(filters.minCash) : undefined,
    maxCash: filters.maxCash !== '' ? Number(filters.maxCash) : undefined,
  }), [debouncedSearch, status, sort, filters]);

  const load = useCallback(async () => {
    const id = ++reqRef.current;       // ignore out-of-order responses
    setLoading(true);
    try {
      const res = await API.get('/settings/customers', { params: { ...filterParams, page, limit: perPage } });
      if (id !== reqRef.current) return;
      setData(res.data);
      setError('');
      setLoadedOnce(true);
      if (page > res.data.pages) setPage(res.data.pages);
    } catch (err) {
      if (id !== reqRef.current) return;
      setError(errorMessage(err, 'Could not load customers.'));
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }, [filterParams, page, perPage]);

  useEffect(() => { if (!activeId) load(); }, [load, activeId]);

  // opened from the dashboard messages panel
  useEffect(() => {
    const s = location.state;
    if (s?.openId) {
      setActiveId(s.openId);
      setOpenChat(!!s.openChat);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  // "/" focuses search
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.key === '/' && !['input', 'textarea', 'select'].includes(tag) && !document.body.classList.contains('adm-scroll-lock')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- derived ---------- */
  const { items, total, pages, counts } = data;
  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length;
  const hasAnyFilter = activeFilterCount > 0 || status !== 'all' || search.trim() !== '';
  const allOnPage = items.length > 0 && items.every((c) => selected.has(c.id));
  const someOnPage = items.some((c) => selected.has(c.id));

  /* ---------- filter handlers (always go back to page 1) ---------- */
  const changeSearch = (v) => { setSearch(v); setPage(1); };
  const changeStatus = (v) => { setStatus(v); setPage(1); };
  const changeSort = (v) => { setSort(v); setPage(1); };
  const changePerPage = (v) => { setPerPage(v); setPage(1); };
  const setFilter = (key) => (e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(1); };
  const clearFilter = (key) => { setFilters((f) => ({ ...f, [key]: '' })); setPage(1); };
  const clearAll = () => { setSearch(''); setStatus('all'); setFilters(EMPTY_FILTERS); setPage(1); };

  const chips = [];
  if (search.trim()) chips.push({ key: 'search', label: `Search: “${search.trim()}”`, clear: () => changeSearch('') });
  if (filters.from) chips.push({ key: 'from', label: `Joined after ${formatDate(filters.from)}`, clear: () => clearFilter('from') });
  if (filters.to) chips.push({ key: 'to', label: `Joined before ${formatDate(filters.to)}`, clear: () => clearFilter('to') });
  if (filters.minCash !== '') chips.push({ key: 'min', label: `Cash taken ≥ ${filters.minCash}`, clear: () => clearFilter('minCash') });
  if (filters.maxCash !== '') chips.push({ key: 'max', label: `Cash taken ≤ ${filters.maxCash}`, clear: () => clearFilter('maxCash') });

  /* ---------- selection ---------- */
  const toggleOne = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePage = () => setSelected((s) => {
    const n = new Set(s);
    if (allOnPage) items.forEach((c) => n.delete(c.id));
    else items.forEach((c) => n.add(c.id));
    return n;
  });
  const selectedList = items.filter((c) => selected.has(c.id));

  /* ---------- new / edit customer ---------- */
  const openCreate = () => setForm({ mode: 'create', values: { name: '', phone: '', status: 'active' }, errors: {}, saving: false });
  const openEdit = (c) => setForm({ mode: 'edit', id: c.id, secretKey: c.secretKey, values: { name: c.name, phone: c.phone || '', status: c.status }, errors: {}, saving: false });
  const setValue = (key) => (e) => setForm((f) => ({ ...f, values: { ...f.values, [key]: e.target.value }, errors: { ...f.errors, [key]: '' } }));

  const submitForm = async (e) => {
    e?.preventDefault();
    if (form.saving) return;
    const { name, phone, status: st } = form.values;
    const errors = {};
    if (name.trim().length < 2) errors.name = 'Enter the customer’s full name (at least 2 characters).';
    if (phone.trim() && !/^\d{10}$/.test(phone.trim())) errors.phone = 'Phone number must be 10 digits.';
    if (Object.keys(errors).length) { setForm((f) => ({ ...f, errors })); return; }

    setForm((f) => ({ ...f, saving: true }));
    try {
      if (form.mode === 'create') {
        const res = await API.post('/settings/customers', { name: name.trim(), phone: phone.trim() || undefined, status: st });
        setCreated(res.data);
        toast.success(`${res.data.name} was added as a customer.`, { title: 'Customer added' });
      } else {
        await API.patch(`/settings/customers/${form.id}`, { name: name.trim(), phone: phone.trim(), status: st });
        toast.success(`${name.trim()}’s details were updated.`, { title: 'Changes saved' });
      }
      setForm(null);
      load();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setForm((f) => ({ ...f, saving: false, errors: fe }));
      else { setForm((f) => ({ ...f, saving: false })); toast.error(errorMessage(err)); }
    }
  };

  /* ---------- destructive actions ---------- */
  const deleteCustomers = async (list) => {
    const many = list.length > 1;
    const ok = await confirm({
      title: many ? `Delete ${list.length} customers` : 'Delete customer',
      itemName: many ? `${list.length} customers` : list[0].name,
      consequences: [
        'All cash entries, payments and messages for this account are permanently removed.',
        'This cannot be undone.',
      ],
    });
    if (!ok) return;
    try {
      if (many) await API.post('/settings/customers/bulk', { action: 'delete', ids: list.map((c) => c.id) });
      else await API.delete(`/settings/customers/${list[0].id}`);
      setSelected((s) => { const n = new Set(s); list.forEach((c) => n.delete(c.id)); return n; });
      toast.success(many ? `${list.length} customers deleted.` : `${list[0].name} was deleted.`, { title: 'Deleted' });
      load();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const blockCustomers = async (list) => {
    const many = list.length > 1;
    const ok = await confirm({
      title: many ? `Block ${list.length} customers` : 'Block customer',
      verb: 'Block',
      itemName: many ? `${list.length} customers` : list[0].name,
      variant: 'warning',
      steps: 1,
      description: 'Blocked customers cannot sign in or take new cash. Payments can still be recorded. You can unblock them at any time.',
    });
    if (!ok) return;
    try {
      if (many) await API.post('/settings/customers/bulk', { action: 'block', ids: list.map((c) => c.id) });
      else await API.patch(`/settings/customers/${list[0].id}`, { status: 'blocked' });
      toast.warning(many ? `${list.length} customers blocked.` : `${list[0].name} is now blocked.`, { title: 'Blocked' });
      load();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const unblock = async (c) => {
    try {
      await API.patch(`/settings/customers/${c.id}`, { status: 'active' });
      toast.success(`${c.name} is active again.`, { title: 'Unblocked' });
      load();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  /* ---------- export + copy ---------- */
  const exportCSV = async () => {
    try {
      const res = await API.get('/settings/customers/export', { params: filterParams });
      const rows = res.data.items.map((c) => ({
        'Secret key': c.secretKey, Name: c.name, Phone: c.phone, Joined: c.joined, 'Cash taken': c.cashTaken, Status: c.status,
      }));
      if (!rows.length) { toast.info('There are no customers to export.'); return; }
      downloadCSV(`customers-${todayISO()}.csv`, rows);
      toast.success(`${rows.length} customers exported to CSV.`, { title: 'Export ready' });
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const copyKey = async (key) => {
    (await copyText(key)) ? toast.success(`${key} copied to clipboard.`, { duration: 2000 }) : toast.error('Could not copy. Select the key and copy it manually.');
  };

  /* ---------- business settings ---------- */
  const openConfig = async () => {
    setCfg({ loading: true, saving: false, values: null, errors: {} });
    try {
      const { data: c } = await API.get('/settings/config');
      setCfg({ loading: false, saving: false, errors: {}, values: {
        upiId: c.upiId, payeeName: c.payeeName, supportPhone: c.supportPhone, defaultInterestPct: String(c.defaultInterestPct),
      } });
    } catch (err) { setCfg(null); toast.error(errorMessage(err, 'Could not load business settings.')); }
  };
  const setCfgValue = (key) => (e) => setCfg((c) => ({ ...c, values: { ...c.values, [key]: e.target.value }, errors: { ...c.errors, [key]: '' } }));
  const saveConfig = async (e) => {
    e?.preventDefault();
    const v = cfg.values;
    const errors = {};
    if (!v.upiId.trim()) errors.upiId = 'Enter the UPI ID customers should pay to.';
    if (v.defaultInterestPct === '' || Number(v.defaultInterestPct) < 0 || Number(v.defaultInterestPct) > 100) errors.defaultInterestPct = 'Enter a percentage between 0 and 100.';
    if (Object.keys(errors).length) { setCfg((c) => ({ ...c, errors })); return; }
    setCfg((c) => ({ ...c, saving: true }));
    try {
      await API.put('/settings/config', {
        upiId: v.upiId.trim(), payeeName: v.payeeName.trim(), supportPhone: v.supportPhone.trim(), defaultInterestPct: Number(v.defaultInterestPct),
      });
      toast.success('Business settings saved.', { title: 'Saved' });
      setCfg(null);
    } catch (err) {
      const fe = fieldErrors(err);
      setCfg((c) => ({ ...c, saving: false, errors: Object.keys(fe).length ? fe : c.errors }));
      if (!Object.keys(fe).length) toast.error(errorMessage(err));
    }
  };

  /* =====================================================================
     VIEW: single customer — the list is hidden
     ===================================================================== */
  if (activeId) {
    return (
      <section className="adm-page">
        <div className="adm-page-inner">
          <ViewCustomer
            key={activeId}
            customerId={activeId}
            openChat={openChat}
            onClose={() => { setActiveId(null); setOpenChat(false); }}
          />
        </div>
      </section>
    );
  }

  /* =====================================================================
     VIEW: customer list
     ===================================================================== */
  const firstLoad = loading && !loadedOnce;

  return (
    <section className="adm-page">
      <div className="adm-page-inner">
        <header className="adm-page-head">
          <div>
            <h1 className="adm-title">Settings · Customers</h1>
            <p className="adm-subtitle">
              {counts.all} customers in total
              {hasAnyFilter && loadedOnce && <> · {total} match your filters</>}
            </p>
          </div>
          <div className="st-head-actions">
            <button type="button" className="adm-btn" onClick={openConfig}><i className="bi bi-sliders" /> Business settings</button>
            <button type="button" className="adm-btn" onClick={exportCSV} disabled={!total}><i className="bi bi-download" /> Export CSV</button>
            <button type="button" className="adm-btn adm-btn--primary" onClick={openCreate}><i className="bi bi-plus-lg" /> New customer</button>
          </div>
        </header>

        <div className="adm-card st-card">
          <div className="adm-seg" role="group" aria-label="Filter by status">
            {STATUS_TABS.map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => changeStatus(s)}>
                {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
                <span className="adm-seg-count">{counts[s] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="st-toolbar">
            <div className="adm-search">
              <i className="bi bi-search" aria-hidden="true" />
              <input
                ref={searchRef} className="adm-input" type="search"
                placeholder="Search name, phone or secret key  (press /)"
                aria-label="Search customers" value={search}
                onChange={(e) => changeSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm adm-search-clear" onClick={() => changeSearch('')} aria-label="Clear search"><i className="bi bi-x-lg" /></button>
              )}
            </div>
            <select className="adm-select st-sort" value={sort} onChange={(e) => changeSort(e.target.value)} aria-label="Sort customers">
              {Object.entries(SORT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" className="adm-btn" aria-expanded={showFilters} aria-controls="st-filter-panel" onClick={() => setShowFilters((v) => !v)}>
              <i className="bi bi-funnel" /> Filters {activeFilterCount > 0 && <span className="adm-count">{activeFilterCount}</span>}
            </button>
          </div>

          {showFilters && (
            <div id="st-filter-panel" className="st-filter-panel">
              <div className="adm-field"><label className="adm-label" htmlFor="f-from">Joined from</label>
                <input id="f-from" className="adm-input" type="date" value={filters.from} max={filters.to || undefined} onChange={setFilter('from')} /></div>
              <div className="adm-field"><label className="adm-label" htmlFor="f-to">Joined until</label>
                <input id="f-to" className="adm-input" type="date" value={filters.to} min={filters.from || undefined} onChange={setFilter('to')} /></div>
              <div className="adm-field"><label className="adm-label" htmlFor="f-min">Cash taken (min)</label>
                <input id="f-min" className="adm-input" type="number" min="0" placeholder="0" value={filters.minCash} onChange={setFilter('minCash')} /></div>
              <div className="adm-field"><label className="adm-label" htmlFor="f-max">Cash taken (max)</label>
                <input id="f-max" className="adm-input" type="number" min="0" placeholder="Any" value={filters.maxCash} onChange={setFilter('maxCash')} /></div>
              <button type="button" className="adm-btn adm-btn--ghost st-filter-reset" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }} disabled={!activeFilterCount}>
                <i className="bi bi-arrow-counterclockwise" /> Reset
              </button>
            </div>
          )}

          {chips.length > 0 && (
            <div className="adm-chips">
              {chips.map((c) => (
                <span key={c.key} className="adm-chip">{c.label}
                  <button type="button" onClick={c.clear} aria-label={`Remove filter ${c.label}`}><i className="bi bi-x" /></button>
                </span>
              ))}
              <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={clearAll}>Clear all</button>
            </div>
          )}

          {selected.size > 0 && (
            <div className="st-bulk" role="region" aria-label="Bulk actions">
              <strong>{selected.size} selected</strong>
              <div className="st-bulk-actions">
                <button type="button" className="adm-btn adm-btn--sm adm-btn--warn" onClick={() => blockCustomers(selectedList.filter((c) => c.status !== 'blocked'))} disabled={!selectedList.some((c) => c.status !== 'blocked')}>
                  <i className="bi bi-slash-circle" /> Block
                </button>
                <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => deleteCustomers(selectedList)} disabled={!selectedList.length}>
                  <i className="bi bi-trash3" /> Delete
                </button>
                <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" onClick={() => setSelected(new Set())}>Clear selection</button>
              </div>
            </div>
          )}

          {/* ---------- states ---------- */}
          {error && (
            <div className="adm-alert" role="alert">
              <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
              <span>{error}</span>
              <button type="button" className="adm-btn adm-btn--sm" onClick={load}>Try again</button>
            </div>
          )}

          {firstLoad ? (
            <div className="st-skeletons" aria-busy="true" aria-label="Loading customers">
              {Array.from({ length: 5 }, (_, i) => <div key={i} className="adm-skel" />)}
            </div>
          ) : items.length === 0 && !error ? (
            <EmptyState
              icon="bi-person-x"
              title={counts.all === 0 ? 'No customers yet' : 'No customers match'}
              text={counts.all === 0 ? 'Add your first customer to start recording cash and payments.' : 'Try a different search term or clear some filters.'}
              action={counts.all === 0
                ? <button type="button" className="adm-btn adm-btn--primary" onClick={openCreate}><i className="bi bi-plus-lg" /> New customer</button>
                : <button type="button" className="adm-btn" onClick={clearAll}>Clear all filters</button>}
            />
          ) : (
            <div className={`adm-table-wrap ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
              <table className="adm-table adm-table--stack st-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>
                      <input type="checkbox" className="adm-check" checked={allOnPage}
                        ref={(el) => { if (el) el.indeterminate = someOnPage && !allOnPage; }}
                        onChange={togglePage} aria-label="Select all customers on this page" />
                    </th>
                    <th>Customer</th><th>Secret key</th><th>Joined</th><th>Cash taken</th><th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} className={selected.has(c.id) ? 'is-selected' : ''}>
                      <td data-label="Select"><input type="checkbox" className="adm-check" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} aria-label={`Select ${c.name}`} /></td>
                      <td data-label="Customer">
                        <div className="adm-cell-user"><Avatar name={c.name} />
                          <div><strong className="notranslate" translate="no">{c.name}</strong>{c.phone && <small>{c.phone}</small>}</div>
                        </div>
                      </td>
                      <td data-label="Secret key">
                        <span className="st-key notranslate" translate="no">
                          <span className="adm-mono">{c.secretKey}</span>
                          <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" onClick={() => copyKey(c.secretKey)} aria-label={`Copy secret key of ${c.name}`} title="Copy key"><i className="bi bi-copy" /></button>
                        </span>
                      </td>
                      <td data-label="Joined">{formatDate(c.joined)}</td>
                      <td data-label="Cash taken"><span className="st-cash">{c.cashTaken}×</span></td>
                      <td data-label="Status"><StatusBadge tone={STATUS_TONE[c.status]}>{c.status}</StatusBadge></td>
                      <td data-label="">
                        <div className="adm-row-actions">
                          <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => { setOpenChat(false); setActiveId(c.id); }}><i className="bi bi-box-arrow-up-right" /> Open</button>
                          <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`} title="Edit"><i className="bi bi-pencil-square" /></button>
                          {c.status === 'blocked' ? (
                            <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" onClick={() => unblock(c)} aria-label={`Unblock ${c.name}`} title="Unblock"><i className="bi bi-check-circle" /></button>
                          ) : (
                            <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" onClick={() => blockCustomers([c])} aria-label={`Block ${c.name}`} title="Block"><i className="bi bi-slash-circle" /></button>
                          )}
                          <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm st-del" onClick={() => deleteCustomers([c])} aria-label={`Delete ${c.name}`} title="Delete"><i className="bi bi-trash3" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > 0 && (
            <Pagination
              page={Math.min(page, pages)} totalPages={pages} total={total} perPage={perPage}
              onPage={(p) => setPage(Math.min(Math.max(1, p), pages))} onPerPage={changePerPage} label="customers"
            />
          )}
        </div>
      </div>

      {/* ---------- DRAWER: new / edit customer ---------- */}
      <Drawer
        open={!!form} onClose={() => setForm(null)} side="right"
        icon={form?.mode === 'edit' ? 'bi-pencil-square' : 'bi-person-plus-fill'}
        title={form?.mode === 'edit' ? 'Edit customer' : 'New customer'}
        footer={(
          <>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" form="customer-form" className="adm-btn adm-btn--primary" disabled={form?.saving}>
              <i className={`bi ${form?.saving ? 'bi-arrow-repeat' : 'bi-check-lg'}`} /> {form?.saving ? 'Saving…' : form?.mode === 'edit' ? 'Save changes' : 'Add customer'}
            </button>
          </>
        )}
      >
        {form && (
          <form id="customer-form" className="adm-form" onSubmit={submitForm} noValidate>
            <Field label="Full name" required error={form.errors.name}>
              <input className="adm-input" data-autofocus autoComplete="off" placeholder="e.g. Susan Mathew" value={form.values.name} onChange={setValue('name')} />
            </Field>
            <Field label="Phone number" error={form.errors.phone} hint="Optional · 10 digits">
              <input className="adm-input" inputMode="numeric" maxLength={10} placeholder="9876543210" value={form.values.phone} onChange={setValue('phone')} />
            </Field>
            <Field label="Status" hint="Only active customers can sign in.">
              <select className="adm-select" value={form.values.status} onChange={setValue('status')}>
                <option value="active">Active</option><option value="pending">Pending</option><option value="blocked">Blocked</option>
              </select>
            </Field>
            {form.mode === 'edit' ? (
              <Field label="Secret key" hint="Secret keys are permanent once created."><input className="adm-input" readOnly value={form.secretKey} /></Field>
            ) : (
              <p className="adm-help"><i className="bi bi-key" /> A secret key (VK + date + order number) is generated for you when you save. You will see it right after.</p>
            )}
          </form>
        )}
      </Drawer>

      {/* ---------- MODAL: key of the customer just created ---------- */}
      <Modal open={!!created} onClose={() => setCreated(null)} size="sm" icon="bi-key-fill" title="Customer created"
        footer={<button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreated(null)}>Done</button>}>
        {created && (
          <div className="adm-form">
            <p className="adm-help">Share this secret key with <strong>{created.name}</strong>. It is how they sign in.</p>
            <div className="st-key-reveal notranslate" translate="no">
              <span className="adm-mono">{created.secretKey}</span>
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => copyKey(created.secretKey)}><i className="bi bi-copy" /> Copy</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- DRAWER: business settings ---------- */}
      <Drawer
        open={!!cfg} onClose={() => setCfg(null)} side="right" icon="bi-sliders" title="Business settings"
        footer={(
          <>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setCfg(null)}>Cancel</button>
            <button type="submit" form="config-form" className="adm-btn adm-btn--primary" disabled={!cfg?.values || cfg?.saving}>
              <i className="bi bi-check-lg" /> {cfg?.saving ? 'Saving…' : 'Save settings'}
            </button>
          </>
        )}
      >
        {cfg?.loading && <div className="st-skeletons"><div className="adm-skel" /><div className="adm-skel" /><div className="adm-skel" /></div>}
        {cfg?.values && (
          <form id="config-form" className="adm-form" onSubmit={saveConfig} noValidate>
            <Field label="UPI ID" required error={cfg.errors.upiId} hint="Customers pay to this ID from the Pay now window.">
              <input className="adm-input" data-autofocus autoComplete="off" value={cfg.values.upiId} onChange={setCfgValue('upiId')} />
            </Field>
            <Field label="Payee name" error={cfg.errors.payeeName} hint="Shown in the customer’s UPI app.">
              <input className="adm-input" value={cfg.values.payeeName} onChange={setCfgValue('payeeName')} />
            </Field>
            <Field label="Support phone" error={cfg.errors.supportPhone} hint="Shown on the sign-in page (“Contact us”).">
              <input className="adm-input" inputMode="tel" value={cfg.values.supportPhone} onChange={setCfgValue('supportPhone')} />
            </Field>
            <Field label="Default interest (%)" required error={cfg.errors.defaultInterestPct} hint="Used when you add a cash entry and leave the interest blank.">
              <input className="adm-input" type="number" min="0" max="100" step="0.1" value={cfg.values.defaultInterestPct} onChange={setCfgValue('defaultInterestPct')} />
            </Field>
          </form>
        )}
      </Drawer>
    </section>
  );
}

export default function Settings() {
  return (
    <AdminUIProvider>
      <SettingsPage />
    </AdminUIProvider>
  );
}