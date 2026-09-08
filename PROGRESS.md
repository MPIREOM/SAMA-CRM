# PROGRESS.md — Sama Hotel booking platform

Resume instructions: read this file + DECISIONS.md, then continue from the first unchecked item.
Branch: `feat/booking-site` (based on `claude/hotel-crm-nextjs-obex8g`, the production branch).

- [x] Phase 0 — audit CRM codebase + live schema, write docs/hotel-facts.md, docs/existing-schema.md, DECISIONS.md (2026-09-07 14:40 UTC)
- [x] Phase 1 — bk_ schema migrations 0005–0007 applied to sama-crm, seed verified with a real booking, booking-engine TS + 21 tests (14:52 UTC)
- [x] Phase 2a — guest site (EN/AR), 17 pages/components, ~390 strings per language (15:40 UTC)
- [x] Phase 2b — back-office: calendar, reservations, rooms, rates, blocks, messaging, settings, audit, export (15:40 UTC)
- [x] Phase 3 — messaging: templates EN/AR × email/WhatsApp, providers, dispatcher, cron route, webhook receipts, 58 tests (15:40 UTC)
- [x] Phase 4 — QA pass 1: Supabase emulator, 17 Playwright scenarios green, 3 real bugs fixed, Lighthouse 85/100/100/100, docs/qa-report.md (16:55 UTC)
- [x] Phase 5 — polish: responsive staff shell, pluralisation, a11y, default language, HANDOFF.md (17:10 UTC)
- [x] Phase 6 — QA pass 2: build, 115 unit, 17/17 e2e, mobile shell verified; real-DB RLS check → migration 0008 (17:35 UTC)
- [ ] Phase 7 — push branch + PR + Vercel deploy + live smoke test — BLOCKED on repository push authorisation; git bundle + HANDOFF delivered to the owner (OneDrive Website/booking-site-build). Resume: `git push origin feat/booking-site`, open PR into claude/hotel-crm-nextjs-obex8g, then run HANDOFF §9 checks.

## 8 September 2026 — owner change requests
- [x] New room + facility photos processed and mapped (migration 0009)
- [x] Room counts removed from home copy (EN/AR)
- [x] Add-ons: APEX Zipline + 4WD transfers — schema (0010), quote/create RPCs verified on the live DB, guest flow, APEX page, emails, back-office `/addons`, reservation add-on lines, dashboard/list/CSV, emulator, 20/20 e2e
- [ ] Push + deploy (still blocked on repository authorisation) — bundle refreshed in OneDrive Website/booking-site-build
