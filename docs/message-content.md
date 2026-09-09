# Guest messaging — message content (source of truth)

Everything the booking engine sends to guests, in both languages. WhatsApp
bodies below are the EXACT texts submitted to Meta (category **Utility**,
languages `en` + `ar`). Code lives in `src/lib/messaging/`:

| Kind | WhatsApp template (Meta) | Builder | Sent |
|---|---|---|---|
| `confirmation` | `sama_booking_confirmation` | `templates/confirmation.ts` | immediately after `bk_create_booking` (inline `dispatchForBooking`), cron as safety net |
| `pre_arrival` | `sama_pre_arrival_guide` | `templates/pre-arrival.ts` | `messaging.pre_arrival_days_before` days before check-in at `pre_arrival_time` (default 3 days, 10:00 Muscat) |
| `post_stay` | `sama_post_stay_review` | `templates/post-stay.ts` | `messaging.post_stay_days_after` days after check-out at `post_stay_time` (default 1 day, 11:00 Muscat) |

Template names are configurable in `bk_settings.messaging.whatsapp_templates`
(defaults above). The guest's `preferred_lang` (`en` | `ar`) picks the language
code sent to Meta and the email language.

## Rules that apply to every message

- Meta template **parameters never contain newlines**, tabs or 4+ consecutive
  spaces — `sendWhatsAppTemplate` collapses whitespace, and the builders never
  put line breaks in a parameter in the first place.
- Dates: `formatLongDate(date, locale)` → `Thu, 17 Sep 2026` (EN) / Arabic long
  date with **Latin digits** (AR). Money: `formatOmr(total)` → `165.110`.
- Room name: `bk_room_types.name_en` / `name_ar`. Nights: whole number as a string.
- Guest name: `bk_bookings.guest_name` as entered (whitespace collapsed).
- Review link (post-stay `{{2}}`): `settings.reviews.google` if set, else
  `settings.reviews.tripadvisor`, else `settings.contact.website`. Never empty.
- Directions link (pre-arrival `{{3}}`): `settings.contact.maps_link`.
- Pay at the hotel — say it everywhere. No online payment exists.
- Add-ons (APEX Zipline, 4WD transfers — `bk_booking_addons`, migration 0010):
  `bk_bookings.total_omr` already includes them, so the WhatsApp totals are
  right without touching the approved Meta bodies. Only the **emails** list
  them (`addonItemRows` / `addonSummaryRow` / `transferUpLine` in
  `templates/shared.ts`); rows with status `cancelled` never appear.
- Every send writes `bk_message_log` and (real sends only) a CRM `messages` row
  so the inbox shows the message under the guest.

---

## 1. `sama_booking_confirmation` — Utility

Keep this body strictly about the booking. Meta rejected an earlier version whose last line promised "directions and tips" as `INCORRECT_CATEGORY`: any utility text with extra, non-transactional content is classified as marketing.

Parameters (order is contractual — `{{n}}` ↔ index `n-1` of `params`):

| `{{n}}` | Value | Example |
|---|---|---|
| `{{1}}` | guest name | `Ahmed Al Nabhani` |
| `{{2}}` | booking ref | `SAMA-26-K7P3QX` |
| `{{3}}` | room type name in the guest's language | `Deluxe Room — Mountain & Sunset View` |
| `{{4}}` | check-in long date | `Thu, 17 Sep 2026` |
| `{{5}}` | check-out long date | `Sat, 19 Sep 2026` |
| `{{6}}` | nights | `2` |
| `{{7}}` | total in OMR, 3 dp, **number only** (the body carries the currency) | `129.276` |

### en
```
Hello {{1}}, your stay at Sama Hotel, Jabal Al Akhdar is confirmed 🌄
Booking ref: {{2}}
Room: {{3}}
Check-in: {{4}} (from 2:00 PM)
Check-out: {{5}} (by 12:00 PM)
Nights: {{6}}
Total: OMR {{7}} — payable at the hotel, no payment needed now.
Need to change your booking? Reply to this message — we're happy to help.
```

