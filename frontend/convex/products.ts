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

    sort: v.optional(
      v.object({
        field: v.optional(v.string()),
        order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
      })
    ),

    page: v.optional(v.number()),

    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("products");

    // for brands
    // get the id of the brand from the brand name
    // return only the products that match the brandId
    // 1) Bestseller
    if (args.filters) {
      const { isBestseller, brand, isNew, isTrending, discount } = args.filters;

      if (isBestseller) {
        // get best seller products
        const allProducts = await query.collect();
        // const searchTitle = title.toLowerCase()
        const bestseller = allProducts.filter(
          (products) => products.isBestseller
        );

        return bestseller;
      }

      if (isNew) {
        // get new products
      }
      if (isTrending) {
        // get trending products
      }

      if (discount) {
        // get discount products
      }

      if (brand) {
        // get the products
        // populate with the brand
        // filter the brand
      }
    }
    const products = await ctx.db.query("products").collect();

    return products;
  },
});

// function add({ num1, num2 }: { num1: number; num2: number }) {
//   console.log(num1, num2);
// }

// add({ num1: 2, num2: 3 });
