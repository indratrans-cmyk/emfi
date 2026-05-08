import { handleWalletAnalyze, handleWalletRegister } from "./routes/wallet.ts";
import { handleGuardScan, handleGuardPatterns } from "./routes/guard.ts";
import { handleHiveLossGet, handleHiveLossSubmit, handleTokenRisk } from "./routes/hiveloss.ts";
import { handleTelegramUpdate, setWebhook } from "./bot/telegram.ts";
import { getDb } from "./db/database.ts";
import type { TelegramUpdate } from "./types/index.ts";
import landing from "./landing.html";

const PORT = Number(process.env["PORT"] ?? 3000);

// Initialize DB on startup
getDb();

// Register Telegram webhook
await setWebhook();

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

function notFound(): Response {
  return cors(
    new Response(JSON.stringify({ success: false, error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  );
}

const server = Bun.serve({
  port: PORT,
  routes: {
    "/": landing,
  },
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    // ─── Health Check ────────────────────────────────────────────────────────
    if (path === "/health") {
      return cors(
        new Response(
          JSON.stringify({
            status: "ok",
            project: "EmeraldFi",
            version: "1.0.0",
            utilities: ["EmeraldGuard", "HiveLoss"],
            timestamp: Date.now(),
          }),
          { headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // ─── Telegram Webhook ────────────────────────────────────────────────────
    if (path === "/webhook/telegram" && method === "POST") {
      try {
        const update = (await req.json()) as TelegramUpdate;
        await handleTelegramUpdate(update);
        return cors(new Response("OK", { status: 200 }));
      } catch (err) {
        console.error("Webhook error:", err);
        return cors(new Response("Error", { status: 500 }));
      }
    }

    // ─── Wallet API ──────────────────────────────────────────────────────────
    if (path === "/api/wallet" && method === "GET") {
      return cors(await handleWalletAnalyze(req));
    }
    if (path === "/api/wallet/register" && method === "POST") {
      return cors(await handleWalletRegister(req));
    }

    // ─── EmeraldGuard API ────────────────────────────────────────────────────
    if (path === "/api/guard/scan" && method === "GET") {
      return cors(await handleGuardScan(req));
    }
    if (path === "/api/guard/patterns" && method === "GET") {
      return cors(handleGuardPatterns(req));
    }

    // ─── HiveLoss API ────────────────────────────────────────────────────────
    if (path === "/api/hiveloss" && method === "GET") {
      return cors(await handleHiveLossGet(req));
    }
    if (path === "/api/hiveloss/submit" && method === "POST") {
      return cors(await handleHiveLossSubmit(req));
    }
    if (path === "/api/hiveloss/token" && method === "GET") {
      return cors(handleTokenRisk(req));
    }

    return notFound();
  },
});

console.log(`
╔══════════════════════════════════════════╗
║          EmeraldFi Backend v1.0          ║
║                                          ║
║  🛡️  EmeraldGuard — Pre-disaster AI     ║
║  🐝  HiveLoss — Collective shield        ║
║                                          ║
║  Running on port ${PORT}                  ║
╚══════════════════════════════════════════╝

Endpoints:
  GET  /health
  GET  /api/wallet?address=<addr>
  POST /api/wallet/register
  GET  /api/guard/scan?address=<addr>
  GET  /api/guard/patterns
  GET  /api/hiveloss
  POST /api/hiveloss/submit
  GET  /api/hiveloss/token?token=<addr>
  POST /webhook/telegram
`);
