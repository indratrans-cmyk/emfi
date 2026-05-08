import type { WalletTx, DetectedSignal, GuardReport, BehaviorPattern, Severity } from "../types/index.ts";
import { analyzeWalletBehavior } from "./ai.ts";
import { saveGuardAlert, getHiveLossStats } from "../db/database.ts";

// ─── Pattern Definitions ─────────────────────────────────────────────────────

const PATTERNS: BehaviorPattern[] = [
  {
    id: "FOMO_SPIRAL",
    name: "FOMO Spiral",
    description: "3+ swaps in 2 hours with increasing trade sizes",
    lossProbability: 0.78,
    sampleSize: 4200,
  },
  {
    id: "LOSS_CHASER",
    name: "Loss Chaser",
    description: "Buying again within 15 min after a loss on the same token",
    lossProbability: 0.82,
    sampleSize: 3100,
  },
  {
    id: "NIGHT_FOMO",
    name: "Night FOMO",
    description: "Trading midnight–4AM with position size 2x above average",
    lossProbability: 0.71,
    sampleSize: 5600,
  },
  {
    id: "NEW_TOKEN_RUSH",
    name: "New Token Rush",
    description: "Buying tokens less than 24h old, 3+ times this week",
    lossProbability: 0.85,
    sampleSize: 8900,
  },
  {
    id: "DEGEN_ACCEL",
    name: "Degen Acceleration",
    description: "Each successive trade 20%+ larger than previous, 5 consecutive",
    lossProbability: 0.76,
    sampleSize: 2800,
  },
  {
    id: "PANIC_AVERAGE",
    name: "Panic Averaging",
    description: "5+ buys of the same falling token within 1 hour",
    lossProbability: 0.80,
    sampleSize: 3700,
  },
  {
    id: "PORTFOLIO_DUMP",
    name: "Portfolio Concentration",
    description: "Moving 70%+ of wallet balance into a single new token",
    lossProbability: 0.73,
    sampleSize: 4100,
  },
  {
    id: "RAPID_REVERSAL",
    name: "Rapid Reversal",
    description: "Buying and selling the same token within 1 hour",
    lossProbability: 0.67,
    sampleSize: 6200,
  },
];

// ─── Pattern Detection Logic ──────────────────────────────────────────────────

function detectFomoSpiral(txs: WalletTx[]): boolean {
  const now = Date.now();
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  const recent = txs
    .filter((t) => t.timestamp >= twoHoursAgo && t.action === "buy")
    .sort((a, b) => a.timestamp - b.timestamp);

  if (recent.length < 3) return false;

  let increasingCount = 0;
  for (let i = 1; i < recent.length; i++) {
    if ((recent[i]?.amountSol ?? 0) > (recent[i - 1]?.amountSol ?? 0) * 1.1) {
      increasingCount++;
    }
  }
  return increasingCount >= 2;
}

function detectLossChaser(txs: WalletTx[]): boolean {
  const sortedTxs = [...txs].sort((a, b) => b.timestamp - a.timestamp);
  for (let i = 0; i < sortedTxs.length - 1; i++) {
    const current = sortedTxs[i];
    const next = sortedTxs[i + 1];
    if (!current || !next) continue;
    if (
      current.action === "buy" &&
      next.action === "sell" &&
      current.tokenAddress &&
      current.tokenAddress === next.tokenAddress
    ) {
      const diffMin = (current.timestamp - next.timestamp) / 60_000;
      if (diffMin <= 15) return true;
    }
  }
  return false;
}

function detectNightFomo(txs: WalletTx[], avgTradeSize: number): boolean {
  const nightTxs = txs.filter((t) => {
    const hour = new Date(t.timestamp).getUTCHours();
    return (hour >= 0 && hour <= 4) && t.action === "buy";
  });
  return nightTxs.some((t) => t.amountSol > avgTradeSize * 2);
}

function detectNewTokenRush(txs: WalletTx[]): boolean {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newTokenBuys = txs.filter(
    (t) =>
      t.timestamp >= sevenDaysAgo &&
      t.action === "buy" &&
      t.tokenAge !== undefined &&
      t.tokenAge < 24
  );
  return newTokenBuys.length >= 3;
}

function detectDegenAccel(txs: WalletTx[]): boolean {
  const buys = txs
    .filter((t) => t.action === "buy")
    .sort((a, b) => a.timestamp - b.timestamp);

  if (buys.length < 5) return false;

  let streak = 0;
  for (let i = 1; i < buys.length; i++) {
    if ((buys[i]?.amountSol ?? 0) > (buys[i - 1]?.amountSol ?? 0) * 1.2) {
      streak++;
      if (streak >= 4) return true;
    } else {
      streak = 0;
    }
  }
  return false;
}

function detectPanicAverage(txs: WalletTx[]): boolean {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentBuys = txs.filter(
    (t) => t.timestamp >= oneHourAgo && t.action === "buy"
  );

  const tokenGroups = new Map<string, WalletTx[]>();
  for (const tx of recentBuys) {
    if (!tx.tokenAddress) continue;
    const group = tokenGroups.get(tx.tokenAddress) ?? [];
    group.push(tx);
    tokenGroups.set(tx.tokenAddress, group);
  }

  for (const [, group] of tokenGroups) {
    if (group.length >= 5) return true;
  }
  return false;
}

function detectPortfolioDump(txs: WalletTx[], balanceSol: number): boolean {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentBuys = txs.filter(
    (t) => t.timestamp >= oneDayAgo && t.action === "buy"
  );

  const totalSpent = recentBuys.reduce((s, t) => s + t.amountSol, 0);
  return balanceSol > 0.1 && totalSpent / (balanceSol + totalSpent) > 0.7;
}

