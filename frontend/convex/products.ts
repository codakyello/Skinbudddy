import { v } from "convex/values";
import { action, mutation, query, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import OpenAI from "openai";
// import { captureSentryError } from "./_utils/sentry";
import products from "../products.json";
// Convex internal helper import is static to avoid runtime dynamic import failures.
import { SkinConcern, SkinType } from "./schema";
import { AHA_BHA_SET, DRYING_ALCOHOLS } from "../convex/_utils/products";
import { Product, Brand } from "./_utils/type";
import { runChatCompletion } from "./_utils/internalUtils";
import {
  resolveSkinConcern,
  resolveSkinType,
  type SkinConcernCanonical,
  type SkinTypeCanonical,
} from "../shared/skinMappings.js";

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

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const toTokenSet = (input: string) =>
  new Set(
    normalizeText(input)
      .split(" ")
      .filter((token) => token.length > 0)
  );

const jaccardSimilarity = (a: Set<string>, b: Set<string>) => {
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size || 1;
  return intersection / union;
};

interface AIRecommendation {
  productId: Id<"products">;
  aiOrder: number;
  category: string;
  description: string;
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
    excludeProductIds: v.optional(
      v.array(v.union(v.id("products"), v.string()))
    ),
  },

  handler: async (ctx, skinProfile) => {
    console.log(
      skinProfile.skinConcern,
      skinProfile.skinType,
      "This is skinProfile"
    );
    try {
      // Pull raw products via an internal query to avoid action ctx.db access
      const internalAny = internal as any;
      const all = await ctx.runQuery(
        internalAny.products._getAllProductsRaw,
        {}
      );

      const allById = new Map<string, any>(
        all.map((item: any) => [String(item?._id), item])
      );

      const excludeValues = Array.isArray(skinProfile.excludeProductIds)
        ? skinProfile.excludeProductIds
        : [];
      const excludedLookup = new Set(
        excludeValues.map((value) => String(value).toLowerCase())
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
          const productId = String(p._id);
          const productSlug =
            typeof p.slug === "string" ? p.slug.toLowerCase() : null;

          if (
            excludedLookup.has(productId.toLowerCase()) ||
            (productSlug && excludedLookup.has(productSlug))
          ) {
            return false;
          }

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
          slug: product.slug,
          categories: product.categories,
          name: product.name,
          concerns: product.concerns,
          skinType: product.skinType,
          ingredients: product.ingredients,
          description:
            typeof product.shortDescription === "string"
              ? product.shortDescription
              : product.description,
        }));

      const excludedProductsForPrompt = all
        .filter((product: any) => {
          const id = String(product._id).toLowerCase();
          const slug =
            typeof product.slug === "string"
              ? product.slug.toLowerCase()
              : null;
          const name =
            typeof product.name === "string"
              ? product.name.toLowerCase()
              : null;
          return (
            excludedLookup.has(id) ||
            (slug && excludedLookup.has(slug)) ||
            (name && excludedLookup.has(name))
          );
        })
        .map((product: any) => ({
          _id: String(product._id),
          name: product.name,
        }));

      const mandatoryCategories = [
        { key: "cleanser", label: "cleanser" },
        { key: "moisturizer", label: "moisturizer" },
        { key: "sunscreen", label: "sunscreen" },
      ];

      const hasCategoryAvailable = (key: string) =>
        availableProducts.some((product: any) =>
          (product.categories ?? []).some((category: any) => {
            const raw =
              typeof category === "string" ? category : category?.name;
            const normalized = String(raw ?? "").toLowerCase();
            if (key === "moisturizer") {
              return (
                normalized === "moisturizer" || normalized === "moisturiser"
              );
            }
            return normalized === key;
          })
        );

      const missingMandatory = mandatoryCategories.filter(
        ({ key }) => !hasCategoryAvailable(key)
      );

      if (missingMandatory.length > 0) {
        return {
          success: false,
          message: `We couldn't find any available ${missingMandatory
            .map((item) => item.label)
            .join(
              ", "
            )} options to build a complete routine. Please adjust your filters or try again without excluding those items.`,
        };
      }

      const excludedPromptSegment =
        excludedProductsForPrompt.length > 0
          ? `
      PRODUCTS TO AVOID (already shown or rejected):
      ${JSON.stringify(excludedProductsForPrompt)}
      Never include any product whose id or name appears in the list above.`
          : "";

      const prompt = `
      STRICT RULES — NO EXCEPTIONS:
      - Exactly 1 cleanser (mandatory)
      - Maximum 1 toner (PRIORITIZE including if suitable match exists)
      - Maximum 3 serums
      - Exactly 1 moisturizer (mandatory)
      - Exactly 1 sunscreen (mandatory)
      ${excludedPromptSegment}

      OUTPUT REQUIREMENTS:
      - Respond with a short routine summary in "notes".
      - For each product in "recommendations", include:
        * "_id": exact database id provided.
        * "name": product name.
        * "category": lowercase category label.
        * "description": 12–18 word benefit statement in plain language (no marketing fluff).
      - **CRITICAL**: Return products in STRICT application order. The array index IS the application order:
        1. Cleanser (always first)
        2. Toner (if included, always after cleanser)
        3. Serums (in order of layering priority, typically thinnest to thickest)
        4. Moisturizer (always second-to-last)
        5. Sunscreen (always last)
      - DO NOT reorder products in the JSON array for any reason.
      
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
    {
      "_id": "exact_id",
      "name": "exact_name",
      "category": "from_product_data",
      "description": "User benefit summary focusing on what the product does FOR skin (prevents, protects, treats, improves). Avoid listing features like SPF numbers or ingredients. ≤18 words."
    }
  ],
  "notes": "Brief explanation of why these products work together + ONLY necessary caution notes for potent actives (e.g., retinoids, strong acids)."
}
      `;

      // Validate using the AI's category assignments
      const isValidSelection = (recs: any[]): boolean => {
        const allowed = new Set([
          "cleanser",
          "toner",
          "serum",
          "moisturiser",
          "moisturizer",
          "sunscreen",
        ]);
        const counts: Record<string, number> = {};
        for (const r of recs) {
          const cat = String(r?.category || "")
            .toLowerCase()
            .trim();
          if (!allowed.has(cat)) return false;

          // Normalize moisturiser to moisturizer for counting
          const normalizedCat = cat === "moisturiser" ? "moisturizer" : cat;
          counts[normalizedCat] = (counts[normalizedCat] || 0) + 1;
        }
        // Mandatory singles
        if ((counts["cleanser"] || 0) !== 1) return false;
        if ((counts["moisturizer"] || 0) !== 1) return false;
        if ((counts["sunscreen"] || 0) !== 1) return false;
        // Maximums
        if ((counts["toner"] || 0) > 1) return false;
        if ((counts["serum"] || 0) > 3) return false;
        return true;
      };

      const MAX_ATTEMPTS = 3;
      let attempts = 0;
      let lastParsedRecs: any[] = [];
      let notes = "";

      do {
        const data = await runChatCompletion(prompt, "gpt-4o-mini", 0.1);
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

      // Resolve strictly against the allowed pool
      const idByString = new Map<string, any>(
        availableProducts.map((p: any) => [String(p._id).toLowerCase(), p._id])
      );
      const idByName = new Map<string, any>(
        availableProducts
          .filter((p: any) => typeof p.name === "string")
          .map((p: any) => [String(p.name).toLowerCase(), p._id])
      );
      const idBySlug = new Map<string, any>(
        availableProducts
          .filter((p: any) => typeof p.slug === "string")
          .map((p: any) => [String(p.slug).toLowerCase(), p._id])
      );

      const resolvedRecs = lastParsedRecs
        .map((r: any, index: number) => {
          if (!r) return null;
          const rawId =
            typeof r._id === "string" ? r._id.toLowerCase() : undefined;
          const rawName =
            typeof r.name === "string" ? r.name.toLowerCase() : undefined;
          const rawSlug =
            typeof r.slug === "string" ? r.slug.toLowerCase() : undefined;

          const productId =
            (rawId && idByString.get(rawId)) ||
            (rawSlug && idBySlug.get(rawSlug)) ||
            (rawName && idByName.get(rawName));

          if (!productId) return null;

          const categoryRaw = String(r?.category ?? "")
            .toLowerCase()
            .trim();

          const category =
            categoryRaw === "moisturiser" ? "moisturizer" : categoryRaw;

          if (
            ![
              "cleanser",
              "toner",
              "serum",
              "moisturizer",
              "sunscreen",
            ].includes(category)
          ) {
            return null;
          }

          if (
            excludedLookup.has(String(productId).toLowerCase()) ||
            (rawName && excludedLookup.has(rawName))
          ) {
            return null;
          }

          const description =
            typeof r.description === "string" ? r.description : "";

          return {
            productId,
            category,
            description,
            aiOrder: index, // Preserve AI's intended order
          };
        })
        .filter(Boolean) as Array<{
        productId: Id<"products">;
        category: string;
        description: string;
        aiOrder: number;
      }>;

      const normalizeCategoryKey = (value: unknown): string | null => {
        if (typeof value !== "string") return null;
        const normalized = value.toLowerCase().trim();
        if (!normalized.length) return null;
        if (normalized === "moisturiser") return "moisturizer";
        return normalized;
      };

      const extractCategoryKeys = (product: any): string[] => {
        if (!product) return [];
        const categories = Array.isArray(product.categories)
          ? product.categories
          : [];
        const keys = new Set<string>();
        for (const category of categories) {
          if (typeof category === "string") {
            const key = normalizeCategoryKey(category);
            if (key) keys.add(key);
            continue;
          }
          if (!category || typeof category !== "object") continue;
          const record = category as Record<string, unknown>;
          const fromName = normalizeCategoryKey(record.name);
          if (fromName) keys.add(fromName);
          const fromSlug = normalizeCategoryKey(record.slug);
          if (fromSlug) keys.add(fromSlug);
        }
        return Array.from(keys);
      };

      const toLowerArray = (value: unknown): string[] => {
        if (Array.isArray(value)) {
          return value
            .map((entry) => String(entry || "").toLowerCase().trim())
            .filter((entry) => entry.length > 0);
        }
        if (typeof value === "string") {
          const normalized = value.toLowerCase().trim();
          return normalized.length ? [normalized] : [];
        }
        return [];
      };

      const userConcerns = new Set<string>(
        Array.isArray(skinProfile.skinConcern)
          ? skinProfile.skinConcern.map((c: string) => c.toLowerCase())
          : []
      );
      const userSkinType =
        typeof skinProfile.skinType === "string"
          ? skinProfile.skinType.toLowerCase()
          : "";

      const computeAlternativeScore = (product: any): number => {
        if (!product) return 0;
        let score = 0;

        const productConcerns = toLowerArray(product.concerns);
        if (productConcerns.includes("all")) {
          score += 0.5;
        }
        const matchedConcerns = productConcerns.filter((concern) =>
          userConcerns.has(concern)
        ).length;
        score += matchedConcerns * 1.5;

        const productSkinTypes = toLowerArray(product.skinType);
        if (productSkinTypes.includes(userSkinType)) {
          score += 1.2;
        } else if (productSkinTypes.includes("all")) {
          score += 0.6;
        }

        if (Array.isArray(product.ingredients)) {
          const hasHeavyActives = product.ingredients.some((ingredient: any) =>
            typeof ingredient === "string"
              ? /retinol|retinoid|glycolic|salicylic|lactic|aha|bha|ascorbic/i.test(
                  ingredient
                )
              : false
          );
          if (!hasHeavyActives) {
            score += 0.2;
          }
        }

        return score;
      };

      const primaryIds = new Set<string>(
        resolvedRecs.map((rec) => String(rec.productId))
      );
      const categoriesInRoutine = new Set<string>(
        resolvedRecs.map((rec) => rec.category)
      );
      const MAX_ALTERNATIVES_PER_CATEGORY = 2;

      const alternativesByCategory = new Map<
        string,
        Array<{ productId: Id<"products">; score: number }>
      >();

      for (const product of all) {
        if (!product || typeof product !== "object") continue;
        const productId = (product as any)?._id as Id<"products"> | undefined;
        if (!productId) continue;
        const idString = String(productId);
        if (primaryIds.has(idString)) continue;
        if (excludedLookup.has(idString.toLowerCase())) continue;

        const categoryKeys = extractCategoryKeys(product);
        if (!categoryKeys.length) continue;

        const matchedCategories = categoryKeys.filter((category) =>
          categoriesInRoutine.has(category)
        );
        if (!matchedCategories.length) continue;

        const score = computeAlternativeScore(product);
        if (score <= 0) continue;

        for (const category of matchedCategories) {
          const current = alternativesByCategory.get(category) ?? [];
          current.push({ productId, score });
          alternativesByCategory.set(category, current);
        }
      }

      const selectedAlternatives = new Map<
        string,
        Array<{ productId: Id<"products">; score: number }>
      >();

      for (const [category, options] of alternativesByCategory.entries()) {
        const deduped = new Map<string, { productId: Id<"products">; score: number }>();
        for (const option of options) {
          const key = String(option.productId);
          const existing = deduped.get(key);
          if (!existing || existing.score < option.score) {
            deduped.set(key, option);
          }
        }
        const ranked = Array.from(deduped.values())
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_ALTERNATIVES_PER_CATEGORY);
        if (ranked.length) {
          selectedAlternatives.set(category, ranked);
        }
      }

      const alternativeIds = Array.from(
        new Set(
          Array.from(selectedAlternatives.values()).flatMap((options) =>
            options.map((option) => option.productId)
          )
        )
      );

      const ids = Array.from(
        new Set([
          ...resolvedRecs.map((rec) => rec.productId),
          ...alternativeIds,
        ])
      );

      // Fetch full product docs
      const recommendedProducts = ids.length
        ? await ctx.runQuery(internal.products._getProductsByIdsRaw, { ids })
        : [];

      const productById = new Map<string, Doc<"products">>(
        (recommendedProducts as Doc<"products">[]).map(
          (product: Doc<"products">) => [String(product._id), product]
        )
      );

      const normalizeDescription = (input: unknown) =>
        typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";

      const fallbackDescriptionFor = (product: Doc<"products">) => {
        const anyProduct = product as any;
        const source =
          typeof anyProduct?.shortDescription === "string"
            ? anyProduct.shortDescription
            : typeof anyProduct?.description === "string"
              ? anyProduct.description
              : "";
        const normalized = normalizeDescription(source);
        if (!normalized.length) return "";
        const sentenceMatch = normalized.match(/^[^.?!]+[.?!]?/);
        return sentenceMatch ? sentenceMatch[0] : normalized;
      };

      const limitWords = (text: string, maxWords = 20) => {
        const words = text.split(" ").filter(Boolean);
        if (words.length <= maxWords) return text;
        return `${words.slice(0, maxWords).join(" ")}…`;
      };

      notes = normalizeDescription(notes);

      const seenProductIds = new Set<string>();

      // Build recommendations preserving AI's order
      const recommendations: Array<{
        category: string;
        description: string;
        productId: Id<"products">;
        product: Doc<"products">;
        order: number;
        alternatives?: Array<{
          productId: Id<"products">;
          product: Doc<"products">;
          description: string;
        }>;
      } | null> = resolvedRecs
        .sort((a, b) => a.aiOrder - b.aiOrder) // ← Trust AI's order
        .map(
          (
            rec: AIRecommendation,
            finalOrder
          ): {
            category: string;
            description: string;
            productId: Id<"products">;
            product: Doc<"products">;
            order: number;
            alternatives?: Array<{
              productId: Id<"products">;
              product: Doc<"products">;
              description: string;
            }>;
          } | null => {
            const product: Doc<"products"> | undefined = productById.get(
              String(rec.productId)
            );
            if (!product) return null;

            const key = String(rec.productId);
            if (seenProductIds.has(key)) return null;
            seenProductIds.add(key);

            const normalizedDescription = normalizeDescription(rec.description);
            const fallback = fallbackDescriptionFor(product);
            const description =
              normalizedDescription.length > 0
                ? limitWords(normalizedDescription, 20)
                : fallback.length > 0
                  ? limitWords(fallback, 20)
                  : "";

            const categoryAlternatives =
              selectedAlternatives.get(rec.category) ?? [];
            const alternatives = categoryAlternatives
              .map((option) => {
                const altKey = String(option.productId);
                if (altKey === key) return null;
                const altProduct = productById.get(altKey);
                if (!altProduct) return null;
                const altDescriptionSource = fallbackDescriptionFor(altProduct);
                const altDescription = limitWords(
                  normalizeDescription(altDescriptionSource),
                  20
                );
                return {
                  productId: option.productId,
                  product: altProduct,
                  description: altDescription,
                };
              })
              .filter(
                (
                  value
                ): value is {
                  productId: Id<"products">;
                  product: Doc<"products">;
                  description: string;
                } => Boolean(value)
              );

            return {
              category: rec.category,
              description,
              productId: rec.productId,
              product,
              order: finalOrder, // Sequential order for frontend
              alternatives: alternatives.length ? alternatives : undefined,
            };
          }
        )
        .filter(
          (
            rec
          ): rec is {
            category: string;
            description: string;
            productId: Id<"products">;
            product: Doc<"products">;
            order: number;
            alternatives?: Array<{
              productId: Id<"products">;
              product: Doc<"products">;
              description: string;
            }>;
          } => rec !== null
        );

      return { recommendations, notes };
    } catch (err) {
      console.error("recommend handler error:", err);
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
        brandSlugs: v.optional(v.array(v.string())),
        categorySlugs: v.optional(v.array(v.string())),
        skinTypes: v.optional(v.array(SkinType)),
      })
    ),
    limit: v.optional(v.number()),

    sort: v.optional(v.string()),

    page: v.optional(v.number()),

    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("inside get all products");
    try {
      const filters = args.filters;
      const sort = args.sort;

      let products = await ctx.db.query("products").collect();

      // 🧪 Apply Filters
      if (filters) {
        const {
          isBestseller,
          isNew,
          isTrending,
          discount,
          brandSlugs,
          categorySlugs,
          skinTypes,
        } = filters;

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

        if (Array.isArray(brandSlugs) && brandSlugs.length) {
          const brandDocs = await ctx.db
            .query("brands")
            .filter((q) =>
              q.or(...brandSlugs.map((slug) => q.eq(q.field("slug"), slug)))
            )
            .collect();
          const brandIds = new Set(
            brandDocs.map((doc) => doc?._id).filter(Boolean)
          );
          if (brandIds.size) {
            products = products.filter((p) =>
              p.brandId ? brandIds.has(p.brandId) : false
            );
          } else {
            products = [];
          }
        }

        if (Array.isArray(categorySlugs) && categorySlugs.length) {
          const categoryDocs = await ctx.db
            .query("categories")
            .filter((q) =>
              q.or(...categorySlugs.map((slug) => q.eq(q.field("slug"), slug)))
            )
            .collect();
          const categoryIds = new Set(
            categoryDocs.map((doc) => doc?._id).filter(Boolean)
          );
          if (categoryIds.size) {
            products = products.filter((product) =>
              Array.isArray(product.categories)
                ? product.categories.some((categoryId) =>
                    categoryIds.has(categoryId)
                  )
                : false
            );
          } else {
            products = [];
          }
        }

        if (Array.isArray(skinTypes) && skinTypes.length) {
          const requested = new Set(
            skinTypes.map((type) => String(type).toLowerCase())
          );

          products = products.filter((product) => {
            const types = Array.isArray(product.skinType)
              ? product.skinType.map((t: string) => String(t).toLowerCase())
              : [];

            if (!types.length) return false;
            if (types.includes("all")) return true;

            for (const type of types) {
              if (requested.has(type)) return true;
            }
            return false;
          });
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
      const productsPopulated = await Promise.all(
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
              success: true,
              ...item,
              sizes: sizesSorted,
              categories,
              brand,
            };
          } catch (err) {
            return {
              success: true,
              ...item,
              sizes: sizesSorted,
            };
          }
        })
      );

      return { success: true, products: productsPopulated };
    } catch (error) {
      console.log(" get all products failed", error);
      // captureSentryError(ctx, error);
      throw new Error("Error getting all products");
    }
  },
});

