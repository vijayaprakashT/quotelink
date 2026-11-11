'use strict';
// Server-rendered HTML views.
const { esc, money, fmtDate, fmtDateTime, richText, shareMessage, whatsappLink } = require('./lib');
const { STATUS_LABEL } = require('./store');

const pill = (status) => `<span class="pill ${esc(status)}">${esc(STATUS_LABEL[status] || status)}</span>`;
const claudeBadge = (q) => (q.source === 'claude' ? '<span class="badge-claude" title="Written by Claude via MCP">✳ via Claude</span>' : '');

function shell({ title, body, head = '', bodyClass = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%234b3fe0'/><text x='16' y='22' font-family='Arial' font-weight='800' font-size='17' fill='white' text-anchor='middle'>Q</text></svg>">
<link rel="stylesheet" href="/static/style.css?v=16">
${head}
</head>
<body class="${esc(bodyClass)}">
${body}
<div class="toast" id="toast"></div>
</body>
</html>`;
}

const WA_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.7-1.2s.2-1.1.2-1.2-.2-.2-.5-.3z"/></svg>';

const logo = (href = '/') => `<a class="logo" href="${href}"><span class="logo-mark">Q</span>QuoteLink</a>`;

function appLayout(user, active, title, content, extraHead = '') {
  const link = (href, key, label) => `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  return shell({
    title: `${title} · QuoteLink`,
    head: extraHead,
    body: `
<header class="topbar"><div class="wrap">
  ${logo('/app')}
  <nav class="nav">${link('/app', 'quotes', 'Quotes')}${link('/app/settings', 'settings', 'Business & rates')}${link('/app/connect', 'connect', 'Connect Claude')}${link('/app/plan', 'plan', 'Plan')}</nav>
  <div class="spacer"></div>
  <span class="who hide-sm">${esc(user.business_name)}</span>
  <form method="post" action="/logout" style="margin:0"><button class="btn ghost" type="submit">Log out</button></form>
</div></header>
<main class="wrap page">${content}</main>`,
  });
}

// ---------- marketing / auth ----------
function landing({ demoEmail, demoPassword, loggedIn }) {
  return shell({
    title: 'QuoteLink — client quotes written by your Claude, signed by your clients',
    body: `
<header class="topbar"><div class="wrap">${logo()}<div class="spacer"></div>
${loggedIn ? '<a class="btn primary" href="/app">Open app</a>' : '<a class="btn ghost" href="/login">Log in</a><a class="btn primary" href="/signup">Start free</a>'}
</div></header>
<main class="wrap">
  <section class="hero">
    <span class="eyebrow">Works inside Claude via MCP · No AI bill</span>
    <h1>Ask Claude for a quote. Send your client a link they can sign.</h1>
    <p class="lead">QuoteLink is the place your Claude saves client quotes. Claude writes the scope and prices it from your rate card; QuoteLink lets you edit it, hosts a live link, and tells you the moment the client views, signs or asks for changes.</p>
    <div class="row" style="justify-content:center;flex-wrap:wrap">
      <a class="btn primary lg" href="/signup">Create your free account</a>
      <a class="btn lg" href="/demo">Try the live demo →</a>
    </div>
    <p class="small muted" style="margin-top:14px">Demo login: <code>${esc(demoEmail)}</code> / <code>${esc(demoPassword)}</code></p>
  </section>

  <section class="steps">
    <div class="card step"><div class="n">1</div><h3>Ask your Claude</h3>
      <p class="muted">Describe the job in plain words. Claude uses your saved rates and terms.</p>
      <div class="chat">“Quote Priya at Lumen Foods for a new logo, 3 social templates and a brand guide. Usual rates, 18% GST.”</div></div>
    <div class="card step"><div class="n">2</div><h3>Review & edit in QuoteLink</h3>
      <p class="muted">The quote appears instantly in your dashboard. Tweak a price or a sentence, totals recalculate.</p></div>
    <div class="card step"><div class="n">3</div><h3>Client signs from a link</h3>
      <p class="muted">Your client opens a clean quote page, e-signs to accept or asks for changes. Claude can read their feedback and revise.</p></div>
  </section>

  <h2 style="text-align:center;margin-top:20px">Simple pricing</h2>
  <p class="muted" style="text-align:center">You already pay for Claude. We don't charge you for AI — just for the workspace.</p>
  <section class="pricing">
    <div class="card price"><h3>Free</h3><div class="amt">$0</div><p class="muted small">forever</p>
      <ul><li>5 quotes a month</li><li>Client e-sign links</li><li>Claude MCP connection</li><li>WhatsApp & email sharing</li></ul></div>
    <div class="card price featured"><h3>Pro</h3><div class="amt">$12<span class="small muted">/mo</span></div><p class="muted small">for freelancers & studios</p>
      <ul><li>Unlimited quotes</li><li>View & response tracking</li><li>Your rate card & default terms</li><li>PDF download</li></ul></div>
    <div class="card price"><h3>Team <span class="pill">soon</span></h3><div class="amt">$29<span class="small muted">/mo</span></div><p class="muted small">up to 5 seats</p>
      <ul><li>Shared rate cards</li><li>Approval before sending</li><li>Win-rate reports</li></ul></div>
  </section>
</main>
<footer class="footer">QuoteLink has no AI inside. Your own Claude does the writing through MCP.</footer>`,
  });
}

function authPage(kind, { error, values = {} } = {}) {
  const isSignup = kind === 'signup';
  return shell({
    title: `${isSignup ? 'Create account' : 'Log in'} · QuoteLink`,
    body: `
<div class="auth">
  <div style="text-align:center;margin-bottom:20px">${logo()}</div>
  <div class="card">
    <h1 style="font-size:22px">${isSignup ? 'Create your QuoteLink' : 'Welcome back'}</h1>
    <p class="muted">${isSignup ? 'Free to start. Connect your Claude in one step after signing up.' : 'Log in to your quotes.'}</p>
    ${error ? `<div class="error-box">${esc(error)}</div>` : ''}
    <form method="post" action="/${kind}">
      ${isSignup ? `
      <div class="field"><label>Business name</label><input name="business_name" required value="${esc(values.business_name)}" placeholder="e.g. Pixel & Pine Studio"></div>
      <div class="fields-2">
        <div class="field"><label>Your name</label><input name="name" value="${esc(values.name)}"></div>
        <div class="field"><label>Currency</label><select name="currency">${['USD', 'INR', 'SGD', 'EUR', 'GBP', 'AUD', 'AED', 'CAD'].map((c) => `<option ${values.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      </div>` : ''}
      <div class="field"><label>Email</label><input name="email" type="email" required value="${esc(values.email)}" autocomplete="email"></div>
      <div class="field"><label>Password</label><input name="password" type="password" required ${isSignup ? 'minlength="6"' : ''} autocomplete="${isSignup ? 'new-password' : 'current-password'}"></div>
      <button class="btn primary block lg" type="submit">${isSignup ? 'Create account' : 'Log in'}</button>
    </form>
    <p class="small muted" style="margin-top:16px;text-align:center">${isSignup ? 'Already have an account? <a href="/login">Log in</a>' : 'New here? <a href="/signup">Create an account</a> · <a href="/demo">Open the demo</a>'}</p>
  </div>
</div>`,
  });
}

// ---------- dashboard ----------
function dashboard(user, { quotes, stats, filter, mcpUrl, rev, usage }) {
  const tabs = [
    ['', 'All'], ['draft', 'Drafts'], ['sent', 'Sent'], ['viewed', 'Viewed'],
    ['changes_requested', 'Changes requested'], ['accepted', 'Accepted'], ['declined', 'Declined'],
  ];
  const rows = quotes
    .map(
      (q) => `<tr class="clickable" data-href="/app/quotes/${esc(q.id)}" data-updated="${esc(q.updated_at)}">
      <td><div class="q-title">${esc(q.title)} ${claudeBadge(q)}</div><div class="q-sub">${esc(q.number)} · ${esc([q.client_name, q.client_company].filter(Boolean).join(', ') || 'No client yet')}</div><div class="show-sm" style="margin-top:6px">${pill(q.status)}</div></td>
      <td class="hide-sm">${pill(q.status)}${q.status === 'changes_requested' ? `<div class="q-sub clip">“${esc(q.client_message)}”</div>` : ''}${q.signed_name ? `<div class="q-sub">Signed by ${esc(q.signed_name)}</div>` : ''}</td>
      <td class="hide-sm q-sub">${fmtDateTime(q.updated_at)}</td>
      <td class="num"><strong>${money(q.totals.total, q.currency)}</strong></td>
    </tr>`,
    )
    .join('');
  const content = `
<div class="page-head">
  <div><h1>Quotes</h1><div class="muted small"><span class="live-dot"></span>Live — new quotes from Claude appear here automatically</div></div>
  <div class="spacer"></div>
  ${usage.atLimit ? '<a class="btn primary" href="/app/plan">Upgrade for more quotes</a>' : '<a class="btn primary" href="/app/quotes/new">+ New quote</a>'}
</div>
${stats.count === 0 ? `
<div class="card connect-strip">
  <div style="font-size:26px">✳</div>
  <div style="flex:1"><strong>Connect your Claude to start.</strong><div class="small muted">Add this URL as a custom connector in Claude, then ask it to write a quote.</div></div>
  <div class="copybox" style="width:420px;max-width:100%"><input readonly value="${esc(mcpUrl)}" id="mcp-url"><button class="btn" data-copy="#mcp-url">Copy</button></div>
</div>` : ''}
${planStrip(usage)}
<div class="kpis">
  <div class="card kpi"><div class="k-label">Open pipeline</div><div class="k-value">${money(stats.openValue, user.currency)}</div><div class="k-sub">${stats.openCount} quote${stats.openCount === 1 ? '' : 's'} with clients</div></div>
  <div class="card kpi"><div class="k-label">Won</div><div class="k-value">${money(stats.wonValue, user.currency)}</div><div class="k-sub">${stats.wonCount} accepted</div></div>
  <div class="card kpi"><div class="k-label">Win rate</div><div class="k-value">${stats.winRate === null ? '—' : stats.winRate + '%'}</div><div class="k-sub">of answered quotes</div></div>
  <div class="card kpi"><div class="k-label">Needs attention</div><div class="k-value">${stats.needsAttention}</div><div class="k-sub">${stats.drafts} draft${stats.drafts === 1 ? '' : 's'} to send</div></div>
</div>
<div class="card">
  <div class="row" style="padding:14px 16px;border-bottom:1px solid var(--line)">
    <div class="filters">${tabs.map(([k, l]) => `<a href="/app${k ? '?status=' + k : ''}" class="${(filter || '') === k ? 'active' : ''}">${l}</a>`).join('')}</div>
  </div>
  ${quotes.length ? `<div class="table-scroll"><table class="list"><thead><tr><th>Quote</th><th class="hide-sm">Status</th><th class="hide-sm">Last activity</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="empty"><div class="big">📝</div><h3>No quotes ${filter ? 'with this status' : 'yet'}</h3><p class="muted">Ask Claude: <em>“Create a QuoteLink quote for Priya at Lumen Foods for a logo and brand guide.”</em><br>or <a href="/app/quotes/new">write one by hand</a>.</p></div>`}
</div>
<script>window.QL = { rev: ${JSON.stringify(rev)} };</script>
<script src="/static/app.js?v=16"></script>`;
  return appLayout(user, 'quotes', 'Quotes', content);
}

function planStrip(u) {
  if (u.limit === null) {
    return `<div class="plan-strip pro"><span class="plan-badge">PRO</span><span><strong>Pro plan</strong> · unlimited quotes · ${u.used} created this month</span><div class="spacer"></div><a href="/app/plan" class="small">Manage plan</a></div>`;
  }
  const pct = Math.min(100, Math.round((u.used / u.limit) * 100));
  return `<div class="plan-strip ${u.atLimit ? 'full' : ''}">
    <span class="plan-badge free">FREE</span>
    <div style="flex:1;min-width:180px">
      <div><strong>${u.atLimit ? 'Free limit reached' : `${u.used} of ${u.limit} free quotes used`}</strong> <span class="muted">this month${u.atLimit ? ' — new quotes are paused until next month' : ''}</span></div>
      <div class="meter"><span style="width:${pct}%"></span></div>
    </div>
    <a class="btn ${u.atLimit ? 'primary' : ''}" href="/app/plan">Upgrade to Pro — unlimited</a>
  </div>`;
}

// ---------- plan ----------
function planPage(user, { usage, flash }) {
  const isPro = usage.limit === null;
  const content = `
<div class="page-head"><div><h1>Your plan</h1><div class="muted small">You already pay for Claude, so QuoteLink never charges you for AI — only for the workspace.</div></div></div>
${flash ? `<div class="ok-box">${esc(flash)}</div>` : ''}
${planStrip(usage)}
<section class="pricing" style="margin-top:6px">
  <div class="card price ${!isPro ? 'featured' : ''}"><h3>Free ${!isPro ? '<span class="pill accepted">Current</span>' : ''}</h3><div class="amt">$0</div><p class="muted small">forever</p>
    <ul><li>5 quotes a month</li><li>Client e-sign links</li><li>Claude MCP connection</li><li>WhatsApp & email sharing</li></ul></div>
  <div class="card price ${isPro ? 'featured' : ''}"><h3>Pro ${isPro ? '<span class="pill accepted">Current</span>' : ''}</h3><div class="amt">$12<span class="small muted">/mo</span></div><p class="muted small">for freelancers & studios</p>
    <ul><li>Unlimited quotes</li><li>View & response tracking</li><li>Rate card & default terms</li><li>PDF download</li></ul>
    ${isPro ? '' : `<form method="post" action="/app/plan/upgrade"><button class="btn primary block" type="submit">Upgrade to Pro</button></form><p class="small muted" style="margin:8px 0 0">Online payments (Razorpay / Stripe) are coming soon — during early access, Pro is free.</p>`}</div>
  <div class="card price"><h3>Team <span class="pill">soon</span></h3><div class="amt">$29<span class="small muted">/mo</span></div><p class="muted small">up to 5 seats</p>
    <ul><li>Shared rate cards</li><li>Approval before sending</li><li>Win-rate reports</li></ul></div>
</section>`;
  return appLayout(user, 'plan', 'Plan', content);
}

// ---------- editor ----------
function editor(user, { quote, events, base, rateCard }) {
  const isNew = !quote;
  const q = quote || {
    title: '', client_name: '', client_company: '', client_email: '', intro: '', items: [{ description: '', quantity: 1, unit: '', unit_price: 0 }],
    currency: user.currency, tax_rate: user.tax_rate, discount: 0, terms: user.default_terms, valid_until: '', status: 'draft',
  };
  const locked = q.status === 'accepted';
  const clientUrl = quote ? `${base}/q/${quote.slug}` : '';
  const timeline = (events || [])
    .map((e) => `<li class="ev-${esc(e.type)}"><strong>${esc(e.actor)}</strong> ${esc(eventVerb(e.type))}${e.detail ? ` <span class="muted">— ${esc(e.detail)}</span>` : ''}<div class="t">${fmtDateTime(e.created_at)}</div></li>`)
    .join('');
  const content = `
<div class="page-head">
  <div>
    <div class="small"><a href="/app">← All quotes</a></div>
    <h1 style="margin-top:6px">${isNew ? 'New quote' : esc(q.number)} ${quote ? pill(q.status) : ''} ${quote ? claudeBadge(q) : ''}</h1>
  </div>
  <div class="spacer"></div>
  ${quote ? `<span class="savestate" id="savestate">All changes saved</span>` : ''}
</div>
<div id="ext-banner" class="banner info hidden"><span>This quote was just updated${'' /* by Claude or client */} elsewhere.</span><div class="spacer"></div><button class="btn" onclick="location.reload()">Load latest</button></div>
${locked ? `<div class="banner warn">Accepted by ${esc(q.signed_name)} on ${fmtDate(q.responded_at)} — this quote is locked. <div class="spacer"></div><form method="post" action="/app/quotes/${esc(q.id)}/duplicate" style="margin:0"><button class="btn">Duplicate as new quote</button></form></div>` : ''}
<form id="quote-form" class="editor" autocomplete="off">
  <div class="grid">
    <div class="card card-pad">
      <div class="field"><label>Quote title</label><input name="title" required value="${esc(q.title)}" placeholder="e.g. Website redesign for Acme" ${locked ? 'disabled' : ''}></div>
      <div class="fields-3">
        <div class="field"><label>Client name</label><input name="client_name" value="${esc(q.client_name)}" ${locked ? 'disabled' : ''}></div>
        <div class="field"><label>Company</label><input name="client_company" value="${esc(q.client_company)}" ${locked ? 'disabled' : ''}></div>
        <div class="field"><label>Client email</label><input name="client_email" type="email" value="${esc(q.client_email)}" ${locked ? 'disabled' : ''}></div>
      </div>
      <div class="field" style="margin-bottom:0"><label>Cover note / scope <span class="muted" style="font-weight:400">— blank line = new paragraph, “- ” = bullet</span></label>
        <textarea name="intro" rows="6" ${locked ? 'disabled' : ''}>${esc(q.intro)}</textarea></div>
    </div>
    <div class="card card-pad">
      <div class="row" style="margin-bottom:10px"><h2 style="margin:0">Line items</h2><div class="spacer"></div>
        ${!locked && rateCard.length ? `<select id="rate-pick" style="width:auto"><option value="">+ Add from rate card…</option>${rateCard.map((r, i) => `<option value="${i}">${esc(r.name)} — ${money(r.unit_price, user.currency)}${r.unit ? '/' + esc(r.unit) : ''}</option>`).join('')}</select>` : ''}
      </div>
      <table class="items-table">
        <thead><tr><th>Item</th><th class="c-qty">Qty</th><th class="c-unit">Unit</th><th class="c-price">Price</th><th class="num c-amt">Amount</th><th class="c-del"></th></tr></thead>
        <tbody id="items"></tbody>
      </table>
      ${locked ? '' : '<button type="button" class="btn" id="add-item" style="margin-top:8px">+ Add line</button>'}
    </div>
    <div class="card card-pad">
      <div class="fields-3">
        <div class="field"><label>Currency</label><input name="currency" maxlength="3" value="${esc(q.currency)}" ${locked ? 'disabled' : ''}></div>
        <div class="field"><label>Discount (amount)</label><input name="discount" type="number" step="0.01" min="0" value="${esc(q.discount)}" ${locked ? 'disabled' : ''}></div>
        <div class="field"><label>Tax %</label><input name="tax_rate" type="number" step="0.01" min="0" max="100" value="${esc(q.tax_rate)}" ${locked ? 'disabled' : ''}></div>
      </div>
      <div class="fields-2">
        <div class="field"><label>Valid until</label><input name="valid_until" type="date" value="${esc(q.valid_until)}" ${locked ? 'disabled' : ''}></div>
      </div>
      <div class="field" style="margin-bottom:0"><label>Terms</label><textarea name="terms" rows="4" ${locked ? 'disabled' : ''}>${esc(q.terms)}</textarea></div>
    </div>
  </div>

  <aside class="side">
    <div class="card card-pad">
      <table class="totals-table">
        <tr><td class="muted">Subtotal</td><td id="t-sub"></td></tr>
        <tr><td class="muted">Discount</td><td id="t-disc"></td></tr>
        <tr><td class="muted">Tax</td><td id="t-tax"></td></tr>
        <tr class="grand"><td>Total</td><td id="t-total"></td></tr>
      </table>
      <div class="grid" style="gap:8px;margin-top:16px">
        ${locked ? '' : `<button type="submit" class="btn primary block" id="save-btn">${isNew ? 'Create quote' : 'Save changes'}</button>`}
        ${quote && !locked ? `<button type="button" class="btn green block" id="send-btn">${q.status === 'draft' ? 'Send to client' : q.status === 'changes_requested' || q.status === 'declined' ? 'Send revised quote' : 'Mark as re-sent'}</button>` : ''}
        ${quote ? `<a class="btn block" href="/q/${esc(q.slug)}" target="_blank">${q.status === 'draft' ? 'Preview client view ↗' : 'Open client view ↗'}</a>` : ''}
      </div>
    </div>
    ${quote && q.status !== 'draft' ? `
    <div class="card card-pad">
      <div class="section-title">Client link</div>
      <div class="copybox"><input readonly value="${esc(clientUrl)}" id="client-url"><button type="button" class="btn" data-copy="#client-url">Copy</button></div>
      <div class="grid" style="gap:8px;margin-top:10px">
        <a class="btn wa block" href="${esc(whatsappLink(shareMessage(q, user.business_name, clientUrl)))}" target="_blank" rel="noopener">${WA_ICON} Share on WhatsApp</a>
        ${q.client_email ? `<a class="btn block" href="mailto:${esc(q.client_email)}?subject=${encodeURIComponent('Quote ' + q.number + ': ' + q.title)}&body=${encodeURIComponent(shareMessage(q, user.business_name, clientUrl))}">✉ Email to ${esc(q.client_email)}</a>` : ''}
      </div>
      ${['changes_requested', 'declined'].includes(q.status) ? '<p class="small muted" style="margin:8px 0 0">After revising, click <strong>Send revised quote</strong>, then share the link again — the same link always shows the latest version.</p>' : ''}
    </div>` : ''}
    ${quote && q.client_message ? `<div class="feedback ${q.status === 'accepted' ? 'accepted' : ''}"><div class="section-title" style="color:inherit">${q.status === 'changes_requested' ? 'Client asked for changes' : q.status === 'declined' ? 'Client declined' : 'Client note'}</div>${esc(q.client_message)}<div class="small" style="margin-top:8px;opacity:.8">Tip: ask Claude “Revise ${esc(q.number)} based on the client’s feedback.”</div></div>` : ''}
    ${quote ? `
    <div class="card card-pad">
      <div class="section-title">Activity</div>
      <ul class="timeline">${timeline || '<li>No activity yet</li>'}</ul>
      ${locked ? '' : `<button type="button" class="btn ghost danger small" id="delete-btn" style="margin-top:10px;padding-left:0">Delete quote</button>`}
    </div>` : ''}
  </aside>
</form>
<script>window.QL = ${JSON.stringify({
    id: quote ? quote.id : null,
    updated: quote ? quote.updated_at : null,
    items: q.items,
    currency: q.currency,
    locked,
    rateCard,
  }).replace(/</g, '\\u003c')};</script>
<script src="/static/app.js?v=16"></script>`;
  return appLayout(user, 'quotes', isNew ? 'New quote' : `${q.number} ${q.title}`, content);
}

function eventVerb(type) {
  return {
    created: 'created the quote', edited: 'edited', sent: 'sent it to the client', resent: 're-sent it',
    viewed: 'opened the quote', accepted: 'accepted and signed', changes_requested: 'asked for changes', declined: 'declined',
  }[type] || type;
}

// ---------- settings ----------
function settings(user, { rateCard, saved }) {
  const content = `
<div class="page-head"><div><h1>Business & rates</h1><div class="muted small">Claude reads this before writing a quote, so prices and terms match how you work.</div></div></div>
${saved ? '<div class="ok-box">Saved.</div>' : ''}
<form id="settings-form" class="editor">
  <div class="grid">
    <div class="card card-pad">
      <h2>Business</h2>
      <div class="fields-2">
        <div class="field"><label>Business name</label><input name="business_name" value="${esc(user.business_name)}"></div>
        <div class="field"><label>Your name</label><input name="name" value="${esc(user.name)}"></div>
      </div>
      <div class="fields-2">
        <div class="field"><label>Business email</label><input name="business_email" value="${esc(user.business_email)}"></div>
        <div class="field"><label>Address / tax ID</label><input name="business_address" value="${esc(user.business_address)}"></div>
      </div>
      <div class="fields-2">
        <div class="field"><label>Default currency</label><input name="currency" maxlength="3" value="${esc(user.currency)}"></div>
        <div class="field"><label>Default tax %</label><input name="tax_rate" type="number" step="0.01" value="${esc(user.tax_rate)}"></div>
      </div>
      <div class="field"><label>Default terms</label><textarea name="default_terms" rows="4">${esc(user.default_terms)}</textarea></div>
    </div>
    <div class="card card-pad">
      <h2>Rate card</h2>
      <p class="muted small">Your standard services. Claude prices quotes from these.</p>
      <table class="items-table"><thead><tr><th>Service</th><th class="c-unit">Unit</th><th class="c-price">Price</th><th>Notes</th><th class="c-del"></th></tr></thead><tbody id="rates"></tbody></table>
      <button type="button" class="btn" id="add-rate" style="margin-top:8px">+ Add service</button>
    </div>
  </div>
  <aside class="side"><div class="card card-pad"><button class="btn primary block" type="submit">Save</button><p class="small muted" style="margin:10px 0 0">Tip: you can also tell Claude “Update my QuoteLink rate card: logo design $1,200…”.</p></div></aside>
</form>
<script>window.QL = ${JSON.stringify({ settings: true, rateCard }).replace(/</g, '\\u003c')};</script>
<script src="/static/app.js?v=16"></script>`;
  return appLayout(user, 'settings', 'Business & rates', content);
}

// ---------- connect ----------
function connect(user, { mcpUrl }) {
  const content = `
<div class="page-head"><div><h1>Connect Claude</h1><div class="muted small">One URL. Works with Claude.ai, Claude Desktop, mobile and Claude Code.</div></div></div>
<div class="editor">
  <div class="grid">
    <div class="card card-pad">
      <div class="section-title">Your private MCP URL</div>
      <div class="copybox"><input readonly value="${esc(mcpUrl)}" id="mcp-url"><button class="btn primary" data-copy="#mcp-url">Copy</button></div>
      <p class="small muted" style="margin-top:8px">Treat it like a password: anyone with this URL can create quotes in your account. You can reset it below.</p>
    </div>
    <div class="card card-pad">
      <h2>Claude.ai or Claude Desktop</h2>
      <ol class="howto">
        <li>Open <strong>Settings → Connectors</strong> (on Team/Enterprise plans an owner adds it under Organization settings → Connectors).</li>
        <li>Click <strong>Add custom connector</strong>. Name it <code>QuoteLink</code> and paste the URL above. Leave OAuth fields empty. Click <strong>Add</strong>.</li>
        <li>In a new chat, open the <strong>+ / tools</strong> menu and make sure <strong>QuoteLink</strong> is switched on.</li>
        <li>Ask for a quote — see examples below. Approve the tool call when Claude asks.</li>
      </ol>
      <h2 style="margin-top:20px">Claude Code</h2>
      <pre class="chat mono" style="white-space:pre-wrap;word-break:break-all">claude mcp add --transport http quotelink ${esc(mcpUrl)}</pre>
    </div>
    <div class="card card-pad">
      <h2>Things to ask Claude</h2>
      <ul class="prompt-list">
        <li>“Using QuoteLink, quote Priya Shah at Lumen Foods for a logo refresh, 3 social media templates and a 10-page brand guide. Use my usual rates and 18% GST.”</li>
        <li>“Here are my notes from the call with Daniel (attached). Turn them into a QuoteLink quote.”</li>
        <li>“Which QuoteLink quotes are still waiting on the client? What’s my open pipeline?”</li>
        <li>“Revise Q-0002 based on the client’s feedback and send it again.”</li>
        <li>“Set up my QuoteLink rate card: brand strategy workshop $1,500/day, logo design $2,400, web page design $600/page.”</li>
      </ul>
    </div>
  </div>
  <aside class="side">
    <div class="card card-pad">
      <div class="section-title">How it works</div>
      <p class="small">Claude does the thinking and writing using your own Claude plan. QuoteLink stores the quote, lets you edit it, hosts the client link and tracks responses. There is no AI inside QuoteLink.</p>
      <form method="post" action="/app/connect/rotate" onsubmit="return confirm('Reset your MCP URL? Claude will stop working until you paste the new URL.')"><button class="btn danger block" type="submit">Reset MCP URL</button></form>
    </div>
  </aside>
</div>
<script src="/static/app.js?v=16"></script>`;
  return appLayout(user, 'connect', 'Connect Claude', content);
}

// ---------- public client view ----------
function publicQuote({ quote, owner, isOwnerPreview, justResponded }) {
  const t = quote.totals;
  const cur = quote.currency;
  const items = quote.items
    .map(
      (it) => `<tr><td><div style="font-weight:600">${esc(it.description)}</div>${it.details ? `<div class="d">${esc(it.details)}</div>` : ''}</td>
      <td class="num">${esc(it.quantity)}${it.unit ? ' ' + esc(it.unit) : ''}</td><td class="num hide-sm">${money(it.unit_price, cur)}</td><td class="num">${money(Math.round(it.quantity * it.unit_price * 100) / 100, cur)}</td></tr>`,
    )
    .join('');
  const answered = ['accepted', 'declined'].includes(quote.status);
  let actionBlock = '';
  if (quote.status === 'accepted') {
    actionBlock = `<div class="stamp accepted"><div style="font-size:28px">✓</div><div><strong>Accepted</strong> by ${esc(quote.signed_name)} on ${fmtDateTime(quote.responded_at)}.<div class="small">Thank you — your acceptance is recorded and ${esc(owner.business_name)} can see it now.</div></div></div>`;
  } else if (quote.status === 'declined') {
    actionBlock = `<div class="stamp other"><div style="font-size:24px">✕</div><div><strong>Declined</strong> on ${fmtDate(quote.responded_at)}.${quote.client_message ? `<div class="small">“${esc(quote.client_message)}”</div>` : ''}</div></div>`;
  } else if (quote.status === 'changes_requested') {
    actionBlock = `<div class="stamp other"><div style="font-size:24px">✎</div><div><strong>Changes requested.</strong> ${esc(owner.business_name)} will send a revised quote.<div class="small">“${esc(quote.client_message)}”</div></div></div>`;
  } else if (quote.expired) {
    actionBlock = `<div class="stamp other"><div><strong>This quote expired on ${fmtDate(quote.valid_until)}.</strong> Please contact ${esc(owner.business_name)} for an updated quote.</div></div>`;
  } else if (!isOwnerPreview || quote.status !== 'draft') {
    actionBlock = `
<div class="respond card card-pad no-print" id="respond">
  <div class="tabs"><button type="button" class="btn active" data-tab="accept">Accept & sign</button><button type="button" class="btn" data-tab="changes">Request changes</button><button type="button" class="btn" data-tab="decline">Decline</button></div>
  <div id="resp-error" class="error-box hidden"></div>
  <form data-action="accept" class="resp-form">
    <label>${quote.client_name ? `Type <strong>${esc(quote.client_name)}</strong> to sign` : 'Type your full name to sign'}</label>
    <input name="name" required placeholder="${esc(quote.client_name || 'Your full name')}" autocomplete="name">
    <div class="sig-preview" id="sig"></div>
    <div id="sig-hint" class="small" style="margin:-8px 0 12px;min-height:18px"></div>
    <label style="display:flex;gap:8px;font-weight:500;align-items:flex-start"><input type="checkbox" required style="width:auto;margin-top:3px"> I accept this quote of <strong>&nbsp;${money(t.total, cur)}&nbsp;</strong> and the terms above.</label>
    <button class="btn green lg" type="submit" style="margin-top:12px">Accept quote</button>
  </form>
  <form data-action="changes" class="resp-form hidden">
    <label>What would you like changed?</label>
    <textarea name="message" rows="4" required placeholder="e.g. Can we drop the brand guide and add a second logo concept?"></textarea>
    <button class="btn primary" type="submit" style="margin-top:10px">Send request</button>
  </form>
  <form data-action="decline" class="resp-form hidden">
    <label>Reason (optional)</label>
    <textarea name="message" rows="3" placeholder="Anything we should know?"></textarea>
    <button class="btn danger" type="submit" style="margin-top:10px">Decline quote</button>
  </form>
</div>`;
  }
  return shell({
    title: `${quote.number} · ${quote.title} — ${owner.business_name}`,
    body: `
${isOwnerPreview ? `<div class="preview-bar">${quote.status === 'draft' ? 'Draft preview — only you can see this. Send it to activate the client buttons.' : 'You are logged in as the owner. You can test the buttons — your response is recorded as the client’s.'} <a href="/app/quotes/${esc(quote.id)}">Back to editor</a></div>` : ''}
<div class="doc">
  ${justResponded ? `<div class="ok-box no-print">Thank you — your response has been sent to ${esc(owner.business_name)}.</div>` : ''}
  <div class="paper">
    <div class="doc-head">
      <div><div class="doc-biz">${esc(owner.business_name)}</div><div class="small muted">${esc([owner.business_email, owner.business_address].filter(Boolean).join(' · '))}</div></div>
      <div class="doc-meta"><div class="qn">Quote ${esc(quote.number)}${quote.version > 1 ? ` · v${quote.version}` : ''}</div>
        <div>Issued ${fmtDate(quote.sent_at || quote.created_at)}</div><div>Valid until ${fmtDate(quote.valid_until)}</div></div>
    </div>
    <h1 class="doc-title">${esc(quote.title)}</h1>
    <div class="doc-for">Prepared for <strong style="color:var(--ink)">${esc(quote.client_name || '—')}</strong>${quote.client_company ? `, ${esc(quote.client_company)}` : ''}</div>
    ${quote.intro ? `<div class="doc-intro">${richText(quote.intro)}</div>` : ''}
    <table class="doc-items">
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num hide-sm">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${items}</tbody>
    </table>
    <table class="totals-table doc-totals">
      <tr><td class="muted">Subtotal</td><td>${money(t.subtotal, cur)}</td></tr>
      ${t.discount ? `<tr><td class="muted">Discount</td><td>−${money(t.discount, cur)}</td></tr>` : ''}
      ${quote.tax_rate ? `<tr><td class="muted">Tax (${esc(quote.tax_rate)}%)</td><td>${money(t.tax, cur)}</td></tr>` : ''}
      <tr class="grand"><td>Total</td><td>${money(t.total, cur)}</td></tr>
    </table>
    ${quote.terms ? `<div class="doc-terms"><div class="section-title">Terms</div>${richText(quote.terms)}</div>` : ''}
    ${quote.status === 'accepted' ? `<div class="doc-terms"><div class="section-title">Signature</div><div class="sig-preview" style="border:0">${esc(quote.signed_name)}</div><div class="small muted">Accepted electronically on ${fmtDateTime(quote.responded_at)}</div></div>` : ''}
  </div>
  <div style="margin-top:20px">${actionBlock}</div>
  <div class="row no-print" style="justify-content:center;margin-top:16px"><button class="btn ghost small" onclick="window.print()">Download / print PDF</button></div>
  <div class="powered no-print">Sent with <a href="/">QuoteLink</a></div>
</div>
${!answered ? `<script>window.QL = ${JSON.stringify({ slug: quote.slug, publicView: true, signer: quote.client_name || null }).replace(/</g, '\\u003c')};</script><script src="/static/app.js?v=16"></script>` : ''}`,
  });
}

function notFound(msg = 'Page not found') {
  return shell({
    title: 'Not found · QuoteLink',
    body: `<div class="auth" style="text-align:center"><div style="margin-bottom:20px">${logo()}</div><div class="card card-pad"><h1 style="font-size:22px">${esc(msg)}</h1><p class="muted">The link may be wrong, or the quote hasn't been sent yet.</p><a class="btn" href="/">Go home</a></div></div>`,
  });
}

module.exports = { landing, authPage, dashboard, editor, settings, connect, publicQuote, notFound, planPage };
