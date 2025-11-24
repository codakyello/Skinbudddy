const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const toSlug = (value: string): string => normalize(value).replace(/\s+/g, "-");

export const SKIN_TYPE_CANONICALS = [
  "normal",
  "oily",
  "dry",
  "combination",
  "sensitive",
  "acne-prone",
  "all",
] as const;

export type SkinTypeCanonical = (typeof SKIN_TYPE_CANONICALS)[number];

const SKIN_TYPE_ALIAS_MAP: Record<SkinTypeCanonical, readonly string[]> = {
  normal: ["normal skin", "balanced", "balanced skin"],
  oily: ["oily skin", "oily", "excess oil", "greasy skin", "oiliness"],
  dry: ["dry skin", "dry", "dehydrated skin", "flaky skin", "dryness"],
  combination: [
    "combination skin",
    "combination",
    "combo skin",
    "combo",
    "mixed skin",
  ],
  sensitive: [
    "sensitive skin",
    "sensitive",
    "sensitivity",
    "reactive skin",
    "reactive",
  ],
  "acne-prone": [
    "acne prone",
    "acne-prone",
    "acne-prone skin",
    "blemish prone",
    "blemish-prone",
    "breakout prone",
  ],
  all: ["all skin types", "any skin", "any skin type", "all"],
};

export const SKIN_CONCERN_CANONICALS = [
  "acne",
  "blackheads",
  "hyperpigmentation",
  "uneven-tone",
  "dryness",
  "oiliness",
  "redness",
  "sensitivity",
  "fine-lines",
  "wrinkles",
  "loss-of-firmness",
  "dullness",
  "sun-damage",
  "all",
] as const;

export type SkinConcernCanonical = (typeof SKIN_CONCERN_CANONICALS)[number];

const SKIN_CONCERN_ALIAS_MAP: Record<SkinConcernCanonical, readonly string[]> =
  {
    acne: [
      "acne",
      "breakout",
      "breakouts",
      "pimples",
      "pimple",
      "zits",
      "blemishes",
      "blemish",
      "spots",
    ],
    blackheads: [
      "blackheads",
      "black heads",
      "clogged pores",
      "clogged pore",
      "congested pores",
      "blackhead",
    ],
    hyperpigmentation: [
      "hyperpigmentation",
      "hyper pigmentation",
      "dark spots",
      "dark spot",
      "dark marks",
      "dark mark",
      "dark patches",
      "discoloration",
      "pigmentation",
      "brown spots",
      "post-acne marks",
    ],
    "uneven-tone": [
      "uneven tone",
      "uneven skin tone",
      "uneven complexion",
      "uneven pigmentation",
      "uneven texture",
    ],
    dryness: [
      "dryness",
      "dry skin",
      "dehydrated skin",
      "dehydration",
      "flaky skin",
      "tightness",
    ],
    oiliness: [
      "oiliness",
      "oily skin",
      "oily",
      "excess oil",
      "greasy skin",
      "shine",
    ],
    redness: ["redness", "red skin", "flushed skin", "rosacea", "irritation"],
    sensitivity: [
      "sensitivity",
      "sensitive skin",
      "sensitive",
      "reactive skin",
      "reactive",
      "sensitized skin",
    ],
    "fine-lines": ["fine lines", "fine line", "lines", "expression lines"],
    wrinkles: ["wrinkles", "wrinkle", "deep lines"],
    "loss-of-firmness": [
      "loss of firmness",
      "sagging skin",
      "loss of elasticity",
      "loose skin",
      "lack of firmness",
    ],
    dullness: [
      "dullness",
      "dull skin",
      "lacklustre skin",
      "lackluster skin",
      "tired skin",
      "lack of glow",
    ],
    "sun-damage": [
      "sun damage",
      "sun-damaged skin",
      "sun spots",
      "sunspot",
      "photoaging",
      "sunburn",
    ],
    all: ["all concerns", "any concern", "all"],
  };

const lookupByAlias = <T extends string>(
  canonicals: readonly T[],
  aliasMap: Record<T, readonly string[]>,
  input: string
): T | null => {
  const key = toSlug(input);
  if (!key) return null;

  if ((canonicals as readonly string[]).includes(key)) {
    return key as T;
  }

  for (const canonical of canonicals) {
    const aliases = aliasMap[canonical] ?? [];
    if (aliases.some((alias) => toSlug(alias) === key)) {
      return canonical;
    }
  }

  return null;
};

