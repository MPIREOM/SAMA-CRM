// Meta message templates — the pure model shared by the Templates page (editor
// + preview), the campaign composer and the send path. No I/O here.
//
// Vocabulary
//   TemplateDraft        what the editor holds; converted to Meta "components"
//   MetaTemplateSummary  what Meta returns for an existing template
//   TemplateParamPlan    how a campaign fills a template's variables per guest
//
// Meta rules baked in (see developers.facebook.com → WhatsApp → Templates):
//   name ^[a-z0-9_]{1,512}$ · body ≤ 1024 chars, positional {{1}}..{{n}} with one
//   example each · text header ≤ 60 chars with at most one variable · footer ≤ 60
//   · up to 10 buttons: quick replies (≤ 25 chars), URL (≤ 2, may end in one
//   {{1}} suffix), phone number (≤ 1) · media headers need an upload handle.
import { placeholderNumbers } from "./templates/meta-templates";

export type MetaTemplateCategory = "MARKETING" | "UTILITY";
export type HeaderFormat = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type ButtonKind = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export const TEMPLATE_CATEGORIES: MetaTemplateCategory[] = ["MARKETING", "UTILITY"];
export const HEADER_FORMATS: HeaderFormat[] = ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"];
export const TEMPLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية (Arabic)" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
];

export interface TemplateButtonDraft {
  type: ButtonKind;
  text: string;
  url?: string;
  /** Example for a dynamic URL suffix ({{1}} at the end of `url`). */
  urlExample?: string;
  phone_number?: string;
}

export interface TemplateHeaderDraft {
  format: HeaderFormat;
  /** TEXT header text (may contain one {{1}}). */
  text: string;
  textExample: string;
  /** Media header: upload handle from Meta's resumable upload (creation) … */
  mediaHandle: string;
  /** … and the public URL of the same file (preview + default send-time media). */
  mediaUrl: string;
}

export interface TemplateDraft {
  name: string;
  language: string;
  category: MetaTemplateCategory;
  header: TemplateHeaderDraft;
  body: string;
  bodyExamples: string[];
  footer: string;
  buttons: TemplateButtonDraft[];
}

export function emptyDraft(): TemplateDraft {
  return {
    name: "",
    language: "en",
    category: "MARKETING",
    header: { format: "NONE", text: "", textExample: "", mediaHandle: "", mediaUrl: "" },
    body: "",
    bodyExamples: [],
    footer: "",
    buttons: [],
  };
}

// ---------------------------------------------------------------------------
// Meta component shapes (loose — Meta adds fields over time)
// ---------------------------------------------------------------------------
export interface MetaButton {
  type: string;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

export interface MetaComponent {
  type: string;
  format?: string;
  text?: string;
  example?: { header_text?: string[]; header_handle?: string[]; body_text?: string[][] };
  buttons?: MetaButton[];
}

export interface MetaTemplateSummary {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejectedReason: string | null;
  qualityScore: string | null;
  components: MetaComponent[];
}

export const EDITABLE_STATUSES = ["APPROVED", "REJECTED", "PAUSED"];

const NAME_RE = /^[a-z0-9_]{1,512}$/;

/** Body variables are positional: count distinct {{n}}. */
export function bodyVariableCount(body: string): number {
  return placeholderNumbers(body).length;
}

export function headerHasVariable(text: string): boolean {
  return /\{\{1\}\}/.test(text);
}

export function urlHasSuffix(url: string): boolean {
  return /\{\{1\}\}\s*$/.test(url);
}

/** Editor draft → the `components` array Meta expects on create/edit. */
export function draftToComponents(d: TemplateDraft): MetaComponent[] {
  const out: MetaComponent[] = [];
  const h = d.header;
  if (h.format === "TEXT") {
    out.push({
      type: "HEADER",
      format: "TEXT",
      text: h.text.trim(),
      ...(headerHasVariable(h.text) ? { example: { header_text: [h.textExample.trim()] } } : {}),
    });
  } else if (h.format !== "NONE") {
    out.push({ type: "HEADER", format: h.format, example: { header_handle: [h.mediaHandle.trim()] } });
  }
  const vars = bodyVariableCount(d.body);
  out.push({
    type: "BODY",
    text: d.body.trim(),
    ...(vars > 0 ? { example: { body_text: [d.bodyExamples.slice(0, vars).map((e) => e.trim())] } } : {}),
  });
  if (d.footer.trim()) out.push({ type: "FOOTER", text: d.footer.trim() });
  if (d.buttons.length > 0) {
    out.push({
      type: "BUTTONS",
      buttons: d.buttons.map((b) => {
        if (b.type === "URL") {
          const url = (b.url ?? "").trim();
          return { type: "URL", text: b.text.trim(), url, ...(urlHasSuffix(url) ? { example: [(b.urlExample ?? "").trim()] } : {}) };
        }
        if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: (b.phone_number ?? "").trim() };
        return { type: "QUICK_REPLY", text: b.text.trim() };
      }),
    });
  }
  return out;
}

