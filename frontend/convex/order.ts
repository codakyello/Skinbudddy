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
import { Country, ReferenceStatus } from "./schema";
import { Id } from "./_generated/dataModel";
import { Doc } from "./_generated/dataModel";
import { generateToken } from "./_utils/internalUtils";

/**
 * Verify Paystack payment using reference and expected amount.
 * Returns { success, data } where success indicates verified and data is the raw API response.
 */
type PendingAction = {
  id: string;
  prompt: string;
  status: "pending" | "completed" | "dismissed";
  type:
    | "create_routine"
    | "update_routine"
    | "create_routine_in_progress"
    | "create_routine_completed";
  data: {
    productsToadd?: string[]; // or Id<"products">[] if you're using Convex Id type
    routineId?: string;
    orderId?: Id<"orders">;
  };
  createdAt: number;
  expiresAt?: number;
};

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
    additionalAddress: v.optional(v.string()),
    fullAddress: v.optional(v.string()),
    createRoutine: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      address,
      additionalAddress,
      fullAddress,
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
      createRoutine,
    }
  ) => {
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

      if (cartItems.length === 0) {
        return { success: false, message: "Cart is empty", statusCode: 400 };
      }

      const discrepancies: Array<{
        cartId: Id<"carts">;
        productId: Id<"products">;
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
              cartId: item._id,
              productId: product._id,
              reason: `Ordered ${item.quantity}, only ${size.stock} left in stock`,
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
        createRoutine,
        ...(effectiveType === "pay_for_me" ? { token, tokenExpiry } : {}),
      });

      // Update the user's saved billing profile with latest checkout info (if user doc exists)
      const userDoc = await ctx.db
        .query("users")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();

      if (userDoc) {
        const userPatch: any = {
          // Keep a simple canonical address for quick display/search
          address: address,
          // Store granular fields too (schema supports these)
          streetAddress: streetAddress,
          additionalAddress: additionalAddress,
          fullAddress:
            fullAddress ??
            [streetAddress, additionalAddress].filter(Boolean).join(", "),
          city,
          state,
          country,
          companyName,
          firstName,
          lastName,
          email,
          phone,
        };

        // Avoid writing explicit undefined values
        Object.keys(userPatch).forEach((k) => {
          if (typeof userPatch[k] === "undefined") delete (userPatch as any)[k];
        });

        await ctx.db.patch(userDoc._id, userPatch);
      }

      return {
        success: true,
        orderId,
        ...(effectiveType === "pay_for_me" ? { token, tokenExpiry } : {}),
      } as const;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Unable to create order.";
      return { success: false, message };
    }
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
  },
  handler: async (ctx, { orderId, reference }) => {
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

      // Idempotently create reference: avoid duplicates
      const existingRef = await ctx.db
        .query("orderReferences")
        .withIndex("by_reference", (q) => q.eq("reference", reference))
        .first();
      if (!existingRef) {
        await ctx.db.insert("orderReferences", {
          orderId: order._id,
          reference,
          status: "pending",
          createdAt: Date.now(),
        });
      } else if (existingRef.status === "pending") {
        // ensure it's pending; otherwise, leave as-is
        await ctx.db.patch(existingRef._id, { status: "pending" });
      }
      await ctx.db.patch(orderId, {
        paymentVerifyStatus: "pending",
        paymentVerifyAttempts: 0,
        nextPaymentVerifyAt: Date.now(),
      } as any);
      return { success: true, message: "Order updated" };
    } catch (err) {
      return { success: false };
    }
  },
});

