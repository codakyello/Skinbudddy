import z from "zod";
import { fetchAction, fetchMutation, fetchQuery } from "../convex/client";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  resolveSkinConcern,
  resolveSkinType,
  resolveIngredientGroup,
  type SkinConcernCanonical,
  type SkinTypeCanonical,
} from "../../shared/skinMappings";

type NormalizedSkinProfile = {
  skinType?: string;
  skinConcerns?: string[];
  ingredientSensitivities?: string[];
  updatedAt?: number;
};

type SkinProfileFetchResult = {
  success: boolean;
  skinProfile: NormalizedSkinProfile | null;
  quizCallToAction?: string;
  error?: string;
};

async function fetchUserSkinProfile(
  apiModule: Awaited<ReturnType<typeof ensureApi>>
): Promise<SkinProfileFetchResult> {
  try {
    const response = await fetchQuery(apiModule.users.getUser, {});
    const userRecord = response?.success ? (response.user as unknown) : null;
    const skinProfile =
      userRecord &&
      typeof userRecord === "object" &&
      "skinProfile" in userRecord &&
      userRecord.skinProfile &&
      typeof (userRecord as Record<string, unknown>).skinProfile === "object"
        ? ((userRecord as Record<string, unknown>).skinProfile as Record<
            string,
            unknown
          >)
        : null;

    if (!skinProfile) {
      return {
        success: false,
        skinProfile: null,
        quizCallToAction:
          "We haven't saved your skin profile yet. SkinBuddy can walk you through a quick quiz to discover it whenever you're ready.",
      };
    }

    const toStringArray = (value: unknown): string[] | undefined =>
      Array.isArray(value)
        ? value
            .map((entry) =>
              typeof entry === "string" && entry.trim().length
                ? entry.trim().toLowerCase()
                : null
            )
            .filter((entry): entry is string => Boolean(entry))
        : undefined;

    return {
      success: true,
      skinProfile: {
        skinType:
          typeof skinProfile.skinType === "string"
            ? skinProfile.skinType
            : undefined,
        skinConcerns: toStringArray(skinProfile.skinConcerns),
        ingredientSensitivities: toStringArray(
          skinProfile.ingredientSensitivities
        ),
        updatedAt:
          typeof skinProfile.updatedAt === "number"
            ? skinProfile.updatedAt
            : undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      skinProfile: null,
      error: error instanceof Error ? error.message : String(error ?? ""),
    };
  }
}

type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodTypeAny;
  handler: (input: unknown) => Promise<unknown>;
};

const searchProductsSchema = z
  .object({
    nameQuery: z
      .string()
      .optional()
      .describe(
        "Free-text name the user mentioned (use only when they referenced a specific product name)."
      ),
    categoryQuery: z
      .string()
      .optional()
      .describe(
        "User-stated product category (e.g. 'cleanser', 'sunscreen', 'exfoliator'); prefer specific taxonomy when available."
      ),
    brandQuery: z
      .string()
      .optional()
      .describe(
        "Brand label the user mentioned (e.g. 'cerave', 'la roche-posay')."
      ),
    skinTypes: z
      .array(z.string())
      .optional()
      .describe(
        "Canonical skin types to filter by (e.g. ['oily','sensitive']). If not provided, the user's saved profile will be used when available."
      ),
    skinConcerns: z
      .array(z.string())
      .optional()
      .describe(
        "Canonical skin concerns to target (e.g. ['acne','hyperpigmentation']). If not provided, the user's saved profile will be used when available."
      ),
    benefits: z
      .array(z.string())
      .optional()
      .describe(
        "Product benefit tags to focus on (e.g. ['hydrating','brightening'])."
      ),
    ingredientQueries: z
      .array(z.string())
      .optional()
      .describe(
        "Specific ingredients to include, e.g. ['hyaluronic acid', 'niacinamide', 'retinol', 'salicylic acid']"
      ),
    hasAlcohol: z
      .boolean()
      .optional()
      .describe(
        "If true, only return products containing alcohol; if false, only return alcohol-free options."
      ),
    hasFragrance: z
      .boolean()
      .optional()
      .describe(
        "If true, only return products containing fragrance; if false, only return fragrance-free options."
      ),
    limit: z.number().int().min(1).max(10).optional(),
    isBestseller: z
      .boolean()
      .optional()
      .describe("Set true to only return products marked as bestsellers."),
    isTrending: z
      .boolean()
      .optional()
      .describe("Set true to only return products flagged as trending."),
    isNew: z
      .boolean()
      .optional()
      .describe("Set true to only return newly added products."),
    minDiscount: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Minimum discount percentage (inclusive). Only set if user specifies a min discount."),
    maxDiscount: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Maximum discount percentage (inclusive). Only set if user specifies a max discount."),
    minPrice: z
      .number()
      .nonnegative()
      .optional()
      .describe(
        "Minimum price (inclusive). OMIT unless user explicitly specifies a minimum price. Do NOT set a default like 0."
      ),
    maxPrice: z
      .number()
      .nonnegative()
      .optional()
      .describe(
        "Maximum price (inclusive). OMIT unless user explicitly specifies a maximum price. Do NOT set a default like 1000 or 10000."
      ),
    ingredientsToAvoid: z
      .array(z.string())
      .optional()
      .describe(
        "Ingredient sensitivities the user wants to avoid (e.g. alcohol, retinoids, essential-oils)."
      ),
    excludeProductIds: z
      .array(z.string())
      .optional()
      .describe(
        "Product IDs or slugs already shown to the user that should be excluded."
      ),
  })
  .strict();

const searchProductsParameters = {
  type: "object",
  properties: {
    nameQuery: {
      type: "string",
      description:
        "Use only when the user gives a specific product name or phrase to match directly.",
    },
    categoryQuery: {
      type: "string",
      description:
        "Category mentioned by the user (cleanser, toner, sunscreen, etc.).",
    },
    brandQuery: {
      type: "string",
      description: "Brand mentioned by the user (e.g. cerave, paula's choice).",
    },
    skinTypes: {
      type: "array",
      items: { type: "string" },
      description:
        "Canonical skin types to filter by (oily, dry, sensitive). If omitted, the user's saved profile will be used when available.",
    },
    skinConcerns: {
      type: "array",
      items: { type: "string" },
      description:
        "Canonical skin concerns to focus on (acne, hyperpigmentation, redness, etc.). If omitted, the user's saved profile will be used when available.",
    },
    benefits: {
      type: "array",
      items: { type: "string" },
      description:
        "Benefit tags to emphasize (hydrating, brightening, barrier-support, etc.).",
    },
    ingredientQueries: {
      type: "array",
      items: { type: "string" },
      description:
        "Specific ingredient filters requested by the user (retinol, niacinamide, salicylic acid, etc.).",
    },
    hasAlcohol: {
      type: "boolean",
      description:
        "If true, only return products containing alcohol; if false, only alcohol-free products.",
    },
    hasFragrance: {
      type: "boolean",
      description:
        "If true, only return products containing fragrance; if false, only fragrance-free products.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 10,
    },
    isBestseller: {
      type: "boolean",
      description: "Only return products flagged as bestsellers when true.",
    },
    isTrending: {
      type: "boolean",
      description: "Only return products flagged as trending when true.",
    },
    isNew: {
      type: "boolean",
      description: "Only return products marked as newly added when true.",
    },
    minDiscount: {
      type: "number",
      description: "Minimum discount percentage (inclusive).",
    },
    maxDiscount: {
      type: "number",
      description: "Maximum discount percentage (inclusive).",
    },
    minPrice: {
      type: "number",
      description:
        "Minimum price (inclusive) in the store currency for qualifying sizes.",
    },
    maxPrice: {
      type: "number",
      description:
        "Maximum price (inclusive) in the store currency for qualifying sizes.",
    },
    ingredientsToAvoid: {
      type: "array",
      items: { type: "string" },
      description:
        "List of ingredient sensitivities to exclude (alcohol, retinoids, essential-oils, ahas-bhas, etc.).",
    },
    excludeProductIds: {
      type: "array",
      items: { type: "string" },
      description:
        "List of product IDs or slugs to skip (already suggested or rejected).",
    },
  },
  additionalProperties: false,
};

