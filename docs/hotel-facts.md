# Sama Hotel — facts used by the booking platform

Source: `Hotel Information 2.xlsx` (owner's Website folder), Sama brand guideline, kickoff prompt.
Anything marked *placeholder* is editable in `/settings`, `/rooms` or `/rates` and should be
reviewed by the owner before launch.

## Property
- Name: **Sama Hotel** (Arabic: **فندق سما**). Legal entity: Riyadha Al Jabal Al Akhdar Trading Co. L.L.C (Sama Hotels), PO Box 20, PC 621, Jabal Akhdar, Sultanate of Oman.
- Location: Sayq, Jabal Al Akhdar (الجبل الأخضر), Ad Dakhiliyah, Oman — ~2,000–2,500 m altitude, about 2 hours' drive from Muscat.
- Google Maps: https://maps.app.goo.gl/YC7RXydtYz61cFZj9
- 3-star mountain resort, **60 units** (incl. 14 chalets), canyon/mountain views, sunrise & sunset sides.
- Facilities: Sama Restaurant (multi-cuisine, 06:00–22:00, 60 seats), **The Peak** speciality coffee shop (07:00–22:00), lounge & pergola seating, outdoor swimming pool & jacuzzi on the cliff edge, children's park, Sama Tower, fitness centre, Diana Point, free Wi-Fi, laundry, room service (12 h), shisha area, banquet hall.
- Family services: babysitter on request (free), children playground (free), children pool (common). **APEX Zipline** add-on OMR 5.
- Meals (OMR): breakfast 5, lunch 8, dinner 8. Kids menu and packed meals available.

## Room types (6) — canonical values match the CRM `ROOM_TYPES`
| slug | CRM value | EN name | AR name | size | bed | capacity | units* | base OMR* |
|---|---|---|---|---|---|---|---|---|
| chalet | Chalet | Chalet | شاليه | — | King | 2 adults + 1 child | 14 | 65 |
| deluxe-mountain-view | Deluxe Room Mountain View | Deluxe Room — Mountain & Sunset View | غرفة ديلوكس بإطلالة على الجبل | 27 m² | Twin or king (guest's choice) | 2 + 1 | 14 | 55 |
| deluxe-city-view | Deluxe Room City View | Deluxe Room — City & Sunrise View | غرفة ديلوكس بإطلالة على المدينة | 27 m² | Twin or king (guest's choice) | 2 + 1 | 14 | 50 |
| family-deluxe | Family Deluxe | Family Deluxe Room | غرفة عائلية ديلوكس | 27 m² | King | 2 + 2 | 8 | 70 |
| sama-suite-city-view | Sama Suite City View | Sama Suite — City View | جناح سما بإطلالة على المدينة | 29 m² | King | 2 + 1 | 5 | 85 |
| sama-suite-mountain-view | Sama Suite Mountain View | Sama Suite — Mountain View with Jacuzzi | جناح سما بإطلالة على الجبل | 29 m² | Twin | 2 + 1 | 5 | 95 |

\* Unit split (14/14/14/8/5/5 = 60) and rates are **placeholders** — only the total of 60 and the 14 chalets are confirmed. Fix them in `/rooms` and `/rates`.

Bed layouts: the two Deluxe types offer **twin beds or a king bed** (`bk_room_types.bed_options`, migration 0013). The guest picks one when booking; staff assign a room with that layout, so each physical Deluxe room's layout should be recorded on `/rooms` (Rooms tab → Edit → Beds). Other types have one fixed layout (the *bed* column).

## Policies (defaults in `bk_settings`)
- Check-in 14:00, check-out 12:00.
- Cancellation: free up to **48 hours** before arrival for individual bookings (groups: 24 days). Later cancellations / no-shows: first night charged (placeholder policy text — edit in Settings).
- Extra bed OMR 10 per night. Infants free; children 8 and above chargeable (placeholder — children currently priced as included up to the room's max_children).
- No pets. Non-smoking rooms.
- Payment: **at the hotel** (cash or card). No online payment.
- Taxes shown as separate lines: tourism fee 4 %, service charge 8 %, VAT 5 % (VAT applied on room + fees). Each toggleable.
- Weekend nights: Thursday & Friday (+20 % seed rate plan).
- Currency OMR, 3 decimals (baisa).

## Contacts
- Phone: +968 22507681 (also 82/83/84). Reservations mobile/WhatsApp: +968 99475688. Sales: +968 98524012.
- reservations@samahotel.net · operations@samahotel.net · accounts@samahotel.net
- Website domain: samahotel.net. Booking site planned at book.samahotel.net.

## Brand (Sama brand guideline)
- Sama Gold #C5A04F · Pomegranate Maroon #3B171B · Maroon #841424 · Al-Jabal Green #098E4B · Stone Brown #B28855 · Deep Blue Sky #327DD8 · Grey #999999 · White.
- Fonts: Nunito Sans (EN primary), Hacen Liner (AR primary — not web-available), Tajawal (secondary, used on web).
- Logo: pomegranate flower mark. Files in `Brand Guideline/` (Logo.png, white color.png).

## Pre-arrival guide content
1. 4WD mandatory — the police checkpoint at Birkat Al Mouz does not allow 2WD cars up. Guests without 4WD can park at the checkpoint and arrange a transfer with the hotel in advance.
2. Warm layers — 10–15 °C cooler than Muscat; cold evenings in winter.
3. Fuel up in Nizwa / Birkat Al Mouz — last petrol station before the climb.
4. Directions link; check-in from 14:00; late arrival → reply to the message.
5. WhatsApp/phone; pomegranate & rose season activities; The Peak coffee shop.

## Post-stay
Thank-you, Google review link, optional TripAdvisor, returning-guest code **SAMA10** (10 % off direct bookings, valid 12 months).
