import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { slugify } from "./_utils/slug";
// import { captureSentryError } from "./_utils/sentry";

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
    try {
      // const user = await ctx.auth.getUserIdentity();
      // console.log(user, "This is userId");
      // if (!user) {
      //   throw new Error("User is not authenticated");
      // }
      const brands = await ctx.db.query("brands").collect();
      return brands;
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

export const getAllBrandProducts = query({
  args: {
    brandSlug: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    try {
      let brand;
      if (args.brandSlug) {
        brand = await ctx.db
          .query("brands")
          .withIndex("by_slug", (q) => q.eq("slug", args.brandSlug!))
          .unique();
      } else if (args.brandId) {
        brand = await ctx.db.get(args.brandId);
      }

      if (!brand) {
        return [];
      }

      const products = await ctx.db
        .query("products")
        .filter((q) => q.eq(q.field("brandId"), brand._id))
        .collect();

      return products;
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

export const createBrand = mutation({
  args: {
    name: v.string(),
    logoUrl: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const now = Date.now();
      const slug = slugify(args.name);
      return await ctx.db.insert("brands", {
        name: args.name,
        slug,
        logoUrl: args.logoUrl,
        description: args.description,
        createdAt: now,
      });
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

export const editBrand = mutation({
  args: {
    id: v.id("brands"),
    name: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const { id, name, logoUrl, description } = args;
      const updatedFields: Record<string, any> = { ...args };

      if (name !== undefined) {
        updatedFields.name = name;
        updatedFields.slug = slugify(name);
      }

      await ctx.db.patch(id, updatedFields);
      return ctx.db.get(id);
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

export const deleteBrand = mutation({
  args: {
    id: v.id("brands"),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.db.delete(args.id);
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});
