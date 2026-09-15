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
  closing_title: "home.closingTitle",
  announcement: null,
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
