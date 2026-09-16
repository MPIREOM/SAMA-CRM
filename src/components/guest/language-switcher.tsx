"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// EN/AR toggle that keeps the current path AND query (dates, guests, token).

export function LanguageSwitcher({ tone = "auto", className, tabIndex }: { tone?: "auto" | "light" | "dark"; className?: string; tabIndex?: number }) {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const target: Locale = locale === "ar" ? "en" : "ar";
  const label = target === "ar" ? t("arabic") : t("english");

  function switchLocale() {
    const query: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      query[key] = value;
    });
    startTransition(() => {
      router.replace({ pathname, query }, { locale: target });
    });
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      disabled={pending}
      tabIndex={tabIndex}
      lang={target}
      dir={target === "ar" ? "rtl" : "ltr"}
      aria-label={`${t("language")}: ${label}`}
      className={cn(
        "g-nav-link inline-flex min-h-9 items-center rounded-sm px-1 transition-[color,opacity] duration-300 active:opacity-70",
        tone === "light" && "text-paper/85 hover:text-paper",
        tone === "dark" && "text-ink-soft hover:text-ink",
        pending && "opacity-50",
        className
      )}
    >
      {label}
    </button>
  );
}
