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
        categoryName?: string;
        selectionReason?: string;
        selectionConfidence?: number;
        sizes?: Array<{
          sizeId: string;
          price?: number;
          currency?: string;
        }>;
      };

      const sanitizeProducts = (products: unknown[]): NormalizedProduct[] => {
        if (!Array.isArray(products)) return [];

        return products
          .map((product) => {
            if (!product || typeof product !== "object") return null;
            const raw = product as Record<string, unknown>;

            const productId =
              typeof raw._id === "string"
                ? raw._id
                : typeof raw.productId === "string"
                  ? raw.productId
                  : typeof raw.id === "string"
                    ? raw.id
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

            const sizes = Array.isArray(raw.sizes)
              ? raw.sizes
                  .map((size) => {
                    if (!size || typeof size !== "object") return null;
                    const record = size as Record<string, unknown>;
                    const sizeId =
                      typeof record.id === "string"
                        ? record.id
                        : typeof record.sizeId === "string"
                          ? record.sizeId
                          : undefined;
                    if (!sizeId) return null;
                    const price =
                      typeof record.price === "number"
                        ? record.price
                        : undefined;
                    const currency =
                      typeof record.currency === "string"
                        ? record.currency
                        : undefined;
                    return { sizeId, price, currency };
                  })
                  .filter((size): size is NonNullable<typeof size> =>
                    Boolean(size)
                  )
              : [];

            const normalized: NormalizedProduct = {
              productId,
              slug: typeof raw.slug === "string" ? raw.slug : undefined,
              categoryName: categories.at(0),
              selectionReason:
                typeof raw.selectionReason === "string"
                  ? raw.selectionReason.slice(0, 320)
                  : undefined,
              sizes: sizes.length ? sizes : undefined,
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

          const QUIZ_SENTINEL = "__QUIZ_RESULTS__";
          const isQuizResults = message.startsWith(QUIZ_SENTINEL);
          const sanitizedMessage = isQuizResults
            ? message.slice(QUIZ_SENTINEL.length).trimStart()
            : message;

          let quizInstruction: string | null = null;

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

                quizInstruction = [
                  "Skin-type survey completed. Use these answers only to infer the user's most likely skin type and primary skin concerns. Do not restart the survey or suggest routines or next steps unless explicitly requested.",
                  "Craft a response using the following Markdown template. Replace the bracketed guidance with your conclusions and keep the structure:",
                  "# 🧪 Skin Analysis Summary\n\n## Skin Type\nYour skin is classified as **{skin type in plain language with a brief explanation of what that means for the user}**.\n\n## Main Concern\nYou are primarily concerned with **{main concern in plain language with one short sentence elaborating on the implication}**.\n\n💡 You have a {skin type phrase} and your main concern is {main concern phrase}.\n\nWould you like me to provide personalized skincare recommendations based on this information?",
                  formattedAnswers.length
                    ? ["### Survey Answers", ...formattedAnswers].join("\n\n")
                    : "",
                ].join("\n\n");
              }
            } catch (error) {
              console.warn("Failed to parse quiz results payload", error);
            }
          }

          const appendRole = isQuizResults ? "system" : "user";
          const contentToStore = isQuizResults
            ? (quizInstruction ?? sanitizedMessage)
            : sanitizedMessage + ` My userId: ${userId}`;

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

          console.log(context, "This is conversation history");

          const completion = await callOpenAI({
            messages: context.messages,
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
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
            onProducts: async (productsChunk) => {
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
              await send({ type: "products", products: productsChunk });
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

          const assistantMessage = completion.reply;
          const startSkinTypeQuiz = completion.startSkinTypeQuiz ?? false;
          // many tool outputs in one api iteration or loop
          const toolOutputs = completion.toolOutputs ?? [];
          // latest product to frontend
          const products = completion.products ?? [];
          const resultType = completion.resultType;
          const routine = completion.routine;
          const summary = completion.summary;

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

          if (sanitizedProducts.length) {
            schedule(
              fetchMutation(api.conversation.appendMessage, {
                sessionId,
                role: "tool",
                content: JSON.stringify({
                  name: "searchProductsByQuery",
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

          if (!startSkinTypeQuiz && assistantMessage.trim().length) {
            schedule(
              fetchMutation(api.conversation.appendMessage, {
                sessionId,
                role: "assistant",
                content: assistantMessage,
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
              reply: assistantMessage,
              sessionId,
              toolOutputs,
              products,
              resultType,
              routine,
              summary,
            });
          }
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
