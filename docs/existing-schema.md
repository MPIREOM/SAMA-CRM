# Existing CRM schema (live project `sama-crm` / vsxesrhoovabgsmvodvh) — introspected 2026-09-07

Row counts at introspection: contacts 0, bookings 0, messages 0, campaigns 0, automations 5, profiles 1.
RLS enabled on every table. Extensions: pg_cron, pg_net (schema `extensions`).

| table | key columns | notes |
|---|---|---|
| `contacts` | id uuid pk, name text NOT NULL, phone text UNIQUE NOT NULL (E.164), email, lang ('ar' default), market (GENERATED from phone), tags text[], consent bool, consent_source, consent_at, last_stay date, room_type text, birthday date, last_inbound_at timestamptz, nationality, created_at | Guest identity for the CRM. **The booking engine upserts guests here** (`bk_bookings.contact_id → contacts.id`). |
| `bookings` | id uuid pk, ref text UNIQUE, contact_id → contacts, guest, phone, check_in date, check_out date, room_type text, source ∈ Website/OTA/Offline, status ('Confirmed' default; Cancelled/Completed), created_at | Simple CRM booking record, no money fields. **Mirrored from `bk_bookings` by trigger** (same id, same ref) so the inbox guest panel and win-back/birthday automations keep working. |
| `messages` | id, campaign_id, automation_id, contact_id, booking_id → bookings, direction (outbound/inbound), channel, status (sent/delivered/read/failed/received), body, provider_msg_id, sent_at | Inbox ledger. The WhatsApp webhook updates `status` by `provider_msg_id`. Booking-engine sends are also logged here (with `booking_id`) so they appear in the inbox thread. |
| `automations` | id, name, trigger_kind (booking_created/pre_arrival/post_stay/birthday/win_back), offset_days, channel, msg_type, market, template, enabled | Executed daily 09:00 Muscat by the `automation-runner` Edge Function (pg_cron `sama-automation-runner-daily`). The three booking-driven automations are **disabled by migration 0006** because the booking engine now sends those messages with approved Meta templates; birthday & win_back stay on. |
| `campaigns` | id, name, channel, segment, market, body, status, sent/opened/clicked, scheduled_for | Untouched. |
| `profiles` | id → auth.users, full_name, role ∈ super_admin / reservation_desk | **Reused as the staff table** for the back-office (no `bk_staff`). super_admin = full PMS access; reservation_desk = bookings, calendar, blocks, messaging queue. |

Functions: `my_role()` (security definer, authenticated), `handle_new_user()` trigger on auth.users.
Storage: no buckets before this work (migration 0005 adds `bk-room-images`, public read).

Nothing in the existing schema was dropped, renamed or altered. Only additive `bk_*` objects, one storage bucket, one data update (`automations.enabled`) and one pg_cron job were added.
