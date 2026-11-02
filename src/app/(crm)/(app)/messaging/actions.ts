"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, ADMIN_ROLES, FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import { updateSetting } from "@/lib/bk/settings";
import { normalizePhone } from "@/lib/phone";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";
import { sendTestSafe } from "@/components/admin/messaging/preview-adapter";
import { invalidRecipients, parseRecipients } from "@/lib/messaging/recipients";
import { sendStaffNewBookingTest } from "@/lib/messaging/staff-notify";

const uuid = z.string().uuid();

function revalidateAll() {
  for (const p of ["/messaging", "/dashboard"]) revalidatePath(p);
}

export async function retryMessage(input: unknown): Promise<ActionResult> {
  return runAction("message.retry", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { id } = z.object({ id: uuid }).parse(input);
    const admin = createAdminClient();
    const { data: before } = await admin.from("bk_scheduled_messages").select("id, booking_id, status, kind, channel").eq("id", id).maybeSingle();
    if (!before) return { ok: false, error: "Message not found." };
    const { error } = await admin
      .from("bk_scheduled_messages")
      .update({ status: "pending", send_at: new Date().toISOString(), locked_at: null, last_error: null })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "message.retry", "bk_scheduled_messages", id, { booking_id: before.booking_id, kind: before.kind, channel: before.channel, from: before.status });
    revalidateAll();
    revalidatePath(`/reservations/${before.booking_id}`);
    return { ok: true };
  });
}

export async function cancelMessage(input: unknown): Promise<ActionResult> {
  return runAction("message.cancel", async () => {
    const { actor } = await requireStaff(FRONT_DESK_ROLES);
    const { id } = z.object({ id: uuid }).parse(input);
    const admin = createAdminClient();
    const { data: before } = await admin.from("bk_scheduled_messages").select("id, booking_id, status, kind, channel").eq("id", id).maybeSingle();
    if (!before) return { ok: false, error: "Message not found." };
    if (before.status === "sent") return { ok: false, error: "Already sent." };
    const { error } = await admin.from("bk_scheduled_messages").update({ status: "cancelled", locked_at: null }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "message.cancel", "bk_scheduled_messages", id, { booking_id: before.booking_id, kind: before.kind, channel: before.channel, from: before.status });
    revalidateAll();
    revalidatePath(`/reservations/${before.booking_id}`);
    return { ok: true };
  });
}

const SwitchSchema = z.object({ channel: z.enum(["email", "whatsapp"]), enabled: z.boolean() });

export async function setChannelEnabled(input: unknown): Promise<ActionResult> {
  return runAction("messaging.switch", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { channel, enabled } = SwitchSchema.parse(input);
    const patch = channel === "email" ? { email_enabled: enabled } : { whatsapp_enabled: enabled };
    await updateSetting("messaging", patch, actor.userId);
    await audit(actor, "settings.update", "bk_settings", "messaging", patch);
    revalidateAll();
    revalidatePath("/settings");
    return { ok: true };
  });
}

const TestSchema = z.object({
  kind: z.enum(["confirmation", "pre_arrival", "post_stay"]),
  channel: z.enum(["email", "whatsapp"]),
  to: z.string().trim().min(3).max(200),
});

export async function sendTestMessage(input: unknown): Promise<ActionResult<{ available: boolean }>> {
  return runAction<{ available: boolean }>("messaging.test", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { kind, channel, to } = TestSchema.parse(input);
    let target = to;
    if (channel === "whatsapp") {
      const phone = normalizePhone(to);
      if (!phone) return { ok: false, error: "invalid_phone" };
      target = phone;
      await updateSetting("messaging", { test_phone: phone }, actor.userId);
    } else {
      if (!z.string().email().safeParse(to).success) return { ok: false, error: "Please enter a valid email address." };
      await updateSetting("messaging", { test_email: to }, actor.userId);
    }
    const result = await sendTestSafe(kind, channel, target);
    await audit(actor, "messaging.test", "bk_settings", "messaging", { kind, channel, to: target, available: result.available, ok: result.available ? result.ok : null });
    revalidateAll();
    if (!result.available) return { ok: true, data: { available: false } };
    if (!result.ok) return { ok: false, error: result.error ?? "send_failed" };
    return { ok: true, data: { available: true } };
  });
}

// ---------------------------------------------------------------------------
// New-booking alert to the reservations desk
// ---------------------------------------------------------------------------

const StaffAlertSchema = z.object({ enabled: z.boolean(), email: z.string().trim().max(500) });

function recipientsOrError(raw: string): { ok: true; list: string[] } | { ok: false; error: string } {
  const bad = invalidRecipients(raw);
  if (bad.length > 0) return { ok: false, error: `Not an email address: ${bad.join(", ")}` };
  return { ok: true, list: parseRecipients(raw) };
}

/** Switch the alert on/off and set where it goes (several addresses separated by commas). */
export async function saveStaffAlert(input: unknown): Promise<ActionResult> {
  return runAction("messaging.staff_alert", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { enabled, email } = StaffAlertSchema.parse(input);
    const parsed = recipientsOrError(email);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (enabled && parsed.list.length === 0) return { ok: false, error: "Enter at least one email address, or switch the alert off." };
    const patch = { notify_new_booking: enabled, notify_email: parsed.list.join(", ") };
    await updateSetting("messaging", patch, actor.userId);
    await audit(actor, "settings.update", "bk_settings", "messaging", patch);
    revalidateAll();
    revalidatePath("/settings");
    return { ok: true };
  });
}

/** Send the alert with sample booking data to the given addresses (and remember them). */
export async function sendStaffAlertTest(input: unknown): Promise<ActionResult<{ stubbed: boolean }>> {
  return runAction<{ stubbed: boolean }>("messaging.staff_alert_test", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { email } = z.object({ email: z.string().trim().max(500) }).parse(input);
    const parsed = recipientsOrError(email);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (parsed.list.length === 0) return { ok: false, error: "Enter at least one email address." };
    await updateSetting("messaging", { notify_email: parsed.list.join(", ") }, actor.userId);
    const result = await sendStaffNewBookingTest(parsed.list);
    await audit(actor, "messaging.staff_alert_test", "bk_settings", "messaging", { to: parsed.list, ok: result.ok, stubbed: result.stubbed });
    revalidateAll();
    if (result.stubbed) return { ok: true, data: { stubbed: true } };
    if (!result.ok) return { ok: false, error: result.error ?? "send_failed" };
    return { ok: true, data: { stubbed: false } };
  });
}
