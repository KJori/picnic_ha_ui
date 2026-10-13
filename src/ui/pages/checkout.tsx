/**
 * Checking out, the way picnic-web does it: start the checkout (answering an
 * age check if Picnic asks), start the payment, pay at the bank, and confirm
 * the order once Picnic says the payment is done.
 *
 * Different from picnic-web: the bank opens in a new tab and this tab keeps
 * watching the payment, because the bank's way back into Home Assistant may
 * not get past Home Assistant's login. Whichever tab sees the payment finish
 * first confirms the order; a small lock in localStorage keeps it to one.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { isMinimumOrderMet } from "@/lib/cart/minimum-order";
import type {
  CheckoutIssueData,
  CheckoutPaymentData,
  CheckoutStartData,
  CheckoutStatusData,
  PaymentProfileData,
} from "@/lib/core/checkout-types";
import type { CartData } from "@/lib/core/types";

import { SlotBanner, Totals } from "../components/basket";
import { Confirm, Dialog, ErrorView, LOCALES, Loaded, Price, Spinner, useLoad, useToast } from "../components/common";
import { useTitle } from "../components/products";
import { api } from "../lib/api";
import { href, navigate } from "../lib/router";
import { cartModel } from "../state/cart";
import { useT } from "../state/session";

const PENDING_KEY = "picnic_desk_payment";
const POLL_MS = 3000;
/** A payment not finished in this time is not watched any more. */
const PENDING_FOR_MS = 60 * 60 * 1000;
const TAB = Math.random().toString(36).slice(2);

type Pending = { orderId: string; transactionId: string; startedAt: number; confirming?: string };

function readPending(): Pending | null {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as Pending | null;
    if (value && typeof value.orderId === "string" && typeof value.transactionId === "string" && Date.now() - value.startedAt < PENDING_FOR_MS) {
      return value;
    }
  } catch {
    // nothing stored, or storage not available
  }
  return null;
}

function writePending(value: Pending | null) {
  try {
    if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // storage not available: only this tab watches the payment
  }
}

function storageWorks(): boolean {
  try {
    localStorage.setItem(`${PENDING_KEY}_test`, "1");
    localStorage.removeItem(`${PENDING_KEY}_test`);
    return true;
  } catch {
    return false;
  }
}

/** Claim the right to confirm; false when another tab has it or is done. */
async function claimConfirm(pending: Pending): Promise<boolean> {
  if (!storageWorks()) return true; // only this tab can know about the payment
  const current = readPending();
  if (!current || current.transactionId !== pending.transactionId) return false;
  if (current.confirming && current.confirming !== TAB) return false;
  writePending({ ...current, confirming: TAB });
  // Two tabs may claim at the same moment; the later write wins and the other backs off.
  await new Promise((resolve) => setTimeout(resolve, 300));
  return readPending()?.confirming === TAB;
}

const FAILED_STATUS = /CANCEL|FAIL|EXPIR|ERROR|REJECT/i;

