import { expect, test } from "@playwright/test";
import { CRON_SECRET, MockDb, ROOM_TYPES, muscatDate } from "./helpers";

// Middleware routing, public metadata routes and the cron dispatcher.

test.describe("middleware", () => {
  test("locale redirects, legacy redirects, auth guards, public files", async ({ request, playwright, baseURL }) => {
    // next-intl remembers the detected locale in a NEXT_LOCALE cookie, so the
    // Accept-Language check needs a fresh cookie jar.
    const fresh = await playwright.request.newContext({ baseURL: baseURL ?? undefined, extraHTTPHeaders: { "accept-language": "ar,en;q=0.5" } });
    const ar = await fresh.get("/", { maxRedirects: 0 });
    expect(ar.status()).toBe(307);
    expect(ar.headers().location).toMatch(/\/ar$/);
    await fresh.dispose();

    const root = await request.get("/", { maxRedirects: 0 });
    expect(root.status()).toBe(307);
    expect(root.headers().location).toMatch(/\/en$/);

    const legacy = await request.get("/bookings", { maxRedirects: 0 });
    expect([307, 308]).toContain(legacy.status());
    expect(legacy.headers().location).toMatch(/\/reservations$/);

    const guarded = await request.get("/reservations", { maxRedirects: 0 });
    expect(guarded.status()).toBe(307);
    expect(guarded.headers().location).toMatch(/\/login\?next=%2Freservations$/);

    const cron = await request.get("/api/cron/dispatch");
    expect(cron.status()).toBe(401);
    expect(cron.headers()["content-type"]).toContain("application/json");
    expect(await cron.json()).toEqual({ error: "unauthorized" });

    for (const [path, type] of [
      ["/robots.txt", "text/plain"],
      ["/sitemap.xml", "application/xml"],
      ["/manifest.webmanifest", "application/manifest+json"],
    ] as const) {
      const r = await request.get(path);
      expect(r.status(), path).toBe(200);
      expect(r.headers()["content-type"], path).toContain(type);
    }
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Sitemap:/i);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/en/rooms/chalet");
    expect(sitemap).toContain("/ar/rooms/chalet");

    // Unknown guest path → 404 page in the locale, unknown CRM path → login redirect.
    const nf = await request.get("/en/does-not-exist");
    expect(nf.status()).toBe(404);
  });
});

test.describe("cron dispatcher", () => {
  test("bearer secret from settings → due confirmations become stubbed with log rows", async ({ request }) => {
    const db = new MockDb(request);
    const created = await db.createBooking({
      room_type_id: ROOM_TYPES["deluxe-city-view"],
      check_in: muscatDate(8),
      check_out: muscatDate(9),
      adults: 1,
      children: 0,
      guest_name: "E2E-Cron",
      guest_phone: "+96895555555",
      guest_email: "e2e-cron@example.com",
      preferred_lang: "ar",
      source: "phone",
    });
    expect(created.status).toBe(200);
    const id = (created.body as { id: string }).id;
    // Created via the RPC directly, so nothing has dispatched yet: 2 confirmations due now.
    const pendingBefore = await db.rows<{ kind: string; status: string }>("bk_scheduled_messages", `select=kind,status&booking_id=eq.${id}&status=eq.pending`);
    expect(pendingBefore).toHaveLength(6);

    const wrong = await request.get("/api/cron/dispatch", { headers: { authorization: "Bearer nope" } });
    expect(wrong.status()).toBe(401);

    const run = await request.get("/api/cron/dispatch", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(run.status()).toBe(200);
    const summary = (await run.json()) as { ok: boolean; picked: number; stubbed: number; sent: number; failed: number; errors: string[] };
    expect(summary.ok).toBe(true);
    expect(summary.picked).toBeGreaterThanOrEqual(2);
    expect(summary.stubbed).toBeGreaterThanOrEqual(2);
    expect(summary.sent).toBe(0);
    expect(summary.failed).toBe(0);

    const after = await db.rows<{ kind: string; channel: string; status: string; last_error: string | null }>(
      "bk_scheduled_messages",
      `select=kind,channel,status,last_error&booking_id=eq.${id}&order=send_at.asc`
    );
    const confirmations = after.filter((r) => r.kind === "confirmation");
    expect(confirmations.map((r) => r.status)).toEqual(["stubbed", "stubbed"]);
    expect(confirmations.every((r) => /stubbed/.test(r.last_error ?? ""))).toBe(true);
    expect(after.filter((r) => r.kind !== "confirmation").every((r) => r.status === "pending")).toBe(true);

    const log = await db.rows<{ channel: string; kind: string; status: string; recipient: string }>("bk_message_log", `select=channel,kind,status,recipient&booking_id=eq.${id}`);
    expect(log).toHaveLength(2);
    expect(log.every((l) => l.status === "stubbed" && l.kind === "confirmation")).toBe(true);
    expect(log.map((l) => l.recipient).sort()).toEqual(["+96895555555", "e2e-cron@example.com"]);
    // Stubbed sends must NOT appear in the CRM inbox.
    expect(await db.rows("messages", `select=id&booking_id=eq.${id}`)).toHaveLength(0);

    // Second run is a no-op (idempotent).
    const again = (await (await request.get("/api/cron/dispatch", { headers: { authorization: `Bearer ${CRON_SECRET}` } })).json()) as { picked: number };
    expect(again.picked).toBe(0);

    await db.cancelE2EBookings();
  });
});
