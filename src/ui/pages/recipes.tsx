/**
 * Picnic's cookbook: browse, search, save, plan a week, and put a recipe's
 * ingredients in the basket.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MEAL_PLAN_MAX_CANDIDATES } from "@/lib/core/constants";
import type {
  CookbookApiResponse,
  IngredientAlternative,
  IngredientEditData,
  MealPlanSearchResponse,
  MealPlanShoppingListResponse,
  RecipeDetail,
  RecipeIngredient,
  RecipeItem,
} from "@/lib/core/types";
import { renderMarkdownBold } from "@/lib/pml/render-markdown-bold";

import { packs, packsPrice, recipePrice } from "../../shared/recipe-price";
import type { RecipePrice } from "../../server/desk-routes";
import { Dialog, Empty, ErrorView, Img, Loaded, Price, useLoad, useMoney, useToast } from "../components/common";
import { AllergenList, Fold, NutritionTable } from "../components/product-dialog";
import { useOpenProduct, useTitle } from "../components/products";
import { api } from "../lib/api";
import { back, href } from "../lib/router";
import { cartModel } from "../state/cart";
import { toggleSavedRecipe, useSavedRecipes } from "../state/saved";
import { useT } from "../state/session";

// ─── Recipe cards ────────────────────────────────────────────────────────────

/** Card prices are asked for a few at a time, only for cards on screen. */
const priceQueue: (() => Promise<void>)[] = [];
let pricesRunning = 0;
function queuePrice(job: () => Promise<void>) {
  priceQueue.push(job);
  const next = () => {
    if (pricesRunning >= 2 || !priceQueue.length) return;
    pricesRunning += 1;
    void priceQueue
      .shift()!()
      .finally(() => {
        pricesRunning -= 1;
        next();
      });
  };
  next();
}
const knownPrices = new Map<string, RecipePrice | null>();

function CardPrice({ recipeId }: { recipeId: string }) {
  const { d } = useT();
  const money = useMoney();
  const ref = useRef<HTMLSpanElement>(null);
  const [price, setPrice] = useState<RecipePrice | null | undefined>(knownPrices.get(recipeId));
  useEffect(() => {
    if (price !== undefined || !ref.current) return;
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      queuePrice(async () => {
        if (cancelled) return;
        const result = await api<RecipePrice>(`desk/recipe-price?${new URLSearchParams({ id: recipeId })}`);
        const value = result.ok ? result.data : null;
        knownPrices.set(recipeId, value);
        if (!cancelled) setPrice(value);
      });
    });
    observer.observe(ref.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [recipeId, price]);
  return (
    <span ref={ref} className="card-price">
      {price === undefined ? "…" : price === null ? "" : `${money(price.perServing)} ${d.perServingShort}`}
    </span>
  );
}

function SaveHeart({ recipeId, name }: { recipeId: string; name: string }) {
  const { t } = useT();
  const toast = useToast();
  const saved = useSavedRecipes().has(recipeId);
  return (
    <button
      type="button"
      className={`heart ${saved ? "heart-on" : ""}`}
      aria-pressed={saved}
      aria-label={`${saved ? t.recipeUnsave : t.recipeSave}: ${name}`}
      title={saved ? t.recipeUnsave : t.recipeSave}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSavedRecipe(recipeId, () => toast(t.recipeSaveError, "error"));
      }}
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}

function RecipeCard({
  recipe,
  planned,
  onPlan,
  planLabel,
  planDisabled,
}: {
  recipe: RecipeItem;
  planned: boolean;
  onPlan: (id: string) => void;
  planLabel: string;
  planDisabled: boolean;
}) {
  const { t } = useT();
  return (
    <article className="recipe-card" data-recipe={recipe.id}>
      <a href={href(`/recipe/${encodeURIComponent(recipe.id)}`)}>
        <Img id={recipe.imageId} kind="recipe" alt="" />
        <h3>{recipe.name}</h3>
      </a>
      <p className="recipe-meta">
        {recipe.cookingTimeMinutes !== null && (
          <span>
            ⏱ {recipe.cookingTimeMinutes} {t.cookingTimeMinutes}
          </span>
        )}
        <CardPrice recipeId={recipe.id} />
      </p>
      <SaveHeart recipeId={recipe.id} name={recipe.name} />
      <label className="plan-check">
        <input type="checkbox" checked={planned} disabled={planDisabled && !planned} onChange={() => onPlan(recipe.id)} />
        <span className="visually-hidden">
          {planLabel}: {recipe.name}
        </span>
      </label>
    </article>
  );
}

