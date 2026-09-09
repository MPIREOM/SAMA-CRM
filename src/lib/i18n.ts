export type Lang = "en" | "ar";

export const LANG_COOKIE = "sama-lang";

/** A single UI string in both languages. */
export type Localized = { en: string; ar: string };

/** Feature modules define local string tables with this shape:
 *  const STR = { title: { en: "Contacts", ar: "جهات الاتصال" } } satisfies Strings;
 *  ...then render STR.title[lang].
 */
export type Strings = Record<string, Localized>;

export function dirFor(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

// Shared chrome / cross-feature strings.
export const COMMON = {
  appName: { en: "Sama CRM", ar: "سما CRM" },
  hotelName: { en: "Sama Hotel", ar: "فندق سما" },
  dashboard: { en: "Dashboard", ar: "لوحة التحكم" },
  contacts: { en: "Contacts", ar: "جهات الاتصال" },
  bookings: { en: "Bookings", ar: "الحجوزات" },
  inbox: { en: "WhatsApp Inbox", ar: "محادثات واتساب" },
  automations: { en: "Automations", ar: "الأتمتة" },
  campaigns: { en: "Campaigns", ar: "الحملات" },
  templates: { en: "Templates", ar: "القوالب" },
  kiosk: { en: "Check-in Kiosk", ar: "شاشة تسجيل الوصول" },
  staff: { en: "Staff", ar: "الموظفون" },
  signOut: { en: "Sign out", ar: "تسجيل الخروج" },
  search: { en: "Search…", ar: "بحث…" },
  save: { en: "Save", ar: "حفظ" },
  cancel: { en: "Cancel", ar: "إلغاء" },
  close: { en: "Close", ar: "إغلاق" },
  menu: { en: "Menu", ar: "القائمة" },
  add: { en: "Add", ar: "إضافة" },
  edit: { en: "Edit", ar: "تعديل" },
  delete: { en: "Delete", ar: "حذف" },
  confirm: { en: "Confirm", ar: "تأكيد" },
  back: { en: "Back", ar: "رجوع" },
  next: { en: "Next", ar: "التالي" },
  loading: { en: "Loading…", ar: "جارٍ التحميل…" },
  saving: { en: "Saving…", ar: "جارٍ الحفظ…" },
  sending: { en: "Sending…", ar: "جارٍ الإرسال…" },
  noResults: { en: "No results", ar: "لا توجد نتائج" },
  error: { en: "Something went wrong", ar: "حدث خطأ ما" },
  required: { en: "Required", ar: "مطلوب" },
  optional: { en: "Optional", ar: "اختياري" },
  name: { en: "Name", ar: "الاسم" },
  phone: { en: "Phone", ar: "الهاتف" },
  email: { en: "Email", ar: "البريد الإلكتروني" },
  birthday: { en: "Birthday", ar: "تاريخ الميلاد" },
  nationality: { en: "Nationality", ar: "الجنسية" },
  language: { en: "Language", ar: "اللغة" },
  market: { en: "Market", ar: "السوق" },
  tags: { en: "Tags", ar: "الوسوم" },
  consent: { en: "Marketing consent", ar: "الموافقة التسويقية" },
  status: { en: "Status", ar: "الحالة" },
  source: { en: "Source", ar: "المصدر" },
  roomType: { en: "Room type", ar: "نوع الغرفة" },
  checkIn: { en: "Check-in", ar: "تاريخ الوصول" },
  checkOut: { en: "Check-out", ar: "تاريخ المغادرة" },
  nights: { en: "Nights", ar: "الليالي" },
  actions: { en: "Actions", ar: "إجراءات" },
  all: { en: "All", ar: "الكل" },
  yes: { en: "Yes", ar: "نعم" },
  no: { en: "No", ar: "لا" },
  on: { en: "On", ar: "مفعّل" },
  off: { en: "Off", ar: "متوقف" },
  whatsapp: { en: "WhatsApp", ar: "واتساب" },
  emailChannel: { en: "Email", ar: "بريد إلكتروني" },
  utility: { en: "Utility", ar: "خدمية" },
  marketing: { en: "Marketing", ar: "تسويقية" },
  optedIn: { en: "Opted in", ar: "موافق" },
  optedOut: { en: "Opted out", ar: "غير موافق" },
  noAccess: {
    en: "You don't have access to this page",
    ar: "ليس لديك صلاحية الوصول لهذه الصفحة",
  },
  // Property (booking engine back-office)
  property: { en: "Property", ar: "الفندق" },
  crm: { en: "CRM", ar: "إدارة العملاء" },
  reservations: { en: "Reservations", ar: "الحجوزات" },
  calendar: { en: "Calendar", ar: "التقويم" },
  rooms: { en: "Rooms", ar: "الغرف" },
  rates: { en: "Rates", ar: "الأسعار" },
  addons: { en: "Add-ons", ar: "الإضافات" },
  blocks: { en: "Blocks", ar: "الإغلاقات" },
  messaging: { en: "Messaging", ar: "الرسائل" },
  settings: { en: "Settings", ar: "الإعدادات" },
  audit: { en: "Audit log", ar: "سجل التدقيق" },
  today: { en: "Today", ar: "اليوم" },
  create: { en: "Create", ar: "إنشاء" },
  remove: { en: "Remove", ar: "إزالة" },
  retry: { en: "Retry", ar: "إعادة المحاولة" },
  export: { en: "Export CSV", ar: "تصدير CSV" },
  filter: { en: "Filter", ar: "تصفية" },
  reset: { en: "Reset", ar: "إعادة ضبط" },
  from: { en: "From", ar: "من" },
  to: { en: "To", ar: "إلى" },
  date: { en: "Date", ar: "التاريخ" },
  room: { en: "Room", ar: "الغرفة" },
  guest: { en: "Guest", ar: "النزيل" },
  ref: { en: "Ref", ar: "المرجع" },
  adults: { en: "Adults", ar: "البالغون" },
  children: { en: "Children", ar: "الأطفال" },
  total: { en: "Total", ar: "الإجمالي" },
  notes: { en: "Notes", ar: "ملاحظات" },
  reason: { en: "Reason", ar: "السبب" },
  kind: { en: "Kind", ar: "النوع" },
  channel: { en: "Channel", ar: "القناة" },
  saved: { en: "Saved", ar: "تم الحفظ" },
  unassigned: { en: "Unassigned", ar: "غير مخصص" },
  active: { en: "Active", ar: "نشط" },
  inactive: { en: "Inactive", ar: "غير نشط" },
  maintenance: { en: "Maintenance", ar: "صيانة" },
  omr: { en: "OMR", ar: "ر.ع" },
  muscatTime: { en: "Muscat time", ar: "بتوقيت مسقط" },
  areYouSure: { en: "Are you sure?", ar: "هل أنت متأكد؟" },
  openFullPage: { en: "Open full page", ar: "فتح الصفحة الكاملة" },
  markets: {
    en: "Oman|GCC|International|Unknown",
    ar: "عُمان|الخليج|دولي|غير معروف",
  },
} satisfies Strings;

/** Localize a market value for display. */
export function marketLabel(market: string | null, lang: Lang): string {
  const map: Record<string, Localized> = {
    Oman: { en: "Oman", ar: "عُمان" },
    GCC: { en: "GCC", ar: "الخليج" },
    International: { en: "International", ar: "دولي" },
    Unknown: { en: "Unknown", ar: "غير معروف" },
  };
  return market && map[market] ? map[market][lang] : market ?? "—";
}
