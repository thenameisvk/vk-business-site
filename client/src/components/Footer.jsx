import React from 'react';
import logo from '../assets/vk.png';
import '../styles/user/UserTheme.css';
import '../styles/user/Footer.css';

/* =====================================================================
   EDIT THESE — the footer renders from this config.
   Links with href "#" stay inert until you add a real URL.
   ===================================================================== */
const QUICK_LINKS = [
  { label: 'Home', href: '#home' },
  { label: 'Menu', href: '#menu' },
  { label: 'About us', href: '#about' },
  { label: 'Contact us', href: '#contact' },
];

const SUPPORT_LINKS = [
  { label: 'Terms and conditions', href: '#terms' },   // matches the section on Home
  { label: 'Privacy policy', href: '#privacy' },
  { label: 'Help and FAQs', href: '#help' },
];

const SOCIALS = [
  { label: 'Instagram', icon: 'bi-instagram', href: '#' },
  { label: 'WhatsApp', icon: 'bi-whatsapp', href: '#' },
  { label: 'YouTube', icon: 'bi-youtube', href: '#' },
  { label: 'Facebook', icon: 'bi-facebook', href: '#' },
  { label: 'X (Twitter)', icon: 'bi-twitter-x', href: '#' },
];

/* Fill in any of these and the matching row appears automatically. */
const CONTACT = {
  phone: '',      // e.g. '+91 98765 43210'
  email: '',      // e.g. 'support@vk.com'
  hours: '',      // e.g. 'Mon–Sat, 9 am – 7 pm IST'
};

function Footer() {
  const year = new Date().getFullYear();
  const hasContact = Object.values(CONTACT).some(Boolean);

  const onSocialClick = (e, href) => { if (href === '#') e.preventDefault(); };
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <footer className="vk-footer" aria-label="Site footer">
      <div className="vk-footer-inner">
        <div className="vk-footer-grid">
          {/* Brand */}
          <div className="vk-footer-brand">
            <img src={logo} alt="VK" className="vk-footer-logo" />
            <p>Delivering high-performance management and seamless digital tracking.</p>
            <ul className="vk-social" aria-label="Social media">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    aria-label={s.label}
                    title={s.label}
                    onClick={(e) => onSocialClick(e, s.href)}
                    {...(s.href !== '#' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    <i className={`bi ${s.icon}`} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick links */}
          <nav aria-labelledby="footer-quick">
            <h3 className="vk-footer-h" id="footer-quick">Quick links</h3>
            <ul className="vk-footer-links">
              {QUICK_LINKS.map((l) => <li key={l.label}><a href={l.href}>{l.label}</a></li>)}
            </ul>
          </nav>

          {/* Support */}
          <nav aria-labelledby="footer-support">
            <h3 className="vk-footer-h" id="footer-support">Support</h3>
            <ul className="vk-footer-links">
              {SUPPORT_LINKS.map((l) => <li key={l.label}><a href={l.href}>{l.label}</a></li>)}
            </ul>
          </nav>

          {/* Contact (only when filled in) */}
          {hasContact && (
            <div>
              <h3 className="vk-footer-h">Get in touch</h3>
              <ul className="vk-footer-contact">
                {CONTACT.phone && <li><i className="bi bi-telephone" aria-hidden="true" /><a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}>{CONTACT.phone}</a></li>}
                {CONTACT.email && <li><i className="bi bi-envelope" aria-hidden="true" /><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li>}
                {CONTACT.hours && <li><i className="bi bi-clock" aria-hidden="true" /><span>{CONTACT.hours}</span></li>}
              </ul>
            </div>
          )}
        </div>

        <div className="vk-footer-bottom">
          <p>&copy; {year} VK | INDUSTRIES . All rights reserved.</p>
          <button type="button" className="vk-top" onClick={toTop}>
            Back to top <i className="bi bi-arrow-up" aria-hidden="true" />
          </button>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
