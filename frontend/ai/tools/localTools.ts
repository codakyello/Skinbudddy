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
    nameQuery: z.string().optional(),
    categoryQuery: z.string().optional(),
    brandQuery: z.string().optional(),
    skinTypes: z.array(z.string()).optional(),
    skinConcerns: z.array(z.string()).optional(),
    ingredientQueries: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const searchProductsParameters = {
  type: "object",
  properties: {
    nameQuery: { type: "string" },
    categoryQuery: { type: "string" },
    brandQuery: { type: "string" },
    skinTypes: {
      type: "array",
      items: { type: "string" },
    },
    skinConcerns: {
      type: "array",
      items: { type: "string" },
    },
    ingredientQueries: {
      type: "array",
      items: { type: "string" },
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

      const response = await fetchQuery(apiModule.products.searchProductsByQuery, {
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
      });

      if (!response?.success) {
        throw new Error(
          response?.reason ?? "searchProductsByQuery returned no results"
        );
      }

      return response;
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
      return fetchQuery(apiModule.cart.getUserCart, {
        userId: input.userId,
      });
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
                    .filter((value): value is SkinTypeCanonical => Boolean(value))
                : input.filters.skinTypes,
            }
          : undefined;
      return fetchQuery(apiModule.products.getAllProducts, {
        filters,
        sort: input.sort,
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