export const completeOrder = internalMutation({
  args: {
    reference: v.string(),
  },
  handler: async (ctx, { reference }) => {
    console.log("entered complete order");
    try {
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
        if (
          !prod ||
          !(prod as any).sizes ||
          !(prod as any).sizes[step.sizeIndex]
        )
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
      const refundAmount = shortages.reduce((sum, s) => sum + s.refund, 0);
      const anyFulfilled = fulfillPlan.some((p) => p.fulfillQty > 0);

      const reason =
        order.status === "paid"
          ? "Order already paid for"
          : anyFulfilled
            ? "Some of the products are out of stock. Partial refund of " +
              "₦" +
              refundAmount
            : "All products out of stock. Full refund of " + "₦" + refundAmount;

      // for refundDue we will save a list of references and their correspondnig refund amount

      if (shortages.length > 0) {
        // Partial or zero fulfillment
        const fulfillmentStatus = anyFulfilled ? "partial" : "none";
        await ctx.db.patch(order._id, {
          status: anyFulfilled ? "paid" : "out_of_stock",
          fulfillmentStatus,
          shortages: shortages,
          refundDue: [
            ...(order.refundDue ?? []),
            {
              reference,
              amount: refundAmount,
              reason,
              status: "pending",
              attempts: 0,
              nextRefundAt: Date.now(),
              providerRefundId: undefined,
              processedAt: undefined,
              lastRefundError: undefined,
              lastRefundHttpStatus: undefined,
              lastRefundErrorCode: undefined,
              lastRefundPayload: undefined,
            },
          ],
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
        //we have to know the reference to process a refund too

        // lets update the orderReference
        if (anyFulfilled) {
          console.log("partial refunded");
          // save as partial refunded
          await ctx.db.patch(ref._id, { status: "partial_refund" });
        } else {
          // save as refunded
          console.log("fully refunded");

          await ctx.db.patch(ref._id, { status: "to_be_refunded" });
        }

        // run the refund function, for the reference
        await ctx.scheduler.runAfter(0, internal.order.processRefund, {
          orderId: order._id,
        });

        // // 2) Idempotency and status gates
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
          refundAmount,
        } as const;

        // mark that reference as partial refund
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
        // refundDue: 0,
      } as any);

      // Clear the user's cart (synchronously) to finalize checkout
      const userCartItems = await ctx.db
        .query("carts")
        .filter((q) => q.eq(q.field("userId"), order.userId))
        .collect();
      await Promise.all(userCartItems.map((ci) => ctx.db.delete(ci._id)));

      // Defer heavier post-completion side effects (building pendingActions, etc.)
      // Run shortly after commit without blocking the mutation
      ctx.scheduler.runAfter(0, internal.order.postCompleteOrderSideEffects, {
        orderId: order._id,
      });

      return {
        success: true,
        message: "Order completed and stock updated.",
      } as const;
    } catch (err) {
      return {
        status: false,
        message: "Could not complete your order!",
      };
    }
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

    // Ensure at least one item is still in stock; otherwise treat link as unavailable
    try {
      const products = await Promise.all(
        order.items.map((it) => ctx.db.get(it.productId))
      );
      let anyInStock = false;
      for (let i = 0; i < order.items.length; i++) {
        const it = order.items[i] as any;
        const prod = products[i] as any;
        if (!prod || !prod.sizes) continue;
        const idx = prod.sizes.findIndex((s: any) => s.id === it.sizeId);
        if (idx === -1 || idx === undefined) continue;
        const stock = prod.sizes[idx]?.stock ?? 0;
        if (stock > 0) {
          anyInStock = true;
          break;
        }
      }
      if (!anyInStock) {
        return {
          success: false,
          statusCode: 404,
          message: "This link is invalid or no longer available.",
        } as const;
      }
    } catch {
      // If stock check fails unexpectedly, be conservative and hide link
      return {
        success: false,
        statusCode: 404,
        message: "This link is invalid or no longer available.",
      } as const;
    }

    return { success: true, order } as const;
  },
});

