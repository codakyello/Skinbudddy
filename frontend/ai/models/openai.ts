import OpenAI from "openai";
import { DEFAULT_SYSTEM_PROMPT } from "../utils";
import { toolSpecs, getToolByName } from "../tools/localTools";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// gpt-4o-mini
// gpt-4.1-nano
// gpt-5-nano
type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool" | "developer";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

type ToolOutput = {
  name: string;
  arguments: unknown;
  result: unknown;
};

type UnknownRecord = Record<string, unknown>;

const coerceId = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    if (typeof record.id === "string") return record.id;
    if (typeof record._id === "string") return record._id;
  }
  return value != null ? String(value) : undefined;
};

const toTitleCase = (input: string): string =>
  input
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const normalizeProductsFromOutputs = (outputs: ToolOutput[]): unknown[] => {
  const candidateKeys = ["products", "results", "items"];
  const byId = new Map<string, unknown>();

  outputs.forEach((output) => {
    const result = output?.result;
    if (!result || typeof result !== "object") return;
    const record = result as UnknownRecord;

    candidateKeys.forEach((key) => {
      // recommendation array, product array etc
      const value = record[key];

      if (!Array.isArray(value)) return;

      value.forEach((entry, index) => {
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
      });
    });
  });

  return Array.from(byId.values());
};

