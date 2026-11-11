import type { Request } from "express";
import { schema } from "@smm/db";
import { db } from "../lib/db";

export async function audit(req: Request, action: string, targetType?: string, targetId?: string | number, meta?: unknown) {
  await db.insert(schema.adminLogs).values({
    actorId: req.auth!.userId,
    action,
    targetType: targetType ?? null,
    targetId: targetId === undefined ? null : String(targetId),
    meta: meta ?? null,
    ip: req.ip ?? null,
  });
}
