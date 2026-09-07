import { describe, expect, it } from "vitest";
import {
  buildMessage,
  DEFAULT_TEMPLATE_NAMES,
  renderPreview,
  sampleContext,
  SAMPLE_SETTINGS,
  TEMPLATE_PARAM_COUNT,
  WHATSAPP_BODIES,
} from "../templates";
import type { Locale, MessageKind } from "../types";
import { MESSAGE_KINDS } from "../types";

const LOCALES: Locale[] = ["en", "ar"];
const ARABIC_INDIC = /[٠-٩۰-۹]/;

function withReviews(google: string, tripadvisor: string) {
  return { ...SAMPLE_SETTINGS, reviews: { google, tripadvisor } };
}

describe("WhatsApp template parameters", () => {
  for (const kind of MESSAGE_KINDS) {
    for (const locale of LOCALES) {
      it(`${kind} (${locale}) has exactly ${TEMPLATE_PARAM_COUNT[kind]} params, no newlines, Latin digits`, () => {
        const { whatsapp } = buildMessage(kind, sampleContext(locale), locale);
        expect(whatsapp.templateName).toBe(DEFAULT_TEMPLATE_NAMES[kind]);
        expect(whatsapp.langCode).toBe(locale);
        expect(whatsapp.params).toHaveLength(TEMPLATE_PARAM_COUNT[kind]);
        for (const p of whatsapp.params) {
          expect(p.length).toBeGreaterThan(0);
          expect(p).not.toMatch(/[\n\r\t]/);
          expect(p).not.toMatch(/ {4,}/);
          expect(p).not.toMatch(ARABIC_INDIC);
        }
        // The body has as many placeholders as we pass params.
        const placeholders = WHATSAPP_BODIES[kind][locale].match(/\{\{\d+\}\}/g) ?? [];
        expect(new Set(placeholders).size).toBe(TEMPLATE_PARAM_COUNT[kind]);
        expect(whatsapp.body).not.toMatch(/\{\{\d+\}\}/);
      });
    }
  }

  it("confirmation params are in the contractual order (name, ref, room, in, out, nights, total)", () => {
    const ctx = sampleContext("en");
    const { whatsapp } = buildMessage("confirmation", ctx, "en");
    expect(whatsapp.params).toEqual([
      "Ahmed Al Nabhani",
      "SAMA-26-K7P3QX",
      "Deluxe Room — Mountain & Sunset View",
      "Thu, 17 Sep 2026",
      "Sat, 19 Sep 2026",
      "2",
      "155.232",
    ]);
    expect(whatsapp.body).toContain("Total: OMR 155.232 — payable at the hotel");
  });

  it("confirmation (ar) uses the Arabic room name and an Arabic long date with Latin digits", () => {
    const ctx = sampleContext("ar");
    const { whatsapp } = buildMessage("confirmation", ctx, "ar");
    expect(whatsapp.params[2]).toBe("غرفة ديلوكس بإطلالة على الجبل");
    expect(whatsapp.params[3]).toMatch(/2026/);
    expect(whatsapp.params[3]).toMatch(/سبتمبر/);
    expect(whatsapp.params[6]).toBe("155.232");
  });

  it("pre-arrival params are (name, check-in date, maps link)", () => {
    const { whatsapp } = buildMessage("pre_arrival", sampleContext("en"), "en");
    expect(whatsapp.params[0]).toBe("Ahmed Al Nabhani");
    expect(whatsapp.params[1]).toBe("Thu, 17 Sep 2026");
    expect(whatsapp.params[2]).toBe(SAMPLE_SETTINGS.contact.maps_link);
  });

  it("post-stay review link falls back Google → TripAdvisor → website, never empty", () => {
    const g = buildMessage("post_stay", sampleContext("en", withReviews("https://g.page/r/x/review", "https://ta/y")), "en");
    expect(g.whatsapp.params).toEqual(["Ahmed Al Nabhani", "https://g.page/r/x/review"]);

    const t = buildMessage("post_stay", sampleContext("en", withReviews("", "https://ta/y")), "en");
    expect(t.whatsapp.params[1]).toBe("https://ta/y");

    const w = buildMessage("post_stay", sampleContext("en", withReviews("  ", "")), "en");
    expect(w.whatsapp.params[1]).toBe(SAMPLE_SETTINGS.contact.website);
    expect(w.whatsapp.params[1].length).toBeGreaterThan(0);
  });

  it("honours template names from settings", () => {
    const settings = {
      ...SAMPLE_SETTINGS,
      messaging: {
        ...SAMPLE_SETTINGS.messaging,
        whatsapp_templates: { confirmation: "custom_conf", pre_arrival: "custom_pre", post_stay: "custom_post" },
      },
    };
    expect(buildMessage("confirmation", sampleContext("en", settings), "en").whatsapp.templateName).toBe("custom_conf");
    expect(buildMessage("pre_arrival", sampleContext("en", settings), "en").whatsapp.templateName).toBe("custom_pre");
    expect(buildMessage("post_stay", sampleContext("en", settings), "en").whatsapp.templateName).toBe("custom_post");
  });

  it("collapses whitespace inside a guest name so Meta accepts it", () => {
    const ctx = sampleContext("en");
    ctx.booking.guest_name = "  Ahmed \n  Al   Nabhani\t";
    const { whatsapp } = buildMessage("confirmation", ctx, "en");
    expect(whatsapp.params[0]).toBe("Ahmed Al Nabhani");
  });
});

