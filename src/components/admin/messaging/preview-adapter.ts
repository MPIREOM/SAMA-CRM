import "server-only";

import { logger } from "@/lib/logger";

// Thin adapter around the Phase-3 messaging modules. `@/lib/messaging/templates`
// (renderPreview) and `sendTest` on `@/lib/messaging/dispatch` do not exist yet;
// the dynamic import below resolves them at runtime when they land and falls
// back to a "not built yet" state until then, so this code compiles today.

export type PreviewKind = "confirmation" | "pre_arrival" | "post_stay";
export type PreviewChannel = "email" | "whatsapp";
export type PreviewLocale = "en" | "ar";

export interface RenderedPreview {
  subject: string | null;
  body: string;
  html: string | null;
}

export type PreviewResult = { available: true; preview: RenderedPreview } | { available: false; reason: string };

type MaybePromise<T> = T | Promise<T>;

type TemplatesModule = {
  renderPreview?: (kind: PreviewKind, channel: PreviewChannel, locale: PreviewLocale) => MaybePromise<unknown>;
};

type DispatchModule = {
  sendTest?: (kind: PreviewKind, channel: PreviewChannel, to: string) => Promise<unknown>;
};

async function loadMessagingModule<T extends object>(name: string): Promise<T | null> {
  try {
    // Template-literal specifier → webpack builds a context over src/lib/messaging/*
    // and resolves the file at runtime (missing file → rejected promise).
    const mod = (await import(`../../../lib/messaging/${name}`)) as T;
    return mod ?? null;
  } catch (e) {
    logger.info("messaging.adapter", `module ${name} not available`, { error: (e as Error).message });
    return null;
  }
}

function normalise(raw: unknown): RenderedPreview | null {
  if (typeof raw === "string") return { subject: null, body: raw, html: null };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const body = typeof r.body === "string" ? r.body : typeof r.text === "string" ? r.text : null;
    const html = typeof r.html === "string" ? r.html : null;
    const subject = typeof r.subject === "string" ? r.subject : null;
    if (body !== null || html !== null) return { subject, body: body ?? "", html };
  }
  return null;
}

export const NOT_BUILT = "not_built";

/** Render a template with sample data; `available: false` until Phase 3 ships templates. */
export async function renderPreviewSafe(kind: PreviewKind, channel: PreviewChannel, locale: PreviewLocale): Promise<PreviewResult> {
  const mod = await loadMessagingModule<TemplatesModule>("templates");
  if (!mod || typeof mod.renderPreview !== "function") return { available: false, reason: NOT_BUILT };
  try {
    const preview = normalise(await mod.renderPreview(kind, channel, locale));
    if (!preview) return { available: false, reason: "unexpected_shape" };
    return { available: true, preview };
  } catch (e) {
    return { available: false, reason: (e as Error).message };
  }
}

/** Send a test message; `available: false` until dispatch exposes sendTest(). */
export async function sendTestSafe(
  kind: PreviewKind,
  channel: PreviewChannel,
  to: string
): Promise<{ available: true; ok: boolean; error: string | null } | { available: false; reason: string }> {
  const mod = await loadMessagingModule<DispatchModule>("dispatch");
  if (!mod || typeof mod.sendTest !== "function") return { available: false, reason: NOT_BUILT };
  try {
    const result = (await mod.sendTest(kind, channel, to)) as { ok?: boolean; error?: string } | undefined;
    if (result && result.ok === false) return { available: true, ok: false, error: result.error ?? "send_failed" };
    return { available: true, ok: true, error: null };
  } catch (e) {
    return { available: true, ok: false, error: (e as Error).message };
  }
}