const productFiltersSchema = z
  .object({
    isBestseller: z.boolean().optional(),
    discount: z.number().optional(),
    isTrending: z.boolean().optional(),
    isNew: z.boolean().optional(),
    brandSlugs: z.array(z.string()).optional(),
    categorySlugs: z.array(z.string()).optional(),
    skinTypes: z.array(z.string()).optional(),
  })
  .optional();

const productFiltersParameters = {
  type: "object",
  properties: {
    isBestseller: { type: "boolean" },
    discount: { type: "number" },
    isTrending: { type: "boolean" },
    isNew: { type: "boolean" },
    brandSlugs: { type: "array", items: { type: "string" } },
    categorySlugs: { type: "array", items: { type: "string" } },
    skinTypes: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
};

const recommendRoutineSchema = z
  .object({
    skinType: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Canonical or user-provided skin type (oily, dry, combination, sensitive, balanced, etc.). If not provided, the user's saved profile will be used when available."
      ),
    skinConcerns: z
      .array(
        z
          .string()
          .min(1)
          .describe(
            "Primary skin concerns the routine must target (acne, hyperpigmentation, sensitivity, dullness, etc.)."
          )
      )
      .min(1)
      .optional()
      .describe(
        "If not provided, the user's saved profile will be used when available."
      ),
    ingredientsToAvoid: z
      .array(
        z
          .string()
          .describe(
            "Ingredient sensitivities or exclusions (e.g. alcohol, retinoids, essential oils)."
          )
      )
      .optional(),
    fragranceFree: z
      .boolean()
      .optional()
      .describe(
        "Set true to only include fragrance-free products; omit when the user has no preference."
      ),
    createRoutine: z
      .boolean()
      .optional()
      .describe(
        "Set true to persist the generated routine for the user (when authenticated)."
      ),
    excludeProductIds: z
      .array(
        z
          .string()
          .describe(
            "Product IDs or slugs that should NOT appear in the returned routine (e.g. previously rejected items)."
          )
      )
      .optional(),
    budget: z
      .number()
      .positive()
      .optional()
      .describe(
        "Maximum total budget for the entire routine in the store's currency (e.g. 20000 for ₦20,000)."
      ),
    excludeBrands: z
      .array(z.string())
      .optional()
      .describe(
        "List of brand names to strictly exclude (e.g. ['CeraVe', 'The Ordinary'])."
      ),
    excludeKeywords: z
      .array(z.string())
      .optional()
      .describe(
        "List of keywords to exclude from product names or descriptions (e.g. ['snail', 'whitening'])."
      ),
    preferenceInstructions: z
      .string()
      .optional()
      .describe(
        "Free-text instructions for soft preferences or specific user requests (e.g. 'User hates sticky textures', 'Prefer glass skin finish')."
      ),
  })
  .strict();

const recommendRoutineParameters = {
  type: "object",
  properties: {
    skinType: {
      type: "string",
      description:
        "Canonical skin type label (oily, dry, combination, sensitive, balanced, etc.). If omitted, the user's saved profile will be used when available.",
    },
    skinConcerns: {
      type: "array",
      items: { type: "string" },
      description:
        "List of key skin concerns the routine must address (acne, dark spots, redness, etc.). If omitted, the user's saved profile will be used when available.",
    },
    ingredientsToAvoid: {
      type: "array",
      items: { type: "string" },
      description:
        "Optional list of ingredient sensitivities to exclude (alcohol, retinoids, essential oils, etc.).",
    },
    fragranceFree: {
      type: "boolean",
      description:
        "Set true when the user insists on fragrance-free products; omit otherwise.",
    },
    createRoutine: {
      type: "boolean",
      description:
        "Set true to persist the generated routine for the user (requires authentication).",
    },
    excludeProductIds: {
      type: "array",
      items: { type: "string" },
      description:
        "IDs or slugs for products that should be omitted from the result set (e.g. user rejected them).",
    },
    budget: {
      type: "number",
      description:
        "Maximum total budget for the entire routine in the store's currency.",
    },
    excludeBrands: {
      type: "array",
      items: { type: "string" },
      description: "Brand names to strictly exclude.",
    },
    excludeKeywords: {
      type: "array",
      items: { type: "string" },
      description: "Keywords to exclude from product names/descriptions.",
    },
    preferenceInstructions: {
      type: "string",
      description:
        "Soft preferences or specific requests (e.g. texture, finish).",
    },
  },
  required: [],
  additionalProperties: false,
};

const startSkinTypeSurveySchema = z.object({}).strict();

const startSkinTypeSurveyParameters = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const saveUserProfileSchema = z
  .object({
    skinType: z.string().optional(),
    skinConcerns: z.array(z.string()).optional(),
    skinConcern: z.string().optional(),
    ingredientSensitivities: z.array(z.string()).optional(),
    ingredientSensitivity: z.string().optional(),
    history: z.string().optional(),
    // Cycle tracking
    lastPeriodDate: z.string().optional(), // ISO date string or "2 weeks ago" (LLM can parse, but ISO preferred)
    avgCycleLength: z.number().optional(),
  })
  .strict();

