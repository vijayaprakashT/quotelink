'use strict';
// Model Context Protocol server (Streamable HTTP transport, stateless, JSON responses).
// Claude does the thinking and writing; these tools only store, edit and serve the result.
const store = require('./store');
const { money, fmtDate } = require('./lib');

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'quotelink', title: 'QuoteLink', version: '1.0.0' };

const INSTRUCTIONS = `QuoteLink turns the quotes you write into live, signable links for the user's clients.
Typical flow: call get_business_profile first to learn the user's business name, currency, tax and rate card;
write a clear, professional quote (title, short intro/scope note, itemised lines priced from the rate card where possible);
save it with create_quote; share the returned app link so the user can review and edit it; call send_quote only when the
user asks to send it. Use list_quotes / get_quote to report on status and read client feedback, and update_quote to revise.`;

const itemSchema = {
  type: 'object',
  properties: {
    description: { type: 'string', description: 'Short name of the deliverable or service, e.g. "Homepage design".' },
    details: { type: 'string', description: 'Optional one or two sentences on what is included.' },
    quantity: { type: 'number', description: 'Quantity (hours, days, units...). Defaults to 1.' },
    unit: { type: 'string', description: 'Optional unit label, e.g. "hour", "day", "page", "month".' },
    unit_price: { type: 'number', description: 'Price per unit in the quote currency (major units, e.g. 1200.50).' },
  },
  required: ['description', 'unit_price'],
};

const quoteFields = {
  title: { type: 'string', description: 'Quote title, e.g. "Brand identity refresh for Acme".' },
  client_name: { type: 'string', description: 'Client contact person name.' },
  client_company: { type: 'string', description: 'Client company (optional).' },
  client_email: { type: 'string', description: 'Client email (optional).' },
  intro: {
    type: 'string',
    description: 'Cover note / scope summary shown above the line items. Plain text; blank lines separate paragraphs, lines starting with "- " become bullets, **bold** allowed.',
  },
  items: { type: 'array', items: itemSchema, description: 'Line items. Replaces all existing items when updating.' },
  currency: { type: 'string', description: 'ISO 4217 code, e.g. USD, INR, SGD. Defaults to the business currency.' },
  tax_rate: { type: 'number', description: 'Tax percentage applied after discount, e.g. 18 for 18% GST. Defaults to the business setting.' },
  discount: { type: 'number', description: 'Flat discount amount in the quote currency.' },
  terms: { type: 'string', description: 'Payment terms and conditions. Defaults to the business default terms.' },
  valid_days: { type: 'integer', description: 'How many days the quote stays valid (default 30).' },
};

const quoteRef = { type: 'string', description: 'Quote number (e.g. "Q-0003") or id.' };

