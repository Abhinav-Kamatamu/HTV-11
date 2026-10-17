import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./http";

// Stores an uploaded photo/PDF under UPLOAD_DIR (.env.example) and returns both the stored path and a
// base64 copy for the Gemini call, so callers don't read the file back off disk. `fileUrl`/`photoUrl`
// columns store the path returned here; `GET /api/uploads/:file` (not yet built) would serve it back.

const MAX_BYTES = 15 * 1024 * 1024;

export type StoredUpload = { storedPath: string; base64: string; mimeType: string };

export async function readUploadedFile(formData: FormData, field: string): Promise<StoredUpload> {
  const file = formData.get(field);
  if (!(file instanceof File)) throw new ApiError(400, `${field} must be an uploaded file`);
  if (file.size === 0) throw new ApiError(400, `${field} is empty`);
  if (file.size > MAX_BYTES) throw new ApiError(400, `${field} exceeds ${MAX_BYTES} bytes`);

  const buffer = Buffer.from(await file.arrayBuffer());
  const dir = process.env.UPLOAD_DIR ?? "./uploads";
  await mkdir(dir, { recursive: true });
  const ext = path.extname(file.name) || "";
  const filename = `${randomUUID()}${ext}`;
  // UPLOAD_DIR is a deploy-time env var, not request data; told apart from a traceable project path so
  // Turbopack doesn't bundle the whole repo into the server output (its own suggested fix).
  const storedPath = path.join(/* turbopackIgnore: true */ dir, filename);
  await writeFile(storedPath, buffer);

  return { storedPath, base64: buffer.toString("base64"), mimeType: file.type || "application/octet-stream" };
}