export function CheckoutPage({ returning = false }: { returning?: boolean }) {
  const { t, d, language } = useT();
  const toast = useToast();
  useTitle(returning ? t.checkoutReturnTitle : t.checkoutPageTitle);
  const [load, reload] = useLoad<{ cart: CartData; profile: PaymentProfileData | null }>("checkout", async (signal) => {
    const [cart, profile] = await Promise.all([
      api<CartData>("cart", { signal }),
      api<PaymentProfileData>("cart/checkout/payment-profile", { signal }),
    ]);
    if (!cart.ok) return cart;
    return { ok: true, data: { cart: cart.data, profile: profile.ok ? profile.data : null } };
  });
  const [started, setStarted] = useState<CheckoutStartData | null>(null);
  const [issue, setIssue] = useState<CheckoutIssueData | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(readPending);
  const [payUrl, setPayUrl] = useState<string | null>(null);

  const start = async (resolveKey?: string) => {
    setBusy(true);
    setIssue(null);
    const result = await api<CheckoutStartData | { issue: CheckoutIssueData }>("cart/checkout/start", {
      body: resolveKey ? { resolveKey } : {},
    });
    setBusy(false);
    const data = result.ok ? result.data : (result.data as { issue?: CheckoutIssueData } | undefined);
    if (data && "issue" in data && data.issue) {
      setIssue(data.issue);
      return;
    }
    if (!result.ok) {
      toast(result.error === "network" ? t.checkoutStartError : result.error, "error");
      return;
    }
    setStarted(result.data as CheckoutStartData);
  };

  const pay = async () => {
    if (!started) return;
    // Open the tab now, while this is still the user's click; browsers block it later.
    const tab = window.open("", "_blank");
    setBusy(true);
    const result = await api<CheckoutPaymentData>("cart/checkout/initiate", { body: { orderId: started.orderId } });
    setBusy(false);
    if (!result.ok) {
      tab?.close();
      toast(t.checkoutPaymentError, "error");
      return;
    }
    const next: Pending = { orderId: started.orderId, transactionId: result.data.transactionId, startedAt: Date.now() };
    writePending(next);
    setPending(next);
    setPayUrl(result.data.redirectUrl);
    if (tab) {
      tab.opener = null;
      tab.location.href = result.data.redirectUrl;
    }
  };

  if (pending) {
    return (
      <PaymentWatch
        pending={pending}
        payUrl={payUrl}
        onDone={() => {
          writePending(null);
          setPending(null);
        }}
      />
    );
  }

  if (returning) {
    return (
      <div className="checkout">
        <h2>{t.checkoutReturnTitle}</h2>
        <p>{t.checkoutMissingSession}</p>
        <a href={href("/deliveries")}>{t.deliveriesTitle} ›</a>
      </div>
    );
  }

  return (
    <div className="checkout">
      <h2>{t.checkoutPageTitle}</h2>
      <Loaded load={load} retry={reload}>
        {({ cart, profile }) => {
          if (cart.totalCount === 0) {
            return (
              <p>
                {t.emptyCartTitle}. <a href={href("/search")}>{t.goToSearch}</a>
              </p>
            );
          }
          const preferred =
            profile?.storedOptions.find((o) => o.id === profile.preferredPaymentOptionId) ?? profile?.storedOptions[0];
          return (
            <div className="checkout-body">
              <SlotBanner cart={cart} onChosen={() => reload()} />
              <Totals
                totalPrice={cart.totalPrice}
                totalCount={cart.totalCount}
                depositBreakdown={cart.depositBreakdown}
                membershipSavings={cart.membershipSavings}
                promoSavings={cart.promoSavings}
                fees={cart.fees}
                minimumOrderValue={cart.minimumOrderValue}
              />
              {!isMinimumOrderMet(cart.totalPrice, cart.minimumOrderValue) ? (
                <p className="problem">
                  {t.checkoutMinimumNotMet} <a href={href("/cart")}>{t.cartTitle}</a>
                </p>
              ) : !started ? (
                <>
                  {!cart.selectedSlot?.isExplicitSelection && <p className="hint">{d.chooseSlotFirst}</p>}
                  <button type="button" className="button primary wide" disabled={busy} onClick={() => void start()}>
                    {busy ? t.checkoutProcessing : t.checkoutContinueButton}
                  </button>
                </>
              ) : (
                <section className="panel">
                  <h3>{t.checkoutPaymentTitle}</h3>
                  <p>
                    {t.checkoutOrderTotal}: <Price cents={started.totalPrice} />
                  </p>
                  {started.transactionExpiry && (
                    <p className="muted">
                      {t.checkoutExpires}: {new Date(started.transactionExpiry).toLocaleString(LOCALES[language])}
                    </p>
                  )}
                  {preferred && (
                    <p className="payment-option">
                      <strong>{preferred.displayName}</strong> {preferred.account && <span className="muted">{preferred.account}</span>}
                    </p>
                  )}
                  <p className="hint">{d.payInNewTab}</p>
                  <div className="dialog-actions">
                    <button type="button" className="button quiet" disabled={busy} onClick={() => setStarted(null)}>
                      {t.cancelButton}
                    </button>
                    <button type="button" className="button primary" disabled={busy} onClick={() => void pay()}>
                      {busy ? t.checkoutProcessing : t.checkoutPayButton}
                    </button>
                  </div>
                </section>
              )}
            </div>
          );
        }}
      </Loaded>
      {issue &&
        (issue.requiresAgeVerification && issue.resolveKey ? (
          <Confirm
            title={issue.title}
            message={issue.message}
            onCancel={() => setIssue(null)}
            onConfirm={() => void start(issue.resolveKey)}
          />
        ) : (
          <Dialog title={issue.title} onClose={() => setIssue(null)}>
            <p>{issue.message}</p>
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => setIssue(null)}>
                {t.closeLabel}
              </button>
            </div>
          </Dialog>
        ))}
    </div>
  );
}

