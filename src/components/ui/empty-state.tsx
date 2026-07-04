"use client";

import { type ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="rounded-full bg-maroon-100 p-4 text-maroon-400">
        {icon ?? <Inbox className="h-8 w-8" />}
      </div>
      <p className="mt-2 text-base font-bold text-maroon-800">{title}</p>
      {description && <p className="max-w-sm text-sm text-maroon-400">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