// not a public function endpoint
export const updateRefundState = internalMutation({
  args: {
    orderId: v.id("orders"),
    reference: v.string(),
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
      reference,
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

    const items = Array.isArray((order as any).refundDue)
      ? (order as any).refundDue
      : [];
    const idx = items.findIndex((r: any) => r?.reference === reference);
    if (idx === -1)
      return {
        success: false,
        statusCode: 404,
        message: "Refund item not found",
      } as const;

    const current = items[idx] || {};

    if (success) {
      items[idx] = {
        ...current,
        status: "processed",
        providerRefundId,
        processedAt: Date.now(),
        nextRefundAt: undefined,
        lastRefundError: undefined,
        lastRefundHttpStatus: undefined,
        lastRefundErrorCode: undefined,
        lastRefundPayload: undefined,
      };
    } else {
      const attempts = Math.max(0, Number(current?.attempts ?? 0)) + 1;
      const steps = [
        60_000,
        5 * 60_000,
        15 * 60_000,
        60 * 60_000,
        6 * 60 * 60_000,
        24 * 60 * 60_000,
      ];
      const base = steps[Math.min(attempts - 1, steps.length - 1)];
      const jitter = Math.floor(base * (0.1 + Math.random() * 0.2));
      const nextRefundAt = Date.now() + base + jitter;
      items[idx] = {
        ...current,
        status: "failed",
        attempts,
        lastRefundAttemptAt: Date.now(),
        lastRefundError: errorMessage,
        lastRefundHttpStatus,
        lastRefundErrorCode,
        lastRefundPayload,
        nextRefundAt,
      };
    }

    await ctx.db.patch(orderId, { refundDue: items } as any);
    return { success: true } as const;
  },
});

// Enqueue a refund item for a given reference on an order (idempotent-ish)
export const _enqueueRefundItem = internalMutation({
  args: {
    orderId: v.id("orders"),
    reference: v.string(),
    amount: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, reference, amount, reason }) => {
    const order = (await ctx.db.get(orderId)) as Doc<"orders"> | null;
    if (!order)
      return {
        success: false,
        statusCode: 404,
        message: "Order not found",
      } as const;

    const items: Array<any> = Array.isArray((order as any).refundDue)
      ? (order as any).refundDue
      : [];

    const idx = items.findIndex((r: any) => r?.reference === reference);
    if (idx !== -1) {
      const current = items[idx] || {};
      if (current?.status === "processed") {
        return { success: true } as const; // already processed; no-op
      }
      items[idx] = {
        ...current,
        reference,
        amount,
        reason: reason ?? current?.reason ?? "duplicate_payment",
        status: current?.status ?? "pending",
        attempts: current?.attempts ?? 0,
        nextRefundAt: Date.now(),
        providerRefundId: current?.providerRefundId,
        processedAt: current?.processedAt,
        lastRefundError: undefined,
        lastRefundHttpStatus: undefined,
        lastRefundErrorCode: undefined,
        lastRefundPayload: undefined,
      };
    } else {
      items.push({
        reference,
        amount,
        reason: reason ?? "duplicate_payment",
        status: "pending",
        attempts: 0,
        nextRefundAt: Date.now(),
        providerRefundId: undefined,
        processedAt: undefined,
        lastRefundError: undefined,
        lastRefundHttpStatus: undefined,
        lastRefundErrorCode: undefined,
        lastRefundPayload: undefined,
      });
    }

    await ctx.db.patch(orderId, {
      refundDue: items,
      refundStatus: "pending",
      refundAttempts: (order as any).refundAttempts ?? 0,
      refundReason:
        reason ?? (order as any).refundReason ?? "duplicate_payment",
      lastRefundAttemptAt: undefined,
      lastRefundError: undefined,
      refundProviderId: undefined,
      nextRefundAt: Date.now(),
    } as any);

    return { success: true } as const;
  },
});

