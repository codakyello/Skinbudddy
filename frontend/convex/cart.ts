import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

//  carts: defineTable({
//     userId: v.string(),
//     productId: v.id("products"),
//     quantity: v.number(),
//     createdAt: v.number(),
//   }),

// Create or update cart item
export const createCart = mutation({
  args: {
    userId: v.string(),
    productId: v.id("products"),
    quantity: v.number(),
  },
  handler: async (ctx, { userId, productId, quantity }) => {
    // Check if item already exists in cart
    const existingCartItem = await ctx.db
      .query("carts")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("productId"), productId)
        )
      )
      .first();

    if (existingCartItem) {
      // Update existing cart item quantity
      await ctx.db.patch(existingCartItem._id, {
        quantity: existingCartItem.quantity + quantity,
      });
      return existingCartItem._id;
    } else {
      // Create new cart item
      const cartId = await ctx.db.insert("carts", {
        userId,
        productId,
        quantity,
        createdAt: Date.now(),
      });

      //   if (!cartId) throw new Error("Cart could not be created");
      return cartId;
    }
  },
});

// Get user's cart with product details
export const getUserCart = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, { userId }) => {
    // Get all cart items for the user
    const cartItems = await ctx.db
      .query("carts")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    // Get product details for each cart item
    const cartWithProducts = await Promise.all(
      cartItems.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        return {
          ...item,
          product,
        };
      })
    );

    return cartWithProducts;
  },
});

// Bonus: Update cart item quantity
export const updateCartQuantity = mutation({
  args: {
    cartId: v.id("carts"),
    quantity: v.number(),
  },
  handler: async (ctx, { cartId, quantity }) => {
    if (quantity <= 0) {
      // Remove item if quantity is 0 or negative
      await ctx.db.delete(cartId);
      return null;
    } else {
      // Update quantity
      await ctx.db.patch(cartId, { quantity });
      return cartId;
    }
  },
});

// Bonus: Remove item from cart
export const removeFromCart = mutation({
  args: {
    cartId: v.id("carts"),
  },
  handler: async (ctx, { cartId }) => {
    await ctx.db.delete(cartId);
  },
});

// Bonus: Clear entire cart for user
export const clearCart = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const cartItems = await ctx.db
      .query("carts")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    await Promise.all(cartItems.map((item) => ctx.db.delete(item._id)));
  },
});