describe("Emails", () => {
  for (const locale of LOCALES) {
    it(`confirmation email (${locale}) carries ref, total, pay-at-hotel, manage link, dir/lang`, () => {
      const ctx = sampleContext(locale);
      const { email } = buildMessage("confirmation", ctx, locale);
      expect(email.subject).toContain("SAMA-26-K7P3QX");
      expect(email.html).toContain("SAMA-26-K7P3QX");
      expect(email.html).toContain("155.232");
      expect(email.html).toContain(`lang="${locale}"`);
      expect(email.html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
      expect(email.html).toContain("#3b171b");
      expect(email.html).toContain("SAMA HOTEL &nbsp;|&nbsp; فندق سما");
      expect(email.html).toContain(ctx.links.manage);
      expect(email.html).toContain("/manage?token=");
      expect(email.html).toContain(SAMPLE_SETTINGS.contact.maps_link);
      expect(email.text).toContain("SAMA-26-K7P3QX");
      expect(email.text).toContain("155.232");
      if (locale === "en") {
        expect(email.html).toContain("Pay at the hotel");
        expect(email.text).toContain("Pay at the hotel");
        expect(email.html).toContain("Service charge 8 %");
        expect(email.html).toContain("Tourism fee 4 %");
        expect(email.html).toContain("VAT 5 %");
        expect(email.html).toContain(SAMPLE_SETTINGS.cancellation.policy_en);
      } else {
        expect(email.html).toContain("الدفع في الفندق");
        expect(email.html).toContain(SAMPLE_SETTINGS.cancellation.policy_ar);
      }
    });
  }

  it("confirmation email shows the discount line only when there is one", () => {
    const ctx = sampleContext("en");
    expect(buildMessage("confirmation", ctx, "en").email.html).not.toContain("Discount");
    ctx.booking.discount_omr = 13.2;
    ctx.booking.promo_code = "SAMA10";
    const { email } = buildMessage("confirmation", ctx, "en");
    expect(email.html).toContain("Discount (SAMA10)");
    expect(email.html).toContain("13.200");
  });

  it("pre-arrival email has the 5-point guide and directions button", () => {
    const { email } = buildMessage("pre_arrival", sampleContext("en"), "en");
    for (const s of ["4WD is mandatory", "Birkat Al Mouz", "warm layers", "Fuel up", "Directions", "The Peek", "2:00 PM"]) {
      expect(email.html).toContain(s);
    }
    expect(email.html).toContain(`href="${SAMPLE_SETTINGS.contact.maps_link}"`);
    expect(email.text).toContain(SAMPLE_SETTINGS.contact.maps_link);
  });

  it("post-stay email has review button(s) and the SAMA10 code", () => {
    const one = buildMessage("post_stay", sampleContext("en", withReviews("https://g/x", "")), "en").email.html;
    expect(one).toContain("SAMA10");
    expect(one).toContain('href="https://g/x"');
    expect(one).not.toContain("TripAdvisor");

    const both = buildMessage("post_stay", sampleContext("en", withReviews("https://g/x", "https://ta/y")), "en").email.html;
    expect(both).toContain('href="https://g/x"');
    expect(both).toContain('href="https://ta/y"');
  });

  it("escapes HTML in guest-supplied text", () => {
    const ctx = sampleContext("en");
    ctx.booking.guest_name = "<script>alert(1)</script>";
    const { email } = buildMessage("confirmation", ctx, "en");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("renderPreview", () => {
  const kinds: MessageKind[] = ["confirmation", "pre_arrival", "post_stay"];
  for (const kind of kinds) {
    it(`renders ${kind} for both channels and locales`, () => {
      for (const locale of LOCALES) {
        const w = renderPreview(kind, "whatsapp", locale);
        expect(w.channel).toBe("whatsapp");
        if (w.channel === "whatsapp") {
          expect(w.params).toHaveLength(TEMPLATE_PARAM_COUNT[kind]);
          expect(w.body.length).toBeGreaterThan(20);
        }
        const e = renderPreview(kind, "email", locale);
        expect(e.channel).toBe("email");
        if (e.channel === "email") {
          expect(e.subject.length).toBeGreaterThan(5);
          expect(e.html).toContain("<!doctype html>");
          expect(e.text.length).toBeGreaterThan(50);
        }
      }
    });
  }
});
