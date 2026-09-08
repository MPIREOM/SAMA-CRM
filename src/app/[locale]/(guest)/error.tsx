"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { logger } from "@/lib/logger";

// Friendly error boundary for every guest page (the layout chrome stays up).

export default function GuestError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");

  useEffect(() => {
    logger.error("guest.page", "render failed", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <section className="g-container flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <p className="g-eyebrow">Sama</p>
      <h1 className="g-h2 mt-3">{t("genericTitle")}</h1>
      <p className="g-lead mx-auto mt-4 max-w-xl">{t("genericBody")}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="g-btn-primary">
          {t("retry")}
        </button>
        <Link href="/" className="g-btn-outline">
          {t("backHome")}
        </Link>
      </div>
    </section>
  );
}
