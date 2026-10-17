/**
 * A payment that started and is not finished, above the search box on every
 * page: the server watches it and confirms the order when Picnic says it is
 * paid, also when the tab that started it is gone. When the server stopped
 * watching without an answer, this says to look at the orders.
 */
import { useEffect } from "react";

import { api } from "../lib/api";
import { href } from "../lib/router";
import { useSession, useT } from "../state/session";

/** While a payment is open, the page asks the server about it this often. */
const OPEN_PAYMENT_EVERY_MS = 15_000;

export function OpenPayment({ onCheckout }: { onCheckout: boolean }) {
  const { state, refresh } = useSession();
  const { t, d } = useT();
  const payment = state?.payment ?? null;
  const watching = payment !== null && !payment.gaveUp;

  useEffect(() => {
    if (!watching) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, OPEN_PAYMENT_EVERY_MS);
    return () => clearInterval(timer);
  }, [watching, refresh]);

  if (!payment || (onCheckout && !payment.gaveUp)) return null;
  if (payment.gaveUp) {
    return (
      <p className="next-delivery payment-open unknown" role="alert">
        <span className="what">{d.paymentUnknown}</span>
        <a href={href("/orders")}>{t.deliveriesTitle}</a>
        <button
          type="button"
          className="quiet"
          onClick={async () => {
            await api("desk/payment", { method: "DELETE" });
            await refresh();
          }}
        >
          {d.paymentUnknownDone}
        </button>
      </p>
    );
  }
  return (
    <p className="next-delivery payment-open" role="status">
      <span className="what">{d.paymentOpen}</span>
      <a href={href("/checkout")}>{d.paymentOpenView}</a>
    </p>
  );
}
