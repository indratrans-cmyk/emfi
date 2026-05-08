import { isValidSolanaAddress, getWalletBalance } from "../services/solana.ts";
import { scanWallet, getAllPatterns } from "../services/emeraldguard.ts";
import { getHiveLossIntelligence, getTokenRisk } from "../services/hiveloss.ts";
import { getHeliusTransactions } from "../services/solana.ts";
import { registerWallet, getWalletByTelegramId } from "../db/database.ts";
import type { TelegramUpdate } from "../types/index.ts";

const BASE_URL = `https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}`;

// ─── Send Message ─────────────────────────────────────────────────────────────

async function sendMessage(
  chatId: number,
  text: string,
  parseMode: "Markdown" | "HTML" = "Markdown"
): Promise<void> {
  await fetch(`${BASE_URL}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  });
}

async function sendTyping(chatId: number): Promise<void> {
  await fetch(`${BASE_URL}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

// ─── Set Webhook ──────────────────────────────────────────────────────────────

export async function setWebhook(): Promise<void> {
  const webhookUrl = process.env["TELEGRAM_WEBHOOK_URL"];
  if (!webhookUrl) {
    console.warn("TELEGRAM_WEBHOOK_URL not set, skipping webhook registration");
    return;
  }

  const res = await fetch(`${BASE_URL}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });

  const data = (await res.json()) as { ok: boolean; description?: string };
  if (data.ok) {
    console.log("✅ Telegram webhook set:", webhookUrl);
  } else {
    console.error("❌ Webhook setup failed:", data.description);
  }
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleStart(chatId: number, userId: string, name: string): Promise<void> {
  await sendMessage(
    chatId,
    `🟢 *Welcome to EmeraldFi, ${name}!*

EmeraldFi protects your Solana wallet from catastrophic losses using two AI shields:

🛡️ *EmeraldGuard* — Detects your dangerous behavioral patterns BEFORE you lose
🐝 *HiveLoss* — Collective intelligence from thousands of real losses

*Commands:*
/guard \`<wallet>\` — Scan your wallet for pre-disaster patterns
/hiveloss — View community loss intelligence
/token \`<address>\` — Check if a token is high risk
/patterns — See all 8 behavioral patterns we detect
/help — Show this menu

*Your data is always anonymous. We hash your wallet address.*`
  );
}

async function handleGuard(
  chatId: number,
  userId: string,
  args: string[]
): Promise<void> {
  const address = args[0] ?? getWalletByTelegramId(userId)?.["address"] as string | undefined;

  if (!address) {
    await sendMessage(chatId, "Usage: /guard `<your_wallet_address>`\n\nExample:\n`/guard 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`");
    return;
  }

  if (!isValidSolanaAddress(address)) {
    await sendMessage(chatId, "❌ Invalid Solana wallet address.");
    return;
  }

  await sendTyping(chatId);
  await sendMessage(chatId, "🔍 Scanning your wallet for behavioral patterns...");

  try {
    registerWallet(address, userId, String(chatId));
    const [balance, txs] = await Promise.all([
      getWalletBalance(address),
      getHeliusTransactions(address, 50),
    ]);

    const report = await scanWallet(address, txs, balance, true);

    if (report.detectedSignals.length === 0) {
      await sendMessage(
        chatId,
        `✅ *Wallet Clean — No Pre-Disaster Patterns Detected*\n\n` +
          `Wallet: \`${address.slice(0, 8)}...${address.slice(-4)}\`\n` +
          `Balance: ${balance.toFixed(4)} SOL\n` +
          `Transactions analyzed: ${txs.length}\n\n` +
          `Your recent trading behavior looks safe. Keep it up! 🟢`
      );
      return;
    }

    const riskEmoji = {
      critical: "🔴",
      high: "🟠",
      medium: "🟡",
      low: "🟢",
    }[report.overallRisk];

    let message = `${riskEmoji} *EmeraldGuard Alert — ${report.overallRisk.toUpperCase()} RISK*\n\n`;
    message += `Wallet: \`${address.slice(0, 8)}...${address.slice(-4)}\`\n`;
    message += `Loss Probability: *${(report.overallLossProbability * 100).toFixed(0)}%*\n\n`;
    message += `*Detected Patterns:*\n`;

    for (const signal of report.detectedSignals) {
      const emoji = { critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" }[signal.severity];
      message += `${emoji} *${signal.patternName}*\n`;
      message += `   ${signal.details}\n`;
      message += `   Based on ${signal.affectedWallets.toLocaleString()} wallets\n\n`;
    }

    if (report.shouldPause) {
      message += `⛔ *RECOMMENDATION: PAUSE ALL TRADING*\n`;
      message += `You are in a high-risk behavioral state.\n\n`;
    }

    if (report.aiInsight) {
      message += `🤖 *AI Insight:*\n${report.aiInsight}\n\n`;
    }

    message += `_Top recommendation: ${report.detectedSignals[0]?.recommendation}_`;

    await sendMessage(chatId, message);
  } catch (err) {
    console.error("Guard command error:", err);
    await sendMessage(chatId, "❌ Failed to scan wallet. Please try again in a moment.");
  }
}

async function handleHiveLoss(chatId: number): Promise<void> {
  await sendTyping(chatId);

  try {
    const intel = await getHiveLossIntelligence();

    let message = `🐝 *HiveLoss — Community Intelligence*\n\n`;
    message += `Total Loss Reports: *${intel.totalLossReports.toLocaleString()}*\n\n`;

    if (intel.topRiskyPatterns.length === 0) {
      message += `No patterns recorded yet. Be the first to contribute!\n\n`;
    } else {
      message += `*Most Dangerous Patterns (from real losses):*\n`;
      for (const p of intel.topRiskyPatterns.slice(0, 5)) {
        message += `• ${p.patternId.replace(/_/g, " ")}: ${p.reportCount} reports, avg loss *${p.avgLossPercentage}%*\n`;
      }
      message += `\n`;
    }

    message += `⚠️ *Community Warning:*\n${intel.communityWarning}\n\n`;
    message += `_Share your loss: /report_\n`;
    message += `_Check a token: /token <address>_`;

    await sendMessage(chatId, message);
  } catch (err) {
    console.error("HiveLoss command error:", err);
    await sendMessage(chatId, "❌ Failed to fetch HiveLoss data.");
  }
}

async function handleToken(chatId: number, args: string[]): Promise<void> {
  const tokenAddress = args[0];

  if (!tokenAddress) {
    await sendMessage(chatId, "Usage: /token `<token_address>`");
    return;
  }

  await sendTyping(chatId);

  const risk = getTokenRisk(tokenAddress);
  const intel = await getHiveLossIntelligence(tokenAddress);

  const riskLevel = risk.isHighRisk ? "🔴 HIGH RISK" : risk.reports > 0 ? "🟡 CAUTION" : "🟢 UNKNOWN (no data yet)";

  let message = `🔍 *Token Risk Check*\n\n`;
  message += `Address: \`${tokenAddress.slice(0, 8)}...\`\n`;
  message += `Risk Level: *${riskLevel}*\n\n`;

  if (risk.reports > 0) {
    message += `Community Reports: ${risk.reports}\n`;
    message += `Average Loss: *${risk.avgLoss.toFixed(0)}%*\n`;
    message += `Rug Probability: *${(risk.rugProbability * 100).toFixed(0)}%*\n\n`;
  } else {
    message += `No community loss reports yet for this token.\n`;
    message += `Use caution with any unverified token.\n\n`;
  }

  if (intel.tokenWarning) {
    message += `⚠️ *Warning:* ${intel.communityWarning}`;
  }

  await sendMessage(chatId, message);
}

async function handlePatterns(chatId: number): Promise<void> {
  const patterns = getAllPatterns();

  let message = `🛡️ *EmeraldGuard — 8 Pre-Disaster Patterns*\n\n`;
  message += `These patterns are detected BEFORE you lose money:\n\n`;

  for (const p of patterns) {
    const prob = (p.lossProbability * 100).toFixed(0);
    message += `*${p.name}* (${prob}% loss probability)\n`;
    message += `_${p.description}_\n\n`;
  }

  message += `Use /guard <wallet> to check your wallet now.`;
  await sendMessage(chatId, message);
}

async function handleReport(chatId: number): Promise<void> {
  await sendMessage(
    chatId,
    `📝 *Submit Loss Report to HiveLoss*\n\n` +
      `Help protect the community with your experience.\n\n` +
      `Submit via our web dashboard or API:\n` +
      `POST /api/hiveloss/submit\n\n` +
      `Required:\n` +
      `• walletAddress\n` +
      `• lossPercentage (0-100)\n\n` +
      `Your wallet address is hashed — never stored directly.\n` +
      `Every report makes EmeraldFi smarter for everyone. 🐝`
  );
}

// ─── Main Update Handler ──────────────────────────────────────────────────────

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text || !msg.from) return;

  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const name = msg.from.first_name;
  const text = msg.text.trim();

  const [rawCmd, ...args] = text.split(/\s+/);
  if (!rawCmd) return;

  const cmd = rawCmd.toLowerCase().split("@")[0];

  switch (cmd) {
    case "/start":
    case "/help":
      await handleStart(chatId, userId, name);
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
    default:
      if (text.startsWith("/")) {
        await sendMessage(chatId, "Unknown command. Use /help to see available commands.");
      }
  }
}
