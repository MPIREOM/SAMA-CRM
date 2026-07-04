"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { type Localized, type Strings } from "@/lib/i18n";
import { cn, formatDateTime, isWithin24h, WHATSAPP_WINDOW_MS } from "@/lib/utils";
import type { Contact, Message } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { ContactAvatar } from "@/components/inbox/conversation-list";

/** Outcome of a send attempt, produced by the inbox orchestrator. */
export type SendResult = {
  ok: boolean;
  code: "sent" | "no_template" | "failed";
};

const STR = {
  selectConversation: {
    en: "Select a conversation",
    ar: "اختر محادثة",
  },
  selectConversationDesc: {
    en: "Pick a guest from the list to view the chat.",
    ar: "اختر ضيفاً من القائمة لعرض المحادثة.",
  },
  windowOpen: {
    en: "Window open — free-form replies ({h}h left)",
    ar: "النافذة مفتوحة — ردود حرة (متبقي {h} س)",
  },
  windowClosed: {
    en: "Window closed — template will be used",
    ar: "النافذة مغلقة — سيتم استخدام قالب",
  },
  noMessages: {
    en: "No messages yet — say hello!",
    ar: "لا توجد رسائل بعد — ابدأ المحادثة!",
  },
  composerPlaceholder: {
    en: "Type a message… (Enter to send, Shift+Enter for a new line)",
    ar: "اكتب رسالة… (Enter للإرسال، Shift+Enter لسطر جديد)",
  },
  send: { en: "Send", ar: "إرسال" },
  noTemplateNotice: {
    en: "The 24-hour window is closed and no approved Meta template is configured. Set WHATSAPP_REENGAGE_TEMPLATE to an approved template name to re-engage this guest.",
    ar: "نافذة الـ24 ساعة مغلقة ولا يوجد قالب معتمد من ميتا. اضبط WHATSAPP_REENGAGE_TEMPLATE باسم قالب معتمد لإعادة التواصل مع هذا الضيف.",
  },
  sendFailedNotice: {
    en: "The message could not be sent. Check the WhatsApp API configuration and try again.",
    ar: "تعذر إرسال الرسالة. تحقق من إعدادات واجهة واتساب وحاول مجدداً.",
  },
} satisfies Strings;

const STATUS_LABELS: Record<string, Localized> = {
  sending: { en: "Sending…", ar: "جارٍ الإرسال…" },
  sent: { en: "Sent", ar: "تم الإرسال" },
  delivered: { en: "Delivered", ar: "تم التسليم" },
  read: { en: "Read", ar: "تمت القراءة" },
  failed: { en: "Failed", ar: "فشل الإرسال" },
};

function remainingWindowHours(lastInboundAt: string): number {
  const elapsed = Date.now() - new Date(lastInboundAt).getTime();
  return Math.max(1, Math.ceil((WHATSAPP_WINDOW_MS - elapsed) / 3_600_000));
}

export function ChatThread({
  contact,
  messages,
  onSend,
}: {
  contact: Contact | null;
  /** Messages of the active contact, ascending by sent_at. */
  messages: Message[];
  onSend: (body: string) => Promise<SendResult>;
}) {
  const { lang } = useLang();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Localized | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Re-render every minute so the 24h-window pill stays accurate.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Reset composer state when switching guests.
  useEffect(() => {
    setText("");
    setNotice(null);
  }, [contact?.id]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, contact?.id]);

  async function handleSend() {
    const body = text.trim();
    if (!body || sending || !contact) return;
    setSending(true);
    setNotice(null);
    setText("");
    const result = await onSend(body);
    if (result.code === "no_template") {
      setNotice(STR.noTemplateNotice);
      setText(body); // give the staff member their draft back
    } else if (result.code === "failed") {
      setNotice(STR.sendFailedNotice);
    }
    setSending(false);
  }

  if (!contact) {
    return (
      <Card className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden">
        <EmptyState
          icon={<MessageCircle className="h-8 w-8" />}
          title={STR.selectConversation[lang]}
          description={STR.selectConversationDesc[lang]}
        />
      </Card>
    );
  }

  const windowOpen = isWithin24h(contact.last_inbound_at);
  const rows = Math.min(4, Math.max(1, text.split("\n").length));

  return (
    <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-maroon-100 px-4 py-3">
        <ContactAvatar name={contact.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-maroon-900">
            {contact.name}
          </p>
          <p className="text-xs text-maroon-400" dir="ltr">
            {contact.phone}
          </p>
        </div>
        <Badge variant={windowOpen ? "green" : "gray"} className="shrink-0">
          {windowOpen && contact.last_inbound_at
            ? STR.windowOpen[lang].replace(
                "{h}",
                String(remainingWindowHours(contact.last_inbound_at))
              )
            : STR.windowClosed[lang]}
        </Badge>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin bg-maroon-50/50 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-maroon-300">{STR.noMessages[lang]}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {messages.map((m) => {
              const outbound = m.direction === "outbound";
              const status = m.status ?? "";
              const statusLabel = STATUS_LABELS[status];
              return (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[70%]",
                    outbound ? "self-end" : "self-start"
                  )}
                >
                  <div
                    dir="auto"
                    className={cn(
                      "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                      outbound
                        ? "rounded-ee-md bg-maroon-800 text-gold-100"
                        : "rounded-ss-md border border-maroon-100 bg-white text-maroon-900"
                    )}
                  >
                    {m.body}
                  </div>
                  <div
                    className={cn(
                      "mt-1 flex items-center gap-1.5 px-1 text-[10px] text-maroon-400",
                      outbound ? "justify-end" : "justify-start"
                    )}
                  >
                    <span>{formatDateTime(m.sent_at, lang)}</span>
                    {outbound && statusLabel && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span
                          className={cn(
                            status === "failed" &&
                              "font-semibold text-crimson-600",
                            status === "read" && "font-semibold text-gold-600"
                          )}
                        >
                          {statusLabel[lang]}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-maroon-100 p-3">
        {notice && (
          <div
            role="alert"
            className="mb-2 rounded-lg border border-crimson-200 bg-crimson-50 px-3 py-2 text-xs font-semibold text-crimson-700"
          >
            {notice[lang]}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={rows}
            placeholder={STR.composerPlaceholder[lang]}
            className="resize-none"
            disabled={sending}
          />
          <Button
            type="submit"
            disabled={!text.trim() || sending}
            loading={sending}
            aria-label={STR.send[lang]}
            className="shrink-0"
          >
            {!sending && <Send className="h-4 w-4 rtl:-scale-x-100" />}
            <span className="hidden sm:inline">{STR.send[lang]}</span>
          </Button>
        </form>
      </div>
    </Card>
  );
}
