import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const _saveRecommendations = internalMutation({
  args: { recommendations: v.array(v.id("products")), userId: v.string() },
  handler: async (ctx, { recommendations, userId }) => {
    // Resolve the current user from auth; we tie recs to the authenticated user
    // const identity = await ctx.auth.getUserIdentity();
    // const userId = identity?.subject;
    if (!userId) {
      // If there's no authenticated user, we can't persist personalized recommendations
      return { success: false, message: "Not authenticated" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!user) {
      return { success: false, message: "User not found" } as const;
    }

    // Deduplicate product ids defensively
    const productIds = Array.from(new Set(recommendations.map((id) => id)));

    //

    let upserts = 0;
    let historyInserts = 0;

    for (const productId of productIds) {
      // Upsert into userRecommendations (recommended=true, inCart=false)
      const existing = await ctx.db
        .query("userRecommendations")
        .filter((q) =>
          q.and(
            q.eq(q.field("userId"), userId),
            q.eq(q.field("productId"), productId)
          )
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          recommended: true,
          inCart: existing.inCart ?? false,
        });
      } else {
        await ctx.db.insert("userRecommendations", {
          userId,
          productId,
          recommended: true,
          inCart: false,
        });
      }
      upserts++;

      // Always append to history for auditing/analytics
      await ctx.db.insert("userRecommendationsHistory", {
        userId,
        productId,
        recommended: true,
        inCart: false,
      });
      historyInserts++;
    }

    return { success: true, upserts, historyInserts };
  },
});

// implement get user Recommendations
export const getUserRecommendations = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    // Ensure user exists (defensive)
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!user) throw new Error("User with this id cannot be found"); // safe to throw since its internal function

    // Pull current recommendation rows for the user
    const rows = await ctx.db
      .query("userRecommendations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Hydrate products; filter out any deleted/missing docs
    const products = await Promise.all(
      rows.map((r) => ctx.db.get(r.productId))
    );

    return rows
      .map((r, i) => ({
        productId: r.productId,
        recommended: r.recommended,
        inCart: r.inCart,
        product: products[i] ?? null,
      }))
      .filter((x) => x.product !== null);
  },
});

export const getUserRecommendationIds = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("userRecommendations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return Array.from(new Set(rows.map((r) => r.productId)));
  },
});
