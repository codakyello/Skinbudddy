import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { resolveSkinConcern, resolveSkinType } from "../shared/skinMappings";
import { AuthType } from "./schema";

export const createUser = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    authType: v.optional(AuthType),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    console.log(identity, "This is the identity object");

    const userId = identity?.subject;
    console.log(userId, "This is the user id either clerk user id or guest id");

    if (!userId) {
      return {
        success: false,
        statusCode: 401,
        message: "Authentication required",
      } as const;
    }

    // Check if user already exists (prevent duplicates)
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existing) return existing;

    const newUser = await ctx.db.insert("users", {
      userId, // this is the clerk user id or guest id
      email: args.email,
      name: args.name,
      createdAt: Date.now(),
      hasUsedRecommender: false,
      authType: args.authType ?? "anon",
    });

    return newUser;
  },
});

export const transferGuestDataToUser = mutation({
  args: {
    guestId: v.string(),
  },
  handler: async (ctx, { guestId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    if (!userId) {
      throw new Error("Authentication required");
    }

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
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    if (!userId)
      return { success: false, actions: [], statusCode: 401 } as const;

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
    actionId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("dismissed")
    ),
  },
  handler: async (ctx, { actionId, status }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;
    if (!userId)
      return {
        success: false,
        statusCode: 401,
        message: "Authentication required",
      } as const;

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

export const getUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        success: false,
        statusCode: 401,
        message: "Authentication required",
      } as const;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .first();

    if (!user)
      return {
        success: false,
        statusCode: 404,
        message: "User not found",
      } as const;

    return { success: true, user } as const;
  },
});

export const isAnonGuest = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!user) return false;
    return user.authType === "anon";
  },
});

export const saveSkinProfile = mutation({
  args: {
    skinType: v.optional(v.string()),
    skinConcerns: v.optional(v.array(v.string())),
    ingredientSensitivities: v.optional(v.array(v.string())),
    history: v.optional(v.string()),
    cycle: v.optional(
      v.object({
        lastPeriodStart: v.number(),
        avgCycleLength: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        success: false,
        statusCode: 401,
        message: "Authentication required",
      } as const;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .first();

    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message: "User not found",
      } as const;
    }

    const normalizeStringArray = (input?: string[]): string[] | undefined => {
      if (!Array.isArray(input)) return undefined;
      const unique = new Set<string>();
      input.forEach((value) => {
        if (typeof value !== "string") return;
        const trimmed = value.trim();
        if (!trimmed.length) return;
        unique.add(trimmed.toLowerCase());
      });
      return unique.size ? Array.from(unique) : undefined;
    };

    const normalizeSkinConcerns = (input?: string[]): string[] | undefined => {
      if (!Array.isArray(input)) return undefined;
      const canonicalConcerns = input
        .map((value) => {
          if (typeof value !== "string") return null;
          const trimmed = value.trim();
          if (!trimmed.length) return null;
          const resolved = resolveSkinConcern(trimmed);
          return resolved ?? trimmed.toLowerCase();
        })
        .filter((value): value is string => Boolean(value));
      const unique = Array.from(new Set(canonicalConcerns));
      return unique.length ? unique : undefined;
    };

    const nextSkinProfile = {
      ...(typeof (user as any)?.skinProfile === "object"
        ? ((user as any).skinProfile as Record<string, unknown>)
        : {}),
    } as Record<string, unknown>;

    let didChange = false;

    if (Object.prototype.hasOwnProperty.call(args, "skinType")) {
      const raw = args.skinType;
      if (typeof raw === "string" && raw.trim().length) {
        const resolved = resolveSkinType(raw);
        nextSkinProfile.skinType = (resolved ?? raw.trim()).toLowerCase();
      } else {
        delete nextSkinProfile.skinType;
      }
      didChange = true;
    }

    if (Object.prototype.hasOwnProperty.call(args, "skinConcerns")) {
      const normalizedConcerns = normalizeSkinConcerns(args.skinConcerns);
      if (normalizedConcerns && normalizedConcerns.length) {
        nextSkinProfile.skinConcerns = normalizedConcerns;
      } else {
        delete nextSkinProfile.skinConcerns;
      }
      didChange = true;
    }

    if (Object.prototype.hasOwnProperty.call(args, "ingredientSensitivities")) {
      const normalizedSensitivities = normalizeStringArray(
        args.ingredientSensitivities
      );
      if (normalizedSensitivities && normalizedSensitivities.length) {
        nextSkinProfile.ingredientSensitivities = normalizedSensitivities;
      } else {
        delete nextSkinProfile.ingredientSensitivities;
      }
      didChange = true;
    }

    if (Object.prototype.hasOwnProperty.call(args, "history")) {
      const raw = args.history;
      if (typeof raw === "string" && raw.trim().length) {
        nextSkinProfile.history = raw.trim();
      } else {
        delete nextSkinProfile.history;
      }
      didChange = true;
    }

    if (Object.prototype.hasOwnProperty.call(args, "cycle")) {
      if (args.cycle) {
        nextSkinProfile.cycle = {
          lastPeriodStart: args.cycle.lastPeriodStart,
          avgCycleLength: args.cycle.avgCycleLength ?? 28,
        };
      } else {
        delete nextSkinProfile.cycle;
      }
      didChange = true;
    }

    if (!didChange) {
      return {
        success: true,
        skinProfile: (user as any)?.skinProfile ?? null,
        unchanged: true,
      } as const;
    }

    nextSkinProfile.updatedAt = Date.now();

    await ctx.db.patch(user._id, {
      skinProfile: nextSkinProfile,
    } as any);

    return {
      success: true,
      skinProfile: nextSkinProfile,
    } as const;
  },
});