// convex/products.ts (add this)
type ProductCardSize = {
  id: string;
  size: number;
  unit: string;
  price: number;
  discount?: number;
  stock?: number;
  currency?: string;
};

type ProductCardSummary = {
  id: Id<"products">;
  slug: string;
  name: string;
  description?: string;
  images: string[];
  sizes: ProductCardSize[];
  score?: number;
  brand?: { name?: string; slug?: string };
  nameMatchCount?: number;
  categories?: Array<{ name?: string; slug?: string }>;
  ingredients?: string[];
};

type SearchProductsByQueryArgs = {
  nameQuery?: string;
  categoryQuery?: string;
  brandQuery?: string;
  skinTypes?: (typeof SkinType.type)[];
  skinTypeQueries?: string[];
  skinConcerns?: (typeof SkinConcern.type)[];
  skinConcernQueries?: string[];
  ingredientQueries?: string[];
  limit?: number;
  skip?: number;
  hasAlcohol?: boolean;
  hasFragrance?: boolean;
};

type SearchProductsByQueryResult =
  | {
      success: false;
      reason:
        | "ambiguous_or_not_found"
        | "brand_not_found"
        | "category_not_found";
      categoryOptions: unknown[];
      brandOptions: unknown[];
    }
  | {
      success: true;
      filters: {
        categorySlugs: string[];
        brandSlugs: string[];
        skinTypes?: (typeof SkinType.type)[];
        skinConcerns?: (typeof SkinConcern.type)[];
        ingredientQueries?: string[];
      };
      products: ProductCardSummary[];
    };

