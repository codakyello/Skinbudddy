import { NextRequest, NextResponse } from "next/server";
import { fetchAction, fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { callOpenAI } from "@/ai/models/openai";
import { DEFAULT_SYSTEM_PROMPT } from "@/ai/utils";
import type { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  console.log("we are in chat endpoint");
  const body = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = async (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      (async () => {
        try {
          const {
            message,
            sessionId: incomingSessionId,
            userId,
            config,
          } = body;

          if (!message || typeof message !== "string") {
            throw new Error("Missing `message` in request body");
          }

          let sessionId: Id<"conversationSessions">;

          if (incomingSessionId) {
            sessionId = incomingSessionId as Id<"conversationSessions">;
          } else {
            const created = await fetchMutation(
              api.conversation.createSession,
              {
                userId: userId ?? undefined,
                config: config ?? undefined,
              }
            );
            sessionId = created.sessionId;
          }

          const appendUser = await fetchMutation(
            api.conversation.appendMessage,
            {
              sessionId,
              role: "user",
              content: message + `My userId: ${userId}`,
            }
          );

          if (appendUser.needsSummary) {
            await fetchAction(api.conversation.recomputeSummaries, {
              sessionId,
            });
          }

          const context = await fetchQuery(api.conversation.getContext, {
            sessionId,
          });

          const completion = await callOpenAI({
            messages: context.messages,
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            sessionId,
            onToken: async (token) => {
              if (!token) return;
              await send({ type: "delta", token });
            },
          });

          const assistantMessage = completion.reply;
          const toolOutputs = completion.toolOutputs ?? [];
          const products = completion.products ?? [];

          if (products.length) {
            await fetchMutation(api.conversation.appendMessage, {
              sessionId,
              role: "tool",
              content: JSON.stringify({
                name: "searchProductsByQuery",
                products,
              }),
            });
          }

          const appendAssistant = await fetchMutation(
            api.conversation.appendMessage,
            {
              sessionId,
              role: "assistant",
              content: assistantMessage,
            }
          );

          if (appendAssistant.needsSummary) {
            await fetchAction(api.conversation.recomputeSummaries, {
              sessionId,
            });
          }

          await send({
            type: "final",
            reply: assistantMessage,
            sessionId,
            toolOutputs,
            products,
          });
        } catch (error: unknown) {
          console.error("Error calling openAI", error);

          await send({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unexpected error occurred",
          });
        } finally {
          controller.close();
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
