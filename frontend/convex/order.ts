import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Country, OrderStatus } from "./schema";

export const initiateOrder = mutation({
  args: {
    userId: v.string(),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    phone: v.string(),
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    companyName: v.optional(v.string()),
    country: Country,
    streetAddress: v.optional(v.string()),
    deliveryNote: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      userId,
      address,
      city,
      state,
      phone,
      email,
      firstName,
      lastName,
      companyName,
      country,
      streetAddress,
      deliveryNote,
    }
  ) => {
    const cartItems = await ctx.db
      .query("carts")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    if (cartItems.length === 0) {
      return { success: false, message: "Cart is empty", statusCode: 400 };
    }

    const discrepancies: Array<{
      cartId: string;
      productId: string;
      reason: string;
    }> = [];

    let totalAmount = 0;

    for (const item of cartItems) {
      const product = await ctx.db.get(item.productId);
      if (!product) {
        throw new Error("Product not found");
      }

      const sizeIndex = product.sizes?.findIndex((s) => s.id === item.sizeId);
      if (sizeIndex === -1 || sizeIndex === undefined) {
        throw new Error("Size not found");
      }
      if (product.sizes) {
        const size = product?.sizes[sizeIndex];
        if (item.quantity > size.stock) {
          discrepancies.push({
            cartId: item._id,
            productId: product._id,
            reason: `Only ${size.stock} left in stock`,
          });
        } else {
          const price = (size.price || 0) - (size.discount || 0);
          totalAmount += price * item.quantity;
        }
      }
    }

    if (discrepancies.length > 0) {
      return {
        success: false,
        discrepancies,
        message: "One or more of your orders has an issue",
      };
    }

    const orderItems = await Promise.all(
      cartItems.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        const size = product?.sizes?.find((s) => s.id === item.sizeId);
        const price = (size?.price || 0) - (size?.discount || 0);
        return {
          productId: item.productId,
          sizeId: item.sizeId,
          quantity: item.quantity,
          price,
        };
      })
    );

    const orderId = await ctx.db.insert("orders", {
      userId,
      items: orderItems,
      totalAmount,
      status: "draft",
      createdAt: Date.now(),
      address,
      city,
      state,
      phone,
      email,
      firstName,
      lastName,
      companyName,
      country,
      streetAddress,
      deliveryNote,
    });

    return { success: true, orderId };
  },
});

export const generateOrderToken = mutation({
  args: {
    userId: v.string(),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    phone: v.string(),
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    companyName: v.optional(v.string()),
    country: Country,
    streetAddress: v.optional(v.string()),
    deliveryNote: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      userId,
      address,
      city,
      state,
      phone,
      email,
      firstName,
      lastName,
      companyName,
      country,
      streetAddress,
      deliveryNote,
    }
  ) => {
    const cartItems = await ctx.db
      .query("carts")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    if (cartItems.length === 0) {
      return { success: false, message: "Cart is empty", statusCode: 400 };
    }

    const discrepancies: Array<{
      cartId: string;
      productId: string;
      reason: string;
    }> = [];

    let totalAmount = 0;

    for (const item of cartItems) {
      const product = await ctx.db.get(item.productId);
      if (!product) throw new Error("Product not found");

      const sizeIndex = product.sizes?.findIndex((s) => s.id === item.sizeId);
      if (sizeIndex === -1 || sizeIndex === undefined) {
        throw new Error("Size not found");
      }
      if (product.sizes) {
        const size = product.sizes[sizeIndex];
        if (item.quantity > size.stock) {
          discrepancies.push({
            cartId: (item as any)._id,
            productId: (product as any)._id,
            reason: `Only ${size.stock} left in stock`,
          });
        } else {
          const price = (size.price || 0) - (size.discount || 0);
          totalAmount += price * item.quantity;
        }
      }
    }

    if (discrepancies.length > 0) {
      return {
        success: false,
        discrepancies,
        message: "One or more of your orders has an issue",
      } as any;
    }

    const orderItems = await Promise.all(
      cartItems.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        const size = product?.sizes?.find((s) => s.id === item.sizeId);
        const price = (size?.price || 0) - (size?.discount || 0);
        return {
          productId: item.productId,
          sizeId: item.sizeId,
          quantity: item.quantity,
          price,
        };
      })
    );

    // Generate a unique token and 24h expiry
    const gen = () =>
      (
        Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2)
      ).slice(0, 36);

    let token = gen();
    for (let i = 0; i < 5; i++) {
      const existing = await ctx.db
        .query("orders")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
      if (!existing) break;
      token = gen();
    }
    const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24h

    const orderId = await ctx.db.insert("orders", {
      userId,
      items: orderItems,
      totalAmount,
      status: "draft",
      createdAt: Date.now(),
      address,
      city,
      state,
      phone,
      email,
      firstName,
      lastName,
      companyName,
      country,
      streetAddress,
      deliveryNote,
      token,
      tokenExpiry,
    });

    return { success: true, orderId, token, tokenExpiry };
  },
});

