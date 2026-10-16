/**
 * Who is signed in, and in which language the page speaks.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { CountryCode } from "@/lib/core/types";

import type { DeskState } from "../../server/desk-routes";
import { deskStrings, type DeskStrings, picnicStrings, type Language } from "../i18n";
import { api, onSignedOut } from "../lib/api";
import type { Translations } from "@/lib/core/i18n";

type SessionValue = {
  state: DeskState | null;
  /** picnic-web's strings */
  t: Translations;
  /** Picnic Desk's own strings */
  d: DeskStrings;
  language: Language;
  country: CountryCode;
  demo: boolean;
  refresh: () => Promise<DeskState | null>;
  /** The server said the Picnic session is gone. */
  expire: () => void;
  /** The app was updated while this page stayed open: its answers may not fit this page any more. */
  outdated: boolean;
};

declare const DESK_VERSION: string;
/** The version this page was built as; null when not built (tests). */
const PAGE_VERSION = typeof DESK_VERSION === "string" ? DESK_VERSION : null;
/** Coming back to the tab after this long asks the server again (signed out elsewhere, updated). */
const STATE_AGAIN_AFTER_MS = 60_000;

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}

/** Strings only: usable in every component. */
export function useT(): { t: Translations; d: DeskStrings; language: Language; country: CountryCode } {
  const { t, d, language, country } = useSession();
  return { t, d, language, country };
}

const LANGUAGES: readonly Language[] = ["en", "nl", "de", "fr"];

/** The first of the browser's languages this page speaks; English otherwise. */
function browserLanguage(): Language {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split("-")[0] as Language;
    if (LANGUAGES.includes(base)) return base;
  }
  return "en";
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DeskState | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    const result = await api<DeskState>("desk/state");
    if (result.ok) {
      setState(result.data);
      setFailed(false);
      return result.data;
    }
    setFailed(true);
    return null;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const expire = useCallback(() => {
    setState((current) => (current && current.signedIn ? { ...current, signedIn: false, expired: true } : current));
  }, []);

  useEffect(() => onSignedOut(expire), [expire]);

  useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < STATE_AGAIN_AFTER_MS) return;
      last = Date.now();
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  const language: Language = state?.language ?? "en";
  useEffect(() => {
    // Screen readers and hyphenation follow the page's language.
    document.documentElement.lang = language;
  }, [language]);
  const value = useMemo<SessionValue>(
    () => ({
      state,
      t: picnicStrings(language),
      d: deskStrings(language),
      language,
      country: state?.country ?? "NL",
      demo: state?.demo ?? false,
      refresh,
      expire,
      outdated: Boolean(PAGE_VERSION && state && state.version !== PAGE_VERSION),
    }),
    [state, language, refresh, expire]
  );

  if (!state) {
    // Before the app has said which language it speaks: the browser's.
    const boot = deskStrings(browserLanguage());
    const retry = picnicStrings(browserLanguage()).retryButton;
    return (
      <div className="boot" role="status">
        {failed ? (
          <>
            <p>{boot.networkError}</p>
            <button type="button" className="button" onClick={() => void refresh()}>
              {retry}
            </button>
          </>
        ) : (
          <span className="spinner" aria-label={boot.loading} />
        )}
      </div>
    );
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
