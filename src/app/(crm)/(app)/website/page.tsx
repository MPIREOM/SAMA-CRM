import { ADMIN_ROLES } from "@/lib/bk/staff";
import { getSettings } from "@/lib/bk/settings";
import { SITE_COPY_FIELDS } from "@/lib/bk/site-content";
import { guardPage, loadErrorMessage } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/no-access";
import { LoadError } from "@/components/admin/load-error";
import { WebsiteView } from "@/components/admin/website/website-view";
import en from "../../../../../messages/en.json";
import ar from "../../../../../messages/ar.json";

export const dynamic = "force-dynamic";

// Which built-in translation each editable copy field replaces — shown as
// the placeholder so the owner sees what the site says today.
const COPY_SOURCE: Record<(typeof SITE_COPY_FIELDS)[number]["key"], string | null> = {
  hero_eyebrow: "home.heroEyebrow",
  hero_title: "home.heroTitle",
  hero_subtitle: "home.heroSubtitle",
  welcome_eyebrow: "home.welcomeEyebrow",
  welcome_title: "home.welcomeTitle",
  welcome_body: "home.welcomeBody",
  rooms_title: "home.roomsTitle",
  rooms_intro: "home.roomsIntro",
  experiences_title: "home.experiencesTitle",
  experience_peak_title: "home.experiences.peak.title",
  experience_peak_body: "home.experiences.peak.body",
  experience_pool_title: "home.experiences.pool.title",
  experience_pool_body: "home.experiences.pool.body",
  experience_terraces_title: "home.experiences.terraces.title",
  experience_terraces_body: "home.experiences.terraces.body",
  facilities_title: "home.facilitiesTitle",
  facility_pool: "home.facilities.pool",
  facility_restaurant: "home.facilities.restaurant",
  facility_kids: "home.facilities.kids",
  facility_gym: "home.facilities.gym",
  facility_peak: "home.facilities.peak",
  facility_majlis: "home.facilities.majlis",
  location_title: "home.locationTitle",
  location_body: "home.locationBody",
  pay_title: "home.payAtHotelTitle",
  pay_body: "home.payAtHotelBody",
  closing_title: "home.closingTitle",
  announcement: null,
  rooms_page_intro: "rooms.intro",
  peak_intro: "peak.intro",
  contact_intro: "contact.intro",
};

function lookup(doc: unknown, dotted: string | null): string {
  if (!dotted) return "";
  let cur: unknown = doc;
  for (const part of dotted.split(".")) {
    if (!cur || typeof cur !== "object") return "";
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : "";
}

export default async function WebsitePage() {
  const session = await guardPage(ADMIN_ROLES);
  if (!session) return <NoAccess title="Website" />;

  const placeholders: Record<string, string> = {};
  for (const f of SITE_COPY_FIELDS) {
    placeholders[`${f.key}_en`] = lookup(en, COPY_SOURCE[f.key]);
    placeholders[`${f.key}_ar`] = lookup(ar, COPY_SOURCE[f.key]);
  }

  try {
    const settings = await getSettings();
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    return <WebsiteView site={settings.site} placeholders={placeholders} siteUrl={base} />;
  } catch (e) {
    return <LoadError title="Website" message={loadErrorMessage(e)} />;
  }
}
