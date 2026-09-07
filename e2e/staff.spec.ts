import { expect, test } from "@playwright/test";
import { MockDb, ROOM_TYPES, loginAs, muscatDate } from "./helpers";

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
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/reservations\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").pop()!;
    const [row] = await db.rows<{ ref: string; status: string; source: string; room_id: string | null; total_omr: number; guest_phone: string }>(
      "bk_bookings",
      `select=ref,status,source,room_id,total_omr,guest_phone&id=eq.${id}`
    );
    expect(row.source).toBe("walk_in");
    expect(row.status).toBe("confirmed");
    expect(row.room_id).not.toBeNull();
    expect(row.guest_phone).toBe("+96897777777");
    expect(Number(row.total_omr)).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(row.ref);
    await expect(page.getByText("1 night", { exact: false }).first()).toBeVisible();
    await expect(page.locator("#s-room")).toHaveValue(row.room_id!);
    expect(roomNumber).toMatch(/^\d{3}/);

    // Same-day arrival → check in, then check out.
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await expect.poll(async () => (await db.rows<{ status: string }>("bk_bookings", `select=status&id=eq.${id}`))[0]?.status).toBe("checked_in");
    await expect(page.getByRole("button", { name: "Check out", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Check out", exact: true }).click();
    await expect.poll(async () => (await db.rows<{ status: string }>("bk_bookings", `select=status&id=eq.${id}`))[0]?.status).toBe("checked_out");
    const mirror = await db.rows<{ status: string }>("bookings", `select=status&id=eq.${id}`);
    expect(mirror[0]?.status).toBe("Completed");
    const audit = await db.rows<{ action: string }>("bk_audit_log", `select=action&entity_id=eq.${id}&order=created_at.asc`);
    expect(audit.map((a) => a.action)).toEqual(["booking.create", "booking.check_in", "booking.check_out"]);

    // CSV export (super_admin only) covers the booking.
    const csv = await page.request.get(`/reservations/export?from=${muscatDate(0)}&to=${muscatDate(0)}`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const text = await csv.text();
    expect(text.split("\n")[0]).toMatch(/ref/i);
    expect(text).toContain(row.ref);
  });

  test("reservation_desk cannot open /settings and sees no Settings in the sidebar", async ({ page }) => {
    await loginAs(page, "desk");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("nav").getByRole("link", { name: "Reservations" })).toBeVisible();
    await expect(page.locator("nav").getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(page.locator("nav").getByRole("link", { name: "Rates" })).toHaveCount(0);

    await page.goto("/settings");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await page.goto("/rates");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await page.goto("/audit");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();

    // Front-desk pages still work.
    await page.goto("/reservations");
    await expect(page.getByRole("heading", { name: "Reservations" }).first()).toBeVisible();
    await page.goto("/blocks");
    await expect(page.getByRole("heading", { name: "Blocks" }).first()).toBeVisible();
  });
});
