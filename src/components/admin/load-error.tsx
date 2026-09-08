"use client";

import { AlertTriangle } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import type { Strings } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { errorText } from "./shared";

const STR = {
  title: { en: "Couldn't load this page", ar: "تعذّر تحميل هذه الصفحة" },
} satisfies Strings;

/** Page-level failure state (e.g. the service-role key is missing on the server). */
export function LoadError({ title, message }: { title: string; message: string }) {
  const { lang } = useLang();
  return (
    <div>
      <PageHeader title={title} />
      <Card>
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title={STR.title[lang]}
          description={errorText(message, lang)}
        />
      </Card>
    </div>
  );
}

/** Inline alert for action feedback inside a form or drawer. */
export function InlineAlert({
  kind,
  message,
}: {
  kind: "error" | "success" | "info";
  message: string | null;
}) {
  const { lang } = useLang();
  if (!message) return null;
  const cls =
    kind === "error"
      ? "border-crimson-200 bg-crimson-50 text-crimson-700"
      : kind === "success"
        ? "border-jabal-200 bg-jabal-50 text-jabal-700"
        : "border-gold-200 bg-gold-50 text-gold-800";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${cls}`}>
      {kind === "error" ? errorText(message, lang) : message}
    </div>
  );
}
