// Tiny in-memory token bucket for the public booking action (per IP).
// Good enough on Vercel where each instance keeps its own bucket; the
// database lock + availability re-check is the real guard against abuse.

const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;

export function checkRateLimit(key: string, limit = 10, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

/** Best-effort client IP from Vercel/proxy headers. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function resetRateLimits(): void {
  buckets.clear();
}
