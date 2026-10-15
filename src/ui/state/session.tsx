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
};

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
    }),
    [state, language, refresh, expire]
  );

  if (!state) {
    return (
      <div className="boot" role="status">
        {failed ? (
          <>
            <p>Picnic Desk is not answering.</p>
            <button type="button" className="button" onClick={() => void refresh()}>
              Try again
            </button>
          </>
        ) : (
          <span className="spinner" aria-label="Loading" />
        )}
      </div>
    );
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
