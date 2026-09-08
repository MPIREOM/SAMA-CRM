# HANDOFF — Sama Hotel direct-booking website + back-office

_Built 7–8 September 2026 on top of the existing SAMA CRM. Read this first, then `docs/qa-report.md` and `DECISIONS.md`._

## 1. Where things are

| | URL | Notes |
|---|---|---|
| Guest site (EN) | `https://sama-crm.vercel.app/en` → later `https://book.samahotel.net/en` | `/` redirects to `/en` or `/ar` by browser language |
| Guest site (AR) | `…/ar` | Full RTL |
| Staff back-office | `https://sama-crm.vercel.app/login` → `/dashboard` | Same login as the CRM. Your existing `super_admin` account works; `reservation_desk` users see a reduced menu |
| Supabase project | `sama-crm` (`vsxesrhoovabgsmvodvh`) | Migrations `0005`–`0010` are **already applied** |
| Code | GitHub `MPIREOM/SAMA-CRM`, branch `feat/booking-site` | Production branch is `claude/hotel-crm-nextjs-obex8g` — merge the PR to go live |

**Deployment status:** see section 9 — the branch could not be pushed from the build sandbox (repository not authorised for push). Everything else is ready.

## 2. What works end-to-end

- **Guest journey** (EN + AR, phone-first): home → availability → results with itemised taxes → 3-step booking (details, review with promo code + cancellation policy + "pay at the hotel", confirm) → confirmation page with add-to-calendar (.ics), WhatsApp/phone links → manage page with self-service cancellation inside the 48-hour policy.
- **Booking engine (Postgres):** per-night availability across 60 rooms, rate plans (seasonal / weekend / min-stay / priority), stop-sell, blocks, itemised OMR pricing (service 8 %, tourism 4 %, VAT 5 %, 3-decimal rounding), promo codes (`SAMA10`), double-booking protection with a per-room-type lock, booking references `SAMA-YY-XXXXXX`.
- **CRM integration:** every booking creates/updates the guest in CRM `contacts` and mirrors into CRM `bookings` (same reference), so the WhatsApp inbox, birthday and win-back automations keep working. Guest messages appear in the inbox thread.
- **Messaging:** confirmation (immediately), pre-arrival guide (3 days before, 10:00), post-stay review (1 day after check-out, 11:00) — by **email (Resend)** and **WhatsApp (Meta templates)** in the guest's language; retries with back-off; delivery receipts from Meta update the log; global on/off per channel; "send me a test" in `/messaging`.
- **Add-ons (8 Sept):** guests can add **APEX Zipline** (OMR 5 per rider for hotel guests) and **4WD transfers** up from / down to the Birkat Al Mouz checkpoint (OMR 15 per car each way, up to 4 guests) on the review step; lines appear in the quote, confirmation, manage page and emails; staff see them on the reservation (with Confirm / Done / Cancel), on the dashboard arrivals ("4WD pickup"), in the list filter and in the CSV. Catalogue managed in `/addons` (prices, texts, active). Dedicated page `/en/apex-zipline` and a "Two things worth booking with your room" section on the home page.
- **Back-office:** dashboard (arrivals, departures, in-house, occupancy), tape-chart calendar (rooms × nights, click to book/block, assign/move rooms), reservations list + detail (edit, change dates with re-check, check-in/out, no-show, cancel, resend confirmation, message timeline), walk-in/phone bookings, rooms & room types (incl. photo upload), rates (base rates, plans, month grid, bulk set, stop-sell), blocks, messaging queue + log + previews, settings (taxes, times, cancellation text, contacts, review links, promo codes, schedule), audit log, CSV export. Works on phone/tablet (drawer menu) and desktop.
- **Tests:** 115 unit tests (pricing, dates, templates, dispatcher, schemas, tape-chart maths) and a 17-scenario Playwright suite (EN/AR booking, sold-out/min-stay, race, staff flows, cron auth, middleware). Lighthouse mobile on `/en`: Performance 85 · Accessibility 100 · Best practices 100 · SEO 100.

## 3. What is NOT finished / placeholders (honest list)

