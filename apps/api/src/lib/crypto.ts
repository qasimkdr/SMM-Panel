import { createHash, randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "@smm/db";
import { env } from "../env";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const encrypt = (plain: string) => encryptSecret(plain, env.ENCRYPTION_KEY);
export const decrypt = (payload: string) => decryptSecret(payload, env.ENCRYPTION_KEY);
