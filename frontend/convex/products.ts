import { v } from "convex/values";
import { query } from "./_generated/server";
// import { captureSentryError } from "./_utils/sentry";

export const getAllProducts = query({
  args: {
    filters: v.optional(
      v.object({
        isBestseller: v.optional(v.boolean()),
        discount: v.optional(v.number()),
        isTrending: v.optional(v.boolean()),
        isNew: v.optional(v.boolean()),
        brandSlug: v.optional(v.string()),
      })
    ),
    limit: v.optional(v.number()),

    sort: v.optional(v.string()),

    page: v.optional(v.number()),

    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // lets add a 5 seconds delay here
      // await wait(5)

      const filters = args.filters;
      const sort = args.sort;

      let products = await ctx.db.query("products").collect();

      // 🧪 Apply Filters
      if (filters) {
        const { isBestseller, isNew, isTrending, discount, brandSlug } =
          filters;

        if (isBestseller) {
          products = products.filter((p) => p.isBestseller);
        }

        if (isNew) {
          products = products.filter((p) => p.isNew);
        }

        if (isTrending) {
          products = products.filter((p) => p.isTrending);
        }

        if (discount) {
          products = products.filter((p) => p.discount && p.discount > 0);
        }

        if (brandSlug) {
          // Optionally, find brand ID by name if needed
          const brandDocs = await ctx.db
            .query("brands")
            .filter((q) => q.eq(q.field("slug"), brandSlug))
            .collect();
          const brandId = brandDocs[0]?._id;
          if (brandId) {
            products = products.filter((p) => p.brandId === brandId);
          }
        }
      }

      // 🧪 Apply Sorting
      if (sort) {
        if (sort === "trending") {
          products.sort(
            (a, b) => (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0)
          );
        }

        if (sort === "latest") {
          products.sort((a, b) => b.createdAt - a.createdAt);
        }

        // if (sort === "rating") {
        //   // Add rating field to products if needed
        //   products.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        // }

        if (sort === "price-asc") {
          products.sort((a, b) => b.price - a.price);
        }

        if (sort === "price-desc") {
          products.sort((a, b) => a.price - b.price);
        }
      }

      // return products with sorted out sizes meaning small sizes should come before bigger sizes
      return products.map((item) => ({
        ...item,
        sizes: item.sizes?.sort((a, b) => a.size - b.size),
      }));
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});
