// import { captureSentryError } from "./_utils/sentry";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Create or update cart item
export const createCart = mutation({
  args: {
    productId: v.id("products"),
    quantity: v.number(),
    sizeId: v.string(),
  },
  handler: async (ctx, { productId, quantity, sizeId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    if (!userId) {
      return {
        success: false,
        message: "Authentication required",
        statusCode: 401,
      } as const;
    }

    try {
      const user = await ctx.db
        .query("users")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (!user) {
        return {
          success: false,
          message: "User not found",
          statusCode: 404,
        };
      }

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

      const sizeRecord = size as Record<string, unknown>;
      const available =
        typeof sizeRecord.stock === "number" &&
        Number.isFinite(sizeRecord.stock)
          ? (sizeRecord.stock as number)
          : 0;

      const numericSize =
        typeof sizeRecord.size === "number" &&
        Number.isFinite(sizeRecord.size as number)
          ? (sizeRecord.size as number)
          : undefined;
      const sizeText =
        typeof sizeRecord.size === "string" &&
        (sizeRecord.size as string).trim().length
          ? (sizeRecord.size as string).trim()
          : undefined;
      const unit =
        typeof sizeRecord.unit === "string" &&
        (sizeRecord.unit as string).trim().length
          ? (sizeRecord.unit as string).trim()
          : undefined;
      const sizeName =
        typeof sizeRecord.name === "string" &&
        (sizeRecord.name as string).trim().length
          ? (sizeRecord.name as string).trim()
          : undefined;
      const sizeLabel = sizeName
        ? sizeName
        : numericSize && unit
          ? `${numericSize} ${unit}`
          : sizeText && unit
            ? `${sizeText} ${unit}`
            : (sizeText ?? unit ?? undefined);

      const productName =
        typeof product.name === "string" && product.name.trim().length
          ? product.name.trim()
          : typeof product.slug === "string" && product.slug.trim().length
            ? product.slug.trim()
            : "item";
      const productDescriptor = sizeLabel
        ? `${productName} (${sizeLabel})`
        : productName;

      const buildResponse = ({
        statusCode,
        message,
        quantity: finalQuantity,
        cartId,
      }: {
        statusCode: number;
        message: string;
        quantity: number;
        cartId?: Id<"carts">;
      }) => ({
        success: true,
        statusCode,
        message,
        quantity: finalQuantity,
        cartId,
      });

      if (existingCartItem) {
        if (available < 1)
          return {
            success: false,
            message: `Only ${available} left in stock`,
            statusCode: 400,
          };

        // If the incoming quantity is greater than existing, treat as absolute set
        if (quantity > existingCartItem.quantity) {
          if (quantity > available)
            return {
              success: false,
              message: `Only ${available} left in stock`,
              statusCode: 400,
            };
          await ctx.db.patch(existingCartItem._id, { quantity });
          return buildResponse({
            statusCode: 200,
            message: `Set ${productDescriptor} quantity to ${quantity}.`,
            quantity,
          });
        } else {
          // Otherwise, treat as incremental add
          const newQty = existingCartItem.quantity + quantity;
          if (newQty > available)
            return {
              success: false,
              message: `Adding ${quantity} exceeds available (${available}) when combined with existing (${existingCartItem.quantity}).`,
              statusCode: 400,
            };
          await ctx.db.patch(existingCartItem._id, { quantity: newQty });
          return buildResponse({
            statusCode: 200,
            message: `Added ${quantity} more of ${productDescriptor}. In cart now: ${newQty}.`,
            quantity: newQty,
          });
        }
      } else {
        if (!size || available < 1 || quantity > available) {
          return {
            success: false,
            message: `Only ${available || 0} left in stock`,
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

        return buildResponse({
          statusCode: 201,
          message: `Added ${productDescriptor} ×${quantity} to your cart.`,
          quantity,
          cartId,
        });
      }
    } catch (error) {
      // captureSentryError(ctx, error, userId);
      throw error;
    }
  },
});

export const getUserCart = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        return {
          success: false,
          message: "Authentication required",
          cart: [],
          statusCode: 401,
        } as const;
      }

      const userId = identity.subject;
      if (!userId) {
        return {
          success: false,
          message: "Missing userId",
          cart: [],
          statusCode: 400,
        };
      }

      // if (identity.subject !== userId) {
      //   return {
      //     success: false,
      //     message: "Forbidden",
      //     cart: [],
      //     statusCode: 403,
      //   } as const;
      // }

      // if (!userId) {
      //   return {
      //     success: false,
      //     message: "Missing userId",
      //     cart: [],
      //     statusCode: 400,
      //   };
      // }

      const cartItems = await ctx.db
        .query("carts")
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();

      // if (!cartItems.length) {
      //   return { success: false, message: "Cart is empty", statusCode:400, cart: [] };
      // }bv

      cartItems.sort((a, b) => b.createdAt - a.createdAt);

      const cartWithProducts = await Promise.all(
        cartItems.map(async (item) => {
          const product = await ctx.db.get(item.productId);
          const size =
            product?.sizes?.find((s) => s.id === item.sizeId) || null;

          const categories =
            product?.categories &&
            Array.isArray(product.categories) &&
            product.categories.length
              ? (
                  await Promise.all(
                    product.categories.map((catId: Id<"categories">) =>
                      ctx.db.get(catId)
                    )
                  )
                ).filter(Boolean)
              : [];

          const price = (size?.price || 0) - (size?.discount || 0);

          return {
            ...item,
            product: product
              ? {
                  ...product,
                  originalPrice: size?.price, // price before discount
                  price,
                  size: size?.size,
                  unit: size?.unit,
                  stock: size?.stock,
                  categories,
                }
              : null,
          };
        })
      );

      return { success: true, cart: cartWithProducts };
    } catch (error) {
      // captureSentryError(ctx, error, userId);
      // normally; we dont throw error from backend
      // lets leave it since we are in a get request, we want to trigeer error boundary
      // return { success: false, message: "Something went wrong!" };
      throw new Error("Error getting user's cart");
    }
  },
});

