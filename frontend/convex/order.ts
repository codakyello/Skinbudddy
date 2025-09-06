// Polyfill fetch for node if not available (Convex actions support fetch natively)
// @ts-ignore
const fetch_: typeof fetch =
  typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch;

import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Country } from "./schema";
import { Id } from "./_generated/dataModel";
import { Doc } from "./_generated/dataModel";
import { generateToken } from "./_utils/utils";

/**
 * Verify Paystack payment using reference and expected amount.
 * Returns { success, data } where success indicates verified and data is the raw API response.
 */
async function verifyPaystackPayment(
  reference: string,
  expectedAmount: number
): Promise<{ success: boolean; data: any }> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is not set in environment");
  }
  // Paystack expects amount in kobo (NGN) or lowest currency unit
  // Our order.totalAmount should match Paystack's charged amount (in kobo)
  const url = `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`;
  const resp = await fetch_(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });
  let json: any;
  try {
    json = await resp.json();
  } catch (e) {
    return { success: false, data: { error: "Invalid JSON from Paystack" } };
  }
  if (!resp.ok || !json.status || !json.data) {
    return { success: false, data: json };
  }
  // Check payment status and amount
  const paystackStatus = json.data.status;
  const paystackAmount = json.data.amount;
  // Accept only "success" status and amount >= expectedAmount (allow overpayment)
  if (paystackStatus === "success" && paystackAmount >= expectedAmount) {
    return { success: true, data: json.data };
  }
  return { success: false, data: json.data };
}

const OrderType = v.union(v.literal("normal"), v.literal("pay_for_me"));

export const createOrder = mutation({
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
    orderType: v.optional(OrderType), // defaults to "normal"
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
      orderType,
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
        const size = product.sizes[sizeIndex]!;
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

    const effectiveType = orderType ?? "normal";

    // Optional token generation for pay-for-me flow
    let token: string | undefined;
    let tokenExpiry: number | undefined;
    if (effectiveType === "pay_for_me") {
      token = generateToken();
      for (let i = 0; i < 5; i++) {
        const existing = await ctx.db
          .query("orders")
          .withIndex("by_token", (q) => q.eq("token", token!))
          .first();
        if (!existing) break;
        token = generateToken();
      }
      tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24h
    }

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
      orderType: effectiveType,
      ...(effectiveType === "pay_for_me" ? { token, tokenExpiry } : {}),
    });

    return {
      success: true,
      orderId,
      ...(effectiveType === "pay_for_me" ? { token, tokenExpiry } : {}),
    } as const;
  },
});

export const _getOrderByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
  },
});
// Add userId to args and enforce order.reference and order.userId checks
export const createOrderReference = mutation({
  args: {
    orderId: v.id("orders"),
    reference: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, { orderId, reference, userId }) => {
    const order = await ctx.db.get(orderId);
    if (!order) {
      return { success: false, message: "Order not found", statusCode: 404 };
    }
    // if (order.reference) {
    //   return {
    //     success: false,
    //     message: "Order already has a reference",
    //     statusCode: 400,
    //   };
    // }
    if (order.userId !== userId) {
      return { success: false, message: "Forbidden", statusCode: 403 };
    }
    await ctx.db.patch(orderId, { status: "pending" });
    await ctx.db.insert("orderReferences", {
      orderId: order._id,
      reference,
      status: "pending",
    });
    await ctx.db.patch(orderId, {
      paymentVerifyStatus: "pending",
      paymentVerifyAttempts: 0,
      nextPaymentVerifyAt: Date.now(),
    } as any);
    return { success: true, message: "Order updated" };
  },
});

