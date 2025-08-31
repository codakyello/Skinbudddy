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
    productId: v.id("products") || v.string(),
    quantity: v.number(),
    sizeId: v.optional(v.string()),
  },
  handler: async (ctx, { userId, productId, quantity, sizeId }) => {
    // Check if item already exists in cart
    const existingCartItem = await ctx.db
      .query("carts")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("productId"), productId),
          q.eq(q.field("sizeId"), sizeId)
        )
      )
      .first();

    const product = await ctx.db.get(productId);

    const size = product?.sizes?.find((s) => s.id === sizeId);

    if (!size) throw new Error("Size not found");

    if (existingCartItem) {
      if (size?.stock >= quantity)
        if (quantity > existingCartItem.quantity) {
          await ctx.db.patch(existingCartItem._id, {
            quantity,
          });
        } else {
          if (existingCartItem.quantity + quantity <= size.stock)
            await ctx.db.patch(existingCartItem._id, {
              quantity: existingCartItem.quantity + quantity,
            });
        }
    } else {
      const cartId = await ctx.db.insert("carts", {
        userId,
        sizeId,
        productId,
        quantity,
        createdAt: Date.now(),
      });

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

    cartItems.sort((a, b) => b.createdAt - a.createdAt);

    // Get product details for each cart item
    const cartWithProducts = await Promise.all(
      cartItems.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        const size =
          product?.sizes?.find((size) => size.id === item.sizeId) || null;
        const price = (size?.price || 0) - (size?.discount || 0);
        return {
          ...item,
          product: {
            ...product,
            originalPrice: size?.price,
            price,
            size: size?.size,
            unit: size?.unit,
            stock: size?.stock,
          },
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
    const cart = await ctx.db.get(cartId);
    if (!cart) throw new Error("Cart item not found");

    const product = await ctx.db.get(cart.productId);
    if (!product) throw new Error("Product not found");

    const size = product.sizes?.find((s) => s.id === cart.sizeId);
    if (!size) throw new Error("Size not found");

    if (quantity <= 0) {
      // Remove item if quantity is zero
      await ctx.db.delete(cartId);
      return { removed: true, cartId };
    }

    if (quantity > size.stock) {
      throw new Error(`Only ${size.stock} left in stock`);
    }

    await ctx.db.patch(cartId, { quantity });

    return cart._id;
  },
});
// Bonus: Remove item from cart
export const removeFromCart = mutation({
  args: {
    cartId: v.id("carts"),
  },
  handler: async (ctx, { cartId }) => {
    const cart = await ctx.db.get(cartId);
    if (!cart) {
      throw new Error("Cart not found");
    }
    await ctx.db.delete(cartId);
    return { removed: true, cartId };
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
