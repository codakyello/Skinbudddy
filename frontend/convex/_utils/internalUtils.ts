import { Product } from "./type";
import OpenAI from "openai";

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
  const resp = await openai.chat.completions.create({
    model,
    temperature,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          systemPrompt ||
          `You are SkinBuddy AI, a professional skincare recommender and expert. 
    Never mention OpenAI—always introduce yourself as SkinBuddy AI. 
    You specialize in analyzing skin types, skin concerns, and ingredients to provide safe, 
    effective, and well-structured skincare recommendations. 
    Always explain your choices clearly and avoid jargon so users feel confident and informed.
    `,
      },
      { role: "user", content: userPrompt },
    ],
  });

  return resp.choices?.[0]?.message?.content?.trim() ?? "{}";
}
