import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  fetchAction,
  fetchMutation,
  fetchQuery,
  runWithConvexAuthToken,
} from "@/ai/convex/client";
import { callOpenRouter } from "@/ai/models/openrouter";
import { api } from "@/convex/_generated/api";
import { DEFAULT_SYSTEM_PROMPT } from "@/ai/utils";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatMessage } from "@/ai/types";

// type SkinProfileClassification = {
//   intent: "profile_update" | "profile_reference" | "none";
//   skinTypes: string[];
//   skinConcerns: string[];
//   confidence: number;
// };

// const SKIN_PROFILE_CLASSIFIER_MODEL =
//   process.env.SKIN_PROFILE_CLASSIFIER_MODEL ?? "gemini-1.5-flash";

type ParsedAssistantReply = {
  main: string;
  suggestedActions: string[];
};

const TOOL_NAME_REPLACEMENTS: Record<string, string> = {
  searchProductsByQuery: "product search",
  getProduct: "product lookup",
  getAllProducts: "product lookup",
  recommendRoutine: "routine builder",
  getSkinProfile: "profile lookup",
  saveUserProfile: "profile update",
  startSkinTypeSurvey: "skin survey",
  addToCart: "cart update",
};

function scrubToolLanguage(text: string): string {
  if (typeof text !== "string" || !text.trim().length) return "";
  let sanitized = text;
  for (const [toolName, replacement] of Object.entries(
    TOOL_NAME_REPLACEMENTS
  )) {
    const pattern = new RegExp(`\\b${toolName}\\b`, "gi");
    sanitized = sanitized.replace(pattern, replacement);
  }
  sanitized = sanitized
    .replace(/\btools?\b/gi, "")
    // collapse repeated spaces/tabs but keep newlines intact
    .replace(/[ \t]{2,}/g, " ");
  sanitized = sanitized.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return sanitized.trimEnd();
}

function normalizeListSpacing(text: string): string {
  if (typeof text !== "string" || !text.length) return text ?? "";
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isListItem =
      /^[-*+]\s+/.test(trimmed) || /^\d+[\).\s]+\s*/.test(trimmed);
    const previous = result[result.length - 1];
    const prevIsEmpty = !previous || previous.trim().length === 0;
    const prevIsList =
      previous &&
      (/^[-*+]\s+/.test(previous.trim()) ||
        /^\d+[\).\s]+\s*/.test(previous.trim()));

    if (isListItem && !prevIsEmpty && !prevIsList) {
      result.push("");
    }
    result.push(line);
  }

  return result.join("\n");
}

