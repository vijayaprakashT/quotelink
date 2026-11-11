'use strict';
// Data layer: users, rate card, quotes, activity. Uses Node's built-in SQLite.
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { randomId, now, addDays, round2, hashPassword } = require('./lib');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'quotelink.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  business_name TEXT NOT NULL,
  business_email TEXT,
  business_address TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate REAL NOT NULL DEFAULT 0,
  default_terms TEXT,
  mcp_key TEXT UNIQUE NOT NULL,
  quote_seq INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_card (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  client_name TEXT,
  client_company TEXT,
  client_email TEXT,
  intro TEXT,
  items TEXT NOT NULL DEFAULT '[]',
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  terms TEXT,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL DEFAULT 'web',
  version INTEGER NOT NULL DEFAULT 1,
  client_message TEXT,
  signed_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  viewed_at TEXT,
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS quotes_user ON quotes(user_id, updated_at);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_quote ON events(quote_id, id);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
`);

const q = (sql) => db.prepare(sql);

// ---------- key/value ----------
function kvGet(k) {
  const row = q('SELECT v FROM kv WHERE k = ?').get(k);
  return row ? row.v : null;
}
function kvSet(k, v) {
  q('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
}

// ---------- users ----------
const STATUSES = ['draft', 'sent', 'viewed', 'changes_requested', 'accepted', 'declined'];
const STATUS_LABEL = {
  draft: 'Draft', sent: 'Sent', viewed: 'Viewed', changes_requested: 'Changes requested',
  accepted: 'Accepted', declined: 'Declined',
};

class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function cleanStr(v, max = 500) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}
function cleanCurrency(v, fallback = 'USD') {
  const s = String(v || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(s)) return fallback;
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: s });
    return s;
  } catch {
    return fallback;
  }
}
function cleanNum(v, { min = 0, max = 1e12, fallback = 0 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function createUser({ email, password, name, business_name, currency }) {
  email = cleanStr(email, 200)?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError('Please enter a valid email.');
  if (!password || String(password).length < 6) throw new AppError('Password must be at least 6 characters.');
  if (q('SELECT 1 FROM users WHERE email = ?').get(email)) throw new AppError('An account with this email already exists.');
  const user = {
    id: randomId(14),
    email,
    password_hash: hashPassword(String(password)),
    name: cleanStr(name, 120),
    business_name: cleanStr(business_name, 120) || cleanStr(name, 120) || email.split('@')[0],
    business_email: email,
    currency: cleanCurrency(currency, 'USD'),
    default_terms:
      '50% deposit due on acceptance, balance due on delivery. Payment within 14 days of invoice. Prices exclude any third-party costs unless listed.',
    mcp_key: 'ql_' + randomId(28),
    created_at: now(),
  };
  q(`INSERT INTO users (id, email, password_hash, name, business_name, business_email, currency, default_terms, mcp_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    user.id, user.email, user.password_hash, user.name, user.business_name, user.business_email,
    user.currency, user.default_terms, user.mcp_key, user.created_at,
  );
  return getUser(user.id);
}

