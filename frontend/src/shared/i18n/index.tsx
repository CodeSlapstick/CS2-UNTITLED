import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { EN } from "./en";

// ================================================================================================
// ================================================================================================
/**
 *
 */
export type Lang = "th" | "en";
type Vars = Record<string, string | number>;

const STORE_KEY = "cs2.lang";
const THAI = /[฀-๿]/;
const warned = new Set<string>();

function readLang(): Lang {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === "th" || v === "en") return v;
  } catch {
  }
  return "th";
}

let current: Lang = readLang();

function lookup(lang: Lang, s: string): string {
  if (lang === "th") return s;
  const hit = EN[s];
  if (hit !== undefined) return hit;
  if (import.meta.env.DEV && THAI.test(s) && !warned.has(s)) {
    warned.add(s);
    console.warn(`[i18n] missing EN: ${s}`);
  }
  return s;
}

const fill = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

export function tr(s: string, vars?: Vars): string {
  return fill(lookup(current, s), vars);
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (s: string, vars?: Vars) => string;
  tn: (s: string, vars: Record<string, ReactNode>) => ReactNode;
}

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const setLang = useCallback((l: Lang) => {
    current = l;
    setLangState(l);
    try {
      localStorage.setItem(STORE_KEY, l);
    } catch {
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<LangCtx>(() => {
    const t = (s: string, vars?: Vars) => fill(lookup(lang, s), vars);
    const tn = (s: string, vars: Record<string, ReactNode>) => {
      const parts = lookup(lang, s).split(/\{(\w+)\}/g);
      return parts.map((p, i) => <Fragment key={i}>{i % 2 === 1 ? (p in vars ? vars[p] : `{${p}}`) : p}</Fragment>);
    };
    return { lang, setLang, t, tn };
  }, [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): LangCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useT() ต้องอยู่ใต้ <LangProvider>");
  return v;
}

export function LangToggle({ className = "lang-toggle" }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <div className={className} role="group" aria-label="Language / ภาษา" data-testid="lang-toggle">
      {(["th", "en"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} className={lang === l ? "on" : ""}
          onClick={() => setLang(l)} lang={l} title={l === "th" ? "ภาษาไทย" : "English"}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
