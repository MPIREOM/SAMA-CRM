// Booking confirmation — WhatsApp `sama_booking_confirmation` (7 params) + full email.
import { formatOmr } from "@/lib/booking-engine/pricing";
import type { BuiltMessage, Locale, TemplateContext } from "../types";
import { renderEmail, type Block } from "./email-shell";
import {
  addonItemRows,
  bookingSummaryRows,
  contactsBlock,
  emailFooter,
  friendlyTime,
  guestName,
  hasTransferUp,
  hotelName,
  longDate,
  nightsOf,
  pick,
  roomName,
  roomNameWithBeds,
  transferUpLine,
} from "./shared";
import { cleanParam, DEFAULT_TEMPLATE_NAMES, renderWhatsAppBody } from "./whatsapp-bodies";

/**
 * {{1}} name · {{2}} ref · {{3}} room · {{4}} check-in · {{5}} check-out ·
 * {{6}} nights · {{7}} total OMR (number only — the body carries "OMR"/"ر.ع").
 */
export function confirmationParams(ctx: TemplateContext, locale: Locale): string[] {
  const b = ctx.booking;
  return [
    guestName(ctx),
    cleanParam(b.ref),
    roomNameWithBeds(ctx, locale),
    longDate(b.check_in, locale),
    longDate(b.check_out, locale),
    String(nightsOf(ctx)),
    formatOmr(b.total_omr),
  ];
}

function itemisedRows(ctx: TemplateContext, locale: Locale): Block {
  const b = ctx.booking;
  const t = ctx.settings.taxes;
  const rows: { label: string; value: string; total?: boolean; negative?: boolean }[] = [];
  rows.push({
    label: pick(locale, {
      en: `Room subtotal (${nightsOf(ctx)} ${nightsOf(ctx) === 1 ? "night" : "nights"})`,
      ar: `إجمالي الغرفة (${nightsOf(ctx)} ${nightsOf(ctx) === 1 ? "ليلة" : "ليالٍ"})`,
    }),
    value: `OMR ${formatOmr(b.room_subtotal_omr)}`,
  });
  if (b.discount_omr > 0) {
    const code = b.promo_code ? ` (${cleanParam(b.promo_code)})` : "";
    rows.push({
      label: pick(locale, { en: `Discount${code}`, ar: `الخصم${code}` }),
      value: `− OMR ${formatOmr(b.discount_omr)}`,
      negative: true,
    });
  }
  if (t.service_charge_enabled || b.service_charge_omr > 0) {
    rows.push({
      label: pick(locale, { en: `Service charge ${t.service_charge_pct} %`, ar: `رسوم الخدمة ${t.service_charge_pct}٪` }),
      value: `OMR ${formatOmr(b.service_charge_omr)}`,
    });
  }
  if (t.tourism_fee_enabled || b.tourism_fee_omr > 0) {
    rows.push({
      label: pick(locale, { en: `Tourism fee ${t.tourism_fee_pct} %`, ar: `رسوم السياحة ${t.tourism_fee_pct}٪` }),
      value: `OMR ${formatOmr(b.tourism_fee_omr)}`,
    });
  }
  if (t.vat_enabled || b.vat_omr > 0) {
    rows.push({
      label: pick(locale, { en: `VAT ${t.vat_pct} %`, ar: `ضريبة القيمة المضافة ${t.vat_pct}٪` }),
      value: `OMR ${formatOmr(b.vat_omr)}`,
    });
  }
  // Add-ons are not taxed: they follow the tax lines with their own subtotal.
  rows.push(...addonItemRows(ctx, locale));
  rows.push({
    label: pick(locale, { en: "Total", ar: "الإجمالي" }),
    value: `OMR ${formatOmr(b.total_omr)}`,
    total: true,
  });
  return { type: "items", rows };
}

export function confirmationSubject(ctx: TemplateContext, locale: Locale): string {
  return pick(locale, {
    en: `Booking confirmed — ${ctx.booking.ref} · Sama Hotel, Jabal Al Akhdar`,
    ar: `تم تأكيد حجزكم — ${ctx.booking.ref} · فندق سما، الجبل الأخضر`,
  });
}

