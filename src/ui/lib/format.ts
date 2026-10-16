/**
 * Money and dates, written the way Picnic writes them for the country.
 *
 * - Times are shown in the shop's time zone, not the browser's: a delivery at
 *   17:00 in Enschede reads 17:00 also when the page is opened abroad.
 * - A date Picnic sends that cannot be read shows as nothing rather than
 *   breaking the screen.
 * - Formatters are made once per language and country, not per render.
 */
import type { CountryCode } from "@/lib/core/types";

export type Language = "en" | "nl" | "de" | "fr";

/** Euro amounts the Picnic way ("€ 1,39" in Dutch, and in English on a Dutch shop). */
const MONEY_LOCALES: Record<Language, string> = { en: "nl-NL", nl: "nl-NL", de: "de-DE", fr: "fr-FR" };
const DATE_LOCALES: Record<Language, string> = { en: "en-GB", nl: "nl-NL", de: "de-DE", fr: "fr-FR" };
export const SHOP_TIME_ZONES: Record<CountryCode, string> = { NL: "Europe/Amsterdam", DE: "Europe/Berlin", FR: "Europe/Paris" };

type DateValue = string | number | null | undefined;

/** The instant, or null for nothing or something unreadable. */
export function instant(value: DateValue): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Order two timestamps by the moment they name (text comparison goes wrong across summer and winter time). */
export function byTime(a: DateValue, b: DateValue): number {
  return (instant(a)?.getTime() ?? 0) - (instant(b)?.getTime() ?? 0);
}

export type Money = ((cents: number) => string) & { plain: (cents: number) => string };

const moneyCache = new Map<Language, Money>();

export function moneyFormat(language: Language): Money {
  let money = moneyCache.get(language);
  if (!money) {
    const currency = new Intl.NumberFormat(MONEY_LOCALES[language], { style: "currency", currency: "EUR" });
    const number = new Intl.NumberFormat(MONEY_LOCALES[language], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const format = (cents: number) => currency.format(cents / 100);
    /** Without the euro sign, as on the receipt: "2,78". */
    money = Object.assign(format, { plain: (cents: number) => number.format(cents / 100) });
    moneyCache.set(language, money);
  }
  return money;
}

/**
 * Days from `now` to `value` in the shop's time zone: 0 today, 1 tomorrow,
 * -1 yesterday; null for an unreadable date.
 */
export function dayOffset(value: DateValue, now: number, timeZone: string): number | null {
  const date = instant(value);
  if (!date) return null;
  // en-CA writes 2026-10-16: a calendar day in that zone, compared as a date.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const days = (d: Date) => Date.parse(`${day.format(d)}T00:00:00Z`) / 86_400_000;
  return Math.round(days(date) - days(new Date(now)));
}

export type Dates = {
  /** The shop's time zone, e.g. "Europe/Amsterdam". */
  zone: string;
  /** "Thu 15 Oct" */
  day: (v: DateValue) => string;
  /** "Thu" */
  weekday: (v: DateValue) => string;
  /** "17:00" */
  clock: (v: DateValue) => string;
  /** "Thursday 15 October 2026" */
  long: (v: DateValue) => string;
  /** "15 Oct" */
  short: (v: DateValue) => string;
  /** "Thu 15 Oct, 17:00 to 18:00" */
  window: (start: DateValue, end: DateValue, to: string) => string;
};

const dateCache = new Map<string, Dates>();

export function dateFormat(language: Language, country: CountryCode): Dates {
  const key = `${language}:${country}`;
  let dates = dateCache.get(key);
  if (!dates) {
    const locale = DATE_LOCALES[language];
    const timeZone = SHOP_TIME_ZONES[country] ?? SHOP_TIME_ZONES.NL;
    const make = (options: Intl.DateTimeFormatOptions) => {
      const format = new Intl.DateTimeFormat(locale, { ...options, timeZone });
      return (value: DateValue) => {
        const date = instant(value);
        return date ? format.format(date) : "";
      };
    };
    const day = make({ weekday: "short", day: "numeric", month: "short" });
    const clock = make({ hour: "2-digit", minute: "2-digit" });
    dates = {
      zone: timeZone,
      day,
      weekday: make({ weekday: "short" }),
      clock,
      long: make({ weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      short: make({ day: "numeric", month: "short" }),
      window: (start, end, to) => {
        if (!instant(start)) return "";
        const until = clock(end);
        return `${day(start)}, ${clock(start)}${until ? ` ${to} ${until}` : ""}`;
      },
    };
    dateCache.set(key, dates);
  }
  return dates;
}
