"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { logger } from "@/lib/logger";

// Friendly error boundary for every guest page (the layout chrome stays up).

export default function GuestError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");

  useEffect(() => {
    logger.error("guest.page", "render failed", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <section className="g-page g-container pb-24 sm:pb-32">
      <div className="mx-auto flex min-h-[40vh] max-w-2xl flex-col items-center justify-center text-center">
        <p className="g-eyebrow-gold">Sama</p>
        <h1 className="g-h2 mt-5 [text-wrap:balance]">{t("genericTitle")}</h1>
        <p className="g-lead mt-5 max-w-lg">{t("genericBody")}</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="g-btn-primary">
            {t("backHome")}
            <ArrowRight className="g-btn-arrow" aria-hidden="true" />
          </Link>
          <button type="button" onClick={reset} className="g-btn-ghost">
            {t("retry")}
          </button>
        </div>
      </div>
    </section>
  );
}
