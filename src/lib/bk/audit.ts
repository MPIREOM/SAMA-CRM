import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

export interface Actor {
  userId: string | null;
  email: string | null;
}

/** Append-only audit trail for every back-office mutation. Never throws. */
export async function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  diff?: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("bk_audit_log").insert({
      actor_user_id: actor.userId,
      actor_email: actor.email,
      action,
      entity,
      entity_id: entityId,
      diff: (diff ?? null) as Json,
    });
  } catch (e) {
    // Auditing must never break the primary action.
    console.error("audit failed", (e as Error).message);
  }
}
