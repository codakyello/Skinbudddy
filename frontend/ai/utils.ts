import z from "zod";
import {
  ProductCandidate,
  ProductHeadlineInput,
  ProductHeadlineResult,
  ProductSummaryContext,
  ReplySummary,
  SizeSummary,
  SummaryContext,
  ToolOutput,
  UnknownRecord,
  HeadlineSource,
} from "./types";
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const DEFAULT_SYSTEM_PROMPT = `You are **SkinBuddy**, a skincare expert and dermatologist. Refer to yourself only as SkinBuddy.

VIBE: Knowledgeable best-friend energy—warm, collaborative, direct but kind. Speak conversationally, skip stiff intros, and remember user context.

🎭 PERSONA & VOICE
- Use “we”/“let’s” to plan next steps together.
- Explain the “why” behind recommendations. Translate science into plain language (e.g., “cell turnover = your skin shedding old cells faster”).
- Validate frustrations, celebrate wins, keep expectations real (retinoids take 8–12 weeks, etc.).
- Emojis: max 2–3, only when they add meaning (🎉 wins, 💙 warmth, ⚠️ caution). Skip them if the user sounds upset or the topic is serious.
- Humor: gentle and relatable. Never joke about their skin struggles.
- Avoid “you must/should.” Offer options and encouragement instead.

📋 SCOPE
- Answer skincare/ingredient/routine questions without fluff.
- Discuss acne, eczema, rosacea, hyperpigmentation, etc., with medical context.
- Prescription talk (Accutane, tretinoin, antibiotics): give evidence-based info, then remind them to confirm with their doctor.
- Never diagnose or replace professional care. If it sounds clinical or severe → advise seeing a dermatologist.

🛍️ PRODUCT & BRAND INFO
- General brand context (history, ethos, notable lines): fair game from your knowledge.
- Never guess prices, stock, availability, IDs, discounts, or SKUs. If unsure, say so.
- For recommendations: always check the database first—don't pitch what's not in the store.
- **SKINCARE DEFINITION:** Skincare = topical products applied to face/body skin for aesthetic or therapeutic skin health (cleansers, moisturizers, serums, masks, treatments, sunscreen, acne fighters, exfoliants, toners, etc.).
- **Out-of-scope categories (makeup, haircare, toothpaste, oral care, deodorant, perfume, body odor fixes, supplements, body wash, etc.): DO NOT call any search or inventory tools. Politely decline, briefly explain we specialize in skincare only, and offer high-level general guidance if helpful without naming products.**
- **WHEN DISCUSSING PRODUCTS:** Always mention the brand name alongside the product name (e.g., "CeraVe Hydrating Cleanser" not just "Hydrating Cleanser").

🛠️ TOOL-FIRST PATTERN (Hard Rule)
On any action, recommendation, or product lookup request (add/remove/update/clear/get/list/show/check/buy/compare/recommend a specific product/suggest products/find/pick/show me options/"which should I buy"/"tell me about [product]"):

**STEP 0 — GATE CHECK: Is this a skincare product request?**
- If the category/intent is out-of-scope (see PRODUCT & BRAND INFO), **SKIP ALL TOOL CALLS**. Politely acknowledge the request, explain we focus on skincare only, and optionally provide general guidance. Example: "We specialize in skincare, so I can't pull toothpaste from our store. That said, look for fluoride toothpaste from a pharmacy—brands like Sensodyne or Crest are solid picks. 🪥"
- **Proceed only if skincare.** Then continue to Step 1.

**STEP 0.5 — PRODUCT EXISTENCE QUERIES (Hard Rule)**
If the user asks about a specific product by name/brand (e.g., "Do you have X?", "Show me Y", "Is Z in stock?"):
- **ALWAYS call searchProductsByQuery FIRST**, even if:
  - The product wasn't in previous search results
  - You just did a similar search
  - You "know" the brand/category well
- **NEVER answer "no" or "we don't carry that" based solely on:**
  - Absence from prior search results in conversation history
  - Your general knowledge of the brand
  - The fact that a similar search didn't return it
  
**Exception**: Only skip the search if the product was explicitly mentioned in the **current response turn** (i.e., you just searched for it 2 seconds ago in this same message).

After the search:
- Found → proceed to STEP 3
- Not found → then and only then say "We don't have that in stock"

**STEP 1 — EXTRACT**
Extract: brandQuery, categoryQuery, nameQuery (drop filler like "please").

**STEP 2 — PICK THE RIGHT TOOL**
- Use \`recommendRoutine\` when the user wants a multi-step routine or to swap out a step. Provide skinType + skinConcerns every time. The tool now returns a main pick plus alternates for each slot—offer those first, and only re-run with \`excludeProductIds\` if the user still wants something different.
- Use \`searchProductsByQuery\` for focused lookups ("show me sunscreens", "find a niacinamide serum") and for "show me more" pagination. Pass the usual filters plus \`excludeProductIds\` so you never repeat earlier results.

**STEP 3 — HANDLE RESULTS**
- **Routine tool:** Present the routine as ordered steps ("Step 1: Cleanser – <description>"). Surface the short description from each step, list the alternates (label them clearly), and recap \`notes\` in 1–2 sentences. If the user still wants something else, rerun \`recommendRoutine\` with that productId (or slug) added to \`excludeProductIds\`.
- **Search tool:**
  - ⚠️ Temporary change: add-to-cart actions are disabled. Even if you have a single product/size resolved, **do not call addToCart**. Instead, tell the user "I can’t add items to your cart directly right now" and offer to keep assisting with recommendations or comparisons.
  - Multiple products (2–5) → show numbered options with brief descriptions. Ask which by number.
  - Single product, size missing → list every available size/variant with its price (numbered) before asking which one they want. Never ask for a size choice without showing the sizes and prices.
  - Single product, size available but out of stock → inform user and offer next-in-stock size or similar alternatives.
  - Nothing found after initial search → ask for friendly clarification (brand/name/size preference), then retry **once more only**. If still nothing, say we don't stock it and optionally provide general guidance without naming competitors or suggesting cart actions.
  - Nothing found after initial search → ask for friendly clarification (brand/name/size preference), then retry **once more only**. If still nothing, say we don't stock it and optionally provide general guidance without naming competitors or suggesting cart actions.
  - ⚠️ **CRITICAL**: "Nothing found" means the searchProductsByQuery tool returned zero results THIS TURN—not that you don't remember seeing it earlier in the conversation.

**PROVIDING PRODUCT DETAILS**
When the user asks for detailed information about a specific product (e.g., "tell me about X", "give me details on X", "what is X", "more info on that product"):
- **Always call the tool first** if the product data isn't in the most recent tool result. Use searchProductsByQuery or getProduct to fetch fresh data.
- **Use the actual tool result data** to answer: include the brand name (e.g., "CeraVe Hydrating Cleanser" not just "cleanser"), use the product description exactly as provided, mention key ingredients from the ingredients list, explain benefits, and highlight what makes it unique.
- **Don't rely on general knowledge or invent details**—only use what's in the tool result (description, ingredients, benefits). Never fabricate texture, feel, or other sensory details not present in the data.
- For general product searches (e.g., "show me serums"), keep responses brief and focus on how the selection fits their needs.

**STEP 4 — ID INTEGRITY**
- Never invent, assume, or reuse IDs. Only use IDs returned by tools in the same turn.
- If search returns nothing, tell the user plainly: "We don't have that in stock right now."
- Never ask the user for any ID (user ID, product ID, size ID, etc.) in user-facing responses—always use human-readable labels (product names, size names, etc.).
- Never reference productIds, sizeIds, or userIds in user-facing responses—always use human-readable labels (product names, size names, etc.).

**STEP 5 — PRODUCT SELECTION (Multiple Options)**
If search returns multiple similar products from different brands:
- Show ≤5 numbered options with brief descriptors (e.g., "1. Neutrogena Hydro Boost (lightweight gel)" vs. "2. CeraVe Moisturizing Cream (rich formula)").
- Ask user to pick by number, not ID.
- Avoid overwhelming lists; summarize why these picks match the user's intent in 1–2 sentences.

CART OPERATIONS (Mandatory)
Before ANY cart mutation (updateCartQuantity, removeFromCart, clearCart):
1. Call getUserCart({userId}) → extract cartId
2. Use ONLY that cartId in the mutation
3. Never pass a cartId from a prior turn
  - addToCart is currently disabled—never attempt to call it until re-enabled.

MEDICAL GUIDANCE
Prescription treatments: provide dosing ranges, mechanisms, timelines, side effects, and context (e.g., weight-based for Accutane).
Always close with: "That said, your prescribing doctor will tailor this to your health profile, drug interactions, and goals—confirm specifics with them."
Non-prescription skincare: confident guidance.
Beyond standard derm (surgery, systemic conditions, supplements)? Acknowledge the limit and suggest a pro.

SAFETY & ACCURACY
- No hallucinations. For tool-dependent queries, only report what tools return. For general skincare knowledge, be confident but acknowledge uncertainty if present.
- Tool fails? Don't apologize—state the issue briefly and offer to retry.
- User safety first; when in doubt, push professional consult.

SIZE SELECTION
- Apparel: XXS → XS → S → M → L → XL → XXL → 3XL
- Numeric/volume/weight: default to lowest in stock (unless user specifies otherwise).
- Multiple similar options? Ask by label, not ID.

🎯 OUTPUT STYLE
- Have personality: light humor, sarcasm (when it clarifies), and warmth. Sound conversational, not robotic.
- Short, direct, no filler.
- Bullets when listing steps/options; compress wording everywhere.
- Only expand on request or for safety/clarity.
- **Emoji usage:** 1–2 per response strategically, or 1 per bullet if listing 3+ items. Don't overload; emojis should add personality, not clutter.
- Examples: 💧 ☀️ 🌙 💡 ✅ 😤 🚫 👍 💪 🎯 🔴 😳 🌑 👨‍⚕️ 🏥 💊 💯 ⚠️ 📏 📉 🏷️ ✂️ 💨 📖 🙂
- Headers and key replies should naturally include relevant emojis (e.g., "🌤️ Your personalized routine" or "🧪 Here's what I built for you").

FOLLOW-UP ACTIONS
When you offer specific follow-up suggestions (e.g., "I can help you find a moisturizer" or "Want to see more options?"), and the user responds with acceptance signals ("okay", "yes", "sure", "go ahead", "please", "sounds good", "let's do it", etc.), **execute the action where tools are available**:
- If you offered to find products → call searchProductsByQuery with appropriate filters
- If you offered to show more options → call searchProductsByQuery with excludeProductIds
- If you offered to add to cart → explain "I can’t add items to your cart directly right now" and continue helping with recommendations or comparisons
- If you offered to compare products → provide the comparison
Don't just acknowledge their acceptance—show that you’re following through (even if the answer is that a specific action is currently unavailable).

DATA CONFIDENCE
- For skincare knowledge (ingredients, routines, conditions): speak with confidence unless genuinely uncertain.
- For product data: always defer to **fresh tool results from the current turn**. Never claim a product exists or dosent or claim stock unless tools confirm it 
  - ❌ WRONG: "You asked about sunscreens earlier and Biore wasn't in those results, so we don't have it."
  - ✅ RIGHT: [calls searchProductsByQuery] "Found it! Here's Biore UV Aqua Rich..."
- Never recommend, describe, or even name a specific product unless it appeared in the **current turn's tool output**. If you don't have a tool result yet, explain that you need to run a lookup instead of guessing from training data.
- If a tool fails or data is unavailable, say so plainly without apologizing.
`;

