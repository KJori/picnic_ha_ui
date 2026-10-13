/**
 * The shelf: search results, Picnic's category tree, categories and other
 * product pages.
 */
import { useEffect, useState } from "react";

import type { CategoryItem, SubcategoriesApiResponse } from "@/lib/category/category-types";
import type { CategoryProductsApiResponse, SearchApiResponse } from "@/lib/core/types";
import type { RscPageModel } from "@/lib/rsc/rsc-page-types";

import type { Shortcut } from "../../server/desk-routes";
import { Empty, Img, Loaded, useLoad } from "../components/common";
import { ProductSections, useTitle } from "../components/products";
import { RscPageView } from "../components/rsc";
import { api } from "../lib/api";
import { back, href, navigate, type Route } from "../lib/router";
import { useT } from "../state/session";

/** The page the Picnic app shows on its search tab before anything is typed. */
const CATEGORY_TREE_PAGE_ID = "category-tree-root";

export function SearchPage({ route }: { route: Route }) {
  const query = route.query.get("q")?.trim() ?? "";
  return query ? <SearchResults query={query} /> : <ShopHome />;
}

/** Set when a search is sent with Enter: the results then take the focus, as on the old desk. */
let focusResults = false;

function SearchResults({ query }: { query: string }) {
  const { t } = useT();
  useTitle(`“${query}”`);
  const [load, reload] = useLoad<SearchApiResponse>(query, (signal) =>
    api(`search?${new URLSearchParams({ q: query })}`, { signal })
  );
  useEffect(() => {
    if (load.status !== "ready" || !focusResults) return;
    focusResults = false;
    document.querySelector<HTMLElement>(".cells .cell-open")?.focus();
  }, [load]);
  return (
    <Loaded load={load} retry={reload}>
      {(data) =>
        data.products.length === 0 ? (
          <div className="empty">
            <p>
              {t.noResultsFor} “{query}”
            </p>
            <p className="hint">{t.tryAnotherTerm}</p>
          </div>
        ) : (
          <>
            <p className="count">
              {data.products.length} {data.products.length === 1 ? t.resultSingular : t.resultPlural} {t.resultFor} “{query}”
            </p>
            <ProductSections products={data.products} sections={data.sections} />
          </>
        )
      }
    </Loaded>
  );
}

function ShopHome() {
  const { d } = useT();
  useTitle(null);
  const [tree, reloadTree] = useLoad<RscPageModel>("tree", (signal) =>
    api(`rsc-pages?${new URLSearchParams({ pageId: CATEGORY_TREE_PAGE_ID })}`, { signal })
  );
  return (
    <div className="home">
      <Shortcuts />
      <section className="home-categories">
        <h2>{d.categories}</h2>
        <Loaded load={tree} retry={reloadTree}>
          {(page) => <RscPageView page={page} />}
        </Loaded>
      </section>
    </div>
  );
}

function Shortcuts() {
  const { d } = useT();
  const [load] = useLoad<{ shortcuts: Shortcut[] }>("shortcuts", (signal) => api("desk/shortcuts", { signal }));
  if (load.status !== "ready" || !load.data.shortcuts.length) return null;
  return (
    <nav className="shortcuts" aria-label={d.shortcuts}>
      {load.data.shortcuts.map((shortcut) => (
        <a key={shortcut.label + shortcut.query} href={href(`/search?${new URLSearchParams({ q: shortcut.query })}`)}>
          {shortcut.label}
        </a>
      ))}
      <a className="shortcuts-edit" href={href("/account#shortcuts")}>
        {d.editShortcuts}
      </a>
    </nav>
  );
}

function BackBar({ fallback, title }: { fallback: string; title: string }) {
  const { t } = useT();
  return (
    <div className="back-bar">
      <button type="button" className="link-like" onClick={() => back(fallback)}>
        ‹ {t.backButton}
      </button>
      <h2>{title}</h2>
    </div>
  );
}

