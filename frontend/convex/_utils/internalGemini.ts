import { Product } from "./type";
import { getOpenRouterClient } from "../../ai/openrouter/client";

export function generateToken() {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 36);
}
export function hasCategory(products: Product[], categoryName: string) {
  const target = categoryName.toLowerCase();
  return products.some((product) =>
    product?.categories?.some((cat) => {
      if (!cat || typeof cat === "string") return false; // Ids can't match by name
      return cat.name?.toLowerCase() === target;
    })
  );
}

const DEFAULT_GROK_MODEL =
  process.env.OPENROUTER_MODEL_GROK ?? "x-ai/grok-4";

type GeminiChatOptions = {
  apiKey?: string;
};

export async function runChatCompletion(
  userPrompt: string,
  model = DEFAULT_GROK_MODEL,
  temperature = 1,
  systemPrompt?: string,
  options?: GeminiChatOptions
) {
  const geminiClient = getOpenRouterClient(options?.apiKey);
  const response = await geminiClient.models.generateContent({
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
        parts: [
          {
            text:
              systemPrompt ??
              `You are SkinBuddy AI, a professional skincare recommender and expert. 
Never mention OpenAI—always introduce yourself as SkinBuddy AI. 
You specialize in analyzing skin types, skin concerns, and ingredients to provide safe, 
effective, and well-structured skincare recommendations. 
Only recommend products that are available in the database. If no products are available, don't recommend any products. Never hallucinate anything, products, brands, categories, etc.`,
          },
        ],
      },
      temperature,
      responseMimeType: "application/json",
    },
  });

  const rawText =
    (response as any)?.text ??
    (response as any)?.response?.text ??
    "";

  return typeof rawText === "string" && rawText.trim().length
    ? rawText.trim()
    : "{}";
}
