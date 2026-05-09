import { Database } from "bun:sqlite";

const DB_PATH = process.env["DB_PATH"] ?? "./emeraldfi.db";

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH, { create: true });
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  const d = getDb();

  d.run(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT UNIQUE NOT NULL,
      telegram_user_id TEXT,
      telegram_chat_id TEXT,
      email_address TEXT,
      guard_enabled INTEGER DEFAULT 1,
      hiveloss_opted_in INTEGER DEFAULT 0,
      registered_at INTEGER DEFAULT (unixepoch())
    )
  `);

  try { d.run(`ALTER TABLE wallets ADD COLUMN email_address TEXT`); } catch { /* column already exists */ }

  d.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      wallet_address TEXT,
      telegram_user_id TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      last_used INTEGER,
      request_count INTEGER DEFAULT 0
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS loss_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_hash TEXT NOT NULL,
      token_address TEXT,
      token_name TEXT,
      loss_amount_sol REAL,
      loss_percentage REAL NOT NULL,
      trade_timestamp INTEGER NOT NULL,
      pattern_tags TEXT DEFAULT '[]',
      hour_of_day INTEGER,
      day_of_week INTEGER,
      token_age_days REAL,
      submitted_at INTEGER DEFAULT (unixepoch())
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS guard_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      pattern_id TEXT NOT NULL,
      pattern_name TEXT NOT NULL,
      severity TEXT NOT NULL,
      loss_probability REAL NOT NULL,
      details TEXT,
      recommendation TEXT,
      acknowledged INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS tx_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      signature TEXT UNIQUE NOT NULL,
      token_address TEXT,
      token_name TEXT,
      action TEXT NOT NULL,
      amount_sol REAL,
      amount_token REAL,
      token_age_hours REAL,
      tx_timestamp INTEGER NOT NULL,
      cached_at INTEGER DEFAULT (unixepoch())
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS token_intelligence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_address TEXT UNIQUE NOT NULL,
      token_name TEXT,
      total_reports INTEGER DEFAULT 0,
      avg_loss_percentage REAL DEFAULT 0,
      rug_probability REAL DEFAULT 0,
      last_updated INTEGER DEFAULT (unixepoch())
    )
  `);

  d.run(`CREATE INDEX IF NOT EXISTS idx_loss_reports_wallet ON loss_reports(wallet_hash)`);
  d.run(`CREATE INDEX IF NOT EXISTS idx_tx_cache_wallet ON tx_cache(wallet_address)`);
  d.run(`CREATE INDEX IF NOT EXISTS idx_guard_alerts_wallet ON guard_alerts(wallet_address)`);
  d.run(`CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key)`);
}

export function registerWallet(
  address: string,
  telegramUserId?: string,
  telegramChatId?: string
): void {
  const d = getDb();
  d.run(
    `INSERT OR IGNORE INTO wallets (address, telegram_user_id, telegram_chat_id)
     VALUES (?, ?, ?)`,
    [address, telegramUserId ?? null, telegramChatId ?? null]
  );
}

export function setWalletEmail(address: string, email: string): void {
  getDb().run(
    `INSERT INTO wallets (address, email_address) VALUES (?, ?)
     ON CONFLICT(address) DO UPDATE SET email_address = excluded.email_address`,
    [address, email]
  );
}

export function getWallet(address: string) {
  return getDb()
    .query("SELECT * FROM wallets WHERE address = ?")
    .get(address) as Record<string, unknown> | null;
}

export function getWalletByTelegramId(telegramUserId: string) {
  return getDb()
    .query("SELECT * FROM wallets WHERE telegram_user_id = ?")
    .get(telegramUserId) as Record<string, unknown> | null;
}