export const coerceId = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    if (typeof record.id === "string") return record.id;
    if (typeof record._id === "string") return record._id;
  }
  return value != null ? String(value) : undefined;
};

export const toTitleCase = (input: string): string =>
  input
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

export const normalizeProductsFromOutputs = (
  outputs: ToolOutput[]
): unknown[] => {
  const candidateKeys = ["products", "results", "items"];
  const byId = new Map<string, unknown>();

  const addProductCandidate = (
    entry: unknown,
    key: string,
    index: number
  ): void => {
    if (!entry) return;
    const source =
      entry &&
      typeof entry === "object" &&
      "product" in (entry as UnknownRecord)
        ? ((entry as UnknownRecord).product as unknown)
        : entry;

    const id =
      coerceId(
        source && typeof source === "object"
          ? ((source as UnknownRecord).id ?? (source as UnknownRecord)._id)
          : source
      ) ?? `${key}-${index}-${JSON.stringify(source)}`;

    if (!byId.has(id)) {
      byId.set(id, source ?? entry);
    }
  };

  outputs.forEach((output) => {
    const result = output?.result;
    if (!result || typeof result !== "object") return;
    const record = result as UnknownRecord;

    candidateKeys.forEach((key) => {
      // recommendation array, product array etc
      const value = record[key];

      if (!Array.isArray(value)) return;

      value.forEach((entry, index) => addProductCandidate(entry, key, index));
    });

    const looksLikeSingleProduct =
      coerceId(record) ||
      typeof record.slug === "string" ||
      typeof record.productId === "string" ||
      typeof record.name === "string";

    if (looksLikeSingleProduct) {
      addProductCandidate(record, "product", 0);
    }
  });

  return Array.from(byId.values());
};

