import { z } from "zod";
import { DEFAULT_CURRENCIES } from "./currencies";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(191);
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use 128 characters or fewer");
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters")
  .max(32, "Use 32 characters or fewer")
  .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers and underscores only");

const currencyCodes = DEFAULT_CURRENCIES.map((c) => c.code) as [string, ...string[]];

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  currency: z.enum(currencyCodes).default("USD"),
  referralCode: z.string().trim().max(32).optional(),
  acceptTerms: z.literal(true, { error: "You need to accept the terms" }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  login: z.string().trim().min(1, "Enter your email or username").max(191),
  password: z.string().min(1, "Enter your password").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });

export const updateProfileSchema = z.object({
  name: z.string().trim().max(80).optional(),
  currency: z.enum(currencyCodes).optional(),
  timezone: z.string().max(64).optional(),
});

export const markupSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (v === "" ? null : String(v).trim().replace(/%$/, "")))
  .refine((v) => v === null || (/^-?\d{1,4}(\.\d{1,2})?$/.test(v) && Number(v) > -100), {
    message: "Enter a percentage like 20 or 12.5",
  })
  .nullable();
