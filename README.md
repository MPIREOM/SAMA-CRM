# SAMA Hotel CRM

A bilingual (Arabic / English, RTL-first) guest-relationship CRM built for Sama Hotel, Muscat. It gives the front desk and marketing team a single place to manage guest contacts, track bookings from every channel, and run compliant WhatsApp + email communication — from the instant booking confirmation to the "we miss you" message eleven months after checkout. It is a CRM, not a PMS: there are deliberately no rates, folios, or payment fields anywhere.

**Features**

- **Contacts** — guest profiles with tags, birthday, nationality, language, marketing consent (with source + timestamp), Excel import, and a market derived automatically from the phone number (`+968` → Oman, KSA/UAE/KW/QA/BH → GCC, everything else → International).
- **Bookings** — three sources (Website / OTA / Offline), `SAMA-YY-XXXX` confirmation refs, and an instant `booking_created` confirmation fired from `/api/bookings`.
- **Five automations** — `booking_created`, `pre_arrival` (2 days before check-in), `post_stay` (1 day after checkout), `birthday`, and `win_back` (~11 months after the last stay), executed idempotently by a daily Supabase Edge Function.
- **Campaigns** — one-off WhatsApp / email blasts with hard market rules baked in (WhatsApp marketing is Oman + GCC only; email may reach all markets; consent is always required for marketing).
- **Bed layout choice** — room types can offer twin beds or a king bed (the two Deluxe rooms); the guest picks one when booking, staff see it on the reservation and assign a room recorded with that layout (`/rooms` → Beds).
- **Templates** — create, edit, submit and delete Meta WhatsApp message templates from the back-office (text or image/video/PDF headers, body variables with samples, footer, quick-reply / URL / phone buttons) with live review status; WhatsApp campaigns send an approved template with per-guest variables.
- **WhatsApp inbox** — two-way conversations over the WhatsApp Cloud API with Supabase Realtime updates, correct 24-hour customer-service-window handling (free-form inside the window, approved template outside it), and automatic STOP / إلغاء opt-out processing.
- **Check-in kiosk** — a guest-facing `/checkin` flow for the lobby tablet that captures details and marketing consent at arrival.
- **Roles & RLS** — `super_admin` (everything) and `reservation_desk` (bookings, inbox, contacts only), enforced in the navigation, on the server, and finally by Postgres Row Level Security.
- **Bilingual AR/EN** — every screen and template is Arabic + English with fully mirrored RTL layouts.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 14 (App Router, `src/` structure) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS (brand palette: maroon / gold / crimson / jabal) |
| Database & Auth | Supabase Postgres + Supabase Auth (RLS on every table) |
| Live updates | Supabase Realtime (WhatsApp inbox) |
| Background jobs | Supabase Edge Functions (Deno) + pg_cron + pg_net |
| Messaging | WhatsApp Cloud API (Meta Graph v20.0) |
| Email | Resend |
| Hosting | Vercel |

## Project structure

```
SAMA-CRM/
├── src/
│   ├── app/
│   │   ├── (app)/                     # Authenticated shell (sidebar + topbar)
│   │   │   ├── contacts/              # List, guest profile ([id]), Excel import
│   │   │   ├── bookings/              # List + new-booking form
│   │   │   ├── inbox/                 # WhatsApp inbox (Realtime)
│   │   │   ├── automations/           # Toggles + template editor (admin only)
│   │   │   ├── campaigns/             # Campaign list + composer (admin only)
│   │   │   └── templates/             # Meta template manager (admin only)
│   │   ├── api/
│   │   │   ├── bookings/              # POST: create booking + fire booking_created
│   │   │   ├── campaigns/send/        # POST: campaign fan-out
│   │   │   ├── messages/send/         # POST: manual inbox send
│   │   │   └── webhooks/whatsapp/     # GET verify + POST receive (Meta webhook)
│   │   ├── checkin/                   # Guest-facing lobby kiosk (outside the shell)
│   │   └── login/                     # Staff sign-in
│   ├── components/
│   │   ├── ui/                        # Button, Input, Dialog, Table, Badge, …
│   │   ├── layout/                    # Sidebar, topbar, language switcher
│   │   ├── providers/                 # LangProvider (AR/EN + <html dir>)
│   │   └── <feature>/                 # contacts/, bookings/, inbox/, …
│   └── lib/
│       ├── supabase/                  # client.ts / server.ts / admin.ts
│       ├── database.types.ts          # Generated DB types + app aliases
│       ├── send-service.ts            # Single choke-point for ALL outbound sends
│       ├── whatsapp.ts, email.ts      # Cloud API + Resend helpers
│       ├── templates.ts, phone.ts     # {{var}} rendering, E.164 + market rules
│       └── i18n.ts, auth.ts, utils.ts
├── supabase/
│   ├── migrations/
│   │   ├── 0001_profiles_rls_seed.sql          # Roles, RLS, automation seeds
│   │   └── 0002_schedule_automation_runner.sql # pg_cron daily schedule
│   └── functions/
│       └── automation-runner/         # Daily Deno Edge Function (this repo)
└── docs/CONVENTIONS.md                # Code conventions & foundation contracts
```

