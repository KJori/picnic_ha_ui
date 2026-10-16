/**
 * Lists: a basket kept for another time ("weekly basics"). Saved from the
 * receipt, put back in the basket in one go, topping up what is there.
 */
import { useState } from "react";

import type { ListItem, ShoppingList } from "../../server/desk-routes";
import { Dialog, Hint, Img, Spinner, useDates, useMoney, useTitle, useToast } from "../components/common";
import { useOpenProduct } from "../components/products";
import { cartModel, useCart } from "../state/cart";
import { itemsFromBasket, newListId, saveLists, useLists, wantedFromList } from "../state/lists";
import { useT } from "../state/session";

const LISTS_MAX = 30;

export function ListsView() {
  const { d } = useT();
  useTitle(d.lists);
  const lists = useLists();
  if (!lists) return <Spinner />;
  return (
    <>
      <Hint>{lists.length ? d.listsHint : d.listsEmpty}</Hint>
      <div className="lists">
        {lists.map((list) => (
          <ListCard key={list.id} list={list} lists={lists} />
        ))}
      </div>
    </>
  );
}

function ListCard({ list, lists }: { list: ShoppingList; lists: ShoppingList[] }) {
  const { t, d } = useT();
  const toast = useToast();
  const money = useMoney();
  const cart = useCart();
  const open = useOpenProduct();
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [armed, setArmed] = useState(false);

  const update = async (change: Partial<ShoppingList>) => {
    const error = await saveLists(lists.map((l) => (l.id === list.id ? { ...l, ...change, updatedAt: new Date().toISOString() } : l)));
    if (error) toast(error, "error");
  };
  const setItems = (items: ListItem[]) => void update({ items });

  const putInBasket = async () => {
    setBusy(true);
    const result = await cartModel.addMany(wantedFromList(list));
    setBusy(false);
    if (result.failed.length) toast(d.listSomeFailed.replace("{n}", String(result.failed.length)), "error");
    else if (!result.changed.length) toast(d.listNothingToAdd);
    else {
      toast(d.listAdded.replace("{n}", String(result.changed.length)), "info", {
        label: d.undo,
        run: () => void cartModel.takeBack(result.changed),
      });
    }
  };

  const total = list.items.reduce((sum, item) => sum + item.product.displayPrice * item.count, 0);
  const count = list.items.length;
  return (
    <section className="list-card" aria-labelledby={`list-${list.id}`}>
      <header>
        {renaming ? (
          <form
            className="rename"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
              setRenaming(false);
              if (name && name !== list.name) void update({ name });
            }}
          >
            <input name="name" defaultValue={list.name} maxLength={60} required aria-label={d.listName} autoFocus />
            <button type="submit" className="secondary">
              {d.saveList}
            </button>
          </form>
        ) : (
          <h3 id={`list-${list.id}`}>{list.name}</h3>
        )}
        <p className="hint">
          {count === 1 ? d.oneListItem : d.listItemCount.replace("{n}", String(count))} ·{" "}
          {d.aboutPrice.replace("{price}", money(total))}
        </p>
      </header>
      <div className="actions start">
        <button type="button" className="primary" disabled={busy || !count} onClick={() => void putInBasket()}>
          {busy ? t.checkoutProcessing : d.putInBasket}
        </button>
        <button
          type="button"
          className="quiet"
          disabled={!cart.cart?.items.length}
          onClick={() => {
            const items = itemsFromBasket(cart.cart?.items ?? []);
            if (!items.length) return toast(d.emptyNothingToSave);
            setItems(items);
            toast(d.listReplaced.replace("{name}", list.name));
          }}
        >
          {d.replaceWithBasket}
        </button>
        <button type="button" className="quiet" onClick={() => setRenaming((r) => !r)}>
          {d.renameList}
        </button>
        <button
          type="button"
          className="quiet danger"
          onClick={() => {
            if (!armed) {
              setArmed(true);
              setTimeout(() => setArmed(false), 4000);
              return;
            }
            void saveLists(lists.filter((l) => l.id !== list.id)).then((error) => error && toast(error, "error"));
          }}
        >
          {armed ? d.clickAgainToDelete : d.deleteList}
        </button>
      </div>
      <ul className="list-items">
        {list.items.map((item, index) => (
          <li key={item.product.id} data-product={item.product.id}>
            <Img id={item.product.imageId} name={item.product.name} />
            <button type="button" className="name" onClick={() => open(item.product.id)} title={d.openProduct}>
              {item.product.name}
            </button>
            <span className="unit">{item.product.unitQuantity}</span>
            <span className="stepper small">
              <button
                type="button"
                className="less"
                aria-label={d.oneFewer.replace("{name}", item.product.name)}
                onClick={() =>
                  setItems(
                    item.count <= 1
                      ? list.items.filter((_, at) => at !== index)
                      : list.items.map((it, at) => (at === index ? { ...it, count: it.count - 1 } : it))
                  )
                }
              >
                −
              </button>
              <output>{item.count}</output>
              <button
                type="button"
                className="more"
                disabled={item.count >= Math.min(99, item.maxCount)}
                aria-label={d.oneMore.replace("{name}", item.product.name)}
                onClick={() => setItems(list.items.map((it, at) => (at === index ? { ...it, count: it.count + 1 } : it)))}
              >
                +
              </button>
            </span>
            <button
              type="button"
              className="quiet remove"
              aria-label={d.removeFromList.replace("{name}", item.product.name)}
              onClick={() => setItems(list.items.filter((_, at) => at !== index))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Save as list", from under the receipt. */
export function SaveListDialog({ onClose }: { onClose: () => void }) {
  const { t, d } = useT();
  const toast = useToast();
  const dates = useDates();
  const cart = useCart();
  const lists = useLists();
  const [saving, setSaving] = useState(false);
  const items = itemsFromBasket(cart.cart?.items ?? []);
  return (
    <Dialog title={d.saveAsList} onClose={onClose} className="sheet-small">
      {!items.length ? (
        <p>{d.emptyNothingToSave}</p>
      ) : (
        <form
          className="save-list"
          onSubmit={async (event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
            if (!name || !lists) return;
            if (lists.length >= LISTS_MAX) return toast(d.tooManyLists, "error");
            setSaving(true);
            const list: ShoppingList = { id: newListId(), name, items, updatedAt: new Date().toISOString() };
            const error = await saveLists([...lists, list]);
            setSaving(false);
            if (error) return toast(error, "error");
            toast(d.listSaved.replace("{name}", name));
            onClose();
          }}
        >
          <label htmlFor="list-name">{d.listName}</label>
          <input
            id="list-name"
            name="name"
            maxLength={60}
            required
            autoFocus
            defaultValue={d.listDefaultName.replace("{date}", dates.short(Date.now()))}
          />
          <p className="hint">{items.length === 1 ? d.oneListItem : d.listItemCount.replace("{n}", String(items.length))}</p>
          <div className="actions">
            <button type="button" className="secondary" onClick={onClose}>
              {t.cancelButton}
            </button>
            <button type="submit" className="primary" disabled={saving || !lists}>
              {d.saveList}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
