import { v } from "convex/values";
import { query } from "./_generated/server";

export const getAllProducts = query({
  args: {
    filters: v.optional(
      v.object({
        isBestseller: v.optional(v.boolean()),
        discount: v.optional(v.number()),
        isTrending: v.optional(v.boolean()),
        isNew: v.optional(v.boolean()),
        brand: v.optional(v.string()),
      })
    ),

    sort: v.optional(v.string()),

    page: v.optional(v.number()),

    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const filters = args.filters;
    const sort = args.sort;

    let products = await ctx.db.query("products").collect();

    console.log(filters, sort, "These are filters and sort from backend");

    // 🧪 Apply Filters
    if (filters) {
      const { isBestseller, isNew, isTrending, discount, brand } = filters;

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

      if (brand) {
        // Optionally, find brand ID by name if needed
        const brandDocs = await ctx.db
          .query("brands")
          .filter((q) => q.eq(q.field("name"), brand))
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

    return products;
  },
});

// function add({ num1, num2 }: { num1: number; num2: number }) {
//   console.log(num1, num2);
// }

// add({ num1: 2, num2: 3 });