function splitAssistantReply(message: string): ParsedAssistantReply {
  if (typeof message !== "string") {
    return { main: "", suggestedActions: [] };
  }
  const normalized = message.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const normalizeHeader = (line: string) =>
    line
      .toLowerCase()
      .replace(/[\*`_~>#:\-;]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const headerIndex = lines.findIndex((line) => {
    const normalizedHeader = normalizeHeader(line);
    return (
      normalizedHeader === "suggested actions" ||
      normalizedHeader === "suggested action" ||
      normalizedHeader === "suggestions"
    );
  });

  if (headerIndex === -1) {
    return { main: normalized, suggestedActions: [] };
  }

  const main = lines.slice(0, headerIndex).join("\n").trimEnd();
  const suggestionLines = lines.slice(headerIndex + 1);
  const suggestions: string[] = [];
  for (const line of suggestionLines) {
    const trimmed = line.trim();
    if (!trimmed.length) continue;
    const cleaned = trimmed
      .replace(/^[-*•●◦▪]+\s*/, "")
      .replace(/^(\d+)[\).:\-]?\s*/, "")
      .trim();
    if (!cleaned.length) continue;
    if (normalizeHeader(cleaned) === "suggested actions") continue;
    suggestions.push(cleaned);
    if (suggestions.length >= 3) break;
  }

  return {
    main: main.length ? main : normalized.trim(),
    suggestedActions: suggestions,
  };
}

const AFFIRMATIVE_PHRASES = [
  "ok",
  "okay",
  "ok thanks",
  "ok thank you",
  "sure",
  "yes",
  "yep",
  "yeah",
  "yup",
  "absolutely",
  "definitely",
  "of course",
  "sounds good",
  "sounds great",
  "that works",
  "works for me",
  "let's do it",
  "lets do it",
  "let's go",
  "lets go",
  "do it",
  "do that",
  "go ahead",
  "please do",
  "please proceed",
  "make it happen",
  "go for it",
  "i'm in",
  "i am in",
  "i'm ready",
  "i am ready",
  "great",
  "cool",
  "perfect",
  "love it",
  "sounds perfect",
  "sounds good to me",
  "sounds great to me",
  "alright",
  "all right",
  "okay yes",
  "okay yes let's do it",
  "okay lets do it",
  "yes let's do it",
  "yes lets do it",
  "yes please",
  "yes please do",
  "yes go ahead",
  "ok go ahead",
  "okay go ahead",
  "ok let's do it",
  "ok lets do it",
  "sounds good, do it",
  "do it please",
  "please do it",
];

const AFFIRMATIVE_TOKENS = new Set([
  "ok",
  "okay",
  "okey",
  "sure",
  "yes",
  "yep",
  "yeah",
  "yup",
  "absolutely",
  "definitely",
  "course",
  "of",
  "course",
  "sounds",
  "good",
  "great",
  "that",
  "works",
  "works",
  "for",
  "me",
  "let's",
  "lets",
  "do",
  "it",
  "go",
  "ahead",
  "please",
  "proceed",
  "make",
  "happen",
  "go",
  "for",
  "i'm",
  "im",
  "i",
  "am",
  "in",
  "ready",
  "cool",
  "perfect",
  "love",
  "love",
  "it",
  "sounds",
  "perfect",
  "alright",
  "all",
  "right",
  "yess",
]);

function normaliseAffirmation(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAffirmativeAcknowledgement(text: string): boolean {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed.length) return false;
  if (trimmed.length > 80) return false;

  const normalized = normaliseAffirmation(trimmed);
  if (!normalized.length) return false;

  if (AFFIRMATIVE_PHRASES.includes(normalized)) return true;

  const tokens = normalized.split(" ");
  if (!tokens.length) return false;

  return tokens.every((token) => AFFIRMATIVE_TOKENS.has(token));
}

function coerceRole(value: string): ChatMessage["role"] {
  switch (value) {
    case "user":
    case "assistant":
    case "system":
    case "tool":
    case "developer":
      return value;
    default:
      return "system";
  }
}

function augmentMessagesWithAffirmationNote(
  messages: Array<{ role: string; content: string }>
): ChatMessage[] {
  if (!Array.isArray(messages) || !messages.length) {
    return [];
  }

  const normalized: ChatMessage[] = messages.map((entry) => ({
    role: coerceRole(entry.role),
    content: typeof entry.content === "string" ? entry.content : "",
  }));

  const last = normalized[normalized.length - 1];

  if (!last || last.role !== "user") {
    return normalized;
  }

  if (!isAffirmativeAcknowledgement(last.content)) {
    return normalized;
  }

  const previousAssistant = [...normalized]
    .reverse()
    .find((entry) => entry.role === "assistant");

  if (!previousAssistant) {
    return normalized;
  }

  const acceptedMessage = previousAssistant.content.trim();
  const confirmation = last.content.trim();

  const note = [
    "System note: The user just gave a brief affirmative response acknowledging the assistant's previous suggestion.",
    `User reply: "${confirmation}"`,
    acceptedMessage.length
      ? `Treat this as explicit approval to proceed with the assistant's previous guidance: ${acceptedMessage}`
      : "Proceed with the assistant's previously suggested course of action.",
  ]
    .filter(Boolean)
    .join("\n");

  normalized.push({
    role: "system",
    content: note,
  });

  return normalized;
}

const TOOL_INTENT_PATTERNS: RegExp[] = [
  /\b(find|show|search|pull|fetch|look\s+up|recommend|suggest|curate|help\s+me\s+find)\b/i,
  /\b(add|put)\s+(?:it|this|that|one)?\s*(?:to|into)\s+(?:my\s+)?cart\b/i,
  /\bcompare\b/i,
  /\bswap\b/i,
  /\breplace\b/i,
  /\bstart\s+(?:the\s+)?(?:skin\s+)?(?:quiz|survey)\b/i,
  /\bbuild\b.+\broutine\b/i,
  /\b(round|step-by-step)\s+routine\b/i,
];

const PAGINATION_PATTERNS: RegExp[] = [
  /\bmore\s+options?\b/i,
  /\bshow\s+me\s+more\b/i,
  /\bnext\s+(?:set|ones?)\b/i,
  /\banother\s+(?:one|option)\b/i,
  /\bmore\s+please\b/i,
  /\bsomething\s+else\b/i,
];

const PRODUCT_TERM_PATTERN =
  /\b(cleanser|serum|toner|moisturizer|moisturiser|spf|sunscreen|sunblock|mask|exfoliator|lotion|cream|product|routine|treatment)\b/i;

const FILTER_HINT_PATTERN =
  /\b(oily|dry|combo|combination|acne|acne-prone|hyperpig|hyperpigmentation|sensitive|hydrating|brightening|oil\s*control|matte|retinol|niacinamide|aha|bha|vitamin\s*c|fragrance[-\s]?free|budget|price|under\s+\$?\d+|under\s+₦?\d+|less\s+than\s+\$?\d+|less\s+than\s+₦?\d+)\b|[₦$€£¥]/i;

const ASSISTANT_TOOL_OFFER_PATTERN =
  /(want\s+me\s+to|should\s+i|i\s+can|let\s+me)\s+(?:find|show|search|pull|add|start|compare|look\s+up)/i;

type MessageWithIndex = { message: ChatMessage | null; index: number };

function findLastMessageByRole(
  messages: ChatMessage[],
  role: ChatMessage["role"],
  beforeIndex?: number
): MessageWithIndex {
  if (!Array.isArray(messages) || !messages.length) {
    return { message: null, index: -1 };
  }
  const start =
    typeof beforeIndex === "number" ? beforeIndex : messages.length - 1;
  for (let idx = start; idx >= 0; idx--) {
    if (messages[idx]?.role === role) {
      return { message: messages[idx], index: idx };
    }
  }
  return { message: null, index: -1 };
}

const normalizeRoutingText = (value?: string): string =>
  typeof value === "string" ? value.toLowerCase().trim() : "";

function shouldRouteToToolModel(
  latestUserMessage?: ChatMessage | null,
  previousAssistantMessage?: ChatMessage | null
): { needsTooling: boolean; reason?: string } {
  const latestContent = latestUserMessage?.content ?? "";
  const normalizedUser = normalizeRoutingText(latestContent);

  if (!normalizedUser.length) {
    return { needsTooling: false };
  }

  if (TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(normalizedUser))) {
    return { needsTooling: true, reason: "user_intent_keyword" };
  }

  if (
    PRODUCT_TERM_PATTERN.test(normalizedUser) &&
    FILTER_HINT_PATTERN.test(normalizedUser)
  ) {
    return { needsTooling: true, reason: "product_filter" };
  }

  if (normalizedUser.includes("cart") || normalizedUser.includes("size ")) {
    return { needsTooling: true, reason: "cart_or_size" };
  }

  if (PAGINATION_PATTERNS.some((pattern) => pattern.test(normalizedUser))) {
    return { needsTooling: true, reason: "pagination" };
  }

  if (
    isAffirmativeAcknowledgement(latestContent) &&
    previousAssistantMessage &&
    ASSISTANT_TOOL_OFFER_PATTERN.test(
      normalizeRoutingText(previousAssistantMessage.content)
    )
  ) {
    return { needsTooling: true, reason: "affirmative_followup" };
  }

  return { needsTooling: false };
}

// async function classifySkinProfileIntent(
//   input: string
// ): Promise<SkinProfileClassification | null> {
//   if (typeof input !== "string" || !input.trim().length) return null;
//   try {
//     const client = getOpenRouterClient();
//     const response = await client.models.generateContent({
//       model: SKIN_PROFILE_CLASSIFIER_MODEL,
//       contents: [
//         {
//           role: "user",
//           parts: [
//             {
//               text: [
//                 "Classify the following message.",
//                 "Determine if the speaker is declaring new skin type or concern information that should update a stored skincare profile (intent: profile_update),",
//                 "simply referencing their existing profile without requesting changes (intent: profile_reference),",
//                 "or not discussing their profile at all (intent: none).",
//                 "Extract any skin type mentions (oily, dry, combination, sensitive, normal, acne-prone, mature, etc.) and skin concerns (acne, redness, hyperpigmentation, sensitivity, dryness, texture, dullness, pores, fine lines, oiliness, eczema, psoriasis, congestion, etc.).",
//                 "If unsure, choose intent 'none'.",
//                 `Message: """${input.trim()}"""`,
//               ].join(" "),
//             },
//           ],
//         },
//       ],
//       config: {
//         systemInstruction: {
//           role: "system",
//           parts: [
//             {
//               text: "You output JSON describing whether the user intends to update their saved skin profile. Reply with JSON only, no narration.",
//             },
//           ],
//         },
//         temperature: 0,
//         responseMimeType: "application/json",
//         responseJsonSchema: {
//           type: "object",
//           additionalProperties: false,
//           properties: {
//             intent: {
//               type: "string",
//               enum: ["profile_update", "profile_reference", "none"],
//             },
//             skinTypes: {
//               type: "array",
//               items: { type: "string" },
//               default: [],
//             },
//             skinConcerns: {
//               type: "array",
//               items: { type: "string" },
//               default: [],
//             },
//             confidence: {
//               type: "number",
//               minimum: 0,
//               maximum: 1,
//               default: 0,
//             },
//           },
//           required: ["intent", "skinTypes", "skinConcerns"],
//         },
//       },
//     });

