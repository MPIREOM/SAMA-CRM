"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// EN/AR toggle that keeps the current path AND query (dates, guests, token).

export function LanguageSwitcher({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
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
      lang={target}
      dir={target === "ar" ? "rtl" : "ltr"}
      aria-label={`${t("language")}: ${label}`}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
        tone === "dark"
          ? "border-gold-500/40 text-gold-200 hover:border-gold-400 hover:text-gold-100 focus-visible:ring-offset-maroon-900"
          : "border-maroon-300 text-maroon-800 hover:bg-maroon-50 focus-visible:ring-offset-stone-50",
        pending && "opacity-60",
        className
      )}
    >
      {label}
    </button>
  );
}
