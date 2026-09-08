# mock-supabase — local stand-in for the Supabase project

An in-memory emulator of the Supabase surface this app uses, so the guest
site, the back-office and the Playwright suite can run without network access
to `*.supabase.co` and without the service-role key.

```
npm run mock:db                      # http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key \
SUPABASE_SERVICE_ROLE_KEY=mock-service-role-key \
npm run dev                          # app at http://localhost:3000
```

`npm run e2e:local` does the whole thing: starts the mock, runs `next build`
with the env above (the `NEXT_PUBLIC_*` values are inlined at build time, so
they must be set *before* the build), then `playwright test`. Extra arguments
are forwarded to Playwright (`npm run e2e:local -- e2e/guest.spec.ts`);
`E2E_SKIP_BUILD=1` reuses the last build.

Staff logins (GoTrue emulation): `admin@sama.test` / `Admin1234!` (super_admin)
and `desk@sama.test` / `Desk1234!` (reservation_desk).

## What is emulated

| Surface | Notes |
|---|---|
| `GET/HEAD/POST/PATCH/DELETE /rest/v1/<table>` | `select` (columns, aliases, `*`, embedded resources via a hand-written FK map), filters `eq neq gt gte lt lte like ilike is in cs cd ov` + `not.`, `or=()` / `and=()`, `order=col.asc\|desc[.nullsfirst\|nullslast]`, `limit` / `offset` / `Range`, `Prefer: count=exact` (→ `Content-Range`), `return=representation\|minimal`, `resolution=merge-duplicates` + `on_conflict`, `Accept: application/vnd.pgrst.object+json` (406 `PGRST116` unless exactly one row). Errors use the PostgREST shape `{code,message,details,hint}` with Postgres codes (23505, 23503, 23514, 22023, P0001, 42501…). |
| Column defaults / generated columns | From migration 0005: uuid ids, `created_at`/`updated_at`, `bk_bookings.nights`, `contacts.market`, status defaults, enum CHECKs. `updated_at` is touched on update where the SQL trigger does. |
| Triggers | `bk_bookings` insert/update → mirror into CRM `bookings` (same id/ref, status/source mapping); cancel/no-show → pending/failed scheduled rows become `cancelled` and `requested`/`confirmed` add-on rows become `cancelled`; date change → `send_at` recomputed for pending pre-arrival/post-stay rows. |
| Add-ons (migration 0010) | `bk_addons` seeded with the three migration rows (`apex-zipline` OMR 5 per_person max 10, `transfer-up` / `transfer-down` OMR 15 per_car max 3, all `requires_note`; ids `60000000-…-00000000000N`), `bk_booking_addons` (unique booking × addon, `status` CHECK, cascade on booking delete, RESTRICT on add-on delete), `bk_bookings.addons_omr`. Embeds: `addons:bk_booking_addons(*, addon:bk_addons(*))` on `bk_bookings`, `booking:bk_bookings(...)` / `addon:bk_addons(...)` on `bk_booking_addons`. |
| `POST /rest/v1/rpc/<fn>` | `bk_availability`, `bk_quote` (with `p_addons = [{slug\|addon_id, quantity, note}]` → `addons` lines + `addons_total`; per_night × nights; taxable lines join the taxable base, untaxed ones are added after taxes), `bk_create_booking` (reads `p.addons`, stores `addons_omr`, inserts `bk_booking_addons` rows as `requested`), `bk_cancel_booking`, `bk_public_settings`, `bk_available_count`, `bk_effective_rate`, `bk_nightly_rates`, `bk_min_stay`, `bk_send_at`, `bk_muscat_today`, `my_role`. Validation errors carry the exact SQL messages (`sold_out`, `min_stay`, `capacity_exceeded`, `invalid_dates`, `past_date`, `too_far_ahead`, `too_many_nights`, `invalid_phone`, `guest_name_required`, `room_type_not_found`, `room_unavailable`, `room_invalid`, `booking_not_found`, `not_cancellable`, `addon_not_found`, `addon_quantity`). Refs are `SAMA-YY-XXXXXX`; contacts are upserted by phone; six scheduled rows per booking; availability is the per-night math of `bk_available_count`; money goes through `src/lib/booking-engine/pricing.ts` (the TS mirror of `bk_quote`). `bk_create_booking` is synchronous end-to-end, which serialises concurrent calls the way `pg_advisory_xact_lock` does. |
| Row-level security | Coarse, by bearer token: `mock-service-role-key` sees everything; a JWT issued by the mock gets the staff policies from migrations 0001/0005/0010 (`super_admin` writes, `reservation_desk` reads bk_* and reads/writes contacts/bookings/messages); anything else is `anon` (active room types, active add-ons + the anon-granted RPCs only; writes → 42501). |
| `POST /auth/v1/token?grant_type=password\|refresh_token`, `GET /auth/v1/user`, `POST /auth/v1/logout`, `/auth/v1/admin/users*` | HS256 JWTs (payload has `sub`, `email`, `role: authenticated`, `exp`); `admin/users` POST applies the `handle_new_user()` rule. |
| `POST /storage/v1/object/bk-room-images/*` | Returns `{Key, Id}`; nothing is stored. `GET /storage/v1/object/public/**` → 404. |
| `POST /__mock/reset` | Reseed (bookings, contacts, blocks, audit gone; settings and rooms back to the seed). `GET /__mock/health`. |

Seed = migration 0006 exactly (six room types with deterministic ids
`10000000-0000-4000-8000-00000000000N`, 60 rooms `20000000-…`, the weekend
+20 % plan `30000000-…-000000000001`, all settings), the three add-ons from
migration 0010 (`60000000-…-00000000000N`), plus the five CRM automations
with the booking ones disabled, two staff profiles, no bookings.
The cron secret is `mock-cron-secret`.

## Limits (what the real database still has to prove)

- No real RLS: policies are approximated per table/role, `with check` is not
  evaluated, and `security definer` semantics are implicit. Verify against
  the live project with the anon key.
- No transactions / rollback across multiple REST calls, no advisory locks —
  atomicity comes from the single-threaded event loop.
- Only the filters and embeds the app uses are implemented (no
  `referencedTable.column` filters, no `!inner`, no full-text search, no
  `count=planned|estimated`, no CSV).
- `nulls` ordering follows Postgres defaults (ASC → nulls last, DESC → nulls
  first) unless specified.
- `numeric` values are rounded to 3 dp on write; timestamps normalised to
  UTC ISO strings.
- Time is real wall-clock time (no fake clock); `bk_muscat_today()` uses the
  TS `muscatToday()`.
- Storage keeps nothing and never serves files.
- Realtime, Edge Functions, pg_cron and the WhatsApp/Resend providers are
  out of scope (sends are `stubbed` because no provider env is set).
