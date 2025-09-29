import { v } from "convex/values";
import { action, query, internalMutation } from "./_generated/server";
import { runChatCompletion, generateToken } from "./_utils/internalUtils";
import {
  SkinConcern,
  SkinType,
  DayPeriod,
  StepFrequency,
  RoutineStatus,
} from "./schema";

// recommend
// The user has the skin profile above.
// From the availableProducts list,
// recommend products.
// Carefully analyze ingredients to avoid
//  conflicts (e.g., retinol + exfoliating acids,
//  too many actives in one step).
// Ensure each step of the routine has only
// one product per category (one cleanser, one moisturizer, etc.).

// (moved fallbackRoutineDoc inside handler where inputs are available)

// protoected by auth
export const createRoutine = action({
  args: {
    productIds: v.array(v.id("products")),
    skinConcerns: v.optional(v.array(SkinConcern)),
    skinType: v.optional(SkinType),
    userId: v.string(),
    pendingActionId: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
  },
  handler: async (
    ctx,
    { productIds, skinConcerns, skinType, userId, pendingActionId, orderId }
  ) => {
    try {
      const internalAny = (await import("./_generated/api")).internal as any;
      // Try to identify user
      //   const identity = (ctx as any).auth?.getUserIdentity
      //     ? await (ctx as any).auth.getUserIdentity()
      //     : null;
      //   const externalUserId = identity?.subject ?? identity?.tokenIdentifier;

      // Todo: uncomment this later
      //   if (!externalUserId)
      //     return {
      //       success: false,
      //       message: "You must be logged in to create routine",
      //     };

      // 1) Fetch and enrich products by IDs using internal query

      const uniqueProductIds = Array.from(new Set(productIds));

      const enriched = await ctx.runQuery(
        internalAny.products._getProductsByIdsRaw,
        { ids: uniqueProductIds as any }
      );
      const productById = new Map(
        enriched.map((it: any) => [String(it._id), it])
      );

      // Fetch user recommendations (if logged in) via internal API
      // Original block
      //   const userRecs = externalUserId
      //     ? await ctx.runQuery(
      //         internalAny.recommendations.getUserRecommendations,
      //         { userId: externalUserId }
      //       )
      //     : [];

      if (!userId)
        return {
          success: false,
          message: "User is not logged in",
        };

      const userRecs = userId
        ? await ctx.runQuery(
            internalAny.recommendations.getUserRecommendations,
            { userId }
          )
        : [];

      //   if (userRecs)
      //     return {
      //       success: false,
      //       message: "User with this UserId is not found",
      //     };

      console.log(userRecs, "This is userRecs");
      const availableProducts = enriched.map((p: any) => {
        const categories: string[] = Array.isArray(p?.categories)
          ? p.categories
              .map((c: any) =>
                String(c?.slug || c?.name || "")
                  .toLowerCase()
                  .trim()
              )
              .filter(Boolean)
          : [];
        return {
          _id: String(p?._id ?? ""),
          name: String(p?.name ?? ""),
          categories,
          concerns: p?.concerns ?? [],
          skinType: p?.skinType ?? "",
          ingredients: Array.isArray(p?.ingredients) ? p.ingredients : [],
          recommended: userRecs.some(
            (r: any) =>
              String(r.productId) === String(p?._id) && !!r.recommended
          ),
        };
      });

      // If there are no available products, return early
      if (!availableProducts.length) {
        return {
          success: false,
          message: "Routine creation failed",
        } as const;
      }

      console.log(availableProducts, "This are the available products");

      // 2) Ask the model to construct a routine (JSON-only). Fallback if unavailable.
      const availableProductsJson = JSON.stringify(availableProducts);
      const userSkinProfileJson = JSON.stringify({
        ...(Array.isArray(skinConcerns) && skinConcerns.length
          ? { skinConcerns }
          : {}),
        ...(skinType ? { skinType } : {}),
      });

      const prompt = `You are an expert skincare routine generator. Create a comprehensive, optimized routine using ONLY products from the provided availableProducts array.

      INPUT DATA:
      availableProducts: ${availableProductsJson}
      userSkinProfile: ${userSkinProfileJson}

      SKIN ANALYSIS & PRODUCT OPTIMIZATION:
      If userSkinProfile is provided:
      - Target specific skin concerns and respect sensitivities
      - Notes can reference concerns mentioned in the profile
      - Prioritize products that address stated needs

      If userSkinProfile is undefined:
      - Analyze ingredient profiles to create the most beneficial routine possible
      - Maximize product synergies and complement different actives
      - Keep notes generic and application-focused (no condition claims)
      - Consider these active ingredients for routine optimization:
        * AHA/BHA/Glycolic/Salicylic acid → exfoliation (PM, reduced frequency)
        * Retinoids → cell turnover (PM only, start slow)
        * Niacinamide → pore refinement and oil control
        * Hyaluronic acid/Snail mucin → hydration boost
        * Vitamin C → antioxidant protection (AM preferred)
        * Ceramides/Peptides → barrier support

      STRICT VALIDATION RULES:
      1. Product Selection: ONLY use exact _id values from availableProducts
         - Match category field exactly (cleanser, toner, serum, moisturizer, sunscreen)
         - NEVER invent products, IDs, or make assumptions about availability
      + 1a. *Recommended Products Must Be Used**: Any item in availableProducts with "recommended: true" MUST be included in the routine.
      +     - If multiple recommended items share a category, include all that fit within step limits (max 2 serums, max 2 toners).
      +     - Do not skip recommended items under any circumstances.

      2. Routine Structure & Requirements:
         CORE ESSENTIALS: cleanser (AM optional, PM recommended), moisturizer (both AM/PM)
         PROTECTION: sunscreen (AM only, highest priority if available)
         ENHANCEMENT: toner (0-2), serum (0-2) - choose based on active ingredients

      3. Product Limits & Distribution:
         - Each product can appear in AM, PM, or both (use same productId)
         - Max 2 serums per period (prioritize different benefits)
         - Max 2 toners per period (only if significantly different)
         - Always include moisturizer in both periods if available
         - Sunscreen: AM only, essential if available

      4. Active Ingredient Safety & Timing:
         AM SAFE: Vitamin C, niacinamide, hyaluronic acid, gentle actives
         PM PREFERRED: Retinoids, AHA/BHA, stronger exfoliants
         NEVER COMBINE DAILY: Retinoids + AHA/BHA, Retinoids + Vitamin C, multiple strong acids
         CONFLICT RESOLUTION: Use different periods or reduced frequency (every_other_day/weekly)

      5. Step Ordering Logic:
         ALWAYS use consecutive numbering starting from 1 within each period:
         - Cleanser: order 1
         - Toners: order 2, 3 (if using two)
         - Serums: order 3-4 (or 4-5 if toner present) - thinnest consistency first
         - Moisturizer: order 4-6 (after all serums/toners)
         - Sunscreen: final step in AM (order 5-7)

         NO GAPS in ordering - if you have 3 AM steps, use orders 1, 2, 3

      6. Frequency Guidelines:
         - Daily: gentle products, basic routine steps
         - Every_other_day: retinoids, strong acids, new actives
         - Weekly: very strong exfoliants, treatments
         - Start conservative with actives, especially if no user profile

      ENHANCED VALIDATION CHECKLIST:
      □ Every productId exists in availableProducts _id field (exact match)
      □ All items with recommended: true are included unless a hard safety conflict is explained in skinAnalysis
      □ Every category matches product category in availableProducts
      □ Field naming consistent: use "productId" everywhere (NOT primaryProductId)
      □ Step orders are consecutive integers starting from 1 in each period
      □ No conflicting actives in same period with daily frequency
      □ Sunscreen only in AM, retinoids only in PM
      □ Moisturizer included in both AM and PM if available
      □ Active ingredients optimally distributed across AM/PM
      □ Frequency appropriate for active strength and user profile
      □ JSON valid with no trailing commas, proper structure

      RESPONSE FORMAT:
      Return ONLY valid JSON (no markdown, no explanations):

      {
        "name": "Descriptive routine name reflecting key benefits/focus",
        "skinAnalysis": "Brief analysis of approach taken (1-2 sentences)",
        "am": [
          {
            "id": "step_am_1",
            "order": 1,
            "category": "cleanser",
            "productId": "exact_id_from_availableProducts",
            "alternateProductIds": [],
            "frequency": "daily",
            "notes": "Generic application guidance"
          }
        ],
        "pm": [
          {
            "id": "step_pm_1",
            "order": 1,
            "category": "cleanser",
            "productId": "exact_id_from_availableProducts",
            "alternateProductIds": [],
            "frequency": "daily",
            "notes": "Generic application guidance"
          }
        ]
      }

      CRITICAL MISTAKES TO AVOID:
      ❌ **AHA/BHA/acids in AM routine** (DANGEROUS - increases sun damage risk)
      ❌ Using "primaryProductId" instead of "productId"
      ❌ Non-consecutive step ordering (e.g., 1,4,6 instead of 1,2,3)
      ❌ Sunscreen in PM routine
      ❌ Retinoids in AM routine
      ❌ Daily frequency for strong actives without user profile
      ❌ Missing moisturizer in AM or PM
      ❌ Multiple strong actives in same period daily
      ❌ Product IDs not found in availableProducts
      ❌ Condition-specific notes without user profile
      ❌ Being too conservative - include beneficial hydrating ingredients

      OPTIMIZATION PRIORITIES:
      1. **Address primary skin concerns with appropriate actives** - don't create generic routines for specific conditions
      2. Maximize beneficial ingredients for the stated skin profile
      3. Create the most comprehensive routine possible with available products
      4. Layer complementary actives for enhanced benefits
      5. Utilize different cleansers for AM/PM if multiple types available
      6. Include hydrating serums when available (snail mucin, hyaluronic acid)
      7. Build sustainable, well-structured routines
      8. Maintain safety through proper active separation

      CONDITION-SPECIFIC GUIDANCE:
      **Acne-prone/Acne/Blackheads:** Must include at least one of: BHA, AHA, or retinoid. Prefer oil-free, non-comedogenic products.
      **Hyperpigmentation/Uneven-tone/Sun-damage:** Prioritize AHA, vitamin C, niacinamide. Layer for enhanced results.
      **Fine-lines/Wrinkles/Loss-of-firmness:** Prioritize retinoids, peptides, antioxidants. Focus on PM treatments.
      **Dryness:** Layer hydrating ingredients (HA, glycerin, ceramides), choose cream-based products over gels.
      **Oiliness:** Include oil-controlling ingredients (niacinamide, BHA), prefer gel/water-based products.
      **Redness/Sensitivity:** Choose gentler actives (mandelic acid over glycolic), lower frequencies, avoid fragrances.
      **Dullness:** Include gentle exfoliation (AHA) or vitamin C for radiance boost.
      **Mature skin:** Combine anti-aging actives with barrier support, focus on prevention and repair.
      **Combination skin:** Balance different needs - oil control for T-zone, hydration for dry areas.
      **Normal skin:** Maintain balance with preventative care and gentle maintenance actives.

      PRODUCT UTILIZATION GUIDELINES:
      - **Always prioritize items marked \`recommended: true\`** — prefer them over non‑recommended alternatives when categories overlap.
      - **Prefer comprehensive over minimal** - if you have 8+ beneficial products, aim to use 6-8
      - **Layer hydrating ingredients** - multiple hydrating steps are beneficial
      - **Different cleansers strategy** - gentle for AM, deeper cleansing for PM
      - **Serum stacking** - layer thin to thick consistency
      - **Don't leave beneficial actives unused** without good reason

      Generate the optimized routine now:`;

      const data = await runChatCompletion(prompt, "gpt-4o");

      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        const match = data.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          throw new Error("Model did not return valid JSON");
        }
      }

      console.log(parsed, "This is parsed");

      const allowedCats = new Set([
        "cleanser",
        "toner",
        "serum",
        "moisturizer",
        "moisturiser", // accept UK spelling from model
        "sunscreen",
      ]);

      const availableProductsId = new Map(
        availableProducts.map((p: any) => [String(p._id), p])
      );

      // Build AM/PM steps from parsed response, validating against availableProducts
      type StepIn = {
        id?: string;
        order?: number;
        category?: string;
        productId?: string;
        alternateProductIds?: string[];
        frequency?: string;
        notes?: string;
      };

      const amRoutine: any[] = [];
      const pmRoutine: any[] = [];

      const parsedAm: StepIn[] = Array.isArray(parsed?.am) ? parsed.am : [];
      const parsedPm: StepIn[] = Array.isArray(parsed?.pm) ? parsed.pm : [];

      for (const [key, list] of Object.entries({
        am: parsedAm,
        pm: parsedPm,
      })) {
        const dest = key === "am" ? amRoutine : pmRoutine;
        let orderCounter = 1;

        for (const s of list) {
          const catRaw = String(s?.category ?? "")
            .toLowerCase()
            .trim();
          const category = catRaw === "moisturiser" ? "moisturizer" : catRaw;
          if (!allowedCats.has(category)) continue;

          const pid = String(s?.productId ?? "");
          if (!availableProductsId.has(pid)) continue;

          const normalized = {
            id: String(s?.id ?? `${key}_${orderCounter}`),
            order: Number.isFinite(s?.order as any)
              ? Number(s?.order)
              : orderCounter,
            category,
            productId: pid,
            alternateProductIds: Array.isArray(s?.alternateProductIds)
              ? s.alternateProductIds
                  .filter((x) => availableProductsId.has(String(x)))
                  .map((x) => String(x))
              : [],
            frequency: (() => {
              const f = String(s?.frequency ?? "daily");
              const ok = new Set([
                "daily",
                "every_other_day",
                "weekly",
                "biweekly",
                "monthly",
                "as_needed",
              ]);
              return ok.has(f) ? f : "daily";
            })(),
            notes: s?.notes ? String(s.notes) : undefined,
          };

          dest.push(normalized);
          orderCounter++;
        }

        // enforce consecutive ordering starting at 1 for each period
        dest.sort((a, b) => a.order - b.order);
        dest.forEach((step, idx) => {
          step.order = idx + 1;
        });
      }

      // Combine AM/PM into unified steps array used by the routine document
      const steps = [
        ...amRoutine.map((s) => ({ ...s, period: "am" as const })),
        ...pmRoutine.map((s) => ({ ...s, period: "pm" as const })),
      ];

      const constraints =
        parsed?.constraints && typeof parsed.constraints === "object"
          ? {
              maxSerumsPerSession: Number(
                parsed.constraints.maxSerumsPerSession ?? 2
              ),
              requireSunscreenForAM: Boolean(
                parsed.constraints.requireSunscreenForAM ?? true
              ),
              conflictRules: Array.isArray(parsed.constraints.conflictRules)
                ? parsed.constraints.conflictRules.map((x: any) => String(x))
                : [],
            }
          : {
              maxSerumsPerSession: 2,
              requireSunscreenForAM: true,
              conflictRules: [],
            };

      const now = Date.now();

      const routine = {
        userId,
        name: parsed?.name || "Personalised routine",
        status: "active",
        version: 1,
        previousVersionId: undefined,
        createdAt: now,
        updatedAt: now,
        steps,
        constraints,
        skinSnapshot: {
          types: skinType ?? "normal",
          concerns: Array.isArray(skinConcerns) ? skinConcerns : [],
          notes:
            typeof parsed?.skinAnalysis === "string"
              ? parsed.skinAnalysis
              : undefined,
        },
        source: {
          createdFromOrderId: undefined,
          createdBy: "ai",
        },
        metrics: {
          usageCount: 0,
          lastUsedAt: undefined,
        },
      } as const;

      // If no valid steps, fallback
      // Populate steps with product objects instead of IDs
      const finalRoutine = routine;

      const populatedSteps = (finalRoutine.steps || []).map((s: any) => ({
        ...s,
        product: productById.get(String(s.productId)) ?? null,
        // alternateProducts: Array.isArray(s.alternateProductIds)
        //   ? s.alternateProductIds
        //       .map((id: any) => productById.get(String(id)))
        //       .filter(Boolean)
        //   : [],
      }));

      // Persist routine
      let savedId: any = null;
      try {
        const internalAny = (await import("./_generated/api")).internal as any;
        const saveRes = await ctx.runMutation(internalAny.routine.saveRoutine, {
          routine,
        });
        savedId = saveRes?.routineId ?? null;
      } catch (e) {
        // Non-fatal: we still return the generated routine even if persistence fails
        console.warn("saveRoutine failed:", (e as any)?.message);
      }

      if (userId) {
        try {
          const userDoc = await ctx.runQuery(
            internalAny.order._getUserByExternalId,
            { userId }
          );

          if (userDoc?._id) {
            if (pendingActionId) {
              await ctx.runMutation(
                internalAny.order._setUserPendingActionStatus,
                {
                  userDocId: userDoc._id,
                  actionId: pendingActionId,
                  status: "completed",
                }
              );
            }

            const completedAction = {
              id: generateToken(),
              prompt: "Your new skincare routine is ready",
              status: "pending",
              type: "create_routine_completed",
              data: {
                routineId: savedId,
                orderId: orderId ?? undefined,
              },
              createdAt: Date.now(),
            };

            await ctx.runMutation(internalAny.order._appendUserPendingAction, {
              userDocId: userDoc._id,
              action: completedAction,
            });

            console.log("routine created success and pending action saved");
          }
        } catch (e) {
          console.warn("routine completion pending action failed", {
            userId,
            message: (e as any)?.message,
          });
        }
      }

      // we will do this when we want to return the routine
      return {
        success: true,
        routineId: savedId,
        routine: { ...finalRoutine, steps: populatedSteps },
        notes: String(parsed?.notes ?? ""),
      } as const;
    } catch (err) {
      console.log(err);
      return {
        success: false,
        message: "Something went wrong creating the routine. We will try later",
      } as const;
    }
  },
});

