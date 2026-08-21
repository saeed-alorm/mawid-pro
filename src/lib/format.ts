import type { Lang } from "./i18n";

const locale = (lang: Lang) => (lang === "ar" ? "ar-LB" : "en-GB");

export function formatDate(dateStr: string, lang: Lang, opts?: Intl.DateTimeFormatOptions) {
  const d = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat(locale(lang), {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...opts,
  }).format(d);
}

export function formatLongDate(dateStr: string, lang: Lang) {
  return formatDate(dateStr, lang, { weekday: "long", day: "numeric", month: "long" });
}

export function formatTime(time: string, lang: Lang) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return new Intl.DateTimeFormat(locale(lang), { hour: "2-digit", minute: "2-digit" }).format(d);
}

export function formatRelative(isoDate: string, lang: Lang) {
  const d = new Date(isoDate);
  return new Intl.DateTimeFormat(locale(lang), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatNumber(n: number, lang: Lang) {
  return new Intl.NumberFormat(locale(lang)).format(n);
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeLebanesePhone(input: string): string | null {
  const western = [...input]
    .map((char) => {
      const arabicIndex = ARABIC_DIGITS.indexOf(char);
      if (arabicIndex >= 0) return `${arabicIndex}`;
      const easternIndex = EASTERN_ARABIC_DIGITS.indexOf(char);
      return easternIndex >= 0 ? `${easternIndex}` : char;
    })
    .join("");
  let digits = western.replace(/\D/g, "");
  if (digits.startsWith("961")) digits = digits.slice(3);
  if (!/^\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
}
