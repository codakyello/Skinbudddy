import OpenAI from "openai";
import { DEFAULT_SYSTEM_PROMPT } from "../utils";
import { Id } from "@/convex/_generated/dataModel";
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

const normalizeProductsFromOutputs = (outputs: ToolOutput[]): unknown[] => {
  const candidateKeys = ["products", "results", "items", "recommendations"];
  const byId = new Map<string, unknown>();

  outputs.forEach((output) => {
    const result = output?.result;
    if (!result || typeof result !== "object") return;
    const record = result as UnknownRecord;

    candidateKeys.forEach((key) => {
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

type ProductCandidate = Record<string, any>;

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

    const sizes = Array.isArray(product.sizes)
      ? product.sizes
          .slice(0, 5)
          .map((size: any) => {
            if (!size || typeof size !== "object") return null;
            const label =
              typeof size.name === "string"
                ? size.name
                : [size.size, size.unit]
                    .map((value: unknown) =>
                      typeof value === "number"
                        ? String(value)
                        : typeof value === "string"
                          ? value
                          : ""
                    )
                    .filter(Boolean)
                    .join(" ");

            return {
              label: label || undefined,
              price:
                typeof size.price === "number" ? Number(size.price) : undefined,
              currency:
                typeof size.currency === "string" ? size.currency : undefined,
            };
          })
          .filter(Boolean)
      : [];

    const prices = sizes
      .map((size: any) => size?.price)
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
  sessionId,
  model = "gpt-4o-mini",
  temperature = 1,
  useTools = true,
  maxToolRounds = 5, // prevent runaway loops
  onToken,
}: {
  messages: ChatMessage[];
  systemPrompt: string;
  sessionId: Id<"conversationSessions">;
  model?: string;
  temperature?: number;
  useTools?: boolean;
  maxToolRounds?: number;
  onToken?: (chunk: string) => Promise<void> | void;
}): Promise<{
  reply: string;
  toolOutputs?: ToolOutput[];
  products?: unknown[];
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
      "For every final reply, append a heading 'Suggested actions' followed by exactly three numbered follow-up prompts (plain text, no emojis) that the user could tap next. Each suggestion must read like a direct request the user could send (e.g., 'Yes, please provide more details about the cleanser options.' or 'Can you recommend a good exfoliator for oily skin?'). Always provide three suggestions, even if they need to be broader to keep the user moving forward.",
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

  console.log("calling openAi");

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

          // so here, when the llm needs to know about a product it calls this
          // for nameQuery, when the name is identical the same we only send that one out
          // when not identical we display options
          const result = await toolDef.handler(validatedArgs);

          console.log(result, "This is the result of the tool call");

          // we are building tool outputs for multiple tool calling iteration
          toolOutputs.push({
            name: toolCall.function.name,
            arguments: validatedArgs,
            result: result ?? null,
          });

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

      const productsArray =
        toolOutputs.length > 0 ? normalizeProductsFromOutputs(toolOutputs) : [];

      if (productsArray.length) {
        let refinedProductsResult: {
          products: ProductCandidate[];
          notes?: string;
        } | null = null;

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

    finalContent = content;
    break;
  }

  const products =
    lastProductSelection.length > 0
      ? lastProductSelection
      : toolOutputs.length > 0
        ? normalizeProductsFromOutputs(toolOutputs)
        : [];

  finalContent = finalContent.trimEnd();

  const replyText = products.length
    ? finalContent.trim().length
      ? finalContent
      : "💧 I rounded up a few options that should fit nicely—happy to break any of them down further or pop one into your bag!"
    : finalContent;

  // it is the reply that is being saved in conversation history
  return {
    reply: replyText,
    toolOutputs,
    products: products.length ? products : undefined,
  };
}
