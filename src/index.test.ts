import { test, expect, describe } from "bun:test";
import { isValidSolanaAddress } from "./middleware/validate.ts";
import { Cache, TTL } from "./services/cache.ts";
import { checkRateLimit } from "./middleware/rateLimit.ts";

// ─── 1. Solana Address Validation ────────────────────────────────────────────

describe("isValidSolanaAddress", () => {
  test("accepts a known 44-char wallet address", () => {
    expect(isValidSolanaAddress("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")).toBe(true);
  });

  test("accepts a 43-char address", () => {
    expect(isValidSolanaAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe(true);
  });

  test("accepts the 32-char SystemProgram address", () => {
    // Solana SystemProgram public key: all 1s in base58 = 32 chars
    expect(isValidSolanaAddress("11111111111111111111111111111111")).toBe(true);
  });

  test("rejects empty string", () => {
    expect(isValidSolanaAddress("")).toBe(false);
  });

  test("rejects address shorter than 32 chars", () => {
    expect(isValidSolanaAddress("abc123short")).toBe(false);
  });

  test("rejects address longer than 44 chars", () => {
    expect(isValidSolanaAddress("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWMextra")).toBe(false);
  });

  test("rejects base58-invalid character '0'", () => {
    expect(isValidSolanaAddress("0WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")).toBe(false);
  });

  test("rejects base58-invalid character 'O'", () => {
    expect(isValidSolanaAddress("OWzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWW")).toBe(false);
  });

  test("rejects address with whitespace", () => {
    expect(isValidSolanaAddress("9WzDXwBbmkg8 ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAW")).toBe(false);
  });

  test("rejects Ethereum-style 0x address", () => {
    expect(isValidSolanaAddress("0x742d35Cc6634C0532925a3b8D4C9b5D5a1b3c4d")).toBe(false);
  });

  test("rejects non-string input (null)", () => {
    // @ts-expect-error — intentional runtime guard test
    expect(isValidSolanaAddress(null)).toBe(false);
  });
});

// ─── 2. Rate Limiter ──────────────────────────────────────────────────────────

describe("checkRateLimit", () => {
  function makeReq(ip: string): Request {
    return new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": ip },
    });
  }

  test("allows requests under the limit", () => {
    const ip = `ip-allow-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(makeReq(ip), 5, 60_000)).toBeUndefined();
    }
  });

  test("returns 429 Response when limit is exceeded", () => {
    const ip = `ip-exceed-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      checkRateLimit(makeReq(ip), 3, 60_000);
    }
    const res = checkRateLimit(makeReq(ip), 3, 60_000);
    expect(res).toBeDefined();
    expect(res!.status).toBe(429);
  });

  test("429 response body has success:false and error string", async () => {
    const ip = `ip-json-${Date.now()}`;
    for (let i = 0; i < 2; i++) checkRateLimit(makeReq(ip), 2, 60_000);
    const res = checkRateLimit(makeReq(ip), 2, 60_000);
    expect(res).toBeDefined();
    const body = await res!.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  test("different IPs have independent rate-limit counters", () => {
    const base = `ip-indep-${Date.now()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(makeReq(`${base}-A`), 3, 60_000);
    // A is exhausted — B should still pass
    expect(checkRateLimit(makeReq(`${base}-B`), 3, 60_000)).toBeUndefined();
  });

  test("429 response includes Retry-After header", () => {
    const ip = `ip-header-${Date.now()}`;
    for (let i = 0; i < 1; i++) checkRateLimit(makeReq(ip), 1, 60_000);
    const res = checkRateLimit(makeReq(ip), 1, 60_000);
    expect(res?.headers.get("retry-after")).not.toBeNull();
  });
});

// ─── 3. In-Memory Cache with TTL ─────────────────────────────────────────────

describe("Cache", () => {
  // Each test creates its own isolated Cache instance
  test("set and get a value before TTL expires", () => {
    const c = new Cache();
    c.set("key", "hello", 5000);
    expect(c.get<string>("key")).toEqual("hello");
    c.destroy();
  });

  test("get returns undefined for missing key", () => {
    const c = new Cache();
    expect(c.get("nonexistent")).toBeUndefined();
    c.destroy();
  });

  test("del removes a key", () => {
    const c = new Cache();
    c.set("k", "v", 5000);
    c.del("k");
    expect(c.get("k")).toBeUndefined();
    c.destroy();
  });

  test("entry is absent after TTL expiry", async () => {
    const c = new Cache();
    c.set("expire-me", "transient", 50); // 50 ms TTL
    await Bun.sleep(80);
    expect(c.get("expire-me")).toBeUndefined();
    c.destroy();
  });

  test("has() correctly reports presence", () => {
    const c = new Cache();
    c.set("present", 1, 5000);
    expect(c.has("present")).toBe(true);
    expect(c.has("absent")).toBe(false);
    c.destroy();
  });

  test("set overwrites an existing value", () => {
    const c = new Cache();
    c.set("ow", "first",  5000);
    c.set("ow", "second", 5000);
    expect(c.get<string>("ow")).toEqual("second");
    c.destroy();
  });

  test("stores and retrieves complex objects", () => {
    const c = new Cache();
    const obj = { x: [1, 2], y: { z: true } };
    type ObjType = typeof obj;
    c.set("obj", obj, 5000);
    expect(c.get<ObjType>("obj")).toEqual(obj);
    c.destroy();
  });

  test("destroy clears all entries", () => {
    const c = new Cache();
    c.set("a", 1, 5000);
    c.set("b", 2, 5000);
    c.destroy();
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBeUndefined();
  });

  test("TTL constants are positive integers", () => {
    expect(TTL.WALLET_SCAN).toBeGreaterThan(0);
    expect(TTL.HIVE_STATS).toBeGreaterThan(0);
    expect(TTL.STATS).toBeGreaterThan(0);
    expect(TTL.ALERTS).toBeGreaterThan(0);
    expect(TTL.CONFIG).toBeGreaterThan(0);
  });
});
