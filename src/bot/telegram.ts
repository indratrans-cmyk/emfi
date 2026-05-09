import { isValidSolanaAddress, getWalletBalance } from "../services/solana.ts";
import { scanWallet, getAllPatterns } from "../services/emeraldguard.ts";
import { getHiveLossIntelligence, getTokenRisk } from "../services/hiveloss.ts";
import { getHeliusTransactions } from "../services/solana.ts";
import { registerWallet, getWalletByTelegramId } from "../db/database.ts";
import type { TelegramUpdate } from "../types/index.ts";

const BASE_URL = `https://api.telegram.org/bot${Bun.env.TELEGRAM_BOT_TOKEN}`;
const SITE_URL = "https://emeraldfinance.fun";
const WEBHOOK_SECRET = Bun.env.TELEGRAM_SECRET_TOKEN ?? "";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface InlineButton { text: string; url?: string; callback_data?: string }
type InlineKeyboard = { inline_keyboard: InlineButton[][] }

// ─── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function riskBadge(risk: string): string {
  return ({ critical: "🔴 CRITICAL", high: "🟠 HIGH", medium: "🟡 MEDIUM", low: "🟢 LOW" })[risk] ?? "⚪ UNKNOWN";
}

function sevEmoji(s: string): string {
  return ({ critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" })[s] ?? "⚪";
}

function shortAddr(a: string): string {
  return `${a.slice(0, 8)}…${a.slice(-4)}`;
}

// ─── Keyboards ────────────────────────────────────────────────────────────────

const KB_MAIN: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: "🔍 Scan Wallet",   url: `${SITE_URL}/#cta` },
      { text: "📊 Dashboard",     url: `${SITE_URL}/dashboard` },
    ],
    [
      { text: "🐝 HiveLoss",      url: `${SITE_URL}/#hiveloss` },
      { text: "🛡 Patterns",      url: `${SITE_URL}/#proof` },
    ],
    [
      { text: "🌐 Website",       url: SITE_URL },
    ],
  ],
};

const KB_AFTER_SCAN = (address: string): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: "📊 View Dashboard", url: `${SITE_URL}/dashboard?address=${address}` },
      { text: "🔄 Scan Again",     callback_data: `rescan:${address}` },
    ],
    [
      { text: "📋 Submit Loss Report", callback_data: "report" },
    ],
  ],
});

const KB_HIVELOSS: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: "📋 Submit Report",  callback_data: "report" },
      { text: "🌐 Full Dashboard", url: SITE_URL },
    ],
  ],
};

// ─── Send Message ─────────────────────────────────────────────────────────────

async function sendMessage(
  chatId: number,
  text: string,
  keyboard?: InlineKeyboard
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      }),
    });
  } catch (err) {
    console.error("[Bot] sendMessage failed:", err);
  }
}