// ─── Meal plan memory ────────────────────────────────────────────────────────

type PlanMemory = { recipes: RecipeItem[]; days: number; people: number };
const PLAN_KEY = "picnic_desk_meal_plan";

function readPlan(): PlanMemory | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PLAN_KEY) ?? "null");
    if (value && typeof value === "object" && Array.isArray((value as PlanMemory).recipes)) return value as PlanMemory;
  } catch {
    // no stored plan, or storage not available
  }
  return null;
}

function writePlan(plan: PlanMemory | null) {
  try {
    if (plan && plan.recipes.length) localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    else localStorage.removeItem(PLAN_KEY);
  } catch {
    // storage not available: the plan lasts as long as the page
  }
}

// ─── The cookbook ────────────────────────────────────────────────────────────

const PAGE = 24;

export function CookbookPage() {
  const { t, d } = useT();
  const toast = useToast();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<(string | null)[]>([null]);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [stored, setStored] = useState<PlanMemory | null>(readPlan);
  const [days, setDays] = useState(stored?.days ?? 7);
  const [people, setPeople] = useState(stored?.people ?? 2);
  const [plan, setPlan] = useState<RecipeItem[] | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [planning, setPlanning] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  useTitle(plan ? t.mealPlanPageTitle : t.cookbookTitle);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    void api<Record<string, number>>("cookbook/counts").then((r) => r.ok && setCounts(r.data));
  }, []);

  const key = query ? `q:${query}` : `c:${selected.join(",")}`;
  const [load, reload] = useLoad<RecipeItem[]>(key, async (signal) => {
    const paths = query
      ? [`cookbook/search?${new URLSearchParams({ q: query })}`]
      : selected.map((id) => (id ? `cookbook?${new URLSearchParams({ category: id })}` : "cookbook"));
    const results = await Promise.all(paths.map((path) => api<CookbookApiResponse>(path, { signal })));
    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) return { ok: false, error: failed.error, code: failed.code };
    const seen = new Set<string>();
    const merged: RecipeItem[] = [];
    for (const result of results) {
      if (!result.ok) continue;
      if (result.data.categories?.length) setCategories(result.data.categories);
      for (const recipe of result.data.recipes ?? []) {
        if (!seen.has(recipe.id)) {
          seen.add(recipe.id);
          merged.push(recipe);
        }
      }
    }
    return { ok: true, data: merged };
  });
  useEffect(() => setVisible(PAGE), [key]);

  const all = load.status === "ready" ? load.data : [];
  const shown = plan ?? all;
  const storedIds = useMemo(() => new Set(stored?.recipes.map((r) => r.id) ?? []), [stored]);

  const remember = useCallback(
    (recipes: RecipeItem[]) => {
      const next = recipes.length ? { recipes, days, people } : null;
      writePlan(next);
      setStored(next);
    },
    [days, people]
  );

  const keptRecipes = plan ? plan.filter((r) => kept.has(r.id)) : (stored?.recipes ?? []);

  const generate = async () => {
    if (!all.length) return;
    const fixed = keptRecipes;
    const slots = days - fixed.length;
    if (slots < 1) return;
    const fixedIds = new Set(fixed.map((r) => r.id));
    const pool = all.filter((r) => !fixedIds.has(r.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setPlanning(true);
    const result = await api<MealPlanSearchResponse>("meal-plan/search", {
      body: {
        candidateIds: pool.slice(0, MEAL_PLAN_MAX_CANDIDATES).map((r) => r.id),
        fixedIds: [...fixedIds],
        slots,
        people,
      },
    });
    setPlanning(false);
    if (!result.ok) {
      toast(result.code === "RATE_LIMITED" ? t.mealPlanRateLimited : t.mealPlanGenerateError, "error");
      return;
    }
    const byId = new Map(all.map((r) => [r.id, r]));
    const picked = (result.data.combinations[0]?.recipeIds ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const next = [...fixed, ...picked];
    setPlan(next);
    setKept(new Set(fixedIds));
    if (next.length < days) {
      toast(t.mealPlanNotEnoughRecipes.replaceAll("{available}", String(next.length)).replace("{requested}", String(days)));
    }
  };

  useEffect(() => {
    if (plan) remember(plan.filter((r) => kept.has(r.id)));
  }, [plan, kept, remember]);

  const togglePlanned = (id: string) => {
    if (plan) {
      setKept((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    const current = stored?.recipes ?? [];
    if (current.some((r) => r.id === id)) remember(current.filter((r) => r.id !== id));
    else {
      const recipe = all.find((r) => r.id === id);
      if (recipe) remember([...current, recipe]);
    }
  };

  const options = [
    { id: null as string | null, name: t.cookbookFeatured, count: counts.__featured__ },
    { id: "__saved__", name: t.cookbookSaved, count: counts.__saved__ },
    ...categories.map((c) => ({ id: c.id as string | null, name: c.name, count: counts[c.id] })),
  ];

  return (
    <div className="cookbook">
      <aside className="cookbook-filters" aria-label={t.cookbookCategoryLabel}>
        <h2>{plan ? t.mealPlanPageTitle : t.cookbookTitle}</h2>
        {!plan && (
          <>
            <input
              type="search"
              className="filter-search"
              value={searchText}
              placeholder={t.cookbookSearchPlaceholder}
              aria-label={t.cookbookSearchPlaceholder}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <fieldset disabled={Boolean(query)}>
              <legend className="visually-hidden">{t.cookbookCategoryLabel}</legend>
              {options.map((option) => {
                const on = selected.includes(option.id);
                return (
                  <label key={option.id ?? "featured"} className="filter">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = on ? selected.filter((s) => s !== option.id) : [...selected, option.id];
                        setSelected(next.length ? next : [null]);
                      }}
                    />
                    <span>{option.name}</span>
                    {option.count !== undefined && <small>{option.count}</small>}
                  </label>
                );
              })}
            </fieldset>
          </>
        )}
        <div className="planner">
          <h3>{t.mealPlanPageTitle}</h3>
          <label>
            <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(clamp(e.target.value, 1, 30))} />{" "}
            {t.mealPlanDays}
          </label>
          <label>
            <input type="number" min={1} max={12} value={people} onChange={(e) => setPeople(clamp(e.target.value, 1, 12))} />{" "}
            {t.mealPlanPeople}
          </label>
          <button
            type="button"
            className="button primary"
            disabled={Boolean(query) || load.status !== "ready" || planning || keptRecipes.length >= days}
            title={keptRecipes.length >= days ? t.mealPlanContinueDisabledHint : undefined}
            onClick={() => void generate()}
          >
            {planning ? t.mealPlanAddingToCart : stored ? t.mealPlanContinue : t.mealPlanGenerate}
          </button>
          {stored && !plan && (
            <button
              type="button"
              className="button"
              onClick={() => {
                setDays(stored.days);
                setPeople(stored.people);
                setPlan(stored.recipes);
                setKept(new Set(stored.recipes.map((r) => r.id)));
              }}
            >
              {t.mealPlanRecent} ({stored.recipes.length})
            </button>
          )}
          {plan && (
            <>
              <button type="button" className="button primary" onClick={() => setListOpen(true)} disabled={!plan.length}>
                {t.mealPlanViewShoppingList}
              </button>
              <button type="button" className="button quiet" onClick={() => setPlan(null)}>
                ‹ {t.cookbookTitle}
              </button>
            </>
          )}
          {stored && (
            <button
              type="button"
              className="button quiet small"
              onClick={() => {
                remember([]);
                setPlan(null);
                setKept(new Set());
              }}
            >
              {t.mealPlanClear}
            </button>
          )}
          <p className="hint">{d.planHint}</p>
        </div>
      </aside>

      <section className="cookbook-grid">
        {plan && plan.length > 0 && (
          <p className="count">
            {t.mealPlanSelectAllRecipes}: {keptRecipes.length}/{plan.length}
          </p>
        )}
        <Loaded load={load} retry={reload}>
          {() =>
            shown.length === 0 ? (
              <Empty>{t.noRecipes}</Empty>
            ) : (
              <>
                <div className="recipe-cards">
                  {shown.slice(0, visible).map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      planned={plan ? kept.has(recipe.id) : storedIds.has(recipe.id)}
                      onPlan={togglePlanned}
                      planLabel={plan ? t.mealPlanConfirmLabel : t.mealPlanAddLabel}
                      planDisabled={!plan && storedIds.size >= days}
                    />
                  ))}
                </div>
                {visible < shown.length && (
                  <button type="button" className="button wide" onClick={() => setVisible((n) => n + PAGE)}>
                    {d.showMore} ({shown.length - visible})
                  </button>
                )}
              </>
            )
          }
        </Loaded>
      </section>
      {listOpen && plan && <ShoppingList recipeIds={plan.map((r) => r.id)} people={people} onClose={() => setListOpen(false)} />}
    </div>
  );
}