const MINIMUM_FUZZY_SCORE = 0.2;

// pass in a categoryQuery dosent have to be exactly the same name, system resolves it and sends the closest matching query, same for brandslug too

async function searchProductsByQueryImpl(
  ctx: QueryCtx,
  {
    nameQuery,
    categoryQuery,
    brandQuery,
    skinTypes,
    skinTypeQueries,
    skinConcerns,
    skinConcernQueries,
    ingredientQueries,
    limit = 5, // hard 5 limit default to avoid bloating llm
    skip, // lets implement this later
    hasAlcohol,
    hasFragrance,
  }: SearchProductsByQueryArgs
): Promise<SearchProductsByQueryResult> {
  const normalizedNameQuery =
    typeof nameQuery === "string" ? normalizeText(nameQuery) : "";
  const hasNameQuery = normalizedNameQuery.length > 0;
  const nameTokens = hasNameQuery
    ? new Set(
        normalizedNameQuery.split(" ").filter((token) => token.length > 0)
      )
    : null;

  const ingredientLookup = new Map<string, string>();

  const allProducts = await ctx.db.query("products").collect();
  for (const item of allProducts) {
    if (!Array.isArray(item.ingredients)) continue;
    for (const rawIngredient of item.ingredients) {
      if (typeof rawIngredient !== "string") continue;
      const comparable = normalizeText(rawIngredient);
      if (!comparable) continue;
      const canonical = normalizeIngredient(rawIngredient);
      if (canonical) {
        ingredientLookup.set(comparable, canonical);
      }
    }
  }

  const resolveImplicitIngredients = (input?: string) => {
    const value = typeof input === "string" ? normalizeText(input) : "";
    if (!value || !ingredientLookup.size) return [] as string[];

    const matchesPhrase = (haystack: string, phrase: string): boolean => {
      if (!phrase) return false;
      let start = haystack.indexOf(phrase);
      while (start !== -1) {
        const beforeOk = start === 0 || haystack[start - 1] === " ";
        const end = start + phrase.length;
        const afterOk = end === haystack.length || haystack[end] === " ";
        if (beforeOk && afterOk) return true;
        start = haystack.indexOf(phrase, start + 1);
      }
      return false;
    };

    const detected = new Set<string>();
    for (const [comparable, canonical] of ingredientLookup.entries()) {
      if (matchesPhrase(value, comparable)) {
        detected.add(canonical);
      }
    }
    return Array.from(detected);
  };

  const categoryResolution: { slugs: string[]; options?: unknown[] } =
    categoryQuery?.trim()
      ? await ctx.runQuery(internal.categories.resolveCategorySlugs, {
          categoryQuery,
        })
      : { slugs: [] };
  const brandResolution: { slugs: string[]; options?: unknown[] } =
    brandQuery?.trim()
      ? await ctx.runQuery(internal.brands.resolveBrandSlugs, { brandQuery })
      : { slugs: [] };

  const categorySlugs = Array.isArray(categoryResolution.slugs)
    ? categoryResolution.slugs
    : [];

  console.log(categorySlugs, "This is the category slug");

  const brandSlugs = Array.isArray(brandResolution.slugs)
    ? brandResolution.slugs
    : [];

  console.log(brandSlugs, "This is the brand slug");

  const requestedSkinTypeSet = new Set<SkinTypeCanonical>();
  if (Array.isArray(skinTypes)) {
    skinTypes.forEach((value) => {
      const resolved = resolveSkinType(String(value));
      if (resolved) requestedSkinTypeSet.add(resolved);
    });
  }
  if (Array.isArray(skinTypeQueries)) {
    skinTypeQueries.forEach((value) => {
      const resolved = resolveSkinType(String(value));
      if (resolved) requestedSkinTypeSet.add(resolved);
    });
  }
  const requestedSkinTypes = Array.from(requestedSkinTypeSet);

  const requestedSkinConcernSet = new Set<SkinConcernCanonical>();
  if (Array.isArray(skinConcerns)) {
    skinConcerns.forEach((value) => {
      const resolved = resolveSkinConcern(String(value));
      if (resolved) requestedSkinConcernSet.add(resolved);
    });
  }
  if (Array.isArray(skinConcernQueries)) {
    skinConcernQueries.forEach((value) => {
      const resolved = resolveSkinConcern(String(value));
      if (resolved) requestedSkinConcernSet.add(resolved);
    });
  }
  const requestedSkinConcerns = Array.from(requestedSkinConcernSet);

  const implicitIngredients = new Set<string>([
    ...resolveImplicitIngredients(nameQuery),
    ...resolveImplicitIngredients(categoryQuery),
    ...resolveImplicitIngredients(brandQuery),
  ]);

  const ingredientQueryRaw = Array.isArray(ingredientQueries)
    ? ingredientQueries
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
    : [];

  const ingredientQueryGroupsRaw = ingredientQueryRaw.map((value) =>
    value.split("||").flatMap((part) =>
      part
        .split(/[,;]/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0)
    )
  );

  const implicitIngredientGroups = Array.from(implicitIngredients).map(
    (value) => [value]
  );

  const combinedIngredientGroupsRaw = [
    ...ingredientQueryGroupsRaw,
    ...implicitIngredientGroups,
  ];

  const normalizedIngredientGroups = combinedIngredientGroupsRaw
    .map((group) =>
      Array.from(
        new Set(
          group
            .map((value) => normalizeIngredient(value))
            .filter((value) => value && value.length > 0)
        )
      )
    )
    .filter((group) => group.length > 0);

  const normalizedIngredientQueries = Array.from(
    new Set(normalizedIngredientGroups.flat())
  );

  if (
    !categorySlugs.length &&
    !brandSlugs.length &&
    !hasNameQuery &&
    !requestedSkinTypes.length &&
    !requestedSkinConcerns.length &&
    !normalizedIngredientQueries.length
  ) {
    return {
      success: false,
      reason: "ambiguous_or_not_found",
      categoryOptions: categoryResolution.options ?? [],
      brandOptions: brandResolution.options ?? [],
    };
  }

  console.log(categorySlugs, brandSlugs, "slugs");

  let products = allProducts;

  if (brandSlugs.length) {
    const brandDocs = await Promise.all(
      brandSlugs.map((slug) =>
        ctx.db
          .query("brands")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .unique()
      )
    );
    const brandIds = new Set(
      brandDocs
        .filter((doc): doc is Doc<"brands"> => Boolean(doc))
        .map((doc) => doc._id)
    );
    if (!brandIds.size) {
      return {
        success: false,
        reason: "brand_not_found",
        categoryOptions: categoryResolution.options ?? [],
        brandOptions: brandResolution.options ?? [],
      };
    }
    products = products.filter((product) =>
      product.brandId ? brandIds.has(product.brandId as Id<"brands">) : false
    );
  }

  if (categorySlugs.length) {
    const categoryDocs = await Promise.all(
      categorySlugs.map((slug) =>
        ctx.db
          .query("categories")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .unique()
      )
    );
    const categoryIds = new Set(
      categoryDocs
        .filter((doc): doc is Doc<"categories"> => Boolean(doc))
        .map((doc) => doc._id)
    );
    if (!categoryIds.size) {
      return {
        success: false,
        reason: "category_not_found",
        categoryOptions: categoryResolution.options ?? [],
        brandOptions: brandResolution.options ?? [],
      };
    }
    products = products.filter((product) =>
      Array.isArray(product.categories)
        ? product.categories.some((categoryId) =>
            categoryIds.has(categoryId as Id<"categories">)
          )
        : false
    );
  }

  if (requestedSkinTypes.length) {
    const requestedSet = new Set<string>(requestedSkinTypes);
    products = products.filter((product) => {
      const productTypes = Array.isArray(product.skinType)
        ? product.skinType.map((t: string) => String(t).toLowerCase())
        : [];

      if (!productTypes.length) return false;
      if (productTypes.includes("all")) return true;

      for (const type of productTypes) {
        if (requestedSet.has(type)) return true;
      }
      return false;
    });
  }

  if (requestedSkinConcerns.length) {
    const concernSet = new Set<string>(requestedSkinConcerns);
    products = products.filter((product) => {
      const productConcerns = Array.isArray(product.concerns)
        ? product.concerns.map((concern: string) =>
            normalizeText(String(concern)).replace(/\s+/g, "-")
          )
        : [];

      if (!productConcerns.length) return false;
      if (productConcerns.includes("all")) return true;

      return productConcerns.some((concern) => concernSet.has(concern));
    });
  }

  if (normalizedIngredientGroups.length) {
    const scoredProducts = products
      .map((product, index) => {
        const productIngredients = Array.isArray(product.ingredients)
          ? product.ingredients.map((ingredient: string) =>
              normalizeIngredient(ingredient)
            )
          : [];

        if (!productIngredients.length) {
          return { product, matchedGroups: 0, index };
        }

        let matchedGroups = 0;
        for (const group of normalizedIngredientGroups) {
          const matchesGroup = group.some((needle) =>
            productIngredients.some(
              (ingredient) =>
                ingredient === needle || ingredient.includes(needle)
            )
          );
          if (matchesGroup) {
            matchedGroups += 1;
          }
        }

        return { product, matchedGroups, index };
      })
      .filter(({ matchedGroups }) => matchedGroups > 0);

    products = scoredProducts
      .sort((a, b) => {
        if (b.matchedGroups !== a.matchedGroups) {
          return b.matchedGroups - a.matchedGroups;
        }
        return a.index - b.index;
      })
      .map(({ product }) => product);
  }

  if (typeof hasAlcohol === "boolean") {
    products = products.filter((product) => {
      const productHasAlcohol = Boolean(product.hasAlcohol);
      return productHasAlcohol === hasAlcohol;
    });
  }

  if (typeof hasFragrance === "boolean") {
    products = products.filter((product) => {
      const productHasFragrance = Boolean(product.hasFragrance);
      return productHasFragrance === hasFragrance;
    });
  }

  if (!products.length) {
    return {
      success: true,
      filters: {
        categorySlugs,
        brandSlugs,
        ...(requestedSkinTypes.length ? { skinTypes: requestedSkinTypes } : {}),
        ...(requestedSkinConcerns.length
          ? { skinConcerns: requestedSkinConcerns }
          : {}),
        ...(normalizedIngredientQueries.length
          ? { ingredientQueries: normalizedIngredientQueries }
          : {}),
      },
      products: [],
    };
  }

  const brandCache = new Map<Id<"brands">, Doc<"brands"> | null>();
  const categoryCache = new Map<Id<"categories">, Doc<"categories"> | null>();

  const enriched: ProductCardSummary[] = await Promise.all(
    products.map(async (item) => {
      let brandDoc: Doc<"brands"> | null = null;
      let categoryDocs: Doc<"categories">[] = [];
      const sizesSorted = Array.isArray(item.sizes)
        ? [...item.sizes]
            .filter((size) => typeof size?.id === "string")
            .sort((a, b) => (a.size ?? 0) - (b.size ?? 0))
        : [];

      try {
        if (item.brandId) {
          if (brandCache.has(item.brandId)) {
            brandDoc = brandCache.get(item.brandId) ?? null;
          } else {
            const fetched = await ctx.db.get(item.brandId);
            brandDoc = fetched ?? null;
            brandCache.set(item.brandId, brandDoc);
          }
        }

        categoryDocs = Array.isArray(item.categories)
          ? (
              await Promise.all(
                item.categories.map((catId: Id<"categories">) => {
                  if (categoryCache.has(catId)) {
                    return categoryCache.get(catId) ?? null;
                  }
                  return ctx.db.get(catId).then((doc) => {
                    categoryCache.set(catId, doc ?? null);
                    return doc ?? null;
                  });
                })
              )
            ).filter((doc): doc is Doc<"categories"> => Boolean(doc))
          : [];

        const productNameTokens =
          hasNameQuery && item.name
            ? toTokenSet(String(item.name))
            : new Set<string>();
        const categoryTokens =
          hasNameQuery && categoryDocs.length
            ? toTokenSet(
                categoryDocs.map((doc) => String(doc.name ?? "")).join(" ")
              )
            : new Set<string>();
        const brandNameTokens =
          hasNameQuery && brandDoc?.name
            ? toTokenSet(String(brandDoc.name))
            : new Set<string>();
        const brandSlugNormalized =
          hasNameQuery && typeof brandDoc?.slug === "string"
            ? normalizeText(String(brandDoc.slug))
            : "";
        const productIngredientsNormalized =
          normalizedIngredientQueries.length && Array.isArray(item.ingredients)
            ? item.ingredients.map((ingredient: string) =>
                normalizeIngredient(ingredient)
              )
            : [];

        let nameScore = 0;
        let nameMatchCount = hasNameQuery ? 0 : undefined;
        if (hasNameQuery && nameTokens && nameTokens.size) {
          const overlap = [...nameTokens].filter((token) =>
            productNameTokens.has(token)
          ).length;
          const recall = overlap / nameTokens.size;
          nameMatchCount = overlap;
          nameScore = Math.max(
            jaccardSimilarity(nameTokens, productNameTokens),
            recall
          );
        }
        const categoryScore =
          hasNameQuery && nameTokens
            ? jaccardSimilarity(nameTokens, categoryTokens)
            : 0;
        const brandScore =
          hasNameQuery && nameTokens
            ? brandSlugs.length && typeof brandDoc?.slug === "string"
              ? brandSlugs.some(
                  (slug) => normalizeText(slug) === brandSlugNormalized
                )
                ? 0.25
                : jaccardSimilarity(nameTokens, brandNameTokens) * 0.2
              : jaccardSimilarity(nameTokens, brandNameTokens) * 0.2
            : 0;
        const keywordBoost =
          hasNameQuery && nameTokens
            ? [...nameTokens].some((token) =>
                [
                  "moisturiser",
                  "moisturizer",
                  "cream",
                  "lotion",
                  "hydrating",
                ].includes(token)
              )
              ? 0.15
              : 0
            : 0;
        const ingredientScore =
          hasNameQuery && normalizedIngredientQueries.length
            ? normalizedIngredientQueries.some((needle) =>
                productIngredientsNormalized.some((ingredient) =>
                  ingredient.includes(needle)
                )
              )
              ? 0.1
              : 0
            : 0;

        const score = hasNameQuery
          ? nameScore * 0.6 +
            categoryScore * 0.25 +
            brandScore +
            keywordBoost +
            ingredientScore
          : 1;

        const sizes: ProductCardSize[] = Array.isArray(sizesSorted)
          ? sizesSorted
              .map((size) => {
                if (!size || typeof size !== "object") return null;
                const id = typeof size.id === "string" ? size.id : undefined;
                const sizeValue = Number(size.size ?? 0);
                const unit = typeof size.unit === "string" ? size.unit : "";
                const price = Number(size.price ?? 0);
                const discount =
                  typeof size.discount === "number" ? size.discount : undefined;
                const stock =
                  typeof size.stock === "number" ? size.stock : undefined;
                const currency =
                  typeof size.currency === "string" ? size.currency : undefined;
                if (!id) return null;
                return {
                  id,
                  size: Number.isFinite(sizeValue) ? sizeValue : 0,
                  unit,
                  price: Number.isFinite(price) ? price : 0,
                  discount,
                  stock,
                  currency,
                } as ProductCardSize;
              })
              .filter((size): size is ProductCardSize => Boolean(size))
          : [];

        const summary: ProductCardSummary = {
          id: item._id,
          slug: String(item.slug ?? ""),
          name: String(item.name ?? ""),
          description:
            typeof item.description === "string" ? item.description : undefined,
          images: Array.isArray(item.images)
            ? item.images.filter(
                (img): img is string => typeof img === "string"
              )
            : [],
          sizes,
          score,
          brand: brandDoc
            ? {
                name:
                  typeof brandDoc.name === "string" ? brandDoc.name : undefined,
                slug:
                  typeof brandDoc.slug === "string" ? brandDoc.slug : undefined,
              }
            : undefined,
          nameMatchCount,
          categories: categoryDocs.map((doc) => ({
            name: typeof doc.name === "string" ? doc.name : undefined,
            slug: typeof doc.slug === "string" ? doc.slug : undefined,
          })),
          ingredients: Array.isArray(item.ingredients)
            ? item.ingredients
                .filter(
                  (ingredient): ingredient is string =>
                    typeof ingredient === "string"
                )
                .slice(0, 2)
            : undefined,
        };
        return summary;
      } catch {
        const fallbackSizes: ProductCardSize[] = Array.isArray(item.sizes)
          ? item.sizes
              .map((size) => {
                if (!size || typeof size !== "object") return null;
                const id = typeof size.id === "string" ? size.id : undefined;
                if (!id) return null;
                const sizeValue = Number(size.size ?? 0);
                const unit = typeof size.unit === "string" ? size.unit : "";
                const price = Number(size.price ?? 0);
                const discount =
                  typeof size.discount === "number" ? size.discount : undefined;
                const stock =
                  typeof size.stock === "number" ? size.stock : undefined;
                const currency =
                  typeof size.currency === "string" ? size.currency : undefined;
                return {
                  id,
                  size: Number.isFinite(sizeValue) ? sizeValue : 0,
                  unit,
                  price: Number.isFinite(price) ? price : 0,
                  discount,
                  stock,
                  currency,
                } as ProductCardSize;
              })
              .filter((size): size is ProductCardSize => Boolean(size))
          : [];

        const fallbackCategories = Array.isArray(item.categories)
          ? item.categories
              .map((catId: Id<"categories">) => {
                const cached = categoryCache.get(catId);
                if (cached) return cached;
                return null;
              })
              .filter((doc): doc is Doc<"categories"> => Boolean(doc))
          : [];

        const fallback: ProductCardSummary = {
          id: item._id,
          slug: String(item.slug ?? ""),
          name: String(item.name ?? ""),
          description:
            typeof item.description === "string" ? item.description : undefined,
          images: Array.isArray(item.images)
            ? item.images.filter(
                (img): img is string => typeof img === "string"
              )
            : [],
          sizes: fallbackSizes,
          score: hasNameQuery ? 0 : 1,
          nameMatchCount: hasNameQuery ? 0 : undefined,
          categories: fallbackCategories.map((doc) => ({
            name: typeof doc.name === "string" ? doc.name : undefined,
            slug: typeof doc.slug === "string" ? doc.slug : undefined,
          })),
          ingredients: Array.isArray(item.ingredients)
            ? item.ingredients
                .filter(
                  (ingredient): ingredient is string =>
                    typeof ingredient === "string"
                )
                .slice(0, 2)
            : undefined,
        };
        return fallback;
      }
    })
  );

  // console.log(products, "beofre name search");
  let workingProducts = enriched;
  if (hasNameQuery) {
    const withTokenMatches = workingProducts.filter(
      (product) =>
        typeof (product as any).nameMatchCount === "number" &&
        ((product as any).nameMatchCount as number) > 0
    );
    if (withTokenMatches.length) {
      workingProducts = withTokenMatches;
    }

    const exactMatch = workingProducts.find(
      (product) =>
        normalizeText(String(product.name ?? "")) === normalizedNameQuery
    );
    if (exactMatch) {
      return {
        success: true,
        filters: {
          categorySlugs,
          brandSlugs,
          ...(requestedSkinTypes.length
            ? { skinTypes: requestedSkinTypes }
            : {}),
          ...(requestedSkinConcerns.length
            ? { skinConcerns: requestedSkinConcerns }
            : {}),
          ...(normalizedIngredientQueries.length
            ? { ingredientQueries: normalizedIngredientQueries }
            : {}),
        },
        products: [{ ...exactMatch }],
      };
    }

    const sortedByMatch = [...workingProducts].sort((a, b) => {
      const aCount =
        typeof (a as any).nameMatchCount === "number"
          ? ((a as any).nameMatchCount as number)
          : 0;
      const bCount =
        typeof (b as any).nameMatchCount === "number"
          ? ((b as any).nameMatchCount as number)
          : 0;
      if (bCount !== aCount) return bCount - aCount;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    const primary = sortedByMatch[0];
    if (primary) {
      const primaryCount =
        typeof (primary as any).nameMatchCount === "number"
          ? ((primary as any).nameMatchCount as number)
          : 0;
      const secondary = sortedByMatch[1];
      const secondaryCount =
        typeof (secondary as any)?.nameMatchCount === "number"
          ? ((secondary as any).nameMatchCount as number)
          : 0;
      const scoreGap = (primary.score ?? 0) - (secondary?.score ?? 0);
      if (
        primaryCount >= 2 &&
        primaryCount > secondaryCount &&
        scoreGap >= 0.2
      ) {
        return {
          success: true,
          filters: {
            categorySlugs,
            brandSlugs,
            ...(requestedSkinTypes.length
              ? { skinTypes: requestedSkinTypes }
              : {}),
            ...(requestedSkinConcerns.length
              ? { skinConcerns: requestedSkinConcerns }
              : {}),
            ...(normalizedIngredientQueries.length
              ? { ingredientQueries: normalizedIngredientQueries }
              : {}),
          },
          products: [{ ...primary }],
        };
      }
    }
  }

  let finalProducts: ProductCardSummary[];

  // if the name is completely identical lets return only it
  if (hasNameQuery) {
    const maxResults =
      typeof limit === "number" && limit > 0 ? Math.min(limit, 50) : 8;
    const minimumScore =
      categorySlugs.length || brandSlugs.length ? 0.05 : MINIMUM_FUZZY_SCORE;
    finalProducts = workingProducts
      .filter((product) => (product.score ?? 0) >= minimumScore)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, maxResults)
      .map(({ score, ...rest }) => ({ ...rest, score }));
  } else {
    const limitValue =
      typeof limit === "number" && limit > 0 ? Math.min(limit, 100) : undefined;
    const limited =
      typeof limitValue === "number"
        ? workingProducts.slice(0, limitValue)
        : workingProducts;
    finalProducts = limited.map(({ score, ...rest }) => ({
      ...rest,
      score: undefined,
    }));
  }

  // console.log(finalProducts, "This are the final products");

  return {
    success: true,
    filters: {
      categorySlugs,
      brandSlugs,
      ...(requestedSkinTypes.length ? { skinTypes: requestedSkinTypes } : {}),
      ...(requestedSkinConcerns.length
        ? { skinConcerns: requestedSkinConcerns }
        : {}),
      ...(normalizedIngredientQueries.length
        ? { ingredientQueries: normalizedIngredientQueries }
        : {}),
    },
    products: finalProducts,
  };
}

export const searchProducts = query({
  args: {
    query: v.string(),
    brandSlug: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { query, brandSlug, limit }) => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      return { success: true, results: [] };
    }

    const response = await searchProductsByQueryImpl(ctx, {
      nameQuery: query,
      brandQuery: brandSlug,
      limit,
    });

    if (!response.success) {
      if (response.reason === "brand_not_found") {
        return { success: true, results: [] };
      }
      return {
        success: false,
        results: [],
        message:
          response.reason === "category_not_found"
            ? "Category not found."
            : "No products matched the query.",
      };
    }

    return {
      success: true,
      results: response.products.map(({ score, ...rest }) => ({
        ...rest,
        score,
      })),
    };
  },
});