/** Existing Meta template → editor draft (media handles are not returned by Meta; a re-upload is needed to change media). */
export function componentsToDraft(t: Pick<MetaTemplateSummary, "name" | "language" | "category" | "components">): TemplateDraft {
  const d = emptyDraft();
  d.name = t.name;
  d.language = t.language;
  d.category = t.category === "UTILITY" ? "UTILITY" : "MARKETING";
  for (const c of t.components) {
    const type = (c.type ?? "").toUpperCase();
    if (type === "HEADER") {
      const format = (c.format ?? "TEXT").toUpperCase() as HeaderFormat;
      d.header.format = HEADER_FORMATS.includes(format) ? format : "TEXT";
      d.header.text = c.text ?? "";
      d.header.textExample = c.example?.header_text?.[0] ?? "";
      d.header.mediaUrl = c.example?.header_handle?.[0]?.startsWith("http") ? c.example.header_handle[0] : "";
    } else if (type === "BODY") {
      d.body = c.text ?? "";
      d.bodyExamples = c.example?.body_text?.[0] ?? [];
    } else if (type === "FOOTER") {
      d.footer = c.text ?? "";
    } else if (type === "BUTTONS") {
      d.buttons = (c.buttons ?? []).map((b) => {
        const kind = (b.type ?? "").toUpperCase();
        if (kind === "URL") return { type: "URL", text: b.text ?? "", url: b.url ?? "", urlExample: b.example?.[0] ?? "" };
        if (kind === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text ?? "", phone_number: b.phone_number ?? "" };
        return { type: "QUICK_REPLY", text: b.text ?? "" };
      });
    }
  }
  const vars = bodyVariableCount(d.body);
  while (d.bodyExamples.length < vars) d.bodyExamples.push("");
  return d;
}