| Item | Status | What to do |
|---|---|---|
| **Room counts per type** | Placeholder split 14 / 14 / 14 / 8 / 5 / 5 (only "60 total" and "14 chalets" are confirmed) | `/rooms` → Rooms tab: rename/re-type rooms to match the real inventory |
| **Rates** | Placeholders OMR 50 / 55 / 65 / 70 / 85 / 95, weekend (Thu+Fri) +20 % | `/rates` → set real base rates and seasons |
| **Room photos** | Real photos but thin: Sama Suites reuse Deluxe shots, Deluxe Mountain View reuses the twin-bed shot | `/rooms` → Room types → upload real photos (stored in Supabase Storage `bk-room-images`) |
| **Transfer price** | OMR 15 per car each way is a placeholder | `/addons` → edit "4WD transfer up/down" |
| **APEX photos** | The APEX page and add-on card use hotel aerial photos | `/addons` → image path, or drop photos into `public/images/addons/` |
| **Review links** | Empty | `/settings` → Reviews: paste the Google "write a review" short link (g.page/r/…) and TripAdvisor |
| **Cancellation policy text** | Sensible default (48 h, first night charged) | `/settings` → Cancellation |
| **Children pricing** | Children are free up to the room's max (extra bed OMR 10 is text only) | Policy decision; can be added as a rate rule later |
| **WhatsApp templates** | Code is ready; sends will fail with a clear error until the 3 templates are **approved** in Meta | Section 4 |
| **Resend domain** | Falls back to `onboarding@resend.dev` if `samahotel.net` is not verified | Section 5 |
| Drag-and-drop on the calendar | Not built (use "Move to room" in the booking drawer) | — |
| Arabic UI for the back-office | Menu and most screens are bilingual; a few admin dialogs are English-only | — |
| Legacy CRM "Bookings" screens | `/bookings` now redirects to `/reservations` (the old form did not check inventory or prices) | — |
| CRM automations `booking_created`, `pre_arrival`, `post_stay` | **Switched off** (the engine sends these now, with approved templates). Birthday + win-back still run | Re-enable in `/automations` only if you turn the engine's channels off in `/settings` |

## 4. WhatsApp — shared number, one-click setup, the 3 templates

The hotel shares the SAAS project's WhatsApp number (already registered in Meta). Everything below is done from the back-office page **`/messaging` → WhatsApp setup** (super_admin) once the credentials are in Vercel:

1. Vercel → project `sama-crm` → Settings → Environment Variables (Production): copy `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` and the verify token from the `saas` project (its name `WHATSAPP_WEBHOOK_VERIFY_TOKEN` is accepted as-is — or use Vercel *shared* variables linked to both projects). Add `WHATSAPP_FORWARD_URL=https://saas-rho-kohl.vercel.app/api/webhooks/whatsapp` and `WHATSAPP_FORWARD_SENDERS=96877332220` (the SAAS admin number). Redeploy.
2. Open `/messaging/whatsapp`: it shows the token, the number, the WhatsApp Business Account and where webhooks currently point.
3. Press **Point this number's webhooks here** — a WABA-level callback override; the SAAS app's dashboard settings stay as they are. From then on the hotel receives every event and relays the SAAS admins' messages + all delivery receipts to SAAS (guest replies never reach the SAAS bot, which would otherwise answer them with "this is an automated number").
4. Press **Create missing templates** — submits the 3 guest templates in `en` + `ar` (bodies from `docs/message-content.md`). Status shows PENDING → APPROVED, usually within minutes.
5. If the website's "Chat on WhatsApp" number differs from the Cloud API number, press **Use this number on the website**.
6. `/messaging` → Send test (pre-arrival) to your own phone.

Manual alternative (Meta dashboard) — only if the page cannot reach Meta:

Meta Business Manager → WhatsApp Manager → Message templates → Create. Category **Utility**, one template per language (**English** and **Arabic**), names exactly:

1. `sama_booking_confirmation` — 7 variables: {{1}} guest name, {{2}} booking ref, {{3}} room, {{4}} check-in, {{5}} check-out, {{6}} nights, {{7}} total OMR
2. `sama_pre_arrival_guide` — 3 variables: {{1}} guest name, {{2}} check-in date, {{3}} directions link
3. `sama_post_stay_review` — 2 variables: {{1}} guest name, {{2}} review link

The exact body texts to paste are in **`docs/message-content.md`** (they match the code variable-for-variable). Until approval, the queue shows `failed` with "Template … is not approved" and does not retry; press **Retry** in `/messaging` after approval. The webhook URL (`https://<domain>/api/webhooks/whatsapp`) and verify token are the CRM's existing ones — nothing to change in Meta.

No new Vercel env vars are needed for WhatsApp — the CRM's `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` are reused.

## 5. Email (Resend)

Resend → Domains → add `samahotel.net` → add the DNS records shown (DKIM + SPF, usually 3 TXT/CNAME records at your DNS host) → wait for "Verified". Then set `EMAIL_FROM="Sama Hotel <reservations@samahotel.net>"` in Vercel (it is already set in the CRM — check the value). Until the domain verifies, guest emails go out from `onboarding@resend.dev` (flagged in the log).

## 6. Domains & DNS for `book.samahotel.net`

1. Vercel → project `sama-crm` → Settings → Domains → add `book.samahotel.net`.
2. At your DNS host add `CNAME book → cname.vercel-dns.com` (Vercel shows the exact value).
3. In Vercel env vars set `NEXT_PUBLIC_APP_URL=https://book.samahotel.net` (used in guest links in emails/WhatsApp) and redeploy.
4. In Supabase run: `update bk_settings set value = jsonb_set(value, '{dispatch_url}', '"https://book.samahotel.net/api/cron/dispatch"') where key = 'cron';` (or leave `sama-crm.vercel.app` — both point at the same app).
5. Add the booking link to samahotel.net and the Google Business Profile.

