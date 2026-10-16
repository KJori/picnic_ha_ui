/**
 * The desk's own ways to fill the basket (a pasted list, bought before,
 * saved products) and the self-check.
 */
import { useEffect, useState } from "react";

import type { SearchApiResponse } from "@/lib/core/types";

import type { Check, HistoryData } from "../../server/desk-routes";
import { ErrorView, Hint, Loaded, Spinner, useDates, useLoad, useTitle, useToast } from "../components/common";
import { fromCartItem, fromSaved, ProductCell, ProductGrid } from "../components/products";
import { api } from "../lib/api";
import { parseListLine } from "../lib/list";
import { cartModel, useCart } from "../state/cart";
import { pickTerm, setPick, snapshot, usePicks } from "../state/lists";
import { useStarred } from "../state/saved";
import { useSession, useT } from "../state/session";

declare const DESK_SOURCE: string;
const SOURCE = typeof DESK_SOURCE === "string" ? DESK_SOURCE : "https://github.com/KJori/picnic_ha_ui";

// ─── Bought before ───────────────────────────────────────────────────────────

export function HistoryView() {
  const { d } = useT();
  useTitle(d.boughtBefore);
  const [round, setRound] = useState(0);
  const [load, reload] = useLoad<HistoryData>(`history:${round}`, (signal) =>
    api(`desk/history${round ? "?refresh=1" : ""}`, { signal })
  );
  const dates = useDates();
  return (
    <>
      <div className="view-bar">
        <p>{load.status === "ready" ? d.boughtBeforeHint.replace("{n}", String(load.data.deliveries)) : ""}</p>
        <button type="button" className="quiet" onClick={() => setRound((n) => n + 1)} disabled={load.status === "loading"}>
          {d.refresh}
        </button>
      </div>
      <Loaded load={load} retry={reload}>
        {(data) =>
          data.items.length ? (
            <ProductGrid
              products={data.items.map((entry) => fromCartItem(entry.item))}
              notes={(product) => {
                const entry = data.items.find((e) => e.item.productId === product.id);
                return entry ? d.timesBought.replace("{n}", String(entry.times)).replace("{date}", dates.short(entry.lastBought)) : undefined;
              }}
            />
          ) : (
            <Hint>{d.nothingHere}</Hint>
          )
        }
      </Loaded>
    </>
  );
}

// ─── Saved ───────────────────────────────────────────────────────────────────

export function SavedView() {
  const { d } = useT();
  useTitle(d.starred);
  const list = useStarred();
  if (!list) return <Spinner />;
  return (
    <>
      <Hint>{list.length ? d.starredHint : d.starredEmpty}</Hint>
      {list.length > 0 && <ProductGrid products={list.map(fromSaved)} />}
    </>
  );
}

// ─── A pasted list ───────────────────────────────────────────────────────────

type Wanted = { line: string; count: number; query: string };
const LIST_KEY = "picnic_desk_list";

export function ListView() {
  const { d } = useT();
  useTitle(d.pasteList);
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(LIST_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [rows, setRows] = useState<Wanted[] | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(LIST_KEY, text);
    } catch {
      // the list lasts as long as the page
    }
  }, [text]);
  return (
    <>
      <form
        className="paste"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = text
            .split("\n")
            .flatMap((line) => {
              const wanted = parseListLine(line);
              return wanted ? [{ line: line.trim(), ...wanted }] : [];
            })
            .slice(0, 60);
          setRows(parsed.length ? parsed : null);
        }}
      >
        <label htmlFor="list-text">{d.pasteListHelp}</label>
        <textarea
          id="list-text"
          rows={8}
          spellCheck={false}
          value={text}
          placeholder={"2 havermelk\ntofu\nbananen\n3x tomatenblokjes"}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="paste-actions">
          <button type="submit" className="primary" disabled={!text.trim()}>
            {d.findThese}
          </button>
          {rows && (
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setRows(null);
                setText("");
              }}
            >
              {d.newList}
            </button>
          )}
        </div>
      </form>
      {rows && <PicksBar rows={rows} />}
      {rows?.map((row, index) => <WantedRow key={`${index}:${row.line}`} row={row} />)}
    </>
  );
}

/**
 * One line of the list: the product picked for these words last time first,
 * then the best matches. The first click adds the line's amount; any click
 * makes that product the pick for next time.
 */
