import React, { useState } from 'react';
import '../styles/user/Contact.css';

const CHANNELS = [
  {
    key: 'phone',
    label: 'Call us',
    value: '+91 85908 98253',
    href: 'tel:+918590898253',
    hint: 'Mon–Sat · 9:00 AM to 7:00 PM',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6a2 2 0 0 1 1.7 2Z" />
      </svg>
    ),
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    value: '+91 85908 98253',
    href: 'https://wa.me/918590898253',
    hint: 'Fastest response · usually within 30 min',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.6A8.4 8.4 0 1 1 21 11.5Z" />
        <path d="M8.5 9.5c0 4 3 7 7 7" />
      </svg>
    ),
  },
  {
    key: 'email',
    label: 'Email',
    value: 'vk920373@gmail.com',
    href: 'mailto:vk920373@gmail.com',
    hint: 'For statements, disputes & documents',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
  },
  {
    key: 'visit',
    label: 'Visit office',
    value: 'Not currently available',
    href: 'https://maps.google.com',
    hint: 'By appointment only',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
];

const FAQ = [
  {
    q: 'I forgot my secret key. What now?',
    a: 'Secret keys are permanent and cannot be regenerated. Please contact us by phone or WhatsApp with your registered name and phone number to verify your identity.',
  },
  {
    q: 'When is my next payment due?',
    a: 'Your dashboard shows the next instalment date and amount for every account. Open the Home page and check the countdown card — it updates live.',
  },
  {
    q: 'Can I pay more than one instalment at once?',
    a: 'Yes. Use “Pay now” on the Home page and enter any amount up to your full outstanding balance. The progress ring and history update instantly.',
  },
  {
    q: 'What happens after the end date?',
    a: 'If your balance is still open after the end date, interest keeps growing daily as described in the Terms section. Please clear it early to avoid extra charges.',
  },
];

export default function Contact() {
  const [form, setForm] = useState({ name: '', contact: '', subject: 'General enquiry', message: '' });
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const setValue = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: '' }));
  };

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Please tell us your name.';
    if (!/^[+\d][\d\s-]{7,}$/.test(form.contact.trim()))
      next.contact = 'Enter a valid phone number or email.';
    if (form.message.trim().length < 10)
      next.message = 'Please write at least 10 characters so we can help.';
    if (Object.keys(next).length) return setErrors(next);

    // TODO: replace with your API call → POST /api/contact
    setSent(true);
    setForm({ name: '', contact: '', subject: 'General enquiry', message: '' });
  };

  return (
    <section className="vk-scope vk-contact" id="contact">
      {/* ---------- Header ---------- */}
      <header className="vk-contact-head">
        <span className="vk-badge vk-badge--dot vk-badge--info">Support</span>
        <h2 className="vk-contact-title">We are here to help</h2>
        <p className="vk-contact-lead">
          Reach us on any channel below — or send a message and we will reply within one working day.
          Please have your secret key ready so we can locate your account quickly.
        </p>
      </header>

      {/* ---------- Channels grid ---------- */}
      <div className="vk-contact-grid">
        {CHANNELS.map((c) => (
          <a
            key={c.key}
            href={c.href}
            target={c.href.startsWith('http') ? '_blank' : undefined}
            rel={c.href.startsWith('http') ? 'noreferrer noopener' : undefined}
            className="vk-card vk-channel"
          >
            <span className="vk-channel-icon" aria-hidden="true">{c.icon}</span>
            <span className="vk-channel-body">
              <small className="vk-channel-label">{c.label}</small>
              <strong className="vk-channel-value">{c.value}</strong>
              <span className="vk-channel-hint">{c.hint}</span>
            </span>
            <span className="vk-channel-arrow" aria-hidden="true">→</span>
          </a>
        ))}
      </div>

      {/* ---------- Two column: form + FAQ ---------- */}
      <div className="vk-contact-split">
        {/* Form */}
        <div className="vk-card vk-form-card">
          <h3 className="vk-section-title">Send a message</h3>
          <p className="vk-hint">We usually respond within one working day.</p>

          {sent && (
            <div className="vk-form-success" role="status">
              <span className="vk-badge vk-badge--success">Message received</span>
              <p>Thanks — our team will get back to you shortly.</p>
            </div>
          )}

          <form className="vk-form" onSubmit={submit} noValidate>
            <div className="vk-field">
              <label className="vk-label" htmlFor="c-name">Your name</label>
              <input
                id="c-name"
                className="vk-input"
                placeholder="e.g. Susan Mathew"
                value={form.name}
                onChange={setValue('name')}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="vk-error">{errors.name}</p>}
            </div>

            <div className="vk-field">
              <label className="vk-label" htmlFor="c-contact">Phone or email</label>
              <input
                id="c-contact"
                className="vk-input"
                placeholder="9876543210 or you@example.com"
                value={form.contact}
                onChange={setValue('contact')}
                aria-invalid={!!errors.contact}
              />
              {errors.contact && <p className="vk-error">{errors.contact}</p>}
            </div>

            <div className="vk-field">
              <label className="vk-label" htmlFor="c-subject">Topic</label>
              <select
                id="c-subject"
                className="vk-input vk-select"
                value={form.subject}
                onChange={setValue('subject')}
              >
                <option>General enquiry</option>
                <option>Payment issue</option>
                <option>Secret key support</option>
                <option>Statement request</option>
                <option>Complaint</option>
              </select>
            </div>

            <div className="vk-field">
              <label className="vk-label" htmlFor="c-message">Message</label>
              <textarea
                id="c-message"
                className="vk-input vk-textarea"
                rows={5}
                placeholder="Tell us how we can help…"
                value={form.message}
                onChange={setValue('message')}
                aria-invalid={!!errors.message}
              />
              {errors.message && <p className="vk-error">{errors.message}</p>}
              <p className="vk-hint">Please do not share your secret key in this message.</p>
            </div>

            <button type="submit" className="vk-btn vk-btn--primary vk-btn--block">
              Send message
            </button>
          </form>
        </div>

        {/* FAQ */}
        <div className="vk-card vk-faq-card">
          <h3 className="vk-section-title">Frequently asked</h3>
          <p className="vk-hint">Quick answers to the most common questions.</p>

          <ul className="vk-faq">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <li key={item.q} className={`vk-faq-item ${open ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="vk-faq-q"
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : i)}
                  >
                    <span>{item.q}</span>
                    <span className="vk-faq-sign" aria-hidden="true">{open ? '−' : '+'}</span>
                  </button>
                  {open && <p className="vk-faq-a">{item.a}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ---------- Bottom notice ---------- */}
      <div className="vk-card vk-contact-note">
        <span className="vk-badge vk-badge--gold">Tip</span>
        <p>
          For faster help, mention your <strong>secret key</strong> (or the name on the account) along with your question.
          Never share your key with anyone outside our official channels — our team will never ask for your password or OTP.
        </p>
      </div>
    </section>
  );
}