export const resolveSkinType = (input: string): SkinTypeCanonical | null =>
  lookupByAlias(SKIN_TYPE_CANONICALS, SKIN_TYPE_ALIAS_MAP, input);

export const BENEFIT_CANONICALS = [
  "hydrating",
  "brightening",
  "soothing",
  "barrier-support",
  "repairing",
  "anti-aging",
  "firming",
  "plumping",
  "acne-fighting",
  "oil-control",
  "pore-refining",
  "exfoliating",
  "tone-evening",
  "balancing",
  "protecting",
  "anti-inflammatory",
  "sun-protection",
  "anti-pollution",
  "healing",
  "nourishing",
  "detoxifying",
] as const;

export type BenefitCanonical = (typeof BENEFIT_CANONICALS)[number];

const BENEFIT_ALIAS_MAP: Record<BenefitCanonical, readonly string[]> = {
  hydrating: [
    "hydrating",
    "hydration",
    "moisturizing",
    "moisturising",
    "moisture-boosting",
    "moisture boost",
    "moisture",
    "quenching",
    "dewy",
    "water-boosting",
  ],
  "anti-inflammatory": [
    "anti-inflammatory",
    "anti inflammation",
    "calming inflammation",
    "reduce redness",
    "soothing inflammation",
    "irritation relief",
  ],
  "sun-protection": [
    "sun protection",
    "uv protection",
    "spf",
    "sunscreen",
    "uv shield",
    "photo-protection",
    "sunblock",
    "sun-safe",
  ],
  brightening: [
    "brightening",
    "radiance",
    "radiant",
    "glow",
    "glowing",
    "luminosity",
    "luminous",
    "brightness",
    "radiance-boosting",
    "illuminating",
    "lightening",
    "skin clarity",
  ],
  soothing: [
    "soothing",
    "calming",
    "comforting",
    "anti-redness",
    "anti redness",
    "relieving",
    "relief",
    "sensitive skin",
    "comforting sensitive skin",
  ],
  "barrier-support": [
    "barrier-support",
    "barrier support",
    "barrier-repair",
    "barrier repair",
    "barrier-strengthening",
    "barrier strengthening",
    "skin barrier",
    "barrier",
  ],

  // not found
  repairing: [
    "repairing",
    "repair",
    "restoring",
    "restorative",
    "healing",
    "recovery",
    "regenerating",
  ],
  "anti-aging": [
    "anti-aging",
    "anti ageing",
    "antiageing",
    "age-defying",
    "age defying",
    "anti-wrinkle",
    "wrinkle care",
    "youthful",
    "aging",
  ],
  firming: [
    "firming",
    "firm",
    "lifting",
    "lift",
    "tightening",
    "tighten",
    "toning",
    "tone",
  ],
  plumping: [
    "plumping",
    "plump",
    "volumizing",
    "volumising",
    "bouncy",
    "bounce",
    "cushioning",
  ],

  "acne-fighting": [
    "acne-fighting",
    "acne fighting",
    "blemish-fighting",
    "blemish fighting",
    "blemish-control",
    "blemish control",
    "breakout control",
    "clarifying",
    "clear skin",
  ],

  "oil-control": [
    "oil-control",
    "oil control",
    "oil-balancing",
    "oil balancing",
    "shine-control",
    "shine control",
    "mattifying",
    "matte",
    "sebum-control",
    "sebum control",
  ],

  "pore-refining": [
    "pore-refining",
    "pore refining",
    "pore minimizing",
    "pore minimising",
    "refine pores",
    "tighten pores",
  ],

  exfoliating: [
    "exfoliating",
    "exfoliation",
    "resurfacing",
    "smoothing",
    "smooth",
    "renewing",
    "skin renewal",
    "polishing",
  ],

  "tone-evening": [
    "tone-evening",
    "tone evening",
    "even tone",
    "tone-correcting",
    "tone correcting",
    "tone-balancing",
    "tone balancing",
    "discoloration",
    "dark spot",
    "spot correcting",
  ],
  balancing: [
    "balancing",
    "balance",
    "rebalancing",
    "ph balancing",
    "ph-balanced",
    "ph balanced",
  ],
  protecting: [
    "protecting",
    "protection",
    "defending",
    "shielding",
    "antioxidant",
    "environmental protection",
  ],
  "anti-pollution": [
    "anti-pollution",
    "pollution defense",
    "urban protection",
    "environmental shield",
    "blue light protection",
  ],
  healing: [
    "healing",
    "restoring skin",
    "regenerative",
    "post-sun repair",
    "after-sun",
    "wound-healing",
  ],
  nourishing: [
    "nourishing",
    "feeding",
    "conditioning",
    "rich hydration",
    "revitalizing",
  ],
  detoxifying: [
    "detoxifying",
    "detox",
    "purifying",
    "clarifying",
    "deep cleansing",
    "pollution removal",
  ],
};

