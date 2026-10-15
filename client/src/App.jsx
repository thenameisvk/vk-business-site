import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, Outlet } from 'react-router-dom';
import './App.css';

import nobg from './assets/brand-ad.webm'

// Context & Protected Routes (Make sure these paths match your folder structure)
import { AuthProvider } from './context/Authcontext';
import ProtectedRoute from './components/Protectedroute';

// Layouts
import UserLayout from './Layouts/UserLayout';
import AdminLayout from './Layouts/AdminLayout';

// Pages
import Home from './Pages/user/Home';
import Auth from './Pages/user/Auth';
import Dashboard from './Pages/admin/Dashboard';
import Settings from './Pages/admin/Settings';

/* =====================================================================
   NETWORK HOOK — tracks real connectivity
   ===================================================================== */
function useNetworkStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    const conn =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
    if (!conn) return;

    const check = () => {
      const eff = conn.effectiveType || '';
      setSlow(eff === '2g' || eff === 'slow-2g');
    };
    check();
    conn.addEventListener?.('change', check);
    return () => conn.removeEventListener?.('change', check);
  }, []);

  return { online, slow };
}

/* =====================================================================
   DRAGON LOADER (pure CSS — real dragon silhouette)
   ===================================================================== */
function DragonLoader() {
  return (
    <div className="dragon-stage" aria-hidden="true">
<video src={nobg}  autoPlay muted loop></video>
    </div>
  );
}

/* =====================================================================
   LOADING OVERLAY — smart, offline-aware
   ===================================================================== */
function LoadingOverlay({ onRetry, onSkip }) {
  const { online, slow } = useNetworkStatus();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (online) setSeconds(0);
  }, [online]);

  const headline = !online
    ? "You're offline"
    : slow
      ? 'Slow connection detected'
      : 'Loading application';

  const subtext = !online
    ? 'Reconnect to continue. This page will resume automatically.'
    : slow
      ? `Patience pays — taking longer than usual (${seconds}s)`
      : `Preparing your dashboard (${seconds}s)`;

  const showRetry = !online && seconds > 2;
  const showSkip = online && seconds > 6 && slow;

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-veil" />

      <DragonLoader />

      <div className="loading-text">
        <div className="loading-status">
          <span className={`status-dot ${online ? 'is-online' : 'is-offline'}`} />
          <span className="status-label">
            {online ? (slow ? 'Weak signal' : 'Connected') : 'No internet'}
          </span>
        </div>

        <h2 className="loading-title">{headline}</h2>
        <p className="loading-sub">
          {subtext}
          <span className="loading-dots">
            <i /><i /><i />
          </span>
        </p>

        {(showRetry || showSkip) && (
          <div className="loading-actions">
            {showRetry && (
              <button type="button" className="btn-retry" onClick={onRetry}>
                <span className=""><i class="bi bi-arrow-clockwise"></i></span> Retry now
              </button>
            )}
            {showSkip && (
              <button type="button" className="btn-skip" onClick={onSkip}>
                Continue anyway
              </button>
            )}
          </div>
        )}

        {!online && (
          <div className="offline-hint">
            <span className="hint-key">Tip</span>
            Check Wi-Fi, mobile data, or move closer to your router.
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   404 PAGE — enhanced with dragon motif + light sweep
   ===================================================================== */
function NotFound() {
  return (
    <section className="not-found image-wrapper">
      <video
        className="not-found-video base-image"
        autoPlay
        muted
        loop
        playsInline
        src="../404.mp4"
      />

      <div className="not-found-scrim" />

      <div className="light-sweep-overlay" aria-hidden="true">
        <div className="light-beam red-beam" />
        <div className="light-beam gold-beam" />
      </div>

      <div className="pnf-embers" aria-hidden="true">
        <span className="pnf-ember e1" />
        <span className="pnf-ember e2" />
        <span className="pnf-ember e3" />
        <span className="pnf-ember e4" />
        <span className="pnf-ember e5" />
      </div>

      <div className="pnf-text">
        <span className="pnf-kicker">Lost in the dark</span>
        <h1 className="pnf-code">404</h1>
        <h3 className="pnf-title">Page not found</h3>
        <p className="pnf-sub">
          The page you are looking for has moved, expired, or never existed.
        </p>

        <div className="pnf-actions">
          <Link to="/" className="pnf-btn pnf-btn--primary">
            ← Back to login
          </Link>
          <Link to="/user" className="pnf-btn pnf-btn--ghost">
            Go to dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}

/* =====================================================================
   MAIN APP COMPONENT
   ===================================================================== */
export default function App() {
  const { online } = useNetworkStatus();
  const [isLoading, setIsLoading] = useState(true);
  const [manualSkip, setManualSkip] = useState(false);
  const minLoadMs = 2200;
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (manualSkip) return;

    if (!online) {
      setIsLoading(true);
      return;
    }

    const remaining = Math.max(0, minLoadMs - (Date.now() - startRef.current));
    const t = setTimeout(() => setIsLoading(false), remaining);
    return () => clearTimeout(t);
  }, [online, manualSkip]);

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setManualSkip(false);
    startRef.current = Date.now();
    if (navigator.onLine) {
      setTimeout(() => setIsLoading(false), minLoadMs);
    }
  }, []);

  const handleSkip = useCallback(() => {
    setManualSkip(true);
    setIsLoading(false);
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        {isLoading && <LoadingOverlay onRetry={handleRetry} onSkip={handleSkip} />}

        <div className={`app-wrapper ${isLoading ? 'content-blurred' : ''}`}>
          <Routes>
            {/* Public Authentication Route */}
            <Route path="/" element={<Auth title="VK | Authentication" />} />
            <Route path="/login" element={<Auth title="VK | Authentication" />} />

            {/* User Routes (Protected) */}
            <Route element={<ProtectedRoute role="user" />}>
              <Route path="/user" element={<UserLayout title="VK | Home" />}>
                <Route index element={<Home />} />
              </Route>
            </Route>

            {/* Admin Routes (Protected) */}
            <Route element={<ProtectedRoute role="admin" />}>
              <Route path="/admin" element={<AdminLayout title="Admin Dashboard" />}>
                <Route index element={<Dashboard />} />
                <Route path="settings" element={<Settings title="Settings" />} />
              </Route>
            </Route>

            {/* Catch-all 404 Route */}
            <Route path="*" element={<NotFound title="VK | Page Not Found 404" />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}