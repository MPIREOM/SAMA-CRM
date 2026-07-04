import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

// Verifies the kiosk staff-exit PIN. Public route (the kiosk device has no
// session) — the PIN itself is the gate. Constant-time comparison to avoid
// timing side channels.

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const expected = process.env.KIOSK_EXIT_PIN;
    if (!expected || expected.startsWith("YOUR_")) {
      return NextResponse.json(
        { ok: false, error: "not_configured" },
        { status: 503 }
      );
    }

    const payload: unknown = await req.json().catch(() => null);
    const pin =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).pin === "string"
        ? ((payload as Record<string, unknown>).pin as string)
        : "";

    const a = Buffer.from(pin, "utf8");
    const b = Buffer.from(expected, "utf8");
    const ok = a.length === b.length && timingSafeEqual(a, b);

    if (ok) return NextResponse.json({ ok: true });
    return NextResponse.json({ ok: false }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
