// Pre-arrival guide — WhatsApp `sama_pre_arrival_guide` (3 params) + the
// five-point email from docs/hotel-facts.md.
import type { BuiltMessage, Locale, TemplateContext } from "../types";
import { renderEmail, type Block } from "./email-shell";
import {
  addonSummaryRow,
  bookingSummaryRows,
  contactsBlock,
  emailFooter,
  friendlyTime,
  guestName,
  hasTransferUp,
  hotelName,
  longDate,
  pick,
  transferUpLine,
} from "./shared";
import { cleanParam, DEFAULT_TEMPLATE_NAMES, renderWhatsAppBody } from "./whatsapp-bodies";

/** {{1}} name · {{2}} check-in date · {{3}} directions link. */
export function preArrivalParams(ctx: TemplateContext, locale: Locale): string[] {
  return [guestName(ctx), longDate(ctx.booking.check_in, locale), cleanParam(ctx.links.maps)];
}

export function preArrivalSubject(ctx: TemplateContext, locale: Locale): string {
  const date = longDate(ctx.booking.check_in, locale);
  return pick(locale, {
    en: `Before you set off — your stay at Sama Hotel starts ${date}`,
    ar: `قبل الانطلاق — إقامتكم في فندق سما تبدأ ${date}`,
  });
}

