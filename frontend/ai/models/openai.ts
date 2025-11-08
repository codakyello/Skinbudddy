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
  formatPriceRangeLabel,
  generateReplySummaryWithLLM,
  normalizeProductsFromOutputs,
  openai,
  pickProductIcon,
  refineProductSelection,
  sanitizeToolResultForModel,
  sentenceCase,
  toTitleCase,
} from "../utils";
import {
  mapDescriptorsToBenefits,
  resolveSkinType,
} from "../../shared/skinMappings";
import { toolSpecs, getToolByName } from "../tools/localTools";
import {
  ChatMessage,
  ProductCandidate,
  ProductSummaryContext,
  ReplySummary,
  RoutineProductOption,
  RoutineSelection,
  RoutineStepCandidate,
  SummaryContext,
  ToolOutput,
  UnknownRecord,
} from "../types";

// gpt-4o-mini
// gpt-4.1-nano
// gpt-5-nano

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
  userId,
}: {
  messages: ChatMessage[];
  systemPrompt: string;
  model?: string;
  temperature?: number;
  useTools?: boolean;
  maxToolRounds?: number;
  onToken?: (chunk: string) => Promise<void> | void;
  onProducts?: (
    products: ProductCandidate[],
    context?: ProductSummaryContext | null
  ) => Promise<void> | void;
  onRoutine?: (routine: RoutineSelection) => Promise<void> | void;
  onSummary?: (summary: ReplySummary) => Promise<void> | void;
  userId?: string;
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
    content: [
      "For every final reply, append a heading 'Suggested actions' with exactly three numbered prompts (plain text, no emojis). Keep each suggestion under 12 words, phrase it as a first-person request the user could send (e.g., 'Show me a gentle cleanser for oily skin'), vary the angle, and only mention a specific product if it already appeared in this turn.",
      "Even if your reply is brief, include at least one conversational sentence before the 'Suggested actions' block that keeps the dialogue moving—offer complementary products, ask if they want comparisons, or suggest the next logical step—and make sure those suggestions reflect the user’s latest request.",
      "Open every reply with a calm, matter-of-fact statement (e.g., 'Here are a few moisturizers...'); avoid celebratory or hypey openers like 'Great news!' unless the user explicitly expresses excitement.",
      "Whenever the user shares skin type, concerns, or ingredient sensitivities, call `getSkinProfile` (unless already done this turn) to compare against what’s stored; mention current values, ask whether they want to update or run the survey before editing, and only call `saveUserProfile` after explicit confirmation. Reference the stored profile when crafting routines or summarizing it when asked.",
      "If they want recommendations but haven’t provided skin type/concerns, fetch the profile first. If it lacks those details, ask for them or offer the SkinBuddy quiz before suggesting products. When they explicitly command 'start skin survey/quiz', call `startSkinTypeSurvey` immediately with no prose; if they’re only curious, explain the survey and seek confirmation. Never infer skin type from context—use tool data only.",
      "Keep tool arguments precise: outcomes like hydrating/brightening belong in `benefits`, actual actives in `ingredientQueries`, exact product titles in `nameQuery`, and canonical nouns (cleanser, serum, sunscreen, toner, moisturizer) in `categoryQuery`. Drop any argument you can’t confidently classify.",
      "Add-to-cart tooling is disabled—if asked, say you can’t add items directly and keep assisting with recommendations or comparisons.",
      "When products have multiple sizes/variants, list each option with size label and price before asking the user to choose, and format those options as a numbered list (1., 2., …) with proper currency formatting.",
      "Reuse existing tool data whenever possible: if the user wants deeper product info, inspect previous outputs before calling `getProduct`. When describing a product, follow the heading + bullet layout (Overview, Key Ingredients, Sizes, Skin Types, Usage, Highlights) and stick to the provided descriptions, ingredients, and benefits.",
      "Only treat true actives as `ingredientQueries`; descriptors like 'hydrating cleanser' belong in categories or benefits. If a search returns no matches, state it plainly before suggesting next steps, and never expose internal tools, user IDs, or implementation details in user-facing replies.",
    ].join(" "),
  });

  const latestUserMessageContent = [...messages]
    .reverse()
    .find((msg) => msg.role === "user")?.content;

  const conversationUserId = (() => {
    if (typeof userId === "string" && userId.trim().length) {
      return userId.trim();
    }
    for (let index = messages.length - 1; index >= 0; index--) {
      const entry = messages[index];
      if (entry?.role !== "user") continue;
      if (typeof entry.content !== "string") continue;
      const match = entry.content.match(/My userId:\s*([^\s]+)/i);
      if (!match || match.length < 2) continue;
      const candidate = match[1].trim();
      if (!candidate.length) continue;
      const lowered = candidate.toLowerCase();
      if (lowered === "undefined" || lowered === "null") continue;
      return candidate;
    }
    return undefined;
  })();

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

  let lastProductSelection: ProductCandidate[] = [];
  let lastStreamedProductsSignature: string | null = null;
  let lastStreamedRoutineSignature: string | null = null;
  let lastStreamedSummarySignature: string | null = null;

  let routineSummaryParts: ReplySummary | null = null;
  let productSummaryParts: ReplySummary | null = null;
  let combinedSummary: ReplySummary | null = null;
  let startSkinTypeQuiz = false;
  let terminateAfterTool = false;

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
      let historicalToolCounter = 0;
      for (const msg of chatMessages) {
        if (msg.role === "tool") {
          const callId =
            msg.tool_call_id && typeof msg.tool_call_id === "string"
              ? msg.tool_call_id
              : `hist_tool_${historicalToolCounter++}`;
          const toolName =
            msg.tool_name && typeof msg.tool_name === "string"
              ? msg.tool_name
              : "historical_tool";
          const toolArgumentsString =
            msg.tool_arguments && typeof msg.tool_arguments === "string"
              ? msg.tool_arguments
              : "{}";
          items.push({
            type: "function_call",
            call_id: callId,
            name: toolName,
            arguments: toolArgumentsString,
          });
          items.push({
            type: "function_call_output",
            call_id: callId,
            output:
              typeof msg.content === "string" && msg.content.length
                ? msg.content
                : "{}",
          });
          continue;
        }

        const roleForMessage =
          msg.role === "developer" ||
          msg.role === "system" ||
          msg.role === "user" ||
          msg.role === "assistant"
            ? msg.role
            : "user";

        items.push({
          type: "message",
          role: roleForMessage,
          content: msg.content,
        });
      }

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
    products: ProductCandidate[],
    context?: ProductSummaryContext | null
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
      await onProducts(products, context);
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
    console.log("This is how many times we have called openAi " + (rounds + 1));
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

      // Execute tool calls and log outputs into the transcript for the next round
      let toolExecutionIndex = 0;
      for (const toolCall of toolCalls) {
        const callId =
          toolCall.call_id ||
          toolCall.id ||
          `fc_${rounds}_${toolExecutionIndex++}_${Date.now()}`;
        toolCall.call_id = callId;
        toolCall.id = callId;

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
            const userMessageTokens =
              typeof latestUserMessageContent === "string"
                ? tokenizeDescriptor(latestUserMessageContent)
                : [];
            const userSkinTypesMentioned = new Set<
              ReturnType<typeof resolveSkinType>
            >();
            userMessageTokens.forEach((token) => {
              const resolvedType = resolveSkinType(token);
              if (resolvedType) {
                userSkinTypesMentioned.add(resolvedType);
              }
            });
            const userBenefitHints =
              typeof latestUserMessageContent === "string"
                ? mapDescriptorsToBenefits([
                    latestUserMessageContent,
                    ...userMessageTokens,
                  ])
                : { benefits: [] as string[], residual: [] as string[] };
            const userBenefitSet = new Set(userBenefitHints.benefits);

            const existingBenefitsRaw = Array.isArray(argsRecord.benefits)
              ? argsRecord.benefits.filter(
                  (entry): entry is string => typeof entry === "string"
                )
              : [];

            existingBenefitsRaw.forEach((entry) => {
              const normalized = normalizeBenefitSlug(entry);
              if (normalized) benefitAccumulator.add(normalized);
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

            if (originalNameQuery.length) {
              const nameTokens = tokenizeDescriptor(originalNameQuery);
              if (nameTokens.length) {
                const { benefits: nameBenefits, residual: nameResidual } =
                  mapDescriptorsToBenefits(nameTokens);

                nameBenefits.forEach((benefit) =>
                  benefitAccumulator.add(benefit)
                );

                addBenefitsFromDescriptors([originalNameQuery]);

                if (nameResidual.length === 0) {
                  delete argsRecord.nameQuery;
                } else if (nameResidual.length !== nameTokens.length) {
                  argsRecord.nameQuery = nameResidual.join(" ");
                }
              }
            }

            addBenefitsFromDescriptors(unmatchedExistingBenefits);

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
              userBenefitSet.size > 0
            ) {
              userBenefitSet.forEach((benefit) =>
                benefitAccumulator.add(benefit)
              );
              mergedBenefits = Array.from(benefitAccumulator);
            }

            const userMentionedSkinType = userSkinTypesMentioned.size > 0;
            const userMentionedExplicitBenefit = userBenefitSet.size > 0;

            if (mergedBenefits.length) {
              if (!userMentionedExplicitBenefit && userMentionedSkinType) {
                delete argsRecord.benefits;
              } else {
                argsRecord.benefits = mergedBenefits;
              }
            } else {
              delete argsRecord.benefits;
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
              originalNameQuery
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
                changes.push("skinConcerns cleared");
              }
            }

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

          if (toolCall.name === "saveUserProfile") {
            const sanitizedArgs =
              adjustedArgs && typeof adjustedArgs === "object"
                ? { ...(adjustedArgs as Record<string, unknown>) }
                : {};
            if (sanitizedArgs && typeof sanitizedArgs === "object") {
              delete (sanitizedArgs as Record<string, unknown>).userId;
            }
            serializedArgsForHistory = JSON.stringify(sanitizedArgs ?? {});
          } else {
            serializedArgsForHistory = JSON.stringify(adjustedArgs ?? {});
          }

          console.log(`Executing tool: ${toolCall.name}`, adjustedArgs);

          const result = await toolDef.handler(adjustedArgs);

          console.log(result, "This is the result of the tool call");

          const toolOutputArgs =
            toolCall.name === "saveUserProfile"
              ? (() => {
                  if (!adjustedArgs || typeof adjustedArgs !== "object") {
                    return adjustedArgs;
                  }
                  const clone = {
                    ...(adjustedArgs as Record<string, unknown>),
                  };
                  delete clone.userId;
                  return clone;
                })()
              : adjustedArgs;

          toolOutputs.push({
            name: toolCall.name,
            arguments: toolOutputArgs,
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
            "The latest product search returned no matches. Tell the user plainly that nothing matching their request is in stock before offering suggestions.",
        });
      }

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
            minPrice?: number;
            maxPrice?: number;
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
        const minPrice =
          typeof searchArgs.minPrice === "number" &&
          Number.isFinite(searchArgs.minPrice)
            ? searchArgs.minPrice
            : undefined;
        const maxPrice =
          typeof searchArgs.maxPrice === "number" &&
          Number.isFinite(searchArgs.maxPrice)
            ? searchArgs.maxPrice
            : undefined;
        const resolvedPriceLabel = formatPriceRangeLabel(minPrice, maxPrice);

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
        const explicitBenefitFilters = rawBenefits;
        const derivedBenefitList = Array.from(derivedBenefits);
        const benefitsForIcon = explicitBenefitFilters.length
          ? explicitBenefitFilters
          : derivedBenefitList;
        const benefitPhraseRaw = describeBenefits(explicitBenefitFilters);
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
          skinTypes: effectiveSkinTypes,
          skinConcerns: normalizedConcerns,
          benefitsList: explicitBenefitFilters,
          priceLabel: resolvedPriceLabel,
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

        const intentHeadline = undefined;
        const recommendedSource = "filters";

        const productIcon = pickProductIcon({
          categoryHint: normalizedCategory ?? category,
          benefits: benefitsForIcon,
          intentHeadline,
        });

        const llmHeadline = summaryHeadline;

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
          headlineHint: llmHeadline,
          intentHeadlineHint: intentHeadline,
          headlineSourceRecommendation: recommendedSource,
          filterDescription: summarySubheading ?? selectionNote,
        };

        productSummaryParts = {
          headline: llmHeadline,
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
        const userQuestionContext = latestUserMessageContent
          ? `User's original question: "${latestUserMessageContent}"\n\n`
          : "";
        chatMessages.push({
          role: "developer",
          content:
            userQuestionContext +
            "You have the products returned in the previous tool call. Use the actual product data to answer the user's question with a concise overview explaining why these picks match their skin type, concerns, or filters. Unless the user explicitly requested details about a specific product (e.g., “tell me about [product name]”), keep the response high-level and talk about the collection as a whole rather than breaking down each item. If they did ask for details, provide comprehensive information for the requested product(s) using the tool data (brand name, exact description, key ingredients, benefits) and never invent texture or sensory notes. Finish with 2–3 conversational follow-up suggestions tailored to this context (e.g., “Want to see more options?”, “Curious about ingredients?”, “Should I compare these?”, “Ready to add one to your cart?”).",
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
  if (!finalContent.length) {
    finalContent = "All set—what would you like me to do next?";
  }

  const replyText = productsPayload.length
    ? finalContent.length
      ? finalContent
      : ""
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
    startSkinTypeQuiz,
  };
}
