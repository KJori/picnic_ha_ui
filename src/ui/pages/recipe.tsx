/**
 * One recipe: portions, the ingredients to tick, swapping one for another,
 * the method, and adding what is ticked to the basket as that recipe.
 */
import { useCallback, useEffect, useState } from "react";

import type { IngredientAlternative, IngredientEditData, RecipeDetail, RecipeIngredient } from "@/lib/core/types";
import { renderMarkdownBold } from "@/lib/pml/render-markdown-bold";

import { packs, packsPrice, recipePrice } from "../../shared/recipe-price";
import { Dialog, ErrorView, Img, Loaded, Price, useLoad, useMoney, useTitle, useToast } from "../components/common";
import { AllergenList, Fold, NutritionTable } from "../components/product-dialog";
import { useOpenProduct } from "../components/products";
import { api } from "../lib/api";
import { back } from "../lib/router";
import { cartModel, useCart } from "../state/cart";
import { useT } from "../state/session";
import { Heart } from "./recipes";

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