function WantedRow({ row }: { row: Wanted }) {
  const { d } = useT();
  const cart = useCart();
  const picks = usePicks();
  const pick = picks?.[pickTerm(row.query)];
  const [load, reload] = useLoad<SearchApiResponse>(row.query, (signal) =>
    api(`search?${new URLSearchParams({ q: row.query })}`, { signal })
  );
  const found = load.status === "ready" ? load.data.products.slice(0, 3) : [];
  // The pick as Picnic sends it now when it is among the matches (current price), else as kept.
  const picked = pick ? (found.find((p) => p.id === pick.id) ?? fromSaved(pick)) : null;
  const products = [...(picked ? [picked] : []), ...found.filter((p) => p.id !== pick?.id)];
  const done = products.some((p) => cart.quantity(p.id) > 0);
  return (
    <section className={`wanted ${done ? "done" : ""}`}>
      <h3>
        {row.query} {row.count > 1 && <small>{d.wantCount.replace("{n}", String(row.count))}</small>}
        {done && <small className="in-basket-note">{d.inBasket}</small>}
      </h3>
      {picked && (
        <p className="pick-note">
          {d.yourPick}: {picked.name}
          <button type="button" className="quiet" onClick={() => void setPick(row.query, null)}>
            {d.forgetPick}
          </button>
        </p>
      )}
      {load.status === "loading" && !picked && <Spinner />}
      {load.status === "error" && <ErrorView message={load.message} onRetry={reload} />}
      {load.status === "ready" && !products.length && <Hint>{d.noMatch.replace("{q}", row.query)}</Hint>}
      {products.length > 0 && (
        <ul className="products">
          {products.map((product) => (
            <ProductCell
              key={product.id}
              product={product}
              want={row.count}
              onAdd={() => void setPick(row.query, snapshot({ ...product, productId: product.id }))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** "Put my 5 usual picks in the basket": every line that has a pick, at the line's amount. */
function PicksBar({ rows }: { rows: Wanted[] }) {
  const { t, d } = useT();
  const toast = useToast();
  const picks = usePicks();
  const [busy, setBusy] = useState(false);
  const wanted = rows.flatMap((row) => {
    const pick = picks?.[pickTerm(row.query)];
    return pick ? [{ productId: pick.id, count: row.count, maxCount: 99 }] : [];
  });
  if (!wanted.length) return null;
  return (
    <p className="picks-bar">
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await cartModel.addMany(wanted);
          setBusy(false);
          if (result.failed.length) toast(d.listSomeFailed.replace("{n}", String(result.failed.length)), "error");
          else if (!result.changed.length) toast(d.listNothingToAdd);
          else {
            toast(d.listAdded.replace("{n}", String(result.changed.length)), "info", {
              label: d.undo,
              run: () => void cartModel.takeBack(result.changed),
            });
          }
        }}
      >
        {busy ? t.checkoutProcessing : d.addAllPicks.replace("{n}", String(wanted.length))}
      </button>
    </p>
  );
}

// ─── The self-check ──────────────────────────────────────────────────────────

export function CheckView() {
  const { d } = useT();
  const session = useSession();
  useTitle(d.selfCheck);
  const [run, setRun] = useState(1);
  const [load] = useLoad<{ checks: Check[] }>(`check:${run}`, (signal) => api("desk/selfcheck", { signal }));
  return (
    <>
      <h2>{d.selfCheck}</h2>
      <Hint>{d.selfCheckHelp}</Hint>
      {load.status === "loading" && <Spinner label={d.checking} />}
      {load.status === "error" && <ErrorView message={load.message} />}
      {load.status === "ready" && (
        <ul className="checks">
          {load.data.checks.map((check) => (
            <li key={check.key} className={check.ok ? "" : "broken"}>
              <strong>{d.checkNames[check.key] ?? check.name}</strong>
              <span className="verdict">{check.ok ? d.works : d.broken}</span>
              <p>
                {check.detail} · {check.ms} ms
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="paste-actions">
        <button type="button" className="secondary" disabled={load.status === "loading"} onClick={() => setRun((n) => n + 1)}>
          {d.runAgain}
        </button>
        <a className="quiet" href={`api/desk/raw?${new URLSearchParams({ page: "category-tree-root" })}`} download>
          {d.downloadRaw}
        </a>
      </div>
      <p className="hint about">
        Picnic Desk {session.state?.version}. {d.aboutText} {d.sourceCode}:{" "}
        <a href={SOURCE} target="_blank" rel="noopener noreferrer">
          {SOURCE}
        </a>{" "}
        (AGPL-3.0).
        {session.demo && ` ${d.demoNote}`}
      </p>
    </>
  );
}
