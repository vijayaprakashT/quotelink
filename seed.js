'use strict';
// Creates the shared demo account (once) so reviewers can try QuoteLink immediately.
const store = require('./store');

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@quotelink.app';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';
const DEMO_MCP_KEY = process.env.DEMO_MCP_KEY || 'ql_demo_7Hk2pXq9Lm4Vt8Rw';

function seedDemo() {
  const existing = store.getUserByEmail(DEMO_EMAIL);
  if (existing) {
    if (existing.plan !== 'pro') store.setPlan(existing.id, 'pro'); // reviewers should never hit the free limit
    return;
  }
  let user = store.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    name: 'Ananya Rao',
    business_name: 'Pixel & Pine Studio',
    currency: 'USD',
  });
  store.db.prepare('UPDATE users SET mcp_key = ?, plan = ? WHERE id = ?').run(DEMO_MCP_KEY, 'pro', user.id);
  user = store.updateProfile(user.id, {
    business_email: 'hello@pixelandpine.studio',
    business_address: 'Bengaluru, India',
    tax_rate: 0,
    default_terms:
      '50% deposit on acceptance, 50% on delivery.\nPayment due within 14 days of invoice.\nTwo rounds of revisions included per deliverable; extra rounds billed at the hourly rate.',
    rate_card: [
      { name: 'Brand strategy workshop', unit: 'day', unit_price: 1500, notes: 'Half-day minimum' },
      { name: 'Logo design', unit: 'project', unit_price: 2400, notes: '3 concepts, 2 revision rounds' },
      { name: 'Brand guidelines document', unit: 'project', unit_price: 1800, notes: 'Up to 12 pages' },
      { name: 'Social media template', unit: 'template', unit_price: 250, notes: 'Editable in Canva or Figma' },
      { name: 'Website page design', unit: 'page', unit_price: 600, notes: 'Desktop + mobile' },
      { name: 'Design hourly rate', unit: 'hour', unit_price: 90, notes: 'For extras and changes' },
    ],
  });
  user = store.getUser(user.id);

  const a = store.createQuote(user, {
    title: 'Website refresh for Northwind Coffee',
    client_name: 'Marcus Lee',
    client_company: 'Northwind Coffee',
    client_email: 'marcus@example.com',
    intro: 'Thanks for the call, Marcus. Here is the scope for refreshing the Northwind site ahead of your new store opening.\n\n- Five redesigned pages, desktop and mobile\n- Updated menu page your team can edit\n- Handover call with your developer',
    items: [
      { description: 'Website page design', details: 'Home, Menu, Locations, About, Contact', quantity: 5, unit: 'page', unit_price: 600 },
      { description: 'Design hourly rate', details: 'Developer handover and QA', quantity: 6, unit: 'hour', unit_price: 90 },
    ],
  }, 'claude');
  store.sendQuote(user, a.id, 'You');
  store.respond(a.slug, { action: 'accept', name: 'Marcus Lee' });

  const b = store.createQuote(user, {
    title: 'Brand identity for Lumen Foods',
    client_name: 'Priya Shah',
    client_company: 'Lumen Foods',
    client_email: 'priya@example.com',
    intro: 'Hi Priya — as discussed, a full identity for the Lumen launch: a strategy session to align on positioning, a new logo, and the core assets your team needs on day one.',
    items: [
      { description: 'Brand strategy workshop', details: 'Positioning, audience and tone of voice', quantity: 1, unit: 'day', unit_price: 1500 },
      { description: 'Logo design', details: '3 concepts, 2 revision rounds', quantity: 1, unit: 'project', unit_price: 2400 },
      { description: 'Brand guidelines document', quantity: 1, unit: 'project', unit_price: 1800 },
    ],
  }, 'claude');
  store.sendQuote(user, b.id, 'You');
  store.respond(b.slug, { action: 'changes', message: 'Looks great! Could we skip the workshop for now and add 4 Instagram templates instead?' });

  return user;
}

module.exports = { seedDemo, DEMO_EMAIL, DEMO_PASSWORD, DEMO_MCP_KEY };