function PaymentWatch({ pending, payUrl, onDone }: { pending: Pending; payUrl: string | null; onDone: () => void }) {
  const { t, d } = useT();
  const toast = useToast();
  const [status, setStatus] = useState<string>("…");
  const [problem, setProblem] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const finished = useRef(false);

  const confirm = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    if (!(await claimConfirm(pending))) {
      // Another tab confirms it.
      onDone();
      await cartModel.refresh();
      navigate("/deliveries");
      return;
    }
    const result = await api<{ success: true; orderId: string }>("cart/checkout/confirm", {
      body: { orderId: pending.orderId, transactionId: pending.transactionId },
    });
    if (!result.ok) {
      finished.current = false;
      writePending({ ...pending, confirming: undefined });
      setProblem(result.error === "network" ? t.checkoutConfirmError : result.error);
      return;
    }
    onDone();
    toast(d.orderPlaced);
    await cartModel.refresh();
    navigate("/deliveries");
  }, [pending, onDone, toast, t.checkoutConfirmError, d.orderPlaced]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      // Another tab finished it.
      if (storageWorks() && !readPending() && !finished.current) {
        onDone();
        navigate("/deliveries");
        return;
      }
      const result = await api<CheckoutStatusData>(
        `cart/checkout/status?${new URLSearchParams({ transactionId: pending.transactionId })}`
      );
      if (stopped) return;
      if (!result.ok) {
        setProblem(result.error === "network" ? t.checkoutStatusError : result.error);
      } else {
        setProblem(null);
        setStatus(result.data.checkoutStatus);
        if (result.data.checkoutStatus === "FINISHED") {
          void confirm();
          return;
        }
        if (FAILED_STATUS.test(result.data.checkoutStatus)) return;
      }
      timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, confirm, onDone, t.checkoutStatusError]);

  const failed = FAILED_STATUS.test(status);
  return (
    <div className="checkout">
      <h2>{t.checkoutReturnTitle}</h2>
      {!failed && <Spinner label={t.checkoutPollingMessage} />}
      <p>{failed ? d.paymentFailed : t.checkoutPollingMessage}</p>
      <p className="muted">
        {t.checkoutStatusLabel}: {status}
      </p>
      {payUrl && !failed && (
        <p>
          <a href={payUrl} target="_blank" rel="noopener noreferrer">
            {d.openPayment} ↗
          </a>
        </p>
      )}
      {problem && <ErrorView message={problem} onRetry={() => void confirm()} />}
      <div className="dialog-actions">
        {failed ? (
          <button
            type="button"
            className="button primary"
            onClick={() => {
              onDone();
              navigate("/checkout");
            }}
          >
            {t.retryButton}
          </button>
        ) : (
          <button
            type="button"
            className="button quiet"
            disabled={cancelling}
            onClick={async () => {
              setCancelling(true);
              const result = await api("cart/checkout/cancel", { body: { transactionId: pending.transactionId } });
              setCancelling(false);
              if (!result.ok) {
                toast(t.checkoutCancelError, "error");
                return;
              }
              onDone();
              navigate("/cart");
            }}
          >
            {t.checkoutCancelPaymentButton}
          </button>
        )}
      </div>
    </div>
  );
}
