import z from "zod";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import type { Id } from "../../convex/_generated/dataModel";
type ApiModule = typeof import("../../convex/_generated/api");

type SearchProduct = {
  id: string;
  slug?: string;
  name?: string;
  brand?: unknown;
  categories?: unknown[];
  sizes?: Array<Record<string, unknown>>;
  score?: number;
};

let apiPromise: Promise<ApiModule["api"]> | null = null;

const getApi = async () => {
  if (!apiPromise) {
    const apiUrl = pathToFileURL(
      path.join(process.cwd(), "convex/_generated/api.js")
    );
    apiPromise = import(apiUrl.href).then((module) => module.api);
  }
  return apiPromise;
};

// content: JSON.stringify(result ?? {}),

const ok = (data: unknown) => ({
  success: true,
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({
        ...(typeof data === "object" && data !== null ? data : {}),
      }),
    },
  ],
});

const fail = (message: string, extra?: unknown) => ({
  success: false,
  isError: true,
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({
        error: true,
        message,
        ...(extra ? { extra } : {}),
      }),
    },
  ],
});

const bulkItemSchema = z.object({
  productId: z.string().describe("Product ID"),
  quantity: z.number().min(1).describe("Quantity (>=1)"),
  sizeId: z.string().describe("Size/variant ID"),
});

const productFiltersSchema = z
  .object({
    isBestseller: z.boolean().optional().describe("Filter: only bestsellers"),
    discount: z.number().optional().describe("Filter: discount > 0"),
    isTrending: z.boolean().optional().describe("Filter: trending"),
    isNew: z.boolean().optional().describe("Filter: new"),
    brandSlugs: z.array(z.string()).optional().describe("Filter by brand slug"),
    categorySlugs: z
      .array(z.string())
      .optional()
      .describe("Filter by category slug"),
  })
  .optional();

const brandProductsSchema = z
  .object({
    brandSlug: z.string().optional().describe("Brand slug (preferred)"),
    brandId: z.string().optional().describe("Brand ID"),
  })
  .refine((value) => value.brandSlug || value.brandId, {
    message: "Provide either brandSlug or brandId.",
  });

const searchProducts = async ({
  query,
  brandSlug,
  limit,
}: {
  query: string;
  brandSlug?: string;
  limit?: number;
}): Promise<{
  success: boolean;
  results: SearchProduct[];
  message?: string;
}> => {
  try {
    const api = await getApi();
    const response = await fetchQuery(api.products.searchProducts, {
      query,
      brandSlug,
      limit,
    });

    if (!response?.success) {
      return {
        success: false,
        results: [],
        message:
          (response as { message?: string })?.message ??
          "Product search returned no results.",
      };
    }

    const resultList = Array.isArray(response.results)
      ? (response.results as SearchProduct[])
      : [];

    return {
      success: true,
      results: resultList,
    };
  } catch (error) {
    return {
      success: false,
      results: [],
      message:
        (error as Error)?.message ?? "Unexpected error during product search",
    };
  }
};

