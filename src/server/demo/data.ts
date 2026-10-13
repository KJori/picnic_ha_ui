/**
 * The demo shop's catalogue. Every value is typed with picnic-web's own types,
 * so the demo cannot drift from what the real routes return: if picnic-web
 * changes a shape, this file stops compiling.
 */
import type { CategoryItem } from "@/lib/category/category-types";
import type {
  AllergenInfo,
  NutritionRow,
  Product,
  ProductDetail,
  RecipeCategory,
  RecipeIngredient,
} from "@/lib/core/types";

export const img = (name: string) => `demo-${name}`;

type ProductInput = {
  id: string;
  name: string;
  price: number;
  unit: string;
  brand?: string;
  was?: number;
  promo?: string;
  bundle?: { quantity: number; pricePerUnit: number }[];
  unavailable?: string;
  prefix?: string;
  max?: number;
  words: string[];
  category: string;
};

const INPUT: ProductInput[] = [
  { id: "s1001", name: "Volkoren tijgerbrood", price: 229, unit: "800 g", brand: "Picnic", words: ["brood", "tijger"], category: "brood" },
  { id: "s1002", name: "Spelt meergranen", price: 289, unit: "600 g", brand: "Bakkerij Bart", words: ["brood", "spelt"], category: "brood" },
  { id: "s1003", name: "Croissants", price: 249, unit: "4 stuks", brand: "Picnic", words: ["croissant", "brood"], category: "brood", was: 299, promo: "Actie" },
  { id: "s1004", name: "Tofu naturel", price: 179, unit: "375 g", brand: "Taifun", words: ["tofu", "vegan"], category: "vegan" },
  { id: "s1005", name: "Gerookte tofu", price: 219, unit: "200 g", brand: "Taifun", words: ["tofu", "vegan"], category: "vegan" },
  { id: "s1006", name: "Havermelk barista", price: 239, unit: "1 l", brand: "Oatly", words: ["havermelk", "melk", "vegan"], category: "vegan", bundle: [{ quantity: 2, pricePerUnit: 199 }] },
  { id: "s1007", name: "Sojayoghurt naturel", price: 199, unit: "500 g", brand: "Alpro", words: ["yoghurt", "vegan"], category: "vegan", unavailable: "Tijdelijk niet leverbaar" },
  { id: "s1008", name: "Halfvolle melk", price: 125, unit: "1 l", brand: "Picnic", words: ["melk", "zuivel"], category: "zuivel" },
  { id: "s1009", name: "Griekse yoghurt", price: 259, unit: "1 kg", brand: "Mona", words: ["yoghurt", "zuivel"], category: "zuivel" },
  { id: "s1010", name: "Jong belegen kaas plakken", price: 319, unit: "300 g", brand: "Picnic", words: ["kaas", "zuivel"], category: "zuivel" },
  { id: "s1011", name: "Bananen", price: 159, unit: "5 stuks", prefix: "Bio", words: ["banaan", "bananen", "fruit"], category: "fruit" },
  { id: "s1012", name: "Elstar appels", price: 249, unit: "1 kg", words: ["appel", "appels", "fruit"], category: "fruit" },
  { id: "s1013", name: "Cherrytomaten", price: 199, unit: "250 g", words: ["tomaat", "tomaten", "groente"], category: "groente" },
  { id: "s1014", name: "Tomatenblokjes", price: 89, unit: "400 g", brand: "Mutti", words: ["tomaat", "tomaten", "tomatenblokjes"], category: "groente", bundle: [{ quantity: 3, pricePerUnit: 75 }] },
  { id: "s1015", name: "Rode ui", price: 99, unit: "500 g", words: ["ui", "uien", "groente"], category: "groente" },
  { id: "s1016", name: "Knoflook", price: 79, unit: "3 bollen", words: ["knoflook", "groente"], category: "groente" },
  { id: "s1017", name: "Spinazie", price: 179, unit: "300 g", words: ["spinazie", "groente"], category: "groente" },
  { id: "s1018", name: "Penne rigate", price: 139, unit: "500 g", brand: "De Cecco", words: ["pasta", "penne"], category: "voorraad" },
  { id: "s1019", name: "Rode linzen", price: 189, unit: "400 g", brand: "Picnic", words: ["linzen", "vegan"], category: "voorraad" },
  { id: "s1020", name: "Kokosmelk", price: 149, unit: "400 ml", brand: "Go-Tan", words: ["kokos", "kokosmelk"], category: "voorraad" },
  { id: "s1021", name: "Olijfolie extra vierge", price: 699, unit: "500 ml", brand: "Bertolli", words: ["olie", "olijfolie"], category: "voorraad" },
  { id: "s1022", name: "Zeezout", price: 99, unit: "250 g", words: ["zout"], category: "voorraad" },
  { id: "s1023", name: "Currypasta geel", price: 229, unit: "110 g", brand: "Go-Tan", words: ["curry", "currypasta"], category: "voorraad" },
  { id: "s1024", name: "Koffiebonen espresso", price: 899, unit: "1 kg", brand: "Lavazza", words: ["koffie", "bonen"], category: "koffie", was: 1099, promo: "18% korting" },
  { id: "s1025", name: "Basmatirijst", price: 219, unit: "1 kg", brand: "Lassie", words: ["rijst", "basmati"], category: "voorraad" },
  { id: "s1026", name: "Verse koriander", price: 99, unit: "30 g", words: ["koriander", "kruiden"], category: "groente" },
];

