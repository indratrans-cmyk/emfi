import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { WalletTx } from "../types/index.ts";

const RPC_URL =
  process.env["HELIUS_API_KEY"]
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env["HELIUS_API_KEY"]}`
    : (process.env["SOLANA_RPC_URL"] ?? "https://api.mainnet-beta.solana.com");

let connection: Connection;

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(RPC_URL, "confirmed");
  }
  return connection;
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export async function getWalletBalance(address: string): Promise<number> {
  try {
    const pubkey = new PublicKey(address);
    const lamports = await getConnection().getBalance(pubkey);
    return lamports / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}

export async function getRecentTransactions(
  address: string,
  limit = 50
): Promise<WalletTx[]> {
  try {
    const pubkey = new PublicKey(address);
    const sigs = await getConnection().getSignaturesForAddress(pubkey, {
      limit,
    });

    const txs: WalletTx[] = [];

    for (const sig of sigs.slice(0, 20)) {
      try {
        const tx = await getConnection().getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta || tx.meta.err) continue;

        const timestamp = (tx.blockTime ?? 0) * 1000;
        const preBalances = tx.meta.preBalances;
        const postBalances = tx.meta.postBalances;
        const accountKeys = tx.transaction.message.accountKeys;

        const solChange =
          (postBalances[0] ?? 0) - (preBalances[0] ?? 0);
        const amountSol = Math.abs(solChange) / LAMPORTS_PER_SOL;

        let action: WalletTx["action"] = "transfer";
        let tokenAddress: string | undefined;
        let tokenName: string | undefined;
        let amountToken: number | undefined;

        const instructions = tx.transaction.message.instructions;
        for (const ix of instructions) {
          if ("parsed" in ix && ix.parsed) {
            const parsed = ix.parsed as Record<string, unknown>;
            if (parsed["type"] === "transfer") action = "transfer";
          }
        }

        if (tx.meta.innerInstructions) {
          for (const inner of tx.meta.innerInstructions) {
            for (const ix of inner.instructions) {
              if ("parsed" in ix && ix.parsed) {
                const parsed = ix.parsed as Record<string, unknown>;
                const info = parsed["info"] as Record<string, unknown> | undefined;
                if (parsed["type"] === "mintTo" && info?.["mint"]) {
                  tokenAddress = info["mint"] as string;
                  action = solChange < 0 ? "buy" : "sell";
                  amountToken = Number(info["amount"]) ?? undefined;
                }
              }
            }
          }
        }

        if (
          tx.meta.preTokenBalances &&
          tx.meta.postTokenBalances &&
          tx.meta.preTokenBalances.length > 0
        ) {
          const tokenBalChange = tx.meta.postTokenBalances.find((b) =>
            tx.meta!.preTokenBalances!.some((pre) => pre.mint === b.mint)
          );
          if (tokenBalChange) {
            tokenAddress = tokenBalChange.mint;
            tokenName = tokenBalChange.uiTokenAmount.uiAmountString ?? undefined;
            action = solChange < 0 ? "buy" : "sell";
          }
        }

        if (amountSol < 0.000001) continue;

        txs.push({
          signature: sig.signature,
          timestamp,
          action,
          tokenAddress,
          tokenName,
          amountSol,
          amountToken,
          success: true,
        });
      } catch {
        continue;
      }
    }

    return txs;
  } catch {
    return [];
  }
}

export async function getTokenCreationTime(
  tokenAddress: string
): Promise<number | null> {
  try {
    const pubkey = new PublicKey(tokenAddress);
    const sigs = await getConnection().getSignaturesForAddress(pubkey, {
      limit: 1,
      before: undefined,
    });

    if (sigs.length === 0) return null;

    const lastSig = sigs[sigs.length - 1];
    if (!lastSig) return null;

    return lastSig.blockTime ? lastSig.blockTime * 1000 : null;
  } catch {
    return null;
  }
}

// ─── Helius Enhanced API ─────────────────────────────────────────────────────

export async function getHeliusTransactions(
  address: string,
  limit = 50
): Promise<WalletTx[]> {
  const apiKey = process.env["HELIUS_API_KEY"];
  if (!apiKey) return getRecentTransactions(address, limit);

  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=${limit}&type=SWAP`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) return getRecentTransactions(address, limit);

    const data = (await res.json()) as Array<Record<string, unknown>>;
    const txs: WalletTx[] = [];

    for (const tx of data) {
      const events = tx["events"] as Record<string, unknown> | undefined;
      const swap = events?.["swap"] as Record<string, unknown> | undefined;

      if (!swap) continue;

      const nativeInput = swap["nativeInput"] as Record<string, unknown> | undefined;
      const nativeOutput = swap["nativeOutput"] as Record<string, unknown> | undefined;
      const tokenInputs = swap["tokenInputs"] as Array<Record<string, unknown>> | undefined;
      const tokenOutputs = swap["tokenOutputs"] as Array<Record<string, unknown>> | undefined;

      let action: WalletTx["action"] = "swap";
      let amountSol = 0;
      let tokenAddress: string | undefined;
      let amountToken: number | undefined;

      if (nativeInput) {
        amountSol = Number(nativeInput["amount"]) / LAMPORTS_PER_SOL;
        action = "buy";
        const firstOutput = tokenOutputs?.[0];
        if (firstOutput) {
          tokenAddress = firstOutput["mint"] as string;
          const rawOut = firstOutput["rawTokenAmount"] as Record<string, unknown> | undefined;
          amountToken = rawOut ? Number(rawOut["tokenAmount"]) : undefined;
        }
      } else if (nativeOutput) {
        amountSol = Number(nativeOutput["amount"]) / LAMPORTS_PER_SOL;
        action = "sell";
        const firstInput = tokenInputs?.[0];
        if (firstInput) {
          tokenAddress = firstInput["mint"] as string;
          const rawIn = firstInput["rawTokenAmount"] as Record<string, unknown> | undefined;
          amountToken = rawIn ? Number(rawIn["tokenAmount"]) : undefined;
        }
      }

      if (amountSol < 0.000001) continue;

      txs.push({
        signature: tx["signature"] as string,
        timestamp: Number(tx["timestamp"]) * 1000,
        action,
        tokenAddress,
        amountSol,
        amountToken,
        success: true,
      });
    }

    return txs.length > 0 ? txs : getRecentTransactions(address, limit);
  } catch {
    return getRecentTransactions(address, limit);
  }
}

export async function getTokenInfo(tokenAddress: string): Promise<{
  name?: string;
  symbol?: string;
  createdAt?: number;
} | null> {
  const apiKey = process.env["HELIUS_API_KEY"];
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/token-metadata?api-key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAccounts: [tokenAddress] }),
        signal: AbortSignal.timeout(5_000),
      }
    );

    if (!res.ok) return null;
    const data = (await res.json()) as Array<Record<string, unknown>>;
    const token = data[0];
    if (!token) return null;

    const onChain = token["onChainMetadata"] as Record<string, unknown> | undefined;
    const metadata = onChain?.["metadata"] as Record<string, unknown> | undefined;
    const data2 = metadata?.["data"] as Record<string, unknown> | undefined;

    return {
      name: data2?.["name"] as string | undefined,
      symbol: data2?.["symbol"] as string | undefined,
    };
  } catch {
    return null;
  }
}
