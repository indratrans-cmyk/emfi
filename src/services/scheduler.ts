import { getDb } from "../db/database.ts";
import { scanWallet } from "./emeraldguard.ts";
import { getWalletBalance, getHeliusTransactions } from "./solana.ts";
import { sendEmail, buildAlertEmail } from "./email.ts";

const SCAN_INTERVAL_MS   = 3_600_000;      // 1 hour
const CACHE_WINDOW_MS    = 50 * 60 * 1000; // 50 minutes
const BACKUP_INTERVAL_MS = 24 * 3_600_000; // 24 hours

// In-memory cache: walletAddress -> last scan timestamp (ms)
const lastScanAt = new Map<string, number>();

async function sendTelegramAlert(chatId: string, text: string): Promise<void> {
  const token = Bun.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error(`[Scheduler] Failed to send Telegram message to ${chatId}:`, err);
  }
}

async function scanRegisteredWallet(
  address: string,
  chatId: string,
  emailAddress?: string
): Promise<void> {
  const now = Date.now();
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
      report.detectedSignals.some((s) => s.severity === "critical" || s.severity === "high");

    if (!hasCriticalOrHigh) return;

    const riskEmoji = {
      critical: "🔴", high: "🟠", medium: "🟡", low: "🟢",
    }[report.overallRisk] ?? "⚠️";

    // ── Telegram alert ──────────────────────────────────────────────────────
    let msg = `${riskEmoji} *[EmeraldGuard Alert] Scheduled Scan*\n\n`;
    msg += `Wallet: \`${address.slice(0, 8)}...${address.slice(-4)}\`\n`;
    msg += `Risk Level: *${report.overallRisk.toUpperCase()}*\n`;
    msg += `Loss Probability: *${(report.overallLossProbability * 100).toFixed(0)}%*\n\n`;

    if (report.shouldPause) msg += `⛔ *RECOMMENDATION: PAUSE ALL TRADING*\n\n`;

    if (report.detectedSignals.length > 0) {
      msg += `*Detected Patterns:*\n`;
      for (const signal of report.detectedSignals.slice(0, 3)) {
        const e = { critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" }[signal.severity] ?? "⚠️";
        msg += `${e} *${signal.patternName}*\n`;
        msg += `   ${signal.details}\n\n`;
      }
    }
    msg += `_Use /guard ${address} for full report._`;

    await sendTelegramAlert(chatId, msg);

    // ── Email alert ─────────────────────────────────────────────────────────
    if (emailAddress) {
      const riskLabel = report.overallRisk.toUpperCase();
      const subject   = `${riskEmoji} EmeraldGuard Alert — ${riskLabel} risk on your wallet`;
      await sendEmail(emailAddress, subject, buildAlertEmail(address, report));
    }
  } catch (err) {
    console.error(`[Scheduler] Error scanning wallet ${address.slice(0, 8)}...:`, err);
  }
}

async function pingHeartbeat(): Promise<void> {
  const url = Bun.env.UPTIME_HEARTBEAT_URL;
  if (!url) return;
  try {
    await fetch(url);
    console.log("[Scheduler] Heartbeat ping sent");
  } catch (err) {
    console.error("[Scheduler] Heartbeat ping failed:", err);
  }
}

async function runScheduledScans(): Promise<void> {
  const db = getDb();

  type WalletRow = { address: string; telegram_chat_id: string; email_address: string | null };

  const wallets = db
    .query(
      `SELECT address, telegram_chat_id, email_address FROM wallets
       WHERE telegram_chat_id IS NOT NULL AND guard_enabled = 1`
    )
    .all() as WalletRow[];

  if (wallets.length === 0) return;

  console.log(`[Scheduler] Scanning ${wallets.length} registered wallet(s)...`);

  for (const wallet of wallets) {
    await scanRegisteredWallet(
      wallet.address,
      wallet.telegram_chat_id,
      wallet.email_address ?? undefined
    );
  }
}

async function backupDatabase(): Promise<void> {
  const dbPath  = Bun.env.DB_PATH ?? "./emeraldfi.db";
  const backupDir = "./backups";
  try {
    await Bun.$`mkdir -p ${backupDir}`.quiet();
    const ts     = new Date().toISOString().slice(0, 10);
    const dest   = `${backupDir}/emeraldfi-${ts}.db`;
    await Bun.$`cp ${dbPath} ${dest}`.quiet();
    // Keep only last 7 backups
    await Bun.$`ls -t ${backupDir}/emeraldfi-*.db | tail -n +8 | xargs -r rm`.quiet();
    console.log(`[Scheduler] DB backup saved: ${dest}`);
  } catch (err) {
    console.error("[Scheduler] DB backup failed:", err);
  }
}

export function startScheduler(): void {
  const db = getDb();

  type CountRow = { count: number };
  const { count } = db
    .query(`SELECT COUNT(*) as count FROM wallets WHERE telegram_chat_id IS NOT NULL`)
    .get() as CountRow;

  console.log(`[Scheduler] Started — checking ${count} wallets every hour`);

  setInterval(() => {
    runScheduledScans().catch((err) => {
      console.error("[Scheduler] Unexpected error in tick:", err);
    });
    pingHeartbeat().catch(() => {});
  }, SCAN_INTERVAL_MS);

  // Daily database backup
  backupDatabase();
  setInterval(() => {
    backupDatabase().catch((err) => {
      console.error("[Scheduler] Backup error:", err);
    });
  }, BACKUP_INTERVAL_MS);

  // Initial heartbeat ping on startup
  pingHeartbeat().catch(() => {});
}