## Local setup

```bash
git clone <your-repo-url> SAMA-CRM
cd SAMA-CRM
npm install
cp .env.example .env.local   # then fill in the YOUR_* placeholders
npm run dev                  # http://localhost:3000
```

Environment variables (`.env.local`):

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Already filled in (`https://vsxesrhoovabgsmvodvh.supabase.co`) — publishable. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Already filled in — publishable anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → `service_role`. **Server only — never expose with `NEXT_PUBLIC_`.** |
| `WHATSAPP_ACCESS_TOKEN` | Meta for Developers → your app → WhatsApp → API Setup (use a permanent System User token, see below). |
| `WHATSAPP_PHONE_NUMBER_ID` | Same API Setup screen. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Same API Setup screen. |
| `WHATSAPP_VERIFY_TOKEN` | You invent this random string, then paste the same value into Meta's webhook configuration. |
| `WHATSAPP_APP_SECRET` | Meta app → App Settings → Basic → App Secret (verifies webhook signatures). |
| `WHATSAPP_REENGAGE_TEMPLATE` | Name of your approved utility template with a single `{{1}}` body parameter (see WhatsApp setup). |
| `RESEND_API_KEY` | Resend Dashboard → API Keys. |
| `EMAIL_FROM` | A sender on your verified Resend domain, e.g. `Sama Hotel <noreply@YOUR_DOMAIN>`. |
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployed app (no trailing slash). |
| `TERMS_LINK` | Optional — URL substituted into `{{terms_link}}` in templates. Defaults to the built-in bilingual terms page at `https://sama-crm.vercel.app/terms`. |
| `KIOSK_EXIT_PIN` | 4–8 digit PIN staff enter to exit the `/checkin` kiosk. |

## Supabase setup

### 1. Database migration

`supabase/migrations/0001_profiles_rls_seed.sql` creates the `profiles` table and role trigger, enables RLS with policies on every table, seeds the five automations, enables Realtime for `messages`, and adds supporting indexes.

> **Already applied** to the live project `vsxesrhoovabgsmvodvh`. The migration is idempotent and safe to re-run — either paste it into the SQL Editor or run `supabase db push`.

### 2. Staff users

Create staff accounts in the Supabase Dashboard → **Authentication → Users → Add user** (email + password).

- The **first** user ever created automatically becomes `super_admin` (via the `handle_new_user` trigger).
- Every later user defaults to `reservation_desk`.

To change a role afterwards:

```sql
update public.profiles
set role = 'super_admin'   -- or 'reservation_desk'
where id = (select id from auth.users where email = 'staff@example.com');
```

## WhatsApp Cloud API setup

