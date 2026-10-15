/**
 * Picnic's cookbook on the desk: recipe cards on the shelf, a recipe as a
 * table of ingredients with the method beside it, and meal planning.
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

import type { RecipePrice } from "../../server/desk-routes";
import { packs, packsPrice, recipePrice } from "../../shared/recipe-price";
import { Dialog, ErrorView, Hint, Img, Loaded, Price, useLoad, useMoney, useTitle, useToast } from "../components/common";
import { AllergenList, Fold, NutritionTable } from "../components/product-dialog";
import { useOpenProduct } from "../components/products";
import { api } from "../lib/api";
import { back, href, type Route, withQuery } from "../lib/router";
import { cartModel, useCart } from "../state/cart";
import { toggleSavedRecipe, useSavedRecipes } from "../state/saved";
import { useT } from "../state/session";

// ─── Prices on cards ─────────────────────────────────────────────────────────

/** Card prices are asked for two at a time, only for cards on screen. */
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

function CardCost({ recipeId, minutes }: { recipeId: string; minutes: number | null }) {
  const { d, t } = useT();
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
        // Only a price is remembered: after a failure (Picnic busy) the card asks again next time.
        if (value) knownPrices.set(recipeId, value);
        if (!cancelled) setPrice(value);
      });
    });
    observer.observe(ref.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [recipeId, price]);
  const parts = [
    minutes !== null ? `${minutes} ${t.cookingTimeMinutes}` : "",
    price ? d.recipeCost.replace("{price}", money(price.total)).replace("{n}", String(price.portions)) : "",
  ].filter(Boolean);
  return (
    <span ref={ref} className="cost">
      {parts.join(" · ")}
    </span>
  );
}

