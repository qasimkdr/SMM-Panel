import "./env";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { DEFAULT_CURRENCIES, DEFAULT_GLOBAL_MARKUP } from "@smm/shared";
import { createDb } from "./client";
import { currencies, settings, users, vipTiers, pages } from "./schema";

const { db, pool } = createDb(undefined, 2);

/** Default admin-controlled settings. Every value here is editable in the admin dashboard. */
const DEFAULT_SETTINGS: Record<string, unknown> = {
  "site.name": process.env.APP_NAME ?? "Panel",
  "site.tagline": "Social growth services, delivered on time.",
  "site.brandColor": "#e5582b",
  "site.defaultTheme": "system",
  "site.maintenance": false,
  "pricing.globalMarkup": DEFAULT_GLOBAL_MARKUP,
  "pricing.roundingDecimals": 4,
  "currency.default": "USD",
  "auth.registrationOpen": true,
  "auth.requireEmailVerification": true,
  "auth.googleEnabled": false,
  "orders.blockDuplicateActive": true,
  "orders.massOrderEnabled": true,
  "orders.dripfeedEnabled": true,
  "features.affiliates": true,
  "features.childPanels": true,
  "features.api": true,
  "features.addFunds": false,
  "affiliate.commissionPercent": "5",
  "affiliate.minPayout": "10",
  "affiliate.cookieDays": 30,
  "childPanel.monthlyPrice": "25",
  "seo.defaultTitle": "Panel — Social media growth services",
  "seo.defaultDescription": "Fast, reliable social media services with live order tracking, refill guarantees and an API for resellers.",
  "seo.headCode": "",
};

for (const [i, c] of DEFAULT_CURRENCIES.entries()) {
  await db
    .insert(currencies)
    .values({ code: c.code, name: c.name, symbol: c.symbol, decimals: c.decimals, rate: "1", sort: i })
    .onDuplicateKeyUpdate({ set: { name: c.name } });
}

for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  await db.insert(settings).values({ key, value }).onDuplicateKeyUpdate({ set: { key } }); // never overwrite admin edits
}

const tiers = [
  { name: "Starter", minSpent: "0", discount: "0", color: "#8a857c", sort: 0 },
  { name: "Silver", minSpent: "100", discount: "2", color: "#9aa3ad", sort: 1 },
  { name: "Gold", minSpent: "500", discount: "4", color: "#c9a227", sort: 2 },
  { name: "Platinum", minSpent: "2000", discount: "6", color: "#6f8f9c", sort: 3 },
];
const existingTiers = await db.select({ id: vipTiers.id }).from(vipTiers).limit(1);
if (existingTiers.length === 0) await db.insert(vipTiers).values(tiers);

for (const p of [
  { slug: "terms", title: "Terms of Service", content: "Edit this page in the admin dashboard." },
  { slug: "privacy", title: "Privacy Policy", content: "Edit this page in the admin dashboard." },
  { slug: "refund", title: "Refund Policy", content: "Edit this page in the admin dashboard." },
]) {
  await db.insert(pages).values(p).onDuplicateKeyUpdate({ set: { slug: p.slug } });
}

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (email && password) {
  const found = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (found.length === 0) {
    await db.insert(users).values({
      username: "admin",
      email: email.toLowerCase(),
      passwordHash: await hash(password),
      role: "admin",
      referralCode: randomBytes(5).toString("hex"),
      apiKey: randomBytes(24).toString("hex"),
      emailVerifiedAt: new Date(),
    });
    console.log(`Admin created: ${email}`);
  }
}

console.log("Seed complete");
await pool.end();
