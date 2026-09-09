# Booking platform — architecture & contracts (read before touching code)

Read `docs/CONVENTIONS.md` (CRM conventions) and `DECISIONS.md` too.

## Layout of the app (Next.js 14 App Router, `src/`)
```
src/app/(crm)/                 CRM + back-office. Root layout with cookie-based lang (useLang()).
src/app/(crm)/(app)/…          Authenticated staff pages (sidebar). Add new back-office pages HERE:
                               /reservations, /calendar, /rooms, /rates, /blocks, /messaging, /settings, /audit
src/app/(crm)/login, checkin, terms
src/app/[locale]/              Guest site root layout (next-intl; <html lang dir> from URL). locales: en, ar
src/app/[locale]/(guest)/…     Guest pages: / rooms rooms/[slug] book book/[slug] booking/[ref] booking/[ref]/manage the-peak contact policies
src/app/api/…                  Route handlers. /api/cron/dispatch, /api/webhooks/whatsapp, /api/bk/* (public)
src/components/guest/…         Guest-site components (owned by the guest build)
src/components/admin/…         Back-office components (owned by the back-office build)
src/components/ui/…            Shared primitives (Button, Input, Select, Dialog, Table, Badge, Card, Switch…)
src/lib/booking-engine/        Pure TS: pricing mirror, dates (Muscat), tokens (HMAC). Unit-tested.
src/lib/bk/                    Data access: settings, catalogue (anon), bookings (service role), audit, staff guard, rate-limit
src/lib/messaging/             Email + WhatsApp templates, providers, dispatcher (owned by the messaging build)
src/lib/supabase/              admin (service role), server (cookie session), client (browser), public (anon, no cookies)
src/i18n/routing.ts            next-intl routing + Link/redirect/usePathname/useRouter for the guest site
messages/en.json, ar.json      Guest-site strings (next-intl). CRM strings stay inline (STR objects) per CONVENTIONS.md
supabase/migrations/0005–0007  Schema (applied). Never edit the DB by hand — add a new numbered migration.
```
Middleware (`src/middleware.ts`): unprefixed CRM paths → Supabase session guard; everything else → next-intl.
If you add a new top-level staff route, add its prefix to `CRM_PREFIXES` in the middleware.

## Database (all `bk_` tables, RLS on)
- `bk_room_types` (public read when is_active; `bed_options` = layouts the guest may choose) · `bk_rooms` (60; `bed_type` = physical layout) · `bk_rate_plans` · `bk_inventory_blocks`
- `bk_bookings` — `contact_id → contacts` (CRM guest), `room_type_id`, optional `room_id`, dates, money (3 dp OMR), status
  `pending|confirmed|checked_in|checked_out|cancelled|no_show`, source `website|staff|phone|walk_in|ota`
- `bk_settings` (key → jsonb) — typed in `src/lib/bk/types.ts`, read with `getSettings()` / `getPublicSettings()`
- `bk_scheduled_messages` (booking × channel × kind, send_at, status) · `bk_message_log` · `bk_audit_log`
- Triggers: bk_bookings mirror → CRM `bookings` (same id/ref); cancel → scheduled messages cancelled; date change → send_at recomputed.

RPCs: `bk_availability(check_in, check_out, adults, children)` (anon) · `bk_quote(room_type_id, check_in, check_out, adults, children, promo_code)` (anon)
· `bk_create_booking(jsonb)` (service role; serialises per room type; returns booking row) · `bk_cancel_booking(id, reason, actor)` · `bk_public_settings()` (anon)
· `bk_available_count(room_type_id, in, out, exclude_booking)` (staff) · `bk_effective_rate(room_type_id, date)` · `bk_nightly_rates` · `bk_min_stay`

## Data-access rules
- Guest pages read with `createPublicClient()` (anon) through `src/lib/bk/catalogue.ts` and `getPublicSettings()`.
- Guest booking creation: server action → `createBooking()` (`src/lib/bk/bookings.ts`, service role) → then `dispatchForBooking(id, ["confirmation"])` inside try/catch → redirect to `/booking/[ref]?token=…` (`bookingToken(ref)` from `src/lib/booking-engine/tokens.ts`).
- Confirmation/manage pages: verify `verifyBookingToken(ref, token)`; on failure `notFound()`.
- Back-office mutations: server actions in `src/app/(crm)/(app)/<module>/actions.ts` → `requireStaff(roles)` → Zod parse → service-role write (`createAdminClient()`) → `audit(actor, "entity.action", "bk_table", id, diff)` → `revalidatePath`.
- No `any`, no `console.log` (use `logger` from `src/lib/logger.ts`), Zod on every boundary, `ms-/me-/ps-/pe-` logical spacing, no `ml-/mr-`.

