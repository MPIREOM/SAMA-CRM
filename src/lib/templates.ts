// Template rendering for automations & campaigns.
// Templates are single bilingual blocks: Arabic text, a divider line, English
// text. Variables use {{double_braces}}.

export interface TemplateVars {
  name?: string | null;
  ref?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  room_type?: string | null;
  terms_link?: string | null;
  [key: string]: string | null | undefined;
}

/** Replace {{vars}}; unknown vars are left intact so they're visible in tests. */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null || value === ""
      ? match
      : String(value);
  });
}

/** Standard vars for a booking-driven automation. */
export function bookingVars(booking: {
  guest?: string | null;
  ref?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  room_type?: string | null;
}): TemplateVars {
  return {
    name: booking.guest ?? "Guest",
    ref: booking.ref,
    check_in: booking.check_in,
    check_out: booking.check_out,
    room_type: booking.room_type ?? "-",
    terms_link: configuredTermsLink(),
  };
}

// The app ships its own public terms page, so guests always get a working
// link even when TERMS_LINK is not configured.
export const DEFAULT_TERMS_LINK = "https://sama-crm.vercel.app/terms";

/**
 * TERMS_LINK when it's a real value — the .env.example placeholder contains
 * "YOUR_" mid-string (https://YOUR_DOMAIN/terms), which must never reach a
 * guest — otherwise the built-in /terms page.
 */
export function configuredTermsLink(): string {
  const link = process.env.TERMS_LINK;
  return link && !link.includes("YOUR_") ? link : DEFAULT_TERMS_LINK;
}
