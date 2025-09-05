import { Product } from "./types";

export type SkinType = "normal" | "oily" | "dry" | "combination" | "sensitive";

export type SkinConcern =
  | "acne"
  | "blackheads"
  | "congestion"
  | "hyperpigmentation"
  | "uneven_tone"
  | "redness"
  | "eczema"
  | "dullness"
  | "dehydration"
  | "wrinkles"
  | "texture"
  | "sun_damage";

export type IngredientSensitivity =
  | "fragrance"
  | "essential_oils"
  | "alcohol"
  | "retinoids"
  | "ahas_bhas"
  | "vitamin_c"
  | "niacinamide";

export type Budget = "low" | "medium" | "high";

export interface SkinProfile {
  skinType: SkinType;
  concerns: SkinConcern[];
  sensitivities: IngredientSensitivity[];
  routine: {
    cleanser: boolean;
    exfoliationPerWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    moisturizer: boolean;
    sunscreen: boolean;
    treatments: boolean;
  };
  environment: {
    climate: "humid" | "dry" | "temperate";
    sunExposure: "low" | "medium" | "high";
  };
  budget: Budget;
  preferences: {
    fragranceFree: boolean;
    vegan: boolean;
    crueltyFree: boolean;
  };
}

export type ScoredProduct = Product & { _score: number; _matches: string[] };

const concernKeywords: Record<SkinConcern, string[]> = {
  acne: [
    "acne",
    "blemish",
    "breakout",
    "salicylic",
    "bha",
    "benzoyl",
    "niacinamide",
    "clay",
    "tea tree",
    "pore",
    "oil control",
  ],
  blackheads: ["blackhead", "pore", "salicylic", "bha", "clay"],
  congestion: ["congest", "clog", "pore", "salicylic", "bha", "charcoal"],
  hyperpigmentation: [
    "dark spot",
    "brighten",
    "even tone",
    "vitamin c",
    "ascorbic",
    "kojic",
    "alpha arbutin",
    "tranexamic",
    "licorice",
    "niacinamide",
  ],
  uneven_tone: ["even tone", "brighten", "radiance", "vitamin c", "niacinamide"],
  redness: ["calm", "soothe", "azelaic", "centella", "cica", "panthenol", "allantoin"],
  eczema: ["ceramide", "barrier", "soothe", "colloidal oatmeal", "balm"],
  dullness: ["radiance", "glow", "brighten", "vitamin c", "aha", "pha"],
  dehydration: ["hydrate", "hyaluronic", "glycerin", "panthenol", "squalane", "ceramide"],
  wrinkles: ["retinol", "retinoid", "peptide", "firm", "plump", "collagen", "anti-aging"],
  texture: ["smooth", "refine", "aha", "bha", "exfoliat", "lactic", "glycolic"],
  sun_damage: ["sunscreen", "spf", "uva", "uvb", "niacinamide", "vitamin c"],
};

const avoidKeywordsBySensitivity: Record<IngredientSensitivity, string[]> = {
  fragrance: ["fragrance", "parfum", "perfume"],
  essential_oils: ["essential oil", "lavender", "eucalyptus", "citrus", "limonene", "linalool"],
  alcohol: ["alcohol denat", "ethanol", "isopropyl alcohol"],
  retinoids: ["retinol", "retinal", "tretinoin", "adapalene"],
  ahas_bhas: ["aha", "alpha hydroxy", "glycolic", "lactic", "mandelic", "bha", "salicylic"],
  vitamin_c: ["vitamin c", "ascorbic", "ascorbyl"],
  niacinamide: ["niacinamide"],
};

const preferBySkinType: Record<Exclude<SkinType, "normal">, string[]> = {
  oily: ["gel", "lightweight", "oil control", "mattify", "niacinamide", "salicylic"],
  dry: ["cream", "rich", "balm", "ceramide", "shea", "hyaluronic", "squalane"],
  combination: ["balance", "lightweight", "gel-cream", "niacinamide"],
  sensitive: ["gentle", "soothe", "calm", "fragrance-free", "ceramide", "panthenol"],
};