export function buildPreArrival(ctx: TemplateContext, locale: Locale): BuiltMessage {
  const b = ctx.booking;
  const name = guestName(ctx);
  const params = preArrivalParams(ctx, locale);
  const templateName = ctx.settings.messaging.whatsapp_templates.pre_arrival || DEFAULT_TEMPLATE_NAMES.pre_arrival;
  const checkInTime = friendlyTime(ctx.settings.times.check_in, locale);
  const whatsapp = ctx.settings.contact.whatsapp;
  const altitude = ctx.settings.hotel.altitude_m.toLocaleString("en");
  const h = ctx.settings.hotel.drive_from_muscat_h;
  const driveEn = h === 1 ? "1 hour" : `${h} hours`;
  const driveAr = h === 1 ? "ساعة واحدة" : h === 2 ? "ساعتين" : `${h} ساعات`;
  const transferUp = hasTransferUp(ctx);
  const summary = bookingSummaryRows(ctx, locale);
  const addonsRow = addonSummaryRow(ctx, locale);
  if (addonsRow) summary.push(addonsRow);

  const blocks: Block[] = [
    {
      type: "heading",
      text: pick(locale, {
        en: `Hello ${name}, we're looking forward to welcoming you on ${longDate(b.check_in, locale)}!`,
        ar: `أهلاً ${name}، نتطلع لاستقبالكم يوم ${longDate(b.check_in, locale)}!`,
      }),
    },
    {
      type: "paragraph",
      text: pick(locale, {
        en: `${hotelName(ctx, locale)} sits at about ${altitude} m in Jabal Al Akhdar, roughly ${driveEn} by car from Muscat. A few things to know before you set off:`,
        ar: `يقع ${hotelName(ctx, locale)} على ارتفاع نحو ${altitude} متر في الجبل الأخضر، على بُعد حوالي ${driveAr} بالسيارة من مسقط. بعض الإرشادات قبل الانطلاق:`,
      }),
    },
    {
      type: "guide",
      items: [
        transferUp
          ? {
              emoji: "🚙",
              title: pick(locale, { en: "Your 4WD pickup is booked", ar: "تم حجز سيارة الدفع الرباعي لاستقبالكم" }),
              text: transferUpLine(locale),
            }
          : {
              emoji: "🚙",
              title: pick(locale, { en: "A 4WD is mandatory", ar: "سيارة الدفع الرباعي إلزامية" }),
              text: pick(locale, {
                en: "The police checkpoint at Birkat Al Mouz does not allow 2WD cars up the mountain. No 4WD? Park at the checkpoint and arrange a transfer with us in advance — just reply to our WhatsApp message.",
                ar: "نقطة التفتيش في بركة الموز لا تسمح بصعود سيارات الدفع الثنائي. لا تملكون دفع رباعي؟ يمكنكم ركن السيارة عند نقطة التفتيش وترتيب خدمة النقل معنا مسبقاً — راسلونا على واتساب.",
              }),
            },
        {
          emoji: "🧥",
          title: pick(locale, { en: "Bring warm layers", ar: "أحضروا ملابس دافئة" }),
          text: pick(locale, {
            en: "It's 10–15 °C cooler than Muscat, and evenings are properly cold in winter.",
            ar: "الطقس أبرد من مسقط بحوالي 10–15 درجة، والأمسيات باردة جداً في الشتاء.",
          }),
        },
        {
          emoji: "⛽",
          title: pick(locale, { en: "Fuel up before the climb", ar: "عبّئوا الوقود قبل الصعود" }),
          text: pick(locale, {
            en: "Fill the tank in Nizwa or Birkat Al Mouz — it's the last petrol station before the mountain road.",
            ar: "عبّئوا الخزان في نزوى أو بركة الموز — آخر محطة وقود قبل طريق الجبل.",
          }),
        },
        {
          emoji: "📍",
          title: pick(locale, { en: `Directions & check-in from ${checkInTime}`, ar: `الاتجاهات وتسجيل الوصول من الساعة ${checkInTime}` }),
          text: pick(locale, {
            en: "Use the Directions button below. Running late or arriving after dark? Just let us know — we'll keep the lights on.",
            ar: "استخدموا زر الاتجاهات أدناه. في حال التأخر أو الوصول ليلاً، يرجى إبلاغنا — سنكون بانتظاركم.",
          }),
        },
        {
          emoji: "☕",
          title: pick(locale, { en: "While you're here", ar: "خلال إقامتكم" }),
          text: pick(locale, {
            en: `Sunrise from the terraces, The Peak speciality coffee shop (07:00–22:00), Sama Restaurant, and — in season — pomegranate and rose activities in the villages nearby. Anything at all: WhatsApp us on ${whatsapp}.`,
            ar: `شروق الشمس من الشرفات، مقهى The Peak للقهوة المختصة (07:00–22:00)، مطعم سما، وفي الموسم أنشطة الرمان والورد في القرى المجاورة. لأي طلب: راسلونا على واتساب ${whatsapp}.`,
          }),
        },
      ],
    },
    {
      type: "buttons",
      buttons: [
        { label: pick(locale, { en: "Directions to Sama Hotel", ar: "الاتجاهات إلى فندق سما" }), url: ctx.links.maps },
        { label: pick(locale, { en: "View booking", ar: "عرض الحجز" }), url: ctx.links.booking, secondary: true },
      ],
    },
    { type: "details", rows: summary },
    {
      type: "callout",
      title: pick(locale, { en: "Pay at the hotel", ar: "الدفع في الفندق" }),
      text: pick(locale, {
        en: "Cash or card on arrival — nothing to pay before you get here.",
        ar: "نقداً أو بالبطاقة عند الوصول — لا يلزم أي دفع قبل وصولكم.",
      }),
    },
    { type: "divider" },
    contactsBlock(ctx, locale),
  ];

  const email = renderEmail({
    locale,
    title: preArrivalSubject(ctx, locale),
    preheader: pick(locale, {
      en: `${transferUp ? "4WD pickup booked" : "4WD required"} · warm layers · fuel up in Nizwa · directions inside`,
      ar: `${transferUp ? "تم حجز سيارة الدفع الرباعي" : "يلزم دفع رباعي"} · ملابس دافئة · عبّئوا الوقود في نزوى · الاتجاهات بالداخل`,
    }),
    blocks,
    footer: emailFooter(ctx, locale),
  });

  return {
    whatsapp: {
      templateName,
      langCode: locale,
      params,
      body: renderWhatsAppBody("pre_arrival", locale, params),
    },
    email: { subject: preArrivalSubject(ctx, locale), html: email.html, text: email.text },
  };
}
