"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Upload, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, marketLabel, type Strings } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { Contact, Market } from "@/lib/database.types";
import { Badge, marketVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AddContactDialog } from "@/components/contacts/add-contact-dialog";

const STR = {
  title: { en: "Contacts", ar: "جهات الاتصال" },
  subtitle: {
    en: "Guest directory across all channels",
    ar: "دليل الضيوف عبر جميع القنوات",
  },
  addContact: { en: "Add contact", ar: "إضافة جهة اتصال" },
  importBtn: { en: "Import", ar: "استيراد" },
  searchPlaceholder: {
    en: "Search name, phone or email…",
    ar: "ابحث بالاسم أو الهاتف أو البريد…",
  },
  allMarkets: { en: "All markets", ar: "كل الأسواق" },
  allTags: { en: "All tags", ar: "كل الوسوم" },
  lastStay: { en: "Last stay", ar: "آخر إقامة" },
  countOf: { en: "of", ar: "من" },
  contactsWord: { en: "contacts", ar: "جهة اتصال" },
  noContacts: { en: "No contacts yet", ar: "لا توجد جهات اتصال بعد" },
  noContactsDesc: {
    en: "Add your first guest or import a spreadsheet to get started.",
    ar: "أضف أول ضيف أو استورد ملف بيانات للبدء.",
  },
  noMatches: {
    en: "No contacts match your filters",
    ar: "لا توجد جهات اتصال مطابقة للتصفية",
  },
  noMatchesDesc: {
    en: "Try a different search term or clear the filters.",
    ar: "جرّب كلمة بحث مختلفة أو امسح عوامل التصفية.",
  },
  loadFailed: {
    en: "Could not load contacts",
    ar: "تعذر تحميل جهات الاتصال",
  },
} satisfies Strings;

const MARKETS: Market[] = ["Oman", "GCC", "International", "Unknown"];

export default function ContactsPage() {
  const { lang } = useLang();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<string>("All");
  const [tagFilter, setTagFilter] = useState<string>("All");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    setLoadError(Boolean(error));
    setContacts(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) for (const t of c.tags ?? []) if (t.trim()) set.add(t.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (q) {
        const hay = `${c.name ?? ""} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (marketFilter !== "All" && (c.market ?? "Unknown") !== marketFilter) return false;
      if (tagFilter !== "All" && !(c.tags ?? []).includes(tagFilter)) return false;
      return true;
    });
  }, [contacts, search, marketFilter, tagFilter]);

  const hasFilters = search.trim() !== "" || marketFilter !== "All" || tagFilter !== "All";

  return (
    <div>
      <PageHeader
        title={STR.title[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/contacts/import")}>
              <Upload className="h-4 w-4" />
              {STR.importBtn[lang]}
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <UserPlus className="h-4 w-4" />
              {STR.addContact[lang]}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-maroon-300 ltr:left-3 rtl:right-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={STR.searchPlaceholder[lang]}
            className="ps-9"
            aria-label={COMMON.search[lang]}
          />
        </div>
        <Select
          value={marketFilter}
          onChange={(e) => setMarketFilter(e.target.value)}
          className="w-44"
          aria-label={COMMON.market[lang]}
        >
          <option value="All">{STR.allMarkets[lang]}</option>
          {MARKETS.map((m) => (
            <option key={m} value={m}>
              {marketLabel(m, lang)}
            </option>
          ))}
        </Select>
        <Select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="w-44"
          aria-label={COMMON.tags[lang]}
        >
          <option value="All">{STR.allTags[lang]}</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-maroon-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            {COMMON.loading[lang]}
          </div>
        ) : loadError ? (
          <EmptyState title={STR.loadFailed[lang]} description={COMMON.error[lang]} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={hasFilters ? STR.noMatches[lang] : STR.noContacts[lang]}
            description={hasFilters ? STR.noMatchesDesc[lang] : STR.noContactsDesc[lang]}
            action={
              hasFilters ? undefined : (
                <Button onClick={() => setDialogOpen(true)}>
                  <UserPlus className="h-4 w-4" />
                  {STR.addContact[lang]}
                </Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>{COMMON.name[lang]}</TH>
                  <TH>{COMMON.phone[lang]}</TH>
                  <TH>{COMMON.market[lang]}</TH>
                  <TH>{COMMON.tags[lang]}</TH>
                  <TH>{COMMON.consent[lang]}</TH>
                  <TH>{STR.lastStay[lang]}</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((c) => {
                  const tags = c.tags ?? [];
                  return (
                    <TR
                      key={c.id}
                      onClick={() => router.push(`/contacts/${c.id}`)}
                      className="cursor-pointer transition-colors hover:bg-maroon-50"
                    >
                      <TD className="font-semibold text-maroon-900">{c.name}</TD>
                      <TD>
                        <span dir="ltr" className="inline-block">
                          {c.phone}
                        </span>
                      </TD>
                      <TD>
                        <Badge variant={marketVariant(c.market)}>
                          {marketLabel(c.market ?? "Unknown", lang)}
                        </Badge>
                      </TD>
                      <TD>
                        {tags.length === 0 ? (
                          <span className="text-maroon-300">—</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1">
                            {tags.slice(0, 3).map((t) => (
                              <Badge key={t} variant="outline">
                                {t}
                              </Badge>
                            ))}
                            {tags.length > 3 && (
                              <span className="text-xs font-semibold text-maroon-400" dir="ltr">
                                +{tags.length - 3}
                              </span>
                            )}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <Badge variant={c.consent ? "green" : "gray"}>
                          {c.consent ? COMMON.optedIn[lang] : COMMON.optedOut[lang]}
                        </Badge>
                      </TD>
                      <TD className="text-maroon-500">{formatDate(c.last_stay, lang)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <div className="border-t border-maroon-100 px-4 py-3 text-xs text-maroon-400">
              {filtered.length} {STR.countOf[lang]} {contacts.length}{" "}
              {STR.contactsWord[lang]}
            </div>
          </>
        )}
      </Card>

      <AddContactDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          void load();
        }}
      />
    </div>
  );
}
