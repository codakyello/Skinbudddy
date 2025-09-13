import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createUser = mutation({
  args: {
    userId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    clerkId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists (prevent duplicates)
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) return;

    await ctx.db.insert("users", {
      clerkId: args.clerkId,
      userId: args.userId,
      email: args.email,
      name: args.name,
      createdAt: Date.now(),
      hasUsedRecommender: false,
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

// Get pending actions for a user by external userId
export const getPendingActions = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    if (!userId)
      return { success: false, actions: [], statusCode: 400 } as const;

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const raw = Array.isArray((user as any)?.pendingActions)
      ? (user as any).pendingActions
      : [];

    const now = Date.now();
    const actions = raw
      .filter((a: any) => (a?.status ?? "pending") === "pending")
      .filter(
        (a: any) => typeof a?.expiresAt === "undefined" || a.expiresAt >= now
      )
      .sort(
        (a: any, b: any) =>
          Number(b?.createdAt ?? 0) - Number(a?.createdAt ?? 0)
      );

    return { success: true, actions } as const;
  },
});

// Update the status of a specific pending action identified by action id
export const setPendingActionStatus = mutation({
  args: {
    userId: v.string(),
    actionId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("dismissed")
    ),
  },
  handler: async (ctx, { userId, actionId, status }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!user)
      return {
        success: false,
        statusCode: 404,
        message: "User not found",
      } as const;

    const actions: Array<any> = Array.isArray((user as any).pendingActions)
      ? (user as any).pendingActions
      : [];
    const idx = actions.findIndex((a) => String(a?.id) === actionId);
    if (idx === -1)
      return {
        success: false,
        statusCode: 404,
        message: "Action not found",
      } as const;

    actions[idx] = { ...(actions[idx] || {}), status };
    await ctx.db.patch(user._id, { pendingActions: actions } as any);

    return { success: true } as const;
  },
});
