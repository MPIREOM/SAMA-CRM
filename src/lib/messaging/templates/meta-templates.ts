// Meta message-template definitions for the guest messaging engine — what the
// back-office "Create templates" button submits to WhatsApp Manager. Bodies
// come from whatsapp-bodies.ts (the single source of truth, mirrored in
// docs/message-content.md); this file adds the language codes, the category
// per kind and the example values Meta requires for every {{n}} variable.
//
// Keep utility bodies strictly about the booking: Meta rejected an earlier
// confirmation that promised "directions and tips" as INCORRECT_CATEGORY
// (mixed utility + marketing content counts as marketing).
//
// Pure module — unit-tested against the builders' parameter counts.
import { MESSAGE_KINDS, MESSAGE_KIND_CATEGORY, type Locale, type MessageCategory, type MessageKind } from "../types";
import { DEFAULT_TEMPLATE_NAMES, TEMPLATE_PARAM_COUNT, WHATSAPP_BODIES } from "./whatsapp-bodies";

export const META_TEMPLATE_LOCALES: readonly Locale[] = ["en", "ar"];

/** Meta language codes per locale — must equal the `langCode` the dispatcher sends (locale as-is). */
export const META_LANGUAGE_CODES: Record<Locale, string> = { en: "en", ar: "ar" };

/** Sample values shown to Meta's reviewers, one per {{n}}, in order. */
export const TEMPLATE_EXAMPLES: Record<MessageKind, Record<Locale, string[]>> = {
  confirmation: {
    en: ["Ahmed Al Nabhani", "SAMA-26-K7P3QX", "Deluxe Room — Mountain & Sunset View", "Thu, 17 Sep 2026", "Sat, 19 Sep 2026", "2", "129.276"],
    ar: ["أحمد النبهاني", "SAMA-26-K7P3QX", "غرفة ديلوكس — إطلالة الجبل والغروب", "الخميس، 17 سبتمبر 2026", "السبت، 19 سبتمبر 2026", "2", "129.276"],
  },
  pre_arrival: {
    en: ["Ahmed Al Nabhani", "Thu, 17 Sep 2026", "https://maps.app.goo.gl/YC7RXydtYz61cFZj9"],
    ar: ["أحمد النبهاني", "الخميس، 17 سبتمبر 2026", "https://maps.app.goo.gl/YC7RXydtYz61cFZj9"],
  },
  post_stay: {
    en: ["Ahmed Al Nabhani", "https://g.page/r/sama-hotel/review"],
    ar: ["أحمد النبهاني", "https://g.page/r/sama-hotel/review"],
  },
};

export interface MetaTemplateDefinition {
  kind: MessageKind;
  locale: Locale;
  /** Template name in WhatsApp Manager (configurable in settings.messaging.whatsapp_templates). */
  name: string;
  /** Meta language code. */
  language: string;
  /** UTILITY for the operational messages, MARKETING for the post-stay offer (MESSAGE_KIND_CATEGORY). */
  category: MessageCategory;
  body: string;
  examples: string[];
}

/** All 3 kinds × 2 languages, using the configured (or default) template names. */
export function metaTemplateDefinitions(names: Partial<Record<MessageKind, string>> = {}): MetaTemplateDefinition[] {
  const out: MetaTemplateDefinition[] = [];
  for (const kind of MESSAGE_KINDS) {
    const name = (names[kind] || DEFAULT_TEMPLATE_NAMES[kind]).trim();
    for (const locale of META_TEMPLATE_LOCALES) {
      out.push({
        kind,
        locale,
        name,
        language: META_LANGUAGE_CODES[locale],
        category: MESSAGE_KIND_CATEGORY[kind],
        body: WHATSAPP_BODIES[kind][locale],
        examples: TEMPLATE_EXAMPLES[kind][locale],
      });
    }
  }
  return out;
}

/** Distinct {{n}} numbers in a body, in order of first appearance. */
export function placeholderNumbers(body: string): number[] {
  const seen: number[] = [];
  const re = /\{\{(\d+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** Meta's structural rules we can check offline; empty array = looks submittable. */
export function templateBodyIssues(def: Pick<MetaTemplateDefinition, "kind" | "body" | "examples" | "name">): string[] {
  const issues: string[] = [];
  const nums = placeholderNumbers(def.body);
  const expected = TEMPLATE_PARAM_COUNT[def.kind];
  if (nums.length !== expected) issues.push(`expected ${expected} variables, body has ${nums.length}`);
  if (nums.some((n, i) => n !== i + 1)) issues.push("variables must be numbered {{1}}..{{n}} in order");
  if (def.examples.length !== nums.length) issues.push(`expected ${nums.length} example values, got ${def.examples.length}`);
  if (def.body.length > 1024) issues.push(`body is ${def.body.length} characters (max 1024)`);
  if (/^\s*\{\{\d+\}\}/.test(def.body) || /\{\{\d+\}\}\s*$/.test(def.body)) issues.push("body must not start or end with a variable");
  if (!/^[a-z0-9_]{1,512}$/.test(def.name)) issues.push("name must be lowercase letters, digits and underscores");
  if (def.examples.some((e) => /[\n\t]/.test(e) || /\s{4,}/.test(e))) issues.push("examples must not contain line breaks or 4+ spaces");
  return issues;
}
