import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BsShieldLockFill,
  BsKeyFill,
  BsEyeFill,
  BsEyeSlashFill,
  BsTelephoneFill,
  BsArrowRight,
  BsExclamationCircleFill,
  BsCheckCircleFill,
  BsVolumeUpFill,
  BsVolumeMuteFill,
} from 'react-icons/bs';
import bgvideo from '../../assets/brand-ad.mp4';
import API, { errorMessage } from '../../api';
import { useAuth } from '../../context/Authcontext';

/* Where each kind of user lands after signing in (match your routes) */
const ADMIN_HOME = '/admin';
const USER_HOME = '/user';

function Auth() {
  const [secretKey, setSecretKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(true);

  const videoRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { session, login } = useAuth();
  const [supportPhone, setSupportPhone] = useState('8590898253');

  // already signed in → go straight to the right place
  useEffect(() => {
    if (!session) return;
    const back = location.state?.from?.pathname;
    const home = session.role === 'admin' ? ADMIN_HOME : USER_HOME;
    // only honour "return to the page I was on" if it belongs to this role
    const allowed = back && (session.role === 'admin' ? back.startsWith('/admin') : back.startsWith('/user'));
    navigate(allowed ? back : home, { replace: true });
  }, [session, navigate, location.state]);

  // the support number is managed by the admin (Settings → Business settings)
  useEffect(() => {
    let alive = true;
    API.get('/user/public')
      .then(({ data }) => { if (alive && data.supportPhone) setSupportPhone(data.supportPhone); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  /* ---------- Toggle Video Sound ---------- */
  const toggleSound = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const nextMuted = !muted;
    vid.muted = nextMuted;
    if (!nextMuted) {
      // Some browsers block autoplay with sound until user gesture — play() ensures it starts
      vid.play().catch(() => {});
    }
    setMuted(nextMuted);
  };

  /* ---------- Submit Handler ---------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    const key = secretKey.trim();
    if (!key) {
      setError('Secret key is required');
      return;
    }
    if (key.length < 6) {
      setError('Secret key must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await login(key);              // the effect above redirects once the session is saved
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in. Please try again.'));
      setLoading(false);
    }
  };

  return (
    <>
      <section className="auth-container">
        {/* ---------- Background Video ---------- */}
        <video
          ref={videoRef}
          className="auth-bg-video"
          src={bgvideo}
          autoPlay
          loop
          muted
          playsInline
        />

        {/* ---------- Subtle Overlay (keeps video visible) ---------- */}
        <div className="auth-overlay" />

        {/* ---------- Floating Red/Gold Orbs ---------- */}
        <span className="orb orb-red" />
        <span className="orb orb-gold" />
        <span className="orb orb-red-2" />

        {/* ---------- Sound Toggle (top-right) ---------- */}
        <button
          type="button"
          className={`sound-toggle ${muted ? '' : 'on'}`}
          onClick={toggleSound}
          aria-label={muted ? 'Unmute video' : 'Mute video'}
          title={muted ? 'Turn sound ON' : 'Turn sound OFF'}
        >
          {muted ? <BsVolumeMuteFill /> : <BsVolumeUpFill />}
          <span className="sound-label">{muted ? 'Sound Off' : 'Sound On'}</span>
        </button>

        {/* ---------- Form Box (TRANSPARENT) ---------- */}
        <div className="auth-form-box">
          {/* Snake border */}
          <svg className="snake-border" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="snakeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#ff0033" />
                <stop offset="50%"  stopColor="#ffd700" />
                <stop offset="100%" stopColor="#ff0033" />
              </linearGradient>
            </defs>
            <rect
              x="1" y="1" width="98" height="98"
              rx="3" ry="3"
              fill="none"
              stroke="url(#snakeGrad)"
              strokeWidth="0.6"
              className="snake-line"
            />
          </svg>

          {/* Corner accents (gold + red mix) */}
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />

          {/* ---------- Content ---------- */}
          <div className="auth-form-wrapper">
            <div className="auth-icon-badge">
              <BsShieldLockFill />
            </div>

            <h1 className="auth-title">Secret Key</h1>
            <p className="auth-subtitle">
              A secret key is required to access the application
            </p>

            <form onSubmit={handleSubmit} className="auth-form">
              <label htmlFor="secret-key" className="auth-label">
                <BsKeyFill className="label-icon" /> Secret Key
              </label>

              <div className={`input-wrap ${error ? 'has-error' : ''}`}>
                <BsKeyFill className="input-icon" />
                <input
                  id="secret-key"
                  type={showKey ? 'text' : 'password'}
                  placeholder="Eg: VK1210202603"
                  value={secretKey}
                  onChange={(e) => {
                    setSecretKey(e.target.value);
                    if (error) setError('');
                  }}
                  autoComplete="off"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="toggle-visibility"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <BsEyeSlashFill /> : <BsEyeFill />}
                </button>
              </div>

              {error ? (
                <small className="auth-msg error">
                  <BsExclamationCircleFill /> {error}
                </small>
              ) : (
                <small className="auth-msg hint">
                  <BsCheckCircleFill /> Keep this key private & secure
                </small>
              )}

              <button
                type="submit"
                className={`auth-submit ${loading ? 'loading' : ''}`}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" /> Verifying...
                  </>
                ) : (
                  <>
                    Submit <BsArrowRight className="submit-arrow" />
                  </>
                )}
              </button>
            </form>

            <small className="auth-footer">
              Don't have a secret key?{' '}
              <a href={`tel:${supportPhone}`} className="auth-contact">
                <BsTelephoneFill /> Contact us
              </a>
            </small>
          </div>
        </div>
      </section>

      {/* =========================================================
          INTERNAL CSS
          ========================================================= */}
      <style>{`
        /* -------- Theme Vars -------- */
        :root {
          --red: #ff0033;
          --red-bright: #ff1a4d;
          --red-deep: #b30024;
          --gold: #ffd700;
          --gold-deep: #d4af37;
          --bg-black: #000;
          --text: #fff;
          --text-muted: #b3b3b3;
        }

        /* -------- Container -------- */
        .auth-container {
          position: relative;
          width: 100%;
          min-height: 100vh;
          height: 100vh;
          overflow: hidden;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .auth-bg-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
        }

      
        /* -------- Orbs -------- */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.5;
          z-index: 1;
          pointer-events: none;
          animation: floatOrb 14s ease-in-out infinite;
        }
      
        @keyframes floatOrb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(28px, -28px) scale(1.15); }
        }

        /* -------- Sound Toggle -------- */
        .sound-toggle {
          position: absolute;
          top: 22px;
          right: 22px;
          z-index: 10;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 50px;
          border: 1px solid rgba(255,215,0,0.45);
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: #fff;
          font-family: "Oswald", sans-serif;
          font-size: 0.82rem;
          font-weight: 500;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 0.25s ease, border-color 0.25s ease,
                      box-shadow 0.25s ease, background 0.25s ease, color 0.25s ease;
        }

        .sound-toggle:hover {
          transform: translateY(-2px);
          border-color: var(--gold);
          color: var(--gold);
          box-shadow: 0 0 22px rgba(255,215,0,0.55),
                      0 8px 22px rgba(0,0,0,0.6);
          background: rgba(0,0,0,0.7);
        }

        .sound-toggle.on {
          border-color: var(--red);
          color: var(--red-bright);
          box-shadow: 0 0 22px rgba(255,0,51,0.55);
        }

        .sound-toggle.on:hover {
          border-color: var(--gold);
          color: var(--gold);
          box-shadow: 0 0 22px rgba(255,215,0,0.55);
        }

        .sound-toggle svg { font-size: 1.05rem; }

        /* -------- Form Box (TRANSPARENT) -------- */
        .auth-form-box {
          position: relative;
          z-index: 5;
          width: 100%;
          max-width: 460px;
          padding: 42px 34px;
          border-radius: 20px;

          border: 1px solid rgba(255, 215, 0, 0.35);
          box-shadow:
            0 30px 60px rgba(0,0,0,0.65),
            0 0 40px rgba(255,0,51,0.22),
            inset 0 0 26px rgba(255,215,0,0.06);
          animation: boxEnter 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
          overflow: hidden;
        }

        @keyframes boxEnter {
          from { opacity: 0; transform: translateY(40px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* -------- Snake Moving Border -------- */
        .snake-border {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 1;
        }

        .snake-line {
          stroke-dasharray: 40 260;
          stroke-dashoffset: 0;
          filter:
            drop-shadow(0 0 6px #ff0033)
            drop-shadow(0 0 14px #ffd700);
          animation: snakeRun 4s linear infinite;
        }

        @keyframes snakeRun {
          0%   { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -300; }
        }

        /* -------- Corner Accents -------- */
        .corner {
          position: absolute;
          width: 22px;
          height: 22px;
          pointer-events: none;
          z-index: 2;
        }
        .corner-tl { top: 8px;    left: 8px;   border-top: 2px solid var(--gold);    border-left: 2px solid var(--gold);    border-top-left-radius: 6px;    filter: drop-shadow(0 0 6px rgba(255,215,0,0.9)); }
        .corner-tr { top: 8px;    right: 8px;  border-top: 2px solid var(--red);     border-right: 2px solid var(--red);    border-top-right-radius: 6px;   filter: drop-shadow(0 0 6px rgba(255,0,51,0.9)); }
        .corner-bl { bottom: 8px; left: 8px;   border-bottom: 2px solid var(--red);  border-left: 2px solid var(--red);     border-bottom-left-radius: 6px;  filter: drop-shadow(0 0 6px rgba(255,0,51,0.9)); }
        .corner-br { bottom: 8px; right: 8px;  border-bottom: 2px solid var(--gold); border-right: 2px solid var(--gold);   border-bottom-right-radius: 6px; filter: drop-shadow(0 0 6px rgba(255,215,0,0.9)); }

        /* -------- Wrapper -------- */
        .auth-form-wrapper {
          position: relative;
          z-index: 3;
          text-align: center;
        }

        /* -------- Icon Badge (Red + Gold ring) -------- */
        .auth-icon-badge {
          width: 70px;
          height: 70px;
          margin: 0 auto 18px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          font-size: 1.9rem;
          color: #fff;
          background: radial-gradient(circle at 30% 30%, #ff1a4d 0%, #800019 75%);
          border: 2px solid var(--gold);
          box-shadow:
            0 0 24px rgba(255,0,51,0.65),
            0 0 42px rgba(255,215,0,0.35),
            inset 0 0 14px rgba(0,0,0,0.55);
          animation: badgePulse 2.6s ease-in-out infinite;
        }

        @keyframes badgePulse {
          0%, 100% { box-shadow: 0 0 20px rgba(255,0,51,0.55), 0 0 32px rgba(255,215,0,0.3), inset 0 0 12px rgba(0,0,0,0.6); transform: scale(1); }
          50%      { box-shadow: 0 0 38px rgba(255,0,51,0.95), 0 0 60px rgba(255,215,0,0.6), inset 0 0 12px rgba(0,0,0,0.6); transform: scale(1.05); }
        }

        /* -------- Title & Subtitle -------- */
        .auth-title {
          font-family: "Black Ops One", "Oswald", sans-serif;
          font-size: 1.9rem;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 6px;
          background: linear-gradient(180deg, #ffffff 0%, #ffd700 55%, #ff0033 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 0 14px rgba(255,0,51,0.55));
        }

        .auth-subtitle {
          font-size: 0.88rem;
          color: #e0e0e0;
          margin-bottom: 26px;
          letter-spacing: 0.5px;
          line-height: 1.45;
          text-shadow: 0 1px 6px rgba(0,0,0,0.7);
        }

        /* -------- Form -------- */
        .auth-form {
          display: flex;
          flex-direction: column;
          text-align: left;
          gap: 8px;
        }

        .auth-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 0.78rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1.4px;
          color: var(--gold);
          text-shadow: 0 0 8px rgba(255,215,0,0.5);
          margin-bottom: 2px;
        }
        .label-icon { font-size: 0.95rem; }

        /* -------- Input Wrap -------- */
        .input-wrap {
          position: relative;
          display: flex;
          align-items: center;
          border-radius: 12px;
         
          border: 1px solid rgba(255,215,0,0.35);
          transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease;
        }

        .input-wrap:hover { border-color: rgba(255,215,0,0.65); }

        .input-wrap:focus-within {
          border-color: var(--gold);
          box-shadow:
            0 0 0 3px rgba(255,215,0,0.18),
            0 0 22px rgba(255,215,0,0.5),
            0 0 34px rgba(255,0,51,0.35);
          transform: translateY(-1px);
        }

        .input-wrap.has-error {
          border-color: var(--red);
          box-shadow:
            0 0 0 3px rgba(255,0,51,0.25),
            0 0 22px rgba(255,0,51,0.55);
          animation: shake 0.35s ease;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25%      { transform: translateX(-6px); }
          50%      { transform: translateX(6px); }
          75%      { transform: translateX(-4px); }
        }

        .input-icon {
          position: absolute;
          left: 14px;
          font-size: 1rem;
          color: var(--gold);
          pointer-events: none;
          filter: drop-shadow(0 0 6px rgba(255,215,0,0.6));
        }

        .input-wrap input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          padding: 14px 46px 14px 42px;
          color: #fff;
          font-family: "Oswald", sans-serif;
          font-size: 0.95rem;
          letter-spacing: 1.5px;
          width: 100%;
          text-shadow: 0 1px 4px rgba(0,0,0,0.7);
        }

        .input-wrap input::placeholder {
          color: rgba(255,255,255,0.45);
          letter-spacing: 1px;
          font-size: 0.88rem;
        }

        .toggle-visibility {
          position: absolute;
          right: 10px;
          background: transparent;
          border: none;
          color: #b8b8b8;
          font-size: 1rem;
          cursor: pointer;
          padding: 6px 8px;
          border-radius: 6px;
          display: grid;
          place-items: center;
          transition: color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }
        .toggle-visibility:hover {
          color: var(--gold);
          background: rgba(255,215,0,0.12);
          transform: scale(1.1);
        }

        /* -------- Messages -------- */
        .auth-msg {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          margin: 4px 2px 8px;
          letter-spacing: 0.4px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.7);
        }
        .auth-msg.error { color: #ff7085; }
        .auth-msg.hint  { color: #cfcfcf; }
        .auth-msg.hint svg { color: var(--gold); filter: drop-shadow(0 0 6px rgba(255,215,0,0.7)); }

        /* -------- Submit Button (Red→Gold) -------- */
        .auth-submit {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-top: 6px;
          padding: 14px 22px;
          border: 1px solid rgba(255,215,0,0.55);
          border-radius: 12px;
          font-family: "Oswald", sans-serif;
          font-size: 1rem;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #fff;
          cursor: pointer;
          overflow: hidden;
          background: linear-gradient(135deg, #ff0033 0%, #b30024 55%, #7a6500 100%);
          background-size: 200% 200%;
          background-position: 0% 50%;
          box-shadow:
            0 10px 25px rgba(255,0,51,0.4),
            0 0 26px rgba(255,215,0,0.25),
            inset 0 0 15px rgba(0,0,0,0.3);
          transition:
            transform 0.25s ease,
            box-shadow 0.3s ease,
            background-position 0.6s ease,
            filter 0.25s ease;
          text-shadow: 0 1px 4px rgba(0,0,0,0.6);
        }

        .auth-submit::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255,215,0,0.55) 50%, transparent 70%);
          transform: translateX(-100%);
          transition: transform 0.75s ease;
        }

        .auth-submit:hover::before { transform: translateX(100%); }

        .auth-submit:hover:not(:disabled) {
          transform: translateY(-3px);
          background-position: 100% 50%;
          box-shadow:
            0 16px 35px rgba(255,0,51,0.65),
            0 0 34px rgba(255,215,0,0.6),
            inset 0 0 15px rgba(0,0,0,0.3);
          filter: brightness(1.1);
        }

        .auth-submit:active:not(:disabled) {
          transform: translateY(-1px) scale(0.99);
        }

        .auth-submit:disabled {
          opacity: 0.85;
          cursor: wait;
        }

        .submit-arrow { transition: transform 0.25s ease; }
        .auth-submit:hover:not(:disabled) .submit-arrow { transform: translateX(5px); }

        /* -------- Spinner -------- */
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* -------- Footer -------- */
        .auth-footer {
          display: block;
          margin-top: 22px;
          font-size: 0.82rem;
          color: #dcdcdc;
          letter-spacing: 0.3px;
          text-shadow: 0 1px 6px rgba(0,0,0,0.75);
        }

        .auth-contact {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--gold);
          font-weight: 600;
          text-decoration: none;
          margin-left: 4px;
          transition: color 0.2s ease, text-shadow 0.2s ease;
        }
        .auth-contact:hover {
          color: #fff;
          text-shadow: 0 0 12px rgba(255,215,0,0.95);
        }

        /* =========================================================
           RESPONSIVE
           ========================================================= */
        @media (max-width: 520px) {
          .sound-toggle {
            top: 14px;
            right: 14px;
            padding: 8px 12px;
            font-size: 0.72rem;
          }
          .sound-label { display: none; }

          .auth-form-box {
            padding: 30px 22px;
            border-radius: 16px;
            max-width: 100%;
          }

          .auth-icon-badge {
            width: 56px;
            height: 56px;
            font-size: 1.55rem;
            margin-bottom: 14px;
          }

          .auth-title { font-size: 1.55rem; letter-spacing: 1.5px; }
          .auth-subtitle { font-size: 0.82rem; margin-bottom: 20px; }

          .input-wrap input {
            padding: 12px 42px 12px 40px;
            font-size: 0.88rem;
          }

          .auth-submit {
            padding: 12px 18px;
            font-size: 0.92rem;
            letter-spacing: 1.5px;
          }

          .auth-footer { font-size: 0.76rem; }
          .corner { width: 16px; height: 16px; }
          .orb-red { width: 220px; height: 220px; }
          .orb-gold { width: 180px; height: 180px; }
          .orb-red-2 { display: none; }
        }

        @media (max-width: 360px) {
          .auth-form-box { padding: 24px 16px; }
          .auth-title { font-size: 1.3rem; }
        }

        /* Accessibility */
        @media (prefers-reduced-motion: reduce) {
          .snake-line,
          .orb,
          .auth-icon-badge,
          .auth-submit::before,
          .spinner {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}

export default Auth;