# SAMA CRM — code conventions & foundation contracts

Read this before adding any feature code.

## Stack
Next.js 14 App Router + TypeScript + Tailwind, `src/` structure. Supabase
(Postgres + Auth + Realtime + Edge Functions). WhatsApp Cloud API + Resend.

## Brand
- Tailwind colours: `maroon` (primary, 800 = #3B171B), `gold` (accent, 500 = #C5A04F),
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
- Always store E.164 (`+96891234567`). Normalise any input with
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

## Guest site design system (`src/app/globals.css`, `g-*` classes)

The guest site (`src/app/[locale]`) does not use the CRM primitives. It has its own quiet,
editorial system; everything reusable is a `g-*` class so pages stay readable.

- **Ground & ink**: `bg-paper` / `text-ink`; muted text `text-ink-soft`, `text-ink-mute`;
  hairlines `border-ink-line`; alternate bands `bg-paper-200`; dark bands `bg-ink text-paper`.
  Gold (`gold-500/700`) only for hairlines, eyebrows and small accents.
- **Type**: `g-h1` … `g-h4` (Cormorant Garamond / Amiri, weight 400, lining numerals),
  `g-eyebrow` / `g-eyebrow-gold` (tracked small caps), `g-lead`, `g-body`, `g-small`,
  `g-price` (serif numbers), `g-unit`, `g-ordinal`. Nothing heavier than weight 600.
- **Layout**: `g-container` (84rem), `g-narrow`, `g-section` / `g-section-tight`, `g-page`
  (top padding for pages without a hero). A full-bleed hero section carries `data-hero`
  so the fixed header renders transparent over it.
- **Surfaces**: `g-card`, `g-card-soft`, `g-frame` (photo container; add `g-zoom` for the
  hover drift), `g-note` / `-gold` / `-green` / `-red` / `-inline`, `g-tag` / `-dark` / `-gold`,
  `g-list` + `g-list-row` (hairline lists).
- **Controls**: `g-btn-primary` / `-gold` / `-outline` / `-ghost` / `-light` / `-danger`,
  `g-btn-sm`, `g-btn-block`; text links `g-link` (underline sweep), `g-link-light`, `g-inline`;
  forms `g-label`, `g-input`, `g-select`, `g-textarea`, `g-hint`, `g-error`, `g-check`,
  `g-choice` / `g-choice-on`.
- **Motion**: `<Reveal>` (`@/components/guest/reveal`) for scroll reveals, `g-fade-up` /
  `g-fade` with `--g-delay`, `g-kenburns` on hero photos, `g-enter` for panel entrances,
  `g-collapse` + `is-open` for folding panels, `g-backdrop` / `g-leaving` for dialogs,
  `g-press` / `g-focus` for custom controls, `g-arrow*` for nudging arrows. All keyframes live in
  `globals.css` (Tailwind never emits `theme.keyframes` on its own) and every animation is off
  under `prefers-reduced-motion`.
- **RTL**: logical utilities only (`ms-`, `me-`, `ps-`, `start-`, `end-`), arrows use `g-arrow`
  (mirrors itself). Numbers stay Latin (`n()` in `components/guest/lib.ts`).
- **Content**: photos come from `siteImage(site, "<slot>")` with `site = await getSiteContent()`;
  slots are declared once in `src/lib/bk/site-content.ts` and managed on `/website`.
- **Strings**: `messages/*.json` through `node scripts/i18n-set.mjs`; spell-check with cspell
  (`.cspell.json`, British English).