// protected by auth,
// then we check if the user requesting the routine actually owns the routines
export const getUserRoutines = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    // const identity = (ctx as any).auth?.getUserIdentity
    //   ? await (ctx as any).auth.getUserIdentity()
    //   : null;
    // const externalUserId = identity?.subject ?? identity?.tokenIdentifier;

    if (!userId)
      return {
        success: false,
        message: "You must be logged in to get routines",
      };

    const routines = await ctx.db
      .query("routines")
      .withIndex("by_userId", (obj) => obj.eq("userId", userId))
      .collect();

    return {
      success: true,
      routines,
    };
  },
});

export const getUserRoutine = query({
  args: { routineId: v.id("routines") },
  handler: async (ctx, { routineId }) => {
    try {
      const identity = (ctx as any).auth?.getUserIdentity
        ? await (ctx as any).auth.getUserIdentity()
        : null;
      const externalUserId = identity?.subject ?? identity?.tokenIdentifier;

      if (!externalUserId)
        return {
          success: false,
          message: "You must be logged in to get routine",
        };

      const routine = await ctx.db.get(routineId);

      if (!routine)
        return {
          success: false,
          message: "No routine with that Id was found",
        };

      // Ensure the authenticated user owns this routine
      if ((routine as any).userId !== externalUserId) {
        return {
          success: false,
          message: "You do not have access to this routine.",
        } as const;
      }

      return {
        success: true,
        routine,
      };
    } catch (err) {
      console.error("getUserRoutine failed", {
        routineId,
        message: (err as any)?.message,
      });
      // Return a generic error to avoid leaking internals
      return {
        success: false,
        message:
          "Something went wrong fetching that routine. Please try again.",
      } as const;
    }
  },
});

