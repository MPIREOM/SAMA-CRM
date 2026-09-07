import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyEmailError, classifyWhatsAppError, isSenderNotVerified, parseMetaCode } from "../providers/errors";

// The providers wrap server-only CRM modules; neutralise the marker package.
vi.mock("server-only", () => ({}));

// Resend SDK mock — controls what sendEmail (src/lib/email.ts) and the
// fallback path see.
const resendSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

import { sendGuestEmail, FALLBACK_SENDER } from "../providers/email";
import { sendWhatsApp } from "../providers/whatsapp";

function metaError(code: number, message: string, status = 400) {
  return new Response(JSON.stringify({ error: { message: `(#${code}) ${message}`, type: "OAuthException", code } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("classifyWhatsAppError (pure)", () => {
  it("parses the Meta code out of the message text", () => {
    expect(parseMetaCode("(#132001) Template name does not exist in the translation")).toBe(132001);
    expect(parseMetaCode("fetch failed")).toBeNull();
  });

  it("template problems are not retryable and name the template", () => {
    for (const code of [132001, 132000, 132012]) {
      const c = classifyWhatsAppError(`(#${code}) Template issue`, "sama_booking_confirmation", "ar");
      expect(c.retryable).toBe(false);
      expect(c.code).toBe(code);
      expect(c.reason).toContain("Template sama_booking_confirmation (ar) is not approved in Meta");
    }
  });

  it("recipient problems are not retryable", () => {
    for (const code of [131047, 131026, 131021]) {
      expect(classifyWhatsAppError(`(#${code}) Recipient issue`, "t", "en").retryable).toBe(false);
    }
  });

  it("rate limits, 5xx and network errors are retryable", () => {
    for (const code of [130429, 80007, 4]) {
      expect(classifyWhatsAppError(`(#${code}) Rate limit hit`, "t", "en").retryable).toBe(true);
    }
    expect(classifyWhatsAppError("WhatsApp API error (HTTP 503)", "t", "en").retryable).toBe(true);
    expect(classifyWhatsAppError("WhatsApp API error (HTTP 500)", "t", "en").retryable).toBe(true);
    expect(classifyWhatsAppError("fetch failed", "t", "en").retryable).toBe(true);
    expect(classifyWhatsAppError("connect ECONNRESET", "t", "en").retryable).toBe(true);
  });

  it("4xx without a known code is not retryable", () => {
    expect(classifyWhatsAppError("WhatsApp API error (HTTP 400)", "t", "en").retryable).toBe(false);
    expect(classifyWhatsAppError("(#190) Invalid OAuth access token", "t", "en").retryable).toBe(false);
  });
});

describe("classifyEmailError / isSenderNotVerified (pure)", () => {
  it("detects unverified sender/domain messages", () => {
    expect(isSenderNotVerified("The samahotel.net domain is not verified. Please, add and verify your domain")).toBe(true);
    expect(isSenderNotVerified("EMAIL_FROM is not configured (must be a verified Resend sender).")).toBe(true);
    expect(isSenderNotVerified("You can only send testing emails to your own email address")).toBe(true);
    expect(isSenderNotVerified("Too many requests")).toBe(false);
  });

  it("rate limits / 5xx / network are retryable, validation is not", () => {
    expect(classifyEmailError("Too many requests. Rate limit exceeded").retryable).toBe(true);
    expect(classifyEmailError("internal_server_error").retryable).toBe(true);
    expect(classifyEmailError("fetch failed").retryable).toBe(true);
    expect(classifyEmailError("validation_error: Invalid `to` field").retryable).toBe(false);
  });
});

describe("sendWhatsApp (mocked fetch)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "12345");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns stubbed when credentials are missing (nothing is fetched)", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "YOUR_META_PERMANENT_ACCESS_TOKEN");
    const r = await sendWhatsApp("+96899123456", "sama_booking_confirmation", "en", ["a"]);
    expect(r.stubbed).toBe(true);
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a successful send to ok + message id, with template payload", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [{ id: "wamid.HBg" }] }), { status: 200 })
    );
    const r = await sendWhatsApp("+96899123456", "sama_booking_confirmation", "en", ["Ahmed", "x\ny"]);
    expect(r).toMatchObject({ ok: true, stubbed: false, messageId: "wamid.HBg", retryable: false });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      to: string;
      template: { name: string; language: { code: string }; components: { parameters: { text: string }[] }[] };
    };
    expect(body.to).toBe("96899123456");
    expect(body.template.name).toBe("sama_booking_confirmation");
    expect(body.template.language.code).toBe("en");
    expect(body.template.components[0].parameters.map((p) => p.text)).toEqual(["Ahmed", "x y"]);
  });

  it("template not approved (132001) → not retryable with a clear reason", async () => {
    fetchMock.mockResolvedValueOnce(metaError(132001, "Template name does not exist in the translation"));
    const r = await sendWhatsApp("+96899123456", "sama_pre_arrival_guide", "ar", ["a", "b", "c"]);
    expect(r.ok).toBe(false);
    expect(r.stubbed).toBe(false);
    expect(r.retryable).toBe(false);
    expect(r.code).toBe(132001);
    expect(r.reason).toContain("Template sama_pre_arrival_guide (ar) is not approved in Meta");
  });

  it("parameter mismatch (132012) and re-engagement (131047) are not retryable", async () => {
    fetchMock.mockResolvedValueOnce(metaError(132012, "Parameter format does not match format in the created template"));
    expect((await sendWhatsApp("+96899123456", "t", "en", [])).retryable).toBe(false);
    fetchMock.mockResolvedValueOnce(metaError(131047, "Re-engagement message"));
    const r = await sendWhatsApp("+96899123456", "t", "en", []);
    expect(r.retryable).toBe(false);
    expect(r.code).toBe(131047);
  });

  it("rate limit (130429) and HTTP 5xx and network failures are retryable", async () => {
    fetchMock.mockResolvedValueOnce(metaError(130429, "Rate limit hit", 429));
    expect((await sendWhatsApp("+96899123456", "t", "en", [])).retryable).toBe(true);

    fetchMock.mockResolvedValueOnce(new Response("upstream down", { status: 502 }));
    const r = await sendWhatsApp("+96899123456", "t", "en", []);
    expect(r.retryable).toBe(true);
    expect(r.error).toContain("HTTP 502");

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await sendWhatsApp("+96899123456", "t", "en", [])).retryable).toBe(true);
  });
});