export const resolveBenefit = (input: string): BenefitCanonical | null =>
  lookupByAlias(BENEFIT_CANONICALS, BENEFIT_ALIAS_MAP, input);

export const mapDescriptorsToBenefits = (
  descriptors: readonly unknown[] | null | undefined
): {
  benefits: BenefitCanonical[];
  residual: string[];
} => {
  if (!Array.isArray(descriptors)) {
    return { benefits: [], residual: [] };
  }

  const benefitSet = new Set<BenefitCanonical>();
  const residual: string[] = [];

  descriptors.forEach((entry) => {
    if (typeof entry !== "string") return;
    const trimmed = entry.trim();
    if (!trimmed.length) return;
    const resolved = resolveBenefit(trimmed);
    if (resolved) {
      benefitSet.add(resolved);
    } else {
      residual.push(trimmed);
    }
  });

  return { benefits: Array.from(benefitSet), residual };
};

const INGREDIENT_GROUPS: Record<string, string[]> = {
  aha: [
    "glycolic acid",
    "lactic acid",
    "mandelic acid",
    "citric acid",
    "malic acid",
    "tartaric acid",
    "alpha hydroxy acid",
    "alpha-hydroxy acid",
  ],
  bha: ["salicylic acid", "beta hydroxy acid", "beta-hydroxy acid"],
  pha: ["gluconolactone", "lactobionic acid", "polyhydroxy acid"],
  retinoids: [
    "retinol",
    "retinal",
    "retinaldehyde",
    "retinyl palmitate",
    "adapalene",
    "tretinoin",
    "bakuchiol",
  ],
  "vitamin c": [
    "ascorbic acid",
    "l-ascorbic acid",
    "magnesium ascorbyl phosphate",
    "sodium ascorbyl phosphate",
    "ascorbyl glucoside",
    "ascorbyl palmitate",
  ],
  niacinamide: ["niacinamide", "vitamin b3"],
  peptides: ["palmitoyl pentapeptide", "peptide", "copper peptide"],
  ceramides: ["ceramide", "ceramide np", "ceramide ap", "ceramide eop"],
  hydrating: [
    "hyaluronic acid",
    "sodium hyaluronate",
    "glycerin",
    "glycerine",
    "panthenol",
    "vitamin b5",
    "provitamin b5",
    "polyglutamic acid",
    "beta glucan",
    "aloe vera",
    "trehalose",
  ],
  hydration: [
    "hyaluronic acid",
    "sodium hyaluronate",
    "glycerin",
    "panthenol",
    "vitamin b5",
    "polyglutamic acid",
    "beta glucan",
    "aloe vera",
  ],
  moisturizing: [
    "hyaluronic acid",
    "sodium hyaluronate",
    "glycerin",
    "panthenol",
    "vitamin b5",
    "ceramide",
    "ceramide np",
    "ceramide ap",
    "ceramide eop",
    "squalane",
  ],
  moisturising: [
    "hyaluronic acid",
    "sodium hyaluronate",
    "glycerin",
    "panthenol",
    "vitamin b5",
    "ceramide",
    "ceramide np",
    "ceramide ap",
    "ceramide eop",
    "squalane",
  ],
};

export const resolveIngredientGroup = (input: string): string[] => {
  const key = normalize(input);
  return INGREDIENT_GROUPS[key] ?? [];
};

export const resolveSkinConcern = (
  input: string
): SkinConcernCanonical | null =>
  lookupByAlias(SKIN_CONCERN_CANONICALS, SKIN_CONCERN_ALIAS_MAP, input);
