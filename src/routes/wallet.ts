import {
  isValidSolanaAddress,
  getWalletBalance,
  getHeliusTransactions,
} from "../services/solana.ts";
import { registerWallet, cacheTxs, getCachedTxs } from "../db/database.ts";
import type { ApiResponse, WalletTx } from "../types/index.ts";

export async function handleWalletAnalyze(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const address = url.searchParams.get("address");

  if (!address) {
    return jsonError("Missing wallet address", 400);
  }

  if (!isValidSolanaAddress(address)) {
    return jsonError("Invalid Solana wallet address", 400);
  }

  try {
    registerWallet(address);

    const [balance, txs] = await Promise.all([
      getWalletBalance(address),
      getHeliusTransactions(address, 50),
    ]);

    if (txs.length > 0) {
      cacheTxs(
        address,
        txs.map((t) => ({
          signature: t.signature,
          tokenAddress: t.tokenAddress,
          tokenName: t.tokenName,
          action: t.action,
          amountSol: t.amountSol,
          amountToken: t.amountToken,
          tokenAgeHours: t.tokenAge,
          txTimestamp: t.timestamp,
        }))
      );
    }

    const avgTradeSize =
      txs.length > 0 ? txs.reduce((s, t) => s + t.amountSol, 0) / txs.length : 0;

    const buys = txs.filter((t) => t.action === "buy").length;
    const sells = txs.filter((t) => t.action === "sell").length;

    return json<ApiResponse<{
      address: string;
      balanceSol: number;
      recentTxCount: number;
      avgTradeSizeSol: number;
      buyCount: number;
      sellCount: number;
      recentTxs: WalletTx[];
    }>>({
      success: true,
      data: {
        address,
        balanceSol: balance,
        recentTxCount: txs.length,
        avgTradeSizeSol: Number(avgTradeSize.toFixed(4)),
        buyCount: buys,
        sellCount: sells,
        recentTxs: txs.slice(0, 10),
      },
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("Wallet analyze error:", err);
    return jsonError("Failed to fetch wallet data", 500);
  }
}

export async function handleWalletRegister(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    address?: string;
    telegramUserId?: string;
    telegramChatId?: string;
  };

  if (!body.address || !isValidSolanaAddress(body.address)) {
    return jsonError("Valid Solana address required", 400);
  }

  registerWallet(body.address, body.telegramUserId, body.telegramChatId);

  return json<ApiResponse<{ registered: boolean }>>({
    success: true,
    data: { registered: true },
    timestamp: Date.now(),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number): Response {
  return json<ApiResponse<null>>({ success: false, error: message, timestamp: Date.now() }, status);
}
