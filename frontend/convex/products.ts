import { v } from "convex/values";
import { action, mutation, query, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import OpenAI from "openai";
// import { captureSentryError } from "./_utils/sentry";
import products from "../products.json";
// Avoid importing `api` here to prevent circular type inference in this module
import { SkinConcern, SkinType } from "./schema";
import { AHA_BHA_SET, DRYING_ALCOHOLS } from "../convex/_utils/products";
import { Product, Brand } from "./_utils/type";
import { runChatCompletion } from "./_utils/internalUtils";

export const IngredientSensitivity = v.union(
  v.literal("alcohol"),
  v.literal("retinoids"),
  v.literal("retinol"),
  v.literal("niacinamide"),
  v.literal("ahas-bhas"), // Ai will help me filter this one out
  v.literal("vitamin-c"),
  v.literal("essential-oils"),
  v.literal("mandelic acid")
);

function normalizeIngredient(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\./g, "") // remove dots
    .replace(/[,()\/-]/g, " ") // replace punctuation with spaces
    .replace(/\s+/g, " ") // collapse multiple spaces
    .trim()
    .split(" ")
    .join("_"); // unify with underscores
}

export const recommend = action({
  args: {
    skinConcern: v.array(SkinConcern),
    skinType: SkinType,
    // Support both spellings for backward compatibility
    ingredientsToAvoid: v.optional(v.array(IngredientSensitivity)),
    fragranceFree: v.optional(v.boolean()),
    userId: v.string(),
    createRoutine: v.optional(v.boolean()),

    // alcoholFree: v.optional(v.boolean()),
    // fragranceFree: v.optional(v.boolean()),
  },
  handler: async (ctx, skinProfile) => {
    try {
      // Pull raw products via an internal query to avoid action ctx.db access
      const internalAny = (await import("./_generated/api")).internal as any;
      const all = await ctx.runQuery(
        internalAny.products._getAllProductsRaw,
        {}
      );

      // 2) Pre-filter by hard constraints before AI
      // Unify avoid list from args
      const avoidList: string[] = Array.isArray(skinProfile.ingredientsToAvoid)
        ? (skinProfile.ingredientsToAvoid as string[])
        : Array.isArray((skinProfile as any).ingredientsToavoid)
          ? ((skinProfile as any).ingredientsToavoid as string[])
          : [];

      const availableProducts = all
        .filter((p: any) => {
          const ingredients = (p.ingredients ?? []).map((ing: string) =>
            normalizeIngredient(ing)
          );

          // Expand "ahas-bhas" avoid flag into individual acids
          const wantsNoAcids =
            Array.isArray(avoidList) && avoidList.includes("ahas-bhas");

          if (
            wantsNoAcids &&
            ingredients.some((ing: string) => AHA_BHA_SET.has(ing))
          ) {
            return false;
          }

          if (!p.canBeInRoutine) return false;

          if (skinProfile.fragranceFree && p.hasFragrance) return false;

          // 🔑 Alcohol-free logic
          const wantsNoAlcohol =
            Array.isArray(avoidList) && avoidList.includes("alcohol");
          if (wantsNoAlcohol) {
            const hasDryingAlcohol = ingredients.some((ing: string) =>
              DRYING_ALCOHOLS.has(ing)
            );
            if (hasDryingAlcohol) return false;
          }

          // Other avoid ingredients
          if (
            avoidList.length > 0 &&
            avoidList.some((ing) => ingredients.includes(ing))
          )
            return false;

          // Skin concern
          if (skinProfile.skinConcern) {
            const sc = (p as any).concerns;
            const matchesConcern = Array.isArray(sc)
              ? sc.some(
                  (c: any) => skinProfile.skinConcern.includes(c) || c === "all"
                )
              : skinProfile.skinConcern.includes(sc) || sc === "all";
            if (!matchesConcern) return false;
          }

          // Skin type
          if (skinProfile.skinType) {
            const st = (p as any).skinType;
            const matchesSkinType = Array.isArray(st)
              ? st.some((t: any) => t === skinProfile.skinType || t === "all")
              : st === skinProfile.skinType || st === "all";
            if (!matchesSkinType) return false;
          }

          return true; // keep if all specified constraints passed
        })
        .map((product: any) => ({
          _id: product._id,
          categories: product.categories,
          name: product.name,
          concerns: product.concerns,
          skinType: product.skinType,
          ingredients: product.ingredients,
        }));

      console.log(all.length, availableProducts.length);

      console.log(availableProducts, "This are the available");

      const prompt = `
      STRICT RULES — NO EXCEPTIONS:
      - Exactly 1 cleanser (mandatory)
      - Maximum 1 toner (PRIORITIZE including if suitable match exists)
      - Maximum 3 serums
      - Exactly 1 moisturizer (mandatory)
      - Exactly 1 sunscreen (mandatory)
      
      SELECTION PRIORITY ORDER:
      1. Find suitable cleanser (mandatory)
      2. Find suitable toner (include if ANY suitable match exists)
      3. Find suitable serums (1-3 products, prioritize by concern relevance)
      4. Find suitable moisturizer (mandatory)
      5. Find suitable sunscreen (mandatory)
      
      CATEGORY MATCHING:
      Use the exact category from product's "categories[0].name" field.
      If product has "categories": [{"name": "Toner"}], use "category": "toner".
      
      SKIN CONCERN & TYPE MATCHING (FUZZY WITH WILDCARD):
      - Treat product.concerns as an array of strings (case-insensitive).
      - A product is ELIGIBLE if ANY of the following is true:
        1) Intersection(product.concerns, user.skinConcern) is non-empty (EXACT), OR
        2) product.concerns contains "all" (wildcard), OR
        3) Intersection(product.concerns, RelatedConcerns(user.skinConcern)) is non-empty (RELATED).
      - Prefer matches in this order: EXACT > RELATED > "all".
      
      TONER SELECTION CRITERIA:
      - Include a toner if ANY toner product matches user's skin type OR concerns
      - Toners are beneficial for most routines - be more lenient with matching
      - Accept toners with "all" skin types or concerns readily
      
      For skin type, compare product.skinType to user.skinType (case-insensitive). Accept if:
      - EXACT match, OR product.skinType is "all".
      - Prefer skin type in this order: EXACT > "all".
      
      RelatedConcerns (guidance, one-way includes are fine):
      - dryness → ["dehydration", "barrier support", "tightness", "hydration"]
      - oily → ["sebum control", "shine", "congestion", "pore care"]
      - acne → ["blemishes", "breakouts", "spots", "pore care"]
      - sensitivity → ["redness", "irritation", "barrier support", "gentle"]
      - hyperpigmentation → ["dark spots", "uneven tone", "post-acne marks", "brightening"]
      
      INGREDIENT SAFETY:
      - Avoid conflicts (e.g., retinol + strong AHA/BHA in same routine; multiple high-strength acids).
      - If using potent actives (e.g., glycolic/lactic/salicylic acid, retinoids, L-ascorbic vitamin C), add brief, necessary usage notes ONLY (e.g., "patch test", "use at night", "apply SPF in AM"). 
      - Do NOT add boilerplate notes for basic moisturizers, gentle hydrating serums, or toners.
      
      SELECTION PRIORITY:
      1) Concerns: prefer EXACT; if none, use RELATED; if none, allow "all".
      2) Skin type: prefer EXACT; else "all".
      3) Respect preferences (e.g., fragrance-free required).
      4) For toners specifically: be more flexible - include if it matches skin type OR has beneficial ingredients
      5) Avoid multiple exfoliating acids together; avoid combining HIGH-CONCENTRATION exfoliating acids.
      6) When products have similar actives, pick the one with more beneficial ingredients for the user's skin type.
      
      RECOMMEND:
      - Always try to include 1 toner if any suitable option exists
      - Include 1–2 serums when available, ensuring they complement concerns without ingredient conflicts
      - Aim for a complete 5-step routine when possible
      
      Select from: ${JSON.stringify(availableProducts)}
      For profile: ${JSON.stringify(skinProfile)}
      
      Return ONLY this JSON:
      {
        "recommendations": [
          {"_id": "exact_id", "name": "exact_name", "category": "from_product_data"}
        ],
        "notes": "Brief explanation of choices + ONLY necessary caution notes for potent actives."
      }
      `;

      // Validate using the AI's category assignments (not DB docs, which may have multiple categories)
      const isValidSelection = (recs: any[]): boolean => {
        const allowed = new Set([
          "cleanser",
          "toner",
          "serum",
          "moisturiser",
          "sunscreen",
        ]);
        const counts: Record<string, number> = {};
        for (const r of recs) {
          const cat = String(r?.category || "")
            .toLowerCase()
            .trim();
          if (!allowed.has(cat)) return false; // invalid category label
          counts[cat] = (counts[cat] || 0) + 1;
        }
        // Mandatory singles
        if ((counts["cleanser"] || 0) !== 1) return false;
        if ((counts["moisturiser"] || 0) !== 1) return false;
        if ((counts["sunscreen"] || 0) !== 1) return false;
        // Maximums
        if ((counts["toner"] || 0) > 1) return false;
        if ((counts["serum"] || 0) > 3) return false;
        return true;
      };

      const MAX_ATTEMPTS = 3;
      let attempts = 0;
      let lastParsedRecs: any[] = [];
      let recommendations: any[] = [];
      let notes = "";

      do {
        const data = await runChatCompletion(prompt, "gpt-4o", 0.1);
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          const match = data.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : null;
        }
        const recs = Array.isArray(parsed?.recommendations)
          ? parsed.recommendations
          : [];

        notes = typeof parsed?.notes === "string" ? parsed.notes : "";
        lastParsedRecs = recs;

        attempts++;
      } while (!isValidSelection(lastParsedRecs) && attempts < MAX_ATTEMPTS);

      // Resolve strictly against the allowed pool so disallowed items can't slip back in
      const idByString = new Map<string, any>(
        availableProducts.map((p: any) => [String(p._id), p._id])
      );
      const idByName = new Map<string, any>(
        availableProducts.map((p: any) => [String(p.name), p._id])
      );

      const ids = Array.from(
        new Set(
          lastParsedRecs
            .map(
              (r: { _id: string; name: string }) =>
                idByString.get(String(r._id)) ?? idByName.get(String(r.name))
            )
            .filter(Boolean) as any[]
        )
      );

      // Fetch full product docs for the recommended ids using an internal query
      recommendations = await ctx.runQuery(
        (await import("./_generated/api")).internal.products
          ._getProductsByIdsRaw,
        { ids }
      );

      // Best‑effort: persist these recommendations for the current user
      try {
        const internalApi = (await import("./_generated/api")).internal;
        const res = await ctx.runMutation(
          internalApi.recommendations._saveRecommendations,
          {
            recommendations: ids,
            userId: skinProfile.userId, // remove this, just for test
          }
        );

        if (res.success === false) throw Error(res.message as string);
        console.log("successfully saved in userRecommendations");
      } catch (e) {
        // Ignore persistence errors (e.g., not authenticated)
        console.log(e);
      }

      // Optionally, create and persist a routine from these recommendations
      let routineId: any = null;
      if (skinProfile.createRoutine) {
        try {
          // Build deterministic steps from model output
          const orderBase: Record<string, number> = {
            cleanser: 1,
            toner: 2,
            serum: 3,
            moisturizer: 4,
            moisturiser: 4, // normalize just in case
            sunscreen: 5,
          };

          const selectedSteps: Array<{
            category: string;
            productId: any;
          }> = [];

          const seenPerCat = new Map<string, number>();
          for (const r of lastParsedRecs) {
            const catRaw = String(r?.category ?? "")
              .toLowerCase()
              .trim();
            const category = catRaw === "moisturiser" ? "moisturizer" : catRaw;
            const pid =
              idByString.get(String(r?._id)) ?? idByName.get(String(r?.name));
            if (!pid) continue;
            selectedSteps.push({ category, productId: pid });
            seenPerCat.set(category, (seenPerCat.get(category) || 0) + 1);
          }

          // Compute orders within category groups based on base order + index
          let stepsForSave = selectedSteps
            .slice()
            .sort(
              (a, b) =>
                (orderBase[a.category] || 99) - (orderBase[b.category] || 99)
            )
            .map((s, idx, arr) => {
              const idxInCat =
                arr.filter((x, i) => i <= idx && x.category === s.category)
                  .length - 1;
              const order =
                (orderBase[s.category] || 99) +
                (s.category === "serum" || s.category === "toner"
                  ? idxInCat
                  : 0);
              return {
                id: `${s.category}_${idxInCat + 1}`,
                order,
                category: s.category,
                productId: s.productId,
                alternateProductIds: [] as any[],
                period: "either" as const,
                frequency: "daily" as const,
                notes: undefined as string | undefined,
              };
            });

          const now = Date.now();
          const name = `AI Routine · ${String(skinProfile.skinType)} · ${skinProfile.skinConcern.join(", ")}`;
          const internalApi = (await import("./_generated/api")).internal;
          const save = await ctx.runMutation(internalApi.routine.saveRoutine, {
            routine: {
              userId: skinProfile.userId,
              name,
              status: "active",
              version: 1,
              previousVersionId: undefined,
              createdAt: now,
              updatedAt: now,
              steps: stepsForSave as any,
              constraints: {
                maxSerumsPerSession: 2,
                requireSunscreenForAM: true,
                conflictRules: [],
              },
              skinSnapshot: {
                types: skinProfile.skinType,
                concerns: skinProfile.skinConcern,
                notes,
              } as any,
              source: { createdFromOrderId: undefined, createdBy: "ai" },
              metrics: { usageCount: 0, lastUsedAt: undefined },
            },
          });
          routineId = save?.routineId ?? null;
        } catch (e) {
          // Non-fatal: if routine creation fails, still return recommendations
          console.warn("recommend.createRoutine failed:", (e as any)?.message);
        }
      }

      return { recommendations: recommendations, notes, routineId };
    } catch (err) {
      return {
        success: false,
        message: "Error getting product recommendations.",
      };
    }
  },
});

