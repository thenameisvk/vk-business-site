import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BsSpeedometer2, BsGear, BsBoxArrowRight, BsTranslate, BsChevronDown, BsSearch } from 'react-icons/bs';
import logo from '../assets/vk.png';

import '../styles/admin/AdminHeader.css';
import { AdminUIProvider, useToast, useConfirm } from '../UI/AdminUI';
import { useAuth } from '../context/Authcontext';

/* =====================================================================
   LANGUAGES
   ===================================================================== */
const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
];
const LANG_CODES = LANGUAGES.map((l) => l.code).join(',');

/* Google Translate rewrites text nodes, which makes React throw
   "removeChild / insertBefore" errors on the next re-render. This is the
   standard, safe workaround — applied once for the whole app. */
function patchDomForTranslate() {
  if (typeof Node === 'undefined' || Node.prototype.__admPatched) return;
  const { removeChild, insertBefore } = Node.prototype;
  Node.prototype.removeChild = function patchedRemove(child) {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child);
  };
  Node.prototype.insertBefore = function patchedInsert(newNode, ref) {
    if (ref && ref.parentNode !== this) return newNode;
    return insertBefore.call(this, newNode, ref);
  };
  Node.prototype.__admPatched = true;
}

function clearTranslateCookie() {
  const host = window.location.hostname;
  const expired = 'expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  document.cookie = `googtrans=; ${expired}`;
  document.cookie = `googtrans=; ${expired}; domain=${host}`;
  document.cookie = `googtrans=; ${expired}; domain=.${host}`;
}

/* =====================================================================
   HEADER
   ===================================================================== */
function HeaderBar({ onLogout }) {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { logout } = useAuth();

  /* ---------- Hide on scroll down, show on scroll up ---------- */
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);
  const menuOpenRef = useRef(false);

  useEffect(() => {
    const update = () => {
      const y = window.scrollY;
      setScrolled(y > 20);
      // never hide while the language menu is open
      setHidden(!menuOpenRef.current && y > lastY.current && y > 80);
      lastY.current = y;
      ticking.current = false;
    };
    const onScroll = () => {
      if (!ticking.current) {
        ticking.current = true;
        window.requestAnimationFrame(update);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ---------- Language menu ---------- */
  const [currentLang, setCurrentLang] = useState('en');
  const [open, setOpen] = useState(false);
  const [langQuery, setLangQuery] = useState('');
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  menuOpenRef.current = open;

  useEffect(() => {
    patchDomForTranslate();
    const match = document.cookie.match(/googtrans=\/[a-z-]+\/([a-z-]+)/i);
    if (match?.[1]) setCurrentLang(match[1]);

    window.googleTranslateElementInit = () => {
      // eslint-disable-next-line no-new
      new window.google.translate.TranslateElement(
        { pageLanguage: 'en', includedLanguages: LANG_CODES, autoDisplay: false },
        'google_translate_element'
      );
    };
    if (!document.getElementById('google-translate-script')) {
      const script = document.createElement('script');
      script.id = 'google-translate-script';
      script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // close on outside click / Esc
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (!open) setLangQuery(''); }, [open]);

  const visibleLangs = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    return q ? LANGUAGES.filter((l) => l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q)) : LANGUAGES;
  }, [langQuery]);

  const changeLanguage = useCallback((code) => {
    setOpen(false);
    if (code === currentLang) return;
    setCurrentLang(code);
    clearTranslateCookie();
    if (code !== 'en') {
      document.cookie = `googtrans=/en/${code}; path=/`;
      document.cookie = `googtrans=/en/${code}; path=/; domain=${window.location.hostname}`;
    }
    toast.info('Applying language…', { duration: 1500 });
    setTimeout(() => window.location.reload(), 250);
  }, [currentLang, toast]);

  /* ---------- Logout (confirmed) ---------- */
  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Log out', verb: 'Log out', itemName: 'your admin account', steps: 1, variant: 'primary', confirmLabel: 'Log out',
      description: 'You will be signed out of the admin panel on this device.',
      toastMessage: 'Sign out of the admin panel?',
    });
    if (!ok) return;
    if (onLogout) onLogout();
    logout();                                   // clears the token + session
    navigate('/login', { replace: true });
  };

  const currentLabel = LANGUAGES.find((l) => l.code === currentLang)?.name || 'English';
  const linkClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');

  return (
    <header className={`admin-header ${hidden ? 'header-hidden' : 'header-visible'} ${scrolled ? 'header-scrolled' : ''}`}>
      <nav className="nav" aria-label="Admin navigation">
        <div className="nav-brand"><img src={logo} alt="VK admin" /></div>

        <div className="nav-items">
          <NavLink to="/admin" end className={linkClass} aria-label="Dashboard" title="Dashboard">
            <BsSpeedometer2 className="nav-icon" aria-hidden="true" />
            <span className="nav-label">Dashboard</span>
          </NavLink>

          <NavLink to="/admin/settings" className={linkClass} aria-label="Settings" title="Settings">
            <BsGear className="nav-icon" aria-hidden="true" />
            <span className="nav-label">Settings</span>
          </NavLink>

          {/* Language */}
          <div className="translate-wrapper notranslate" translate="no" ref={wrapRef}>
            <div id="google_translate_element" />
            <button
              ref={btnRef}
              type="button"
              className={`nav-link translate-btn ${open ? 'open' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`Language: ${currentLabel}`}
              title="Language"
              onClick={() => setOpen((v) => !v)}
            >
              <BsTranslate className="nav-icon" aria-hidden="true" />
              <span className="nav-label">{currentLabel}</span>
              <BsChevronDown className={`chevron ${open ? 'rotate' : ''}`} aria-hidden="true" />
            </button>

            {open && (
              <div className="lang-dropdown">
                <div className="lang-dropdown-header"><BsTranslate aria-hidden="true" /> Select language</div>
                <label className="lang-search">
                  <BsSearch aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="Search language"
                    aria-label="Search language"
                    value={langQuery}
                    onChange={(e) => setLangQuery(e.target.value)}
                    autoFocus
                  />
                </label>
                <div className="lang-dropdown-body" role="listbox" aria-label="Languages">
                  {visibleLangs.length === 0 && <p className="lang-empty">No language matches “{langQuery}”.</p>}
                  {visibleLangs.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      role="option"
                      aria-selected={currentLang === lang.code}
                      className={`lang-option ${currentLang === lang.code ? 'selected' : ''}`}
                      onClick={() => changeLanguage(lang.code)}
                    >
                      <span className="lang-native">{lang.native}</span>
                      <span className="lang-name">{lang.name}</span>
                      {currentLang === lang.code && <span className="lang-check" aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button type="button" onClick={handleLogout} className="nav-link logout-btn" aria-label="Log out" title="Log out">
            <BsBoxArrowRight className="nav-icon" aria-hidden="true" />
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </nav>
    </header>
  );
}

/* Wrapped so the header can use toasts + confirm without any layout change.
   If you already wrap your admin layout in <AdminUIProvider>, this is harmless. */
export default function AdminHeader(props) {
  return (
    <AdminUIProvider>
      <HeaderBar {...props} />
    </AdminUIProvider>
  );
}