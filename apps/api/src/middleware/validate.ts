import type { z } from "zod";
import { badRequest } from "../lib/errors";

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const k = issue.path.join(".") || "_";
      fields[k] ??= issue.message;
    }
    throw badRequest("Please check the highlighted fields", fields);
  }
  return r.data;
}
