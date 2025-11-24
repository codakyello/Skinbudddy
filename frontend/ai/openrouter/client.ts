import { OpenRouter } from "@openrouter/sdk";

type OpenRouterRequestPayload = {
  model: string;
  contents: Array<Record<string, unknown>>;
  config?: Record<string, unknown>;
};

type CandidatePart =
  | { text: string }
  | {
      functionCall: {
        name: string;
        args: Record<string, unknown>;
        id?: string;
      };
    };

type OpenRouterResponsePayload = {
  candidates: Array<{
    content: { parts: CandidatePart[] };
  }>;
  text?: string;
  promptFeedback?: unknown;
};

type ToolCallState = {
  id: string;
  name?: string;
  arguments: string;
};

type ChoiceState = {
  text: string;
  toolCalls: Map<string, ToolCallState>;
};

type OpenRouterMessage = {
  role: string;
  content: string;
  toolCallId?: string;
};

const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL_GROK?.trim() ||
  process.env.OPENROUTER_DEFAULT_MODEL?.trim() ||
  process.env.OPENROUTER_GEMINI_MODEL?.trim() ||
  "x-ai/grok-4";

const buildHeaders = () => {
  const referer =
    process.env.OPENROUTER_REFERRER?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "";
  const title = process.env.OPENROUTER_APP_NAME?.trim() || "SkinBuddy";
  const headers: Record<string, string> = {};
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;
  return headers;
};

