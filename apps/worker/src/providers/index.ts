import { customDriverConfigSchema } from "@smm/shared";
import { decryptSecret, type schema } from "@smm/db";
import { CustomDriver } from "./custom";
import { V2Driver } from "./v2";
import type { ProviderDriver } from "./types";

export * from "./types";

type ProviderRow = typeof schema.providers.$inferSelect;

export function driverFor(p: ProviderRow): ProviderDriver {
  const key = decryptSecret(p.apiKeyEnc, process.env.ENCRYPTION_KEY ?? "");
  if (p.driver === "custom") return new CustomDriver(p.apiUrl, key, customDriverConfigSchema.parse(p.driverConfig ?? {}));
  return new V2Driver(p.apiUrl, key);
}
