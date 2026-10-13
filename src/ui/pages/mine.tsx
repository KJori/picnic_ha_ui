/**
 * Picnic Desk's own ways to fill the basket (bought before, starred, a pasted
 * list) and the account screen.
 */
import { useEffect, useMemo, useState } from "react";

import type { CartItem, Product, SearchApiResponse } from "@/lib/core/types";
import type { ProfileData } from "@/lib/core/user-types";

import type { Check, HistoryData, Shortcut } from "../../server/desk-routes";
import { Receipt } from "../components/basket";
import { Empty, ErrorView, Img, Loaded, Price, Spinner, Stepper, useLoad, useToast } from "../components/common";
import { ProductCell, StarButton, useOpenProduct, useTitle } from "../components/products";
import { api } from "../lib/api";
import { parseListLine } from "../lib/list";
import { href } from "../lib/router";
import { cartModel, useCart } from "../state/cart";
import { forgetSaved, useStarred } from "../state/saved";
import { useSession, useT } from "../state/session";

declare const DESK_SOURCE: string;
const SOURCE = typeof DESK_SOURCE === "string" ? DESK_SOURCE : "https://github.com/KJori/picnic_ha_ui";

// ─── The basket as a page ────────────────────────────────────────────────────

export function BasketPage() {
  const { t } = useT();
  useTitle(t.cartTitle);
  return <Receipt full />;
}

// ─── Bought before ───────────────────────────────────────────────────────────

