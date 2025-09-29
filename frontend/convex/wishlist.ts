import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Create (or idempotently ensure) a wishlist entry for a user & product.
 * Returns the wishlist document id.
 **/
export const createWishList = mutation({
  args: { userId: v.string(), productId: v.id("products") },
  handler: async (ctx, { userId, productId }) => {
    // Check if it already exists (idempotent)
    const existing = await ctx.db
      .query("wishlists")
      .withIndex("by_user_product", (q) =>
        q.eq("userId", userId).eq("productId", productId)
      )
      .first();

    if (existing) return existing._id;

    const _id = await ctx.db.insert("wishlists", {
      userId,
      productId,
      createdAt: Date.now(),
    });
    return _id;
  },
});

/**
 * Delete a wishlist entry for a given user & product.
 * Returns true if something was deleted, false otherwise.
 */
export const deleteWishList = mutation({
  args: { userId: v.string(), productId: v.id("products") },
  handler: async (ctx, { userId, productId }) => {
    const existing = await ctx.db
      .query("wishlists")
      .withIndex("by_user_product", (q) =>
        q.eq("userId", userId).eq("productId", productId)
      )
      .first();

    if (!existing)
      return { success: false, message: "Wishlist with this Id dosent exist" };

    await ctx.db.delete(existing._id);
    return true;
  },
});

/**
 * Get all wishlist entries for a user. Includes basic product details for convenience.
 */
export const getUserWishLists = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const items = await ctx.db
      .query("wishlists")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Load products for each wishlist item
    const results = await Promise.all(
      items.map(async (w) => {
        const product = await ctx.db.get(w.productId);
        return {
          _id: w._id,
          userId: w.userId,
          productId: w.productId,
          createdAt: w.createdAt,
          product, // may be null if the product was deleted
        };
      })
    );

    return results;
  },
});