const TOOLS = [
  {
    name: 'get_business_profile',
    title: 'Get business profile',
    description: "Returns the user's business details, default currency, tax rate, payment terms and rate card (their standard services and prices). Call this before writing a quote so prices match the user's rates.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'create_quote',
    title: 'Create quote',
    description: 'Saves a new quote as a draft in QuoteLink and returns links: one for the user to review/edit it in the app and the client link that goes live once sent. You write all the content; QuoteLink calculates totals.',
    inputSchema: { type: 'object', properties: quoteFields, required: ['title', 'client_name', 'items'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'update_quote',
    title: 'Update quote',
    description: 'Revises an existing quote. Only the fields you pass change; passing items replaces all line items. Accepted quotes are locked. Use this to apply client feedback.',
    inputSchema: { type: 'object', properties: { quote: quoteRef, ...quoteFields }, required: ['quote'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'list_quotes',
    title: 'List quotes',
    description: 'Lists quotes with status (draft, sent, viewed, changes_requested, accepted, declined), totals and any client feedback, newest activity first. Also returns pipeline totals.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: store.STATUSES, description: 'Optional status filter.' },
        search: { type: 'string', description: 'Optional text to match against title, client or number.' },
        limit: { type: 'integer', description: 'Max results (default 25).' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_quote',
    title: 'Get quote',
    description: 'Returns the full quote: line items, totals, status, client feedback or signature, and the activity timeline (views, edits, responses).',
    inputSchema: { type: 'object', properties: { quote: quoteRef }, required: ['quote'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'send_quote',
    title: 'Send quote to client',
    description: 'Marks the quote as sent and activates its client link so the client can view, accept (e-sign), request changes or decline. Returns the link to share. Only call when the user asks to send.',
    inputSchema: { type: 'object', properties: { quote: quoteRef }, required: ['quote'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'update_business_profile',
    title: 'Update business profile',
    description: 'Updates the business name, contact details, default currency, tax rate, default payment terms and/or the rate card. Passing rate_card replaces the whole rate card.',
    inputSchema: {
      type: 'object',
      properties: {
        business_name: { type: 'string' },
        business_email: { type: 'string' },
        business_address: { type: 'string' },
        currency: { type: 'string', description: 'ISO 4217 code.' },
        tax_rate: { type: 'number', description: 'Default tax percentage.' },
        default_terms: { type: 'string' },
        rate_card: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              unit: { type: 'string' },
              unit_price: { type: 'number' },
              notes: { type: 'string' },
            },
            required: ['name', 'unit_price'],
          },
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

// ---------- formatting helpers ----------
function links(base, quote) {
  return { app_url: `${base}/app/quotes/${quote.id}`, client_url: `${base}/q/${quote.slug}` };
}

function quoteSummary(base, quote) {
  return {
    number: quote.number,
    id: quote.id,
    title: quote.title,
    client: [quote.client_name, quote.client_company].filter(Boolean).join(', '),
    status: quote.status,
    total: quote.totals.total,
    currency: quote.currency,
    total_formatted: money(quote.totals.total, quote.currency),
    valid_until: quote.valid_until,
    expired: quote.expired,
    client_message: quote.client_message || undefined,
    signed_by: quote.signed_name || undefined,
    updated_at: quote.updated_at,
    ...links(base, quote),
  };
}

function quoteDetail(base, quote, events) {
  return {
    ...quoteSummary(base, quote),
    client_name: quote.client_name,
    client_company: quote.client_company,
    client_email: quote.client_email,
    intro: quote.intro,
    items: quote.items.map((it) => ({ ...it, amount: Math.round(it.quantity * it.unit_price * 100) / 100 })),
    tax_rate: quote.tax_rate,
    discount: quote.discount,
    totals: quote.totals,
    terms: quote.terms,
    version: quote.version,
    created_via: quote.source,
    sent_at: quote.sent_at,
    viewed_at: quote.viewed_at,
    responded_at: quote.responded_at,
    activity: events,
  };
}

function quoteText(quote, l, headline) {
  const lines = [
    `${headline}: ${quote.number} — ${quote.title}`,
    `Client: ${[quote.client_name, quote.client_company].filter(Boolean).join(', ') || '—'}`,
    `Total: ${money(quote.totals.total, quote.currency)} (subtotal ${money(quote.totals.subtotal, quote.currency)}` +
      (quote.totals.discount ? `, discount −${money(quote.totals.discount, quote.currency)}` : '') +
      (quote.totals.tax ? `, tax ${money(quote.totals.tax, quote.currency)}` : '') +
      ')',
    `Status: ${store.STATUS_LABEL[quote.status]}${quote.status === 'draft' ? ' (client link activates when sent)' : ''}`,
    `Valid until: ${fmtDate(quote.valid_until)}`,
    `Review & edit in QuoteLink: ${l.app_url}`,
    `Client link: ${l.client_url}`,
  ];
  return lines.join('\n');
}

const ok = (text, structured) => ({ content: [{ type: 'text', text }], structuredContent: structured });
const fail = (text) => ({ content: [{ type: 'text', text }], isError: true });

// ---------- tool execution ----------
function callTool(user, base, name, args = {}) {
  try {
    switch (name) {
      case 'get_business_profile': {
        const profile = {
          business_name: user.business_name,
          contact_name: user.name,
          business_email: user.business_email,
          business_address: user.business_address,
          currency: user.currency,
          tax_rate: user.tax_rate,
          default_terms: user.default_terms,
          rate_card: store.getRateCard(user.id).map(({ id, ...r }) => r),
          quotes_so_far: store.stats(user.id).count,
        };
        const rc = profile.rate_card.length
          ? profile.rate_card.map((r) => `- ${r.name}: ${money(r.unit_price, user.currency)}${r.unit ? ' / ' + r.unit : ''}${r.notes ? ' (' + r.notes + ')' : ''}`).join('\n')
          : '- (no rate card yet — ask the user for prices or use sensible market rates and say so)';
        return ok(
          `Business: ${profile.business_name}\nCurrency: ${profile.currency} · Default tax: ${profile.tax_rate}%\nDefault terms: ${profile.default_terms || '—'}\nRate card:\n${rc}`,
          profile,
        );
      }
      case 'create_quote': {
        if (!Array.isArray(args.items) || !args.items.length) return fail('Please include at least one line item.');
        const quote = store.createQuote(user, args, 'claude');
        const l = links(base, quote);
        return ok(
          quoteText(quote, l, 'Saved draft quote') + '\n\nThe user can now open the app link to review and edit it. Ask before sending it to the client.',
          quoteDetail(base, quote, []),
        );
      }
      case 'update_quote': {
        const quote = store.updateQuote(user, args.quote, args, 'Claude');
        const l = links(base, quote);
        const note = ['sent', 'viewed', 'changes_requested', 'declined'].includes(quote.status)
          ? '\n\nThe client link already shows this new version. If the client asked for changes, offer to call send_quote to notify them it was revised.'
          : '';
        return ok(quoteText(quote, l, 'Updated quote') + note, quoteDetail(base, quote, store.getEvents(quote.id)));
      }
      case 'list_quotes': {
        const list = store.listQuotes(user.id, { status: args.status, search: args.search, limit: args.limit || 25 });
        const s = store.stats(user.id);
        const header =
          `Pipeline: ${s.openCount} open (${money(s.openValue, user.currency)}), ${s.wonCount} accepted (${money(s.wonValue, user.currency)})` +
          (s.winRate !== null ? `, win rate ${s.winRate}%` : '') +
          (s.needsAttention ? `. ${s.needsAttention} need attention (client asked for changes).` : '.');
        const rows = list.map(
          (x) =>
            `${x.number} · ${x.title} · ${[x.client_name, x.client_company].filter(Boolean).join(', ')} · ${money(x.totals.total, x.currency)} · ${store.STATUS_LABEL[x.status]}` +
            (x.client_message ? ` · client said: "${x.client_message}"` : '') +
            (x.signed_name ? ` · signed by ${x.signed_name}` : ''),
        );
        return ok(`${header}\n\n${rows.join('\n') || 'No quotes yet.'}`, { stats: s, quotes: list.map((x) => quoteSummary(base, x)) });
      }
      case 'get_quote': {
        const quote = store.getQuote(user.id, args.quote);
        if (!quote) return fail(`No quote found for "${args.quote}". Use list_quotes to see available quotes.`);
        const detail = quoteDetail(base, quote, store.getEvents(quote.id));
        return ok(JSON.stringify(detail, null, 2), detail);
      }
      case 'send_quote': {
        const quote = store.sendQuote(user, args.quote, 'Claude');
        const l = links(base, quote);
        return ok(
          `${quote.number} is live. Share this link with ${quote.client_name || 'the client'}${quote.client_email ? ' (' + quote.client_email + ')' : ''}:\n${l.client_url}\n\nThey can review it, e-sign to accept, request changes or decline. QuoteLink tracks views and responses.`,
          quoteSummary(base, quote),
        );
      }
      case 'update_business_profile': {
        const u = store.updateProfile(user.id, args);
        return ok(
          `Saved. Business: ${u.business_name} · ${u.currency} · tax ${u.tax_rate}% · ${store.getRateCard(u.id).length} rate card items.`,
          { business_name: u.business_name, currency: u.currency, tax_rate: u.tax_rate, rate_card: store.getRateCard(u.id) },
        );
      }
      default:
        return null;
    }
  } catch (err) {
    if (err instanceof store.AppError) return fail(err.message);
    console.error('tool error', name, err);
    return fail('Something went wrong in QuoteLink: ' + err.message);
  }
}

// ---------- JSON-RPC ----------
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

function handleMessage(user, base, msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return msg && 'id' in msg && !('result' in msg || 'error' in msg) ? rpcError(msg.id, -32600, 'Invalid Request') : null;
  }
  const isNotification = !('id' in msg) || msg.id === null;
  if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      const protocolVersion = SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });
    case 'tools/call': {
      const result = callTool(user, base, params.name, params.arguments || {});
      if (!result) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
      return rpcResult(id, result);
    }
    case 'resources/list':
      return rpcResult(id, { resources: [] });
    case 'resources/templates/list':
      return rpcResult(id, { resourceTemplates: [] });
    case 'prompts/list':
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// HTTP entry point. Returns { status, headers, body } for the server to write.
function handleHttp(method, user, base, body) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (method === 'GET' || method === 'DELETE') {
    return { status: 405, headers: { ...headers, Allow: 'POST' }, body: JSON.stringify(rpcError(null, -32000, 'Use POST for this MCP endpoint.')) };
  }
  if (!user) return { status: 404, headers, body: JSON.stringify(rpcError(null, -32001, 'Unknown QuoteLink connection key. Copy your MCP URL from QuoteLink → Connect Claude.')) };
  let parsed;
  try {
    parsed = JSON.parse(body || 'null');
  } catch {
    return { status: 400, headers, body: JSON.stringify(rpcError(null, -32700, 'Parse error')) };
  }
  if (Array.isArray(parsed)) {
    const out = parsed.map((m) => handleMessage(user, base, m)).filter(Boolean);
    return out.length ? { status: 200, headers, body: JSON.stringify(out) } : { status: 202, headers, body: '' };
  }
  const out = handleMessage(user, base, parsed);
  return out ? { status: 200, headers, body: JSON.stringify(out) } : { status: 202, headers, body: '' };
}

module.exports = { handleHttp, TOOLS };
