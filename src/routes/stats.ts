import { getDb } from "../db/database.ts";
import { cache, TTL } from "../services/cache.ts";
import type { ApiResponse } from "../types/index.ts";

const CACHE_KEY = "stats:global";

// Startup timestamp for uptime calculation
const startedAt = Date.now();

export interface StatsPayload {
  walletsScanned: number;
  lossReports: number;
  patternsDetected: number;
  uptime: number; // seconds
}

function queryStats(): StatsPayload {
  const db = getDb();

  const walletsScanned = (
    db
      .query<{ count: number }, []>("SELECT COUNT(DISTINCT wallet_address) AS count FROM guard_alerts")
      .get() ?? { count: 0 }
  ).count;

  const lossReports = (
    db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM loss_reports")
      .get() ?? { count: 0 }
  ).count;

  const patternsDetected = (
    db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM guard_alerts")
      .get() ?? { count: 0 }
  ).count;

  return {
    walletsScanned,
    lossReports,
    patternsDetected,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  };
}

export function handleStats(_req: Request): Response {
  let stats = cache.get<StatsPayload>(CACHE_KEY);
  if (!stats) {
    stats = queryStats();
    cache.set(CACHE_KEY, stats, TTL.STATS);
  } else {
    // Always return fresh uptime even when stats are cached
    stats = { ...stats, uptime: Math.floor((Date.now() - startedAt) / 1000) };
  }

  return new Response(
    JSON.stringify({ success: true, data: stats, timestamp: Date.now() } satisfies ApiResponse<StatsPayload>),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
