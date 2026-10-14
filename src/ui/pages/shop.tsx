/**
 * The search tab (shortcuts, results, several searches at once) and the
 * category tab (Picnic's aisles on the left, the shelf on the right).
 */
import { type FormEvent, useEffect, useRef, useState } from "react";

import type { SubcategoriesApiResponse } from "@/lib/category/category-types";
import type { CategoryProductsApiResponse, SearchApiResponse } from "@/lib/core/types";
import type { RscPageModel } from "@/lib/rsc/rsc-page-types";

import type { Shortcut } from "../../server/desk-routes";
import { ErrorView, Hint, Loaded, Spinner, useLoad, useTitle, useToast } from "../components/common";
import { ProductGrid, ProductSections } from "../components/products";
import { Aisles, RscPageView } from "../components/rsc";
import { api } from "../lib/api";
import { href, navigate, type Route } from "../lib/router";
import { useT } from "../state/session";

/** The page the Picnic app shows on its search tab before anything is typed. */
const CATEGORY_TREE_PAGE_ID = "category-tree-root";

/** Words separated by commas are searched one after the other, as on the old desk. */
export const searchTerms = (text: string) => [...new Set(text.split(",").map((t) => t.trim()).filter((t) => t.length >= 2))];

/** Set when a search is sent with Enter: the results then take the focus. */
let focusResults = false;

// ─── Search ──────────────────────────────────────────────────────────────────

export function SearchView({ route }: { route: Route }) {
  const terms = searchTerms(route.query.get("q") ?? "");
  return (
    <>
      <Shortcuts />
      {terms.length === 0 ? <SearchHint /> : terms.length === 1 ? <OneSearch term={terms[0]} /> : <ManySearches terms={terms} />}
    </>
  );
}

function SearchHint() {
  const { d } = useT();
  useTitle(null);
  return (
    <p className="hint">
      {d.searchHint1} <strong>/</strong> {d.searchHint2} <strong>Enter</strong> {d.searchHint3} <strong>+</strong>{" "}
      {d.and} <strong>−</strong> {d.searchHint4} <strong>s</strong> {d.searchHint5} <a href={href("/categories")}>{d.categories}</a>.
    </p>
  );
}

const search = (term: string, signal: AbortSignal) => api<SearchApiResponse>(`search?${new URLSearchParams({ q: term })}`, { signal });

function useFocusResults(ready: boolean) {
  useEffect(() => {
    if (!ready || !focusResults) return;
    focusResults = false;
    document.querySelector<HTMLElement>(".products .product")?.focus();
  }, [ready]);
}

function OneSearch({ term }: { term: string }) {
  const { t, d } = useT();
  useTitle(`“${term}”`);
  const [load, reload] = useLoad<SearchApiResponse>(term, (signal) => search(term, signal));
  useFocusResults(load.status === "ready");
  return (
    <Loaded load={load} retry={reload}>
      {(data) =>
        data.products.length === 0 ? (
          <Hint>{d.noMatch.replace("{q}", term)}</Hint>
        ) : (
          <>
            <p className="hint">
              {data.products.length} {data.products.length === 1 ? t.resultSingular : t.resultPlural} {t.resultFor} “{term}”
            </p>
            <ProductSections products={data.products} sections={data.sections} />
          </>
        )
      }
    </Loaded>
  );
}

function ManySearches({ terms }: { terms: string[] }) {
  const { d } = useT();
  useTitle(terms.join(", "));
  // One after the other, as Picnic counts requests; a product shows only under its first word.
  const [load, reload] = useLoad<{ term: string; products: SearchApiResponse["products"] }[]>(terms.join("\n"), async (signal) => {
    const groups = [];
    const shown = new Set<string>();
    for (const term of terms) {
      const result = await search(term, signal);
      if (!result.ok) return result;
      const products = result.data.products.filter((p) => !shown.has(p.id));
      products.forEach((p) => shown.add(p.id));
      groups.push({ term, products });
    }
    return { ok: true, data: groups };
  });
  useFocusResults(load.status === "ready");
  return (
    <Loaded load={load} retry={reload}>
      {(groups) => (
        <>
          {groups.map(({ term, products }) => (
            <section key={term} className="group">
              <h3>{term}</h3>
              {products.length ? <ProductGrid products={products} /> : <Hint>{d.noMatchWord}</Hint>}
            </section>
          ))}
        </>
      )}
    </Loaded>
  );
}