### ar
```
أهلاً {{1}}، تم تأكيد حجزكم في فندق سما – الجبل الأخضر 🌄
رقم الحجز: {{2}}
الغرفة: {{3}}
تسجيل الوصول: {{4}} (من الساعة 2:00 ظهراً)
تسجيل المغادرة: {{5}} (حتى الساعة 12:00 ظهراً)
عدد الليالي: {{6}}
الإجمالي: {{7}} ر.ع — يُدفع في الفندق، ولا يلزم أي دفع الآن.
لأي تعديل على الحجز، راسلونا هنا ويسعدنا مساعدتكم.
```

---

## 2. `sama_pre_arrival_guide` — Utility

| `{{n}}` | Value | Example |
|---|---|---|
| `{{1}}` | guest name | `Ahmed Al Nabhani` |
| `{{2}}` | check-in long date | `Thu, 17 Sep 2026` |
| `{{3}}` | directions link (`settings.contact.maps_link`) | `https://maps.app.goo.gl/YC7RXydtYz61cFZj9` |

### en
```
Hello {{1}}, we're looking forward to welcoming you on {{2}}! A few things before you set off:
🚙 A 4WD is required — the checkpoint at Birkat Al Mouz doesn't allow 2WD cars up the mountain. No 4WD? Reply here and we'll help arrange a transfer.
🧥 It's 10–15°C cooler than Muscat; bring warm layers.
⛽ Fill up in Nizwa or Birkat Al Mouz before the climb.
📍 Directions: {{3}}
Check-in is from 2:00 PM. Running late? Just let us know.
See you soon at Sama Hotel ☕
```

### ar
```
أهلاً {{1}}، نتطلع لاستقبالكم يوم {{2}}! بعض الإرشادات قبل الانطلاق:
🚙 يلزم وجود سيارة دفع رباعي — نقطة التفتيش في بركة الموز لا تسمح بصعود سيارات الدفع الثنائي. لا تملكون دفع رباعي؟ راسلونا هنا لترتيب خدمة النقل.
🧥 الطقس أبرد من مسقط بحوالي 10–15 درجة، فأحضروا ملابس دافئة.
⛽ عبّئوا الوقود في نزوى أو بركة الموز قبل الصعود.
📍 الاتجاهات: {{3}}
تسجيل الوصول من الساعة 2:00 ظهراً. في حال التأخر، يرجى إبلاغنا.
نراكم قريباً في فندق سما ☕
```

---

## 3. `sama_post_stay_review` — Marketing

Category **Marketing** because of the `SAMA10` offer (a review request alone would be utility). The dispatcher therefore sends the post-stay message — WhatsApp *and* email — only to guests whose CRM contact has marketing consent (`contacts.consent`); everyone else is skipped with `no_marketing_consent`. Website bookings create contacts without consent, so consent comes from the check-in kiosk, the inbox guest panel or a `SUBSCRIBE`-style reply.

| `{{n}}` | Value | Example |
|---|---|---|
| `{{1}}` | guest name | `Ahmed Al Nabhani` |
| `{{2}}` | review link (Google → TripAdvisor → website) | `https://g.page/r/.../review` |

### en
```
Thank you for staying with us, {{1}} 🌿 We hope the mountain air did you good.
If you have a minute, a short review helps us a lot: {{2}}
Come back anytime — use code SAMA10 for 10% off your next direct booking.
```

### ar
```
شكراً لإقامتكم معنا {{1}} 🌿 نأمل أن تكونوا قد استمتعتم بأجواء الجبل.
إن سمح وقتكم، يسعدنا تقييمكم القصير لنا هنا: {{2}}
نرحب بكم دائماً — استخدموا الرمز SAMA10 للحصول على خصم 10٪ على حجزكم المباشر القادم.
```

---

## Email content

Emails are hand-built responsive HTML (600 px, inline styles, maroon `#3b171b`
header with gold "SAMA HOTEL | فندق سما", white card, `dir`/`lang` per locale,
Tajawal / Nunito Sans font stack) plus a plain-text alternative. Rendered by
`src/lib/messaging/templates/email-shell.ts`; preview any of them from the
back-office (`renderPreview(kind, "email", locale)`).