const toUniqueStrings = (values: Array<string | undefined>): string[] => {
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

const collectStringArray = (input: unknown, limit = 6): string[] => {
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

const extractPricesFromSizes = (input: unknown): number[] => {
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

const computePriceRange = (prices: number[]): string | undefined => {
  if (!prices.length) return undefined;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (!Number.isFinite(min) || min < 0) return undefined;
  if (!Number.isFinite(max) || max < 0) return undefined;
  if (min === max) return `$${min.toFixed(2)}`;
  return `$${min.toFixed(2)}–$${max.toFixed(2)}`;
};

const sanitizeProductForModel = (
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

const sanitizeProductListForModel = (
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

const sanitizeProductsResultForModel = (rawResult: unknown): unknown => {
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

const sanitizeRoutineStepForModel = (
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

const sanitizeRoutineResultForModel = (rawResult: unknown): unknown => {
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

const sanitizeToolResultForModel = (
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

type ProductCandidate = Record<string, unknown>;

type SizeSummary = {
  label?: string;
  price?: number;
  currency?: string;
};

type RoutineProductOption = {
  productId?: string;
  description?: string;
  product: ProductCandidate;
};

type RoutineStepCandidate = {
  step: number;
  category?: string;
  title?: string;
  description?: string;
  productId?: string;
  product: ProductCandidate;
  alternatives?: RoutineProductOption[];
};

type RoutineSelection = {
  steps: RoutineStepCandidate[];
  notes?: string;
  recommendations?: unknown[];
};

type ReplySummary = {
  icon?: string;
  headline: string;
  subheading?: string;
};

type RoutineSummaryContext = {
  type: "routine";
  stepCount: number;
  skinType?: string;
  concerns?: string[];
  stepHighlights: string[];
  iconSuggestion?: string;
  headlineHint?: string;
  routineDescription?: string;
};

type ProductSummaryContext = {
  type: "products";
  productCount: number;
  filters: {
    category?: string;
    skinTypes?: string[];
    skinConcerns?: string[];
    ingredientQueries?: string[];
    brand?: string;
    nameQuery?: string;
  };
  topProducts: Array<{
    name?: string;
    brand?: string;
    category?: string;
  }>;
  notes?: string;
  iconSuggestion?: string;
  headlineHint?: string;
  filterDescription?: string;
};

type SummaryContext = RoutineSummaryContext | ProductSummaryContext;

const replySummarySchema = z
  .object({
    headline: z.string().min(1).max(120),
    subheading: z.string().min(1).max(200),
    icon: z.string().min(1).max(4).optional(),
  })
  .strict();

const truncateString = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
};

const coerceString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const formatList = (
  items: string[],
  conjunction: "and" | "or" = "and"
): string => {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`;
};

const sentenceCase = (value: string): string => {
  if (!value) return value;
  const trimmed = value.trim();
  if (!trimmed.length) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const describeSkinTypes = (skinTypes: string[]): string | undefined => {
  if (!skinTypes.length) return undefined;
  const items = skinTypes.map((type) => `${type.toLowerCase()} skin`);
  return formatList(items);
};

const describeConcerns = (concerns: string[]): string | undefined => {
  if (!concerns.length) return undefined;
  const items = concerns.map((concern) => {
    const lower = concern.toLowerCase();
    if (lower.includes("concern")) return lower;
    if (lower.endsWith("s")) return lower;
    return `${lower} concerns`;
  });
  return formatList(items);
};

const describeIngredients = (ingredients: string[]): string | undefined => {
  if (!ingredients.length) return undefined;
  const normalized = ingredients.map((item) => item.toLowerCase());
  return formatList(normalized);
};

const composeAudiencePhrase = (
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

type ProductHeadlineInput = {
  productCount: number;
  category?: string;
  audience?: string;
  brand?: string;
  nameQuery?: string;
  ingredients?: string;
};

type ProductHeadlineResult = {
  headline: string;
  usedAudience: boolean;
  usedBrand: boolean;
  usedIngredients: boolean;
};

const buildProductHeadline = ({
  productCount,
  category,
  audience,
  brand,
  nameQuery,
  ingredients,
}: ProductHeadlineInput): ProductHeadlineResult => {
  const descriptor =
    productCount >= 5 ? "Top" : productCount >= 3 ? "Curated" : "Featured";
  let headline = "";
  let usedAudience = false;
  let usedBrand = false;
  let usedIngredients = false;

  if (category) {
    const categoryLabel =
      category.endsWith("s") || category.endsWith("S")
        ? category
        : `${category}s`;
    if (audience) {
      headline = `${descriptor} ${categoryLabel} for ${audience}`;
      usedAudience = true;
    } else if (brand) {
      headline = `${descriptor} ${categoryLabel} from ${brand}`;
      usedBrand = true;
    } else if (ingredients) {
      headline = `${descriptor} ${categoryLabel} with ${ingredients}`;
      usedIngredients = true;
    } else {
      headline = `${descriptor} ${categoryLabel}`;
    }
  } else if (brand) {
    headline =
      productCount > 1 ? `${brand} Favorites` : `Featured ${brand} Pick`;
    usedBrand = true;
    if (audience) {
      headline = `${headline} for ${audience}`;
      usedAudience = true;
    }
  } else if (nameQuery) {
    headline = `Results for "${nameQuery}"`;
  } else if (audience) {
    headline =
      productCount > 1
        ? `Product Picks for ${audience}`
        : `Featured Pick for ${audience}`;
    usedAudience = true;
  } else if (ingredients) {
    headline = `Products with ${ingredients}`;
    usedIngredients = true;
  } else {
    headline =
      productCount > 1
        ? "Product Recommendations for You"
        : "Featured Product Pick";
  }

  return { headline, usedAudience, usedBrand, usedIngredients };
};

const buildProductSubheading = ({
  audiencePhrase,
  brand,
  ingredients,
  nameQuery,
  note,
  usedAudience,
  usedBrand,
  usedIngredients,
}: {
  audiencePhrase?: string;
  brand?: string;
  ingredients?: string;
  nameQuery?: string;
  note?: string;
  usedAudience: boolean;
  usedBrand: boolean;
  usedIngredients: boolean;
}): string | undefined => {
  const descriptorParts: string[] = [];
  if (audiencePhrase && !usedAudience) {
    descriptorParts.push(`tailored for ${audiencePhrase}`);
  }
  if (ingredients && !usedIngredients) {
    descriptorParts.push(`features ${ingredients}`);
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

const extractProductMetadataForSummary = (
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

async function generateReplySummaryWithLLM({
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

  const routineGuidance =
    context?.type === "routine"
      ? [
          'Begin the headline with the exact phrase "Here is the routine I built for" followed immediately by the routineDescription (or "your skin" if routineDescription is missing).',
          'The routineDescription field already captures the skin type and focus (e.g., "oily skin and focused on acne concerns"); reuse that wording verbatim without reordering its meaning.',
          "Keep the remainder of the headline concise—if you need to add a short clause about the routine's focus, do so naturally.",
          stepCountText
            ? `In the subheading, reference that the routine covers ${stepCountText} and, if possible, nod to one of the stepHighlights or invite the user to tweak steps.`
            : "In the subheading, highlight what the routine focuses on and invite the user to tweak steps.",
        ].join(" ")
      : "";

  const productGuidance =
    context?.type === "products"
      ? [
          `Begin the headline with "Here are the products I found" and immediately append the provided filterDescription${filterDescription ? ' exactly as written (it already begins with wording like "including category cleanser")' : " or, if missing, summarize the most relevant filters (category, skin type, concerns, actives, brand)"}.`,
          "Keep the headline brief and action-oriented.",
          "Use the subheading to reiterate the key filters in one sentence and invite the user to take next steps like comparing or learning more.",
        ].join(" ")
      : "";

  const contextualInstructions = [routineGuidance, productGuidance]
    .filter(Boolean)
    .join(" ");

  const iconInstruction = `Set the "icon" field in your JSON to "${icon}". Do not place any emoji inside the headline or subheading. Provide exactly one headline and one subheading—no additional fields or sentences.`;

  try {
    const isGPT5 = /(^|\b)gpt-5(\b|\-)/i.test(model);
    const resp = await openai.responses.create({
      model,
      store: false,
      ...(isGPT5 ? { reasoning: { effort: "medium" as const } } : {}),
      ...(isGPT5 ? { include: ["reasoning.encrypted_content" as const] } : {}),
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content: `You are a succinct copywriter for SkinBuddy, a skincare assistant. Given the assistant's reply and the structured context, craft a heading and subheading that match the requested format. Keep the headline between 3–10 words (≤60 characters) and ensure it stays conversational and skincare-focused. The subheading must be exactly one supportive sentence (≤110 characters) that complements—but never repeats verbatim—the headline. ${iconInstruction} ${contextualInstructions} Output ONLY a JSON object with keys headline, subheading, and optional icon—no prose, no markdown, no code fences.`,
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
      subheading: result.data.subheading.trim(),
      icon: result.data.icon?.trim() || undefined,
    };
  } catch (error) {
    console.error("Failed to generate reply summary:", error);
    return null;
  }
}

const selectProductsParameters = {
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

const selectProductsResponseSchema = z.object({
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

const deriveCandidateKey = (
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

const summarizeCandidates = (
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

async function refineProductSelection({
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
      ...(isGPT5 ? { include: ["reasoning.encrypted_content" as const] } : {}),
      input: selectionMessages,
      tools: [
        {
          type: "function",
          name: "selectProducts",
          description:
            "Select the best products for the user from the candidate list.",
          parameters: selectProductsParameters,
          strict: false,
        },
      ],
      tool_choice: { type: "function", name: "selectProducts" },
      ...(isGPT5 ? { temperature: 1 as const } : { temperature: 0 }),
    });

    const toolCall = (selection.output || []).find(
      (item: any) => item?.type === "function_call"
    );
    if (!toolCall || toolCall.type !== "function_call") {
      return { products: limitedCandidates };
    }

    if (toolCall.name !== "selectProducts") {
      return { products: limitedCandidates };
    }

    const rawArguments = toolCall.arguments ?? "{}";
    const parsed = selectProductsResponseSchema.safeParse(
      JSON.parse(rawArguments)
    );

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

export async function callOpenAI({
  messages,
  systemPrompt,
  model = "gpt-4o-mini",
  temperature = 1,
  useTools = true,
  maxToolRounds = 5, // prevent runaway loops
  onToken,
  onProducts,
  onRoutine,
  onSummary,
}: {
  messages: ChatMessage[];
  systemPrompt: string;
  model?: string;
  temperature?: number;
  useTools?: boolean;
  maxToolRounds?: number;
  onToken?: (chunk: string) => Promise<void> | void;
  onProducts?: (products: ProductCandidate[]) => Promise<void> | void;
  onRoutine?: (routine: RoutineSelection) => Promise<void> | void;
  onSummary?: (summary: ReplySummary) => Promise<void> | void;
}): Promise<{
  reply: string;
  toolOutputs?: ToolOutput[];
  products?: unknown[];
  resultType?: "routine";
  routine?: RoutineSelection;
  summary?: ReplySummary;
  updatedContext?: object;
}> {
  const tools = toolSpecs.map((tool) => ({
    type: "function" as const,
    name: tool.function.name,
    description: tool.function.description ?? undefined,
    parameters: tool.function.parameters ?? null,
    strict: false as const,
  }));

  // Build a local message history we can augment
  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
  ];

  for (const msg of messages) {
    chatMessages.push({ role: msg.role, content: msg.content });
  }

  chatMessages.push({
    role: "developer",
    content:
      "For every final reply, append a heading 'Suggested actions' followed by exactly three numbered follow-up prompts (plain text, no emojis). Each suggestion must be phrased as a natural, conversational message the user would actually send to SkinBuddy—written in first or second person, starting with natural words like 'What', 'Tell me', 'How', 'Can you', 'I', etc. (e.g., 'What serums would work best for my skin type?' or 'How should I layer these products?'). **All three suggestions must be skincare-related only**—never suggest follow-ups about non-skincare topics like haircare, makeup, oral care, deodorant, fitness, diet, sleep, mental health, or anything outside skincare. Keep suggestions contextual to the conversation and within SkinBuddy's scope.",
  });

  const latestUserMessageContent = [...messages]
    .reverse()
    .find((msg) => msg.role === "user")?.content;

  let lastProductSelection: ProductCandidate[] = [];
  let lastStreamedProductsSignature: string | null = null;
  let lastStreamedRoutineSignature: string | null = null;
  let lastStreamedSummarySignature: string | null = null;

  let routineSummaryParts: ReplySummary | null = null;
  let productSummaryParts: ReplySummary | null = null;
  let combinedSummary: ReplySummary | null = null;

  // console.log(chatMessages, "This is conversation history");

  // messages.push({ role: "user", content: userMessage });

  const streamCompletion = async (
    forceFinal: boolean,
    extraInputItems: any[] = []
  ): Promise<{
    content: string;
    toolCalls: Array<{
      id: string; // internal item id
      call_id: string;
      name: string;
      arguments: string;
    }>;
  }> => {
    const toolCallsByItemId = new Map<
      string,
      { id: string; call_id: string; name: string; arguments: string }
    >();

    const toInputFromChat = (): any[] => {
      const items: any[] = [];
      for (const msg of chatMessages) {
        if (msg.role === "tool") {
          // We do not directly inject prior tool messages; tool function outputs
          // are provided via function_call_output items when applicable.
          continue;
        }
        // Easy input message
        const messageItem: Record<string, unknown> = {
          type: "message",
          role:
            msg.role === "developer" ||
            msg.role === "system" ||
            msg.role === "user" ||
            msg.role === "assistant"
              ? (msg.role as any)
              : msg.role === "tool"
                ? "user"
                : "user",
          content: msg.content,
        };
        items.push(messageItem);
      }
      // Append any extra input items (e.g., function_call_output) for this round
      return items.concat(extraInputItems);
    };

    const isGPT5 = /(^|\b)gpt-5(\b|\-)/i.test(model);
    let content = "";

    const stream = await openai.responses.create({
      model,
      store: false,
      // include: ["reasoning.encrypted_content"],
      ...(isGPT5 ? { reasoning: { effort: "medium" as const } } : {}),
      input: toInputFromChat(),
      tools: useTools ? (tools as any) : undefined,
      tool_choice: useTools ? (forceFinal ? "none" : "auto") : "none",
      stream: true,
      ...(isGPT5 ? { temperature: 1 as const } : { temperature }),
    });

    for await (const event of stream as any) {
      const type = event?.type as string | undefined;
      if (!type) continue;

      if (type === "response.output_text.delta") {
        const delta = event.delta ?? "";
        if (delta) {
          content += delta;
          if (onToken) await onToken(delta);
        }
        continue;
      }

      if (type === "response.output_item.added") {
        const item = event.item;
        if (item?.type === "function_call") {
          const id =
            item.id ||
            event.item_id ||
            item.call_id ||
            `call_${event.output_index ?? 0}`;
          toolCallsByItemId.set(id, {
            id,
            call_id: item.call_id,
            name: item.name,
            arguments: "",
          });
        }
        continue;
      }

      if (type === "response.function_call_arguments.delta") {
        const itemId = event.item_id as string;
        const existing = toolCallsByItemId.get(itemId);
        if (existing) {
          existing.arguments += event.delta ?? "";
        }
        continue;
      }
    }

    const toolCalls = Array.from(toolCallsByItemId.values());

    if (toolCalls.length) {
      // Record that the assistant produced tool calls (no direct content)
      chatMessages.push({ role: "assistant", content: "" });
    } else {
      chatMessages.push({ role: "assistant", content });
    }

    return { content, toolCalls };
  };

  let rounds = 0;
  const toolOutputs: ToolOutput[] = [];

  let finalContent = "";
  let lastRoutine: RoutineSelection | null = null;
  let lastResultType: "routine" | null = null;
  let summaryContext: SummaryContext | null = null;

  const recomputeCombinedSummary = (): ReplySummary | null => {
    if (routineSummaryParts && productSummaryParts) {
      const mergedHeadline = `${routineSummaryParts.headline} + ${productSummaryParts.headline}`;
      const subheadingParts = [
        routineSummaryParts.subheading,
        productSummaryParts.subheading,
      ].filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0
      );
      combinedSummary = {
        headline:
          mergedHeadline.length > 160
            ? `${mergedHeadline.slice(0, 157)}...`
            : mergedHeadline,
        subheading: subheadingParts.length
          ? subheadingParts.join(" · ")
          : undefined,
        icon: routineSummaryParts.icon ?? productSummaryParts.icon ?? undefined,
      };
    } else {
      combinedSummary = routineSummaryParts ?? productSummaryParts ?? null;
    }
    return combinedSummary;
  };

  const streamSummaryIfNeeded = async (): Promise<void> => {
    const summary = recomputeCombinedSummary();
    if (!summary || !onSummary) return;
    const signature = JSON.stringify(summary);
    if (signature === lastStreamedSummarySignature) return;
    lastStreamedSummarySignature = signature;
    try {
      await onSummary(summary);
    } catch (error) {
      console.error("Summary streaming callback failed:", error);
    }
  };

  const streamProductsIfNeeded = async (
    products: ProductCandidate[]
  ): Promise<void> => {
    if (!onProducts || !products.length) return;
    const signature = JSON.stringify(
      products.map((product, index) => {
        const id = coerceId(product);
        if (id) return id;
        const record =
          product && typeof product === "object"
            ? (product as UnknownRecord)
            : null;
        if (record) {
          if (typeof record.slug === "string") return record.slug;
          if (typeof record.name === "string")
            return `name:${record.name.toLowerCase()}`;
        }
        return `idx:${index}`;
      })
    );
    if (signature === lastStreamedProductsSignature) return;
    lastStreamedProductsSignature = signature;
    try {
      await onProducts(products);
    } catch (error) {
      console.error("Product streaming callback failed:", error);
    }
  };

  const streamRoutineIfNeeded = async (
    routine: RoutineSelection | null
  ): Promise<void> => {
    if (!onRoutine || !routine || !routine.steps.length) return;
    const signature = JSON.stringify(
      routine.steps.map((step, index) => {
        if (!step) return `idx:${index}`;
        if (typeof step.productId === "string") return step.productId;
        const productRecord =
          step.product && typeof step.product === "object"
            ? (step.product as UnknownRecord)
            : null;
        const productId = productRecord ? coerceId(productRecord) : undefined;
        if (productId) return productId;
        if (productRecord && typeof productRecord.slug === "string") {
          return productRecord.slug;
        }
        return `step:${step.step ?? index}`;
      })
    );
    if (signature === lastStreamedRoutineSignature) return;
    lastStreamedRoutineSignature = signature;
    try {
      await onRoutine(routine);
    } catch (error) {
      console.error("Routine streaming callback failed:", error);
    }
  };

  console.log("calling openAi");

  // main
  let pendingExtraInputItems: any[] = [];
  while (true) {
    const { content, toolCalls } = await streamCompletion(
      rounds >= maxToolRounds,
      pendingExtraInputItems
    );
    // clear after consumption
    pendingExtraInputItems = [];

    if (useTools && toolCalls.length > 0 && rounds < maxToolRounds) {
      rounds++;

      toolCalls.forEach((toolCall, index) => {
        const existing =
          toolCall.call_id && toolCall.call_id.startsWith("fc_")
            ? toolCall.call_id
            : toolCall.id && toolCall.id.startsWith("fc_")
              ? toolCall.id
              : `fc_${rounds}_${index}_${Date.now()}`;
        toolCall.call_id = existing;
        toolCall.id = existing;
      });

      // Execute tool calls and prepare function_call_output inputs for the next round
      const functionCallInputsForNextRound: any[] = toolCalls.map(
        (toolCall, index) => {
          const callId =
            toolCall.call_id ||
            toolCall.id ||
            `fc_${rounds}_${index}_${Date.now()}`;
          return {
            type: "function_call",
            call_id: callId,
            name: toolCall.name,
            arguments: toolCall.arguments,
          };
        }
      );
      const functionCallOutputsForNextRound: any[] = [];
      for (const toolCall of toolCalls) {
        const callId =
          toolCall.call_id ||
          toolCall.id ||
          `fc_${rounds}_${functionCallOutputsForNextRound.length}`;
        try {
          const rawArgs =
            typeof toolCall.arguments === "string"
              ? JSON.parse(toolCall.arguments || "{}")
              : (toolCall.arguments ?? {});

          console.log(`Executing tool: ${toolCall.name}`, rawArgs);

          const toolDef = getToolByName(toolCall.name);
          if (!toolDef) {
            throw new Error(`Unknown tool: ${toolCall.name}`);
          }

          const validatedArgs = toolDef.schema.parse(rawArgs);
          const result = await toolDef.handler(validatedArgs);

          toolOutputs.push({
            name: toolCall.name,
            arguments: validatedArgs,
            result: result ?? null,
          });

          const sanitizedResult = sanitizeToolResultForModel(
            toolCall.name,
            result ?? {}
          );
          const normalizedSanitized =
            sanitizedResult && typeof sanitizedResult === "object"
              ? sanitizedResult
              : sanitizedResult === undefined
                ? {}
                : { value: sanitizedResult };

          // Provide result to the model via function_call_output item
          functionCallOutputsForNextRound.push({
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(normalizedSanitized),
          });

          // Also keep a tool message in local transcript for product/routine extraction logic
          chatMessages.push({
            role: "tool",
            tool_call_id: callId,
            content: JSON.stringify(normalizedSanitized),
          });
        } catch (err) {
          console.error(
            `Tool execution error (${toolCall.name ?? "unknown"}):`,
            err
          );
          functionCallOutputsForNextRound.push({
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({
              error: true,
              message: (err as Error)?.message || "Tool execution failed",
            }),
          });
          chatMessages.push({
            role: "tool",
            tool_call_id: callId,
            content: JSON.stringify({
              error: true,
              message: (err as Error)?.message || "Tool execution failed",
            }),
          });
        }
      }

      const extraInputItemsForNextRound = [
        ...functionCallInputsForNextRound,
        ...functionCallOutputsForNextRound,
      ];

      // All of the toolOutputs when no more tool calls
      // console.log(toolOutputs, "This is the toolOutput");

      // our frontend can handle one routine at a time
      summaryContext = null;

      // latest routine output (just one)
      const latestRoutineOutput = [...toolOutputs]
        .slice()
        .reverse()
        .find(
          (output) =>
            output.name === "recommendRoutine" &&
            output?.result &&
            typeof output.result === "object" &&
            Array.isArray((output.result as Record<string, unknown>).steps)
        );

      // out of foor loop, no more tool calls
      if (latestRoutineOutput) {
        // lets append devleloper message to get the final reply for the routine tool call
        chatMessages.push({
          role: "developer",
          content:
            "You have the routine returned in the previous tool call. Write a friendly response (2-3 sentences) that: 1) Confirms you've found a routine tailored to their skin type/concerns, 2) Briefly mentions the key categories or types of products included (e.g., cleansers, moisturizers, sunscreens), highlighting how they address the user's needs, and 3) Offers helpful next steps like getting more details on specific products, adjusting preferences, or taking action like adding to cart or comparing options. You may include one relevant emoji at the start if appropriate.",
        });
        const routineResult = latestRoutineOutput.result as Record<
          string,
          unknown
        >;
        const rawSteps = Array.isArray(routineResult.steps)
          ? routineResult.steps
          : [];

        const normalizedSteps = rawSteps
          .map((entry, index) => {
            if (!entry || typeof entry !== "object") return null;
            const record = entry as Record<string, unknown>;

            const product =
              record.product &&
              typeof record.product === "object" &&
              record.product !== null
                ? (record.product as ProductCandidate)
                : undefined;

            if (!product) return null;

            const stepNumber =
              typeof record.step === "number" ? record.step : index + 1;
            const category =
              typeof record.category === "string" ? record.category : undefined;
            const title =
              typeof record.title === "string" ? record.title : undefined;
            const description =
              typeof record.description === "string"
                ? record.description
                : undefined;
            const productId =
              typeof record.productId === "string"
                ? record.productId
                : undefined;

            const alternatives =
              Array.isArray(record.alternatives) && record.alternatives.length
                ? (record.alternatives as Array<Record<string, unknown>>)
                    .map((entry) => {
                      if (!entry || typeof entry !== "object") return null;
                      const optionRecord = entry as Record<string, unknown>;
                      const optionProduct =
                        optionRecord.product &&
                        typeof optionRecord.product === "object" &&
                        optionRecord.product !== null
                          ? (optionRecord.product as ProductCandidate)
                          : undefined;
                      if (!optionProduct) return null;
                      const optionId =
                        typeof optionRecord.productId === "string"
                          ? optionRecord.productId
                          : undefined;
                      const optionDescription =
                        typeof optionRecord.description === "string"
                          ? optionRecord.description
                          : undefined;
                      return {
                        productId: optionId,
                        description: optionDescription,
                        product: optionProduct,
                      } as RoutineProductOption;
                    })
                    .filter(
                      (entry): entry is RoutineProductOption => entry !== null
                    )
                : undefined;

            return {
              step: stepNumber,
              category,
              title,
              description,
              productId,
              product,
              alternatives,
            } as RoutineStepCandidate;
          })
          .filter((entry): entry is RoutineStepCandidate => entry !== null)
          .sort((a, b) => (a?.step ?? 0) - (b?.step ?? 0));

        if (normalizedSteps.length) {
          lastRoutine = {
            steps: normalizedSteps,
            notes:
              typeof routineResult.notes === "string"
                ? routineResult.notes
                : undefined,
            recommendations: Array.isArray(routineResult.recommendations)
              ? routineResult.recommendations
              : undefined,
          };
          lastResultType = "routine";
          lastProductSelection = [];
          const routineArgs =
            (latestRoutineOutput.arguments as {
              skinType?: string;
              skinConcerns?: string[];
            }) ?? {};
          const skinTypeRaw =
            typeof routineArgs.skinType === "string"
              ? routineArgs.skinType
              : undefined;
          const concernsRaw = Array.isArray(routineArgs.skinConcerns)
            ? (routineArgs.skinConcerns ?? [])
            : [];
          const skinTypePretty = skinTypeRaw
            ? toTitleCase(skinTypeRaw)
            : undefined;
          const concernsPretty = concernsRaw
            .map((concern) => toTitleCase(concern))
            .filter(Boolean);
          const concernsPhrase = describeConcerns(concernsPretty);
          const routineSkinPhrase = skinTypePretty
            ? describeSkinTypes([skinTypePretty])
            : undefined;
          const routineHeadline = (() => {
            if (skinTypePretty && concernsPhrase) {
              return `Routine for ${skinTypePretty} Skin, tailored to ${sentenceCase(
                concernsPhrase
              )}`;
            }
            if (skinTypePretty) {
              return `Routine for ${skinTypePretty} Skin`;
            }
            if (concernsPhrase) {
              return `Routine targeting ${sentenceCase(concernsPhrase)}`;
            }
            return "Personalized Routine";
          })();
          const stepCount = normalizedSteps.length;
          const stepHighlights = normalizedSteps
            .slice(0, 5)
            .map((step) => {
              const label =
                (typeof step.title === "string" && step.title.length
                  ? step.title
                  : step.category) ??
                (step?.step !== undefined && step?.step !== null
                  ? `Step ${step.step}`
                  : "");
              const productName =
                typeof step.product?.name === "string"
                  ? step.product.name
                  : typeof step.product?.slug === "string"
                    ? step.product.slug
                    : undefined;
              const parts: string[] = [];
              if (step?.step !== undefined && step?.step !== null) {
                parts.push(`Step ${step.step}`);
              }
              if (label) {
                parts.push(label);
              }
              if (productName) {
                parts.push(productName);
              }
              return parts.join(" · ");
            })
            .filter((entry): entry is string => Boolean(entry));

          const routineAudience = routineSkinPhrase ?? "your skin";
          const routineConcernFocus = concernsPhrase
            ? `focused on ${concernsPhrase}`
            : undefined;
          const routineDescription = [routineAudience, routineConcernFocus]
            .filter(Boolean)
            .join(" and ");

          const routineIcon = "🧖";
          routineSummaryParts = {
            headline: routineHeadline,
            subheading: routineDescription.length
              ? sentenceCase(routineDescription)
              : undefined,
            icon: routineIcon,
          };
          await streamSummaryIfNeeded();
          await streamRoutineIfNeeded(lastRoutine);

          summaryContext = {
            type: "routine",
            stepCount,
            skinType: skinTypePretty,
            concerns: concernsPretty.length ? concernsPretty : undefined,
            stepHighlights,
            iconSuggestion: routineIcon,
            headlineHint: routineHeadline,
            routineDescription,
          };

          // const routineSummary = normalizedSteps
          //   .map((step) => {
          //     if (step === null || step === undefined) return null; // Added explicit null check for step
          //     const label =
          //       (typeof step.title === "string" && step.title.length
          //         ? step.title
          //         : step.category) ??
          //       (step?.step !== undefined && step?.step !== null
          //         ? `Step ${step.step}`
          //         : "");
          //     const productName =
          //       typeof step.product?.name === "string"
          //         ? step.product.name
          //         : typeof step.product?.slug === "string"
          //           ? step.product.slug
          //           : undefined;
          //     return `${
          //       step?.step !== undefined && step?.step !== null
          //         ? `Step ${step.step}`
          //         : ""
          //     }: ${label}${productName ? ` · ${productName}` : ""}`;
          //   })
          //   .filter((entry): entry is string => entry !== null) // Filter out nulls after mapping
          //   .slice(0, 5)
          //   .join(" | ");

          // if (routineSummary.length) {
          //   chatMessages.push({
          //     role: "developer",
          //     content:
          //       "Routine outline (do not enumerate verbatim): " +
          //       routineSummary,
          //   });
          // }

          // if (lastRoutine?.notes) {
          //   chatMessages.push({
          //     role: "developer",
          //     content:
          //       "Routine notes (context only, paraphrase if helpful): " +
          //       lastRoutine.notes,
          //   });
          // }

          // chatMessages.push({
          //   role: "developer",
          //   content:
          //     "Explain how this full routine supports the user's skin goals. Reference the routine collectively (Step 1 cleanser, Step 2 serum, etc.) in a concise paragraph, and invite follow-up like swapping a step or learning usage tips.",
          // });

          // chatMessages.push({
          //   role: "developer",
          //   content:
          //     "If the last tool call how this full routine supports the user's skin goals. Reference the routine collectively (Step 1 cleanser, Step 2 serum, etc.) in a concise paragraph, and invite follow-up like swapping a step or learning usage tips.",
          // });

          // chatMessages.push({
          //   role: "developer",
          //   content:
          //     "You have the routines passed in previous tool call. Dont generate any final content, text or routine description.",
          // });

          pendingExtraInputItems = extraInputItemsForNextRound;

          continue;
        }
      }

      // Make sure next round includes function_call and function_call_output items
      pendingExtraInputItems = extraInputItemsForNextRound;

      const productsArray =
        toolOutputs.length > 0 ? normalizeProductsFromOutputs(toolOutputs) : [];

      // for products array in tool call
      if (productsArray.length) {
        let refinedProductsResult: {
          products: ProductCandidate[];
          notes?: string;
        } | null = null;

        // pass in the product to llm to refine
        try {
          refinedProductsResult = await refineProductSelection({
            candidates: productsArray as ProductCandidate[],
            model,
            userRequest: latestUserMessageContent ?? "",
          });
        } catch (error) {
          console.error("Error refining product selection:", error);
        }

        const selectedProducts = refinedProductsResult?.products?.length
          ? refinedProductsResult.products
          : (productsArray as ProductCandidate[]);
        const streamingProducts = selectedProducts.length
          ? selectedProducts
          : (productsArray as ProductCandidate[]);

        const latestSearchOutput = [...toolOutputs]
          .slice()
          .reverse()
          .find((output) => output.name === "searchProductsByQuery");
        const searchArgs =
          (latestSearchOutput?.arguments as {
            categoryQuery?: string;
            nameQuery?: string;
            brandQuery?: string;
            skinTypes?: string[];
            skinConcerns?: string[];
            ingredientQueries?: string[];
            hasAlcohol?: boolean;
            hasFragrance?: boolean;
          }) ?? {};
        const category =
          typeof searchArgs.categoryQuery === "string"
            ? searchArgs.categoryQuery
            : undefined;
        const nameQuery =
          typeof searchArgs.nameQuery === "string"
            ? searchArgs.nameQuery.trim()
            : undefined;
        const brandQuery =
          typeof searchArgs.brandQuery === "string"
            ? searchArgs.brandQuery
            : undefined;
        const rawSkinTypes = Array.isArray(searchArgs.skinTypes)
          ? searchArgs.skinTypes.filter(
              (entry): entry is string => typeof entry === "string"
            )
          : [];
        const rawSkinConcerns = Array.isArray(searchArgs.skinConcerns)
          ? searchArgs.skinConcerns.filter(
              (entry): entry is string => typeof entry === "string"
            )
          : [];
        const rawIngredientQueries = Array.isArray(searchArgs.ingredientQueries)
          ? searchArgs.ingredientQueries.filter(
              (entry): entry is string => typeof entry === "string"
            )
          : [];

        const normalizedSkinTypes = rawSkinTypes
          .map((type) => toTitleCase(type))
          .filter(Boolean);
        const normalizedConcerns = rawSkinConcerns
          .map((concern) => toTitleCase(concern))
          .filter(Boolean);
        const normalizedCategory = category ? toTitleCase(category) : undefined;
        const normalizedBrand = brandQuery
          ? toTitleCase(brandQuery)
          : undefined;

        const audiencePhrase = composeAudiencePhrase(
          normalizedSkinTypes,
          normalizedConcerns
        );
        const audienceHeadline = audiencePhrase
          ? toTitleCase(audiencePhrase)
          : undefined;
        const ingredientPhraseRaw = describeIngredients(rawIngredientQueries);
        const ingredientHeadline = ingredientPhraseRaw
          ? sentenceCase(ingredientPhraseRaw)
          : undefined;
        const nameQueryHeadline = nameQuery
          ? toTitleCase(nameQuery)
          : undefined;

        const selectionNote =
          typeof refinedProductsResult?.notes === "string"
            ? refinedProductsResult.notes
            : undefined;

        const productIcon = "🛍️";
        const {
          headline: summaryHeadline,
          usedAudience,
          usedBrand,
          usedIngredients,
        } = buildProductHeadline({
          productCount: streamingProducts.length,
          category: normalizedCategory,
          audience: audienceHeadline,
          brand: normalizedBrand,
          nameQuery: nameQueryHeadline,
          ingredients: ingredientHeadline,
        });

        const summarySubheading = buildProductSubheading({
          audiencePhrase,
          brand: normalizedBrand,
          ingredients: ingredientPhraseRaw,
          nameQuery,
          note: selectionNote,
          usedAudience,
          usedBrand,
          usedIngredients,
        });

        summaryContext = {
          type: "products",
          productCount: streamingProducts.length,
          filters: {
            category: normalizedCategory,
            skinTypes: normalizedSkinTypes.length
              ? normalizedSkinTypes
              : undefined,
            skinConcerns: normalizedConcerns.length
              ? normalizedConcerns
              : undefined,
            ingredientQueries: rawIngredientQueries.length
              ? rawIngredientQueries.map((item) => item.toLowerCase())
              : undefined,
            brand: normalizedBrand,
            nameQuery: nameQuery ?? undefined,
          },
          topProducts: extractProductMetadataForSummary(streamingProducts),
          notes: selectionNote,
          iconSuggestion: productIcon,
          headlineHint: summaryHeadline,
          filterDescription: summarySubheading ?? selectionNote,
        };

        productSummaryParts = {
          headline: summaryHeadline,
          subheading: summarySubheading ?? selectionNote,
          icon: productIcon,
        };
        await streamSummaryIfNeeded();
        await streamProductsIfNeeded(streamingProducts);
        lastProductSelection = streamingProducts;

        const reasonContext = streamingProducts
          .slice(0, 4)
          .map((product, index) => {
            if (typeof product.selectionReason !== "string") return null;
            const label =
              typeof product.name === "string"
                ? product.name
                : typeof product.slug === "string"
                  ? product.slug
                  : `Option ${index + 1}`;
            return `${label}: ${product.selectionReason}`;
          })
          .filter((entry): entry is string => Boolean(entry));

        if (reasonContext.length) {
          chatMessages.push({
            role: "developer",
            content:
              "Context (do not list products individually): " +
              reasonContext.join(" | "),
          });
        }

        if (refinedProductsResult?.notes) {
          chatMessages.push({
            role: "developer",
            content:
              "Additional selection note (do not quote verbatim, use for context only): " +
              refinedProductsResult.notes,
          });
        }

        // instead of passing the products to the llm to generate final products, we tell it to give us a summary instead
        // we leave the heavy lifting of the product selection to another model, that follows the user prompts
        chatMessages.push({
          role: "developer",
          content:
            "You have the products returned in the previous tool call. Write one friendly paragraph (1–2 sentences) explaining how the selection fits the user. Do not enumerate the individual products; reference them if plural or it if singular collectively and offer to help with next steps like adding to cart, comparing, or getting more detail.",
        });
      }

      continue;
    }

    // tool call has finished
    finalContent = content;
    break;
  }

  const products =
    lastProductSelection.length > 0
      ? lastProductSelection
      : toolOutputs.length > 0
        ? normalizeProductsFromOutputs(toolOutputs)
        : [];

  const shouldOmitProducts = lastResultType === "routine";
  const productsPayload = shouldOmitProducts ? [] : products;

  finalContent = finalContent.trimEnd();

  const replyText = productsPayload.length
    ? finalContent.trim().length
      ? finalContent
      : "💧 I rounded up a few options that should fit nicely—happy to break any of them down further or pop one into your bag!"
    : finalContent;

  let generatedSummary: ReplySummary | null = combinedSummary;
  if (!generatedSummary && replyText.trim().length) {
    generatedSummary = await generateReplySummaryWithLLM({
      reply: replyText,
      userMessage: latestUserMessageContent,
      context: summaryContext,
      model,
    });
    if (generatedSummary) {
      const resolvedIcon =
        summaryContext?.iconSuggestion ?? generatedSummary.icon;
      generatedSummary = {
        ...generatedSummary,
        icon: resolvedIcon,
      };
    }
  } else if (generatedSummary) {
    const safeGeneratedSummary: ReplySummary = generatedSummary;
    const summaryForIcon = recomputeCombinedSummary();
    const resolvedIcon =
      (summaryForIcon && typeof summaryForIcon.icon === "string"
        ? summaryForIcon.icon
        : undefined) ??
      summaryContext?.iconSuggestion ??
      safeGeneratedSummary.icon;
    generatedSummary = {
      ...safeGeneratedSummary!,
      icon: resolvedIcon,
    };
  }

  // it is the reply that is being saved in conversation history
  return {
    reply: replyText,
    toolOutputs,
    products: productsPayload.length ? productsPayload : undefined,
    resultType: lastResultType ?? undefined,
    routine: lastRoutine ?? undefined,
    summary: generatedSummary ?? undefined,
  };
}