// ─── Shortcuts ───────────────────────────────────────────────────────────────

function Shortcuts() {
  const { d } = useT();
  const toast = useToast();
  const [load, , replace] = useLoad<{ shortcuts: Shortcut[] }>("shortcuts", (signal) => api("desk/shortcuts", { signal }));
  const [editing, setEditing] = useState(false);
  const label = useRef<HTMLInputElement>(null);
  const list = load.status === "ready" ? load.data.shortcuts : [];

  const save = async (shortcuts: Shortcut[] | null) => {
    const result = await api<{ shortcuts: Shortcut[] }>("desk/shortcuts", { method: "PUT", body: { shortcuts } });
    if (result.ok) replace(result.data);
    else toast(result.error, "error");
  };

  useEffect(() => {
    if (editing) label.current?.focus();
  }, [editing]);

  return (
    <div className="shortcuts">
      <div className="chips">
        {list.map((shortcut, index) =>
          editing ? (
            <button
              key={index}
              type="button"
              className="chip removable"
              aria-label={d.removeShortcut.replace("{name}", shortcut.label)}
              onClick={() => void save(list.filter((_, at) => at !== index))}
            >
              {shortcut.label}
              <span>×</span>
            </button>
          ) : (
            <a key={index} className="chip" href={href(`/search?${new URLSearchParams({ q: shortcut.query })}`)} title={shortcut.query}>
              {shortcut.label}
            </a>
          )
        )}
        <button type="button" className="quiet" onClick={() => setEditing((e) => !e)}>
          {editing ? d.done : d.editShortcuts}
        </button>
      </div>
      {editing && (
        <>
          <form
            className="shortcut-form"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const next = { label: String(form.get("label") ?? "").trim(), query: String(form.get("query") ?? "").trim() };
              if (!next.label || !next.query) return;
              event.currentTarget.reset();
              void save([...list, next]);
            }}
          >
            <input ref={label} name="label" maxLength={40} required placeholder={d.shortcutLabelExample} aria-label={d.shortcutLabel} />
            <input name="query" maxLength={100} required placeholder={d.shortcutQueryExample} aria-label={d.shortcutQuery} />
            <button type="submit" className="secondary">
              {d.addShortcut}
            </button>
            <button type="button" className="quiet" onClick={() => void save(null)}>
              {d.resetShortcuts}
            </button>
          </form>
          <Hint>{d.shortcutsHelp}</Hint>
        </>
      )}
    </div>
  );
}

// ─── Categories ──────────────────────────────────────────────────────────────

/**
 * Picnic's aisles in a column on the left; on the right a category's
 * subcategories as tabs and the products of the chosen one, or a page Picnic
 * links to (promotions).
 */
export function CategoriesView({ route }: { route: Route }) {
  const { d } = useT();
  const [tree, reloadTree] = useLoad<RscPageModel>("tree", (signal) =>
    api(`rsc-pages?${new URLSearchParams({ pageId: CATEGORY_TREE_PAGE_ID })}`, { signal })
  );
  const [, l1, l2] = route.segments;
  return (
    <div className="aisle-view">
      <Loaded load={tree} retry={reloadTree}>
        {(page) => <Aisles page={page} route={route} />}
      </Loaded>
      <div className="aisle-shelf">
        {route.segments[0] === "pages" ? (
          <PickedPage route={route} />
        ) : l1 ? (
          <Category categoryId={l1} subcategoryId={l2} route={route} />
        ) : (
          <Hint>{d.chooseAisle}</Hint>
        )}
      </div>
    </div>
  );
}

function Category({ categoryId, subcategoryId, route }: { categoryId: string; subcategoryId?: string; route: Route }) {
  const { t } = useT();
  const [load, reload] = useLoad<SubcategoriesApiResponse>(categoryId, (signal) =>
    api(`categories/${encodeURIComponent(categoryId)}/subcategories`, { signal })
  );
  const subs = load.status === "ready" ? load.data.subcategories : [];
  const chosen = subcategoryId ?? subs[0]?.id;
  useTitle(load.status === "ready" ? load.data.title : t.categoryFallbackTitle);
  return (
    <>
      <Loaded load={load} retry={reload}>
        {(data) => (
          <>
            <h2>{data.title || t.categoryFallbackTitle}</h2>
            <div className="chips">
              {data.subcategories.map((sub) => (
                <a
                  key={sub.id}
                  className="chip"
                  aria-pressed={sub.id === chosen}
                  href={href(`/categories/${encodeURIComponent(categoryId)}/${encodeURIComponent(sub.id)}`)}
                >
                  {sub.name}
                </a>
              ))}
            </div>
          </>
        )}
      </Loaded>
      {chosen && <Products key={chosen} path={`categories/${encodeURIComponent(chosen)}/products`} route={route} />}
    </>
  );
}

