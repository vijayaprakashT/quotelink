# QuoteLink

**Ask Claude for a quote. Send your client a link they can sign.**

QuoteLink is a quoting tool for freelancers and small studios that runs on the customer's own Claude.
Claude writes the quote through MCP: it scopes the work, prices it from the user's rate card and writes the cover note.
QuoteLink handles everything else. It saves and edits the quote, hosts a live client link where the client can e-sign, request changes or decline, tracks views, and reports status back to Claude.

There is **no AI inside QuoteLink**: no OpenAI, Anthropic or other AI keys, and no model calls. It also has **zero runtime dependencies**. It uses Node's built-in `http`, `crypto` and `sqlite` modules only.

## How it works

```
You → Claude ("quote Priya for a logo + brand guide")
        │  MCP (Streamable HTTP, JSON-RPC)
        ▼
QuoteLink /mcp/<your-key>  ──► saves draft quote ──► you edit it in the app ──► Send
                                                                         │
Client opens /q/<link> ◄─────────────────────────────────────────────────┘
   └─► views / accepts with e-signature / requests changes / declines
        └─► status + feedback flow back to the dashboard (live) and to Claude (list_quotes / get_quote)
```

## MCP tools

| Tool | What it does |
|---|---|
| `get_business_profile` | Business name, currency, tax, default terms and **rate card**, so Claude prices like you do |
| `create_quote` | Saves a draft quote that Claude wrote. Returns the app link (to edit) and the client link |
| `update_quote` | Revises any field or replaces the line items, e.g. to apply client feedback. Accepted quotes are locked |
| `send_quote` | Activates the client link (sets status to Sent) |
| `list_quotes` | Pipeline view with statuses, totals and client feedback |
| `get_quote` | Full quote and activity timeline (created, edited, viewed, signed…) |
| `update_business_profile` | Set rates, terms, currency and tax from chat |

## Connect Claude

1. Log in and open **Connect Claude** to copy your private MCP URL (`https://<host>/mcp/ql_…`).
2. In Claude (web or desktop), go to **Settings → Connectors → Add custom connector**, name it `QuoteLink`, paste the URL and click **Add**. No OAuth is needed.
3. In a chat, turn QuoteLink on in the tools menu, then ask:
   *"Using QuoteLink, quote Priya Shah at Lumen Foods for a logo, 3 social templates and a brand guide. Use my usual rates."*

For Claude Code, run `claude mcp add --transport http quotelink https://<host>/mcp/ql_…`

## Run locally

```bash
node --version   # 22.13 or newer
npm start        # http://localhost:3000
npm test         # end-to-end smoke test (MCP + browser flows)
```

A demo account is created on first boot: `demo@quotelink.app` / `demo1234`, MCP key `ql_demo_7Hk2pXq9Lm4Vt8Rw`.

## Deploy

The app needs Node 22.13+ and a persistent disk for the SQLite file (`DB_PATH`).

- **Render:** use the included `render.yaml` blueprint (Starter web service with a 1 GB disk at `/var/data`).
- **Railway / Fly / any Docker host:** use the `Dockerfile`, mount a volume at `/data` and set `DB_PATH=/data/quotelink.db`.

Environment variables (all optional): `PORT`, `DB_PATH`, `PUBLIC_URL`, `SESSION_SECRET`, `DEMO_EMAIL`, `DEMO_PASSWORD`, `DEMO_MCP_KEY`.

## Code map

- `server.js`: HTTP server, routes, auth (scrypt passwords, HMAC-signed cookies)
- `mcp.js`: MCP server (Streamable HTTP, stateless, protocol 2024-11-05 → 2025-11-25) and the tools
- `store.js`: SQLite schema, quote logic, totals, statuses, activity log
- `views.js`, `public/`: server-rendered UI, editor, live dashboard, client e-sign page
- `seed.js`: demo account, `test/smoke.js`: end-to-end test
