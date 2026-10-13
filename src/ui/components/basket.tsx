/**
 * The basket as a till receipt: always on the right of the shelf, and as a
 * page of its own at #/cart.
 */
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { isMinimumOrderMet } from "@/lib/cart/minimum-order";
import type { DeliverySlotData, DeliverySlotPickerData } from "@/lib/core/delivery-slot-types";
import type {
  CartData,
  CartFooterData,
  CartFooterText,
  CartItem,
  CartRecipeGroup,
  DepositEntry,
  FeeEntry,
} from "@/lib/core/types";
import { formatTime } from "@/lib/delivery/format-delivery-window";

import { api } from "../lib/api";
import { href, navigate } from "../lib/router";
import { useCart } from "../state/cart";
import { useT } from "../state/session";
import {
  Badge,
  Confirm,
  Dialog,
  ErrorView,
  Img,
  Loaded,
  Price,
  Spinner,
  Stepper,
  useLoad,
  useMoney,
  useToast,
} from "./common";
import { MiniRow, useOpenProduct } from "./products";

// ─── Lines ───────────────────────────────────────────────────────────────────

export function BasketLine({ item, editable = true }: { item: CartItem; editable?: boolean }) {
  const { d } = useT();
  const cart = useCart();
  const open = useOpenProduct();
  const quantity = editable ? cart.quantity(item.productId) : item.quantity;
  return (
    <li className={`line ${item.isUnavailable ? "line-unavailable" : ""}`} data-product={item.productId}>
      <div className="line-main">
        {editable && !item.isUnavailable ? (
          <Stepper
            quantity={quantity}
            maxCount={item.maxCount}
            name={item.name}
            onAdd={() => cart.add(item.productId, item.maxCount)}
            onRemove={() => cart.remove(item.productId)}
          />
        ) : (
          <span className="line-qty">{item.isUnavailable ? "–" : `${item.quantity}×`}</span>
        )}
        <button type="button" className="line-name link-like" onClick={() => open(item.productId)}>
          <Img id={item.imageId} className="line-picture" alt="" />
          <span>
            {item.name}
            <small>{item.unitQuantity}</small>
          </span>
        </button>
        {!item.isUnavailable && <Price cents={item.displayPrice} was={item.originalPrice} className="line-price" />}
      </div>
      {item.badges.length > 0 && (
        <p className="line-badges">
          {item.badges.map((badge, i) => (
            <Badge key={i} badge={badge} />
          ))}
        </p>
      )}
      {item.isUnavailable && (
        <div className="line-problem">
          <p>{item.unavailableExplanation ?? d.unavailable}</p>
          {editable && item.replacements.length > 0 && <MiniRow title={d.replacements} products={item.replacements} />}
          {editable && (
            <button type="button" className="button quiet small" onClick={() => cart.remove(item.productId, item.quantity)}>
              {d.removeLine}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function RecipeGroup({ group, items, editable }: { group: CartRecipeGroup; items: CartItem[]; editable: boolean }) {
  return (
    <li className="line-group">
      <a className="line-group-head" href={href(`/recipe/${encodeURIComponent(group.id)}`)}>
        <Img id={group.imageId} kind="recipe" className="line-group-picture" alt="" />
        <span>{group.title}</span>
      </a>
      <ul className="lines">
        {items.map((item) => (
          <BasketLine key={item.id} item={item} editable={editable} />
        ))}
      </ul>
    </li>
  );
}

export function BasketLines({ cart, editable = true }: { cart: Pick<CartData, "items" | "recipeGroups">; editable?: boolean }) {
  const { t } = useT();
  const { groups, others } = useMemo(() => {
    const byGroup = new Map<string, CartItem[]>();
    const others: CartItem[] = [];
    for (const item of cart.items) {
      if (item.basketGroupId) byGroup.set(item.basketGroupId, [...(byGroup.get(item.basketGroupId) ?? []), item]);
      else others.push(item);
    }
    const known = new Set(cart.recipeGroups.map((g) => g.id));
    // Lines of a group Picnic did not describe are shown as ordinary lines.
    for (const [id, items] of byGroup) if (!known.has(id)) others.push(...items);
    const groups = cart.recipeGroups
      .filter((g) => byGroup.get(g.id)?.length)
      .map((group) => ({ group, items: byGroup.get(group.id)! }));
    return { groups, others };
  }, [cart.items, cart.recipeGroups]);
  return (
    <ul className="lines">
      {groups.map(({ group, items }) => (
        <RecipeGroup key={group.id} group={group} items={items} editable={editable} />
      ))}
      {groups.length > 0 && others.length > 0 && <li className="lines-heading">{t.cartOtherItems}</li>}
      {others.map((item) => (
        <BasketLine key={item.id} item={item} editable={editable} />
      ))}
    </ul>
  );
}

// ─── Totals ──────────────────────────────────────────────────────────────────

const coloured = (text: CartFooterText) => <span style={text.color ? { color: text.color } : undefined}>{text.text}</span>;

export function Totals({
  totalPrice,
  totalCount,
  depositBreakdown,
  membershipSavings,
  promoSavings,
  fees,
  minimumOrderValue,
  loyaltyPoints,
}: {
  totalPrice: number;
  totalCount: number;
  depositBreakdown: DepositEntry[];
  membershipSavings: number;
  promoSavings: number;
  fees: FeeEntry[];
  minimumOrderValue: number | null;
  loyaltyPoints?: CartFooterData["loyaltyPoints"];
}) {
  const { t } = useT();
  const money = useMoney();
  const deposit = (type: string) =>
    type.toUpperCase() === "BAG" ? t.depositBag : type.toUpperCase() === "BOTTLE" ? t.depositBottle : t.depositGeneric;
  const hasDeliveryFee = fees.some((fee) => fee.type.toUpperCase().includes("DELIVERY"));
  const row = (label: ReactNode, value: ReactNode, className = "") => (
    <div className={`sum-row ${className}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <dl className="sum">
      {row(`${t.itemsLabel} (${totalCount})`, "")}
      {membershipSavings > 0 && row(<span className="pill pill-family">{t.accountFamilyBadge}</span>, `−${money(membershipSavings)}`)}
      {promoSavings > 0 && row(<span className="pill pill-promo">{t.cartPromoLabel}</span>, `−${money(promoSavings)}`)}
      {depositBreakdown.filter((e) => e.total > 0).map((e) => row(deposit(e.type), money(e.total)))}
      {fees.map((fee) => row(fee.name, fee.amount < 0 ? `−${money(-fee.amount)}` : money(fee.amount)))}
      {!hasDeliveryFee && row(t.cartDeliveryLabel, t.cartDeliveryFree)}
      {minimumOrderValue !== null &&
        minimumOrderValue > 0 &&
        row(
          t.minimumOrderLabel,
          <span className={totalPrice >= minimumOrderValue ? "met" : "unmet"}>
            {totalPrice >= minimumOrderValue ? "✓ " : ""}
            {money(minimumOrderValue)}
          </span>
        )}
      {row(t.totalLabel, money(totalPrice), "sum-total")}
      {loyaltyPoints && row(coloured(loyaltyPoints.label), coloured(loyaltyPoints.value), "sum-points")}
    </dl>
  );
}

// ─── Delivery time ───────────────────────────────────────────────────────────

export function SlotBanner({ cart, onChosen }: { cart: CartData; onChosen?: (cart: CartData) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const model = useCart();
  return (
    <>
      <button type="button" className="slot-banner" onClick={() => setOpen(true)}>
        <span className="slot-icon" aria-hidden="true">
          ⏱
        </span>
        <span>
          <strong>{cart.deliveryBannerText}</strong>
          {!cart.selectedSlot?.isExplicitSelection && <small>{t.tapToChoose}</small>}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {open && (
        <SlotPicker
          onClose={() => setOpen(false)}
          onChosen={(next) => {
            model.accept(next);
            onChosen?.(next);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

export function SlotPicker({ onClose, onChosen }: { onClose: () => void; onChosen: (cart: CartData) => void }) {
  const { t } = useT();
  const [load, reload] = useLoad<DeliverySlotPickerData>("slots", (signal) => api("cart/delivery-slots", { signal }));
  const [day, setDay] = useState(0);
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
    <Dialog title={t.pickerTitle} onClose={onClose} className="slot-dialog">
      <p className="free">{t.freeDeliveryLabel}</p>
      <Loaded load={load} retry={reload}>
        {(data) => {
          if (!data.dayGroups.length) return <p className="empty">{t.noSlotsLabel}</p>;
          const current = data.dayGroups[Math.min(day, data.dayGroups.length - 1)];
          const all = [...current.greenSlots, ...current.regularSlots].sort((a, b) =>
            a.windowStart.localeCompare(b.windowStart)
          );
          const selectedId = data.selectedSlot?.isExplicitSelection ? data.selectedSlot.slotId : null;
          return (
            <>
              <div className="day-tabs" role="tablist">
                {data.dayGroups.map((group, index) => (
                  <button
                    key={group.date}
                    type="button"
                    role="tab"
                    aria-selected={index === day}
                    onClick={() => setDay(index)}
                  >
                    <strong>{group.dayLabel}</strong>
                    <span>{group.dateLabel}</span>
                  </button>
                ))}
              </div>
              {problem && <p className="problem">{problem}</p>}
              <ul className="slots">
                {all.map((slot) => (
                  <li key={slot.slotId}>
                    <button
                      type="button"
                      className={`slot ${slot.slotId === selectedId ? "slot-chosen" : ""}`}
                      disabled={!slot.isAvailable || choosing !== null}
                      onClick={() => void choose(slot)}
                      aria-pressed={slot.slotId === selectedId}
                    >
                      <span>
                        {formatTime(new Date(slot.windowStart))} – {formatTime(new Date(slot.windowEnd))}
                      </span>
                      {slot.isGreenChoice && <span className="green">🌿 {t.greenChoiceLabel}</span>}
                      {choosing === slot.slotId && <span className="spinner small" aria-hidden="true" />}
                      {slot.slotId === selectedId && <span aria-hidden="true">✓</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          );
        }}
      </Loaded>
    </Dialog>
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

export function Receipt({ full = false }: { full?: boolean }) {
  const { t, d } = useT();
  const cart = useCart();
  const toast = useToast();
  const [confirmClear, setConfirmClear] = useState(false);
  const footer = useFooter(cart.cart?.totalPrice);
  const money = useMoney();

  if (cart.status === "loading" && !cart.cart) return <Spinner />;
  if (!cart.cart) return <ErrorView message={cart.error ?? t.cartLoadError} onRetry={() => void cart.refresh()} />;
  const data = cart.cart;
  const empty = data.items.length === 0;
  const canCheckout = !empty && isMinimumOrderMet(data.totalPrice, data.minimumOrderValue) && data.totalCount > 0;

  return (
    <div className={`receipt ${full ? "receipt-full" : ""}`} aria-busy={cart.busy}>
      <header className="receipt-head">
        <h2>{t.cartTitle}</h2>
        <span className="receipt-count">
          {cart.count} · {money(data.totalPrice)}
        </span>
      </header>
      <SlotBanner cart={data} />
      {empty ? (
        <p className="receipt-empty">{d.emptyBasket}</p>
      ) : (
        <BasketLines cart={data} />
      )}
      {!empty && (
        <Totals
          totalPrice={data.totalPrice}
          totalCount={data.totalCount}
          depositBreakdown={data.depositBreakdown}
          membershipSavings={data.membershipSavings}
          promoSavings={data.promoSavings}
          fees={data.fees}
          minimumOrderValue={data.minimumOrderValue}
          loyaltyPoints={footer?.loyaltyPoints}
        />
      )}
      {!empty && (
        <div className="receipt-actions">
          <button type="button" className="button primary wide" disabled={!canCheckout} onClick={() => navigate("/checkout")}>
            {t.checkoutLabel}
          </button>
          {!isMinimumOrderMet(data.totalPrice, data.minimumOrderValue) && <p className="hint">{t.checkoutMinimumNotMet}</p>}
          <button type="button" className="button quiet small" onClick={() => setConfirmClear(true)}>
            {t.clearCartButton}
          </button>
        </div>
      )}
      {full && footer?.recommendations && (
        <section className="mini-row">
          <h3>
            <a
              href={href(
                `/pages?${new URLSearchParams({ pageId: footer.recommendations.pageId, title: footer.recommendations.title })}`
              )}
            >
              {footer.recommendations.title} ›
            </a>
          </h3>
          <div className="tiles">
            {footer.recommendations.tiles.map((tile) => (
              <RecommendationTile key={tile.productId} productId={tile.productId} imageId={tile.imageId} background={tile.backgroundColor} promo={tile.hasPromo} />
            ))}
          </div>
        </section>
      )}
      {full && !footer?.recommendations && <MiniRow title={t.nothingForgotten} products={data.suggestions} />}
      {confirmClear && (
        <Confirm
          title={t.clearCartConfirmTitle}
          message={t.clearCartConfirmMessage}
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            void cart.clear().then((ok) => !ok && toast(t.clearCartError, "error"));
          }}
        />
      )}
    </div>
  );
}

function RecommendationTile({
  productId,
  imageId,
  background,
  promo,
}: {
  productId: string;
  imageId: string;
  background: string | null;
  promo: boolean;
}) {
  const open = useOpenProduct();
  const { d } = useT();
  return (
    <button
      type="button"
      className={`tile ${promo ? "tile-promo" : ""}`}
      style={{ backgroundColor: background ?? undefined }}
      onClick={() => open(productId)}
      aria-label={d.openProduct}
    >
      <Img id={imageId} alt="" />
    </button>
  );
}
