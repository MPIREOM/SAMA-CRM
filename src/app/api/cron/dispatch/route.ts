import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSettings } from "@/lib/bk/settings";
import { logger } from "@/lib/logger";
import { dispatchDueMessages } from "@/lib/messaging/dispatch";

// Scheduled-message dispatcher endpoint.
// Called by Vercel Cron (vercel.json, every 15 min — sends `Authorization:
// Bearer $CRON_SECRET` automatically) and by pg_cron (migration 0007, every
// 10 min, bearer = bk_settings.cron.secret). Either secret is accepted.
// Idempotent: the dispatcher locks rows before sending, so overlapping calls
// never double-send.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 50;

function isPlaceholder(value: string | undefined | null): boolean {
  return !value || value.includes("YOUR_");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function acceptedSecrets(): Promise<string[]> {
  const secrets: string[] = [];
  const env = process.env.CRON_SECRET;
  if (!isPlaceholder(env)) secrets.push(env!);
  try {
    const settings = await getSettings();
    const s = settings.cron.secret?.trim();
    if (s) secrets.push(s);
  } catch (e) {
    // No database access (e.g. service key missing) — env secret only.
    logger.warn("cron.dispatch", "could not read settings.cron.secret", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return secrets;
}

async function authorised(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  const given = m[1].trim();
  if (!given) return false;
  const secrets = await acceptedSecrets();
  return secrets.some((s) => safeEqual(given, s));
}

async function handle(req: Request): Promise<Response> {
  if (!(await authorised(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const summary = await dispatchDueMessages(BATCH);
  const ms = Date.now() - started;
  logger.info("cron.dispatch", "run complete", { ...summary, errors: summary.errors.length, ms });
  return NextResponse.json({ ok: true, ms, ...summary });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