const saveUserProfileParameters = {
  type: "object",
  properties: {
    skinType: {
      type: "string",
      description:
        "User's declared skin type (e.g. oily, dry, combination, sensitive).",
    },
    skinConcerns: {
      type: "array",
      items: { type: "string" },
      description:
        "Primary skin concerns mentioned by the user (e.g. acne, hyperpigmentation).",
    },
    skinConcern: {
      type: "string",
      description:
        "Singular skin concern value; converts into the skinConcerns list automatically.",
    },
    ingredientSensitivities: {
      type: "array",
      items: { type: "string" },
      description:
        "Specific ingredients or ingredient families the user wishes to avoid (e.g. fragrance, alcohol).",
    },
    ingredientSensitivity: {
      type: "string",
      description:
        "Singular ingredient sensitivity value; converts into the ingredientSensitivities list automatically.",
    },
    history: {
      type: "string",
      description:
        "Free-form context about the user's situation. When updating, INTELLIGENTLY MERGE with existing history: append new non-conflicting info, update conflicting info (e.g., 'sunny' → 'rainy'), remove outdated info (e.g., 'finished Accutane'). Examples: medications ('on 80mg Accutane'), environment ('high sun exposure'), goals ('preparing for wedding'), lifestyle ('outdoor athlete'). Fetch current history via getSkinProfile first to merge properly.",
    },
    lastPeriodDate: {
      type: "string",
      description:
        "The start date of the user's last period (ISO 8601 format YYYY-MM-DD preferred). If user says '2 weeks ago', calculate the approximate date.",
    },
    avgCycleLength: {
      type: "number",
      description: "Average length of menstrual cycle in days (default 28 if unknown).",
    },
  },
  additionalProperties: false,
};

const ensureApi = async () => api;

type SanitizedSize = {
  id: string;
  size?: number;
  sizeText?: string;
  unit?: string;
  label?: string;
  price?: number;
  discount?: number;
  stock?: number;
  currency?: string;
};

type SanitizedProduct = {
  _id: string;
  slug?: string;
  name?: string;
  description?: string;
  images: string[];
  sizes: SanitizedSize[];
  brand?: { name?: string; slug?: string };
  score?: number;
  categories?: Array<{ name?: string; slug?: string }>;
  ingredients?: string[];
  benefits?: string[];
  skinTypes?: string[];
  hasAlcohol?: boolean;
  hasFragrance?: boolean;
  isTrending?: boolean;
  isNew?: boolean;
  isBestseller?: boolean;
};

type IngredientSensitivityCanonical =
  | "alcohol"
  | "retinoids"
  | "retinol"
  | "niacinamide"
  | "ahas-bhas"
  | "vitamin-c"
  | "essential-oils"
  | "mandelic acid";

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const extractRelevantProductInfo = (
  product: unknown
): SanitizedProduct | null => {
  if (!product || typeof product !== "object") return null;
  const raw = product as Record<string, unknown>;

  const idValue = raw._id ?? raw.id;
  const slugValue = raw.slug;
  const _id = typeof idValue === "string" ? idValue : undefined;
  const slug = typeof slugValue === "string" ? slugValue : undefined;
  if (!_id && !slug) return null;

  const images = Array.isArray(raw.images)
    ? raw.images.filter((img): img is string => typeof img === "string")
    : [];

  const sizes = Array.isArray(raw.sizes)
    ? raw.sizes
        .map((size) => {
          if (!size || typeof size !== "object") return null;
          const sizeRecord = size as Record<string, unknown>;
          const sizeIdValue =
            sizeRecord.id ?? sizeRecord.sizeId ?? sizeRecord._id;
          const sizeId =
            typeof sizeIdValue === "string" ? sizeIdValue : undefined;
          if (!sizeId) return null;

          const explicitSizeText =
            typeof sizeRecord.sizeText === "string" &&
            sizeRecord.sizeText.trim().length
              ? sizeRecord.sizeText.trim()
              : undefined;
          const numericSize = toNumber(sizeRecord.size);
          const unit =
            typeof sizeRecord.unit === "string" && sizeRecord.unit.trim().length
              ? sizeRecord.unit.trim()
              : undefined;
          const name =
            typeof sizeRecord.name === "string" && sizeRecord.name.trim().length
              ? sizeRecord.name.trim()
              : undefined;
          const price = toNumber(sizeRecord.price);
          const discount = toNumber(sizeRecord.discount);
          const stock = toNumber(sizeRecord.stock);
          const currency =
            typeof sizeRecord.currency === "string" &&
            sizeRecord.currency.trim().length
              ? sizeRecord.currency.trim()
              : undefined;

          let label =
            typeof sizeRecord.label === "string" &&
            sizeRecord.label.trim().length
              ? sizeRecord.label.trim()
              : name;
          if (!label) {
            if (typeof numericSize === "number" && unit) {
              label = `${numericSize} ${unit}`.trim();
            } else if (explicitSizeText && unit) {
              label = `${explicitSizeText} ${unit}`.trim();
            } else if (explicitSizeText) {
              label = explicitSizeText;
            } else if (unit) {
              label = unit;
            }
          }

          const sanitized: SanitizedSize = { id: sizeId };
          if (typeof numericSize === "number") sanitized.size = numericSize;
          if (explicitSizeText) sanitized.sizeText = explicitSizeText;
          if (unit) sanitized.unit = unit;
          if (label) sanitized.label = label;
          if (typeof price === "number") sanitized.price = price;
          if (typeof discount === "number") sanitized.discount = discount;
          if (typeof stock === "number") sanitized.stock = stock;
          if (currency) sanitized.currency = currency;

          return sanitized;
        })
        .filter((size): size is SanitizedSize => Boolean(size))
    : [];

  const brandRaw = raw.brand;
  const brand =
    brandRaw && typeof brandRaw === "object"
      ? {
          name:
            typeof (brandRaw as Record<string, unknown>).name === "string"
              ? ((brandRaw as Record<string, unknown>).name as string)
              : undefined,
          slug:
            typeof (brandRaw as Record<string, unknown>).slug === "string"
              ? ((brandRaw as Record<string, unknown>).slug as string)
              : undefined,
        }
      : undefined;

  const categories = Array.isArray(raw.categories)
    ? raw.categories
        .map((category) => {
          if (!category) return null;
          if (typeof category === "string") {
            return { name: category } as { name?: string; slug?: string };
          }
          if (typeof category === "object") {
            const categoryRecord = category as Record<string, unknown>;
            const result: { name?: string; slug?: string } = {};
            if (typeof categoryRecord.name === "string") {
              result.name = categoryRecord.name;
            }
            if (typeof categoryRecord.slug === "string") {
              result.slug = categoryRecord.slug;
            }
            return Object.keys(result).length ? result : null;
          }
          return null;
        })
        .filter(
          (category): category is { name?: string; slug?: string } =>
            category !== null
        )
    : [];

  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.filter(
        (ingredient): ingredient is string => typeof ingredient === "string"
      )
    : [];

  const benefits = Array.isArray(raw.benefits)
    ? raw.benefits.filter(
        (benefit): benefit is string => typeof benefit === "string"
      )
    : [];

  const skinTypesSource = Array.isArray(raw.skinTypes)
    ? raw.skinTypes
    : Array.isArray(raw.skinType)
      ? raw.skinType
      : [];
  const skinTypes = skinTypesSource.filter(
    (entry): entry is string => typeof entry === "string"
  );

  return {
    _id: _id ?? (slug as string),
    slug,
    name: typeof raw.name === "string" ? raw.name : undefined,
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    images,
    sizes,
    brand,
    score: typeof raw.score === "number" ? raw.score : undefined,
    categories: categories.length ? categories : undefined,
    ingredients: ingredients.length ? ingredients : undefined,
    benefits: benefits.length ? benefits : undefined,
    skinTypes: skinTypes.length ? skinTypes : undefined,
    hasAlcohol:
      typeof raw.hasAlcohol === "boolean" ? raw.hasAlcohol : undefined,
    hasFragrance:
      typeof raw.hasFragrance === "boolean" ? raw.hasFragrance : undefined,
    isTrending:
      typeof raw.isTrending === "boolean" ? raw.isTrending : undefined,
    isNew: typeof raw.isNew === "boolean" ? raw.isNew : undefined,
    isBestseller:
      typeof raw.isBestseller === "boolean" ? raw.isBestseller : undefined,
  };
};

