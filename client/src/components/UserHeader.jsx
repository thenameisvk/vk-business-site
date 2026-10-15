import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';

import { NavLink, useNavigate } from 'react-router-dom';

import {
  BsHouse,
  BsBoxArrowRight,
  BsBoxArrowLeft,
  BsTranslate,
  BsChevronDown,
  BsSearch,
} from 'react-icons/bs';

import logo from '../assets/vk.png';
import '../styles/admin/AdminHeader.css';

import { AdminUIProvider, useToast, useConfirm } from '../UI/AdminUI';

// ✅ AuthContext — same source of truth Home uses
import { useAuth } from '../context/Authcontext';

/* =========================================================
   LANGUAGES
========================================================= */

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

const LANG_CODES = LANGUAGES.map((lang) => lang.code).join(',');

/* =========================================================
   GOOGLE TRANSLATE PATCH
========================================================= */

function patchDomForTranslate() {
  if (
    typeof Node === 'undefined' ||
    Node.prototype.__admPatched
  ) {
    return;
  }

  const originalRemoveChild = Node.prototype.removeChild;
  const originalInsertBefore = Node.prototype.insertBefore;

  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) {
      return child;
    }

    return originalRemoveChild.call(this, child);
  };

  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (
      referenceNode &&
      referenceNode.parentNode !== this
    ) {
      return newNode;
    }

    return originalInsertBefore.call(
      this,
      newNode,
      referenceNode
    );
  };

  Node.prototype.__admPatched = true;
}

function clearTranslateCookie() {
  const hostname = window.location.hostname;

  const expired =
    'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';

  document.cookie = `googtrans=; ${expired}`;
  document.cookie = `googtrans=; ${expired}; domain=${hostname}`;
  document.cookie = `googtrans=; ${expired}; domain=.${hostname}`;
}

/* =========================================================
   HEADER BAR
========================================================= */

