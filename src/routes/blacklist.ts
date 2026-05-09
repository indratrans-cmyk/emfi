import { getDb } from "../db/database.ts";

type TokenRow = {
  token_address: string;
  token_name: string | null;
  total_reports: number;
  avg_loss_percentage: number;
  rug_probability: number;
  last_updated: number;
};

export function handleBlacklist(_req: Request): Response {
  const db = getDb();
  const tokens = db
    .query(`
      SELECT token_address, token_name, total_reports, avg_loss_percentage, rug_probability, last_updated
      FROM token_intelligence
      WHERE total_reports >= 2 AND (rug_probability >= 0.5 OR avg_loss_percentage >= 60)
      ORDER BY rug_probability DESC, total_reports DESC
      LIMIT 50
    `)
    .all() as TokenRow[];

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        count: tokens.length,
        tokens: tokens.map(t => ({
          address: t.token_address,
          name: t.token_name ?? "Unknown",
          reports: t.total_reports,
          avgLoss: Math.round(t.avg_loss_percentage * 10) / 10,
          rugProbability: Math.round(t.rug_probability * 100) / 100,
          lastUpdated: t.last_updated,
        })),
      },
      timestamp: Date.now(),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
