// ─── Input Validation Helpers ─────────────────────────────────────────────────

/**
 * Base58 character set used by Solana addresses.
 * Excludes 0, O, I, l to avoid ambiguity.
 */
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Returns true when `addr` looks like a valid Solana wallet or token address.
 *
 * We validate purely via regex (length + character set) so this function
 * remains synchronous and has zero dependencies.  The on-chain Solana SDK
 * PublicKey constructor would give stronger guarantees but requires importing
 * @solana/web3.js; if you need that, use `isValidSolanaAddress` from
 * `src/services/solana.ts` instead.
 */
export function isValidSolanaAddress(addr: string): boolean {
  if (typeof addr !== "string") return false;
  return BASE58_REGEX.test(addr.trim());
}

/**
 * Validates a Solana token mint address (same rules as wallet addresses).
 */
export function isValidTokenAddress(addr: string): boolean {
  return isValidSolanaAddress(addr);
}

/**
 * Returns a 400 JSON Response if the address param is missing or invalid.
 * Returns undefined when the address is valid — caller can continue.
 */
export function requireValidAddress(
  address: string | null,
  paramName = "address"
): Response | undefined {
  if (!address) {
    return badRequest(`Query parameter '${paramName}' is required`);
  }
  if (!isValidSolanaAddress(address)) {
    return badRequest(
      `Invalid Solana address for '${paramName}'. Must be base58-encoded, 32–44 characters.`
    );
  }
  return undefined;
}

function badRequest(message: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, timestamp: Date.now() }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  );
}