// todo

// --- Seeding via mutation(s) ---
// Use this if you want to seed from the bundled JSON file at `frontend/products.json`
export const seedProductsFromFile = mutation({
  args: {},
  handler: async (ctx) => {
    const new_Product = products.map((product) => ({
      ...product,
      routineId: undefined,
    }));
    // Upsert by `slug` to avoid duplicates if run multiple times
    for (const item of new_Product as any[]) {
      const existing = await ctx.db
        .query("products")
        .filter((q) => q.eq(q.field("slug"), (item as any).slug))
        .first();
      if (existing) {
        // Update the existing doc
        await ctx.db.patch(existing._id, item as any);
      } else {
        await ctx.db.insert("products", item as any);
      }
    }
    return { success: true };
  },
});

// Internal helpers to safely read from DB within actions
export const _getAllProductsRaw = internalQuery({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();

    return await Promise.all(
      products.map(async (item) => {
        const sizesSorted = Array.isArray(item.sizes)
          ? [...item.sizes].sort((a, b) => (a.size ?? 0) - (b.size ?? 0))
          : item.sizes;

        try {
          const brand = item.brandId ? await ctx.db.get(item.brandId) : null;
          const categories = Array.isArray(item.categories)
            ? await Promise.all(
                item.categories.map((catId: Id<"categories">) =>
                  ctx.db.get(catId)
                )
              )
            : [];

          return {
            ...item,
            sizes: sizesSorted,
            categories,
            brand,
          };
        } catch (err) {
          return {
            ...item,
            sizes: sizesSorted,
          };
        }
      })
    );
  },
});