function Heart({ recipeId, name }: { recipeId: string; name: string }) {
  const { t } = useT();
  const toast = useToast();
  const saved = useSavedRecipes().has(recipeId);
  return (
    <button
      type="button"
      className="heart"
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

function RecipeCard({ recipe, plan }: { recipe: RecipeItem; plan?: { on: boolean; label: string; disabled: boolean; toggle: () => void } }) {
  return (
    <li className="recipe-card" data-recipe={recipe.id}>
      <a className="recipe" href={href(`/recipe/${encodeURIComponent(recipe.id)}`)}>
        <Img id={recipe.imageId} kind="recipe" />
        <span className="name">{recipe.name}</span>
        <CardCost recipeId={recipe.id} minutes={recipe.cookingTimeMinutes} />
      </a>
      <Heart recipeId={recipe.id} name={recipe.name} />
      {plan && (
        <label className="plan-check">
          <input type="checkbox" checked={plan.on} disabled={plan.disabled && !plan.on} onChange={plan.toggle} /> {plan.label}
        </label>
      )}
    </li>
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
    // nothing stored, or no storage
  }
  return null;
}

function writePlan(plan: PlanMemory | null) {
  try {
    if (plan && plan.recipes.length) localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    else localStorage.removeItem(PLAN_KEY);
  } catch {
    // no storage: the plan lasts as long as the page
  }
}

// ─── The cookbook ────────────────────────────────────────────────────────────

const PAGE = 24;

export function RecipesView({ route }: { route: Route }) {
  const { t, d } = useT();
  const toast = useToast();
  const category = route.query.get("category"); // null = featured, "__saved__", or a category id
  const planning = route.query.get("plan") === "1";
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [plan, setPlan] = useState<PlanMemory | null>(readPlan);
  const [days, setDays] = useState(plan?.days ?? 7);
  const [people, setPeople] = useState(plan?.people ?? 2);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  useTitle(planning ? t.mealPlanPageTitle : t.cookbookTitle);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(filter.trim()), 300);
    return () => clearTimeout(timer);
  }, [filter]);
  useEffect(() => {
    void api<Record<string, number>>("cookbook/counts").then((r) => r.ok && setCounts(r.data));
  }, []);

  const path = query
    ? `cookbook/search?${new URLSearchParams({ q: query })}`
    : category
      ? `cookbook?${new URLSearchParams({ category })}`
      : "cookbook";
  const [load, reload] = useLoad<CookbookApiResponse>(path, (signal) => api(path, { signal }));
  useEffect(() => {
    if (load.status === "ready" && load.data.categories?.length) setCategories(load.data.categories);
  }, [load]);
  useEffect(() => setVisible(PAGE), [path]);
  const recipes = load.status === "ready" ? load.data.recipes ?? [] : [];

  const remember = useCallback(
    (list: RecipeItem[]) => {
      const next = list.length ? { recipes: list, days, people } : null;
      writePlan(next);
      setPlan(next);
    },
    [days, people]
  );
  useEffect(() => {
    if (plan && (plan.days !== days || plan.people !== people)) remember(plan.recipes);
  }, [days, people, plan, remember]);

  const planned = useMemo(() => new Set(plan?.recipes.map((r) => r.id) ?? []), [plan]);
  const togglePlanned = (recipe: RecipeItem) =>
    remember(planned.has(recipe.id) ? plan!.recipes.filter((r) => r.id !== recipe.id) : [...(plan?.recipes ?? []), recipe]);

  /** Fill the days left with recipes from the list on screen that share the most packs. */
  const fillPlan = async () => {
    const kept = plan?.recipes ?? [];
    const slots = days - kept.length;
    if (slots < 1 || !recipes.length) return;
    const keptIds = new Set(kept.map((r) => r.id));
    const pool = recipes.filter((r) => !keptIds.has(r.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setBusy(true);
    const result = await api<MealPlanSearchResponse>("meal-plan/search", {
      body: { candidateIds: pool.slice(0, MEAL_PLAN_MAX_CANDIDATES).map((r) => r.id), fixedIds: [...keptIds], slots, people },
    });
    setBusy(false);
    if (!result.ok) {
      toast(result.code === "RATE_LIMITED" ? t.mealPlanRateLimited : t.mealPlanGenerateError, "error");
      return;
    }
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const picked = (result.data.combinations[0]?.recipeIds ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const next = [...kept, ...picked];
    remember(next);
    if (next.length < days) toast(t.mealPlanNotEnoughRecipes.replaceAll("{available}", String(next.length)).replace("{requested}", String(days)));
  };

  const chip = (label: string, count: number | undefined, to: string, pressed: boolean) => (
    <a key={to} className="chip" href={href(to)} aria-pressed={pressed}>
      {label}
      {count !== undefined && <small> {count}</small>}
    </a>
  );

  const shown = planning ? plan?.recipes ?? [] : recipes;

  return (
    <>
      <div className="chips">
        {chip(t.cookbookFeatured, counts.__featured__, "/cookbook", !category && !planning && !query)}
        {chip(`♥ ${t.cookbookSaved}`, counts.__saved__, "/cookbook?category=__saved__", category === "__saved__" && !planning)}
        {categories.map((c) => chip(c.name, counts[c.id], `/cookbook?${new URLSearchParams({ category: c.id })}`, category === c.id && !planning))}
        {chip(t.mealPlanPageTitle, plan?.recipes.length, withQuery(route, { plan: planning ? null : "1" }), planning)}
      </div>

      {planning ? (
        <div className="plan-bar">
          <label>
            <input type="number" min={1} max={14} value={days} onChange={(e) => setDays(clamp(e.target.value, 1, 14))} /> {t.mealPlanDays}
          </label>
          <label>
            <input type="number" min={1} max={12} value={people} onChange={(e) => setPeople(clamp(e.target.value, 1, 12))} /> {t.mealPlanPeople}
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy || load.status !== "ready" || (plan?.recipes.length ?? 0) >= days}
            title={(plan?.recipes.length ?? 0) >= days ? t.mealPlanContinueDisabledHint : undefined}
            onClick={() => void fillPlan()}
          >
            {busy ? t.checkoutProcessing : plan ? d.fillPlan : t.mealPlanGenerate}
          </button>
          <button type="button" className="secondary" disabled={!plan} onClick={() => setListOpen(true)}>
            {t.mealPlanViewShoppingList}
          </button>
          {plan && (
            <button type="button" className="quiet" onClick={() => remember([])}>
              {t.mealPlanClear}
            </button>
          )}
          <p className="hint">{d.planHint.replace("{list}", query ? `“${query}”` : category === "__saved__" ? t.cookbookSaved : categories.find((c) => c.id === category)?.name ?? t.cookbookFeatured)}</p>
        </div>
      ) : (
        <input
          type="search"
          className="recipe-filter"
          value={filter}
          placeholder={t.cookbookSearchPlaceholder}
          aria-label={t.cookbookSearchPlaceholder}
          onChange={(event) => setFilter(event.target.value)}
        />
      )}

      {!planning && load.status !== "ready" ? (
        <Loaded load={load} retry={reload}>
          {() => null}
        </Loaded>
      ) : shown.length === 0 ? (
        <Hint>{planning ? d.planEmpty : t.noRecipes}</Hint>
      ) : (
        <>
          <ul className="recipes">
            {shown.slice(0, visible).map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                plan={{
                  on: planned.has(recipe.id),
                  label: d.inPlan,
                  disabled: planned.size >= days,
                  toggle: () => togglePlanned(recipe),
                }}
              />
            ))}
          </ul>
          {visible < shown.length && (
            <button type="button" className="secondary more-button" onClick={() => setVisible((n) => n + PAGE)}>
              {d.showMore} ({shown.length - visible})
            </button>
          )}
        </>
      )}
      {listOpen && plan && <ShoppingList recipeIds={plan.recipes.map((r) => r.id)} people={people} onClose={() => setListOpen(false)} />}
    </>
  );
}

