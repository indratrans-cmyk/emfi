import {
  getHiveLossIntelligence,
  submitLossReport,
  getTokenRisk,
} from "../services/hiveloss.ts";
import type { ApiResponse, HiveLossIntelligence, LossReport } from "../types/index.ts";

export async function handleHiveLossGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const tokenAddress = url.searchParams.get("token") ?? undefined;

  try {
    const intelligence = await getHiveLossIntelligence(tokenAddress);
    return json<ApiResponse<HiveLossIntelligence>>({
      success: true,
      data: intelligence,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("HiveLoss get error:", err);
    return jsonError("Failed to fetch HiveLoss data", 500);
  }
}

export async function handleHiveLossSubmit(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    walletAddress?: string;
    tokenAddress?: string;
    tokenName?: string;
    lossAmountSol?: number;
    lossPercentage?: number;
    tradeTimestamp?: number;
    patternTags?: string[];
    tokenAgeDays?: number;
  };

  if (!body.walletAddress || !body.lossPercentage) {
    return jsonError("walletAddress and lossPercentage are required", 400);
  }

  if (body.lossPercentage < 0 || body.lossPercentage > 100) {
    return jsonError("lossPercentage must be between 0 and 100", 400);
  }

  const report: Omit<LossReport, "walletHash"> = {
    tokenAddress: body.tokenAddress,
    tokenName: body.tokenName,
    lossAmountSol: body.lossAmountSol,
    lossPercentage: body.lossPercentage,
    tradeTimestamp: body.tradeTimestamp ?? Date.now(),
    patternTags: (body.patternTags as LossReport["patternTags"]) ?? [],
    marketConditions: {
      hourOfDay: new Date().getUTCHours(),
      dayOfWeek: new Date().getUTCDay(),
      tokenAgeDays: body.tokenAgeDays,
    },
  };

  submitLossReport(body.walletAddress, report);

  return json<ApiResponse<{ contributed: boolean; message: string }>>({
    success: true,
    data: {
      contributed: true,
      message: "Your loss data now protects the community. Thank you.",
    },
    timestamp: Date.now(),
  });
}

export function handleTokenRisk(req: Request): Response {
  const url = new URL(req.url);
  const tokenAddress = url.searchParams.get("token");

  if (!tokenAddress) {
    return jsonError("Token address required", 400);
  }

  const risk = getTokenRisk(tokenAddress);
  return json<ApiResponse<typeof risk>>({
    success: true,
    data: risk,
    timestamp: Date.now(),
  });
}

function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number): Response {
  return json<ApiResponse<null>>({ success: false, error: message, timestamp: Date.now() }, status);
}