export const completeOrder = internalMutation({
  args: {
    reference: v.string(),
  },
  handler: async (ctx, { reference }) => {
    const ref = await ctx.db
      .query("orderReferences")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first();

    if (!ref) {
      return {
        success: false,
        statusCode: 404,
        message: "Reference not found.",
      } as const;
    }
    const order = await ctx.db.get(ref.orderId);
    // 1) Look up order by payment reference

    if (!order) {
      return {
        success: false,
        statusCode: 404,
        message: "Order not found for this reference.",
      } as const;
    }

    // 2) Idempotency and status gates
    if (order.status === "paid") {
      return {
        success: true,
        message: "Order already completed (paid).",
      } as const;
    }
    if (order.status === "out_of_stock") {
      return {
        success: true,
        message: "Order previously marked out of stock.",
        shortages: (order as any).shortages ?? [],
        refundDue: (order as any).refundDue ?? 0,
      } as const;
    }
    if ((order as any).fulfillmentStatus === "partial") {
      return {
        success: true,
        message: "Order already partially fulfilled.",
        shortages: (order as any).shortages ?? [],
        refundDue: (order as any).refundDue ?? 0,
      } as const;
    }

    // Only allow completion from "pending" status (not "draft" anymore)
    if (order.status !== "pending") {
      return {
        success: false,
        statusCode: 409,
        message: `Cannot complete order from status '${order.status}'.`,
      } as const;
    }

    // Ensure payment was verified by an action before completing
    if ((order as any).paymentVerifyStatus !== "verified") {
      return {
        success: false,
        statusCode: 403,
        message: "Payment not verified for this order.",
      } as const;
    }

    // // 3) Validate that the reference matches what we have on record (defensive)
    // if (!reference) {
    //   // Extremely rare: reference not stored yet; never overwrite if it exists and differs
    //   await ctx.db.patch(order._id, { reference });
    // } else if (order.reference !== reference) {
    //   return {
    //     success: false,
    //     statusCode: 400,
    //     message: "Reference mismatch for this order.",
    //   } as const;
    // }

    // 3) Calculate fulfillable quantities & shortages atomically by reading latest stock
    type Shortage = {
      productId: Id<"products">;
      sizeId: string | undefined;
      requested: number;
      available: number;
      shortBy: number;
      refund: number;
    };

    const shortages: Shortage[] = [];
    const fulfillPlan: Array<{
      productId: Id<"products">;
      productDocId: Id<"products">;
      sizeIndex: number;
      sizeId: string;
      fulfillQty: number;
      price: number;
    }> = [];

    for (const item of order.items) {
      const product = await ctx.db.get(item.productId);
      if (!product || !product.sizes) {
        // If the product is gone or sizes missing, treat as full shortage for that line
        const unitPrice = (item as any).price ?? 0;
        shortages.push({
          productId: item.productId,
          sizeId: item.sizeId as any,
          requested: item.quantity,
          available: 0,
          shortBy: item.quantity,
          refund: unitPrice * item.quantity,
        });
        continue;
      }

      const idx = product.sizes.findIndex((s: any) => s.id === item.sizeId);
      if (idx === -1 || idx === undefined) {
        const unitPrice = (item as any).price ?? 0;
        shortages.push({
          productId: product._id,
          sizeId: item.sizeId as any,
          requested: item.quantity,
          available: 0,
          shortBy: item.quantity,
          refund: unitPrice * item.quantity,
        });
        continue;
      }

      const available = (product as any).sizes[idx].stock ?? 0;
      const requested = item.quantity;
      const fulfillQty = Math.min(available, requested);
      const unitPrice = (item as any).price ?? 0;

      if (fulfillQty < requested) {
        shortages.push({
          productId: product._id,
          sizeId: item.sizeId as any,
          requested,
          available,
          shortBy: requested - fulfillQty,
          refund: (requested - fulfillQty) * unitPrice,
        });
      }

      // Record what we plan to deduct now (could be 0)
      fulfillPlan.push({
        productId: item.productId,
        productDocId: product._id,
        sizeIndex: idx,
        sizeId: item.sizeId as any,
        fulfillQty,
        price: unitPrice,
      });
    }

    // Build fulfilled items snapshot (what we can actually deliver now)
    const fulfilledItems = fulfillPlan
      .filter((p) => p.fulfillQty > 0)
      .map((p) => ({
        productId: p.productId,
        sizeId: p.sizeId as any,
        quantity: p.fulfillQty,
        price: p.price,
      }));

    const fulfilledAmount = fulfilledItems.reduce(
      (sum, li) => sum + li.price * li.quantity,
      0
    );

    // 4) Apply deductions for fulfillable quantities (guarded by latest stock)
    for (const step of fulfillPlan) {
      if (step.fulfillQty <= 0) continue;
      const prod = await ctx.db.get(step.productId);
      if (!prod || !(prod as any).sizes || !(prod as any).sizes[step.sizeIndex])
        continue;
      const currentStock = (prod as any).sizes[step.sizeIndex].stock ?? 0;
      const deduct = Math.min(currentStock, step.fulfillQty); // re-check to avoid over-deduct due to races
      if (deduct <= 0) continue;
      (prod as any).sizes[step.sizeIndex].stock = currentStock - deduct;
      await ctx.db.patch(step.productDocId as any, {
        sizes: (prod as any).sizes,
      });
    }

    // 5) Compute refund and decide final status
    const refundDue = shortages.reduce((sum, s) => sum + s.refund, 0);
    const anyFulfilled = fulfillPlan.some((p) => p.fulfillQty > 0);

    if (shortages.length > 0) {
      // Partial or zero fulfillment
      const fulfillmentStatus = anyFulfilled ? "partial" : "none";
      await ctx.db.patch(order._id, {
        status: anyFulfilled ? "paid" : "out_of_stock",
        fulfillmentStatus,
        shortages: shortages,
        refundDue,
        // initialize refund workflow
        refundStatus: "pending",
        refundAttempts: 0,
        refundReason: anyFulfilled ? "partial_fulfillment" : "out_of_stock",
        lastRefundAttemptAt: undefined,
        lastRefundError: undefined,
        refundProviderId: undefined,
        nextRefundAt: Date.now(), // try immediately; cron/worker will respect this
        // fulfillment snapshots
        fulfilledItems,
        fulfilledAmount,
      } as any);

      // Enqueue an immediate refund attempt (event-driven)
      // Hack: Mutations cannot call actions or external apis
      await ctx.scheduler.runAfter(0, internal.order.processRefund, {
        orderId: order._id,
      });

      // Clear the user's cart regardless to avoid duplicate retries with old quantities
      const userCartItems = await ctx.db
        .query("carts")
        .filter((q) => q.eq(q.field("userId"), order.userId))
        .collect();
      await Promise.all(userCartItems.map((ci) => ctx.db.delete(ci._id)));

      return {
        success: true,
        message: anyFulfilled
          ? "Order partially fulfilled. Refund due for unavailable items."
          : "Insufficient stock. Order marked out of stock.",
        fulfillmentStatus,
        shortages,
        refundDue,
      } as const;
    }

    // 6) Full fulfillment path: mark as paid, clear cart
    await ctx.db.patch(ref._id, { status: "paid" });
    await ctx.db.patch(order._id, {
      status: "paid",
      fulfillmentStatus: "full",
      fulfilledItems: order.items.map((it) => ({
        productId: it.productId,
        sizeId: it.sizeId as any,
        quantity: it.quantity,
        price: (it as any).price ?? 0,
      })),
      fulfilledAmount: order.totalAmount,
      refundDue: 0,
    } as any);

    const userCartItems = await ctx.db
      .query("carts")
      .filter((q) => q.eq(q.field("userId"), order.userId))
      .collect();
    await Promise.all(userCartItems.map((ci) => ctx.db.delete(ci._id)));

    return {
      success: true,
      message: "Order completed and stock updated.",
    } as const;
  },
});

