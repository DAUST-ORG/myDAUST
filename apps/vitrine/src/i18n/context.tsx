"use client";

import { createContext, useContext, useState, useCallback } from "react";
import en, { type Translations } from "./en";
import fr from "./fr";

type Lang = "EN" | "FR";

const LangContext = createContext<{ lang: Lang; t: Translations; setLang: (l: Lang) => void }>({
  lang: "EN",
  t: en,
  setLang: () => {},
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("EN");

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l.toLowerCase();
  }, []);

  const t: Translations = lang === "FR" ? fr : en;

  return (
    <LangContext.Provider value={{ lang, t, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
