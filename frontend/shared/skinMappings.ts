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
  "mature",
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
  mature: ["mature skin", "mature", "aging skin", "aged skin"],
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
    redness: [
      "redness",
      "red skin",
      "flushed skin",
      "rosacea",
      "irritation",
    ],
    sensitivity: [
      "sensitivity",
      "sensitive skin",
      "sensitive",
      "reactive skin",
      "reactive",
      "sensitized skin",
    ],
    "fine-lines": [
      "fine lines",
      "fine line",
      "lines",
      "expression lines",
    ],
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
};

export const resolveIngredientGroup = (input: string): string[] => {
  const key = normalize(input);
  return INGREDIENT_GROUPS[key] ?? [];
};

export const resolveSkinConcern = (
  input: string
): SkinConcernCanonical | null =>
  lookupByAlias(SKIN_CONCERN_CANONICALS, SKIN_CONCERN_ALIAS_MAP, input);
