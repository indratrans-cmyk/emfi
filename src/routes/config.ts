import { cache, TTL } from "../services/cache.ts";
import type { ApiResponse } from "../types/index.ts";

const CACHE_KEY = "config:public";

export interface PublicConfig {
  botUsername: string;
}

export function handleConfig(_req: Request): Response {
  let cfg = cache.get<PublicConfig>(CACHE_KEY);
  if (!cfg) {
    cfg = {
      botUsername: Bun.env.TELEGRAM_BOT_USERNAME ?? "EmeraldFiBot",
    };
    cache.set(CACHE_KEY, cfg, TTL.CONFIG);
  }

  return new Response(
    JSON.stringify({ success: true, data: cfg, timestamp: Date.now() } satisfies ApiResponse<PublicConfig>),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