// Returns a single routine with steps populated with product objects
export const getUserRoutinePopulated = query({
  args: { routineId: v.id("routines"), userId: v.string() },
  handler: async (ctx, { routineId, userId }) => {
    // const identity = (ctx as any).auth?.getUserIdentity
    //   ? await (ctx as any).auth.getUserIdentity()
    //   : null;
    // const externalUserId = identity?.subject ?? identity?.tokenIdentifier;

    // if (!externalUserId)
    //   return {
    //     success: false,
    //     message: "You must be logged in to get routine",
    //   } as const;

    if (!userId)
      return {
        success: false,
        message: "You must be logged in to get routines",
      };

    const routine = await ctx.db.get(routineId);
    if (!routine)
      return {
        success: false,
        message: "Routine not found",
        statusCode: 404,
      } as const;
    if ((routine as any).userId !== userId)
      return {
        success: false,
        message: "Not authorized",
        statusCode: 403,
      } as const;

    // Gather product ids
    const steps: any[] = Array.isArray((routine as any).steps)
      ? (routine as any).steps
      : [];
    const ids = new Set<string>();
    for (const s of steps) {
      if (s?.productId) ids.add(String(s.productId));
      if (Array.isArray(s?.alternateProductIds)) {
        for (const pid of s.alternateProductIds) ids.add(String(pid));
      }
    }
    const list = Array.from(ids);
    const products = await Promise.all(
      list.map((pid) => ctx.db.get(pid as any))
    );
    const byId = new Map<string, any>();
    list.forEach((id, i) => byId.set(id, products[i]));

    const populatedSteps = steps.map((s) => ({
      ...s,
      product: byId.get(String(s.productId)) ?? null,
      alternateProducts: Array.isArray(s.alternateProductIds)
        ? s.alternateProductIds
            .map((pid: any) => byId.get(String(pid)))
            .filter(Boolean)
        : [],
    }));

    return {
      success: true,
      routine: { ...(routine as any), steps: populatedSteps },
    } as const;
  },
});

