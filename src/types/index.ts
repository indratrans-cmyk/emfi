export type Severity = "low" | "medium" | "high" | "critical";
export type TradeAction = "buy" | "sell" | "swap" | "transfer";
export type PatternId =
  | "FOMO_SPIRAL"
  | "LOSS_CHASER"
  | "NIGHT_FOMO"
  | "NEW_TOKEN_RUSH"
  | "DEGEN_ACCEL"
  | "PANIC_AVERAGE"
  | "PORTFOLIO_DUMP"
  | "RAPID_REVERSAL";

export interface WalletTx {
  signature: string;
  timestamp: number;
  action: TradeAction;
  tokenAddress?: string;
  tokenName?: string;
  tokenAge?: number; // hours since token creation
  amountSol: number;
  amountToken?: number;
  priceUsd?: number;
  success: boolean;
}

export interface WalletAnalysis {
  address: string;
  balanceSol: number;
  totalTxCount: number;
  recentTxs: WalletTx[];
  avgTradeSize: number;
  riskScore: number; // 0-100
}

// ─── EmeraldGuard Types ──────────────────────────────────────────────────────

export interface BehaviorPattern {
  id: PatternId;
  name: string;
  description: string;
  lossProbability: number; // 0-1
  sampleSize: number;
}

export interface DetectedSignal {
  patternId: PatternId;
  patternName: string;
  severity: Severity;
  lossProbability: number;
  triggeredAt: string;
  details: string;
  recommendation: string;
  affectedWallets: number; // how many wallets triggered this before losing
}

export interface GuardReport {
  walletAddress: string;
  scanTimestamp: number;
  overallRisk: Severity;
  overallLossProbability: number;
  detectedSignals: DetectedSignal[];
  aiInsight?: string;
  shouldPause: boolean;
}

// ─── HiveLoss Types ──────────────────────────────────────────────────────────

export interface LossReport {
  walletHash: string;
  tokenAddress?: string;
  tokenName?: string;
  lossAmountSol?: number;
  lossPercentage: number;
  tradeTimestamp: number;
  patternTags: PatternId[];
  marketConditions: {
    hourOfDay: number;
    dayOfWeek: number;
    tokenAgeDays?: number;
  };
}

export interface HiveLossIntelligence {
  totalLossReports: number;
  topRiskyPatterns: Array<{
    patternId: PatternId;
    reportCount: number;
    avgLossPercentage: number;
  }>;
  tokenWarning?: {
    tokenAddress: string;
    tokenName: string;
    reportCount: number;
    avgLoss: number;
    rugProbability: number;
  };
  communityWarning: string;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

// ─── Telegram Types ───────────────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: TelegramMessage;
  };
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string; username?: string };
  from?: TelegramUser;
  text?: string;
  date: number;
}

export interface TelegramUser {
  id: number;
  username?: string;
  first_name: string;
}
