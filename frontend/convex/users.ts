import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const createUser = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists (prevent duplicates)
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) return;

    await ctx.db.insert("users", {
      userId: args.userId,
      email: args.email,
      name: args.name,
      createdAt: Date.now(),
      aiBuilderUsed: false,
    });
  },
});
