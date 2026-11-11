import { connection, logger } from "./lib";

/** Same cache key the API uses; dropping it forces a rebuild on next request. */
export async function invalidateCatalog() {
  await connection.del("catalog:v1");
  const secret = process.env.REVALIDATE_SECRET;
  const web = process.env.WEB_INTERNAL_URL ?? "http://localhost:3000";
  if (!secret) return;
  await fetch(`${web}/revalidate`, {
    method: "POST",
    headers: { "x-revalidate-secret": secret, "Content-Type": "application/json" },
    body: JSON.stringify({ paths: ["/services", "/"] }),
    signal: AbortSignal.timeout(5000),
  }).catch((err) => logger.debug({ err: String(err) }, "revalidate failed"));
}