async function answerCallback(callbackId: string, text?: string): Promise<void> {
  await fetch(`${BASE_URL}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text: text ?? "" }),
  });
}

async function sendTyping(chatId: number): Promise<void> {
  await fetch(`${BASE_URL}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

// ─── Webhook Auth ─────────────────────────────────────────────────────────────

export function verifyWebhookSecret(req: Request): Response | undefined {
  if (!WEBHOOK_SECRET) return undefined;
  const provided = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (provided !== WEBHOOK_SECRET) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return undefined;
}

// ─── Set Webhook ──────────────────────────────────────────────────────────────

export async function setWebhook(): Promise<void> {
  const webhookUrl = Bun.env.TELEGRAM_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("TELEGRAM_WEBHOOK_URL not set, skipping webhook registration");
    return;
  }
  const body: Record<string, string> = { url: webhookUrl };
  if (WEBHOOK_SECRET) body["secret_token"] = WEBHOOK_SECRET;

  const res  = await fetch(`${BASE_URL}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (data.ok) console.log("✅ Telegram webhook set:", webhookUrl);
  else         console.error("❌ Webhook setup failed:", data.description);
}

export async function setMyCommands(): Promise<void> {
  if (!Bun.env.TELEGRAM_BOT_TOKEN) return;

  await fetch(`${BASE_URL}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start",    description: "🏠 Home — welcome & quick guide" },
        { command: "register", description: "🔗 Link wallet for hourly monitoring" },
        { command: "guard",    description: "🛡 Scan wallet: /guard <address>" },
        { command: "hiveloss", description: "🐝 Community loss intelligence" },
        { command: "patterns", description: "📋 View all 8 risk patterns" },
        { command: "token",    description: "🔍 Check token risk: /token <address>" },
        { command: "ca",       description: "🟢 Get $EMFI contract address" },
        { command: "report",   description: "📝 Submit anonymous loss report" },
        { command: "myid",     description: "🆔 Get your Telegram chat ID" },
        { command: "help",     description: "❓ Show all commands" },
      ],
    }),
  });

  // Set bot description shown on the profile page
  await fetch(`${BASE_URL}/setMyDescription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description:
        "EmeraldFi protects your Solana wallet from catastrophic losses. " +
        "AI-powered behavioral pattern detection + community loss intelligence. " +
        "Free wallet scan — no wallet connect required.",
    }),
  });

  await fetch(`${BASE_URL}/setMyShortDescription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      short_description: "Solana behavioral risk protection. Detect dangerous patterns before you lose.",
    }),
  });

  console.log("✅ Telegram bot commands & description registered");
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleStart(chatId: number, userId: string, name: string): Promise<void> {
  const existing   = getWalletByTelegramId(userId);
  const walletLine = existing
    ? `\n✅ <b>Registered wallet:</b> <code>${shortAddr(existing["address"] as string)}</code>`
    : `\n📌 Start with: <code>/register &lt;your_wallet&gt;</code>`;

  const ca     = Bun.env.EMFI_TOKEN_ADDRESS?.trim();
  const buyRow = ca
    ? `\n\n🚀 <b>$EMFI is LIVE!</b> Use /ca for the contract address.`
    : "";

  // Build keyboard — add Buy button if CA is set
  const kb: InlineKeyboard = ca
    ? {
        inline_keyboard: [
          [
            { text: "🔍 Scan Wallet",    url: `${SITE_URL}/#cta` },
            { text: "📊 Dashboard",      url: `${SITE_URL}/dashboard` },
          ],
          [
            { text: "🚀 Buy $EMFI",      url: `https://pump.fun/coin/${ca}` },
            { text: "🐝 HiveLoss",       url: `${SITE_URL}/#hiveloss` },
          ],
          [
            { text: "🌐 Website",        url: SITE_URL },
          ],
        ],
      }
    : KB_MAIN;

  await sendMessage(chatId, `\
🟢 <b>Welcome to EmeraldFi, ${esc(name)}!</b>
${walletLine}${buyRow}

<pre>┌──────────────────────────────┐
│  🛡  EmeraldGuard            │
│  Detects 8 dangerous         │
│  patterns BEFORE you lose    │
├──────────────────────────────┤
│  🐝  HiveLoss                │
│  Community intelligence      │
│  from thousands of losses    │
└──────────────────────────────┘</pre>

<b>Quick Commands</b>
▸ /register <code>wallet</code> — hourly monitoring
▸ /guard <code>wallet</code> — instant scan now
▸ /ca — get $EMFI contract address
▸ /hiveloss — community stats
▸ /patterns — all 8 risk patterns

<i>🔒 Privacy: wallet addresses are hashed, never stored raw.</i>`, kb);
}

async function handleRegister(chatId: number, userId: string, args: string[]): Promise<void> {
  const address = args[0];
  if (!address) {
    await sendMessage(chatId,
      `📌 <b>Register Wallet for Monitoring</b>\n\n` +
      `Usage: <code>/register &lt;wallet_address&gt;</code>\n\n` +
      `This links your Solana wallet to Telegram.\n` +
      `You'll receive automatic alerts every hour if critical patterns are detected.`
    );
    return;
  }
  if (!isValidSolanaAddress(address)) {
    await sendMessage(chatId,
      `❌ <b>Invalid Address</b>\n\n` +
      `<code>${esc(address)}</code>\n\n` +
      `Please provide a valid Solana wallet address.`
    );
    return;
  }

  registerWallet(address, userId, String(chatId));

  await sendMessage(chatId, `\
✅ <b>Wallet Registered!</b>

<pre>┌──────────────────────────────┐
│  📍 Wallet                   │
│  ${shortAddr(address).padEnd(28)}│
├──────────────────────────────┤
│  🛡  Guard       ●  Active   │
│  ⏰  Schedule    ●  Hourly   │
│  🔔  Alerts      ●  Telegram │
└──────────────────────────────┘</pre>

EmeraldGuard will scan your wallet every hour and alert you if <b>CRITICAL</b> or <b>HIGH</b> risk patterns are detected.

Run a scan now: /guard <code>${address.slice(0, 8)}…</code>`,
    {
      inline_keyboard: [[
        { text: "🔍 Scan Now",      callback_data: `rescan:${address}` },
        { text: "📊 Dashboard",     url: `${SITE_URL}/dashboard?address=${address}` },
      ]],
    }
  );
}

