/**
 * The basket as a till receipt on the right of the desk, the bill used on
 * order pages, and the delivery-time picker as a week grid.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { isMinimumOrderMet } from "@/lib/cart/minimum-order";
import type { DeliverySlotData, DeliverySlotPickerData } from "@/lib/core/delivery-slot-types";
import type { CartData, CartFooterData, CartItem, CartRecipeGroup, DepositEntry, FeeEntry } from "@/lib/core/types";

import { api } from "../lib/api";
import { picnicInk } from "../lib/colour";
import { href, navigate } from "../lib/router";
import { cartModel, useCart } from "../state/cart";
import { forgetAccount, useProfileName } from "../state/account";
import { useSession, useT } from "../state/session";
import { Dialog, ErrorView, Loaded, Spinner, Stepper, useDates, useLoad, useMoney, useToast } from "./common";
import { useOpenProduct } from "./products";

// ─── Lines ───────────────────────────────────────────────────────────────────

function Line({ item, editable }: { item: CartItem; editable: boolean }) {
  const { d } = useT();
  const cart = useCart();
  const open = useOpenProduct();
  const money = useMoney();
  const quantity = editable ? cart.quantity(item.productId) : item.quantity;
  if (editable && !item.isUnavailable && quantity === 0) return null;
  const detail = [item.unitQuantity, item.basketGroupId ? d.forARecipe : ""].filter(Boolean).join(", ");
  return (
    <li className={`line ${item.isUnavailable ? "unavailable" : ""}`} data-product={item.productId}>
      {editable && !item.isUnavailable ? (
        <Stepper
          quantity={quantity}
          maxCount={item.maxCount}
          name={item.name}
          onAdd={() => cart.add(item.productId, item.maxCount)}
          onRemove={() => cart.remove(item.productId)}
        />
      ) : (
        <span className="count">{item.isUnavailable ? "–" : `${item.quantity}×`}</span>
      )}
      <div className="what">
        <button type="button" className="name" onClick={() => open(item.productId)} title={d.openProduct}>
          {item.name}
        </button>
        {detail && <span>{detail}</span>}
        {item.badges.map((badge, i) => (
          <span key={i} className="line-offer">
            {badge.text}
          </span>
        ))}
        {item.isUnavailable && (
          <>
            <span className="gone">{item.unavailableExplanation ?? d.unavailable}</span>
            {editable && item.replacements.length > 0 && (
              <span className="instead">
                {d.replacements}:{" "}
                {item.replacements.slice(0, 3).map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ", "}
                    <button type="button" className="quiet" onClick={() => open(r.id)}>
                      {r.name}
                    </button>
                  </span>
                ))}
              </span>
            )}
            {editable && (
              <button type="button" className="quiet" onClick={() => cart.remove(item.productId, item.quantity)}>
                {d.removeLine}
              </button>
            )}
          </>
        )}
      </div>
      <span className="cost">{item.isUnavailable ? "" : money.plain(item.displayPrice)}</span>
    </li>
  );
}

/** Lines, with a recipe's lines together under its name. */
export function Lines({ cart, editable = true }: { cart: Pick<CartData, "items" | "recipeGroups">; editable?: boolean }) {
  const groups = useMemo(() => {
    const known = new Map(cart.recipeGroups.map((g) => [g.id, g]));
    const out: { group: CartRecipeGroup | null; items: CartItem[] }[] = [];
    const byGroup = new Map<string, CartItem[]>();
    const loose: CartItem[] = [];
    for (const item of cart.items) {
      if (item.basketGroupId && known.has(item.basketGroupId)) {
        byGroup.set(item.basketGroupId, [...(byGroup.get(item.basketGroupId) ?? []), item]);
      } else loose.push(item);
    }
    for (const [id, items] of byGroup) out.push({ group: known.get(id)!, items });
    out.push({ group: null, items: loose });
    return out;
  }, [cart.items, cart.recipeGroups]);
  return (
    <ul className="lines">
      {groups.flatMap(({ group, items }) => [
        ...(group
          ? [
              <li key={`g-${group.id}`} className="line-head">
                <a href={href(`/recipe/${encodeURIComponent(group.id)}`)}>{group.title}</a>
              </li>,
            ]
          : []),
        ...items.map((item) => <Line key={item.id} item={item} editable={editable} />),
      ])}
    </ul>
  );
}

// ─── Sums ────────────────────────────────────────────────────────────────────

