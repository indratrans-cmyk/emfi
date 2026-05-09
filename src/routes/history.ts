import { getDb } from "../db/database.ts";
import { requireValidAddress } from "../middleware/validate.ts";
import type { ApiResponse } from "../types/index.ts";

export interface ScanHistoryItem {
  patternName: string;
  severity: string;
  lossProbability: number;
  details: string;
  recommendation: string;
  createdAt: number;
}

export function handleGuardHistory(req: Request): Response {
  const url = new URL(req.url);
  const address = url.searchParams.get("address");

  const invalid = requireValidAddress(address, "address");
  if (invalid) return invalid;

  // Compute a simple truncated representation used for lookup
  // (guard_alerts stores the raw wallet_address, not a hash)
  const db = getDb();

  const rows = db
    .query<
      {
        pattern_name: string;
        severity: string;
        loss_probability: number;
        details: string;
        recommendation: string;
        created_at: number;
      },
      [string]
    >(
      `SELECT pattern_name, severity, loss_probability, details, recommendation, created_at
       FROM guard_alerts
       WHERE wallet_address = ?
       ORDER BY created_at DESC
       LIMIT 20`
    )
    .all(address!);

  const history: ScanHistoryItem[] = rows.map(r => ({
    patternName:     r.pattern_name,
    severity:        r.severity,
    lossProbability: r.loss_probability,
    details:         r.details,
    recommendation:  r.recommendation,
    createdAt:       r.created_at,
  }));

  return new Response(
    JSON.stringify({ success: true, data: history, timestamp: Date.now() } satisfies ApiResponse<ScanHistoryItem[]>),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
