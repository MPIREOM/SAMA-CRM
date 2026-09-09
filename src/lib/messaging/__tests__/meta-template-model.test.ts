import { describe, expect, it } from "vitest";
import {
  buildSendComponents,
  componentsToDraft,
  defaultPlan,
  draftToComponents,
  emptyDraft,
  pickTemplateLanguage,
  planIssues,
  renderDraft,
  renderTemplateText,
  resolveParam,
  templateShape,
  validateDraft,
  type MetaTemplateSummary,
  type TemplateDraft,
} from "../meta-template-model";

function offerDraft(): TemplateDraft {
  return {
    ...emptyDraft(),
    name: "eid_weekend_offer",
    language: "en",
    category: "MARKETING",
    header: { format: "IMAGE", text: "", textExample: "", mediaHandle: "4::abc", mediaUrl: "https://cdn.example/eid.jpg" },
    body: "Hi {{1}}, Eid weekend at Sama Hotel: {{2}} off every room until {{3}}.",
    bodyExamples: ["Ahmed", "15%", "20 June"],
    footer: "Reply STOP to unsubscribe",
    buttons: [
      { type: "URL", text: "Book now", url: "https://sama-crm.vercel.app/en?promo={{1}}", urlExample: "EID15" },
      { type: "QUICK_REPLY", text: "Not interested" },
    ],
  };
}

describe("draft ↔ Meta components", () => {
  it("builds the create payload with examples, media handle, footer and buttons", () => {
    const c = draftToComponents(offerDraft());
    expect(c.map((x) => x.type)).toEqual(["HEADER", "BODY", "FOOTER", "BUTTONS"]);
    expect(c[0]).toEqual({ type: "HEADER", format: "IMAGE", example: { header_handle: ["4::abc"] } });
    expect(c[1].example).toEqual({ body_text: [["Ahmed", "15%", "20 June"]] });
    expect(c[3].buttons?.[0]).toEqual({ type: "URL", text: "Book now", url: "https://sama-crm.vercel.app/en?promo={{1}}", example: ["EID15"] });
    expect(c[3].buttons?.[1]).toEqual({ type: "QUICK_REPLY", text: "Not interested" });
  });

  it("omits examples when there are no variables and omits empty footer/buttons", () => {
    const d = { ...emptyDraft(), name: "plain", body: "Hello there." };
    expect(draftToComponents(d)).toEqual([{ type: "BODY", text: "Hello there." }]);
  });

  it("round-trips an existing template into an editable draft", () => {
    const t: MetaTemplateSummary = {
      id: "1",
      name: "eid_weekend_offer",
      language: "ar",
      status: "APPROVED",
      category: "MARKETING",
      rejectedReason: null,
      qualityScore: "GREEN",
      components: draftToComponents({ ...offerDraft(), language: "ar" }),
    };
    const d = componentsToDraft(t);
    expect(d.name).toBe("eid_weekend_offer");
    expect(d.header.format).toBe("IMAGE");
    expect(d.bodyExamples).toEqual(["Ahmed", "15%", "20 June"]);
    expect(d.footer).toBe("Reply STOP to unsubscribe");
    expect(d.buttons[0]).toMatchObject({ type: "URL", urlExample: "EID15" });
    expect(d.buttons[1]).toMatchObject({ type: "QUICK_REPLY" });
  });
});

describe("validateDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateDraft(offerDraft())).toEqual([]);
  });

  it("flags Meta's structural rules", () => {
    const d = offerDraft();
    d.name = "Bad Name";
    d.body = "{{2}} first " + "x".repeat(1030);
    d.bodyExamples = [];
    d.footer = "f".repeat(61);
    d.buttons = [
      { type: "URL", text: "", url: "sama.com" },
      { type: "URL", text: "a", url: "https://a" },
      { type: "URL", text: "b", url: "https://b" },
      { type: "PHONE_NUMBER", text: "call", phone_number: "12" },
    ];
    const issues = validateDraft(d);
    expect(issues.join("\n")).toMatch(/Name:/);
    expect(issues.join("\n")).toMatch(/max 1024/);
    expect(issues.join("\n")).toMatch(/numbered/);
    expect(issues.join("\n")).toMatch(/start or end/);
    expect(issues.join("\n")).toMatch(/Footer/);
    expect(issues.join("\n")).toMatch(/at most 2 website/);
    expect(issues.join("\n")).toMatch(/label is empty/);
    expect(issues.join("\n")).toMatch(/full https/);
    expect(issues.join("\n")).toMatch(/international/);
  });

  it("requires a media handle for media headers and examples for header variables", () => {
    const d = offerDraft();
    d.header.mediaHandle = "";
    expect(validateDraft(d)).toContain("Header: upload the media file first (Meta needs a sample).");
    d.header = { format: "TEXT", text: "Our {{1}} is on!", textExample: "", mediaHandle: "", mediaUrl: "" };
    expect(validateDraft(d)).toContain("Header: an example value for {{1}} is required.");
  });
});