// this is a cron job: what if our cron job fails and it retries, how do we handle that?
export const processRefund = internalAction({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, { orderId }) => {
    const order: Doc<"orders"> | null = await ctx.runQuery(
      internal.order._getOrderById,
      { orderId }
    );
    if (!order) return;

    const items: Array<any> = Array.isArray((order as any).refundDue)
      ? (order as any).refundDue
      : [];
    if (items.length === 0) return;

    const now = Date.now();
    const eligible = items.find(
      (it) =>
        (it?.amount ?? 0) > 0 &&
        ["pending", "failed"].includes(it?.status ?? "pending") &&
        (typeof it?.nextRefundAt === "undefined" || it?.nextRefundAt <= now)
    );
    if (!eligible) return;

    const reference = eligible.reference;
    if (!reference) return;

    const idempotencyKey = `refund-${reference}`;

    try {
      // TODO: call PSP refund API here using `reference` and `eligible.amount` and `idempotencyKey`
      const providerRefundId = idempotencyKey;
      await ctx.runMutation(internal.order.updateRefundState, {
        orderId,
        reference,
        success: true,
        providerRefundId,
      });
    } catch (e: any) {
      const errObj = typeof e === "object" && e !== null ? e : {};
      await ctx.runMutation(internal.order.updateRefundState, {
        orderId,
        reference,
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

// cron job calls this
export const verifyPendingPaymentsSweep = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { limit }
  ): Promise<{ success: boolean; count: number }> => {
    const ids = await ctx.runQuery(api.order._listPendingReferencesForVerify, {
      limit: limit ?? 50,
    });

    console.log(ids);

    for (const id of ids) {
      try {
        await ctx.runAction(internal.order.verifyPaymentForReference, {
          referenceId: id,
        });
      } catch (error) {
        console.error("verifyPaymentForReference failed", {
          referenceId: id,
          error,
        });
      }
    }
    return { success: true, count: ids.length };
  },
});

// export const verifyPendingPaymentsSweepTest = action({
//   args: { limit: v.optional(v.number()) },
//   handler: async (
//     ctx,
//     { limit }
//   ): Promise<{ success: boolean; count: number }> => {
//     const ids = await ctx.runQuery(api.order._listPendingReferencesForVerify, {
//       limit: limit ?? 50,
//     });

//     console.log(ids);

//     for (const id of ids) {
//       await ctx.runAction(internal.order.verifyPaymentForReference, {
//         referenceId: id,
//       });
//     }
//     return { success: true, count: ids.length };
//   },
// });

export const _listPendingReferencesForVerify = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    // const now = Date.now();
    // const all = await ctx.db
    //   .query("orders")
    //   .filter((q) => q.eq(q.field("status"), "pending"))
    //   .collect();

    //lets look for all pending references
    const eligible = await ctx.db
      .query("orderReferences")
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // orderReference: v.object({
    //   orderId: v.id("orders"),
    //   reference: v.string(),
    //   refStatus: ReferenceStatus,
    //   orderStatus: OrderStatus,
    // }),

    // const eligibleRaw = await Promise.all(
    //   pendingReferences.map(async (ref) => {
    //     const order = await ctx.db.get(ref.orderId);
    //     if (!order) return null;
    //     return {
    //       orderId: ref.orderId,
    //       reference: ref.reference,
    //       refStatus: ref.status,
    //       orderStatus: order.status,
    //     };
    //   })
    // );

    // const eligible = eligibleRaw.filter(
    //   (x): x is NonNullable<typeof x> => x !== null
    // );

    // const eligible = all.filter((o: any) => {
    //   if (!o.reference) return false;
    //   if (
    //     o.paymentVerifyStatus &&
    //     !["pending", "failed_temp"].includes(o.paymentVerifyStatus)
    //   )
    //     return false;
    //   if (!o.nextPaymentVerifyAt) return true;
    //   return o.nextPaymentVerifyAt <= now;
    // });

    return (limit ? eligible.slice(0, limit) : eligible).map((o) => o._id);
  },
});