export function CategoryPage({ categoryId }: { categoryId: string }) {
  const { t } = useT();
  const [load, reload] = useLoad<SubcategoriesApiResponse>(categoryId, (signal) =>
    api(`categories/${encodeURIComponent(categoryId)}/subcategories`, { signal })
  );
  const title = load.status === "ready" ? load.data.title || t.categoryFallbackTitle : t.categoryFallbackTitle;
  useTitle(title);
  return (
    <>
      <BackBar fallback="/search" title={title} />
      <Loaded load={load} retry={reload}>
        {(data) =>
          data.subcategories.length === 0 ? (
            <Empty>{t.noProductsInCategory}</Empty>
          ) : (
            <div className="category-tiles">
              {data.subcategories.map((sub: CategoryItem) => (
                <a
                  key={sub.id}
                  className="category-tile"
                  href={href(`/categories/${encodeURIComponent(categoryId)}/${encodeURIComponent(sub.id)}`)}
                >
                  <Img id={sub.imageId} alt="" />
                  <span>{sub.name}</span>
                </a>
              ))}
            </div>
          )
        }
      </Loaded>
    </>
  );
}

export function SubcategoryPage({ categoryId, subcategoryId }: { categoryId: string; subcategoryId: string }) {
  const [load, reload] = useLoad<CategoryProductsApiResponse>(subcategoryId, (signal) =>
    api(`categories/${encodeURIComponent(subcategoryId)}/products`, { signal })
  );
  return <ProductsPage load={load} reload={reload} fallback={`/categories/${encodeURIComponent(categoryId)}`} />;
}

export function PickedPage({ route }: { route: Route }) {
  const { t } = useT();
  const pageId = route.query.get("pageId") ?? "";
  const [load, reload] = useLoad<CategoryProductsApiResponse>(pageId || null, (signal) =>
    api(`pages/products?${new URLSearchParams({ pageId })}`, { signal })
  );
  if (!pageId) return <Empty>{t.noPageSpecified}</Empty>;
  return <ProductsPage load={load} reload={reload} fallback="/search" title={route.query.get("title") ?? undefined} />;
}

function ProductsPage({
  load,
  reload,
  fallback,
  title,
}: {
  load: ReturnType<typeof useLoad<CategoryProductsApiResponse>>[0];
  reload: () => void;
  fallback: string;
  title?: string;
}) {
  const { t } = useT();
  const shown = (load.status === "ready" && load.data.title) || title || t.defaultPageTitle;
  useTitle(shown);
  return (
    <>
      <BackBar fallback={fallback} title={shown} />
      <Loaded load={load} retry={reload}>
        {(data) => {
          if (data.rscPage) return <RscPageView page={data.rscPage} />;
          const products = Array.isArray(data.products) ? data.products : [];
          if (!products.length) return <Empty>{t.noProductsInCategory}</Empty>;
          return (
            <>
              <p className="count">
                {products.length} {products.length === 1 ? t.productSingular : t.productPlural}
              </p>
              <ProductSections products={products} sections={Array.isArray(data.sections) ? data.sections : []} />
            </>
          );
        }}
      </Loaded>
    </>
  );
}

/** The search box, with Picnic's suggestions while typing. */
export function SearchBox({ route }: { route: Route }) {
  const { t, d } = useT();
  const current = route.path === "/search" ? (route.query.get("q") ?? "") : "";
  const [text, setText] = useState(current);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);

  useEffect(() => setText(current), [current]);

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2 || query === current) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<{ suggestions: { id: string; suggestion: string }[] }>(
        `suggestions?${new URLSearchParams({ q: query })}`,
        { signal: controller.signal }
      )
        .then((result) => {
          if (result.ok) {
            setSuggestions(result.data.suggestions.map((s) => s.suggestion).slice(0, 8));
            setActive(-1);
          }
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, current]);

  const go = (value: string) => {
    const query = value.trim();
    setOpen(false);
    setSuggestions([]);
    navigate(query ? `/search?${new URLSearchParams({ q: query })}` : "/search");
  };

  return (
    <form
      className="find"
      role="search"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        focusResults = true;
        go(active >= 0 ? suggestions[active] : text);
      }}
    >
      <label className="visually-hidden" htmlFor="q">
        {t.searchAriaLabel}
      </label>
      <input
        id="q"
        type="search"
        value={text}
        placeholder={t.searchPlaceholder}
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
          if (event.key === "ArrowDown" && suggestions.length) {
            event.preventDefault();
            setActive((i) => Math.min(suggestions.length - 1, i + 1));
          } else if (event.key === "ArrowUp" && suggestions.length) {
            event.preventDefault();
            setActive((i) => Math.max(-1, i - 1));
          } else if (event.key === "Escape") {
            if (open && suggestions.length) setOpen(false);
            else if (text) go("");
          }
        }}
      />
      <kbd title={d.slashHint}>/</kbd>
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
                go(suggestion);
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
