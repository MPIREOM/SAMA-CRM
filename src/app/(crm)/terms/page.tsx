import type { Metadata } from "next";

// Public marketing-communications terms — the page {{terms_link}} points to.
// Guests arrive here from WhatsApp/email offers, so it is bilingual on one
// page (Arabic first, then English) with no language toggle and no chrome.

export const metadata: Metadata = {
  title: "شروط الرسائل التسويقية | Marketing Terms — Sama Hotel",
  description:
    "Sama Hotel marketing communications terms — consent, offers and opting out.",
};

interface Section {
  heading: string;
  body: string[];
}

const AR_SECTIONS: Section[] = [
  {
    heading: "عن هذه الشروط",
    body: [
      "تحكم هذه الشروط الرسائل الترويجية التي يرسلها فندق سما، مسقط، سلطنة عُمان عبر واتساب والبريد الإلكتروني. باشتراككم في استلام عروضنا فإنكم توافقون على ما يلي.",
    ],
  },
  {
    heading: "ما الذي ستستلمونه",
    body: [
      "رسائل من حين لآخر تتضمن عروضًا وتحديثات من الفندق، مثل تهنئة عيد الميلاد مع عرض خاص، وعروض العودة، والعروض الموسمية.",
      "رسائل الخدمة المتعلقة بحجوزاتكم (تأكيد الحجز، والتذكير قبل الوصول) هي رسائل تشغيلية وتُرسل بغض النظر عن الموافقة التسويقية. أما رسالة ما بعد الإقامة فتتضمن عرضاً للضيوف العائدين، لذا لا تُرسل إلا بموافقتكم التسويقية.",
    ],
  },
  {
    heading: "موافقتكم",
    body: [
      "لا نرسل الرسائل التسويقية إلا بموافقتكم، التي تُمنح عند تسجيل الوصول أو عند الحجز أو عبر موظفينا، ويُسجَّل مصدرها وتاريخها.",
    ],
  },
  {
    heading: "إلغاء الاشتراك",
    body: [
      "يمكنكم إيقاف الرسائل التسويقية في أي وقت: أرسلوا كلمة «إلغاء» أو «STOP» ردًا على أي رسالة واتساب، أو تواصلوا مع مكتب الاستقبال. يسري الإيقاف فورًا، وتستمر رسائل الخدمة المتعلقة بحجوزاتكم فقط.",
    ],
  },
  {
    heading: "العروض",
    body: [
      "جميع العروض الترويجية خاضعة للتوافر وللشروط والتواريخ المذكورة في الرسالة نفسها، ويحتفظ الفندق بحق تعديل أي عرض أو سحبه في أي وقت. قد يُطلب إبراز الرسالة عند الاستفادة من العرض.",
    ],
  },
  {
    heading: "بياناتكم",
    body: [
      "نستخدم بيانات الاتصال الخاصة بكم لإرسال هذه الرسائل فقط، ولا نبيعها أو نشاركها مع جهات خارجية لأغراضها التسويقية. لتحديث بياناتكم أو حذفها، تواصلوا معنا.",
    ],
  },
  {
    heading: "التواصل",
    body: ["فندق سما — مسقط، سلطنة عُمان."],
  },
];

const EN_SECTIONS: Section[] = [
  {
    heading: "About these terms",
    body: [
      "These terms govern the promotional messages sent by Sama Hotel, Muscat, Sultanate of Oman over WhatsApp and email. By opting in to our offers you agree to the following.",
    ],
  },
  {
    heading: "What you will receive",
    body: [
      "Occasional messages with offers and updates from the hotel, such as a birthday greeting with a special offer, welcome-back offers, and seasonal promotions.",
      "Service messages about your bookings (booking confirmation, pre-arrival reminder) are operational and are sent regardless of marketing consent. The post-stay message carries a returning-guest offer, so it is only sent with your marketing consent.",
    ],
  },
  {
    heading: "Your consent",
    body: [
      "We only send marketing messages with your consent, given at check-in, when booking, or through our staff — and we record its source and date.",
    ],
  },
  {
    heading: "Opting out",
    body: [
      "You can stop marketing messages at any time: reply “STOP” or «إلغاء» to any WhatsApp message, or ask our reception team. Opt-out takes effect immediately; only service messages about your bookings continue.",
    ],
  },
  {
    heading: "Offers",
    body: [
      "All promotional offers are subject to availability and to the conditions and dates stated in the message itself. The hotel may modify or withdraw any offer at any time. You may be asked to present the message to redeem an offer.",
    ],
  },
  {
    heading: "Your data",
    body: [
      "We use your contact details only to send these communications. We do not sell them or share them with third parties for their own marketing. Contact us to update or delete your details.",
    ],
  },
  {
    heading: "Contact",
    body: ["Sama Hotel — Muscat, Sultanate of Oman."],
  },
];

function TermsBlock({
  dir,
  title,
  updated,
  sections,
}: {
  dir: "rtl" | "ltr";
  title: string;
  updated: string;
  sections: Section[];
}) {
  return (
    <section dir={dir}>
      <h1 className="text-2xl font-extrabold text-maroon-900">{title}</h1>
      <p className="mt-1 text-xs text-maroon-400">{updated}</p>
      <div className="mt-5 space-y-5">
        {sections.map((s) => (
          <div key={s.heading}>
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-gold-700">
              {s.heading}
            </h2>
            {s.body.map((p) => (
              <p
                key={p.slice(0, 24)}
                className="mt-1.5 text-sm leading-relaxed text-maroon-700"
              >
                {p}
              </p>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="relative min-h-screen bg-maroon-800 px-4 py-8 sm:py-12">
      {/* Same gold glow treatment as the kiosk / login brand panel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 0%, #c5a04f 0, transparent 45%), radial-gradient(circle at 85% 90%, #c5a04f 0, transparent 35%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-2xl sm:p-10">
        <p className="text-lg font-extrabold tracking-wide text-gold-600">
          SAMA <span className="text-gold-400">·</span> سما
        </p>

        <div className="mt-5">
          <TermsBlock
            dir="rtl"
            title="شروط الرسائل التسويقية"
            updated="آخر تحديث: يوليو 2026"
            sections={AR_SECTIONS}
          />
        </div>

        <div
          aria-hidden
          className="my-8 border-t border-dashed border-maroon-200"
        />

        <TermsBlock
          dir="ltr"
          title="Marketing Communications Terms"
          updated="Last updated: July 2026"
          sections={EN_SECTIONS}
        />
      </div>
    </div>
  );
}
