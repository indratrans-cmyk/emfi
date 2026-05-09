import {
  isValidSolanaAddress,
  getWalletBalance,
  getHeliusTransactions,
} from "../services/solana.ts";
import { scanWallet, getAllPatterns } from "../services/emeraldguard.ts";
import { getCachedTxs } from "../db/database.ts";
import { scanQueue } from "../services/queue.ts";
import { broadcast } from "../services/pubsub.ts";
import type { ApiResponse, GuardReport, BehaviorPattern } from "../types/index.ts";

export async function handleGuardScan(req: Request): Promise<Response> {
  const url     = new URL(req.url);
  const address = url.searchParams.get("address");
  const useAI   = url.searchParams.get("ai") !== "false";

  if (!address || !isValidSolanaAddress(address)) {
    return jsonError("Valid Solana wallet address required", 400);
  }

  if (scanQueue.size >= 10) {
    return jsonError("Scan queue is full. Please try again shortly.", 429);
  }

  try {
    const report = await scanQueue.add(async () => {
      const [balance, txs] = await Promise.all([
        getWalletBalance(address),
        getHeliusTransactions(address, 50),
      ]);
      return scanWallet(address, txs, balance, useAI);
    });

    // Push result to any WebSocket subscribers for this wallet
    broadcast(address, { type: "scan_complete", data: report, timestamp: Date.now() });

    return json<ApiResponse<GuardReport>>({
      success: true,
      data: report,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("Guard scan error:", err);
    return jsonError("Scan failed. Please try again.", 500);
  }
}

export function handleGuardPatterns(_req: Request): Response {
  const patterns = getAllPatterns();
  return json<ApiResponse<BehaviorPattern[]>>({
    success: true,
    data: patterns,
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
