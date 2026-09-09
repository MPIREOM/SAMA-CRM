import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { forwardWebhook, signWebhookBody, splitWebhookPayload } from "../whatsapp-forward";

const ADMIN = "96877332220";
const GUEST = "96899123456";

function payload(messages: { from: string; id: string }[], statuses: { id: string; status: string }[] = []) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "968 7733 2220", phone_number_id: "PHONE_ID" },
              contacts: messages.map((m) => ({ wa_id: m.from, profile: { name: `name-${m.from}` } })),
              messages: messages.map((m) => ({ ...m, type: "text", text: { body: "hi" }, timestamp: "1" })),
              statuses,
            },
          },
        ],
      },
    ],
  };
}

describe("splitWebhookPayload", () => {
  const senders = new Set([ADMIN]);

  it("keeps a guest message local and forwards nothing", () => {
    const p = payload([{ from: GUEST, id: "m1" }]);
    const r = splitWebhookPayload(p, senders);
    expect(r.forward).toBeNull();
    expect(r.forwardedMessages).toBe(0);
    expect(r.local.entry[0].changes[0].value.messages).toHaveLength(1);
    expect(r.local.entry[0].changes[0].value.contacts).toHaveLength(1);
  });

  it("forwards an admin message and removes it from the local copy", () => {
    const p = payload([{ from: ADMIN, id: "m1" }]);
    const r = splitWebhookPayload(p, senders);
    expect(r.local.entry[0].changes[0].value.messages).toHaveLength(0);
    expect(r.local.entry[0].changes[0].value.contacts).toHaveLength(0);
    expect(r.forward).not.toBeNull();
    expect(r.forward!.entry[0].changes[0].value.messages).toHaveLength(1);
    expect(r.forward!.entry[0].changes[0].value.contacts?.[0].wa_id).toBe(ADMIN);
    expect(r.forwardedMessages).toBe(1);
  });

  it("splits a mixed batch and copies statuses to both sides", () => {
    const p = payload(
      [
        { from: GUEST, id: "m1" },
        { from: ADMIN, id: "m2" },
      ],
      [{ id: "wamid.1", status: "delivered" }]
    );
    const r = splitWebhookPayload(p, senders);
    expect(r.local.entry[0].changes[0].value.messages?.map((m) => m.from)).toEqual([GUEST]);
    expect(r.forward!.entry[0].changes[0].value.messages?.map((m) => m.from)).toEqual([ADMIN]);
    expect(r.local.entry[0].changes[0].value.statuses).toHaveLength(1);
    expect(r.forward!.entry[0].changes[0].value.statuses).toHaveLength(1);
    expect(r.forwardedStatuses).toBe(1);
  });

  it("forwards status-only payloads even with no senders configured", () => {
    const p = payload([], [{ id: "wamid.2", status: "read" }]);
    const r = splitWebhookPayload(p, new Set());
    expect(r.forward).not.toBeNull();
    expect(r.forwardedStatuses).toBe(1);
    expect(r.forwardedMessages).toBe(0);
  });

  it("matches senders by digits regardless of formatting in the payload", () => {
    const p = payload([{ from: "+968 7733 2220", id: "m1" }]);
    const r = splitWebhookPayload(p, senders);
    expect(r.forwardedMessages).toBe(1);
  });

  it("never mutates the original payload", () => {
    const p = payload([{ from: ADMIN, id: "m1" }], [{ id: "s", status: "sent" }]);
    const snapshot = JSON.stringify(p);
    splitWebhookPayload(p, senders);
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe("signWebhookBody", () => {
  it("produces Meta's X-Hub-Signature-256 format", () => {
    const body = '{"a":1}';
    const expected = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
    expect(signWebhookBody(body, "secret")).toBe(expected);
  });
});

describe("forwardWebhook", () => {
  it("posts the body with the signature header and reports the status", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      expect((init?.headers as Record<string, string>)["X-Hub-Signature-256"]).toBe("sha256=abc");
      expect(init?.body).toBe("{}");
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await forwardWebhook({ url: "https://saas.example/api/webhooks/whatsapp", body: "{}", signature: "sha256=abc", fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
  });

  it("reports a timeout instead of throwing", async () => {
    const fetchImpl = ((_url: unknown, init: RequestInit | undefined) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as unknown as typeof fetch;
    const r = await forwardWebhook({ url: "https://saas.example/x", body: "{}", signature: "s", timeoutMs: 10, fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("timeout");
  });

  it("reports non-2xx responses as failures", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    const r = await forwardWebhook({ url: "https://saas.example/x", body: "{}", signature: "s", fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("HTTP 403");
  });
});
