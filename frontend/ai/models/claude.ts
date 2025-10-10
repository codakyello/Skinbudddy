// src/ai/models/claude.ts

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_TOOLS } from "../tools/definitions";
import { executeTool } from "../tools/executor";
import { DEFAULT_SYSTEM_PROMPT } from "../utils";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function callClaude({
  conversations = [],
  systemPrompt,
  contextPrompt,
}: {
  conversations?: Array<{ role: string; content: string }>;
  systemPrompt: string;
  contextPrompt?: string;
}): Promise<{ reply: string; updatedContext?: any }> {
  const tools = CLAUDE_TOOLS.map((tool) => ({
    ...tool,
    input_schema: {
      ...tool.input_schema,
      required: Array.isArray(tool.input_schema.required)
        ? [...tool.input_schema.required]
        : undefined,
    },
  }));

  // Build messages array with role (user, assistant)
  const messages: Anthropic.MessageParam[] = [];

  console.log(conversations, "This is conversation in claude");

  // Add context prompt as first user message (if provided)
  if (contextPrompt) {
    messages.push({
      role: "user",
      content: contextPrompt,
    });
  }

  // Add conversation history to messages to add context
  for (const msg of conversations) {
    console.log(msg, "This are the messages");
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  // Agentic loop: Claude may call tools multiple times
  let iterations = 0;
  let response: Anthropic.Message;
  let startTime = Date.now();
  const MAX_RUNTIME = 30000;
  let iterate = 0;

  while (true) {
    iterate++;
    response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-latest",
      max_tokens: 4096,
      system: DEFAULT_SYSTEM_PROMPT + systemPrompt,
      messages,
      tools,
    });

    console.log(`Claude iteration ${iterations}:`, response.stop_reason);

    // Check if Claude wants to use tools
    if (response.stop_reason === "tool_use") {
      // Add Claude's response to messages
      // for context, might not be sent from frontend on next request, frontend wont display this message
      messages.push({
        role: "assistant",
        content: response.content,
      });

      // Execute all requested tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      // tool call in parallel (independent of each other)
      for (const block of response.content) {
        if (block.type === "tool_use") {
          try {
            const result = await executeTool(block.name, block.input);

            if (!result.success) throw new Error(result.message);

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error(
              `Tool execution error (${block.name}):`,
              error.message
            );

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({
                error: true,
                message: error.message || "Tool execution failed",
              }),
              is_error: true,
            });
          }
        }
      }

      // Send tool results back to Claude
      messages.push({
        role: "user",
        content: toolResults,
      });

      // Continue loop - Claude will process results
      continue;
    }

    // If not tool_use, Claude is done
    break;
  }

  // Extract final text response
  const textBlock = response!.content.find((block) => block.type === "text");
  const reply =
    textBlock && "text" in textBlock
      ? textBlock.text
      : "I apologize, but I couldn't generate a response.";

  // Extract context updates (if any)
  // You can implement context extraction here
  const updatedContext = extractContextFromResponse(response!);

  return { reply, updatedContext };
}

function extractContextFromResponse(response: Anthropic.Message): any {
  // Look through tool calls to extract context
  const context: any = {};

  for (const block of response.content) {
    if (block.type === "tool_use") {
      // If Claude called getAllProducts or getProduct, save results
      if (block.name === "getAllProducts") {
        // You'd need to track results, or extract from subsequent messages
        // For now, return empty context
      }
    }
  }

  return context;
}
