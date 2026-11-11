'use strict';
// End-to-end smoke test: boots the server on a temp DB and drives it like Claude + a browser would.
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const assert = require('node:assert');

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-'));
const KEY = 'ql_demo_7Hk2pXq9Lm4Vt8Rw';

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT, DB_PATH: path.join(dbDir, 't.db') },
  stdio: ['ignore', 'pipe', 'inherit'],
});

let rpcId = 0;
async function rpc(method, params, key = KEY) {
  const res = await fetch(`${BASE}/mcp/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  return { status: res.status, body: await res.json() };
}
const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).body.result;

async function main() {
  await new Promise((r) => server.stdout.once('data', r));

  // MCP handshake
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  const notif = await fetch(`${BASE}/mcp/${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  assert.equal(notif.status, 202);
  const tools = (await rpc('tools/list', {})).body.result.tools.map((t) => t.name);
  assert.deepEqual(tools.sort(), ['create_quote', 'get_business_profile', 'get_quote', 'list_quotes', 'send_quote', 'update_business_profile', 'update_quote']);
  const bad = await rpc('initialize', {}, 'ql_wrong');
  assert.equal(bad.status, 404);
  console.log('✓ MCP handshake, tools/list, bad key rejected');

  const profile = await call('get_business_profile', {});
  assert.ok(profile.content[0].text.includes('Pixel & Pine'));
  console.log('✓ get_business_profile');

  const created = await call('create_quote', {
    title: 'Packaging design for Kettle & Co',
    client_name: 'Sam Rivera', client_company: 'Kettle & Co', client_email: 'sam@example.com',
    intro: 'Scope:\n\n- Two pack designs\n- Print-ready files',
    items: [{ description: 'Pack design', quantity: 2, unit: 'design', unit_price: 1200 }, { description: 'Design hourly rate', quantity: 3, unit: 'hour', unit_price: 90 }],
    tax_rate: 18, discount: 100,
  });
  assert.ok(!created.isError, created.content[0].text);
  const q = created.structuredContent;
  assert.equal(q.totals.subtotal, 2670);
  assert.equal(q.totals.total, Math.round((2570 * 1.18) * 100) / 100);
  console.log('✓ create_quote', q.number, q.total_formatted);

  // Draft link is private
  assert.equal((await fetch(q.client_url)).status, 404);

  const updated = await call('update_quote', { quote: q.number, discount: 0, title: 'Packaging design for Kettle & Co (v2)' });
  assert.equal(updated.structuredContent.totals.discount, 0);
  console.log('✓ update_quote');

  // Browser: log in, open dashboard, edit through the app API
  const login = await fetch(`${BASE}/login`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=demo%40quotelink.app&password=demo1234' });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const dash = await (await fetch(`${BASE}/app`, { headers: { cookie } })).text();
  assert.ok(dash.includes('Packaging design for Kettle'));
  const edit = await fetch(`${BASE}/app/api/quotes/${q.id}`, {
    method: 'PUT', headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ description: 'Pack design', quantity: 3, unit: 'design', unit_price: 1200 }] }),
  });
  const edited = (await edit.json()).quote;
  assert.equal(edited.totals.subtotal, 3600);
  const editorPage = await fetch(`${BASE}/app/quotes/${q.id}`, { headers: { cookie } });
  assert.equal(editorPage.status, 200);
  console.log('✓ login, dashboard shows Claude quote, human edit saved');

  const sent = await call('send_quote', { quote: q.number });
  assert.ok(sent.content[0].text.includes('/q/'));
  assert.ok(sent.structuredContent.whatsapp_url.startsWith('https://wa.me/?text='));
  const editorHtml = await (await fetch(`${BASE}/app/quotes/${q.id}`, { headers: { cookie } })).text();
  assert.ok(editorHtml.includes('Share on WhatsApp'));
  console.log('✓ WhatsApp share link (Claude + editor)');
  const pub = await fetch(q.client_url);
  assert.equal(pub.status, 200);
  const pubHtml = await pub.text();
  assert.ok(pubHtml.includes('Accept quote'));
  console.log('✓ send_quote, public link live');

  const respond = await fetch(`${q.client_url}/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept', name: 'Sam Rivera' }) });
  assert.equal(respond.status, 200);
  const after = await call('get_quote', { quote: q.number });
  assert.equal(after.structuredContent.status, 'accepted');
  assert.equal(after.structuredContent.signed_by, 'Sam Rivera');
  const locked = await call('update_quote', { quote: q.number, discount: 5 });
  assert.ok(locked.isError);
  console.log('✓ client accepted & signed, quote locked');

  const list = await call('list_quotes', {});
  assert.ok(list.content[0].text.includes('Lumen Foods'));
  assert.ok(list.content[0].text.includes('client said'));
  console.log('✓ list_quotes with client feedback\n', list.content[0].text);

  const upd = await call('update_business_profile', { tax_rate: 18 });
  assert.ok(upd.content[0].text.includes('18%'));
  console.log('✓ update_business_profile');
  for (const p of ['/', '/login', '/signup', '/static/style.css', '/static/app.js', '/app/settings', '/app/connect']) {
    const r = await fetch(BASE + p, { headers: { cookie } });
    assert.equal(r.status, 200, p);
  }
  console.log('✓ pages render');

  // Free plan: 5 quotes a month, then Claude is told to upgrade. Demo account is Pro.
  assert.ok(dash.includes('Pro plan'));
  const signup = await fetch(`${BASE}/signup`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'business_name=Test+Co&email=free%40example.com&password=secret12&currency=INR' });
  const freeCookie = signup.headers.get('set-cookie').split(';')[0];
  const connectHtml = await (await fetch(`${BASE}/app/connect`, { headers: { cookie: freeCookie } })).text();
  const freeKey = connectHtml.match(/\/mcp\/(ql_[\w]+)/)[1];
  const freeCall = async (name, args) => (await rpc('tools/call', { name, arguments: args }, freeKey)).body.result;
  for (let i = 1; i <= 5; i++) {
    const r = await freeCall('create_quote', { title: `Job ${i}`, client_name: 'A', items: [{ description: 'Work', unit_price: 100 }] });
    assert.ok(!r.isError, r.content[0].text);
  }
  const sixth = await freeCall('create_quote', { title: 'Job 6', client_name: 'A', items: [{ description: 'Work', unit_price: 100 }] });
  assert.ok(sixth.isError && sixth.content[0].text.includes('Upgrade'));
  const freeDash = await (await fetch(`${BASE}/app`, { headers: { cookie: freeCookie } })).text();
  assert.ok(freeDash.includes('Free limit reached'));
  const prof = await freeCall('get_business_profile', {});
  assert.ok(prof.content[0].text.includes('5 of 5 free quotes'));
  const up = await fetch(`${BASE}/app/plan/upgrade`, { method: 'POST', redirect: 'manual', headers: { cookie: freeCookie } });
  assert.equal(up.status, 303);
  const seventh = await freeCall('create_quote', { title: 'Job 7', client_name: 'A', items: [{ description: 'Work', unit_price: 100 }] });
  assert.ok(!seventh.isError);
  console.log('✓ free plan limit (5/month), upgrade to Pro, demo is Pro\nALL GOOD');
}

main()
  .catch((e) => { console.error('FAIL', e); process.exitCode = 1; })
  .finally(() => { server.kill(); fs.rmSync(dbDir, { recursive: true, force: true }); });
