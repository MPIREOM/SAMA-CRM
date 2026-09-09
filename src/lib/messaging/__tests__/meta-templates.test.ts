import { describe, expect, it } from "vitest";
import { MESSAGE_KINDS } from "../types";
import { metaTemplateDefinitions, placeholderNumbers, templateBodyIssues, META_LANGUAGE_CODES } from "../templates/meta-templates";
import { DEFAULT_TEMPLATE_NAMES, TEMPLATE_PARAM_COUNT, WHATSAPP_BODIES } from "../templates/whatsapp-bodies";

describe("meta template definitions", () => {
  const defs = metaTemplateDefinitions();

  it("covers every kind in both languages with unique name+language pairs", () => {
    expect(defs).toHaveLength(MESSAGE_KINDS.length * 2);
    const keys = new Set(defs.map((d) => `${d.name}:${d.language}`));
    expect(keys.size).toBe(defs.length);
    // Post-stay carries the returning-guest offer → Meta classifies it as marketing.
    for (const d of defs) expect(d.category).toBe(d.kind === "post_stay" ? "MARKETING" : "UTILITY");
  });

  it("uses the default names unless overridden", () => {
    expect(defs.find((d) => d.kind === "confirmation")!.name).toBe(DEFAULT_TEMPLATE_NAMES.confirmation);
    const custom = metaTemplateDefinitions({ post_stay: "sama_review_v2" });
    expect(custom.filter((d) => d.kind === "post_stay").every((d) => d.name === "sama_review_v2")).toBe(true);
  });

  it("has the contractual number of variables, numbered in order, with one example each", () => {
    for (const d of defs) {
      const nums = placeholderNumbers(d.body);
      expect(nums).toEqual(Array.from({ length: TEMPLATE_PARAM_COUNT[d.kind] }, (_v, i) => i + 1));
      expect(d.examples).toHaveLength(nums.length);
      expect(templateBodyIssues(d)).toEqual([]);
    }
  });

  it("sends the exact bodies the dispatcher renders for the inbox", () => {
    for (const d of defs) expect(d.body).toBe(WHATSAPP_BODIES[d.kind][d.locale]);
  });

  it("language codes equal the locale the dispatcher passes as langCode", () => {
    expect(META_LANGUAGE_CODES).toEqual({ en: "en", ar: "ar" });
  });

  it("flags structural problems Meta would reject", () => {
    expect(templateBodyIssues({ kind: "post_stay", name: "Bad Name", body: "{{1}} hi {{2}}", examples: ["a"] })).toEqual(
      expect.arrayContaining([expect.stringContaining("example"), expect.stringContaining("start or end"), expect.stringContaining("lowercase")])
    );
    expect(templateBodyIssues({ kind: "post_stay", name: "ok_name", body: "Hi {{2}} and {{1}} bye", examples: ["a", "b"] })).toEqual([
      "variables must be numbered {{1}}..{{n}} in order",
    ]);
  });
});
