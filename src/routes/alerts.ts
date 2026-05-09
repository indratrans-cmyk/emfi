import { getDb } from "../db/database.ts";
import { cache, TTL } from "../services/cache.ts";
import type { ApiResponse } from "../types/index.ts";

const CACHE_KEY = "alerts:recent";

export interface AlertItem {
  walletHash: string;
  patternName: string;
  severity: string;
  createdAt: number;
}

function queryRecentAlerts(): AlertItem[] {
  const db = getDb();

  const rows = db
    .query<
      { wallet_address: string; pattern_name: string; severity: string; created_at: number },
      []
    >(
      `SELECT wallet_address, pattern_name, severity, created_at
       FROM guard_alerts
       ORDER BY created_at DESC
       LIMIT 10`
    )
    .all();

  return rows.map(r => ({
    // Expose a truncated pseudo-hash for display (not a real wallet address)
    walletHash:  truncate(r.wallet_address),
    patternName: r.pattern_name,
    severity:    r.severity,
    createdAt:   r.created_at,
  }));
}

function truncate(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function handleRecentAlerts(_req: Request): Response {
  let alerts = cache.get<AlertItem[]>(CACHE_KEY);
  if (!alerts) {
    alerts = queryRecentAlerts();
    cache.set(CACHE_KEY, alerts, TTL.ALERTS);
  }

  return new Response(
    JSON.stringify({ success: true, data: alerts, timestamp: Date.now() } satisfies ApiResponse<AlertItem[]>),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
