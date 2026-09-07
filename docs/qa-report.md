# QA report — booking platform (`feat/booking-site`)

Date: 2026-09-07 · Scope: guest site (EN/AR), back-office, messaging dispatcher, middleware.
Sandbox constraint: no egress to `*.supabase.co` / `*.vercel.app`, no service-role key, so every runtime check below ran against the local Supabase emulator in `scripts/mock-supabase/` (see its README for exactly what it does and does not emulate). Anything that only the real database, Vercel, Meta or Resend can prove is listed under **Not verified here** with the exact steps to verify after deployment.

## 1. What was run

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` (includes `scripts/`, `e2e/`) | 0 errors |
| ESLint | `npx eslint --ext .ts,.tsx src e2e scripts` | 0 warnings / errors |
| Unit tests | `npx vitest run` | 10 files, 115 tests passed |
| Production build | `next build` with the mock env exported | OK (43 static pages, warning about `process.version` in `@supabase/supabase-js` under the Edge runtime is pre-existing and harmless) |
| Playwright e2e | `npm run e2e:local` (mock → build → `playwright test`) | **17 passed** (11 desktop + 6 mobile/Pixel 7), 1 m 32 s cold |
| Emulator smoke | ~40 direct `curl` calls against PostgREST/RPC/GoTrue/storage routes | all as expected (see commit `05dfa4a`) |
| Lighthouse 12 (mobile, simulated slow 4G, warm image cache) | `/en` · `/ar` | Perf **85 / 79**, A11y **100 / 99→100**, Best practices **100**, SEO **100** (details §5) |
| Secret leakage | `grep -rl mock-service-role-key .next/static` | 0 files (anon key present in 9 chunks, which is by design) |
| Static greps | `console.log`, `: any`, `as any`, physical `ml-/mr-/pl-/pr-` in guest code, JSX English literals under `src/app/[locale]`, `TODO` without owner, `<Image>` without `alt`, inputs without a label | all clean after the fixes in §3 (remaining `console.error` calls are in pre-existing CRM API routes, not booking-engine code) |
| Screenshots | `node qa/screenshots.mjs` | 62 PNGs in `qa/screenshots/` (§4) |

### e2e coverage (`e2e/*.spec.ts`)

- **Guest EN** — home → hero widget → results → Chalet → step 1 → review → confirm → confirmation page shows ref, total, "pay at the hotel"; asserts `bk_bookings` row (status/source/nights/total equals the review total), 6 `bk_scheduled_messages` (confirmations already `stubbed` by the inline dispatcher, 4 pending), `bk_message_log` rows, CRM `bookings` mirror (`Confirmed`, `Chalet`), contact upsert (market Oman), `.ics` = `text/calendar`, bad token → 404 on `.ics` and the confirmation page.
- **Guest AR** — `html[lang=ar][dir=rtl]`, Arabic h1 on home/results/booking/confirmation, no raw message keys leak (regex over the whole body on every step), nationality stored as English demonym, `preferred_lang = ar`.
- Sold-out (type stop-sell) and min-stay-3 (rate plan) states on the results page; direct RPC on the sold-out type refused with `sold_out`.
- No availability → "Nothing free" + 4 nearby-date nudges; clicking "1 day later" lands on results with Select links.
- Double-booking race: 1 active room, 3 concurrent `bk_create_booking` → exactly 1 success, 2 × `sold_out`, availability 0. **Mock only** — the SQL guarantee is `pg_advisory_xact_lock(hashtext(room_type_id))` + re-check (migration 0005 §8); rerun against the real project (see §6).
- Guest manage page: cancel within policy → cancelled state, `cancel_reason = e2e`, pending messages cancelled, confirmation page shows the cancelled state; check-in tomorrow → "past the free-cancellation window" + Contact us, no cancel button.
- Staff admin: login → dashboard → calendar renders 60 room rows and the E2E booking → `/blocks` create type stop-sell (availability 14 → 0) → delete (→ 14) with audit rows → `/reservations?q=` finds the booking → detail → cancel with reason → scheduled rows cancelled → `/rates` grid + weekend plan → `/settings` → `/messaging` shows the booking → `/audit` shows `booking.cancel` attributed to "Sama Admin".
- Staff front desk: `/reservations/new` walk-in for today with a room → detail → check-in → check-out → CRM mirror `Completed`, audit `booking.create/check_in/check_out`, CSV export contains the ref.
- `reservation_desk`: no Settings/Rates in the sidebar, `/settings` `/rates` `/audit` render the no-access state, `/reservations` `/blocks` work.
- Middleware: `/` → `/en`, `Accept-Language: ar` → `/ar` (fresh cookie jar — `NEXT_LOCALE` sticks), `/bookings` → `/reservations`, `/reservations` → `/login?next=%2Freservations`, `/api/cron/dispatch` → 401 JSON, `robots.txt` / `sitemap.xml` (contains `/en/rooms/chalet` and `/ar/rooms/chalet`) / `manifest.webmanifest` 200, unknown guest path 404.
- Cron: wrong bearer → 401; `Bearer mock-cron-secret` (the seed's `bk_settings.cron.secret`) → 200 summary, both due confirmations → `stubbed` with `bk_message_log` rows and **no** CRM `messages` rows; second run picks 0 (idempotent).

## 2. Emulator (`scripts/mock-supabase/`) — Part A

`npm run mock:db` starts it on `:54321`; `npm run e2e:local` runs mock → `next build` → Playwright with the right env. README lists the emulated surface and its limits. Highlights: PostgREST filters/embeds/count/upsert/object-accept, all `bk_*` RPCs with the SQL error texts, the `bk_bookings` mirror + cancel/reschedule triggers, coarse RLS by bearer (anon / staff JWT / service role), GoTrue password login for `admin@sama.test` / `desk@sama.test`, storage upload stub, seed identical to migration 0006 with deterministic ids. It also rejects `limit=NaN` like PostgREST — which is how bug #1 surfaced.

## 3. Bugs found and fixed

| # | Severity | Where | Bug | Fix / commit |
|---|---|---|---|---|
| 1 | **High** | `/reservations` (server page) | `PAGE_SIZE` was imported from the `"use client"` view, so the server received a client-reference proxy; `(page-1)*PAGE_SIZE` = `NaN` → `.range(NaN, NaN)` → PostgREST got `offset=NaN&limit=NaN`. Against the real project this is a PGRST100 load error on every visit to the reservations list. | Constant moved to `components/admin/shared.ts` — `6b4fb42` |
| 2 | Medium | `/audit`, reservation detail | Cancellations (audit row written inside `bk_cancel_booking`) showed the raw user uuid (`40000000…`) / "—" as the actor. | Pages resolve `actor_user_id` → `profiles.full_name` when `actor_email` is null — `22f80e2` |
| 3 | Low | Reservation header, new-booking summary, calendar drawer | "1 Nights" (no pluralisation; Arabic had no dual/plural). | `nightsLabel()` in `admin/shared.ts` — `3cddf3c` |
| 4 | Low | Dashboard | Stat tile labels truncated at 1440 px ("Arrivals to…", "Message q…"). | 2-line clamp + title — `3cddf3c` |
| 5 | Low | Guest room cards | "/ per night" broke mid-phrase at 3 columns. | `whitespace-nowrap` — `3cddf3c` |
| 6 | Low (a11y) | Guest header, home facilities | Lighthouse: brand link `aria-label` did not match its visible text; facility photos' `alt` duplicated the `figcaption`. | `40589d2` |
| 7 | Low (a11y) | Admin filters (reservations, audit, messaging, calendar, settings promo note, room-type file input) | Inputs/selects without a programmatic label. | `htmlFor` / `aria-label` — `e087522` |
| 8 | Low (conventions) | `src/lib/bk/audit.ts`, `src/lib/whatsapp.ts` | `console.error` instead of `logger`; last `as any`. | `e087522` |

Test-side fixes (not app bugs): Playwright 1.63 pins Chromium 1243 but the sandbox has 1194 → `PW_CHROMIUM_PATH` opt-in in `playwright.config.ts`; the emulator now returns PGRST100 for non-integer `limit/offset`.

## 4. Bugs / observations found and NOT fixed

| # | Severity | Where | Repro | Notes |
|---|---|---|---|---|
| A | Medium (product) | Back-office shell | Open any `/dashboard`… page at ≤ 1024 px (see `qa/screenshots/staff-*.mobile.png`). | The 256 px sidebar is always visible; content is squeezed/clipped. Pre-existing CRM shell. Left `TODO(owner)` in `src/app/(crm)/(app)/layout.tsx`: decide whether front-desk staff need phone/tablet access (needs a collapsible drawer). |
| B | Low (perf) | Guest home | Lighthouse mobile LCP 4.5 s (EN) / 5.0 s (AR) on simulated slow 4G; the LCP element is the hero `canyon-view.jpg` (`w=750`, ~100 KB). | Options: serve a smaller/lower-quality mobile candidate (`quality={60}` or a portrait crop), keep `priority`. Design call, not changed. First uncached hit is much slower because the image optimizer encodes AVIF on demand — on Vercel that is cached at the edge after the first request. |
| C | Info | `bk_cancel_booking` (SQL) | Cancel from the back-office, then read `bk_audit_log`. | The SQL function stores only `actor_user_id` (no `actor_email`), unlike every other audit row. UI now resolves the name (fix #2); consider adding `p_actor_email` in a later migration for consistent data. |
| D | Info | `/reservations/new` | Default "Preferred language" is Arabic. | Probably intended (Omani hotel) — confirm. |
| E | Info | Guest widget date inputs | Native `<input type=date>` render in the browser/OS locale (the screenshots show mm/dd/yyyy because the sandbox Chromium is en-US). | Not an app bug; noting for design review. |
| F | Info | Full-page screenshots | Sticky header / fixed CTA appear once at the viewport position in tall captures. | Tooling artefact, not a layout bug (verified with viewport-only captures). |

## 5. Lighthouse (`qa/lighthouse/*.report.html`)

Mobile, Lighthouse 12.8, Chromium 141, simulated slow 4G, image optimizer warm:

| Page | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/en` (final build) | 85 | 100 | 100 | 100 | 4.2 s | 20 ms | 0 |
| `/ar` (before a11y fix) | 79 | 99 | 100 | 100 | 5.0 s | 50 ms | 0 |

The `/ar` accessibility point was the same `image-redundant-alt` finding, fixed in §3 #6. Remaining performance items are the hero image (observation B), ~470 ms render-blocking CSS and bf-cache being disabled by `no-store` (dynamic pages) — expected for a booking site. Cold run (optimizer encoding AVIF for the first time) scored 67 with LCP 10 s; treat that number as a sandbox artefact. Reports: `qa/lighthouse/*.report.html`.

## 6. Not verified in this sandbox — how to verify once deployed

1. **RLS on the real project (anon must not read `bk_bookings`).** Verified only by policy review: migration 0005 enables RLS on all nine `bk_*` tables; the only anon policy is `bk_room_types_public_read` (`is_active = true`); every other table has `<table>_staff_read` (`to authenticated`, `my_role() in ('super_admin','reservation_desk')`) and `<table>_admin_write` (`super_admin`) only; `bk_create_booking`, `bk_cancel_booking`, `bk_available_count` have EXECUTE revoked from `anon`. To prove it:
   ```bash
   curl -s "https://vsxesrhoovabgsmvodvh.supabase.co/rest/v1/bk_bookings?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"   # expect []
   curl -s -X POST ".../rest/v1/rpc/bk_available_count" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'content-type: application/json' -d '{}'   # expect 42501
   curl -s ".../rest/v1/bk_room_types?select=slug&is_active=eq.false" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"   # expect []
   ```
2. **SQL money vs the TS mirror.** The unit tests pin `pricing.ts`; the emulator uses that mirror, so parity with `bk_quote` is assumed, not tested. Run `select bk_quote('<chalet id>', '2026-09-17', '2026-09-19', 2, 0, 'SAMA10')` and compare with what the emulator returns for the same call (subtotal 156 → discount 15.6 → service 11.232 → tourism 5.616 → VAT 7.862 → total 165.110).
3. **Double-booking under real concurrency.** With the service-role key, fire three parallel `bk_create_booking` for a type reduced to one active room (the e2e test body shows the payload); expect one row and two `sold_out`.
4. **Real sends.** Set `RESEND_API_KEY`, `EMAIL_FROM`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`; make a booking with `messaging.test_phone/test_email`; expect `bk_scheduled_messages.status = sent`, `bk_message_log.provider_message_id` set, a CRM `messages` row per send, and the WhatsApp webhook flipping status to delivered/read. Template names must be approved in Meta for both `en` and `ar` (`sama_booking_confirmation`, `sama_pre_arrival_guide`, `sama_post_stay_review`).
5. **Cron on Vercel + pg_cron.** After deploy: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/dispatch` → 200 JSON; check `bk_settings.cron.dispatch_url` points at the deployed domain (the seed says `https://sama-crm.vercel.app/...`); Vercel → Cron logs every 15 min; `select * from cron.job_run_details order by start_time desc limit 5` for pg_cron.
6. **Rate limit** (`10/min/IP`, in-memory per instance) — sanity-check with 11 rapid bookings from one IP; expect `rate_limited` on the 11th.
7. **Storage uploads** from `/rooms` (bucket `bk-room-images`, public read) — the emulator only acknowledges uploads.
8. **Lighthouse on the real domain** (edge-cached images, real TTFB) — expect performance above the sandbox numbers.

## 7. Files

- `scripts/mock-supabase/{server,db,postgrest,rpc,auth,seed}.ts`, `README.md`; `scripts/e2e-local.mjs`; npm scripts `mock:db`, `e2e:local`.
- `e2e/helpers.ts`, `e2e/guest-booking.spec.ts`, `e2e/staff.spec.ts`, `e2e/platform.spec.ts`; `playwright.config.ts` (`PW_CHROMIUM_PATH`).
- `qa/` (git-ignored): `screenshots/*.png` (62), `screenshots.mjs`, `lighthouse/*.report.{html,json}`, probe scripts.
