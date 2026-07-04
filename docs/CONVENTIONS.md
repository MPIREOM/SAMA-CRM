# SAMA CRM — code conventions & foundation contracts

Read this before adding any feature code.

## Stack
Next.js 14 App Router + TypeScript + Tailwind, `src/` structure. Supabase
(Postgres + Auth + Realtime + Edge Functions). WhatsApp Cloud API + Resend.

## Brand
- Tailwind colors: `maroon` (primary, 800 = #3B171B), `gold` (accent, 500 = #C5A04F),
  `crimson` (secondary, 700 = #841424), `jabal` (success green, 600 = #098E4B).
- Primary buttons: maroon bg / gold text. Accents & active nav: gold. Success: jabal.
- Cards: white, `border-maroon-100`, `shadow-card`, `rounded-xl`.

## Bilingual / RTL
- `useLang()` from `@/components/providers/lang-provider` → `{ lang, dir, setLang, toggle }`.
- Feature strings are local to each file:
  ```ts
  const STR = { title: { en: "Contacts", ar: "جهات الاتصال" } } satisfies Strings;
  // render: STR.title[lang]
  ```
- Shared chrome strings: `COMMON` from `@/lib/i18n`. Market labels: `marketLabel(market, lang)`.
- Use `ltr:`/`rtl:` Tailwind variants and logical spacing (`ms-*`, `me-*`, `ps-*`, `pe-*`)
  so layouts mirror correctly. `<html dir>` is managed by `LangProvider`.

## Data access
- Client components: `createClient()` from `@/lib/supabase/client` (RLS-scoped).
- Server components / route handlers acting AS the user: `@/lib/supabase/server`.
- Privileged server work (webhook, kiosk, senders): `createAdminClient()` from
  `@/lib/supabase/admin` — service role, bypasses RLS, SERVER ONLY.
- Types: `Contact`, `Booking`, `Automation`, `Campaign`, `Message`, `Profile`,
  `Role`, `Market`, `BookingSource`, `TriggerKind` from `@/lib/database.types`.

## Roles
- `super_admin`: everything. `reservation_desk`: bookings, inbox, contacts ONLY.
- Nav is filtered in `Sidebar`; admin-only pages must ALSO check the role
  server-side (`getSessionProfile()` from `@/lib/auth`) and render a no-access
  state. RLS is the final backstop.

## Phones & markets
- Always store E.164 (`+96891234567`). Normalize any input with
  `normalizePhone()` from `@/lib/phone`. Market is a GENERATED column in the DB
  (`+968`→Oman, +966/971/965/974/973→GCC, other `+`→International) — never
  write `market`, preview it client-side with `marketFromPhone()`.
- HARD RULE: WhatsApp **marketing** only to Oman + GCC
  (`canReceiveWhatsAppMarketing`). Email marketing may reach all markets.
  Marketing always requires `consent = true`.

## Outbound messages
- ALL sends go through `sendToContact()` in `@/lib/send-service` (server only).
  It enforces consent + market rules, picks free-form vs approved template based
  on the 24h window (`last_inbound_at`), and logs every attempt to `messages`.
- Templates are single bilingual blocks (Arabic ⸻ divider ⸻ English) with
  `{{name}} {{ref}} {{check_in}} {{check_out}} {{room_type}} {{terms_link}}` —
  render with `renderTemplate()` from `@/lib/templates`.

## Automations (DB rows, seeded)
`trigger_kind`: `booking_created` (on create), `pre_arrival` (offset_days=2,
before check_in), `post_stay` (offset_days=1, after check_out), `birthday`,
`win_back` (offset_days=335 ≈ 11 months after last_stay). `msg_type`
utility|marketing, `market` 'All'|'Oman+GCC'. Dedupe = a row already in
`messages` for (automation_id + booking_id) or (automation_id + contact_id +
period).

## UI primitives (`@/components/ui/*`)
`Button` (variants primary/gold/outline/ghost/danger, `loading`), `Input`,
`Select`, `Textarea`, `Label`, `Badge` (+`marketVariant`), `Card`/`CardHeader`/
`CardTitle`/`CardContent`, `Switch`, `Dialog`, `Table`/`THead`/`TBody`/`TR`/`TH`/`TD`,
`EmptyState`, `PageHeader`.
Utils: `cn`, `generateBookingRef`, `nightsBetween`, `formatDate`,
`formatDateTime`, `isWithin24h` from `@/lib/utils`.

## Misc
- No monetary/amount fields anywhere — this is a CRM, not a PMS.
- Dates in DB are `date` (YYYY-MM-DD) or `timestamptz` ISO strings.
- Booking status values: `Confirmed` | `Cancelled` | `Completed`.
- Message statuses: outbound `sent|delivered|read|failed`, inbound `received`.
- Hotel timezone: Asia/Muscat (UTC+4).
