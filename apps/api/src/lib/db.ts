import { createDb } from "@smm/db";
import { env } from "../env";

export const { db, pool } = createDb(env.DATABASE_URL, env.DB_POOL_SIZE);
