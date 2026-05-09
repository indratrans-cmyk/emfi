// ─── Rate Limiter — Sliding Window, In-Memory ─────────────────────────────────

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();

// Purge stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    if (entry.timestamps.length === 0) windows.delete(key);
  }
}, 5 * 60_000).unref?.();

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Returns a 429 Response if the client exceeds the limit, otherwise undefined.
 * @param req      Incoming request
 * @param limit    Maximum number of requests in the window (default: 60)
 * @param windowMs Rolling window in milliseconds (default: 60 000 ms = 1 minute)
 */
export function checkRateLimit(
  req: Request,
  limit = 60,
  windowMs = 60_000
): Response | undefined {
  const ip = getClientIp(req);
  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = windows.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(ip, entry);
  }

  // Slide the window — drop timestamps older than windowMs
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);

  if (entry.timestamps.length >= limit) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Too many requests. Please slow down.",
        retryAfter: Math.ceil(windowMs / 1000),
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(windowMs / 1000)),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  entry.timestamps.push(now);
  return undefined;
}

/** 30 req/min for expensive scan endpoints */
export function checkScanRateLimit(req: Request): Response | undefined {
  return checkRateLimit(req, 30, 60_000);
}

/** 60 req/min for general endpoints */
export function checkDefaultRateLimit(req: Request): Response | undefined {
  return checkRateLimit(req, 60, 60_000);
}
