import "server-only";

import { ZodError } from "zod";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { FRONT_DESK_ROLES } from "@/lib/bk/staff";
import { logger } from "@/lib/logger";
import type { Role } from "@/lib/database.types";
import type { ActionResult } from "./shared";

// Server-only helpers shared by the back-office pages and their actions.

/** Turn any thrown value into the `{ ok: false, error }` action contract. */
export function actionError(e: unknown, scope: string): { ok: false; error: string } {
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const path = first?.path?.join(".") ?? "";
    return { ok: false, error: `validation: ${path ? `${path}: ` : ""}${first?.message ?? "invalid"}` };
  }
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) return { ok: false, error: "not_configured" };
  logger.error(scope, message);
  return { ok: false, error: message };
}

/** Wrap a server-action body so it never throws to the client. */
export async function runAction<T = undefined>(
  scope: string,
  body: () => Promise<ActionResult<T>>
): Promise<ActionResult<T>> {
  try {
    return await body();
  } catch (e) {
    return actionError(e, scope);
  }
}

export type PageSession = {
  userId: string;
  email: string | null;
  role: Role;
  fullName: string | null;
};

/**
 * Page guard: redirects anonymous visitors to /login and returns `null` when
 * the role is not allowed (the page then renders a no-access state).
 */
export async function guardPage(allowed: Role[] = FRONT_DESK_ROLES): Promise<PageSession | null> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  const role = (session.role ?? "reservation_desk") as Role;
  if (!allowed.includes(role)) return null;
  return {
    userId: session.userId,
    email: session.email,
    role,
    fullName: session.profile?.full_name ?? session.email,
  };
}

/** Readable message for a page-level data-load failure (never leaks secrets). */
export function loadErrorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) return "not_configured";
  logger.error("admin.page", message);
  return message;
}

/** Strict YYYY-MM-DD check for search params. */
export function isIsoDateParam(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** First value of a (possibly repeated) search param. */
export function param(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