async function handleGuard(chatId: number, userId: string, args: string[]): Promise<void> {
  const address = args[0] ?? (getWalletByTelegramId(userId)?.["address"] as string | undefined);

  if (!address) {
    await sendMessage(chatId,
      `🛡 <b>EmeraldGuard Wallet Scan</b>\n\n` +
      `Usage: <code>/guard &lt;wallet_address&gt;</code>\n\n` +
      `Example:\n<code>/guard 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU</code>\n\n` +
      `Or <b>register your wallet</b> first:\n<code>/register &lt;address&gt;</code>`
    );
    return;
  }
  if (!isValidSolanaAddress(address)) {
    await sendMessage(chatId, `❌ <b>Invalid Solana address.</b>\n<code>${esc(address)}</code>`);
    return;
  }

  await sendTyping(chatId);
  await sendMessage(chatId,
    `🔍 <b>Scanning wallet…</b>\n\n` +
    `<code>${shortAddr(address)}</code>\n\n` +
    `<i>Fetching last 50 transactions from Helius…</i>`
  );

  try {
    registerWallet(address, userId, String(chatId));
    const [balance, txs] = await Promise.all([
      getWalletBalance(address),
      getHeliusTransactions(address, 50),
    ]);
    const report = await scanWallet(address, txs, balance, true);

    if (report.detectedSignals.length === 0) {
      await sendMessage(chatId, `\
✅ <b>Wallet Clean — No Risks Detected</b>

<pre>┌──────────────────────────────┐
│  Wallet   ${shortAddr(address).padEnd(19)}│
│  Balance  ${(balance.toFixed(4) + " SOL").padEnd(19)}│
│  TXs      ${String(txs.length).padEnd(19)}│
│  Status   ✅  SAFE           │
└──────────────────────────────┘</pre>

No dangerous behavioral patterns found.
Your recent trading looks safe. Keep it up! 🟢`,
        KB_AFTER_SCAN(address)
      );
      return;
    }

    const rBadge  = riskBadge(report.overallRisk);
    const lossP   = (report.overallLossProbability * 100).toFixed(0);
    const sigCount = report.detectedSignals.length;

    let msg = `\
${sevEmoji(report.overallRisk)} <b>EmeraldGuard Alert — ${rBadge}</b>

<pre>┌──────────────────────────────┐
│  Wallet   ${shortAddr(address).padEnd(19)}│
│  Risk     ${report.overallRisk.toUpperCase().padEnd(19)}│
│  Loss P   ${(lossP + "%").padEnd(19)}│
│  Signals  ${String(sigCount).padEnd(19)}│
└──────────────────────────────┘</pre>

<b>━━ DETECTED PATTERNS ━━</b>\n\n`;

    for (const s of report.detectedSignals) {
      const prob = (s.lossProbability * 100).toFixed(0);
      msg += `${sevEmoji(s.severity)} <b>${esc(s.patternName)}</b>  <i>${prob}% loss prob</i>\n`;
      msg += `<code>${esc(s.details)}</code>\n`;
      msg += `<i>Based on ${s.affectedWallets.toLocaleString()} wallets</i>\n\n`;
    }

    if (report.shouldPause) {
      msg += `<b>⛔ RECOMMENDATION: PAUSE ALL TRADING</b>\n`;
      msg += `<i>You are in a high-risk behavioral state.</i>\n\n`;
    }

    if (report.aiInsight) {
      msg += `<b>━━ AI INSIGHT ━━</b>\n`;
      msg += `<i>${esc(report.aiInsight)}</i>\n\n`;
    }

    msg += `<i>Top fix: ${esc(report.detectedSignals[0]?.recommendation ?? "—")}</i>`;

    await sendMessage(chatId, msg, KB_AFTER_SCAN(address));
  } catch (err) {
    console.error("Guard command error:", err);
    await sendMessage(chatId,
      `❌ <b>Scan Failed</b>\n\n` +
      `Could not scan <code>${shortAddr(address)}</code>.\n` +
      `Please try again in a moment.`
    );
  }
}

