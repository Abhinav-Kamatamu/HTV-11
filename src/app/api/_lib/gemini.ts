import { createGeminiClient, type GeminiClient } from "@/ai/gemini";
import { ApiError } from "./http";

// Lazy singleton so route modules load even when GEMINI_API_KEY/GEMINI_MODEL aren't set yet in a
// teammate's .env.local; the ingest routes surface a clear 503 instead of crashing the dev server.

let client: GeminiClient | undefined;

export function getGeminiClient(): GeminiClient {
  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) {
    throw new ApiError(503, "GEMINI_API_KEY/GEMINI_MODEL not set (see .env.example)");
  }
  client ??= createGeminiClient();
  return client;
}
