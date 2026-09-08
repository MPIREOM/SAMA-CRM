import { expect, test } from "@playwright/test";
import { ADDONS, MockDb, ROOM_TYPES, loginAs, muscatDate } from "./helpers";

// Back-office journey as super_admin, then the reservation_desk restrictions.
// Desktop project only (matches playwright.config.ts).

test.describe("staff back-office", () => {
  let db: MockDb;

  test.beforeEach(async ({ request }) => {
    db = new MockDb(request);
    await db.cleanupInventory();
  });

  test.afterEach(async () => {
    await db.cancelE2EBookings();
    await db.cleanupInventory();
  });

  test("admin: dashboard, calendar, blocks, reservations, cancel, rates, settings, messaging, audit", async ({ page }) => {
    // A website booking to find in the back-office.
    const checkin = muscatDate(5);
    const checkout = muscatDate(7);
    const created = await db.createBooking({
      room_type_id: ROOM_TYPES.chalet,
      check_in: checkin,
      check_out: checkout,
      adults: 2,
      children: 1,
      guest_name: "E2E-Staff Guest",
      guest_phone: "+96894444444",
      guest_email: "e2e-staff@example.com",
      preferred_lang: "en",
      source: "website",
    });
    expect(created.status).toBe(200);
    const booking = created.body as { id: string; ref: string };

    await loginAs(page, "admin");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    // Property overview loaded (no "not configured" error) and the sidebar has Settings.
    await expect(page.getByText("not_configured")).toHaveCount(0);
    await expect(page.locator("nav").getByRole("link", { name: "Settings" })).toBeVisible();

    // Calendar: 60 room rows + the booking created above (unassigned → type lane).
    await page.goto(`/calendar?from=${muscatDate(4)}`);
    const roomLabels = page.locator("div.sticky span.truncate").filter({ hasText: /^(\d{3}|C\d{2})$/ });
    await expect(roomLabels).toHaveCount(60);
    await expect(page.locator(`[title^="${booking.ref}"]`).first()).toBeVisible();

    // Blocks: create a type-level stop-sell for two nights → availability drops → delete → restores.
    const blockStart = muscatDate(60);
    const blockEnd = muscatDate(62);
    const before = await db.availableCount(ROOM_TYPES["deluxe-mountain-view"], blockStart, blockEnd);
    expect(before).toBe(14);
    await page.goto("/blocks");
    await page.getByRole("button", { name: "New block" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#bl-scope").selectOption("type");
    await dialog.locator("#bl-type").selectOption(ROOM_TYPES["deluxe-mountain-view"]);
    await dialog.locator("#bl-start").fill(blockStart);
    await dialog.locator("#bl-nights").fill("2");
    await dialog.locator("#bl-reason").fill("e2e stop sell from UI");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("e2e stop sell from UI")).toBeVisible();
    expect(await db.availableCount(ROOM_TYPES["deluxe-mountain-view"], blockStart, blockEnd)).toBe(0);
    const [blockRow] = await db.rows<{ id: string; kind: string; room_type_id: string; end_date: string }>("bk_inventory_blocks", "select=*&reason=eq.e2e%20stop%20sell%20from%20UI");
    expect(blockRow.kind).toBe("stop_sell");
    expect(blockRow.end_date).toBe(blockEnd);

    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("row")
      .filter({ hasText: "e2e stop sell from UI" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByText("e2e stop sell from UI")).toHaveCount(0);
    expect(await db.availableCount(ROOM_TYPES["deluxe-mountain-view"], blockStart, blockEnd)).toBe(14);
    const audit = await db.rows<{ action: string }>("bk_audit_log", `select=action&entity_id=eq.${blockRow.id}&order=created_at.asc`);
    expect(audit.map((a) => a.action)).toEqual(["block.create", "block.delete"]);

    // Reservations list → detail → cancel with reason.
    await page.goto("/reservations?q=E2E-Staff");
    await expect(page.getByRole("link", { name: booking.ref })).toBeVisible();
    await page.getByRole("link", { name: booking.ref }).click();
    await page.waitForURL(`**/reservations/${booking.id}`);
    await expect(page.getByText("E2E-Staff Guest").first()).toBeVisible();
    await page.getByRole("button", { name: "Cancel booking" }).click();
    const cancelDialog = page.getByRole("dialog");
    await cancelDialog.locator("#cancel-reason").fill("e2e");
    await cancelDialog.getByRole("button", { name: "Yes, cancel" }).click();
    await expect(cancelDialog).toBeHidden();
    await expect
      .poll(async () => (await db.rows<{ status: string }>("bk_bookings", `select=status&id=eq.${booking.id}`))[0]?.status)
      .toBe("cancelled");
    const sched = await db.rows<{ kind: string; status: string }>("bk_scheduled_messages", `select=kind,status&booking_id=eq.${booking.id}`);
    expect(sched).toHaveLength(6);
    expect(sched.filter((s) => s.kind !== "confirmation").every((s) => s.status === "cancelled")).toBe(true);
    await expect(page.getByText(/Cancelled/).first()).toBeVisible();

    // Rates month grid, settings, messaging, audit.
    await page.goto("/rates");
    await expect(page.getByRole("heading", { name: "Rates" }).first()).toBeVisible();
    await expect(page.locator("table").first()).toBeVisible();
    await expect(page.getByText("Weekend (Thu & Fri nights) +20%").first()).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" }).first()).toBeVisible();
    await expect(page.getByText("You don't have access to this page")).toHaveCount(0);

    await page.goto("/messaging");
    await expect(page.getByRole("heading", { name: "Messaging" }).first()).toBeVisible();
    await expect(page.getByText(booking.ref).first()).toBeVisible();

    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Audit log" }).first()).toBeVisible();
    const cancelRow = page.getByRole("row").filter({ hasText: "booking.cancel" }).filter({ hasText: booking.id.slice(0, 8) });
    await expect(cancelRow).toHaveCount(1);
    // The SQL-written cancel row has no actor_email; the page resolves the actor to a staff name.
    await expect(cancelRow).toContainText("Sama Admin");
    await expect(cancelRow).not.toContainText("40000000");
  });

  test("front desk: new walk-in booking today → assign room → check in → check out; CSV export", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/reservations/new");
    await expect(page.getByRole("heading", { name: "New booking" })).toBeVisible();
    await page.locator("#n-type").selectOption(ROOM_TYPES["deluxe-mountain-view"]);
    await page.locator("#n-in").fill(muscatDate(0));
    await page.locator("#n-out").fill(muscatDate(1));
    // Free rooms load for the dates; pick the first one.
    const roomSelect = page.locator("#n-room");
    await expect(roomSelect).toBeEnabled();
    await expect.poll(async () => roomSelect.locator("option").count()).toBeGreaterThan(1);
    const roomNumber = await roomSelect.locator("option").nth(1).innerText();
    await roomSelect.selectOption({ index: 1 });
    await page.locator("#n-name").fill("E2E-Walk In");
    await page.locator("#n-local").fill("97777777");
    await page.locator("#n-source").selectOption("walk_in");

    // Add-ons: APEX Zipline ×1 with a note → the live quote gains the line.
    const zipline = page.getByTestId("addon-apex-zipline");
    await zipline.getByRole("button", { name: /More/ }).click();
    await expect(page.getByTestId("addon-qty-apex-zipline")).toHaveText("1");
    await page.locator("#n-addon-note-apex-zipline").fill("Sunday 10:00, one rider under 16");
    await expect(page.getByTestId("quote-addons")).toContainText("APEX Zipline ×1");
    await expect(page.getByTestId("quote-addons")).toContainText("OMR 5.000");

    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/reservations\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").pop()!;
    const [row] = await db.rows<{ ref: string; status: string; source: string; room_id: string | null; total_omr: number; addons_omr: number; guest_phone: string }>(
      "bk_bookings",
      `select=ref,status,source,room_id,total_omr,addons_omr,guest_phone&id=eq.${id}`
    );
    expect(row.source).toBe("walk_in");
    expect(row.status).toBe("confirmed");
    expect(row.room_id).not.toBeNull();
    expect(row.guest_phone).toBe("+96897777777");
    expect(Number(row.total_omr)).toBeGreaterThan(0);
    expect(Number(row.addons_omr)).toBe(5);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(row.ref);
    await expect(page.getByText("1 night", { exact: false }).first()).toBeVisible();
    await expect(page.locator("#s-room")).toHaveValue(row.room_id!);
    expect(roomNumber).toMatch(/^\d{3}/);

    // Detail shows the add-on line (requested) with its note; confirming it flips the badge and the DB row.
    const lines = await db.rows<{ id: string; addon_id: string; quantity: number; status: string; note: string | null; total_omr: number }>(
      "bk_booking_addons",
      `select=id,addon_id,quantity,status,note,total_omr&booking_id=eq.${id}`
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].addon_id).toBe(ADDONS["apex-zipline"]);
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].status).toBe("requested");
    expect(lines[0].note).toBe("Sunday 10:00, one rider under 16");
    expect(Number(lines[0].total_omr)).toBe(5);
    const addonCard = page.getByTestId("booking-addons");
    await expect(addonCard).toContainText("APEX Zipline");
    await expect(addonCard).toContainText("Sunday 10:00, one rider under 16");
    await expect(addonCard.getByTestId("addon-status")).toHaveText("Requested");
    await expect(page.getByTestId("money-addons")).toHaveText("OMR 5.000");
    await addonCard.getByRole("button", { name: "Confirm" }).click();
    await expect(addonCard.getByTestId("addon-status")).toHaveText("Confirmed");
    await expect.poll(async () => (await db.rows<{ status: string }>("bk_booking_addons", `select=status&id=eq.${lines[0].id}`))[0]?.status).toBe("confirmed");
    // Zipline row icon on the list.
    await page.goto("/reservations?q=E2E-Walk");
    await expect(page.getByRole("row").filter({ hasText: row.ref }).getByTestId("row-activity")).toBeVisible();
    await page.goto(`/reservations/${id}`);

    // Same-day arrival → check in, then check out.
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await expect.poll(async () => (await db.rows<{ status: string }>("bk_bookings", `select=status&id=eq.${id}`))[0]?.status).toBe("checked_in");
    await expect(page.getByRole("button", { name: "Check out", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Check out", exact: true }).click();
    await expect.poll(async () => (await db.rows<{ status: string }>("bk_bookings", `select=status&id=eq.${id}`))[0]?.status).toBe("checked_out");
    const mirror = await db.rows<{ status: string }>("bookings", `select=status&id=eq.${id}`);
    expect(mirror[0]?.status).toBe("Completed");
    const audit = await db.rows<{ action: string }>("bk_audit_log", `select=action&entity_id=eq.${id}&order=created_at.asc`);
    expect(audit.map((a) => a.action)).toEqual(["booking.create", "booking.addon_status", "booking.check_in", "booking.check_out"]);

    // CSV export (super_admin only) covers the booking and its add-ons.
    const csv = await page.request.get(`/reservations/export?from=${muscatDate(0)}&to=${muscatDate(0)}`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const text = await csv.text();
    const header = text.split("\n")[0];
    expect(header).toMatch(/ref/i);
    expect(header.split(",")).toEqual(expect.arrayContaining(["addons", "addons_omr"]));
    const line = text.split(/\r?\n/).find((l) => l.includes(row.ref));
    expect(line).toContain("APEX Zipline ×1");
    expect(line).toContain("5.000");
  });

  test("admin: /addons catalogue lists the three seeded add-ons; edit dialog validates JSON; transfers show on dashboard + list", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/addons");
    await expect(page.getByRole("heading", { name: "Add-ons" }).first()).toBeVisible();
    await expect(page.locator("nav").getByRole("link", { name: "Add-ons" })).toBeVisible();
    const rows = page.getByTestId("addon-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("APEX Zipline");
    await expect(rows.nth(0)).toContainText("OMR 5.000");
    await expect(rows.nth(0)).toContainText("per person");
    await expect(rows.nth(1)).toContainText("4WD transfer up");
    await expect(rows.nth(2)).toContainText("4WD transfer down");
    await expect(rows.nth(2)).toContainText("OMR 15.000");

    // Edit: invalid JSON blocks the save; a valid edit is persisted + audited (the seed row is restored after).
    const [original] = await db.rows<{ tagline_en: string; details: Record<string, unknown> }>("bk_addons", `select=tagline_en,details&id=eq.${ADDONS["apex-zipline"]}`);
    await rows.nth(0).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#ad-slug")).toHaveValue("apex-zipline");
    await dialog.locator("#ad-details").fill("{not json");
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    await dialog.locator("#ad-details").fill(JSON.stringify({ ...original.details, e2e: true }));
    await dialog.locator("#ad-tag-en").fill("E2E tagline");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(async () => (await db.rows<{ tagline_en: string; details: Record<string, unknown> }>("bk_addons", `select=tagline_en,details&id=eq.${ADDONS["apex-zipline"]}`))[0])
      .toEqual({ tagline_en: "E2E tagline", details: { ...original.details, e2e: true } });
    const audit = await db.rows<{ action: string; diff: Record<string, unknown> }>("bk_audit_log", `select=action,diff&entity_id=eq.${ADDONS["apex-zipline"]}&order=created_at.desc`);
    expect(audit[0]?.action).toBe("addon.update");
    expect(audit[0]?.diff).toHaveProperty("tagline_en");
    await db.patch("bk_addons", `id=eq.${ADDONS["apex-zipline"]}`, { tagline_en: original.tagline_en, details: original.details });

    // New add-on with a duplicate slug is refused.
    await page.getByRole("button", { name: "New add-on" }).first().click();
    const create = page.getByRole("dialog");
    await create.locator("#ad-name-en").fill("E2E Dup");
    await create.locator("#ad-name-ar").fill("تكرار");
    await create.locator("#ad-slug").fill("apex-zipline");
    await create.locator("#ad-price").fill("1");
    await create.getByRole("button", { name: "Add" }).click();
    await expect(create.getByRole("alert")).toContainText(/slug already exists/);
    await page.keyboard.press("Escape");

    // A booking arriving today with both transfers → dashboard pickup tag, list icon + "Has transfer" chip.
    const created = await db.createBooking({
      room_type_id: ROOM_TYPES.chalet,
      check_in: muscatDate(0),
      check_out: muscatDate(1),
      adults: 2,
      children: 0,
      guest_name: "E2E-Transfer Guest",
      guest_phone: "+96893333333",
      preferred_lang: "en",
      source: "phone",
      addons: [
        { slug: "transfer-up", quantity: 1, note: "Checkpoint 13:30" },
        { slug: "transfer-down", quantity: 1 },
      ],
    });
    expect(created.status).toBe(200);
    const booking = created.body as { id: string; ref: string; addons_omr: number; total_omr: number };
    expect(Number(booking.addons_omr)).toBe(30);

    await page.goto("/dashboard");
    const arrival = page.locator("li").filter({ hasText: booking.ref });
    await expect(arrival.getByTestId("movement-pickup")).toContainText("4WD pickup");

    await page.goto("/reservations?transfer=1");
    await expect(page.getByRole("row").filter({ hasText: booking.ref }).getByTestId("row-transfer")).toBeVisible();
    await expect(page.getByRole("button", { name: "Has transfer" })).toHaveAttribute("aria-pressed", "true");
    // Cancelling the line takes the transfer out of the total; cancelling the booking cancels the rest.
    await page.goto(`/reservations/${booking.id}`);
    const card = page.getByTestId("booking-addons");
    await expect(card.getByTestId("booking-addon-line")).toHaveCount(2);
    await card.getByTestId("booking-addon-line").nth(1).getByRole("button", { name: "Cancel" }).click();
    await expect(card.getByTestId("booking-addon-line").nth(1).getByTestId("addon-status")).toHaveText("Cancelled");
    await expect.poll(async () => Number((await db.rows<{ addons_omr: number }>("bk_bookings", `select=addons_omr&id=eq.${booking.id}`))[0]?.addons_omr)).toBe(15);
    const [after] = await db.rows<{ total_omr: number }>("bk_bookings", `select=total_omr&id=eq.${booking.id}`);
    expect(Number(after.total_omr)).toBe(Number(booking.total_omr) - 15);
    await db.rpc("bk_cancel_booking", { p_booking_id: booking.id, p_reason: "e2e" });
    const statuses = await db.rows<{ status: string }>("bk_booking_addons", `select=status&booking_id=eq.${booking.id}`);
    expect(statuses.every((s) => s.status === "cancelled")).toBe(true);
  });

  test("reservation_desk cannot open /settings and sees no Settings in the sidebar", async ({ page }) => {
    await loginAs(page, "desk");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("nav").getByRole("link", { name: "Reservations" })).toBeVisible();
    await expect(page.locator("nav").getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(page.locator("nav").getByRole("link", { name: "Rates" })).toHaveCount(0);
    await expect(page.locator("nav").getByRole("link", { name: "Add-ons" })).toHaveCount(0);

    await page.goto("/settings");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await page.goto("/rates");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await page.goto("/audit");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await page.goto("/addons");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();

    // Front-desk pages still work.
    await page.goto("/reservations");
    await expect(page.getByRole("heading", { name: "Reservations" }).first()).toBeVisible();
    await page.goto("/blocks");
    await expect(page.getByRole("heading", { name: "Blocks" }).first()).toBeVisible();
  });
});
