// Groq API — free tier: 1000 req/day, 6000 tokens/min
// Sign up free at: https://console.groq.com

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env["GROQ_MODEL"] ?? "llama-3.1-8b-instant";

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chat(messages: GroqMessage[], maxTokens = 512): Promise<string> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) return "AI analysis unavailable (no API key configured).";

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Groq API error:", err);
      return "AI temporarily unavailable.";
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message.content ?? "No response from AI.";
  } catch (err) {
    console.error("Groq fetch error:", err);
    return "AI analysis failed. Please try again.";
  }
}

const SYSTEM_PROMPT = `You are EmeraldGuard AI, an expert behavioral finance analyst for crypto traders on Solana.
Your job is to protect traders from catastrophic losses by analyzing behavioral patterns in their trading history.
Be concise, direct, and use plain language. No jargon. Max 3 sentences per insight.
Always end with one clear actionable recommendation.`;

export async function analyzeWalletBehavior(context: {
  walletAddress: string;
  detectedPatterns: string[];
  recentTrades: Array<{ action: string; amountSol: number; tokenName?: string; hoursAgo: number }>;
  overallRisk: string;
  lossProbability: number;
}): Promise<string> {
  const tradesSummary = context.recentTrades
    .slice(0, 5)
    .map((t) => `${t.action} ${t.amountSol.toFixed(2)} SOL${t.tokenName ? ` (${t.tokenName})` : ""} ${t.hoursAgo.toFixed(0)}h ago`)
    .join(", ");

  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Analyze this wallet: ${context.walletAddress.slice(0, 8)}...
Detected risk patterns: ${context.detectedPatterns.join(", ")}
Recent trades: ${tradesSummary}
Overall risk: ${context.overallRisk} (${(context.lossProbability * 100).toFixed(0)}% loss probability)

Give a brief, personal AI insight about what behavioral pattern you see and the #1 thing they should do RIGHT NOW.`,
    },
  ];

  return chat(messages, 200);
}

export async function analyzePreTradeRisk(context: {
  tokenAddress: string;
  tokenName?: string;
  tokenAgeDays?: number;
  hiveLossReports: number;
  avgLossFromHiveLoss: number;
  yourRecentPattern: string;
}): Promise<string> {
  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Pre-trade risk check:
Token: ${context.tokenName ?? context.tokenAddress.slice(0, 8)}
Token age: ${context.tokenAgeDays ? `${context.tokenAgeDays.toFixed(1)} days` : "unknown"}
Community reports: ${context.hiveLossReports} traders lost money on this token
Average community loss: ${context.avgLossFromHiveLoss.toFixed(0)}%
Your current trading pattern: ${context.yourRecentPattern}

In 2 sentences max: should they trade this? What's the #1 risk?`,
    },
  ];

  return chat(messages, 150);
}

export async function generateHiveLossInsight(context: {
  totalReports: number;
  topPattern: string;
  avgLoss: number;
  tokenWarning?: string;
}): Promise<string> {
  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `HiveLoss community intelligence summary:
Total loss reports in database: ${context.totalReports}
Most common pattern before loss: ${context.topPattern}
Average loss: ${context.avgLoss.toFixed(0)}%
${context.tokenWarning ? `High-risk token flagged: ${context.tokenWarning}` : ""}

Generate a 1-sentence community warning for traders right now.`,
    },
  ];

  return chat(messages, 100);
}
