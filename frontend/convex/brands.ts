import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// export const addProduct = mutation(
//   async ({ db }, product: { name: string; price: number }) => {
//     const now = Date.now();
//     return await db.insert(products, {
//       name: product.name,
//       price: product.price,
//       createdAt: now,
//     });
//   }
// );

export const getAllBrands = query({
  args: {},
  handler: async (ctx, args) => {
    // const user = await ctx.auth.getUserIdentity();
    // console.log(user, "This is userId");
    // if (!user) {
    //   throw new Error("User is not authenticated");
    // }
    const brands = await ctx.db.query("brands").collect();
    return brands;
  },
});
