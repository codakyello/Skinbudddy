// import { captureSentryError } from "./_utils/sentry";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create or update cart item
export const createCart = mutation({
  args: {
    userId: v.string(),
    productId: v.id("products") || v.string(),
    quantity: v.number(),
    sizeId: v.optional(v.string()),
  },
  handler: async (ctx, { userId, productId, quantity, sizeId }) => {
    try {
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

      if (!product || !product.sizes) {
        throw new Error("Product or sizes not found");
      }

      const size = product?.sizes?.find((s) => s.id === sizeId);

      if (!size) throw new Error("Size not found");

      if (existingCartItem) {
        if (size?.stock >= quantity && size.stock >= 1)
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
        return { success: true, message: "Cart item updated", statusCode: 200 };
      } else {
        if (!size || size.stock < 1 || quantity > size.stock) {
          return {
            success: false,
            message: `Only ${size?.stock || 0} left in stock`,
            statusCode: 400,
          };
        }

        const cartId = await ctx.db.insert("carts", {
          userId,
          sizeId,
          productId,
          quantity,
          createdAt: Date.now(),
        });

        return {
          success: true,
          message: "Cart item created",
          statusCode: 201,
          cartId,
        };
      }
    } catch (error) {
      // captureSentryError(ctx, error, userId);
      throw error;
    }
  },
});

export const getUserCart = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    try {
      if (!userId) {
        return {
          success: false,
          message: "Missing userId",
          cart: [],
          statusCode: 400,
        };
      }

      const cartItems = await ctx.db
        .query("carts")
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();

      // if (!cartItems.length) {
      //   return { success: false, message: "Cart is empty", statusCode:400, cart: [] };
      // }

      cartItems.sort((a, b) => b.createdAt - a.createdAt);

      const cartWithProducts = await Promise.all(
        cartItems.map(async (item) => {
          const product = await ctx.db.get(item.productId);
          const size =
            product?.sizes?.find((s) => s.id === item.sizeId) || null;

          const price = (size?.price || 0) - (size?.discount || 0);

          return {
            ...item,
            product: product
              ? {
                  ...product,
                  originalPrice: size?.price,
                  price,
                  size: size?.size,
                  unit: size?.unit,
                  stock: size?.stock,
                }
              : null,
          };
        })
      );

      return { success: true, cart: cartWithProducts };
    } catch (error) {
      // captureSentryError(ctx, error, userId);
      throw error;
    }
  },
});

// Bonus: Update cart item quantity
export const updateCartQuantity = mutation({
  args: {
    cartId: v.id("carts"),
    quantity: v.number(),
  },
  handler: async (ctx, { cartId, quantity }) => {
    try {
      const cart = await ctx.db.get(cartId);
      if (!cart)
        return {
          success: false,
          message: "Cart item not found",
          statusCode: 404,
        };

      const product = await ctx.db.get(cart.productId);
      if (!product)
        return {
          success: false,
          message: "Product not found",
          statusCode: 404,
        };

      const size = product.sizes?.find((s) => s.id === cart.sizeId);
      if (!size)
        return { success: false, message: "Size not found", statusCode: 404 };

      if (quantity <= 0) {
        // Remove item if quantity is zero
        await ctx.db.delete(cartId);
        return { removed: true, cartId };
      }

      if (quantity > size.stock) {
        return {
          success: false,
          message: `Only ${size.stock} left in stock`,
          statusCode: 400,
        };
      }

      await ctx.db.patch(cartId, { quantity });

      return { success: true, cartId: cart._id };
    } catch (error) {
      // For updateCartQuantity, we don't have direct userId from args
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

// Bonus: Remove item from cart
export const removeFromCart = mutation({
  args: {
    cartId: v.id("carts"),
  },
  handler: async (ctx, { cartId }) => {
    try {
      const cart = await ctx.db.get(cartId);
      if (!cart) {
        return { success: false, message: "Cart not found", statusCode: 404 };
      }
      await ctx.db.delete(cartId);
      return { success: true, removed: true, cartId };
    } catch (error) {
      // For removeFromCart, we don't have direct userId from args
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

// Bonus: Clear entire cart for user
export const clearCart = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    try {
      const cartItems = await ctx.db
        .query("carts")
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();

      await Promise.all(cartItems.map((item) => ctx.db.delete(item._id)));
    } catch (error) {
      // captureSentryError(ctx, error, userId);
      throw error;
    }
  },
});
