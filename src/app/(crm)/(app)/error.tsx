"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import type { Strings } from "@/lib/i18n";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { errorText } from "@/components/admin/shared";

const STR = {
  title: { en: "Something went wrong", ar: "حدث خطأ ما" },
  retry: { en: "Try again", ar: "حاول مرة أخرى" },
} satisfies Strings;

/** Error boundary for every authenticated CRM / back-office page. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { lang } = useLang();

  useEffect(() => {
    logger.error("app.error", error.message, { digest: error.digest });
  }, [error]);

  return (
    <Card>
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8" />}
        title={STR.title[lang]}
        description={errorText(error.message, lang)}
        action={
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            {STR.retry[lang]}
          </Button>
        }
      />
    </Card>
  );
}
