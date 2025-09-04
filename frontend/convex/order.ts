import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { Country } from "./schema";

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
      status: "pending",
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

    // Deduct stock since no discrepancies
    // for (const item of cartItems) {
    //   const product = await ctx.db.get(item.productId);
    //   if (!product || !product.sizes) continue;
    //   const sizeIndex = product.sizes?.findIndex((s) => s.id === item.sizeId);
    //   if (sizeIndex === -1 || sizeIndex === undefined) continue;
    //   product.sizes[sizeIndex].stock -= item.quantity;
    //   await ctx.db.patch(product._id, { sizes: product.sizes });
    // }

    // // Clear user's cart
    // await Promise.all(cartItems.map((item) => ctx.db.delete(item._id)));

    return { success: true, orderId };
  },
});

export const updateOrder = mutation({
  args: {
    orderId: v.id("orders"),
    reference: v.string(),
  },
  handler: async (ctx, { orderId, reference }) => {
    const order = await ctx.db.get(orderId);
    if (!order) {
      return { success: false, message: "Order not found", statusCode: 404 };
    }

    await ctx.db.patch(orderId, { reference });

    return { success: true, message: "Order updated" };
  },
});

export const completeOrder = mutation({
  args: {
    orderId: v.id("orders"),
    reference: v.string(),
  },
  handler: async (ctx, { orderId, reference }) => {
    const order = await ctx.db.get(orderId);
    if (!order) {
      return { success: false, message: "Order not found", statusCode: 404 };
    }

    // Update order status to 'paid' and set Paystack reference
    await ctx.db.patch(orderId, {
      status: "paid",
      reference,
    });

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
        (s) => s.id === orderItem.sizeId
      );
      if (sizeIndex === -1 || sizeIndex === undefined) {
        console.warn(
          `Size not found for sizeId: ${orderItem.sizeId} in product: ${product._id}`
        );
        continue;
      }
      product.sizes[sizeIndex].stock -= orderItem.quantity;
      await ctx.db.patch(product._id, { sizes: product.sizes });
    }

    // Clear the user's cart
    // First, find the user's cart items for this order
    const userCartItems = await ctx.db
      .query("carts")
      .filter((q) => q.eq(q.field("userId"), order.userId))
      .collect();

    // Then delete them
    await Promise.all(userCartItems.map((item) => ctx.db.delete(item._id)));

    return { success: true, message: "Order completed and stock updated" };
  },
});
