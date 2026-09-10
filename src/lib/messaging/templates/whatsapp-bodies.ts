// The EXACT Meta template bodies (confirmation + pre-arrival are Utility,
// post-stay is Marketing because of its offer; languages en + ar) as
// submitted in WhatsApp Manager — see docs/message-content.md. They are not
// sent (Meta holds the approved body); we keep them to render what the guest
// reads for the CRM inbox, the message log and the admin preview.
import type { Locale, MessageKind } from "../types";

export const DEFAULT_TEMPLATE_NAMES: Record<MessageKind, string> = {
  confirmation: "sama_booking_confirmation",
  pre_arrival: "sama_pre_arrival_guide",
  post_stay: "sama_post_stay_review",
};

/** Number of {{n}} body parameters each template takes — contractual. */
export const TEMPLATE_PARAM_COUNT: Record<MessageKind, number> = {
  confirmation: 7,
  pre_arrival: 3,
  post_stay: 2,
};

export const WHATSAPP_BODIES: Record<MessageKind, Record<Locale, string>> = {
  confirmation: {
    en: [
      "Hello {{1}}, your stay at Sama Hotel, Jabal Al Akhdar is confirmed 🌄",
      "Booking ref: {{2}}",
      "Room: {{3}}",
      "Check-in: {{4}} (from 2:00 PM)",
      "Check-out: {{5}} (by 12:00 PM)",
      "Nights: {{6}}",
      "Total: OMR {{7}} — payable at the hotel, no payment needed now.",
      "Need to change your booking? Reply to this message — we're happy to help.",
    ].join("\n"),
    ar: [
      "عزيزي {{1}}، تم تأكيد حجزكم في فندق سما – الجبل الأخضر.",
      "رقم الحجز: {{2}}",
      "الغرفة: {{3}}",
      "تسجيل الوصول: {{4}} (من الساعة 2:00 ظهراً)",
      "تسجيل المغادرة: {{5}} (حتى الساعة 12:00 ظهراً)",
      "عدد الليالي: {{6}}",
      "الإجمالي: {{7}} ر.ع — يُدفع في الفندق، ولا يلزم أي دفع الآن.",
      "لتعديل الحجز أو إلغائه، يُرجى الرد على هذه الرسالة.",
    ].join("\n"),
  },
  pre_arrival: {
    en: [
      "Hello {{1}}, we're looking forward to welcoming you on {{2}}! A few things before you set off:",
      "🚙 A 4WD is required — the checkpoint at Birkat Al Mouz doesn't allow 2WD cars up the mountain. No 4WD? Reply here and we'll help arrange a transfer.",
      "🧥 It's 10–15°C cooler than Muscat; bring warm layers.",
      "⛽ Fill up in Nizwa or Birkat Al Mouz before the climb.",
      "📍 Directions: {{3}}",
      "Check-in is from 2:00 PM. Running late? Just let us know.",
      "See you soon at Sama Hotel ☕",
    ].join("\n"),
    ar: [
      "أهلاً {{1}}، نتطلع لاستقبالكم يوم {{2}}! بعض الإرشادات قبل الانطلاق:",
      "🚙 يلزم وجود سيارة دفع رباعي — نقطة التفتيش في بركة الموز لا تسمح بصعود سيارات الدفع الثنائي. لا تملكون دفع رباعي؟ راسلونا هنا لترتيب خدمة النقل.",
      "🧥 الطقس أبرد من مسقط بحوالي 10–15 درجة، فأحضروا ملابس دافئة.",
      "⛽ عبّئوا الوقود في نزوى أو بركة الموز قبل الصعود.",
      "📍 الاتجاهات: {{3}}",
      "تسجيل الوصول من الساعة 2:00 ظهراً. في حال التأخر، يرجى إبلاغنا.",
      "نراكم قريباً في فندق سما ☕",
    ].join("\n"),
  },
  post_stay: {
    en: [
      "Thank you for staying with us, {{1}} 🌿 We hope the mountain air did you good.",
      "If you have a minute, a short review helps us a lot: {{2}}",
      "Come back anytime — use code SAMA10 for 10% off your next direct booking.",
    ].join("\n"),
    ar: [
      "شكراً لإقامتكم معنا {{1}} 🌿 نأمل أن تكونوا قد استمتعتم بأجواء الجبل.",
      "إن سمح وقتكم، يسعدنا تقييمكم القصير لنا هنا: {{2}}",
      "نرحب بكم دائماً — استخدموا الرمز SAMA10 للحصول على خصم 10٪ على حجزكم المباشر القادم.",
    ].join("\n"),
  },
};

/** Meta rejects parameters with newlines/tabs or 4+ spaces — same collapse as sendWhatsAppTemplate. */
export function cleanParam(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Substitute {{n}} in a template body with the params (1-based). */
export function renderWhatsAppBody(kind: MessageKind, locale: Locale, params: string[]): string {
  return WHATSAPP_BODIES[kind][locale].replace(/\{\{(\d+)\}\}/g, (_m, n: string) => params[Number(n) - 1] ?? "");
}
