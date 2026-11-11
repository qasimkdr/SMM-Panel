import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env"), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  APP_NAME: z.string().default("Panel"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  PUBLIC_DOMAIN: z.string().default("localhost:3000"),
  ADMIN_DOMAIN: z.string().default("admin.localhost:3000"),
  DATABASE_URL: z.string().min(1),
  DB_POOL_SIZE: z.coerce.number().default(20),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  ENCRYPTION_KEY: z.string().min(32),
  RESEND_API_KEY: z.string().optional().default(""),
  MAIL_FROM: z.string().default("Panel <no-reply@example.com>"),
  REVALIDATE_SECRET: z.string().optional().default(""),
  WEB_INTERNAL_URL: z.string().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  TRUST_PROXY: z.string().default("loopback, linklocal, uniquelocal"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", z.prettifyError(parsed.error));
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
