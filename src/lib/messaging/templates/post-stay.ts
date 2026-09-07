// Post-stay thank-you — WhatsApp `sama_post_stay_review` (2 params) + email.
import type { BuiltMessage, Locale, TemplateContext } from "../types";
import { renderEmail, type Block } from "./email-shell";
import { contactsBlock, emailFooter, guestName, hotelName, pick } from "./shared";
import { cleanParam, DEFAULT_TEMPLATE_NAMES, renderWhatsAppBody } from "./whatsapp-bodies";

export const RETURNING_GUEST_CODE = "SAMA10";

/** {{1}} name · {{2}} review link (Google → TripAdvisor → website, never empty). */
export function postStayParams(ctx: TemplateContext): string[] {
  return [guestName(ctx), cleanParam(ctx.links.review)];
}

export function postStaySubject(ctx: TemplateContext, locale: Locale): string {
  const name = guestName(ctx);
  return pick(locale, {
    en: `Thank you for staying with us, ${name}`,
    ar: `شكراً لإقامتكم معنا، ${name}`,
  });
}

export function buildPostStay(ctx: TemplateContext, locale: Locale): BuiltMessage {
  const name = guestName(ctx);
  const params = postStayParams(ctx);
  const templateName = ctx.settings.messaging.whatsapp_templates.post_stay || DEFAULT_TEMPLATE_NAMES.post_stay;

  const reviewButtons: { label: string; url: string; secondary?: boolean }[] = [];
  if (ctx.links.google) {
    reviewButtons.push({ label: pick(locale, { en: "Review on Google", ar: "قيّمونا على جوجل" }), url: ctx.links.google });
  }
  if (ctx.links.tripadvisor) {
    reviewButtons.push({
      label: pick(locale, { en: "Review on TripAdvisor", ar: "قيّمونا على TripAdvisor" }),
      url: ctx.links.tripadvisor,
      secondary: reviewButtons.length > 0,
    });
  }
  if (reviewButtons.length === 0) {
    reviewButtons.push({ label: pick(locale, { en: "Leave a review", ar: "اتركوا تقييمكم" }), url: ctx.links.review });
  }

  const blocks: Block[] = [
    {
      type: "heading",
      text: pick(locale, {
        en: `Thank you for staying with us, ${name} 🌿`,
        ar: `شكراً لإقامتكم معنا ${name} 🌿`,
      }),
    },
    {
      type: "paragraph",
      text: pick(locale, {
        en: `We hope the mountain air did you good and that ${hotelName(ctx, locale)} felt like a home in the clouds. It was a pleasure having you in Jabal Al Akhdar.`,
        ar: `نأمل أن تكونوا قد استمتعتم بأجواء الجبل وأن ${hotelName(ctx, locale)} كان بيتاً لكم فوق السحاب. سعدنا باستضافتكم في الجبل الأخضر.`,
      }),
    },
    {
      type: "paragraph",
      text: pick(locale, {
        en: "**If you have a minute, a short review helps us a lot** — it's how other travellers find a small, family-run hotel like ours.",
        ar: "**إن سمح وقتكم، يسعدنا تقييمكم القصير لنا** — فهو ما يساعد المسافرين الآخرين على اكتشاف فندق عائلي صغير مثل فندقنا.",
      }),
    },
    { type: "buttons", buttons: reviewButtons },
    {
      type: "callout",
      title: pick(locale, {
        en: `Come back anytime — code ${RETURNING_GUEST_CODE}`,
        ar: `نرحب بكم دائماً — الرمز ${RETURNING_GUEST_CODE}`,
      }),
      text: pick(locale, {
        en: `Use ${RETURNING_GUEST_CODE} for 10% off your next direct booking on our website. Valid for 12 months. Pay at the hotel, as always.`,
        ar: `استخدموا الرمز ${RETURNING_GUEST_CODE} للحصول على خصم 10٪ على حجزكم المباشر القادم عبر موقعنا. صالح لمدة 12 شهراً. والدفع في الفندق كالمعتاد.`,
      }),
    },
    {
      type: "buttons",
      buttons: [{ label: pick(locale, { en: "Book your next stay", ar: "احجزوا إقامتكم القادمة" }), url: ctx.links.website, secondary: true }],
    },
    { type: "divider" },
    contactsBlock(ctx, locale),
  ];

  const email = renderEmail({
    locale,
    title: postStaySubject(ctx, locale),
    preheader: pick(locale, {
      en: `A short review helps us a lot · ${RETURNING_GUEST_CODE} for 10% off your next direct booking`,
      ar: `تقييمكم القصير يساعدنا كثيراً · الرمز ${RETURNING_GUEST_CODE} لخصم 10٪ على حجزكم القادم`,
    }),
    blocks,
    footer: emailFooter(ctx, locale),
  });

  return {
    whatsapp: {
      templateName,
      langCode: locale,
      params,
      body: renderWhatsAppBody("post_stay", locale, params),
    },
    email: { subject: postStaySubject(ctx, locale), html: email.html, text: email.text },
  };
}