export function buildConfirmation(ctx: TemplateContext, locale: Locale): BuiltMessage {
  const b = ctx.booking;
  const name = guestName(ctx);
  const params = confirmationParams(ctx, locale);
  const templateName = ctx.settings.messaging.whatsapp_templates.confirmation || DEFAULT_TEMPLATE_NAMES.confirmation;
  const days = ctx.settings.messaging.pre_arrival_days_before;
  const checkInTime = friendlyTime(ctx.settings.times.check_in, locale);

  const guestsLine = pick(locale, {
    en: `${b.adults} ${b.adults === 1 ? "adult" : "adults"}${b.children > 0 ? `, ${b.children} ${b.children === 1 ? "child" : "children"}` : ""}`,
    ar: `${b.adults} ${b.adults === 1 ? "بالغ" : "بالغين"}${b.children > 0 ? `، ${b.children} ${b.children === 1 ? "طفل" : "أطفال"}` : ""}`,
  });

  const details = bookingSummaryRows(ctx, locale);
  details.push({ label: pick(locale, { en: "Guests", ar: "الضيوف" }), value: guestsLine });
  const transferUp = hasTransferUp(ctx);
  const pickup = transferUp ? ` ${transferUpLine(locale)}` : "";
  if (b.special_requests && b.special_requests.trim()) {
    details.push({
      label: pick(locale, { en: "Special requests", ar: "طلبات خاصة" }),
      value: cleanParam(b.special_requests),
    });
  }

  const blocks: Block[] = [
    {
      type: "heading",
      text: pick(locale, {
        en: `Hello ${name}, your stay at ${hotelName(ctx, locale)}, Jabal Al Akhdar is confirmed 🌄`,
        ar: `أهلاً ${name}، تم تأكيد حجزكم في ${hotelName(ctx, locale)} – الجبل الأخضر 🌄`,
      }),
    },
    {
      type: "paragraph",
      text: pick(locale, {
        en: `Thank you for booking direct. Your booking reference is **${b.ref}** — keep it handy for check-in and any questions.`,
        ar: `شكراً لحجزكم المباشر معنا. رقم حجزكم هو **${b.ref}** — احتفظوا به لتسجيل الوصول وأي استفسار.`,
      }),
    },
    { type: "details", rows: details },
    itemisedRows(ctx, locale),
    {
      type: "callout",
      title: pick(locale, {
        en: "Pay at the hotel — no payment needed now",
        ar: "الدفع في الفندق — لا يلزم أي دفع الآن",
      }),
      text: pick(locale, {
        en: "Settle the total on arrival by cash or card. Nothing has been charged and no card details are required.",
        ar: "يتم تسديد المبلغ عند الوصول نقداً أو بالبطاقة. لم يتم خصم أي مبلغ ولا حاجة لبيانات البطاقة.",
      }),
    },
    {
      type: "paragraph",
      text: pick(locale, {
        en: `**What happens next?** We'll message you ${days} ${days === 1 ? "day" : "days"} before arrival with directions and mountain tips${transferUp ? "" : " (a 4WD is required for the climb)"}.${pickup} Check-in is from ${checkInTime}. Reply to our WhatsApp message anytime — a real person answers.`,
        ar: `**ما الخطوة التالية؟** سنراسلكم قبل الوصول بـ ${days} ${days === 1 ? "يوم" : "أيام"} بالاتجاهات وإرشادات الجبل${transferUp ? "" : " (يلزم سيارة دفع رباعي للصعود)"}.${pickup} تسجيل الوصول من الساعة ${checkInTime}. راسلونا على واتساب في أي وقت — يرد عليكم فريقنا شخصياً.`,
      }),
    },
    {
      type: "paragraph",
      muted: true,
      text: pick(locale, {
        en: `**Cancellation policy:** ${ctx.settings.cancellation.policy_en}`,
        ar: `**سياسة الإلغاء:** ${ctx.settings.cancellation.policy_ar}`,
      }),
    },
    {
      type: "buttons",
      buttons: [
        { label: pick(locale, { en: "Manage booking", ar: "إدارة الحجز" }), url: ctx.links.manage },
        { label: pick(locale, { en: "View booking", ar: "عرض الحجز" }), url: ctx.links.booking, secondary: true },
      ],
    },
    { type: "divider" },
    contactsBlock(ctx, locale),
  ];

  const email = renderEmail({
    locale,
    title: confirmationSubject(ctx, locale),
    preheader: pick(locale, {
      en: `${b.ref} · ${roomName(ctx, locale)} · ${longDate(b.check_in, locale)} → ${longDate(b.check_out, locale)} · Pay at the hotel`,
      ar: `${b.ref} · ${roomName(ctx, locale)} · ${longDate(b.check_in, locale)} ← ${longDate(b.check_out, locale)} · الدفع في الفندق`,
    }),
    blocks,
    footer: emailFooter(ctx, locale),
  });

  return {
    whatsapp: {
      templateName,
      langCode: locale,
      params,
      body: renderWhatsAppBody("confirmation", locale, params),
    },
    email: { subject: confirmationSubject(ctx, locale), html: email.html, text: email.text },
  };
}