export function HistoryPage() {
  const { d } = useT();
  useTitle(d.boughtBefore);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState("");
  const [load, reload] = useLoad<HistoryData>(`history:${refresh}`, (signal) =>
    api(`desk/history${refresh ? "?refresh=1" : ""}`, { signal })
  );
  return (
    <div className="history">
      <div className="view-bar">
        <h2>{d.boughtBefore}</h2>
        <input
          type="search"
          className="filter-search"
          value={filter}
          placeholder={d.filter}
          aria-label={d.filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button type="button" className="button small" onClick={() => setRefresh((n) => n + 1)} disabled={load.status === "loading"}>
          {d.refresh}
        </button>
      </div>
      <Loaded load={load} retry={reload}>
        {(data) => {
          const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
          const items = data.items.filter((entry) => words.every((w) => entry.item.name.toLowerCase().includes(w)));
          return (
            <>
              <p className="hint">{d.boughtBeforeHint.replace("{n}", String(data.deliveries))}</p>
              {items.length === 0 ? <Empty>{d.nothingHere}</Empty> : (
                <ul className="past">
                  {items.map((entry) => (
                    <PastItem key={entry.item.productId} item={entry.item} times={entry.times} />
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </Loaded>
    </div>
  );
}

function PastItem({ item, times }: { item: CartItem; times: number }) {
  const { d } = useT();
  const cart = useCart();
  const open = useOpenProduct();
  const unit = item.quantity ? Math.round(item.displayPrice / item.quantity) : item.displayPrice;
  return (
    <li className="past-item" data-product={item.productId}>
      <button type="button" className="link-like" onClick={() => open(item.productId)}>
        <Img id={item.imageId} alt="" />
        <span>
          {item.name}
          <small>
            {item.unitQuantity} · {d.timesBought.replace("{n}", String(times))}
          </small>
        </span>
      </button>
      <Price cents={unit} />
      <Stepper
        quantity={cart.quantity(item.productId)}
        maxCount={item.maxCount}
        name={item.name}
        onAdd={() => cart.add(item.productId, item.maxCount)}
        onRemove={() => cart.remove(item.productId)}
      />
      <StarButton product={{ id: item.productId, name: item.name, imageId: item.imageId, unitQuantity: item.unitQuantity, displayPrice: unit }} />
    </li>
  );
}

// ─── Starred ─────────────────────────────────────────────────────────────────

export function StarredPage() {
  const { d } = useT();
  useTitle(d.starred);
  const list = useStarred();
  const cart = useCart();
  const open = useOpenProduct();
  if (!list) return <Spinner />;
  return (
    <div className="starred">
      <h2>{d.starred}</h2>
      {list.length === 0 ? (
        <Empty>{d.starredEmpty}</Empty>
      ) : (
        <ul className="past">
          {list.map((product) => (
            <li key={product.id} className="past-item" data-product={product.id}>
              <button type="button" className="link-like" onClick={() => open(product.id)}>
                <Img id={product.imageId} alt="" />
                <span>
                  {product.name}
                  <small>{product.unitQuantity}</small>
                </span>
              </button>
              <Price cents={product.displayPrice} />
              <Stepper
                quantity={cart.quantity(product.id)}
                maxCount={99}
                name={product.name}
                onAdd={() => cart.add(product.id)}
                onRemove={() => cart.remove(product.id)}
              />
              <StarButton product={product} />
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{d.starredHint}</p>
    </div>
  );
}

// ─── A pasted list ───────────────────────────────────────────────────────────

type ListRow = { line: string; count: number; query: string };
const LIST_KEY = "picnic_desk_list";

export function ListPage() {
  const { d } = useT();
  useTitle(d.pasteList);
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(LIST_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [rows, setRows] = useState<ListRow[] | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(LIST_KEY, text);
    } catch {
      // the list lasts as long as the page
    }
  }, [text]);
  return (
    <div className="list">
      <h2>{d.pasteList}</h2>
      {!rows ? (
        <form
          className="paste"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = text
              .split("\n")
              .map((line) => ({ line, parsed: parseListLine(line) }))
              .flatMap(({ line, parsed }) => (parsed ? [{ line: line.trim(), ...parsed }] : []));
            if (parsed.length) setRows(parsed.slice(0, 60));
          }}
        >
          <label htmlFor="list-text">{d.pasteListHelp}</label>
          <textarea
            id="list-text"
            rows={10}
            spellCheck={false}
            value={text}
            placeholder={"2 havermelk\ntofu\nbananen\n3x tomatenblokjes"}
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" className="button primary" disabled={!text.trim()}>
            {d.findThese}
          </button>
        </form>
      ) : (
        <>
          <button type="button" className="button quiet" onClick={() => setRows(null)}>
            ‹ {d.editList}
          </button>
          <ol className="list-rows">
            {rows.map((row, index) => (
              <ListLine key={`${index}:${row.line}`} row={row} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

/** One line of the list: the best matches, the first added with the line's amount at one click. */
function ListLine({ row }: { row: ListRow }) {
  const { t, d } = useT();
  const cart = useCart();
  const [load, reload] = useLoad<SearchApiResponse>(row.query, (signal) =>
    api(`search?${new URLSearchParams({ q: row.query })}`, { signal })
  );
  const products = load.status === "ready" ? load.data.products.filter((p) => !p.isUnavailable).slice(0, 4) : [];
  const [shown, setShown] = useState(1);
  const done = products.some((p) => cart.quantity(p.id) > 0);
  return (
    <li className={`list-row ${done ? "list-row-done" : ""}`}>
      <p className="list-line">
        <strong>{row.line}</strong>
        {products[0] && !done && (
          <button
            type="button"
            className="button small primary"
            onClick={() => cart.add(products[0].id, products[0].maxCount, row.count)}
          >
            {t.addToCartButton} {row.count > 1 ? `${row.count}×` : ""}
          </button>
        )}
      </p>
      {load.status === "loading" && <Spinner />}
      {load.status === "error" && <ErrorView message={load.message} onRetry={reload} />}
      {load.status === "ready" && products.length === 0 && <p className="muted">{t.noResultsFor} “{row.query}”</p>}
      <div className="cells">
        {products.slice(0, shown).map((product: Product) => (
          <ProductCell key={product.id} product={product} />
        ))}
      </div>
      {products.length > shown && (
        <button type="button" className="link-like" onClick={() => setShown(products.length)}>
          {d.otherMatches} ({products.length - shown})
        </button>
      )}
    </li>
  );
}

// ─── Account ─────────────────────────────────────────────────────────────────

export function AccountPage() {
  const { t, d } = useT();
  const session = useSession();
  useTitle(t.navAccount);
  const [profile] = useLoad<ProfileData>("profile", (signal) => api("user/profile", { signal }));
  const [signingOut, setSigningOut] = useState(false);
  return (
    <div className="account">
      <h2>{t.navAccount}</h2>
      <section className="panel">
        {profile.status === "ready" ? (
          <p>
            <strong>{profile.data.name}</strong>
            {profile.data.addressLine && <span className="muted"> · {profile.data.addressLine}</span>}
            {profile.data.hasMembership && <span className="pill pill-family">{t.accountFamilyBadge}</span>}
          </p>
        ) : profile.status === "loading" ? (
          <Spinner />
        ) : (
          <p className="muted">{profile.message}</p>
        )}
        <p>
          <a href={href("/deliveries")}>{t.deliveriesTitle} ›</a> · <a href={href("/parcels")}>{t.accountParcels} ›</a>
        </p>
        <button
          type="button"
          className="button"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await api("auth/logout", { method: "POST" });
            cartModel.reset();
            forgetSaved();
            await session.refresh();
          }}
        >
          {t.signOut}
        </button>
        {session.state?.demo && <p className="hint">{d.demoNote}</p>}
      </section>
      <ShortcutEditor />
      <SelfCheck />
      <section className="panel">
        <h3>{d.about}</h3>
        <p className="muted">
          Picnic Desk {session.state?.version} · {d.aboutText}
        </p>
        <p className="muted">
          {d.sourceCode}:{" "}
          <a href={SOURCE} target="_blank" rel="noopener noreferrer">
            {SOURCE}
          </a>{" "}
          (AGPL-3.0)
        </p>
        <p className="muted">
          <a href={`api/desk/raw?${new URLSearchParams({ page: "category-tree-root" })}`} download>
            {d.downloadRaw}
          </a>
        </p>
      </section>
    </div>
  );
}

function ShortcutEditor() {
  const { d } = useT();
  const toast = useToast();
  const [load, , replace] = useLoad<{ shortcuts: Shortcut[] }>("shortcuts-edit", (signal) => api("desk/shortcuts", { signal }));
  const [draft, setDraft] = useState<Shortcut[] | null>(null);
  const list = draft ?? (load.status === "ready" ? load.data.shortcuts : []);
  const save = async (shortcuts: Shortcut[] | null) => {
    const result = await api<{ shortcuts: Shortcut[] }>("desk/shortcuts", { method: "PUT", body: { shortcuts } });
    if (result.ok) {
      replace(result.data);
      setDraft(null);
      toast(d.saved);
    } else toast(result.error, "error");
  };
  return (
    <section className="panel" id="shortcuts">
      <h3>{d.shortcuts}</h3>
      <p className="hint">{d.shortcutsHelp}</p>
      <ul className="shortcut-edit">
        {list.map((shortcut, index) => (
          <li key={index}>
            <input
              aria-label={d.shortcutLabel}
              value={shortcut.label}
              maxLength={40}
              onChange={(event) => setDraft(list.map((s, i) => (i === index ? { ...s, label: event.target.value } : s)))}
            />
            <input
              aria-label={d.shortcutQuery}
              value={shortcut.query}
              maxLength={100}
              onChange={(event) => setDraft(list.map((s, i) => (i === index ? { ...s, query: event.target.value } : s)))}
            />
            <button type="button" className="icon-button" aria-label={`${d.remove}: ${shortcut.label}`} onClick={() => setDraft(list.filter((_, i) => i !== index))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="dialog-actions">
        <button type="button" className="button quiet" onClick={() => setDraft([...list, { label: "", query: "" }])} disabled={list.length >= 24}>
          {d.addShortcut}
        </button>
        <button type="button" className="button quiet" onClick={() => void save(null)}>
          {d.resetShortcuts}
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!draft}
          onClick={() => void save(list.filter((s) => s.label.trim() && s.query.trim()))}
        >
          {d.save}
        </button>
      </div>
    </section>
  );
}

function SelfCheck() {
  const { d } = useT();
  const [run, setRun] = useState(0);
  const [load, reload] = useLoad<{ checks: Check[] }>(run ? `check:${run}` : null, (signal) => api("desk/selfcheck", { signal }));
  const failures = useMemo(() => (load.status === "ready" ? load.data.checks.filter((c) => !c.ok).length : 0), [load]);
  return (
    <section className="panel">
      <h3>{d.selfCheck}</h3>
      <p className="hint">{d.selfCheckHelp}</p>
      <button type="button" className="button" onClick={() => setRun((n) => n + 1)} disabled={run > 0 && load.status === "loading"}>
        {d.runSelfCheck}
      </button>
      {run > 0 && (
        <Loaded load={load} retry={reload}>
          {(data) => (
            <>
              <p className={failures ? "problem" : "met"}>{failures ? d.selfCheckProblems.replace("{n}", String(failures)) : d.selfCheckOk}</p>
              <table className="checks">
                <tbody>
                  {data.checks.map((check) => (
                    <tr key={check.name} className={check.ok ? "ok" : "bad"}>
                      <th scope="row">
                        {check.ok ? "✓" : "✗"} {check.name}
                      </th>
                      <td>{check.detail}</td>
                      <td className="muted">{check.ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Loaded>
      )}
    </section>
  );
}
