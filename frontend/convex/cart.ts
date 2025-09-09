// import { captureSentryError } from "./_utils/sentry";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create or update cart item
export const createCart = mutation({
  args: {
    userId: v.string(),
    productId: v.id("products") || v.string(),
    quantity: v.number(),
    sizeId: v.string(),
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
          recommended: false,
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

// Bulk add many items to cart at once (all created/updated rows will be marked recommended: true)
export const bulkAddCartItems = mutation({
  args: {
    userId: v.string(),
    items: v.array(
      v.object({
        productId: v.id("products") || v.string(),
        quantity: v.number(),
        sizeId: v.string(),
      })
    ),
  },
  handler: async (ctx, { userId, items }) => {
    try {
      if (!items?.length) {
        return {
          success: false,
          statusCode: 400,
          message: "No items provided",
        } as const;
      }

      // 1) Normalize input: merge duplicates (same productId + sizeId)
      const mergedMap = new Map<
        string,
        { productId: any; sizeId: string; quantity: number }
      >();
      for (const it of items) {
        const key = `${String(it.productId)}::${it.sizeId ?? ""}`;
        const prev = mergedMap.get(key);
        if (prev) prev.quantity += it.quantity;
        else
          mergedMap.set(key, {
            productId: it.productId as any,
            sizeId: it.sizeId,
            quantity: it.quantity,
          });
      }
      const merged = Array.from(mergedMap.values());

      // 2) Load all products once
      const productIds = Array.from(new Set(merged.map((m) => m.productId)));
      const productsById = new Map<string, any>();
      for (const pid of productIds) {
        const p = await ctx.db.get(pid);
        productsById.set(String(pid), p);
      }

      // 3) Validate stock for requested quantities
      const errors: Array<{
        productId: any;
        sizeId?: string;
        requested: number;
        available: number;
        message: string;
      }> = [];
      type LinePlan = {
        productId: any;
        sizeId: string;
        requested: number;
        available: number;
        unitPrice: number;
      };
      const plan: LinePlan[] = [];

      for (const m of merged) {
        const product = productsById.get(String(m.productId));
        if (!product || !product.sizes) {
          errors.push({
            productId: m.productId,
            sizeId: m.sizeId,
            requested: m.quantity,
            available: 0,
            message: "Product or sizes not found",
          });
          continue;
        }
        const size = product.sizes.find((s: any) => s.id === m.sizeId);
        if (!size) {
          errors.push({
            productId: m.productId,
            sizeId: m.sizeId,
            requested: m.quantity,
            available: 0,
            message: "Size not found",
          });
          continue;
        }
        const available = size.stock ?? 0;
        const unitPrice = (size.price || 0) - (size.discount || 0);
        if (available < 1 || m.quantity > available) {
          errors.push({
            productId: m.productId,
            sizeId: m.sizeId,
            requested: m.quantity,
            available,
            message: `Only ${available} left in stock`,
          });
          continue;
        }
        plan.push({
          productId: m.productId,
          sizeId: m.sizeId,
          requested: m.quantity,
          available,
          unitPrice,
        });
      }

      if (errors.length) {
        return {
          success: false,
          statusCode: 400,
          message: "Some items could not be added due to stock issues",
          errors,
        } as const;
      }

      // 4) Check existing cart rows and ensure combined quantity won't exceed stock
      const updatedIds: string[] = [];
      const createdIds: string[] = [];

      for (const p of plan) {
        // Find existing cart item for this user/product/size
        const existing = await ctx.db
          .query("carts")
          .filter((q) =>
            q.and(
              q.eq(q.field("userId"), userId),
              q.eq(q.field("productId"), p.productId),
              q.eq(q.field("sizeId"), p.sizeId)
            )
          )
          .first();

        if (existing) {
          const newQty = existing.quantity + p.requested;
          if (newQty > p.available) {
            return {
              success: false,
              statusCode: 400,
              message: `Only ${p.available} left in stock for one of the items`,
              errors: [
                {
                  productId: p.productId,
                  sizeId: p.sizeId,
                  requested: p.requested,
                  available: p.available,
                  message: `Adding ${p.requested} exceeds available (${p.available}) when combined with existing quantity (${existing.quantity}).`,
                },
              ],
            } as const;
          }
          await ctx.db.patch(existing._id, {
            quantity: newQty,
            recommended: true,
          });
          updatedIds.push(String(existing._id));
        } else {
          const cartId = await ctx.db.insert("carts", {
            userId,
            productId: p.productId,
            sizeId: p.sizeId,
            quantity: p.requested,
            createdAt: Date.now(),
            recommended: true,
          });
          createdIds.push(String(cartId));
        }
      }

      return {
        success: true,
        statusCode: 200,
        message: "Cart updated",
        createdIds,
        updatedIds,
      } as const;
    } catch (error) {
      throw error;
    }
  },
});
