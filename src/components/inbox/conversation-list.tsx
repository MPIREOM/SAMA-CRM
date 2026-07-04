"use client";

import { useMemo, useState } from "react";
import { Loader2, MessageCircle, Search } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/utils";
import type { Contact, Message } from "@/lib/database.types";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";

/** One row in the inbox: a contact plus their most recent WhatsApp message. */
export interface Conversation {
  contact: Contact;
  last: Message;
  unread: boolean;
}

const STR = {
  searchPlaceholder: {
    en: "Search name or phone…",
    ar: "ابحث بالاسم أو الهاتف…",
  },
  youPrefix: { en: "You:", ar: "أنت:" },
  noConversations: { en: "No conversations yet", ar: "لا توجد محادثات بعد" },
  noConversationsDesc: {
    en: "Guest replies on WhatsApp will appear here.",
    ar: "ستظهر ردود الضيوف على واتساب هنا.",
  },
  noMatches: { en: "No matching conversations", ar: "لا توجد محادثات مطابقة" },
  conversationsWord: { en: "conversations", ar: "محادثة" },
} satisfies Strings;

export function ContactAvatar({
  name,
  className,
}: {
  name: string | null;
  className?: string;
}) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "؟";
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-maroon-800 text-sm font-bold text-gold-400",
        className
      )}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  loading,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (contactId: string) => void;
  loading: boolean;
}) {
  const { lang } = useLang();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const hay = `${c.contact.name ?? ""} ${c.contact.phone ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, search]);

  return (
    <Card className="flex w-80 shrink-0 flex-col overflow-hidden">
      {/* Header + search */}
      <div className="border-b border-maroon-100 px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-base font-extrabold text-maroon-900">
            {COMMON.inbox[lang]}
          </h1>
          {!loading && conversations.length > 0 && (
            <span className="text-xs font-semibold text-maroon-400" dir="ltr">
              {conversations.length}
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-maroon-300 ltr:left-3 rtl:right-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={STR.searchPlaceholder[lang]}
            className="h-9 ps-9 text-xs"
            aria-label={COMMON.search[lang]}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-maroon-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            {COMMON.loading[lang]}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="h-8 w-8" />}
            title={
              conversations.length === 0
                ? STR.noConversations[lang]
                : STR.noMatches[lang]
            }
            description={
              conversations.length === 0
                ? STR.noConversationsDesc[lang]
                : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-maroon-100/70">
            {filtered.map((conv) => {
              const active = conv.contact.id === activeId;
              const outbound = conv.last.direction === "outbound";
              const preview = `${
                outbound ? `${STR.youPrefix[lang]} ` : ""
              }${conv.last.body ?? ""}`;
              return (
                <li key={conv.contact.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conv.contact.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-start transition-colors",
                      active
                        ? "bg-maroon-100/70"
                        : "hover:bg-maroon-50"
                    )}
                    aria-current={active ? "true" : undefined}
                  >
                    <ContactAvatar name={conv.contact.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-bold text-maroon-900">
                          {conv.contact.name}
                        </p>
                        <span className="shrink-0 whitespace-nowrap text-[10px] text-maroon-400">
                          {formatDateTime(conv.last.sent_at, lang)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p
                          className={cn(
                            "min-w-0 flex-1 truncate text-xs",
                            conv.unread
                              ? "font-semibold text-maroon-700"
                              : "text-maroon-400"
                          )}
                        >
                          {preview}
                        </p>
                        {conv.unread && (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold-500"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
