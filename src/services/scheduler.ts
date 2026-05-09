import { getDb, getAppState, setAppState } from "../db/database.ts";
import { scanWallet } from "./emeraldguard.ts";
import { getWalletBalance, getHeliusTransactions } from "./solana.ts";

const SCAN_INTERVAL_MS   = 3_600_000;
const CACHE_WINDOW_MS    = 50 * 60 * 1000;
const BACKUP_INTERVAL_MS = 24 * 3_600_000;

const lastScanAt = new Map<string, number>();

// ─── Telegram helper ──────────────────────────────────────────────────────────

async function tgSend(chatId: string, text: string, keyboard?: object): Promise<void> {
  const token = Bun.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id:                  chatId,
        text,
        parse_mode:               "HTML",
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      }),
    });
  } catch (err) {
    console.error(`[Scheduler] Telegram send failed (${chatId}):`, err);
  }
}

// ─── CA Launch Announcement ───────────────────────────────────────────────────
// Runs once on startup when EMFI_TOKEN_ADDRESS is set for the first time.

async function sendLaunchAnnouncement(): Promise<void> {
  const ca = Bun.env.EMFI_TOKEN_ADDRESS?.trim();
  if (!ca) return;

  const alreadySent = getAppState("ca_announced");
  if (alreadySent === ca) return;

  const db = getDb();
  type Row = { telegram_chat_id: string };
  const wallets = db
    .query("SELECT DISTINCT telegram_chat_id FROM wallets WHERE telegram_chat_id IS NOT NULL")
    .all() as Row[];

  if (wallets.length === 0) {
    setAppState("ca_announced", ca);
    console.log("[Scheduler] CA announcement: no registered wallets yet, marked as done");
    return;
  }

  const buyUrl = `https://pump.fun/coin/${ca}`;
  const msg = `\
🚀 <b>$EMFI is LIVE on pump.fun!</b>

<pre>┌──────────────────────────────┐
│  Token    $EMFI              │
│  Network  Solana             │
│  DEX      pump.fun           │
└──────────────────────────────┘</pre>

<b>Contract Address:</b>
<code>${ca}</code>

<i>EmeraldFi — Stop Trading Blind</i>`;

  const keyboard = {
    inline_keyboard: [[
      { text: "🚀 Buy $EMFI on pump.fun", url: buyUrl },
      { text: "🌐 Website",               url: "https://emeraldfinance.fun" },
    ]],
  };

  let sent = 0;
  for (const { telegram_chat_id } of wallets) {
    await tgSend(telegram_chat_id, msg, keyboard);
    sent++;
    await new Promise(r => setTimeout(r, 300)); // avoid Telegram rate limit
  }

  setAppState("ca_announced", ca);
  console.log(`[Scheduler] CA launch announcement sent to ${sent} registered users`);
}

// ─── Hourly wallet scan ───────────────────────────────────────────────────────

