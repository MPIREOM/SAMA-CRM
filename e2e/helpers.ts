// Shared helpers for the Playwright suite. The suite runs against the local
// Supabase emulator (scripts/mock-supabase) — see scripts/mock-supabase/README.md.
// Guests are prefixed "E2E-" and every booking a test creates is cancelled
// with reason "e2e" in afterEach via cancelE2EBookings().

import { expect, type Page, type APIRequestContext } from "@playwright/test";

export const MOCK_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "mock-service-role-key";
export const CRON_SECRET = "mock-cron-secret";

export const ROOM_TYPES = {
  "deluxe-mountain-view": "10000000-0000-4000-8000-000000000001",
  "deluxe-city-view": "10000000-0000-4000-8000-000000000002",
  "family-deluxe": "10000000-0000-4000-8000-000000000003",
  chalet: "10000000-0000-4000-8000-000000000004",
  "sama-suite-city-view": "10000000-0000-4000-8000-000000000005",
  "sama-suite-mountain-view": "10000000-0000-4000-8000-000000000006",
} as const;

/** Add-ons seeded by the emulator (migration 0010). */
export const ADDONS = {
  "apex-zipline": "60000000-0000-4000-8000-000000000001",
  "transfer-up": "60000000-0000-4000-8000-000000000002",
  "transfer-down": "60000000-0000-4000-8000-000000000003",
} as const;

export const STAFF = {
  admin: { email: "admin@sama.test", password: "Admin1234!" },
  desk: { email: "desk@sama.test", password: "Desk1234!" },
} as const;