/** Everything we can check before talking to Meta. Empty = submittable. */
export function validateDraft(d: TemplateDraft): string[] {
  const issues: string[] = [];
  if (!NAME_RE.test(d.name)) issues.push("Name: lowercase letters, digits and underscores only (max 512).");
  if (!TEMPLATE_LANGUAGES.some((l) => l.code === d.language)) issues.push("Language: pick one of the supported codes.");
  if (!TEMPLATE_CATEGORIES.includes(d.category)) issues.push("Category must be MARKETING or UTILITY.");

  const h = d.header;
  if (h.format === "TEXT") {
    const text = h.text.trim();
    if (!text) issues.push("Header: text is empty.");
    if (text.length > 60) issues.push("Header: at most 60 characters.");
    const nums = placeholderNumbers(text);
    if (nums.length > 1 || (nums.length === 1 && nums[0] !== 1)) issues.push("Header: at most one variable, written {{1}}.");
    if (nums.length === 1 && !h.textExample.trim()) issues.push("Header: an example value for {{1}} is required.");
  } else if (h.format !== "NONE" && !h.mediaHandle.trim()) {
    issues.push("Header: upload the media file first (Meta needs a sample).");
  }

  const body = d.body.trim();
  if (!body) issues.push("Body: text is empty.");
  if (body.length > 1024) issues.push(`Body: ${body.length} characters (max 1024).`);
  const nums = placeholderNumbers(body);
  if (nums.some((n, i) => n !== i + 1)) issues.push("Body: variables must be numbered {{1}}, {{2}}, … in order.");
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*$/.test(body)) issues.push("Body: must not start or end with a variable.");
  for (let i = 0; i < nums.length; i++) {
    const ex = (d.bodyExamples[i] ?? "").trim();
    if (!ex) issues.push(`Body: example value for {{${i + 1}}} is required.`);
    else if (/[\n\t]/.test(ex) || /\s{4,}/.test(ex)) issues.push(`Body: example for {{${i + 1}}} must be a single line.`);
  }

  if (d.footer.trim().length > 60) issues.push("Footer: at most 60 characters.");

  if (d.buttons.length > 10) issues.push("Buttons: at most 10.");
  const urls = d.buttons.filter((b) => b.type === "URL");
  const phones = d.buttons.filter((b) => b.type === "PHONE_NUMBER");
  if (urls.length > 2) issues.push("Buttons: at most 2 website buttons.");
  if (phones.length > 1) issues.push("Buttons: at most 1 phone button.");
  d.buttons.forEach((b, i) => {
    const label = `Button ${i + 1}`;
    if (!b.text.trim()) issues.push(`${label}: label is empty.`);
    if (b.text.trim().length > 25) issues.push(`${label}: label at most 25 characters.`);
    if (b.type === "URL") {
      const url = (b.url ?? "").trim();
      if (!/^https?:\/\/\S+$/.test(url)) issues.push(`${label}: a full https:// address is required.`);
      if (urlHasSuffix(url) && !(b.urlExample ?? "").trim()) issues.push(`${label}: example for the {{1}} suffix is required.`);
    }
    if (b.type === "PHONE_NUMBER" && !/^\+?\d{7,15}$/.test((b.phone_number ?? "").replace(/[\s-]/g, ""))) {
      issues.push(`${label}: phone number must be international, e.g. +96877822559.`);
    }
  });
  return issues;
}

// ---------------------------------------------------------------------------
// Preview rendering (editor + campaign composer)
// ---------------------------------------------------------------------------
export interface RenderedTemplate {
  header: { kind: "text"; text: string } | { kind: "media"; format: HeaderFormat; url: string | null } | null;
  body: string;
  footer: string | null;
  buttons: { type: ButtonKind; text: string; url?: string; phone?: string }[];
}

function substitute(text: string, values: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (m, n: string) => {
    const v = values[Number(n) - 1];
    return v === undefined || v === "" ? m : v;
  });
}

/** Render a draft with its example values (or given values). */
export function renderDraft(d: TemplateDraft, values?: { header?: string; body?: string[]; buttonUrls?: Record<number, string>; mediaUrl?: string }): RenderedTemplate {
  const h = d.header;
  let header: RenderedTemplate["header"] = null;
  if (h.format === "TEXT") header = { kind: "text", text: substitute(h.text, [values?.header ?? h.textExample]) };
  else if (h.format !== "NONE") header = { kind: "media", format: h.format, url: values?.mediaUrl ?? (h.mediaUrl || null) };
  return {
    header,
    body: substitute(d.body, values?.body ?? d.bodyExamples),
    footer: d.footer.trim() ? d.footer : null,
    buttons: d.buttons.map((b, i) => ({
      type: b.type,
      text: b.text,
      ...(b.type === "URL" ? { url: substitute(b.url ?? "", [values?.buttonUrls?.[i] ?? b.urlExample ?? ""]) } : {}),
      ...(b.type === "PHONE_NUMBER" ? { phone: b.phone_number } : {}),
    })),
  };
}

export function renderMetaTemplate(t: MetaTemplateSummary, values?: Parameters<typeof renderDraft>[1]): RenderedTemplate {
  return renderDraft(componentsToDraft(t), values);
}

// ---------------------------------------------------------------------------
// Campaign parameter plans — how a template's variables are filled per guest
// ---------------------------------------------------------------------------
export type ParamField = "name" | "first_name" | "room_type" | "terms_link";
export const PARAM_FIELDS: ParamField[] = ["name", "first_name", "room_type", "terms_link"];
export type ParamSource = { kind: "text"; value: string } | { kind: "field"; field: ParamField };