## Roles
`super_admin` → everything. `reservation_desk` → reservations, calendar, blocks, messaging queue (read+retry), dashboard.
Use `requireStaff(ADMIN_ROLES)` for rates/settings/rooms/room-types/audit/export.

## Money & dates
OMR, 3 decimals: `formatOmr()` → "165.110". Nights = check_out − check_in (half-open). All hotel dates are `YYYY-MM-DD` strings.
Weekend nights Thu+Fri (+20 % seed plan). Taxes: service 8 %, tourism 4 %, VAT 5 % on room+fees. Pay at hotel — say it everywhere.

## Messaging contract (`src/lib/messaging/dispatch.ts`)
`dispatchForBooking(bookingId, kinds)` and `dispatchDueMessages(limit)` return `DispatchSummary`. Kinds: confirmation, pre_arrival, post_stay.
WhatsApp templates (Meta, Utility, en + ar): `sama_booking_confirmation` ({{1}} name {{2}} ref {{3}} room {{4}} check-in {{5}} check-out {{6}} nights {{7}} total OMR),
`sama_pre_arrival_guide` ({{1}} name {{2}} check-in {{3}} maps link), `sama_post_stay_review` ({{1}} name {{2}} review link). Bodies: `docs/message-content.md`.
Every send: row in `bk_message_log` AND a row in CRM `messages` (contact_id, booking_id, provider_msg_id, channel, status, body) so the inbox shows it.

## Images
`public/images/rooms/<slug>/N.jpg` (seeded in bk_room_types.images), `public/images/hotel/*.jpg` (38 photos: canyon-view, sunset-chalets, aerial, aerial-2, hotel-building, exterior, terraces, terraces-2, canyon-park, pool-morning, pool-hotel, pool-2, pool-family, pool-child, restaurant, restaurant-2, bbq, bbq-2, buffet, sunroom, gym, gym-2, kids-park, kids-park-2, majlis, lobby, entrance, terrace-sunset, terrace-evening, roses, rosemary, grasses-sign, garden, viewpoint, sama-sign, courtyard, sign-sunset, bougainvillea), `public/images/brand/logo.png` (full, light bg), `logo-mark.png` (gold star only), `public/images/og.jpg`.
Room photos are real but thin: Sama Suites reuse Deluxe shots; Deluxe Mountain reuses the twin room shot. Listed in HANDOFF.md.

## Brand
Pomegranate Maroon `maroon-800 #3B171B`, Sama Gold `gold-500 #C5A04F`, Maroon `crimson-700 #841424`, Al-Jabal Green `jabal-600 #098E4B`, Stone Brown `#B28855` (`stone`), Deep Blue Sky `#327DD8` (`sky`). Fonts: Nunito Sans (EN) + Tajawal (AR) — self-hosted via `src/fonts` (`font-sans`, `font-arabic`).
Guest site feel: premium, calm, warm; generous whitespace; big photography; maroon/gold/stone; no purple, no generic template look.

## Add-ons (migration 0010)
- `bk_addons` (public read when active): slug, kind `activity|transfer|other`, bilingual names/taglines/descriptions, `price_omr`, `unit` `per_person|per_car|per_booking|per_night`, `max_quantity`, `taxable` (false = final price added after room taxes; true = joins the taxable base), `requires_note` + bilingual `note_hint_*`, `image`, `details` jsonb, `is_active`, `sort_order`.
  Seeded: `apex-zipline` (OMR 5 per person, details length_m 310 / height_m 20 / speed_kmh 60 / max_weight_kg 120 / website), `transfer-up` and `transfer-down` (OMR 15 per car, up to 4 guests, note = time).
- `bk_booking_addons`: booking × addon, quantity, unit_price_omr, total_omr, taxable, note, status `requested|confirmed|done|cancelled` (cancelled automatically when the booking is cancelled). `bk_bookings.addons_omr` holds the add-ons total; `total_omr` includes it.
- RPCs: `bk_quote(..., p_promo_code, p_addons jsonb)` where `p_addons = [{"slug"|"addon_id", "quantity", "note"}]` returns `addons: [{addon_id, slug, kind, name_en, name_ar, unit, quantity, unit_price, total, taxable, note}]` and `addons_total`; `bk_create_booking(p)` reads `p.addons` with the same shape and writes `bk_booking_addons`. Prices always come from the catalogue.
- TS: `getAddons()` / `getAddonBySlug()` (`src/lib/bk/catalogue.ts`), `getQuote({ addons })`, `createBooking({ addons })`, `BookingWithRelations.addons` (with `addon`), `quoteFromNightly(nightly, taxes, discountPct, addonInputs)` in `pricing.ts` (`AddonLineInput`), types `QuoteAddonLine` / `AddonSelection` in `src/lib/bk/types.ts`.
- Images: `public/images/addons/apex-zipline.jpg`, `transfer.jpg` (placeholders from the hotel set until APEX supplies photos).
