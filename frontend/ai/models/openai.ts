import OpenAI from "openai";
import { DEFAULT_SYSTEM_PROMPT } from "../utils";
import { Id } from "@/convex/_generated/dataModel";
import { toolSpecs, getToolByName } from "../tools/localTools";

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
          const result = await toolDef.handler(validatedArgs);

          toolOutputs.push({
            name: toolCall.function.name,
            arguments: validatedArgs,
            result: result ?? null,
          });

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
        chatMessages.push({
          role: "developer",
          content:
            "You have the products returned in the previous tool call. Write one friendly paragraph (1–2 sentences) explaining how the selection fits the user. Do not enumerate the individual products; reference them collectively (e.g., 'The cleansers above…') and offer to help with next steps like adding to cart, comparing, or getting more detail.",
        });
      }

      continue;
    }

    finalContent = content;
    break;
  }

  const products =
    toolOutputs.length > 0 ? normalizeProductsFromOutputs(toolOutputs) : [];

  let displayProducts = false;
  const markerMatch = finalContent.match(
    /\[\[DISPLAY_PRODUCTS:(true|false)\]\]\s*$/i
  );
  if (markerMatch) {
    displayProducts = markerMatch[1].toLowerCase() === "true";
    finalContent = finalContent.slice(0, markerMatch.index).trimEnd();
  }
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
