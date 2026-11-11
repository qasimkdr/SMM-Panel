import { config } from "dotenv";
config({ path: "../../.env" });
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "mysql://smm:smm@127.0.0.1:3306/smm" },
});
