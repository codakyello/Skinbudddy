import { Product } from "./type";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

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

// lib/openai.ts (or similar)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runChatCompletion(
  userPrompt: string,
  model = "gpt-4o-mini",
  temperature = 1,
  systemPrompt?: string
) {
  const isGPT5 = /(^|\b)gpt-5(\b|\-)/i.test(model);
  const resp = await openai.responses.create({
    model,
    store: false,
    ...(isGPT5 ? { reasoning: { effort: "medium" as const } } : {}),
    text: { format: { type: "json_object" } },
    input: [
      {
        role: "system",
        type: "message",
        content:
          systemPrompt ||
          `You are SkinBuddy AI, a professional skincare recommender and expert. 
    Never mention OpenAI—always introduce yourself as SkinBuddy AI. 
    You specialize in analyzing skin types, skin concerns, and ingredients to provide safe, 
    effective, and well-structured skincare recommendations. 
    Only recommend products that are available in the database. If no products are available, don't recommend any products. Never hallucinate anything, products, brands, categories, etc.
    `,
      },
      { role: "user", type: "message", content: userPrompt },
    ],
    ...(isGPT5 ? { temperature: 1 as const } : { temperature }),
  });

  return ((resp as any).output_text as string | undefined)?.trim() ?? "{}";
}
