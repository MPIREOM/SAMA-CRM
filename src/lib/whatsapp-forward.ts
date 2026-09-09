import { createHmac } from "node:crypto";

// Webhook fan-out for a WhatsApp number shared with another app (the SAAS
// project). Meta delivers every event for the number to ONE callback — ours.
// We keep what is the hotel's (guest messages) and relay to the other app
// what is theirs: inbound messages from its admin numbers plus every delivery
// receipt (it tracks its own sends by message id and ignores the rest).
//
// Pure module — no env, no I/O except `forwardWebhook`, which takes fetch as a
// parameter so it can be unit-tested.

// Structural minimums — the route's richer webhook interfaces satisfy them.
export interface WaContactLike {
  wa_id?: string;
  profile?: { name?: string };
}

export interface WaMessageLike {
  from?: string;
}

export interface WaValueLike {
  messaging_product?: string;
  contacts?: WaContactLike[];
  messages?: WaMessageLike[];
  statuses?: unknown[];
}

export interface WaChangeLike {
  field?: string;
  value?: WaValueLike;
}

export interface WaEntryLike {
  id?: string;
  changes?: WaChangeLike[];
}

export interface WaPayloadLike {
  object?: string;
  entry?: WaEntryLike[];
}

export interface SplitResult<P extends WaPayloadLike> {
  /** What this app processes: every event except messages from the forwarded senders. */
  local: P;
  /** What the other app receives: messages from its senders + all statuses. Null when empty. */
  forward: P | null;
  forwardedMessages: number;
  forwardedStatuses: number;
}

function senderId(msg: WaMessageLike): string {
  return String(msg.from ?? "").replace(/\D/g, "");
}

function keepContacts(contacts: WaContactLike[] | undefined, messages: WaMessageLike[]): WaContactLike[] | undefined {
  if (!contacts) return undefined;
  const ids = new Set(messages.map(senderId));
  return contacts.filter((c) => !c.wa_id || ids.has(String(c.wa_id).replace(/\D/g, "")));
}

/**
 * Split one Meta webhook payload in two without mutating it. Statuses are
 * copied to both sides (each app matches them against its own message ids).
 */
export function splitWebhookPayload<P extends WaPayloadLike>(payload: P, senders: ReadonlySet<string>): SplitResult<P> {
  const localEntries: WaEntryLike[] = [];
  const forwardEntries: WaEntryLike[] = [];
  let forwardedMessages = 0;
  let forwardedStatuses = 0;

  for (const entry of payload.entry ?? []) {
    const localChanges: WaChangeLike[] = [];
    const forwardChanges: WaChangeLike[] = [];

    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) {
        localChanges.push(change);
        continue;
      }
      const messages = value.messages ?? [];
      const mine = messages.filter((m) => !senders.has(senderId(m)));
      const theirs = messages.filter((m) => senders.has(senderId(m)));
      const statuses = value.statuses ?? [];

      localChanges.push({
        ...change,
        value: {
          ...value,
          ...(value.messages ? { messages: mine } : {}),
          ...(value.contacts ? { contacts: keepContacts(value.contacts, mine) } : {}),
        },
      });

      if (theirs.length > 0 || statuses.length > 0) {
        forwardedMessages += theirs.length;
        forwardedStatuses += statuses.length;
        forwardChanges.push({
          ...change,
          value: {
            ...value,
            ...(value.messages ? { messages: theirs } : {}),
            ...(value.contacts ? { contacts: keepContacts(value.contacts, theirs) } : {}),
          },
        });
      }
    }

    localEntries.push({ ...entry, changes: localChanges });
    if (forwardChanges.length > 0) forwardEntries.push({ ...entry, changes: forwardChanges });
  }

  const local = { ...payload, entry: localEntries } as P;
  const forward = forwardEntries.length > 0 ? ({ ...payload, entry: forwardEntries } as P) : null;
  return { local, forward, forwardedMessages, forwardedStatuses };
}

/** X-Hub-Signature-256 value for a raw body — same HMAC Meta uses, so the other app's check passes unchanged. */
export function signWebhookBody(body: string, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
}

export interface ForwardOutcome {
  ok: boolean;
  status: number | null;
  error: string | null;
  ms: number;
}

/**
 * Relay a (re-signed) payload to the other app. Bounded by `timeoutMs`: Meta
 * wants a fast ACK from us, and the receiver keeps processing after we stop
 * waiting — its serverless invocation does not end when our socket closes.
 */
export async function forwardWebhook(opts: {
  url: string;
  body: string;
  signature: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<ForwardOutcome> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  const started = Date.now();
  try {
    const res = await doFetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": opts.signature,
        "User-Agent": "sama-crm-webhook-relay/1.0",
      },
      body: opts.body,
      signal: controller.signal,
      cache: "no-store",
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}`, ms: Date.now() - started };
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    return { ok: false, status: null, error: aborted ? "timeout" : (e as Error).message, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
