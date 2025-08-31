import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const createUser = mutation({
  args: {
    userId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
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

export const transferGuestDataToUser = mutation({
  args: {
    guestId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, { guestId, userId }) => {
    //1 Transfer cart items
    const guestCartItems = await ctx.db
      .query("carts")
      .filter((q) => q.eq(q.field("userId"), guestId))
      .collect();

    const userCartItems = await ctx.db
      .query("carts")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    await Promise.all(
      guestCartItems.map(async (guestItem) => {
        const foundItem = userCartItems.find(
          (userItem) =>
            userItem.productId === guestItem.productId &&
            userItem.sizeId === guestItem.sizeId
        );

        if (foundItem) {
          // merge quantities into the user item
          await ctx.db.patch(foundItem._id, {
            quantity: foundItem.quantity + guestItem.quantity,
          });
          // delete the guest item since it's merged
          await ctx.db.delete(guestItem._id);
        } else {
          // reassign guest item to the user
          await ctx.db.patch(guestItem._id, { userId });
        }
      })
    );

    //2 Transfer order record

    // Delete the guest user record
    const guestUser = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", guestId))
      .first();

    if (guestUser) {
      await ctx.db.delete(guestUser._id);
    }
  },
});
