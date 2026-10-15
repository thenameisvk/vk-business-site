import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import '../styles/user/UserTheme.css';

/* =====================================================================
   HELPERS
   ===================================================================== */
export const formatINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/* Ticks every `ms`; pauses while the tab is hidden (saves battery). */
export function useTick(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id;
    const start = () => { id = setInterval(() => setNow(new Date()), ms); };
    const onVis = () => {
      clearInterval(id);
      if (!document.hidden) { setNow(new Date()); start(); }
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [ms]);
  return now;
}

/* =====================================================================
   MODAL — Esc, focus trap, scroll lock, focus restore, stacked-safe
   ===================================================================== */
const stack = [];
let locks = 0;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, icon, size, children, footer }) {
  const ref = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const token = Symbol('modal');
    stack.push(token);
    const prev = document.activeElement;
    locks += 1;
    document.body.classList.add('vk-scroll-lock');

    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current?.(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const nodes = ref.current.querySelectorAll(FOCUSABLE);
      if (!nodes.length) return;
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = ref.current;
      if (el && !el.contains(document.activeElement)) (el.querySelector('[data-autofocus]') || el).focus();
    }, 40);

    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      const i = stack.indexOf(token);
      if (i > -1) stack.splice(i, 1);
      locks = Math.max(0, locks - 1);
      if (!locks) document.body.classList.remove('vk-scroll-lock');
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="vk-overlay vk-ui" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={ref} className={`vk-modal ${size === 'lg' ? 'vk-modal--lg' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="vk-modal-head">
          <h2 id={titleId}>{icon && <i className={`bi ${icon}`} aria-hidden="true" />}{title}</h2>
          <button type="button" className="vk-btn vk-btn--ghost vk-btn--icon vk-btn--sm" onClick={onClose} aria-label="Close dialog">
            <i className="bi bi-x-lg" />
          </button>
        </header>
        <div className="vk-modal-body">{children}</div>
        {footer && <footer className="vk-modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

/* =====================================================================
   TOASTS
   ===================================================================== */
const ToastCtx = createContext(null);
const ICONS = { success: 'bi-check-circle-fill', error: 'bi-x-octagon-fill', info: 'bi-info-circle-fill' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});
  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]); delete timers.current[id];
    setToasts((l) => l.filter((t) => t.id !== id));
  }, []);
  const push = useCallback((type, message, opts = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((l) => [...l.slice(-2), { id, type, message, title: opts.title }]);
    timers.current[id] = setTimeout(() => dismiss(id), opts.duration ?? (type === 'error' ? 6000 : 3500));
  }, [dismiss]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const api = useMemo(() => ({
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
  }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="vk-toasts vk-ui" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`vk-toast vk-toast--${t.type}`}>
              <i className={`bi ${ICONS[t.type]}`} aria-hidden="true" />
              <div>{t.title && <strong>{t.title}</strong>}<p>{t.message}</p></div>
              <button type="button" className="vk-btn vk-btn--ghost vk-btn--icon vk-btn--sm" onClick={() => dismiss(t.id)} aria-label="Dismiss"><i className="bi bi-x" /></button>
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
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}