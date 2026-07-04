import "server-only";

import { Resend } from "resend";

// Resend email helper with RTL-aware bilingual layout. SERVER ONLY.

interface EmailResult {
  ok: boolean;
  messageId: string | null;
  error: string | null;
}

function emailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY;
  return Boolean(key && !key.startsWith("YOUR_"));
}

/**
 * Bilingual HTML shell: Arabic section rendered RTL (Tajawal-style stack),
 * divider, English section LTR. `arabicBody`/`englishBody` are plain text —
 * newlines become <br/>.
 */
export function bilingualEmailHtml(arabicBody: string, englishBody: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf5f5;">
    <div style="max-width:600px;margin:0 auto;padding:24px;font-family:'Tajawal','Nunito Sans',Tahoma,Arial,sans-serif;">
      <div style="background:#3b171b;border-radius:12px 12px 0 0;padding:20px;text-align:center;">
        <span style="color:#c5a04f;font-size:22px;font-weight:bold;letter-spacing:1px;">SAMA HOTEL &nbsp;|&nbsp; فندق سما</span>
      </div>
      <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:28px;color:#2e1215;font-size:15px;line-height:1.8;">
        <div dir="rtl" style="text-align:right;">${esc(arabicBody)}</div>
        <hr style="border:none;border-top:1px solid #e3cbce;margin:24px 0;"/>
        <div dir="ltr" style="text-align:left;">${esc(englishBody)}</div>
      </div>
      <p style="text-align:center;color:#a96e75;font-size:12px;margin-top:16px;">
        Sama Hotel · Muscat, Oman
      </p>
    </div>
  </body>
</html>`;
}

/** Split a bilingual template (Arabic ⸻ divider ⸻ English) into halves. */
export function splitBilingual(template: string): { ar: string; en: string } {
  const parts = template.split(/\n?[⸻—-]{3,}\n?/);
  if (parts.length >= 2) {
    return { ar: parts[0].trim(), en: parts.slice(1).join("\n").trim() };
  }
  return { ar: template.trim(), en: template.trim() };
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<EmailResult> {
  if (!emailConfigured()) {
    return {
      ok: false,
      messageId: null,
      error: "Resend is not configured (RESEND_API_KEY).",
    };
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Sama Hotel <noreply@example.com>",
      to,
      subject,
      html,
    });
    if (error) return { ok: false, messageId: null, error: error.message };
    return { ok: true, messageId: data?.id ?? null, error: null };
  } catch (e) {
    return { ok: false, messageId: null, error: (e as Error).message };
  }
}