const safeJsonParse = (value: string): Record<string, unknown> | null => {
  if (!value || !value.trim().length) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

class OpenRouterChatAdapter {
  private client: OpenRouter;
  private defaultHeaders: Record<string, string>;

  constructor(apiKeyOverride?: string) {
    const apiKey = (
      apiKeyOverride ??
      process.env.OPENROUTER_API_KEY ??
      ""
    ).trim();
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. Please configure it before using the OpenRouter client."
      );
    }

    this.client = new OpenRouter({
      apiKey,
      serverURL:
        process.env.OPENROUTER_BASE_URL?.trim() ||
        "https://openrouter.ai/api/v1",
      userAgent:
        process.env.OPENROUTER_USER_AGENT?.trim() ||
        "SkinBuddy/1.0 (openrouter-sdk)",
    });

    this.defaultHeaders = buildHeaders();
  }

  public readonly models = {
    generateContent: (payload: OpenRouterRequestPayload) =>
      this.generateContent(payload),
    generateContentStream: (payload: OpenRouterRequestPayload) =>
      this.generateContentStream(payload),
  };

  private async generateContent(
    payload: OpenRouterRequestPayload
  ): Promise<OpenRouterResponsePayload> {
    const request = this.convertRequest(payload, false);
    const response = await this.client.chat.send(request as any, {
      headers: this.defaultHeaders,
    });

    return this.convertChatResponse(response);
  }

  private async generateContentStream(payload: OpenRouterRequestPayload) {
    const request = this.convertRequest(payload, true);
    const stream = (await this.client.chat.send(request as any, {
      headers: this.defaultHeaders,
    })) as unknown as AsyncIterable<any>;
    const choiceStates = new Map<number, ChoiceState>();

    const getState = (index: number): ChoiceState => {
      if (!choiceStates.has(index)) {
        choiceStates.set(index, { text: "", toolCalls: new Map() });
      }
      return choiceStates.get(index)!;
    };

    const iterator = async function* (
      this: OpenRouterChatAdapter
    ): AsyncGenerator<{
      candidates: Array<{ content: { parts: CandidatePart[] } }>;
    }> {
      for await (const chunk of stream) {
        const candidates = chunk.choices.map((choice: any) => {
          const state = this.updateChoiceState(getState(choice.index), choice);
          return { content: { parts: this.buildPartsFromState(state) } };
        });

        yield { candidates };
      }
    }.bind(this);

    return iterator();
  }

  private updateChoiceState(state: ChoiceState, choice: any): ChoiceState {
    const delta: any = choice.delta ?? {};
    const deltaContent = delta.content as unknown;

    if (typeof deltaContent === "string") {
      state.text += deltaContent;
    } else if (Array.isArray(deltaContent)) {
      state.text += deltaContent
        .map((item: any) => (typeof item?.text === "string" ? item.text : ""))
        .join("");
    }

    if (Array.isArray(delta.toolCalls)) {
      delta.toolCalls.forEach((toolCall: any, toolIndex: number) => {
        const id =
          toolCall.id ||
          (typeof toolCall.index === "number"
            ? `tool_${toolCall.index}`
            : `tool_${toolIndex}`);
        const current =
          state.toolCalls.get(id) ?? ({ id, arguments: "" } as ToolCallState);
        current.name = toolCall.function?.name ?? current.name;
        if (typeof toolCall.function?.arguments === "string") {
          current.arguments += toolCall.function.arguments;
        }
        state.toolCalls.set(id, current);
      });
    }

    return state;
  }

  private buildPartsFromState(state: ChoiceState): CandidatePart[] {
    const parts: CandidatePart[] = [];
    if (state.text.length) {
      parts.push({ text: state.text });
    }

    for (const call of state.toolCalls.values()) {
      const parsed = safeJsonParse(call.arguments);
      if (!parsed) continue;
      parts.push({
        functionCall: {
          id: call.id,
          name: call.name ?? "function",
          args: parsed,
        },
      });
    }

    return parts;
  }

  private convertChatResponse(response: any): OpenRouterResponsePayload {
    const candidates = response.choices.map((choice: any) => {
      const parts: CandidatePart[] = [];
      const message = choice.message;

      const content = message.content;
      if (typeof content === "string" && content.length) {
        parts.push({ text: content });
      } else if (Array.isArray(content)) {
        const text = content
          .map((item: any) =>
            typeof item?.text === "string"
              ? item.text
              : typeof item?.content === "string"
                ? item.content
                : ""
          )
          .join("");
        if (text.length) {
          parts.push({ text });
        }
      }

      if (Array.isArray(message.toolCalls)) {
        message.toolCalls.forEach((toolCall: any) => {
          const parsed = safeJsonParse(toolCall.function?.arguments ?? "");
          if (!parsed) return;
          parts.push({
            functionCall: {
              id: toolCall.id,
              name: toolCall.function?.name ?? "function",
              args: parsed,
            },
          });
        });
      }

      return {
        content: {
          parts,
        },
      };
    });

    return {
      candidates,
      text:
        candidates[0]?.content?.parts
          ?.map((part: CandidatePart) =>
            "text" in part ? (part as any).text : ""
          )
          .join("") ?? "",
    };
  }

  private convertRequest(payload: OpenRouterRequestPayload, stream: boolean) {
    const config = (payload.config ?? {}) as Record<string, unknown>;
    const messages = this.convertContentsToMessages(payload.contents, config);
    const { tools, tool_choice } = this.convertTools(config);

    return {
      model: payload.model ? this.resolveModel(payload.model) : DEFAULT_MODEL,
      messages,
      stream,
      temperature:
        typeof config.temperature === "number"
          ? (config.temperature as number)
          : undefined,
      tools,
      tool_choice,
    };
  }

  private resolveModel(model: string): string {
    const trimmed = model.trim();
    if (!trimmed.length) {
      return DEFAULT_MODEL;
    }
    if (trimmed.includes("/")) return trimmed;
    const lowered = trimmed.toLowerCase();
    if (lowered.startsWith("grok")) {
      return `x-ai/${trimmed}`;
    }
    return `google/${trimmed}`;
  }

  private convertTools(config?: Record<string, unknown>): {
    tools?: Array<{ type: "function"; function: Record<string, unknown> }>;
    tool_choice?: "auto" | "none";
  } {
    const toolsBlock = Array.isArray(config?.tools) ? config?.tools : [];
    const functionDeclarations = toolsBlock.flatMap((entry: any) =>
      Array.isArray(entry?.functionDeclarations)
        ? entry.functionDeclarations
        : []
    );
    const tools =
      functionDeclarations
        .map((declaration: any) => ({
          type: "function" as const,
          function: {
            name: declaration?.name,
            description: declaration?.description,
            parameters: declaration?.parametersJsonSchema ?? {
              type: "object",
              properties: {},
            },
          },
        }))
        .filter((tool) => typeof tool.function?.name === "string") ?? [];

    const mode =
      (
        config?.toolConfig as any
      )?.functionCallingConfig?.mode?.toUpperCase?.() ?? "AUTO";

    return {
      tools: tools.length ? tools : undefined,
      tool_choice:
        tools.length && mode === "AUTO"
          ? "auto"
          : tools.length && mode === "NONE"
            ? "none"
            : undefined,
    };
  }

  private convertContentsToMessages(
    contents: Array<Record<string, unknown>>,
    config?: Record<string, unknown>
  ): OpenRouterMessage[] {
    const messages: OpenRouterMessage[] = [];

    if (config?.systemInstruction) {
      const instructionParts = Array.isArray(
        (config.systemInstruction as Record<string, unknown>).parts
      )
        ? ((config.systemInstruction as Record<string, unknown>).parts as Array<
            Record<string, unknown>
          >)
        : [];
      const text = instructionParts
        .map((part) =>
          typeof (part as any).text === "string" ? (part as any).text : ""
        )
        .join("\n\n")
        .trim();
      if (text.length) {
        messages.push({ role: "system", content: text });
      }
    }

    contents.forEach((entry) => {
      const role = entry.role;
      const parts = Array.isArray(entry.parts) ? entry.parts : [];
      if (role === "user") {
        const text = this.convertContentPartsToText(parts);
        messages.push({ role: "user", content: text });
        return;
      }
      if (role === "model") {
        const text = this.convertContentPartsToText(parts);
        messages.push({ role: "assistant", content: text });
        return;
      }
      if (role === "function") {
        const toolMessage = this.convertFunctionResponseToToolMessage(entry);
        if (toolMessage) {
          messages.push(toolMessage);
        }
        return;
      }
      if (role === "developer") {
        const text = this.convertContentPartsToText(parts);
        if (text.length) {
          messages.push({ role: "user", content: text });
        }
      }
    });

    if (!messages.length) {
      messages.push({ role: "user", content: "" });
    }

    return messages;
  }

  private convertContentPartsToText(
    parts: Array<Record<string, unknown>>
  ): string {
    return parts
      .map((part) =>
        part &&
        typeof part === "object" &&
        typeof (part as any).text === "string"
          ? (part as any).text
          : ""
      )
      .join("");
  }

  private convertFunctionResponseToToolMessage(
    entry: Record<string, unknown>
  ): OpenRouterMessage | null {
    const parts: Array<Record<string, unknown>> = Array.isArray(entry.parts)
      ? (entry.parts as Array<Record<string, unknown>>)
      : [];
    for (const part of parts) {
      if (part && typeof part === "object" && part.functionResponse) {
        const response = part.functionResponse as Record<string, unknown>;
        const payload =
          response.response && typeof response.response === "object"
            ? response.response
            : { value: response.response };
        const id =
          typeof response.id === "string" && response.id.length
            ? response.id
            : undefined;
        const name =
          typeof response.name === "string" && response.name.length
            ? response.name
            : "tool";
        return {
          role: "tool",
          content: JSON.stringify(payload ?? {}),
          toolCallId: id ?? name,
        };
      }
    }
    return null;
  }
}

const clients = new Map<string, OpenRouterChatAdapter>();

export function getOpenRouterClient(
  apiKeyOverride?: string
): OpenRouterChatAdapter {
  const key = (apiKeyOverride ?? "__default__").trim();
  if (!clients.has(key)) {
    clients.set(key, new OpenRouterChatAdapter(apiKeyOverride));
  }
  return clients.get(key)!;
}