const clamp = (value: string, min: number, max: number) => Math.max(min, Math.min(max, Number(value) || min));

// ─── Shopping list for a plan ────────────────────────────────────────────────

function ShoppingList({ recipeIds, people, onClose }: { recipeIds: string[]; people: number; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [load, reload] = useLoad<MealPlanShoppingListResponse>(`${recipeIds.join()}:${people}`, (signal) =>
    api("meal-plan/shopping-list", { body: { recipeIds, people }, signal })
  );
  const [adding, setAdding] = useState<"idle" | "adding" | "done">("idle");

  const addAll = async (data: MealPlanShoppingListResponse) => {
    setAdding("adding");
    let failures = 0;
    for (const recipe of data.recipes) {
      const selectedIngredients = data.items
        .filter((item) => item.ownerRecipeId === recipe.id)
        .map((item) => ({ id: item.ownerSellingUnitId, ingredientId: item.ingredientId, count: item.packagesNeeded }));
      if (!selectedIngredients.length) continue;
      const result = await api(`recipe/${encodeURIComponent(recipe.id)}/add-to-cart`, {
        body: { portions: people, selectedIngredients },
      });
      if (!result.ok) failures += 1;
    }
    await cartModel.refresh();
    if (failures) toast(t.cartMutationError, "error");
    setAdding("done");
    setTimeout(() => setAdding("idle"), 2500);
  };

  return (
    <Dialog title={t.mealPlanShoppingListTitle} onClose={onClose} wide>
      <Loaded load={load} retry={reload}>
        {(data) => (
          <>
            <p className="hint">{t.mealPlanPackagesSaved.replace("{n}", String(data.packagesSaved))}</p>
            {data.recipes.map((recipe) => {
              const items = data.items.filter((item) => item.ownerRecipeId === recipe.id);
              if (!items.length) return null;
              return (
                <section key={recipe.id} className="list-recipe">
                  <h3>{recipe.name}</h3>
                  <ul className="list-items">
                    {items.map((item) => {
                      const shared = data.recipes.find((r) => r.id !== item.ownerRecipeId && item.usedInRecipeIds.includes(r.id));
                      return (
                        <li key={item.ownerSellingUnitId}>
                          <Img id={item.imageId} alt="" />
                          <span>
                            {item.packagesNeeded}× {item.name}
                            {shared && <small>{t.mealPlanSharedWith.replace("{recipe}", shared.name)}</small>}
                          </span>
                          <Price cents={item.unitPriceCents * item.packagesNeeded} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            <div className="dialog-actions">
              <strong>
                {t.mealPlanTotal}: <Price cents={data.totalPriceCents} />
              </strong>
              <button type="button" className="button primary" disabled={adding !== "idle"} onClick={() => void addAll(data)}>
                {adding === "adding" ? t.mealPlanAddingToCart : adding === "done" ? t.mealPlanAddedToCart : t.mealPlanAddAllToCart}
              </button>
            </div>
          </>
        )}
      </Loaded>
    </Dialog>
  );
}

// ─── One recipe ──────────────────────────────────────────────────────────────

/** "(125 g)" scaled from the recipe's portions to the chosen ones, as picnic-web does. */
function scaleNeeded(text: string, portions: number, base: number): string {
  if (!base) return text;
  const match = /^\((\d+(?:[.,]\d+)?)\s+(.+)\)$/.exec(text);
  if (!match) return text;
  const scaled = (parseFloat(match[1].replace(",", ".")) * portions) / base;
  return `(${Number.isInteger(scaled) ? scaled : scaled.toFixed(1).replace(".", ",")} ${match[2]})`;
}

export function RecipePage({ recipeId }: { recipeId: string }) {
  const { t, d } = useT();
  const toast = useToast();
  const money = useMoney();
  const [portions, setPortions] = useState(2);
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<"idle" | "adding" | "done">("idle");
  const [editing, setEditing] = useState<string | null>(null);

  const [load, reload, replace] = useLoad<RecipeDetail>(recipeId, (signal) =>
    api(`recipe/${encodeURIComponent(recipeId)}`, { signal })
  );
  const recipe = load.status === "ready" ? load.data : null;
  useTitle(recipe?.name ?? t.cookbookTitle);

  useEffect(() => {
    if (!recipe || confirmed !== null) return;
    setPortions(recipe.portions);
    setConfirmed(recipe.portions);
    setChecked(new Set(recipe.ingredients.filter((i) => !i.isCondiment).map((i) => i.id)));
  }, [recipe, confirmed]);

  const fetchFor = useCallback(
    async (count: number) => {
      const result = await api<RecipeDetail>(`recipe/${encodeURIComponent(recipeId)}?portions=${count}`);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      replace(result.data);
      setConfirmed(count);
      setChecked((prev) => {
        // Keep what was unticked; tick ingredients that are new.
        const next = new Set<string>();
        for (const ing of result.data.ingredients) {
          const known = recipe?.ingredients.find((i) => i.ingredientId === ing.ingredientId);
          const wasOn = known ? prev.has(known.id) : !ing.isCondiment;
          if (wasOn) next.add(ing.id);
        }
        return next;
      });
    },
    [recipeId, replace, toast, recipe]
  );

  // Picnic answers the counts for other portions itself; wait until the clicking stops.
  useEffect(() => {
    if (!recipe || confirmed === null || confirmed === portions) return;
    const timer = setTimeout(() => void fetchFor(portions), 600);
    return () => clearTimeout(timer);
  }, [portions, confirmed, recipe, fetchFor]);

  if (!recipe) {
    return (
      <Loaded load={load} retry={reload}>
        {() => null}
      </Loaded>
    );
  }

  const refreshing = confirmed !== portions;
  const base = recipe.portions;
  const forPortions = refreshing ? (confirmed ?? base) : portions;
  const main = recipe.ingredients.filter((i) => !i.isCondiment);
  const condiments = recipe.ingredients.filter((i) => i.isCondiment);
  const price = recipePrice(recipe, forPortions);
  const chosen = recipe.ingredients.filter((i) => checked.has(i.id));
  const chosenTotal = chosen.reduce((sum, ing) => sum + packsPrice(ing, packs(ing, forPortions, base)).total, 0);

  const addToBasket = async () => {
    setAdding("adding");
    const result = await api(`recipe/${encodeURIComponent(recipeId)}/add-to-cart`, {
      body: {
        portions: forPortions,
        selectedIngredients: chosen.map((ing) => ({
          id: ing.id,
          ingredientId: ing.ingredientId,
          count: packs(ing, forPortions, base),
        })),
      },
    });
    await cartModel.refresh();
    if (!result.ok) {
      toast(result.error, "error");
      setAdding("idle");
      return;
    }
    setAdding("done");
    setTimeout(() => setAdding("idle"), 2500);
  };

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = (list: RecipeIngredient[]) => (
    <ul className="ingredients">
      {list.map((ing) => (
        <IngredientRow
          key={ing.id + (ing.ingredientId ?? "")}
          ingredient={ing}
          count={packs(ing, forPortions, base)}
          portions={forPortions}
          base={base}
          checked={checked.has(ing.id)}
          onToggle={() => toggle(ing.id)}
          onEdit={ing.ingredientId ? () => setEditing(ing.ingredientId) : undefined}
        />
      ))}
    </ul>
  );

  return (
    <article className="recipe">
      <div className="back-bar">
        <button type="button" className="link-like" onClick={() => back("/cookbook")}>
          ‹ {t.cookbookTitle}
        </button>
      </div>
      <div className="recipe-top">
        <div className="recipe-hero">
          <Img id={recipe.imageId} kind="recipe" alt={recipe.name} />
          <SaveHeart recipeId={recipe.id} name={recipe.name} />
        </div>
        <div className="recipe-head">
          <h2>{recipe.name}</h2>
          <p className="recipe-meta">
            {recipe.cookingTimeMinutes !== null && (
              <span>
                ⏱ {recipe.cookingTimeMinutes} {t.cookingTimeMinutes}
              </span>
            )}
            <span>
              {money(price.perServing)} {t.recipePricePerServing} · {money(price.total)} {t.recipePriceTotal}
            </span>
          </p>
          <div className="portions">
            <span>{t.recipePortions}</span>
            <button type="button" onClick={() => setPortions((p) => Math.max(1, p - 1))} aria-label={`${t.removeOneAriaLabel}: ${t.recipePortions}`}>
              −
            </button>
            <output aria-live="polite">{portions}</output>
            <button type="button" onClick={() => setPortions((p) => Math.min(20, p + 1))} aria-label={`${t.addOneAriaLabel}: ${t.recipePortions}`}>
              +
            </button>
            {refreshing && <span className="spinner small" aria-label={t.loadingAriaLabel} />}
          </div>
          {main.length > 0 && (
            <button
              type="button"
              className="button primary wide"
              disabled={adding !== "idle" || refreshing || chosen.length === 0}
              onClick={() => void addToBasket()}
            >
              {adding === "adding"
                ? t.recipeAddingToCart
                : adding === "done"
                  ? t.recipeAddedToCart
                  : `${d.addChosen} (${chosen.length}) · ${money(chosenTotal)}`}
            </button>
          )}
          <p className="hint">{d.recipeEmailHint}</p>
        </div>
      </div>

      <div className={`recipe-body ${refreshing ? "refreshing" : ""}`}>
        <section>
          <h3>{t.recipeIngredients}</h3>
          {rows(main)}
          {condiments.length > 0 && (
            <>
              <h4>{t.recipeCondiments}</h4>
              {rows(condiments)}
            </>
          )}
        </section>
        <section>
          {recipe.steps.length > 0 && (
            <>
              <h3>{t.recipeSteps}</h3>
              {recipe.stepsPortionWarning && <p className="warning">{recipe.stepsPortionWarning}</p>}
              <ol className="steps">
                {recipe.steps.map((step, i) => (
                  <li key={i}>{renderMarkdownBold(step)}</li>
                ))}
              </ol>
            </>
          )}
          {(recipe.allergens.confirmed.length > 0 || recipe.allergens.mayContain.length > 0) && (
            <div className="allergens">
              <h3>{t.allergenTitle}</h3>
              <AllergenList label={t.recipeAllergens} badges={recipe.allergens.confirmed} />
              <AllergenList label={t.recipeMayContain} badges={recipe.allergens.mayContain} />
            </div>
          )}
          {recipe.recipeNutritionRows.length > 0 && (
            <Fold title={t.recipeNutrition}>
              <NutritionTable rows={recipe.recipeNutritionRows} />
            </Fold>
          )}
        </section>
      </div>
      {editing && (
        <IngredientEditor
          recipeId={recipe.id}
          ingredientId={editing}
          portions={forPortions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void fetchFor(forPortions);
          }}
        />
      )}
    </article>
  );
}

function IngredientRow({
  ingredient,
  count,
  portions,
  base,
  checked,
  onToggle,
  onEdit,
}: {
  ingredient: RecipeIngredient;
  count: number;
  portions: number;
  base: number;
  checked: boolean;
  onToggle: () => void;
  onEdit?: () => void;
}) {
  const { t } = useT();
  const open = useOpenProduct();
  const pack = ingredient.recipePackageSize ?? ingredient.unitQuantity;
  const needed = ingredient.recipeQuantityText ? scaleNeeded(ingredient.recipeQuantityText, portions, base) : null;
  const { total, was } = packsPrice(ingredient, count);
  return (
    <li className={`ingredient ${checked ? "" : "ingredient-off"}`} data-product={ingredient.id}>
      <label>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="visually-hidden">{ingredient.name}</span>
      </label>
      <button type="button" className="link-like ingredient-name" onClick={() => open(ingredient.id)}>
        <Img id={ingredient.imageId} alt="" />
        <span>
          {ingredient.name}
          <small>
            {count > 1 ? `${count} × ${pack}` : pack} {needed}
          </small>
        </span>
      </button>
      <Price cents={total} was={was} />
      {onEdit && (
        <button type="button" className="icon-button" onClick={onEdit} aria-label={`${t.recipeEditIngredient}: ${ingredient.name}`}>
          ✎
        </button>
      )}
    </li>
  );
}

function IngredientEditor({
  recipeId,
  ingredientId,
  portions,
  onClose,
  onSaved,
}: {
  recipeId: string;
  ingredientId: string;
  portions: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [load, reload] = useLoad<IngredientEditData>(`${recipeId}:${ingredientId}:${portions}`, async (signal) => {
    const result = await api<IngredientEditData>(
      `recipe/${encodeURIComponent(recipeId)}/ingredient/${encodeURIComponent(ingredientId)}?portions=${portions}`,
      { signal }
    );
    if (result.ok) setQuantities({ ...result.data.selected });
    return result.ok ? result : { ok: false, error: t.recipeEditLoadError };
  });

  const save = async () => {
    setSaving(true);
    setProblem(null);
    const result = await api(`recipe/${encodeURIComponent(recipeId)}/ingredient/${encodeURIComponent(ingredientId)}`, {
      body: { portions, quantities },
    });
    setSaving(false);
    if (result.ok) onSaved();
    else setProblem(t.recipeEditSaveError);
  };

  const change = (alternative: IngredientAlternative, delta: number) =>
    setQuantities((prev) => {
      const { [alternative.id]: current = 0, ...rest } = prev;
      const next = Math.max(0, current + delta);
      return next ? { ...rest, [alternative.id]: next } : rest;
    });

  return (
    <Dialog title={t.recipeEditIngredient} onClose={onClose} wide>
      <Loaded load={load} retry={reload}>
        {(data) => (
          <>
            {data.subtitle && <p className="hint">{data.subtitle}</p>}
            {data.groups.map((group) => (
              <section key={group.title}>
                <h3>{group.title}</h3>
                <ul className="alternatives">
                  {group.alternatives.map((alternative) => {
                    const count = quantities[alternative.id] ?? 0;
                    return (
                      <li key={alternative.id} className={alternative.isUnavailable ? "unavailable" : ""}>
                        <button
                          type="button"
                          className="link-like alternative"
                          disabled={alternative.isUnavailable}
                          onClick={() => setQuantities({ [alternative.id]: 1 })}
                          aria-pressed={count > 0}
                        >
                          <Img id={alternative.imageId} alt="" />
                          <span>
                            {alternative.name}
                            <small>
                              {[alternative.brand, alternative.unitQuantity, ...alternative.tags].filter(Boolean).join(" · ")}
                            </small>
                            {alternative.promotionLabel && <span className="badge badge-promo">{alternative.promotionLabel}</span>}
                          </span>
                        </button>
                        {alternative.isUnavailable ? (
                          <span className="hint">{alternative.unavailableReason ?? t.recipeEditUnavailable}</span>
                        ) : (
                          <>
                            <Price cents={alternative.displayPrice} was={alternative.originalPrice} />
                            <span className="stepper">
                              <button type="button" onClick={() => change(alternative, -1)} disabled={!count} aria-label={t.removeOneAriaLabel}>
                                −
                              </button>
                              <output>{count}</output>
                              <button type="button" onClick={() => change(alternative, 1)} aria-label={t.addOneAriaLabel}>
                                +
                              </button>
                            </span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {problem && <ErrorView message={problem} />}
            <div className="dialog-actions">
              <button type="button" className="button quiet" onClick={onClose}>
                {t.recipeEditCancel}
              </button>
              <button type="button" className="button primary" disabled={saving} onClick={() => void save()}>
                {saving ? t.recipeEditSaving : t.recipeEditSave}
              </button>
            </div>
          </>
        )}
      </Loaded>
    </Dialog>
  );
}
