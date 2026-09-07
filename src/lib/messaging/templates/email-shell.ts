// Hand-built responsive email shell (600 px, inline styles, bilingual/RTL).
// Templates describe their content as blocks; the shell renders the same
// blocks to HTML and to plain text so the two versions never drift.
import type { Locale } from "../types";

export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string; muted?: boolean }
  | { type: "details"; rows: { label: string; value: string; ltr?: boolean }[] }
  | { type: "items"; rows: { label: string; value: string; total?: boolean; negative?: boolean }[] }
  | { type: "callout"; title: string; text?: string }
  | { type: "guide"; items: { emoji: string; title: string; text: string }[] }
  | { type: "buttons"; buttons: { label: string; url: string; secondary?: boolean }[] }
  | { type: "divider" }
  | {
      type: "contacts";
      title: string;
      phone: string;
      whatsapp: string;
      whatsappUrl: string;
      email: string;
      address: string;
      mapsLabel: string;
      mapsUrl: string;
    }
  | { type: "small"; text: string };

export interface EmailDocument {
  locale: Locale;
  title: string;
  preheader: string;
  blocks: Block[];
  footer: string[];
}

export const BRAND = {
  maroon: "#3b171b",
  crimson: "#841424",
  gold: "#c5a04f",
  goldSoft: "#f6efdc",
  ink: "#2e1215",
  muted: "#7a5a5e",
  line: "#e3cbce",
  cream: "#faf5f5",
  jabal: "#098e4b",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Tiny inline markup: **bold** → <strong>. Text is escaped first. */
function inline(value: string): string {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
}

function stripInline(value: string): string {
  return value.replace(/\*\*(.+?)\*\*/g, "$1");
}

function fontStack(locale: Locale): string {
  return locale === "ar"
    ? "'Tajawal','Nunito Sans','Segoe UI',Tahoma,Arial,sans-serif"
    : "'Nunito Sans','Nunito','Segoe UI',Tahoma,Arial,sans-serif";
}

function renderBlockHtml(block: Block, locale: Locale): string {
  const align = locale === "ar" ? "right" : "left";
  const end = locale === "ar" ? "left" : "right";
  const font = fontStack(locale);
  switch (block.type) {
    case "heading":
      return `<h1 style="margin:0 0 16px;font-family:${font};font-size:22px;line-height:1.35;font-weight:700;color:${BRAND.maroon};text-align:${align};">${inline(block.text)}</h1>`;
    case "paragraph":
      return `<p style="margin:0 0 14px;font-family:${font};font-size:15px;line-height:1.75;color:${block.muted ? BRAND.muted : BRAND.ink};text-align:${align};">${inline(block.text)}</p>`;
    case "details": {
      const rows = block.rows
        .map(
          (r) =>
            `<tr><td style="padding:7px 0;border-bottom:1px solid ${BRAND.line};font-family:${font};font-size:14px;color:${BRAND.muted};text-align:${align};vertical-align:top;width:40%;">${inline(r.label)}</td>` +
            `<td style="padding:7px 0;border-bottom:1px solid ${BRAND.line};font-family:${font};font-size:14px;font-weight:700;color:${BRAND.ink};text-align:${align};vertical-align:top;"${r.ltr ? ' dir="ltr"' : ""}>${inline(r.value)}</td></tr>`
        )
        .join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:collapse;">${rows}</table>`;
    }
    case "items": {
      const rows = block.rows
        .map((r) => {
          const weight = r.total ? "700" : "400";
          const size = r.total ? "17px" : "14px";
          const color = r.negative ? BRAND.jabal : r.total ? BRAND.maroon : BRAND.ink;
          const border = r.total ? `border-top:2px solid ${BRAND.gold};` : `border-bottom:1px solid ${BRAND.line};`;
          return (
            `<tr><td style="padding:8px 0;${border}font-family:${font};font-size:${size};font-weight:${weight};color:${color};text-align:${align};">${inline(r.label)}</td>` +
            `<td dir="ltr" style="padding:8px 0;${border}font-family:${font};font-size:${size};font-weight:${weight};color:${color};text-align:${end};white-space:nowrap;">${inline(r.value)}</td></tr>`
          );
        })
        .join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:collapse;">${rows}</table>`;
    }
    case "callout":
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;">` +
        `<tr><td style="background:${BRAND.goldSoft};border:2px solid ${BRAND.gold};border-radius:12px;padding:18px 20px;text-align:${align};">` +
        `<div style="font-family:${font};font-size:18px;line-height:1.4;font-weight:700;color:${BRAND.maroon};">${inline(block.title)}</div>` +
        (block.text
          ? `<div style="margin-top:6px;font-family:${font};font-size:14px;line-height:1.65;color:${BRAND.ink};">${inline(block.text)}</div>`
          : "") +
        `</td></tr></table>`
      );
    case "guide": {
      const items = block.items
        .map(
          (it) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid ${BRAND.line};vertical-align:top;width:36px;font-size:22px;line-height:1.3;text-align:center;">${escapeHtml(it.emoji)}</td>` +
            `<td style="padding:10px 0 10px 12px;border-bottom:1px solid ${BRAND.line};vertical-align:top;text-align:${align};${locale === "ar" ? "padding:10px 12px 10px 0;" : ""}">` +
            `<div style="font-family:${font};font-size:15px;font-weight:700;color:${BRAND.maroon};line-height:1.4;">${inline(it.title)}</div>` +
            `<div style="font-family:${font};font-size:14px;color:${BRAND.ink};line-height:1.65;margin-top:2px;">${inline(it.text)}</div></td></tr>`
        )
        .join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:collapse;">${items}</table>`;
    }
    case "buttons": {
      const cells = block.buttons
        .map((b) => {
          const style = b.secondary
            ? `background:#ffffff;color:${BRAND.maroon};border:2px solid ${BRAND.maroon};`
            : `background:${BRAND.maroon};color:${BRAND.gold};border:2px solid ${BRAND.maroon};`;
          return `<td style="padding:4px 6px 4px 0;"><a href="${escapeHtml(b.url)}" style="display:inline-block;${style}font-family:${font};font-size:15px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;">${inline(b.label)}</a></td>`;
        })
        .join("");
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;${locale === "ar" ? "margin-left:auto;" : ""}"><tr>${cells}</tr></table>`;
    }
    case "divider":
      return `<hr style="border:none;border-top:1px solid ${BRAND.line};margin:8px 0 20px;"/>`;
    case "contacts":
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr><td style="background:${BRAND.cream};border-radius:12px;padding:16px 18px;text-align:${align};">` +
        `<div style="font-family:${font};font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:${BRAND.gold};margin-bottom:8px;">${inline(block.title)}</div>` +
        `<div style="font-family:${font};font-size:14px;line-height:1.9;color:${BRAND.ink};">` +
        `☎️ <a href="tel:${escapeHtml(block.phone)}" dir="ltr" style="color:${BRAND.maroon};text-decoration:none;">${escapeHtml(block.phone)}</a><br/>` +
        `💬 <a href="${escapeHtml(block.whatsappUrl)}" dir="ltr" style="color:${BRAND.maroon};text-decoration:none;">WhatsApp ${escapeHtml(block.whatsapp)}</a><br/>` +
        `✉️ <a href="mailto:${escapeHtml(block.email)}" style="color:${BRAND.maroon};text-decoration:none;">${escapeHtml(block.email)}</a><br/>` +
        `📍 ${inline(block.address)} · <a href="${escapeHtml(block.mapsUrl)}" style="color:${BRAND.crimson};font-weight:700;">${inline(block.mapsLabel)}</a>` +
        `</div></td></tr></table>`
      );
    case "small":
      return `<p style="margin:8px 0 0;font-family:${font};font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:${align};">${inline(block.text)}</p>`;
  }
}

function renderBlockText(block: Block): string[] {
  switch (block.type) {
    case "heading":
      return [stripInline(block.text), ""];
    case "paragraph":
      return [stripInline(block.text), ""];
    case "details":
      return [...block.rows.map((r) => `${stripInline(r.label)}: ${stripInline(r.value)}`), ""];
    case "items":
      return [
        ...block.rows.map((r) => `${r.total ? "= " : "  "}${stripInline(r.label)}: ${stripInline(r.value)}`),
        "",
      ];
    case "callout":
      return [`*** ${stripInline(block.title)} ***`, ...(block.text ? [stripInline(block.text)] : []), ""];
    case "guide":
      return [...block.items.map((it) => `${it.emoji} ${stripInline(it.title)} — ${stripInline(it.text)}`), ""];
    case "buttons":
      return [...block.buttons.map((b) => `${stripInline(b.label)}: ${b.url}`), ""];
    case "divider":
      return ["----------------------------------------", ""];
    case "contacts":
      return [
        stripInline(block.title),
        `Tel: ${block.phone}`,
        `WhatsApp: ${block.whatsapp} (${block.whatsappUrl})`,
        `Email: ${block.email}`,
        `${stripInline(block.address)}`,
        `${stripInline(block.mapsLabel)}: ${block.mapsUrl}`,
        "",
      ];
    case "small":
      return [stripInline(block.text), ""];
  }
}

export function renderEmail(doc: EmailDocument): { html: string; text: string } {
  const { locale } = doc;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const font = fontStack(locale);
  const body = doc.blocks.map((b) => renderBlockHtml(b, locale)).join("\n");
  const footer = doc.footer.map((line) => inline(line)).join("<br/>");

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>${escapeHtml(doc.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;700&family=Tajawal:wght@400;700&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};" dir="${dir}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(doc.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="background:${BRAND.maroon};border-radius:14px 14px 0 0;padding:22px 24px;text-align:center;">
<span style="font-family:${font};color:${BRAND.gold};font-size:22px;font-weight:700;letter-spacing:1px;">SAMA HOTEL &nbsp;|&nbsp; فندق سما</span><br/>
<span style="font-family:${font};color:#e9d7a6;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Jabal Al Akhdar · Oman</span>
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 14px 14px;padding:30px 28px;color:${BRAND.ink};text-align:${align};" dir="${dir}">
${body}
</td></tr>
<tr><td style="padding:18px 8px 0;text-align:center;font-family:${font};font-size:12px;line-height:1.7;color:#a96e75;">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    ...doc.blocks.flatMap(renderBlockText),
    "--",
    ...doc.footer.map(stripInline),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
}