1. Create a Meta app at [developers.facebook.com](https://developers.facebook.com) (type *Business*) and add the **WhatsApp** product.
2. In **WhatsApp → API Setup**, note the **Phone number ID** and the **WhatsApp Business Account ID** → `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.
3. Create a **permanent access token**: Business Settings → System Users → create a system user, assign the app + WhatsApp account with full control, and generate a token with `whatsapp_business_messaging` and `whatsapp_business_management` permissions → `WHATSAPP_ACCESS_TOKEN`. (The API Setup screen's temporary token expires after 24 hours — don't ship it.)
4. Configure the webhook: **WhatsApp → Configuration → Webhook** — Callback URL `https://<your-domain>/api/webhooks/whatsapp`, Verify token = the exact value of your `WHATSAPP_VERIFY_TOKEN`.
5. Subscribe the webhook to the **`messages`** field (this delivers inbound messages and status updates).
6. Copy the **App Secret** from App Settings → Basic → `WHATSAPP_APP_SECRET` (the webhook validates the `X-Hub-Signature-256` header with it).
7. **Re-engage template (required):** in WhatsApp Manager, create and submit a *utility* template whose body is exactly one parameter — `{{1}}` — and set its approved name as `WHATSAPP_REENGAGE_TEMPLATE`. Outside the 24-hour customer-service window Meta only allows approved templates, so the app and the automation runner send the whole rendered bilingual message as that single parameter. Without it, sends outside the window are logged as failed (`outside_24h_no_template`).

**Shared number & one-click setup.** The hotel uses the same WhatsApp number as the SAAS project, so steps 4–5 and the template submission are done from the back-office instead of the Meta dashboard: `/messaging` → **WhatsApp setup** (super_admin). The page reads the credentials above from the environment, shows token / number / WhatsApp Business Account state, points the number's webhooks at this deployment (a callback override on the business phone number, account-level as fallback — the SAAS app's own dashboard configuration is not touched), submits the three guest templates in `en` + `ar`, and can make the Cloud API number the website's contact number. Because Meta delivers every event for a number to one callback, set `WHATSAPP_FORWARD_URL` (the SAAS webhook) and `WHATSAPP_FORWARD_SENDERS` (its admin numbers): the hotel keeps guest conversations and relays the SAAS admins' messages plus all delivery receipts, re-signed with the shared app secret. The verify token is also accepted under the SAAS name `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, so Vercel shared environment variables can serve both projects unchanged.

**Marketing templates & template campaigns.** `/templates` (super_admin) lists every template on the WhatsApp Business Account grouped by name, with each language's Meta status (pending / approved / rejected with reason / paused) and quality rating. *New template* opens an editor for the full Meta component set — text header (one variable) or image / video / PDF header (the sample file is uploaded through Meta's resumable upload, which needs the app id: the token usually reveals it, otherwise enter it on the WhatsApp setup page or set `WHATSAPP_APP_ID`), body with `{{1}}…{{n}}` variables and their samples, footer, and up to ten quick-reply / URL (static or `{{1}}`-suffixed) / phone buttons — validated against Meta's limits before submission, with a WhatsApp-style preview. Approved, rejected or paused templates can be edited (Meta re-reviews them; at most ten edits per 30 days) and any variant or the whole name can be deleted. The campaign composer's *Approved template* mode (the default for WhatsApp) picks a template, maps each variable to a guest field (full name, first name, last room type, terms link) or fixed text, uploads the header media, previews the message and sends it through Meta's template API at any time — no 24-hour window. The guest's language decides the variant (Arabic when approved, otherwise English). Templates live in Meta only; a campaign stores the template name, `auto` language and the variable plan (`wa_template_*` columns, migration `0012`). Media is kept in the public `wa-media` bucket because Meta fetches header media by URL at send time.

## Resend setup (email)

1. Create a [Resend](https://resend.com) account and add your sending domain (**Domains → Add Domain**).
2. Add the DKIM/SPF DNS records Resend shows you and wait for the domain to verify.
3. Create an API key → `RESEND_API_KEY`.
4. Set `EMAIL_FROM` to a sender on that verified domain, e.g. `Sama Hotel <noreply@YOUR_DOMAIN>`.

## Edge Function: automation-runner

The daily automation runner lives at `supabase/functions/automation-runner`. It handles `pre_arrival`, `post_stay`, `birthday`, and `win_back`, plus a 48-hour catch-up for any missed `booking_created` confirmations. It is idempotent — the `messages` table is its dedupe ledger — and all date math runs in Asia/Muscat.

### Deploy

> **Already deployed** to the live project and verified with a real invocation
> (returns the per-trigger JSON summary). Re-deploy after code changes with:

```bash
supabase functions deploy automation-runner --project-ref vsxesrhoovabgsmvodvh
```

### Secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the Edge runtime. Set the rest:

```bash
supabase secrets set --project-ref vsxesrhoovabgsmvodvh \
  WHATSAPP_ACCESS_TOKEN=YOUR_META_PERMANENT_ACCESS_TOKEN \
  WHATSAPP_PHONE_NUMBER_ID=YOUR_WHATSAPP_PHONE_NUMBER_ID \
  WHATSAPP_REENGAGE_TEMPLATE=YOUR_APPROVED_UTILITY_TEMPLATE_NAME \
  RESEND_API_KEY=YOUR_RESEND_API_KEY \
  EMAIL_FROM="Sama Hotel <noreply@YOUR_DOMAIN>"