export function registerTools(server: McpServer) {
  // lets extend this to name too, this is a better fuzzy search method

  // mcp: searchProductsByQuery
  // server.tool(
  //   "searchProductsByQuery",
  //   "First step for vague product requests. Fuzzy finds candidates by name/brand; returns sizes and score. Fuzzy search by natural-language query; returns best-matching products.",
  //   {
  //     query: z.string().describe(`e.g. "cerave moisturiser"`),
  //     brandSlug: z.string().optional().describe(`e.g. "cerave"`),
  //     limit: z.number().int().min(1).max(20).optional().default(8),
  //   },
  //   async ({ query, brandSlug, limit }) => {
  //     const { success, results, message } = await searchProducts({
  //       query,
  //       brandSlug,
  //       limit,
  //     });

  //     if (!success) {
  //       return fail(message ?? "Failed to search products");
  //     }

  //     return ok({ success: true, results });
  //   }
  // );

  // mcp: addToCartByQuery
  // server.tool(
  //   "addToCartByQuery",
  //   "Add by natural-language name; resolves product & size server-side.",
  //   {
  //     userId: z.string(),
  //     query: z.string().describe(`e.g. "cerave moisturiser"`),
  //     brandSlug: z.string().optional(),
  //     sizeLabel: z.string().optional().describe(`e.g. "89ml", "PM 52ml"`),
  //     quantity: z.number().int().min(1).optional().default(1),
  //   },
  //   async ({ userId, query, brandSlug, sizeLabel, quantity }) => {
  //     const api = await getApi();
  //     const { success, results, message } = await searchProducts({
  //       query,
  //       brandSlug,
  //     });

  //     if (!success) {
  //       return fail(message ?? "Failed to search products before add-to-cart");
  //     }

  //     if (!results.length) {
  //       return ok({ success: false, reason: "not_found" });
  //     }

  //     const [bestMatch, secondBest] = results;
  //     const bestScore =
  //       bestMatch && typeof bestMatch.score === "number" ? bestMatch.score : 0;
  //     const secondScore =
  //       secondBest && typeof secondBest.score === "number"
  //         ? secondBest.score
  //         : 0;

  //     if (results.length > 1 && bestScore - secondScore < 0.15) {
  //       return ok({
  //         success: false,
  //         reason: "ambiguous",
  //         options: results.slice(0, 5),
  //       });
  //     }
  //     const product = bestMatch as SearchProduct;

  //     const norm = (s: string) => s.toLowerCase().trim();
  //     let sizeId: string | undefined;
  //     const sizes = Array.isArray(product?.sizes) ? product.sizes : [];

  //     if (sizeLabel && sizes.length > 0) {
  //       sizeId = (sizes as Array<Record<string, any>>).find(
  //         (s) => norm((s.label ?? s.name ?? "") as string) === norm(sizeLabel)
  //       )?.id as string | undefined;
  //     }
  //     if (!sizeId && sizes.length === 1) {
  //       sizeId = (sizes[0] as Record<string, any>).id as string | undefined;
  //     }
  //     if (!sizeId) {
  //       return ok({
  //         success: false,
  //         reason: "need_size",
  //         product: { id: product.id, slug: product.slug, name: product.name },
  //         sizeOptions:
  //           sizes.map((s: any) => ({
  //             id: s.id,
  //             label: s.label ?? s.name,
  //           })) ?? [],
  //       });
  //     }

  //     const safeQuantity = quantity ?? 1;
  //     const addRes = await fetchMutation(api.cart.createCart, {
  //       userId,
  //       productId: product.id as Id<"products">,
  //       sizeId,
  //       quantity: safeQuantity,
  //     });
  //     return ok({
  //       success: Boolean(addRes?.success),
  //       added: { product: product.name, sizeId, quantity: safeQuantity },
  //       backend: addRes,
  //     });
  //   }
  // );

  server.tool(
    "searchProductsByQuery",
    "List products using free‑text queries for category, brand, or name. The tool resolves fuzzy text (e.g., 'moisturiser', 'face crem', 'cerave') to exact DB slugs, then lists products.",
    {
      nameQuery: z
        .string()
        .optional()
        .describe(
          "Free‑text product name or keywords, e.g. 'hydrating toner'."
        ),
      categoryQuery: z
        .string()
        .optional()
        .describe(
          "Free‑text category, e.g. 'moisturisers', 'face crem', 'sunscreen'"
        ),
      brandQuery: z
        .string()
        .optional()
        .describe("Free‑text brand, e.g. 'cerave', 'la roche'"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max items to return (default from backend)"),
    },
    async ({ nameQuery, categoryQuery, brandQuery, limit }) => {
      const api = await getApi();
      const response = await fetchQuery(api.products.searchProductsByQuery, {
        nameQuery,
        categoryQuery,
        brandQuery,
        limit,
      });

      if (!response?.success) {
        return ok({
          reason: response?.reason ?? "ambiguous_or_not_found",
          categoryOptions: response?.categoryOptions ?? [],
          brandOptions: response?.brandOptions ?? [],
        });
      }

      return ok({
        filters: response.filters,
        products: response.products,
      });
    }
  );

  server.tool(
    "getUserCart",
    "Retrieves all cart items for a specific user, including product details, pricing, size information, stock availability, and associated categories.",
    {
      userId: z.string().describe("The unique identifier of the user"),
    },
    async ({ userId }) => {
      try {
        const api = await getApi();
        const result = await fetchQuery(api.cart.getUserCart, {
          userId,
        });
        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to get user cart");
      }
    }
  );

  server.tool(
    "addToCart",
    "Adds a product (with a specific size) to a user's cart. Validates stock and merges with existing items per server rules.",
    {
      userId: z.string().describe("User ID"),
      productId: z.string().describe("Product ID"),
      sizeId: z.string().describe("Product size/variant ID"),
      quantity: z.number().min(1).describe("Desired quantity (>=1)"),
    },
    async ({ userId, productId, sizeId, quantity }) => {
      try {
        const api = await getApi();
        const result = await fetchMutation(api.cart.createCart, {
          userId,
          productId: productId as Id<"products">,
          sizeId,
          quantity,
        });

        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to add to cart");
      }
    }
  );

  server.tool(
    "updateCartQuantity",
    "Updates the quantity of a specific cart item. Validates stock availability before updating.",
    {
      cartId: z.string().describe("Cart item ID"),
      quantity: z.number().min(1).describe("New quantity (>=1)"),
      userId: z.string().describe("User ID"),
    },
    async ({ cartId, quantity, userId }) => {
      try {
        const api = await getApi();
        const result = await fetchMutation(api.cart.updateCartQuantity, {
          cartId: cartId as Id<"carts">,
          quantity,
          userId,
        });
        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to update cart quantity");
      }
    }
  );

  server.tool(
    "removeFromCart",
    "Removes a specific item from the user's cart by its cart ID.",
    {
      cartId: z.string().describe("Cart item ID"),
      userId: z.string().describe("User ID"),
    },
    async ({ cartId, userId }) => {
      try {
        const api = await getApi();
        const result = await fetchMutation(api.cart.removeFromCart, {
          cartId: cartId as Id<"carts">,
          userId,
        });
        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to remove from cart");
      }
    }
  );

  server.tool(
    "clearCart",
    "Removes all items from a user's cart.",
    {
      userId: z.string().describe("User ID"),
    },
    async ({ userId }) => {
      try {
        const api = await getApi();
        const result = await fetchMutation(api.cart.clearCart, {
          userId,
        });
        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to clear cart");
      }
    }
  );

  server.tool(
    "getAllProducts",
    "Retrieves all products with optional filtering and sorting.",
    {
      filters: productFiltersSchema,
      sort: z.enum(["trending", "latest"]).optional().describe("Sort order"),
    },
    async ({ filters, sort }) => {
      try {
        const api = await getApi();
        const result = await fetchQuery(api.products.getAllProducts, {
          filters,
          sort,
        });
        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to get products");
      }
    }
  );

  // server.tool(
  //   "listProductsByCategory",
  //   "List products by category using exact DB slugs (e.g., 'sunscreen', 'cleanser'). Prefer this over fuzzy search when category is explicit.",
  //   {
  //     categorySlugs: z.array(z.string()).min(1),
  //     brandSlugs: z.array(z.string()).optional(),
  //     limit: z.number().int().min(1).max(100).optional(),
  //   },
  //   async ({ categorySlugs, brandSlugs, limit }) => {
  //     const api = await getApi();
  //     const result = await fetchQuery(api.products.getAllProducts, {
  //       filters: { categorySlugs, brandSlugs },
  //       limit,
  //     });
  //     return ok(result);
  //   }
  // );

  server.tool(
    "getProduct",
    "Retrieves a single product by its slug (URL-friendly identifier).",
    {
      slug: z.string().describe("Product slug"),
    },
    async ({ slug }) => {
      try {
        const api = await getApi();
        const result = await fetchQuery(api.products.getProduct, {
          slug,
        });
        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to get product");
      }
    }
  );

  server.tool(
    "getUserRoutines",
    "Retrieves all skincare/beauty routines created by a specific user.",
    {
      userId: z.string().describe("User ID"),
    },
    async ({ userId }) => {
      try {
        const api = await getApi();
        const result = await fetchQuery(api.routine.getUserRoutines, {
          userId,
        });
        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to get user routines");
      }
    }
  );

  server.tool(
    "getUserRoutine",
    "Retrieves a specific routine by its ID with full details including populated product information.",
    {
      routineId: z.string().describe("Routine ID"),
      userId: z.string().describe("User ID (authorization)"),
    },
    async ({ routineId, userId }) => {
      try {
        const api = await getApi();
        const result = await fetchQuery(api.routine.getUserRoutine, {
          routineId: routineId as Id<"routines">,
          userId,
        });
        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to get routine");
      }
    }
  );

  server.tool(
    "getAllBrands",
    "Retrieves a complete list of all skincare brands available in the database.",
    {},
    async () => {
      try {
        const api = await getApi();
        const result = await fetchQuery(api.brands.getAllBrands);
        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to get brands");
      }
    }
  );

  server.tool(
    "getAllBrandProducts",
    "Retrieves all products from a specific brand (by slug or ID).",
    {
      brandSlug: z.string().optional().describe("Brand slug (preferred)"),
      brandId: z.string().optional().describe("Brand ID"),
    },
    async ({ brandSlug, brandId }) => {
      const validation = brandProductsSchema.safeParse({ brandSlug, brandId });
      if (!validation.success) {
        return fail(
          validation.error.issues.map((issue) => issue.message).join(", ")
        );
      }

      try {
        const api = await getApi();
        const result = await fetchQuery(api.brands.getAllBrandProducts, {
          brandSlug: brandSlug ?? undefined,
          brandId: (brandId as Id<"brands">) ?? undefined,
        });
        return ok(result);
      } catch (e: unknown) {
        return fail((e as Error)?.message || "Failed to get brand products");
      }
    }
  );

  console.log("MCP tools registered");
}
