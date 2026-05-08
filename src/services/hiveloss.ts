import {
  saveLossReport,
  getHiveLossStats,
  getTokenIntelligence,
} from "../db/database.ts";
import { generateHiveLossInsight } from "./ai.ts";
import type { LossReport, HiveLossIntelligence } from "../types/index.ts";
import { createHash } from "crypto";

function hashWallet(address: string): string {
  return createHash("sha256").update(address + "emeraldfi-salt").digest("hex").slice(0, 16);
}

export function submitLossReport(
  walletAddress: string,
  report: Omit<LossReport, "walletHash">
): void {
  const walletHash = hashWallet(walletAddress);
  const date = new Date(report.tradeTimestamp);

  saveLossReport({
    walletHash,
    tokenAddress: report.tokenAddress,
    tokenName: report.tokenName,
    lossAmountSol: report.lossAmountSol,
    lossPercentage: report.lossPercentage,
    tradeTimestamp: report.tradeTimestamp,
    patternTags: report.patternTags,
    hourOfDay: date.getUTCHours(),
    dayOfWeek: date.getUTCDay(),
    tokenAgeDays: report.marketConditions.tokenAgeDays,
  });
}

export async function getHiveLossIntelligence(
  tokenAddress?: string
): Promise<HiveLossIntelligence> {
  const stats = getHiveLossStats();

  const topRiskyPatterns = stats.topPatterns.map((p) => ({
    patternId: p.pattern as HiveLossIntelligence["topRiskyPatterns"][number]["patternId"],
    reportCount: p.cnt,
    avgLossPercentage: Math.round(p.avg_loss),
  }));

  let tokenWarning: HiveLossIntelligence["tokenWarning"] | undefined;
  if (tokenAddress) {
    const intel = getTokenIntelligence(tokenAddress);
    if (intel && Number(intel["total_reports"]) >= 3) {
      tokenWarning = {
        tokenAddress,
        tokenName: (intel["token_name"] as string) ?? tokenAddress.slice(0, 8),
        reportCount: Number(intel["total_reports"]),
        avgLoss: Number(intel["avg_loss_percentage"]),
        rugProbability: Number(intel["rug_probability"]),
      };
    }
  }

  const topPatternName = topRiskyPatterns[0]?.patternId ?? "FOMO_SPIRAL";
  const aiWarning = await generateHiveLossInsight({
    totalReports: stats.total,
    topPattern: topPatternName,
    avgLoss: stats.avgLoss,
    tokenWarning: tokenWarning?.tokenName,
  }).catch(() => buildFallbackWarning(stats.total, stats.avgLoss));

  return {
    totalLossReports: stats.total,
    topRiskyPatterns,
    tokenWarning,
    communityWarning: aiWarning,
  };
}

function buildFallbackWarning(total: number, avgLoss: number): string {
  if (total === 0) return "Be the first to contribute to the community shield. Share your loss data to protect others.";
  return `⚠️ EmeraldFi community has tracked ${total} loss events with an average loss of ${avgLoss.toFixed(0)}%. Check your patterns before trading.`;
}

export function getTokenRisk(tokenAddress: string): {
  isHighRisk: boolean;
  reports: number;
  avgLoss: number;
  rugProbability: number;
} {
  const intel = getTokenIntelligence(tokenAddress);
  if (!intel) return { isHighRisk: false, reports: 0, avgLoss: 0, rugProbability: 0 };

  return {
    isHighRisk: Number(intel["rug_probability"]) > 0.5 || Number(intel["avg_loss_percentage"]) > 60,
    reports: Number(intel["total_reports"]),
    avgLoss: Number(intel["avg_loss_percentage"]),
    rugProbability: Number(intel["rug_probability"]),
  };
}