export const PRODUCTS: (Product & { words: string[]; category: string })[] = INPUT.map((p) => ({
  id: p.id,
  name: p.name,
  namePrefix: p.prefix ?? null,
  subtitle: null,
  subtitleColor: null,
  subtitleLeadingIcon: null,
  subtitleTrailingIcon: null,
  brand: p.brand ?? null,
  highlight: p.id === "s1001" ? { text: "Prijskampioen", color: "#B40117" } : null,
  flagIconKey: null,
  flagFallbackImageId: null,
  imageId: img(p.id),
  displayPrice: p.price,
  originalPrice: p.was ?? null,
  displayPriceColor: null,
  unitQuantity: p.unit,
  maxCount: p.max ?? 99,
  priceRanges: p.bundle ?? null,
  badges: [],
  promoBadge: p.promo ? { text: p.promo, variant: "promo" } : null,
  promoPlacement: p.promo ? "image" : null,
  isUnavailable: Boolean(p.unavailable),
  unavailableReason: p.unavailable ?? null,
  words: p.words,
  category: p.category,
}));

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id) ?? null;

export const plainProduct = ({ words: _w, category: _c, ...product }: (typeof PRODUCTS)[number]): Product => product;

const NUTRITION: NutritionRow[] = [
  { label: "Energie", value: "1050 kJ / 250 kcal", isCategory: true, backgroundColor: null },
  { label: "Vet", value: "3,1 g", isCategory: true, backgroundColor: "#f5f1ec" },
  { label: "waarvan verzadigd", value: "0,6 g", isCategory: false, backgroundColor: null },
  { label: "Koolhydraten", value: "41 g", isCategory: true, backgroundColor: "#f5f1ec" },
  { label: "waarvan suikers", value: "3,5 g", isCategory: false, backgroundColor: null },
  { label: "Eiwitten", value: "11 g", isCategory: true, backgroundColor: "#f5f1ec" },
  { label: "Zout", value: "1,0 g", isCategory: true, backgroundColor: null },
];

const ALLERGENS: Record<string, AllergenInfo> = {
  brood: {
    confirmed: [{ text: "Gluten", backgroundColor: "#b40117", textColor: "#ffffff" }],
    mayContain: [{ text: "Sesam", backgroundColor: "#fbd92b", textColor: "#333333" }],
  },
  vegan: {
    confirmed: [{ text: "Soja", backgroundColor: "#b40117", textColor: "#ffffff" }],
    mayContain: [],
  },
  zuivel: {
    confirmed: [{ text: "Melk", backgroundColor: "#b40117", textColor: "#ffffff" }],
    mayContain: [],
  },
};

