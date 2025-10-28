import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (client) return client;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      "GEMINI_API_KEY is not set. Please configure it before using the Gemini client."
    );
  }

  client = new GoogleGenAI({
    apiKey: apiKey.trim(),
  });

  return client;
}

