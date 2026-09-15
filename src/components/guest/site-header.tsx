"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";

// Fixed site header. Over a page hero ([data-hero] anywhere in the body) it
// is transparent with light type until the guest scrolls; everywhere else it
// sits on paper with a hairline. The over-hero state is pure CSS (:has), so
// the first paint is right before any JavaScript runs.

const NAV = [
  { href: "/rooms", key: "rooms" },
  { href: "/the-peak", key: "peak" },
  { href: "/apex-zipline", key: "apex" },
  { href: "/contact", key: "contact" },
] as const;

export function SiteHeader({ logo, announcement }: { logo: string; announcement?: string | null }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className={cn("g-header fixed inset-x-0 top-0 z-40", scrolled && "is-scrolled", open && "is-open")}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50 focus:rounded-[3px] focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:uppercase focus:tracking-caps focus:text-ink"
      >
        {t("skipToContent")}
      </a>

      {announcement && !open && (
        <div className="g-announce border-b border-paper/10 text-center text-[11px] font-semibold uppercase tracking-wide2 rtl:text-[13px] rtl:tracking-normal">
          <p className="g-container truncate py-2">{announcement}</p>
        </div>
      )}

      <div className="g-container flex h-[4.5rem] items-center justify-between gap-6">
        <Link
          href="/"
          aria-label={t("brandWordmark")}
          className="flex shrink-0 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
        >
          <Image src={logo} alt="" width={40} height={39} priority className="g-header-mark h-8 w-auto transition-[filter] duration-500 sm:h-9" />
          <span className="font-display text-[1.45rem] leading-none tracking-wide rtl:font-display-ar rtl:text-[1.55rem]">{t("brandWordmark")}</span>
        </Link>

        <nav aria-label={t("primaryNav")} className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link key={item.key} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className="g-nav-link">
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <Suspense fallback={<span className="inline-block h-9 w-14" aria-hidden="true" />}>
            <LanguageSwitcher className="hidden sm:inline-flex" />
          </Suspense>
          <Link href={{ pathname: "/", hash: "availability" }} className="g-header-cta g-btn g-btn-sm hidden sm:inline-flex">
            {t("bookNow")}
          </Link>
          <button
            type="button"
            className="g-burger relative -me-2 inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t("closeMenu") : t("openMenu")}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden="true" className={cn("g-burger-line", open && "translate-y-[3.5px] rotate-45")} />
            <span aria-hidden="true" className={cn("g-burger-line", open && "-translate-y-[3.5px] -rotate-45")} />
          </button>
        </div>
      </div>

      {/* Full-screen menu (mobile) ------------------------------------- */}
      <div
        id="mobile-nav"
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 top-[4.5rem] z-40 flex flex-col bg-ink text-paper transition-opacity duration-500 ease-out md:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <nav aria-label={t("mobileNav")} className="g-container flex flex-1 flex-col justify-center gap-1 py-8">
          {[{ href: "/", key: "home" } as const, ...NAV].map((item, i) => (
            <Link
              key={item.key}
              href={item.href}
              tabIndex={open ? 0 : -1}
              aria-current={isActive(item.href) ? "page" : undefined}
              style={{ transitionDelay: open ? `${120 + i * 60}ms` : "0ms" }}
              className={cn(
                "g-display block py-3 text-[2.4rem] leading-tight text-paper transition-[opacity,transform] duration-600 ease-out rtl:text-[2.6rem]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 rounded-sm",
                isActive(item.href) ? "text-gold-300" : "hover:text-gold-200",
                open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              )}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div
          className={cn(
            "g-container flex items-center justify-between gap-4 border-t border-paper/15 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-opacity duration-600",
            open ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDelay: open ? "420ms" : "0ms" }}
        >
          <Suspense fallback={<span className="h-9 w-14" aria-hidden="true" />}>
            <LanguageSwitcher tone="light" tabIndex={open ? 0 : -1} />
          </Suspense>
          <Link href={{ pathname: "/", hash: "availability" }} tabIndex={open ? 0 : -1} className="g-btn-gold g-btn-sm">
            {t("bookNow")}
          </Link>
        </div>
      </div>
    </header>
  );
}