export const _setOrderVerified = internalMutation({
  args: {
    orderId: v.id("orders"),
    // providerAmount: v.optional(v.number()),
    // providerCurrency: v.optional(v.string()),
    // providerStatus: v.optional(v.string()),
    // providerTxnId: v.optional(v.string()),
    // providerChannel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      return {
        success: false,
        statusCode: 404,
        message: "Order not found",
      } as const;
    }
    if (order.status !== "pending") {
      return { success: true } as const; // idempotent; no change if not pending
    }
    await ctx.db.patch(args.orderId, {
      paymentVerifyStatus: "verified" as any,
      paymentVerifiedAt: Date.now(),
      // providerAmount: args.providerAmount,
      // providerCurrency: args.providerCurrency,
      // providerStatus: args.providerStatus,
      // providerTxnId: args.providerTxnId,
      // providerChannel: args.providerChannel,
    } as any);
    return { success: true } as const;
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
        statusCode: 400,
        message: "This link has expired",
      } as const;
    }

    if (order.status === "paid")
      return {
        success: false,
        statusCode: 400,
        message: "This link is no longer available.",
      } as const;

    return { success: true, order } as const;
  },
});

// not a public function endpoint
export const updateRefundState = internalMutation({
  args: {
    orderId: v.id("orders"),
    success: v.boolean(),
    providerRefundId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    lastRefundHttpStatus: v.optional(v.number()),
    lastRefundErrorCode: v.optional(v.string()),
    lastRefundPayload: v.optional(v.any()),
  },
  handler: async (
    ctx,
    {
      orderId,
      success,
      providerRefundId,
      errorMessage,
      lastRefundHttpStatus,
      lastRefundErrorCode,
      lastRefundPayload,
    }
  ) => {
    const order = await ctx.db.get(orderId);
    if (!order)
      return {
        success: false,
        statusCode: 404,
        message: "Order not found",
      } as const;

    if (success) {
      // Mark refund as processed; set status heuristically
      const newStatus =
        (order as any).fulfillmentStatus === "partial" ? "paid" : "refunded";
      await ctx.db.patch(orderId, {
        refundProcessed: true,
        refundStatus: "processed",
        refundProcessedAt: Date.now(),
        status: newStatus,
        refundProviderId: providerRefundId,
        nextRefundAt: undefined,
        lastRefundError: undefined,
        lastRefundHttpStatus: undefined,
        lastRefundErrorCode: undefined,
        lastRefundPayload: undefined,
      } as any);
      return { success: true } as const;
    }

    // Failure path: bump attempts and store last error for retries, with exponential backoff and jitter
    const attempts = ((order as any).refundAttempts ?? 0) + 1;

    // exponential backoff schedule in ms
    const steps = [
      60_000,
      5 * 60_000,
      15 * 60_000,
      60 * 60_000,
      6 * 60 * 60_000,
      24 * 60 * 60_000,
    ];
    const base = steps[Math.min(attempts - 1, steps.length - 1)];
    const jitter = Math.floor(base * (0.1 + Math.random() * 0.2)); // +10%..+30%
    const nextRefundAt = Date.now() + base + jitter;

    // Patch with optional error details if provided
    await ctx.db.patch(orderId, {
      refundStatus: "failed",
      refundAttempts: attempts,
      lastRefundAttemptAt: Date.now(),
      lastRefundError: errorMessage,
      nextRefundAt,
      ...(typeof lastRefundHttpStatus !== "undefined"
        ? { lastRefundHttpStatus }
        : {}),
      ...(typeof lastRefundErrorCode !== "undefined"
        ? { lastRefundErrorCode }
        : {}),
      ...(typeof lastRefundPayload !== "undefined"
        ? { lastRefundPayload }
        : {}),
    } as any);
    return { success: true } as const;
  },
});

