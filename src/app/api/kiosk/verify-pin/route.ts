import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

// Verifies the kiosk staff-exit PIN. Public route (the kiosk device has no
// session) — the PIN itself is the gate, so it needs brute-force protection:
//  - SHA-256 both sides before the constant-time compare (no length leak);
//  - per-IP attempt throttling (best-effort in-memory — resets on cold start,
//    which still reduces a 10,000-guess sweep to a crawl).

export const runtime = "nodejs";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

function throttled(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: Request) {
  try {
    const expected = process.env.KIOSK_EXIT_PIN;
    if (!expected || expected.includes("YOUR_")) {
      return NextResponse.json(
        { ok: false, error: "not_configured" },
        { status: 503 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (throttled(ip)) {
      return NextResponse.json(
        { ok: false, error: "too_many_attempts" },
        { status: 429 }
      );
    }

    const payload: unknown = await req.json().catch(() => null);
    const pin =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).pin === "string"
        ? ((payload as Record<string, unknown>).pin as string)
        : "";

    const a = createHash("sha256").update(pin, "utf8").digest();
    const b = createHash("sha256").update(expected, "utf8").digest();
    const ok = timingSafeEqual(a, b);

    if (ok) {
      attempts.delete(ip);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
