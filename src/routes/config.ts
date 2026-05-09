import { cache, TTL } from "../services/cache.ts";
import type { ApiResponse } from "../types/index.ts";

const CACHE_KEY = "config:public";

export interface PublicConfig {
  botUsername: string;
  tokenAddress: string | null;
  tokenSymbol: string;
  buyUrl: string | null;
}

export function handleConfig(_req: Request): Response {
  let cfg = cache.get<PublicConfig>(CACHE_KEY);
  if (!cfg) {
    const ca = Bun.env.EMFI_TOKEN_ADDRESS?.trim() || null;
    cfg = {
      botUsername:  Bun.env.TELEGRAM_BOT_USERNAME ?? "EmeraldFiBot",
      tokenAddress: ca,
      tokenSymbol:  "$EMFI",
      buyUrl:       ca ? `https://pump.fun/coin/${ca}` : null,
    };
    // Short TTL when no CA yet (re-check every 2 min); long cache once CA is set
    cache.set(CACHE_KEY, cfg, ca ? TTL.CONFIG : 2 * 60 * 1000);
  }

  return new Response(
    JSON.stringify({ success: true, data: cfg, timestamp: Date.now() } satisfies ApiResponse<PublicConfig>),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
