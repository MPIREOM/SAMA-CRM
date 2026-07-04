"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Loader2,
  MessageCircle,
  Plus,
  UserX,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, marketLabel, type Localized, type Strings } from "@/lib/i18n";
import { formatDate, formatDateTime, nightsBetween } from "@/lib/utils";
import type { Booking, Contact, Message } from "@/lib/database.types";
import { Badge, marketVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const STR = {
  backToContacts: { en: "Back to contacts", ar: "رجوع إلى جهات الاتصال" },
  notFound: { en: "Contact not found", ar: "جهة الاتصال غير موجودة" },
  notFoundDesc: {
    en: "This guest may have been removed.",
    ar: "ربما تمت إزالة هذا الضيف.",
  },
  added: { en: "Added", ar: "أُضيف" },
  arabic: { en: "Arabic", ar: "العربية" },
  english: { en: "English", ar: "الإنجليزية" },
  guestInfo: { en: "Guest info", ar: "بيانات الضيف" },
  lastStay: { en: "Last stay", ar: "آخر إقامة" },
  bookingsTitle: { en: "Bookings", ar: "الحجوزات" },
  ref: { en: "Ref", ar: "المرجع" },
  noBookings: { en: "No bookings for this guest", ar: "لا توجد حجوزات لهذا الضيف" },
  totalStays: { en: "stays", ar: "إقامة" },
  totalNights: { en: "nights in total", ar: "ليلة إجمالًا" },
  messagesTitle: { en: "Recent messages", ar: "أحدث الرسائل" },
  noMessages: { en: "No messages yet", ar: "لا توجد رسائل بعد" },
  openInInbox: { en: "Open in inbox", ar: "فتح في المحادثات" },
  addTagPlaceholder: { en: "New tag…", ar: "وسم جديد…" },
  noTags: { en: "No tags yet", ar: "لا توجد وسوم بعد" },
  removeTag: { en: "Remove tag", ar: "إزالة الوسم" },
  updateFailed: { en: "Update failed — try again", ar: "فشل التحديث — حاول مجددًا" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  completed: { en: "Completed", ar: "مكتمل" },
  website: { en: "Website", ar: "الموقع" },
  ota: { en: "OTA", ar: "منصة حجز" },
  offline: { en: "Offline", ar: "مباشر" },
} satisfies Strings;

function statusVariant(status: string | null): "green" | "red" | "gold" | "gray" {
  switch (status) {
    case "Confirmed":
      return "green";
    case "Cancelled":
      return "red";
    case "Completed":
      return "gold";
    default:
      return "gray";
  }
}

function statusLabel(status: string | null): Localized | null {
  switch (status) {
    case "Confirmed":
      return STR.confirmed;
    case "Cancelled":
      return STR.cancelled;
    case "Completed":
      return STR.completed;
    default:
      return null;
  }
}

function sourceLabel(source: string | null): Localized | null {
  switch (source) {
    case "Website":
      return STR.website;
    case "OTA":
      return STR.ota;
    case "Offline":
      return STR.offline;
    default:
      return null;
  }
}

export default function ContactDetailPage() {
  const { lang } = useLang();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const supabase = useMemo(() => createClient(), []);

  const [contact, setContact] = useState<Contact | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState("");
  const [updateError, setUpdateError] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: c } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    setContact(c ?? null);
    if (c) {
      const [bookingsRes, messagesRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("*")
          .or(`contact_id.eq.${c.id},phone.eq.${c.phone}`)
          .order("check_in", { ascending: false }),
        supabase
          .from("messages")
          .select("*")
          .eq("contact_id", c.id)
          .order("sent_at", { ascending: false })
          .limit(20),
      ]);
      setBookings(bookingsRes.data ?? []);
      setMessages(messagesRes.data ?? []);
    }
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleConsent(next: boolean) {
    if (!contact) return;
    const previous = contact;
    const now = new Date().toISOString();
    setUpdateError(false);
    setContact({ ...contact, consent: next, consent_at: now, consent_source: "staff_toggle" });
    const { error } = await supabase
      .from("contacts")
      .update({ consent: next, consent_at: now, consent_source: "staff_toggle" })
      .eq("id", contact.id);
    if (error) {
      setContact(previous);
      setUpdateError(true);
    }
  }

  async function updateTags(nextTags: string[]) {
    if (!contact) return;
    const previous = contact;
    setUpdateError(false);
    setContact({ ...contact, tags: nextTags });
    const { error } = await supabase
      .from("contacts")
      .update({ tags: nextTags })
      .eq("id", contact.id);
    if (error) {
      setContact(previous);
      setUpdateError(true);
    }
  }

  function removeTag(tag: string) {
    if (!contact) return;
    void updateTags((contact.tags ?? []).filter((t) => t !== tag));
  }

  function addTag(e: React.FormEvent) {
    e.preventDefault();
    if (!contact) return;
    const tag = newTag.trim();
    if (!tag) return;
    const current = contact.tags ?? [];
    if (!current.includes(tag)) void updateTags([...current, tag]);
    setNewTag("");
  }

  const totalNights = bookings.reduce(
    (sum, b) => sum + nightsBetween(b.check_in, b.check_out),
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-maroon-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        {COMMON.loading[lang]}
      </div>
    );
  }

  if (!contact) {
    return (
      <EmptyState
        icon={<UserX className="h-8 w-8" />}
        title={STR.notFound[lang]}
        description={STR.notFoundDesc[lang]}
        action={
          <Link href="/contacts">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              {STR.backToContacts[lang]}
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <Link
        href="/contacts"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-maroon-500 hover:text-maroon-800"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {STR.backToContacts[lang]}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-maroon-900">{contact.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-maroon-500">
            <span dir="ltr" className="inline-block font-semibold text-maroon-700">
              {contact.phone}
            </span>
            <Badge variant={marketVariant(contact.market)}>
              {marketLabel(contact.market ?? "Unknown", lang)}
            </Badge>
            {contact.lang && (
              <Badge variant="outline">
                {contact.lang === "ar" ? STR.arabic[lang] : STR.english[lang]}
              </Badge>
            )}
            <span className="text-xs text-maroon-400">
              {STR.added[lang]} {formatDate(contact.created_at, lang)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-maroon-100 bg-white px-4 py-3 shadow-card">
          <div>
            <p className="text-sm font-semibold text-maroon-800">{COMMON.consent[lang]}</p>
            <p className="text-xs text-maroon-400">
              {contact.consent ? COMMON.optedIn[lang] : COMMON.optedOut[lang]}
            </p>
          </div>
          <Switch
            checked={Boolean(contact.consent)}
            onCheckedChange={toggleConsent}
            label={COMMON.consent[lang]}
          />
        </div>
      </div>

      {updateError && (
        <p role="alert" className="mb-4 rounded-lg bg-crimson-50 px-3 py-2 text-sm font-semibold text-crimson-700">
          {STR.updateFailed[lang]}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>{STR.guestInfo[lang]}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-maroon-400">{COMMON.email[lang]}</dt>
                  <dd dir="ltr" className="font-semibold text-maroon-800">
                    {contact.email || "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-maroon-400">{COMMON.birthday[lang]}</dt>
                  <dd className="font-semibold text-maroon-800">
                    {formatDate(contact.birthday, lang)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-maroon-400">{COMMON.nationality[lang]}</dt>
                  <dd className="font-semibold text-maroon-800">
                    {contact.nationality || "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-maroon-400">{COMMON.roomType[lang]}</dt>
                  <dd className="font-semibold text-maroon-800">
                    {contact.room_type || "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-maroon-400">{STR.lastStay[lang]}</dt>
                  <dd className="font-semibold text-maroon-800">
                    {formatDate(contact.last_stay, lang)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{COMMON.tags[lang]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {(contact.tags ?? []).length === 0 && (
                  <p className="text-sm text-maroon-300">{STR.noTags[lang]}</p>
                )}
                {(contact.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="gold" className="pe-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={`${STR.removeTag[lang]}: ${tag}`}
                      className="rounded-full p-0.5 text-gold-700 hover:bg-gold-200 hover:text-maroon-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <form onSubmit={addTag} className="mt-3 flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder={STR.addTagPlaceholder[lang]}
                  className="h-9"
                  aria-label={COMMON.tags[lang]}
                />
                <Button type="submit" variant="outline" size="sm" className="h-9 shrink-0">
                  <Plus className="h-4 w-4" />
                  {COMMON.add[lang]}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gold-600" />
                {STR.bookingsTitle[lang]}
              </CardTitle>
              {bookings.length > 0 && (
                <p className="text-xs font-semibold text-maroon-400">
                  {bookings.length} {STR.totalStays[lang]} · {totalNights}{" "}
                  {STR.totalNights[lang]}
                </p>
              )}
            </CardHeader>
            {bookings.length === 0 ? (
              <CardContent>
                <p className="py-4 text-center text-sm text-maroon-300">
                  {STR.noBookings[lang]}
                </p>
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{STR.ref[lang]}</TH>
                    <TH>{COMMON.checkIn[lang]}</TH>
                    <TH>{COMMON.checkOut[lang]}</TH>
                    <TH>{COMMON.nights[lang]}</TH>
                    <TH>{COMMON.roomType[lang]}</TH>
                    <TH>{COMMON.source[lang]}</TH>
                    <TH>{COMMON.status[lang]}</TH>
                  </TR>
                </THead>
                <TBody>
                  {bookings.map((b) => {
                    const src = sourceLabel(b.source);
                    const st = statusLabel(b.status);
                    return (
                      <TR key={b.id}>
                        <TD>
                          <span dir="ltr" className="inline-block font-semibold text-maroon-900">
                            {b.ref}
                          </span>
                        </TD>
                        <TD>{formatDate(b.check_in, lang)}</TD>
                        <TD>{formatDate(b.check_out, lang)}</TD>
                        <TD>{nightsBetween(b.check_in, b.check_out)}</TD>
                        <TD>{b.room_type || "—"}</TD>
                        <TD>{src ? src[lang] : b.source || "—"}</TD>
                        <TD>
                          <Badge variant={statusVariant(b.status)}>
                            {st ? st[lang] : b.status || "—"}
                          </Badge>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-gold-600" />
                {STR.messagesTitle[lang]}
              </CardTitle>
              <Link
                href={`/inbox?contact=${contact.id}`}
                className="text-xs font-bold text-crimson-700 hover:text-crimson-600 hover:underline"
              >
                {STR.openInInbox[lang]}
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-maroon-300">
                  {STR.noMessages[lang]}
                </p>
              ) : (
                <ul className="divide-y divide-maroon-100">
                  {messages.map((m) => {
                    const inbound = m.direction === "in" || m.direction === "inbound";
                    return (
                      <li key={m.id} className="flex items-start gap-3 px-5 py-3">
                        <span
                          className={
                            inbound
                              ? "mt-0.5 rounded-full bg-jabal-50 p-1.5 text-jabal-600"
                              : "mt-0.5 rounded-full bg-maroon-100 p-1.5 text-maroon-600"
                          }
                        >
                          {inbound ? (
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={m.channel === "email" ? "maroon" : "green"}>
                              {m.channel === "email"
                                ? COMMON.emailChannel[lang]
                                : COMMON.whatsapp[lang]}
                            </Badge>
                            <span className="text-xs text-maroon-400">
                              {formatDateTime(m.sent_at, lang)}
                            </span>
                            {m.status && (
                              <span className="text-xs text-maroon-300">{m.status}</span>
                            )}
                          </div>
                          <p dir="auto" className="mt-1 line-clamp-2 text-sm text-maroon-700">
                            {m.body || "—"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