//     const toRecord = (value: unknown): Record<string, unknown> | null =>
//       value && typeof value === "object"
//         ? (value as Record<string, unknown>)
//         : null;

//     const extractText = (value: unknown): string | null => {
//       const record = toRecord(value);
//       if (!record) return null;
//       const direct = record.text;
//       if (typeof direct === "string" && direct.trim().length) {
//         return direct.trim();
//       }
//       const responseNode = toRecord(record.response);
//       const responseText = responseNode?.text;
//       if (typeof responseText === "string" && responseText.trim().length) {
//         return responseText.trim();
//       }
//       const candidates = record.candidates;
//       if (Array.isArray(candidates)) {
//         for (const candidate of candidates) {
//           const candidateRecord = toRecord(candidate);
//           const contentNode = toRecord(candidateRecord?.content);
//           const parts = contentNode?.parts;
//           if (Array.isArray(parts)) {
//             for (const part of parts) {
//               const partRecord = toRecord(part);
//               const partText = partRecord?.text;
//               if (typeof partText === "string" && partText.trim().length) {
//                 return partText.trim();
//               }
//             }
//           }
//         }
//       }
//       return null;
//     };

//     const rawContent = extractText(response);
//     if (!rawContent) return null;

//     const sanitized = rawContent.replace(/```(?:json)?|```/gi, "").trim();
//     if (!sanitized.length) return null;

//     const parsed = JSON.parse(sanitized);
//     if (
//       parsed &&
//       typeof parsed.intent === "string" &&
//       Array.isArray(parsed.skinTypes) &&
//       Array.isArray(parsed.skinConcerns)
//     ) {
//       return {
//         intent: parsed.intent,
//         skinTypes: parsed.skinTypes,
//         skinConcerns: parsed.skinConcerns,
//         confidence:
//           typeof parsed.confidence === "number" ? parsed.confidence : 0,
//       };
//     }
//   } catch (error) {
//     console.warn("Skin profile intent classification failed:", error);
//   }
//   return null;
// }

export async function POST(req: NextRequest) {
  const authSession = await auth();
  const convexToken = await authSession
    .getToken({ template: "convex" })
    .catch(() => null);
  const guestToken = req.cookies.get("guest_token")?.value ?? null;

  // console.log(guestToken, "This is the guest token");
  // console.log(convexToken, "This is the convex token");

  const token = convexToken ?? guestToken;

  return runWithConvexAuthToken(token, () => handleChatPost(req));
}

