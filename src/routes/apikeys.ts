import { getDb } from "../db/database.ts";
import { isValidSolanaAddress } from "../services/solana.ts";

function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "ef_" + Buffer.from(bytes).toString("base64url");
}

export function handleGenerateApiKey(req: Request): Response {
  const url    = new URL(req.url);
  const wallet = url.searchParams.get("wallet") ?? "";

  if (!isValidSolanaAddress(wallet)) {
    return json({ success: false, error: "Valid wallet address required" }, 400);
  }

  const db  = getDb();
  const key = generateKey();
  db.run("INSERT INTO api_keys (key, wallet_address) VALUES (?, ?)", [key, wallet]);

  return json({
    success: true,
    data: {
      key,
      wallet,
      note: "Save this key — it won't be shown again. Send as X-Api-Key header.",
    },
    timestamp: Date.now(),
  });
}

export function handleListApiKeys(req: Request): Response {
  const url    = new URL(req.url);
  const wallet = url.searchParams.get("wallet") ?? "";

  if (!isValidSolanaAddress(wallet)) {
    return json({ success: false, error: "Valid wallet address required" }, 400);
  }

  type KeyRow = { key: string; created_at: number; last_used: number | null; request_count: number };
  const db   = getDb();
  const rows = db
    .query("SELECT key, created_at, last_used, request_count FROM api_keys WHERE wallet_address = ? ORDER BY created_at DESC")
    .all(wallet) as KeyRow[];

  return json({
    success: true,
    data: rows.map(r => ({
      key:          r.key.slice(0, 10) + "…",
      createdAt:    r.created_at,
      lastUsed:     r.last_used,
      requestCount: r.request_count,
    })),
    timestamp: Date.now(),
  });
}

export function validateApiKey(req: Request): { valid: boolean; wallet?: string } {
  const key = req.headers.get("x-api-key") ?? "";
  if (!key) return { valid: false };

  const db  = getDb();
  type Row  = { wallet_address: string };
  const row = db.query("SELECT wallet_address FROM api_keys WHERE key = ?").get(key) as Row | null;
  if (!row) return { valid: false };

  db.run(
    "UPDATE api_keys SET last_used = unixepoch(), request_count = request_count + 1 WHERE key = ?",
    [key]
  );
  return { valid: true, wallet: row.wallet_address };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