// this is a cron job
export const processRefund = internalAction({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, { orderId }) => {
    // NOTE: If TypeScript can't see internal.order.*, run 'npx convex dev' to regenerate types.
    // Fetch fresh order state (actions can't use ctx.db directly for writes; we'll use mutations)
    const order: Doc<"orders"> | null = await ctx.runQuery(
      internal.order._getOrderById,
      { orderId }
    );
    if (!order) return;
    if (!order.refundDue || order.refundProcessed) return; // nothing to do
    if (
      order.refundStatus &&
      !["pending", "failed"].includes(order.refundStatus as any)
    )
      return; // only work pending/failed
    if (order.nextRefundAt && order.nextRefundAt > Date.now()) return; // respect backoff schedule

    const references = await ctx.runQuery(internal.order._getOrderReferences, {
      orderId: order._id,
    });

    // --- Prepare for refund attempt; ensure idempotency at provider using payment reference ---
    // const idempotencyKey = `refund-${order.reference}`;

    const idempotencyKey = `refund-${references.at}`;

    try {
      // Example placeholder logic (simulate provider success):
      const providerRefundId = idempotencyKey;
      // Call back into a mutation to update DB
      await ctx.runMutation(internal.order.updateRefundState, {
        orderId,
        success: true,
        providerRefundId,
      });
    } catch (e: any) {
      // Pass through structured error info if available
      const errObj = typeof e === "object" && e !== null ? e : {};
      await ctx.runMutation(internal.order.updateRefundState, {
        orderId,
        success: false,
        errorMessage: e?.message ?? "Refund error",
        lastRefundHttpStatus:
          errObj.lastRefundHttpStatus ?? errObj.httpStatus ?? undefined,
        lastRefundErrorCode:
          errObj.lastRefundErrorCode ?? errObj.code ?? undefined,
        lastRefundPayload:
          errObj.lastRefundPayload ?? errObj.payload ?? undefined,
      });
    }
  },
});

// we are marking it as failed in the verifyPendingPayment cron job that is for orders that payment is set to pending
// verify payment mark it as paid else mark it has failed
// we mark it as failed here
// in processRefund

// cron job calls this
export const verifyPendingPaymentsSweep = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { limit }
  ): Promise<{ success: boolean; count: number }> => {
    const ids: Id<"orders">[] = await ctx.runQuery(
      api.order._listPendingOrdersForVerify,
      { limit: limit ?? 50 }
    );
    for (const id of ids) {
      await ctx.runAction(internal.order.verifyPaymentForOrder, {
        orderId: id,
      });
    }
    return { success: true, count: ids.length } as const;
  },
});