async function handleHiveLoss(chatId: number): Promise<void> {
  await sendTyping(chatId);
  try {
    const intel = await getHiveLossIntelligence();
    const total  = intel.totalLossReports.toLocaleString();

    let msg = `\
🐝 <b>HiveLoss — Community Intelligence</b>

<pre>┌──────────────────────────────┐
│  Total Reports  ${total.padEnd(13)}│
│  Patterns       8            │
│  Protection     Community    │
└──────────────────────────────┘</pre>`;

    if (intel.topRiskyPatterns.length > 0) {
      msg += `\n\n<b>━━ TOP DANGER PATTERNS ━━</b>\n\n`;
      const nums = ["①","②","③","④","⑤"];
      for (const [i, p] of intel.topRiskyPatterns.slice(0, 5).entries()) {
        const name = p.patternId.replace(/_/g, " ");
        msg += `${nums[i] ?? "•"} <b>${esc(name)}</b>\n`;
        msg += `   <code>${p.reportCount} reports</code>  avg loss <b>${p.avgLossPercentage}%</b>\n\n`;
      }
    } else {
      msg += `\n\n<i>No patterns recorded yet. Be the first to contribute!</i>\n\n`;
    }

    msg += `<b>⚠️ Community Warning</b>\n<i>${esc(intel.communityWarning)}</i>\n\n`;
    msg += `<i>Check a token: /token &lt;address&gt;</i>`;

    await sendMessage(chatId, msg, KB_HIVELOSS);
  } catch (err) {
    console.error("HiveLoss command error:", err);
    await sendMessage(chatId, `❌ <b>Failed to fetch HiveLoss data.</b>\nPlease try again.`);
  }
}

async function handleToken(chatId: number, args: string[]): Promise<void> {
  const tokenAddress = args[0];
  if (!tokenAddress) {
    await sendMessage(chatId,
      `🔍 <b>Token Risk Check</b>\n\n` +
      `Usage: <code>/token &lt;token_address&gt;</code>\n\n` +
      `Checks community loss reports for a specific Solana token.`
    );
    return;
  }

  await sendTyping(chatId);
  const risk  = getTokenRisk(tokenAddress);
  const intel = await getHiveLossIntelligence(tokenAddress);

  const riskLevel = risk.isHighRisk ? "🔴  HIGH RISK"
    : risk.reports > 0             ? "🟡  CAUTION"
    :                                "🟢  NO DATA";

  let msg = `\
🔍 <b>Token Risk Check</b>

<pre>┌──────────────────────────────┐
│  Token    ${shortAddr(tokenAddress).padEnd(19)}│
│  Status   ${riskLevel.padEnd(19)}│`;

  if (risk.reports > 0) {
    msg += `\n│  Reports  ${String(risk.reports).padEnd(19)}│`;
    msg += `\n│  Avg Loss ${(risk.avgLoss.toFixed(0) + "%").padEnd(19)}│`;
    msg += `\n│  Rug Prob ${((risk.rugProbability * 100).toFixed(0) + "%").padEnd(19)}│`;
  }

  msg += `\n└──────────────────────────────┘</pre>\n\n`;

  if (risk.reports === 0) {
    msg += `No community loss reports for this token yet.\n<i>Use caution with any unverified token.</i>`;
  } else if (intel.tokenWarning) {
    msg += `<b>⚠️ Warning</b>\n<i>${esc(intel.communityWarning)}</i>`;
  }

  await sendMessage(chatId, msg);
}

async function handlePatterns(chatId: number): Promise<void> {
  const patterns = getAllPatterns();
  const nums = ["①","②","③","④","⑤","⑥","⑦","⑧"];

  let msg = `\
🛡 <b>EmeraldGuard — 8 Pre-Disaster Patterns</b>

<i>Detected BEFORE you lose money, not after.</i>

<pre>┌──────────────────────────────┐
│  Pattern           Loss Prob │
├──────────────────────────────┤\n`;

  for (const p of patterns) {
    const prob = ((p.lossProbability ?? 0) * 100).toFixed(0) + "%";
    const name = p.name.slice(0, 20).padEnd(20);
    msg += `│  ${name}  ${prob.padStart(5)}  │\n`;
  }
  msg += `└──────────────────────────────┘</pre>\n\n`;

  for (const [i, p] of patterns.entries()) {
    const prob = ((p.lossProbability ?? 0) * 100).toFixed(0);
    msg += `${nums[i] ?? "•"} <b>${esc(p.name)}</b>  <i>${prob}% loss prob</i>\n`;
    msg += `<code>${esc(p.description)}</code>\n\n`;
  }

  msg += `Scan your wallet now: /guard &lt;address&gt;`;

  await sendMessage(chatId, msg, {
    inline_keyboard: [[
      { text: "🔍 Scan My Wallet", url: `${SITE_URL}/#cta` },
      { text: "🌐 Website",        url: SITE_URL },
    ]],
  });
}