export const _getProductsByIdsRaw = internalQuery({
  args: { ids: v.array(v.id("products")) },
  handler: async (ctx, { ids }) => {
    // Deduplicate to avoid redundant reads
    const unique = Array.from(new Set(ids));

    // Fetch all docs (some may be null if not found)
    const docs = await Promise.all(unique.map((id) => ctx.db.get(id)));

    // Filter out nulls safely so we never access properties on null
    const items = docs.filter((d): d is NonNullable<typeof d> => Boolean(d));

    // Enrich: sort sizes, and populate brand & categories (filtering nulls)
    return await Promise.all(
      items.map(async (item) => {
        const sizesSorted = Array.isArray(item.sizes)
          ? [...item.sizes].sort((a, b) => (a.size ?? 0) - (b.size ?? 0))
          : item.sizes;

        try {
          const brand = item.brandId ? await ctx.db.get(item.brandId) : null;

          const categories = Array.isArray(item.categories)
            ? (
                await Promise.all(
                  item.categories.map((catId: Id<"categories">) =>
                    ctx.db.get(catId)
                  )
                )
              ).filter(Boolean)
            : [];

          return {
            ...item,
            sizes: sizesSorted,
            categories,
            brand,
          };
        } catch {
          // If enrichment fails for any reason, still return the base item
          return {
            ...item,
            sizes: sizesSorted,
          };
        }
      })
    );
  },
});