export const _listPendingOrdersForVerify = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const all = await ctx.db
      .query("orders")
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const eligible = all.filter((o: any) => {
      if (!o.reference) return false;
      if (
        o.paymentVerifyStatus &&
        !["pending", "failed_temp"].includes(o.paymentVerifyStatus)
      )
        return false;
      if (!o.nextPaymentVerifyAt) return true;
      return o.nextPaymentVerifyAt <= now;
    });

    return (limit ? eligible.slice(0, limit) : eligible).map((o) => o._id);
  },
});

export const _markOrderPaymentFailed = internalMutation({
  args: {
    orderId: v.id("orders"),
    providerStatus: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, providerStatus, message }) => {
    const order = await ctx.db.get(orderId);
    if (!order)
      return {
        success: false,
        statusCode: 404,
        message: "Order not found",
      } as const;
    if (order.status !== "pending") return { success: true } as const; // idempotent
    await ctx.db.patch(orderId, {
      status: "failed" as any,
      paymentVerifyStatus: providerStatus,
      nextPaymentVerifyAt: undefined,
    } as any);
    return { success: true } as const;
  },
});

export const _bumpPaymentVerifyBackoff = internalMutation({
  args: { orderId: v.id("orders"), errorMessage: v.optional(v.string()) },
  handler: async (ctx, { orderId, errorMessage }) => {
    const order = await ctx.db.get(orderId);
    if (!order)
      return {
        success: false,
        statusCode: 404,
        message: "Order not found",
      } as const;
    if (order.status !== "pending") return { success: true } as const;

    const prev = (order as any).paymentVerifyAttempts ?? 0;
    const attempts = Math.max(0, Number(prev)) + 1;
    const steps = [
      60_000,
      5 * 60_000,
      15 * 60_000,
      60 * 60_000,
      6 * 60 * 60_000,
      24 * 60 * 60_000,
    ];
    const idx = Math.min(attempts - 1, steps.length - 1);
    const base = steps[idx];
    const jitter = Math.floor(base * (0.1 + Math.random() * 0.2));
    const nextPaymentVerifyAt = Date.now() + base + jitter;

    await ctx.db.patch(orderId, {
      paymentVerifyStatus: "failed_temp",
      paymentVerifyAttempts: attempts,
      nextPaymentVerifyAt,
    } as any);
    return { success: true } as const;
  },
});

export const verifyPaymentForOrder = internalAction({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.runQuery(internal.order._getOrderById, { orderId });
    if (!order) return;
    const references = await ctx.runQuery(internal.order._getOrderReferences, {
      orderId: order._id,
    });

    const reference = references.at(0);
    if (order.status !== "pending" || !reference) return;

    // Auto-fail very old pending orders (24h window)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    if (Date.now() - order.createdAt > TWENTY_FOUR_HOURS) {
      await ctx.runMutation(internal.order._markOrderPaymentFailed, {
        orderId,
        providerStatus: "expired",
        message: "Pending > 24h without successful verification",
      });
      return;
    }

    const expected = order.totalAmount * 100;
    try {
      const result = await verifyPaystackPayment(reference, expected);
      if (result.success) {
        // Mark verification success (defense-in-depth) then run completion (idempotent)
        await ctx.runMutation(internal.order._setOrderVerified, {
          orderId,
        });
        // await ctx.runMutation(internal.order.completeOrder, {
        //   reference: order.reference,
        // });
        await ctx.runMutation(internal.order.completeOrder, {
          reference,
        });
        return;
      }

      // Not verified. If provider returns an explicit terminal state, mark failed.
      const providerStatus = (result as any)?.data?.status;
      if (
        providerStatus &&
        ["failed", "abandoned", "reversed"].includes(providerStatus)
      ) {
        await ctx.runMutation(internal.order._markOrderPaymentFailed, {
          orderId,
          providerStatus,
          message: (result as any)?.data?.message,
        });
        return;
      }

      // Else, schedule another verify attempt with backoff
      await ctx.runMutation(internal.order._bumpPaymentVerifyBackoff, {
        orderId,
        errorMessage:
          (result as any)?.data?.message || providerStatus || "Unverified",
      });
    } catch (e: any) {
      await ctx.runMutation(internal.order._bumpPaymentVerifyBackoff, {
        orderId,
        errorMessage: e?.message ?? "Verify error",
      });
    }
  },
});