export const saveRoutine = internalMutation({
  args: {
    routine: v.object({
      userId: v.string(),
      name: v.string(),
      status: RoutineStatus,
      version: v.number(),
      previousVersionId: v.optional(v.id("routines")),
      createdAt: v.number(),
      updatedAt: v.number(),
      steps: v.array(
        v.object({
          id: v.string(),
          order: v.number(),
          category: v.string(),
          alternateProductIds: v.optional(v.array(v.id("products"))),
          productId: v.id("products"),
          period: DayPeriod,
          frequency: StepFrequency,
          notes: v.optional(v.string()),
        })
      ),
      constraints: v.object({
        maxSerumsPerSession: v.number(),
        requireSunscreenForAM: v.boolean(),
        conflictRules: v.optional(v.array(v.string())),
      }),
      skinSnapshot: v.object({
        types: v.union(SkinType, v.array(SkinType)),
        concerns: v.array(SkinConcern),
        notes: v.optional(v.string()),
      }),
      source: v.object({
        createdFromOrderId: v.optional(v.id("orders")),
        createdBy: v.optional(v.string()),
      }),
      metrics: v.object({
        usageCount: v.number(),
        lastUsedAt: v.optional(v.number()),
      }),
    }),
  },
  handler: async (ctx, { routine }) => {
    // Normalize skinSnapshot.types to a single SkinType string
    const snapshot = routine.skinSnapshot as any;
    if (Array.isArray(snapshot?.types)) {
      // pick the first if array provided
      snapshot.types = snapshot.types[0] ?? "normal";
    }
    const id = await ctx.db.insert("routines", routine as any);
    return { routineId: id };
  },
});
