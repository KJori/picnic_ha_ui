/**
 * What a recipe costs, worked out the way picnic-web's recipe page does it:
 * each ingredient as whole packs (its count scaled to the portions and rounded
 * up, at least one), at the "more for less" price when the count reaches a
 * tier. Used by the recipe page and for the price on recipe cards.
 */
import type { RecipeDetail, RecipeIngredient } from "@/lib/core/types";

/** Packs of an ingredient for `portions`, when the recipe's counts are for `basePortions`. */
export function packs(ingredient: RecipeIngredient, portions: number, basePortions: number): number {
  if (basePortions <= 0) return Math.max(1, ingredient.quantity);
  return Math.max(1, Math.ceil((ingredient.quantity * portions) / basePortions));
}

/** Price of `count` packs, and what they would cost without the offer (or null). */
export function packsPrice(ingredient: RecipeIngredient, count: number): { total: number; was: number | null } {
  const tier = ingredient.priceRanges?.filter((t) => t.quantity <= count).at(-1);
  const unit = tier ? tier.pricePerUnit : ingredient.displayPrice;
  const total = unit * count;
  const regular = tier ? ingredient.displayPrice * count : ingredient.originalPrice !== null ? ingredient.originalPrice * count : null;
  return { total, was: regular !== null && regular > total ? regular : null };
}

/** The recipe's main ingredients (not what you probably have), as picnic-web prices it. */
export function recipePrice(recipe: Pick<RecipeDetail, "ingredients" | "portions">, portions = recipe.portions) {
  const main = recipe.ingredients.filter((i) => !i.isCondiment);
  const total = main.reduce((sum, ing) => sum + packsPrice(ing, packs(ing, portions, recipe.portions)).total, 0);
  return { total, perServing: portions > 0 ? Math.round(total / portions) : total, portions };
}
