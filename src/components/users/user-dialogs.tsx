"use client";

import { useEffect, useState, type FormEvent } from "react";
import { COMMON, type Lang, type Localized, type Strings } from "@/lib/i18n";
import { useLang } from "@/components/providers/lang-provider";
import type { Role } from "@/lib/database.types";
import type { StaffUser } from "@/app/api/users/route";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export const ROLE_LABELS: Record<Role, Localized> = {
  super_admin: { en: "Super admin", ar: "مدير النظام" },
  reservation_desk: { en: "Reservation desk", ar: "مكتب الحجوزات" },
};

export function roleLabel(role: Role, lang: Lang): string {
  return ROLE_LABELS[role][lang];
}

const MIN_PASSWORD = 8;

const STR = {
  addTitle: { en: "Add staff user", ar: "إضافة موظف" },
  fullName: { en: "Full name", ar: "الاسم الكامل" },
  namePlaceholder: { en: "e.g. Fatma Al Habsi", ar: "مثال: فاطمة الحبسية" },
  emailPlaceholder: { en: "staff@samahotel.om", ar: "staff@samahotel.om" },
  password: { en: "Password", ar: "كلمة المرور" },
  passwordHelp: {
    en: "At least 8 characters — share it with the staff member securely.",
    ar: "8 أحرف على الأقل — شاركها مع الموظف بطريقة آمنة.",
  },
  role: { en: "Role", ar: "الدور" },
  roleHelp: {
    en: "Reservation desk sees bookings, inbox and contacts only. Super admin controls everything, including this page.",
    ar: "مكتب الحجوزات يرى الحجوزات والمحادثات وجهات الاتصال فقط. مدير النظام يتحكم في كل شيء بما في ذلك هذه الصفحة.",
  },
  create: { en: "Create user", ar: "إنشاء المستخدم" },
  errName: { en: "Please enter the full name.", ar: "يرجى إدخال الاسم الكامل." },
  errEmail: {
    en: "Please enter a valid email address.",
    ar: "يرجى إدخال بريد إلكتروني صحيح.",
  },
  errPassword: {
    en: "Password must be at least 8 characters.",
    ar: "يجب أن تكون كلمة المرور 8 أحرف على الأقل.",
  },
  emailExists: {
    en: "A user with this email already exists.",
    ar: "يوجد مستخدم بهذا البريد الإلكتروني مسبقًا.",
  },
  resetTitle: { en: "Set new password", ar: "تعيين كلمة مرور جديدة" },
  resetFor: { en: "New password for", ar: "كلمة مرور جديدة لـ" },
  setPassword: { en: "Set password", ar: "تعيين كلمة المرور" },
  deleteTitle: { en: "Delete user", ar: "حذف المستخدم" },
  deleteWarning: {
    en: "This permanently removes the account and its access. Bookings, contacts and messages are not affected.",
    ar: "سيؤدي هذا إلى إزالة الحساب وصلاحياته نهائيًا. لن تتأثر الحجوزات وجهات الاتصال والرسائل.",
  },
} satisfies Strings;

interface ApiError {
  error?: string;
}

// ---------------------------------------------------------------------------
// Add user
// ---------------------------------------------------------------------------
export function AddUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (user: StaffUser) => void;
}) {
  const { lang } = useLang();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("reservation_desk");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("reservation_desk");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) return setError(STR.errName[lang]);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(STR.errEmail[lang]);
    if (password.length < MIN_PASSWORD) return setError(STR.errPassword[lang]);

    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          role,
        }),
      });
      if (res.status === 409) {
        setError(STR.emailExists[lang]);
        return;
      }
      if (!res.ok) {
        setError(COMMON.error[lang]);
        return;
      }
      const data = (await res.json()) as { user: StaffUser };
      onCreated(data.user);
      onClose();
    } catch {
      setError(COMMON.error[lang]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={STR.addTitle[lang]}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="user-name">{STR.fullName[lang]}</Label>
          <Input
            id="user-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={STR.namePlaceholder[lang]}
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="user-email">{COMMON.email[lang]}</Label>
          <Input
            id="user-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={STR.emailPlaceholder[lang]}
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="user-password">{STR.password[lang]}</Label>
          <Input
            id="user-password"
            type="text"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-maroon-400">{STR.passwordHelp[lang]}</p>
        </div>
        <div>
          <Label htmlFor="user-role">{STR.role[lang]}</Label>
          <Select
            id="user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="reservation_desk">
              {ROLE_LABELS.reservation_desk[lang]}
            </option>
            <option value="super_admin">{ROLE_LABELS.super_admin[lang]}</option>
          </Select>
          <p className="mt-1 text-xs text-maroon-400">{STR.roleHelp[lang]}</p>
        </div>

        {error && (
          <p className="rounded-lg bg-crimson-50 px-3 py-2 text-sm font-semibold text-crimson-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" variant="gold" loading={saving}>
            {STR.create[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------
export function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: StaffUser | null;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setPassword("");
      setError(null);
    }
  }, [user]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(STR.errPassword[lang]);

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(COMMON.error[lang]);
        return;
      }
      onClose();
    } catch {
      setError(COMMON.error[lang]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={user !== null} onClose={onClose} title={STR.resetTitle[lang]}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="reset-password">
            {STR.resetFor[lang]}{" "}
            <span className="font-bold">{user?.full_name ?? user?.email}</span>
          </Label>
          <Input
            id="reset-password"
            type="text"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-maroon-400">{STR.passwordHelp[lang]}</p>
        </div>

        {error && (
          <p className="rounded-lg bg-crimson-50 px-3 py-2 text-sm font-semibold text-crimson-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            {COMMON.cancel[lang]}
          </Button>
          <Button type="submit" loading={saving}>
            {STR.setPassword[lang]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete user
// ---------------------------------------------------------------------------
export function DeleteUserDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: StaffUser | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const { lang } = useLang();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) setError(null);
  }, [user]);

  async function handleDelete() {
    if (!user) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(COMMON.error[lang]);
        return;
      }
      onDeleted(user.id);
      onClose();
    } catch {
      setError(COMMON.error[lang]);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={user !== null} onClose={onClose} title={STR.deleteTitle[lang]}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-maroon-700">
          <span className="font-bold text-maroon-900">
            {user?.full_name ?? user?.email}
          </span>{" "}
          — {STR.deleteWarning[lang]}
        </p>

        {error && (
          <p className="rounded-lg bg-crimson-50 px-3 py-2 text-sm font-semibold text-crimson-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            {COMMON.cancel[lang]}
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={deleting}
            onClick={() => void handleDelete()}
          >
            {COMMON.delete[lang]}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