## 7. Optional env vars (Vercel → Settings → Environment Variables)

| Var | Needed? | Purpose |
|---|---|---|
| `CRON_SECRET` | Optional | Vercel Cron sends it automatically; the dispatcher also accepts the secret stored in `bk_settings.cron` (pg_cron uses that one). Set it for defence in depth. |
| `BOOKING_TOKEN_SECRET` | Optional | Rotates guest booking-page links independently of the service key. |
| `NEXT_PUBLIC_GTM_ID` | Optional | Google Tag Manager on the guest site. |
| `NEXT_PUBLIC_APP_URL` | **Set** | Base URL for links in messages (currently the Vercel URL; change when the domain is live). |

## 8. Scheduling — how messages go out

Two independent timers hit `/api/cron/dispatch`: **Vercel Cron every 15 min** (`vercel.json`, Pro plan) and **pg_cron every 10 min** inside Supabase (job `bk-dispatch-10min`, migration 0007). Both are safe to run together (rows are locked before sending). Confirmations are additionally sent the moment a booking is made. Failed sends retry after 5 min, 30 min and 3 h, then stop; see `/messaging`.

## 9. Deploy / merge steps (what the sandbox could not do)

The code is committed on branch `feat/booking-site`. Two ways to ship it:

**A. From the sandbox (preferred):** add the `MPIREOM/SAMA-CRM` repository to this Claude session's sources, then say "push and open the PR". The assistant pushes the branch, opens a PR into `claude/hotel-crm-nextjs-obex8g`, and Vercel deploys a preview automatically; merging deploys production.

**B. Manually:** the branch was also exported as `sama-crm-feat-booking-site.bundle` in your Website folder (if present). On a machine with git:
```
git clone https://github.com/MPIREOM/SAMA-CRM.git && cd SAMA-CRM
git fetch ../sama-crm-feat-booking-site.bundle feat/booking-site:feat/booking-site
git push origin feat/booking-site
```
Then open a PR on GitHub → merge into `claude/hotel-crm-nextjs-obex8g` → Vercel deploys.

After the first production deploy, verify (10 minutes):
1. Open `https://sama-crm.vercel.app/ar` on your phone. Make a booking with your own number + email. Confirmation should arrive by email within a minute; WhatsApp once templates are approved.
2. Log in → `/reservations` → open it → **Cancel** → `/messaging` shows the two future messages as `cancelled`.
3. `/messaging` → "Send test" for pre-arrival and post-stay.
4. Security check (anon must NOT read bookings): `curl -s "https://vsxesrhoovabgsmvodvh.supabase.co/rest/v1/bk_bookings?select=ref" -H "apikey: <anon key>"` → returns `[]`.
5. Cron check: `curl -s https://sama-crm.vercel.app/api/cron/dispatch` → 401; with `-H "Authorization: Bearer <bk_settings.cron.secret>"` → JSON summary.

## 10. Running locally

```
npm ci
cp .env.example .env.local   # fill SUPABASE_SERVICE_ROLE_KEY (+ WhatsApp/Resend if you want real sends)
npm run dev                  # http://localhost:3000 → /en, /ar, /login
npm run test                 # unit tests
npm run e2e:local            # full e2e against the in-memory Supabase emulator (no credentials needed)
npm run build && npm run start
```
Migrations live in `supabase/migrations/` (`0005_booking_engine.sql` … `0010_booking_addons.sql`). Never change the database by hand — add `0011_…sql` and apply with `supabase db push` or the SQL editor. Regenerate types with `supabase gen types typescript --project-id vsxesrhoovabgsmvodvh > src/lib/database.types.ts` (keep the alias block at the bottom).

## 11. Staff — first 10 minutes

1. **Change a rate:** `/rates` → edit the base rate inline, or "Bulk set rate" for a date range. Check the month grid.
2. **Block a room:** `/blocks` → New → choose room or whole type, dates, reason. It disappears from availability immediately.
3. **Phone booking:** `/reservations` → New booking → type, dates, guest phone (+968 default) → the quote updates live → Confirm. The guest gets the confirmation at once.
4. **Resend a confirmation:** open the reservation → "Resend" (email / WhatsApp).
5. **Check-in / check-out:** from the calendar bar drawer or the reservation page.
5b. **Add-ons:** on a reservation, confirm the zipline / transfer request once APEX or the driver is booked; the dashboard shows "4WD pickup" on arrivals so the desk knows who to collect at the checkpoint.
6. **See what was sent:** `/messaging` (queue + log) or the guest's thread in the WhatsApp inbox.

## 12. Files worth knowing

`docs/BOOKING-ARCHITECTURE.md` (how it fits together) · `docs/hotel-facts.md` (facts used) · `docs/message-content.md` (exact message texts) · `docs/existing-schema.md` · `docs/qa-report.md` · `DECISIONS.md` · `scripts/mock-supabase/README.md` (local emulator).
