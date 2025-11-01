import {
  buildProductHeadline,
  buildProductSubheading,
  coerceId,
  composeAudiencePhrase,
  DEFAULT_SYSTEM_PROMPT,
  describeConcerns,
  describeIngredients,
  describeBenefits,
  describeSkinTypes,
  extractProductMetadataForSummary,
  normalizeProductsFromOutputs,
  sanitizeToolResultForModel,
  sentenceCase,
  toTitleCase,
} from "../utils";
import { mapDescriptorsToBenefits } from "../../shared/skinMappings";
import { toolSpecs, getToolByName } from "../tools/localTools";
import {
  ChatMessage,
  ProductCandidate,
  ReplySummary,
  RoutineProductOption,
  RoutineSelection,
  RoutineStepCandidate,
  SummaryContext,
  ToolOutput,
  UnknownRecord,
} from "../types";
import { getGeminiClient } from "../gemini/client";
import {
  generateReplySummaryWithGemini,
  refineProductSelectionWithGemini,
} from "../gemini/utils";
console.log("lets check if we are updating");
export async function callGemini({
  messages,
  systemPrompt,
  model = "gemini-2.5-flash-lite",
  temperature = 0.5,
  useTools = true,
  maxToolRounds = 4, // prevent runaway loops
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
  startSkinTypeQuiz?: boolean;
}> {
  const geminiTools = toolSpecs.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description ?? undefined,
    parametersJsonSchema: tool.function.parameters ?? undefined,
  }));
  const geminiClient = getGeminiClient();

  console.log("testing if bun reload works");

  // Build a local message history we can augment
  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
  ];

  for (const msg of messages) {
    chatMessages.push({ role: msg.role, content: msg.content });
  }

  chatMessages.push({
    role: "developer",
    content: [
      "For every final reply, append a heading 'Suggested actions' followed by exactly three numbered follow-up prompts (plain text, no emojis). Phrase each suggestion as a first-person request the user could send to SkinBuddy—start with verbs like 'Recommend', 'Show me', 'Help me', or 'Explain'. Avoid asking the user questions such as 'What is your skin type?'; these suggestions should read like commands or requests directed at SkinBuddy (e.g., 'Recommend a brightening serum for uneven tone', 'Help me pick a gentle cleanser for sensitive skin'). Cap each suggestion at 12 words. Keep all three skincare-only and tightly relevant to the user's latest request, vary the angle when possible (ingredients, usage tips, alternatives, price points, etc.), and avoid near-duplicates. Never imply an action already happened or command SkinBuddy to perform it (skip things like 'Add…' or 'Checkout my cart'). Only reference a specific product by name if the user or your latest reply mentioned it in this turn.",
      "Each of the three suggestions must clearly build on the user's most recent request or the guidance you just provided—connect back to their specific skin type, concern, or product discussion. Do not repeat generic skincare advice, prompt them to rerun the survey, or raise unrelated topics.",
      "Before calling `searchProductsByQuery` or `getProduct`, scan earlier tool outputs in this conversation for the specific product facts you plan to mention. Reuse that data when it's already present, but if the most recent search turned up no matches, always run a fresh lookup instead of relying on the empty result.",
      "Never fabricate identifiers for tools. If you do not have a valid productId, sizeId, or other required argument from prior tool results, call a lookup tool to retrieve it or ask the user for clarifying input like the product name or size they want—not the internal id. Do not guess identifiers or reuse placeholders from memory.",
      "If the user asks for help determining their skin type (for example, 'What’s my skin type?', 'Do I have combination skin?') or types 'start skin quiz', acknowledge that intent warmly, mention that SkinBuddy can run a quick survey to identify their skin type, and make sure your suggested actions in that reply guide them toward next steps such as starting the survey ('Start the skin-type survey'), learning how it works ('Explain the survey steps'), or choosing another method ('Suggest a different approach'). If we already have their skin type stored (exposed via tools), reference it before offering the survey. **Never guess or infer a user's skin type from conversation context (including earlier requests such as 'build me an oily-skin routine')—only state what the tools return or that the survey is needed.** When the user is curious or tentative and has not issued a direct command (e.g., 'Should I take the skin quiz?', 'Can you help figure out my skin type?'), do not call the `startSkinTypeSurvey` tool; instead, reply in prose that SkinBuddy can help determine their skin type and concerns with a skin quiz and invite them to confirm if they want to start it. If the user asks for a skincare routine or product recommendations but hasn't provided their skin type or concerns, let them know SkinBuddy can help figure those out with the skin quiz before continuing, and ask whether they'd like to take it or share those details manually. Whenever the user issues a direct imperative to begin the survey (examples: 'start the skin survey', 'start the skin-type quiz', 'let’s start skin survey', 'begin the skin quiz'), immediately call the `startSkinTypeSurvey` tool with empty arguments and do not send any assistant prose in that turn. Use confirmation phrasing only when the user is asking or hesitating, not when they are commanding.",
      "When preparing tool arguments: put descriptive effects like 'hydrating', 'brightening', 'soothing' into the `benefits` array; keep actual ingredient names (niacinamide, hyaluronic acid, salicylic acid, etc.) in `ingredientQueries`; only use `nameQuery` for exact product titles or SKUs the user cited; and aim for canonical product nouns (cleanser, serum, sunscreen, toner, moisturizer) in `categoryQuery`. Avoid repeating the same value in multiple fields.",
    ].join(" "),
  });

  chatMessages.push({
    role: "developer",
    content:
      "No matter how short the reply is—including clarifying questions or quick acknowledgments—always finish with the heading 'Suggested actions' followed by exactly three numbered, skincare-relevant suggestions.",
  });

  chatMessages.push({
    role: "developer",
    content:
      "When your response provides educational or informational content (like explaining ingredients, answering 'how-to' questions, or discussing skincare concepts), and there's a natural next step that would help the user (such as finding products, building a routine, or getting personalized recommendations), consider adding a brief, conversational follow-up offer BEFORE the 'Suggested actions' heading. Keep it genuine and contextual—don't force it into every response. Examples: 'If you'd like, I can help you find [specific product type] that [addresses their concern]!' or 'Let me know if you'd like personalized [product/routine] recommendations based on your [skin type/concern]!' Reference their specific context (skin type, concerns) when known. Skip this entirely for responses that are already actionable (product recommendations, routines) or when there's no logical next step.",
  });

  chatMessages.push({
    role: "developer",
    content:
      "Never mention internal function or tool names in user-facing replies. Describe actions in plain language instead of referencing addToCart, searchProductsByQuery, or other internal APIs.",
  });

  const CATEGORY_KEYWORD_MAP: Array<{ category: string; patterns: RegExp[] }> =
    [
      {
        category: "serum",
        patterns: buildKeywordPatterns(["serum", "serums"]),
      },
      {
        category: "cleanser",
        patterns: buildKeywordPatterns(["cleanser", "cleansers", "face wash"]),
      },
      {
        category: "moisturizer",
        patterns: buildKeywordPatterns([
          "moisturizer",
          "moisturiser",
          "moisturisers",
          "moisturizers",
          "face cream",
          "hydrating cream",
        ]),
      },
      {
        category: "toner",
        patterns: buildKeywordPatterns(["toner", "toners"]),
      },
      {
        category: "sunscreen",
        patterns: buildKeywordPatterns([
          "sunscreen",
          "sun screen",
          "sunblock",
          "spf",
        ]),
      },
      {
        category: "mask",
        patterns: buildKeywordPatterns(["mask", "masks", "sheet mask"]),
      },
      {
        category: "exfoliant",
        patterns: buildKeywordPatterns([
          "exfoliant",
          "exfoliator",
          "chemical peel",
        ]),
      },
    ];

  function buildKeywordPatterns(keywords: string[]): RegExp[] {
    return keywords
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0)
      .map((keyword) => {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const boundaryPattern = escaped.replace(/\s+/g, "\\s+");
        return new RegExp(
          `(?:^|[^a-z0-9])${boundaryPattern}(?:[^a-z0-9]|$)`,
          "i"
        );
      });
  }

  const normalizeHeaderValue = (line: string): string =>
    line
      .toLowerCase()
      .replace(/[\*`_~>#:\-]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const formatBodyWithParagraphs = (body: string): string => {
    if (!body.trim().length) return "";
    if (/\n\s*\n/.test(body)) return body;
    if (/(?:^|\n)\s*(?:[-*•●◦▪]|\d+\.)\s/.test(body)) return body;
    if (/(?:^|\n)\s*#{1,6}\s/.test(body)) return body;

    const normalized = body.replace(/\s+/g, " ").trim();
    if (!normalized.length) return body;

    const sentences = normalized
      .split(/(?<=[.?!])\s+(?=[A-Z0-9])/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);

    if (sentences.length <= 1) {
      return body;
    }

    const shouldSplit =
      sentences.length >= 3 ||
      (sentences.length >= 2 && normalized.length >= 160);
    if (!shouldSplit) {
      return body;
    }

    const paragraphs: string[] = [];
    let currentSentences: string[] = [];

    for (const sentence of sentences) {
      currentSentences.push(sentence);
      const joined = currentSentences.join(" ");
      const sentenceQuotaReached =
        currentSentences.length >= 2 || joined.length >= 220;
      if (sentenceQuotaReached) {
        paragraphs.push(joined);
        currentSentences = [];
      }
    }

    if (currentSentences.length) {
      paragraphs.push(currentSentences.join(" "));
    }

    return paragraphs.join("\n\n");
  };

  const applyParagraphStructure = (input: string): string => {
    if (!input.trim().length) return input.trim();

    const lines = input.split(/\r?\n/);
    let suggestedActionsIndex = -1;

    for (let index = 0; index < lines.length; index++) {
      const normalized = normalizeHeaderValue(lines[index]);
      if (normalized === "suggested actions") {
        suggestedActionsIndex = index;
        break;
      }
    }

    const bodyLines =
      suggestedActionsIndex === -1
        ? lines
        : lines.slice(0, suggestedActionsIndex);
    const footerLines =
      suggestedActionsIndex === -1 ? [] : lines.slice(suggestedActionsIndex);

    const body = bodyLines.join("\n").trim();
    const formattedBody = formatBodyWithParagraphs(body);
    const footer = footerLines.join("\n").trim();

    if (!footer.length) {
      return formattedBody;
    }
    if (!formattedBody.length) {
      return footer;
    }
    return `${formattedBody}\n\n${footer}`;
  };

  const ROUTINE_KEYWORDS = [
    "routine",
    "regimen",
    "lineup",
    "ritual",
    "step-by-step",
    "steps",
    "morning routine",
    "evening routine",
    "am routine",
    "pm routine",
    "night routine",
    "daytime routine",
    "nighttime routine",
    "full routine",
    "entire routine",
    "complete routine",
    "skin routine",
  ];

  const SWAP_KEYWORDS = [
    "swap",
    "replace",
    "switch",
    "substitute",
    "update",
    "alternate",
    "alternative",
  ];

  const inferCategoryFromText = (
    text: string | undefined
  ): string | undefined => {
    if (!text) return undefined;
    for (const entry of CATEGORY_KEYWORD_MAP) {
      if (entry.patterns.some((pattern) => pattern.test(text))) {
        return entry.category;
      }
    }
    return undefined;
  };

  const extractMentionedCategories = (
    text: string | undefined
  ): Set<string> => {
    if (!text) return new Set();
    const matches = new Set<string>();
    for (const entry of CATEGORY_KEYWORD_MAP) {
      if (entry.patterns.some((pattern) => pattern.test(text))) {
        matches.add(entry.category);
      }
    }
    return matches;
  };

  const shouldAllowRecommendRoutine = (
    userText: string | undefined
  ): boolean => {
    if (!userText) return true;
    const lower = userText.toLowerCase();
    if (ROUTINE_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      return true;
    }
    if (SWAP_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      return true;
    }
    const mentionedCategories = extractMentionedCategories(userText);
    if (mentionedCategories.size >= 2) {
      return true;
    }
    if (mentionedCategories.size === 1) {
      return false;
    }
    return true;
  };

  const isCategoryMentionedInText = (
    category: string | undefined,
    text: string | undefined
  ): boolean => {
    if (!category || !text) return false;
    const entry = CATEGORY_KEYWORD_MAP.find(
      (candidate) => candidate.category === category
    );
    if (!entry) return false;
    return entry.patterns.some((pattern) => pattern.test(text));
  };

  const normalizeBenefitSlug = (value: string): string | undefined => {
    if (typeof value !== "string") return undefined;
    const normalized = value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return normalized.length ? normalized : undefined;
  };

  const tokenizeDescriptor = (value: string): string[] =>
    value
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

  const normalizeBritishToAmerican = (input: string): string => {
    if (typeof input !== "string" || !input.length) return input;
    const BRITISH_TO_AMERICAN_MAP: Record<string, string> = {
      moisturising: "moisturizing",
      moisturise: "moisturize",
      moisturiser: "moisturizer",
      moisturisers: "moisturizers",
      favourite: "favorite",
      favourites: "favorites",
      colour: "color",
      colours: "colors",
      flavour: "flavor",
      flavours: "flavors",
      centre: "center",
      centres: "centers",
      defence: "defense",
      catalogue: "catalog",
    };

    const toTitleCaseWord = (word: string): string =>
      word
        .split(/([\s-])/)
        .map((segment) => {
          if (!segment || !/[a-zA-Z]/.test(segment)) return segment;
          return (
            segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
          );
        })
        .join("");

    return input.replace(/\b([a-z][a-z']*)\b/gi, (match) => {
      const lower = match.toLowerCase();
      const replacement = BRITISH_TO_AMERICAN_MAP[lower];
      if (!replacement) return match;
      if (match === lower) return replacement;
      if (match === lower.toUpperCase()) return replacement.toUpperCase();
      if (match[0].toUpperCase() === match[0])
        return toTitleCaseWord(replacement);
      return replacement;
    });
  };

  let lastProductSelection: ProductCandidate[] = [];
  let lastStreamedProductsSignature: string | null = null;
  let lastStreamedRoutineSignature: string | null = null;
  let lastStreamedSummarySignature: string | null = null;

  let routineSummaryParts: ReplySummary | null = null;
  let productSummaryParts: ReplySummary | null = null;
  let combinedSummary: ReplySummary | null = null;
  let startSkinTypeQuiz = false;
  let terminateAfterTool = false;
  let silentResponseAttempts = 0;
  const MAX_SILENT_RESPONSES = 2;
  const knownProductIds = new Set<string>();
  const productSizesById = new Map<string, Set<string>>();
  const sizeToProductMap = new Map<string, Set<string>>();
  const knownSizeIds = new Set<string>();
  const productSizeDetailsById = new Map<
    string,
    Array<{
      sizeId: string;
      label?: string;
      sizeText?: string;
      unit?: string;
      sizeValue?: number;
    }>
  >();
  let pendingAddToCart = false;
  let pendingAddToCartReminderSent = false;

  const extractString = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  };

  const registerSizeForProduct = (
    productId: string,
    sizeId: string,
    meta?: {
      label?: string;
      sizeText?: string;
      unit?: string;
      sizeValue?: number;
    }
  ) => {
    if (!productId || !sizeId) return;
    if (sizeId === "[object Object]") return;
    let productSizes = productSizesById.get(productId);
    if (!productSizes) {
      productSizes = new Set<string>();
      productSizesById.set(productId, productSizes);
    }
    productSizes.add(sizeId);
    knownSizeIds.add(sizeId);
    const linkedProducts = sizeToProductMap.get(sizeId) ?? new Set<string>();
    linkedProducts.add(productId);
    sizeToProductMap.set(sizeId, linkedProducts);
    const details = productSizeDetailsById.get(productId) ?? [];
    const existingDetail = details.find((entry) => entry.sizeId === sizeId);
    const mergedDetail = {
      sizeId,
      ...(existingDetail ?? {}),
      ...(meta ?? {}),
    };
    if (!existingDetail) {
      details.push(mergedDetail);
    } else {
      Object.assign(existingDetail, meta ?? {});
    }
    productSizeDetailsById.set(
      productId,
      details as Array<{
        sizeId: string;
        label?: string;
        sizeText?: string;
        unit?: string;
        sizeValue?: number;
      }>
    );
  };

  const registerProductCandidate = (
    candidate: ProductCandidate | UnknownRecord | null | undefined
  ): void => {
    if (!candidate || typeof candidate !== "object") return;
    const record = candidate as UnknownRecord;
    const productSource =
      record.product && typeof record.product === "object"
        ? (record.product as UnknownRecord)
        : record;

    const resolvedId =
      extractString(productSource.id) ??
      extractString(productSource._id) ??
      extractString(productSource.productId) ??
      extractString(record.productId) ??
      extractString(productSource.slug) ??
      extractString(record.slug);
    if (!resolvedId) return;

    knownProductIds.add(resolvedId);

    const sizeEntries = Array.isArray(productSource.sizes)
      ? (productSource.sizes as unknown[])
      : [];

    sizeEntries.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const sizeRecord = entry as UnknownRecord;
      const sizeId =
        extractString(sizeRecord.id) ??
        extractString(sizeRecord._id) ??
        extractString(sizeRecord.sizeId) ??
        extractString(sizeRecord.value);
      if (sizeId) {
        const sizeLabel =
          extractString(sizeRecord.label) ?? extractString(sizeRecord.name);
        const explicitSizeText = extractString(sizeRecord.sizeText);
        const unit = extractString(sizeRecord.unit);
        let sizeValue: number | undefined;
        if (
          typeof sizeRecord.size === "number" &&
          Number.isFinite(sizeRecord.size)
        ) {
          sizeValue = sizeRecord.size;
        } else if (typeof sizeRecord.size === "string") {
          const numeric = Number(
            sizeRecord.size.trim().replace(/[^0-9.]/g, "")
          );
          if (Number.isFinite(numeric)) {
            sizeValue = numeric;
          }
        }
        const derivedSizeText = (() => {
          if (explicitSizeText) return explicitSizeText;
          if (typeof sizeRecord.size === "string") {
            return sizeRecord.size.trim();
          }
          if (typeof sizeRecord.size === "number" && unit) {
            return `${sizeRecord.size} ${unit}`;
          }
          if (typeof sizeRecord.size === "number") {
            return `${sizeRecord.size}`;
          }
          return undefined;
        })();
        registerSizeForProduct(resolvedId, sizeId, {
          label: sizeLabel ?? derivedSizeText,
          sizeText: derivedSizeText,
          unit,
          sizeValue,
        });
      }
    });
  };

  const registerProductCollection = (
    products: readonly ProductCandidate[]
  ): void => {
    products.forEach((product) => registerProductCandidate(product));
  };

  const ANY_SIZE_PATTERNS = [
    /\b(any|either|whatever|whichever)\s+size\b/i,
    /\bno\s+preference\b/i,
    /\bchoose\s+(?:any|either)\b/i,
    /\byou\s+pick\s+(?:the\s+)?size\b/i,
    /\bsurprise\s+me\b/i,
  ];

  const userAllowsAnySize = (text: string | undefined): boolean => {
    if (!text) return false;
    return ANY_SIZE_PATTERNS.some((pattern) => pattern.test(text));
  };

  const userMentionsSize = (
    userText: string | undefined,
    sizeDetail:
      | {
          sizeId: string;
          label?: string;
          sizeText?: string;
          unit?: string;
          sizeValue?: number;
        }
      | undefined
  ): boolean => {
    if (!userText || !sizeDetail) return false;
    const normalized = userText.toLowerCase();
    const candidates: string[] = [];
    if (sizeDetail.label) candidates.push(sizeDetail.label.toLowerCase());
    if (sizeDetail.sizeText) candidates.push(sizeDetail.sizeText.toLowerCase());
    if (sizeDetail.unit && sizeDetail.sizeValue) {
      const numeric = sizeDetail.sizeValue;
      const unit = sizeDetail.unit.toLowerCase();
      const compact = `${numeric}${unit}`;
      const spaced = `${numeric} ${unit}`;
      candidates.push(compact);
      candidates.push(spaced);
    }
    if (sizeDetail.sizeValue && !Number.isNaN(sizeDetail.sizeValue)) {
      candidates.push(String(sizeDetail.sizeValue));
    }
    return candidates.some((candidate) => {
      if (!candidate) return false;
      return normalized.includes(candidate);
    });
  };

  const hydrateKnownCatalogFromHistory = (): void => {
    for (const entry of messages) {
      if (entry.role !== "tool") continue;
      if (typeof entry.content !== "string" || !entry.content.trim().length)
        continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(entry.content);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object") continue;
      const payload = parsed as Record<string, unknown>;
      if (Array.isArray(payload.products)) {
        registerProductCollection(payload.products as ProductCandidate[]);
      }
      if (
        payload.product &&
        typeof payload.product === "object" &&
        payload.product !== null
      ) {
        registerProductCandidate(payload.product as ProductCandidate);
      }
      if (payload.productsMap && typeof payload.productsMap === "object") {
        const values = Object.values(
          payload.productsMap as Record<string, unknown>
        );
        registerProductCollection(values as ProductCandidate[]);
      }
      const routinePayload =
        payload.routine && typeof payload.routine === "object"
          ? (payload.routine as Record<string, unknown>)
          : null;
      const routineSteps = Array.isArray(routinePayload?.steps)
        ? (routinePayload?.steps as unknown[])
        : [];
      routineSteps.forEach((step) => {
        if (!step || typeof step !== "object") return;
        const stepRecord = step as Record<string, unknown>;
        if (
          stepRecord.product &&
          typeof stepRecord.product === "object" &&
          stepRecord.product !== null
        ) {
          registerProductCandidate(stepRecord.product as ProductCandidate);
        }
        const alternatives = Array.isArray(stepRecord.alternatives)
          ? (stepRecord.alternatives as unknown[])
          : [];
        alternatives.forEach((alt) => {
          if (!alt || typeof alt !== "object") return;
          const altRecord = alt as Record<string, unknown>;
          if (
            altRecord.product &&
            typeof altRecord.product === "object" &&
            altRecord.product !== null
          ) {
            registerProductCandidate(altRecord.product as ProductCandidate);
          }
        });
      });
    }
  };

  // console.log(chatMessages, "This is conversation history");

  // messages.push({ role: "user", content: userMessage });

  hydrateKnownCatalogFromHistory();

  const latestUserMessageIndex = (() => {
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index]?.role === "user") {
        return index;
      }
    }
    return -1;
  })();

  const latestUserMessageContent =
    latestUserMessageIndex >= 0 &&
    typeof messages[latestUserMessageIndex]?.content === "string"
      ? (messages[latestUserMessageIndex].content as string)
      : undefined;

  const lastEmptySearch = (() => {
    for (let index = messages.length - 1; index >= 0; index--) {
      const entry = messages[index];
      if (entry?.role !== "tool") continue;
      const toolName =
        typeof entry.tool_name === "string" && entry.tool_name.length
          ? entry.tool_name
          : undefined;
      if (toolName !== "searchProductsByQuery") continue;
      if (typeof entry.content !== "string" || !entry.content.trim().length) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(entry.content);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object") continue;
      const payload = parsed as Record<string, unknown>;
      const productCounts: number[] = [];
      if (Array.isArray(payload.products)) {
        productCounts.push(payload.products.length);
      }
      const resultsEntry = payload["results"];
      if (Array.isArray(resultsEntry)) {
        productCounts.push(resultsEntry.length);
      }
      const productsMap =
        payload.productsMap && typeof payload.productsMap === "object"
          ? (payload.productsMap as Record<string, unknown>)
          : null;
      const mapIsEmpty =
        productsMap !== null && Object.keys(productsMap).length === 0;
      const totalCount =
        typeof payload.totalCount === "number" ? payload.totalCount : undefined;
      const zeroFromCounts =
        productCounts.length > 0
          ? productCounts.every((count) => count === 0)
          : false;
      const zeroResults =
        payload.success === false ||
        Boolean(payload.error) ||
        zeroFromCounts ||
        mapIsEmpty ||
        totalCount === 0;
      return {
        index,
        zeroResults,
      };
    }
    return null;
  })();

  if (
    lastEmptySearch &&
    lastEmptySearch.zeroResults &&
    latestUserMessageIndex > lastEmptySearch.index
  ) {
    chatMessages.push({
      role: "developer",
      content:
        "The last product search returned no matches. Assume the user may have corrected their request and run a fresh lookup in this turn instead of reusing that empty result.",
    });
  }

  const hasSurveyResults = messages.some(
    (msg) =>
      msg.role === "system" &&
      typeof msg.content === "string" &&
      msg.content.includes("Skin-type survey completed.")
  );
  const hasPostQuizSystemPrompt = messages.some(
    (msg) =>
      msg.role === "system" &&
      typeof msg.content === "string" &&
      msg.content.includes("Skin Analysis Summary")
  );
  const hasRecentQuizCall = messages.some(
    (msg) => msg.role === "tool" && msg.tool_name === "startSkinTypeSurvey"
  );

  const streamCompletion = async (
    forceFinal: boolean,
    _extraInputItems: any[] = []
  ): Promise<{
    content: string;
    toolCalls: Array<{
      id: string;
      call_id: string;
      name: string;
      arguments: string;
    }>;
  }> => {
    const toolCallsById = new Map<
      string,
      { id: string; call_id: string; name: string; arguments: string }
    >();
    const seenFunctionSignatures = new Set<string>();
    const emittedPartText = new Map<string, string>();

    const systemInstructionParts: string[] = [];
    const developerInstructionParts: string[] = [];
    const hasQuizSummaryInstruction = hasSurveyResults;

    if (hasSurveyResults) {
      developerInstructionParts.push(
        "You have the completed skin-type survey answers. Infer the user's most likely skin type and primary concerns directly from those answers, summarize them clearly, and do not restart the survey unless the user explicitly requests it."
      );
    }
    developerInstructionParts.push(
      "When the user references multiple distinct product names or SKUs in the same turn, issue separate `searchProductsByQuery` tool calls—one per product—rather than combining their names into a single query."
    );
    developerInstructionParts.push(
      "If the user asks for product specifics, first look at the most recent tool outputs stored in the conversation. Only call `getProduct` when those stored details are missing or incomplete."
    );
    developerInstructionParts.push(
      "Never conclude that a product is unavailable until you've run a fresh tool call (`searchProductsByQuery` or `getProduct`) in this turn. Do not rely on memory or prior messages to assume stock status."
    );
    developerInstructionParts.push(
      [
        "When you have detailed data for a single product, present it in the following structure:",
        "1) Start with a heading like '✨ {Product Name}'",
        "2) Follow with short bullet points using bold labels (Overview, Key Ingredients, Sizes, Skin Types, Usage, Highlights as relevant)",
        "3) Keep each bullet to one sentence so the layout stays scannable.",
      ].join(" ")
    );
    developerInstructionParts.push(
      "When a user asks for detailed information about a product (phrases like 'more info', 'tell me about', 'show the sizes/price/ingredients'), respond with a structured breakdown that clearly lists the product name, key actives, sizes with prices, notable benefits, and any usage notes before moving on to suggestions."
    );
    developerInstructionParts.push(
      [
        "After providing product details or recommendations, add a natural conversational follow-up that encourages exploring complementary products.",
        "Examples: 'Let me know if you want complementary product suggestions!', 'I can also suggest toners or moisturizers to complement this cleanser!', 'Want me to find a matching serum or sunscreen?', 'If you'd like, I can recommend products that pair well with this!'",
        "Keep it friendly and helpful, not pushy.",
        "Focus on products that naturally work together in a routine (cleanser + toner + moisturizer, serum + sunscreen, etc.).",
        "This is separate from the 'Suggested actions' section and should feel like a natural conversation.",
      ].join(" ")
    );
    developerInstructionParts.push(
      "When an `addToCart` tool call succeeds, explicitly confirm in your final reply exactly what you added (include product name and size/variant) so the user hears the confirmation. If the tool fails, explain the issue and next steps instead of claiming it was added."
    );
    developerInstructionParts.push(
      "When a product has multiple sizes or variants, list every option with its size/variant label and price before asking the user to choose—never ask for a selection without showing those details."
    );
    developerInstructionParts.push(
      "Format size/price choices as a numbered list (1., 2., …) and include the currency symbol with thousands separators whenever a `currency` field is provided (e.g., '₦27,760.50'). If the currency is missing, spell out the currency code (e.g., '27760.50 NGN')."
    );
    developerInstructionParts.push(
      "Only place true ingredient names (individual compounds such as 'niacinamide', 'salicylic acid', 'avobenzone') inside `ingredientQueries`. If a descriptor sounds like a product type or outcome (e.g., 'chemical sunscreen', 'gentle cleanser', 'hydrating formula'), move it to `categoryQuery` or `benefits` instead and keep `ingredientQueries` empty."
    );
    developerInstructionParts.push(
      "Before calling any product tool, sanity-check each argument: keep `categoryQuery` to canonical product nouns, `brandQuery` to real brand names, `benefits` to outcome descriptors, `skinTypes/skinConcerns` to mapped canon values, and drop any leftovers you can't classify. It's better to omit a field than pass a vague phrase to the wrong slot."
    );
    developerInstructionParts.push(
      "Do not mention internal tooling, function calls, user IDs, or implementation details in user-facing replies—keep explanations strictly user-facing."
    );
    developerInstructionParts.push(
      "Never include user identifiers (userId, customerId, email, etc.) in any product-tool call; tools already infer the user context."
    );
    developerInstructionParts.push(
      "Do not infer skin concerns from skin tone, ethnicity, or broad descriptors. Only set `skinConcerns` when the user explicitly names a concern like acne, hyperpigmentation, redness, etc."
    );
    developerInstructionParts.push(
      "Default to the following response structure: start with a concise confirmation sentence, then present the main points as a short bulleted or numbered list (each entry on its own line) before any closing guidance. Keep the list items focused and easy to scan."
    );
    developerInstructionParts.push(
      "If you make a correction or adjust your answer, acknowledge it directly without apologising—avoid phrases like 'sorry' or 'I apologize'."
    );
    developerInstructionParts.push(
      "Even for brief user messages (thanks, ok, nice, etc.), always include at least one short acknowledgment sentence before the Suggested actions block."
    );
    developerInstructionParts.push(
      "End every reply with the heading 'Suggested actions' followed by exactly three numbered suggestions—never omit this section."
    );
    developerInstructionParts.push(
      "When the user asks for a comparison (look for words like 'compare', 'versus', 'vs', or multiple products mentioned together), open with a short heading using an emoji (e.g., '✨ Here's a comparison of ...'). Then present the products as a numbered list where each item starts with the product name in bold followed by a concise summary, and underneath include indented sub-bullets for highlights like 'Best for', 'Texture', 'Key actives', and 'When to use'."
    );
    developerInstructionParts.push(
      "If a product search returns no results, state it plainly as 'I couldn't find any matching items in stock right now.' before moving on to guidance or suggestions."
    );
    developerInstructionParts.push(
      "When the user asks for more options (e.g., 'show me more', 'more serums', 'next page') after you've already surfaced products, call `searchProductsByQuery` again with the same filters and include an `excludeProductIds` array containing every productId (or slug) you've shown so far so the user only sees fresh results."
    );
    developerInstructionParts.push(
      "If the user is asking for ingredient comparisons, mechanisms, pros/cons, or other informational guidance that doesn't explicitly request product recommendations or inventory, answer directly from your expertise without calling product tools. Only reach for tools when they ask you to find, show, compare, or act on specific products."
    );
    if (
      !hasQuizSummaryInstruction &&
      !hasPostQuizSystemPrompt &&
      !hasRecentQuizCall
    ) {
      developerInstructionParts.push(
        "If the user explicitly commands 'start the skin quiz' (phrased as an imperative), immediately call `startSkinTypeSurvey` with empty arguments and do not send any assistant prose in that turn. If the user is asking *whether* they should take the quiz or wants to understand their skin type, explain that SkinBuddy can run a quick survey and invite them to confirm before starting it."
      );
    }
    const contents: Array<Record<string, unknown>> = [];
    let capturedPersistentDeveloper = false;

    for (const msg of chatMessages) {
      if (msg.role === "system") {
        if (typeof msg.content === "string" && msg.content.trim().length) {
          systemInstructionParts.push(msg.content.trim());
        }
        continue;
      }

      if (msg.role === "developer") {
        if (typeof msg.content === "string" && msg.content.trim().length) {
          if (!capturedPersistentDeveloper) {
            developerInstructionParts.push(msg.content.trim());
            capturedPersistentDeveloper = true;
          } else {
            contents.push({
              role: "user",
              parts: [{ text: msg.content }],
            });
          }
        }
        continue;
      }

      if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
        continue;
      }

      if (msg.role === "assistant") {
        if (typeof msg.content === "string" && msg.content.trim().length) {
          contents.push({
            role: "model",
            parts: [{ text: msg.content }],
          });
        }
        continue;
      }

      if (msg.role === "tool") {
        const toolName =
          typeof msg.tool_name === "string" && msg.tool_name.length
            ? msg.tool_name
            : "tool";
        let parsed: unknown;
        try {
          parsed = JSON.parse(msg.content ?? "{}");
        } catch {
          parsed = { raw: msg.content ?? "" };
        }
        const responsePayload =
          parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : { value: parsed };
        const functionResponse: Record<string, unknown> = {
          name: toolName,
          response: responsePayload,
        };
        if (msg.tool_call_id && typeof msg.tool_call_id === "string") {
          functionResponse.id = msg.tool_call_id;
        }
        contents.push({
          role: "function",
          parts: [{ functionResponse }],
        });
      }
    }

    const systemInstruction =
      systemInstructionParts.length > 0 || developerInstructionParts.length > 0
        ? {
            role: "system",
            parts: [
              {
                text: [
                  ...systemInstructionParts,
                  ...developerInstructionParts,
                ].join("\n\n"),
              },
            ],
          }
        : undefined;

    if (!contents.length) {
      contents.push({
        role: "user",
        parts: [{ text: "" }],
      });
    }

    const requestConfig: Record<string, unknown> = {
      temperature,
    };
    if (systemInstruction) {
      requestConfig.systemInstruction = systemInstruction;
    }
    if (useTools && geminiTools.length) {
      requestConfig.tools = [
        {
          functionDeclarations: geminiTools,
        },
      ];
      requestConfig.toolConfig = {
        functionCallingConfig: {
          mode: forceFinal ? "NONE" : "AUTO",
        },
      };
    }

    const requestPayload = {
      model,
      contents,
      config: requestConfig,
    } as Record<string, unknown>;

    const extractText = (response: any): string => {
      if (!response) return "";
      if (typeof response.text === "string" && response.text.length) {
        return response.text;
      }
      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) return "";
      return candidate.content.parts
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .join("");
    };

    const recordFunctionCalls = (response: any) => {
      if (!response?.candidates) return;
      for (const candidate of response.candidates) {
        const parts = candidate?.content?.parts;
        if (!Array.isArray(parts)) continue;
        for (const part of parts) {
          const call = part?.functionCall;
          if (!call || typeof call !== "object") continue;
          const callName =
            typeof call.name === "string" && call.name.length
              ? call.name
              : "unknown_function";
          const rawArgs = call.args ?? {};
          const cleanedArgs = { ...rawArgs };
          if (cleanedArgs && typeof cleanedArgs === "object") {
            if ("SPF" in cleanedArgs && !("spf" in cleanedArgs)) {
              cleanedArgs.spf = cleanedArgs["SPF"];
            }
            delete (cleanedArgs as Record<string, unknown>)["SPF"];
          }
          const serializedArgs = JSON.stringify(cleanedArgs ?? {});
          const explicitId =
            typeof call.id === "string" && call.id.length ? call.id : null;
          if (explicitId && toolCallsById.has(explicitId)) continue;
          const signature =
            serializedArgs && serializedArgs.length
              ? `${callName}:${serializedArgs}`
              : callName;
          if (!explicitId && seenFunctionSignatures.has(signature)) continue;
          const callId =
            explicitId ?? `fc_${toolCallsById.size + 1}_${Date.now()}`;
          if (!explicitId) {
            seenFunctionSignatures.add(signature);
          }
          toolCallsById.set(callId, {
            id: callId,
            call_id: callId,
            name: callName,
            arguments: serializedArgs,
          });
        }
      }
    };

    const streamResult = await geminiClient.models.generateContentStream(
      requestPayload as any
    );
    const streamIterable = (() => {
      const candidate = streamResult as any;
      if (candidate && typeof candidate[Symbol.asyncIterator] === "function") {
        return candidate as AsyncGenerator<any>;
      }
      if (
        candidate &&
        candidate.stream &&
        typeof candidate.stream[Symbol.asyncIterator] === "function"
      ) {
        return candidate.stream as AsyncGenerator<any>;
      }
      return undefined;
    })();
    let contentBuffer = "";
    let finalResponse: any = null;

    const processChunk = async (chunk: any) => {
      if (!chunk) return;
      try {
        const candidates = Array.isArray(chunk.candidates)
          ? chunk.candidates
          : [];
        for (
          let candidateIndex = 0;
          candidateIndex < candidates.length;
          candidateIndex++
        ) {
          const candidate = candidates[candidateIndex];
          const parts = Array.isArray(candidate?.content?.parts)
            ? candidate.content.parts
            : [];
          for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex];
            if (typeof part?.text === "string" && part.text.length) {
              const key = `${candidateIndex}:${partIndex}`;
              const previous = emittedPartText.get(key) ?? "";
              if (part.text.startsWith(previous)) {
                const delta = part.text.slice(previous.length);
                if (delta.length) {
                  contentBuffer += delta;
                  emittedPartText.set(key, part.text);
                  if (onToken) await onToken(delta);
                }
              } else {
                emittedPartText.set(key, part.text);
                contentBuffer += part.text;
                if (onToken) await onToken(part.text);
              }
            }
          }
        }
        recordFunctionCalls(chunk);
      } catch (error) {
        console.error("Gemini stream chunk processing failed:", error);
      }
    };

    if (streamIterable) {
      for await (const chunk of streamIterable) {
        finalResponse = chunk;
        await processChunk(chunk);
      }
    }

    const resolvedFinalResponse =
      finalResponse ??
      (await (async () => {
        const maybePromise = (streamResult as any)?.response;
        if (maybePromise && typeof maybePromise.then === "function") {
          try {
            return await maybePromise;
          } catch (error) {
            console.error("Gemini final response retrieval failed:", error);
            return null;
          }
        }
        return null;
      })());

    if (!finalResponse && resolvedFinalResponse) {
      await processChunk(resolvedFinalResponse);
    }

    const finalText =
      contentBuffer.length > 0
        ? contentBuffer
        : extractText(resolvedFinalResponse);

    const promptFeedback = finalResponse?.promptFeedback;
    if (
      (!finalResponse?.candidates || !finalResponse.candidates.length) &&
      promptFeedback?.blockReason
    ) {
      throw new Error(
        `Gemini blocked the response: ${promptFeedback.blockReason}`
      );
    }

    const toolCalls = Array.from(toolCallsById.values());

    if (toolCalls.length) {
      chatMessages.push({ role: "assistant", content: "" });
    } else {
      chatMessages.push({ role: "assistant", content: finalText });
    }

    return { content: finalText, toolCalls };
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
      combinedSummary = {
        headline:
          mergedHeadline.length > 160
            ? `${mergedHeadline.slice(0, 157)}...`
            : mergedHeadline,
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

  console.log("calling Gemini");

  // main
  let pendingExtraInputItems: any[] = [];
  while (true) {
    console.log("This is how many times we have called Gemini " + (rounds + 1));
    const { content, toolCalls } = await streamCompletion(
      rounds >= maxToolRounds,
      pendingExtraInputItems
    );
    // clear after consumption
    pendingExtraInputItems = [];

    const contentText =
      typeof content === "string" ? content : String(content ?? "");
    const contentHasText = contentText.trim().length > 0;

    if (!contentHasText && (!toolCalls || toolCalls.length === 0)) {
      silentResponseAttempts += 1;
      if (silentResponseAttempts >= MAX_SILENT_RESPONSES) {
        throw new Error("Gemini returned an empty response multiple times.");
      }
      chatMessages.push({
        role: "developer",
        content:
          "The previous round produced no assistant reply and no tool calls. Provide a substantive response now—either call the correct tool to carry out the user's request or draft the user-facing answer directly. Never leave the turn empty.",
      });
      continue;
    }
    silentResponseAttempts = 0;

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

      // Execute tool calls and log outputs into the transcript for the next round
      let toolExecutionIndex = 0;
      for (const toolCall of toolCalls) {
        const callId =
          toolCall.call_id ||
          toolCall.id ||
          `fc_${rounds}_${toolExecutionIndex++}_${Date.now()}`;
        toolCall.call_id = callId;
        toolCall.id = callId;

        if (hasSurveyResults && toolCall.name === "startSkinTypeSurvey") {
          console.log(
            "Skipping redundant startSkinTypeSurvey call after survey completion"
          );
          continue;
        }

        if (
          toolCall.name === "recommendRoutine" &&
          !shouldAllowRecommendRoutine(latestUserMessageContent)
        ) {
          console.log(
            "Blocking recommendRoutine call in favour of searchProductsByQuery"
          );
          const serializedArgs =
            typeof toolCall.arguments === "string"
              ? toolCall.arguments
              : JSON.stringify(toolCall.arguments ?? {});
          chatMessages.push({
            role: "tool",
            tool_call_id: callId,
            tool_name: toolCall.name,
            tool_arguments: serializedArgs,
            content: JSON.stringify({
              error: true,
              message:
                "recommendRoutine is only for multi-step routines or step swaps. Use searchProductsByQuery for single-product requests.",
            }),
          });
          pendingExtraInputItems.push({
            role: "tool",
            tool_name: toolCall.name,
            tool_call_id: callId,
            content: JSON.stringify({
              error: true,
              message:
                "Routine tool skipped: call searchProductsByQuery to recommend an individual product.",
            }),
          });
          continue;
        }

        const toolDef = getToolByName(toolCall.name);
        if (!toolDef) {
          console.error(`Unknown tool: ${toolCall.name}`);
          chatMessages.push({
            role: "tool",
            tool_call_id: callId,
            tool_name: toolCall.name,
            tool_arguments: "{}",
            content: JSON.stringify({
              error: true,
              message: `Unknown tool: ${toolCall.name}`,
            }),
          });
          continue;
        }

        let serializedArgsForHistory = "{}";
        let originalArgsObject: unknown = {};

        try {
          const rawArgs: unknown =
            typeof toolCall.arguments === "string"
              ? JSON.parse(toolCall.arguments || "{}")
              : (toolCall.arguments ?? {});
          originalArgsObject = rawArgs;
          const validatedArgs = toolDef.schema.parse(rawArgs);
          let searchNameLockedToExact = false;
          if (toolCall.name === "addToCart") {
            const argsRecord =
              validatedArgs && typeof validatedArgs === "object"
                ? (validatedArgs as Record<string, unknown>)
                : {};
            const productId =
              typeof argsRecord.productId === "string"
                ? argsRecord.productId.trim()
                : "";
            const sizeId =
              typeof argsRecord.sizeId === "string"
                ? argsRecord.sizeId.trim()
                : "";
            const sizeMatchesProduct =
              productId.length > 0 &&
              sizeId.length > 0 &&
              (productSizesById.get(productId)?.has(sizeId) ??
                sizeToProductMap.get(sizeId)?.has(productId) ??
                false);
            const sizeIsKnown = sizeId.length > 0 && knownSizeIds.has(sizeId);
            const productSizeDetails =
              productId.length > 0
                ? (productSizeDetailsById.get(productId) ?? [])
                : [];
            const multipleSizes = productSizeDetails.length > 1;
            const userTextRaw =
              typeof latestUserMessageContent === "string"
                ? latestUserMessageContent
                : "";
            const allowAnySize = userAllowsAnySize(userTextRaw);
            const sizeDetail = productSizeDetails.find(
              (detail) => detail.sizeId === sizeId
            );
            const mentionedSizeIds = productSizeDetails
              .filter((detail) => userMentionsSize(userTextRaw, detail))
              .map((detail) => detail.sizeId);
            const userSpecifiedDifferentSize =
              mentionedSizeIds.length > 0 &&
              sizeId.length > 0 &&
              !mentionedSizeIds.includes(sizeId);
            const userMentionedSelectedSize = userMentionsSize(
              userTextRaw,
              sizeDetail
            );
            if (!sizeMatchesProduct || !sizeIsKnown) {
              pendingAddToCart = true;
              pendingAddToCartReminderSent = false;
              const serializedArgs =
                typeof toolCall.arguments === "string"
                  ? toolCall.arguments
                  : JSON.stringify(toolCall.arguments ?? {});
              chatMessages.push({
                role: "tool",
                tool_call_id: callId,
                tool_name: toolCall.name,
                tool_arguments: serializedArgs,
                content: JSON.stringify({
                  error: true,
                  message:
                    "addToCart blocked: fetch the product details first to obtain valid productId and sizeId before adding to the cart.",
                }),
              });
              chatMessages.push({
                role: "developer",
                content:
                  "You attempted to call addToCart without verified identifiers. Call searchProductsByQuery or getProduct for the exact item, copy the productId and sizeId from that tool output, and then retry addToCart. Never guess IDs.",
              });
              continue;
            }
            if (
              multipleSizes &&
              !allowAnySize &&
              (!userMentionedSelectedSize || userSpecifiedDifferentSize)
            ) {
              pendingAddToCart = true;
              pendingAddToCartReminderSent = false;
              chatMessages.push({
                role: "developer",
                content:
                  "You tried adding a product with multiple sizes before showing its options. First call an appropriate lookup (searchProductsByQuery, getProduct, or check conversation history) to list the size choices. After presenting the sizes in the reply, ask the user which one they want and only then call addToCart for the selected size.",
              });
              continue;
            }
          }
          let adjustedArgs: unknown = validatedArgs;
          let normalizationSummary: string | null = null;

          if (toolCall.name === "searchProductsByQuery") {
            const argsRecord =
              adjustedArgs && typeof adjustedArgs === "object"
                ? { ...(adjustedArgs as Record<string, unknown>) }
                : {};

            const prefilledCategory =
              typeof argsRecord.categoryQuery === "string"
                ? argsRecord.categoryQuery.trim()
                : "";

            if (!prefilledCategory) {
              const inferredCategory = inferCategoryFromText(
                latestUserMessageContent
              );
              if (inferredCategory) {
                argsRecord.categoryQuery = inferredCategory;
                adjustedArgs = toolDef.schema.parse(argsRecord);
              }
            }

            const resolveCategoryFromInput = (
              input: unknown
            ): string | undefined => {
              if (typeof input !== "string" || !input.trim().length) {
                return undefined;
              }
              return inferCategoryFromText(input);
            };

            const originalCategoryQuery =
              typeof argsRecord.categoryQuery === "string"
                ? argsRecord.categoryQuery
                : undefined;

            const normalizedCategoryFromInput = resolveCategoryFromInput(
              originalCategoryQuery
            );
            if (normalizedCategoryFromInput) {
              argsRecord.categoryQuery = normalizedCategoryFromInput;
            }

            const benefitAccumulator = new Set<string>();
            let bestsellerHintRequested = false;

            const existingBenefitsRaw = Array.isArray(argsRecord.benefits)
              ? argsRecord.benefits.filter(
                  (entry): entry is string => typeof entry === "string"
                )
              : [];

            existingBenefitsRaw.forEach((entry) => {
              const normalized = normalizeBenefitSlug(entry);
              if (normalized) benefitAccumulator.add(normalized);
              if (normalized === "bestseller") {
                bestsellerHintRequested = true;
              }
            });

            const {
              benefits: normalizedExistingBenefits,
              residual: unmatchedExistingBenefits,
            } = mapDescriptorsToBenefits(existingBenefitsRaw);

            normalizedExistingBenefits.forEach((benefit) =>
              benefitAccumulator.add(benefit)
            );

            const addBenefitsFromDescriptors = (
              descriptors: readonly string[]
            ) => {
              descriptors.forEach((descriptor) => {
                const tokens = tokenizeDescriptor(descriptor);
                if (!tokens.length) return;
                const { benefits: tokenBenefits } =
                  mapDescriptorsToBenefits(tokens);
                tokenBenefits.forEach((benefit) =>
                  benefitAccumulator.add(benefit)
                );
              });
            };

            if (typeof originalCategoryQuery === "string") {
              addBenefitsFromDescriptors([originalCategoryQuery]);
            }

            const originalNameQuery =
              typeof argsRecord.nameQuery === "string"
                ? argsRecord.nameQuery.trim()
                : "";
            const normalizedNameQuery =
              normalizeBritishToAmerican(originalNameQuery);
            const nameQueryForSearch = normalizedNameQuery.length
              ? normalizedNameQuery
              : originalNameQuery;

            if (nameQueryForSearch.length) {
              const nameTokens = tokenizeDescriptor(nameQueryForSearch);
              const likelyExactName =
                nameTokens.length >= 3 ||
                (typeof argsRecord.brandQuery === "string" &&
                  argsRecord.brandQuery.trim().length > 0);

              if (likelyExactName) {
                searchNameLockedToExact = true;
                // Preserve the full product name for strict lookups and avoid broad benefit filters.
                argsRecord.nameQuery = nameQueryForSearch;
                if (Array.isArray(argsRecord.benefits)) {
                  delete (argsRecord as Record<string, unknown>).benefits;
                }
              } else if (nameTokens.length) {
                const { benefits: nameBenefits, residual: nameResidual } =
                  mapDescriptorsToBenefits(nameTokens);

                nameBenefits.forEach((benefit) =>
                  benefitAccumulator.add(benefit)
                );

                addBenefitsFromDescriptors([nameQueryForSearch]);

                if (nameResidual.length === 0) {
                  delete argsRecord.nameQuery;
                } else if (nameResidual.length !== nameTokens.length) {
                  argsRecord.nameQuery = nameResidual.join(" ");
                }
              }
            }

            addBenefitsFromDescriptors(unmatchedExistingBenefits);

            const POPULAR_HINT_PATTERNS = [
              /\bpopular\b/i,
              /\bbest\s*sellers?\b/i,
              /\btop\s*(picks|choices|products)\b/i,
              /\btrending\b/i,
            ];

            const userAskedForPopularity = POPULAR_HINT_PATTERNS.some(
              (pattern) =>
                typeof latestUserMessageContent === "string"
                  ? pattern.test(latestUserMessageContent)
                  : false
            );

            let ingredientResidual = Array.isArray(argsRecord.ingredientQueries)
              ? argsRecord.ingredientQueries.filter(
                  (entry): entry is string =>
                    typeof entry === "string" && entry.trim().length > 0
                )
              : [];

            if (ingredientResidual.length) {
              const { benefits: ingredientBenefits, residual } =
                mapDescriptorsToBenefits(ingredientResidual);

              ingredientBenefits.forEach((benefit) =>
                benefitAccumulator.add(benefit)
              );

              ingredientResidual = residual;

              addBenefitsFromDescriptors(ingredientResidual);
            }

            let mergedBenefits = Array.from(benefitAccumulator);
            if (
              mergedBenefits.length === 0 &&
              typeof latestUserMessageContent === "string" &&
              !searchNameLockedToExact
            ) {
              const userTokens = tokenizeDescriptor(latestUserMessageContent);
              const { benefits: userBenefits } = mapDescriptorsToBenefits([
                latestUserMessageContent,
                ...userTokens,
              ]);
              userBenefits.forEach((benefit) =>
                benefitAccumulator.add(benefit)
              );
              mergedBenefits = Array.from(benefitAccumulator);
            }

            if (mergedBenefits.length) {
              const filteredBenefits = mergedBenefits.filter(
                (benefit) => benefit !== "bestseller"
              );
              mergedBenefits = filteredBenefits.length
                ? filteredBenefits
                : mergedBenefits;
            }

            if (mergedBenefits.length) {
              argsRecord.benefits = mergedBenefits;
            } else {
              delete argsRecord.benefits;
            }

            if (!bestsellerHintRequested && userAskedForPopularity) {
              delete (argsRecord as Record<string, unknown>).benefits;
            }

            let finalCategoryCandidate =
              typeof argsRecord.categoryQuery === "string"
                ? argsRecord.categoryQuery.trim()
                : undefined;

            const categoryMentionedByUser = isCategoryMentionedInText(
              finalCategoryCandidate,
              latestUserMessageContent
            );
            const categoryMentionedInName = isCategoryMentionedInText(
              finalCategoryCandidate,
              nameQueryForSearch
            );

            if (
              finalCategoryCandidate &&
              !categoryMentionedByUser &&
              !categoryMentionedInName
            ) {
              delete argsRecord.categoryQuery;
              finalCategoryCandidate = undefined;
            }

            argsRecord.ingredientQueries = ingredientResidual.length
              ? Array.from(new Set(ingredientResidual))
              : undefined;

            adjustedArgs = toolDef.schema.parse(argsRecord);

            const originalSnapshot =
              validatedArgs && typeof validatedArgs === "object"
                ? (validatedArgs as Record<string, unknown>)
                : {};
            const adjustedSnapshot =
              adjustedArgs && typeof adjustedArgs === "object"
                ? (adjustedArgs as Record<string, unknown>)
                : {};

            if (
              adjustedSnapshot.skinConcerns &&
              Array.isArray(adjustedSnapshot.skinConcerns)
            ) {
              const userLower =
                typeof latestUserMessageContent === "string"
                  ? latestUserMessageContent.toLowerCase()
                  : "";
              const filteredConcerns = adjustedSnapshot.skinConcerns.filter(
                (value) =>
                  typeof value === "string" &&
                  (userLower.includes(value.toLowerCase()) ||
                    userLower.includes(
                      value.replace(/[-_]/g, " ").toLowerCase()
                    ))
              );
              if (filteredConcerns.length) {
                (adjustedArgs as Record<string, unknown>).skinConcerns =
                  filteredConcerns;
              } else {
                delete (adjustedArgs as Record<string, unknown>).skinConcerns;
              }
            }

            const extractString = (value: unknown): string | undefined => {
              if (typeof value !== "string") return undefined;
              const trimmed = value.trim();
              return trimmed.length ? trimmed : undefined;
            };

            const normalizeStringArray = (value: unknown): string[] =>
              Array.isArray(value)
                ? value
                    .map((entry) =>
                      typeof entry === "string" ? entry.trim() : ""
                    )
                    .filter((entry) => entry.length > 0)
                    .sort()
                : [];

            const normalizeBenefitArray = (value: unknown): string[] =>
              Array.isArray(value)
                ? value
                    .map((entry) => normalizeBenefitSlug(String(entry)) ?? "")
                    .filter((entry) => entry.length > 0)
                    .sort()
                : [];

            const originalCategory = extractString(
              originalSnapshot.categoryQuery
            );
            const finalCategory = extractString(adjustedSnapshot.categoryQuery);
            const originalName = extractString(originalSnapshot.nameQuery);
            const finalName = extractString(adjustedSnapshot.nameQuery);
            const originalBenefitsArray = normalizeBenefitArray(
              originalSnapshot.benefits
            );
            const finalBenefitsArray = normalizeBenefitArray(
              adjustedSnapshot.benefits
            );
            const originalIngredientsArray = normalizeStringArray(
              originalSnapshot.ingredientQueries
            );
            const finalIngredientsArray = normalizeStringArray(
              adjustedSnapshot.ingredientQueries
            );

            const changes: string[] = [];

            if (finalCategory !== originalCategory) {
              changes.push(
                `categoryQuery → ${finalCategory ? `"${finalCategory}"` : "(removed)"}`
              );
            }

            if (
              JSON.stringify(finalBenefitsArray) !==
              JSON.stringify(originalBenefitsArray)
            ) {
              changes.push(
                finalBenefitsArray.length
                  ? `benefits → [${finalBenefitsArray.join(", ")}]`
                  : "benefits cleared"
              );
            }

            if (
              JSON.stringify(finalIngredientsArray) !==
              JSON.stringify(originalIngredientsArray)
            ) {
              changes.push(
                finalIngredientsArray.length
                  ? `ingredientQueries → [${finalIngredientsArray.join(", ")}]`
                  : "ingredientQueries cleared"
              );
            }

            if (finalName !== originalName) {
              changes.push(
                finalName ? `nameQuery → "${finalName}"` : "nameQuery removed"
              );
            }

            if (changes.length) {
              normalizationSummary =
                "Normalization note: searchProductsByQuery arguments " +
                changes.join("; ");
            }
          }

          serializedArgsForHistory = JSON.stringify(adjustedArgs ?? {});

          console.log(`Executing tool: ${toolCall.name}`, adjustedArgs);

          const result = await toolDef.handler(adjustedArgs);

          console.log(result, "This is the result of the tool call");

          toolOutputs.push({
            name: toolCall.name,
            arguments: adjustedArgs,
            result: result ?? null,
          });
          if (toolCall.name === "addToCart") {
            pendingAddToCart = false;
            pendingAddToCartReminderSent = false;
          }

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

          chatMessages.push({
            role: "tool",
            tool_call_id: callId,
            tool_name: toolCall.name,
            tool_arguments: serializedArgsForHistory,
            content: JSON.stringify(normalizedSanitized),
          });

          if (normalizationSummary) {
            chatMessages.push({
              role: "developer",
              content: normalizationSummary,
            });
          }

          if (toolCall.name === "startSkinTypeSurvey") {
            startSkinTypeQuiz = true;
            terminateAfterTool = true;
          }
        } catch (err) {
          console.error(
            `Tool execution error (${toolCall.name ?? "unknown"}):`,
            err
          );

          const fallbackArgsString =
            serializedArgsForHistory !== "{}"
              ? serializedArgsForHistory
              : typeof toolCall.arguments === "string"
                ? toolCall.arguments
                : JSON.stringify(originalArgsObject ?? {});

          chatMessages.push({
            role: "tool",
            tool_call_id: callId,
            tool_name: toolCall.name,
            tool_arguments: fallbackArgsString,
            content: JSON.stringify({
              error: true,
              message: (err as Error)?.message || "Tool execution failed",
            }),
          });
        }
      }

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

      if (terminateAfterTool) {
        finalContent = "";
        break;
      }

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
            registerProductCandidate(product);

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
                      registerProductCandidate(optionProduct);
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

          pendingExtraInputItems = [];

          continue;
        }
      }

      // Make sure next round includes function_call and function_call_output items
      pendingExtraInputItems = [];

      type ToolOutcomeSummary = {
        name: string;
        status: "success" | "error";
        message?: string;
        quantity?: number;
      };

      const actionOutcomes: ToolOutcomeSummary[] = [];
      for (const output of toolOutputs) {
        if (!output?.result || typeof output.result !== "object") continue;
        const record = output.result as Record<string, unknown>;
        const hasActionHint =
          typeof record.statusCode === "number" ||
          typeof record.message === "string" ||
          typeof record.success === "boolean";
        if (!hasActionHint) continue;
        let status: "success" | "error" | "unknown" = "unknown";
        if (record.success === true) status = "success";
        else if (record.success === false) status = "error";
        else if (
          typeof record.status === "string" &&
          record.status.toLowerCase().includes("error")
        )
          status = "error";
        if (status === "unknown") continue;
        const message =
          typeof record.message === "string" && record.message.trim().length
            ? record.message.trim()
            : undefined;
        const quantity =
          typeof record.quantity === "number" &&
          Number.isFinite(record.quantity)
            ? record.quantity
            : undefined;
        actionOutcomes.push({
          name: output.name,
          status,
          message,
          quantity,
        });
      }

      if (actionOutcomes.length) {
        const successes = actionOutcomes.filter(
          (entry) => entry.status === "success"
        );
        const failures = actionOutcomes.filter(
          (entry) => entry.status === "error"
        );
        const instructions: string[] = [];
        if (successes.length) {
          instructions.push(
            "The following tool actions succeeded. Confirm each plainly before moving on:"
          );
          successes.forEach((entry) => {
            const detailParts: string[] = [];
            if (entry.message) detailParts.push(entry.message);
            if (typeof entry.quantity === "number")
              detailParts.push(`quantity now ${entry.quantity}`);
            const detail =
              detailParts.length > 0 ? ` – ${detailParts.join(", ")}` : "";
            instructions.push(`- ${entry.name}${detail}`);
          });
        }
        if (failures.length) {
          instructions.push(
            "Some tool actions failed. State the failure clearly, do not imply success, and offer next steps:"
          );
          failures.forEach((entry) => {
            const detail = entry.message ? ` – ${entry.message}` : "";
            instructions.push(`- ${entry.name}${detail}`);
          });
        }
        instructions.push(
          "After addressing these outcomes, continue with your guidance and still end with the 'Suggested actions' heading plus three numbered suggestions."
        );
        chatMessages.push({
          role: "developer",
          content: instructions.join(" "),
        });
      }

      const latestCartOutput = [...toolOutputs]
        .slice()
        .reverse()
        .find(
          (output) =>
            output.name === "getUserCart" &&
            output?.result &&
            typeof output.result === "object"
        );

      if (latestCartOutput) {
        const cartResult = latestCartOutput.result as Record<string, unknown>;
        const cartItems = Array.isArray(cartResult.cart)
          ? (cartResult.cart as unknown[])
          : [];
        const hasItems = cartItems.length > 0;
        const cartInstructionParts: string[] = [];
        cartInstructionParts.push(
          "The previous tool call returned the user's cart. Answer with a clear, itemized list rather than a generic statement."
        );
        if (hasItems) {
          cartInstructionParts.push(
            "List each cart item on its own line or numbered bullet: include the product name, selected size/variant if available, quantity, and price if provided. Keep it concise and skip marketing fluff."
          );
        } else {
          cartInstructionParts.push(
            "If the cart is empty, say so plainly before offering next steps."
          );
        }
        cartInstructionParts.push(
          "After listing, offer brief helpful next steps (add, compare, remove, checkout) tied to their cart status, then always close with the 'Suggested actions' heading and three numbered suggestions."
        );
        chatMessages.push({
          role: "developer",
          content: cartInstructionParts.join(" "),
        });
      }

      const latestSearchOutput = [...toolOutputs]
        .slice()
        .reverse()
        .find((output) => output.name === "searchProductsByQuery");
      const latestSearchResult =
        latestSearchOutput &&
        latestSearchOutput.result &&
        typeof latestSearchOutput.result === "object"
          ? (latestSearchOutput.result as Record<string, unknown>)
          : null;
      if (
        latestSearchResult &&
        (latestSearchResult.success === false ||
          (Array.isArray(latestSearchResult.products) &&
            latestSearchResult.products.length === 0))
      ) {
        chatMessages.push({
          role: "developer",
          content:
            "The latest product search returned no matches. Tell the user directly that nothing matching their request is in stock before moving to suggestions.",
        });
      }

      const productsArray =
        toolOutputs.length > 0 ? normalizeProductsFromOutputs(toolOutputs) : [];
      if (productsArray.length) {
        registerProductCollection(productsArray as ProductCandidate[]);
      }

      // for products array in tool call
      if (productsArray.length) {
        let refinedProductsResult: {
          products: ProductCandidate[];
          notes?: string;
        } | null = null;

        // pass in the product to llm to refine

        try {
          refinedProductsResult = await refineProductSelectionWithGemini({
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
        registerProductCollection(streamingProducts);

        if (pendingAddToCart && !pendingAddToCartReminderSent) {
          chatMessages.push({
            role: "developer",
            content:
              "You just refreshed product details. Use this opportunity to show the size options, ask the user which one they want, and then complete the outstanding add-to-cart request.",
          });
          pendingAddToCartReminderSent = true;
        }

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
            benefits?: string[];
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
        const rawBenefits = Array.isArray(searchArgs.benefits)
          ? searchArgs.benefits.filter(
              (entry): entry is string => typeof entry === "string"
            )
          : [];

        const derivedSkinTypes = new Set<string>();
        const derivedBenefits = new Set<string>();

        streamingProducts.forEach((product) => {
          if (!product || typeof product !== "object") return;
          const record = product as Record<string, unknown>;
          const productSkinTypes = Array.isArray(record.skinType)
            ? record.skinType
            : Array.isArray((record as any).skinTypes)
              ? ((record as any).skinTypes as unknown[])
              : [];
          productSkinTypes.forEach((entry) => {
            if (typeof entry !== "string") return;
            const normalized = entry.trim().toLowerCase();
            if (!normalized || normalized === "all") return;
            derivedSkinTypes.add(normalized);
          });

          const productBenefits = Array.isArray(record.benefits)
            ? record.benefits
            : [];
          productBenefits.forEach((entry) => {
            if (typeof entry !== "string") return;
            const normalized = entry.trim().toLowerCase();
            if (!normalized) return;
            derivedBenefits.add(normalized);
          });
        });

        const normalizedSkinTypes = rawSkinTypes
          .map((type) => toTitleCase(type))
          .filter(Boolean);
        const filteredSkinTypes = normalizedSkinTypes.filter(
          (type) => type.toLowerCase() !== "all"
        );
        const derivedSkinTypeList = Array.from(derivedSkinTypes).map((type) =>
          toTitleCase(type)
        );
        const effectiveSkinTypes = filteredSkinTypes.length
          ? filteredSkinTypes
          : derivedSkinTypeList;
        const normalizedConcerns = rawSkinConcerns
          .map((concern) => toTitleCase(concern))
          .filter(Boolean);
        const normalizedCategory = category ? toTitleCase(category) : undefined;
        const normalizedBrand = brandQuery
          ? toTitleCase(brandQuery)
          : undefined;

        const audiencePhrase = composeAudiencePhrase(
          effectiveSkinTypes,
          normalizedConcerns
        );
        const audienceHeadline = audiencePhrase
          ? toTitleCase(audiencePhrase)
          : undefined;
        const ingredientPhraseRaw = describeIngredients(rawIngredientQueries);
        const ingredientHeadline = ingredientPhraseRaw
          ? sentenceCase(ingredientPhraseRaw)
          : undefined;
        const effectiveBenefitsRaw = rawBenefits.length
          ? rawBenefits
          : Array.from(derivedBenefits);
        const benefitPhraseRaw = describeBenefits(effectiveBenefitsRaw);
        const benefitHeadline = benefitPhraseRaw
          ? sentenceCase(benefitPhraseRaw)
          : undefined;
        const benefitQualifier = benefitHeadline
          ? benefitHeadline.replace(/\bbenefits?$/i, "").trim() || undefined
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
          usedBenefits,
        } = buildProductHeadline({
          productCount: streamingProducts.length,
          category: normalizedCategory,
          audience: audienceHeadline,
          brand: normalizedBrand,
          nameQuery: nameQueryHeadline,
          ingredients: ingredientHeadline,
          benefits: benefitHeadline,
          benefitQualifier,
        });

        const summarySubheading = buildProductSubheading({
          audiencePhrase,
          brand: normalizedBrand,
          ingredients: ingredientPhraseRaw,
          benefits: benefitPhraseRaw,
          nameQuery,
          note: selectionNote,
          usedAudience,
          usedBrand,
          usedIngredients,
          usedBenefits,
        });

        summaryContext = {
          type: "products",
          productCount: streamingProducts.length,
          filters: {
            category: normalizedCategory,
            skinTypes: filteredSkinTypes.length ? filteredSkinTypes : undefined,
            skinConcerns: normalizedConcerns.length
              ? normalizedConcerns
              : undefined,
            ingredientQueries: rawIngredientQueries.length
              ? rawIngredientQueries.map((item) => item.toLowerCase())
              : undefined,
            benefits: rawBenefits.length
              ? rawBenefits.map((item) => item.toLowerCase())
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
          icon: productIcon,
        };
        await streamSummaryIfNeeded();
        await streamProductsIfNeeded(streamingProducts);
        lastProductSelection = streamingProducts;

        if (!streamingProducts.length) {
          chatMessages.push({
            role: "developer",
            content:
              "No matching products were returned from the last tool call. Respond candidly that we don't currently stock an exact match for what they asked, suggest tweaking filters or sharing more detail, and explicitly offer to try another search. Do not invent product names or imply success when nothing was found.",
          });
          continue;
        }

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
        const userQuestionContext = latestUserMessageContent
          ? `User's original question: "${latestUserMessageContent}"\n\n`
          : "";
        chatMessages.push({
          role: "developer",
          content:
            userQuestionContext +
            "You have the products returned in the previous tool call. Use the actual product data from the tool result to directly answer the user's original question. If the user asked for detailed info about a product (e.g., 'tell me about X', 'give me details on X', 'what is X'), provide comprehensive information using the tool data: always include the brand name (e.g., 'CeraVe Hydrating Cleanser' not just 'cleanser'), use the product description exactly as provided, mention key ingredients from the ingredients list, explain benefits, and highlight what makes it unique. Don't just give a generic overview—use the actual product description, ingredients list, and benefits from the tool result. Never fabricate or infer texture, feel, or other sensory details not present in the data. For general product searches (e.g., 'show me serums'), keep it brief and focus on how the selection fits their needs. Then include 2–3 helpful, conversational follow-up suggestions tailored to this context (e.g., 'Want to see more options?', 'Curious about ingredients?', 'Should I compare these?', 'Ready to add one to your cart?') to keep the conversation going naturally.",
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

  finalContent = finalContent.trim();
  if (finalContent.length) {
    finalContent = applyParagraphStructure(finalContent);
  }
  if (!finalContent.length) {
    finalContent = "Got it—let me know how you'd like me to help next.";
  }

  const replyText = productsPayload.length
    ? finalContent.length
      ? finalContent
      : ""
    : finalContent;

  let generatedSummary: ReplySummary | null = combinedSummary;
  if (!generatedSummary && replyText.trim().length) {
    generatedSummary = await generateReplySummaryWithGemini({
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
    startSkinTypeQuiz,
  };
}
