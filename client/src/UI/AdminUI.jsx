import React, {
  createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, useId, cloneElement,
} from 'react';
import { createPortal } from 'react-dom';
import '../styles/admin/AdminTheme.css';

/* =====================================================================
   HELPERS
   ===================================================================== */
export const formatINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const todayISO = () => new Date().toLocaleDateString('en-CA');

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function useDebouncedValue(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* =====================================================================
   OVERLAY BEHAVIOUR — Esc, focus trap, scroll lock, focus restore.
   Stacked overlays (e.g. confirm over drawer): only the top one reacts.
   ===================================================================== */
const overlayStack = [];
let lockCount = 0;
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useOverlay(open, onClose, panelRef) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const token = Symbol('overlay');
    overlayStack.push(token);
    const previouslyFocused = document.activeElement;
    lockCount += 1;
    document.body.classList.add('adm-scroll-lock');

    const onKeyDown = (e) => {
      if (overlayStack[overlayStack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = panelRef.current.querySelectorAll(FOCUSABLE);
      if (!nodes.length) { e.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);

    const t = setTimeout(() => {
      const el = panelRef.current;
      if (el && !el.contains(document.activeElement)) {
        (el.querySelector('[data-autofocus]') || el).focus();
      }
    }, 40);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(t);
      const i = overlayStack.indexOf(token);
      if (i > -1) overlayStack.splice(i, 1);
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) document.body.classList.remove('adm-scroll-lock');
      previouslyFocused?.focus?.();
    };
  }, [open, panelRef]);
}

/* =====================================================================
   MODAL
   ===================================================================== */
