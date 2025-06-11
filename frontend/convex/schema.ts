import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    userId: v.string(), // Clerk user ID
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    aiBuilderUsed: v.boolean(),
  }).index("by_userId", ["userId"]),

  products: defineTable({
    name: v.string(),
    description: v.string(),
    price: v.number(),
    stock: v.number(),
    brandId: v.id("brands"),
    // imageUrl: v.optional(v.string()),
    images: v.array(v.string()),
    promoImage: v.optional(v.string()),
    createdAt: v.number(),

    isNew: v.optional(v.boolean()),
    isBestseller: v.optional(v.boolean()),
    isTrending: v.optional(v.boolean()),
    discount: v.optional(v.number()),

    sizes: v.optional(
      v.array(
        v.object({
          size: v.string(),
          price: v.optional(v.number()),
          stock: v.optional(v.number()),
        })
      )
    ),
  }),

  brands: defineTable({
    name: v.string(),
    logoUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    createdAt: v.number(),
  }),

  carts: defineTable({
    userId: v.string(),
    productId: v.id("products"),
    quantity: v.number(),
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
        quantity: v.number(),
      })
    ),
    totalAmount: v.number(),
    status: v.string(), // e.g. "pending", "paid", "shipped"
    createdAt: v.number(),
  }),

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
});