function PickedPage({ route }: { route: Route }) {
  const { t } = useT();
  const pageId = route.query.get("pageId") ?? "";
  const title = route.query.get("title");
  if (!pageId) return <Hint>{t.noPageSpecified}</Hint>;
  return (
    <>
      {title && <h2>{title}</h2>}
      <Products key={pageId} path={`pages/products?${new URLSearchParams({ pageId })}`} route={route} />
    </>
  );
}

function Products({ path, route }: { path: string; route: Route }) {
  const { t } = useT();
  const [load, reload] = useLoad<CategoryProductsApiResponse>(path, (signal) => api(path, { signal }));
  if (load.status === "loading") return <Spinner />;
  if (load.status === "error") return <ErrorView message={load.message} onRetry={reload} />;
  const data = load.data;
  if (data.rscPage) return <RscPageView page={data.rscPage} route={route} />;
  const products = Array.isArray(data.products) ? data.products : [];
  if (!products.length) return <Hint>{t.noProductsInCategory}</Hint>;
  return <ProductSections products={products} sections={Array.isArray(data.sections) ? data.sections : []} />;
}

// ─── The search box ──────────────────────────────────────────────────────────

/** The big search box, with Picnic's suggestions while typing. */
export function SearchBox({ route }: { route: Route }) {
  const { t, d } = useT();
  const current = route.path === "/search" ? (route.query.get("q") ?? "") : "";
  const [text, setText] = useState(current);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => setText(current), [current]);

  useEffect(() => {
    // Suggestions for the word being typed (after the last comma).
    const word = text.split(",").at(-1)!.trim();
    if (word.length < 2 || text === current) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<{ suggestions: { id: string; suggestion: string }[] }>(`suggestions?${new URLSearchParams({ q: word })}`, {
        signal: controller.signal,
      })
        .then((result) => {
          if (result.ok) {
            setSuggestions(result.data.suggestions.map((s) => s.suggestion).slice(0, 8));
            setActive(-1);
          }
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, current]);

  const go = (value: string) => {
    setOpen(false);
    setSuggestions([]);
    const query = value.trim();
    navigate(query ? `/search?${new URLSearchParams({ q: query })}` : "/search");
  };
  const withSuggestion = (suggestion: string) => {
    const parts = text.split(",");
    parts[parts.length - 1] = parts.length > 1 ? ` ${suggestion}` : suggestion;
    return parts.join(",");
  };

  return (
    <form
      className="find"
      role="search"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        focusResults = true;
        go(active >= 0 ? withSuggestion(suggestions[active]) : text);
      }}
    >
      <label className="visually-hidden" htmlFor="q">
        {t.searchAriaLabel}
      </label>
      <input
        id="q"
        ref={box}
        type="text"
        value={text}
        placeholder={d.searchPlaceholder}
        spellCheck={false}
        enterKeyHint="search"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="suggestions"
        aria-activedescendant={active >= 0 ? `suggestion-${active}` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && suggestions.length && open) {
            event.preventDefault();
            setActive((i) => Math.min(suggestions.length - 1, i + 1));
          } else if (event.key === "ArrowUp" && suggestions.length && open) {
            event.preventDefault();
            setActive((i) => Math.max(-1, i - 1));
          } else if (event.key === "Escape") {
            if (open && suggestions.length) setOpen(false);
            else if (text) go("");
          }
        }}
      />
      {text ? (
        <button
          type="button"
          className="clear"
          aria-label={d.clearSearch}
          onClick={() => {
            setText("");
            go("");
            box.current?.focus();
          }}
        >
          ×
        </button>
      ) : (
        <kbd title={d.slashHint}>/</kbd>
      )}
      {open && suggestions.length > 0 && (
        <ul id="suggestions" className="suggestions" role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              id={`suggestion-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                go(withSuggestion(suggestion));
              }}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