# TERMS_LINK is optional — {{terms_link}} defaults to the built-in
# https://sama-crm.vercel.app/terms page; set it only for a custom URL.
```

Missing secrets never crash the run — affected attempts are logged to `messages` as `failed` with a clear error note.

### Schedule (pg_cron)

> **Already scheduled** on the live project (`cron.schedule` job
> `sama-automation-runner-daily`, `0 5 * * *`). Nothing to do unless you set up
> a fresh project.

`supabase/migrations/0002_schedule_automation_runner.sql` already contains this block with the project's (publishable) anon key filled in; run it once in the SQL Editor if you are setting up a fresh project:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sama-automation-runner-daily',
  '0 5 * * *',  -- 05:00 UTC = 09:00 Asia/Muscat
  $$
  select net.http_post(
    url := 'https://vsxesrhoovabgsmvodvh.supabase.co/functions/v1/automation-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SUPABASE_ANON_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

The Bearer token is the project's **anon** key (safe to store — it only satisfies the function gateway's JWT check; the function itself uses the service-role key from its own environment).

To test a run manually:

```bash
curl -X POST https://vsxesrhoovabgsmvodvh.supabase.co/functions/v1/automation-runner \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY"
```

The response is a JSON summary per trigger kind: `{ matched, sent, skipped, failed, reasons }`.

## Kiosk setup

1. On the lobby tablet, open `https://<your-domain>/checkin` in the browser and put it in fullscreen.
2. Lock the tablet to that screen: **Guided Access** on iPad (Settings → Accessibility → Guided Access, then triple-click the side button in Safari) or **App pinning** on Android.
3. The kiosk hides all staff chrome. To exit it, tap the **top start-side corner (top-left in LTR) 5 times**, then enter the `KIOSK_EXIT_PIN`.

## Deployment (Vercel)

> **Already live**: the repo is connected to the Vercel project `sama-crm` and
> production deploys automatically from the `claude/hotel-crm-nextjs-obex8g`
> branch → **https://sama-crm.vercel.app**. The publishable Supabase URL/anon
> key ship as code fallbacks, so the UI works with zero env vars.

1. Add the remaining variables from `.env.example` under **Project → Settings → Environment Variables** (`SUPABASE_SERVICE_ROLE_KEY` and all WhatsApp/Resend secrets are server-side only, so do not prefix them with `NEXT_PUBLIC_`), then **Redeploy**.
2. Set `NEXT_PUBLIC_APP_URL=https://sama-crm.vercel.app` (or your custom domain).
3. Point the Meta webhook (WhatsApp setup step 4) at `https://sama-crm.vercel.app/api/webhooks/whatsapp`.
4. If **Settings → Deployment Protection → Vercel Authentication** is enabled for production, disable it for Standard Protection — the kiosk (`/checkin`) and the Meta webhook must be publicly reachable.

## Compliance rules

These rules are enforced centrally in `src/lib/send-service.ts` (app) and mirrored in the Edge Function — no send bypasses them:

- **Consent** — marketing messages (any channel) require `consent = true`, captured with a source and timestamp (kiosk, import, manual, …).
- **Opt-out** — an inbound WhatsApp message of `STOP`, `إلغاء`, or similar keywords immediately sets `consent = false` (`consent_source = 'whatsapp_stop'`). No further marketing is sent to that guest.
- **WhatsApp marketing = Oman + GCC only** — marketing over WhatsApp never goes to International numbers, regardless of consent. Hard rule.
- **Email marketing** — may reach all markets, consent still required.
- **Utility messages** (booking confirmation, pre-arrival) are transactional and not consent-gated, but still respect channel rules and per-automation market targeting.
- **Post-stay message = marketing.** It carries the returning-guest offer (`SAMA10`), so its Meta template is category *Marketing* and the dispatcher sends it (WhatsApp and email) only to guests whose contact has marketing consent — skipped as `no_marketing_consent` otherwise. Booking confirmation and pre-arrival are *Utility* and go out regardless; keep their bodies strictly about the booking or Meta rejects them as `INCORRECT_CATEGORY`.
- **24-hour window** — free-form WhatsApp text is only sent within 24 hours of the guest's last inbound message; outside the window only the approved `WHATSAPP_REENGAGE_TEMPLATE` is used.
- **Full audit trail** — every outbound attempt (sent or failed) is logged to the `messages` table, which doubles as the automations' idempotency ledger.

