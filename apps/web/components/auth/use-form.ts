"use client";

import { useState } from "react";
import type { z } from "zod";
import { ApiError } from "@/lib/api";

/** Tiny form helper: zod validation on submit, server field errors mapped back to inputs. */
export function useForm<S extends z.ZodType>(schema: S) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(data: unknown, action: (values: z.infer<S>) => Promise<void>) {
    setFormError(null);
    const r = schema.safeParse(data);
    if (!r.success) {
      const next: Record<string, string> = {};
      for (const i of r.error.issues) next[i.path.join(".")] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await action(r.data);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.fields) setErrors(e.fields);
        setFormError(e.fields && Object.keys(e.fields).length ? null : e.message);
      } else setFormError("Can't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return { errors, formError, pending, submit, setFormError };
}
