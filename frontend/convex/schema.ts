import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    userId: v.string(), 
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    aiBuilderUsed: v.boolean(),
  }).index("by_userId", ["userId"]),

  products: defineTable({
    name: v.string(),
    slug:v.optional(v.string()),
    description: v.string(),
    price: v.number(),
    stock: v.number(),
    brandId: v.id("brands"),
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
    
    sizes: 
    v.optional(
      v.array(
        v.object({
          id: v.string(),
          size: v.number(),
          price: v.number(),
          discount: v.optional(v.number()),
          stock: v.number(),
          unit: v.string()
        })
      ))
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

  categories: defineTable({
    name: v.string(),
    slug: v.optional(v.string()), // for SEO-friendly URLs
    description: v.optional(v.string()),
    image: v.optional(v.string()), // category image for banners
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),
});