export const toUniqueStrings = (
  values: Array<string | undefined>
): string[] => {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim();
    if (!normalized.length || seen.has(normalized)) continue;
    seen.add(normalized);
    results.push(normalized);
  }
  return results;
};

export const collectStringArray = (input: unknown, limit = 6): string[] => {
  const source = Array.isArray(input)
    ? input
    : input === undefined || input === null
      ? []
      : [input];
  const results: string[] = [];
  for (const entry of source) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed.length) {
        results.push(trimmed);
        if (results.length >= limit) break;
      }
      continue;
    }
    if (entry && typeof entry === "object") {
      const record = entry as UnknownRecord;
      if (typeof record.name === "string") {
        const trimmed = record.name.trim();
        if (trimmed.length) {
          results.push(trimmed);
          if (results.length >= limit) break;
        }
      }
    }
  }
  return toUniqueStrings(results);
};

export const extractPricesFromSizes = (input: unknown): number[] => {
  if (!Array.isArray(input)) return [];
  const prices: number[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as UnknownRecord;
    const rawPrice = record.price ?? record.listPrice ?? record.salePrice;
    if (typeof rawPrice === "number" && Number.isFinite(rawPrice)) {
      prices.push(rawPrice);
      continue;
    }
    if (typeof rawPrice === "string") {
      const parsed = Number(rawPrice);
      if (Number.isFinite(parsed)) prices.push(parsed);
    }
  }
  return prices;
};

export const computePriceRange = (prices: number[]): string | undefined => {
  if (!prices.length) return undefined;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (!Number.isFinite(min) || min < 0) return undefined;
  if (!Number.isFinite(max) || max < 0) return undefined;
  if (min === max) return `$${min.toFixed(2)}`;
  return `$${min.toFixed(2)}–$${max.toFixed(2)}`;
};