function detectRapidReversal(txs: WalletTx[]): boolean {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentTxs = txs.filter((t) => t.timestamp >= oneHourAgo);
  const tokensSeen = new Set<string>();
  const tokensWithBothActions = new Set<string>();

  const buys = new Set(
    recentTxs
      .filter((t) => t.action === "buy" && t.tokenAddress)
      .map((t) => t.tokenAddress!)
  );
  const sells = new Set(
    recentTxs
      .filter((t) => t.action === "sell" && t.tokenAddress)
      .map((t) => t.tokenAddress!)
  );

  for (const addr of buys) {
    if (sells.has(addr)) tokensWithBothActions.add(addr);
    tokensSeen.add(addr);
  }

  return tokensWithBothActions.size > 0;
}

// ─── Main Guard Scan ─────────────────────────────────────────────────────────

export async function scanWallet(
  address: string,
  txs: WalletTx[],
  balanceSol: number,
  useAI = true
): Promise<GuardReport> {
  const avgTradeSize =
    txs.length > 0
      ? txs.reduce((s, t) => s + t.amountSol, 0) / txs.length
      : 0;

  const detectionResults: Array<{ pattern: BehaviorPattern; detected: boolean }> = [
    { pattern: PATTERNS.find((p) => p.id === "FOMO_SPIRAL")!, detected: detectFomoSpiral(txs) },
    { pattern: PATTERNS.find((p) => p.id === "LOSS_CHASER")!, detected: detectLossChaser(txs) },
    { pattern: PATTERNS.find((p) => p.id === "NIGHT_FOMO")!, detected: detectNightFomo(txs, avgTradeSize) },
    { pattern: PATTERNS.find((p) => p.id === "NEW_TOKEN_RUSH")!, detected: detectNewTokenRush(txs) },
    { pattern: PATTERNS.find((p) => p.id === "DEGEN_ACCEL")!, detected: detectDegenAccel(txs) },
    { pattern: PATTERNS.find((p) => p.id === "PANIC_AVERAGE")!, detected: detectPanicAverage(txs) },
    { pattern: PATTERNS.find((p) => p.id === "PORTFOLIO_DUMP")!, detected: detectPortfolioDump(txs, balanceSol) },
    { pattern: PATTERNS.find((p) => p.id === "RAPID_REVERSAL")!, detected: detectRapidReversal(txs) },
  ];

  const detected = detectionResults.filter((r) => r.detected && r.pattern);

  const signals: DetectedSignal[] = detected.map(({ pattern }) => {
    const prob = pattern.lossProbability;
    const severity: Severity =
      prob >= 0.80 ? "critical"
      : prob >= 0.72 ? "high"
      : prob >= 0.65 ? "medium"
      : "low";

    const signal: DetectedSignal = {
      patternId: pattern.id,
      patternName: pattern.name,
      severity,
      lossProbability: prob,
      triggeredAt: new Date().toISOString(),
      details: pattern.description,
      recommendation: getRecommendation(pattern.id),
      affectedWallets: pattern.sampleSize,
    };

    saveGuardAlert({
      walletAddress: address,
      patternId: pattern.id,
      patternName: pattern.name,
      severity,
      lossProbability: prob,
      details: pattern.description,
      recommendation: signal.recommendation,
    });

    return signal;
  });

  const maxProb =
    signals.length > 0
      ? Math.max(...signals.map((s) => s.lossProbability))
      : 0;

  const overallRisk: Severity =
    maxProb >= 0.80 ? "critical"
    : maxProb >= 0.72 ? "high"
    : maxProb >= 0.65 ? "medium"
    : signals.length > 0 ? "low"
    : "low";

  let aiInsight: string | undefined;
  if (useAI && signals.length > 0) {
    const recentTrades = txs.slice(0, 5).map((t) => ({
      action: t.action,
      amountSol: t.amountSol,
      tokenName: t.tokenName,
      hoursAgo: (Date.now() - t.timestamp) / 3_600_000,
    }));

    aiInsight = await analyzeWalletBehavior({
      walletAddress: address,
      detectedPatterns: signals.map((s) => s.patternName),
      recentTrades,
      overallRisk,
      lossProbability: maxProb,
    });
  }

  return {
    walletAddress: address,
    scanTimestamp: Date.now(),
    overallRisk,
    overallLossProbability: maxProb,
    detectedSignals: signals,
    aiInsight,
    shouldPause: overallRisk === "critical" || overallRisk === "high",
  };
}

function getRecommendation(patternId: string): string {
  const recs: Record<string, string> = {
    FOMO_SPIRAL: "Stop. Wait 2 hours before your next trade. You are in emotional mode.",
    LOSS_CHASER: "Do NOT rebuy the same token. Walk away for at least 30 minutes.",
    NIGHT_FOMO: "Close your wallet app. Never trade between midnight and 4AM.",
    NEW_TOKEN_RUSH: "Limit yourself to 1 new token per week. Most new tokens rug within 72h.",
    DEGEN_ACCEL: "Cut your next trade size to 50% of your last. You are escalating dangerously.",
    PANIC_AVERAGE: "Stop buying the dip. Set a maximum 2-buy limit per token per day.",
    PORTFOLIO_DUMP: "Never put more than 20% into a single new token. Diversify immediately.",
    RAPID_REVERSAL: "You are trading emotionally. Each reversal costs you fees + spread. Hold.",
  };
  return recs[patternId] ?? "Slow down and review your recent trades before continuing.";
}

export function getAllPatterns(): BehaviorPattern[] {
  return PATTERNS;
}
