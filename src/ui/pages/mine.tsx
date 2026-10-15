/**
 * The desk's own ways to fill the basket (a pasted list, bought before,
 * saved products) and the self-check.
 */
import { useEffect, useState } from "react";

import type { SearchApiResponse } from "@/lib/core/types";

import type { Check, HistoryData } from "../../server/desk-routes";
import { ErrorView, Hint, Loaded, Spinner, useLoad, useTitle } from "../components/common";
import { fromCartItem, fromSaved, ProductCell, ProductGrid } from "../components/products";
import { api } from "../lib/api";
import { parseListLine } from "../lib/list";
import { useCart } from "../state/cart";
import { useStarred } from "../state/saved";
import { useSession, useT } from "../state/session";

declare const DESK_SOURCE: string;
const SOURCE = typeof DESK_SOURCE === "string" ? DESK_SOURCE : "https://github.com/KJori/picnic_ha_ui";

// ─── Bought before ───────────────────────────────────────────────────────────

export function HistoryView() {
  const { d, language } = useT();
  useTitle(d.boughtBefore);
  const [round, setRound] = useState(0);
  const [load, reload] = useLoad<HistoryData>(`history:${round}`, (signal) =>
    api(`desk/history${round ? "?refresh=1" : ""}`, { signal })
  );
  const when = new Intl.DateTimeFormat(language === "en" ? "en-GB" : language, { day: "numeric", month: "short" });
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
                return entry ? d.timesBought.replace("{n}", String(entry.times)).replace("{date}", when.format(new Date(entry.lastBought))) : undefined;
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
      {rows?.map((row, index) => <WantedRow key={`${index}:${row.line}`} row={row} />)}
    </>
  );
}

/** One line of the list: its best matches, the first click adding the line's amount. */
function WantedRow({ row }: { row: Wanted }) {
  const { d } = useT();
  const cart = useCart();
  const [load, reload] = useLoad<SearchApiResponse>(row.query, (signal) =>
    api(`search?${new URLSearchParams({ q: row.query })}`, { signal })
  );
  const products = load.status === "ready" ? load.data.products.slice(0, 3) : [];
  const done = products.some((p) => cart.quantity(p.id) > 0);
  return (
    <section className={`wanted ${done ? "done" : ""}`}>
      <h3>
        {row.query} {row.count > 1 && <small>{d.wantCount.replace("{n}", String(row.count))}</small>}
        {done && <small className="in-basket-note">{d.inBasket}</small>}
      </h3>
      {load.status === "loading" && <Spinner />}
      {load.status === "error" && <ErrorView message={load.message} onRetry={reload} />}
      {load.status === "ready" && !products.length && <Hint>{d.noMatch.replace("{q}", row.query)}</Hint>}
      {products.length > 0 && (
        <ul className="products">
          {products.map((product) => (
            <ProductCell key={product.id} product={product} want={row.count} />
          ))}
        </ul>
      )}
    </section>
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