export const sanitizeProductForModel = (
  product: unknown
): Record<string, unknown> | null => {
  if (!product || typeof product !== "object") return null;
  const record = product as UnknownRecord;
  const base =
    record.product && typeof record.product === "object"
      ? (record.product as UnknownRecord)
      : record;

  const productId =
    coerceId(record.productId) ??
    coerceId(record._id) ??
    coerceId(record.id) ??
    coerceId(base._id) ??
    coerceId(base.id);

  if (!productId) return null;

  const name =
    typeof base.name === "string"
      ? base.name
      : typeof record.name === "string"
        ? record.name
        : undefined;

  const brandRaw = base.brand ?? record.brand;
  let brand: string | undefined;
  if (typeof brandRaw === "string") {
    brand = brandRaw;
  } else if (brandRaw && typeof brandRaw === "object") {
    const brandRecord = brandRaw as UnknownRecord;
    if (typeof brandRecord.name === "string") {
      brand = brandRecord.name;
    }
  }

  const categories = toUniqueStrings([
    ...collectStringArray(base.categories ?? record.categories ?? [], 4),
    typeof base.category === "string" ? base.category : undefined,
    typeof record.category === "string" ? record.category : undefined,
  ]);

  const ingredients = collectStringArray(
    base.ingredients ??
      base.keyIngredients ??
      record.ingredients ??
      record.keyIngredients ??
      [],
    5
  );

  const priceRange =
    computePriceRange(extractPricesFromSizes(base.sizes)) ??
    computePriceRange(extractPricesFromSizes(record.sizes));

  const rawSizesSource =
    Array.isArray(base.sizes) && base.sizes.length
      ? base.sizes
      : Array.isArray(record.sizes)
        ? record.sizes
        : [];
  const normalizedSizes = rawSizesSource
    .map((sizeEntry) => {
      if (!sizeEntry || typeof sizeEntry !== "object") return null;
      const sizeRecord = sizeEntry as UnknownRecord;
      const sizeId =
        (typeof sizeRecord.sizeId === "string" && sizeRecord.sizeId) ||
        (typeof sizeRecord.id === "string" && sizeRecord.id) ||
        (typeof sizeRecord._id === "string" && sizeRecord._id) ||
        undefined;
      if (!sizeId) return null;

      const labelCandidate =
        typeof sizeRecord.name === "string" && sizeRecord.name.trim().length
          ? sizeRecord.name
          : undefined;
      const quantity =
        typeof sizeRecord.size === "number"
          ? `${sizeRecord.size}`
          : typeof sizeRecord.size === "string"
            ? sizeRecord.size
            : undefined;
      const unit =
        typeof sizeRecord.unit === "string" && sizeRecord.unit.trim().length
          ? sizeRecord.unit
          : undefined;
      const label =
        labelCandidate ??
        (quantity && unit
          ? `${quantity} ${unit}`.trim()
          : (quantity ?? undefined));

      const price =
        typeof sizeRecord.price === "number"
          ? sizeRecord.price
          : typeof sizeRecord.price === "string" &&
              sizeRecord.price.trim().length &&
              Number.isFinite(Number(sizeRecord.price))
            ? Number(sizeRecord.price)
            : undefined;
      const currency =
        typeof sizeRecord.currency === "string" &&
        sizeRecord.currency.trim().length
          ? sizeRecord.currency
          : undefined;

      const sanitizedSize: Record<string, unknown> = {
        sizeId,
      };
      if (label) sanitizedSize.label = label;
      if (price !== undefined) sanitizedSize.price = price;
      if (currency) sanitizedSize.currency = currency;

      return sanitizedSize;
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  const sanitized: Record<string, unknown> = { productId };
  if (name) sanitized.name = name;
  if (brand) sanitized.brand = brand;
  if (categories.length) sanitized.categories = categories;
  if (ingredients.length) sanitized.keyIngredients = ingredients;
  if (priceRange) sanitized.priceRange = priceRange;
  if (normalizedSizes.length) sanitized.sizes = normalizedSizes;

  return sanitized;
};

export const sanitizeProductListForModel = (
  products: unknown
): Array<Record<string, unknown>> => {
  if (!Array.isArray(products)) return [];
  const seen = new Set<string>();
  const sanitized: Array<Record<string, unknown>> = [];
  for (const entry of products) {
    const product = sanitizeProductForModel(entry);
    if (!product) continue;
    const productId = product.productId as string;
    if (productId && seen.has(productId)) continue;
    if (productId) seen.add(productId);
    sanitized.push(product);
  }
  return sanitized;
};

export const sanitizeProductsResultForModel = (rawResult: unknown): unknown => {
  if (!rawResult || typeof rawResult !== "object") {
    const single = sanitizeProductForModel(rawResult);
    return single ? { products: [single] } : {};
  }

  const record = rawResult as UnknownRecord;
  const aggregated: Array<Record<string, unknown>> = [];

  const addProducts = (value: unknown) => {
    const list = sanitizeProductListForModel(value);
    for (const item of list) {
      const id = item.productId as string | undefined;
      if (id && aggregated.some((existing) => existing.productId === id))
        continue;
      aggregated.push(item);
    }
  };

  if (Array.isArray(record.products)) addProducts(record.products);
  if (Array.isArray(record.results)) addProducts(record.results);
  if (Array.isArray(record.items)) addProducts(record.items);
  if (Array.isArray(record.recommendations))
    addProducts(record.recommendations);

  if (!aggregated.length) {
    const single =
      sanitizeProductForModel(record.product) ??
      sanitizeProductForModel(record);
    if (single) aggregated.push(single);
  }

  const payload: Record<string, unknown> = {};
  if (aggregated.length) payload.products = aggregated;

  const filters =
    record.filters && typeof record.filters === "object"
      ? record.filters
      : undefined;
  if (filters) payload.filters = filters;

  return Object.keys(payload).length ? payload : {};
};

export const sanitizeRoutineStepForModel = (
  step: unknown
): {
  step?: number;
  category?: string;
  productName?: string;
  keyIngredients?: string[];
} | null => {
  if (!step || typeof step !== "object") return null;
  const record = step as UnknownRecord;
  const product =
    record.product && typeof record.product === "object"
      ? (record.product as UnknownRecord)
      : undefined;

  const stepNumber = typeof record.step === "number" ? record.step : undefined;
  const categoryCandidates = [
    typeof record.category === "string" ? record.category : undefined,
    typeof record.categoryName === "string" ? record.categoryName : undefined,
    typeof record.categoryLabel === "string" ? record.categoryLabel : undefined,
    typeof record.title === "string" ? record.title : undefined,
  ];
  const category = toUniqueStrings(categoryCandidates)[0];

  const productNameCandidates = [
    typeof record.productName === "string" ? record.productName : undefined,
    typeof record.title === "string" ? record.title : undefined,
    product && typeof product.name === "string"
      ? (product.name as string)
      : undefined,
  ];
  const productName = toUniqueStrings(productNameCandidates)[0];

  const keyIngredients = collectStringArray(
    product?.ingredients ?? product?.keyIngredients ?? record.ingredients ?? [],
    4
  );

  const sanitized: Record<string, unknown> = {};
  if (stepNumber !== undefined) sanitized.step = stepNumber;
  if (category) sanitized.category = category;
  if (productName) sanitized.productName = productName;
  if (keyIngredients.length) sanitized.keyIngredients = keyIngredients;

  return Object.keys(sanitized).length ? (sanitized as any) : null;
};

export const sanitizeRoutineResultForModel = (rawResult: unknown): unknown => {
  if (!rawResult || typeof rawResult !== "object") return {};
  const record = rawResult as UnknownRecord;

  const routineId =
    coerceId(record.routineId) ??
    coerceId(record._id) ??
    coerceId(record.id) ??
    undefined;
  const title = typeof record.title === "string" ? record.title : undefined;
  const skinType =
    typeof record.skinType === "string" ? record.skinType : undefined;

  const rawConcerns = record.skinConcern ?? record.concerns;
  const concerns = Array.isArray(rawConcerns)
    ? collectStringArray(rawConcerns, 5)
    : typeof rawConcerns === "string"
      ? [rawConcerns]
      : [];

  const notes =
    typeof record.notes === "string"
      ? truncateString(record.notes, 320)
      : undefined;

  const stepsRaw = Array.isArray(record.steps) ? record.steps : [];
  const stepHighlights = stepsRaw
    .map((step) => sanitizeRoutineStepForModel(step))
    .filter(
      (
        step
      ): step is {
        step?: number;
        category?: string;
        productName?: string;
        keyIngredients?: string[];
      } => step !== null
    );

  const stepCategories = toUniqueStrings(
    stepHighlights.map((entry) => entry.category)
  ).slice(0, 6);

  const productHighlights = stepHighlights
    .map((entry) => {
      const highlight: Record<string, unknown> = {};
      if (entry.category) highlight.category = entry.category;
      if (entry.productName) highlight.productName = entry.productName;
      if (entry.keyIngredients && entry.keyIngredients.length) {
        highlight.keyIngredients = entry.keyIngredients;
      }
      return Object.keys(highlight).length ? highlight : null;
    })
    .filter(
      (
        entry
      ): entry is {
        category?: string;
        productName?: string;
        keyIngredients?: string[];
      } => entry !== null
    )
    .slice(0, 6);

  const recommendations = Array.isArray(record.recommendations)
    ? sanitizeProductListForModel(record.recommendations)
    : undefined;

  const sanitized: Record<string, unknown> = {};
  if (routineId) sanitized.routineId = routineId;
  if (title) sanitized.title = title;
  if (skinType) sanitized.skinType = skinType;
  if (concerns.length) sanitized.concerns = concerns;
  if (stepCategories.length) sanitized.stepCategories = stepCategories;
  if (productHighlights.length) sanitized.productHighlights = productHighlights;
  if (notes) sanitized.notes = notes;
  if (recommendations && recommendations.length) {
    sanitized.recommendations = recommendations;
  }

  return sanitized;
};

export const sanitizeToolResultForModel = (
  toolName: string,
  rawResult: unknown
): unknown => {
  switch (toolName) {
    case "searchProductsByQuery":
    case "getAllProducts":
    case "getProduct":
      return sanitizeProductsResultForModel(rawResult);
    case "recommendRoutine":
      return sanitizeRoutineResultForModel(rawResult);
    default:
      return rawResult ?? {};
  }
};

export const replySummarySchema = z
  .object({
    headline: z.string().min(1).max(120),
    icon: z.string().min(1).max(4).optional(),
  })
  .strict();

export const truncateString = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
};

export const coerceString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export const formatList = (
  items: string[],
  conjunction: "and" | "or" = "and"
): string => {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`;
};

export const sentenceCase = (value: string): string => {
  if (!value) return value;
  const trimmed = value.trim();
  if (!trimmed.length) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

export const describeSkinTypes = (skinTypes: string[]): string | undefined => {
  if (!skinTypes.length) return undefined;
  const items = skinTypes.map((type) => `${type.toLowerCase()} skin`);
  return formatList(items);
};

export const describeConcerns = (concerns: string[]): string | undefined => {
  if (!concerns.length) return undefined;
  const items = concerns.map((concern) => {
    const lower = concern.toLowerCase();
    if (lower.includes("concern")) return lower;
    if (lower.endsWith("s")) return lower;
    return `${lower} concerns`;
  });
  return formatList(items);
};

export const describeIngredients = (
  ingredients: string[]
): string | undefined => {
  if (!ingredients.length) return undefined;
  const normalized = ingredients.map((item) => item.toLowerCase());
  return formatList(normalized);
};

export const describeBenefits = (benefits: string[]): string | undefined => {
  if (!benefits.length) return undefined;
  const normalized = benefits.map((benefit) =>
    benefit.toLowerCase().replace(/-/g, " ")
  );
  return formatList(normalized);
};

export const composeAudiencePhrase = (
  skinTypes: string[],
  concerns: string[]
): string | undefined => {
  const skin = describeSkinTypes(skinTypes);
  const concernPhrase = describeConcerns(concerns);
  if (skin && concernPhrase) return `${skin} with ${concernPhrase}`;
  if (skin) return skin;
  if (concernPhrase) return concernPhrase;
  return undefined;
};

const NAIRA_CURRENCY_FORMATTER = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export const formatPriceRangeLabel = (
  minPrice?: number,
  maxPrice?: number
): string | undefined => {
  const normalizeValue = (value?: number): number | undefined => {
    if (typeof value !== "number") return undefined;
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };

  const min = normalizeValue(minPrice);
  const max = normalizeValue(maxPrice);

  const format = (value: number): string =>
    NAIRA_CURRENCY_FORMATTER.format(Math.round(value));

  if (min != null && max != null) {
    if (min === max) {
      return format(min);
    }
    return `${format(min)} – ${format(max)}`;
  }
  if (min != null) {
    return `≥ ${format(min)}`;
  }
  if (max != null) {
    return `≤ ${format(max)}`;
  }
  return undefined;
};
type IconDerivationInput = {
  categoryHint?: string | null;
  benefits?: string[];
  intentHeadline?: string;
};

const CATEGORY_ICON_MATCHERS: Array<{ pattern: RegExp; icon: string }> = [
  { pattern: /sun(screen| block)|\bspf\b|uv/i, icon: "🌞" },
  { pattern: /cleanser|face wash|wash|gel cleanser/i, icon: "🫧" },
  { pattern: /serum|ampoule|treatment|essence/i, icon: "🧪" },
  { pattern: /moisturizer|moisturiser|cream|lotion|butter|balm/i, icon: "🧴" },
  { pattern: /toner|mist/i, icon: "💦" },
  { pattern: /mask|peel|exfoliat/i, icon: "🎭" },
  { pattern: /oil control|mattif/i, icon: "🧼" },
];

const BENEFIT_ICON_LOOKUP: Record<string, string> = {
  hydrating: "💧",
  "oil-control": "🧼",
  "acne-fighting": "🎯",
  "sun-protection": "🌞",
  brightening: "✨",
  soothing: "🌿",
  repairing: "🛠️",
  "anti-aging": "⌛",
  firming: "💪",
  "tone-evening": "🎨",
  nourishing: "🥛",
};

export const pickProductIcon = ({
  categoryHint,
  benefits,
  intentHeadline,
}: IconDerivationInput): string => {
  const haystack = [categoryHint, intentHeadline, ...(benefits ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const matcher of CATEGORY_ICON_MATCHERS) {
    if (matcher.pattern.test(haystack)) {
      return matcher.icon;
    }
  }

  if (benefits && benefits.length) {
    for (const benefit of benefits) {
      const normalized = benefit.toLowerCase();
      if (BENEFIT_ICON_LOOKUP[normalized]) {
        return BENEFIT_ICON_LOOKUP[normalized];
      }
    }
  }

  return "🛍️";
};

export const buildProductHeadline = ({
  productCount,
  category,
  audience,
  brand,
  nameQuery,
  ingredients,
  benefits,
  benefitQualifier,
  skinTypes,
  skinConcerns,
  benefitsList,
  priceLabel,
}: ProductHeadlineInput): ProductHeadlineResult => {
  const descriptor =
    productCount >= 5 ? "Top" : productCount >= 3 ? "Curated" : "Featured";

  const normalizeString = (value?: string | null): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  };

  const normalizedCategory = normalizeString(category);
  const normalizedAudience = normalizeString(audience);
  const normalizedBrand = normalizeString(brand);
  const normalizedNameQuery = normalizeString(nameQuery);
  const normalizedIngredients = normalizeString(ingredients);
  const normalizedBenefitFocus =
    normalizeString(benefitQualifier) ?? normalizeString(benefits);
  const normalizedPriceLabel = normalizeString(priceLabel);

  const resolvedSkinTypes = Array.isArray(skinTypes)
    ? skinTypes
        .map((value) =>
          typeof value === "string" ? value.trim() : ""
        )
        .filter((value) => value.length)
    : [];
  const resolvedSkinConcerns = Array.isArray(skinConcerns)
    ? skinConcerns
        .map((value) =>
          typeof value === "string" ? value.trim() : ""
        )
        .filter((value) => value.length)
    : [];
  const resolvedBenefitsList = Array.isArray(benefitsList)
    ? Array.from(
        new Set(
          benefitsList
            .map((value) =>
              typeof value === "string" ? value.trim().toLowerCase() : ""
            )
            .filter((value) => value.length)
        )
      ).slice(0, 3)
    : [];

  let headline = "";
  let usedAudience = false;
  let usedBrand = false;
  let usedIngredients = false;
  let usedBenefits = false;

  if (normalizedCategory) {
    const looksLikeMoreCatchall = /\bmore\b/i.test(normalizedCategory);
    const categoryLabel =
      normalizedCategory.endsWith("s") ||
      normalizedCategory.endsWith("S") ||
      looksLikeMoreCatchall
        ? normalizedCategory
        : `${normalizedCategory}s`;
    headline = `${descriptor} ${categoryLabel}`;
  }

  if (!headline && normalizedBrand) {
    headline =
      productCount > 1
        ? `${normalizedBrand} Favorites`
        : `Featured ${normalizedBrand} Pick`;
    usedBrand = true;
  }

  if (!headline && normalizedNameQuery) {
    headline = `Results for "${normalizedNameQuery}"`;
  }

  if (!headline && normalizedIngredients) {
    headline = `Products with ${normalizedIngredients}`;
    usedIngredients = true;
  }

  if (!headline && normalizedBenefitFocus) {
    headline =
      productCount > 1
        ? `${descriptor} Picks for ${normalizedBenefitFocus}`
        : `Featured Pick for ${normalizedBenefitFocus}`;
    usedBenefits = true;
  }

  if (!headline && normalizedAudience) {
    headline =
      productCount > 1
        ? `Product Picks for ${normalizedAudience}`
        : `Featured Pick for ${normalizedAudience}`;
    usedAudience = true;
  }

  if (!headline) {
    headline =
      productCount > 1
        ? "Product Recommendations for You"
        : "Featured Product Pick";
  }

  const qualifier =
    normalizedIngredients && !usedIngredients
      ? { text: `with ${normalizedIngredients}`, type: "ingredients" as const }
      : normalizedAudience && !usedAudience
        ? { text: `for ${normalizedAudience}`, type: "audience" as const }
        : normalizedBenefitFocus && !usedBenefits
          ? { text: `for ${normalizedBenefitFocus}`, type: "benefits" as const }
          : null;

  if (qualifier) {
    headline = `${headline} ${qualifier.text}`.trim();
    if (qualifier.type === "ingredients") usedIngredients = true;
    if (qualifier.type === "audience") usedAudience = true;
    if (qualifier.type === "benefits") usedBenefits = true;
  }

  const tags: string[] = [];
  const seenTags = new Set<string>();

  const pushTag = (
    rawLabel?: string,
    marks?: {
      audience?: boolean;
      brand?: boolean;
      ingredients?: boolean;
      benefits?: boolean;
    }
  ) => {
    if (!rawLabel) return;
    const trimmed = rawLabel.replace(/\s+/g, " ").trim();
    if (!trimmed.length) return;
    const formatted = sentenceCase(trimmed);
    const key = formatted.toLowerCase();
    if (seenTags.has(key)) return;
    seenTags.add(key);
    tags.push(formatted);
    if (marks?.audience) usedAudience = true;
    if (marks?.brand) usedBrand = true;
    if (marks?.ingredients) usedIngredients = true;
    if (marks?.benefits) usedBenefits = true;
  };

  const appendFocus = (label: string): string => {
    const trimmed = label.trim();
    if (!trimmed.length) return trimmed;
    const lower = trimmed.toLowerCase();
    if (lower.endsWith("focus") || lower.includes("concern")) {
      return trimmed;
    }
    return `${trimmed} focus`;
  };

  if (!usedAudience) {
    if (normalizedAudience) {
      pushTag(normalizedAudience, { audience: true });
    } else {
      const skinTag = describeSkinTypes(resolvedSkinTypes);
      if (skinTag) {
        pushTag(skinTag, { audience: true });
      }
      const concernTag = describeConcerns(resolvedSkinConcerns);
      if (concernTag) {
        pushTag(concernTag, { audience: true });
      }
    }
  }

  if (!usedIngredients && normalizedIngredients) {
    pushTag(appendFocus(normalizedIngredients), { ingredients: true });
  }

  if (!usedBenefits) {
    const benefitsTagSource = resolvedBenefitsList.length
      ? describeBenefits(resolvedBenefitsList)
      : normalizedBenefitFocus;
    if (benefitsTagSource) {
      pushTag(appendFocus(benefitsTagSource), { benefits: true });
    }
  }

  if (!usedBrand && normalizedBrand && normalizedCategory) {
    pushTag(`${normalizedBrand} picks`, { brand: true });
  }

  if (normalizedPriceLabel) {
    pushTag(normalizedPriceLabel);
  }

  if (tags.length) {
    headline = `${headline} · ${tags.join(" · ")}`;
  }

  return {
    headline: headline.trim(),
    usedAudience,
    usedBrand,
    usedIngredients,
    usedBenefits,
  };
};

export const buildProductSubheading = ({
  audiencePhrase,
  brand,
  ingredients,
  benefits,
  nameQuery,
  note,
  usedAudience,
  usedBrand,
  usedIngredients,
  usedBenefits,
}: {
  audiencePhrase?: string;
  brand?: string;
  ingredients?: string;
  benefits?: string;
  nameQuery?: string;
  note?: string;
  usedAudience: boolean;
  usedBrand: boolean;
  usedIngredients: boolean;
  usedBenefits: boolean;
}): string | undefined => {
  const descriptorParts: string[] = [];
  if (audiencePhrase && !usedAudience) {
    descriptorParts.push(`tailored for ${audiencePhrase}`);
  }
  if (ingredients && !usedIngredients) {
    descriptorParts.push(`features ${ingredients}`);
  }
  if (benefits && !usedBenefits) {
    descriptorParts.push(`focused on ${benefits}`);
  }
  if (brand && !usedBrand) {
    descriptorParts.push(`from ${brand}`);
  }
  if (nameQuery) {
    descriptorParts.push(`matches "${nameQuery}"`);
  }

  const descriptor =
    descriptorParts.length > 0
      ? sentenceCase(descriptorParts.join(" · "))
      : undefined;

  if (note) {
    return descriptor ? `${descriptor} · ${note}` : note;
  }

  return descriptor;
};

export const extractProductMetadataForSummary = (
  products: ProductCandidate[]
): ProductSummaryContext["topProducts"] => {
  return products.slice(0, 4).map((product) => {
    const record = product as UnknownRecord;
    const nestedProduct =
      record.product && typeof record.product === "object"
        ? (record.product as UnknownRecord)
        : null;
    const brandRecord =
      (record.brand && typeof record.brand === "object"
        ? (record.brand as UnknownRecord)
        : null) ??
      (nestedProduct?.brand && typeof nestedProduct.brand === "object"
        ? (nestedProduct.brand as UnknownRecord)
        : null);

    const categoriesArray =
      Array.isArray(record.categories) && record.categories.length
        ? record.categories
        : Array.isArray(nestedProduct?.categories)
          ? nestedProduct?.categories
          : [];

    const firstCategory = categoriesArray
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const catRecord = entry as UnknownRecord;
        return coerceString(catRecord.name);
      })
      .find((value): value is string => Boolean(value));

    const slugString = coerceString(record.slug);
    const name =
      coerceString(record.name) ??
      coerceString(nestedProduct?.name) ??
      (slugString ? toTitleCase(slugString) : undefined);

    const brand =
      coerceString(brandRecord?.name) ?? coerceString(brandRecord?._id);

    return {
      name,
      brand,
      category: firstCategory ?? coerceString(record.category),
    };
  });
};

export async function generateReplySummaryWithLLM({
  reply,
  userMessage,
  context,
  model,
}: {
  reply: string;
  userMessage?: string;
  context?: SummaryContext | null;
  model: string;
}): Promise<ReplySummary | null> {
  const trimmedReply = reply.trim();
  if (!trimmedReply.length) return null;

  const payload = {
    userMessage: userMessage ? truncateString(userMessage, 600) : undefined,
    assistantReply: truncateString(trimmedReply, 1200),
    context,
  };

  const icon = context?.iconSuggestion ?? "🧪";
  const stepCountText =
    context?.type === "routine"
      ? context.stepCount === 1
        ? "1 step"
        : `${context.stepCount} steps`
      : undefined;
  const filterDescription =
    context?.type === "products" ? context.filterDescription : undefined;
  const intentHeadlineHint =
    context?.type === "products" &&
    typeof context.intentHeadlineHint === "string"
      ? context.intentHeadlineHint
      : null;
  const preferIntentHeadline =
    context?.type === "products" &&
    context.headlineSourceRecommendation === "intent" &&
    intentHeadlineHint;

  const routineGuidance =
    context?.type === "routine"
      ? [
          'Begin the headline with the exact phrase "Here is the routine I built for" followed immediately by the routineDescription (or "your skin" if routineDescription is missing).',
          'The routineDescription field already captures the skin type and focus (e.g., "oily skin and focused on acne concerns"); reuse that wording verbatim without reordering its meaning.',
          "Keep the remainder of the headline concise—if you need to add a short clause about the routine's focus, do so naturally.",
          stepCountText
            ? `Weave into the headline that the routine covers ${stepCountText} and, if possible, nod to one of the stepHighlights or invite the user to tweak steps.`
            : "Use the headline to highlight what the routine focuses on and invite the user to tweak steps.",
        ].join(" ")
      : "";

  const productGuidance =
    context?.type === "products"
      ? [
          preferIntentHeadline
            ? `Use the user's prompt "${intentHeadlineHint}" to anchor the headline. Rewrite it into a polished, declarative title (no quotes, no commands) so it feels like a curated collection name.`
            : filterDescription
              ? `Let the headline spotlight the key filters (${filterDescription}), mentioning the category or benefit mix so the user instantly understands what these products address.`
              : "If no filters are supplied, reference the dominant category or benefit from the context to craft a clear, inviting headline.",
          filterDescription && preferIntentHeadline
            ? "You can weave in the filter details if they clarify the intent, but keep the user's ask as the focal point."
            : "",
          "Headlines must stay between 3–10 words, action-oriented, and free of emojis.",
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  const contextualInstructions = [routineGuidance, productGuidance]
    .filter(Boolean)
    .join(" ");

  const iconInstruction = `Set the "icon" field in your JSON to "${icon}". Do not place any emoji inside the headline. Provide exactly one headline—no additional fields or sentences.`;

  try {
    const isGPT5 = /(^|\b)gpt-5(\b|\-)/i.test(model);
    const resp = await openai.responses.create({
      model,
      store: false,
      ...(isGPT5 ? { reasoning: { effort: "medium" as const } } : {}),
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content: `You are a succinct copywriter for SkinBuddy, a skincare assistant. Given the assistant's reply and the structured context, craft a heading that matches the requested format. Keep the headline between 3–10 words (≤60 characters) and ensure it stays conversational and skincare-focused. ${iconInstruction} ${contextualInstructions} Output ONLY a JSON object with keys headline and optional icon—no prose, no markdown, no code fences.`,
          type: "message",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
          type: "message",
        },
      ],
      ...(isGPT5 ? { temperature: 1 as const } : { temperature: 0.4 }),
    });

    const content = (resp as any).output_text?.trim?.() ?? "";
    if (!content.length) return null;

    const sanitized = content.replace(/```(?:json)?|```/gi, "").trim();
    const parsed = JSON.parse(sanitized);
    const result = replySummarySchema.safeParse(parsed);
    if (!result.success) {
      console.warn("Failed to parse summary JSON:", result.error);
      return null;
    }

    return {
      headline: result.data.headline.trim(),
      icon: result.data.icon?.trim() || undefined,
    };
  } catch (error) {
    console.error("Failed to generate reply summary:", error);
    return null;
  }
}

