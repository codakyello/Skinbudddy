import OpenAI from "openai";
import { DEFAULT_SYSTEM_PROMPT } from "../utils";
import { connectSkinbuddyMcp } from "../mcp/client";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// lets connect to the mcp server here

// gpt-4o-mini
// gpt-4.1-nano
// gpt-5-nano
type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export async function callOpenAI({
  messages,
  systemPrompt,
  model = "gpt-4o-mini",
  temperature = 1,
  useTools = true,
  maxToolRounds = 5, // prevent runaway loops
}: {
  messages: ChatMessage[];
  systemPrompt: string;
  model?: string;
  temperature?: number;
  useTools?: boolean;
  maxToolRounds?: number;
}): Promise<{ reply: string; updatedContext?: object }> {
  const mcpClient = await connectSkinbuddyMcp();

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

  console.log(mcpClient.listTools, "Tools listed");

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
  ];

  for (const msg of messages) {
    chatMessages.push({ role: msg.role, content: msg.content });
  }

  console.log(chatMessages, "This is conversation history");

  // messages.push({ role: "user", content: userMessage });

  // Helper to make a model call
  const call = async (forceFinal = false) => {
    return openai.chat.completions.create({
      model,
      temperature,
      messages: chatMessages,
      tools,
      // Force a final answer when requested to avoid infinite tool loops.
      tool_choice: useTools ? (forceFinal ? "none" : "auto") : undefined,
    });
  };

  let rounds = 0;

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

  const content =
    response?.choices?.[0]?.message?.content ??
    "I couldn’t generate a response.";

  return { reply: content };
}