### Confirmation email (full version)

Subject — EN: `Booking confirmed — {ref} · Sama Hotel, Jabal Al Akhdar`
Subject — AR: `تم تأكيد حجزكم — {ref} · فندق سما، الجبل الأخضر`

1. Greeting: *Hello {name}, your stay at Sama Hotel, Jabal Al Akhdar is confirmed.*
2. Booking details: ref · guest · room · check-in (day name, from 2:00 PM) · check-out (day name, by 12:00 PM) · nights · adults / children · special requests (if any).
3. Itemised table: room subtotal · discount (only when > 0, with promo code) · service charge 8 % · tourism fee 4 % · VAT 5 % · one line per add-on `name × qty — note` with its line total · **Add-ons (paid at the hotel)** subtotal (`addons_omr`) · **Total OMR** (all via `formatOmr`). Add-ons are untaxed, so they sit after the tax lines; the block is omitted entirely when nothing was booked.
4. Big callout: **Pay at the hotel — no payment needed now.** Cash or card on arrival.
5. What happens next: we message you 3 days before arrival with directions and tips (4WD required); check-in from 2:00 PM; reply on WhatsApp anytime. When a `transfer-up` add-on is booked the 4WD remark is replaced by *Your 4WD pickup at the Birkat Al Mouz checkpoint is booked — we will confirm the time on WhatsApp. Park at the checkpoint car park and message us when you arrive.*
6. Cancellation policy summary: `settings.cancellation.policy_{locale}`.
7. Buttons: **Manage booking** (manage URL) · View booking.
8. Hotel contacts: phone, WhatsApp link, email, address, Google Maps link.

### Pre-arrival email

Subject — EN: `Before you set off — your stay at Sama Hotel starts {check_in}`
Subject — AR: `قبل الانطلاق — إقامتكم في فندق سما تبدأ {check_in}`

The five-point guide from `docs/hotel-facts.md`:

1. 🚙 **4WD is mandatory** — the police checkpoint at Birkat Al Mouz does not allow 2WD cars up. No 4WD? Park at the checkpoint and arrange a transfer with us in advance — reply to this message. With a `transfer-up` add-on this item becomes 🚙 **Your 4WD pickup is booked** — *Your 4WD pickup at the Birkat Al Mouz checkpoint is booked — we will confirm the time on WhatsApp. Park at the checkpoint car park and message us when you arrive.* (and the preheader says "4WD pickup booked").
2. 🧥 **Warm layers** — 10–15 °C cooler than Muscat; evenings are cold in winter.
3. ⛽ **Fuel up** in Nizwa or Birkat Al Mouz — the last petrol station before the climb.
4. 📍 **Directions** button (maps link) · check-in from 2:00 PM · running late? just let us know.
5. ☕ **While you're here** — pomegranate & rose season activities, The Peak speciality coffee shop (07:00–22:00), Sama Restaurant. WhatsApp / phone for anything at all.

Plus booking summary (ref, room, dates, and an **Add-ons** row such as `APEX Zipline × 2 · 4WD transfer up — Birkat Al Mouz to the hotel × 1` when any were booked) and the contacts block.

### Post-stay email

Subject — EN: `Thank you for staying with us, {name}`
Subject — AR: `شكراً لإقامتكم معنا، {name}`

Thank-you note, review button(s) — Google and/or TripAdvisor when configured,
otherwise the website — the **SAMA10** returning-guest code (10 % off the next
direct booking, valid 12 months), and the contacts block.

---

## Statuses

`bk_scheduled_messages.status`: `pending → sending → sent | failed | stubbed | skipped` (or `cancelled` by the booking trigger).
Retry backoff on retryable errors: +5 min, +30 min, +3 h, then `failed` (`nextRetryAt`).
`bk_message_log.status`: `sent | failed | stubbed | test`, then `delivered | read | failed` from Meta receipts (webhook).