const getUser = (id) => q('SELECT * FROM users WHERE id = ?').get(id) || null;
const getUserByEmail = (email) => q('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase()) || null;
const getUserByKey = (key) => (key ? q('SELECT * FROM users WHERE mcp_key = ?').get(key) || null : null);

function updateProfile(userId, data) {
  const u = getUser(userId);
  if (!u) throw new AppError('User not found', 404);
  const next = {
    business_name: data.business_name !== undefined ? cleanStr(data.business_name, 120) || u.business_name : u.business_name,
    business_email: data.business_email !== undefined ? cleanStr(data.business_email, 200) : u.business_email,
    business_address: data.business_address !== undefined ? cleanStr(data.business_address, 500) : u.business_address,
    name: data.name !== undefined ? cleanStr(data.name, 120) : u.name,
    currency: data.currency !== undefined ? cleanCurrency(data.currency, u.currency) : u.currency,
    tax_rate: data.tax_rate !== undefined ? cleanNum(data.tax_rate, { max: 100 }) : u.tax_rate,
    default_terms: data.default_terms !== undefined ? cleanStr(data.default_terms, 4000) : u.default_terms,
  };
  q(`UPDATE users SET business_name=?, business_email=?, business_address=?, name=?, currency=?, tax_rate=?, default_terms=? WHERE id=?`).run(
    next.business_name, next.business_email, next.business_address, next.name, next.currency, next.tax_rate, next.default_terms, userId,
  );
  if (Array.isArray(data.rate_card)) setRateCard(userId, data.rate_card);
  return getUser(userId);
}

function rotateKey(userId) {
  const key = 'ql_' + randomId(28);
  q('UPDATE users SET mcp_key = ? WHERE id = ?').run(key, userId);
  return key;
}

// ---------- rate card ----------
const getRateCard = (userId) =>
  q('SELECT id, name, unit, unit_price, notes FROM rate_card WHERE user_id = ? ORDER BY position, rowid').all(userId);

function setRateCard(userId, rows) {
  const clean = rows
    .slice(0, 100)
    .map((r) => ({
      name: cleanStr(r.name, 200),
      unit: cleanStr(r.unit, 40),
      unit_price: round2(cleanNum(r.unit_price)),
      notes: cleanStr(r.notes, 500),
    }))
    .filter((r) => r.name);
  db.exec('BEGIN');
  try {
    q('DELETE FROM rate_card WHERE user_id = ?').run(userId);
    const ins = q('INSERT INTO rate_card (id, user_id, name, unit, unit_price, notes, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
    clean.forEach((r, i) => ins.run(randomId(10), userId, r.name, r.unit, r.unit_price, r.notes, i));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getRateCard(userId);
}

// ---------- quotes ----------
function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 100)
    .map((it) => ({
      description: cleanStr(it?.description ?? it?.name, 300),
      details: cleanStr(it?.details, 1000),
      quantity: round2(cleanNum(it?.quantity ?? 1, { max: 1e7, fallback: 1 })),
      unit: cleanStr(it?.unit, 40),
      unit_price: round2(cleanNum(it?.unit_price ?? it?.price, { min: -1e10, max: 1e10 })),
    }))
    .filter((it) => it.description);
}

function totals(quote) {
  const items = typeof quote.items === 'string' ? JSON.parse(quote.items) : quote.items || [];
  const subtotal = round2(items.reduce((sum, it) => sum + round2(it.quantity * it.unit_price), 0));
  const discount = round2(Math.min(Math.max(quote.discount || 0, 0), Math.max(subtotal, 0)));
  const taxable = round2(subtotal - discount);
  const tax = round2((taxable * (quote.tax_rate || 0)) / 100);
  return { subtotal, discount, tax, total: round2(taxable + tax) };
}

function hydrate(row) {
  if (!row) return null;
  const quote = { ...row, items: JSON.parse(row.items || '[]') };
  quote.totals = totals(quote);
  quote.expired = !!(quote.valid_until && quote.valid_until < now().slice(0, 10) && !['accepted', 'declined'].includes(quote.status));
  return quote;
}

function logEvent(quoteId, type, actor, detail = null) {
  q('INSERT INTO events (quote_id, type, actor, detail, created_at) VALUES (?, ?, ?, ?, ?)').run(quoteId, type, actor, detail, now());
}
const getEvents = (quoteId) => q('SELECT type, actor, detail, created_at FROM events WHERE quote_id = ? ORDER BY id DESC LIMIT 50').all(quoteId);

function createQuote(user, data, source = 'web') {
  const items = normalizeItems(data.items);
  const title = cleanStr(data.title, 200);
  if (!title) throw new AppError('A quote needs a title.');
  const seq = (user.quote_seq || 0) + 1;
  q('UPDATE users SET quote_seq = ? WHERE id = ?').run(seq, user.id);
  user.quote_seq = seq;
  const validDays = Math.round(cleanNum(data.valid_days ?? 30, { min: 1, max: 365, fallback: 30 }));
  const ts = now();
  const quote = {
    id: randomId(12),
    number: `Q-${String(seq).padStart(4, '0')}`,
    slug: randomId(16),
    title,
    client_name: cleanStr(data.client_name, 120),
    client_company: cleanStr(data.client_company, 160),
    client_email: cleanStr(data.client_email, 200),
    intro: cleanStr(data.intro, 8000),
    items: JSON.stringify(items),
    currency: cleanCurrency(data.currency, user.currency),
    tax_rate: data.tax_rate !== undefined && data.tax_rate !== null ? cleanNum(data.tax_rate, { max: 100 }) : user.tax_rate || 0,
    discount: round2(cleanNum(data.discount)),
    terms: data.terms !== undefined && data.terms !== null ? cleanStr(data.terms, 4000) : user.default_terms,
    valid_until: /^\d{4}-\d{2}-\d{2}$/.test(data.valid_until || '') ? data.valid_until : addDays(validDays),
  };
  q(`INSERT INTO quotes (id, user_id, number, slug, title, client_name, client_company, client_email, intro, items, currency,
       tax_rate, discount, terms, valid_until, status, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`).run(
    quote.id, user.id, quote.number, quote.slug, quote.title, quote.client_name, quote.client_company, quote.client_email,
    quote.intro, quote.items, quote.currency, quote.tax_rate, quote.discount, quote.terms, quote.valid_until, source, ts, ts,
  );
  logEvent(quote.id, 'created', source === 'claude' ? 'Claude' : 'You', `${items.length} line item${items.length === 1 ? '' : 's'}`);
  return getQuote(user.id, quote.id);
}

function getQuote(userId, ref) {
  if (!ref) return null;
  const r = String(ref).trim();
  const row =
    q('SELECT * FROM quotes WHERE user_id = ? AND id = ?').get(userId, r) ||
    q('SELECT * FROM quotes WHERE user_id = ? AND upper(number) = upper(?)').get(userId, r) ||
    (/^\d+$/.test(r) ? q('SELECT * FROM quotes WHERE user_id = ? AND number = ?').get(userId, `Q-${r.padStart(4, '0')}`) : null);
  return hydrate(row);
}

const getQuoteBySlug = (slug) => hydrate(q('SELECT * FROM quotes WHERE slug = ?').get(String(slug || '')));

function listQuotes(userId, { status, search, limit = 200 } = {}) {
  let sql = 'SELECT * FROM quotes WHERE user_id = ?';
  const args = [userId];
  if (status && STATUSES.includes(status)) {
    sql += ' AND status = ?';
    args.push(status);
  }
  if (search) {
    sql += ' AND (title LIKE ? OR client_name LIKE ? OR client_company LIKE ? OR number LIKE ?)';
    const s = `%${search}%`;
    args.push(s, s, s, s);
  }
  sql += ' ORDER BY updated_at DESC LIMIT ?';
  args.push(Math.min(500, Math.max(1, limit)));
  return q(sql).all(...args).map(hydrate);
}

const EDITABLE = ['title', 'client_name', 'client_company', 'client_email', 'intro', 'items', 'currency', 'tax_rate', 'discount', 'terms', 'valid_until'];

function updateQuote(user, ref, patch, actor = 'You') {
  const existing = getQuote(user.id, ref);
  if (!existing) throw new AppError('Quote not found.', 404);
  if (existing.status === 'accepted') throw new AppError(`${existing.number} was accepted by the client and is locked. Create a new quote for any changes.`, 409);
  const next = {};
  const changed = [];
  for (const field of EDITABLE) {
    if (patch[field] === undefined) continue;
    let v = patch[field];
    if (field === 'items') v = JSON.stringify(normalizeItems(v));
    else if (field === 'currency') v = cleanCurrency(v, existing.currency);
    else if (field === 'tax_rate') v = cleanNum(v, { max: 100 });
    else if (field === 'discount') v = round2(cleanNum(v));
    else if (field === 'valid_until') v = /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : existing.valid_until;
    else if (field === 'title') v = cleanStr(v, 200) || existing.title;
    else v = cleanStr(v, field === 'intro' ? 8000 : field === 'terms' ? 4000 : 200);
    const before = field === 'items' ? JSON.stringify(existing.items) : existing[field];
    if (before !== v) {
      next[field] = v;
      changed.push(field);
    }
  }
  if (patch.valid_days !== undefined && patch.valid_until === undefined) {
    next.valid_until = addDays(Math.round(cleanNum(patch.valid_days, { min: 1, max: 365, fallback: 30 })));
    changed.push('valid_until');
  }
  if (!changed.length) return existing;
  const bump = existing.status !== 'draft' ? 1 : 0;
  const sets = Object.keys(next).map((k) => `${k} = ?`);
  q(`UPDATE quotes SET ${sets.join(', ')}, version = version + ?, updated_at = ? WHERE id = ?`).run(
    ...Object.values(next), bump, now(), existing.id,
  );
  const labels = { items: 'line items', tax_rate: 'tax', valid_until: 'validity', client_name: 'client', client_company: 'company', client_email: 'client email' };
  logEvent(existing.id, 'edited', actor, [...new Set(changed.map((f) => labels[f] || f))].join(', '));
  return getQuote(user.id, existing.id);
}

function sendQuote(user, ref, actor = 'You') {
  const existing = getQuote(user.id, ref);
  if (!existing) throw new AppError('Quote not found.', 404);
  if (['accepted'].includes(existing.status)) return existing;
  if (!existing.items.length) throw new AppError('Add at least one line item before sending.');
  const ts = now();
  q(`UPDATE quotes SET status = 'sent', sent_at = ?, client_message = NULL, updated_at = ? WHERE id = ?`).run(ts, ts, existing.id);
  logEvent(existing.id, existing.sent_at ? 'resent' : 'sent', actor, existing.sent_at ? `version ${existing.version}` : null);
  return getQuote(user.id, existing.id);
}

function deleteQuote(user, ref) {
  const existing = getQuote(user.id, ref);
  if (!existing) throw new AppError('Quote not found.', 404);
  q('DELETE FROM quotes WHERE id = ?').run(existing.id);
  return existing;
}

function duplicateQuote(user, ref) {
  const src = getQuote(user.id, ref);
  if (!src) throw new AppError('Quote not found.', 404);
  return createQuote(user, { ...src, title: src.title, valid_days: 30, valid_until: null }, 'web');
}

// Client-side actions on the public link.
function recordView(quote) {
  if (!['sent', 'viewed'].includes(quote.status)) return;
  const ts = now();
  const last = q(`SELECT created_at FROM events WHERE quote_id = ? AND type = 'viewed' ORDER BY id DESC LIMIT 1`).get(quote.id);
  if (quote.status === 'sent') {
    q(`UPDATE quotes SET status = 'viewed', viewed_at = COALESCE(viewed_at, ?), updated_at = ? WHERE id = ?`).run(ts, ts, quote.id);
  }
  if (!last || Date.now() - new Date(last.created_at).getTime() > 10 * 60 * 1000) {
    logEvent(quote.id, 'viewed', 'Client');
    if (quote.status !== 'sent') q('UPDATE quotes SET updated_at = ? WHERE id = ?').run(ts, quote.id);
  }
}

function respond(slug, { action, name, message }) {
  const quote = getQuoteBySlug(slug);
  if (!quote || quote.status === 'draft') throw new AppError('Quote not found.', 404);
  if (['accepted', 'declined'].includes(quote.status)) throw new AppError('This quote has already been answered.', 409);
  const ts = now();
  const msg = cleanStr(message, 2000);
  if (action === 'accept') {
    if (quote.expired) throw new AppError('This quote has expired. Please ask for an updated quote.', 409);
    const signer = cleanStr(name, 120);
    if (!signer) throw new AppError('Please type your full name to accept.');
    q(`UPDATE quotes SET status = 'accepted', signed_name = ?, client_message = ?, responded_at = ?, updated_at = ? WHERE id = ?`).run(signer, msg, ts, ts, quote.id);
    logEvent(quote.id, 'accepted', 'Client', `Signed by ${signer}`);
  } else if (action === 'changes') {
    if (!msg) throw new AppError('Please tell us what you would like changed.');
    q(`UPDATE quotes SET status = 'changes_requested', client_message = ?, responded_at = ?, updated_at = ? WHERE id = ?`).run(msg, ts, ts, quote.id);
    logEvent(quote.id, 'changes_requested', 'Client', msg);
  } else if (action === 'decline') {
    q(`UPDATE quotes SET status = 'declined', client_message = ?, responded_at = ?, updated_at = ? WHERE id = ?`).run(msg, ts, ts, quote.id);
    logEvent(quote.id, 'declined', 'Client', msg);
  } else {
    throw new AppError('Unknown action.');
  }
  return getQuoteBySlug(slug);
}

function stats(userId) {
  const all = listQuotes(userId, { limit: 500 });
  const open = all.filter((x) => ['sent', 'viewed', 'changes_requested'].includes(x.status));
  const won = all.filter((x) => x.status === 'accepted');
  const decided = all.filter((x) => ['accepted', 'declined'].includes(x.status));
  return {
    count: all.length,
    openCount: open.length,
    openValue: round2(open.reduce((s, x) => s + x.totals.total, 0)),
    wonCount: won.length,
    wonValue: round2(won.reduce((s, x) => s + x.totals.total, 0)),
    winRate: decided.length ? Math.round((won.length / decided.length) * 100) : null,
    needsAttention: all.filter((x) => x.status === 'changes_requested').length,
    drafts: all.filter((x) => x.status === 'draft').length,
  };
}

const lastChange = (userId) => q('SELECT MAX(updated_at) AS t, COUNT(*) AS n FROM quotes WHERE user_id = ?').get(userId);

module.exports = {
  db, AppError, STATUSES, STATUS_LABEL, kvGet, kvSet,
  createUser, getUser, getUserByEmail, getUserByKey, updateProfile, rotateKey,
  getRateCard, setRateCard,
  createQuote, getQuote, getQuoteBySlug, listQuotes, updateQuote, sendQuote, deleteQuote, duplicateQuote,
  recordView, respond, getEvents, stats, lastChange, totals,
};