export interface TemplateParamPlan {
  /** Value for a TEXT header's {{1}}. */
  headerText?: ParamSource;
  /** Public URL of the media sent as the header (image/video/document). */
  headerMediaUrl?: string;
  /** One source per body variable, in order. */
  body: ParamSource[];
  /** Dynamic URL suffixes by button index (0-based, as Meta numbers them). */
  buttonUrls: Record<string, ParamSource>;
}

export interface ParamContact {
  name: string | null;
  room_type?: string | null;
  terms_link: string;
}

export interface TemplateShape {
  headerFormat: HeaderFormat;
  headerVars: number;
  bodyVars: number;
  /** 0-based indexes of URL buttons whose url ends with {{1}}. */
  dynamicUrlButtons: number[];
  buttonCount: number;
}

export function templateShape(t: Pick<MetaTemplateSummary, "components">): TemplateShape {
  const shape: TemplateShape = { headerFormat: "NONE", headerVars: 0, bodyVars: 0, dynamicUrlButtons: [], buttonCount: 0 };
  for (const c of t.components) {
    const type = (c.type ?? "").toUpperCase();
    if (type === "HEADER") {
      const format = (c.format ?? "TEXT").toUpperCase() as HeaderFormat;
      shape.headerFormat = HEADER_FORMATS.includes(format) ? format : "TEXT";
      if (shape.headerFormat === "TEXT") shape.headerVars = headerHasVariable(c.text ?? "") ? 1 : 0;
    } else if (type === "BODY") {
      shape.bodyVars = bodyVariableCount(c.text ?? "");
    } else if (type === "BUTTONS") {
      const buttons = c.buttons ?? [];
      shape.buttonCount = buttons.length;
      buttons.forEach((b, i) => {
        if ((b.type ?? "").toUpperCase() === "URL" && urlHasSuffix(b.url ?? "")) shape.dynamicUrlButtons.push(i);
      });
    }
  }
  return shape;
}

/** A plan with every slot of the template filled with a sensible default. */
export function defaultPlan(shape: TemplateShape): TemplateParamPlan {
  return {
    ...(shape.headerVars > 0 ? { headerText: { kind: "text", value: "" } } : {}),
    body: Array.from({ length: shape.bodyVars }, (_v, i) => (i === 0 ? { kind: "field", field: "name" } : { kind: "text", value: "" })),
    buttonUrls: Object.fromEntries(shape.dynamicUrlButtons.map((i) => [String(i), { kind: "text", value: "" }])),
  };
}

/** Meta rejects parameters with line breaks or 4+ spaces; and empty text is invalid. */
export function cleanParamValue(value: string): string {
  const v = value.replace(/\s+/g, " ").trim();
  return v || "-";
}

export function resolveParam(source: ParamSource | undefined, contact: ParamContact): string {
  if (!source) return "-";
  if (source.kind === "text") return cleanParamValue(source.value);
  const name = (contact.name ?? "").trim();
  switch (source.field) {
    case "name":
      return cleanParamValue(name || "Guest");
    case "first_name":
      return cleanParamValue(name.split(/\s+/)[0] || "Guest");
    case "room_type":
      return cleanParamValue(contact.room_type ?? "");
    case "terms_link":
      return cleanParamValue(contact.terms_link);
    default:
      return "-";
  }
}

/** What is missing for a plan to be sendable with a given template. */
export function planIssues(shape: TemplateShape, plan: TemplateParamPlan): string[] {
  const issues: string[] = [];
  const empty = (s: ParamSource | undefined) => !s || (s.kind === "text" && !s.value.trim());
  if (shape.headerVars > 0 && empty(plan.headerText)) issues.push("Header variable is empty.");
  if (shape.headerFormat !== "NONE" && shape.headerFormat !== "TEXT" && !(plan.headerMediaUrl ?? "").trim()) {
    issues.push(`Upload the ${shape.headerFormat.toLowerCase()} for the header.`);
  }
  for (let i = 0; i < shape.bodyVars; i++) if (empty(plan.body[i])) issues.push(`Body variable {{${i + 1}}} is empty.`);
  for (const i of shape.dynamicUrlButtons) if (empty(plan.buttonUrls[String(i)])) issues.push(`Button ${i + 1}: link suffix is empty.`);
  return issues;
}

