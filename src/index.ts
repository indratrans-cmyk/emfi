import { handleWalletAnalyze, handleWalletRegister } from "./routes/wallet.ts";
import { handleGuardScan, handleGuardPatterns } from "./routes/guard.ts";
import { handleHiveLossGet, handleHiveLossSubmit, handleTokenRisk } from "./routes/hiveloss.ts";
import { handleTelegramUpdate, setWebhook, setMyCommands, verifyWebhookSecret } from "./bot/telegram.ts";
import { handleStats } from "./routes/stats.ts";
import { handleRecentAlerts } from "./routes/alerts.ts";
import { handleConfig } from "./routes/config.ts";
import { handleGuardHistory } from "./routes/history.ts";
import { handleBlacklist } from "./routes/blacklist.ts";
import { handleGenerateApiKey, handleListApiKeys, validateApiKey } from "./routes/apikeys.ts";
import { handleDashboardData } from "./routes/dashboardApi.ts";
import { checkScanRateLimit, checkDefaultRateLimit } from "./middleware/rateLimit.ts";
import { getDb, setWalletEmail } from "./db/database.ts";
import { startScheduler } from "./services/scheduler.ts";
import { subscribe, unsubscribe } from "./services/pubsub.ts";
import type { TelegramUpdate } from "./types/index.ts";
import type { ServerWebSocket } from "bun";
import landing   from "./landing.html";
import dashboard from "./dashboard.html";

const PORT = Number(Bun.env.PORT ?? 3000);

// Startup timestamp for uptime tracking
const startedAt = Date.now();

// Initialize DB on startup
getDb();

// Register Telegram webhook and bot command menu
await setWebhook();
await setMyCommands();

// Start scheduled wallet monitoring (every hour)
startScheduler();

const ORIGIN_API = "https://emeraldfinance.fun";

