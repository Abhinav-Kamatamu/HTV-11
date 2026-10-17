import { NextResponse } from "next/server";
import type { z } from "zod";

// Shared response + body-validation helpers for route handlers (T-005). Every request body and every
// extracted shape gets zod-validated per CLAUDE.md §5 / ARCHITECTURE.md ("validate every Gemini response
// and API body").

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(what: string): never {
  throw new ApiError(404, `${what} not found`);
}

export function ok<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}

/** Parses `request.json()` against `schema`, throwing a 400 ApiError with zod's message on failure. */
export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "request body must be JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.message);
  return parsed.data;
}

/** Wraps a route handler so a thrown ApiError (or zod error) becomes a JSON error response instead of a 500. */
export function withErrors(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  return handler().catch((err) => {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  });
}