const localTools: ToolSpec[] = [
  {
    name: "recommendRoutine",
    description:
      "Generate a complete multi-step skincare routine (cleanser → sunscreen) tailored to the user's skin type, concerns, and preferences. Call this ONLY when the user explicitly requests a full routine or wants to replace a specific step within an existing routine. Do not use it for single-product requests—those must go through searchProductsByQuery. Always pass excludeProductIds to avoid repeating previously suggested products.",
    parameters: recommendRoutineParameters,
    schema: recommendRoutineSchema,
    handler: async (rawInput) => {
      const input = recommendRoutineSchema.parse(rawInput);
      const apiModule = await ensureApi();

      // Fallback to saved profile if explicit skin details are missing
      let finalSkinType = input.skinType;
      let finalSkinConcerns = input.skinConcerns;
      let finalIngredientsToAvoid = input.ingredientsToAvoid;

      const shouldFetchProfile =
        !input.skinType || !input.skinConcerns || !input.skinConcerns.length;

      if (shouldFetchProfile) {
        try {
          const userResult = await fetchQuery(apiModule.users.getUser, {});
          if (userResult?.success && userResult.user?.skinProfile) {
            const profile = userResult.user.skinProfile as {
              skinType?: string;
              skinConcerns?: string[];
              ingredientSensitivities?: string[];
            };
            if (!finalSkinType && profile.skinType) {
              finalSkinType = profile.skinType;
            }
            if (
              (!finalSkinConcerns || !finalSkinConcerns.length) &&
              Array.isArray(profile.skinConcerns) &&
              profile.skinConcerns.length > 0
            ) {
              finalSkinConcerns = profile.skinConcerns;
            }
            if (
              Array.isArray(profile.ingredientSensitivities) &&
              profile.ingredientSensitivities.length > 0
            ) {
              // Merge with explicit ingredientsToAvoid
              const mergedAvoid = new Set([
                ...(input.ingredientsToAvoid || []),
                ...profile.ingredientSensitivities,
              ]);
              finalIngredientsToAvoid = Array.from(mergedAvoid);
            }
          }
        } catch (error) {
          console.warn(
            "Failed to fetch saved skin profile for fallback:",
            error
          );
        }
      }

      const allowedSkinTypes = new Set<SkinTypeCanonical>([
        "normal",
        "oily",
        "dry",
        "combination",
        "sensitive",
        "acne-prone",
        "all",
      ]);

      const allowedSkinConcerns = new Set<SkinConcernCanonical>([
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
      ]);

      const resolveCanonicalSkinType = (
        value: string
      ): SkinTypeCanonical | null => {
        const resolved = resolveSkinType(value);
        if (resolved) return resolved;
        const normalized = value.toLowerCase().trim();
        return allowedSkinTypes.has(normalized as SkinTypeCanonical)
          ? (normalized as SkinTypeCanonical)
          : null;
      };

      const resolveCanonicalSkinConcern = (
        value: string
      ): SkinConcernCanonical | null => {
        const resolved = resolveSkinConcern(value);
        if (resolved) return resolved;
        const normalized = value.toLowerCase().trim();
        return allowedSkinConcerns.has(normalized as SkinConcernCanonical)
          ? (normalized as SkinConcernCanonical)
          : null;
      };

      if (!finalSkinType) {
        throw new Error(
          "Skin type is required. Either provide it explicitly or ensure user has a saved profile."
        );
      }

      const canonicalSkinType = resolveCanonicalSkinType(finalSkinType);
      if (!canonicalSkinType) {
        throw new Error(
          `Unsupported skin type "${finalSkinType}". Provide a canonical type (oily, dry, combination, sensitive, mature, acne-prone, normal, all).`
        );
      }

      if (!finalSkinConcerns || !finalSkinConcerns.length) {
        throw new Error(
          "At least one skin concern is required. Either provide it explicitly or ensure user has a saved profile."
        );
      }

      const concernSet = new Set<SkinConcernCanonical>();
      finalSkinConcerns.forEach((concern) => {
        const resolved = resolveCanonicalSkinConcern(concern);
        if (resolved) concernSet.add(resolved);
      });

      if (!concernSet.size) {
        throw new Error(
          "At least one recognized skin concern is required (acne, hyperpigmentation, redness, etc.)."
        );
      }

      const ingredientSensitivityLookup: Record<
        string,
        IngredientSensitivityCanonical
      > = {
        alcohol: "alcohol",
        "alcohol-free": "alcohol",
        "no alcohol": "alcohol",
        retinoid: "retinoids",
        retinoids: "retinoids",
        retinol: "retinol",
        niacinamide: "niacinamide",
        aha: "ahas-bhas",
        "aha/bha": "ahas-bhas",
        "ahas-bhas": "ahas-bhas",
        "aha-bha": "ahas-bhas",
        bha: "ahas-bhas",
        "vitamin c": "vitamin-c",
        "vitamin-c": "vitamin-c",
        "essential oils": "essential-oils",
        "essential-oil": "essential-oils",
        fragrance: "essential-oils",
        "mandelic acid": "mandelic acid",
      };

      const resolveSensitivity = (
        raw: string
      ): IngredientSensitivityCanonical | null => {
        const normalized = raw.toLowerCase().trim();
        if (normalized.length === 0) return null;
        const direct = ingredientSensitivityLookup[normalized];
        if (direct) return direct;
        const hyphenated =
          ingredientSensitivityLookup[normalized.replace(/\s+/g, "-")];
        return hyphenated ?? null;
      };

      const ingredientsToAvoid = Array.isArray(finalIngredientsToAvoid)
        ? Array.from(
            new Set(
              finalIngredientsToAvoid
                .map(resolveSensitivity)
                .filter(
                  (value): value is IngredientSensitivityCanonical =>
                    value !== null
                )
            )
          )
        : undefined;

      const excludeProductIds = Array.from(
        new Set(
          (input.excludeProductIds ?? [])
            .map((value) => String(value).trim())
            .filter((value) => value.length > 0)
        )
      );

      const payload = {
        skinType: canonicalSkinType,
        skinConcern: Array.from(concernSet),
        ingredientsToAvoid:
          ingredientsToAvoid && ingredientsToAvoid.length
            ? ingredientsToAvoid
            : undefined,
        fragranceFree: input.fragranceFree,
        createRoutine: input.createRoutine ?? false,
        excludeProductIds:
          excludeProductIds.length > 0 ? excludeProductIds : undefined,
        budget: input.budget,
        excludeBrands: input.excludeBrands,
        excludeKeywords: input.excludeKeywords,
        preferenceInstructions: input.preferenceInstructions,
      };

      const stepOrder: Record<string, number> = {
        cleanser: 1,
        toner: 2,
        serum: 3,
        moisturizer: 4,
        sunscreen: 5,
      };

      const normalizeCategory = (value: unknown): string | undefined => {
        if (typeof value !== "string") return undefined;
        const normalized = value.toLowerCase().trim();
        if (!normalized) return undefined;
        if (normalized === "moisturiser") return "moisturizer";
        if (normalized === "serums") return "serum";
        return normalized;
      };

      const formatCategoryLabel = (category: string | undefined) => {
        if (!category) return "";
        return category
          .split("-")
          .map((part) =>
            part.length ? part[0].toUpperCase() + part.slice(1) : part
          )
          .join(" ");
      };

      const sanitizeStepDescription = (value: unknown) => {
        if (typeof value !== "string") return "";
        const trimmed = value.replace(/\s+/g, " ").trim();
        if (!trimmed) return "";
        const words = trimmed.split(" ");
        if (words.length <= 24) return trimmed;
        return `${words.slice(0, 24).join(" ")}…`;
      };

      try {
        const result = await fetchAction(apiModule.products.recommend, payload);

        if (
          result &&
          typeof result === "object" &&
          "success" in result &&
          (result as { success: boolean }).success === false
        ) {
          return result;
        }

        if (!result || typeof result !== "object") {
          return result;
        }

        const resultRecord = result as Record<string, unknown>;
        const rawRecommendations = Array.isArray(
          resultRecord["recommendations"]
        )
          ? (resultRecord["recommendations"] as Array<Record<string, unknown>>)
          : [];

        const seenProductIds = new Set<string>();
        const recommendations = rawRecommendations
          .map((entry) => {
            const entryRecord = entry as Record<string, unknown>;
            const category = normalizeCategory(entryRecord["category"]);
            if (!category) return null;
            if (!(category in stepOrder)) return null;

            const productInfo = extractRelevantProductInfo(
              entryRecord["product"] ?? entryRecord
            );
            if (!productInfo) return null;

            const productId =
              typeof entryRecord["productId"] === "string"
                ? (entryRecord["productId"] as string)
                : productInfo._id;
            if (!productId) return null;

            const normalizedId = productId.toLowerCase();
            if (seenProductIds.has(normalizedId)) return null;
            seenProductIds.add(normalizedId);

            const description = sanitizeStepDescription(
              entryRecord["description"]
            );
            const order =
              typeof entryRecord["order"] === "number"
                ? (entryRecord["order"] as number)
                : stepOrder[category];

            const alternativeEntries =
              Array.isArray(entryRecord["alternatives"]) &&
              entryRecord["alternatives"].length
                ? entryRecord["alternatives"]
                    .map((altEntry) => {
                      if (!altEntry || typeof altEntry !== "object")
                        return null;
                      const altRecord = altEntry as Record<string, unknown>;
                      const altProductInfo = extractRelevantProductInfo(
                        altRecord["product"] ?? altRecord
                      );
                      if (!altProductInfo) return null;
                      const altProductId =
                        typeof altRecord["productId"] === "string"
                          ? (altRecord["productId"] as string)
                          : altProductInfo._id;
                      if (!altProductId) return null;
                      const altNormalizedId = altProductId.toLowerCase();
                      if (altNormalizedId === normalizedId) return null;
                      const altDescription = sanitizeStepDescription(
                        altRecord["description"]
                      );
                      return {
                        productId: altProductId,
                        product: altProductInfo,
                        description: altDescription,
                      };
                    })
                    .filter(
                      (
                        altEntry
                      ): altEntry is {
                        productId: string;
                        product: SanitizedProduct;
                        description: string;
                      } => Boolean(altEntry)
                    )
                : [];

            return {
              category,
              categoryLabel: formatCategoryLabel(category),
              description,
              productId,
              product: productInfo,
              order,
              alternatives: alternativeEntries,
            };
          })
          .filter(
            (
              entry
            ): entry is {
              category: string;
              categoryLabel: string;
              description: string;
              productId: string;
              product: SanitizedProduct;
              order: number;
              alternatives: Array<{
                productId: string;
                product: SanitizedProduct;
                description: string;
              }>;
            } => Boolean(entry)
          );

        const steps = recommendations
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((entry, index) => ({
            step: index + 1,
            category: entry.category,
            title: entry.categoryLabel,
            description: entry.description,
            productId: entry.productId,
            product: entry.product,
            alternatives: entry.alternatives,
          }));

        const notes = sanitizeStepDescription(resultRecord["notes"]);

        return {
          ...resultRecord,
          notes,
          recommendations,
          steps,
        };
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : "Failed to generate a skincare routine."
        );
      }
    },
  },
  /*
  {
    name: "addToCart",
    description:
      "Adds a product (with a specific size) to a user's cart, validating stock and merging per server rules.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string" },
        sizeId: { type: "string" },
        quantity: { type: "integer", minimum: 1 },
      },
      required: ["productId", "sizeId", "quantity"],
      additionalProperties: false,
    },
    schema: z
      .object({
        productId: z.string(),
        sizeId: z.string(),
        quantity: z.number().min(1),
      })
      .strict(),
    handler: async (rawInput) => {
      const input = z
        .object({
          productId: z.string(),
          sizeId: z.string(),
          quantity: z.number().min(1),
        })
        .parse(rawInput);
      const apiModule = await ensureApi();
      return fetchMutation(apiModule.cart.createCart, {
        productId: input.productId as Id<"products">,
        sizeId: input.sizeId,
        quantity: input.quantity,
      });
    },
  },
  */
  {
    name: "searchProductsByQuery",
    description:
      'List products using free-text queries for category, brand, or name. Resolves fuzzy text to exact DB slugs and returns matching products. Examples: { "categoryQuery": "serum", "benefits": ["hydrating"] } · { "ingredientQueries": ["niacinamide"] }.',
    parameters: searchProductsParameters,
    schema: searchProductsSchema,
    handler: async (rawInput) => {
      let input;
      try {
        input = searchProductsSchema.parse(rawInput);
      } catch {
        throw new Error(
          "Invalid search filters supplied. Please adjust the request and try again."
        );
      }
      const apiModule = await ensureApi();
      const excludedIds = new Set(
        (input.excludeProductIds ?? []).map((value) =>
          String(value).toLowerCase()
        )
      );

      const processValues = <T extends string>(
        values: string[] | undefined,
        resolver: (input: string) => T | null
      ): { canonical: T[]; unresolved: string[] } => {
        const canonical = new Set<T>();
        const unresolved: string[] = [];

        if (Array.isArray(values)) {
          values.forEach((raw) => {
            const normalized =
              typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
            if (!normalized) return;
            const resolved = resolver(normalized);
            if (resolved) {
              canonical.add(resolved);
            } else {
              unresolved.push(normalized);
            }
          });
        }

        return { canonical: Array.from(canonical), unresolved };
      };

      // Use exactly what Grok provides - trust the LLM to decide when personalization is needed
      // If user wants personalized results, Grok will include skinTypes/skinConcerns or call getSkinProfile first
      const finalSkinTypes = input.skinTypes;
      const finalSkinConcerns = input.skinConcerns;
      const finalIngredientsToAvoid = input.ingredientsToAvoid;

      const {
        canonical: canonicalSkinTypes,
        unresolved: unresolvedSkinTypeQueries,
      } = processValues<SkinTypeCanonical>(finalSkinTypes, resolveSkinType);
      const {
        canonical: canonicalSkinConcerns,
        unresolved: unresolvedSkinConcernQueries,
      } = processValues<SkinConcernCanonical>(
        finalSkinConcerns,
        resolveSkinConcern
      );

      const cleanedIngredientQueries = Array.isArray(input.ingredientQueries)
        ? input.ingredientQueries.map((value) => value.trim()).filter(Boolean)
        : undefined;

      const cleanedBenefits = Array.isArray(input.benefits)
        ? Array.from(
            new Set(
              input.benefits
                .map((value) => value.trim().toLowerCase())
                .filter((value) => value.length > 0)
            )
          )
        : undefined;

      const cleanedIngredientsToAvoid = Array.isArray(finalIngredientsToAvoid)
        ? Array.from(
            new Set(
              finalIngredientsToAvoid
                .map((value) => value.trim().toLowerCase())
                .filter((value) => value.length > 0)
            )
          )
        : undefined;

      const applyPositiveNumber = (value: unknown): number | undefined => {
        if (typeof value !== "number") return undefined;
        return Number.isFinite(value) && value > 0 ? value : undefined;
      };

      const minPrice =
        typeof input.minPrice === "number" && input.minPrice > 0
          ? input.minPrice
          : undefined;
      const maxPrice =
        typeof input.maxPrice === "number" && input.maxPrice > 0
          ? input.maxPrice
          : undefined;

      const minDiscount =
        typeof input.minDiscount === "number" &&
        input.minDiscount >= 0 &&
        input.minDiscount <= 100
          ? input.minDiscount
          : undefined;
      const maxDiscount =
        typeof input.maxDiscount === "number" &&
        input.maxDiscount >= 0 &&
        input.maxDiscount <= 100
          ? input.maxDiscount
          : undefined;

      const isBestseller =
        typeof input.isBestseller === "boolean"
          ? input.isBestseller
          : undefined;
      const isTrending =
        typeof input.isTrending === "boolean" ? input.isTrending : undefined;
      const isNew = typeof input.isNew === "boolean" ? input.isNew : undefined;

      const expandedIngredientQueries = cleanedIngredientQueries
        ? cleanedIngredientQueries.map((query) => {
            const groupMatches = resolveIngredientGroup(query);
            const bundle = [query, ...groupMatches]
              .map((value) => value.trim())
              .filter((value) => value.length > 0);
            const unique = Array.from(new Set(bundle));
            return unique.join("||");
          })
        : undefined;

      const response = await fetchQuery(
        apiModule.products.searchProductsByQuery,
        {
          nameQuery: input.nameQuery,
          categoryQuery: input.categoryQuery,
          brandQuery: input.brandQuery,
          skinTypes: canonicalSkinTypes.length ? canonicalSkinTypes : undefined,
          skinTypeQueries: unresolvedSkinTypeQueries.length
            ? unresolvedSkinTypeQueries
            : undefined,
          skinConcerns: canonicalSkinConcerns.length
            ? canonicalSkinConcerns
            : undefined,
          skinConcernQueries: unresolvedSkinConcernQueries.length
            ? unresolvedSkinConcernQueries
            : undefined,
          ingredientQueries: expandedIngredientQueries,
          benefits: cleanedBenefits,
          limit: input.limit,
          hasAlcohol: input.hasAlcohol,
          hasFragrance: input.hasFragrance,
          minPrice,
          maxPrice,
          ingredientsToAvoid: cleanedIngredientsToAvoid,
          isBestseller,
          isTrending,
          isNew,
          minDiscount,
          maxDiscount,
        }
      );

      if (!response?.success) {
        return {
          success: false,
          reason: response?.reason ?? "not_found",
          categoryOptions: response?.categoryOptions ?? [],
          brandOptions: response?.brandOptions ?? [],
          products: [] as SanitizedProduct[],
        };
      }

      const sanitizedProducts = Array.isArray(response.products)
        ? response.products
            .map((product: unknown) => {
              const info = extractRelevantProductInfo(product);
              if (!info) return null;
              if (excludedIds.size > 0) {
                const idMatch = info._id
                  ? excludedIds.has(info._id.toLowerCase())
                  : false;
                const slugMatch =
                  info.slug && excludedIds.has(info.slug.toLowerCase());
                if (idMatch || slugMatch) {
                  return null;
                }
              }
              const score =
                typeof (product as Record<string, unknown>).score === "number"
                  ? ((product as Record<string, unknown>).score as number)
                  : undefined;
              return score != null ? { ...info, score } : info;
            })
            .filter(
              (product: SanitizedProduct | null): product is SanitizedProduct =>
                Boolean(product)
            )
        : [];

      if (!sanitizedProducts.length) {
        return {
          success: false,
          reason: "not_found",
          categoryOptions: [],
          brandOptions: [],
        };
      }

      return {
        success: true,
        filters: response.filters,
        products: sanitizedProducts,
      };
    },
  },
  {
    name: "getUserCart",
    description:
      "Retrieves all cart items for the current user, including product details, pricing, and stock availability.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    schema: z.object({}).strict(),
    handler: async () => {
      const apiModule = await ensureApi();
      const userCart = await fetchQuery(apiModule.cart.getUserCart, {});

      const cartItems = Array.isArray(userCart?.cart)
        ? (userCart.cart as Array<Record<string, unknown>>)
        : [];

      const missingProductIds = new Set<string>();
      const preSanitized = new Map<
        string,
        ReturnType<typeof extractRelevantProductInfo>
      >();

      for (const item of cartItems) {
        const existing = extractRelevantProductInfo(item.product);
        const productId =
          typeof item.productId === "string" ? item.productId : undefined;
        if (existing && productId) {
          preSanitized.set(productId, existing);
        } else if (!existing && productId) {
          missingProductIds.add(productId);
        }
      }

      let fetchedProducts: unknown[] = [];
      if (missingProductIds.size) {
        try {
          fetchedProducts = await fetchQuery(
            apiModule.products.getProductsByIds,
            {
              ids: Array.from(missingProductIds) as Id<"products">[],
            }
          );
        } catch (error) {
          console.error("Failed to load products for cart items:", error);
        }
      }

      const fetchedSanitized = new Map<
        string,
        ReturnType<typeof extractRelevantProductInfo>
      >();
      for (const product of fetchedProducts) {
        const sanitized = extractRelevantProductInfo(product);
        if (!sanitized) continue;
        const key =
          typeof sanitized._id === "string"
            ? sanitized._id
            : typeof sanitized.slug === "string"
              ? sanitized.slug
              : undefined;
        if (key) {
          fetchedSanitized.set(key, sanitized);
        }
      }

      const sanitizedCart = await Promise.all(
        cartItems.map(async (item) => {
          const productId =
            typeof item.productId === "string" ? item.productId : undefined;
          const direct = extractRelevantProductInfo(item.product);
          const fallback =
            (productId && preSanitized.get(productId)) ||
            (productId && fetchedSanitized.get(productId)) ||
            null;
          const product = direct ?? fallback ?? null;

          const quantity =
            typeof item.quantity === "number" && Number.isFinite(item.quantity)
              ? item.quantity
              : 0;
          const sanitizedSizes =
            product && typeof product === "object"
              ? ((product as Record<string, unknown>).sizes as
                  | SanitizedSize[]
                  | undefined)
              : undefined;

          const matchedSize =
            sanitizedSizes?.find(
              (size) =>
                typeof size === "object" &&
                size !== null &&
                typeof size.id === "string" &&
                size.id === item.sizeId
            ) ?? sanitizedSizes?.[0];

          const displayPrice =
            matchedSize && typeof matchedSize.price === "number"
              ? matchedSize.price
              : undefined;
          const currency =
            matchedSize && typeof matchedSize.currency === "string"
              ? matchedSize.currency
              : undefined;
          const sizeLabel =
            matchedSize && typeof matchedSize.label === "string"
              ? matchedSize.label
              : undefined;

          const productName =
            product && typeof product === "object"
              ? typeof (product as Record<string, unknown>).name === "string"
                ? ((product as Record<string, unknown>).name as string)
                : typeof (product as Record<string, unknown>).slug === "string"
                  ? ((product as Record<string, unknown>).slug as string)
                  : undefined
              : undefined;

          const lineTotal =
            typeof displayPrice === "number" && quantity > 0
              ? displayPrice * quantity
              : undefined;

          return {
            ...item,
            product,
            productName,
            sizeLabel,
            price: displayPrice,
            currency,
            lineTotal,
          };
        })
      );

      return {
        ...userCart,
        cart: sanitizedCart,
      };
    },
  },
  {
    name: "getProduct",
    description:
      "Retrieves a single product by its slug (URL-friendly identifier).",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string" },
      },
      required: ["slug"],
      additionalProperties: false,
    },
    schema: z
      .object({
        slug: z.string(),
      })
      .strict(),
    handler: async (rawInput) => {
      const input = z.object({ slug: z.string() }).parse(rawInput);
      const apiModule = await ensureApi();
      const result = await fetchQuery(apiModule.products.getProduct, {
        slug: input.slug,
      });

      if (!result) {
        return result;
      }

      const sanitized = extractRelevantProductInfo(result);
      if (!sanitized) {
        return result;
      }

      return {
        ...result,
        ...sanitized,
      };
    },
  },
  {
    name: "updateCartQuantity",
    description:
      "Updates the quantity of a specific cart item after validating stock availability.",
    parameters: {
      type: "object",
      properties: {
        cartId: { type: "string" },
        quantity: { type: "integer", minimum: 1 },
      },
      required: ["cartId", "quantity"],
      additionalProperties: false,
    },
    schema: z
      .object({
        cartId: z.string(),
        quantity: z.number().min(1),
      })
      .strict(),
    handler: async (rawInput) => {
      const input = z
        .object({
          cartId: z.string(),
          quantity: z.number().min(1),
        })
        .parse(rawInput);
      const apiModule = await ensureApi();
      return fetchMutation(apiModule.cart.updateCartQuantity, {
        cartId: input.cartId as Id<"carts">,
        quantity: input.quantity,
      });
    },
  },
  {
    name: "removeFromCart",
    description: "Removes a specific item from the user's cart by cart ID.",
    parameters: {
      type: "object",
      properties: {
        cartId: { type: "string" },
      },
      required: ["cartId"],
      additionalProperties: false,
    },
    schema: z
      .object({
        cartId: z.string(),
      })
      .strict(),
    handler: async (rawInput) => {
      const input = z
        .object({
          cartId: z.string(),
        })
        .parse(rawInput);
      const apiModule = await ensureApi();
      return fetchMutation(apiModule.cart.removeFromCart, {
        cartId: input.cartId as Id<"carts">,
      });
    },
  },
  {
    name: "clearCart",
    description: "Removes all items from a user's cart.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    schema: z.object({}).strict(),
    handler: async () => {
      const apiModule = await ensureApi();
      return fetchMutation(apiModule.cart.clearCart, {});
    },
  },
  {
    name: "getSkinProfile",
    description:
      "Fetch the signed-in user's saved skin profile (skin type, concerns, ingredient sensitivities). Call this when the user asks about their skin profile (skin type, concerns, ingredient sensitivities).",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    schema: z.object({}).strict(),
    handler: async () => {
      const apiModule = await ensureApi();
      try {
        const response = await fetchQuery(apiModule.users.getUser, {});
        const userRecord = response?.success
          ? (response.user as unknown)
          : null;
        const skinProfile =
          userRecord &&
          typeof userRecord === "object" &&
          "skinProfile" in userRecord &&
          userRecord.skinProfile &&
          typeof (userRecord as Record<string, unknown>).skinProfile ===
            "object"
            ? ((userRecord as Record<string, unknown>).skinProfile as Record<
                string,
                unknown
              >)
            : null;

        if (!skinProfile) {
          return {
            success: false,
            skinProfile: null,
            quizCallToAction:
              "We haven't saved your skin profile yet. SkinBuddy can walk you through a quick quiz to discover it whenever you're ready.",
          };
        }

        const toStringArray = (value: unknown): string[] | undefined =>
          Array.isArray(value)
            ? value
                .map((entry) =>
                  typeof entry === "string" && entry.trim().length
                    ? entry.trim().toLowerCase()
                    : null
                )
                .filter((entry): entry is string => entry !== null)
            : undefined;

        // Smart Cycle Analysis
        let cycleAnalysis: string | undefined;
        if (skinProfile.cycle && typeof skinProfile.cycle === "object") {
          const cycle = skinProfile.cycle as { lastPeriodStart: number; avgCycleLength?: number };
          const lastStart = cycle.lastPeriodStart;
          if (lastStart) {
            const now = Date.now();
            const daysSince = Math.floor((now - lastStart) / (1000 * 60 * 60 * 24));
            const cycleLength = cycle.avgCycleLength ?? 28;
            const isEstimated = !cycle.avgCycleLength;
            
            let phase = "";
            let risk = "";
            
            if (daysSince < 0) {
              phase = "Future date (invalid)";
            } else if (daysSince <= 5) {
              phase = "Menstrual Phase (Days 1-5)";
              risk = "Skin likely sensitive/dry. Hydration is key.";
            } else if (daysSince <= 14) {
              phase = "Follicular Phase (Days 6-14)";
              risk = "Estrogen rising; skin usually at its best.";
            } else if (daysSince <= cycleLength) {
              phase = "Luteal Phase (Pre-menstrual)";
              risk = "Progesterone rising. HIGH RISK of hormonal breakouts (chin/jawline). Oil production increases.";
            } else {
              phase = "Late / Irregular / Data Stale";
              risk = "Cycle is overdue or data is old. Please update last period date.";
            }

            // Only predict next period if data is recent (< 60 days)
            let nextPeriodInfo = "";
            if (daysSince < 60) {
              const nextPeriodDate = new Date(lastStart + (cycleLength * 24 * 60 * 60 * 1000));
              const nextPeriodStr = nextPeriodDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              nextPeriodInfo = `\n            Next Period Estimate: ~${nextPeriodStr}.`;
            } else {
               nextPeriodInfo = "\n            Next Period Estimate: Unknown (please update last period date).";
            }
            
            cycleAnalysis = `Cycle Day ${daysSince + 1} of ${cycleLength}${isEstimated ? " (estimated)" : ""}. 
            Current Phase: ${phase}. 
            Skin Insight: ${risk}${nextPeriodInfo}
            (Note: Predictions are estimates based on ${cycleLength}-day cycle.)`;
          }
        }

        const normalizedProfile = {
          skinType:
            typeof skinProfile.skinType === "string"
              ? skinProfile.skinType
              : undefined,
          skinConcerns: toStringArray(skinProfile.skinConcerns),
          ingredientSensitivities: toStringArray(
            skinProfile.ingredientSensitivities
          ),
          history: typeof skinProfile.history === "string" ? skinProfile.history : undefined,
          cycleAnalysis, // Injected analysis for the LLM
          updatedAt:
            typeof skinProfile.updatedAt === "number"
              ? skinProfile.updatedAt
              : undefined,
        };

        return {
          success: true,
          skinProfile: normalizedProfile,
        };
      } catch (error) {
        return {
          success: false,
          skinProfile: null,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load skin profile",
        };
      }
    },
  },
  // {
  //   name: "getAllProducts",
  //   description: "Retrieves all products with optional filtering and sorting.",
  //   parameters: {
  //     type: "object",
  //     properties: {
  //       filters: productFiltersParameters,
  //       sort: {
  //         type: "string",
  //         enum: ["trending", "latest"],
  //       },
  //     },
  //     additionalProperties: false,
  //   },
  //   schema: z
  //     .object({
  //       filters: productFiltersSchema,
  //       sort: z.enum(["trending", "latest"]).optional(),
  //     })
  //     .strict(),
  //   handler: async (rawInput) => {
  //     const input = z
  //       .object({
  //         filters: productFiltersSchema,
  //         sort: z.enum(["trending", "latest"]).optional(),
  //       })
  //       .parse(rawInput);
  //     const apiModule = await ensureApi();
  //     const filters =
  //       input.filters && typeof input.filters === "object"
  //         ? {
  //             ...input.filters,
  //             skinTypes: Array.isArray(input.filters.skinTypes)
  //               ? input.filters.skinTypes
  //                   .map((value) => resolveSkinType(String(value)))
  //                   .filter((value): value is SkinTypeCanonical =>
  //                     Boolean(value)
  //                   )
  //               : input.filters.skinTypes,
  //           }
  //         : undefined;
  //     const response = await fetchQuery(apiModule.products.getAllProducts, {
  //       filters,
  //       sort: input.sort,
  //     });

  //     return {
  //       ...response,
  //       products: Array.isArray(response?.products)
  //         ? response.products
  //             .map((product: unknown) => extractRelevantProductInfo(product))
  //             .filter((product): product is SanitizedProduct =>
  //               Boolean(product)
  //             )
  //         : [],
  //     };
  //   },
  // },
  {
    name: "startSkinTypeSurvey",
    description:
      "Trigger the SkinBuddy skin-type survey experience for the current user (no arguments).",
    parameters: startSkinTypeSurveyParameters,
    schema: startSkinTypeSurveySchema,
    handler: async () => {
      return { acknowledged: true };
    },
  },
  {
    name: "saveUserProfile",
    description:
      "IMMEDIATELY call this tool whenever the user mentions or updates their skin type, skin concerns (e.g. 'I have acne'), or ingredient sensitivities. Do NOT just acknowledge the change in text; you MUST persist it using this tool. This is critical for personalizing future recommendations.",
    parameters: saveUserProfileParameters,
    schema: saveUserProfileSchema,
    handler: async (rawInput) => {
      const input = saveUserProfileSchema.parse(rawInput);

      const normalizeString = (value: unknown): string | null => {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
      };

      const toUniqueList = (...sources: Array<unknown>): string[] => {
        const unique = new Set<string>();
        sources.forEach((source) => {
          if (Array.isArray(source)) {
            source.forEach((entry) => {
              const normalized = normalizeString(entry);
              if (!normalized) return;
              unique.add(normalized.toLowerCase());
            });
          } else {
            const normalized = normalizeString(source);
            if (!normalized) return;
            unique.add(normalized.toLowerCase());
          }
        });
        return Array.from(unique);
      };

      const skinType = (() => {
        const normalized = normalizeString(input.skinType);
        if (!normalized) return undefined;
        const resolved = resolveSkinType(normalized);
        return (resolved ?? normalized).toLowerCase();
      })();

      const skinConcernsRaw = toUniqueList(
        input.skinConcerns,
        input.skinConcern
      );
      const skinConcerns = skinConcernsRaw.length
        ? skinConcernsRaw.map((concern) => {
            const resolved = resolveSkinConcern(concern);
            return (resolved ?? concern).toLowerCase();
          })
        : undefined;

      const ingredientSensitivitiesRaw = toUniqueList(
        input.ingredientSensitivities,
        input.ingredientSensitivity
      );
      const ingredientSensitivities = ingredientSensitivitiesRaw.length
        ? ingredientSensitivitiesRaw
        : undefined;

      const history = normalizeString(input.history) || undefined;

      // Process cycle data
      let cycle: { lastPeriodStart: number; avgCycleLength?: number } | undefined;
      if (input.lastPeriodDate) {
        const date = new Date(input.lastPeriodDate);
        if (!isNaN(date.getTime())) {
          cycle = {
            lastPeriodStart: date.getTime(),
            avgCycleLength: input.avgCycleLength,
          };
        }
      }

      const apiModule = await ensureApi();
      return fetchMutation(apiModule.users.saveSkinProfile, {
        ...(typeof skinType === "string" ? { skinType } : {}),
        ...(skinConcerns ? { skinConcerns } : {}),
        ...(ingredientSensitivities ? { ingredientSensitivities } : {}),
        ...(history ? { history } : {}),
        ...(cycle ? { cycle } : {}),
      });
    },
  },
];

export const toolSpecs = localTools.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

export function getToolByName(name: string): ToolSpec | undefined {
  return localTools.find((tool) => tool.name === name);
}
