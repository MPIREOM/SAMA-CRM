"use client";

import { ShieldAlert } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

const STR = {
  desc: {
    en: "Ask a super admin if you need access to this area.",
    ar: "اطلب من مدير النظام إذا كنت بحاجة إلى الوصول لهذا القسم.",
  },
} satisfies Strings;

export function NoAccess({ title }: { title: string }) {
  const { lang } = useLang();
  return (
    <div>
      <PageHeader title={title} />
      <Card>
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title={COMMON.noAccess[lang]}
          description={STR.desc[lang]}
        />
      </Card>
    </div>
  );
}
