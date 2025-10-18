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

  const selectionMessages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are a meticulous skincare merchandiser. You will select the best matches from the provided candidate list. Only choose from the candidates and never invent new products. Your response must call the selectProducts function.",
    },
    {
      role: "user",
      content: `User request:\n${userRequest || "(not provided)"}\n\nCandidates (JSON):\n${JSON.stringify(
        summaries,
        null,
        2
      )}\n\nCall the selectProducts function with your ranked picks and reasons.`,
    },
  ];

  try {
    const selection = await openai.chat.completions.create({
      model,
      temperature: 0,
      messages: selectionMessages,
      tools: [
        {
          type: "function",
          function: {
            name: "selectProducts",
            description:
              "Select the best products for the user from the candidate list.",
            parameters: selectProductsParameters,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "selectProducts" },
      },
    });

    const toolCall = selection.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function" || !toolCall.function) {
      return { products: limitedCandidates };
    }

    if (toolCall.function.name !== "selectProducts") {
      return { products: limitedCandidates };
    }

    const rawArguments = toolCall.function.arguments ?? "{}";
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
}: {
  messages: ChatMessage[];
  systemPrompt: string;
  model?: string;
  temperature?: number;
  useTools?: boolean;
  maxToolRounds?: number;
  onToken?: (chunk: string) => Promise<void> | void;
}): Promise<{
  reply: string;
  toolOutputs?: ToolOutput[];
  products?: unknown[];
  resultType?: "routine";
  routine?: RoutineSelection;
  summary?: ReplySummary;
  updatedContext?: object;
}> {
  const tools = toolSpecs;

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
  ];

  for (const msg of messages) {
    const mappedRole = msg.role === "tool" ? "assistant" : msg.role;
    chatMessages.push({ role: mappedRole, content: msg.content });
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

  // console.log(chatMessages, "This is conversation history");

  // messages.push({ role: "user", content: userMessage });

  const streamCompletion = async (
    forceFinal: boolean
  ): Promise<{
    content: string;
    toolCalls: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  }> => {
    const toolCallMap = new Map<
      number,
      {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }
    >();

    let content = "";

    const stream = await openai.chat.completions.create({
      model,
      temperature,
      messages: chatMessages,
      tools,
      tool_choice: useTools ? (forceFinal ? "none" : "auto") : "none",
      stream: true,
    });

    for await (const part of stream) {
      const choice = part.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta ?? {};

      if (delta.content) {
        content += delta.content;
        if (onToken) {
          await onToken(delta.content);
        }
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const toolDelta of delta.tool_calls) {
          const index = toolDelta.index ?? 0;
          const existing = toolCallMap.get(index) ?? {
            id: toolDelta.id ?? `call_${index}`,
            type: "function" as const,
            function: { name: "", arguments: "" },
          };
          if (toolDelta.id) existing.id = toolDelta.id;
          if (toolDelta.function?.name) {
            existing.function.name = toolDelta.function.name;
          }
          if (toolDelta.function?.arguments) {
            existing.function.arguments += toolDelta.function.arguments;
          }
          toolCallMap.set(index, existing);
        }
      }
    }

    const toolCalls = Array.from(toolCallMap.values());

    if (toolCalls.length) {
      chatMessages.push({
        role: "assistant",
        content: "",
        tool_calls: toolCalls,
      });
    } else {
      chatMessages.push({
        role: "assistant",
        content,
      });
    }

    return { content, toolCalls };
  };

  let rounds = 0;
  const toolOutputs: ToolOutput[] = [];

  let finalContent = "";
  let lastRoutine: RoutineSelection | null = null;
  let lastResultType: "routine" | null = null;
  let lastSummary: ReplySummary | null = null;

  console.log("calling openAi");

  // main
  while (true) {
    const { content, toolCalls } = await streamCompletion(
      rounds >= maxToolRounds
    );

    if (useTools && toolCalls.length > 0 && rounds < maxToolRounds) {
      rounds++;

      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") {
          chatMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: true,
              message: `Unsupported tool type: ${toolCall.type}`,
            }),
          });
          continue;
        }

        try {
          const rawArgs =
            typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments || "{}")
              : (toolCall.function.arguments ?? {});

          console.log(`Executing tool: ${toolCall.function.name}`, rawArgs);

          const toolDef = getToolByName(toolCall.function.name);
          if (!toolDef) {
            throw new Error(`Unknown tool: ${toolCall.function.name}`);
          }

          const validatedArgs = toolDef.schema.parse(rawArgs);

          const result = await toolDef.handler(validatedArgs);

          // console.log(result, "This is the result of the tool call");

          // we are building tool outputs for multiple tool calling iteration
          toolOutputs.push({
            name: toolCall.function.name,
            arguments: validatedArgs,
            result: result ?? null,
          });

          // result: {recommendations: []}

          // pushing the tool reslult here
          chatMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result ?? {}),
          });
        } catch (err) {
          console.error(
            `Tool execution error (${toolCall.function?.name ?? "unknown"}):`,
            err
          );
          chatMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
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
      lastSummary = null;

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

      if (latestRoutineOutput) {
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
          const concernPhrase = concernsPretty.length
            ? concernsPretty.join(", ")
            : undefined;
          const routineHeadlineParts = [
            skinTypePretty ? `${skinTypePretty} Skin` : null,
            concernPhrase ? `+ ${concernPhrase}` : null,
          ].filter(Boolean);
          const routineHeadline =
            routineHeadlineParts.length > 0
              ? `Routine for ${routineHeadlineParts.join(" ")}`
              : skinTypePretty
                ? `Routine for ${skinTypePretty} Skin`
                : "Personalized Routine";
          const stepCount = normalizedSteps.length;
          const stepLabel = stepCount === 1 ? "1 step" : `${stepCount} steps`;
          const summaryDetails: string[] = [stepLabel];
          if (skinTypePretty) {
            summaryDetails.push(`skin type: ${skinTypePretty.toLowerCase()}`);
          }
          if (concernsPretty.length) {
            summaryDetails.push(
              `concerns: ${concernsPretty
                .map((item) => item.toLowerCase())
                .join(", ")}`
            );
          }
          lastSummary = {
            icon: "🧪",
            headline: routineHeadline,
            subheading: `Tailored ${summaryDetails.join(" · ")}`,
          };

          const routineSummary = normalizedSteps
            .map((step) => {
              if (step === null || step === undefined) return null; // Added explicit null check for step
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
              return `${
                step?.step !== undefined && step?.step !== null
                  ? `Step ${step.step}`
                  : ""
              }: ${label}${productName ? ` · ${productName}` : ""}`;
            })
            .filter((entry): entry is string => entry !== null) // Filter out nulls after mapping
            .slice(0, 5)
            .join(" | ");

          if (routineSummary.length) {
            chatMessages.push({
              role: "developer",
              content:
                "Routine outline (do not enumerate verbatim): " +
                routineSummary,
            });
          }

          if (lastRoutine?.notes) {
            chatMessages.push({
              role: "developer",
              content:
                "Routine notes (context only, paraphrase if helpful): " +
                lastRoutine.notes,
            });
          }

          chatMessages.push({
            role: "developer",
            content:
              "Explain how this full routine supports the user's skin goals. Reference the routine collectively (Step 1 cleanser, Step 2 serum, etc.) in a concise paragraph, and invite follow-up like swapping a step or learning usage tips.",
          });

          continue;
        }
      }

      const productsArray =
        toolOutputs.length > 0 ? normalizeProductsFromOutputs(toolOutputs) : [];

      // console.log(productsArray, "This is the product array");

      // routine object {category: "", description: "", product: ""}
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

        lastProductSelection = selectedProducts;
        if (selectedProducts.length) {
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
              ? searchArgs.nameQuery
              : undefined;
          const brandQuery =
            typeof searchArgs.brandQuery === "string"
              ? searchArgs.brandQuery
              : undefined;
          const skinTypes = Array.isArray(searchArgs.skinTypes)
            ? searchArgs.skinTypes
            : [];
          const skinConcerns = Array.isArray(searchArgs.skinConcerns)
            ? searchArgs.skinConcerns
            : [];
          const ingredientQueries = Array.isArray(searchArgs.ingredientQueries)
            ? searchArgs.ingredientQueries
            : [];

          const hasMeaningfulFilters =
            Boolean(category) ||
            Boolean(nameQuery) ||
            Boolean(brandQuery) ||
            skinTypes.length > 0 ||
            skinConcerns.length > 0 ||
            ingredientQueries.length > 0;

          if (hasMeaningfulFilters) {
            const skinPhrase = skinTypes
              .map((type) => `${toTitleCase(type)} skin`)
              .join(" & ");
            const concernPhrase = skinConcerns
              .map((concern) => toTitleCase(concern))
              .join(" & ");
            const categoryPhrase = category ? toTitleCase(category) : undefined;
            const nameOrBrand = nameQuery ?? brandQuery;

            const headlineFragments: string[] = [];
            if (categoryPhrase && skinPhrase) {
              headlineFragments.push(
                `${skinPhrase.toLowerCase()} ${categoryPhrase.toLowerCase()}`
              );
            } else if (categoryPhrase) {
              headlineFragments.push(categoryPhrase.toLowerCase());
            }
            if (skinPhrase && !headlineFragments.length) {
              headlineFragments.push(skinPhrase.toLowerCase());
            }
            if (concernPhrase) {
              headlineFragments.push(concernPhrase.toLowerCase());
            }
            if (!headlineFragments.length && nameOrBrand) {
              headlineFragments.push(nameOrBrand);
            }

            const headlineDescription = headlineFragments.length
              ? headlineFragments.join(" with ")
              : "your skincare request";
            const headline = `Product suggestions for ${headlineDescription}`;

            const subheadingParts: string[] = [];
            if (categoryPhrase) {
              subheadingParts.push(`category: ${categoryPhrase}`);
            }
            if (skinTypes.length) {
              subheadingParts.push(
                `skin type: ${skinTypes
                  .map((type) => toTitleCase(type))
                  .join(", ")}`
              );
            }
            if (skinConcerns.length) {
              subheadingParts.push(
                `concerns: ${skinConcerns
                  .map((concern) => toTitleCase(concern))
                  .join(", ")}`
              );
            }
            if (ingredientQueries.length) {
              subheadingParts.push(
                `actives: ${ingredientQueries
                  .map((ingredient) => ingredient.toLowerCase())
                  .join(", ")}`
              );
            }
            if (brandQuery && !nameQuery) {
              subheadingParts.push(`brand: ${toTitleCase(brandQuery)}`);
            }

            lastSummary = {
              icon: "💧",
              headline,
              subheading: subheadingParts.length
                ? `Here are the products I found ${subheadingParts.join(
                    " · "
                  )}.`
                : undefined,
            };
          }
        }

        const reasonContext = selectedProducts
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

  // it is the reply that is being saved in conversation history
  return {
    reply: replyText,
    toolOutputs,
    products: productsPayload.length ? productsPayload : undefined,
    resultType: lastResultType ?? undefined,
    routine: lastRoutine ?? undefined,
    summary: lastSummary ?? undefined,
  };
}
