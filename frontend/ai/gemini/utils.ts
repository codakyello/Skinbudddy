import type { SummaryContext, ReplySummary, ProductCandidate } from "../types";
import {
  replySummarySchema,
  truncateString,
  selectProductsParameters,
  selectProductsResponseSchema,
  summarizeCandidates,
} from "../utils";
import { getOpenRouterClient } from "../openrouter/client";

const SUMMARY_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 120 },
    icon: { type: "string", minLength: 1, maxLength: 4 },
  },
  required: ["headline"],
  additionalProperties: false,
} as const;

export async function generateReplySummaryWithOpenRouter({
  reply,
  userMessage,
  context,
  model,
}: {
  reply: string;
  userMessage?: string;
  context?: SummaryContext | null;
  model: string;
}): Promise<ReplySummary | null> {
  const trimmedReply = reply.trim();
  if (!trimmedReply.length) return null;

  const payload = {
    userMessage: userMessage ? truncateString(userMessage, 600) : undefined,
    assistantReply: truncateString(trimmedReply, 1200),
    context,
  };

  const icon = context?.iconSuggestion ?? "🧪";
  const stepCountText =
    context?.type === "routine"
      ? context.stepCount === 1
        ? "1 step"
        : `${context.stepCount} steps`
      : undefined;
  const filterDescription =
    context?.type === "products" ? context.filterDescription : undefined;
  const intentHeadlineHint =
    context?.type === "products" &&
    typeof context.intentHeadlineHint === "string"
      ? context.intentHeadlineHint
      : null;
  const preferIntentHeadline =
    context?.type === "products" &&
    context.headlineSourceRecommendation === "intent" &&
    intentHeadlineHint;

  const routineGuidance =
    context?.type === "routine"
      ? [
          'Begin the headline with the exact phrase "Here is the routine I built for" followed immediately by the routineDescription (or "your skin" if routineDescription is missing).',
          'The routineDescription field already captures the skin type and focus (e.g., "oily skin and focused on acne concerns"); reuse that wording verbatim without reordering its meaning.',
          "Keep the remainder of the headline concise—if you need to add a short clause about the routine's focus, do so naturally.",
          stepCountText
            ? `Weave into the headline that the routine covers ${stepCountText} and, if possible, nod to one of the stepHighlights or invite the user to tweak steps.`
            : "Use the headline to highlight what the routine focuses on and invite the user to tweak steps.",
        ].join(" ")
      : "";

  const productGuidance =
    context?.type === "products"
      ? [
          preferIntentHeadline
            ? `Use the user's request "${intentHeadlineHint}" as the blueprint for the headline—paraphrase it into a polished title that sounds like a section heading, not a verbatim command.`
            : filterDescription
              ? `Let the headline highlight the core filters (${filterDescription}); mention the category or benefit so the user immediately knows what the set covers.`
              : "Reference the product category or standout benefits from the context to craft a clear headline even if the user was vague.",
          filterDescription && preferIntentHeadline
            ? "You may weave in the filter details if it sharpens the meaning, but keep the user intent front and center."
            : "",
          "Keep the headline brief (3–10 words), inviting, and action-oriented.",
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  const contextualInstructions = [routineGuidance, productGuidance]
    .filter(Boolean)
    .join(" ");

  const iconInstruction = `Set the "icon" field in your JSON to "${icon}". Do not place any emoji inside the headline. Provide exactly one headline—no additional fields or sentences.`;

  try {
    const client = getOpenRouterClient();
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ text: JSON.stringify(payload) }],
        },
      ],
      config: {
        systemInstruction: {
          role: "system",
          parts: [
            {
              text: `You are a succinct copywriter for SkinBuddy, a skincare assistant. Given the assistant's reply and the structured context, craft a heading that matches the requested format. Keep the headline between 3–10 words (≤60 characters) and ensure it stays conversational and skincare-focused. ${iconInstruction} ${contextualInstructions} Output ONLY a JSON object with keys headline and optional icon—no prose, no markdown, no code fences.`,
            },
          ],
        },
        temperature: 0.4,
        responseMimeType: "application/json",
        responseJsonSchema: SUMMARY_RESPONSE_JSON_SCHEMA,
      },
    });

    const rawText =
      (response as any)?.text ?? (response as any)?.response?.text;
    const fallbackPart =
      (response as any)?.candidates?.[0]?.content?.parts?.find(
        (part: any) => typeof part?.text === "string" && part.text.trim().length
      )?.text ?? "";
    const content =
      typeof rawText === "string" && rawText.trim().length
        ? rawText.trim()
        : fallbackPart;

    const sanitized = content.replace(/```(?:json)?|```/gi, "").trim();
    if (!sanitized.length) return null;

    const parsed = JSON.parse(sanitized);
    const result = replySummarySchema.safeParse(parsed);
    if (!result.success) {
      console.warn("Failed to parse OpenRouter summary JSON:", result.error);
      return null;
    }

    return {
      headline: result.data.headline.trim(),
      icon: result.data.icon?.trim() || undefined,
    };
  } catch (error) {
    console.error("Failed to generate reply summary with OpenRouter:", error);
    return null;
  }
}

