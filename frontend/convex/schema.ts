import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const Country = v.union(
  v.literal("Nigeria")
  // Add other countries here if needed
);

export const OrderType = v.union(v.literal("normal"), v.literal("pay_for_me"));

export const OrderStatus = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("paid"),
  v.literal("failed"), //payment error status
  v.literal("out_of_stock"), //failed due to insufficient inventory
  v.literal("shipped"),
  v.literal("refunded")
);

// should the status and payment status be together
// it can be because the payment and the order status are tightly coupled
// it is only when payment is verified that we update status
export const FulfillmentStatus = v.union(
  v.literal("none"),
  v.literal("partial"),
  v.literal("full")
);

export const ReferenceStatus = v.union(
  v.literal("paid"),
  v.literal("pending"),
  v.literal("refunded"),
  v.literal("partial_refund"),
  v.literal("failed"),
  v.literal("to_be_refunded")
);

export const RefundItemStatus = v.union(
  v.literal("pending"),
  v.literal("processed"),
  v.literal("failed")
);

export default defineSchema({
  users: defineTable({
    userId: v.string(),
    email: v.optional(v.string()),
    clerkId: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    // after the first order, we will save the address, city, state, zip, country, companyName, firstName, lastName to the user
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    companyName: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    createdAt: v.number(),
    hasUsedRecommender: v.optional(v.boolean()),
    aiBuilderUsed: v.optional(v.boolean()),
  }).index("by_userId", ["userId"]),

  products: defineTable({
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.string(),
    price: v.number(),
    stock: v.number(),
    brandId: v.optional(v.id("brands")),
    categories: v.optional(v.array(v.id("categories"))), // facewash, toner, serum
    images: v.array(v.string()),
    promoImage: v.optional(v.string()),
    createdAt: v.number(),
    isNew: v.optional(v.boolean()),
    isBestseller: v.optional(v.boolean()),
    isTrending: v.optional(v.boolean()),
    discount: v.optional(v.number()),
    ingredients: v.optional(v.number()),
    skinType: v.optional(v.array(v.string())),
    routineId: v.optional(v.string()),
    fragranceFree: v.optional(v.boolean()),
    alcoholFree: v.optional(v.boolean()),
    stockAlertEmails: v.optional(v.array(v.string())),

    sizes: v.optional(
      v.array(
        v.object({
          id: v.string(),
          size: v.number(),
          price: v.number(),
          discount: v.optional(v.number()),
          stock: v.number(),
          unit: v.string(),
        })
      )
    ),
  }),

  brands: defineTable({
    name: v.string(),
    slug: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  carts: defineTable({
    userId: v.string(),
    productId: v.id("products"),
    sizeId: v.optional(v.string()), // For size variants
    quantity: v.number(),
    createdAt: v.number(),
    recommended: v.optional(v.boolean()), // default to false
  }),

  // find user cart with token to implement pay for others feature
  cartSessions: defineTable({
    userId: v.string(),
    token: v.string(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  }),

  wishlists: defineTable({
    userId: v.string(),
    productId: v.id("products"),
    createdAt: v.number(),
  }),

  orders: defineTable({
    userId: v.string(),
    items: v.array(
      v.object({
        productId: v.id("products"),
        sizeId: v.optional(v.string()), // For size variants
        quantity: v.number(),
        price: v.number(), // lets save the static price becuase we dont want changes in price if we link it by product id
      })
    ),
    fulfilledItems: v.optional(
      v.array(
        v.object({
          productId: v.id("products"),
          sizeId: v.optional(v.string()),
          quantity: v.number(),
          price: v.number(),
        })
      )
    ),
    fulfilledAmount: v.optional(v.number()),
    totalAmount: v.number(),
    status: OrderStatus,
    // reference: v.optional(v.array(v.string())),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    phone: v.string(),
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    companyName: v.optional(v.string()),
    country: Country,
    createdAt: v.number(),
    streetAddress: v.optional(v.string()),
    deliveryNote: v.optional(v.string()),
    orderType: v.optional(v.string()),

    // access token for sharing order details
    token: v.optional(v.string()),
    tokenExpiry: v.optional(v.number()),

    // Fulfillment details
    fulfillmentStatus: v.optional(FulfillmentStatus),
    shortages: v.optional(
      v.array(
        v.object({
          productId: v.id("products"),
          sizeId: v.optional(v.string()),
          requested: v.number(),
          available: v.number(),
          shortBy: v.number(),
          refund: v.number(),
        })
      )
    ),
    refundDue: v.optional(
      v.array(
        v.object({
          reference: v.string(),
          amount: v.number(),
          reason: v.string(),
          status: RefundItemStatus,
          attempts: v.optional(v.number()),
          nextRefundAt: v.optional(v.number()),
          providerRefundId: v.optional(v.string()),
          processedAt: v.optional(v.number()),
          lastRefundError: v.optional(v.string()),
          lastRefundHttpStatus: v.optional(v.number()),
          lastRefundErrorCode: v.optional(v.string()),
          lastRefundPayload: v.optional(v.any()),
          lastRefundAttemptAt: v.optional(v.number()),
        })
      )
    ),

    // DEPRECATED: order-level refund fields kept for backwards-compatibility; use per-item fields inside refundDue[].
    refundProcessed: v.optional(v.boolean()), // default false
    refundProcessedAt: v.optional(v.number()),

    // Refund workflow state
    refundStatus: v.optional(
      v.union(
        v.literal("none"),
        v.literal("pending"),
        v.literal("processed"),
        v.literal("failed")
      )
    ),
    refundAttempts: v.optional(v.number()),
    lastRefundAttemptAt: v.optional(v.number()),
    lastRefundError: v.optional(v.string()),
    refundReason: v.optional(v.string()),
    refundProviderId: v.optional(v.string()),
    nextRefundAt: v.optional(v.number()),

    // Payment verification workflow (used by cron + completion guard)
    paymentVerifyStatus: v.optional(v.string()), // e.g., "pending", "failed_temp", "verified", provider terminal codes
    paymentVerifyAttempts: v.optional(v.number()),
    nextPaymentVerifyAt: v.optional(v.number()),
    paymentVerifiedAt: v.optional(v.number()),

    // Structured refund error fields (captured from provider on failures)
    lastRefundHttpStatus: v.optional(v.number()),
    lastRefundErrorCode: v.optional(v.string()),
    lastRefundPayload: v.optional(v.any()),

    // paymentId: v.string(),
    // paymentMethod: v.optional(v.string()), // e.g. "paystack", "card", "bank transfer"
    // paymentStatus: v.optional(v.string()), // e.g. "pending", "paid", "failed"
    // paymentReference: v.optional(v.string()), // e.g. "PAYSTACK_REFERENCE", "CARD_REFERENCE", "BANK_REFERENCE"
    // paymentGateway: v.optional(v.string()), // e.g. "paystack", "card", "bank transfer"
    // paymentGatewayReference: v.optional(v.string()), // e.g. "PAYSTACK_REFERENCE", "CARD_REFERENCE", "BANK_REFERENCE"
    // paymentGatewayStatus: v.optional(v.string()), // e.g. "pending", "paid", "failed"
  }).index("by_token", ["token"]),

  orderReferences: defineTable({
    orderId: v.id("orders"),
    reference: v.string(),
    status: ReferenceStatus,
    createdAt: v.number(),
  })
    .index("by_reference", ["reference"])
    .index("by_status", ["status"])
    .index("by_orderId", ["orderId"]),

  reviews: defineTable({
    userId: v.string(),
    productId: v.id("products"),
    rating: v.number(), // 1-5
    comment: v.optional(v.string()),
    createdAt: v.number(),
  }),

  routines: defineTable({
    userId: v.string(),
    name: v.string(),
    productIds: v.array(v.id("products")),
    createdAt: v.number(),
  }),

  categories: defineTable({
    name: v.string(),
    slug: v.optional(v.string()), // for SEO-friendly URLs
    description: v.optional(v.string()),
    image: v.optional(v.string()), // category image for banners
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),
});
