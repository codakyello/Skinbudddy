import OpenAI from "openai";
import { DEFAULT_SYSTEM_PROMPT } from "../utils";
import { connectSkinbuddyMcp } from "../mcp/client";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// lets connect to the mcp server here

// gpt-4o-mini
// gpt-4.1-nano
// gpt-5-nano
type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool" | "developer";
  content: string;
  tool_call_id?: string;
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
  const mcpClient = await connectSkinbuddyMcp();

  console.log("connected to mcp server");

  const toolsResult = await mcpClient.listTools();

  const tools = toolsResult.tools.map((tool) => {
    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as any,
      },
    };
  });

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
  ];

  for (const msg of messages) {
    const mappedRole = msg.role === "tool" ? "assistant" : msg.role;
    chatMessages.push({ role: mappedRole, content: msg.content });
  }

  // console.log(chatMessages, "This is conversation history");

  // messages.push({ role: "user", content: userMessage });

  // Helper to make a model call
  const call = async (forceFinal = false) => {
    return openai.chat.completions.create({
      model,
      temperature,
      messages: chatMessages,
      tools,
      // Force a final answer when requested to avoid infinite tool loops.
      tool_choice: useTools ? (forceFinal ? "none" : "auto") : "none",
    });
  };

  let rounds = 0;
  const toolOutputs: ToolOutput[] = [];

  // initial call to determine if we are going in a tool call loop
  let response = await call(false);

  while (
    useTools &&
    response?.choices?.[0]?.message?.tool_calls &&
    response.choices[0].message.tool_calls.length > 0 &&
    rounds < maxToolRounds
  ) {
    rounds++;

    // Push assistant message that requested the tools
    chatMessages.push(response.choices[0].message);

    // lets save the tool result in session for context
    for (const toolCall of response.choices[0].message.tool_calls) {
      if (toolCall.type !== "function") {
        chatMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: true,
            message: `Unknown tool type: ${toolCall.type}`,
          }),
        });
        continue;
      }
      // If toolCall.type is 'function', TypeScript knows toolCall.function exists
      try {
        const args =
          typeof toolCall.function.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;

        const toolName = toolCall.function.name;

        // we are executing it on our server
        // const result = await executeTool(toolName, args);

        console.log(`Executing tool: ${toolName}`, args);

        // let execute it on mcp server, since it lives there, its like an api

        const result = await mcpClient.callTool({
          name: toolCall.function.name,
          arguments: args,
        });

        // console.log(result, "This is the response");

        const textContent = Array.isArray(result.content)
          ? result.content.find(
              (item): item is { type: "text"; text: string } =>
                !!item &&
                typeof item === "object" &&
                (item as { type?: unknown }).type === "text" &&
                typeof (item as { text?: unknown }).text === "string"
            )
          : undefined;

        if (!textContent) {
          throw new Error("Tool returned unsupported content");
        }

        const parsedPayload = JSON.parse(textContent.text);

        // save the tool result in session for context

        if (!result?.success) {
          throw new Error(parsedPayload.message ?? "Tool returned an error");
        }

        toolOutputs.push({
          name: toolCall.function.name,
          arguments: args,
          result: parsedPayload ?? null,
        });

        chatMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(parsedPayload ?? {}),
        });
      } catch (err) {
        console.error(
          `Tool execution error (${toolCall.type === "function" ? toolCall.function.name : "unknown tool"}):`,
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
    // Ask for the next step; you can either loop (auto) or force final (none)
    response = await call(false);
  }

  // If we broke out due to hitting max rounds but still have tool calls,
  // force a final textual answer to avoid spinning.
  if (
    useTools &&
    response?.choices?.[0]?.message?.tool_calls &&
    response.choices[0].message.tool_calls.length > 0
  ) {
    // Push the tool-calling assistant message (for completeness)
    chatMessages.push(response.choices[0].message);
    response = await call(true);
  }

  let finalContent =
    response?.choices?.[0]?.message?.content ??
    "I couldn’t generate a response.";

  if (onToken) {
    let streamedContent = "";
    const stream = await openai.chat.completions.create({
      model,
      temperature,
      messages: chatMessages,
      tools,
      tool_choice: "none",
      stream: true,
    });
    for await (const part of stream) {
      const token = part.choices?.[0]?.delta?.content ?? "";
      if (token) {
        streamedContent += token;
        await onToken(token);
      }
    }
    if (streamedContent.length) {
      finalContent = streamedContent;
    }
  }

  const products =
    toolOutputs.length > 0 ? normalizeProductsFromOutputs(toolOutputs) : [];

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