export async function refineProductSelectionWithOpenRouter({
  candidates,
  model,
  userRequest,
  filterSummary,
}: {
  candidates: ProductCandidate[];
  model: string;
  userRequest: string;
  filterSummary?: string;
}): Promise<{
  products: ProductCandidate[];
  notes?: string;
}> {
  if (!candidates.length) {
    return { products: [] };
  }

  const limitedCandidates = candidates.slice(0, 12);
  const { summaries, keyMap } = summarizeCandidates(limitedCandidates);

  const systemPrompt =
    "You are a meticulous skincare merchandiser. You will select the best matches from the provided candidate list. Only choose from the candidates and never invent new products. Your response must call the selectProducts function.";

  const contextBlocks = [
    `User request:\n${userRequest && userRequest.trim().length ? userRequest.trim() : "(not provided)"}`,
  ];
  if (filterSummary && filterSummary.trim().length) {
    contextBlocks.push(`Filters applied:\n${filterSummary.trim()}`);
  }

  const userPrompt = `${contextBlocks.join(
    "\n\n"
  )}\n\nCandidates (JSON):\n${JSON.stringify(
    summaries,
    null,
    2
  )}\n\nCall the selectProducts function with your ranked picks and reasons.`;

  try {
    const client = getOpenRouterClient();
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      config: {
        systemInstruction: {
          role: "system",
          parts: [{ text: systemPrompt }],
        },
        responseMimeType: "application/json",
        responseJsonSchema: selectProductsParameters,
        temperature: 0,
      },
    });

    const rawText =
      (response as any)?.text ?? (response as any)?.response?.text;
    const content =
      typeof rawText === "string" && rawText.trim().length
        ? rawText.trim()
        : "";
    const sanitizedContent = content.replace(/```[\w-]*|```/gi, "").trim();

    if (!sanitizedContent.length) {
      return { products: limitedCandidates };
    }

    // Handle function call syntax or extra text: extract the first valid JSON object
    let jsonContent = sanitizedContent;
    const firstBrace = sanitizedContent.indexOf('{');

    if (firstBrace !== -1) {
      let balance = 0;
      let inString = false;
      let escape = false;
      let endBrace = -1;

      for (let i = firstBrace; i < sanitizedContent.length; i++) {
        const char = sanitizedContent[i];

        if (escape) {
          escape = false;
          continue;
        }

        if (char === '\\') {
          escape = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') {
            balance++;
          } else if (char === '}') {
            balance--;
            if (balance === 0) {
              endBrace = i;
              break;
            }
          }
        }
      }

      if (endBrace !== -1) {
        jsonContent = sanitizedContent.slice(firstBrace, endBrace + 1);
      }
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(jsonContent);
    } catch (error) {
      console.error("Failed to parse OpenRouter product refinement JSON:", error);
      console.error("Raw content received:", sanitizedContent.slice(0, 500));
      console.error("Extracted JSON content:", jsonContent.slice(0, 500));
      return { products: limitedCandidates };
    }

    const parsed = selectProductsResponseSchema.safeParse(parsedPayload);

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
    console.error("Product selection refinement with Gemini failed:", error);
    return { products: candidates.slice(0, 12) };
  }
}
import { getGeminiModel } from "./client";

export async function refineProductSelectionWithGemini({
  candidates,
  userRequest,
  filterSummary,
}: {
  candidates: ProductCandidate[];
  userRequest: string;
  filterSummary?: string;
}): Promise<{
  products: ProductCandidate[];
  notes?: string;
}> {
  if (!candidates.length) {
    return { products: [] };
  }

  const limitedCandidates = candidates.slice(0, 12);
  const { summaries, keyMap } = summarizeCandidates(limitedCandidates);

  const systemPrompt =
    "You are a meticulous skincare merchandiser. You will select the best matches from the provided candidate list. Only choose from the candidates and never invent new products. Your response must call the selectProducts function.";

  const contextBlocks = [
    `User request:\n${userRequest && userRequest.trim().length ? userRequest.trim() : "(not provided)"}`,
  ];
  if (filterSummary && filterSummary.trim().length) {
    contextBlocks.push(`Filters applied:\n${filterSummary.trim()}`);
  }

  const userPrompt = `${contextBlocks.join(
    "\n\n"
  )}\n\nCandidates (JSON):\n${JSON.stringify(
    summaries,
    null,
    2
  )}\n\nCall the selectProducts function with your ranked picks and reasons.`;

  const geminiSchema = {
    type: "object",
    properties: {
      picks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            productId: { type: "string", description: "ID or slug from the candidate list (exactly as provided)." },
            reason: { type: "string", description: "1–2 sentence rationale tailored to the user request." },
            rank: { type: "integer", description: "1-based position; lowest number = highest priority." },
            confidence: { type: "number", description: "How confident the model is in this pick (optional)." },
          },
          required: ["productId", "reason"],
        },
      },
    },
    required: ["picks"],
  } as const;

  try {
    const model = getGeminiModel("gemini-2.0-flash-lite-preview-02-05");
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiSchema as any,
        temperature: 0,
      },
    });

    const responseText = result.response.text();
    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse Gemini product refinement JSON:", e);
      return { products: limitedCandidates };
    }

    const parsed = selectProductsResponseSchema.safeParse(parsedPayload);

    if (!parsed.success) {
      console.warn(
        "Gemini product refinement returned invalid schema:",
        parsed.error
      );
      return { products: limitedCandidates };
    }

    const { picks } = parsed.data;
    const reordered: ProductCandidate[] = [];

    // Sort picks by rank
    picks.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

    for (const pick of picks) {
      const original = keyMap.get(pick.productId);
      if (original) {
        // Attach the reason to the product object (if mutable) or clone it
        // We'll assume we can't easily mutate the candidate type, but we can return the ordered list
        // If we need to attach the reason, we might need to extend the type or just rely on ordering
        reordered.push(original);
      }
    }

    // If no valid picks, fallback
    if (!reordered.length) {
      return { products: limitedCandidates };
    }

    return { products: reordered };
  } catch (error) {
    console.error("Gemini product refinement failed:", error);
    return { products: limitedCandidates };
  }
}