describe("preview + send payload", () => {
  const t: MetaTemplateSummary = {
    id: "9",
    name: "eid_weekend_offer",
    language: "en",
    status: "APPROVED",
    category: "MARKETING",
    rejectedReason: null,
    qualityScore: null,
    components: draftToComponents(offerDraft()),
  };
  const contact = { name: "Fatma Al Busaidi", room_type: "Chalet", terms_link: "https://sama-crm.vercel.app/terms" };

  it("describes the template's slots", () => {
    expect(templateShape(t)).toEqual({ headerFormat: "IMAGE", headerVars: 0, bodyVars: 3, dynamicUrlButtons: [0], buttonCount: 2 });
  });

  it("renders a draft with its examples", () => {
    const r = renderDraft(offerDraft());
    expect(r.body).toBe("Hi Ahmed, Eid weekend at Sama Hotel: 15% off every room until 20 June.");
    expect(r.buttons[0].url).toBe("https://sama-crm.vercel.app/en?promo=EID15");
    expect(r.header).toEqual({ kind: "media", format: "IMAGE", url: "https://cdn.example/eid.jpg" });
  });

  it("builds Messages API components per guest from a plan", () => {
    const shape = templateShape(t);
    const plan = defaultPlan(shape);
    expect(planIssues(shape, plan)).toEqual(expect.arrayContaining(["Upload the image for the header.", "Body variable {{2}} is empty."]));
    plan.headerMediaUrl = "https://cdn.example/eid.jpg";
    plan.body = [{ kind: "field", field: "first_name" }, { kind: "text", value: "15%" }, { kind: "text", value: "20 June" }];
    plan.buttonUrls = { "0": { kind: "text", value: "EID15" } };
    expect(planIssues(shape, plan)).toEqual([]);
    const c = buildSendComponents(t, plan, contact);
    expect(c).toEqual([
      { type: "header", parameters: [{ type: "image", image: { link: "https://cdn.example/eid.jpg" } }] },
      { type: "body", parameters: [{ type: "text", text: "Fatma" }, { type: "text", text: "15%" }, { type: "text", text: "20 June" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "EID15" }] },
    ]);
    expect(renderTemplateText(t, plan, contact)).toContain("Hi Fatma, Eid weekend at Sama Hotel: 15% off every room until 20 June.");
    expect(renderTemplateText(t, plan, contact)).toContain("[Book now] https://sama-crm.vercel.app/en?promo=EID15");
  });

  it("resolves guest fields safely", () => {
    expect(resolveParam({ kind: "field", field: "name" }, { name: "  ", terms_link: "x" })).toBe("Guest");
    expect(resolveParam({ kind: "text", value: "a\n\nb    c" }, contact)).toBe("a b c");
    expect(resolveParam({ kind: "text", value: "" }, contact)).toBe("-");
    expect(resolveParam(undefined, contact)).toBe("-");
  });

  it("picks the guest's language with sensible fallbacks", () => {
    const en = { ...t, language: "en" };
    const ar = { ...t, id: "10", language: "ar" };
    const pendingAr = { ...ar, status: "PENDING" };
    expect(pickTemplateLanguage([en, ar], "ar")?.language).toBe("ar");
    expect(pickTemplateLanguage([en, ar], "en")?.language).toBe("en");
    expect(pickTemplateLanguage([en, pendingAr], "ar")?.language).toBe("en");
    expect(pickTemplateLanguage([pendingAr], "ar")).toBeNull();
  });
});
