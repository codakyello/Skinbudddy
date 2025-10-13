import z from "zod";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  resolveSkinConcern,
  resolveSkinType,
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
        "User-stated product category (e.g. 'cleanser', 'sunscreen'); prefer specific taxonomy when available."
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
    ingredientQueries: z
      .array(z.string())
      .optional()
      .describe(
        "Specific ingredients to include, e.g. ['hyaluronic acid', 'niacinamide', 'retinol', 'salicylic acid']"
      ),
    limit: z.number().int().min(1).max(100).optional(),
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
    ingredientQueries: {
      type: "array",
      items: { type: "string" },
      description:
        "Specific ingredient filters requested by the user (retinol, niacinamide, salicylic acid, etc.).",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 100,
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
};

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

  return {
    _id: _id ?? (slug as string),
    slug,
    name: typeof raw.name === "string" ? raw.name : undefined,
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    images,
    sizes,
    brand,
  };
};

const localTools: ToolSpec[] = [
  {
    name: "searchProductsByQuery",
    description:
      "List products using free-text queries for category, brand, or name. Resolves fuzzy text to exact DB slugs and returns matching products.",
    parameters: searchProductsParameters,
    schema: searchProductsSchema,
    handler: async (rawInput) => {
      const input = searchProductsSchema.parse(rawInput);
      const apiModule = await ensureApi();

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
          ingredientQueries: cleanedIngredientQueries,
          limit: input.limit,
        }
      );

      if (!response?.success) {
        throw new Error(
          response?.reason ?? "searchProductsByQuery returned no results"
        );
      }

      return {
        ...response,
        products: Array.isArray(response.products)
          ? response.products
              .map((product) => {
                const info = extractRelevantProductInfo(product);
                if (!info) return null;
                const score =
                  typeof (product as Record<string, unknown>).score === "number"
                    ? ((product as Record<string, unknown>).score as number)
                    : undefined;
                return score != null ? { ...info, score } : info;
              })
              .filter((product): product is SanitizedProduct =>
                Boolean(product)
              )
          : [],
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
  {
    name: "getAllProducts",
    description: "Retrieves all products with optional filtering and sorting.",
    parameters: {
      type: "object",
      properties: {
        filters: productFiltersParameters,
        sort: {
          type: "string",
          enum: ["trending", "latest"],
        },
      },
      additionalProperties: false,
    },
    schema: z
      .object({
        filters: productFiltersSchema,
        sort: z.enum(["trending", "latest"]).optional(),
      })
      .strict(),
    handler: async (rawInput) => {
      const input = z
        .object({
          filters: productFiltersSchema,
          sort: z.enum(["trending", "latest"]).optional(),
        })
        .parse(rawInput);
      const apiModule = await ensureApi();
      const filters =
        input.filters && typeof input.filters === "object"
          ? {
              ...input.filters,
              skinTypes: Array.isArray(input.filters.skinTypes)
                ? input.filters.skinTypes
                    .map((value) => resolveSkinType(String(value)))
                    .filter((value): value is SkinTypeCanonical =>
                      Boolean(value)
                    )
                : input.filters.skinTypes,
            }
          : undefined;
      const response = await fetchQuery(apiModule.products.getAllProducts, {
        filters,
        sort: input.sort,
      });

      return {
        ...response,
        products: Array.isArray(response?.products)
          ? response.products
              .map((product: unknown) => extractRelevantProductInfo(product))
              .filter((product): product is SanitizedProduct =>
                Boolean(product)
              )
          : [],
      };
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