describe("sendGuestEmail (mocked Resend)", () => {
  beforeEach(() => {
    resendSend.mockReset();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Sama Hotel <noreply@samahotel.net>");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is stubbed when RESEND_API_KEY is missing or a placeholder", async () => {
    vi.stubEnv("RESEND_API_KEY", "YOUR_RESEND_API_KEY");
    const r = await sendGuestEmail("g@example.com", "s", "<p>h</p>", "t");
    expect(r.stubbed).toBe(true);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("sends through the CRM sendEmail on the happy path", async () => {
    resendSend.mockResolvedValueOnce({ data: { id: "em_1" }, error: null });
    const r = await sendGuestEmail("g@example.com", "Subject", "<p>h</p>", "t");
    expect(r).toMatchObject({ ok: true, messageId: "em_1", fallback_sender: false, stubbed: false });
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(resendSend.mock.calls[0][0]).toMatchObject({ from: "Sama Hotel <noreply@samahotel.net>", to: "g@example.com" });
  });

  it("retries once from the fallback sender when the domain is not verified", async () => {
    resendSend
      .mockResolvedValueOnce({ data: null, error: { message: "The samahotel.net domain is not verified.", name: "validation_error" } })
      .mockResolvedValueOnce({ data: { id: "em_2" }, error: null });
    const r = await sendGuestEmail("g@example.com", "Subject", "<p>h</p>", "plain");
    expect(r.ok).toBe(true);
    expect(r.fallback_sender).toBe(true);
    expect(r.messageId).toBe("em_2");
    expect(resendSend).toHaveBeenCalledTimes(2);
    expect(resendSend.mock.calls[1][0]).toMatchObject({ from: FALLBACK_SENDER, text: "plain" });
  });

  it("classifies a hard failure as not retryable and a rate limit as retryable", async () => {
    resendSend.mockResolvedValueOnce({ data: null, error: { message: "Invalid `to` field", name: "validation_error" } });
    const bad = await sendGuestEmail("nope", "s", "h", "t");
    expect(bad.ok).toBe(false);
    expect(bad.retryable).toBe(false);
    expect(bad.fallback_sender).toBe(false);

    resendSend.mockResolvedValueOnce({ data: null, error: { message: "Too many requests", name: "rate_limit_exceeded" } });
    const limited = await sendGuestEmail("g@example.com", "s", "h", "t");
    expect(limited.retryable).toBe(true);
  });
});
