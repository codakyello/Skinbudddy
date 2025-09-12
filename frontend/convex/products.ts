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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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

export const recommend = action({
  args: {
    skinConcern: v.array(SkinConcern),
    skinType: SkinType,
    // Support both spellings for backward compatibility
    ingredientsToAvoid: v.optional(v.array(IngredientSensitivity)),
    fragranceFree: v.optional(v.boolean()),

    // alcoholFree: v.optional(v.boolean()),
    // fragranceFree: v.optional(v.boolean()),
  },
  handler: async (ctx, skinProfile) => {
    // read any needed data first
    // const profile = await ctx.db
    //   .query("profiles")
    //   .withIndex("by_user", (q) => q.eq("userId", userId))
    //   .unique();

    // for routine
    // The user has the skin profile above.
    // From the availableProducts list,
    // recommend a safe skincare routine.
    // Carefully analyze ingredients to avoid
    //  conflicts (e.g., retinol + exfoliating acids,
    //  too many actives in one step).
    // Ensure each step of the routine has only
    // one product per category (one cleanser, one moisturizer, etc.).
    //  Then structure the routine into AM and PM steps.
    // If something should only be used a few times a week,
    // indicate that. Also explain briefly why you included/excluded certain products

    // recommend
    // The user has the skin profile above.
    // From the availableProducts list,
    // recommend products.
    // Carefully analyze ingredients to avoid
    //  conflicts (e.g., retinol + exfoliating acids,
    //  too many actives in one step).
    // Ensure each step of the routine has only
    // one product per category (one cleanser, one moisturizer, etc.).
    // indicate that. Also explain briefly why you included/excluded certain products

    // let all = await ctx.db.query("products").collect();

    // Pull raw products via an internal query to avoid action ctx.db access
    const internalAny = (await import("./_generated/api")).internal as any;
    const all = await ctx.runQuery(internalAny.products._getAllProductsRaw, {});

    // 2) Pre-filter by hard constraints before AI
    // Unify avoid list from args
    const avoidList: string[] = Array.isArray(skinProfile.ingredientsToAvoid)
      ? (skinProfile.ingredientsToAvoid as string[])
      : Array.isArray((skinProfile as any).ingredientsToavoid)
        ? ((skinProfile as any).ingredientsToavoid as string[])
        : [];

    // const availableProducts = all
    //   .filter((p: any) => {
    //     const ingredients = (p.ingredients ?? []).map((ing: string) =>
    //       ing.toLowerCase().split(" ").join("_")
    //     );

    //     // Expand "ahas-bhas" avoid flag into individual acids
    //     const wantsNoAcids =
    //       Array.isArray(avoidList) && avoidList.includes("ahas-bhas");
    //     const AHA_BHA_SET = new Set<string>([
    //       "glycolic_acid",
    //       "lactic_acid",
    //       "mandelic_acid",
    //       "tartaric_acid",
    //       "citric_acid",
    //       "malic_acid",
    //       "salicylic_acid",
    //     ]);
    //     if (
    //       wantsNoAcids &&
    //       ingredients.some((ing: string) => AHA_BHA_SET.has(ing))
    //     ) {
    //       return false;
    //     }

    //     // console.log(ingredients);

    //     if (!p.canBeInRoutine) return false;

    //     if (skinProfile.fragranceFree && p.hasFragrance) return false;
    //     if (
    //       avoidList.length > 0 &&
    //       avoidList.some((ing) => ingredients.includes(ing))
    //     )
    //       return false;

    //     // First: Does it work for me?
    //     // Skin concern
    //     if (skinProfile.skinConcern) {
    //       const sc = (p as any).concerns;
    //       const matchesConcern = Array.isArray(sc)
    //         ? sc.some(
    //             (c: any) => skinProfile.skinConcern.includes(c) || c === "all"
    //           )
    //         : skinProfile.skinConcern.includes(sc) || sc === "all";
    //       if (!matchesConcern) return false;
    //     }

    //     // Skin type
    //     // what if works for all skinType but not for my condition?
    //     if (skinProfile.skinType) {
    //       const st = (p as any).skinType;
    //       const matchesSkinType = Array.isArray(st)
    //         ? st.some((t: any) => t === skinProfile.skinType || t === "all")
    //         : st === skinProfile.skinType || st === "all";
    //       if (!matchesSkinType) return false;
    //     }

    //     return true; // keep if all specified constraints passed
    //   })
    //   .map((product: any) => ({
    //     _id: product._id,
    //     categories: product.categories,
    //     name: product.name,
    //     concerns: product.concerns,
    //     skinType: product.skinType,
    //     ingredients: product.ingredients,
    //   }));

    // Define drying (problematic) alcohols vs. fatty (safe) alcohols

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

    // console.log(products);

    // return;
    const prompt = `You are generating a skincare recommendation based 
    on the skin profile and the provided availableProducts (objects with
    _id, name, categories, ingredients, concerns, skinType).

Rules:
- Choose only from availableProducts; do not invent IDs or names.
- One product per category (cleanser, toner, moisturizer, sunscreen ), except "serum" where 1–3 products are allowed.
- Avoid ingredient conflicts (e.g., retinoids + strong acids in the same routine, too many overlapping actives).
- Prefer products where concerns and skinType match the skin profile.
- If a step cannot be safely filled, omit it and explain why in notes.
-	This is very important: Add important usage or caution notes only when necessary 
  (e.g., for exfoliating acids like glycolic acid: “do a patch test before use,”
  or for retinol: “use only at night and apply sunscreen in the morning”). 
  Do not add notes for basic products like moisturizers or hydrating serums unless truly relevant.

Output:
Return ONLY a valid JSON object, with no prose and no markdown, matching exactly:
{
  "recommendations": [
    {"_id": "<product id>", "name": "<product name>", "category": "cleanser"},
    {"_id": "<product id>", "name": "<product name>", "category": "toner"},
    {"_id": "<product id>", "name": "<product name>", "category": "serum"},
    {"_id": "<product id>", "name": "<product name>", "category": "moisturizer"},
    {"_id": "<product id>", "name": "<product name>", "category": "sunscreen"}
  ],
  "notes": "<short explanation about choices and exclusions, state the name of the products you are explaining>"

Formatting constraints:
- Keys and string values must be in double quotes; no trailing commas.
- The recommendations array must be sorted strictly by category in this order: cleanser, toner, serum(s), moisturizer, sunscreen.
- Use only these category strings: "cleanser", "toner", "serum", "moisturizer", "sunscreen".
- Each recommendation's "_id" and "name" MUST come from the matching product in availableProducts (exact string match).

Sort the \`recommendations\` array in this exact order: cleanser, toner, serum, moisturizer, sunscreen.

`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are SkinBuddy AI, a professional skincare recommender and expert. 
          Never mention OpenAI—always introduce yourself as SkinBuddy AI. 
          You specialize in analyzing skin types, skin concerns, and ingredients to provide safe, 
          effective, and well-structured skincare recommendations. 
          Always explain your choices clearly and avoid jargon so users feel confident and informed.
          `,
        },
        {
          role: "user",
          content: `Skin profile: ${JSON.stringify(skinProfile)}
Available products: ${JSON.stringify(availableProducts)}
${prompt} also this is very important: Add important usage or caution notes only when necessary 
  (e.g., for exfoliating acids like glycolic acid: “do a patch test before use,”
  or for retinol: “use only at night and apply sunscreen in the morning”). 
  Do not add notes for basic products like moisturizers or hydrating serums unless truly relevant.`,
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Fallback: try to extract the first JSON object from the text
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error("Model did not return valid JSON");
      }
    }

    const recs = Array.isArray(parsed?.recommendations)
      ? parsed.recommendations
      : [];

    // Resolve strictly against the allowed pool so disallowed items can't slip back in
    const idByString = new Map<string, any>(
      availableProducts.map((p: any) => [String(p._id), p._id])
    );
    const idByName = new Map<string, any>(
      availableProducts.map((p: any) => [String(p.name), p._id])
    );
    const ids = Array.from(
      new Set(
        recs
          .map(
            (r: { _id: string; name: string; category: string }) =>
              idByString.get(String(r._id)) ?? idByName.get(String(r.name))
          )
          .filter(Boolean) as any[]
      )
    );

    const notes = typeof parsed?.notes === "string" ? parsed.notes : "";

    // Fetch full product docs for the recommended ids using an internal query
    const recommendations = await ctx.runQuery(
      internalAny.products._getProductsByIdsRaw,
      { ids }
    );

    return { recommendations: recommendations, notes };

    // const parsed = JSON.parse(result); // clean JSON object

    // console.log(result);

    // return parsed;
  },
});

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
      // lets add a 5 seconds delay here
      // await wait(5)

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