// ---------------------------------------------------------------------------
// Send-time payload (Messages API `template.components`) and ledger text
// ---------------------------------------------------------------------------
export type WaTemplateParameter =
  | { type: "text"; text: string }
  | { type: "image"; image: { link: string } }
  | { type: "video"; video: { link: string } }
  | { type: "document"; document: { link: string; filename?: string } };

export interface WaTemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "url" | "quick_reply";
  index?: string;
  parameters: WaTemplateParameter[];
}

export function buildSendComponents(t: Pick<MetaTemplateSummary, "components">, plan: TemplateParamPlan, contact: ParamContact): WaTemplateComponent[] {
  const shape = templateShape(t);
  const out: WaTemplateComponent[] = [];
  if (shape.headerFormat === "TEXT") {
    if (shape.headerVars > 0) out.push({ type: "header", parameters: [{ type: "text", text: resolveParam(plan.headerText, contact) }] });
  } else if (shape.headerFormat !== "NONE") {
    const link = (plan.headerMediaUrl ?? "").trim();
    const param: WaTemplateParameter =
      shape.headerFormat === "IMAGE"
        ? { type: "image", image: { link } }
        : shape.headerFormat === "VIDEO"
          ? { type: "video", video: { link } }
          : { type: "document", document: { link, filename: link.split("/").pop() || "document.pdf" } };
    out.push({ type: "header", parameters: [param] });
  }
  if (shape.bodyVars > 0) {
    out.push({
      type: "body",
      parameters: Array.from({ length: shape.bodyVars }, (_v, i) => ({ type: "text" as const, text: resolveParam(plan.body[i], contact) })),
    });
  }
  for (const i of shape.dynamicUrlButtons) {
    out.push({ type: "button", sub_type: "url", index: String(i), parameters: [{ type: "text", text: resolveParam(plan.buttonUrls[String(i)], contact) }] });
  }
  return out;
}

/** The message as the guest reads it — stored in the messages ledger / inbox. */
export function renderTemplateText(t: MetaTemplateSummary, plan: TemplateParamPlan, contact: ParamContact): string {
  const shape = templateShape(t);
  const rendered = renderMetaTemplate(t, {
    header: shape.headerVars > 0 ? resolveParam(plan.headerText, contact) : undefined,
    body: Array.from({ length: shape.bodyVars }, (_v, i) => resolveParam(plan.body[i], contact)),
    buttonUrls: Object.fromEntries(shape.dynamicUrlButtons.map((i) => [i, resolveParam(plan.buttonUrls[String(i)], contact)])),
    mediaUrl: plan.headerMediaUrl,
  });
  const parts: string[] = [];
  if (rendered.header?.kind === "text") parts.push(rendered.header.text);
  else if (rendered.header?.kind === "media") parts.push(`[${rendered.header.format.toLowerCase()}] ${rendered.header.url ?? ""}`.trim());
  parts.push(rendered.body);
  if (rendered.footer) parts.push(rendered.footer);
  for (const b of rendered.buttons) parts.push(b.type === "URL" ? `[${b.text}] ${b.url ?? ""}` : b.type === "PHONE_NUMBER" ? `[${b.text}] ${b.phone ?? ""}` : `[${b.text}]`);
  return parts.join("\n");
}

/**
 * Choose the language variant for a guest: an approved variant in the guest's
 * language first (Arabic guests → "ar"), then approved English, then anything
 * approved. Null when no variant is approved.
 */
export function pickTemplateLanguage(variants: MetaTemplateSummary[], contactLang: string | null | undefined): MetaTemplateSummary | null {
  const approved = variants.filter((v) => v.status === "APPROVED");
  if (approved.length === 0) return null;
  const wantAr = (contactLang ?? "").toLowerCase().startsWith("ar");
  const isAr = (v: MetaTemplateSummary) => v.language.toLowerCase().startsWith("ar");
  const isEn = (v: MetaTemplateSummary) => v.language.toLowerCase().startsWith("en");
  return (wantAr ? approved.find(isAr) : approved.find(isEn)) ?? approved.find(isEn) ?? approved.find(isAr) ?? approved[0];
}