export const selectProductsParameters = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      description:
        "Ranked list of products to display, highest priority first.",
      items: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description:
              "ID or slug from the candidate list (exactly as provided).",
          },
          reason: {
            type: "string",
            description: "1–2 sentence rationale tailored to the user request.",
          },
          rank: {
            type: "integer",
            description: "1-based position; lowest number = highest priority.",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "How confident the model is in this pick (optional).",
          },
        },
        required: ["productId", "reason"],
        additionalProperties: false,
      },
    },
    notes: {
      type: "string",
      description:
        "Optional summary about the set as a whole (e.g., 'All options are fragrance-free.').",
    },
  },
  required: ["picks"],
  additionalProperties: false,
} as const;

export const selectProductsResponseSchema = z.object({
  picks: z
    .array(
      z.object({
        productId: z.string(),
        reason: z.string().min(1),
        rank: z.number().int().positive().optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .min(1, "At least one product pick is required"),
  notes: z.string().optional(),
});

export const deriveCandidateKey = (
  product: ProductCandidate,
  index: number
): string => {
  const rawId =
    typeof product._id === "string"
      ? product._id
      : typeof product.slug === "string"
        ? product.slug
        : undefined;
  return rawId ? String(rawId) : `candidate-${index}`;
};

export const summarizeCandidates = (
  candidates: ProductCandidate[]
): {
  summaries: Array<Record<string, unknown>>;
  keyMap: Map<string, ProductCandidate>;
} => {
  const keyMap = new Map<string, ProductCandidate>();
  const summaries = candidates.map((product, index) => {
    const key = deriveCandidateKey(product, index);
    keyMap.set(key, product);

    const sizes: SizeSummary[] = Array.isArray(product.sizes)
      ? product.sizes
          .slice(0, 5)
          .map((sizeValue) => {
            if (!sizeValue || typeof sizeValue !== "object") return null;
            const sizeRecord = sizeValue as Record<string, unknown>;
            const label =
              typeof sizeRecord.name === "string"
                ? sizeRecord.name
                : [sizeRecord.size, sizeRecord.unit]
                    .map((value) =>
                      typeof value === "number"
                        ? String(value)
                        : typeof value === "string"
                          ? value
                          : ""
                    )
                    .filter((part) => part.length > 0)
                    .join(" ");

            const priceValue =
              typeof sizeRecord.price === "number"
                ? sizeRecord.price
                : undefined;
            const currencyValue =
              typeof sizeRecord.currency === "string"
                ? sizeRecord.currency
                : undefined;

            return {
              label: label || undefined,
              price: priceValue,
              currency: currencyValue,
            } as SizeSummary;
          })
          .filter((size): size is SizeSummary => size !== null)
      : [];

    const prices = sizes
      .map((size) => size.price)
      .filter((price: unknown): price is number => typeof price === "number");
    const minPrice = prices.length ? Math.min(...prices) : undefined;
    const maxPrice = prices.length ? Math.max(...prices) : undefined;
    const priceRange =
      typeof minPrice === "number"
        ? typeof maxPrice === "number" && maxPrice !== minPrice
          ? `${minPrice}–${maxPrice}`
          : String(minPrice)
        : undefined;

    const summary: Record<string, unknown> = {
      productId: key,
      name: typeof product.name === "string" ? product.name : undefined,
      slug: typeof product.slug === "string" ? product.slug : undefined,
      description:
        typeof product.description === "string"
          ? product.description.slice(0, 220)
          : undefined,
      concerns: Array.isArray(product.concerns)
        ? product.concerns.slice(0, 6)
        : undefined,
      skinTypes: Array.isArray(product.skinType)
        ? product.skinType.slice(0, 6)
        : undefined,
      ingredients: Array.isArray(product.ingredients)
        ? product.ingredients.slice(0, 8)
        : undefined,
      priceRange,
      sizes,
      score:
        typeof product.score === "number" ? Number(product.score) : undefined,
    };

    Object.keys(summary).forEach((key) => {
      const value = summary[key];
      if (
        value === undefined ||
        value === null ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete summary[key];
      }
    });

    return summary;
  });

  return { summaries, keyMap };
};

export async function refineProductSelection({
  candidates,
  model,
  userRequest,
}: {
  candidates: ProductCandidate[];
  model: string;
  userRequest: string;
}): Promise<{
  products: ProductCandidate[];
  notes?: string;
}> {
  if (!candidates.length) {
    return { products: [] };
  }

  const limitedCandidates = candidates.slice(0, 12);
  const { summaries, keyMap } = summarizeCandidates(limitedCandidates);

  const selectionMessages = [
    {
      role: "system" as const,
      type: "message" as const,
      content:
        "You are a meticulous skincare merchandiser. You will select the best matches from the provided candidate list. Only choose from the candidates and never invent new products. Your response must call the selectProducts function.",
    },
    {
      role: "user" as const,
      type: "message" as const,
      content: `User request:\n${userRequest || "(not provided)"}\n\nCandidates (JSON):\n${JSON.stringify(
        summaries,
        null,
        2
      )}\n\nCall the selectProducts function with your ranked picks and reasons.`,
    },
  ];

  try {
    const isGPT5 = /(^|\b)gpt-5(\b|\-)/i.test(model);
    const selection = await openai.responses.create({
      model,
      store: false,
      ...(isGPT5 ? { reasoning: { effort: "medium" as const } } : {}),
      input: selectionMessages,
      text: {
        format: {
          type: "json_schema",
          name: "product_selection",
          schema: selectProductsParameters as Record<string, unknown>,
          strict: false,
        },
      },
      ...(isGPT5 ? { temperature: 1 as const } : { temperature: 0 }),
    });

    const rawContent = (() => {
      const outputText = (selection as any)?.output_text;
      if (typeof outputText === "string" && outputText.trim().length) {
        return outputText;
      }
      if (Array.isArray(outputText) && outputText.length) {
        return outputText.join("");
      }
      const messageItem = (selection.output || []).find(
        (item: any) =>
          item?.type === "message" &&
          Array.isArray(item.content) &&
          item.content.some(
            (part: any) =>
              part?.type === "output_text" && typeof part.text === "string"
          )
      ) as any;
      if (messageItem && Array.isArray(messageItem.content)) {
        const textPart = messageItem.content.find(
          (part: any) =>
            part?.type === "output_text" && typeof part.text === "string"
        );
        if (textPart) return textPart.text as string;
      }
      return "";
    })();

    const sanitizedContent = rawContent
      ? rawContent.replace(/```(?:json)?|```/gi, "").trim()
      : "";

    if (!sanitizedContent.length) {
      return { products: limitedCandidates };
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(sanitizedContent);
    } catch (error) {
      console.error("Failed to parse product refinement JSON:", error);
      return { products: limitedCandidates };
    }

    const parsed = selectProductsResponseSchema.safeParse(parsedPayload);

    if (!parsed.success || !parsed.data.picks.length) {
      return { products: limitedCandidates };
    }

    const rankedPicks = parsed.data.picks
      .map((pick, index) => ({
        ...pick,
        rank: pick.rank ?? index + 1,
        originalIndex: index,
      }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.originalIndex - b.originalIndex;
      });

    const seen = new Set<string>();
    const selectedProducts: ProductCandidate[] = [];

    for (const pick of rankedPicks) {
      const product = keyMap.get(pick.productId);
      if (!product || seen.has(pick.productId)) continue;
      seen.add(pick.productId);
      selectedProducts.push({
        ...product,
        selectionReason: pick.reason,
        selectionConfidence: pick.confidence,
      });
    }

    if (!selectedProducts.length) {
      return { products: limitedCandidates };
    }

    return {
      products: selectedProducts,
      notes: parsed.data.notes,
    };
  } catch (error) {
    console.error("Product selection refinement failed:", error);
    return { products: candidates.slice(0, 12) };
  }
}
