// Parsing of the staff notification address list. Pure — shared by the
// settings action (validation), the sender and the tests.

export const MAX_STAFF_RECIPIENTS = 5;

/** Good enough for a settings field: one @, no spaces, a dot in the domain. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "a@x.com, B@y.com; a@x.com" → ["a@x.com", "B@y.com"]. Separators are commas,
 * semicolons and whitespace; duplicates (case-insensitive) collapse; anything
 * that is not an address is dropped; at most MAX_STAFF_RECIPIENTS survive.
 */
export function parseRecipients(raw: string | null | undefined, max: number = MAX_STAFF_RECIPIENTS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[\s,;]+/)) {
    const v = part.trim();
    if (!v || !EMAIL.test(v)) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** Entries that look like addresses but are not — shown back to the admin. */
export function invalidRecipients(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !EMAIL.test(p));
}
