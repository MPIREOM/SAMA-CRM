"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { COMMON, type Strings } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Role } from "@/lib/database.types";
import type { StaffUser } from "@/app/api/users/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  AddUserDialog,
  DeleteUserDialog,
  ResetPasswordDialog,
  ROLE_LABELS,
} from "@/components/users/user-dialogs";

const STR = {
  subtitle: {
    en: "Create staff accounts and control what they can access",
    ar: "أنشئ حسابات الموظفين وتحكم في صلاحياتهم",
  },
  addUser: { en: "Add user", ar: "إضافة موظف" },
  you: { en: "You", ar: "أنت" },
  role: { en: "Role", ar: "الدور" },
  created: { en: "Created", ar: "تاريخ الإنشاء" },
  lastSignIn: { en: "Last sign-in", ar: "آخر تسجيل دخول" },
  never: { en: "Never", ar: "لم يسجل بعد" },
  resetPassword: { en: "Set new password", ar: "تعيين كلمة مرور" },
  noUsers: { en: "No staff users found", ar: "لا يوجد موظفون" },
  loadFailed: { en: "Could not load users", ar: "تعذر تحميل المستخدمين" },
  roleChangeFailed: {
    en: "Could not change the role — try again.",
    ar: "تعذر تغيير الدور — حاول مرة أخرى.",
  },
} satisfies Strings;

type Access = "loading" | "granted" | "denied";

export default function UsersPage() {
  const { lang } = useLang();
  const supabase = useMemo(() => createClient(), []);

  const [access, setAccess] = useState<Access>("loading");
  const [selfId, setSelfId] = useState<string | null>(null);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<StaffUser | null>(null);
  const [deleting, setDeleting] = useState<StaffUser | null>(null);

  // Client-side role guard (the /api/users routes are the real backstop).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setAccess("denied");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setSelfId(user.id);
        setAccess(profile?.role === "super_admin" ? "granted" : "denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { users: StaffUser[] };
      setUsers(data.users);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access === "granted") void load();
  }, [access, load]);

  // Optimistic role change; revert on failure.
  const handleRoleChange = useCallback(
    async (id: string, role: Role) => {
      setActionError(null);
      const previous = users.find((u) => u.id === id)?.role;
      if (!previous || previous === role) return;
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
      try {
        const res = await fetch(`/api/users/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setUsers((prev) =>
          prev.map((u) => (u.id === id ? { ...u, role: previous } : u))
        );
        setActionError(STR.roleChangeFailed[lang]);
      }
    },
    [users, lang]
  );

  return (
    <div>
      <PageHeader
        title={COMMON.staff[lang]}
        subtitle={STR.subtitle[lang]}
        actions={
          access === "granted" ? (
            <Button variant="gold" onClick={() => setAdding(true)}>
              <UserPlus className="h-4 w-4" />
              {STR.addUser[lang]}
            </Button>
          ) : undefined
        }
      />

      {access === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-maroon-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          {COMMON.loading[lang]}
        </div>
      ) : access === "denied" ? (
        <Card>
          <EmptyState
            icon={<ShieldAlert className="h-8 w-8" />}
            title={COMMON.noAccess[lang]}
          />
        </Card>
      ) : (
        <>
          {actionError && (
            <p className="mb-4 rounded-lg bg-crimson-50 px-4 py-2.5 text-sm font-semibold text-crimson-700">
              {actionError}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-maroon-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              {COMMON.loading[lang]}
            </div>
          ) : loadError ? (
            <Card>
              <EmptyState
                title={STR.loadFailed[lang]}
                description={COMMON.error[lang]}
              />
            </Card>
          ) : users.length === 0 ? (
            <Card>
              <EmptyState title={STR.noUsers[lang]} />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <THead>
                  <TR>
                    <TH>{COMMON.name[lang]}</TH>
                    <TH>{COMMON.email[lang]}</TH>
                    <TH>{STR.role[lang]}</TH>
                    <TH>{STR.created[lang]}</TH>
                    <TH>{STR.lastSignIn[lang]}</TH>
                    <TH>{COMMON.actions[lang]}</TH>
                  </TR>
                </THead>
                <TBody>
                  {users.map((user) => {
                    const isSelf = user.id === selfId;
                    return (
                      <TR key={user.id}>
                        <TD className="font-semibold text-maroon-900">
                          {user.full_name ?? "—"}
                          {isSelf && (
                            <Badge variant="gold" className="ms-2">
                              {STR.you[lang]}
                            </Badge>
                          )}
                        </TD>
                        <TD dir="ltr">{user.email ?? "—"}</TD>
                        <TD>
                          {isSelf ? (
                            <Badge variant="maroon">
                              {ROLE_LABELS[user.role][lang]}
                            </Badge>
                          ) : (
                            <Select
                              value={user.role}
                              onChange={(e) =>
                                void handleRoleChange(
                                  user.id,
                                  e.target.value as Role
                                )
                              }
                              className="h-8 w-44 text-xs"
                            >
                              <option value="reservation_desk">
                                {ROLE_LABELS.reservation_desk[lang]}
                              </option>
                              <option value="super_admin">
                                {ROLE_LABELS.super_admin[lang]}
                              </option>
                            </Select>
                          )}
                        </TD>
                        <TD>{formatDate(user.created_at, lang)}</TD>
                        <TD>
                          {user.last_sign_in_at
                            ? formatDateTime(user.last_sign_in_at, lang)
                            : STR.never[lang]}
                        </TD>
                        <TD>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title={STR.resetPassword[lang]}
                              onClick={() => setResetting(user)}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title={COMMON.delete[lang]}
                                className="text-crimson-700 hover:bg-crimson-50"
                                onClick={() => setDeleting(user)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}

          <AddUserDialog
            open={adding}
            onClose={() => setAdding(false)}
            onCreated={(user) =>
              setUsers((prev) =>
                [...prev, user].sort((a, b) =>
                  a.created_at.localeCompare(b.created_at)
                )
              )
            }
          />
          <ResetPasswordDialog
            user={resetting}
            onClose={() => setResetting(null)}
          />
          <DeleteUserDialog
            user={deleting}
            onClose={() => setDeleting(null)}
            onDeleted={(id) =>
              setUsers((prev) => prev.filter((u) => u.id !== id))
            }
          />
        </>
      )}
    </div>
  );
}
