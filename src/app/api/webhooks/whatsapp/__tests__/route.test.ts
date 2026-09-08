import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Minimal chainable stand-in for the Supabase admin client: records inserts
// into `messages` and answers every lookup with "nothing found".
const inserted: { table: string; row: Record<string, unknown> }[] = [];
function table(name: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    in: self,
    limit: self,
    update: self,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: { id: "contact-1" }, error: null }),
    insert: (row: Record<string, unknown>) => {
      inserted.push({ table: name, row });
      return { select: () => ({ single: async () => ({ data: { id: "contact-1" }, error: null }) }) };
    },
  });
  return chain;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (name: string) => table(name) }) }));

const SECRET = "app-secret";
const ADMIN = "96877332220";
const GUEST = "96899123456";

function sign(body: string) {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

function payload() {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "PHONE" },
              contacts: [
                { wa_id: GUEST, profile: { name: "Guest" } },
                { wa_id: ADMIN, profile: { name: "Owner" } },
              ],
              messages: [
                { id: "wamid.guest", from: GUEST, type: "text", text: { body: "Running late" }, timestamp: "1700000000" },
                { id: "wamid.admin", from: ADMIN, type: "text", text: { body: "show unit 27" }, timestamp: "1700000001" },
              ],
              statuses: [{ id: "wamid.sent1", status: "delivered", timestamp: "1700000002" }],
            },
          },
        ],
      },
    ],
  });
}

describe("POST /api/webhooks/whatsapp (shared number)", () => {
  const env = process.env;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    inserted.length = 0;
    process.env = {
      ...env,
      WHATSAPP_APP_SECRET: SECRET,
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: "shared-verify",
      WHATSAPP_VERIFY_TOKEN: "",
      WHATSAPP_FORWARD_URL: "https://saas.example/api/webhooks/whatsapp",
      WHATSAPP_FORWARD_SENDERS: `+968 7733 2220`,
    };
    fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env = env;
    vi.unstubAllGlobals();
  });

  it("verifies the handshake with the SAAS-named verify token", async () => {
    const { GET } = await import("../route");
    const ok = await GET(new Request("https://hotel.example/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=shared-verify&hub.challenge=42"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    const bad = await GET(new Request("https://hotel.example/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"));
    expect(bad.status).toBe(403);
  });

  it("keeps the guest message, relays the admin message + receipts re-signed, and ACKs Meta", async () => {
    const { POST } = await import("../route");
    const body = payload();
    const res = await POST(
      new Request("https://hotel.example/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
        body,
      })
    );
    expect(res.status).toBe(200);

    // Hotel inbox: only the guest's message was stored.
    const stored = inserted.filter((i) => i.table === "messages").map((i) => i.row);
    expect(stored).toHaveLength(1);
    expect(stored[0].provider_msg_id).toBe("wamid.guest");

    // Relay: one POST to the SAAS webhook with only the admin message + the receipt, signed with the shared secret.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://saas.example/api/webhooks/whatsapp");
    const relayed = JSON.parse(String(init.body));
    const value = relayed.entry[0].changes[0].value;
    expect(value.messages.map((m: { id: string }) => m.id)).toEqual(["wamid.admin"]);
    expect(value.contacts.map((c: { wa_id: string }) => c.wa_id)).toEqual([ADMIN]);
    expect(value.statuses).toHaveLength(1);
    expect((init.headers as Record<string, string>)["X-Hub-Signature-256"]).toBe(sign(String(init.body)));
  });

  it("rejects a bad signature before doing anything", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("https://hotel.example/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
        body: payload(),
      })
    );
    expect(res.status).toBe(401);
    expect(inserted).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not relay anything when no forward URL is configured", async () => {
    process.env.WHATSAPP_FORWARD_URL = "";
    const { POST } = await import("../route");
    const body = payload();
    const res = await POST(
      new Request("https://hotel.example/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
        body,
      })
    );
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    // Without forwarding, both senders are treated as guests (hotel inbox).
    expect(inserted.filter((i) => i.table === "messages")).toHaveLength(2);
  });
});
