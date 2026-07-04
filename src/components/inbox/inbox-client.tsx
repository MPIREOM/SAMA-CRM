"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Contact, Message } from "@/lib/database.types";
import {
  ConversationList,
  type Conversation,
} from "@/components/inbox/conversation-list";
import { ChatThread, type SendResult } from "@/components/inbox/chat-thread";
import { GuestPanel } from "@/components/inbox/guest-panel";

// Orchestrates the three-pane WhatsApp inbox: loads recent messages + their
// contacts, keeps everything live via one realtime channel, and handles
// optimistic sending.

const RECENT_LIMIT = 500;

function bySentAtAsc(a: Message, b: Message): number {
  return (a.sent_at ?? "").localeCompare(b.sent_at ?? "");
}

export function InboxClient() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const deepLinkContact = searchParams.get("contact");

  const [messages, setMessages] = useState<Message[]>([]);
  const [contactsById, setContactsById] = useState<Record<string, Contact>>(
    {}
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Ref mirror so realtime callbacks can check contacts without re-subscribing.
  // The ref is updated synchronously with every state write (via
  // updateContacts) so it is never stale between a state update and the next
  // commit — burst realtime inserts and sendMessage read it directly.
  const contactsRef = useRef<Record<string, Contact>>({});

  const updateContacts = useCallback(
    (updater: (prev: Record<string, Contact>) => Record<string, Contact>) => {
      contactsRef.current = updater(contactsRef.current);
      setContactsById(contactsRef.current);
    },
    []
  );

  const mergeContact = useCallback(
    (contact: Contact) => {
      updateContacts((prev) => ({ ...prev, [contact.id]: contact }));
    },
    [updateContacts]
  );

  // ---- Initial load: recent messages + their contacts in one pass ---------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("channel", "whatsapp")
        .order("sent_at", { ascending: false })
        .limit(RECENT_LIMIT);
      const recent = msgs ?? [];

      const ids = Array.from(
        new Set(
          recent
            .map((m) => m.contact_id)
            .filter((id): id is string => Boolean(id))
        )
      );
      const map: Record<string, Contact> = {};
      if (ids.length > 0) {
        const { data: cts } = await supabase
          .from("contacts")
          .select("*")
          .in("id", ids);
        for (const c of cts ?? []) map[c.id] = c;
      }

      if (cancelled) return;
      setMessages(recent);
      updateContacts((prev) => ({ ...map, ...prev }));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, updateContacts]);

  // ---- Deep link: /inbox?contact=<id> --------------------------------------
  useEffect(() => {
    if (deepLinkContact) setActiveId(deepLinkContact);
  }, [deepLinkContact]);

  // Ensure the active contact row is loaded (deep links to guests with no
  // messages yet, or realtime races).
  useEffect(() => {
    if (!activeId || contactsRef.current[activeId]) return;
    let cancelled = false;
    void supabase
      .from("contacts")
      .select("*")
      .eq("id", activeId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) mergeContact(data);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, supabase, mergeContact]);

  // ---- Realtime: INSERT appends, UPDATE patches status ----------------------
  useEffect(() => {
    const channel = supabase
      .channel("inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.channel !== "whatsapp") return;

          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          );

          const cid = msg.contact_id;
          if (!cid) return;

          if (msg.direction === "inbound") {
            // Refresh the 24h window locally.
            updateContacts((prev) => {
              const existing = prev[cid];
              if (!existing) return prev;
              return {
                ...prev,
                [cid]: {
                  ...existing,
                  last_inbound_at: msg.sent_at ?? new Date().toISOString(),
                },
              };
            });
          }

          // New inbound from an unknown guest → fetch their contact row.
          if (!contactsRef.current[cid]) {
            void supabase
              .from("contacts")
              .select("*")
              .eq("id", cid)
              .maybeSingle()
              .then(({ data }) => {
                if (data) mergeContact(data);
              });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id ? { ...m, status: updated.status } : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, mergeContact, updateContacts]);

  // ---- Optimistic send -------------------------------------------------------
  const sendMessage = useCallback(
    async (body: string): Promise<SendResult> => {
      const contact = activeId ? contactsRef.current[activeId] : undefined;
      if (!contact) return { ok: false, code: "failed" };

      const tempId = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const temp: Message = {
        id: tempId,
        contact_id: contact.id,
        direction: "outbound",
        channel: "whatsapp",
        status: "sending",
        body,
        provider_msg_id: null,
        sent_at: new Date().toISOString(),
        automation_id: null,
        booking_id: null,
        campaign_id: null,
      };
      setMessages((prev) => [...prev, temp]);

      try {
        const res = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: contact.id, body }),
        });

        if (res.status === 422) {
          // Outside the window with no approved template — undo the append.
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return { ok: false, code: "no_template" };
        }

        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          message?: Message | null;
        } | null;

        if (!res.ok) {
          // The API logs a real failed row that arrives via realtime INSERT —
          // drop the temp bubble so the thread doesn't show the message twice.
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return { ok: false, code: "failed" };
        }

        const real = data?.message;
        if (real) {
          // Swap the temp bubble for the logged row (dedupe vs realtime).
          setMessages((prev) => {
            const withoutTemp = prev.filter((m) => m.id !== tempId);
            return withoutTemp.some((m) => m.id === real.id)
              ? withoutTemp
              : [...withoutTemp, real];
          });
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, status: "sent" } : m))
          );
        }
        return { ok: true, code: "sent" };
      } catch {
        // Same dedupe as above — if the API logged a failed row it arrives
        // via realtime; the error notice is the user-facing signal here.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return { ok: false, code: "failed" };
      }
    },
    [activeId]
  );

  // ---- Derived state ----------------------------------------------------------
  const conversations = useMemo<Conversation[]>(() => {
    const byContact = new Map<string, Message[]>();
    for (const m of messages) {
      if (!m.contact_id) continue;
      const list = byContact.get(m.contact_id);
      if (list) list.push(m);
      else byContact.set(m.contact_id, [m]);
    }
    const result: Conversation[] = [];
    byContact.forEach((msgs, cid) => {
      const contact = contactsById[cid];
      if (!contact) return; // contact row still being fetched
      const sorted = [...msgs].sort(bySentAtAsc);
      const last = sorted[sorted.length - 1];
      if (!last) return;
      result.push({
        contact,
        last,
        unread: last.direction === "inbound",
      });
    });
    result.sort((a, b) =>
      (b.last.sent_at ?? "").localeCompare(a.last.sent_at ?? "")
    );
    return result;
  }, [messages, contactsById]);

  const activeContact = activeId ? contactsById[activeId] ?? null : null;

  const activeMessages = useMemo(() => {
    if (!activeId) return [];
    return messages.filter((m) => m.contact_id === activeId).sort(bySentAtAsc);
  }, [messages, activeId]);

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        loading={loading}
      />
      <ChatThread
        contact={activeContact}
        messages={activeMessages}
        onSend={sendMessage}
      />
      <GuestPanel contact={activeContact} onContactChange={mergeContact} />
    </div>
  );
}