export function productDetail(id: string): ProductDetail | null {
  const product = productById(id);
  if (!product) return null;
  const similar = PRODUCTS.filter((p) => p.category === product.category && p.id !== id).slice(0, 6);
  return {
    id: product.id,
    name: product.name,
    brand: product.brand ?? "",
    unitQuantity: product.unitQuantity,
    unitPrice: `€${((product.displayPrice / 100) * 1.5).toFixed(2).replace(".", ",")}/kg`,
    categoryTag: { text: product.category[0].toUpperCase() + product.category.slice(1), color: "#295813" },
    displayPrice: product.displayPrice,
    originalPrice: product.originalPrice,
    displayPriceColor: null,
    maxCount: product.maxCount,
    imageIds: [product.imageId, img(`${product.id}-back`)],
    labels: product.namePrefix ? [{ text: "Biologisch", textColor: "#ffffff", backgroundColor: "#4B8505" }] : [],
    description: `**${product.name}** uit de demowinkel. Alles op deze pagina is verzonnen om Picnic Desk te laten zien.`,
    highlights: [
      { text: "**Nederlands** product", iconKey: "pin", linkTarget: null },
      { text: "Lang houdbaar", iconKey: "starsOutlined", linkTarget: null },
    ],
    allergens: ALLERGENS[product.category] ?? { confirmed: [], mayContain: [] },
    infoSections: [
      { title: "Ingrediënten", content: `${product.name.toLowerCase()} (98%), zout, **gist**.` },
      { title: "Voedingswaarde", content: "per 100 g" },
      { title: "Bewaren", content: "Koel en droog bewaren. Na openen binnen 3 dagen gebruiken." },
    ],
    promotion: product.promoBadge ? { id: "promo-1", label: product.promoBadge.text } : null,
    bundles: (product.priceRanges ?? []).map((tier, i) => ({
      id: `${product.id}-b${i}`,
      quantity: tier.quantity,
      pricePerUnit: tier.pricePerUnit,
      imageId: product.imageId,
      maxCount: product.maxCount,
    })),
    similarProducts: similar.map((p) => ({
      id: p.id,
      name: p.name,
      imageId: p.imageId,
      displayPrice: p.displayPrice,
      unitQuantity: p.unitQuantity,
      maxCount: p.maxCount,
    })),
    nutritionRows: NUTRITION,
  };
}

// ─── Categories ──────────────────────────────────────────────────────────────

