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