const avoidBySkinType: Record<Exclude<SkinType, "normal">, string[]> = {
  oily: ["heavy", "butter", "rich", "balm"],
  dry: ["alcohol denat"],
  combination: [],
  sensitive: ["fragrance", "parfum", "perfume", "menthol", "eucalyptus", "peppermint"],
};

function safeText(p?: Product) {
  const name = (p?.name || "").toLowerCase();
  const desc = (p?.description || "").toLowerCase();
  return name + " " + desc;
}

export function scoreProducts(products: Product[], profile: SkinProfile): ScoredProduct[] {
  const textMatches = (text: string, keywords: string[]) =>
    keywords.filter((k) => text.includes(k));

  const preferred = new Set<string>();
  const avoided = new Set<string>();

  // Build preferred keywords from concerns
  profile.concerns.forEach((c) => concernKeywords[c].forEach((k) => preferred.add(k)));

  // Add skin type preferences
  if (profile.skinType !== "normal") {
    preferBySkinType[profile.skinType].forEach((k) => preferred.add(k));
    avoidBySkinType[profile.skinType].forEach((k) => avoided.add(k));
  }

  // Add sensitivity avoids
  profile.sensitivities.forEach((s) => avoidKeywordsBySensitivity[s].forEach((k) => avoided.add(k)));

  // Environment preferences
  if (profile.environment.sunExposure === "high") {
    preferred.add("sunscreen");
    preferred.add("spf");
  }
  if (profile.environment.climate === "dry") {
    preferred.add("ceramide");
    preferred.add("hyaluronic");
  }
  if (profile.environment.climate === "humid") {
    preferred.add("lightweight");
    preferred.add("gel");
  }

  const prefArr = Array.from(preferred);
  const avoidArr = Array.from(avoided);

  const scored = products.map((p) => {
    const text = safeText(p);
    const posMatches = textMatches(text, prefArr);
    const negMatches = textMatches(text, avoidArr);

    // Base score from matches
    let score = posMatches.length * 2 - negMatches.length * 3;

    // Minor boost if product seems aligned with routine gap
    if (!profile.routine.sunscreen && (text.includes("spf") || text.includes("sunscreen"))) score += 3;
    if (!profile.routine.moisturizer && (text.includes("moistur") || text.includes("cream") || text.includes("balm"))) score += 2;
    if (profile.concerns.includes("texture") && (text.includes("exfol") || text.includes("aha") || text.includes("bha"))) score += 2;

    return { ...(p as Product), _score: score, _matches: posMatches } as ScoredProduct;
  });

  // Sort descending by score
  return scored
    .filter((p) => p._score > -1) // drop obviously bad fits
    .sort((a, b) => b._score - a._score);
}

export function buildRoutine(profile: SkinProfile) {
  const steps: { step: string; note?: string }[] = [];
  steps.push({ step: "Cleanser", note: profile.skinType === "oily" ? "Use gel or foaming" : "Use gentle, non-stripping" });

  if (profile.concerns.includes("texture") || profile.concerns.includes("acne")) {
    steps.push({ step: "Exfoliant (2–3x/week)", note: "AHA/BHA depending on tolerance" });
  }

  steps.push({ step: "Treatment", note: "Target key concerns (e.g. niacinamide, vitamin C, retinoids)" });
  steps.push({ step: "Moisturizer", note: profile.skinType === "dry" ? "Cream with ceramides" : "Lightweight gel-cream" });
  steps.push({ step: "Sunscreen (AM)", note: "Broad-spectrum SPF 30+" });

  const avoid: string[] = [];
  if (profile.skinType === "sensitive" || profile.sensitivities.includes("fragrance")) avoid.push("fragrance/perfume");
  if (profile.sensitivities.includes("essential_oils")) avoid.push("essential oils");
  if (profile.sensitivities.includes("alcohol")) avoid.push("alcohol denat");

  const highlightIngredients = new Set<string>();
  profile.concerns.forEach((c) => concernKeywords[c].forEach((k) => highlightIngredients.add(k)));

  return {
    steps,
    avoid,
    highlight: Array.from(highlightIngredients).slice(0, 8),
  };
}

