'use strict';
// Small shared helpers. No external dependencies.
const crypto = require('node:crypto');

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const B62 = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomId(len = 12) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += B62[bytes[i] % B62.length];
  return out;
}

const now = () => new Date().toISOString();

function addDays(days, from = new Date()) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function money(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount || 0);
  } catch {
    return `${currency} ${round2(amount || 0).toFixed(2)}`;
  }
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

// Plain text -> safe HTML: blank-line paragraphs, "- " bullet lists, **bold**.
function richText(text) {
  if (!text) return '';
  const blocks = String(text).replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return blocks
    .map((block) => {
      const lines = block.split('\n');
      if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
        return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('') + '</ul>';
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
}

// Password hashing with scrypt.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

// Signed session cookies (HMAC-SHA256).
function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readSession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
  return out;
}

// Ready-to-send message for the client (WhatsApp / email).
function shareMessage(quote, businessName, url) {
  const name = quote.client_name ? quote.client_name.split(' ')[0] : 'there';
  const revised = quote.version > 1 || quote.status === 'changes_requested';
  return `Hi ${name}, ${revised ? 'here is the updated quote' : 'here is your quote'} from ${businessName} for "${quote.title}" (${money(quote.totals.total, quote.currency)}).` +
    `\n\nYou can review it and accept online here:\n${url}\n\nThanks!`;
}
const whatsappLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

module.exports = {
  shareMessage, whatsappLink,
  esc, randomId, now, addDays, round2, money, fmtDate, fmtDateTime, richText,
  hashPassword, verifyPassword, signSession, readSession, parseCookies,
};
