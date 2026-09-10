// The marketing template pack — the four bilingual WhatsApp marketing
// templates the owner approved (10 Sep 2026), submitted to Meta in one click
// from the WhatsApp setup page. Pure module: no server imports, unit-tested.
//
// Each entry becomes one Meta template per language (same name, `en` + `ar`),
// category MARKETING, with an image header from public/images/marketing, the
// opt-out footer the webhook understands (STOP / إيقاف) and a "Book now"
// button to the guest site. {{1}} is always the guest's first name; the
// campaign composer maps it (and {{2}} for hotel_news) per campaign.
import type { Localized } from "@/lib/i18n";
import { emptyDraft, type TemplateDraft } from "../meta-template-model";

export interface MarketingPackVariant {
  language: "en" | "ar";
  body: string;
  /** One sample per {{n}}, shown to Meta's reviewers. */
  examples: string[];
  footer: string;
  buttonText: string;
  buttonUrl: string;
}

export interface MarketingPackTemplate {
  name: string;
  title: Localized;
  /** Path under public/ — served by this deployment and used as the send-time header media. */
  headerImage: string;
  variants: MarketingPackVariant[];
}

const SITE = "https://sama-crm.vercel.app";
const FOOTER: Record<"en" | "ar", string> = { en: "Reply STOP to unsubscribe", ar: "للإلغاء أرسل إيقاف" };
const BUTTON: Record<"en" | "ar", string> = { en: "Book now", ar: "احجز الآن" };

function variant(language: "en" | "ar", body: string[], examples: string[]): MarketingPackVariant {
  return { language, body: body.join("\n\n"), examples, footer: FOOTER[language], buttonText: BUTTON[language], buttonUrl: `${SITE}/${language}` };
}

export const MARKETING_PACK: MarketingPackTemplate[] = [
  {
    name: "sama_escape_the_heat",
    title: { en: "Escape the heat", ar: "اهرب من الحر" },
    headerImage: "/images/marketing/escape-the-heat.jpg",
    variants: [
      variant(
        "en",
        [
          "Hi {{1}} 🌿 It's over 40°C in the city, but Jabal Akhdar is 10 to 15 degrees cooler right now.",
          "Escape the heat at Sama Hotel: mountain breeze, our cliff-edge pool, and sunset coffee at The Peak.",
          "Book direct today. Pay at the hotel, free cancellation up to 48 hours before arrival.",
          "Reservations: +968 99475688",
        ],
        ["Ahmed"]
      ),
      variant(
        "ar",
        [
          "مرحباً {{1}} 🌿 الحرارة في المدينة تجاوزت 40 درجة، بينما الجبل الأخضر أبرد بـ 10 إلى 15 درجة الآن.",
          "اهرب من الحر إلى فندق سما: نسيم الجبل، مسبحنا على حافة الوادي، وقهوة الغروب في ذا بيك.",
          "احجز مباشرة اليوم. الدفع في الفندق، وإلغاء مجاني حتى 48 ساعة قبل الوصول.",
          "الحجوزات: +968 99475688",
        ],
        ["أحمد"]
      ),
    ],
  },
  {
    name: "sama_weekend_getaway",
    title: { en: "Weekend getaway", ar: "عطلة نهاية الأسبوع" },
    headerImage: "/images/marketing/weekend-getaway.jpg",
    variants: [
      variant(
        "en",
        [
          "Hi {{1}}, the weekend is almost here. Two nights in Jabal Akhdar are two hours from Muscat.",
          "Family rooms and chalets with canyon views, a children's park, the APEX zipline, and Sama Restaurant for breakfast with a view.",
          "Book Thursday and Friday direct. Pay at the hotel.",
          "Reservations: +968 99475688",
        ],
        ["Ahmed"]
      ),
      variant(
        "ar",
        [
          "مرحباً {{1}}، عطلة نهاية الأسبوع على الأبواب. ليلتان في الجبل الأخضر على بعد ساعتين فقط من مسقط.",
          "غرف عائلية وشاليهات بإطلالة على الوادي، حديقة للأطفال، زيبلاين APEX، وإفطار بإطلالة في مطعم سما.",
          "احجز ليلتي الخميس والجمعة مباشرة. الدفع في الفندق.",
          "الحجوزات: +968 99475688",
        ],
        ["أحمد"]
      ),
    ],
  },
  {
    name: "sama_welcome_back",
    title: { en: "Welcome back", ar: "أهلاً بعودتك" },
    headerImage: "/images/marketing/welcome-back.jpg",
    variants: [
      variant(
        "en",
        [
          "Welcome back, {{1}}. It's been a while since your last stay with us, and the mountain hasn't changed.",
          "The pool, the terraces, and sunset coffee at The Peak are waiting whenever you're ready to come back up.",
          "Book on our site or reply here and the team will arrange it for you.",
        ],
        ["Ahmed"]
      ),
      variant(
        "ar",
        [
          "أهلاً بعودتك {{1}}. مرّ وقت منذ إقامتك الأخيرة عندنا، والجبل ما زال كما هو.",
          "المسبح، والتراسات، وقهوة الغروب في ذا بيك بانتظارك متى ما قررت العودة.",
          "احجز عبر موقعنا أو راسلنا هنا وسيرتّب الفريق حجزك.",
        ],
        ["أحمد"]
      ),
    ],
  },
  {
    name: "sama_hotel_news",
    title: { en: "Hotel news", ar: "جديد الفندق" },
    headerImage: "/images/marketing/hotel-news.jpg",
    variants: [
      variant(
        "en",
        ["Hi {{1}}, news from Sama Hotel, Jabal Akhdar:", "{{2}}", "Reservations: +968 99475688"],
        ["Ahmed", "Our new BBQ terrace opens this Thursday, with live grills every evening from 6 PM."]
      ),
      variant(
        "ar",
        ["مرحباً {{1}}، جديد فندق سما – الجبل الأخضر:", "{{2}}", "الحجوزات: +968 99475688"],
        ["أحمد", "يفتتح تراس الشواء الجديد يوم الخميس، مع الشواء المباشر كل مساء من الساعة 6."]
      ),
    ],
  },
];

export const MARKETING_PACK_NAMES: readonly string[] = MARKETING_PACK.map((t) => t.name);

/** Public URL of a pack template's header image on this deployment — the campaign composer's default header media. */
export function marketingPackHeaderUrl(name: string, baseUrl: string): string | null {
  const t = MARKETING_PACK.find((p) => p.name === name);
  return t ? `${baseUrl.replace(/\/+$/, "")}${t.headerImage}` : null;
}

/** The editor-shaped draft for one variant; `mediaHandle` comes from Meta's upload at submit time. */
export function marketingPackDraft(t: MarketingPackTemplate, v: MarketingPackVariant, mediaHandle: string, mediaUrl: string): TemplateDraft {
  return {
    ...emptyDraft(),
    name: t.name,
    language: v.language,
    category: "MARKETING",
    header: { format: "IMAGE", text: "", textExample: "", mediaHandle, mediaUrl },
    body: v.body,
    bodyExamples: v.examples,
    footer: v.footer,
    buttons: [{ type: "URL", text: v.buttonText, url: v.buttonUrl }],
  };
}