// Lookup order by payment reference (internal-only so actions can call it)
export const _getOrderByReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    const ref = await ctx.db
      .query("orderReferences")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first();

    if (!ref) {
      return null;
    }
    return await ctx.db.get(ref.orderId);
  },
});

export const _getOrderReferences = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const refs = await ctx.db
      .query("orderReferences")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .collect();

    return refs.map((ref) => ref.reference);
  },
});
// Public action that Paystack webhook (or client) can call by reference:
// verifies with Paystack, stamps verification, then runs the internal completion mutation.
export const verifyAndCompleteByReference = action({
  args: { reference: v.string() },
  handler: async (ctx, { reference }) => {
    const order = await ctx.runQuery(internal.order._getOrderByReference, {
      reference,
    });

    if (!order) {
      return {
        success: false,
        statusCode: 404,
        message: "Order not found",
      } as const;
    }

    const references = await ctx.runQuery(internal.order._getOrderReferences, {
      orderId: order._id,
    });

    console.log(references, "This are all the references");

    // it will return here
    // not equal so paid, refund return

    const disallowed = [
      "draft",
      "failed",
      "out_of_stock",
      "shipped",
      "refunded",
    ] as const;
    if (disallowed.includes(order.status as any)) {
      return {
        success: true,
        message: "Order not pending; nothing to do.",
      } as const;
    }

    // Ensure units match Paystack (kobo). If your `totalAmount` is in naira, multiply by 100.
    const expected = order.totalAmount * 100;

    try {
      await Promise.all(
        references.map(async (ref) => {
          const result = await verifyPaystackPayment(ref, expected);

          console.log(result, "This is paystack result");

          if (order.status === "paid" && result.success && reference === ref) {
            // refund that reference here
            return console.log(
              "Reference with ref number: " +
                ref +
                " has succesfully been refunded becuase the order was already paid for "
            );
          }
          if (result.success) {
            await ctx.runMutation(internal.order._setOrderVerified, {
              orderId: order._id,
            });
            await ctx.runMutation(internal.order.completeOrder, { reference });
            return { success: true } as const;
          }

          const providerStatus = (result as any)?.data?.status;
          if (
            providerStatus &&
            ["failed", "abandoned", "reversed"].includes(providerStatus)
          ) {
            await ctx.runMutation(internal.order._markOrderPaymentFailed, {
              orderId: order._id,
              providerStatus,
              message: (result as any)?.data?.message,
            });
            return {
              success: false,
              statusCode: 400,
              message: "Payment failed",
              providerStatus,
            } as const;
          }

          // all above failed bump the payment verifcation by some time
          await ctx.runMutation(internal.order._bumpPaymentVerifyBackoff, {
            orderId: order._id,
            errorMessage:
              (result as any)?.data?.message || providerStatus || "Unverified",
          });
          return {
            success: false,
            statusCode: 202,
            message: "Verification deferred",
          } as const;
        })
      );
    } catch (e: any) {
      console.log(e.message);
      console.log("encountered an error");
      await ctx.runMutation(internal.order._bumpPaymentVerifyBackoff, {
        orderId: order._id,
        errorMessage: e?.message ?? "Verify error",
      });
      return {
        success: false,
        statusCode: 500,
        message: "Verification error",
      } as const;
    }
  },
});

// Internal helper query so actions can read an order
export const _getOrderById = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    return (await ctx.db.get(orderId)) as Doc<"orders"> | null;
  },
});

// Internal action to sweep for orders needing refund processing
export const _sweepPendingRefunds = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { limit }
  ): Promise<{ success: boolean; count: number }> => {
    const now = Date.now();
    const eligibleOrderIds = await ctx.runQuery(
      internal.order._listRefundEligibleOrders,
      { limit: limit ?? 50 }
    );

    for (const orderId of eligibleOrderIds) {
      await ctx.runAction(internal.order.processRefund, { orderId });
    }

    return { success: true, count: eligibleOrderIds.length };
  },
});

// Internal query to list orders eligible for refund processing
export const _listRefundEligibleOrders = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<Id<"orders">[]> => {
    const now = Date.now();
    const all = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          q.neq(q.field("refundDue"), undefined),
          q.gt(q.field("refundDue"), 0),
          q.or(
            q.eq(q.field("refundStatus"), "pending"),
            q.eq(q.field("refundStatus"), "failed")
          ),
          q.or(
            q.eq(q.field("nextRefundAt"), undefined),
            q.lte(q.field("nextRefundAt"), now)
          )
        )
      )
      .collect();

    return (limit ? all.slice(0, limit) : all).map((o) => o._id);
  },
});
