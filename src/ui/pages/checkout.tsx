/**
 * Checking out, the way picnic-web does it: start the checkout (answering an
 * age check if Picnic asks), start the payment, pay at the bank, and confirm
 * the order once Picnic says the payment is done.
 *
 * Different from picnic-web: the bank opens in a new tab and this tab keeps
 * watching the payment, because the bank's way back into Home Assistant may
 * not get past Home Assistant's login. Whichever tab sees the payment finish
 * first confirms the order; a small lock in localStorage keeps it to one.
 * The server also keeps the payment (src/server/payments.ts): it confirms the
 * order itself when no tab is left to do it, answers a second confirmation
 * with the first one, and any page on any device can pick the payment up.
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

import { SlotLine } from "../components/basket";
import { refreshCurrentOrders } from "../state/current-orders";
import { Confirm, Dialog, ErrorView, Price, Spinner, useDates, useLoad, useTitle, useToast } from "../components/common";
import { api } from "../lib/api";
import { paymentAddress } from "../lib/payment";
import { href, navigate } from "../lib/router";
import { cartModel, useCart } from "../state/cart";
import { useSession, useT } from "../state/session";

const PENDING_KEY = "picnic_desk_payment";
const POLL_MS = 3000;
/** A payment not finished in this time is not watched any more; as long as the server watches it (payments.ts). */
const PENDING_FOR_MS = 2 * 60 * 60 * 1000;
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
  const { t, d } = useT();
  const toast = useToast();
  useTitle(returning ? t.checkoutReturnTitle : t.checkoutPageTitle);
  const model = useCart();
  const dates = useDates();
  const [profile] = useLoad<PaymentProfileData | null>("payment-profile", async (signal) => {
    const result = await api<PaymentProfileData>("cart/checkout/payment-profile", { signal });
    return { ok: true, data: result.ok ? result.data : null };
  });
  const [started, setStarted] = useState<CheckoutStartData | null>(null);
  const [issue, setIssue] = useState<CheckoutIssueData | null>(null);
  const [busy, setBusy] = useState(false);
  const { state, refresh } = useSession();
  // This browser's own note of the payment, or else the server's: it keeps the payment for every page and device.
  const [pending, setPending] = useState<Pending | null>(() => {
    const own = readPending();
    if (own) return own;
    const open = state?.payment;
    if (!open || open.gaveUp) return null;
    const fromServer = { orderId: open.orderId, transactionId: open.transactionId, startedAt: open.startedAt };
    writePending(fromServer); // so this browser's tabs share it as they do their own
    return fromServer;
  });
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
    const address = result.ok ? paymentAddress(result.data.redirectUrl, window.location.origin) : null;
    if (!result.ok || !address) {
      tab?.close();
      toast(t.checkoutPaymentError, "error");
      return;
    }
    const next: Pending = { orderId: started.orderId, transactionId: result.data.transactionId, startedAt: Date.now() };
    writePending(next);
    setPending(next);
    setPayUrl(address);
    if (tab) {
      tab.opener = null;
      tab.location.href = address;
    }
  };

  const paymentDone = useCallback(() => {
    writePending(null);
    setPending(null);
    void refresh();
  }, [refresh]);

  if (pending) {
    return (
      <PaymentWatch pending={pending} payUrl={payUrl} onDone={paymentDone} />
    );
  }

  if (returning) {
    return (
      <div className="checkout">
        <h2>{t.checkoutReturnTitle}</h2>
        <p>{t.checkoutMissingSession}</p>
        <a href={href("/orders")}>{t.deliveriesTitle}</a>
      </div>
    );
  }

  const cart = model.cart;
  const preferred =
    profile.status === "ready" && profile.data
      ? (profile.data.storedOptions.find((o) => o.id === profile.data!.preferredPaymentOptionId) ?? profile.data.storedOptions[0])
      : undefined;
  return (
    <div className="checkout">
      <h2>{t.checkoutPageTitle}</h2>
      {!cart ? (
        <Spinner />
      ) : cart.totalCount === 0 ? (
        <p className="hint">
          {d.emptyBasket} <a href={href("/search")}>{t.goToSearch}</a>
        </p>
      ) : (
        <ol className="steps">
          <li className="step">
            <h3>{t.deliveriesWindowTitle}</h3>
            <SlotLine cart={cart} />
            {!cart.selectedSlot?.isExplicitSelection && <p className="hint">{d.chooseSlotFirst}</p>}
          </li>
          <li className="step">
            <h3>{d.checkOrder}</h3>
            {!isMinimumOrderMet(cart.totalPrice, cart.minimumOrderValue) ? (
              <p className="gone">{t.checkoutMinimumNotMet}</p>
            ) : started ? (
              <p>
                {d.orderReady.replace("{n}", String(started.totalCount))} <Price cents={started.totalPrice} />
                {started.transactionExpiry && (
                  <span className="hint-inline">
                    {" "}
                    {t.checkoutExpires} {dates.clock(started.transactionExpiry)}
                  </span>
                )}
              </p>
            ) : (
              <>
                <p className="hint">{d.checkOrderHint}</p>
                <button type="button" className="primary" disabled={busy} onClick={() => void start()}>
                  {busy ? t.checkoutProcessing : t.checkoutContinueButton}
                </button>
              </>
            )}
          </li>
          <li className={`step ${started ? "" : "later"}`}>
            <h3>{t.checkoutPaymentTitle}</h3>
            {preferred && (
              <p>
                <strong>{preferred.displayName}</strong> {preferred.account && <span className="hint-inline">{preferred.account}</span>}
              </p>
            )}
            {started && (
              <>
                <p className="hint">{d.payInNewTab}</p>
                <div className="actions start">
                  <button type="button" className="primary" disabled={busy} onClick={() => void pay()}>
                    {busy ? t.checkoutProcessing : t.checkoutPayButton}
                  </button>
                  <button type="button" className="quiet" disabled={busy} onClick={() => setStarted(null)}>
                    {t.cancelButton}
                  </button>
                </div>
              </>
            )}
          </li>
        </ol>
      )}
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
            <div className="actions">
              <button type="button" className="secondary" onClick={() => setIssue(null)}>
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
  /** Asking for the payment's status failed; polling goes on by itself. */
  const [statusProblem, setStatusProblem] = useState<string | null>(null);
  /** Confirming the paid order failed; only this has a "try again". */
  const [confirmProblem, setConfirmProblem] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const finished = useRef(false);

  const confirm = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    if (!(await claimConfirm(pending))) {
      // Another tab confirms it.
      onDone();
      await cartModel.refresh();
      navigate("/orders");
      return;
    }
    const result = await api<{ success: true; orderId: string }>("cart/checkout/confirm", {
      body: { orderId: pending.orderId, transactionId: pending.transactionId },
    });
    if (!result.ok) {
      finished.current = false;
      writePending({ ...pending, confirming: undefined });
      setConfirmProblem(result.error === "network" ? t.checkoutConfirmError : result.error);
      return;
    }
    setConfirmProblem(null);
    onDone();
    toast(d.orderPlaced);
    void refreshCurrentOrders();
    await cartModel.refresh();
    navigate("/orders");
  }, [pending, onDone, toast, t.checkoutConfirmError, d.orderPlaced]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      // Another tab finished it: the basket Picnic has now is the one to show.
      if (storageWorks() && !readPending() && !finished.current) {
        onDone();
        void cartModel.refresh();
        navigate("/orders");
        return;
      }
      // Past the time a payment can take: stop asking. Not "failed": nobody knows; the server's
      // note at the top of the page says to look at the orders.
      if (Date.now() - pending.startedAt > PENDING_FOR_MS) {
        onDone();
        navigate("/orders");
        return;
      }
      const result = await api<CheckoutStatusData>(
        `cart/checkout/status?${new URLSearchParams({ transactionId: pending.transactionId })}`
      );
      if (stopped) return;
      if (!result.ok) {
        setStatusProblem(result.error === "network" ? t.checkoutStatusError : result.error);
      } else {
        setStatusProblem(null);
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
      {failed && <p className="gone">{d.paymentFailed}</p>}
      <p className="hint">
        {t.checkoutStatusLabel}: {status}
      </p>
      {payUrl && !failed && (
        <p>
          <a href={payUrl} target="_blank" rel="noopener noreferrer">
            {d.openPayment} ↗
          </a>
        </p>
      )}
      {statusProblem && !confirmProblem && <ErrorView message={statusProblem} />}
      {confirmProblem && <ErrorView message={confirmProblem} onRetry={() => void confirm()} />}
      <div className="actions start">
        {failed ? (
          <button
            type="button"
            className="primary"
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
            className="quiet"
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
              navigate("/checkout");
            }}
          >
            {t.checkoutCancelPaymentButton}
          </button>
        )}
      </div>
    </div>
  );
}