export function Modal({
  open, onClose, title, icon, size = 'md', children, footer,
  dismissible = true, role = 'dialog',
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  useOverlay(open, dismissible ? onClose : undefined, panelRef);
  if (!open) return null;

  return createPortal(
    <div
      className="adm-overlay adm-ui"
      onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={panelRef}
        className={`adm-modal adm-modal--${size}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="adm-panel-head">
          <h2 id={titleId}>{icon && <i className={`bi ${icon}`} aria-hidden="true" />}{title}</h2>
          <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon" onClick={onClose} aria-label="Close">
            <i className="bi bi-x-lg" />
          </button>
        </header>
        <div className="adm-panel-body">{children}</div>
        {footer && <footer className="adm-panel-foot">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

/* =====================================================================
   DRAWER — replaces Bootstrap offcanvas (side: right | left | top | bottom)
   ===================================================================== */
export function Drawer({ open, onClose, title, icon, side = 'right', wide = false, children, footer }) {
  const panelRef = useRef(null);
  const titleId = useId();
  useOverlay(open, onClose, panelRef);
  if (!open) return null;

  return createPortal(
    <div
      className={`adm-overlay adm-overlay--${side} adm-ui`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <aside
        ref={panelRef}
        className={`adm-drawer adm-drawer--${side} ${wide ? 'adm-drawer--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="adm-panel-head">
          <h2 id={titleId}>{icon && <i className={`bi ${icon}`} aria-hidden="true" />}{title}</h2>
          <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon" onClick={onClose} aria-label="Close panel">
            <i className="bi bi-x-lg" />
          </button>
        </header>
        <div className="adm-panel-body"><div className="adm-drawer-inner">{children}</div></div>
        {footer && <footer className="adm-panel-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body
  );
}

/* =====================================================================
   FIELD — label + input + error/hint wired for accessibility
   ===================================================================== */
export function Field({ label, required, error, hint, children, className = '' }) {
  const id = useId();
  const msgId = `${id}-msg`;
  const control = cloneElement(children, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? msgId : undefined,
  });
  return (
    <div className={`adm-field ${className}`}>
      <label htmlFor={id} className="adm-label">
        {label}{required && <span className="adm-req" aria-hidden="true"> *</span>}
      </label>
      {control}
      {(error || hint) && <small id={msgId} className={error ? 'adm-error' : 'adm-help'}>{error || hint}</small>}
    </div>
  );
}

/* =====================================================================
   SMALL PRESENTATION PIECES
   ===================================================================== */
export const StatusBadge = ({ tone = 'muted', dot = true, children }) => (
  <span className={`adm-badge adm-badge--${tone} ${dot ? 'adm-badge--dot' : ''}`}>{children}</span>
);

export const Avatar = ({ name, large }) => (
  <span className={`adm-avatar ${large ? 'adm-avatar--lg' : ''}`} aria-hidden="true">{initials(name)}</span>
);

export const EmptyState = ({ icon = 'bi-inbox', title, text, action }) => (
  <div className="adm-empty">
    <i className={`bi ${icon}`} aria-hidden="true" />
    <h4>{title}</h4>
    {text && <p>{text}</p>}
    {action}
  </div>
);

/* =====================================================================
   PAGINATION
   ===================================================================== */
function pageList(page, total) {
  const out = [];
  let last = 0;
  const keep = (p) =>
    p === 1 || p === total || Math.abs(p - page) <= 1 ||
    (page <= 3 && p <= 4) || (page >= total - 2 && p >= total - 3);
  for (let p = 1; p <= total; p += 1) {
    if (!keep(p)) continue;
    if (last && p - last > 1) out.push(`gap-${p}`);
    out.push(p);
    last = p;
  }
  return out;
}

export function Pagination({
  page, totalPages, total, perPage, onPage, onPerPage,
  perPageOptions = [5, 10, 25, 50], label = 'results',
}) {
  const from = total ? (page - 1) * perPage + 1 : 0;
  const to = Math.min(total, page * perPage);
  return (
    <div className="adm-pager">
      <span className="adm-pager-info" aria-live="polite">
        {total ? `Showing ${from}–${to} of ${total} ${label}` : `No ${label}`}
      </span>
      <div className="adm-pager-right">
        {onPerPage && (
          <select className="adm-select" value={perPage} onChange={(e) => onPerPage(Number(e.target.value))} aria-label="Rows per page">
            {perPageOptions.map((n) => <option key={n} value={n}>{n} per page</option>)}
          </select>
        )}
        <nav className="adm-pager-pages" aria-label="Pagination">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <i className="bi bi-chevron-left" />
          </button>
          {pageList(page, totalPages).map((p) =>
            typeof p === 'string'
              ? <span key={p} className="adm-gap">…</span>
              : (
                <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}>
                  {p}
                </button>
              )
          )}
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Next page">
            <i className="bi bi-chevron-right" />
          </button>
        </nav>
      </div>
    </div>
  );
}

/* =====================================================================
   TOASTS
   ===================================================================== */
const ToastCtx = createContext(null);
const TOAST_ICONS = {
  success: 'bi-check-circle-fill',
  error: 'bi-x-octagon-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message, opts = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = opts.duration ?? (type === 'error' ? 6500 : 4200);
    setToasts((list) => [...list.slice(-3), { id, type, message, title: opts.title, action: opts.action }]);
    if (duration > 0) timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const api = useMemo(() => ({
    show: push,
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    warning: (m, o) => push('warning', m, o),
    info: (m, o) => push('info', m, o),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="adm-toasts adm-ui" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`adm-toast adm-toast--${t.type}`}>
              <i className={`bi ${TOAST_ICONS[t.type]}`} aria-hidden="true" />
              <div>
                {t.title && <strong>{t.title}</strong>}
                <p>{t.message}</p>
                {t.action && (
                  <button
                    type="button"
                    className="adm-toast-action"
                    onClick={() => { t.action.onClick?.(); dismiss(t.id); }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <i className="bi bi-x" />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <AdminUIProvider>');
  return ctx;
}

/* =====================================================================
   CONFIRM — 2-step confirmation (toast → review → type-to-confirm)
   const ok = await confirm({ title, itemName, consequences, steps: 2 })
   ===================================================================== */
const ConfirmCtx = createContext(null);
const CONFIRM_DEFAULTS = {
  title: 'Delete item', verb: 'Delete', itemName: '', description: '',
  consequences: [], phrase: 'DELETE', steps: 2, variant: 'danger', confirmLabel: '',
};
const VARIANT_ICON = { danger: 'bi-trash3-fill', warning: 'bi-exclamation-triangle-fill', primary: 'bi-question-circle-fill' };

function ConfirmDialog({ opts, onResult }) {
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState('');
  const totalSteps = opts.steps === 1 ? 1 : 2;
  const isFinal = step === totalSteps;
  const phraseOk = totalSteps === 1 || typed.trim().toUpperCase() === opts.phrase.toUpperCase();
  const finalLabel = opts.confirmLabel || opts.verb;
  const btnTone = opts.variant === 'warning' ? 'adm-btn--warn' : 'adm-btn--primary';

  const advance = () => {
    if (!isFinal) setStep(2);
    else if (phraseOk) onResult(true);
  };

  return (
    <Modal
      open
      size="sm"
      role="alertdialog"
      title={opts.title}
      onClose={() => onResult(false)}
      footer={(
        <>
          <button type="button" className="adm-btn adm-btn--ghost" data-autofocus onClick={() => onResult(false)}>Cancel</button>
          {step === 2 && (
            <button type="button" className="adm-btn" onClick={() => { setStep(1); setTyped(''); }}>Back</button>
          )}
          <button
            type="button"
            className={`adm-btn ${isFinal ? btnTone : 'adm-btn--primary'}`}
            disabled={isFinal && !phraseOk}
            onClick={advance}
          >
            {isFinal ? finalLabel : 'Continue'}
          </button>
        </>
      )}
    >
      <div className="adm-confirm">
        <div className={`adm-confirm-icon adm-confirm-icon--${opts.variant}`}>
          <i className={`bi ${VARIANT_ICON[opts.variant] || VARIANT_ICON.danger}`} aria-hidden="true" />
        </div>

        {totalSteps === 2 && (
          <ol className="adm-steps" aria-label="Confirmation progress">
            <li className="on">1. Review</li>
            <li className={step === 2 ? 'on' : ''}>2. Confirm</li>
          </ol>
        )}

        {step === 1 ? (
          <>
            <p>
              {opts.description || (
                <>You're about to {opts.verb.toLowerCase()} <strong>{opts.itemName}</strong>.</>
              )}
            </p>
            {opts.consequences.length > 0 && (
              <ul>{opts.consequences.map((c) => <li key={c}>{c}</li>)}</ul>
            )}
          </>
        ) : (
          <>
            <p>
              This is your final check. Type <code>{opts.phrase}</code> to {opts.verb.toLowerCase()}{' '}
              <strong>{opts.itemName}</strong>.
            </p>
            <input
              className="adm-input"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={typed}
              placeholder={`Type ${opts.phrase}`}
              aria-label={`Type ${opts.phrase} to confirm`}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); advance(); } }}
            />
          </>
        )}
      </div>
    </Modal>
  );
}

export function ConfirmProvider({ children }) {
  const toast = useToast();
  const [req, setReq] = useState(null);
  const reqRef = useRef(null);
  const seq = useRef(0);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    const opts = { ...CONFIRM_DEFAULTS, ...options };
    reqRef.current?.resolve(false); // a newer request supersedes the old one
    toast.warning(
      options.toastMessage || `${opts.verb} “${opts.itemName}”? Please confirm to continue.`,
      { title: 'Confirmation required', duration: 3200 }
    );
    seq.current += 1;
    const next = { id: seq.current, opts, resolve };
    reqRef.current = next;
    setReq(next);
  }), [toast]);

  const finish = (result) => {
    reqRef.current?.resolve(result);
    reqRef.current = null;
    setReq(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {req && <ConfirmDialog key={req.id} opts={req.opts} onResult={finish} />}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used inside <AdminUIProvider>');
  return ctx;
}

/* =====================================================================
   PROVIDER — wrap each admin page (or your admin layout) once
   ===================================================================== */
export function AdminUIProvider({ children }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}