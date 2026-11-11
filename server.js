'use strict';
// QuoteLink — client quotes written by your Claude (via MCP), edited and signed in QuoteLink.
// Zero runtime dependencies: Node's built-in http + sqlite. No AI inside.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const store = require('./store');
const views = require('./views');
const mcp = require('./mcp');
const { signSession, readSession, parseCookies, verifyPassword } = require('./lib');
const { seedDemo, DEMO_EMAIL, DEMO_PASSWORD } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const SECRET = process.env.SESSION_SECRET || store.kvGet('session_secret') || (() => {
  const s = crypto.randomBytes(32).toString('hex');
  store.kvSet('session_secret', s);
  return s;
})();
const COOKIE = 'ql_session';
const SESSION_DAYS = 30;

// ---------- helpers ----------
function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket.encrypted ? 'https' : 'http');
  const host = (req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`).split(',')[0].trim();
  return `${proto}://${host}`;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
const html = (res, body, status = 200, headers = {}) => send(res, status, body, { 'Cache-Control': 'no-store', ...headers });
const json = (res, data, status = 200) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
const redirect = (res, to, headers = {}) => send(res, 303, '', { Location: to, ...headers });

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new store.AppError('Request too large', 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function parseBody(req) {
  const raw = await readBody(req);
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) {
    try { return JSON.parse(raw || '{}'); } catch { throw new store.AppError('Invalid JSON'); }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function sessionCookie(userId) {
  const token = signSession({ uid: userId, exp: Date.now() + SESSION_DAYS * 864e5 }, SECRET);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
const clearCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
function currentUser(req) {
  const s = readSession(parseCookies(req.headers.cookie)[COOKIE], SECRET);
  return s ? store.getUser(s.uid) : null;
}
const mcpUrlFor = (req, user) => `${baseUrl(req)}/mcp/${user.mcp_key}`;
const revFor = (userId) => {
  const r = store.lastChange(userId);
  return `${r.t || ''}|${r.n}`;
};

// ---------- static ----------
const STATIC_DIR = path.join(__dirname, 'public');
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveStatic(res, file) {
  const full = path.join(STATIC_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(STATIC_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return html(res, views.notFound(), 404);
  send(res, 200, fs.readFileSync(full), { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, pattern, handler, ...opts });

// Marketing & auth
route('GET', /^\/$/, (req, res) => html(res, views.landing({ demoEmail: DEMO_EMAIL, demoPassword: DEMO_PASSWORD, loggedIn: !!currentUser(req) })));
route('GET', /^\/healthz$/, (req, res) => json(res, { ok: true }));
route('GET', /^\/login$/, (req, res) => (currentUser(req) ? redirect(res, '/app') : html(res, views.authPage('login'))));
route('GET', /^\/signup$/, (req, res) => (currentUser(req) ? redirect(res, '/app') : html(res, views.authPage('signup'))));
route('POST', /^\/login$/, async (req, res) => {
  const body = await parseBody(req);
  const user = store.getUserByEmail(body.email);
  if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) {
    return html(res, views.authPage('login', { error: 'Wrong email or password.', values: body }), 401);
  }
  redirect(res, '/app', { 'Set-Cookie': sessionCookie(user.id) });
});
route('POST', /^\/signup$/, async (req, res) => {
  const body = await parseBody(req);
  try {
    const user = store.createUser(body);
    redirect(res, '/app/connect?welcome=1', { 'Set-Cookie': sessionCookie(user.id) });
  } catch (err) {
    if (!(err instanceof store.AppError)) throw err;
    html(res, views.authPage('signup', { error: err.message, values: body }), 400);
  }
});
route('POST', /^\/logout$/, (req, res) => redirect(res, '/', { 'Set-Cookie': clearCookie }));
route('GET', /^\/demo$/, (req, res) => {
  const demo = store.getUserByEmail(DEMO_EMAIL);
  if (!demo) return redirect(res, '/login');
  redirect(res, '/app', { 'Set-Cookie': sessionCookie(demo.id) });
});

// App (logged in)
route('GET', /^\/app\/?$/, (req, res, { user, url }) => {
  const filter = url.searchParams.get('status') || '';
  html(res, views.dashboard(user, {
    quotes: store.listQuotes(user.id, { status: filter }),
    stats: store.stats(user.id),
    filter,
    mcpUrl: mcpUrlFor(req, user),
    rev: revFor(user.id),
    usage: store.usage(user),
  }));
}, { auth: true });
route('GET', /^\/app\/quotes\/new$/, (req, res, { user }) => store.usage(user).atLimit ? redirect(res, '/app/plan') : html(res, views.editor(user, { quote: null, base: baseUrl(req), rateCard: store.getRateCard(user.id) })), { auth: true });
route('GET', /^\/app\/quotes\/([\w-]+)$/, (req, res, { user, m }) => {
  const quote = store.getQuote(user.id, m[1]);
  if (!quote) return html(res, views.notFound('Quote not found'), 404);
  html(res, views.editor(user, { quote, events: store.getEvents(quote.id), base: baseUrl(req), rateCard: store.getRateCard(user.id) }));
}, { auth: true });
route('POST', /^\/app\/quotes\/([\w-]+)\/duplicate$/, (req, res, { user, m }) => {
  const copy = store.duplicateQuote(user, m[1]);
  redirect(res, `/app/quotes/${copy.id}`);
}, { auth: true });
route('GET', /^\/app\/settings$/, (req, res, { user, url }) => html(res, views.settings(user, { rateCard: store.getRateCard(user.id), saved: url.searchParams.has('saved') })), { auth: true });
route('GET', /^\/app\/plan$/, (req, res, { user, url }) => html(res, views.planPage(user, { usage: store.usage(user), flash: url.searchParams.has('upgraded') ? 'You are now on Pro — unlimited quotes. Thanks for being an early user!' : null })), { auth: true });
route('POST', /^\/app\/plan\/upgrade$/, (req, res, { user }) => {
  store.setPlan(user.id, 'pro');
  redirect(res, '/app/plan?upgraded=1');
}, { auth: true });
route('GET', /^\/app\/connect$/, (req, res, { user }) => html(res, views.connect(user, { mcpUrl: mcpUrlFor(req, user) })), { auth: true });
route('POST', /^\/app\/connect\/rotate$/, (req, res, { user }) => {
  if (user.email === DEMO_EMAIL) return redirect(res, '/app/connect'); // keep the shared demo URL stable
  store.rotateKey(user.id);
  redirect(res, '/app/connect');
}, { auth: true });

// App JSON API
route('GET', /^\/app\/api\/rev$/, (req, res, { user }) => json(res, { rev: revFor(user.id) }), { auth: true, api: true });
route('GET', /^\/app\/api\/quotes\/([\w-]+)\/rev$/, (req, res, { user, m }) => {
  const quote = store.getQuote(user.id, m[1]);
  json(res, { updated_at: quote ? quote.updated_at : null });
}, { auth: true, api: true });
route('POST', /^\/app\/api\/quotes$/, async (req, res, { user }) => json(res, { quote: store.createQuote(user, await parseBody(req), 'web') }, 201), { auth: true, api: true });
route('PUT', /^\/app\/api\/quotes\/([\w-]+)$/, async (req, res, { user, m }) => json(res, { quote: store.updateQuote(user, m[1], await parseBody(req), 'You') }), { auth: true, api: true });
route('POST', /^\/app\/api\/quotes\/([\w-]+)\/send$/, (req, res, { user, m }) => json(res, { quote: store.sendQuote(user, m[1], 'You') }), { auth: true, api: true });
route('DELETE', /^\/app\/api\/quotes\/([\w-]+)$/, (req, res, { user, m }) => {
  store.deleteQuote(user, m[1]);
  json(res, { ok: true });
}, { auth: true, api: true });
route('PUT', /^\/app\/api\/settings$/, async (req, res, { user }) => {
  store.updateProfile(user.id, await parseBody(req));
  json(res, { ok: true });
}, { auth: true, api: true });

// Public client link
route('GET', /^\/q\/([\w-]+)$/, (req, res, { m, url }) => {
  const quote = store.getQuoteBySlug(m[1]);
  const viewer = currentUser(req);
  const isOwner = !!(quote && viewer && viewer.id === quote.user_id);
  if (!quote || (quote.status === 'draft' && !isOwner)) return html(res, views.notFound('Quote not found'), 404);
  if (!isOwner) store.recordView(quote);
  const fresh = store.getQuoteBySlug(m[1]);
  html(res, views.publicQuote({ quote: fresh, owner: store.getUser(quote.user_id), isOwnerPreview: isOwner, justResponded: url.searchParams.has('done') }), 200, { 'X-Robots-Tag': 'noindex' });
});
route('POST', /^\/q\/([\w-]+)\/respond$/, async (req, res, { m }) => {
  const body = await parseBody(req);
  store.respond(m[1], body);
  json(res, { ok: true });
}, { api: true });

// MCP endpoint — one private URL per account: /mcp/<key>
route('*', /^\/mcp\/([\w-]+)\/?$/, async (req, res, { m }) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Expose-Headers': 'Mcp-Session-Id' };
  if (req.method === 'OPTIONS') return send(res, 204, '', cors);
  const body = req.method === 'POST' ? await readBody(req, 2_000_000) : '';
  const user = store.getUserByKey(m[1]);
  const out = mcp.handleHttp(req.method, user, baseUrl(req), body);
  if (user && req.method === 'POST') {
    try {
      const msg = JSON.parse(body);
      const list = Array.isArray(msg) ? msg : [msg];
      list.forEach((x) => x && x.method && x.method !== 'ping' && console.log(`[mcp] ${user.email} ${x.method}${x.params && x.params.name ? ' ' + x.params.name : ''}`));
    } catch {}
  }
  send(res, out.status, out.body, { ...out.headers, ...cors });
});
route('*', /^\/mcp\/?$/, (req, res) => json(res, { error: 'Use your personal MCP URL from QuoteLink → Connect Claude (it looks like /mcp/ql_…).' }, 404));

// Static
route('GET', /^\/static\/(.+)$/, (req, res, { m }) => serveStatic(res, m[1]));

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;
  const match = routes.find((r) => (r.method === req.method || r.method === '*' || (r.method === 'GET' && req.method === 'HEAD')) && r.pattern.test(pathname));
  if (!match) return html(res, views.notFound(), 404);
  const ctx = { url, m: pathname.match(match.pattern) };
  try {
    if (match.auth) {
      ctx.user = currentUser(req);
      if (!ctx.user) return match.api ? json(res, { error: 'Please log in again.' }, 401) : redirect(res, '/login');
    }
    await match.handler(req, res, ctx);
  } catch (err) {
    const status = err instanceof store.AppError ? err.status : 500;
    if (status === 500) console.error(err);
    const message = status === 500 ? 'Something went wrong.' : err.message;
    if (res.headersSent) return res.end();
    if (match.api || (req.headers.accept || '').includes('application/json')) json(res, { error: message }, status);
    else html(res, views.notFound(message), status);
  }
});

seedDemo();
server.listen(PORT, () => console.log(`QuoteLink running on http://localhost:${PORT}`));
