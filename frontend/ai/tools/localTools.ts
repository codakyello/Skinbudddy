import z from "zod";
import { fetchAction, fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  resolveSkinConcern,
  resolveSkinType,
  resolveIngredientGroup,
  type SkinConcernCanonical,
  type SkinTypeCanonical,
} from "../../shared/skinMappings";

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
        "Canonical skin types to filter by (e.g. ['oily','sensitive'])."
      ),
    skinConcerns: z
      .array(z.string())
      .optional()
      .describe(
        "Canonical skin concerns to target (e.g. ['acne','hyperpigmentation'])."
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
      .describe("Minimum discount percentage (inclusive)."),
    maxDiscount: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Maximum discount percentage (inclusive)."),
    minPrice: z
      .number()
      .positive()
      .optional()
      .describe(
        "Minimum price (inclusive) for qualifying product sizes, using the store currency."
      ),
    maxPrice: z
      .number()
      .positive()
      .optional()
      .describe(
        "Maximum price (inclusive) for qualifying product sizes, using the store currency."
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
      description: "Canonical skin types to filter by (oily, dry, sensitive).",
    },
    skinConcerns: {
      type: "array",
      items: { type: "string" },
      description:
        "Canonical skin concerns to focus on (acne, hyperpigmentation, redness, etc.).",
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
    userId: z
      .string()
      .optional()
      .describe(
        "User identifier for saving routines; use 'guest' if the user is anonymous."
      ),
    skinType: z
      .string()
      .min(1)
      .describe(
        "Canonical or user-provided skin type (oily, dry, combination, sensitive, balanced, etc.)."
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
      .min(1),
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
  })
  .strict();

const recommendRoutineParameters = {
  type: "object",
  properties: {
    userId: {
      type: "string",
      description:
        "User identifier for saving the routine; provide 'guest' if the user is anonymous.",
    },
    skinType: {
      type: "string",
      description:
        "Canonical skin type label (oily, dry, combination, sensitive, balanced, etc.).",
    },
    skinConcerns: {
      type: "array",
      items: { type: "string" },
      description:
        "List of key skin concerns the routine must address (acne, dark spots, redness, etc.).",
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
        "Set true to persist the generated routine for the user (requires authenticated userId).",
    },
    excludeProductIds: {
      type: "array",
      items: { type: "string" },
      description:
        "IDs or slugs for products that should be omitted from the result set (e.g. user rejected them).",
    },
  },
  required: ["skinType", "skinConcerns"],
  additionalProperties: false,
};

const startSkinTypeSurveySchema = z.object({}).strict();

const startSkinTypeSurveyParameters = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const ensureApi = async () => api;

type SanitizedSize = {
  id: string;
  size: number;
  unit: string;
  price: number;
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
          const sizeIdValue = sizeRecord.id ?? sizeRecord._id;
          const sizeId =
            typeof sizeIdValue === "string" ? sizeIdValue : undefined;
          if (!sizeId) return null;

          const sizeValue = toNumber(sizeRecord.size) ?? 0;
          const unit =
            typeof sizeRecord.unit === "string" ? sizeRecord.unit : "";
          const price = toNumber(sizeRecord.price) ?? 0;
          const discount = toNumber(sizeRecord.discount);
          const stock = toNumber(sizeRecord.stock);
          const currency =
            typeof sizeRecord.currency === "string"
              ? sizeRecord.currency
              : undefined;

          const sanitized: SanitizedSize = {
            id: sizeId,
            size: Number.isFinite(sizeValue) ? sizeValue : 0,
            unit,
            price: Number.isFinite(price) ? price : 0,
          };

          if (discount != null) sanitized.discount = discount;
          if (stock != null) sanitized.stock = stock;
          if (currency != null) sanitized.currency = currency;

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
    ? raw.ingredients
        .filter(
          (ingredient): ingredient is string => typeof ingredient === "string"
        )
        .slice(0, 2)
    : [];

  return {
    _id: _id ?? (slug as string),
    slug,
    name: typeof raw.name === "string" ? raw.name : undefined,
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    images,
    sizes,
    brand,
    categories: categories.length ? categories : undefined,
    ingredients: ingredients.length ? ingredients : undefined,
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

      const allowedSkinTypes = new Set<SkinTypeCanonical>([
        "normal",
        "oily",
        "dry",
        "combination",
        "sensitive",
        "mature",
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

      const canonicalSkinType = resolveCanonicalSkinType(input.skinType);
      if (!canonicalSkinType) {
        throw new Error(
          `Unsupported skin type "${input.skinType}". Provide a canonical type (oily, dry, combination, sensitive, mature, acne-prone, normal, all).`
        );
      }

      const concernSet = new Set<SkinConcernCanonical>();
      input.skinConcerns.forEach((concern) => {
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

      const ingredientsToAvoid = Array.isArray(input.ingredientsToAvoid)
        ? Array.from(
            new Set(
              input.ingredientsToAvoid
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
        userId: input.userId ?? "guest",
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

      const {
        canonical: canonicalSkinTypes,
        unresolved: unresolvedSkinTypeQueries,
      } = processValues<SkinTypeCanonical>(input.skinTypes, resolveSkinType);
      const {
        canonical: canonicalSkinConcerns,
        unresolved: unresolvedSkinConcernQueries,
      } = processValues<SkinConcernCanonical>(
        input.skinConcerns,
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

      const cleanedIngredientsToAvoid = Array.isArray(input.ingredientsToAvoid)
        ? Array.from(
            new Set(
              input.ingredientsToAvoid
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
        typeof input.isBestseller === "boolean" ? input.isBestseller : undefined;
      const isTrending =
        typeof input.isTrending === "boolean" ? input.isTrending : undefined;
      const isNew =
        typeof input.isNew === "boolean" ? input.isNew : undefined;

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
            .map((product) => {
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
            .filter((product): product is SanitizedProduct => Boolean(product))
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
      "Retrieves all cart items for a specific user, including product details, pricing, and stock availability.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string" },
      },
      required: ["userId"],
      additionalProperties: false,
    },
    schema: z
      .object({
        userId: z.string(),
      })
      .strict(),
    handler: async (rawInput) => {
      const input = z.object({ userId: z.string() }).parse(rawInput);
      const apiModule = await ensureApi();
      const userCart = await fetchQuery(apiModule.cart.getUserCart, {
        userId: input.userId,
      });

      const sanitizedCart = Array.isArray(userCart?.cart)
        ? userCart.cart.map((item: Record<string, unknown>) => ({
            ...item,
            product: extractRelevantProductInfo(item.product),
          }))
        : [];

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
    name: "addToCart",
    description:
      "Adds a product (with a specific size) to a user's cart, validating stock and merging per server rules.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string" },
        productId: { type: "string" },
        sizeId: { type: "string" },
        quantity: { type: "integer", minimum: 1 },
      },
      required: ["userId", "productId", "sizeId", "quantity"],
      additionalProperties: false,
    },
    schema: z
      .object({
        userId: z.string(),
        productId: z.string(),
        sizeId: z.string(),
        quantity: z.number().min(1),
      })
      .strict(),
    handler: async (rawInput) => {
      const input = z
        .object({
          userId: z.string(),
          productId: z.string(),
          sizeId: z.string(),
          quantity: z.number().min(1),
        })
        .parse(rawInput);
      const apiModule = await ensureApi();
      return fetchMutation(apiModule.cart.createCart, {
        userId: input.userId,
        productId: input.productId as Id<"products">,
        sizeId: input.sizeId,
        quantity: input.quantity,
      });
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
        userId: { type: "string" },
      },
      required: ["cartId", "quantity", "userId"],
      additionalProperties: false,
    },
    schema: z
      .object({
        cartId: z.string(),
        quantity: z.number().min(1),
        userId: z.string(),
      })
      .strict(),
    handler: async (rawInput) => {
      const input = z
        .object({
          cartId: z.string(),
          quantity: z.number().min(1),
          userId: z.string(),
        })
        .parse(rawInput);
      const apiModule = await ensureApi();
      return fetchMutation(apiModule.cart.updateCartQuantity, {
        cartId: input.cartId as Id<"carts">,
        quantity: input.quantity,
        userId: input.userId,
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
        userId: { type: "string" },
      },
      required: ["cartId", "userId"],
      additionalProperties: false,
    },
    schema: z
      .object({
        cartId: z.string(),
        userId: z.string(),
      })
      .strict(),
    handler: async (rawInput) => {
      const input = z
        .object({
          cartId: z.string(),
          userId: z.string(),
        })
        .parse(rawInput);
      const apiModule = await ensureApi();
      return fetchMutation(apiModule.cart.removeFromCart, {
        cartId: input.cartId as Id<"carts">,
        userId: input.userId,
      });
    },
  },
  {
    name: "clearCart",
    description: "Removes all items from a user's cart.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string" },
      },
      required: ["userId"],
      additionalProperties: false,
    },
    schema: z
      .object({
        userId: z.string(),
      })
      .strict(),
    handler: async (rawInput) => {
      const input = z.object({ userId: z.string() }).parse(rawInput);
      const apiModule = await ensureApi();
      return fetchMutation(apiModule.cart.clearCart, {
        userId: input.userId,
      });
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