---

## ✅ Already done for you (no action needed)

- Database migrations 0001–0004 applied to the live project `vsxesrhoovabgsmvodvh`: `profiles` + role trigger (first user = super_admin), RLS on every table, the 5 seeded bilingual automations, Realtime on `messages`, indexes, and security hardening.
- Edge Function `automation-runner` deployed (v2) and verified with a live run.
- Daily cron scheduled (`0 5 * * *` = 09:00 Muscat) via pg_cron + pg_net.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are real, publishable values already filled into `.env.example`.

## 🚨 ACTION REQUIRED FROM YOU

Do these in order — everything else is finished. Each `KEY` goes into Vercel env vars **and** your local `.env.local`.

**1. Supabase (~5 min)**
1. Create **your admin account first**: Dashboard → Authentication → Users → *Add user* (email + password). The first user automatically becomes `super_admin`; do this before sharing anything.
2. Add reservation-desk staff the same way (they default to `reservation_desk`).
3. Disable public sign-ups: Authentication → Sign In / Providers → turn **off** "Allow new users to sign up" (staff are created from the dashboard only).
4. Copy the **service_role** key (Project Settings → API) → `SUPABASE_SERVICE_ROLE_KEY`.

**2. Local run (optional, ~5 min)**
1. `cp .env.example .env.local`, fill values as you collect them, then `npm install && npm run dev`.

**3. Vercel (~5 min) — project already created & deployed: https://sama-crm.vercel.app**
1. Add the secret variables from `.env.example` (real values) to Project → Settings → Environment Variables, then Redeploy.
2. Set `NEXT_PUBLIC_APP_URL=https://sama-crm.vercel.app`. A bilingual terms page ships at `/terms` — `TERMS_LINK` is only needed if you want a different URL.
3. Check Settings → Deployment Protection: production must be publicly reachable (kiosk + Meta webhook).

**4. Meta / WhatsApp Cloud API (~30–45 min)**
1. Create a **Business** app at developers.facebook.com and add the *WhatsApp* product.
2. From API Setup: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.
3. Business Settings → System Users → create + generate a **permanent** token (`whatsapp_business_messaging`, `whatsapp_business_management`) → `WHATSAPP_ACCESS_TOKEN`.
4. App Settings → Basic → **App Secret** → `WHATSAPP_APP_SECRET` (the webhook refuses unsigned traffic without it).
5. Invent a random string → `WHATSAPP_VERIFY_TOKEN` (set it in Vercel *first*).
6. WhatsApp → Configuration → Webhook: URL `https://<your-domain>/api/webhooks/whatsapp`, verify token from step 5, then subscribe to the **messages** field.
7. WhatsApp Manager → create a **utility** template (suggested name `sama_update`) whose body is exactly `{{1}}`, language Arabic; submit for approval → once approved: `WHATSAPP_REENGAGE_TEMPLATE=sama_update`. Without it, nothing can be sent outside the 24-hour window.

**5. Resend (~10 min + DNS wait)**
1. Add + verify your domain (DKIM/SPF records) → API key → `RESEND_API_KEY`.
2. `EMAIL_FROM="Sama Hotel <noreply@your-domain>"` (must be on the verified domain).

**6. Edge Function secrets (~5 min, after steps 4–5)**
```bash
supabase secrets set --project-ref vsxesrhoovabgsmvodvh \
  WHATSAPP_ACCESS_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... \
  WHATSAPP_REENGAGE_TEMPLATE=sama_update RESEND_API_KEY=... \
  EMAIL_FROM="Sama Hotel <noreply@your-domain>"
```
(or Dashboard → Edge Functions → automation-runner → Secrets — the function and its daily cron are already deployed.)

**7. Kiosk (~5 min)**
1. Choose a 4–8 digit PIN → `KIOSK_EXIT_PIN` in Vercel.
2. Open `https://<your-domain>/checkin` on the lobby tablet, fullscreen, and lock it (iPad Guided Access / Android app pinning). Staff exit = 5 taps in the top-left corner + PIN.

**8. Verify (~10 min)**
1. Sign in → create a test booking with your own +968 number → WhatsApp confirmation arrives (after step 4).
2. Message the business number from your phone → it appears in the Inbox live → reply.
3. Send `STOP` → the contact's consent flips off.
4. Submit the kiosk form → contact appears with `checkin_kiosk` consent source.
