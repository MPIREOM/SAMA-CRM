"use client";

import { ExternalLink, FileText, Phone, PlayCircle, Reply } from "lucide-react";
import type { RenderedTemplate } from "@/lib/messaging/meta-template-model";

/** A WhatsApp-style bubble for a rendered template (editor + campaign composer). */
export function TemplatePreview({ rendered, rtl }: { rendered: RenderedTemplate; rtl: boolean }) {
  return (
    <div className="rounded-2xl bg-[#e5ddd5] p-4" dir={rtl ? "rtl" : "ltr"}>
      <div className="max-w-sm rounded-xl bg-white shadow-sm">
        {rendered.header?.kind === "media" && (
          <div className="flex h-40 items-center justify-center overflow-hidden rounded-t-xl bg-stone-200 text-stone-500">
            {rendered.header.format === "IMAGE" && rendered.header.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rendered.header.url} alt="" className="h-full w-full object-cover" />
            ) : rendered.header.format === "VIDEO" ? (
              <PlayCircle className="h-10 w-10" aria-hidden="true" />
            ) : (
              <FileText className="h-10 w-10" aria-hidden="true" />
            )}
          </div>
        )}
        <div className="space-y-2 px-3 py-2">
          {rendered.header?.kind === "text" && <p className="text-sm font-bold text-stone-900">{rendered.header.text}</p>}
          <p className="whitespace-pre-wrap text-sm text-stone-900">{rendered.body || "…"}</p>
          {rendered.footer && <p className="text-xs text-stone-500">{rendered.footer}</p>}
          <p className="text-end text-[10px] text-stone-400">10:24</p>
        </div>
        {rendered.buttons.length > 0 && (
          <div className="divide-y divide-stone-100 border-t border-stone-100">
            {rendered.buttons.map((b, i) => (
              <div key={i} className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-sky-600">
                {b.type === "URL" ? <ExternalLink className="h-4 w-4" aria-hidden="true" /> : b.type === "PHONE_NUMBER" ? <Phone className="h-4 w-4" aria-hidden="true" /> : <Reply className="h-4 w-4" aria-hidden="true" />}
                {b.text || "…"}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
