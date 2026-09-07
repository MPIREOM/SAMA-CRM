"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cancelBooking, getBookingByRef } from "@/lib/bk/bookings";
import { getPublicSettings } from "@/lib/bk/settings";
import { verifyBookingToken } from "@/lib/booking-engine/tokens";
import { logger } from "@/lib/logger";
import { canCancelOnline } from "@/components/guest/lib";

// Guest-initiated cancellation. The token gates access; the deadline is
// re-checked server-side against the live settings.

const inputSchema = z.object({
  ref: z.string().regex(/^[A-Z0-9-]{6,24}$/i),
  token: z.string().min(8).max(128),
  reason: z.string().trim().max(300).default(""),
});

export type CancelState = { status: "idle" } | { status: "cancelled"; ref: string } | { status: "error"; error: "deadline" | "unknown" };

export async function requestCancellationAction(prev: CancelState | FormData, maybeFormData?: FormData): Promise<CancelState> {
  // With JS: (prevState, formData). Progressive enhancement (no JS): (formData).
  const formData = maybeFormData ?? (prev instanceof FormData ? prev : new FormData());
  const parsed = inputSchema.safeParse({
    ref: formData.get("ref"),
    token: formData.get("token"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { status: "error", error: "unknown" };
  const ref = parsed.data.ref.toUpperCase();
  if (!verifyBookingToken(ref, parsed.data.token)) return { status: "error", error: "unknown" };

  try {
    const [booking, settings] = await Promise.all([getBookingByRef(ref), getPublicSettings()]);
    if (!booking) return { status: "error", error: "unknown" };
    if (booking.status === "cancelled") return { status: "cancelled", ref };
    if (!canCancelOnline(booking, settings)) return { status: "error", error: "deadline" };

    const res = await cancelBooking(booking.id, parsed.data.reason || "guest", null);
    if (res.error) {
      logger.warn("guest.manage", "cancel rejected", { ref, error: res.error });
      return { status: "error", error: "unknown" };
    }
    revalidatePath(`/en/booking/${ref}`);
    revalidatePath(`/ar/booking/${ref}`);
    revalidatePath(`/en/booking/${ref}/manage`);
    revalidatePath(`/ar/booking/${ref}/manage`);
    return { status: "cancelled", ref };
  } catch (err) {
    logger.error("guest.manage", "cancel crashed", { ref, error: err instanceof Error ? err.message : String(err) });
    return { status: "error", error: "unknown" };
  }
}