/** Muscat "today" (UTC+4) as YYYY-MM-DD, plus N days. */
export function muscatDate(offsetDays = 0): string {
  const d = new Date(Date.now() + 4 * 3600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function searchQuery(checkinOffset: number, nights: number, adults = 2, children = 0): string {
  const p = new URLSearchParams({
    checkin: muscatDate(checkinOffset),
    checkout: muscatDate(checkinOffset + nights),
    adults: String(adults),
    children: String(children),
  });
  return p.toString();
}

type Json = Record<string, unknown>;

/** Minimal PostgREST client against the emulator, always with the service role. */
export class MockDb {
  constructor(private readonly request: APIRequestContext) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, "content-type": "application/json", ...extra };
  }

  async rows<T = Json>(table: string, query: string): Promise<T[]> {
    const res = await this.request.get(`${MOCK_URL}/rest/v1/${table}?${query}`, { headers: this.headers() });
    expect(res.ok(), `GET ${table}?${query} → ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T[];
  }

  async insert<T = Json>(table: string, body: Json | Json[]): Promise<T[]> {
    const res = await this.request.post(`${MOCK_URL}/rest/v1/${table}`, { headers: this.headers({ prefer: "return=representation" }), data: body });
    expect(res.ok(), `POST ${table} → ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T[];
  }

  async patch<T = Json>(table: string, query: string, body: Json): Promise<T[]> {
    const res = await this.request.patch(`${MOCK_URL}/rest/v1/${table}?${query}`, { headers: this.headers({ prefer: "return=representation" }), data: body });
    expect(res.ok(), `PATCH ${table}?${query} → ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T[];
  }

  async delete(table: string, query: string): Promise<void> {
    const res = await this.request.delete(`${MOCK_URL}/rest/v1/${table}?${query}`, { headers: this.headers() });
    expect(res.ok(), `DELETE ${table}?${query} → ${res.status()} ${await res.text()}`).toBeTruthy();
  }

  /** Raw RPC call; returns {status, body} so tests can assert on SQL error texts. */
  async rpcRaw(fn: string, args: Json, role: "service" | "anon" = "service"): Promise<{ status: number; body: unknown }> {
    const headers = role === "service" ? this.headers() : { apikey: "mock-anon-key", authorization: "Bearer mock-anon-key", "content-type": "application/json" };
    const res = await this.request.post(`${MOCK_URL}/rest/v1/rpc/${fn}`, { headers, data: args });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep text
    }
    return { status: res.status(), body };
  }

  async rpc<T = unknown>(fn: string, args: Json): Promise<T> {
    const r = await this.rpcRaw(fn, args);
    expect(r.status, `rpc ${fn} → ${r.status} ${JSON.stringify(r.body)}`).toBe(200);
    return r.body as T;
  }

  async availableCount(roomTypeId: string, checkIn: string, checkOut: string): Promise<number> {
    return this.rpc<number>("bk_available_count", { p_room_type_id: roomTypeId, p_check_in: checkIn, p_check_out: checkOut });
  }

  async createBooking(input: Json): Promise<{ status: number; body: Json }> {
    const r = await this.rpcRaw("bk_create_booking", { p: input });
    return { status: r.status, body: r.body as Json };
  }

  /** Cancel every live E2E-* booking with reason "e2e" (idempotent). */
  async cancelE2EBookings(): Promise<number> {
    const live = await this.rows<{ id: string }>("bk_bookings", "select=id&guest_name=like.E2E-*&status=in.(pending,confirmed,checked_in)");
    for (const b of live) await this.rpc("bk_cancel_booking", { p_booking_id: b.id, p_reason: "e2e" });
    return live.length;
  }

  /** Remove test-created blocks / rate plans and restore rooms to active. */
  async cleanupInventory(): Promise<void> {
    await this.delete("bk_inventory_blocks", "reason=like.e2e*");
    await this.delete("bk_rate_plans", "name=like.E2E-*");
    await this.patch("bk_rooms", "status=eq.maintenance", { status: "active" });
  }

  async reset(): Promise<void> {
    const res = await this.request.post(`${MOCK_URL}/__mock/reset`);
    expect(res.ok()).toBeTruthy();
  }
}

// ---------------------------------------------------------------------------
// UI flows
// ---------------------------------------------------------------------------

export interface GuestDetails {
  fullName: string;
  email?: string;
  phone?: string; // national number for +968
  nationality?: string;
  promoCode?: string;
  specialRequests?: string;
}

/** Fill step 1 of the booking form and continue to the review step. */
export async function fillGuestDetails(page: Page, d: GuestDetails): Promise<void> {
  await page.getByLabel(/^(Full name|الاسم الكامل)/).fill(d.fullName);
  if (d.email) await page.locator('input[name="email"]').fill(d.email);
  await page.locator('input[name="phone"]').fill(d.phone ?? "91234567");
  await page.locator('select[name="nationality"]').selectOption(d.nationality ?? "OM");
  if (d.specialRequests) await page.locator('textarea[name="specialRequests"]').fill(d.specialRequests);
  if (d.promoCode) await page.locator('input[name="promoCode"]').fill(d.promoCode);
  await page.locator('form button[type="submit"]').click();
}

/** On the review step: tick consent and confirm; resolves once the confirmation page is shown. */
export async function confirmBooking(page: Page): Promise<string> {
  await expect(page.locator('input[name="consent"]')).toBeVisible();
  // Wait for the (re)quote to finish so the button is enabled.
  const confirm = page.locator('form button[type="submit"].g-btn-gold');
  await expect(confirm).toBeEnabled({ timeout: 20_000 });
  await page.locator('input[name="consent"]').check();
  await confirm.click();
  await page.waitForURL(/\/booking\/SAMA-\d{2}-[A-Z0-9]{6}\?token=/, { timeout: 60_000 });
  const m = /\/booking\/(SAMA-\d{2}-[A-Z0-9]{6})/.exec(page.url());
  if (!m) throw new Error(`no ref in ${page.url()}`);
  return m[1];
}

export async function loginAs(page: Page, who: keyof typeof STAFF, next = "/dashboard"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(STAFF[who].email);
  await page.locator("#password").fill(STAFF[who].password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** Message keys leaking into the page (e.g. "booking.errors.sold_out") — should never render. */
export const RAW_KEY_RE = /\b(?:meta|nav|home|widget|rooms|search|booking|confirmation|manage|peek|contact|policies|footer|errors|amenities|common)\.[a-zA-Z]+(?:\.[a-zA-Z_]+)*\b/;

export async function expectNoRawKeys(page: Page): Promise<void> {
  const text = await page.locator("body").innerText();
  const m = RAW_KEY_RE.exec(text);
  expect(m, `untranslated message key rendered: ${m?.[0]}`).toBeNull();
}
