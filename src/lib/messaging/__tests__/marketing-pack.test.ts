import { describe, expect, it } from "vitest";
import { draftToComponents, validateDraft } from "../meta-template-model";
import { MARKETING_PACK, MARKETING_PACK_NAMES, marketingPackDraft, marketingPackHeaderUrl } from "../templates/marketing-pack";

describe("marketing template pack", () => {
  it("has four templates, each in en + ar, with unique lowercase names", () => {
    expect(MARKETING_PACK).toHaveLength(4);
    expect(new Set(MARKETING_PACK_NAMES).size).toBe(4);
    for (const t of MARKETING_PACK) {
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
      expect(t.variants.map((v) => v.language).sort()).toEqual(["ar", "en"]);
      expect(t.headerImage).toMatch(/^\/images\/marketing\/[a-z-]+\.jpg$/);
    }
  });

  it("every variant is a submittable draft once the media handle is known", () => {
    for (const t of MARKETING_PACK) {
      for (const v of t.variants) {
        const d = marketingPackDraft(t, v, "4::handle", `https://sama-crm.vercel.app${t.headerImage}`);
        expect(validateDraft(d), `${t.name}/${v.language}`).toEqual([]);
        expect(d.category).toBe("MARKETING");
        expect(d.footer.length).toBeLessThanOrEqual(60);
        expect(d.buttons).toEqual([{ type: "URL", text: v.buttonText, url: `https://sama-crm.vercel.app/${v.language}` }]);
      }
    }
  });

  it("bodies start and end with text, carry no offer, and {{1}} is the first name", () => {
    for (const t of MARKETING_PACK) {
      for (const v of t.variants) {
        expect(v.body).not.toMatch(/^\s*\{\{\d+\}\}/);
        expect(v.body).not.toMatch(/\{\{\d+\}\}\s*$/);
        expect(v.body).not.toMatch(/SAMA10|%|٪|discount|خصم/i);
        expect(v.body).toContain("{{1}}");
        expect(v.examples[0]).toMatch(/Ahmed|أحمد/);
      }
    }
  });

  it("builds Meta components with an IMAGE header sample, footer and one URL button", () => {
    const t = MARKETING_PACK[0];
    const c = draftToComponents(marketingPackDraft(t, t.variants[0], "4::abc", "https://x/img.jpg"));
    expect(c.map((x) => x.type)).toEqual(["HEADER", "BODY", "FOOTER", "BUTTONS"]);
    expect(c[0]).toEqual({ type: "HEADER", format: "IMAGE", example: { header_handle: ["4::abc"] } });
    expect(c[1].example?.body_text).toEqual([["Ahmed"]]);
    expect(c[3].buttons).toEqual([{ type: "URL", text: "Book now", url: "https://sama-crm.vercel.app/en" }]);
  });

  it("hotel_news takes the announcement as {{2}}", () => {
    const news = MARKETING_PACK.find((t) => t.name === "sama_hotel_news")!;
    for (const v of news.variants) {
      expect(v.body).toContain("{{2}}");
      expect(v.examples).toHaveLength(2);
    }
  });

  it("resolves the header photo URL on the deployment for the composer", () => {
    expect(marketingPackHeaderUrl("sama_escape_the_heat", "https://sama-crm.vercel.app/")).toBe("https://sama-crm.vercel.app/images/marketing/escape-the-heat.jpg");
    expect(marketingPackHeaderUrl("something_else", "https://sama-crm.vercel.app")).toBeNull();
  });
});