export function saveLossReport(report: {
  walletHash: string;
  tokenAddress?: string;
  tokenName?: string;
  lossAmountSol?: number;
  lossPercentage: number;
  tradeTimestamp: number;
  patternTags: string[];
  hourOfDay: number;
  dayOfWeek: number;
  tokenAgeDays?: number;
}): void {
  getDb().run(
    `INSERT INTO loss_reports
     (wallet_hash, token_address, token_name, loss_amount_sol, loss_percentage,
      trade_timestamp, pattern_tags, hour_of_day, day_of_week, token_age_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      report.walletHash,
      report.tokenAddress ?? null,
      report.tokenName ?? null,
      report.lossAmountSol ?? null,
      report.lossPercentage,
      report.tradeTimestamp,
      JSON.stringify(report.patternTags),
      report.hourOfDay,
      report.dayOfWeek,
      report.tokenAgeDays ?? null,
    ]
  );

  if (report.tokenAddress) {
    getDb().run(
      `INSERT INTO token_intelligence (token_address, token_name, total_reports, avg_loss_percentage, rug_probability)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(token_address) DO UPDATE SET
         total_reports = total_reports + 1,
         avg_loss_percentage = (avg_loss_percentage * total_reports + ?) / (total_reports + 1),
         rug_probability = CASE WHEN ? > 80 THEN MIN(1.0, rug_probability + 0.1) ELSE rug_probability END,
         last_updated = unixepoch()`,
      [
        report.tokenAddress,
        report.tokenName ?? null,
        report.lossPercentage,
        report.lossPercentage > 80 ? 0.5 : 0.1,
        report.lossPercentage,
        report.lossPercentage,
      ]
    );
  }
}

export function saveGuardAlert(alert: {
  walletAddress: string;
  patternId: string;
  patternName: string;
  severity: string;
  lossProbability: number;
  details: string;
  recommendation: string;
}): void {
  getDb().run(
    `INSERT INTO guard_alerts
     (wallet_address, pattern_id, pattern_name, severity, loss_probability, details, recommendation)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      alert.walletAddress,
      alert.patternId,
      alert.patternName,
      alert.severity,
      alert.lossProbability,
      alert.details,
      alert.recommendation,
    ]
  );
}

export function getTokenIntelligence(tokenAddress: string) {
  return getDb()
    .query("SELECT * FROM token_intelligence WHERE token_address = ?")
    .get(tokenAddress) as Record<string, unknown> | null;
}

export function getHiveLossStats() {
  const d = getDb();
  const total = d
    .query("SELECT COUNT(*) as count FROM loss_reports")
    .get() as { count: number };
  const avgLoss = d
    .query("SELECT AVG(loss_percentage) as avg FROM loss_reports")
    .get() as { avg: number | null };
  const topPatterns = d
    .query(
      `SELECT json_each.value as pattern, COUNT(*) as cnt, AVG(loss_percentage) as avg_loss
       FROM loss_reports, json_each(pattern_tags)
       GROUP BY json_each.value
       ORDER BY cnt DESC
       LIMIT 5`
    )
    .all() as Array<{ pattern: string; cnt: number; avg_loss: number }>;

  return { total: total.count, avgLoss: avgLoss.avg ?? 0, topPatterns };
}

export function cacheTxs(
  walletAddress: string,
  txs: Array<{
    signature: string;
    tokenAddress?: string;
    tokenName?: string;
    action: string;
    amountSol: number;
    amountToken?: number;
    tokenAgeHours?: number;
    txTimestamp: number;
  }>
): void {
  const d = getDb();
  const insert = d.prepare(
    `INSERT OR IGNORE INTO tx_cache
     (wallet_address, signature, token_address, token_name, action, amount_sol, amount_token, token_age_hours, tx_timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const tx of txs) {
    insert.run(
      walletAddress,
      tx.signature,
      tx.tokenAddress ?? null,
      tx.tokenName ?? null,
      tx.action,
      tx.amountSol,
      tx.amountToken ?? null,
      tx.tokenAgeHours ?? null,
      tx.txTimestamp
    );
  }
}

export function getCachedTxs(walletAddress: string, limit = 50) {
  return getDb()
    .query(
      `SELECT * FROM tx_cache WHERE wallet_address = ? ORDER BY tx_timestamp DESC LIMIT ?`
    )
    .all(walletAddress, limit) as Array<Record<string, unknown>>;
}