export const _markOrderPaymentFailed = internalMutation({
  args: {
    orderId: v.id("orders"),
    providerStatus: v.string(),
    message: v.optional(v.string() || null),
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

// const ref = await ctx.db
//   .query("orderReferences")
//   .withIndex("by_reference", (q) => q.eq("reference", reference))
//   .first();

export const _getOrderReferenceById = internalQuery({
  args: { referenceId: v.id("orderReferences") },
  handler: async (ctx, { referenceId }) => {
    return await ctx.db.get(referenceId);
  },
});

export const verifyPaymentForReference = internalAction({
  args: {
    referenceId: v.id("orderReferences"),
  },
  handler: async (ctx, { referenceId }) => {
    // const orderReference = await ctx.runQuery(
    //   internal.order._getOrderReference,
    //   {
    //     reference,
    //   }
    // );

    const orderReference = await ctx.runQuery(
      internal.order._getOrderReferenceById,
      {
        referenceId,
      }
    );

    if (!orderReference) return;

    const reference = orderReference.reference;

    const order = await ctx.runQuery(internal.order._getOrderById, {
      orderId: orderReference.orderId,
    });

    if (!order) return;

    // if (!orderReference) return;

    // Auto-fail very old pending orders (24h window)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    if (Date.now() - orderReference.createdAt! > TWENTY_FOUR_HOURS) {
      await ctx.runMutation(internal.order._markOrderPaymentFailed, {
        orderId: order._id,
        providerStatus: "expired",
        message: "Pending > 24h without successful verification",
      });

      await ctx.runMutation(internal.order._setOrderReferenceStatus, {
        status: "failed",
        reference,
      });

      return;
    }
    const paid = order.status === "paid";
    const expected = order.totalAmount * 100;
    try {
      const result = await verifyPaystackPayment(reference, expected);
      if (result.success) {
        // Mark verification success (defense-in-depth) then run completion (idempotent)
        if (!paid) {
          await ctx.runMutation(internal.order._setOrderVerified, {
            orderId: order._id,
          });

          await ctx.runMutation(internal.order.completeOrder, {
            reference: orderReference.reference,
          });
          return;
        } else {
          // if paid lets refund that reference
          await ctx.runMutation(internal.order._setOrderReferenceStatus, {
            status: "to_be_refunded",
            reference,
          });
        }
      }

      // Not verified. If provider returns an explicit terminal state, mark failed.
      const providerStatus = (result as any)?.data?.status;
      if (
        providerStatus &&
        ["failed", "abandoned", "reversed"].includes(providerStatus)
      ) {
        await ctx.runMutation(internal.order._markOrderPaymentFailed, {
          orderId: orderReference.orderId,
          providerStatus,
          message: (result as any)?.data?.message,
        });
        return;
      }

      // Else, schedule another verify attempt with backoff
      await ctx.runMutation(internal.order._bumpPaymentVerifyBackoff, {
        orderId: orderReference.orderId,
        errorMessage:
          (result as any)?.data?.message || providerStatus || "Unverified",
      });
    } catch (e: any) {
      await ctx.runMutation(internal.order._bumpPaymentVerifyBackoff, {
        orderId: orderReference.orderId,
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

export const _setOrderReferenceStatus = internalMutation({
  args: {
    reference: v.string(), // <-- this is the actual reference string
    status: ReferenceStatus,
  },
  handler: async (ctx, { reference, status }) => {
    const refDoc = await ctx.db
      .query("orderReferences")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first();

    if (!refDoc) {
      console.log("reference not found");
      throw new Error("Reference not found");
    }

    // probably a fragile fix, think about a better solution later
    if (refDoc.status === "pending") {
      await ctx.db.patch(refDoc._id, { status });
    }
    // No explicit return here, let the async function complete.
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

    // it will return here
    // not equal so paid, refund return

    const disallowed = ["draft", "failed", "shipped", "refunded"] as const;
    if (disallowed.includes(order.status as any)) {
      return {
        success: true,
        message: "Order not pending; nothing to do.",
      } as const;
    }

    // Ensure units match Paystack (kobo). If your `totalAmount` is in naira, multiply by 100.
    const expected = order.totalAmount * 100;

    try {
      let paid = order.status === "paid"; // snapshot; we'll also set this once we complete
      let outOfStock = order.status === "out_of_stock"; // a payment went through but product is out_of_stock
      let refunded = order.status === "refunded"; //test: a payment went through but product is out_of_stock
      let anyDeferred = false;

      for (const ref of references) {
        // we are looping to look for one successful other reference in the many references

        const result = await verifyPaystackPayment(ref, expected);

        if ((paid || outOfStock) && result.success && reference !== ref) {
          console.log(
            "already fulfilled, paid or outofstock, refund the reference"
          );
          // successful but already paid for, refund order

          await ctx.runMutation(internal.order._setOrderReferenceStatus, {
            reference,
            status: "to_be_refunded",
          });

          // Enqueue refund item via internal mutation (actions cannot patch DB)
          await ctx.runMutation(internal.order._enqueueRefundItem, {
            orderId: order._id,
            reference,
            amount: order.totalAmount,
            reason: "duplicate_payment",
          });

          // Trigger immediate refund processing
          await ctx.runAction(internal.order.processRefund, {
            orderId: order._id,
          });

          return;
        }

        if (!result.success) console.log("payment not received");

        // successful but not paid for, complete order and return
        if (result.success && !paid) {
          console.log("order complete");
          // Mark verified then complete using the CURRENT ref that succeeded
          await ctx.runMutation(internal.order._setOrderVerified, {
            orderId: order._id,
          });
          await ctx.runMutation(internal.order.completeOrder, {
            reference: ref,
          });

          // Mark the  reference as consumed (optional but useful)
          await ctx.runMutation(internal.order._setOrderReferenceStatus, {
            reference,
            status: "paid",
          });

          return;
        }

        // only when not successful do we keep looping to look for the successful one
        // Else, remember we deferred and continue checking other refs
        await ctx.runMutation(internal.order._bumpPaymentVerifyBackoff, {
          orderId: order._id,
          errorMessage: (result as any)?.data?.message || "Unverified",
        });
        anyDeferred = true;
      }

      if (paid) {
        return { success: true } as const;
      }

      if (anyDeferred) {
        return {
          success: false,
          statusCode: 202,
          message: "Verification deferred",
        } as const;
      }

      // If we got here with no success and no explicit provider failure, treat as generic defer
      return {
        success: false,
        statusCode: 202,
        message: "Verification deferred",
      } as const;
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

    // First, do coarse filtering server-side on fields Convex can index/filter directly
    const coarse = await ctx.db
      .query("orders")
      .filter((q) =>
        q.and(
          // refundDue must exist (we'll inspect contents below)
          q.neq(q.field("refundDue"), undefined),
          // Only process when status is pending or previously failed
          q.or(
            q.eq(q.field("refundStatus"), "pending"),
            q.eq(q.field("refundStatus"), "failed")
          ),
          // Respect backoff: run if nextRefundAt is unset or due
          q.or(
            q.eq(q.field("nextRefundAt"), undefined),
            q.lte(q.field("nextRefundAt"), now)
          )
        )
      )
      .collect();

    // Refine in application code: at least one entry with (amount > 0) AND (status is 'pending' or 'failed') AND (nextRefundAt unset or due)
    const eligible = coarse.filter((o: any) => {
      const arr = Array.isArray(o.refundDue) ? o.refundDue : [];
      const nowLocal = Date.now();
      return arr.some(
        (r: any) =>
          (r?.amount ?? 0) > 0 &&
          ["pending", "failed"].includes(r?.status ?? "pending") &&
          (typeof r?.nextRefundAt === "undefined" ||
            r?.nextRefundAt <= nowLocal)
      );
    });

    const sliced = limit ? eligible.slice(0, limit) : eligible;
    return sliced.map((o: any) => o._id as Id<"orders">);
  },
});

// --- Helper queries and mutation for postCompleteOrderSideEffects ---
export const _getUserByExternalId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

export const _getProductById = internalQuery({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    return (await ctx.db.get(productId)) as Doc<"products"> | null;
  },
});

export const _getCategoryById = internalQuery({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, { categoryId }) => {
    return (await ctx.db.get(categoryId)) as Doc<"categories"> | null;
  },
});

export const _appendUserPendingAction = internalMutation({
  args: {
    userDocId: v.id("users"),
    action: v.any(),
  },
  handler: async (ctx, { userDocId, action }) => {
    const doc = await ctx.db.get(userDocId);
    if (!doc) return;
    const existing = Array.isArray((doc as any).pendingActions)
      ? (doc as any).pendingActions
      : [];
    await ctx.db.patch(userDocId, {
      pendingActions: [...existing, action],
    } as any);
  },
});

export const _setUserPendingActionStatus = internalMutation({
  args: {
    userDocId: v.id("users"),
    actionId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("dismissed")
    ),
  },
  handler: async (ctx, { userDocId, actionId, status }) => {
    const doc = await ctx.db.get(userDocId);
    if (!doc) return;

    const actions: Array<any> = Array.isArray((doc as any).pendingActions)
      ? (doc as any).pendingActions
      : [];
    const idx = actions.findIndex((a) => String(a?.id) === actionId);
    if (idx === -1) return;

    actions[idx] = { ...(actions[idx] || {}), status };
    await ctx.db.patch(userDocId, { pendingActions: actions } as any);
  },
});

export const postCompleteOrderSideEffects = internalAction({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order: Doc<"orders"> | null = await ctx.runQuery(
      internal.order._getOrderById,
      { orderId }
    );
    console.log("postcompleteordersideeffect");
    try {
      if (!order) return;

      console.log(order, "this is order");

      // Look up the user document by external userId (not the Convex _id)
      const userDoc = order?.userId
        ? await ctx.runQuery(internal.order._getUserByExternalId, {
            userId: order.userId,
          })
        : null;
      if (!userDoc) return;

      // Load products from the order items, not from cart (cart is already cleared)
      const productDocsRaw = await Promise.all(
        order.items.map((it) =>
          ctx.runQuery(internal.order._getProductById, {
            productId: it.productId,
          })
        )
      );
      const products: Doc<"products">[] = productDocsRaw.filter(
        (p: Doc<"products"> | null): p is Doc<"products"> => p !== null
      );

      // Build category map
      const allCategoryIds = Array.from(
        new Set(products.flatMap((p) => p.categories as Id<"categories">[]))
      );
      const categoryDocsRaw = await Promise.all(
        allCategoryIds.map((cid) =>
          ctx.runQuery(internal.order._getCategoryById, { categoryId: cid })
        )
      );
      const categoryMap = new Map<Id<"categories">, Doc<"categories">>(
        categoryDocsRaw
          .filter(
            (c: Doc<"categories"> | null): c is Doc<"categories"> => c !== null
          )
          .map((c: Doc<"categories">) => [c._id as Id<"categories">, c])
      );

      // Enrich products with populated categories
      const enriched = products.map((p: Doc<"products">) => ({
        ...p,
        categories: (p.categories as Id<"categories">[])
          .map((cid) => categoryMap.get(cid) || null)
          .filter(
            (c: Doc<"categories"> | null): c is Doc<"categories"> => c !== null
          ),
      }));

      // Checks
      const hasCategory = (slug: string) =>
        enriched.some(
          (prod: (typeof enriched)[number]) =>
            prod.categories.some(
              (c) => (c.slug || c.name)?.toLowerCase() === slug
            ) && prod.canBeInRoutine
        );

      // const productCanBeInRoutine = enriched.some(
      //   (prod) => prod.canBeInRoutine
      // );
      const hasCoreProducts = ["moisturiser", "cleanser", "sunscreen"].every(
        (s) => hasCategory(s)
      );

      // if a user orders multiple core products what are we doing

      // if a user includes a product that can be in routine with core products

      // TODO: Replace with actual routine lookup per user
      const hasRoutine = false;

      // Create action to create a brand new routine if user has no routine but core products available
      // Todo
      // productCanBeInRoutine dosent work best this way. Fix later
      // const names = enriched.map((p) => p.name);
      // const preview = names.slice(0, 2).join(", ");
      // const extra = Math.max(0, names.length - 2);
      // const prompt =
      //   extra > 0
      //     ? `Would you like us to help you build a skincare routine including ${preview} and ${extra} other product(s) to your routine?`
      //     : `Would you like us to create a routine ${preview} to your routine?`;
      // if (!hasRoutine && hasCoreProducts) {
      //   console.log("here in create routine pending action");

      //   // only productIds that can be included in a routine
      //   const productIds = enriched
      //     .filter((p) => p.canBeInRoutine)
      //     .map((p) => p._id);
      //   const action: PendingAction = {
      //     id: generateToken(),
      //     prompt,
      //     status: "pending",
      //     type: "create_routine",
      //     data: { productsToadd: productIds as any },
      //     createdAt: Date.now(),
      //     expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      //   };

      //   console.log("action created");
      //   await ctx.runMutation(internal.order._appendUserPendingAction, {
      //     userDocId: userDoc._id,
      //     action: action as any,
      //   });
      // }

      // lets create the routine straight up here

      const productIds = enriched
        .filter((p) => p.canBeInRoutine)
        .map((p) => p._id);

      if (order.createRoutine && productIds.length) {
        console.log("added a creating routine pending action");
        const creatingAction: PendingAction = {
          id: generateToken(),
          prompt: "We are building your new skincare routine",
          status: "pending",
          type: "create_routine_in_progress",
          data: { orderId: order._id },
          createdAt: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000,
        } as any;

        await ctx.runMutation(internal.order._appendUserPendingAction, {
          userDocId: userDoc._id,
          action: creatingAction as any,
        });

        try {
          const routine = await ctx.runAction(api.routine.createRoutine, {
            productIds: productIds as Id<"products">[],
            userId: order.userId,
            pendingActionId: creatingAction.id,
            orderId,
          } as any);

          if (!routine.success) throw Error(routine.message);
        } catch (e) {
          console.error("createRoutine failed", {
            orderId,
            message: (e as any)?.message,
          });
          try {
            await ctx.runMutation(
              (internal.order as any)._removeUserPendingAction,
              {
                userDocId: userDoc._id,
                actionId: creatingAction.id,
              }
            );
          } catch (cleanupErr) {
            console.warn("cleanup creating pending action failed", {
              orderId,
              pendingActionId: creatingAction.id,
              message: (cleanupErr as any)?.message,
            });
          }
        }
      }

      // Suggest complementary items to add to existing routine
      const CORE = new Set(["moisturiser", "cleanser", "sunscreen"]);
      // not like this we use Ai to decide
      const complementary = enriched.filter(
        (prod) =>
          prod.canBeInRoutine &&
          !prod.categories.some((c) =>
            CORE.has((c.slug || c.name).toLowerCase())
          )
      );

      console.log(complementary, "This is complementary product");

      // has routine and there is complemntary product (Ai decides)
      if (hasRoutine && complementary.length > 1) {
        console.log("here in updating routine pending action");
        const names = complementary.map((p) => p.name);
        const preview = names.slice(0, 2).join(", ");
        const extra = Math.max(0, names.length - 2);
        const prompt =
          extra > 0
            ? `Would you like us to add ${preview} and ${extra} other product(s) to your routine?`
            : `Would you like us to add ${preview} to your routine?`;

        const action: PendingAction = {
          id: generateToken(),
          prompt,
          status: "pending",
          type: "update_routine",
          data: {
            productsToadd: enriched.map((p) => p._id) as any,
            routineId: "id_",
          },
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        };
        await ctx.runMutation(internal.order._appendUserPendingAction, {
          userDocId: userDoc._id,
          action: action as any,
        });
      }
    } catch (err: any) {
      console.error("postCompleteOrderSideEffects failed", {
        orderId,
        message: err?.message,
        stack: err?.stack,
      });
      // swallow error to avoid scheduler retries
      return;
    }
  },
});