export const createOrderReference = mutation({
  args: {
    orderId: v.id("orders"),
    reference: v.string(),
  },
  handler: async (ctx, { orderId, reference }) => {
    const order = await ctx.db.get(orderId);
    if (!order) {
      return { success: false, message: "Order not found", statusCode: 404 };
    }

    await ctx.db.patch(orderId, { reference, status: "pending" });

    return { success: true, message: "Order updated" };
  },
});

// DEPRECATED: Prefer completeOrderByReference(reference). Kept for backward compatibility.
// export const completeOrder = mutation({
//   args: {
//     orderId: v.id("orders"),
//     reference: v.string(),
//   },
//   handler: async (ctx, { orderId, reference }) => {
//     const order = await ctx.db.get(orderId);
//     if (!order) {
//       return { success: false, message: "Order not found", statusCode: 404 };
//     }

//     // Update order status to 'paid' and set Paystack reference
//     await ctx.db.patch(orderId, {
//       status: "paid",
//       reference,
//     });

//     // Deduct stock for each item in the order
//     for (const orderItem of order.items) {
//       const product = await ctx.db.get(orderItem.productId);
//       if (!product || !product.sizes) {
//         console.warn(
//           `Product or sizes not found for productId: ${orderItem.productId}`
//         );
//         continue;
//       }
//       const sizeIndex = product.sizes.findIndex(
//         (s) => s.id === orderItem.sizeId
//       );
//       if (sizeIndex === -1 || sizeIndex === undefined) {
//         console.warn(
//           `Size not found for sizeId: ${orderItem.sizeId} in product: ${product._id}`
//         );
//         continue;
//       }
//       product.sizes[sizeIndex].stock -= orderItem.quantity;
//       await ctx.db.patch(product._id, { sizes: product.sizes });
//     }

//     // Clear the user's cart
//     // First, find the user's cart items for this order
//     const userCartItems = await ctx.db
//       .query("carts")
//       .filter((q) => q.eq(q.field("userId"), order.userId))
//       .collect();

//     // Then delete them
//     await Promise.all(userCartItems.map((item) => ctx.db.delete(item._id)));

//     // send the user a cofirmation email

//     return { success: true, message: "Order completed and stock updated" };
//   },
// });

export const completeOrder = mutation({
  args: {
    reference: v.string(),
  },
  handler: async (ctx, { reference }) => {
    // Look up order by unique payment reference
    const order = await ctx.db
      .query("orders")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first();

    if (!order) {
      return {
        success: false,
        message: "Order not found for this reference",
        statusCode: 404,
      } as const;
    }

    // Idempotency: if already paid, exit early
    if (order.status === "paid") {
      return { success: true, message: "Order already completed" } as const;
    }

    // Mark as paid (do not overwrite reference here)
    await ctx.db.patch(order._id, { status: "paid" });

    // Deduct stock for each item in the order
    for (const orderItem of order.items) {
      const product = await ctx.db.get(orderItem.productId);
      if (!product || !product.sizes) {
        console.warn(
          `Product or sizes not found for productId: ${orderItem.productId}`
        );
        continue;
      }
      const sizeIndex = product.sizes.findIndex(
        (s: any) => s.id === orderItem.sizeId
      );
      if (sizeIndex === -1 || sizeIndex === undefined) {
        console.warn(
          `Size not found for sizeId: ${orderItem.sizeId} in product: ${product._id}`
        );
        continue;
      }
      (product as any).sizes[sizeIndex].stock -= orderItem.quantity;
      await ctx.db.patch(product._id, { sizes: (product as any).sizes });
    }

    // Clear the user's cart
    const userCartItems = await ctx.db
      .query("carts")
      .filter((q) => q.eq(q.field("userId"), order.userId))
      .collect();

    await Promise.all(userCartItems.map((item) => ctx.db.delete(item._id)));

    // send user email that order has been accepted

    return {
      success: true,
      message: "Order completed and stock updated",
    } as const;
  },
});