function HeaderBar({
  // Props become OPTIONAL fallbacks.
  isAuthenticated: isAuthenticatedProp,
  onLogin: onLoginProp,
  onLogout: onLogoutProp,
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  /* ---------------- AUTH CONTEXT ---------------- */

  const {
    session,
    logout: contextLogout,
    isAuthenticated: contextIsAuthenticated,
  } = useAuth();

  // Prefer context; fall back to props so existing usages keep working.
  const isAuthenticated =
    typeof contextIsAuthenticated === 'boolean'
      ? contextIsAuthenticated
      : !!isAuthenticatedProp || !!session;

  /* ---------------- SCROLL BEHAVIOR ---------------- */

  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const lastY = useRef(0);
  const ticking = useRef(false);
  const menuOpenRef = useRef(false);

  useEffect(() => {
    const updateScroll = () => {
      const currentY = window.scrollY;

      setScrolled(currentY > 20);

      setHidden(
        !menuOpenRef.current &&
          currentY > lastY.current &&
          currentY > 80
      );

      lastY.current = currentY;
      ticking.current = false;
    };

    const handleScroll = () => {
      if (!ticking.current) {
        ticking.current = true;
        window.requestAnimationFrame(updateScroll);
      }
    };

    window.addEventListener('scroll', handleScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  /* ---------------- LANGUAGE SELECTOR ---------------- */

  const [currentLang, setCurrentLang] = useState('en');
  const [open, setOpen] = useState(false);
  const [langQuery, setLangQuery] = useState('');

  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  menuOpenRef.current = open;

  useEffect(() => {
    patchDomForTranslate();

    const match = document.cookie.match(
      /googtrans=\/[a-z-]+\/([a-z-]+)/i
    );

    if (match?.[1]) {
      setCurrentLang(match[1]);
    }

    window.googleTranslateElementInit = () => {
      if (!window.google?.translate?.TranslateElement) {
        return;
      }

      new window.google.translate.TranslateElement(
        {
          pageLanguage: 'en',
          includedLanguages: LANG_CODES,
          autoDisplay: false,
        },
        'google_translate_element'
      );
    };

    if (!document.getElementById('google-translate-script')) {
      const script = document.createElement('script');

      script.id = 'google-translate-script';
      script.src =
        'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;

      document.body.appendChild(script);
    }

    return () => {
      // Keep the global callback available for the script.
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };

    document.addEventListener(
      'mousedown',
      handleOutsideClick
    );

    document.addEventListener(
      'touchstart',
      handleOutsideClick,
      { passive: true }
    );

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick
      );

      document.removeEventListener(
        'touchstart',
        handleOutsideClick
      );

      document.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setLangQuery('');
    }
  }, [open]);

  const visibleLangs = useMemo(() => {
    const query = langQuery.trim().toLowerCase();

    if (!query) {
      return LANGUAGES;
    }

    return LANGUAGES.filter(
      (lang) =>
        lang.name.toLowerCase().includes(query) ||
        lang.native.toLowerCase().includes(query)
    );
  }, [langQuery]);

  const changeLanguage = useCallback(
    (code) => {
      setOpen(false);

      if (code === currentLang) {
        return;
      }

      setCurrentLang(code);
      clearTranslateCookie();

      if (code !== 'en') {
        document.cookie = `googtrans=/en/${code}; path=/`;

        document.cookie =
          `googtrans=/en/${code}; path=/; domain=${window.location.hostname}`;
      }

      toast.info('Applying language…', {
        duration: 1500,
      });

      window.setTimeout(() => {
        window.location.reload();
      }, 250);
    },
    [currentLang, toast]
  );

  /* ---------------- LOGIN HANDLER ---------------- */

  const handleLogin = useCallback(
    (event) => {
      const handler =
        typeof onLoginProp === 'function'
          ? onLoginProp
          : undefined;

      if (handler) {
        handler(event);
      }
    },
    [onLoginProp]
  );

  /* ---------------- LOGOUT HANDLER ---------------- */

  const handleLogout = useCallback(async () => {
    try {
      const confirmed = await confirm({
        title: 'Log out',
        verb: 'Log out',
        itemName: 'your account',
        steps: 1,
        variant: 'primary',
        confirmLabel: 'Log out',
        description:
          'You will be signed out of the application on this device.',
        toastMessage: 'Sign out of your account?',
      });

      if (!confirmed) {
        return;
      }

      // ✅ Prefer AuthContext logout; fall back to the prop.
      const doLogout =
        typeof contextLogout === 'function'
          ? contextLogout
          : typeof onLogoutProp === 'function'
            ? onLogoutProp
            : null;

      if (!doLogout) {
        toast.error(
          'Logout handler is not configured. Please wrap the app in <AuthProvider> or pass onLogout.'
        );
        return;
      }

      // Clears session + token and (usually) redirects internally.
      await doLogout();

      toast.success('You have been signed out.');

      // Belt-and-suspenders: ensure we land on /login even if
      // the context's logout doesn't navigate itself.
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout failed:', error);

      toast.error('Logout failed. Please try again.');
    }
  }, [
    confirm,
    contextLogout,
    onLogoutProp,
    navigate,
    toast,
  ]);

  /* ---------------- NAVIGATION ---------------- */

  const currentLabel =
    LANGUAGES.find((lang) => lang.code === currentLang)
      ?.name || 'English';

  const linkClass = ({ isActive }) =>
    isActive ? 'nav-link active' : 'nav-link';

  /* ---------------- RENDER ---------------- */

  return (
    <header
      className={`admin-header ${
        hidden ? 'header-hidden' : 'header-visible'
      } ${scrolled ? 'header-scrolled' : ''}`}
    >
      <nav className="nav" aria-label="Main navigation">
        {/* LOGO */}

        <div className="nav-brand">
          <img src={logo} alt="VK admin" />
        </div>

        <div className="nav-items">
          {/* HOME */}

          <NavLink
            to="/"
            end
            className={linkClass}
            aria-label="Home"
            title="Home"
          >
            <BsHouse
              className="nav-icon"
              aria-hidden="true"
            />

            <span className="nav-label">Home</span>
          </NavLink>

          {/* LANGUAGE SELECTOR */}

          <div
            className="translate-wrapper notranslate"
            translate="no"
            ref={wrapRef}
          >
            <div id="google_translate_element" />

            <button
              ref={btnRef}
              type="button"
              className={`nav-link translate-btn ${
                open ? 'open' : ''
              }`}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`Language: ${currentLabel}`}
              title="Language"
              onClick={() => setOpen((value) => !value)}
            >
              <BsTranslate
                className="nav-icon"
                aria-hidden="true"
              />

              <span className="nav-label">
                {currentLabel}
              </span>

              <BsChevronDown
                className={`chevron ${
                  open ? 'rotate' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {open && (
              <div className="lang-dropdown">
                <div className="lang-dropdown-header">
                  <BsTranslate aria-hidden="true" />
                  <span>Select language</span>
                </div>

                <label className="lang-search">
                  <BsSearch aria-hidden="true" />

                  <input
                    type="search"
                    placeholder="Search language"
                    aria-label="Search language"
                    value={langQuery}
                    onChange={(event) =>
                      setLangQuery(event.target.value)
                    }
                    autoFocus
                  />
                </label>

                <div
                  className="lang-dropdown-body"
                  role="listbox"
                  aria-label="Languages"
                >
                  {visibleLangs.length === 0 && (
                    <p className="lang-empty">
                      No language matches “{langQuery}”.
                    </p>
                  )}

                  {visibleLangs.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      role="option"
                      aria-selected={
                        currentLang === lang.code
                      }
                      className={`lang-option ${
                        currentLang === lang.code
                          ? 'selected'
                          : ''
                      }`}
                      onClick={() =>
                        changeLanguage(lang.code)
                      }
                    >
                      <span className="lang-native">
                        {lang.native}
                      </span>

                      <span className="lang-name">
                        {lang.name}
                      </span>

                      {currentLang === lang.code && (
                        <span
                          className="lang-check"
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* LOGIN / LOGOUT */}

          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleLogout}
              className="nav-link logout-btn"
              aria-label="Log out"
              title="Log out"
            >
              <BsBoxArrowRight
                className="nav-icon"
                aria-hidden="true"
              />

              <span className="nav-label">
                Logout
              </span>
            </button>
          ) : (
            <NavLink
              to="/login"
              onClick={handleLogin}
              className={linkClass}
              aria-label="Log in"
              title="Log in"
            >
              <BsBoxArrowLeft
                className="nav-icon"
                aria-hidden="true"
              />

              <span className="nav-label">
                Login
              </span>
            </NavLink>
          )}
        </div>
      </nav>
    </header>
  );
}

/* =========================================================
   USER HEADER EXPORT
========================================================= */

export default function UserHeader(props) {
  return (
    <AdminUIProvider>
      <HeaderBar {...props} />
    </AdminUIProvider>
  );
}