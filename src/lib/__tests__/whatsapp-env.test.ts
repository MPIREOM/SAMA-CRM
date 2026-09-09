import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseForwardSenders, toSenderId, whatsappEnv, webhookCallbackUrl } from "../whatsapp-env";

describe("parseForwardSenders", () => {
  it("accepts commas, semicolons and line breaks; keeps spaces inside a number", () => {
    expect(parseForwardSenders("96877332220, +968 9947 5688;\n00968 2250 7681")).toEqual(["96877332220", "96899475688", "0096822507681"]);
  });
  it("drops fragments and duplicates", () => {
    expect(parseForwardSenders("+968, 96877332220, 968-7733-2220, abc")).toEqual(["96877332220"]);
    expect(parseForwardSenders("")).toEqual([]);
    expect(parseForwardSenders(undefined)).toEqual([]);
  });
  it("normalises like Meta's wa_id", () => {
    expect(toSenderId("+968 7733 2220")).toBe("96877332220");
  });
});

describe("whatsappEnv", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env };
  });
  afterEach(() => {
    process.env = env;
  });

  it("accepts the SAAS name for the verify token and ignores placeholders", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "YOUR_RANDOM_WEBHOOK_VERIFY_TOKEN";
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "shared-token";
    expect(whatsappEnv().verifyToken).toBe("shared-token");
    process.env.WHATSAPP_VERIFY_TOKEN = "own-token";
    expect(whatsappEnv().verifyToken).toBe("own-token");
  });

  it("trims a trailing slash off the forward URL and derives the callback URL from NEXT_PUBLIC_APP_URL", () => {
    process.env.WHATSAPP_FORWARD_URL = "https://saas.example/api/webhooks/whatsapp/";
    process.env.NEXT_PUBLIC_APP_URL = "https://book.samahotel.net/";
    expect(whatsappEnv().forwardUrl).toBe("https://saas.example/api/webhooks/whatsapp");
    expect(webhookCallbackUrl()).toBe("https://book.samahotel.net/api/webhooks/whatsapp");
  });
});

describe("withStoredBusinessAccountId", () => {
  it("uses the saved id when the variable is unset, cleaning formatting", async () => {
    const { withStoredBusinessAccountId } = await import("../whatsapp-env");
    const env = whatsappEnv();
    expect(withStoredBusinessAccountId({ ...env, businessAccountId: null }, " 1234 5678 9012 ").businessAccountId).toBe("123456789012");
    expect(withStoredBusinessAccountId({ ...env, businessAccountId: null }, "12").businessAccountId).toBeNull();
    expect(withStoredBusinessAccountId({ ...env, businessAccountId: null }, "").businessAccountId).toBeNull();
  });
  it("lets the environment variable win", async () => {
    const { withStoredBusinessAccountId } = await import("../whatsapp-env");
    const env = { ...whatsappEnv(), businessAccountId: "999" };
    expect(withStoredBusinessAccountId(env, "123456789012").businessAccountId).toBe("999");
  });
});
