import type { Lang } from "@/shared/i18n";
import { EN } from "@/shared/i18n/en";
import { EN_REPORTS } from "@/shared/i18n/en-reports";

const patterns = Object.entries(EN_REPORTS).filter(([key]) => key.includes("{v")).map(([key, value]) => {
  const names: string[] = [];
  const expression = key.split(/(\{v\d+\})/).map((part) => {
    if (/^\{v\d+\}$/.test(part)) { names.push(part.slice(1, -1)); return "(.+?)"; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
  return { match: new RegExp(`^${expression}$`), names, value };
});

export function translateReportText(text: string, lang: Lang): string {
  if (lang === "th") return text;
  if (EN[text]) return EN[text];
  if (text.includes("; ")) return text.split("; ").map((part) => translateReportText(part, lang)).join("; ");
  for (const pattern of patterns) {
    const found = text.match(pattern.match);
    if (found) return pattern.value.replace(/\{(v\d+)\}/g, (_, name: string) =>
      translateReportText(found[pattern.names.indexOf(name) + 1], lang));
  }
  return text;
}

export function localizeReport<T>(value: T, lang: Lang): T {
  if (lang === "th") return value;
  if (typeof value === "string") return translateReportText(value, lang) as T;
  if (Array.isArray(value)) return value.map((item) => localizeReport(item, lang)) as T;
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, localizeReport(item, lang)]),
  ) as T;
  return value;
}