export const getAllProducts = query({
  args: {
    filters: v.optional(
      v.object({
        isBestseller: v.optional(v.boolean()),
        discount: v.optional(v.number()),
        isTrending: v.optional(v.boolean()),
        isNew: v.optional(v.boolean()),
        brandSlug: v.optional(v.string()),
      })
    ),
    limit: v.optional(v.number()),

    sort: v.optional(v.string()),

    page: v.optional(v.number()),

    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const filters = args.filters;
      const sort = args.sort;

      let products = await ctx.db.query("products").collect();

      // 🧪 Apply Filters
      if (filters) {
        const { isBestseller, isNew, isTrending, discount, brandSlug } =
          filters;

        if (isBestseller) {
          products = products.filter((p) => p.isBestseller);
        }

        if (isNew) {
          products = products.filter((p) => p.isNew);
        }

        if (isTrending) {
          products = products.filter((p) => p.isTrending);
        }

        if (discount) {
          products = products.filter((p) => p.discount && p.discount > 0);
        }

        if (brandSlug) {
          // Optionally, find brand ID by name if needed
          const brandDocs = await ctx.db
            .query("brands")
            .filter((q) => q.eq(q.field("slug"), brandSlug))
            .collect();
          const brandId = brandDocs[0]?._id;
          if (brandId) {
            products = products.filter((p) => p.brandId === brandId);
          }
        }
      }

      // 🧪 Apply Sorting
      if (sort) {
        if (sort === "trending") {
          products.sort(
            (a, b) => (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0)
          );
        }

        if (sort === "latest") {
          products.sort((a, b) => b.createdAt - a.createdAt);
        }

        // if (sort === "rating") {
        //   // Add rating field to products if needed
        //   products.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        // }

        // if (sort === "price-asc") {
        //   products.sort((a, b) => b.price - a.price);
        // }

        // if (sort === "price-desc") {
        //   products.sort((a, b) => a.price - b.price);
        // }
      }

      // Return products with sizes sorted ascending and with populated brand/categories
      return await Promise.all(
        products.map(async (item) => {
          const sizesSorted = Array.isArray(item.sizes)
            ? [...item.sizes].sort((a, b) => (a.size ?? 0) - (b.size ?? 0))
            : item.sizes;

          try {
            const brand = item.brandId ? await ctx.db.get(item.brandId) : null;
            const categories = Array.isArray(item.categories)
              ? (
                  await Promise.all(
                    item.categories.map((catId: Id<"categories">) =>
                      ctx.db.get(catId)
                    )
                  )
                ).filter(Boolean)
              : [];

            return {
              ...item,
              sizes: sizesSorted,
              categories,
              brand,
            };
          } catch (err) {
            return {
              ...item,
              sizes: sizesSorted,
            };
          }
        })
      );
    } catch (error) {
      // captureSentryError(ctx, error);
      throw error;
    }
  },
});

