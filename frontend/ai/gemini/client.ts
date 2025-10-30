import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;
let clientKey: string | null = null;

export function getGeminiClient(apiKeyOverride?: string): GoogleGenAI {
  const resolvedKey = (apiKeyOverride ??
    process.env.GEMINI_API_KEY ??
    process.env.CONVEX_GEMINI_API_KEY ??
    process.env.NEXT_PUBLIC_GEMINI_API_KEY ??
    "")
    .trim();

  if (!resolvedKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Please configure it before using the Gemini client."
    );
  }

  if (client && clientKey === resolvedKey) {
    return client;
  }

  client = new GoogleGenAI({
    apiKey: resolvedKey,
  });
  clientKey = resolvedKey;

  return client;
}
