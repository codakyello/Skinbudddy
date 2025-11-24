export type SearchProductsArgs = {
  categoryQuery?: string;
  nameQuery?: string;
  brandQuery?: string;
  skinTypes?: string[];
  skinConcerns?: string[];
  ingredientQueries?: string[];
  ingredientsToAvoid?: string[];
  hasAlcohol?: boolean;
  hasFragrance?: boolean;
  benefits?: string[];
  minPrice?: number;
  maxPrice?: number;
  priceLabel?: string;
};

export type ToolOutcomeSummary = {
  name: string;
  status: "success" | "error";
  message?: string;
  quantity?: number;
};

export const buildKeywordPatterns = (keywords: string[]): RegExp[] =>
  keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0)
    .map((keyword) => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const boundaryPattern = escaped.replace(/\s+/g, "\\s+");
      return new RegExp(
        `(?:^|[^a-z0-9])${boundaryPattern}(?:[^a-z0-9]|$)`,
        "i"
      );
    });

export const CATEGORY_KEYWORD_MAP: Array<{
  category: string;
  patterns: RegExp[];
}> = [
  {
    category: "serum",
    patterns: buildKeywordPatterns([
      "serum",
      "serums",
      "face serum",
      "ampoule",
      "ampoules",
      "essence",
      "treatment serum",
      "face oil",
      "glow oil",
      "treatment oil",
      "spot serum",
    ]),
  },
  {
    category: "cleanser",
    patterns: buildKeywordPatterns([
      "cleanser",
      "cleansers",
      "face wash",
      "facewash",
      "facial wash",
      "cleansing gel",
      "cleansing foam",
      "foam cleanser",
      "gel cleanser",
      "micellar cleanser",
      "washing gel",
    ]),
  },
  {
    category: "moisturizer",
    patterns: buildKeywordPatterns([
      "moisturizer",
      "moisturiser",
      "moisturisers",
      "moisturizers",
      "face cream",
      "hydrating cream",
      "cream",
      "creams",
      "creme",
      "cremes",
      "lotion",
      "lotions",
      "body lotion",
      "ltions",
      "moisturizing lotion",
      "moisturizing gel",
      "gel cream",
      "water cream",
      "hydrating lotion",
      "body cream",
      "skin food",
      "toning cream",
    ]),
  },
  {
    category: "toner",
    patterns: buildKeywordPatterns([
      "toner",
      "toners",
      "essence toner",
      "facial toner",
      "face toner",
      "mist",
      "face mist",
      "hydrating mist",
      "spritz",
    ]),
  },
  {
    category: "sunscreen",
    patterns: buildKeywordPatterns([
      "sunscreen",
      "sun screen",
      "sun block",
      "sunblock",
      "spf",
      "uv",
      "sun protector",
      "sun cream",
      "suncream",
      "uv protector",
      "uv shield",
      "sun guard",
      "sun gel",
    ]),
  },
  {
    category: "mask",
    patterns: buildKeywordPatterns([
      "mask",
      "masks",
      "sheet mask",
      "sheet masks",
      "mud mask",
      "clay mask",
      "overnight mask",
      "sleeping mask",
      "peel off mask",
    ]),
  },
  {
    category: "exfoliant",
    patterns: buildKeywordPatterns([
      "exfoliant",
      "exfoliator",
      "chemical peel",
      "peel",
      "resurfacer",
      "scrub",
      "facial scrub",
      "polish",
      "brightening scrub",
    ]),
  },
];

export const ROUTINE_KEYWORDS = [
  "routine",
  "regimen",
  "lineup",
  "ritual",
  "step-by-step",
  "steps",
  "morning routine",
  "evening routine",
  "am routine",
  "pm routine",
  "night routine",
  "daytime routine",
  "nighttime routine",
  "full routine",
  "entire routine",
  "complete routine",
  "skin routine",
];

export const SWAP_KEYWORDS = [
  "swap",
  "replace",
  "switch",
  "substitute",
  "update",
  "alternate",
  "alternative",
];

export const ANY_SIZE_PATTERNS = [
  /\b(any|either|whatever|whichever)\s+size\b/i,
  /\bno\s+preference\b/i,
  /\bchoose\s+(?:any|either)\b/i,
  /\byou\s+pick\s+(?:the\s+)?size\b/i,
  /\bsurprise\s+me\b/i,
];

export const normalizeHeaderValue = (line: string): string =>
  line
    .toLowerCase()
    .replace(/[\*`_~>#:\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const formatBodyWithParagraphs = (body: string): string => body;
export const applyParagraphStructure = (input: string): string => input.trim();

export const userAllowsAnySize = (text: string | undefined): boolean => {
  if (!text) return false;
  return ANY_SIZE_PATTERNS.some((pattern) => pattern.test(text));
};

export const userMentionsSize = (
  userText: string | undefined,
  sizeDetail:
    | {
        sizeId: string;
        label?: string;
        sizeText?: string;
        unit?: string;
        sizeValue?: number;
      }
    | undefined
): boolean => {
  if (!userText || !sizeDetail) return false;
  const normalized = userText.toLowerCase();
  const candidates: string[] = [];
  if (sizeDetail.label) candidates.push(sizeDetail.label.toLowerCase());
  if (sizeDetail.sizeText) candidates.push(sizeDetail.sizeText.toLowerCase());
  if (sizeDetail.unit && sizeDetail.sizeValue) {
    const numeric = sizeDetail.sizeValue;
    const unit = sizeDetail.unit.toLowerCase();
    const compact = `${numeric}${unit}`;
    const spaced = `${numeric} ${unit}`;
    candidates.push(compact);
    candidates.push(spaced);
  }
  if (sizeDetail.sizeValue && !Number.isNaN(sizeDetail.sizeValue)) {
    candidates.push(String(sizeDetail.sizeValue));
  }
  return candidates.some((candidate) => candidate && normalized.includes(candidate));
};

export const toStringList = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input
      .map((entry) => (typeof entry === "string" ? entry.trim() : null))
      .filter((entry): entry is string => Boolean(entry));
  }
  if (typeof input === "string" && input.trim().length) {
    return [input.trim()];
  }
  return [];
};

export const collectStringArray = (
  value: unknown,
  limit: number
): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      typeof entry === "string" ? entry.trim() : undefined
    )
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, limit);
};

export const extractString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length) {
    return value.trim();
  }
  return undefined;
};
