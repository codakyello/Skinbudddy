import type { SummaryContext, ReplySummary, ProductCandidate } from "../types";
import {
  replySummarySchema,
  truncateString,
  selectProductsParameters,
  selectProductsResponseSchema,
  summarizeCandidates,
} from "../utils";
import { getGeminiClient } from "./client";

const SUMMARY_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 120 },
    subheading: { type: "string", minLength: 1, maxLength: 200 },
    icon: { type: "string", minLength: 1, maxLength: 4 },
  },
  required: ["headline", "subheading"],
  additionalProperties: false,
} as const;

export async function generateReplySummaryWithGemini({
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

  const routineGuidance =
    context?.type === "routine"
      ? [
          'Begin the headline with the exact phrase "Here is the routine I built for" followed immediately by the routineDescription (or "your skin" if routineDescription is missing).',
          'The routineDescription field already captures the skin type and focus (e.g., "oily skin and focused on acne concerns"); reuse that wording verbatim without reordering its meaning.',
          "Keep the remainder of the headline concise—if you need to add a short clause about the routine's focus, do so naturally.",
          stepCountText
            ? `In the subheading, reference that the routine covers ${stepCountText} and, if possible, nod to one of the stepHighlights or invite the user to tweak steps.`
            : "In the subheading, highlight what the routine focuses on and invite the user to tweak steps.",
        ].join(" ")
      : "";

  const productGuidance =
    context?.type === "products"
      ? [
          `Begin the headline with "Here are the products I found" and immediately append the provided filterDescription${filterDescription ? ' exactly as written (it already begins with wording like "including category cleanser")' : " or, if missing, summarize the most relevant filters (category, skin type, concerns, actives, brand)"}.`,
          "Keep the headline brief and action-oriented.",
          "Use the subheading to reiterate the key filters in one sentence and invite the user to take next steps like comparing or learning more.",
        ].join(" ")
      : "";

  const contextualInstructions = [routineGuidance, productGuidance]
    .filter(Boolean)
    .join(" ");

  const iconInstruction = `Set the "icon" field in your JSON to "${icon}". Do not place any emoji inside the headline or subheading. Provide exactly one headline and one subheading—no additional fields or sentences.`;

  try {
    const client = getGeminiClient();
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
              text: `You are a succinct copywriter for SkinBuddy, a skincare assistant. Given the assistant's reply and the structured context, craft a heading and subheading that match the requested format. Keep the headline between 3–10 words (≤60 characters) and ensure it stays conversational and skincare-focused. The subheading must be exactly one supportive sentence (≤110 characters) that complements—but never repeats verbatim—the headline. ${iconInstruction} ${contextualInstructions} Output ONLY a JSON object with keys headline, subheading, and optional icon—no prose, no markdown, no code fences.`,
            },
          ],
        },
        temperature: 0.4,
        responseMimeType: "application/json",
        responseJsonSchema: SUMMARY_RESPONSE_JSON_SCHEMA,
      },
    });

    const rawText = (response as any)?.text ?? (response as any)?.response?.text;
    const fallbackPart =
      (response as any)?.candidates?.[0]?.content?.parts?.find(
        (part: any) => typeof part?.text === "string" && part.text.trim().length
      )?.text ?? "";
    const content =
      typeof rawText === "string" && rawText.trim().length
        ? rawText.trim()
        : fallbackPart;

    const sanitized = content
      .replace(/```(?:json)?|```/gi, "")
      .trim();
    if (!sanitized.length) return null;

    const parsed = JSON.parse(sanitized);
    const result = replySummarySchema.safeParse(parsed);
    if (!result.success) {
      console.warn("Failed to parse Gemini summary JSON:", result.error);
      return null;
    }

    return {
      headline: result.data.headline.trim(),
      subheading: result.data.subheading.trim(),
      icon: result.data.icon?.trim() || undefined,
    };
  } catch (error) {
    console.error("Failed to generate reply summary with Gemini:", error);
    return null;
  }
}

export async function refineProductSelectionWithGemini({
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

  const systemPrompt =
    "You are a meticulous skincare merchandiser. You will select the best matches from the provided candidate list. Only choose from the candidates and never invent new products. Your response must call the selectProducts function.";

  const userPrompt = `User request:\n${userRequest || "(not provided)"}\n\nCandidates (JSON):\n${JSON.stringify(
    summaries,
    null,
    2
  )}\n\nCall the selectProducts function with your ranked picks and reasons.`;

  try {
    const client = getGeminiClient();
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

    const rawText = (response as any)?.text ?? (response as any)?.response?.text;
    const content =
      typeof rawText === "string" && rawText.trim().length
        ? rawText.trim()
        : "";
    const sanitizedContent = content.replace(/```(?:json)?|```/gi, "").trim();

    if (!sanitizedContent.length) {
      return { products: limitedCandidates };
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(sanitizedContent);
    } catch (error) {
      console.error("Failed to parse Gemini product refinement JSON:", error);
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
