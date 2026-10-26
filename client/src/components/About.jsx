import React, { useState, useEffect, useRef } from "react";
import '../styles/user/About.css';

const fullText = "Download The CSV OF Each Payments. Because when the payment became completed the Data will be automatically destroyed.";

const STATS = [
  { key: 'users', label: 'Active customers', value: '1,200+' },
  { key: 'years', label: 'Years serving', value: '6' },
  { key: 'loans', label: 'Loans closed', value: '8,400+' },
  { key: 'cities', label: 'Cities covered', value: '24' },
];

const VALUES = [
  {
    key: 'transparent',
    title: 'Transparent by design',
    text: 'Every rupee you borrow, repay, and owe is visible on one screen. No hidden fees, no surprise charges.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: 'fast',
    title: 'Fast decisions',
    text: 'Most loans are approved the same day. Payments are recorded instantly and your balance updates live.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
      </svg>
    ),
  },
  {
    key: 'secure',
    title: 'Private & secure',
    text: 'Your secret key is the only way in. Messages are encrypted in transit and auto-delete within 24 hours.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    key: 'human',
    title: 'Human support',
    text: 'Call, chat, or message — a real person on our team handles every query, not a bot.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      </svg>
    ),
  },
];

const STEPS = [
  { n: '01', title: 'Get your key', text: 'Receive a permanent secret key (VK + date + order number) after verification.' },
  { n: '02', title: 'Track everything', text: 'Log in any time to see your loans, payments, and live countdown on one page.' },
  { n: '03', title: 'Pay your way', text: 'Weekly, monthly, or daily — always know the exact amount and next due date.' },
  { n: '04', title: 'Close and relax', text: 'Once your balance hits zero, the account is marked complete. No further charges.' },
];

export default function About() {
  const [displayedText, setDisplayedText] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef(null);

  // Web Audio API to generate a subtle mechanical clicking/typing sound effect without external files
  const playTypeSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(800, audioCtx.currentTime); // High pitch click
      osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.03);

      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.03);
    } catch (e) {
      // AudioContext policy fallback if user hasn't interacted yet
    }
  };

  // Intersection Observer to detect when text is visible on screen
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.5 } // Trigger when 50% of text is visible
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) observer.unobserve(containerRef.current);
    };
  }, []);

  // Endless typing loop effect when visible
  useEffect(() => {
    if (!isVisible) {
      setDisplayedText(""); // Reset when scrolled away
      return;
    }

    let currentIndex = 0;
    let isDeleting = false;
    let timer;

    const typeLoop = () => {
      if (!isDeleting) {
        // Typing forward
        if (currentIndex <= fullText.length) {
          setDisplayedText(fullText.substring(0, currentIndex));
          if (currentIndex > 0) playTypeSound();
          currentIndex++;
          timer = setTimeout(typeLoop, 50); // Typing speed
        } else {
          // Pause at the end before restarting loop
          timer = setTimeout(() => {
            isDeleting = true;
            typeLoop();
          }, 3000);
        }
      } else {
        // Instantly reset or quickly backspace to loop smoothly
        setDisplayedText("");
        currentIndex = 0;
        isDeleting = false;
        timer = setTimeout(typeLoop, 500);
      }
    };

    timer = setTimeout(typeLoop, 300);

    return () => clearTimeout(timer);
  }, [isVisible]);

  return (
    <section className="vk-scope vk-about" id="about">
        
       <div ref={containerRef} className="typing-warning-container">
        <h1 className="typing-text">
          {displayedText}
          <span className="blinking-cursor">|</span>
        </h1>
      </div>

      {/* ---------- Hero ---------- */}
      <header className="vk-about-hero">
        <span className="vk-badge vk-badge--dot vk-badge--gold">About us</span>
        <h2 className="vk-about-title">
          Simple lending. <span className="vk-about-title-accent">Honest numbers.</span>
        </h2>
        <p className="vk-about-lead">
          <strong>VK Industries</strong> is a huge, focused lending service built for people who want clarity — not paperwork.
          We show you exactly what you owe, when it is due, and how close you are to closing the account.
          That's it. Nothing hidden, nothing extra.
        </p>
      </header>

      {/* ---------- Stats strip ---------- */}
      <div className="vk-about-stats">
        {STATS.map((s) => (
          <div key={s.key} className="vk-card vk-stat">
            <strong className="vk-stat-value vk-num">{s.value}</strong>
            <span className="vk-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ---------- Values ---------- */}
      <section className="vk-about-section">
        <h3 className="vk-section-title">What we stand for</h3>
        <p className="vk-hint">Four principles that shape every decision we make.</p>

        <div className="vk-values">
          {VALUES.map((v) => (
            <article key={v.key} className="vk-card vk-value">
              <span className="vk-value-icon" aria-hidden="true">{v.icon}</span>
              <h4 className="vk-value-title">{v.title}</h4>
              <p className="vk-value-text">{v.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="vk-about-section">
        <h3 className="vk-section-title">How it works</h3>
        <p className="vk-hint">From first contact to final payment, in four steps.</p>

        <ol className="vk-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="vk-step">
              <span className="vk-step-num vk-num">{s.n}</span>
              <div className="vk-step-body">
                <h4 className="vk-step-title">{s.title}</h4>
                <p className="vk-step-text">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Commitment note ---------- */}
      <div className="vk-card vk-about-note">
        <span className="vk-badge vk-badge--danger">Our promise</span>
        <p>
          We will never call you asking for a password, OTP, or secret key.
          If anyone does, it is not us — please report it to our official number right away.
        </p>
      </div>
    </section>
  );
                            }