function secureHeaders(res: Response, allowAllOrigins = false): Response {
  res.headers.set("Access-Control-Allow-Origin", allowAllOrigins ? "*" : ORIGIN_API);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

// Backwards-compat alias used in non-API paths (health, docs, webhook)
function cors(res: Response): Response {
  return secureHeaders(res, true);
}

function notFound(req?: Request): Response {
  const accept = req?.headers.get("Accept") ?? "";
  if (accept.includes("text/html")) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>404 — Page Not Found | EmeraldFi</title>
  <style>
    :root { --bg: #030806; --surface: #0c1810; --border: #1a3325; --text: #ddeee5; --muted: #6a9478; --primary: #00e56b; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 3rem 2.5rem; max-width: 480px; width: 100%; text-align: center; }
    .code { font-size: 6rem; font-weight: 900; color: var(--primary); line-height: 1; margin-bottom: 1rem; letter-spacing: -4px; }
    h1 { font-size: 1.4rem; margin-bottom: 0.75rem; }
    p { color: var(--muted); font-size: 0.9rem; margin-bottom: 2rem; line-height: 1.6; }
    .actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
    a { display: inline-block; padding: 0.6rem 1.4rem; border-radius: 6px; font-size: 0.9rem; font-weight: 600; text-decoration: none; }
    .btn-primary { background: var(--primary); color: #030806; }
    .btn-secondary { background: transparent; color: var(--primary); border: 1px solid var(--primary); }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary:hover { background: rgba(0,229,107,0.08); }
  </style>
</head>
<body>
  <div class="card">
    <div class="code">404</div>
    <h1>Page Not Found</h1>
    <p>The page you're looking for doesn't exist or has been moved.<br/>Head back home or check the API docs.</p>
    <div class="actions">
      <a href="/" class="btn-primary">Go Home</a>
      <a href="/docs" class="btn-secondary">API Docs</a>
    </div>
  </div>
</body>
</html>`;
    return new Response(html, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "DENY" },
    });
  }
  return cors(
    new Response(JSON.stringify({ success: false, error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  );
}

// ─── API Documentation HTML ───────────────────────────────────────────────────
const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EmeraldFi API Docs</title>
  <style>
    :root { --bg: #030806; --surface: #0c1810; --border: #1a3325; --text: #ddeee5; --muted: #6a9478; --primary: #00e56b; --danger: #ff4444; --warning: #ffb230; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; font-size: 15px; line-height: 1.6; padding: 2rem; }
    h1 { font-size: 1.75rem; color: var(--primary); margin-bottom: 0.25rem; }
    .subtitle { color: var(--muted); margin-bottom: 2.5rem; font-size: 0.9rem; }
    .section { margin-bottom: 2.5rem; }
    .section-title { font-size: 1rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem; }
    .endpoint { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; margin-bottom: 0.75rem; }
    .endpoint-head { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
    .method { padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 0.75rem; font-family: monospace; flex-shrink: 0; }
    .method.get  { background: rgba(0,229,107,0.15); color: var(--primary); }
    .method.post { background: rgba(255,178,48,0.15); color: var(--warning); }
    .path { font-family: monospace; font-size: 0.9rem; color: var(--text); font-weight: 600; }
    .desc { color: var(--muted); font-size: 0.875rem; margin-bottom: 0.5rem; }
    .example { background: #050d07; border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem 1rem; font-family: monospace; font-size: 0.78rem; color: var(--muted); overflow-x: auto; white-space: pre; }
    .params { margin-top: 0.5rem; }
    .param { font-family: monospace; font-size: 0.8rem; color: var(--muted); }
    .param strong { color: var(--primary); }
    a { color: var(--primary); }
  </style>
</head>
<body>
  <h1>EmeraldFi API</h1>
  <p class="subtitle">Base URL: <code>http://localhost:${PORT}</code> &nbsp;·&nbsp; All JSON responses include <code>{ success, data, timestamp }</code></p>

  <div class="section">
    <div class="section-title">System</div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/health</span></div>
      <div class="desc">Enhanced health check — tests DB, checks env vars, returns uptime.</div>
      <div class="example">{"status":"ok","db":true,"helius":true,"groq":true,"telegram":true,"uptime":42,"timestamp":1234567890}</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/api/stats</span></div>
      <div class="desc">Real-time platform statistics (cached 5 min).</div>
      <div class="example">{"success":true,"data":{"walletsScanned":12,"lossReports":5,"patternsDetected":31,"uptime":420}}</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/api/config</span></div>
      <div class="desc">Public configuration — returns Telegram bot username.</div>
      <div class="example">{"success":true,"data":{"botUsername":"EmeraldFiBot"}}</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/docs</span></div>
      <div class="desc">This documentation page.</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">EmeraldGuard</div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/api/guard/scan</span></div>
      <div class="desc">Scan a Solana wallet for pre-disaster behavioral patterns.</div>
      <div class="params"><span class="param"><strong>?address=</strong> — Solana wallet address (required)</span><br/>
      <span class="param"><strong>&amp;ai=</strong> — Include Groq AI insight (default: true)</span></div>
      <div class="example">{"success":true,"data":{"walletAddress":"...","overallRisk":"high","detectedSignals":[...]}}</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/api/guard/patterns</span></div>
      <div class="desc">List all 8 behavioral patterns with loss probabilities.</div>
      <div class="example">{"success":true,"data":[{"id":"FOMO_SPIRAL","name":"FOMO Spiral","lossProbability":0.78,...}]}</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/api/guard/history</span></div>
      <div class="desc">Retrieve the last 20 scan alerts for a specific wallet.</div>
      <div class="params"><span class="param"><strong>?address=</strong> — Solana wallet address (required)</span></div>
      <div class="example">{"success":true,"data":[{"patternName":"FOMO Spiral","severity":"high","lossProbability":0.78,"createdAt":1234567890}]}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">HiveLoss</div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/api/hiveloss</span></div>
      <div class="desc">Community loss intelligence — patterns, stats, token warnings.</div>
      <div class="params"><span class="param"><strong>?token=</strong> — Token address for token-specific intel (optional)</span></div>
      <div class="example">{"success":true,"data":{"totalLossReports":120,"topRiskyPatterns":[...],"communityWarning":"..."}}</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method post">POST</span><span class="path">/api/hiveloss/submit</span></div>
      <div class="desc">Submit an anonymous loss report to protect the community.</div>
      <div class="example">Body: {"walletAddress":"...","lossPercentage":75,"patternTags":["FOMO_SPIRAL"]}</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/api/hiveloss/token</span></div>
      <div class="desc">Check risk level for a specific token.</div>
      <div class="params"><span class="param"><strong>?token=</strong> — Token mint address (required)</span></div>
      <div class="example">{"success":true,"data":{"isHighRisk":true,"reports":12,"avgLoss":72.5,"rugProbability":0.85}}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Alerts</div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/api/alerts/recent</span></div>
      <div class="desc">10 most recent guard alerts from all wallets (cached 30 s).</div>
      <div class="example">{"success":true,"data":[{"walletHash":"9WzD...AWWM","patternName":"FOMO Spiral","severity":"high","createdAt":1234567890}]}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Wallet</div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method get">GET</span><span class="path">/api/wallet</span></div>
      <div class="desc">Analyze wallet balance and recent transactions.</div>
      <div class="params"><span class="param"><strong>?address=</strong> — Solana wallet address (required)</span></div>
    </div>

    <div class="endpoint">
      <div class="endpoint-head"><span class="method post">POST</span><span class="path">/api/wallet/register</span></div>
      <div class="desc">Register a wallet for Telegram alerts.</div>
      <div class="example">Body: {"walletAddress":"...","telegramUserId":"...","telegramChatId":"..."}</div>
    </div>
  </div>
</body>
</html>`;

// ─── Changelog HTML ───────────────────────────────────────────────────────────
const CHANGELOG_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Changelog — EmeraldFi</title>
  <style>
    :root{--bg:#030806;--surface:#0c1810;--border:#1a3325;--text:#ddeee5;--muted:#6a9478;--primary:#00e56b;--warning:#ffb230}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:15px;line-height:1.7;padding:2rem}
    nav{display:flex;align-items:center;justify-content:space-between;max-width:720px;margin:0 auto 2.5rem;padding-bottom:1rem;border-bottom:1px solid var(--border)}
    h1{font-size:1.6rem;color:var(--primary)}
    a{color:var(--primary);text-decoration:none}
    .container{max-width:720px;margin:0 auto}
    .entry{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:1.5rem;margin-bottom:1.25rem}
    .entry-head{display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem;flex-wrap:wrap}
    .version{font-weight:700;font-size:1rem;color:var(--text)}
    .date{font-size:.8rem;color:var(--muted);font-family:monospace}
    .tag{padding:2px 9px;border-radius:100px;font-size:.72rem;font-weight:600}
    .tag-feature{background:rgba(0,229,107,.12);color:var(--primary)}
    .tag-fix{background:rgba(255,178,48,.12);color:var(--warning)}
    ul{padding-left:1.25rem;color:var(--muted);font-size:.9rem}
    ul li{margin-bottom:.3rem}
    ul li strong{color:var(--text)}
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <h1>EmeraldFi Changelog</h1>
      <a href="/">← Back to Home</a>
    </nav>

    <div class="entry">
      <div class="entry-head">
        <span class="version">v1.3.0</span>
        <span class="date">2025-05-09</span>
        <span class="tag tag-feature">Feature</span>
      </div>
      <ul>
        <li><strong>Wallet Dashboard</strong> — Real-time monitoring page at /dashboard with alert history</li>
        <li><strong>WebSocket</strong> — Live scan results pushed to subscribed clients</li>
        <li><strong>Email Alerts</strong> — Receive critical alerts via email (add via /api/wallet/email)</li>
        <li><strong>Token Blacklist API</strong> — Public /api/blacklist of high-risk tokens from community reports</li>
        <li><strong>API Keys</strong> — Generate personal keys at /api/keys/generate?wallet=&lt;addr&gt;</li>
        <li><strong>Scan Queue</strong> — Concurrent scan protection (max 3 simultaneous)</li>
        <li><strong>/register command</strong> — Telegram onboarding with step-by-step wallet linking</li>
        <li><strong>Uptime Ping</strong> — /ping endpoint for UptimeRobot / BetterStack monitoring</li>
        <li><strong>Changelog</strong> — This page</li>
      </ul>
    </div>

    <div class="entry">
      <div class="entry-head">
        <span class="version">v1.2.0</span>
        <span class="date">2025-05-08</span>
        <span class="tag tag-feature">Feature</span>
      </div>
      <ul>
        <li><strong>HiveLoss Form</strong> — Submit anonymous loss reports directly from the landing page</li>
        <li><strong>Share to X</strong> — Share scan results to Twitter/X with one click</li>
        <li><strong>Database Backup</strong> — Daily automated backups, keeps last 7 days</li>
        <li><strong>PM2 Log Rotation</strong> — 10 MB max log size, 7-day retention</li>
      </ul>
    </div>

    <div class="entry">
      <div class="entry-head">
        <span class="version">v1.1.0</span>
        <span class="date">2025-05-07</span>
        <span class="tag tag-feature">Feature</span>
      </div>
      <ul>
        <li><strong>Rate Limiting</strong> — Sliding window per-IP rate limiter</li>
        <li><strong>Input Validation</strong> — Solana base58 address validation middleware</li>
        <li><strong>In-memory Cache</strong> — TTL cache for stats, alerts, and scan results</li>
        <li><strong>Real Stats API</strong> — /api/stats returns live DB counts</li>
        <li><strong>Telegram Scheduler</strong> — Hourly automated wallet monitoring with alerts</li>
        <li><strong>Security Headers</strong> — X-Frame-Options, CSP, XSS protection</li>
        <li><strong>CORS</strong> — Configurable origin policy</li>
        <li><strong>SEO</strong> — robots.txt, sitemap.xml, full meta tags</li>
        <li><strong>Favicon</strong> — EmeraldFi logo as browser icon</li>
        <li><strong>API Docs</strong> — /docs page with all endpoints</li>
        <li><strong>404 Page</strong> — Branded HTML 404 for browser requests</li>
        <li><strong>Bot Commands Menu</strong> — Telegram /setMyCommands registered</li>
      </ul>
    </div>

    <div class="entry">
      <div class="entry-head">
        <span class="version">v1.0.0</span>
        <span class="date">2025-05-06</span>
        <span class="tag tag-feature">Launch</span>
      </div>
      <ul>
        <li><strong>EmeraldGuard</strong> — 8 behavioral pattern detection engine</li>
        <li><strong>HiveLoss</strong> — Community anonymous loss reporting & intelligence</li>
        <li><strong>Telegram Bot</strong> — /guard, /hiveloss, /token, /patterns commands</li>
        <li><strong>Groq AI</strong> — AI-generated trading insight on scan results</li>
        <li><strong>Helius API</strong> — Real Solana transaction fetching</li>
        <li><strong>SQLite DB</strong> — WAL mode with full schema</li>
      </ul>
    </div>
  </div>
</body>
</html>`;

type WsData = { wallet: string };

const server = Bun.serve<WsData>({
  port: PORT,
  routes: {
    "/":          landing,
    "/dashboard": dashboard,
  },
  websocket: {
    open(ws) {
      const wallet = ws.data?.wallet;
      if (wallet) {
        subscribe(ws as ServerWebSocket<{ wallet: string }>, wallet);
        ws.send(JSON.stringify({ type: "connected", wallet, timestamp: Date.now() }));
      }
    },
    close(ws) {
      unsubscribe(ws as ServerWebSocket<{ wallet: string }>);
    },
    message(_ws, _msg) { /* client messages ignored */ },
  },
  async fetch(req) {
    const url    = new URL(req.url);
    const path   = url.pathname;
    const method = req.method;

    if (method === "OPTIONS") {
      return secureHeaders(new Response(null, { status: 204 }), true);
    }

    // ─── WebSocket Upgrade ────────────────────────────────────────────────────
    if (path === "/ws") {
      const wallet = url.searchParams.get("address") ?? "";
      if (server.upgrade(req, { data: { wallet } })) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // ─── Static Assets ────────────────────────────────────────────────────────
    if (path === "/favicon.png" && method === "GET") {
      const file = Bun.file("./asset/emfi logo png.png");
      return new Response(file, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
    }
    if (path === "/emfi-logo.png" && method === "GET") {
      const file = Bun.file("./asset/emfi logo png.png");
      return new Response(file, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
    }
    if (path === "/emfibg.png" && method === "GET") {
      const file = Bun.file("./asset/emfibg.png");
      return new Response(file, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
    }

    if (path === "/emfibg.png" && method === "GET") {
      const file = Bun.file("./asset/emfibg.png");
      return new Response(file, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
    }

    // ─── SEO ─────────────────────────────────────────────────────────────────
    if (path === "/robots.txt" && method === "GET") {
      const body = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /webhook/\nSitemap: https://emeraldfinance.fun/sitemap.xml\n`;
      return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    if (path === "/sitemap.xml" && method === "GET") {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://emeraldfinance.fun/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://emeraldfinance.fun/docs</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>`;
      return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
    }

    // ─── API Documentation ────────────────────────────────────────────────────
    if (path === "/docs" && method === "GET") {
      return new Response(DOCS_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // ─── Health Check (enhanced) ──────────────────────────────────────────────
    if (path === "/health" && method === "GET") {
      let dbOk = false;
      try {
        getDb().query("SELECT 1").get();
        dbOk = true;
      } catch { /* db failed */ }

      const helius   = Boolean(Bun.env.HELIUS_API_KEY);
      const groq     = Boolean(Bun.env.GROQ_API_KEY);
      const telegram = Boolean(Bun.env.TELEGRAM_BOT_TOKEN);

      const healthy = dbOk && helius && groq && telegram;

      return cors(
        new Response(
          JSON.stringify({
            status:    healthy ? "ok" : "degraded",
            db:        dbOk,
            helius,
            groq,
            telegram,
            uptime:    Math.floor((Date.now() - startedAt) / 1000),
            timestamp: Date.now(),
          }),
          {
            status:  healthy ? 200 : 503,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    }

    // ─── Telegram Webhook ─────────────────────────────────────────────────────
    if (path === "/webhook/telegram" && method === "POST") {
      const authErr = verifyWebhookSecret(req);
      if (authErr) return cors(authErr);
      try {
        const update = (await req.json()) as TelegramUpdate;
        await handleTelegramUpdate(update);
        return cors(new Response("OK", { status: 200 }));
      } catch (err) {
        console.error("Webhook error:", err);
        return cors(new Response("Error", { status: 500 }));
      }
    }

    // ─── Stats / Config / Alerts ──────────────────────────────────────────────
    if (path === "/api/stats" && method === "GET") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(handleStats(req));
    }

    if (path === "/api/config" && method === "GET") {
      return secureHeaders(handleConfig(req));
    }

    if (path === "/api/alerts/recent" && method === "GET") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(handleRecentAlerts(req));
    }

    // ─── Wallet API ───────────────────────────────────────────────────────────
    if (path === "/api/wallet" && method === "GET") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(await handleWalletAnalyze(req));
    }
    if (path === "/api/wallet/register" && method === "POST") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(await handleWalletRegister(req));
    }

    // ─── EmeraldGuard API ─────────────────────────────────────────────────────
    if (path === "/api/guard/scan" && method === "GET") {
      const rl = checkScanRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(await handleGuardScan(req));
    }
    if (path === "/api/guard/patterns" && method === "GET") {
      return secureHeaders(handleGuardPatterns(req));
    }
    if (path === "/api/guard/history" && method === "GET") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(handleGuardHistory(req));
    }

    // ─── HiveLoss API ─────────────────────────────────────────────────────────
    if (path === "/api/hiveloss" && method === "GET") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(await handleHiveLossGet(req));
    }
    if (path === "/api/hiveloss/submit" && method === "POST") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(await handleHiveLossSubmit(req));
    }
    if (path === "/api/hiveloss/token" && method === "GET") {
      return secureHeaders(handleTokenRisk(req));
    }

    // ─── Token Blacklist ──────────────────────────────────────────────────────
    if (path === "/api/blacklist" && method === "GET") {
      return secureHeaders(handleBlacklist(req), true);
    }

    // ─── API Keys ─────────────────────────────────────────────────────────────
    if (path === "/api/keys/generate" && method === "GET") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(handleGenerateApiKey(req));
    }
    if (path === "/api/keys" && method === "GET") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(handleListApiKeys(req));
    }

    // ─── Dashboard API ────────────────────────────────────────────────────────
    if (path === "/api/dashboard" && method === "GET") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      return secureHeaders(handleDashboardData(req));
    }

    // ─── Email subscription ───────────────────────────────────────────────────
    if (path === "/api/wallet/email" && method === "POST") {
      const rl = checkDefaultRateLimit(req);
      if (rl) return secureHeaders(rl);
      try {
        const body = await req.json() as { walletAddress?: string; email?: string };
        const { walletAddress, email } = body;
        if (!walletAddress || !email || !email.includes("@")) {
          return secureHeaders(new Response(
            JSON.stringify({ success: false, error: "walletAddress and email required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          ));
        }
        setWalletEmail(walletAddress, email);
        return secureHeaders(new Response(
          JSON.stringify({ success: true, data: { message: "Email registered for alerts" }, timestamp: Date.now() }),
          { headers: { "Content-Type": "application/json" } }
        ));
      } catch {
        return secureHeaders(new Response(
          JSON.stringify({ success: false, error: "Invalid request body" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        ));
      }
    }

    // ─── Uptime Ping ──────────────────────────────────────────────────────────
    if (path === "/ping" && method === "GET") {
      return new Response("pong", {
        headers: { "Content-Type": "text/plain", "Cache-Control": "no-cache" },
      });
    }

    // ─── Changelog ───────────────────────────────────────────────────────────
    if (path === "/changelog" && method === "GET") {
      return new Response(CHANGELOG_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return notFound(req);
  },
});

console.log(`
╔══════════════════════════════════════════╗
║          EmeraldFi Backend v1.3          ║
║                                          ║
║  🛡️  EmeraldGuard — Pre-disaster AI     ║
║  🐝  HiveLoss — Collective shield        ║
║  📊  Dashboard — Real-time monitoring    ║
║                                          ║
║  Running on port ${PORT}                  ║
╚══════════════════════════════════════════╝

Pages:      /  /dashboard  /docs  /changelog
Guard:      GET  /api/guard/scan  /api/guard/patterns  /api/guard/history
HiveLoss:   GET  /api/hiveloss  /api/hiveloss/token  |  POST /api/hiveloss/submit
Wallet:     GET  /api/wallet  |  POST /api/wallet/register  /api/wallet/email
New:        GET  /api/blacklist  /api/dashboard  /api/keys  /api/keys/generate
System:     GET  /health  /ping  /api/stats  /api/config  /api/alerts/recent
WS:         ws://localhost:${PORT}/ws?address=<addr>
`);