/** Savings, deposits and fees above the total, then the total, as on a till receipt. */
export function Sums({
  totalPrice,
  depositBreakdown,
  membershipSavings,
  promoSavings,
  fees,
  loyalty,
}: {
  totalPrice: number;
  depositBreakdown: DepositEntry[];
  membershipSavings: number;
  promoSavings: number;
  fees: FeeEntry[];
  loyalty?: CartFooterData["loyaltyPoints"];
}) {
  const { t } = useT();
  const money = useMoney();
  const deposit = (type: string) =>
    type.toUpperCase() === "BAG" ? t.depositBag : type.toUpperCase() === "BOTTLE" ? t.depositBottle : t.depositGeneric;
  const row = (label: ReactNode, value: string, key: string) => (
    <div className="sum-row" key={key}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
  return (
    <>
      {promoSavings > 0 && row(t.cartPromoLabel, `−${money.plain(promoSavings)}`, "promo")}
      {membershipSavings > 0 && row(t.accountFamilyBadge, `−${money.plain(membershipSavings)}`, "family")}
      {depositBreakdown.filter((e) => e.total > 0).map((e) => row(deposit(e.type), money.plain(e.total), `d-${e.type}`))}
      {fees.map((fee) => row(fee.name, fee.amount < 0 ? `−${money.plain(-fee.amount)}` : money.plain(fee.amount), `f-${fee.type}`))}
      <div className="total">
        <span>{t.totalLabel}</span>
        <span>{money.plain(totalPrice)}</span>
      </div>
      {loyalty && (
        <div className="sum-row points">
          <span {...picnicInk(loyalty.label.color)}>{loyalty.label.text}</span>
          <span {...picnicInk(loyalty.value.color)}>{loyalty.value.text}</span>
        </div>
      )}
    </>
  );
}

// ─── Delivery time ───────────────────────────────────────────────────────────

/** The week at a glance: a column per day, a button per delivery time. */
function SlotPicker({ onClose, onChosen }: { onClose: () => void; onChosen: (cart: CartData) => void }) {
  const { t, d } = useT();
  const dates = useDates();
  const [load, reload] = useLoad<DeliverySlotPickerData>("slots", (signal) => api("cart/delivery-slots", { signal }));
  const [choosing, setChoosing] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const choose = async (slot: DeliverySlotData) => {
    setChoosing(slot.slotId);
    setProblem(null);
    const result = await api<CartData>("cart/delivery-slots", { body: { slotId: slot.slotId } });
    setChoosing(null);
    if (result.ok) onChosen(result.data);
    else setProblem(result.error);
  };

  return (
    <Dialog title={t.pickerTitle} onClose={onClose} wide>
      <p className="hint">
        {t.freeDeliveryLabel} {d.greenHint}
      </p>
      {problem && <ErrorView message={problem} />}
      <Loaded load={load} retry={reload}>
        {(data) => {
          if (!data.dayGroups.length) return <p className="hint">{t.noSlotsLabel}</p>;
          const chosen = data.selectedSlot?.isExplicitSelection ? data.selectedSlot.slotId : null;
          return (
            <div className="week" style={{ gridTemplateColumns: `repeat(${data.dayGroups.length}, minmax(7.5rem, 1fr))` }}>
              {data.dayGroups.map((day) => {
                const slots = [...day.greenSlots, ...day.regularSlots].sort((a, b) => a.windowStart.localeCompare(b.windowStart));
                return (
                  <section key={day.date} className="day" aria-label={`${day.dayLabel} ${day.dateLabel}`}>
                    <h3>
                      {/^\d{4}-\d{2}-\d{2}$/.test(day.date) ? dates.weekday(`${day.date}T12:00:00`) : day.dayLabel}{" "}
                      <small>{/^\d{4}-\d{2}-\d{2}$/.test(day.date) ? dates.short(`${day.date}T12:00:00`) : day.dateLabel}</small>
                    </h3>
                    {slots.map((slot) => (
                      <button
                        key={slot.slotId}
                        type="button"
                        className={`slot ${slot.slotId === chosen ? "chosen" : ""} ${slot.isGreenChoice ? "green" : ""}`}
                        disabled={!slot.isAvailable || choosing !== null}
                        aria-pressed={slot.slotId === chosen}
                        title={slot.isGreenChoice ? t.greenChoiceLabel : undefined}
                        onClick={() => void choose(slot)}
                      >
                        {dates.clock(slot.windowStart)}–{dates.clock(slot.windowEnd)}
                        {slot.isGreenChoice && <span aria-label={t.greenChoiceLabel}> 🌿</span>}
                        {choosing === slot.slotId && <span className="spinner small" aria-hidden="true" />}
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>
          );
        }}
      </Loaded>
    </Dialog>
  );
}

/** "Delivery: Thu 15 Oct, 17:00 to 18:00. Change" */
export function SlotLine({ cart }: { cart: CartData }) {
  const { d } = useT();
  const dates = useDates();
  const [open, setOpen] = useState(false);
  const slot = cart.selectedSlot;
  const window = slot?.windowStart ? dates.window(slot.windowStart, slot.windowEnd, d.to) : null;
  return (
    <>
      <p className={`slot-line ${slot?.isExplicitSelection ? "" : "unchosen"}`}>
        {slot?.isExplicitSelection && window
          ? d.deliveryAt.replace("{window}", window)
          : window
            ? d.deliveryPicked.replace("{window}", window)
            : d.noDeliveryYet}{" "}
        <button type="button" className="quiet" onClick={() => setOpen(true)}>
          {slot?.isExplicitSelection ? d.change : d.chooseTime}
        </button>
      </p>
      {open && (
        <SlotPicker
          onClose={() => setOpen(false)}
          onChosen={(next) => {
            cartModel.accept(next);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

// ─── The receipt ─────────────────────────────────────────────────────────────

function useFooter(totalPrice: number | undefined): CartFooterData | null {
  const [footer, setFooter] = useState<CartFooterData | null>(null);
  useEffect(() => {
    if (totalPrice === undefined) return;
    const controller = new AbortController();
    // The points depend on the total; wait until the clicking stops.
    const timer = setTimeout(() => {
      void api<CartFooterData>("cart/footer", { signal: controller.signal })
        .then((result) => result.ok && setFooter(result.data))
        .catch(() => {});
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [totalPrice]);
  return footer;
}

export function Receipt() {
  const { t, d } = useT();
  const session = useSession();
  const cart = useCart();
  const toast = useToast();
  const money = useMoney();
  const footer = useFooter(cart.cart?.totalPrice);
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const name = useProfileName();

  const signOut = async () => {
    const result = await api("auth/logout", { method: "POST" });
    if (!result.ok) {
      toast(d.signOutFailed, "error");
      return;
    }
    forgetAccount({ signingOut: true });
    await session.refresh();
  };

  const data = cart.cart;
  const count = cart.count;
  const total = data?.totalPrice ?? 0;
  const minimum = data?.minimumOrderValue ?? null;
  const short = minimum ? minimum - total : 0;

  return (
    <div className="receipt" aria-busy={cart.busy}>
      <div className="receipt-head">
        <h2>{t.cartTitle}</h2>
        <span>{count === 1 ? d.oneItem : d.items.replace("{n}", String(count))}</span>
      </div>
      {cart.status === "loading" && !data ? (
        <Spinner />
      ) : !data ? (
        <ErrorView message={cart.error ?? t.cartLoadError} onRetry={() => void cart.refresh()} />
      ) : (
        <>
          {data.items.length > 0 ? <Lines cart={data} /> : <p className="empty-basket">{d.emptyBasket}</p>}
          <div className="sum">
            <Sums
              totalPrice={total}
              depositBreakdown={data.depositBreakdown}
              membershipSavings={data.membershipSavings}
              promoSavings={data.promoSavings}
              fees={data.fees}
              loyalty={footer?.loyaltyPoints}
            />
            {minimum !== null && minimum > 0 && (
              <div className={`minimum ${short <= 0 ? "met" : ""}`}>
                <div className="bar">
                  <i style={{ width: `${Math.min(100, Math.max(0, (total / minimum) * 100))}%` }} />
                </div>
                <p>
                  {short > 0
                    ? d.toGo.replace("{short}", money(short)).replace("{minimum}", money(minimum))
                    : d.aboveMinimum.replace("{minimum}", money(minimum))}
                </p>
              </div>
            )}
            <SlotLine cart={data} />
            {data.items.length > 0 && (
              <button
                type="button"
                className="primary wide"
                disabled={!isMinimumOrderMet(total, minimum) || data.totalCount === 0}
                onClick={() => navigate("/checkout")}
              >
                {t.checkoutLabel}
              </button>
            )}
          </div>
        </>
      )}
      <div className="receipt-foot">
        {data && data.items.length > 0 && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              if (!armed) {
                setArmed(true);
                clearTimeout(armTimer.current);
                armTimer.current = setTimeout(() => setArmed(false), 4000);
                return;
              }
              setArmed(false);
              void cart.clear().then((ok) => !ok && toast(t.clearCartError, "error"));
            }}
          >
            {armed ? d.clickAgainToEmpty : t.clearCartButton}
          </button>
        )}
        <span className="who">
          {name ? d.signedInAs.replace("{name}", name) : ""}{" "}
          <button type="button" className="quiet" onClick={() => void signOut()}>
            {t.signOut}
          </button>
        </span>
      </div>
      <div className="receipt-foot plain">
        <a className="quiet" href={href("/check")}>
          {d.selfCheck}
        </a>
      </div>
    </div>
  );
}