export const L1_CATEGORIES: { id: string; name: string; children: CategoryItem[] }[] = [
  {
    id: "21001",
    name: "Brood & ontbijt",
    children: [
      { id: "22001", name: "Brood", imageId: img("cat-brood"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22001" },
      { id: "22002", name: "Croissants & koffiebroodjes", imageId: img("cat-croissant"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22002" },
    ],
  },
  {
    id: "21002",
    name: "Vegetarisch & vegan",
    children: [
      { id: "22003", name: "Tofu & tempeh", imageId: img("cat-tofu"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22003" },
      { id: "22004", name: "Plantaardige zuivel", imageId: img("cat-plantmelk"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22004" },
    ],
  },
  {
    id: "21003",
    name: "Groente & fruit",
    children: [
      { id: "22005", name: "Groente", imageId: img("cat-groente"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22005" },
      { id: "22006", name: "Fruit", imageId: img("cat-fruit"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22006" },
    ],
  },
  {
    id: "21004",
    name: "Zuivel & kaas",
    children: [{ id: "22007", name: "Melk & yoghurt", imageId: img("cat-zuivel"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22007" }],
  },
  {
    id: "21005",
    name: "Voorraadkast",
    children: [
      { id: "22008", name: "Pasta, rijst & wereldkeuken", imageId: img("cat-pasta"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22008" },
      { id: "22009", name: "Koffie", imageId: img("cat-koffie"), deepLinkTarget: "app.picnic://store/page;id=L2-category-page-root,category_id=22009" },
    ],
  },
];

/** Which products an L2 category holds. */
export const L2_PRODUCTS: Record<string, string[]> = {
  "22001": ["s1001", "s1002"],
  "22002": ["s1003"],
  "22003": ["s1004", "s1005"],
  "22004": ["s1006", "s1007"],
  "22005": ["s1013", "s1014", "s1015", "s1016", "s1017", "s1026"],
  "22006": ["s1011", "s1012"],
  "22007": ["s1008", "s1009", "s1010"],
  "22008": ["s1018", "s1019", "s1020", "s1021", "s1022", "s1023", "s1025"],
  "22009": ["s1024"],
};

// ─── Recipes ─────────────────────────────────────────────────────────────────

export const RECIPE_CATEGORIES: RecipeCategory[] = [
  { id: "recipe-cattree-vegan", name: "Vegan" },
  { id: "recipe-cattree-25min", name: "Snel klaar" },
  { id: "recipe-cattree-pasta", name: "Pasta" },
];

type RecipeInput = {
  id: string;
  name: string;
  minutes: number;
  portions: number;
  categories: string[];
  ingredients: { product: string; slot: string; quantity: number; text: string; condiment?: boolean }[];
  steps: string[];
};

const slot = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`.slice(-36);

export const RECIPES: RecipeInput[] = [
  {
    id: "64a000000000000000000001",
    name: "Rode linzencurry met spinazie",
    minutes: 30,
    portions: 2,
    categories: ["recipe-cattree-vegan", "recipe-cattree-25min"],
    ingredients: [
      { product: "s1019", slot: slot(1), quantity: 1, text: "200 g" },
      { product: "s1020", slot: slot(2), quantity: 1, text: "400 ml" },
      { product: "s1017", slot: slot(3), quantity: 1, text: "300 g" },
      { product: "s1015", slot: slot(4), quantity: 1, text: "1 stuk" },
      { product: "s1023", slot: slot(5), quantity: 1, text: "2 el" },
      { product: "s1025", slot: slot(6), quantity: 1, text: "150 g" },
      { product: "s1021", slot: slot(7), quantity: 1, text: "1 el", condiment: true },
      { product: "s1022", slot: slot(8), quantity: 1, text: "snufje", condiment: true },
    ],
    steps: [
      "Snipper de **ui** en fruit hem in de olie.",
      "Voeg de **currypasta** en de **linzen** toe en bak 1 minuut mee.",
      "Schenk de **kokosmelk** en 200 ml water erbij en laat 15 minuten zacht koken.",
      "Roer de **spinazie** erdoor en serveer met rijst.",
    ],
  },
  {
    id: "64a000000000000000000002",
    name: "Penne met tomaat en gerookte tofu",
    minutes: 20,
    portions: 2,
    categories: ["recipe-cattree-vegan", "recipe-cattree-25min", "recipe-cattree-pasta"],
    ingredients: [
      { product: "s1018", slot: slot(1), quantity: 1, text: "250 g" },
      { product: "s1014", slot: slot(2), quantity: 1, text: "400 g" },
      { product: "s1005", slot: slot(3), quantity: 1, text: "200 g" },
      { product: "s1016", slot: slot(4), quantity: 1, text: "2 tenen" },
      { product: "s1013", slot: slot(5), quantity: 1, text: "125 g" },
      { product: "s1021", slot: slot(6), quantity: 1, text: "2 el", condiment: true },
    ],
    steps: ["Kook de **penne**.", "Bak de **tofu** krokant.", "Voeg de **tomaten** en knoflook toe en meng met de pasta."],
  },
  {
    id: "64a000000000000000000003",
    name: "Tomatensoep met croissant",
    minutes: 35,
    portions: 4,
    categories: ["recipe-cattree-vegan"],
    ingredients: [
      { product: "s1014", slot: slot(1), quantity: 2, text: "800 g" },
      { product: "s1015", slot: slot(2), quantity: 1, text: "1 stuk" },
      { product: "s1003", slot: slot(3), quantity: 1, text: "4 stuks" },
      { product: "s1026", slot: slot(4), quantity: 1, text: "handje" },
    ],
    steps: ["Fruit de ui.", "Voeg de tomaten toe en laat 20 minuten trekken.", "Pureer en serveer met croissants."],
  },
];

export const recipeById = (id: string) => RECIPES.find((r) => r.id === id) ?? null;

export function recipeIngredients(recipe: RecipeInput, portions: number): RecipeIngredient[] {
  return recipe.ingredients.map((ing) => {
    const product = productById(ing.product)!;
    return {
      id: product.id,
      ingredientId: ing.slot,
      name: product.name,
      imageId: product.imageId,
      displayPrice: product.displayPrice,
      unitQuantity: product.unitQuantity,
      maxCount: product.maxCount,
      quantity: Math.max(1, Math.ceil((ing.quantity * portions) / recipe.portions)),
      isCondiment: Boolean(ing.condiment),
      nutritionRows: [],
      recipeQuantityText: ing.text,
      recipePackageSize: product.unitQuantity,
      originalPrice: product.originalPrice,
      priceRanges: product.priceRanges,
    };
  });
}
