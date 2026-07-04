"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/providers/lang-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Languages } from "lucide-react";
import type { Strings } from "@/lib/i18n";

const STR = {
  title: { en: "Sama Hotel CRM", ar: "نظام إدارة ضيوف فندق سما" },
  subtitle: {
    en: "Staff sign in to continue",
    ar: "تسجيل دخول الموظفين للمتابعة",
  },
  email: { en: "Email", ar: "البريد الإلكتروني" },
  password: { en: "Password", ar: "كلمة المرور" },
  signIn: { en: "Sign in", ar: "تسجيل الدخول" },
  invalid: {
    en: "Invalid email or password",
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
  },
  tagline: {
    en: "Guests. Bookings. Conversations. In one place.",
    ar: "الضيوف والحجوزات والمحادثات في مكان واحد.",
  },
} satisfies Strings;

export default function LoginForm() {
  const { lang, toggle } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(STR.invalid[lang]);
      setLoading(false);
      return;
    }
    router.replace(searchParams.get("next") || "/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-maroon-800 p-12 lg:flex">
        <div className="text-3xl font-extrabold tracking-wide text-gold-500">
          SAMA <span className="text-gold-200">·</span> سما
        </div>
        <div>
          <p className="max-w-md text-3xl font-bold leading-snug text-gold-100">
            {STR.tagline[lang]}
          </p>
          <div className="mt-6 h-1 w-24 rounded bg-gold-500" />
        </div>
        <p className="text-sm text-maroon-300">© Sama Hotel · Muscat, Oman</p>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 20%, #c5a04f 0, transparent 40%)",
          }}
        />
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center bg-maroon-50 p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-maroon-900">
                {STR.title[lang]}
              </h1>
              <p className="mt-1 text-sm text-maroon-400">{STR.subtitle[lang]}</p>
            </div>
            <button
              onClick={toggle}
              className="flex items-center gap-1 rounded-lg border border-maroon-200 bg-white px-2.5 py-1.5 text-xs font-bold text-maroon-700 hover:bg-maroon-100"
            >
              <Languages className="h-3.5 w-3.5" />
              {lang === "en" ? "العربية" : "English"}
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">{STR.email[lang]}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">{STR.password[lang]}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-lg bg-crimson-50 px-3 py-2 text-sm font-semibold text-crimson-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              {STR.signIn[lang]}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
