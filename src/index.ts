import { handleWalletAnalyze, handleWalletRegister } from "./routes/wallet.ts";
import { handleGuardScan, handleGuardPatterns } from "./routes/guard.ts";
import { handleHiveLossGet, handleHiveLossSubmit, handleTokenRisk } from "./routes/hiveloss.ts";
import { handleTelegramUpdate, setWebhook, setMyCommands, verifyWebhookSecret } from "./bot/telegram.ts";
import { handleStats } from "./routes/stats.ts";
import { handleRecentAlerts } from "./routes/alerts.ts";
import { handleConfig } from "./routes/config.ts";
import { handleGuardHistory } from "./routes/history.ts";
import { checkScanRateLimit, checkDefaultRateLimit } from "./middleware/rateLimit.ts";
import { getDb } from "./db/database.ts";
import { startScheduler } from "./services/scheduler.ts";
import type { TelegramUpdate } from "./types/index.ts";
import landing from "./landing.html";

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

const server = Bun.serve({
  port: PORT,
  routes: {
    "/": landing,
  },
  async fetch(req) {
    const url    = new URL(req.url);
    const path   = url.pathname;
    const method = req.method;

    if (method === "OPTIONS") {
      return secureHeaders(new Response(null, { status: 204 }), true);
    }

    // ─── Static Assets ────────────────────────────────────────────────────────
    if (path === "/favicon.png" && method === "GET") {
      const file = Bun.file("./asset/emfi logo png.png");
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

    return notFound(req);
  },
});

console.log(`
╔══════════════════════════════════════════╗
║          EmeraldFi Backend v1.1          ║
║                                          ║
║  🛡️  EmeraldGuard — Pre-disaster AI     ║
║  🐝  HiveLoss — Collective shield        ║
║                                          ║
║  Running on port ${PORT}                  ║
╚══════════════════════════════════════════╝

Endpoints:
  GET  /health
  GET  /docs
  GET  /api/stats
  GET  /api/config
  GET  /api/alerts/recent
  GET  /api/wallet?address=<addr>
  POST /api/wallet/register
  GET  /api/guard/scan?address=<addr>
  GET  /api/guard/patterns
  GET  /api/guard/history?address=<addr>
  GET  /api/hiveloss
  POST /api/hiveloss/submit
  GET  /api/hiveloss/token?token=<addr>
  POST /webhook/telegram
`);
