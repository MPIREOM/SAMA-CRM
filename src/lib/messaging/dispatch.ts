import "server-only";

// ---------------------------------------------------------------------------
// CONTRACT for the messaging module (implemented in Phase 3).
// The booking server action calls dispatchForBooking(bookingId, ["confirmation"])
// right after bk_create_booking so the guest gets the confirmation within
// seconds; /api/cron/dispatch calls dispatchDueMessages() every 10–15 min as
// the safety net (and for pre-arrival / post-stay).
// ---------------------------------------------------------------------------

export type MessageKind = "confirmation" | "pre_arrival" | "post_stay";

export interface DispatchSummary {
  picked: number;
  sent: number;
  failed: number;
  stubbed: number;
  skipped: number;
  errors: string[];
}

export async function dispatchDueMessages(_limit = 50): Promise<DispatchSummary> {
  // TODO(messaging-agent): implemented in src/lib/messaging/dispatch.ts (Phase 3).
  return { picked: 0, sent: 0, failed: 0, stubbed: 0, skipped: 0, errors: ["not_implemented"] };
}

export async function dispatchForBooking(
  _bookingId: string,
  _kinds: MessageKind[] = ["confirmation"]
): Promise<DispatchSummary> {
  // TODO(messaging-agent): implemented in src/lib/messaging/dispatch.ts (Phase 3).
  return { picked: 0, sent: 0, failed: 0, stubbed: 0, skipped: 0, errors: ["not_implemented"] };
}