// Unified product search entry point for name, brand, and category filters
export const searchProductsByQuery = query({
  args: {
    nameQuery: v.optional(v.string()),
    categoryQuery: v.optional(v.string()),
    brandQuery: v.optional(v.string()),
    skinTypes: v.optional(v.array(SkinType)),
    skinTypeQueries: v.optional(v.array(v.string())),
    skinConcerns: v.optional(v.array(SkinConcern)),
    skinConcernQueries: v.optional(v.array(v.string())),
    ingredientQueries: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    hasAlcohol: v.optional(v.boolean()),
    hasFragrance: v.optional(v.boolean()),
  },
  handler: (ctx, args): Promise<SearchProductsByQueryResult> =>
    searchProductsByQueryImpl(ctx, args),
});

export const getProduct = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, { slug }) => {
    try {
      const product = await ctx.db
        .query("products")
        .filter((q) => q.eq(q.field("slug"), slug))
        .first();

      if (!product) return { success: false, message: "No product found" };

      const sizesSorted = Array.isArray(product.sizes)
        ? [...product.sizes].sort((a, b) => (a.size ?? 0) - (b.size ?? 0))
        : product.sizes;

      try {
        const brand = product.brandId
          ? await ctx.db.get(product.brandId)
          : null;
        const categories = Array.isArray(product.categories)
          ? (
              await Promise.all(
                product.categories.map((catId: Id<"categories">) =>
                  ctx.db.get(catId)
                )
              )
            ).filter(Boolean)
          : [];

        return {
          ...product,
          sizes: sizesSorted,
          categories,
          brand,
        };
      } catch {
        return {
          ...product,
          sizes: sizesSorted,
        };
      }
    } catch (err) {
      throw new Error("Error getting product");
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
        if (!p.canBeInRoutine) continue;
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