// updateOrder is limited to address/contact fields only.
// Status and payment-related updates must go through dedicated mutations
// to ensure required side-effects (like stock deduction, cart clearing, emails).
export const updateOrder = mutation({
  args: {
    orderId: v.id("orders"),
    patch: v.object({
      // Address / contact fields only
      address: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      companyName: v.optional(v.string()),
      country: v.optional(Country),
      streetAddress: v.optional(v.string()),
      deliveryNote: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { orderId, patch }) => {
    const order = await ctx.db.get(orderId);
    if (!order)
      return { success: false, message: "Order not found", statusCode: 404 };
    await ctx.db.patch(orderId, patch as any);
    return { success: true };
  },
});

export const getOrderByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!order) {
      return {
        success: false,
        statusCode: 404,
        message: "This link is invalid or no longer available.",
      } as const;
    }

    if (!order.tokenExpiry || order.tokenExpiry < Date.now()) {
      return {
        success: false,
        statusCode: 404,
        message: "This link has expired",
      } as const;
    }

    if (order.status !== "draft")
      return {
        success: false,
        statusCode: 404,
        message: "This link is no longer available.",
      } as const;

    return { success: true, order } as const;
  },
});

// export const updateOrderStatus = mutation({
//   args: {
//     orderId: v.id("orders"),
//     to: OrderStatus,
//   },
//   handler: async (ctx, { orderId, to }) => {
//     const order = await ctx.db.get(orderId);
//     if (!order)
//       return { success: false, message: "Order not found", statusCode: 404 };

//     const from = order.status as string;
//     const allowed: Record<string, string[]> = {
//       draft: ["pending", "out_of_stock", "failed"],
//       pending: ["paid", "failed", "out_of_stock"],
//       paid: ["shipped", "refunded"],
//       shipped: ["refunded"],
//       failed: [],
//       out_of_stock: [],
//       refunded: [],
//     };

//     if (!(allowed[from] || []).includes(to as string)) {
//       return {
//         success: false,
//         message: `Invalid status transition from ${from} to ${to}`,
//         statusCode: 400,
//       };
//     }

//     // Reserve the payment-capture path for completeOrder so we always run side-effects
//     if (to === "paid") {
//       return {
//         success: false,
//         message:
//           "Use completeOrder to transition to 'paid' so side-effects run",
//         statusCode: 400,
//       };
//     }

//     // For other transitions, patch status. (Add side-effects here if needed.)
//     await ctx.db.patch(orderId, { status: to as any });
//     return { success: true };
//   },
// });

// export const issueOrderToken = mutation({
//   args: {
//     orderId: v.id("orders"),
//     // default: 24 hours
//     ttlMs: v.optional(v.number()),
//   },
//   handler: async (ctx, { orderId, ttlMs }) => {
//     const order = await ctx.db.get(orderId);
//     if (!order)
//       return { success: false, message: "Order not found", statusCode: 404 };

//     // helper to generate a random, URL‑safe-ish token
//     const gen = () =>
//       (
//         Math.random().toString(36).slice(2) +
//         Math.random().toString(36).slice(2) +
//         Math.random().toString(36).slice(2)
//       ).slice(0, 36);

//     // attempt a few times to avoid rare collisions
//     let token = gen();
//     for (let i = 0; i < 5; i++) {
//       const existing = await ctx.db
//         .query("orders")
//         .withIndex("by_token", (q) => q.eq("token", token))
//         .first();
//       if (!existing) break;
//       token = gen();
//     }

//     const expiresAt = Date.now() + (ttlMs ?? 24 * 60 * 60 * 1000);
//     await ctx.db.patch(orderId, { token, tokenExpiry: expiresAt });

//     return { success: true, token, tokenExpiry: expiresAt };
//   },
// });