async function scanRegisteredWallet(address: string, chatId: string): Promise<void> {
  const now      = Date.now();
  const lastScan = lastScanAt.get(address) ?? 0;
  if (now - lastScan < CACHE_WINDOW_MS) return;
  lastScanAt.set(address, now);

  try {
    const [balance, txs] = await Promise.all([
      getWalletBalance(address),
      getHeliusTransactions(address, 50),
    ]);
    const report = await scanWallet(address, txs, balance, false);

    const hasCriticalOrHigh =
      report.shouldPause ||
      report.detectedSignals.some(s => s.severity === "critical" || s.severity === "high");

    if (!hasCriticalOrHigh) return;

    const riskEmoji = ({ critical:"🔴", high:"🟠", medium:"🟡", low:"🟢" })[report.overallRisk] ?? "⚠️";
    const lossP     = (report.overallLossProbability * 100).toFixed(0);
    const short     = `${address.slice(0,8)}…${address.slice(-4)}`;

    let msg = `${riskEmoji} <b>[EmeraldGuard] Scheduled Scan Alert</b>\n\n`;
    msg    += `<b>Wallet:</b> <code>${short}</code>\n`;
    msg    += `<b>Risk:</b> ${report.overallRisk.toUpperCase()}  ·  <b>Loss Prob:</b> ${lossP}%\n\n`;

    if (report.shouldPause) msg += `⛔ <b>RECOMMENDATION: PAUSE ALL TRADING</b>\n\n`;

    if (report.detectedSignals.length > 0) {
      msg += `<b>Detected Patterns:</b>\n`;
      for (const s of report.detectedSignals.slice(0, 3)) {
        const e = ({ critical:"🔴", high:"🟠", medium:"🟡", low:"⚪" })[s.severity] ?? "⚠️";
        msg += `${e} <b>${s.patternName}</b>\n`;
        msg += `<code>${s.details}</code>\n\n`;
      }
    }
    msg += `<i>Full report: /guard ${address}</i>`;

    await tgSend(chatId, msg, {
      inline_keyboard: [[
        { text: "📊 View Dashboard", url: `https://emeraldfinance.fun/dashboard?address=${address}` },
      ]],
    });
  } catch (err) {
    console.error(`[Scheduler] Error scanning ${address.slice(0,8)}...:`, err);
  }
}

async function runScheduledScans(): Promise<void> {
  const db = getDb();
  type Row = { address: string; telegram_chat_id: string };
  const wallets = db
    .query(`SELECT address, telegram_chat_id FROM wallets
            WHERE telegram_chat_id IS NOT NULL AND guard_enabled = 1`)
    .all() as Row[];

  if (wallets.length === 0) return;
  console.log(`[Scheduler] Scanning ${wallets.length} registered wallet(s)…`);
  for (const w of wallets) await scanRegisteredWallet(w.address, w.telegram_chat_id);
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

async function pingHeartbeat(): Promise<void> {
  const url = Bun.env.UPTIME_HEARTBEAT_URL;
  if (!url) return;
  try { await fetch(url); } catch { /* ignore */ }
}

// ─── DB Backup ────────────────────────────────────────────────────────────────

async function backupDatabase(): Promise<void> {
  const dbPath    = Bun.env.DB_PATH ?? "./emeraldfi.db";
  const backupDir = "./backups";
  try {
    await Bun.$`mkdir -p ${backupDir}`.quiet();
    const ts   = new Date().toISOString().slice(0, 10);
    const dest = `${backupDir}/emeraldfi-${ts}.db`;
    await Bun.$`cp ${dbPath} ${dest}`.quiet();
    await Bun.$`ls -t ${backupDir}/emeraldfi-*.db | tail -n +8 | xargs -r rm`.quiet();
    console.log(`[Scheduler] DB backup saved: ${dest}`);
  } catch (err) {
    console.error("[Scheduler] DB backup failed:", err);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

export function startScheduler(): void {
  const db = getDb();
  type CountRow = { count: number };
  const { count } = db
    .query("SELECT COUNT(*) as count FROM wallets WHERE telegram_chat_id IS NOT NULL")
    .get() as CountRow;

  console.log(`[Scheduler] Started — monitoring ${count} wallet(s) every hour`);

  // Run CA announcement on startup (no-op if already sent or CA not set)
  sendLaunchAnnouncement().catch(err =>
    console.error("[Scheduler] CA announcement error:", err)
  );

  // Hourly scan + heartbeat
  setInterval(() => {
    runScheduledScans().catch(err =>
      console.error("[Scheduler] Scan error:", err)
    );
    pingHeartbeat().catch(() => {});
  }, SCAN_INTERVAL_MS);

  // Daily backup
  backupDatabase();
  setInterval(() => {
    backupDatabase().catch(err =>
      console.error("[Scheduler] Backup error:", err)
    );
  }, BACKUP_INTERVAL_MS);

  pingHeartbeat().catch(() => {});
}
