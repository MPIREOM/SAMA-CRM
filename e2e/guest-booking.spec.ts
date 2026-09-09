import { expect, test } from "@playwright/test";
import {
  MOCK_URL,
  MockDb,
  ROOM_TYPES,
  SERVICE_ROLE_KEY,
  confirmBooking,
  expectNoRawKeys,
  fillGuestDetails,
  muscatDate,
  searchQuery,
} from "./helpers";

// Guest booking journey against the local Supabase emulator. Runs on the
// desktop and the mobile (Pixel 7) projects.

// Add-on message keys leaking into the page ("addons.pickerTitle", "apex.cta") — should never render.
const ADDON_RAW_KEY_RE = /\b(?:addons|apex)\.[a-zA-Z]+(?:\.[a-zA-Z_]+)*\b/;

/** "OMR 123.456" → 123.456 */
function omr(text: string): number {
  return Number(text.replace(/[^\d.]/g, ""));
}

test.describe("guest booking", () => {
  let db: MockDb;

  test.beforeEach(async ({ request }) => {
    db = new MockDb(request);
    await db.cleanupInventory();
  });

  test.afterEach(async () => {
    await db.cancelE2EBookings();
    await db.cleanupInventory();
  });

  test("EN: home → widget → results → room → 3 steps → confirmation, .ics and DB rows", async ({ page }) => {
    const checkin = muscatDate(10);
    const checkout = muscatDate(12);
    const guestName = `E2E-Guest ${Date.now()}`;

    await page.goto("/en");
    await expect(page).toHaveTitle(/Sama/i);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    // Hero widget
    const widget = page.locator("form#availability");
    await widget.locator('input[type="date"]').nth(0).fill(checkin);
    await widget.locator('input[type="date"]').nth(1).fill(checkout);
    await widget.locator("select").nth(0).selectOption("2");
    await widget.locator('button[type="submit"]').click();
    await page.waitForURL(/\/en\/book\?/);
    expect(new URL(page.url()).searchParams.get("checkin")).toBe(checkin);
    expect(new URL(page.url()).searchParams.get("checkout")).toBe(checkout);

    // Results
    await expect(page.getByRole("heading", { name: "Available for your dates" })).toBeVisible();
    await expect(page.getByText("Pay at the hotel — nothing is charged now")).toBeVisible();
    const chaletCard = page.locator("li.g-card").filter({ has: page.getByRole("heading", { name: "Chalet", exact: true }) });
    await expect(chaletCard).toHaveCount(1);
    await expect(chaletCard.getByText("Total for your stay")).toBeVisible();
    await chaletCard.getByRole("link", { name: "Select" }).click();
    await page.waitForURL(/\/en\/book\/chalet\?/);

    // Step 1
    await expect(page.getByRole("heading", { name: "Complete your booking" })).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText("1");
    await fillGuestDetails(page, { fullName: guestName, email: "e2e@example.com", phone: "91234567", specialRequests: "E2E test — please ignore" });

    // Step 2 (review)
    await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText("2");
    await expect(page.getByText("Pay at the hotel — no payment is taken now")).toBeVisible();
    await expect(page.getByText(guestName)).toBeVisible();
    const total = page.locator("dd[dir=ltr].text-xl").first();
    const confirm = page.locator('form button[type="submit"].g-btn-gold');
    await expect(confirm).toBeEnabled({ timeout: 20_000 });
    const roomTotal = omr(await total.innerText());
    await expect(page.getByTestId("price-addon")).toHaveCount(0);

    // Add-ons: APEX Zipline × 2 (+ note) and 4WD transfer up × 1 (+ note).
    await expect(page.getByRole("heading", { name: "Add to your stay" })).toBeVisible();
    const apexCard = page.locator("li").filter({ has: page.getByRole("group", { name: "APEX Zipline" }) });
    await expect(apexCard.getByText(/OMR 5 per rider/)).toBeVisible();
    const apexPlus = page.getByRole("button", { name: "Add one — APEX Zipline" });
    await apexPlus.click();
    await apexPlus.click();
    await expect(apexCard.locator("output")).toHaveText("2");
    await apexCard.getByLabel("Tell us more").fill("Arrival day, afternoon — one rider is 14");

    const transferCard = page.locator("li").filter({ has: page.getByRole("group", { name: /4WD transfer up/ }) });
    await expect(transferCard.getByText(/OMR 15 per car/)).toBeVisible();
    await transferCard.getByRole("button", { name: /^Add one — 4WD transfer up/ }).click();
    await expect(transferCard.locator("output")).toHaveText("1");
    await transferCard.getByLabel("Tell us more").fill("Arriving at the checkpoint around 1 PM, 3 guests");
    // Stepper never goes below zero: the − button is disabled at 0 and the + button at max_quantity.
    await expect(page.getByRole("button", { name: /^Remove one — 4WD transfer down/ })).toBeDisabled();

    // The quote re-runs with the add-ons: one line each, a subtotal and the grand total = room + 25.
    await expect(confirm).toBeEnabled({ timeout: 20_000 });
    // Scoped to the form: the sticky "Your stay" aside repeats the same lines.
    const priceBlock = page.locator("form").filter({ has: page.locator('button[type="submit"].g-btn-gold') });
    await expect(priceBlock.getByTestId("price-addon")).toHaveCount(2);
    await expect(priceBlock.getByText("APEX Zipline × 2", { exact: true })).toBeVisible();
    await expect(priceBlock.getByText(/4WD transfer up — Birkat Al Mouz to the hotel × 1/)).toBeVisible();
    const addonLines = priceBlock.getByTestId("price-addon");
    await expect(addonLines.nth(0).locator("dd")).toHaveText("OMR 10.000");
    await expect(addonLines.nth(1).locator("dd")).toHaveText("OMR 15.000");
    await expect(priceBlock.getByTestId("price-addons-subtotal").locator("dd")).toHaveText("OMR 25.000");
    await expect(total).toHaveText(`OMR ${(roomTotal + 25).toFixed(3)}`);
    // Total on the review step must match what the DB will store.
    const reviewTotal = await total.innerText();
    expect(ADDON_RAW_KEY_RE.exec(await page.locator("body").innerText())).toBeNull();

    // Step 3 (confirm) → confirmation page
    const ref = await confirmBooking(page);
    expect(ref).toMatch(/^SAMA-\d{2}-[A-Z0-9]{6}$/);
    await expect(page.getByRole("heading", { name: "We look forward to welcoming you" })).toBeVisible();
    await expect(page.getByText(ref, { exact: true })).toBeVisible();
    await expect(page.getByText(/Pay at the hotel by cash or card/)).toBeVisible();
    await expect(page.getByText("Total for your stay")).toBeVisible();
    await expectNoRawKeys(page);
    expect(ADDON_RAW_KEY_RE.exec(await page.locator("body").innerText())).toBeNull();

    // Confirmation shows both add-ons with quantity, note and status, plus the booked pickup.
    const yourAddons = page.getByRole("region", { name: "Your add-ons" });
    await expect(yourAddons).toBeVisible();
    await expect(yourAddons.getByText("APEX Zipline × 2")).toBeVisible();
    await expect(yourAddons.getByText(/4WD transfer up — Birkat Al Mouz to the hotel × 1/)).toBeVisible();
    await expect(yourAddons.getByText("Arrival day, afternoon — one rider is 14")).toBeVisible();
    await expect(yourAddons.getByText("Requested — we will confirm by WhatsApp")).toHaveCount(2);
    await expect(yourAddons.getByText(/Park at the Birkat Al Mouz checkpoint car park/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your 4WD pickup is booked" })).toBeVisible();
    await expect(page.getByText(/we will confirm the time on WhatsApp/).first()).toBeVisible();
    await expect(page.getByTestId("price-addon")).toHaveCount(2);
    await expect(page.getByTestId("price-addons-subtotal").locator("dd")).toHaveText("OMR 25.000");

    // DB rows
    const [booking] = await db.rows<{ id: string; status: string; total_omr: number; addons_omr: number; guest_email: string; source: string; nights: number }>(
      "bk_bookings",
      `select=*&ref=eq.${ref}`
    );
    expect(booking).toBeTruthy();
    expect(booking.status).toBe("confirmed");
    expect(booking.source).toBe("website");
    expect(booking.nights).toBe(2);
    expect(Number(booking.total_omr).toFixed(3)).toBe(reviewTotal.replace(/[^\d.]/g, ""));
    expect(Number(booking.addons_omr)).toBe(25);
    await expect(page.locator("dd[dir=ltr].text-xl").first()).toHaveText(`OMR ${Number(booking.total_omr).toFixed(3)}`);

    // bk_booking_addons: two rows priced from the catalogue. Falls back to
    // addons_omr (asserted above) while the emulator does not expose the table.
    const addonProbe = await page.request.get(`${MOCK_URL}/rest/v1/bk_booking_addons?select=id&limit=1`, {
      headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    if (addonProbe.ok()) {
      const addonRows = await db.rows<{ addon_id: string; quantity: number; unit_price_omr: number; total_omr: number; status: string; note: string | null }>(
        "bk_booking_addons",
        `select=*&booking_id=eq.${booking.id}&order=total_omr.asc`
      );
      expect(addonRows).toHaveLength(2);
      expect(addonRows.map((r) => [Number(r.quantity), Number(r.unit_price_omr), Number(r.total_omr), r.status])).toEqual([
        [2, 5, 10, "requested"],
        [1, 15, 15, "requested"],
      ]);
      expect(addonRows[0].note).toBe("Arrival day, afternoon — one rider is 14");
      expect(addonRows[1].note).toBe("Arriving at the checkpoint around 1 PM, 3 guests");
    }

    const scheduled = await db.rows<{ channel: string; kind: string; status: string }>("bk_scheduled_messages", `select=channel,kind,status&booking_id=eq.${booking.id}`);
    expect(scheduled).toHaveLength(6);
    // The inline dispatcher already ran the confirmation rows (stubbed: no provider env).
    const confirmations = scheduled.filter((s) => s.kind === "confirmation");
    expect(confirmations.map((s) => s.status).sort()).toEqual(["stubbed", "stubbed"]);
    expect(scheduled.filter((s) => s.kind !== "confirmation").every((s) => s.status === "pending")).toBe(true);
    const log = await db.rows("bk_message_log", `select=id,status&booking_id=eq.${booking.id}`);
    expect(log.length).toBeGreaterThanOrEqual(2);

    // CRM mirror + contact upsert
    const mirror = await db.rows<{ status: string; room_type: string }>("bookings", `select=status,room_type&id=eq.${booking.id}`);
    expect(mirror[0]?.status).toBe("Confirmed");
    expect(mirror[0]?.room_type).toBe("Chalet");
    const contacts = await db.rows<{ name: string; market: string }>("contacts", "select=name,market&phone=eq.%2B96891234567");
    expect(contacts[0]?.market).toBe("Oman");

    // .ics download
    const token = new URL(page.url()).searchParams.get("token")!;
    const ics = await page.request.get(`/api/bk/ics/${ref}?token=${token}&locale=en`);
    expect(ics.status()).toBe(200);
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    expect(await ics.text()).toContain("BEGIN:VEVENT");
    const badIcs = await page.request.get(`/api/bk/ics/${ref}?token=deadbeef`);
    expect(badIcs.status()).toBe(404);

    // Confirmation page with a bad token → 404
    const bad = await page.goto(`/en/booking/${ref}?token=0000000000000000000000000000dead`);
    expect(bad?.status()).toBe(404);
    const none = await page.goto(`/en/booking/${ref}`);
    expect(none?.status()).toBe(404);
  });

  test("AR: RTL booking flow, Arabic headings, no raw keys", async ({ page }) => {
    const guestName = `E2E-ضيف ${Date.now()}`;
    await page.goto("/ar");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/[؀-ۿ]/);
    await expectNoRawKeys(page);

    await page.goto(`/ar/book?${searchQuery(15, 1)}`);
    await expect(page.getByRole("heading", { name: "المتاح لتواريخكم" })).toBeVisible();
    await expectNoRawKeys(page);
    const card = page.locator("li.g-card").filter({ has: page.getByRole("heading", { name: "شاليه", exact: true }) });
    await card.getByRole("link", { name: "اختيار" }).click();
    await page.waitForURL(/\/ar\/book\/chalet\?/);

    await expect(page.getByRole("heading", { name: "إتمام حجزكم" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expectNoRawKeys(page);
    await fillGuestDetails(page, { fullName: guestName, phone: "92345678", nationality: "SA" });
    await expect(page.getByRole("heading", { name: "مراجعة حجزكم" })).toBeVisible();
    await expectNoRawKeys(page);
    const ref = await confirmBooking(page);
    expect(page.url()).toContain("/ar/booking/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/[؀-ۿ]/);
    await expect(page.getByText(ref, { exact: true })).toBeVisible();
    await expectNoRawKeys(page);

    const [booking] = await db.rows<{ preferred_lang: string; nationality: string }>("bk_bookings", `select=preferred_lang,nationality&ref=eq.${ref}`);
    expect(booking.preferred_lang).toBe("ar");
    expect(booking.nationality).toBe("Saudi");
  });

  test("APEX Zipline page, home add-on cards and the transfers policy render from the catalogue", async ({ page }) => {
    await page.goto("/en", { waitUntil: "domcontentloaded" });
    const addonsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Two things worth booking with your room" }) });
    await expect(addonsSection).toBeVisible();
    await expect(addonsSection.getByText("OMR 5 per rider")).toBeVisible();
    await expect(addonsSection.getByText("OMR 15 per car")).toBeVisible();
    await expect(addonsSection.getByRole("link", { name: "How transfers work" })).toHaveAttribute("href", /\/en\/policies#transfers$/);
    await addonsSection.getByRole("link", { name: "About the zipline" }).click();
    await page.waitForURL(/\/en\/apex-zipline$/, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: "310 metres over the canyon" })).toBeVisible();
    // The desktop nav is display:none on the mobile project, hence includeHidden.
    await expect(
      page.getByRole("navigation", { name: "Main navigation", includeHidden: true }).getByRole("link", { name: "APEX Zipline", includeHidden: true })
    ).toHaveAttribute("aria-current", "page");
    const facts = page.getByRole("region", { name: "Zipline facts" });
    for (const value of ["310", "20", "60", "120"]) await expect(facts.getByText(value, { exact: false }).first()).toBeVisible();
    await expect(page.getByText("OMR 5", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Closed-toe shoes are required/)).toBeVisible();
    const external = page.getByRole("link", { name: /apexzipline\.com/ });
    await expect(external).toHaveAttribute("href", "https://www.apexzipline.com");
    await expect(external).toHaveAttribute("target", "_blank");
    await expect(external).toHaveAttribute("rel", /noopener/);
    expect(await page.locator("body").innerText()).not.toMatch(/OMR 9\b/);
    expect(ADDON_RAW_KEY_RE.exec(await page.locator("body").innerText())).toBeNull();
    await expectNoRawKeys(page);
    await expect(page.getByRole("link", { name: "Add it when you book" })).toHaveAttribute("href", /\/en#availability$/);

    await page.goto("/en/policies#transfers", { waitUntil: "domcontentloaded" });
    const transfers = page.locator("article#transfers");
    await expect(transfers.getByRole("heading", { name: "Transfers & activities" })).toBeVisible();
    await expect(transfers.getByText(/not allowed past the Birkat Al Mouz police checkpoint/)).toBeVisible();
    await expect(transfers.getByText(/OMR 15 per car \(up to 4 guests\)/)).toBeVisible();
    await expect(transfers.getByText(/OMR 5 per rider/)).toBeVisible();
    await expect(transfers.getByText(/Maximum rider weight is 120 kg/)).toBeVisible();
    await expect(transfers.getByText(/Cancelling a booking cancels its add-ons too/)).toBeVisible();

    // Arabic page: RTL, Arabic copy, Latin digits.
    // domcontentloaded: the first hit of a large hero image can take >60 s to optimise in a cold sandbox.
    await page.goto("/ar/apex-zipline", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("310");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/[؀-ۿ]/);
    expect(await page.locator("body").innerText()).not.toMatch(/[٠-٩]/);
    await expectNoRawKeys(page);
  });

  test("sold-out and min-stay states render on the results page", async ({ page }) => {
    const checkin = muscatDate(20);
    // Stop-sell the chalets for the searched nights.
    await db.insert("bk_inventory_blocks", {
      room_type_id: ROOM_TYPES.chalet,
      room_id: null,
      start_date: checkin,
      end_date: muscatDate(22),
      kind: "stop_sell",
      reason: "e2e stop sell",
    });
    // Minimum 3 nights on the family room.
    await db.insert("bk_rate_plans", {
      name: "E2E-min-stay",
      room_type_id: ROOM_TYPES["family-deluxe"],
      start_date: checkin,
      end_date: muscatDate(25),
      rate_omr: null,
      adjust_pct: 0,
      min_stay: 3,
      days_of_week: null,
      priority: 100,
      is_active: true,
    });

    await page.goto(`/en/book?${searchQuery(20, 1)}`);
    await expect(page.getByRole("heading", { name: "Available for your dates" })).toBeVisible();

    const chalet = page.locator("li.g-card").filter({ has: page.getByRole("heading", { name: "Chalet", exact: true }) });
    await expect(chalet.getByText("Sold out").first()).toBeVisible();
    await expect(chalet.getByRole("link", { name: "Select" })).toHaveCount(0);
    await expect(chalet.locator('[aria-disabled="true"]')).toBeVisible();

    const family = page.locator("li.g-card").filter({ has: page.getByRole("heading", { name: "Family Deluxe Room" }) });
    await expect(family.getByText("Minimum 3 nights on these dates")).toBeVisible();
    await expect(family.getByText(/needs a stay of at least 3 nights/)).toBeVisible();
    await expect(family.getByRole("link", { name: "Select" })).toHaveCount(0);

    // Other types are still bookable.
    const deluxe = page.locator("li.g-card").filter({ has: page.getByRole("heading", { name: /Deluxe Room — City/ }) });
    await expect(deluxe.getByRole("link", { name: "Select" })).toBeVisible();
    await expectNoRawKeys(page);

    // Direct-link attempt on the sold-out type is refused by the engine as well.
    const r = await db.createBooking({
      room_type_id: ROOM_TYPES.chalet,
      check_in: checkin,
      check_out: muscatDate(21),
      adults: 2,
      children: 0,
      guest_name: "E2E-direct",
      guest_phone: "+96891234567",
      preferred_lang: "en",
      source: "website",
    });
    expect(r.status).toBe(400);
    expect(String(r.body.message)).toBe("sold_out");
  });

  test("no availability → alternative-date nudges", async ({ page }) => {
    const checkin = muscatDate(30);
    const rows = await db.insert(
      "bk_inventory_blocks",
      Object.values(ROOM_TYPES).map((id) => ({ room_type_id: id, room_id: null, start_date: checkin, end_date: muscatDate(31), kind: "stop_sell", reason: "e2e all" }))
    );
    expect(rows).toHaveLength(6);

    await page.goto(`/en/book?${searchQuery(30, 1)}`);
    await expect(page.getByRole("heading", { name: "Nothing free on these dates" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Try nearby dates" })).toBeVisible();
    const nudges = page.getByRole("link", { name: /days? (earlier|later)/ });
    await expect(nudges).toHaveCount(4);
    await expect(page.getByRole("link", { name: "Select" })).toHaveCount(0);

    // A nudge lands on a searchable page with results.
    await nudges.filter({ hasText: "1 day later" }).click();
    await page.waitForURL((u) => u.searchParams.get("checkin") === muscatDate(31));
    expect(new URL(page.url()).searchParams.get("checkout")).toBe(muscatDate(32));
    await expect(page.getByRole("heading", { name: "Available for your dates" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Select" }).first()).toBeVisible();
  });

  test("double-booking race: one room, three concurrent bk_create_booking calls → exactly one succeeds", async () => {
    // Reduce the mountain suites to one active room.
    const rooms = await db.rows<{ id: string }>("bk_rooms", `select=id&room_type_id=eq.${ROOM_TYPES["sama-suite-mountain-view"]}&order=sort_order.asc`);
    expect(rooms.length).toBe(5);
    for (const r of rooms.slice(1)) await db.patch("bk_rooms", `id=eq.${r.id}`, { status: "maintenance" });
    const checkin = muscatDate(40);
    const checkout = muscatDate(42);
    expect(await db.availableCount(ROOM_TYPES["sama-suite-mountain-view"], checkin, checkout)).toBe(1);

    const attempt = (i: number) =>
      db.createBooking({
        room_type_id: ROOM_TYPES["sama-suite-mountain-view"],
        check_in: checkin,
        check_out: checkout,
        adults: 2,
        children: 0,
        guest_name: `E2E-race-${i}`,
        guest_phone: `+9689000000${i}`,
        preferred_lang: "en",
        source: "website",
      });
    const results = await Promise.all([attempt(1), attempt(2), attempt(3)]);
    const ok = results.filter((r) => r.status === 200);
    const soldOut = results.filter((r) => r.status === 400 && r.body.message === "sold_out");
    expect(ok).toHaveLength(1);
    expect(soldOut).toHaveLength(2);
    expect(await db.availableCount(ROOM_TYPES["sama-suite-mountain-view"], checkin, checkout)).toBe(0);

    // DESIGN NOTE — this exercises the emulator only. In Postgres the same
    // guarantee comes from `pg_advisory_xact_lock(hashtext(room_type_id))`
    // inside bk_create_booking (migration 0005, §8) followed by a re-check of
    // bk_available_count. Re-run this scenario against the real project with
    // the service-role key before go-live.
  });

  test("Deluxe room: the guest must choose twin or king; the choice shows on review and confirmation", async ({ page }) => {
    const checkin = muscatDate(20);
    const checkout = muscatDate(21);
    const guestName = `E2E-Beds ${Date.now()}`;
    await page.goto(`/en/book/deluxe-mountain-view?checkin=${checkin}&checkout=${checkout}&adults=2&children=0`);
    await expect(page.getByRole("heading", { name: "Complete your booking" })).toBeVisible();
    await expect(page.getByText("Bed layout")).toBeVisible();

    // No choice → the form stays on step 1 with the bed error.
    await fillGuestDetails(page, { fullName: guestName, phone: "91234567", bedPreference: "skip" });
    await expect(page.getByText("Please choose the bed layout.")).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText("1");

    // Choose King and continue.
    await page.locator('input[name="bedPreference"][value="king"]').check({ force: true });
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();
    await expect(page.locator("dl").filter({ hasText: "Bed layout" }).first()).toContainText("King bed");

    const ref = await confirmBooking(page);
    expect(ref).toMatch(/^SAMA-/);
    await expect(page.getByText("Beds", { exact: true })).toBeVisible();
    await expect(page.getByText("King bed", { exact: true }).first()).toBeVisible();
  });

  test("guest manage page: cancel within policy → cancelled; check-in tomorrow → contact us", async ({ page }) => {
    const mk = async (offset: number, name: string) => {
      const r = await db.createBooking({
        room_type_id: ROOM_TYPES["deluxe-city-view"],
        check_in: muscatDate(offset),
        check_out: muscatDate(offset + 1),
        adults: 2,
        children: 0,
        guest_name: name,
        guest_phone: "+96893333333",
        guest_email: "e2e-manage@example.com",
        preferred_lang: "en",
        source: "website",
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body as { id: string; ref: string };
    };

    // Token: derive via the app itself — the manage link on a confirmation
    // page is the only public source, so request it through the ics helper
    // route used by templates. bookingToken = HMAC(service key) — recompute here.
    const { createHmac } = await import("node:crypto");
    const token = (ref: string) => createHmac("sha256", "bk-token:mock-service-role-key").update(ref).digest("hex").slice(0, 32);

    const far = await mk(12, "E2E-manage-far");
    await page.goto(`/en/booking/${far.ref}/manage?token=${token(far.ref)}`);
    await expect(page.getByRole("heading", { name: "Your booking" })).toBeVisible();
    await expect(page.getByText(/Free cancellation until/)).toBeVisible();
    await page.getByRole("button", { name: "Request cancellation" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/Reason/).fill("e2e");
    await dialog.getByRole("button", { name: "Yes, cancel my booking" }).click();
    await expect(page.getByRole("status")).toContainText("Your booking has been cancelled");
    const [row] = await db.rows<{ status: string; cancel_reason: string }>("bk_bookings", `select=status,cancel_reason&id=eq.${far.id}`);
    expect(row.status).toBe("cancelled");
    expect(row.cancel_reason).toBe("e2e");
    const sched = await db.rows<{ status: string }>("bk_scheduled_messages", `select=status&booking_id=eq.${far.id}&kind=neq.confirmation`);
    expect(sched.every((s) => s.status === "cancelled")).toBe(true);
    // Confirmation page now shows the cancelled state.
    await page.goto(`/en/booking/${far.ref}?token=${token(far.ref)}`);
    await expect(page.getByRole("heading", { name: "This booking has been cancelled" })).toBeVisible();

    const soon = await mk(1, "E2E-manage-soon");
    await page.goto(`/en/booking/${soon.ref}/manage?token=${token(soon.ref)}`);
    await expect(page.getByRole("heading", { name: "Past the free-cancellation window" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact us" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request cancellation" })).toHaveCount(0);
    await expectNoRawKeys(page);
  });
});