async function handleReport(chatId: number): Promise<void> {
  await sendMessage(chatId, `\
📝 <b>Submit Loss Report to HiveLoss</b>

<pre>┌──────────────────────────────┐
│  🔒 Anonymous                │
│  Wallet address is hashed    │
│  Identity never revealed     │
├──────────────────────────────┤
│  📊 Required                 │
│  • Wallet address            │
│  • Loss percentage (0–100)   │
│  • Pattern tags (optional)   │
└──────────────────────────────┘</pre>

Every report makes EmeraldFi smarter for every trader. 🐝

Submit via the web form:`,
    {
      inline_keyboard: [[
        { text: "📋 Submit on Website", url: `${SITE_URL}/#hiveloss` },
      ]],
    }
  );
}

// ─── Main Update Handler ──────────────────────────────────────────────────────

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  // Handle inline button presses
  if (update.callback_query) {
    const cq     = update.callback_query;
    const chatId = cq.message?.chat?.id;
    const data   = cq.data ?? "";
    if (!chatId) return;

    await answerCallback(cq.id);

    if (data === "report") {
      await handleReport(chatId);
    } else if (data.startsWith("rescan:")) {
      const address = data.slice(7);
      const userId  = String(cq.from?.id ?? "");
      await handleGuard(chatId, userId, [address]);
    }
    return;
  }

  const msg = update.message;
  if (!msg?.text || !msg.from) return;

  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const name   = msg.from.first_name ?? "Trader";
  const text   = msg.text.trim();

  const [rawCmd, ...args] = text.split(/\s+/);
  if (!rawCmd) return;
  const cmd = rawCmd.toLowerCase().split("@")[0];

  switch (cmd) {
    case "/start":
    case "/help":
      await handleStart(chatId, userId, name);
      break;
    case "/register":
      await handleRegister(chatId, userId, args);
      break;
    case "/guard":
      await handleGuard(chatId, userId, args);
      break;
    case "/hiveloss":
      await handleHiveLoss(chatId);
      break;
    case "/token":
      await handleToken(chatId, args);
      break;
    case "/patterns":
      await handlePatterns(chatId);
      break;
    case "/report":
      await handleReport(chatId);
      break;
    case "/ca":
    case "/token_address": {
      const ca = Bun.env.EMFI_TOKEN_ADDRESS;
      if (!ca) {
        await sendMessage(chatId,
          `⏳ <b>$EMFI not launched yet.</b>\n\n` +
          `Follow <a href="https://x.com/emeraldfinace">@emeraldfinace</a> on X for the launch announcement.`
        );
      } else {
        await sendMessage(chatId, `\
🟢 <b>$EMFI Contract Address</b>

<pre>┌──────────────────────────────┐
│  Token    $EMFI              │
│  Network  Solana             │
│  DEX      pump.fun           │
└──────────────────────────────┘</pre>

<code>${ca}</code>

<i>Tap the address above to copy.</i>`,
          {
            inline_keyboard: [[
              { text: "🚀 Buy on pump.fun", url: `https://pump.fun/coin/${ca}` },
              { text: "🌐 Website",         url: SITE_URL },
            ]],
          }
        );
      }
      break;
    }
    case "/myid":
      await sendMessage(chatId,
        `🆔 <b>Your Telegram IDs</b>\n\n` +
        `<b>Chat ID:</b> <code>${chatId}</code>\n` +
        `<b>User ID:</b> <code>${userId}</code>\n\n` +
        `<i>Use Chat ID as ADMIN_CHAT_ID in GitHub secrets for uptime alerts.</i>`
      );
      break;
    default:
      if (text.startsWith("/")) {
        await sendMessage(chatId,
          `❓ <b>Unknown command.</b>\n\nUse /help to see all available commands.`,
          KB_MAIN
        );
      }
  }
}