// Bonus: Update cart item quantity
// Todo: Authenticate the user updating cart quantity
export const updateCartQuantity = mutation({
  args: {
    cartId: v.id("carts"),
    quantity: v.number(),
  },
  handler: async (ctx, { cartId, quantity }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    if (!userId) {
      return {
        success: false,
        message: "Authentication required",
        statusCode: 401,
      } as const;
    }

    try {
      const cart = await ctx.db.get(cartId);
      if (!cart)
        return {
          success: false,
          message: "Cart item not found",
          statusCode: 404,
        };

      if (cart.userId !== userId) {
        return {
          success: false,
          message: "Unauthorized",
          statusCode: 403,
        };
      }

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
        return { success: true, removed: true, cartId };
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

      return { success: false, message: "Something went wrong!" };
    }
  },
});

// Bonus: Remove item from cart
// Todo
// it should take a userId to confirm, so others dont delete other carts
export const removeFromCart = mutation({
  args: {
    cartId: v.id("carts"),
  },
  handler: async (ctx, { cartId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    if (!userId) {
      return {
        success: false,
        message: "Authentication required",
        statusCode: 401,
      } as const;
    }

    try {
      const cart = await ctx.db.get(cartId);

      if (!cart) {
        return { success: false, message: "Cart not found", statusCode: 404 };
      }
      if (cart.userId !== userId) {
        return {
          success: false,
          message: "Unauthorized",
          statusCode: 403,
        };
      }
      await ctx.db.delete(cartId);
      return { success: true, removed: true, cartId };
    } catch (error) {
      return { success: false, message: "Something went wrong!" };

      // For removeFromCart, we don't have direct userId from args
      // captureSentryError(ctx, error);
      // we cant throw from backend
      // throw error;
    }
  },
});

// Bonus: Clear entire cart for user
export const clearCart = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    if (!userId) {
      return {
        success: false,
        message: "Authentication required",
        statusCode: 401,
      } as const;
    }

    try {
      const cartItems = await ctx.db
        .query("carts")
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();

      await Promise.all(cartItems.map((item) => ctx.db.delete(item._id)));

      return { success: true, message: "Clear user cart successfully" };
    } catch (error) {
      // captureSentryError(ctx, error, userId);
      // throw error;

      return { success: false, message: "Something went wrong!" };
    }
  },
});

// Bulk add many items to cart at once (all created/updated rows will be marked recommended: true)
export const bulkAddCartItems = mutation({
  args: {
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
        sizeId: v.string(),
      })
    ),
  },
  handler: async (ctx, { items }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    if (!userId) {
      return {
        success: false,
        statusCode: 401,
        message: "Authentication required",
      } as const;
    }

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
      return { success: false, message: "Something went wrong!" };
    }
  },
});
