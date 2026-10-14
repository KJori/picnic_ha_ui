/**
 * Signing in: e-mail and password (with a verification code when Picnic asks
 * for one), or a Picnic auth token. The password goes to Picnic once and is
 * not kept; the token Picnic hands back stays on the server.
 */
import { type FormEvent, useState } from "react";

import { SUPPORTED_COUNTRY_CODES, type CountryCode } from "@/lib/core/types";

import { api } from "../lib/api";
import { cartModel } from "../state/cart";
import { useSession } from "../state/session";

type Step = "credentials" | "code" | "token";

export function LoginPage() {
  const { t, d, state, refresh, country: defaultCountry } = useSession();
  const [step, setStep] = useState<Step>(state?.awaitingCode ? "code" : "credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [country, setCountry] = useState<CountryCode>(defaultCountry);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(state?.expired ? t.sessionExpired : null);
  const [info, setInfo] = useState<string | null>(state?.awaitingCode ? t.smsSent : null);

  const reason = (error: unknown) => {
    switch (error) {
      case "TOKEN_INVALID":
        return t.tokenInvalid;
      case "CREDENTIALS_INVALID":
        return t.credentialsInvalid;
      case "2FA_INVALID":
        return t.twoFAInvalid;
      case "API_UNREACHABLE":
      case "network":
        return t.apiUnreachable;
      default:
        return t.genericError;
    }
  };

  const signedIn = async () => {
    setPassword("");
    cartModel.reset();
    await refresh();
    void cartModel.refresh();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (step === "credentials") {
        if (!email.trim() || !password) {
          setMessage(t.enterEmailAndPassword);
          return;
        }
        const result = await api<{ success: true }>("auth/login-credentials", {
          body: { email: email.trim(), password, countryCode: country },
        });
        if (result.ok) return void (await signedIn());
        const error = (result.data as { error?: string } | undefined)?.error ?? result.error;
        if (error === "2FA_REQUIRED") {
          setPassword("");
          setStep("code");
          setInfo(t.smsSent);
          return;
        }
        setMessage(reason(error));
      } else if (step === "code") {
        if (!code.trim()) {
          setMessage(t.enter2FACode);
          return;
        }
        const result = await api<{ success: true }>("auth/verify-2fa", { body: { code: code.trim() } });
        if (result.ok) return void (await signedIn());
        setMessage(reason((result.data as { error?: string } | undefined)?.error ?? result.error));
      } else {
        if (!token.trim()) {
          setMessage(t.enterToken);
          return;
        }
        const result = await api<{ success: true }>("auth/login", { body: { token: token.trim(), countryCode: country } });
        if (result.ok) return void (await signedIn());
        setMessage(reason((result.data as { error?: string } | undefined)?.error ?? result.error));
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async (channel: "SMS" | "EMAIL") => {
    setBusy(true);
    setMessage(null);
    const result = await api<{ sent: string }>("desk/code", { body: { channel } });
    setBusy(false);
    if (result.ok) setInfo(channel === "SMS" ? t.smsSent : d.codeEmailed);
    else if (result.status === 409) {
      setStep("credentials");
      setMessage(result.error);
    } else setMessage(result.error);
  };

  return (
    <main className="door">
      <form className="signin" onSubmit={(event) => void submit(event)}>
        {step === "code" ? (
          <>
            <h1>{d.codeTitle}</h1>
            <p>{info ?? t.smsSent}</p>
          </>
        ) : (
          <>
            <h1>{d.signInTitle}</h1>
            <p>{state?.demo ? d.demoLogin : d.privacy}</p>
          </>
        )}
        {message && (
          <p className="gone" role="alert">
            {message}
          </p>
        )}

        {step === "credentials" && (
          <>
            <label htmlFor="email">{t.emailLabel}</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label htmlFor="password">{t.passwordLabel}</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </>
        )}

        {step === "code" && (
          <>
            <div className="channels">
              <button type="button" className="secondary" disabled={busy} onClick={() => void resend("SMS")}>
                {d.bySms}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => void resend("EMAIL")}>
                {d.byEmail}
              </button>
            </div>
            <label htmlFor="code">{t.verificationCodeLabel}</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              required
            />
          </>
        )}

        {step === "token" && (
          <>
            <label htmlFor="token">{t.authTokenLabel}</label>
            <input id="token" type="password" value={token} placeholder={t.tokenPlaceholder} onChange={(e) => setToken(e.target.value)} required />
          </>
        )}

        {step !== "code" && (
          <>
            <label htmlFor="country">{d.country}</label>
            <select id="country" value={country} onChange={(e) => setCountry(e.target.value as CountryCode)}>
              {SUPPORTED_COUNTRY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </>
        )}

        <button type="submit" className="primary" disabled={busy}>
          {busy ? t.checkoutProcessing : step === "code" ? t.verifyButton : t.loginButton}
        </button>

        {step === "token" ? (
          <button type="button" className="quiet" onClick={() => setStep("credentials")}>
            {d.useCredentials}
          </button>
        ) : step === "credentials" ? (
          <button type="button" className="quiet" onClick={() => setStep("token")}>
            {d.useToken}
          </button>
        ) : (
          <button type="button" className="quiet" onClick={() => setStep("credentials")}>
            {d.otherAccount}
          </button>
        )}
      </form>
    </main>
  );
}
