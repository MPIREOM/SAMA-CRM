import { afterEach, describe, expect, it } from "vitest";
import {
  SITE_COPY_FIELDS,
  SITE_IMAGE_SLOTS,
  SITE_SECTION_TOGGLES,
  isAllowedImageSrc,
  siteCopy,
  siteImage,
  siteSectionShown,
  type SiteSettings,
} from "../site-content";

const site: SiteSettings = {
  images: { home_hero: "/images/hotel/aerial.jpg", peak_hero: "  " },
  copy: { hero_title_en: "  A quiet house  ", hero_title_ar: "", announcement_ar: "موسم الورد" },
  sections: { closing: false },
};

describe("site content", () => {
  it("has unique slot, copy and section keys", () => {
    const keys = SITE_IMAGE_SLOTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(SITE_COPY_FIELDS.map((f) => f.key)).size).toBe(SITE_COPY_FIELDS.length);
    expect(new Set(SITE_SECTION_TOGGLES.map((s) => s.key)).size).toBe(SITE_SECTION_TOGGLES.length);
  });

  it("every slot default is a local path (or empty for the add-on fallback)", () => {
    for (const s of SITE_IMAGE_SLOTS) {
      expect(s.default === "" || s.default.startsWith("/images/")).toBe(true);
      expect(s.label.en.length).toBeGreaterThan(0);
      expect(s.label.ar.length).toBeGreaterThan(0);
    }
  });

  it("resolves an owner photo, else the default, and ignores blank overrides", () => {
    expect(siteImage(site, "home_hero")).toBe("/images/hotel/aerial.jpg");
    expect(siteImage(site, "peak_hero")).toBe("/images/hotel/peak-4.jpg");
    expect(siteImage(site, "home_location")).toBe("/images/hotel/aerial-canyon-pool.jpg");
    expect(siteImage(null, "og_image")).toBe("/images/og.jpg");
    expect(siteImage(site, "apex_hero")).toBe("");
  });

  it("returns trimmed copy overrides per language, null when unset or blank", () => {
    expect(siteCopy(site, "hero_title", "en")).toBe("A quiet house");
    expect(siteCopy(site, "hero_title", "ar")).toBeNull();
    expect(siteCopy(site, "announcement", "ar")).toBe("موسم الورد");
    expect(siteCopy(site, "announcement", "en")).toBeNull();
    expect(siteCopy(undefined, "welcome_body", "en")).toBeNull();
  });

  it("sections default to shown", () => {
    expect(siteSectionShown(site, "closing")).toBe(false);
    expect(siteSectionShown(site, "welcome")).toBe(true);
    expect(siteSectionShown(null, "addons")).toBe(true);
  });

  describe("isAllowedImageSrc", () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    afterEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
    });

    it("accepts local paths and the project's public storage", () => {
      expect(isAllowedImageSrc("/images/hotel/pool.jpg")).toBe(true);
      expect(isAllowedImageSrc("https://vsxesrhoovabgsmvodvh.supabase.co/storage/v1/object/public/bk-room-images/site/x.jpg")).toBe(true);
    });

    it("accepts the configured Supabase origin (emulator) but nothing else", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
      expect(isAllowedImageSrc("http://127.0.0.1:54321/storage/v1/object/public/bk-room-images/site/x.jpg")).toBe(true);
      expect(isAllowedImageSrc("http://127.0.0.1:54321/rest/v1/bk_settings")).toBe(false);
      expect(isAllowedImageSrc("https://example.com/storage/v1/object/public/x.jpg")).toBe(false);
      expect(isAllowedImageSrc("//evil.example/x.jpg")).toBe(false);
      expect(isAllowedImageSrc("javascript:alert(1)")).toBe(false);
    });
  });
});
