// ─── In-Memory Cache with TTL ─────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class Cache {
  private store = new Map<string, CacheEntry<unknown>>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs = 60_000) {
    // Auto-cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Allow the process to exit even if this interval is active
    if (typeof this.cleanupInterval === "object" && "unref" in this.cleanupInterval) {
      (this.cleanupInterval as NodeJS.Timeout).unref?.();
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /** Stop the background cleanup timer */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Singleton cache instance used across the app
export const cache = new Cache();

// Convenience TTL constants
export const TTL = {
  WALLET_SCAN:   10 * 60 * 1000, //  10 minutes
  HIVE_STATS:     5 * 60 * 1000, //   5 minutes
  STATS:          5 * 60 * 1000, //   5 minutes
  ALERTS:        30 * 1000,       //  30 seconds
  CONFIG:        60 * 60 * 1000, //   1 hour
} as const;
