"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";

const NAV = [
  { href: "/rooms", key: "rooms" },
  { href: "/the-peek", key: "peek" },
  { href: "/contact", key: "contact" },
] as const;

export function SiteHeader() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer on navigation and lock scroll while it is open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
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
    <header className="sticky top-0 z-40 border-b border-gold-500/20 bg-maroon-900/95 text-gold-100 backdrop-blur supports-[backdrop-filter]:bg-maroon-900/85">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-maroon-950"
      >
        {t("skipToContent")}
      </a>
      <div className="g-container flex h-16 items-center justify-between gap-4 sm:h-[4.5rem]">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-maroon-900"
        >
          <Image src="/images/brand/logo-mark.png" alt="" width={40} height={39} priority className="h-9 w-auto sm:h-10" />
          <span className="flex flex-col leading-none">
            <span className="text-lg font-extrabold tracking-wide text-gold-200">{t("brandWordmark")}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-400/90 rtl:tracking-normal rtl:text-xs">
              {t("brandSub")}
            </span>
          </span>
        </Link>

        <nav aria-label={t("primaryNav")} className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-maroon-900",
                isActive(item.href) ? "bg-gold-500/15 text-gold-200" : "text-gold-100/85 hover:bg-gold-500/10 hover:text-gold-100"
              )}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Suspense fallback={<span className="inline-block h-10 w-20 rounded-full border border-gold-500/40" aria-hidden="true" />}>
            <LanguageSwitcher />
          </Suspense>
          <Link href={{ pathname: "/", hash: "availability" }} className="g-btn-gold g-btn-sm hidden sm:inline-flex">
            {t("bookNow")}
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gold-100 hover:bg-gold-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-maroon-900 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t("closeMenu") : t("openMenu")}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        hidden={!open}
        className="border-t border-gold-500/20 bg-maroon-900 md:hidden"
      >
        <nav aria-label={t("mobileNav")} className="g-container flex flex-col py-3">
          {[{ href: "/", key: "home" } as const, ...NAV].map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive(item.href) && item.href !== "/" ? "page" : undefined}
              className="rounded-xl px-3 py-3 text-base font-bold text-gold-100 hover:bg-gold-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            >
              {t(item.key)}
            </Link>
          ))}
          <Link href={{ pathname: "/", hash: "availability" }} className="g-btn-gold mt-2">
            {t("bookNow")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
