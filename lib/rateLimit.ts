/**
 * Lightweight in-memory rate limiter (fixed window) for API routes.
 *
 * CAVEAT: state lives in the serverless instance's memory, so across multiple
 * Vercel instances this is best-effort defense-in-depth, NOT a hard global
 * guarantee. For strict global limits, back it with a shared store (Vercel KV /
 * Upstash Redis); the `rateLimit()` signature is intentionally store-agnostic so
 * call sites don't change when that swap happens. For the pilot's traffic and
 * admin-gated routes this is an adequate guard against runaway loops / abuse.
 */
type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets (for a Retry-After header). */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Opportunistic prune so the map can't grow without bound on a long-lived
  // instance. Cheap: only when it gets large, and only expired entries.
  if (store.size > 5000) {
    for (const [k, b] of store) {
      if (now >= b.resetAt) store.delete(k);
    }
  }

  const bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