async function handleChatPost(req: NextRequest) {
  console.log("we are in chat endpoint");
  const body = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = async (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      const scheduled: Promise<void>[] = [];
      let streamedProductSignature: string | null = null;
      let streamedRoutineSignature: string | null = null;
      let streamedSummarySignature: string | null = null;

      const schedule = (promise: Promise<unknown>) => {
        scheduled.push(
          promise
            .then(() => undefined)
            .catch((error) =>
              console.error("Background persistence error:", error)
            )
        );
      };

      type NormalizedProduct = {
        productId: string;
        slug?: string;
        brand?: string;
        categoryName?: string;
        selectionReason?: string;
        selectionConfidence?: number;
        sizes?: Array<{
          sizeId: string;
          size?: number;
          sizeText?: string;
          unit?: string;
          label?: string;
          price?: number;
          currency?: string;
          discount?: number;
          stock?: number;
        }>;
        ingredients?: string[];
        isTrending?: boolean;
        isNew?: boolean;
        isBestseller?: boolean;
        benefits?: string[];
        skinTypes?: string[];
        hasAlcohol?: boolean;
        hasFragrance?: boolean;
      };

      const sanitizeProducts = (products: unknown[]): NormalizedProduct[] => {
        if (!Array.isArray(products)) return [];

        const isNonEmptyString = (value: unknown): value is string =>
          typeof value === "string" && value.trim().length > 0;
        const toTrimmedList = (input: unknown): string[] => {
          if (Array.isArray(input)) {
            return input
              .map((value) =>
                isNonEmptyString(value) ? value.trim() : undefined
              )
              .filter((value): value is string => Boolean(value));
          }
          if (isNonEmptyString(input)) {
            return [input.trim()];
          }
          return [];
        };

        return products
          .map((product) => {
            if (!product || typeof product !== "object") return null;
            const raw = product as Record<string, unknown>;
            const base =
              raw.product && typeof raw.product === "object"
                ? (raw.product as Record<string, unknown>)
                : raw;

            const productId =
              typeof base._id === "string"
                ? base._id
                : typeof raw._id === "string"
                  ? raw._id
                  : typeof raw.productId === "string"
                    ? raw.productId
                    : typeof raw.id === "string"
                      ? raw.id
                      : typeof base.id === "string"
                        ? base.id
                        : undefined;

            if (!productId) return null;

            const categories = Array.isArray(raw.categories)
              ? raw.categories
                  .map((category) => {
                    if (!category || typeof category !== "object") return null;
                    const record = category as Record<string, unknown>;
                    return typeof record.name === "string" ? record.name : null;
                  })
                  .filter((name): name is string => Boolean(name))
              : [];

            const normalizeSizes = (
              source: unknown
            ): NormalizedProduct["sizes"] => {
              if (!Array.isArray(source)) return undefined;
              const entries: NonNullable<NormalizedProduct["sizes"]>[number][] =
                [];
              source.forEach((size) => {
                if (!size || typeof size !== "object") return;
                const record = size as Record<string, unknown>;
                const sizeId =
                  typeof record.id === "string"
                    ? record.id
                    : typeof record.sizeId === "string"
                      ? record.sizeId
                      : typeof record._id === "string"
                        ? record._id
                        : undefined;
                if (!sizeId) return;

                const rawSize = record.size;
                const explicitSizeText =
                  typeof record.sizeText === "string" &&
                  record.sizeText.trim().length
                    ? record.sizeText.trim()
                    : undefined;
                const numericSize =
                  typeof rawSize === "number" && Number.isFinite(rawSize)
                    ? rawSize
                    : undefined;
                const sizeText =
                  typeof rawSize === "string" && rawSize.trim().length
                    ? rawSize.trim()
                    : explicitSizeText;
                const unit =
                  typeof record.unit === "string" && record.unit.trim().length
                    ? record.unit.trim()
                    : undefined;
                const name =
                  typeof record.name === "string" && record.name.trim().length
                    ? record.name.trim()
                    : undefined;
                const price =
                  typeof record.price === "number"
                    ? record.price
                    : typeof record.price === "string" &&
                        record.price.trim().length &&
                        Number.isFinite(Number(record.price))
                      ? Number(record.price)
                      : undefined;
                const currency =
                  typeof record.currency === "string" &&
                  record.currency.trim().length
                    ? record.currency.trim()
                    : undefined;
                const discount =
                  typeof record.discount === "number"
                    ? record.discount
                    : undefined;
                const stock =
                  typeof record.stock === "number" ? record.stock : undefined;

                let label =
                  name ||
                  (typeof record.label === "string" &&
                  record.label.trim().length
                    ? record.label.trim()
                    : undefined);
                if (!label) {
                  if (numericSize !== undefined && unit) {
                    label = `${numericSize} ${unit}`.trim();
                  } else if (sizeText && unit) {
                    label = `${sizeText} ${unit}`.trim();
                  } else if (sizeText) {
                    label = sizeText;
                  } else if (unit) {
                    label = unit;
                  }
                }

                entries.push({
                  sizeId,
                  size: numericSize,
                  sizeText: sizeText ?? explicitSizeText,
                  unit,
                  label,
                  price,
                  currency,
                  discount,
                  stock,
                });
              });
              return entries.length ? entries : undefined;
            };

            const sizes =
              normalizeSizes(raw.sizes) ?? normalizeSizes(base.sizes) ?? [];

            const brandRaw = raw.brand ?? base.brand;
            const brand =
              typeof brandRaw === "string"
                ? brandRaw
                : brandRaw && typeof brandRaw === "object"
                  ? typeof (brandRaw as Record<string, unknown>).name ===
                    "string"
                    ? ((brandRaw as Record<string, unknown>).name as string)
                    : undefined
                  : undefined;

            const normalized: NormalizedProduct = {
              productId,
              slug:
                typeof base.slug === "string"
                  ? base.slug
                  : typeof raw.slug === "string"
                    ? raw.slug
                    : undefined,
              brand,
              categoryName: categories.at(0),
              selectionReason:
                typeof raw.selectionReason === "string"
                  ? raw.selectionReason.slice(0, 320)
                  : typeof base.selectionReason === "string"
                    ? base.selectionReason.slice(0, 320)
                    : undefined,
              sizes: sizes.length ? sizes : undefined,
              ingredients: (() => {
                const list = toTrimmedList(raw.ingredients);
                if (list.length) return list;
                const keyList = toTrimmedList(
                  (raw as Record<string, unknown>).keyIngredients
                );
                if (keyList.length) return keyList;
                const baseList = toTrimmedList(base.ingredients);
                if (baseList.length) return baseList;
                const baseKeyList = toTrimmedList(
                  (base as Record<string, unknown>).keyIngredients
                );
                return baseKeyList.length ? baseKeyList : undefined;
              })(),
              isTrending:
                typeof raw.isTrending === "boolean"
                  ? raw.isTrending
                  : typeof base.isTrending === "boolean"
                    ? base.isTrending
                    : undefined,
              isNew:
                typeof raw.isNew === "boolean"
                  ? raw.isNew
                  : typeof base.isNew === "boolean"
                    ? base.isNew
                    : undefined,
              isBestseller:
                typeof raw.isBestseller === "boolean"
                  ? raw.isBestseller
                  : typeof base.isBestseller === "boolean"
                    ? base.isBestseller
                    : undefined,
              benefits: (() => {
                const list = toTrimmedList(raw.benefits);
                if (list.length) return list;
                const baseList = toTrimmedList(base.benefits);
                return baseList.length ? baseList : undefined;
              })(),
              skinTypes: (() => {
                const combined = [
                  ...toTrimmedList(raw.skinTypes),
                  ...toTrimmedList(raw.skinType),
                ];
                const uniqueCombined = Array.from(new Set(combined));
                if (uniqueCombined.length) return uniqueCombined;
                const baseCombined = [
                  ...toTrimmedList(base.skinTypes),
                  ...toTrimmedList(base.skinType),
                ];
                const uniqueBase = Array.from(new Set(baseCombined));
                return uniqueBase.length ? uniqueBase : undefined;
              })(),
              hasAlcohol:
                typeof raw.hasAlcohol === "boolean"
                  ? raw.hasAlcohol
                  : typeof base.hasAlcohol === "boolean"
                    ? base.hasAlcohol
                    : undefined,
              hasFragrance:
                typeof raw.hasFragrance === "boolean"
                  ? raw.hasFragrance
                  : typeof base.hasFragrance === "boolean"
                    ? base.hasFragrance
                    : undefined,
            };
            return normalized;
          })
          .filter((product): product is NormalizedProduct => product !== null);
      };

      type NormalizedRoutineSize = {
        sizeId: string;
        size?: number;
        unit?: string;
        price?: number;
        currency?: string;
        discount?: number;
        stock?: number;
      };

      type NormalizedRoutineAlternative = {
        productId?: string;
        slug?: string;
        productName?: string;
        description?: string;
        sizes?: NormalizedRoutineSize[];
      };

      type NormalizedRoutineStep = {
        index?: number;
        order?: number;
        step?: number;
        productId?: string;
        slug?: string;
        productSlug?: string;
        category?: string;
        categoryName?: string;
        categorySlug?: string;
        productName?: string;
        instruction?: string;
        timeOfDay?: string;
        sizes?: NormalizedRoutineSize[];
        alternatives?: NormalizedRoutineAlternative[];
      };

      type NormalizedRoutine = {
        routineId?: string;
        title?: string;
        skinConcern?: string;
        steps: NormalizedRoutineStep[];
      };

      const sanitizeRoutine = (
        routine: unknown
      ): NormalizedRoutine | undefined => {
        if (!routine || typeof routine !== "object") return undefined;
        const raw = routine as Record<string, unknown>;

        const toNumber = (value: unknown): number | undefined => {
          if (typeof value === "number" && Number.isFinite(value)) return value;
          if (typeof value === "string" && value.trim().length) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
          }
          return undefined;
        };

        const parseSizes = (input: unknown): NormalizedRoutineSize[] => {
          if (!Array.isArray(input)) return [];
          return input
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const record = entry as Record<string, unknown>;
              const sizeId =
                typeof record.sizeId === "string"
                  ? record.sizeId
                  : typeof record.id === "string"
                    ? record.id
                    : typeof record._id === "string"
                      ? record._id
                      : undefined;
              if (!sizeId) return null;

              const sizeValue = toNumber(record.size);
              const unit =
                typeof record.unit === "string" ? record.unit : undefined;
              const price = toNumber(record.price);
              const currency =
                typeof record.currency === "string"
                  ? record.currency
                  : undefined;
              const discount = toNumber(record.discount);
              const stock = toNumber(record.stock);

              const normalized: NormalizedRoutineSize = { sizeId };
              if (typeof sizeValue === "number") normalized.size = sizeValue;
              if (unit) normalized.unit = unit;
              if (typeof price === "number") normalized.price = price;
              if (currency) normalized.currency = currency;
              if (typeof discount === "number") normalized.discount = discount;
              if (typeof stock === "number") normalized.stock = stock;

              return normalized;
            })
            .filter((entry): entry is NormalizedRoutineSize => entry !== null);
        };

        const steps: NormalizedRoutineStep[] = Array.isArray(raw.steps)
          ? raw.steps.flatMap((step) => {
              if (!step || typeof step !== "object") return [];
              const record = step as Record<string, unknown>;
              const productRecord =
                record.product && typeof record.product === "object"
                  ? (record.product as Record<string, unknown>)
                  : undefined;

              const productId =
                typeof record.productId === "string"
                  ? record.productId
                  : typeof record._id === "string"
                    ? record._id
                    : typeof productRecord?._id === "string"
                      ? (productRecord._id as string)
                      : typeof productRecord?.id === "string"
                        ? (productRecord.id as string)
                        : undefined;
              const productSlug =
                typeof record.slug === "string"
                  ? record.slug
                  : typeof productRecord?.slug === "string"
                    ? (productRecord.slug as string)
                    : undefined;
              // const productName =
              //   typeof record.productName === "string"
              //     ? record.productName
              //     : typeof productRecord?.name === "string"
              //       ? (productRecord.name as string)
              //       : undefined;
              const instruction =
                typeof record.instruction === "string"
                  ? record.instruction.slice(0, 320)
                  : undefined;
              const timeOfDay =
                typeof record.timeOfDay === "string"
                  ? record.timeOfDay
                  : undefined;

              const order =
                typeof record.order === "number" ? record.order : undefined;
              const stepNumber =
                typeof record.step === "number" ? record.step : undefined;
              const category =
                typeof record.category === "string"
                  ? record.category
                  : undefined;
              let categorySlug =
                typeof record.categorySlug === "string"
                  ? record.categorySlug
                  : category;

              let categoryName: string | undefined;
              if (typeof record.categoryName === "string") {
                categoryName = record.categoryName;
              } else if (typeof record.categoryLabel === "string") {
                categoryName = record.categoryLabel;
              } else if (typeof record.title === "string") {
                categoryName = record.title;
              }

              if (Array.isArray(productRecord?.categories)) {
                type CategoryInfo = { name?: string; slug?: string };
                const categories: CategoryInfo[] = (
                  productRecord.categories as unknown[]
                )
                  .map((entry): CategoryInfo | null => {
                    if (typeof entry === "string") {
                      return { name: entry };
                    }
                    if (!entry || typeof entry !== "object") return null;
                    const ref = entry as Record<string, unknown>;
                    const name =
                      typeof ref.name === "string" ? ref.name : undefined;
                    const slugValue =
                      typeof ref.slug === "string" ? ref.slug : undefined;
                    if (!name && !slugValue) return null;
                    return { name, slug: slugValue };
                  })
                  .filter((value): value is CategoryInfo => value !== null);
                if (!categoryName) {
                  const nameCandidate = categories.find(
                    (entry) => typeof entry?.name === "string"
                  );
                  categoryName = nameCandidate?.name;
                }
                if (!categorySlug) {
                  const slugCandidate = categories.find(
                    (entry) => typeof entry?.slug === "string"
                  );
                  categorySlug = slugCandidate?.slug ?? categorySlug;
                }
              }

              const recordSizes = parseSizes(record["sizes"]);
              const productSizes = productRecord
                ? parseSizes(productRecord["sizes"])
                : [];
              const stepSizes =
                recordSizes.length > 0
                  ? recordSizes
                  : productSizes.length > 0
                    ? productSizes
                    : [];

              const alternatives: NormalizedRoutineAlternative[] =
                Array.isArray(record.alternatives) && record.alternatives.length
                  ? (record.alternatives as unknown[])
                      .map((entry) => {
                        if (!entry || typeof entry !== "object") return null;
                        const option = entry as Record<string, unknown>;
                        const optionProduct =
                          option.product && typeof option.product === "object"
                            ? (option.product as Record<string, unknown>)
                            : undefined;
                        const altProductId =
                          typeof option.productId === "string"
                            ? option.productId
                            : typeof option._id === "string"
                              ? option._id
                              : typeof optionProduct?._id === "string"
                                ? (optionProduct._id as string)
                                : typeof optionProduct?.id === "string"
                                  ? (optionProduct.id as string)
                                  : undefined;
                        const altSlug =
                          typeof option.slug === "string"
                            ? option.slug
                            : typeof optionProduct?.slug === "string"
                              ? (optionProduct.slug as string)
                              : undefined;
                        // const altProductName =
                        //   typeof option.productName === "string"
                        //     ? option.productName
                        //     : typeof optionProduct?.name === "string"
                        //       ? (optionProduct.name as string)
                        //       : undefined;
                        // const altDescription =
                        //   typeof option.description === "string"
                        //     ? option.description
                        //     : undefined;
                        const optionSizes = parseSizes(option["sizes"]);
                        const optionProductSizes = optionProduct
                          ? parseSizes(optionProduct["sizes"])
                          : [];
                        const altSizes =
                          optionSizes.length > 0
                            ? optionSizes
                            : optionProductSizes.length > 0
                              ? optionProductSizes
                              : [];

                        if (!altProductId && !altSlug) return null;
                        return {
                          productId: altProductId,
                          slug: altSlug,
                          sizes: altSizes.length ? altSizes : undefined,
                        } as NormalizedRoutineAlternative;
                      })
                      .filter((entry): entry is NormalizedRoutineAlternative =>
                        Boolean(entry)
                      )
                  : [];

              if (!productId && !productSlug) return [];

              const normalized: NormalizedRoutineStep = {
                index:
                  typeof record.index === "number" ? record.index : undefined,
                order,
                step: stepNumber,
                productId,
                productSlug,
                category,
                instruction,
                timeOfDay,
                sizes: stepSizes.length ? stepSizes : undefined,
                alternatives: alternatives.length ? alternatives : undefined,
              };

              return [normalized];
            })
          : [];

        return {
          routineId:
            typeof raw.routineId === "string"
              ? raw.routineId
              : typeof raw._id === "string"
                ? raw._id
                : undefined,
          title: typeof raw.title === "string" ? raw.title : undefined,
          skinConcern:
            typeof raw.skinConcern === "string" ? raw.skinConcern : undefined,
          steps,
        };
      };

      const finalize = () => {
        Promise.allSettled(scheduled)
          .catch((error) =>
            console.error("Failed waiting for background tasks:", error)
          )
          .finally(() => controller.close());
      };

      (async () => {
        try {
          const { message, sessionId: incomingSessionId, config } = body;

          if (!message || typeof message !== "string") {
            throw new Error("Missing `message` in request body");
          }

          // let viewerUser: Record<string, unknown> | null = null;
          // try {
          //   const viewerResult = await fetchQuery(api.users.getUser, {});
          //   if (viewerResult?.success && viewerResult.user) {
          //     viewerUser = viewerResult.user as Record<string, unknown>;
          //     const candidate = viewerResult.user.userId;
          //     if (typeof candidate === "string" && candidate.trim().length) {
          //       userId = candidate.trim();
          //     }
          //   }
          // } catch (error) {
          //   console.warn("Failed to resolve viewer identity", error);
          // }

          let sessionId: Id<"conversationSessions">;

          if (incomingSessionId) {
            sessionId = incomingSessionId as Id<"conversationSessions">;
          } else {
            const created = await fetchMutation(
              api.conversation.createSession,
              {
                config: config ?? undefined,
              }
            );
            sessionId = created.sessionId;
          }

          const QUIZ_SENTINEL = "__QUIZ_RESULTS__";
          const isQuizResults = message.startsWith(QUIZ_SENTINEL);
          const sanitizedMessage = isQuizResults
            ? message.slice(QUIZ_SENTINEL.length).trimStart()
            : message;

          let quizInstruction: string | null = null;

          // const skinIntentClassification = !isQuizResults
          //   ? await classifySkinProfileIntent(sanitizedMessage)
          //   : null;

          if (isQuizResults) {
            try {
              const parsed = JSON.parse(sanitizedMessage || "{}") as {
                answers?: Array<{ question?: string; answer?: string }>;
              };

              const answers = Array.isArray(parsed.answers)
                ? parsed.answers.filter(
                    (entry) =>
                      typeof entry?.question === "string" &&
                      typeof entry?.answer === "string" &&
                      entry.question.trim().length &&
                      entry.answer.trim().length
                  )
                : [];

              if (answers.length) {
                const formattedAnswers = answers.map((entry, index) => {
                  const question = (entry.question ?? "").trim();
                  const answer = (entry.answer ?? "").trim();
                  return `**Q${index + 1}:** ${question}\n**A:** ${answer}`;
                });

                const hiddenAnswersBlock = formattedAnswers.length
                  ? [
                      "Raw survey answers for reasoning only (do NOT mention, paraphrase, or allude to these in your reply):",
                      ...formattedAnswers,
                    ].join("\n\n")
                  : "";

                quizInstruction = [
                  "Skin-type survey completed. Use these answers only to infer the user's most likely skin type and primary skin concerns. Do not restart the survey or suggest routines or next steps unless explicitly requested. Never quote, summarize, or reference the individual survey questions or answers in your response.",
                  hiddenAnswersBlock,
                  "Craft a response using the following Markdown template. Replace the bracketed guidance with your conclusions and keep the structure:",
                  "# 🧪 Skin Analysis Summary\n\n## Skin Type\nYour skin is classified as **{skin type in plain language with a brief explanation of what that means for the user}**.\n\n## Main Concern\nYou are primarily concerned with **{main concern in plain language with one short sentence elaborating on the implication}**.\n\n💡 You have a {skin type phrase} and your main concern is {main concern phrase}.\n\nWould you like me to save this to your profile so I can personalize your future recommendations?",
                ]
                  .filter(Boolean)
                  .join("\n\n");
              }
            } catch (error) {
              console.warn("Failed to parse quiz results payload", error);
            }
          }

          const appendRole = isQuizResults ? "system" : "user";
          const contentToStore = isQuizResults
            ? (quizInstruction ?? sanitizedMessage)
            : sanitizedMessage;

          const appendUser = await fetchMutation(
            api.conversation.appendMessage,
            {
              sessionId,
              role: appendRole,
              content: contentToStore,
            }
          );

          if (appendUser.needsSummary) {
            schedule(
              fetchAction(api.conversation.recomputeSummaries, {
                sessionId,
              })
            );
          }

          const context = await fetchQuery(api.conversation.getContext, {
            sessionId,
          });

          const conversationMessages = augmentMessagesWithAffirmationNote(
            context.messages
          );

          // if (userId) {
          //   try {
          //     const profile =
          //       viewerUser &&
          //       typeof viewerUser === "object" &&
          //       "skinProfile" in viewerUser &&
          //       viewerUser.skinProfile &&
          //       typeof (viewerUser as Record<string, unknown>).skinProfile ===
          //         "object"
          //         ? ((viewerUser as Record<string, unknown>).skinProfile as {
          //             skinType?: string;
          //             skinConcerns?: string[];
          //             ingredientSensitivities?: string[];
          //             updatedAt?: number;
          //           })
          //         : null;

          //     if (profile) {
          //       const normalizeDisplay = (value: string): string =>
          //         value
          //           .split(/[\s_-]+/)
          //           .filter(Boolean)
          //           .map(
          //             (part) =>
          //               part.charAt(0).toUpperCase() +
          //               part.slice(1).toLowerCase()
          //           )
          //           .join(" ");

          //       const joinDisplayList = (
          //         values?: string[]
          //       ): string | undefined => {
          //         if (!Array.isArray(values) || !values.length)
          //           return undefined;
          //         const formatted = values
          //           .map((entry) =>
          //             typeof entry === "string" && entry.trim().length
          //               ? normalizeDisplay(entry.trim())
          //               : null
          //           )
          //           .filter((entry): entry is string => Boolean(entry));
          //         return formatted.length ? formatted.join(", ") : undefined;
          //       };

          //       const parts: string[] = [];
          //       if (typeof profile.skinType === "string") {
          //         parts.push(
          //           `Skin type – ${normalizeDisplay(profile.skinType)}`
          //         );
          //       }
          //       const concernsText = joinDisplayList(profile.skinConcerns);
          //       if (concernsText) {
          //         parts.push(`Skin concerns – ${concernsText}`);
          //       }
          //       const sensitivitiesText = joinDisplayList(
          //         profile.ingredientSensitivities
          //       );
          //       if (sensitivitiesText) {
          //         parts.push(`Ingredient sensitivities – ${sensitivitiesText}`);
          //       }

          //       if (parts.length) {
          //         const updatedAt =
          //           typeof profile.updatedAt === "number"
          //             ? new Date(profile.updatedAt).toISOString()
          //             : null;
          //         const timeline = updatedAt
          //           ? ` (last updated ${updatedAt})`
          //           : "";
          //         const skinProfileContent =
          //           `This is user's skin profile: ${parts.join(" | ")}${timeline}. ` +
          //           "Use these details automatically in routines and product suggestions, and mention them when helpful.";

          //         context.messages.unshift({
          //           role: "system",
          //           content: skinProfileContent,
          //         });
          //       }
          //     }
          //   } catch (error) {
          //     console.warn("Failed to load skin profile", error);
          //   }
          // }

          // if (
          //   skinIntentClassification &&
          //   skinIntentClassification.intent === "profile_update" &&
          //   (skinIntentClassification.skinTypes.length > 0 ||
          //     skinIntentClassification.skinConcerns.length > 0)
          // ) {
          //   const storedProfile =
          //     viewerUser &&
          //     typeof viewerUser === "object" &&
          //     "skinProfile" in viewerUser &&
          //     viewerUser.skinProfile &&
          //     typeof (viewerUser as Record<string, unknown>).skinProfile ===
          //       "object"
          //       ? ((viewerUser as Record<string, unknown>)
          //           .skinProfile as Record<string, unknown>)
          //       : null;

          //   const storedSkinType =
          //     typeof storedProfile?.skinType === "string"
          //       ? storedProfile.skinType
          //       : null;
          //   const storedConcernsArray = Array.isArray(
          //     storedProfile?.skinConcerns
          //   )
          //     ? (storedProfile?.skinConcerns as string[])
          //     : [];
          //   const storedConcerns =
          //     storedConcernsArray.length > 0
          //       ? storedConcernsArray.join(", ")
          //       : null;

          //   const mentionedTypes = skinIntentClassification.skinTypes.length
          //     ? skinIntentClassification.skinTypes.join(", ")
          //     : "none";
          //   const mentionedConcerns = skinIntentClassification.skinConcerns
          //     .length
          //     ? skinIntentClassification.skinConcerns.join(", ")
          //     : "none";

          //   const comparisonInstruction = [
          //     "Skin profile update intent detected in the latest user message.",
          //     `Mentioned skin type(s): ${mentionedTypes}.`,
          //     `Mentioned skin concern(s): ${mentionedConcerns}.`,
          //     `Stored skin type: ${storedSkinType ?? "not set"}.`,
          //     `Stored skin concerns: ${storedConcerns ?? "not set"}.`,
          //     'Before responding, call the "getSkinProfile" tool (unless you have already called it in this turn) to retrieve the saved profile for comparison.',
          //     "After retrieving it, compare the stored values to what the user just shared. If they match, acknowledge that the profile already reflects it. If they differ, ask the user if they want to update their profile or run a survey/analysis before making any changes.",
          //     'Do not call "saveUserProfile" unless the user explicitly confirms they want the update.',
          //   ].join(" ");

          //   context.messages.unshift({
          //     role: "system",
          //     content: comparisonInstruction,
          //   });
          // }ƒ

          context.messages.unshift({
            role: "system",
            content:
              'When the user shares new skin type details, skin concerns, or ingredient sensitivities, first call "getSkinProfile" (unless you already have a fresh result in this turn) to retrieve the stored profile so you can compare. Then acknowledge what they said, mention the recorded values if relevant, and ask whether they would like to update their saved profile or run a survey. Only call the "saveUserProfile" tool after they explicitly confirm the change; skip the tool if they do not confirm or if nothing new needs to be stored.',
          });

          context.messages.unshift({
            role: "system",
            content:
              'Skin profile lookup rule: when the user asks about their own skin type, skin profile, or skin concerns (questions like "what is my skin type?" or "what is my skin profile?"), call "getSkinProfile" before answering. If the tool returns no saved profile, explain we haven\'t captured it yet and invite them to take the SkinBuddy quiz—offer to run "startSkinTypeSurvey" if they want to start it.',
          });

          context.messages.unshift({
            role: "system",
            content:
              'Product recommendation rule: when the user asks for product recommendations but does not provide their skin type or skin concerns in the latest message, first call "getSkinProfile" (unless you already called it in this turn). If the tool returns no stored profile—or it lacks both skin type and concern details—pause and ask the user for that information, offering to start the SkinBuddy quiz before recommending products.',
          });

          console.log(context, "This is conversation history");

          const providerPreference =
            typeof body?.provider === "string"
              ? body.provider.toLowerCase()
              : typeof process.env.CHAT_MODEL_PROVIDER === "string"
                ? process.env.CHAT_MODEL_PROVIDER.toLowerCase()
                : "grok";
          const heavyModel =
            process.env.OPENROUTER_MODEL_GROK ?? "x-ai/grok-4-fast";
          const grokModelFingerprint = heavyModel.toLowerCase();
          const enforceGrokOnly = (candidate?: string) => {
            if (typeof candidate === "string") {
              const trimmed = candidate.trim();
              if (!trimmed.length) return heavyModel;
              const lowered = trimmed.toLowerCase();
              if (
                lowered === grokModelFingerprint ||
                lowered.includes("grok-4")
              ) {
                return heavyModel;
              }
            }
            return heavyModel;
          };
          const modelPresets: Record<string, string> = {
            gemini: heavyModel,
            openai: heavyModel,
            anthropic: heavyModel,
            grok: heavyModel,
          };

          const latestUserInfo = findLastMessageByRole(
            conversationMessages,
            "user"
          );
          const previousAssistantInfo = latestUserInfo.message
            ? findLastMessageByRole(
                conversationMessages,
                "assistant",
                latestUserInfo.index - 1
              )
            : { message: null, index: -1 };

          const toolingDecision = shouldRouteToToolModel(
            latestUserInfo.message,
            previousAssistantInfo.message
          );

          let requestedModel = enforceGrokOnly(body?.model);

          // If the user is on the free plan (or logic dictates), force light model for non-complex queries
          // But for now, we respect the router's decision or default to heavy
          if (!requestedModel) {
            requestedModel = heavyModel;
          }

          // Force temperature to 0 for consistency
          const resolvedTemperature = 0;

          // 4. Prepare tools
          const maxToolRounds =
            typeof body?.maxToolRounds === "number"
              ? Math.max(1, Math.min(body.maxToolRounds, 10))
              : 4;
          const useTools = body?.useTools === false ? false : true;

          const currentDate = new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          let skinProfileInjection = "";
          try {
            const userResult = await fetchQuery(api.users.getUser, {});
            if (userResult.success && userResult.user?.skinProfile) {
              const profile = userResult.user.skinProfile as {
                skinType?: string;
                skinConcerns?: string[];
                ingredientSensitivities?: string[];
                history?: string;
                cycle?: { lastPeriodStart: number; avgCycleLength?: number };
                updatedAt?: number;
              };

              const parts: string[] = [];
              if (profile.skinType) parts.push(`Skin Type: ${profile.skinType}`);
              if (profile.skinConcerns?.length) parts.push(`Concerns: ${profile.skinConcerns.join(", ")}`);
              if (profile.ingredientSensitivities?.length) parts.push(`Sensitivities: ${profile.ingredientSensitivities.join(", ")}`);
              if (profile.history) parts.push(`History/Medications: ${profile.history}`);
              if (profile.cycle) {
                const lastPeriod = new Date(profile.cycle.lastPeriodStart).toLocaleDateString();
                parts.push(`Cycle: Last period ${lastPeriod}, Length ${profile.cycle.avgCycleLength ?? 28} days`);
              }

              if (parts.length) {
                skinProfileInjection = `
\n=== CURRENT USER PROFILE (AUTO-INJECTED) ===
${parts.join("\n")}
===========================================
NOTE: This profile is already loaded. Do NOT call 'getSkinProfile' to view it.
Only call 'getSkinProfile' if you suspect the data is stale or if the user explicitly asks to check what is saved.
To UPDATE this profile, use 'saveUserProfile'.
`;
              }
            }
          } catch (error) {
            console.warn("Failed to inject skin profile:", error);
          }

          const systemPromptWithDate = `${DEFAULT_SYSTEM_PROMPT}\n\nCURRENT DATE: ${currentDate}${skinProfileInjection}`;



          const completion = await callOpenRouter({
            messages: conversationMessages,
            systemPrompt: systemPromptWithDate,
            model: requestedModel,
            temperature: resolvedTemperature,
            useTools,
            maxToolRounds,
            onToken: async (token) => {
              if (!token) return;
              await send({ type: "delta", token });
            },
            onSummary: async (summaryChunk) => {
              if (!summaryChunk || typeof summaryChunk !== "object") return;
              const signature = JSON.stringify(summaryChunk);
              if (signature === streamedSummarySignature) return;
              streamedSummarySignature = signature;
              await send({ type: "summary", summary: summaryChunk });
            },
            onProducts: async (productsChunk, productsContext) => {
              if (!Array.isArray(productsChunk) || !productsChunk.length)
                return;
              const sanitized = sanitizeProducts(productsChunk);
              const signature = JSON.stringify(
                (sanitized.length ? sanitized : productsChunk).map(
                  (product, index) => {
                    if (!product || typeof product !== "object") {
                      return `product-${index}`;
                    }
                    const record = product as Record<string, unknown>;
                    return (
                      (record.productId && String(record.productId)) ||
                      (record._id && String(record._id)) ||
                      (record.id && String(record.id)) ||
                      (record.slug && String(record.slug)) ||
                      (record.categoryName && String(record.categoryName)) ||
                      `product-${index}`
                    );
                  }
                )
              );
              if (signature === streamedProductSignature) return;
              streamedProductSignature = signature;
              const contextPayload =
                productsContext && productsContext.type === "products"
                  ? {
                      headlineHint: productsContext.headlineHint,
                      intentHeadlineHint: productsContext.intentHeadlineHint,
                      headlineSourceRecommendation:
                        productsContext.headlineSourceRecommendation,
                      iconSuggestion: productsContext.iconSuggestion,
                    }
                  : undefined;
              await send({
                type: "products",
                products: productsChunk,
                headlineHint: contextPayload?.headlineHint,
                intentHeadlineHint: contextPayload?.intentHeadlineHint,
                headlineSourceRecommendation:
                  contextPayload?.headlineSourceRecommendation,
                iconSuggestion: contextPayload?.iconSuggestion,
              });
            },
            onRoutine: async (routineChunk) => {
              const sanitized = sanitizeRoutine(routineChunk);
              if (!sanitized || !sanitized.steps.length) return;
              const signature = JSON.stringify(
                sanitized.steps.map((step, index) => {
                  return (
                    step.productId ||
                    step.slug ||
                    step.productSlug ||
                    `routine-${step.step ?? index}`
                  );
                })
              );
              if (signature === streamedRoutineSignature) return;
              streamedRoutineSignature = signature;
              await send({ type: "routine", routine: routineChunk });
            },
          });

          const assistantMessage = completion.reply ?? "";
          const { main: assistantMain, suggestedActions } =
            splitAssistantReply(assistantMessage);
          const normalizedSuggestions = Array.from(
            new Set(
              (suggestedActions ?? [])
                .map(scrubToolLanguage)
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0)
                .slice(0, 3)
            )
          );
          const cleanedMain = normalizeListSpacing(
            scrubToolLanguage(assistantMain)
          );
          const trimmedMain = cleanedMain.trimEnd();
          let storedAssistantMessage = trimmedMain;
          let finalReply = trimmedMain;

          if (!trimmedMain.length) {
            const fallbackMain =
              "Got it — I'll take care of that now. If you'd like, I can keep helping with anything else.";
            storedAssistantMessage = fallbackMain;
            const trimmedAssistant = scrubToolLanguage(
              assistantMessage.trim()
            );

            finalReply =
              trimmedAssistant.length && trimmedAssistant !== fallbackMain
                ? `${fallbackMain}\n\n${trimmedAssistant}`
                : fallbackMain;
          } else {
            storedAssistantMessage = trimmedMain;
            finalReply = cleanedMain.trimEnd();
          }

          const startSkinTypeQuiz = completion.startSkinTypeQuiz ?? false;
          // many tool outputs in one api iteration or loop
          const toolOutputs = completion.toolOutputs ?? [];
          // latest product to frontend
          const products = completion.products ?? [];
          const resultType = completion.resultType;
          const routine = completion.routine;
          const summary = completion.summary;

          storedAssistantMessage = trimmedMain;

          // const persistToolOutputs = toolOutputs.filter((output) => {
          //   return (
          //     output.name === "searchProductsByQuery" ||
          //     output.name === "recommendRoutine"
          //   );
          // });

          // we are saving here
          // yh, this makes sense let us only persist the products or routines we are sending to the frontend

          // we already combined the toolOutput products into one array
          // if (products.length || routine?.steps.length) {

          // As far as product is being sent to the frontend lets save it manually

          const sanitizedProducts = sanitizeProducts(products);

          const latestProductTool = [...toolOutputs]
            .slice()
            .reverse()
            .find((output) =>
              [
                "searchProductsByQuery",
                "getProduct",
                "getAllProducts",
              ].includes(output.name)
            );

          if (sanitizedProducts.length) {
            schedule(
              fetchMutation(api.conversation.appendMessage, {
                sessionId,
                role: "tool",
                content: JSON.stringify({
                  name: latestProductTool?.name ?? "searchProductsByQuery",
                  products: sanitizedProducts,
                }),
              })
            );
          }

          // Same for routine too

          const sanitizedRoutine = sanitizeRoutine(routine);

          console.log(sanitizedRoutine, "this is the routine");

          if (sanitizedRoutine && sanitizedRoutine.steps.length) {
            schedule(
              fetchMutation(api.conversation.appendMessage, {
                sessionId,
                role: "tool",
                content: JSON.stringify({
                  name: "recommendRoutine",
                  routine: sanitizedRoutine,
                }),
              })
            );
          }

          const storedAssistantTrimmed = storedAssistantMessage.trim();

          if (!startSkinTypeQuiz && storedAssistantTrimmed.length) {
            schedule(
              fetchMutation(api.conversation.appendMessage, {
                sessionId,
                role: "assistant",
                content: storedAssistantTrimmed,
              }).then((result) => {
                if (result?.needsSummary) {
                  return fetchAction(api.conversation.recomputeSummaries, {
                    sessionId,
                  });
                }
              })
            );
          }

          if (startSkinTypeQuiz) {
            console.log("sending start skin quiz to frontend");
            await send({ type: "skin_survey.start", sessionId });
          } else {
            await send({
              type: "final",
              reply: finalReply,
              sessionId,
              toolOutputs,
              products,
              resultType,
              routine,
              summary,
              suggestions: normalizedSuggestions.length
                ? normalizedSuggestions
                : undefined,
            });
          }
        } catch (error: unknown) {
          console.error("Error generating response", error);

          await send({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unexpected error occurred",
          });
        } finally {
          finalize();
        }
      })();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
