import { getDb } from "../db/database.ts";
import { isValidSolanaAddress } from "../services/solana.ts";

export function handleDashboardData(req: Request): Response {
  const url     = new URL(req.url);
  const address = url.searchParams.get("address") ?? "";

  if (!isValidSolanaAddress(address)) {
    return json({ success: false, error: "Valid wallet address required" }, 400);
  }

  const db = getDb();

  type WalletRow = {
    address: string;
    telegram_user_id: string | null;
    telegram_chat_id: string | null;
    email_address: string | null;
    guard_enabled: number;
    registered_at: number;
  };
  const wallet = db
    .query("SELECT * FROM wallets WHERE address = ?")
    .get(address) as WalletRow | null;

  type AlertRow = {
    pattern_name: string;
    severity: string;
    loss_probability: number;
    details: string;
    created_at: number;
  };
  const alerts = db
    .query(
      `SELECT pattern_name, severity, loss_probability, details, created_at
       FROM guard_alerts WHERE wallet_address = ?
       ORDER BY created_at DESC LIMIT 20`
    )
    .all(address) as AlertRow[];

  type ScanRow = { total: number; critical: number; high: number };
  const scanStats = db
    .query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical,
              SUM(CASE WHEN severity='high'     THEN 1 ELSE 0 END) as high
       FROM guard_alerts WHERE wallet_address = ?`
    )
    .get(address) as ScanRow;

  return json({
    success: true,
    data: {
      registered:   Boolean(wallet),
      guardEnabled: Boolean(wallet?.guard_enabled),
      telegramLinked: Boolean(wallet?.telegram_chat_id),
      emailLinked:  Boolean(wallet?.email_address),
      registeredAt: wallet?.registered_at ?? null,
      totalAlerts:  scanStats.total ?? 0,
      criticalAlerts: scanStats.critical ?? 0,
      highAlerts:   scanStats.high ?? 0,
      recentAlerts: alerts,
    },
    timestamp: Date.now(),
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
