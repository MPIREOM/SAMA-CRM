"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { dirFor, LANG_COOKIE, type Lang } from "@/lib/i18n";

interface LangContextValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => void;
  toggle: () => void;
}

const LangContext = createContext<LangContextValue>({
  lang: "en",
  dir: "ltr",
  setLang: () => {},
  toggle: () => {},
});

export function LangProvider({
  children,
  initialLang = "en",
}: {
  children: ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.cookie = `${LANG_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
  }, []);

  const toggle = useCallback(
    () => setLang(lang === "en" ? "ar" : "en"),
    [lang, setLang]
  );

  // Keep <html lang/dir> in sync so Tailwind RTL + fonts follow.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirFor(lang);
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, dir: dirFor(lang), setLang, toggle }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