const clamp = (value: string, min: number, max: number) => Math.max(min, Math.min(max, Number(value) || min));

// ─── Shopping list for a plan ────────────────────────────────────────────────

function ShoppingList({ recipeIds, people, onClose }: { recipeIds: string[]; people: number; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const money = useMoney();
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
      const result = await api(`recipe/${encodeURIComponent(recipe.id)}/add-to-cart`, { body: { portions: people, selectedIngredients } });
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
            <div className="shopping-list">
              {data.recipes.map((recipe) => {
                const items = data.items.filter((item) => item.ownerRecipeId === recipe.id);
                if (!items.length) return null;
                return (
                  <section key={recipe.id}>
                    <h3>{recipe.name}</h3>
                    <ul className="ingredients">
                      {items.map((item) => {
                        const shared = data.recipes.find((r) => r.id !== item.ownerRecipeId && item.usedInRecipeIds.includes(r.id));
                        return (
                          <li key={item.ownerSellingUnitId} className="ingredient">
                            <Img id={item.imageId} name={item.name} />
                            <span className="what">
                              <b>{item.name}</b>
                              {shared && <span>{t.mealPlanSharedWith.replace("{recipe}", shared.name)}</span>}
                            </span>
                            <span className="times">{item.packagesNeeded} ×</span>
                            <span className="price">{money(item.unitPriceCents * item.packagesNeeded)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
            <div className="actions">
              <span className="recipe-total">
                {t.mealPlanTotal}: {money(data.totalPriceCents)}
              </span>
              <button type="button" className="primary" disabled={adding !== "idle"} onClick={() => void addAll(data)}>
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

export function RecipeView({ recipeId }: { recipeId: string }) {
  const { t, d } = useT();
  const toast = useToast();
  const money = useMoney();
  const [portions, setPortions] = useState(2);
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const [load, reload, replace] = useLoad<RecipeDetail>(recipeId, (signal) => api(`recipe/${encodeURIComponent(recipeId)}`, { signal }));
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
      setChecked((prev) => {
        // Keep what was unticked; tick ingredients that are new.
        const next = new Set<string>();
        for (const ing of result.data.ingredients) {
          const known = recipe?.ingredients.find((i) => i.ingredientId === ing.ingredientId);
          if (known ? prev.has(known.id) : !ing.isCondiment) next.add(ing.id);
        }
        return next;
      });
      replace(result.data);
      setConfirmed(count);
    },
    [recipeId, replace, toast, recipe]
  );

  // Picnic answers the amounts for other portions itself; wait until the clicking stops.
  useEffect(() => {
    if (!recipe || confirmed === null || confirmed === portions) return;
    const timer = setTimeout(() => void fetchFor(portions), 600);
    return () => clearTimeout(timer);
  }, [portions, confirmed, recipe, fetchFor]);

  if (!recipe) {
    return (
      <>
        <BackToRecipes />
        <Loaded load={load} retry={reload}>
          {() => null}
        </Loaded>
      </>
    );
  }

  const refreshing = confirmed !== portions;
  const base = recipe.portions;
  const shownPortions = refreshing ? (confirmed ?? base) : portions;
  const main = recipe.ingredients.filter((i) => !i.isCondiment);
  const cupboard = recipe.ingredients.filter((i) => i.isCondiment);
  const price = recipePrice(recipe, shownPortions);
  const chosen = recipe.ingredients.filter((i) => checked.has(i.id));
  const chosenTotal = chosen.reduce((sum, ing) => sum + packsPrice(ing, packs(ing, shownPortions, base)).total, 0);

  const add = async () => {
    setAdding(true);
    const result = await api(`recipe/${encodeURIComponent(recipeId)}/add-to-cart`, {
      body: {
        portions: shownPortions,
        selectedIngredients: chosen.map((ing) => ({ id: ing.id, ingredientId: ing.ingredientId, count: packs(ing, shownPortions, base) })),
      },
    });
    await cartModel.refresh();
    setAdding(false);
    if (result.ok) toast(d.addedRecipe.replace("{n}", String(chosen.length)).replace("{name}", recipe.name));
    else toast(result.error, "error");
  };

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const table = (list: RecipeIngredient[]) => (
    <ul className="ingredients">
      {list.map((ing) => (
        <IngredientRow
          key={ing.id + (ing.ingredientId ?? "")}
          ingredient={ing}
          count={packs(ing, shownPortions, base)}
          portions={shownPortions}
          base={base}
          checked={checked.has(ing.id)}
          onToggle={() => toggle(ing.id)}
          onEdit={ing.ingredientId ? () => setEditing(ing.ingredientId) : undefined}
        />
      ))}
    </ul>
  );

  return (
    <>
      <BackToRecipes />
      <div className="recipe-head">
        <div className="hero">
          <Img id={recipe.imageId} kind="recipe" />
          <Heart recipeId={recipe.id} name={recipe.name} />
        </div>
        <div>
          <h2>{recipe.name}</h2>
          <p className="hint">
            {[
              recipe.cookingTimeMinutes !== null ? `${recipe.cookingTimeMinutes} ${t.cookingTimeMinutes}` : "",
              `${money(price.perServing)} ${t.recipePricePerServing}`,
              `${money(price.total)} ${t.recipePriceTotal}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="portions">
            <span>{t.recipePortions}</span>
            <span className="stepper">
              <button type="button" className="less" onClick={() => setPortions((p) => Math.max(1, p - 1))} aria-label={d.fewerPortions}>
                −
              </button>
              <output aria-live="polite">{portions}</output>
              <button type="button" className="more" onClick={() => setPortions((p) => Math.min(20, p + 1))} aria-label={d.morePortions}>
                +
              </button>
            </span>
            {refreshing && <span className="spinner small" aria-label={t.loadingAriaLabel} />}
          </div>
        </div>
      </div>

      <div className={`recipe-body ${refreshing ? "refreshing" : ""}`}>
        <div>
          {main.length > 0 && (
            <>
              <h3>{t.recipeIngredients}</h3>
              {table(main)}
            </>
          )}
          {cupboard.length > 0 && (
            <>
              <h3>{d.cupboard}</h3>
              {table(cupboard)}
            </>
          )}
        </div>
        <div>
          {recipe.steps.length > 0 && (
            <>
              <h3>{t.recipeSteps}</h3>
              {recipe.stepsPortionWarning && <p className="warning">{recipe.stepsPortionWarning}</p>}
              <ol className="method">
                {recipe.steps.map((step, i) => (
                  <li key={i}>{renderMarkdownBold(step)}</li>
                ))}
              </ol>
            </>
          )}
          {(recipe.allergens.confirmed.length > 0 || recipe.allergens.mayContain.length > 0) && (
            <div className="allergens">
              <AllergenList label={t.recipeAllergens} badges={recipe.allergens.confirmed} />
              <AllergenList label={t.recipeMayContain} badges={recipe.allergens.mayContain} />
            </div>
          )}
          {recipe.recipeNutritionRows.length > 0 && (
            <Fold title={t.recipeNutrition}>
              <NutritionTable rows={recipe.recipeNutritionRows} />
            </Fold>
          )}
        </div>
      </div>

      <div className="recipe-foot">
        <p className="recipe-total">{chosen.length ? d.forWhatIsTicked.replace("{price}", money(chosenTotal)) : ""}</p>
        <button type="button" className="primary" disabled={adding || refreshing || chosen.length === 0} onClick={() => void add()}>
          {adding ? t.recipeAddingToCart : chosen.length === 1 ? d.addOneIngredient : d.addIngredients.replace("{n}", String(chosen.length))}
        </button>
      </div>

      {editing && (
        <IngredientEditor
          recipeId={recipe.id}
          ingredientId={editing}
          portions={shownPortions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void fetchFor(shownPortions);
          }}
        />
      )}
    </>
  );
}

function BackToRecipes() {
  const { d } = useT();
  return (
    <button type="button" className="quiet back" onClick={() => back("/cookbook")}>
      {d.backToRecipes}
    </button>
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
  const { t, d } = useT();
  const cart = useCart();
  const open = useOpenProduct();
  const money = useMoney();
  const pack = ingredient.recipePackageSize ?? ingredient.unitQuantity;
  const needed = ingredient.recipeQuantityText ? scaleNeeded(ingredient.recipeQuantityText, portions, base) : null;
  const { total, was } = packsPrice(ingredient, count);
  const have = cart.quantity(ingredient.id);
  return (
    <li>
      <label className="ingredient" data-product={ingredient.id}>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <Img id={ingredient.imageId} name={ingredient.name} />
        <span className="what">
          <b>{ingredient.name}</b>
          <span>{[pack, needed].filter(Boolean).join(" ")}</span>
          {have > 0 && <span className="have">{d.alreadyInBasket.replace("{n}", String(have))}</span>}
          <span>
            <button type="button" className="quiet" onClick={(e) => (e.preventDefault(), open(ingredient.id))}>
              {d.aboutProduct}
            </button>
            {onEdit && (
              <>
                {" · "}
                <button type="button" className="quiet" onClick={(e) => (e.preventDefault(), onEdit())} aria-label={`${t.recipeEditIngredient}: ${ingredient.name}`}>
                  {d.swap}
                </button>
              </>
            )}
          </span>
        </span>
        <span className="times">{count} ×</span>
        <span className="price">
          {money(total)}
          {was !== null && <s>{money(was)}</s>}
        </span>
      </label>
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
                <ul className="ingredients">
                  {group.alternatives.map((alternative) => {
                    const count = quantities[alternative.id] ?? 0;
                    return (
                      <li key={alternative.id} className="ingredient alternative">
                        <button
                          type="button"
                          className="pick"
                          disabled={alternative.isUnavailable}
                          onClick={() => setQuantities({ [alternative.id]: 1 })}
                          aria-pressed={count > 0}
                        >
                          <Img id={alternative.imageId} name={alternative.name} />
                          <span className="what">
                            <b>{alternative.name}</b>
                            <span>{[alternative.brand, alternative.unitQuantity, ...alternative.tags].filter(Boolean).join(" · ")}</span>
                            {alternative.promotionLabel && <span className="have">{alternative.promotionLabel}</span>}
                            {alternative.isUnavailable && <span className="gone">{alternative.unavailableReason ?? t.recipeEditUnavailable}</span>}
                          </span>
                        </button>
                        {!alternative.isUnavailable && (
                          <>
                            <Price cents={alternative.displayPrice} was={alternative.originalPrice} />
                            <span className={`stepper ${count ? "" : "empty"}`}>
                              <button type="button" className="less" onClick={() => change(alternative, -1)} aria-label={t.removeOneAriaLabel}>
                                −
                              </button>
                              <output>{count}</output>
                              <button type="button" className="more" onClick={() => change(alternative, 1)} aria-label={`${t.addOneAriaLabel}: ${alternative.name}`}>
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
            <div className="actions">
              <button type="button" className="secondary" onClick={onClose}>
                {t.recipeEditCancel}
              </button>
              <button type="button" className="primary" disabled={saving} onClick={() => void save()}>
                {saving ? t.recipeEditSaving : t.recipeEditSave}
              </button>
            </div>
          </>
        )}
      </Loaded>
    </Dialog>
  );
}

