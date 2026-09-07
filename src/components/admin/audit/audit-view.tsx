"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ScrollText } from "lucide-react";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import type { BkAuditLog } from "@/lib/database.types";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDateTime } from "../shared";

const STR = {
  subtitle: { en: "Every back-office change, newest first (latest 500)", ar: "كل تغييرات المكتب الخلفي، الأحدث أولاً (آخر 500)" },
  entity: { en: "Entity", ar: "الكيان" },
  action: { en: "Action", ar: "الإجراء" },
  actor: { en: "By", ar: "بواسطة" },
  allEntities: { en: "All entities", ar: "كل الكيانات" },
  allActions: { en: "All actions", ar: "كل الإجراءات" },
  empty: { en: "No audit entries yet", ar: "لا توجد سجلات بعد" },
  diff: { en: "diff", ar: "التغييرات" },
  searchPh: { en: "Search id, email or action…", ar: "ابحث بالمعرّف أو البريد أو الإجراء…" },
} satisfies Strings;

function entityLink(entity: string, id: string | null): string | null {
  if (!id) return null;
  if (entity === "bk_bookings") return `/reservations/${id}`;
  if (entity === "bk_settings") return "/settings";
  if (entity === "bk_rate_plans" || entity === "bk_room_types") return entity === "bk_rate_plans" ? "/rates" : "/rooms";
  if (entity === "bk_rooms") return "/rooms?tab=rooms";
  if (entity === "bk_inventory_blocks") return "/blocks";
  if (entity === "bk_scheduled_messages") return "/messaging";
  return null;
}

export function AuditView({ rows }: { rows: BkAuditLog[] }) {
  const { lang } = useLang();
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const entities = useMemo(() => Array.from(new Set(rows.map((r) => r.entity))).sort(), [rows]);
  const actions = useMemo(
    () => Array.from(new Set(rows.filter((r) => !entity || r.entity === entity).map((r) => r.action))).sort(),
    [rows, entity]
  );
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!entity || r.entity === entity) &&
        (!action || r.action === action) &&
        (!term ||
          (r.entity_id ?? "").toLowerCase().includes(term) ||
          (r.actor_email ?? "").toLowerCase().includes(term) ||
          r.action.toLowerCase().includes(term))
    );
  }, [rows, entity, action, q]);

  return (
    <div>
      <PageHeader title={COMMON.audit[lang]} subtitle={STR.subtitle[lang]} />
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            {filtered.length} / {rows.length}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={entity} onChange={(e) => { setEntity(e.target.value); setAction(""); }} className="h-8 w-44 text-xs">
              <option value="">{STR.allEntities[lang]}</option>
              {entities.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
            <Select value={action} onChange={(e) => setAction(e.target.value)} className="h-8 w-44 text-xs">
              <option value="">{STR.allActions[lang]}</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={STR.searchPh[lang]} className="h-8 w-56 text-xs" />
          </div>
        </CardHeader>
        {filtered.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-8 w-8" />} title={rows.length === 0 ? STR.empty[lang] : COMMON.noResults[lang]} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{COMMON.date[lang]}</TH>
                <TH>{STR.action[lang]}</TH>
                <TH>{STR.entity[lang]}</TH>
                <TH>{STR.actor[lang]}</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {filtered.map((r) => {
                const href = entityLink(r.entity, r.entity_id);
                const hasDiff = r.diff !== null && r.diff !== undefined;
                return (
                  <Fragment key={r.id}>
                    <TR className="align-top">
                      <TD className="text-xs text-maroon-500">{fmtDateTime(r.created_at, lang)}</TD>
                      <TD className="font-mono text-xs font-semibold text-maroon-900">{r.action}</TD>
                      <TD className="text-xs">
                        <span className="text-maroon-500">{r.entity}</span>
                        {r.entity_id && (
                          <span className="ms-1 font-mono text-[11px] text-maroon-400" dir="ltr">
                            {href ? (
                              <Link href={href} className="hover:underline">
                                {r.entity_id.slice(0, 8)}…
                              </Link>
                            ) : (
                              `${r.entity_id.slice(0, 8)}…`
                            )}
                          </span>
                        )}
                      </TD>
                      <TD className="text-xs" dir="ltr">
                        {r.actor_email ?? (r.actor_user_id ? `${r.actor_user_id.slice(0, 8)}…` : "system")}
                      </TD>
                      <TD>
                        {hasDiff && (
                          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-maroon-500 hover:text-maroon-800" onClick={() => setOpen(open === r.id ? null : r.id)}>
                            {open === r.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {STR.diff[lang]}
                          </button>
                        )}
                      </TD>
                    </TR>
                    {open === r.id && hasDiff && (
                      <tr className="bg-maroon-50/60">
                        <td colSpan={5} className="px-4 py-2">
                          <pre className="max-h-72 overflow-auto scrollbar-thin rounded bg-white p-3 text-[11px] leading-snug text-maroon-800" dir="ltr">
                            {JSON.stringify(r.diff, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