export const getEssentialProducts = query({
  args: {
    fragranceFree: v.optional(v.boolean()),
    perCategory: v.optional(v.number()), // max items to return per bucket
    selectedProductIds: v.optional(v.array(v.id("products"))), // products already chosen by user
  },
  handler: async (ctx, args) => {
    const perCategoryRaw = args?.perCategory;
    const perCategory =
      typeof perCategoryRaw === "number" && perCategoryRaw > 0
        ? Math.min(perCategoryRaw, 50)
        : 10; // cap to 50 for safety
    const wantFF = Boolean(args?.fragranceFree);

    // --- Helper(s)
    const includesAll = (val: any) => {
      if (!val) return false;
      if (Array.isArray(val)) return val.includes("all");
      return val === "all";
    };
    const normalize = (s: string) =>
      String(s || "")
        .toLowerCase()
        .trim();
    const isMatch = (text: string, regexes: RegExp[]) =>
      regexes.some((rx) => rx.test(text));

    const matchers = {
      cleanser: [
        /^cleanser$/,
        /face[-_\s]?wash/i,
        /gel[-_\s]?cleanser/i,
        /cleansing/i,
      ],
      moisturizer: [
        /^moisturizer$/,
        /moisturiser/i,
        /cream$/i,
        /lotion$/i,
        /gel[-_\s]?cream/i,
      ],
      sunscreen: [/^sunscreen$/, /^spf$/i, /sun[-_\s]?screen/i, /uv/i],
    };

    type EssentialsProduct = Product & { brand?: Brand | null };
    type CoreKey = "cleanser" | "moisturizer" | "sunscreen";

    // --- 0) Determine which core categories are already satisfied by the user's selections
    const satisfied = new Set<CoreKey>();
    if (
      Array.isArray(args?.selectedProductIds) &&
      args!.selectedProductIds!.length > 0
    ) {
      // Fetch selected items (ignore nulls safely)
      const selectedDocs = await Promise.all(
        args!.selectedProductIds!.map((id) => ctx.db.get(id))
      );
      const selected = selectedDocs.filter(Boolean) as any[];

      // Populate their categories to infer core keys
      const selectedWithCats: any[] = await Promise.all(
        selected.map(async (item: any) => {
          try {
            const categories = Array.isArray(item.categories)
              ? (
                  await Promise.all(
                    item.categories.map((catId: Id<"categories">) =>
                      ctx.db.get(catId)
                    )
                  )
                ).filter(Boolean)
              : [];
            return { ...item, categories };
          } catch {
            return { ...item, categories: [] };
          }
        })
      );

      // If none of the selected products can be added to a routine,
      // don't prompt essentials (e.g., bathing soap, pimple patch only)
      const anyRoutineEligible = selectedWithCats.some(
        (it: any) => it?.canBeInRoutine === true
      );
      if (!anyRoutineEligible) {
        return false;
      }

      for (const p of selectedWithCats) {
        const texts: string[] = Array.isArray(p.categories)
          ? p.categories
              .map((c: any) => normalize(c?.slug ?? c?.name ?? ""))
              .filter(Boolean)
          : [];
        // Check matches
        if (texts.some((t) => isMatch(t, matchers.cleanser)))
          satisfied.add("cleanser");
        if (texts.some((t) => isMatch(t, matchers.moisturizer)))
          satisfied.add("moisturizer");
        if (texts.some((t) => isMatch(t, matchers.sunscreen)))
          satisfied.add("sunscreen");
      }
    }

    // If all three are satisfied, return false (nothing to recommend)
    if (
      satisfied.has("cleanser") &&
      satisfied.has("moisturizer") &&
      satisfied.has("sunscreen")
    ) {
      return false;
    }

    // 1) Pull all products
    let items = await ctx.db.query("products").collect();

    // 2) Base filters for "core + universally safe"
    items = items.filter((p: any) => {
      if (!p || typeof p !== "object") return false;
      if (!p.canBeInRoutine) return false;
      if (!includesAll(p.concerns)) return false; // we assume not skin concern
      if (!includesAll(p.skinType)) return false;
      if (wantFF && p.hasFragrance) return false;
      return true;
    });

    // 3) Enrich with brand & categories so we can read category slugs/names
    const enriched = await Promise.all(
      items.map(async (item: any) => {
        const sizesSorted = Array.isArray(item?.sizes)
          ? [...item.sizes].sort((a, b) => (a?.size ?? 0) - (b?.size ?? 0))
          : item?.sizes;

        try {
          const brand = item?.brandId ? await ctx.db.get(item.brandId) : null;
          const categories = Array.isArray(item?.categories)
            ? (
                await Promise.all(
                  item.categories.map((catId: Id<"categories">) =>
                    ctx.db.get(catId)
                  )
                )
              ).filter(Boolean)
            : [];

          return { ...item, sizes: sizesSorted, brand, categories };
        } catch {
          return { ...item, sizes: sizesSorted };
        }
      })
    );

    // 4) Bucket by core categories (robust to naming variations)
    const buckets: Record<CoreKey, EssentialsProduct[]> = {
      cleanser: [],
      moisturizer: [],
      sunscreen: [],
    };

    const pushOnce = (key: CoreKey, prod: EssentialsProduct) => {
      if (satisfied.has(key)) return; // Skip entire category if already satisfied by user
      const arr = buckets[key];
      if (!arr.some((p) => String(p._id) === String(prod._id))) {
        arr.push(prod);
      }
    };

    for (const p of enriched) {
      // Try to infer category from embedded categories (prefer slug, then name)
      const catTexts: string[] = Array.isArray(p.categories)
        ? p.categories
            .map((c: any) => normalize(c?.slug ?? c?.name ?? ""))
            .filter(Boolean)
        : [];

      // Also consider a direct string property if present (some datasets carry category/categorySlug)
      const extraHints = [
        normalize((p as any).category),
        normalize((p as any).categorySlug),
      ].filter(Boolean);
      const texts = [...catTexts, ...extraHints];

      // Decide which core bucket(s) the product qualifies for
      if (texts.some((t) => isMatch(t, matchers.cleanser)))
        pushOnce("cleanser", p);
      if (texts.some((t) => isMatch(t, matchers.moisturizer)))
        pushOnce("moisturizer", p);
      if (texts.some((t) => isMatch(t, matchers.sunscreen)))
        pushOnce("sunscreen", p);
    }

    // 5) Limit per bucket
    const result = {
      cleanser: buckets.cleanser.slice(0, perCategory),
      moisturizer: buckets.moisturizer.slice(0, perCategory),
      sunscreen: buckets.sunscreen.slice(0, perCategory),
    };

    // 6) If there are no recommendations in any unsatisfied category, return false
    const unsatisfied: CoreKey[] = (
      ["cleanser", "moisturizer", "sunscreen"] as CoreKey[]
    ).filter((k) => !satisfied.has(k));
    const hasAtLeastOne = unsatisfied.some(
      (k) => (result as any)[k]?.length > 0
    );
    if (!hasAtLeastOne) return false;

    return result;
  },
});

export const getProductsByIds = query({
  args: {
    ids: v.array(v.id("products")),
  },
  handler: async (ctx, { ids }) => {
    // Deduplicate ids to avoid unnecessary reads
    const uniqueIds = Array.from(new Set(ids.map((i) => i)));

    // Fetch all docs (some may be null if missing)
    const docs = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));

    // Filter out nulls safely
    const products = docs.filter((d): d is NonNullable<typeof d> => Boolean(d));

    // Mirror the enrichment used in getAllProducts (sizes sorted, brand and categories populated)
    return await Promise.all(
      products.map(async (item) => {
        const sizesSorted = Array.isArray(item.sizes)
          ? [...item.sizes].sort((a, b) => (a.size ?? 0) - (b.size ?? 0))
          : item.sizes;

        try {
          const brand = item.brandId ? await ctx.db.get(item.brandId) : null;
          const categories = Array.isArray(item.categories)
            ? await Promise.all(
                item.categories.map((catId: Id<"categories">) =>
                  ctx.db.get(catId)
                )
              )
            : [];

          return {
            ...item,
            sizes: sizesSorted,
            categories,
            brand,
          };
        } catch {
          return {
            ...item,
            sizes: sizesSorted,
          };
        }
      })
    );
  },
});
